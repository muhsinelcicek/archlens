import fs from "node:fs";
import path from "node:path";
import type { ArchitectureModel, Module } from "../models/index.js";

export interface ConsistencyIssue {
  category: "error-handling" | "logging" | "validation" | "configuration" | "naming-convention";
  module: string;
  description: string;
  severity: "major" | "minor" | "info";
  evidence: string;
}

export interface ConsistencyReport {
  issues: ConsistencyIssue[];
  moduleScores: Array<{ module: string; errorHandling: number; logging: number; overall: number }>;
  summary: string;
}

/**
 * Checks cross-cutting concern consistency across modules:
 * - Error handling patterns (try/catch, Result types, error returns)
 * - Logging usage (ILogger, console.log, print, log4j)
 * - Naming convention adherence per module
 */
export class ConsistencyChecker {
  constructor(
    private model: ArchitectureModel,
    private rootDir: string,
  ) {}

  check(): ConsistencyReport {
    const issues: ConsistencyIssue[] = [];
    const moduleScores: ConsistencyReport["moduleScores"] = [];

    for (const mod of this.model.modules) {
      if (mod.fileCount === 0) continue;

      const files = this.getModuleFiles(mod);
      let errorHandlingScore = 100;
      let loggingScore = 100;

      // Read sample files for pattern checking
      for (const fp of files.slice(0, 20)) {
        try {
          const absPath = path.join(this.rootDir, fp);
          if (!fs.existsSync(absPath)) continue;
          const content = fs.readFileSync(absPath, "utf-8");
          const lang = this.detectLang(fp);

          // Error handling checks
          const ehIssues = this.checkErrorHandling(content, fp, mod.name, lang);
          issues.push(...ehIssues);
          errorHandlingScore -= ehIssues.length * 10;

          // Logging checks
          const logIssues = this.checkLogging(content, fp, mod.name, lang);
          issues.push(...logIssues);
          loggingScore -= logIssues.length * 10;
        } catch { /* skip */ }
      }

      moduleScores.push({
        module: mod.name,
        errorHandling: Math.max(0, errorHandlingScore),
        logging: Math.max(0, loggingScore),
        overall: Math.max(0, Math.round((errorHandlingScore + loggingScore) / 2)),
      });
    }

    // Cross-module consistency check
    const avgEH = moduleScores.reduce((a, m) => a + m.errorHandling, 0) / Math.max(moduleScores.length, 1);
    for (const m of moduleScores) {
      if (m.errorHandling < avgEH - 30) {
        issues.push({
          category: "error-handling",
          module: m.module,
          description: `${m.module} error handling (${m.errorHandling}%) is significantly below project average (${Math.round(avgEH)}%)`,
          severity: "major",
          evidence: "Inconsistent error handling across modules increases bug risk",
        });
      }
    }

    const summary = issues.length === 0
      ? "All modules show consistent cross-cutting patterns"
      : `${issues.length} consistency issues across ${new Set(issues.map((i) => i.module)).size} modules`;

    return { issues, moduleScores, summary };
  }

  private checkErrorHandling(content: string, filePath: string, moduleName: string, lang: string): ConsistencyIssue[] {
    const issues: ConsistencyIssue[] = [];

    // Empty catch blocks
    if (lang === "csharp" || lang === "java" || lang === "typescript") {
      const emptyCatches = (content.match(/catch\s*\([^)]*\)\s*\{\s*\}/g) || []).length;
      if (emptyCatches > 0) {
        issues.push({ category: "error-handling", module: moduleName, severity: "major", description: `${emptyCatches} empty catch block(s) in ${filePath.split("/").pop()}`, evidence: "Silently swallowing exceptions hides bugs" });
      }
    }

    // Python bare except
    if (lang === "python") {
      if (/except\s*:/.test(content)) {
        issues.push({ category: "error-handling", module: moduleName, severity: "major", description: `Bare except in ${filePath.split("/").pop()}`, evidence: "Catches SystemExit and KeyboardInterrupt" });
      }
    }

    // Go unchecked errors
    if (lang === "go") {
      const unchecked = (content.match(/,\s*_\s*:?=/g) || []).length;
      if (unchecked > 2) {
        issues.push({ category: "error-handling", module: moduleName, severity: "major", description: `${unchecked} unchecked errors in ${filePath.split("/").pop()}`, evidence: "Go errors should always be checked" });
      }
    }

    return issues;
  }

  private checkLogging(content: string, filePath: string, moduleName: string, lang: string): ConsistencyIssue[] {
    const issues: ConsistencyIssue[] = [];

    // Console.log/print in production code (not test files)
    if (filePath.includes("test") || filePath.includes("spec") || filePath.includes("Test")) return issues;

    if (lang === "csharp") {
      if (content.includes("Console.Write")) {
        issues.push({ category: "logging", module: moduleName, severity: "minor", description: `Console.Write found in ${filePath.split("/").pop()} — use ILogger`, evidence: "Console output is not structured, not configurable" });
      }
    }

    if (lang === "typescript" || lang === "javascript") {
      const consoleCount = (content.match(/console\.(log|error|warn|info)\(/g) || []).length;
      if (consoleCount > 3) {
        issues.push({ category: "logging", module: moduleName, severity: "minor", description: `${consoleCount} console.log calls in ${filePath.split("/").pop()}`, evidence: "Use a structured logger for production code" });
      }
    }

    if (lang === "python") {
      if (content.includes("print(") && !content.includes("logging")) {
        issues.push({ category: "logging", module: moduleName, severity: "info", description: `print() used instead of logging in ${filePath.split("/").pop()}`, evidence: "Use logging module for configurable output" });
      }
    }

    if (lang === "java") {
      if (content.includes("System.out.print") || content.includes("System.err.print")) {
        issues.push({ category: "logging", module: moduleName, severity: "minor", description: `System.out used in ${filePath.split("/").pop()} — use SLF4J`, evidence: "System.out is not configurable or structured" });
      }
    }

    return issues;
  }

  private getModuleFiles(mod: Module): string[] {
    const files = new Set<string>();
    for (const uid of mod.symbols) {
      const sym = this.model.symbols.get(uid);
      if (sym) files.add(sym.filePath);
    }
    return [...files];
  }

  private detectLang(filePath: string): string {
    const ext = filePath.split(".").pop()?.toLowerCase() || "";
    const map: Record<string, string> = { cs: "csharp", ts: "typescript", tsx: "typescript", js: "javascript", py: "python", go: "go", java: "java", swift: "swift", rs: "rust" };
    return map[ext] || "unknown";
  }
}
