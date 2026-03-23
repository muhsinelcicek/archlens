import fs from "node:fs";
import path from "node:path";
import type { Symbol, Relation } from "../models/index.js";
import type { ImportInfo } from "../parsers/index.js";

/**
 * ModuleResolver — properly resolves import statements to actual files and symbols.
 * Replaces the naive name-matching approach with real path resolution.
 */
export class ModuleResolver {
  private fileIndex: Map<string, string[]>; // relativePath → exported symbol UIDs
  private symbolsByFile: Map<string, Map<string, string>>; // relativePath → (name → uid)
  private tsconfigPaths: Map<string, string[]>; // alias pattern → resolved paths
  private baseUrl: string;

  constructor(
    private rootDir: string,
    private files: string[],
    private symbols: Map<string, Symbol>,
  ) {
    this.fileIndex = new Map();
    this.symbolsByFile = new Map();
    this.tsconfigPaths = new Map();
    this.baseUrl = ".";

    this.buildFileIndex();
    this.loadTsConfig();
  }

  /**
   * Resolve all imports to proper relations
   */
  resolve(imports: ImportInfo[]): Relation[] {
    const relations: Relation[] = [];
    const seen = new Set<string>();

    for (const imp of imports) {
      const resolved = this.resolveImport(imp);
      for (const rel of resolved) {
        const key = `${rel.source}→${rel.target}`;
        if (!seen.has(key)) {
          seen.add(key);
          relations.push(rel);
        }
      }
    }

    return relations;
  }

  private resolveImport(imp: ImportInfo): Relation[] {
    const { sourceFile, modulePath, names } = imp;

    // Skip external packages (no relative path, not in project)
    if (this.isExternalPackage(modulePath, sourceFile)) {
      return [];
    }

    // Resolve the target file path
    const targetFile = this.resolveModulePath(modulePath, sourceFile);
    if (!targetFile) return [];

    // Match named imports to symbols in the target file
    const relations: Relation[] = [];
    const targetSymbols = this.symbolsByFile.get(targetFile);

    if (targetSymbols) {
      for (const name of names) {
        const uid = targetSymbols.get(name);
        if (uid) {
          relations.push({ source: sourceFile, target: uid, type: "imports" });
        }
      }

      // If no specific names matched but we have the file, create file-level relation
      if (relations.length === 0 && names.length > 0) {
        // Try fuzzy: maybe it's a default export or class with different casing
        for (const name of names) {
          for (const [symName, uid] of targetSymbols) {
            if (symName.toLowerCase() === name.toLowerCase()) {
              relations.push({ source: sourceFile, target: uid, type: "imports" });
              break;
            }
          }
        }
      }
    }

    // If still nothing matched, create a file-to-file relation
    if (relations.length === 0) {
      // Find any symbol in target file to link to
      for (const [uid, sym] of this.symbols) {
        if (sym.filePath === targetFile) {
          relations.push({ source: sourceFile, target: uid, type: "imports" });
          break;
        }
      }
    }

    return relations;
  }

  /**
   * Resolve a module path to a relative file path
   */
  private resolveModulePath(modulePath: string, fromFile: string): string | null {
    // Python relative imports
    if (this.isPythonFile(fromFile)) {
      return this.resolvePythonImport(modulePath, fromFile);
    }

    // TypeScript/JavaScript
    return this.resolveTypeScriptImport(modulePath, fromFile);
  }

  // ─── TypeScript Resolution ────────────────────────────────────────

  private resolveTypeScriptImport(modulePath: string, fromFile: string): string | null {
    // 1. Relative imports (./ or ../)
    if (modulePath.startsWith(".")) {
      return this.resolveRelativeTsImport(modulePath, fromFile);
    }

    // 2. tsconfig path aliases
    const aliasResolved = this.resolveTsConfigPath(modulePath);
    if (aliasResolved) return aliasResolved;

    // 3. Bare specifier — could be a local package in monorepo
    // Check if it matches a top-level directory
    const firstSegment = modulePath.split("/")[0];
    const possibleLocal = this.findFileWithExtensions(firstSegment);
    if (possibleLocal) return possibleLocal;

    return null;
  }

  private resolveRelativeTsImport(modulePath: string, fromFile: string): string | null {
    const fromDir = path.dirname(fromFile);
    const resolved = path.normalize(path.join(fromDir, modulePath));

    // Try direct file with extensions
    const withExt = this.findFileWithExtensions(resolved);
    if (withExt) return withExt;

    // Try as directory (index file)
    const indexFile = this.findFileWithExtensions(path.join(resolved, "index"));
    if (indexFile) return indexFile;

    return null;
  }

  private findFileWithExtensions(basePath: string): string | null {
    // Already has extension
    if (this.fileIndex.has(basePath)) return basePath;

    // Try extensions
    const extensions = [".ts", ".tsx", ".js", ".jsx", ".py"];
    for (const ext of extensions) {
      const candidate = basePath + ext;
      if (this.fileIndex.has(candidate)) return candidate;
    }

    // Try without leading ./
    const cleaned = basePath.replace(/^\.\//, "");
    if (this.fileIndex.has(cleaned)) return cleaned;
    for (const ext of extensions) {
      if (this.fileIndex.has(cleaned + ext)) return cleaned + ext;
    }

    return null;
  }

  private resolveTsConfigPath(modulePath: string): string | null {
    for (const [pattern, mappings] of this.tsconfigPaths) {
      const prefix = pattern.replace("/*", "");
      if (modulePath.startsWith(prefix)) {
        const rest = modulePath.slice(prefix.length).replace(/^\//, "");
        for (const mapping of mappings) {
          const mappedBase = mapping.replace("/*", "");
          const fullPath = path.join(mappedBase, rest);
          const resolved = this.findFileWithExtensions(fullPath);
          if (resolved) return resolved;

          // Try index
          const indexResolved = this.findFileWithExtensions(path.join(fullPath, "index"));
          if (indexResolved) return indexResolved;
        }
      }
    }
    return null;
  }

  // ─── Python Resolution ────────────────────────────────────────────

  private resolvePythonImport(modulePath: string, fromFile: string): string | null {
    // Count leading dots for relative imports
    const dotMatch = modulePath.match(/^(\.+)/);

    if (dotMatch) {
      // Relative import
      const dots = dotMatch[1].length;
      const rest = modulePath.slice(dots);
      const fromDir = path.dirname(fromFile);

      // Go up (dots - 1) directories
      let baseDir = fromDir;
      for (let i = 1; i < dots; i++) {
        baseDir = path.dirname(baseDir);
      }

      if (rest) {
        const segments = rest.split(".");
        const moduleName = segments.join("/");
        return this.findPythonModule(path.join(baseDir, moduleName));
      }

      // Bare relative (from . import foo) → __init__.py in current package
      return this.findPythonModule(baseDir);
    }

    // Absolute import — resolve from project root
    const segments = modulePath.split(".");
    const moduleName = segments.join("/");
    return this.findPythonModule(moduleName);
  }

  private findPythonModule(basePath: string): string | null {
    // Try as .py file
    const pyFile = basePath + ".py";
    if (this.fileIndex.has(pyFile)) return pyFile;

    // Try as package (__init__.py)
    const initFile = path.join(basePath, "__init__.py");
    if (this.fileIndex.has(initFile)) return initFile;

    // Try without extension if already ends with .py
    if (this.fileIndex.has(basePath)) return basePath;

    return null;
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  private buildFileIndex(): void {
    for (const file of this.files) {
      const relPath = path.relative(this.rootDir, file);
      this.fileIndex.set(relPath, []);
      this.symbolsByFile.set(relPath, new Map());
    }

    // Index symbols by file
    for (const [uid, sym] of this.symbols) {
      const fileSymbols = this.symbolsByFile.get(sym.filePath);
      if (fileSymbols) {
        // Store by short name (without class prefix)
        const shortName = sym.name.includes(".") ? sym.name.split(".").pop()! : sym.name;
        fileSymbols.set(sym.name, uid);
        if (shortName !== sym.name) {
          fileSymbols.set(shortName, uid);
        }
      }
    }
  }

  private loadTsConfig(): void {
    const tsconfigPath = path.join(this.rootDir, "tsconfig.json");
    if (!fs.existsSync(tsconfigPath)) return;

    try {
      const raw = fs.readFileSync(tsconfigPath, "utf-8");
      // Strip comments (JSON with comments)
      const cleaned = raw.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      const config = JSON.parse(cleaned);

      const compilerOptions = config.compilerOptions || {};
      this.baseUrl = compilerOptions.baseUrl || ".";

      if (compilerOptions.paths) {
        for (const [pattern, mappings] of Object.entries(compilerOptions.paths)) {
          const resolvedMappings = (mappings as string[]).map((m) =>
            path.join(this.baseUrl, m),
          );
          this.tsconfigPaths.set(pattern, resolvedMappings);
        }
      }
    } catch {
      // Skip invalid tsconfig
    }
  }

  private isExternalPackage(modulePath: string, fromFile: string): boolean {
    // Python: check if first segment is a known project directory
    if (this.isPythonFile(fromFile)) {
      if (modulePath.startsWith(".")) return false; // relative
      const firstSegment = modulePath.split(".")[0];
      // Check if this is a local package
      for (const file of this.files) {
        const rel = path.relative(this.rootDir, file);
        if (rel.startsWith(firstSegment + "/") || rel.startsWith(firstSegment + ".")) {
          return false;
        }
      }
      return true; // stdlib or third-party
    }

    // TypeScript: relative imports are always local
    if (modulePath.startsWith(".")) return false;

    // Check tsconfig paths
    for (const pattern of this.tsconfigPaths.keys()) {
      const prefix = pattern.replace("/*", "");
      if (modulePath.startsWith(prefix)) return false;
    }

    // Check if matches a project directory
    const firstSegment = modulePath.split("/")[0];
    for (const file of this.files) {
      const rel = path.relative(this.rootDir, file);
      if (rel.startsWith(firstSegment + "/")) return false;
    }

    return true; // node_modules package
  }

  private isPythonFile(filePath: string): boolean {
    return filePath.endsWith(".py");
  }
}
