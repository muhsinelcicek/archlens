import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { ArchitectureModel, Symbol, Relation } from "../models/index.js";
import { getParserForFile } from "../parsers/index.js";

export interface ChangedFile {
  status: "added" | "modified" | "deleted" | "renamed";
  path: string;
  oldPath?: string;
}

export interface SymbolChange {
  type: "added" | "removed" | "modified";
  name: string;
  kind: string;
  filePath: string;
  uid: string;
}

export interface DependencyChange {
  type: "added" | "removed";
  source: string;
  target: string;
  relationType: string;
}

export interface LayerViolation {
  sourceModule: string;
  sourceLayer: string;
  targetModule: string;
  targetLayer: string;
  file: string;
}

export interface DriftReport {
  timestamp: string;
  indexAge: number; // hours
  changedFiles: ChangedFile[];
  symbolChanges: SymbolChange[];
  dependencyChanges: DependencyChange[];
  layerViolations: LayerViolation[];
  moduleHealth: Array<{
    name: string;
    layer: string;
    files: number;
    lines: number;
    issues: string[];
    healthy: boolean;
  }>;
  summary: {
    filesChanged: number;
    symbolsAdded: number;
    symbolsRemoved: number;
    symbolsModified: number;
    newDependencies: number;
    removedDependencies: number;
    violations: number;
    score: number;
  };
}

export class GitDiffer {
  constructor(
    private rootDir: string,
    private model: ArchitectureModel,
  ) {}

  /**
   * Generate a full drift report
   */
  generateReport(scope: "staged" | "unstaged" | "all" = "all"): DriftReport {
    const changedFiles = this.getChangedFiles(scope);
    const symbolChanges = this.getSymbolChanges(changedFiles);
    const dependencyChanges = this.getDependencyChanges(changedFiles);
    const layerViolations = this.checkLayerViolations();
    const moduleHealth = this.checkModuleHealth();

    const indexDate = new Date(this.model.project.analyzedAt);
    const indexAge = (Date.now() - indexDate.getTime()) / (1000 * 60 * 60);

    const added = symbolChanges.filter((s) => s.type === "added").length;
    const removed = symbolChanges.filter((s) => s.type === "removed").length;
    const modified = symbolChanges.filter((s) => s.type === "modified").length;
    const newDeps = dependencyChanges.filter((d) => d.type === "added").length;
    const removedDeps = dependencyChanges.filter((d) => d.type === "removed").length;

    const totalChecks = 3 + this.model.modules.length;
    const passed =
      (layerViolations.length === 0 ? 1 : 0) +
      (this.checkCircularDeps().length === 0 ? 1 : 0) +
      (indexAge < 24 ? 1 : 0) +
      moduleHealth.filter((m) => m.healthy).length;
    const score = Math.round((passed / totalChecks) * 100);

    return {
      timestamp: new Date().toISOString(),
      indexAge: Math.round(indexAge * 10) / 10,
      changedFiles,
      symbolChanges,
      dependencyChanges,
      layerViolations,
      moduleHealth,
      summary: {
        filesChanged: changedFiles.length,
        symbolsAdded: added,
        symbolsRemoved: removed,
        symbolsModified: modified,
        newDependencies: newDeps,
        removedDependencies: removedDeps,
        violations: layerViolations.length,
        score,
      },
    };
  }

  /**
   * Get list of changed files from git
   */
  getChangedFiles(scope: "staged" | "unstaged" | "all"): ChangedFile[] {
    try {
      let cmd: string;
      switch (scope) {
        case "staged":
          cmd = "git diff --cached --name-status";
          break;
        case "unstaged":
          cmd = "git diff --name-status";
          break;
        case "all":
        default:
          cmd = "git diff HEAD --name-status 2>/dev/null || git diff --name-status";
          break;
      }

      const output = execSync(cmd, { cwd: this.rootDir, encoding: "utf-8", timeout: 10000 }).trim();
      if (!output) return [];

      return output.split("\n").filter(Boolean).map((line) => {
        const parts = line.split("\t");
        const statusChar = parts[0][0];
        const statusMap: Record<string, ChangedFile["status"]> = {
          A: "added",
          M: "modified",
          D: "deleted",
          R: "renamed",
        };

        return {
          status: statusMap[statusChar] || "modified",
          path: parts[parts.length - 1],
          oldPath: statusChar === "R" ? parts[1] : undefined,
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Compare current file symbols against saved model
   */
  getSymbolChanges(changedFiles: ChangedFile[]): SymbolChange[] {
    const changes: SymbolChange[] = [];

    for (const file of changedFiles) {
      const relPath = file.path;

      // Get symbols from model for this file
      const modelSymbols = new Map<string, Symbol>();
      for (const [uid, sym] of this.model.symbols) {
        if (sym.filePath === relPath) {
          modelSymbols.set(uid, sym);
        }
      }

      if (file.status === "deleted") {
        for (const [uid, sym] of modelSymbols) {
          changes.push({ type: "removed", name: sym.name, kind: sym.kind, filePath: relPath, uid });
        }
        continue;
      }

      // Parse current file
      const absPath = path.join(this.rootDir, relPath);
      if (!fs.existsSync(absPath)) continue;

      const parser = getParserForFile(relPath);
      if (!parser) continue;

      try {
        const content = fs.readFileSync(absPath, "utf-8");
        const result = parser.parse(relPath, content, { rootDir: this.rootDir });
        const currentSymbols = new Map(result.symbols.map((s) => [s.uid, s]));

        if (file.status === "added") {
          for (const [uid, sym] of currentSymbols) {
            changes.push({ type: "added", name: sym.name, kind: sym.kind, filePath: relPath, uid });
          }
          continue;
        }

        // Modified file — compare symbols
        // Find added symbols
        for (const [uid, sym] of currentSymbols) {
          if (!modelSymbols.has(uid)) {
            changes.push({ type: "added", name: sym.name, kind: sym.kind, filePath: relPath, uid });
          } else {
            // Check if symbol moved (different line range)
            const oldSym = modelSymbols.get(uid)!;
            if (oldSym.startLine !== sym.startLine || oldSym.endLine !== sym.endLine) {
              changes.push({ type: "modified", name: sym.name, kind: sym.kind, filePath: relPath, uid });
            }
          }
        }

        // Find removed symbols
        for (const [uid, sym] of modelSymbols) {
          if (!currentSymbols.has(uid)) {
            changes.push({ type: "removed", name: sym.name, kind: sym.kind, filePath: relPath, uid });
          }
        }
      } catch {
        // Skip files that fail to parse
      }
    }

    return changes;
  }

  /**
   * Detect new/removed dependencies from changed files
   */
  getDependencyChanges(changedFiles: ChangedFile[]): DependencyChange[] {
    const changes: DependencyChange[] = [];
    const changedPaths = new Set(changedFiles.map((f) => f.path));

    for (const file of changedFiles) {
      if (file.status === "deleted") continue;

      const absPath = path.join(this.rootDir, file.path);
      if (!fs.existsSync(absPath)) continue;

      const parser = getParserForFile(file.path);
      if (!parser) continue;

      try {
        const content = fs.readFileSync(absPath, "utf-8");
        const result = parser.parse(file.path, content, { rootDir: this.rootDir });

        // Current imports from this file
        const currentImports = new Set(
          result.imports.flatMap((imp) => imp.names.map((n) => `${file.path}→${imp.modulePath}:${n}`)),
        );

        // Model imports from this file
        const modelImports = new Set<string>();
        for (const rel of this.model.relations) {
          if (rel.type === "imports" && rel.source === file.path) {
            const targetSym = this.model.symbols.get(rel.target);
            if (targetSym) {
              modelImports.add(`${file.path}→${targetSym.filePath}:${targetSym.name}`);
            }
          }
        }

        // New imports
        for (const imp of currentImports) {
          let found = false;
          for (const modelImp of modelImports) {
            // Fuzzy match — same target name
            const currentName = imp.split(":").pop();
            const modelName = modelImp.split(":").pop();
            if (currentName === modelName) { found = true; break; }
          }
          if (!found) {
            const [source, rest] = imp.split("→");
            changes.push({ type: "added", source, target: rest, relationType: "imports" });
          }
        }
      } catch {
        // Skip
      }
    }

    return changes;
  }

  /**
   * Check for layer violations across all modules
   */
  checkLayerViolations(): LayerViolation[] {
    const violations: LayerViolation[] = [];
    const layerOrder = ["presentation", "api", "application", "domain", "infrastructure", "config"];
    const seen = new Set<string>();

    for (const rel of this.model.relations) {
      if (rel.type !== "imports") continue;

      const srcMod = rel.source.split("/")[0];
      const tgtSym = this.model.symbols.get(rel.target);
      if (!tgtSym) continue;
      const tgtMod = tgtSym.filePath.split("/")[0];
      if (srcMod === tgtMod) continue;

      const srcModule = this.model.modules.find((m) => m.name === srcMod);
      const tgtModule = this.model.modules.find((m) => m.name === tgtMod);
      if (!srcModule || !tgtModule) continue;

      const srcIdx = layerOrder.indexOf(srcModule.layer);
      const tgtIdx = layerOrder.indexOf(tgtModule.layer);

      if (srcIdx > tgtIdx && srcIdx !== -1 && tgtIdx !== -1) {
        const key = `${srcMod}→${tgtMod}`;
        if (!seen.has(key)) {
          seen.add(key);
          violations.push({
            sourceModule: srcMod,
            sourceLayer: srcModule.layer,
            targetModule: tgtMod,
            targetLayer: tgtModule.layer,
            file: rel.source,
          });
        }
      }
    }

    return violations;
  }

  /**
   * Check for circular dependencies between modules
   */
  checkCircularDeps(): string[][] {
    const moduleDeps = new Map<string, Set<string>>();
    for (const rel of this.model.relations) {
      if (rel.type !== "imports") continue;
      const srcMod = rel.source.split("/")[0];
      const tgtSym = this.model.symbols.get(rel.target);
      if (!tgtSym) continue;
      const tgtMod = tgtSym.filePath.split("/")[0];
      if (srcMod !== tgtMod) {
        if (!moduleDeps.has(srcMod)) moduleDeps.set(srcMod, new Set());
        moduleDeps.get(srcMod)!.add(tgtMod);
      }
    }

    const circular: string[][] = [];
    for (const [modA, depsA] of moduleDeps) {
      for (const modB of depsA) {
        if (moduleDeps.get(modB)?.has(modA)) {
          const pair = [modA, modB].sort();
          if (!circular.some((c) => c[0] === pair[0] && c[1] === pair[1])) {
            circular.push(pair);
          }
        }
      }
    }

    return circular;
  }

  /**
   * Check module health metrics
   */
  private checkModuleHealth() {
    return this.model.modules.map((mod) => {
      const issues: string[] = [];
      if (mod.lineCount > 5000) issues.push(`Large (${mod.lineCount.toLocaleString()} lines)`);
      if (mod.symbols.length > 200) issues.push(`Many symbols (${mod.symbols.length})`);
      if (mod.fileCount > 50) issues.push(`Many files (${mod.fileCount})`);
      return { name: mod.name, layer: mod.layer, files: mod.fileCount, lines: mod.lineCount, issues, healthy: issues.length === 0 };
    });
  }
}
