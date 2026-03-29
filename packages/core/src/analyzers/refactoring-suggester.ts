import type { ArchitectureModel, Symbol } from "../models/index.js";

export type RefactoringType =
  | "extract-class" | "extract-method" | "extract-interface"
  | "move-to-layer" | "remove-dead-code" | "split-module"
  | "introduce-pattern" | "reduce-coupling" | "simplify";

export interface RefactoringSuggestion {
  id: string;
  type: RefactoringType;
  title: string;
  description: string;
  targetSymbol?: string;
  targetFile: string;
  targetModule: string;
  impact: "high" | "medium" | "low";
  effort: "high" | "medium" | "low";
  confidence: number; // 0-100
  details: string[];
}

export interface RefactoringReport {
  totalSuggestions: number;
  byType: Record<string, number>;
  byImpact: Record<string, number>;
  suggestions: RefactoringSuggestion[];
  quickWins: RefactoringSuggestion[]; // high impact + low effort
}

/**
 * RefactoringSuggester — generates actionable refactoring recommendations
 * based on code analysis, architecture patterns, and best practices.
 */
export class RefactoringSuggester {
  private sugId = 0;
  constructor(private model: ArchitectureModel) {}

  suggest(): RefactoringReport {
    const suggestions: RefactoringSuggestion[] = [];

    suggestions.push(...this.suggestGodClassSplits());
    suggestions.push(...this.suggestLongMethodExtracts());
    suggestions.push(...this.suggestInterfaceExtractions());
    suggestions.push(...this.suggestLayerMoves());
    suggestions.push(...this.suggestModuleSplits());
    suggestions.push(...this.suggestCouplingReductions());

    suggestions.sort((a, b) => b.confidence - a.confidence);

    const byType: Record<string, number> = {};
    const byImpact: Record<string, number> = {};
    for (const s of suggestions) {
      byType[s.type] = (byType[s.type] || 0) + 1;
      byImpact[s.impact] = (byImpact[s.impact] || 0) + 1;
    }

    const quickWins = suggestions.filter((s) => s.impact === "high" && s.effort === "low").slice(0, 10);

    return {
      totalSuggestions: suggestions.length,
      byType,
      byImpact,
      suggestions: suggestions.slice(0, 50),
      quickWins,
    };
  }

  private suggestGodClassSplits(): RefactoringSuggestion[] {
    const result: RefactoringSuggestion[] = [];
    for (const [uid, sym] of this.model.symbols) {
      if (sym.kind !== "class") continue;
      const methods = this.model.relations.filter((r) => r.source === uid && r.type === "composes");
      if (methods.length <= 15) continue;

      const modName = this.findModule(uid);
      result.push({
        id: `ref-${this.sugId++}`, type: "extract-class",
        title: `Split God Class: ${sym.name}`,
        description: `${sym.name} has ${methods.length} methods — violates Single Responsibility Principle`,
        targetSymbol: uid, targetFile: sym.filePath, targetModule: modName,
        impact: "high", effort: methods.length > 30 ? "high" : "medium", confidence: 85,
        details: [
          `${methods.length} methods indicate multiple responsibilities`,
          "Group related methods by prefix (get*, handle*, create*, validate*)",
          "Extract each group into a dedicated class",
          "Use composition or dependency injection to connect them",
        ],
      });
    }
    return result;
  }

  private suggestLongMethodExtracts(): RefactoringSuggestion[] {
    const result: RefactoringSuggestion[] = [];
    for (const [uid, sym] of this.model.symbols) {
      if (sym.kind !== "function" && sym.kind !== "method") continue;
      const lines = (sym.endLine || 0) - (sym.startLine || 0);
      if (lines <= 40) continue;

      result.push({
        id: `ref-${this.sugId++}`, type: "extract-method",
        title: `Extract from long ${sym.kind}: ${sym.name}`,
        description: `${sym.name} is ${lines} lines — extract smaller focused methods`,
        targetSymbol: uid, targetFile: sym.filePath, targetModule: this.findModule(uid),
        impact: "medium", effort: "low", confidence: 75,
        details: [
          `Current: ${lines} lines (recommended max: 30-40)`,
          "Identify logical blocks within the method",
          "Extract each block as a private method with a descriptive name",
          "Each extracted method should do one thing",
        ],
      });
    }
    return result;
  }

  private suggestInterfaceExtractions(): RefactoringSuggestion[] {
    const result: RefactoringSuggestion[] = [];

    // Find concrete classes in domain/application layer without interfaces
    for (const mod of this.model.modules) {
      if (mod.layer !== "domain" && mod.layer !== "application") continue;

      for (const uid of mod.symbols) {
        const sym = this.model.symbols.get(uid);
        if (!sym || sym.kind !== "class") continue;
        if (sym.implements && sym.implements.length > 0) continue;

        // Check if this class is depended on by other modules
        const hasExternalDeps = this.model.relations.some((r) => {
          if (r.target !== uid && r.target !== sym.name) return false;
          const srcMod = this.findModule(r.source);
          return srcMod !== mod.name;
        });

        if (hasExternalDeps) {
          result.push({
            id: `ref-${this.sugId++}`, type: "extract-interface",
            title: `Extract interface for: ${sym.name}`,
            description: `${sym.name} in ${mod.layer} layer is used by external modules without an interface`,
            targetSymbol: uid, targetFile: sym.filePath, targetModule: mod.name,
            impact: "high", effort: "low", confidence: 80,
            details: [
              `Create I${sym.name} interface in the domain layer`,
              `${sym.name} implements I${sym.name}`,
              "External modules depend on the interface, not the concrete class",
              "Enables dependency inversion and easier testing",
            ],
          });
        }
      }
    }
    return result;
  }

  private suggestLayerMoves(): RefactoringSuggestion[] {
    const result: RefactoringSuggestion[] = [];
    const layerOrder = ["presentation", "api", "application", "domain", "infrastructure"];

    for (const mod of this.model.modules) {
      const modIdx = layerOrder.indexOf(mod.layer);
      if (modIdx === -1) continue;

      for (const rel of this.model.relations) {
        if (rel.type === "composes") continue;
        const srcInMod = mod.symbols.includes(rel.source);
        if (!srcInMod) continue;

        const tgtSym = this.model.symbols.get(rel.target);
        if (!tgtSym) continue;

        for (const otherMod of this.model.modules) {
          if (otherMod.name === mod.name) continue;
          const otherIdx = layerOrder.indexOf(otherMod.layer);
          if (otherIdx === -1) continue;

          const tgtInOther = otherMod.symbols.some((uid) => this.model.symbols.get(uid)?.filePath === tgtSym.filePath);
          if (tgtInOther && modIdx > otherIdx) {
            result.push({
              id: `ref-${this.sugId++}`, type: "move-to-layer",
              title: `Fix layer violation: ${mod.name} → ${otherMod.name}`,
              description: `${mod.layer} depends on ${otherMod.layer} — violates Clean Architecture dependency rule`,
              targetFile: rel.source, targetModule: mod.name,
              impact: "high", effort: "medium", confidence: 90,
              details: [
                `${mod.name} (${mod.layer}) should not depend on ${otherMod.name} (${otherMod.layer})`,
                "Introduce an interface in the domain/application layer",
                "Move the dependency to use the interface",
                "Infrastructure implements the interface via dependency injection",
              ],
            });
            break;
          }
        }
      }
    }
    return result;
  }

  private suggestModuleSplits(): RefactoringSuggestion[] {
    const result: RefactoringSuggestion[] = [];
    for (const mod of this.model.modules) {
      if (mod.fileCount <= 30) continue;
      result.push({
        id: `ref-${this.sugId++}`, type: "split-module",
        title: `Split large module: ${mod.name}`,
        description: `${mod.name} has ${mod.fileCount} files and ${mod.lineCount.toLocaleString()} lines`,
        targetFile: "", targetModule: mod.name,
        impact: "medium", effort: "high", confidence: 70,
        details: [
          `${mod.fileCount} files is above the recommended 20-30 per module`,
          "Identify sub-domains within the module",
          "Create separate modules for each sub-domain",
          "Define clear interfaces between the new modules",
        ],
      });
    }
    return result;
  }

  private suggestCouplingReductions(): RefactoringSuggestion[] {
    const result: RefactoringSuggestion[] = [];

    // Find highly coupled module pairs
    const coupling = new Map<string, number>();
    for (const rel of this.model.relations) {
      if (rel.type === "composes") continue;
      const srcMod = this.findModule(rel.source);
      const tgtSym = this.model.symbols.get(rel.target);
      const tgtMod = tgtSym ? this.findModule(rel.target) : undefined;
      if (srcMod && tgtMod && srcMod !== tgtMod) {
        const key = [srcMod, tgtMod].sort().join("↔");
        coupling.set(key, (coupling.get(key) || 0) + 1);
      }
    }

    for (const [pair, count] of coupling) {
      if (count < 10) continue;
      const [mod1, mod2] = pair.split("↔");
      result.push({
        id: `ref-${this.sugId++}`, type: "reduce-coupling",
        title: `Reduce coupling: ${mod1} ↔ ${mod2}`,
        description: `${count} dependencies between ${mod1} and ${mod2} — consider introducing a shared interface or mediator`,
        targetFile: "", targetModule: mod1,
        impact: count > 20 ? "high" : "medium", effort: "medium", confidence: 65,
        details: [
          `${count} cross-module dependencies detected`,
          "Identify the shared contract (types, interfaces)",
          "Extract into a shared module or define in domain layer",
          "Use events/mediator pattern to decouple if appropriate",
        ],
      });
    }
    return result;
  }

  private findModule(uidOrPath: string): string {
    for (const mod of this.model.modules) {
      if (mod.symbols.includes(uidOrPath)) return mod.name;
      const sym = this.model.symbols.get(uidOrPath);
      if (sym) {
        for (const mUid of mod.symbols) {
          const mSym = this.model.symbols.get(mUid);
          if (mSym && mSym.filePath === sym.filePath) return mod.name;
        }
      }
    }
    return "unknown";
  }
}
