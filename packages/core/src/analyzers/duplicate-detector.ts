import type { ArchitectureModel, Symbol } from "../models/index.js";

export interface DuplicateGroup {
  signature: string;
  symbols: Array<{ uid: string; name: string; filePath: string; line: number; lines: number }>;
  similarity: number; // 0-100
  reason: string;
}

export interface DuplicateReport {
  totalGroups: number;
  totalDuplicateSymbols: number;
  estimatedDuplicateLines: number;
  groups: DuplicateGroup[];
}

/**
 * DuplicateDetector — finds similar/duplicate code patterns.
 * Uses structural similarity: same kind + similar params + similar size.
 */
export class DuplicateDetector {
  constructor(private model: ArchitectureModel) {}

  detect(): DuplicateReport {
    const groups: DuplicateGroup[] = [];

    // Group symbols by structural signature
    const signatureMap = new Map<string, Array<{ uid: string; sym: Symbol }>>();

    for (const [uid, sym] of this.model.symbols) {
      if (sym.kind !== "function" && sym.kind !== "method") continue;
      const lines = (sym.endLine || 0) - (sym.startLine || 0);
      if (lines < 5) continue; // Skip tiny functions

      const sig = this.buildSignature(sym);
      if (!signatureMap.has(sig)) signatureMap.set(sig, []);
      signatureMap.get(sig)!.push({ uid, sym });
    }

    // Find groups with 2+ members
    for (const [sig, members] of signatureMap) {
      if (members.length < 2) continue;

      // Skip if all in same file (overloads)
      const files = new Set(members.map((m) => m.sym.filePath));
      if (files.size < 2 && members.length < 3) continue;

      const similarity = this.calculateSimilarity(members.map((m) => m.sym));
      if (similarity < 60) continue;

      groups.push({
        signature: sig,
        symbols: members.map((m) => ({
          uid: m.uid,
          name: m.sym.name,
          filePath: m.sym.filePath,
          line: m.sym.startLine || 0,
          lines: (m.sym.endLine || 0) - (m.sym.startLine || 0),
        })),
        similarity,
        reason: this.describeReason(members.map((m) => m.sym), similarity),
      });
    }

    // Also detect similar class structures
    groups.push(...this.detectSimilarClasses());

    groups.sort((a, b) => b.similarity - a.similarity);

    const totalDupSymbols = groups.reduce((a, g) => a + g.symbols.length, 0);
    const estLines = groups.reduce((a, g) => a + g.symbols.reduce((s, sym) => s + sym.lines, 0), 0);

    return {
      totalGroups: groups.length,
      totalDuplicateSymbols: totalDupSymbols,
      estimatedDuplicateLines: estLines,
      groups: groups.slice(0, 50),
    };
  }

  private buildSignature(sym: Symbol): string {
    const paramCount = sym.params?.length || 0;
    const paramTypes = sym.params?.map((p) => p.type || "?").join(",") || "";
    const lines = (sym.endLine || 0) - (sym.startLine || 0);
    const sizeBucket = lines < 10 ? "S" : lines < 30 ? "M" : lines < 60 ? "L" : "XL";
    const baseName = sym.name.split(".").pop()?.replace(/^(get|set|handle|on|create|update|delete|find|fetch|load)/, "") || "";
    return `${sym.kind}:${paramCount}:${paramTypes}:${sizeBucket}:${sym.returnType || "?"}`;
  }

  private calculateSimilarity(syms: Symbol[]): number {
    if (syms.length < 2) return 0;
    const first = syms[0];
    let totalSim = 0;

    for (let i = 1; i < syms.length; i++) {
      let sim = 0;
      // Same kind
      if (first.kind === syms[i].kind) sim += 20;
      // Same param count
      if ((first.params?.length || 0) === (syms[i].params?.length || 0)) sim += 20;
      // Same return type
      if (first.returnType === syms[i].returnType) sim += 15;
      // Similar size (within 30%)
      const l1 = (first.endLine || 0) - (first.startLine || 0);
      const l2 = (syms[i].endLine || 0) - (syms[i].startLine || 0);
      if (l1 > 0 && l2 > 0 && Math.abs(l1 - l2) / Math.max(l1, l2) < 0.3) sim += 25;
      // Same param types
      const pt1 = first.params?.map((p) => p.type).join(",") || "";
      const pt2 = syms[i].params?.map((p) => p.type).join(",") || "";
      if (pt1 === pt2 && pt1.length > 0) sim += 20;

      totalSim += sim;
    }

    return Math.round(totalSim / (syms.length - 1));
  }

  private describeReason(syms: Symbol[], similarity: number): string {
    const lines = syms.map((s) => (s.endLine || 0) - (s.startLine || 0));
    const avgLines = Math.round(lines.reduce((a, b) => a + b, 0) / lines.length);
    if (similarity >= 90) return `Nearly identical: same structure, params, return type (~${avgLines} lines each)`;
    if (similarity >= 75) return `Very similar: same kind and parameter signature (~${avgLines} lines each)`;
    return `Structurally similar: same pattern, consider extracting shared logic (~${avgLines} lines each)`;
  }

  private detectSimilarClasses(): DuplicateGroup[] {
    const groups: DuplicateGroup[] = [];
    const classes: Array<{ uid: string; sym: Symbol; methodCount: number }> = [];

    for (const [uid, sym] of this.model.symbols) {
      if (sym.kind !== "class") continue;
      const methods = this.model.relations.filter((r) => r.source === uid && r.type === "composes").length;
      classes.push({ uid, sym, methodCount: methods });
    }

    // Find classes with very similar method counts and sizes
    for (let i = 0; i < classes.length; i++) {
      for (let j = i + 1; j < classes.length; j++) {
        const a = classes[i], b = classes[j];
        if (a.sym.filePath === b.sym.filePath) continue;

        const sameMethodCount = a.methodCount === b.methodCount && a.methodCount > 3;
        const sameSize = Math.abs(
          ((a.sym.endLine || 0) - (a.sym.startLine || 0)) -
          ((b.sym.endLine || 0) - (b.sym.startLine || 0))
        ) < 20;
        const sameInheritance = JSON.stringify(a.sym.extends) === JSON.stringify(b.sym.extends) && a.sym.extends?.length;

        if ((sameMethodCount && sameSize) || sameInheritance) {
          groups.push({
            signature: `class:${a.methodCount}methods`,
            symbols: [
              { uid: a.uid, name: a.sym.name, filePath: a.sym.filePath, line: a.sym.startLine || 0, lines: (a.sym.endLine || 0) - (a.sym.startLine || 0) },
              { uid: b.uid, name: b.sym.name, filePath: b.sym.filePath, line: b.sym.startLine || 0, lines: (b.sym.endLine || 0) - (b.sym.startLine || 0) },
            ],
            similarity: sameInheritance ? 85 : 70,
            reason: sameInheritance
              ? `Both extend ${a.sym.extends?.join(",")} with ${a.methodCount} methods — possible duplication`
              : `Similar structure: ${a.methodCount} methods, similar size — consider shared base class`,
          });
        }
      }
    }

    return groups;
  }
}
