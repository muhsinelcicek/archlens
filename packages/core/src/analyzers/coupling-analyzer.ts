import type { ArchitectureModel, Symbol, Module } from "../models/index.js";

export interface SymbolCoupling {
  sourceUid: string;
  sourceName: string;
  targetUid: string;
  targetName: string;
  type: "concrete" | "abstract" | "data";
  relationType: string;
}

export interface ModuleCouplingDetail {
  moduleName: string;
  layer: string;
  afferentCoupling: number; // Ca — who depends on me (incoming)
  efferentCoupling: number; // Ce — what I depend on (outgoing)
  instability: number; // I = Ce / (Ca + Ce) — 0=stable, 1=unstable
  abstractness: number; // A = abstract symbols / total symbols
  distanceFromMainSeq: number; // D = |A + I - 1| — 0=ideal
  concreteDeps: number; // direct class dependencies (bad)
  abstractDeps: number; // interface dependencies (good)
  couplingRatio: number; // abstractDeps / (concreteDeps + abstractDeps) — higher=better
  topDependencies: Array<{ target: string; count: number; type: "concrete" | "abstract" }>;
  topDependents: Array<{ source: string; count: number }>;
}

export interface CircularDependency {
  level: "file" | "module";
  cycle: string[];
  severity: "critical" | "major" | "minor";
  description: string;
}

export interface CouplingReport {
  modules: ModuleCouplingDetail[];
  circularDependencies: CircularDependency[];
  symbolCouplings: SymbolCoupling[];
  overallHealth: {
    avgInstability: number;
    avgAbstractness: number;
    avgDistance: number;
    concreteRatio: number;
    circularCount: number;
  };
}

export class CouplingAnalyzer {
  constructor(private model: ArchitectureModel) {}

  analyze(): CouplingReport {
    const moduleCouplings = this.analyzeModuleCoupling();
    const circularDeps = this.detectCircularDependencies();
    const symbolCouplings = this.analyzeSymbolCoupling();

    const avgI = moduleCouplings.length > 0 ? moduleCouplings.reduce((a, m) => a + m.instability, 0) / moduleCouplings.length : 0;
    const avgA = moduleCouplings.length > 0 ? moduleCouplings.reduce((a, m) => a + m.abstractness, 0) / moduleCouplings.length : 0;
    const avgD = moduleCouplings.length > 0 ? moduleCouplings.reduce((a, m) => a + m.distanceFromMainSeq, 0) / moduleCouplings.length : 0;
    const totalConcrete = moduleCouplings.reduce((a, m) => a + m.concreteDeps, 0);
    const totalAbstract = moduleCouplings.reduce((a, m) => a + m.abstractDeps, 0);

    return {
      modules: moduleCouplings,
      circularDependencies: circularDeps,
      symbolCouplings: symbolCouplings.slice(0, 100),
      overallHealth: {
        avgInstability: Math.round(avgI * 100) / 100,
        avgAbstractness: Math.round(avgA * 100) / 100,
        avgDistance: Math.round(avgD * 100) / 100,
        concreteRatio: totalConcrete + totalAbstract > 0 ? Math.round((totalConcrete / (totalConcrete + totalAbstract)) * 100) : 0,
        circularCount: circularDeps.length,
      },
    };
  }

  private analyzeModuleCoupling(): ModuleCouplingDetail[] {
    const results: ModuleCouplingDetail[] = [];

    // Build uid→module map
    const u2m = new Map<string, string>();
    const f2m = new Map<string, string>();
    for (const mod of this.model.modules) {
      for (const uid of mod.symbols) {
        u2m.set(uid, mod.name);
        const sym = this.model.symbols.get(uid);
        if (sym) f2m.set(sym.filePath, mod.name);
      }
    }

    for (const mod of this.model.modules) {
      let ca = 0, ce = 0;
      let concreteDeps = 0, abstractDeps = 0;
      const depTargets = new Map<string, { count: number; type: "concrete" | "abstract" }>();
      const depSources = new Map<string, number>();

      for (const rel of this.model.relations) {
        if (rel.type === "composes") continue;

        const srcMod = u2m.get(rel.source) || f2m.get(rel.source);
        const tgtSym = this.model.symbols.get(rel.target);
        let tgtMod: string | undefined;
        if (tgtSym) tgtMod = u2m.get(rel.target) || f2m.get(tgtSym.filePath);
        if (!tgtMod && typeof rel.target === "string") {
          for (const [uid, s] of this.model.symbols) {
            if (s.name === rel.target) { tgtMod = u2m.get(uid) || f2m.get(s.filePath); break; }
          }
        }
        if (!srcMod || !tgtMod || srcMod === tgtMod) continue;

        if (srcMod === mod.name) {
          ce++;
          const isAbstract = tgtSym?.kind === "interface" || rel.type === "implements";
          if (isAbstract) abstractDeps++; else concreteDeps++;
          const key = tgtMod;
          const existing = depTargets.get(key);
          if (existing) existing.count++; else depTargets.set(key, { count: 1, type: isAbstract ? "abstract" : "concrete" });
        }
        if (tgtMod === mod.name) {
          ca++;
          depSources.set(srcMod, (depSources.get(srcMod) || 0) + 1);
        }
      }

      // Abstractness
      const totalSymbols = mod.symbols.length;
      const abstractSymbols = mod.symbols.filter((uid) => {
        const s = this.model.symbols.get(uid);
        return s && (s.kind === "interface" || s.extends?.length || s.implements?.length);
      }).length;
      const abstractness = totalSymbols > 0 ? abstractSymbols / totalSymbols : 0;

      const instability = ca + ce > 0 ? ce / (ca + ce) : 0;
      const distance = Math.abs(abstractness + instability - 1);
      const couplingRatio = concreteDeps + abstractDeps > 0 ? abstractDeps / (concreteDeps + abstractDeps) : 1;

      results.push({
        moduleName: mod.name,
        layer: mod.layer,
        afferentCoupling: ca,
        efferentCoupling: ce,
        instability: Math.round(instability * 100) / 100,
        abstractness: Math.round(abstractness * 100) / 100,
        distanceFromMainSeq: Math.round(distance * 100) / 100,
        concreteDeps,
        abstractDeps,
        couplingRatio: Math.round(couplingRatio * 100) / 100,
        topDependencies: [...depTargets.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 5).map(([target, d]) => ({ target, count: d.count, type: d.type })),
        topDependents: [...depSources.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([source, count]) => ({ source, count })),
      });
    }

    return results.sort((a, b) => b.efferentCoupling - a.efferentCoupling);
  }

  private detectCircularDependencies(): CircularDependency[] {
    const circulars: CircularDependency[] = [];

    // Module-level cycles
    const moduleDeps = new Map<string, Set<string>>();
    const u2m = new Map<string, string>();
    const f2m = new Map<string, string>();
    for (const mod of this.model.modules) {
      for (const uid of mod.symbols) {
        u2m.set(uid, mod.name);
        const s = this.model.symbols.get(uid);
        if (s) f2m.set(s.filePath, mod.name);
      }
    }

    for (const rel of this.model.relations) {
      if (rel.type === "composes") continue;
      const srcMod = u2m.get(rel.source) || f2m.get(rel.source);
      const tgtSym = this.model.symbols.get(rel.target);
      const tgtMod = tgtSym ? (u2m.get(rel.target) || f2m.get(tgtSym.filePath)) : undefined;
      if (srcMod && tgtMod && srcMod !== tgtMod) {
        if (!moduleDeps.has(srcMod)) moduleDeps.set(srcMod, new Set());
        moduleDeps.get(srcMod)!.add(tgtMod);
      }
    }

    // Detect 2-node cycles
    const seen = new Set<string>();
    for (const [a, depsA] of moduleDeps) {
      for (const b of depsA) {
        if (moduleDeps.get(b)?.has(a)) {
          const key = [a, b].sort().join("↔");
          if (!seen.has(key)) {
            seen.add(key);
            circulars.push({
              level: "module",
              cycle: [a, b],
              severity: "major",
              description: `${a} and ${b} depend on each other — creates tight coupling`,
            });
          }
        }
      }
    }

    // File-level cycles
    const fileDeps = new Map<string, Set<string>>();
    for (const rel of this.model.relations) {
      if (rel.type !== "imports") continue;
      const tgtSym = this.model.symbols.get(rel.target);
      if (tgtSym && rel.source !== tgtSym.filePath) {
        if (!fileDeps.has(rel.source)) fileDeps.set(rel.source, new Set());
        fileDeps.get(rel.source)!.add(tgtSym.filePath);
      }
    }

    const fileSeen = new Set<string>();
    for (const [a, depsA] of fileDeps) {
      for (const b of depsA) {
        if (fileDeps.get(b)?.has(a)) {
          const key = [a, b].sort().join("↔");
          if (!fileSeen.has(key)) {
            fileSeen.add(key);
            circulars.push({
              level: "file",
              cycle: [a, b],
              severity: "minor",
              description: `Circular import: ${a.split("/").pop()} ↔ ${b.split("/").pop()}`,
            });
          }
        }
      }
    }

    return circulars;
  }

  private analyzeSymbolCoupling(): SymbolCoupling[] {
    const couplings: SymbolCoupling[] = [];

    for (const rel of this.model.relations) {
      if (rel.type === "composes") continue;
      const srcSym = this.model.symbols.get(rel.source);
      const tgtSym = this.model.symbols.get(rel.target);
      if (!srcSym || !tgtSym) continue;

      const isAbstract = tgtSym.kind === "interface" || rel.type === "implements";
      couplings.push({
        sourceUid: rel.source,
        sourceName: srcSym.name,
        targetUid: rel.target,
        targetName: tgtSym.name,
        type: isAbstract ? "abstract" : rel.type === "extends" ? "concrete" : "data",
        relationType: rel.type,
      });
    }

    return couplings;
  }
}
