import fs from "node:fs";
import path from "node:path";
import type { ArchitectureModel, Symbol, Relation, Module, Language } from "../models/index.js";
import { calculateComplexity, getLanguageRules, type LanguageIssue } from "./language-rules.js";

// ─── Types ───────────────────────────────────────────────────────────

export type Severity = "critical" | "major" | "minor" | "info";
export type IssueCategory =
  | "naming" | "complexity" | "code-smell" | "type-safety" | "security"
  | "ddd" | "clean-architecture" | "solid" | "pattern" | "best-practice"
  | "performance" | "resource-management" | "error-handling" | "readability"
  | "bug-risk" | "safety" | "memory";

export interface QualityIssue {
  id: string;
  rule: string;
  category: IssueCategory;
  severity: Severity;
  message: string;
  filePath: string;
  symbolRef?: string;
  line?: number;
  suggestion?: string;
}

export interface ModuleQuality {
  moduleName: string;
  score: number; // 0-100
  issues: QualityIssue[];
  metrics: {
    totalSymbols: number;
    avgComplexity: number;
    maxMethodLines: number;
    godClasses: number;
    namingViolations: number;
    typeUnsafe: number;
    patternViolations: number;
  };
}

export interface QualityReport {
  projectScore: number;
  totalIssues: number;
  bySeverity: Record<Severity, number>;
  byCategory: Record<string, number>;
  modules: ModuleQuality[];
  architecturePatterns: PatternAnalysis[];
  topIssues: QualityIssue[];
}

export interface PatternAnalysis {
  pattern: string;
  detected: boolean;
  compliance: number; // 0-100
  violations: string[];
  recommendations: string[];
}

// ─── Quality Analyzer ────────────────────────────────────────────────

export class QualityAnalyzer {
  constructor(private model: ArchitectureModel) {}

  analyze(): QualityReport {
    const allIssues: QualityIssue[] = [];
    const moduleQualities: ModuleQuality[] = [];

    for (const mod of this.model.modules) {
      const issues = this.analyzeModule(mod);
      allIssues.push(...issues);

      const metrics = this.calculateMetrics(mod, issues);
      const score = this.calculateScore(issues, mod);

      moduleQualities.push({ moduleName: mod.name, score, issues, metrics });
    }

    const architecturePatterns = this.analyzeArchitecturePatterns();
    allIssues.push(...architecturePatterns.flatMap((p) => p.violations.map((v, i) => ({
      id: `arch-${p.pattern}-${i}`,
      rule: p.pattern,
      category: "clean-architecture" as IssueCategory,
      severity: "major" as Severity,
      message: v,
      filePath: "",
      suggestion: p.recommendations[0],
    }))));

    const bySeverity: Record<Severity, number> = { critical: 0, major: 0, minor: 0, info: 0 };
    const byCategory: Record<string, number> = {};
    for (const issue of allIssues) {
      bySeverity[issue.severity]++;
      byCategory[issue.category] = (byCategory[issue.category] || 0) + 1;
    }

    const projectScore = moduleQualities.length > 0
      ? Math.round(moduleQualities.reduce((a, m) => a + m.score, 0) / moduleQualities.length)
      : 100;

    return {
      projectScore,
      totalIssues: allIssues.length,
      bySeverity,
      byCategory,
      modules: moduleQualities,
      architecturePatterns,
      topIssues: allIssues.sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity)).slice(0, 20),
    };
  }

  // ─── Module Analysis ─────────────────────────────────────────────

  private analyzeModule(mod: Module): QualityIssue[] {
    const issues: QualityIssue[] = [];
    const symbols = this.getModuleSymbols(mod);

    // Language detection
    const lang = mod.language;

    for (const [uid, sym] of symbols) {
      // Skip auto-generated files (migrations, designers, generated)
      const fp = sym.filePath.toLowerCase();
      if (fp.includes("migration") || fp.includes(".designer.") || fp.includes(".generated.") || fp.includes("/obj/") || fp.includes("/bin/")) continue;

      // ── Naming Conventions ──
      issues.push(...this.checkNaming(sym, lang));

      // ── Complexity / Code Smells ──
      issues.push(...this.checkComplexity(sym, lang as Language, this.model.project.rootPath));

      // ── Type Safety ──
      issues.push(...this.checkTypeSafety(sym, lang));

      // ── SOLID Principles ──
      issues.push(...this.checkSOLID(sym, symbols, mod));
    }

    // ── Module-level checks ──
    issues.push(...this.checkModuleSize(mod, symbols));
    issues.push(...this.checkDependencyDirection(mod));

    return issues;
  }

  // ─── Naming Conventions ──────────────────────────────────────────

  private checkNaming(sym: Symbol, lang: string): QualityIssue[] {
    const issues: QualityIssue[] = [];
    const name = sym.name.split(".").pop() || sym.name;

    if (lang === "csharp" || lang === "java") {
      // PascalCase for classes/interfaces
      if ((sym.kind === "class" || sym.kind === "interface") && name[0] !== name[0].toUpperCase()) {
        issues.push({
          id: `naming-pascal-${sym.uid}`, rule: "naming/pascal-case",
          category: "naming", severity: "minor",
          message: `${sym.kind} "${name}" should use PascalCase`,
          filePath: sym.filePath, symbolRef: sym.uid, line: sym.startLine,
          suggestion: name[0].toUpperCase() + name.slice(1),
        });
      }
      // Interface naming — C# convention: IFoo
      if (lang === "csharp" && sym.kind === "interface" && !name.startsWith("I")) {
        issues.push({
          id: `naming-interface-${sym.uid}`, rule: "naming/interface-prefix",
          category: "naming", severity: "minor",
          message: `Interface "${name}" should start with "I" (C# convention)`,
          filePath: sym.filePath, symbolRef: sym.uid, line: sym.startLine,
          suggestion: `I${name}`,
        });
      }
    }

    if (lang === "python") {
      // snake_case for functions
      if ((sym.kind === "function" || sym.kind === "method") && name !== "__init__" && /[A-Z]/.test(name) && !name.startsWith("_")) {
        issues.push({
          id: `naming-snake-${sym.uid}`, rule: "naming/snake-case",
          category: "naming", severity: "minor",
          message: `Function "${name}" should use snake_case (PEP8)`,
          filePath: sym.filePath, symbolRef: sym.uid, line: sym.startLine,
        });
      }
      // PascalCase for classes
      if (sym.kind === "class" && name[0] !== name[0].toUpperCase()) {
        issues.push({
          id: `naming-class-${sym.uid}`, rule: "naming/class-pascal",
          category: "naming", severity: "minor",
          message: `Class "${name}" should use PascalCase (PEP8)`,
          filePath: sym.filePath, symbolRef: sym.uid, line: sym.startLine,
        });
      }
    }

    if (lang === "typescript" || lang === "javascript") {
      // camelCase for functions (skip React components in tsx/jsx)
      if ((sym.kind === "function" || sym.kind === "method") && /^[A-Z]/.test(name)) {
        if (!sym.filePath.endsWith(".tsx") && !sym.filePath.endsWith(".jsx")) {
          issues.push({
            id: `naming-camel-${sym.uid}`, rule: "naming/camel-case",
            category: "naming", severity: "info",
            message: `Function "${name}" should use camelCase`,
            filePath: sym.filePath, symbolRef: sym.uid, line: sym.startLine,
          });
        }
      }
    }

    // C# — PascalCase is CORRECT for methods/functions, no camelCase warning needed
    // Only check: private fields should be _camelCase
    if (lang === "csharp") {
      if (sym.kind === "property" && sym.visibility === "private" && !name.startsWith("_") && /^[a-z]/.test(name)) {
        issues.push({
          id: `naming-private-${sym.uid}`, rule: "naming/private-field",
          category: "naming", severity: "info",
          message: `Private field "${name}" should use _camelCase (C# convention)`,
          filePath: sym.filePath, symbolRef: sym.uid, line: sym.startLine,
        });
      }
    }

    return issues;
  }

  // ─── Complexity ──────────────────────────────────────────────────

  private checkComplexity(sym: Symbol, lang: Language, rootDir?: string): QualityIssue[] {
    const issues: QualityIssue[] = [];

    if (sym.kind === "function" || sym.kind === "method") {
      const lines = (sym.endLine || 0) - (sym.startLine || 0);

      // Long method
      if (lines > 50) {
        issues.push({
          id: `complexity-long-${sym.uid}`, rule: "complexity/long-method",
          category: "complexity", severity: lines > 100 ? "major" : "minor",
          message: `${sym.kind} "${sym.name}" is ${lines} lines long (max recommended: 50)`,
          filePath: sym.filePath, symbolRef: sym.uid, line: sym.startLine,
          suggestion: "Extract smaller methods with single responsibilities",
        });
      }

      // Too many parameters
      if (sym.params && sym.params.length > 5) {
        issues.push({
          id: `complexity-params-${sym.uid}`, rule: "complexity/too-many-params",
          category: "complexity", severity: sym.params.length > 8 ? "major" : "minor",
          message: `${sym.kind} "${sym.name}" has ${sym.params.length} parameters (max recommended: 5)`,
          filePath: sym.filePath, symbolRef: sym.uid, line: sym.startLine,
          suggestion: "Consider using a parameter object or builder pattern",
        });
      }

      // Cyclomatic complexity (from source if available)
      if (rootDir && lines > 10) {
        try {
          const absPath = path.join(rootDir, sym.filePath);
          if (fs.existsSync(absPath)) {
            const content = fs.readFileSync(absPath, "utf-8");
            const fileLines = content.split("\n");
            const methodCode = fileLines.slice((sym.startLine || 1) - 1, sym.endLine || fileLines.length).join("\n");
            const complexity = calculateComplexity(methodCode, lang);

            if (complexity.cyclomatic > 10) {
              issues.push({
                id: `complexity-cyclo-${sym.uid}`, rule: "complexity/cyclomatic",
                category: "complexity", severity: complexity.cyclomatic > 20 ? "major" : "minor",
                message: `${sym.kind} "${sym.name}" has cyclomatic complexity ${complexity.cyclomatic} (recommended <10)`,
                filePath: sym.filePath, symbolRef: sym.uid, line: sym.startLine,
                suggestion: "Reduce branching: extract conditions into methods, use early returns, or strategy pattern",
              });
            }

            if (complexity.cognitive > 15) {
              issues.push({
                id: `complexity-cognitive-${sym.uid}`, rule: "complexity/cognitive",
                category: "complexity", severity: complexity.cognitive > 25 ? "major" : "minor",
                message: `${sym.kind} "${sym.name}" has cognitive complexity ${complexity.cognitive} (hard to understand)`,
                filePath: sym.filePath, symbolRef: sym.uid, line: sym.startLine,
                suggestion: "Simplify: reduce nesting depth, extract helper methods",
              });
            }

            if (complexity.nesting > 4) {
              issues.push({
                id: `complexity-nesting-${sym.uid}`, rule: "complexity/deep-nesting",
                category: "complexity", severity: complexity.nesting > 6 ? "major" : "minor",
                message: `${sym.kind} "${sym.name}" has ${complexity.nesting} nesting levels (recommended <4)`,
                filePath: sym.filePath, symbolRef: sym.uid, line: sym.startLine,
                suggestion: "Use early returns, guard clauses, or extract nested blocks",
              });
            }
          }
        } catch { /* skip if file unreadable */ }
      }

      // Language-specific rules (from source)
      if (rootDir) {
        try {
          const absPath = path.join(rootDir, sym.filePath);
          if (fs.existsSync(absPath)) {
            const content = fs.readFileSync(absPath, "utf-8");
            const fileLines = content.split("\n");
            const methodCode = fileLines.slice((sym.startLine || 1) - 1, sym.endLine || fileLines.length).join("\n");
            const langIssues = getLanguageRules(sym, methodCode, lang);

            for (const li of langIssues) {
              issues.push({
                id: `lang-${li.rule}-${sym.uid}`, rule: li.rule,
                category: li.category as IssueCategory, severity: li.severity,
                message: li.message, suggestion: li.suggestion,
                filePath: sym.filePath, symbolRef: sym.uid, line: sym.startLine,
              });
            }
          }
        } catch { /* skip */ }
      }
    }

    if (sym.kind === "class") {
      // God class detection — count methods
      const methods = this.getMethodsOf(sym);
      if (methods.length > 20) {
        issues.push({
          id: `smell-god-class-${sym.uid}`, rule: "code-smell/god-class",
          category: "code-smell", severity: "major",
          message: `Class "${sym.name}" has ${methods.length} methods — possible God Class`,
          filePath: sym.filePath, symbolRef: sym.uid, line: sym.startLine,
          suggestion: "Split into smaller, focused classes following Single Responsibility Principle",
        });
      }

      // Large class
      const classLines = (sym.endLine || 0) - (sym.startLine || 0);
      if (classLines > 300) {
        issues.push({
          id: `smell-large-class-${sym.uid}`, rule: "code-smell/large-class",
          category: "code-smell", severity: classLines > 500 ? "major" : "minor",
          message: `Class "${sym.name}" is ${classLines} lines (max recommended: 300)`,
          filePath: sym.filePath, symbolRef: sym.uid, line: sym.startLine,
          suggestion: "Extract related methods into separate classes",
        });
      }
    }

    return issues;
  }

  // ─── Type Safety ─────────────────────────────────────────────────

  private checkTypeSafety(sym: Symbol, lang: string): QualityIssue[] {
    const issues: QualityIssue[] = [];

    if (lang === "typescript" || lang === "javascript") {
      // Missing return type
      if ((sym.kind === "function" || sym.kind === "method") && !sym.returnType) {
        issues.push({
          id: `type-return-${sym.uid}`, rule: "type-safety/missing-return-type",
          category: "type-safety", severity: "info",
          message: `${sym.kind} "${sym.name}" has no explicit return type`,
          filePath: sym.filePath, symbolRef: sym.uid, line: sym.startLine,
          suggestion: "Add explicit return type annotation",
        });
      }
    }

    if (lang === "python") {
      // Missing type hints
      if ((sym.kind === "function" || sym.kind === "method") && sym.params) {
        const untypedParams = sym.params.filter((p) => !p.type);
        if (untypedParams.length > 0 && sym.name !== "__init__") {
          issues.push({
            id: `type-hint-${sym.uid}`, rule: "type-safety/missing-type-hints",
            category: "type-safety", severity: "info",
            message: `${sym.kind} "${sym.name}" has ${untypedParams.length} untyped parameter(s): ${untypedParams.map((p) => p.name).join(", ")}`,
            filePath: sym.filePath, symbolRef: sym.uid, line: sym.startLine,
            suggestion: "Add type hints for better IDE support and documentation",
          });
        }
      }
    }

    return issues;
  }

  // ─── SOLID Principles ────────────────────────────────────────────

  private checkSOLID(sym: Symbol, allSymbols: Array<[string, Symbol]>, mod: Module): QualityIssue[] {
    const issues: QualityIssue[] = [];

    if (sym.kind === "class") {
      // Single Responsibility: class has too many different concerns
      const methods = this.getMethodsOf(sym);
      const methodPrefixes = new Set<string>();
      for (const m of methods) {
        const methodName = m.name.split(".").pop() || "";
        const prefix = methodName.replace(/^(get|set|is|has|can|should|will|did|on|handle|create|update|delete|find|fetch|load|save|validate|check|process|convert|transform|calculate|compute|render|display|show|hide)/, "$1");
        if (prefix !== methodName) methodPrefixes.add(prefix);
      }
      if (methodPrefixes.size > 6) {
        issues.push({
          id: `solid-srp-${sym.uid}`, rule: "solid/single-responsibility",
          category: "solid", severity: "major",
          message: `Class "${sym.name}" appears to handle ${methodPrefixes.size} different concerns — possible SRP violation`,
          filePath: sym.filePath, symbolRef: sym.uid, line: sym.startLine,
          suggestion: "Split responsibilities into separate classes",
        });
      }

      // Interface Segregation: fat interface
      if ((sym.implements && sym.implements.length > 3)) {
        if (sym.implements.length > 3) {
          issues.push({
            id: `solid-isp-${sym.uid}`, rule: "solid/interface-segregation",
            category: "solid", severity: "minor",
            message: `Class "${sym.name}" implements ${sym.implements.length} interfaces — consider if all are necessary`,
            filePath: sym.filePath, symbolRef: sym.uid, line: sym.startLine,
            suggestion: "Verify each interface is actually needed by this class",
          });
        }
      }
    }

    return issues;
  }

  // ─── Module Size ─────────────────────────────────────────────────

  private checkModuleSize(mod: Module, symbols: Array<[string, Symbol]>): QualityIssue[] {
    const issues: QualityIssue[] = [];

    if (mod.fileCount > 50) {
      issues.push({
        id: `module-large-${mod.name}`, rule: "module/too-large",
        category: "code-smell", severity: "major",
        message: `Module "${mod.name}" has ${mod.fileCount} files — consider splitting`,
        filePath: "", suggestion: "Extract sub-modules based on responsibility",
      });
    }

    if (mod.lineCount > 5000) {
      issues.push({
        id: `module-lines-${mod.name}`, rule: "module/too-many-lines",
        category: "code-smell", severity: mod.lineCount > 10000 ? "critical" : "major",
        message: `Module "${mod.name}" has ${mod.lineCount.toLocaleString()} lines`,
        filePath: "", suggestion: "Large modules are harder to maintain — split by domain",
      });
    }

    return issues;
  }

  // ─── Dependency Direction ────────────────────────────────────────

  private checkDependencyDirection(mod: Module): QualityIssue[] {
    const issues: QualityIssue[] = [];
    const layerOrder = ["presentation", "api", "application", "domain", "infrastructure", "config"];
    const modIdx = layerOrder.indexOf(mod.layer);
    if (modIdx === -1) return issues;

    for (const rel of this.model.relations) {
      if (rel.type === "composes") continue;

      const srcInMod = mod.symbols.includes(rel.source) ||
        Array.from(this.model.symbols.entries()).some(([uid, s]) => s.filePath === rel.source && mod.symbols.includes(uid));

      if (!srcInMod) continue;

      const tgtSym = this.model.symbols.get(rel.target);
      if (!tgtSym) continue;

      for (const otherMod of this.model.modules) {
        if (otherMod.name === mod.name) continue;
        const tgtInOther = otherMod.symbols.some((uid) => {
          const s = this.model.symbols.get(uid);
          return s && s.filePath === tgtSym.filePath;
        });

        if (tgtInOther) {
          const otherIdx = layerOrder.indexOf(otherMod.layer);
          if (otherIdx !== -1 && modIdx > otherIdx) {
            issues.push({
              id: `dep-direction-${mod.name}-${otherMod.name}`, rule: "clean-architecture/dependency-rule",
              category: "clean-architecture", severity: "critical",
              message: `"${mod.name}" (${mod.layer}) depends on "${otherMod.name}" (${otherMod.layer}) — violates dependency rule`,
              filePath: rel.source,
              suggestion: "Lower layers should not depend on higher layers. Use dependency inversion.",
            });
            break;
          }
        }
      }
    }

    return issues;
  }

  // ─── Architecture Pattern Analysis ───────────────────────────────

  private analyzeArchitecturePatterns(): PatternAnalysis[] {
    const patterns: PatternAnalysis[] = [];

    // ── DDD Analysis ──
    patterns.push(this.analyzeDDD());

    // ── Clean Architecture ──
    patterns.push(this.analyzeCleanArchitecture());

    // ── Repository Pattern ──
    patterns.push(this.analyzeRepositoryPattern());

    // ── CQRS Pattern ──
    patterns.push(this.analyzeCQRS());

    return patterns;
  }

  private analyzeDDD(): PatternAnalysis {
    const violations: string[] = [];
    const recommendations: string[] = [];

    // Check for domain layer
    const domainModules = this.model.modules.filter((m) => m.layer === "domain");
    const hasDomainLayer = domainModules.length > 0;

    if (!hasDomainLayer) {
      violations.push("No dedicated domain layer detected");
      recommendations.push("Create a separate domain/core module for business entities and rules");
    }

    // Check domain depends on infrastructure
    for (const dm of domainModules) {
      for (const rel of this.model.relations) {
        if (rel.type === "composes") continue;
        const srcInDomain = dm.symbols.includes(rel.source);
        if (!srcInDomain) continue;

        const tgtSym = this.model.symbols.get(rel.target);
        if (!tgtSym) continue;

        for (const im of this.model.modules.filter((m) => m.layer === "infrastructure")) {
          if (im.symbols.some((uid) => this.model.symbols.get(uid)?.filePath === tgtSym.filePath)) {
            violations.push(`Domain module "${dm.name}" depends on infrastructure "${im.name}" — DDD violation`);
            recommendations.push("Domain should define interfaces, infrastructure implements them (Dependency Inversion)");
            break;
          }
        }
      }
    }

    // Check for value objects / entities
    const domainClasses = domainModules.flatMap((m) => m.symbols).map((uid) => this.model.symbols.get(uid)).filter((s) => s && s.kind === "class");
    if (domainClasses.length === 0 && hasDomainLayer) {
      violations.push("Domain layer has no entity/value object classes");
    }

    const compliance = hasDomainLayer ? Math.max(0, 100 - violations.length * 20) : 0;
    return { pattern: "DDD (Domain-Driven Design)", detected: hasDomainLayer, compliance, violations, recommendations };
  }

  private analyzeCleanArchitecture(): PatternAnalysis {
    const violations: string[] = [];
    const recommendations: string[] = [];
    const layerOrder = ["presentation", "api", "application", "domain", "infrastructure"];

    let violationCount = 0;
    let totalCrossModuleDeps = 0;

    for (const mod of this.model.modules) {
      const modIdx = layerOrder.indexOf(mod.layer);
      if (modIdx === -1) continue;

      for (const rel of this.model.relations) {
        if (rel.type === "composes") continue;
        // Check if source is in this module
        const srcFile = rel.source;
        const isInMod = mod.symbols.some((uid) => {
          const s = this.model.symbols.get(uid);
          return s && s.filePath === srcFile;
        }) || mod.symbols.includes(rel.source);

        if (!isInMod) continue;

        const tgtSym = this.model.symbols.get(rel.target);
        if (!tgtSym) continue;

        for (const other of this.model.modules) {
          if (other.name === mod.name) continue;
          const otherIdx = layerOrder.indexOf(other.layer);
          if (otherIdx === -1) continue;

          const tgtInOther = other.symbols.some((uid) => this.model.symbols.get(uid)?.filePath === tgtSym.filePath);
          if (tgtInOther) {
            totalCrossModuleDeps++;
            if (modIdx > otherIdx) {
              violationCount++;
              if (violations.length < 5) {
                violations.push(`${mod.name} (${mod.layer}) → ${other.name} (${other.layer})`);
              }
            }
          }
        }
      }
    }

    const hasLayers = new Set(this.model.modules.map((m) => m.layer)).size >= 2;
    const compliance = totalCrossModuleDeps > 0 ? Math.max(0, 100 - Math.round((violationCount / totalCrossModuleDeps) * 100)) : (hasLayers ? 100 : 50);

    if (!hasLayers) recommendations.push("Organize code into clear layers (presentation, application, domain, infrastructure)");
    if (violationCount > 0) recommendations.push("Fix dependency rule violations — use interfaces and dependency injection");

    return { pattern: "Clean Architecture", detected: hasLayers, compliance, violations, recommendations };
  }

  private analyzeRepositoryPattern(): PatternAnalysis {
    const violations: string[] = [];
    const recommendations: string[] = [];

    // Find repository-like classes
    const repos: Symbol[] = [];
    for (const [, sym] of this.model.symbols) {
      if (sym.kind === "class" || sym.kind === "interface") {
        if (sym.name.toLowerCase().includes("repository") || sym.name.toLowerCase().includes("repo")) {
          repos.push(sym);
        }
      }
    }

    const detected = repos.length > 0;

    if (detected) {
      // Check repos are in infrastructure layer
      for (const repo of repos) {
        const repoMod = this.model.modules.find((m) => m.symbols.some((uid) => this.model.symbols.get(uid)?.filePath === repo.filePath));
        if (repoMod && repoMod.layer !== "infrastructure" && repoMod.layer !== "domain") {
          violations.push(`Repository "${repo.name}" is in ${repoMod.layer} layer — should be in infrastructure (implementation) or domain (interface)`);
        }
      }

      // Check if interfaces exist for repos
      const repoInterfaces = repos.filter((r) => r.kind === "interface");
      const repoClasses = repos.filter((r) => r.kind === "class");
      if (repoClasses.length > 0 && repoInterfaces.length === 0) {
        violations.push("Repository implementations found without matching interfaces — violates Dependency Inversion");
        recommendations.push("Define IRepository interfaces in domain layer, implement in infrastructure");
      }
    } else {
      recommendations.push("Consider using Repository pattern to abstract data access");
    }

    const compliance = detected ? Math.max(0, 100 - violations.length * 25) : 0;
    return { pattern: "Repository Pattern", detected, compliance, violations, recommendations };
  }

  private analyzeCQRS(): PatternAnalysis {
    const violations: string[] = [];
    const recommendations: string[] = [];

    // Detect CQRS markers
    let hasCommands = false;
    let hasQueries = false;

    for (const [, sym] of this.model.symbols) {
      const name = sym.name.toLowerCase();
      if (name.includes("command") && (sym.kind === "class" || sym.kind === "interface")) hasCommands = true;
      if (name.includes("query") && (sym.kind === "class" || sym.kind === "interface")) hasQueries = true;
    }

    const detected = hasCommands || hasQueries;

    if (detected && hasCommands && !hasQueries) {
      violations.push("Commands detected but no Queries — incomplete CQRS implementation");
    }
    if (detected && !hasCommands && hasQueries) {
      violations.push("Queries detected but no Commands — incomplete CQRS implementation");
    }

    if (!detected) {
      recommendations.push("Consider CQRS for complex domains — separate read and write models");
    }

    const compliance = detected ? (hasCommands && hasQueries ? 80 : 40) - violations.length * 20 : 0;
    return { pattern: "CQRS", detected, compliance: Math.max(0, compliance), violations, recommendations };
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  private getModuleSymbols(mod: Module): Array<[string, Symbol]> {
    return mod.symbols
      .map((uid) => [uid, this.model.symbols.get(uid)] as [string, Symbol | undefined])
      .filter(([, s]) => s !== undefined) as Array<[string, Symbol]>;
  }

  private getMethodsOf(sym: Symbol): Symbol[] {
    return this.model.relations
      .filter((r) => r.source === sym.uid && r.type === "composes")
      .map((r) => this.model.symbols.get(r.target))
      .filter((s): s is Symbol => s !== undefined && s.kind === "method");
  }

  private calculateMetrics(mod: Module, issues: QualityIssue[]): ModuleQuality["metrics"] {
    const symbols = this.getModuleSymbols(mod);
    const methods = symbols.filter(([, s]) => s.kind === "method" || s.kind === "function");
    const methodLines = methods.map(([, s]) => (s.endLine || 0) - (s.startLine || 0)).filter((l) => l > 0);

    return {
      totalSymbols: symbols.length,
      avgComplexity: methodLines.length > 0 ? Math.round(methodLines.reduce((a, b) => a + b, 0) / methodLines.length) : 0,
      maxMethodLines: methodLines.length > 0 ? Math.max(...methodLines) : 0,
      godClasses: issues.filter((i) => i.rule === "code-smell/god-class").length,
      namingViolations: issues.filter((i) => i.category === "naming").length,
      typeUnsafe: issues.filter((i) => i.category === "type-safety").length,
      patternViolations: issues.filter((i) => ["ddd", "clean-architecture", "solid", "pattern"].includes(i.category)).length,
    };
  }

  private calculateScore(issues: QualityIssue[], mod: Module): number {
    // Start at 85 (not 100) because we can't measure test coverage, docs, etc.
    // 100 should be reserved for modules with zero issues AND verified test coverage
    let score = 85;

    // Issue penalties
    for (const issue of issues) {
      switch (issue.severity) {
        case "critical": score -= 12; break;
        case "major": score -= 6; break;
        case "minor": score -= 2; break;
        case "info": score -= 0.5; break;
      }
    }

    // Size penalty: very large modules get slight penalty (harder to maintain)
    const symbolCount = mod.symbols.length;
    if (symbolCount > 300) score -= 5;
    else if (symbolCount > 200) score -= 3;
    else if (symbolCount > 100) score -= 1;

    // Bonus: very small, focused modules with no issues
    if (issues.length === 0 && symbolCount < 20) score = Math.min(score, 90);

    return Math.max(0, Math.round(score));
  }
}

function severityWeight(s: Severity): number {
  switch (s) { case "critical": return 4; case "major": return 3; case "minor": return 2; case "info": return 1; }
}
