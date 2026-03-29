import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import ignore from "ignore";
import { getParserForFile, getSupportedExtensions } from "../parsers/index.js";
import type { ParseResult, ImportInfo, ParserOptions } from "../parsers/index.js";
import type {
  ArchitectureModel,
  Symbol,
  Relation,
  Module,
  LayerType,
  Language,
  TechEntry,
  ApiEndpoint,
  DbEntity,
  DataFlow,
  BusinessProcessInfo,
} from "../models/index.js";
import { ProcessDetector } from "./process-detector.js";
import { ModuleResolver } from "./module-resolver.js";
import { IncrementalCache } from "./incremental-cache.js";

export interface ScanOptions {
  rootDir: string;
  includeTests?: boolean;
  ignorePatterns?: string[];
  /** Use incremental analysis if cache available (default: true) */
  incremental?: boolean;
  /** Force full re-scan even if cache exists */
  force?: boolean;
}

/**
 * ProjectScanner — the main orchestrator.
 * Scans a project, parses all files, and builds the ArchitectureModel.
 */
export class ProjectScanner {
  /** Incremental scan metadata — set after scan completes */
  public lastScanStats?: { total: number; parsed: number; cached: number; deleted: number };

  async scan(options: ScanOptions): Promise<ArchitectureModel> {
    const { rootDir } = options;
    const projectName = path.basename(rootDir);
    const outputDir = path.join(rootDir, ".archlens");
    const useIncremental = (options.incremental !== false) && !options.force;

    // 1. Discover files
    const files = await this.discoverFiles(options);

    // 1.5 Incremental check
    const cache = new IncrementalCache(rootDir, outputDir);
    let filesToParse: string[];
    let previousModel: ArchitectureModel | null = null;

    if (useIncremental && cache.isAvailable) {
      const diff = cache.diff(files);

      if (diff.unchanged.length > 0 && !diff.configChanged) {
        // Load previous model
        const modelPath = path.join(outputDir, "model.json");
        if (fs.existsSync(modelPath)) {
          try {
            const raw = JSON.parse(fs.readFileSync(modelPath, "utf-8"));
            raw.symbols = new Map(Object.entries(raw.symbols || {}));
            previousModel = raw as ArchitectureModel;
          } catch { /* full scan fallback */ }
        }
      }

      filesToParse = [...diff.modified, ...diff.added];
      this.lastScanStats = {
        total: files.length,
        parsed: filesToParse.length,
        cached: diff.unchanged.length,
        deleted: diff.deleted.length,
      };

      // Remove deleted file symbols from previous model
      if (previousModel && diff.deleted.length > 0) {
        for (const delPath of diff.deleted) {
          for (const [uid, sym] of previousModel.symbols) {
            if (sym.filePath === delPath) {
              previousModel.symbols.delete(uid);
            }
          }
          previousModel.relations = previousModel.relations.filter(
            (r) => r.source !== delPath,
          );
        }
      }
    } else {
      filesToParse = files;
      this.lastScanStats = { total: files.length, parsed: files.length, cached: 0, deleted: 0 };
    }

    // 2. Parse files (only changed ones in incremental mode)
    const allResults = await this.parseFiles(filesToParse, options);

    // 3. Build unified model (merge with cached data if incremental)
    const symbols = new Map<string, Symbol>();
    const relations: Relation[] = [];
    const apiEndpoints: ApiEndpoint[] = [];
    const dbEntities: DbEntity[] = [];
    const allImports: ImportInfo[] = [];
    const languageCounts: Record<string, number> = {};

    // Merge cached symbols from unchanged files
    if (previousModel) {
      const parsedFiles = new Set(filesToParse.map((f) => path.relative(rootDir, f)));
      for (const [uid, sym] of previousModel.symbols) {
        if (!parsedFiles.has(sym.filePath)) {
          symbols.set(uid, sym);
          languageCounts[sym.language] = (languageCounts[sym.language] || 0) + 1;
        }
      }
      // Merge cached relations from unchanged files
      for (const rel of previousModel.relations) {
        if (!parsedFiles.has(rel.source)) {
          relations.push(rel);
        }
      }
      // Merge cached endpoints/entities from unchanged files
      for (const ep of previousModel.apiEndpoints) {
        if (!parsedFiles.has(ep.filePath)) {
          apiEndpoints.push(ep);
        }
      }
      for (const ent of previousModel.dbEntities) {
        if (!parsedFiles.has(ent.filePath)) {
          dbEntities.push(ent);
        }
      }
    }

    // Add newly parsed results
    for (const result of allResults) {
      for (const sym of result.symbols) {
        symbols.set(sym.uid, sym);
        languageCounts[sym.language] = (languageCounts[sym.language] || 0) + 1;
      }
      relations.push(...result.relations);
      apiEndpoints.push(...result.apiEndpoints);
      dbEntities.push(...result.dbEntities);
      allImports.push(...result.imports);
    }

    // 3.5 Deduplicate DB entities — keep the one with most columns
    const entityMap = new Map<string, typeof dbEntities[0]>();
    for (const ent of dbEntities) {
      const existing = entityMap.get(ent.name);
      if (!existing || ent.columns.length > existing.columns.length) {
        entityMap.set(ent.name, ent);
      }
    }
    dbEntities.length = 0;
    dbEntities.push(...entityMap.values());

    // 3.6 Enrich empty entities by finding matching class symbols
    for (const ent of dbEntities) {
      if (ent.columns.length > 0) continue;
      // Find a class with the same name
      for (const [uid, sym] of symbols) {
        if (sym.kind !== "class" || sym.name !== ent.name) continue;
        // Get properties of this class
        const props: Array<{ name: string; type: string; primary: boolean }> = [];
        for (const rel of relations) {
          if (rel.source !== uid || rel.type !== "composes") continue;
          const propSym = symbols.get(rel.target);
          if (!propSym || propSym.kind !== "property") continue;
          const propName = propSym.name.split(".").pop() || "";
          if (propName.startsWith("_")) continue;
          props.push({
            name: propName,
            type: propSym.returnType || "unknown",
            primary: propName === "Id" || propName === `${ent.name}Id`,
          });
        }
        if (props.length > 0) {
          ent.columns = props.map((p) => ({ name: p.name, type: p.type, primary: p.primary, nullable: true }));
          ent.filePath = sym.filePath;
          break;
        }
      }
    }

    // 4. Resolve import relations (using proper module resolver)
    const resolver = new ModuleResolver(rootDir, files, symbols);
    const importRelations = resolver.resolve(allImports);
    relations.push(...importRelations);

    // 5. Detect modules and layers
    const modules = this.detectModules(files, symbols, rootDir);

    // 6. Assign layers
    const layers = this.assignLayers(modules);

    // 7. Detect tech stack
    const techRadar = await this.detectTechStack(rootDir);

    // 8. Detect data flows
    const dataFlows = this.detectDataFlows(modules, relations, apiEndpoints);

    // 9. Detect business processes
    // (need the partial model first)
    const partialModel = {
      project: { name: projectName, rootPath: rootDir, analyzedAt: new Date().toISOString(), version: "0.1.0" },
      stats: { files: files.length, symbols: symbols.size, relations: relations.length, modules: modules.length, languages: languageCounts as Record<Language, number>, totalLines: 0 },
      symbols, relations, modules, layers, dataFlows, apiEndpoints, dbEntities, techRadar, businessProcesses: [],
    } as ArchitectureModel;
    const processDetector = new ProcessDetector();
    const businessProcesses = processDetector.detect(partialModel) as BusinessProcessInfo[];

    // 10. Count lines
    let totalLines = 0;
    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      totalLines += content.split("\n").length;
    }

    // 11. Save file hashes for incremental analysis
    cache.save(files);

    return {
      project: {
        name: projectName,
        rootPath: rootDir,
        analyzedAt: new Date().toISOString(),
        version: "0.1.0",
      },
      stats: {
        files: files.length,
        symbols: symbols.size,
        relations: relations.length,
        modules: modules.length,
        languages: languageCounts as Record<Language, number>,
        totalLines,
      },
      symbols,
      relations,
      modules,
      layers,
      dataFlows,
      apiEndpoints,
      dbEntities,
      techRadar,
      businessProcesses,
    };
  }

  private async discoverFiles(options: ScanOptions): Promise<string[]> {
    const { rootDir, includeTests = false, ignorePatterns = [] } = options;

    const extensions = getSupportedExtensions();
    const globPatterns = extensions.map((ext) => `**/*${ext}`);

    // Load .gitignore
    const ig = ignore();
    const gitignorePath = path.join(rootDir, ".gitignore");
    if (fs.existsSync(gitignorePath)) {
      ig.add(fs.readFileSync(gitignorePath, "utf-8"));
    }

    // Default ignores
    ig.add(["node_modules", "dist", "build", ".git", "vendor", "__pycache__", ".venv", "venv"]);
    ig.add(ignorePatterns);

    if (!includeTests) {
      ig.add(["**/*.test.*", "**/*.spec.*", "**/test/**", "**/tests/**", "**/__tests__/**"]);
    }

    const files = await fg(globPatterns, {
      cwd: rootDir,
      absolute: true,
      ignore: ["**/node_modules/**", "**/dist/**", "**/.git/**", "**/venv/**"],
    });

    return files.filter((f) => {
      const rel = path.relative(rootDir, f);
      return !ig.ignores(rel);
    });
  }

  private async parseFiles(files: string[], options: ScanOptions): Promise<ParseResult[]> {
    const results: ParseResult[] = [];
    const parserOptions: ParserOptions = { rootDir: options.rootDir };

    for (const file of files) {
      const parser = getParserForFile(file);
      if (!parser) continue;

      try {
        const content = fs.readFileSync(file, "utf-8");
        const relativePath = path.relative(options.rootDir, file);
        const result = parser.parse(relativePath, content, parserOptions);
        results.push(result);
      } catch {
        // Skip files that fail to parse
      }
    }

    return results;
  }

  private detectModules(files: string[], symbols: Map<string, Symbol>, rootDir: string): Module[] {
    // Smart module detection — handles monorepos and microservice layouts
    const moduleMap = new Map<string, { files: string[]; symbols: string[] }>();

    // First pass: detect if we have a "container" directory (src/, packages/, apps/, services/)
    const containerDirs = new Set(["src", "packages", "apps", "services", "libs", "modules", "projects"]);
    const topLevelDirs = new Map<string, number>(); // dir → file count

    for (const file of files) {
      const rel = path.relative(rootDir, file);
      const parts = rel.split(path.sep);
      if (parts.length > 1) {
        topLevelDirs.set(parts[0], (topLevelDirs.get(parts[0]) || 0) + 1);
      }
    }

    // Check if a single top-level dir contains most files (monorepo pattern)
    const totalFiles = files.length;
    const dominantDir = [...topLevelDirs.entries()].find(([dir, count]) =>
      containerDirs.has(dir.toLowerCase()) && count > totalFiles * 0.6,
    );

    // If a container dir dominates, use 2nd-level dirs as modules
    const useSecondLevel = !!dominantDir;
    const containerName = dominantDir?.[0];

    for (const file of files) {
      const rel = path.relative(rootDir, file);
      const parts = rel.split(path.sep);

      let moduleName: string;
      if (useSecondLevel && parts[0] === containerName && parts.length > 2) {
        // src/Basket.API/foo.cs → "Basket.API"
        moduleName = parts[1];
      } else if (parts.length > 1) {
        moduleName = parts[0];
      } else {
        moduleName = "root";
      }

      if (!moduleMap.has(moduleName)) {
        moduleMap.set(moduleName, { files: [], symbols: [] });
      }
      moduleMap.get(moduleName)!.files.push(file);
    }

    // Assign symbols to modules (same logic as file grouping)
    for (const [uid, sym] of symbols) {
      const parts = sym.filePath.split(path.sep);
      let moduleName: string;
      if (useSecondLevel && parts[0] === containerName && parts.length > 2) {
        moduleName = parts[1];
      } else if (parts.length > 1) {
        moduleName = parts[0];
      } else {
        moduleName = "root";
      }
      moduleMap.get(moduleName)?.symbols.push(uid);
    }

    const modules: Module[] = [];
    for (const [name, data] of moduleMap) {
      const layer = this.inferLayer(name, data.files);
      const language = this.inferLanguage(data.files);

      let lineCount = 0;
      for (const f of data.files) {
        try {
          lineCount += fs.readFileSync(f, "utf-8").split("\n").length;
        } catch { /* skip */ }
      }

      modules.push({
        name,
        path: name,
        layer,
        symbols: data.symbols,
        dependencies: [], // Resolved later
        language,
        fileCount: data.files.length,
        lineCount,
      });
    }

    return modules;
  }

  private inferLayer(moduleName: string, files: string[]): LayerType {
    const name = moduleName.toLowerCase();
    const allPaths = files.map((f) => f.toLowerCase()).join(" ");

    // .NET patterns: Basket.API, Ordering.Domain, etc.
    if (/\.api$/.test(name) || /\.web$/.test(name)) return "api";
    if (/\.domain$/.test(name) || /\.core$/.test(name)) return "domain";
    if (/\.infrastructure$/.test(name) || /\.data$/.test(name)) return "infrastructure";
    if (/\.ui$/.test(name) || /\.blazor$/.test(name) || /\.client$/.test(name)) return "presentation";
    if (/\.servicedefaults$/.test(name) || /\.apphost$/.test(name)) return "config";
    if (/processor$/i.test(name)) return "application";

    if (/^(frontend|web|ui|client|app|pages|components|views|webapp|clientapp)/.test(name)) return "presentation";
    if (/^(api|routes|controllers|endpoints|handlers)/.test(name)) return "api";
    if (/^(services?|usecases?|application)/.test(name)) return "application";
    if (/^(models?|domain|entities|core)/.test(name)) return "domain";
    if (/^(db|database|repositories|infrastructure|adapters)/.test(name)) return "infrastructure";
    if (/^(config|settings|env)/.test(name)) return "config";
    if (/^(tests?|spec|__tests__)/.test(name)) return "test";
    if (/^backend/.test(name)) {
      if (allPaths.includes("route") || allPaths.includes("controller")) return "api";
      return "application";
    }

    return "unknown";
  }

  private inferLanguage(files: string[]): Language {
    const counts: Record<string, number> = {};
    for (const f of files) {
      const ext = path.extname(f);
      if ([".ts", ".tsx"].includes(ext)) counts["typescript"] = (counts["typescript"] || 0) + 1;
      else if ([".js", ".jsx"].includes(ext)) counts["javascript"] = (counts["javascript"] || 0) + 1;
      else if (ext === ".py") counts["python"] = (counts["python"] || 0) + 1;
      else if (ext === ".java") counts["java"] = (counts["java"] || 0) + 1;
      else if (ext === ".go") counts["go"] = (counts["go"] || 0) + 1;
      else if (ext === ".rs") counts["rust"] = (counts["rust"] || 0) + 1;
    }

    let maxLang: Language = "unknown";
    let maxCount = 0;
    for (const [lang, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxLang = lang as Language;
        maxCount = count;
      }
    }
    return maxLang;
  }

  private assignLayers(modules: Module[]): Record<LayerType, string[]> {
    const layers: Record<LayerType, string[]> = {
      presentation: [],
      api: [],
      application: [],
      domain: [],
      infrastructure: [],
      config: [],
      test: [],
      unknown: [],
    };

    for (const mod of modules) {
      layers[mod.layer].push(mod.name);
    }

    return layers;
  }

  private async detectTechStack(rootDir: string): Promise<TechEntry[]> {
    const entries: TechEntry[] = [];

    // package.json (Node.js)
    const pkgPath = path.join(rootDir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

        for (const [name, version] of Object.entries(allDeps)) {
          const category = this.categorizeDep(name);
          entries.push({
            name,
            version: String(version).replace(/^[\^~]/, ""),
            category,
            ring: "adopt",
            source: "package.json",
          });
        }
      } catch { /* skip */ }
    }

    // pyproject.toml
    const pyprojectPath = path.join(rootDir, "pyproject.toml");
    if (fs.existsSync(pyprojectPath)) {
      try {
        const content = fs.readFileSync(pyprojectPath, "utf-8");
        const depMatches = content.matchAll(/"([^"]+)>=?([^"]+)"/g);
        for (const match of depMatches) {
          entries.push({
            name: match[1],
            version: match[2],
            category: "library",
            ring: "adopt",
            source: "pyproject.toml",
          });
        }
      } catch { /* skip */ }
    }

    // go.mod (Go)
    const goModPath = path.join(rootDir, "go.mod");
    if (fs.existsSync(goModPath)) {
      entries.push({ name: "Go", category: "language", ring: "adopt", source: "go.mod" });
      try {
        const content = fs.readFileSync(goModPath, "utf-8");
        const requires = content.matchAll(/\t(\S+)\s+v([\d.]+)/g);
        for (const match of requires) {
          entries.push({ name: match[1].split("/").pop() || match[1], version: match[2], category: "library", ring: "adopt", source: "go.mod" });
        }
      } catch { /* skip */ }
    }

    // pom.xml (Java/Maven)
    const pomPath = path.join(rootDir, "pom.xml");
    if (fs.existsSync(pomPath)) {
      entries.push({ name: "Java (Maven)", category: "language", ring: "adopt", source: "pom.xml" });
    }

    // build.gradle (Java/Gradle)
    const gradlePaths = ["build.gradle", "build.gradle.kts"];
    for (const gp of gradlePaths) {
      if (fs.existsSync(path.join(rootDir, gp))) {
        entries.push({ name: "Java (Gradle)", category: "language", ring: "adopt", source: gp });
        break;
      }
    }

    // docker-compose
    const composePaths = ["docker-compose.yml", "docker-compose.yaml", "compose.yml"];
    for (const cp of composePaths) {
      if (fs.existsSync(path.join(rootDir, cp))) {
        entries.push({ name: "Docker Compose", category: "tool", ring: "adopt", source: cp });
        break;
      }
    }

    // *.csproj (NuGet packages for .NET)
    try {
      const csprojFiles = fg.sync("**/*.csproj", { cwd: rootDir, absolute: true, ignore: ["**/node_modules/**", "**/bin/**", "**/obj/**"] });
      const nugetPackages = new Map<string, string>();
      for (const csproj of csprojFiles.slice(0, 20)) {
        try {
          const content = fs.readFileSync(csproj, "utf-8");
          const pkgRefs = content.matchAll(/<PackageReference\s+Include="([^"]+)"(?:\s+Version="([^"]+)")?/gi);
          for (const match of pkgRefs) {
            if (!nugetPackages.has(match[1])) nugetPackages.set(match[1], match[2] || "");
          }
        } catch { /* skip */ }
      }
      if (nugetPackages.size > 0 && !entries.some((e) => e.source === ".csproj")) {
        entries.push({ name: ".NET", category: "framework", ring: "adopt", source: ".csproj" });
      }
      for (const [name, version] of nugetPackages) {
        const category = this.categorizeNuget(name);
        entries.push({ name, version: version || undefined, category, ring: "adopt", source: ".csproj" });
      }
    } catch { /* skip */ }

    // Dockerfile
    const dockerfilePath = path.join(rootDir, "Dockerfile");
    if (fs.existsSync(dockerfilePath)) {
      entries.push({ name: "Docker", category: "tool", ring: "adopt", source: "Dockerfile" });
    }

    return entries;
  }

  private categorizeNuget(name: string): TechEntry["category"] {
    const n = name.toLowerCase();
    if (n.includes("entityframework") || n.includes("npgsql") || n.includes("sqlclient") || n.includes("redis")) return "database";
    if (n.includes("aspnetcore") || n.includes("blazor") || n.includes("grpc") || n.includes("signalr")) return "framework";
    if (n.includes("serilog") || n.includes("nlog") || n.includes("xunit") || n.includes("nunit") || n.includes("moq") || n.includes("coverlet")) return "tool";
    if (n.includes("identity") || n.includes("authentication") || n.includes("authorization")) return "framework";
    if (n.includes("rabbitmq") || n.includes("masstransit") || n.includes("mediatr")) return "library";
    return "library";
  }

  private categorizeDep(name: string): TechEntry["category"] {
    const frameworks = ["react", "vue", "angular", "next", "nuxt", "svelte", "express", "fastify", "nestjs", "django", "flask", "fastapi"];
    const databases = ["prisma", "typeorm", "sequelize", "mongoose", "knex", "drizzle", "sqlalchemy"];
    const tools = ["typescript", "webpack", "vite", "eslint", "prettier", "jest", "vitest"];

    if (frameworks.some((f) => name.includes(f))) return "framework";
    if (databases.some((d) => name.includes(d))) return "database";
    if (tools.some((t) => name.includes(t))) return "tool";
    return "library";
  }

  private detectDataFlows(
    modules: Module[],
    relations: Relation[],
    apiEndpoints: ApiEndpoint[],
  ): DataFlow[] {
    const flows: DataFlow[] = [];

    // Detect API → Handler → DB flow
    if (apiEndpoints.length > 0) {
      const apiFlow: DataFlow = {
        id: "api-flow",
        name: "API Request Flow",
        description: "HTTP request → handler → response",
        steps: apiEndpoints.slice(0, 10).map((ep, i) => ({
          order: i + 1,
          source: "client",
          target: ep.handler,
          action: `${ep.method} ${ep.path}`,
          dataType: ep.responseType,
        })),
      };
      flows.push(apiFlow);
    }

    // Detect presentation → API → domain flow
    const presentationModules = modules.filter((m) => m.layer === "presentation");
    const apiModules = modules.filter((m) => m.layer === "api" || m.layer === "application");
    const domainModules = modules.filter((m) => m.layer === "domain" || m.layer === "infrastructure");

    if (presentationModules.length > 0 && (apiModules.length > 0 || domainModules.length > 0)) {
      const layerFlow: DataFlow = {
        id: "layer-flow",
        name: "Layer Data Flow",
        description: "Data flow through architectural layers",
        steps: [
          { order: 1, source: "User", target: presentationModules[0].name, action: "User interaction", dataType: "UI Event" },
          ...(apiModules.length > 0
            ? [{ order: 2, source: presentationModules[0].name, target: apiModules[0].name, action: "API call", dataType: "HTTP" }]
            : []),
          ...(domainModules.length > 0
            ? [{ order: 3, source: apiModules[0]?.name || presentationModules[0].name, target: domainModules[0].name, action: "Business logic", dataType: "Domain" }]
            : []),
        ],
      };
      flows.push(layerFlow);
    }

    return flows;
  }
}
