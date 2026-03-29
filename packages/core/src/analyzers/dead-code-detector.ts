import type { ArchitectureModel, Symbol } from "../models/index.js";

export interface DeadCodeItem {
  uid: string;
  name: string;
  kind: string;
  filePath: string;
  line: number;
  reason: string;
  confidence: "high" | "medium" | "low";
}

export interface DeadCodeReport {
  totalDead: number;
  totalSymbols: number;
  deadPercentage: number;
  items: DeadCodeItem[];
  byModule: Array<{ module: string; count: number; items: DeadCodeItem[] }>;
  estimatedCleanupLines: number;
}

/**
 * DeadCodeDetector — finds symbols that are never referenced by other code.
 * Uses the relation graph to determine what's connected.
 */
export class DeadCodeDetector {
  constructor(private model: ArchitectureModel) {}

  detect(): DeadCodeReport {
    const items: DeadCodeItem[] = [];

    // Build "who references me" map
    const referencedBy = new Map<string, Set<string>>();
    for (const rel of this.model.relations) {
      if (rel.type === "composes") continue; // Class→method is structural, not a "call"
      if (!referencedBy.has(rel.target)) referencedBy.set(rel.target, new Set());
      referencedBy.get(rel.target)!.add(rel.source);
    }

    // Check each symbol
    for (const [uid, sym] of this.model.symbols) {
      // Skip entry points (they're not called by other code)
      if (this.isEntryPoint(sym)) continue;
      // Skip private/internal helpers that might be called dynamically
      if (sym.kind === "property") continue;
      // Skip constructors
      if (sym.name.includes("__init__") || sym.name.includes("constructor")) continue;

      const refs = referencedBy.get(uid);
      const isReferenced = refs && refs.size > 0;

      // Also check if symbol name appears in any relation target (bare name match)
      const nameReferenced = this.model.relations.some((r) =>
        r.target === sym.name || r.target.endsWith(`.${sym.name.split(".").pop()}`),
      );

      if (!isReferenced && !nameReferenced) {
        let confidence: DeadCodeItem["confidence"] = "medium";
        let reason = "No references found in the codebase";

        // High confidence: exported function/class with no callers
        if (sym.visibility === "public" && (sym.kind === "function" || sym.kind === "class")) {
          confidence = "medium"; // Could be used externally
          reason = "Public symbol with no internal references — may be used externally";
        }

        // High confidence: private/protected with no callers
        if (sym.visibility === "private" || sym.visibility === "protected") {
          confidence = "high";
          reason = "Private symbol with no references — likely dead code";
        }

        // Methods: check if parent class is referenced
        if (sym.kind === "method") {
          const className = sym.name.split(".")[0];
          const classUid = `class:${sym.filePath}:${className}`;
          const classRefs = referencedBy.get(classUid);
          if (classRefs && classRefs.size > 0) {
            confidence = "low"; // Class is used, method might be called via instance
            reason = "Method on a referenced class — may be called dynamically";
          } else {
            confidence = "medium";
            reason = "Method on an unreferenced class";
          }
        }

        items.push({
          uid,
          name: sym.name,
          kind: sym.kind,
          filePath: sym.filePath,
          line: sym.startLine || 0,
          reason,
          confidence,
        });
      }
    }

    // Group by module
    const byModule = new Map<string, DeadCodeItem[]>();
    for (const item of items) {
      let modName = "unknown";
      for (const mod of this.model.modules) {
        if (mod.symbols.includes(item.uid)) { modName = mod.name; break; }
      }
      if (!byModule.has(modName)) byModule.set(modName, []);
      byModule.get(modName)!.push(item);
    }

    const estimatedLines = items.reduce((sum, item) => {
      const sym = this.model.symbols.get(item.uid);
      return sum + ((sym?.endLine || 0) - (sym?.startLine || 0));
    }, 0);

    return {
      totalDead: items.length,
      totalSymbols: this.model.symbols.size,
      deadPercentage: Math.round((items.length / Math.max(this.model.symbols.size, 1)) * 100),
      items: items.sort((a, b) => confidenceWeight(b.confidence) - confidenceWeight(a.confidence)),
      byModule: [...byModule.entries()].map(([module, items]) => ({ module, count: items.length, items })).sort((a, b) => b.count - a.count),
      estimatedCleanupLines: estimatedLines,
    };
  }

  private isEntryPoint(sym: Symbol): boolean {
    // Main functions, app entry points, test functions
    const name = sym.name.toLowerCase();
    if (name === "main" || name === "app" || name.includes("program")) return true;
    if (sym.annotations?.some((a) => a.includes("@app.") || a.includes("@router.") || a.includes("@Test") || a.includes("@HttpGet") || a.includes("@HttpPost"))) return true;
    // React components (PascalCase functions in tsx)
    if (sym.filePath.endsWith(".tsx") && sym.kind === "function" && /^[A-Z]/.test(sym.name)) return true;
    // API handlers
    if (sym.annotations?.some((a) => /Controller|Route|Endpoint|Handler/.test(a))) return true;
    return false;
  }
}

function confidenceWeight(c: DeadCodeItem["confidence"]): number {
  return c === "high" ? 3 : c === "medium" ? 2 : 1;
}
