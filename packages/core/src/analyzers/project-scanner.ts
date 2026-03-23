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

export interface ScanOptions {
  rootDir: string;
  includeTests?: boolean;
  ignorePatterns?: string[];
}

/**
 * ProjectScanner — the main orchestrator.
 * Scans a project, parses all files, and builds the ArchitectureModel.
 */
export class ProjectScanner {
  async scan(options: ScanOptions): Promise<ArchitectureModel> {
    const { rootDir } = options;
    const projectName = path.basename(rootDir);

    // 1. Discover files
    const files = await this.discoverFiles(options);

    // 2. Parse all files
    const allResults = await this.parseFiles(files, options);

    // 3. Build unified model
    const symbols = new Map<string, Symbol>();
    const relations: Relation[] = [];
    const apiEndpoints: ApiEndpoint[] = [];
    const dbEntities: DbEntity[] = [];
    const allImports: ImportInfo[] = [];
    const languageCounts: Record<string, number> = {};

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

    // 4. Resolve import relations
    const importRelations = this.resolveImports(allImports, symbols);
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

  private resolveImports(imports: ImportInfo[], symbols: Map<string, Symbol>): Relation[] {
    const relations: Relation[] = [];

    for (const imp of imports) {
      for (const name of imp.names) {
        // Try to find matching symbol
        for (const [uid, sym] of symbols) {
          if (sym.name === name || sym.name.endsWith(`.${name}`)) {
            relations.push({
              source: imp.sourceFile,
              target: uid,
              type: "imports",
            });
            break;
          }
        }
      }
    }

    return relations;
  }

  private detectModules(files: string[], symbols: Map<string, Symbol>, rootDir: string): Module[] {
    // Group files by top-level directory
    const moduleMap = new Map<string, { files: string[]; symbols: string[] }>();

    for (const file of files) {
      const rel = path.relative(rootDir, file);
      const parts = rel.split(path.sep);
      const moduleName = parts.length > 1 ? parts[0] : "root";

      if (!moduleMap.has(moduleName)) {
        moduleMap.set(moduleName, { files: [], symbols: [] });
      }
      moduleMap.get(moduleName)!.files.push(file);
    }

    // Assign symbols to modules
    for (const [uid, sym] of symbols) {
      const parts = sym.filePath.split(path.sep);
      const moduleName = parts.length > 1 ? parts[0] : "root";
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

    if (/^(frontend|web|ui|client|app|pages|components|views)/.test(name)) return "presentation";
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

    // Dockerfile
    const dockerfilePath = path.join(rootDir, "Dockerfile");
    if (fs.existsSync(dockerfilePath)) {
      entries.push({ name: "Docker", category: "tool", ring: "adopt", source: "Dockerfile" });
    }

    // docker-compose
    const composePaths = ["docker-compose.yml", "docker-compose.yaml", "compose.yml"];
    for (const cp of composePaths) {
      if (fs.existsSync(path.join(rootDir, cp))) {
        entries.push({ name: "Docker Compose", category: "tool", ring: "adopt", source: cp });
        break;
      }
    }

    return entries;
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
