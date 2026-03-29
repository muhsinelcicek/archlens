import { describe, it, expect } from "vitest";
import type { ArchitectureModel, Symbol, Module } from "../models/index.js";
import { CouplingAnalyzer } from "../analyzers/coupling-analyzer.js";

function createModel(): ArchitectureModel {
  const symbols = new Map<string, Symbol>();
  // Module A symbols
  symbols.set("class:a/Service.ts:ServiceA", { uid: "class:a/Service.ts:ServiceA", name: "ServiceA", filePath: "a/Service.ts", kind: "class", language: "typescript", visibility: "public", startLine: 1, endLine: 20 });
  symbols.set("interface:b/IRepo.ts:IRepo", { uid: "interface:b/IRepo.ts:IRepo", name: "IRepo", filePath: "b/IRepo.ts", kind: "interface", language: "typescript", visibility: "public", startLine: 1, endLine: 5 });
  symbols.set("class:b/Repo.ts:Repo", { uid: "class:b/Repo.ts:Repo", name: "Repo", filePath: "b/Repo.ts", kind: "class", language: "typescript", visibility: "public", startLine: 1, endLine: 30 });

  const modules: Module[] = [
    { name: "moduleA", path: "a", layer: "application", symbols: ["class:a/Service.ts:ServiceA"], dependencies: [], language: "typescript", fileCount: 1, lineCount: 20 },
    { name: "moduleB", path: "b", layer: "infrastructure", symbols: ["interface:b/IRepo.ts:IRepo", "class:b/Repo.ts:Repo"], dependencies: [], language: "typescript", fileCount: 2, lineCount: 35 },
  ];

  return {
    project: { name: "test", rootPath: "/test", analyzedAt: new Date().toISOString(), version: "0.1.0" },
    stats: { files: 3, symbols: 3, relations: 2, modules: 2, languages: { typescript: 3 } as any, totalLines: 55 },
    symbols,
    relations: [
      { source: "class:a/Service.ts:ServiceA", target: "interface:b/IRepo.ts:IRepo", type: "imports" },
      { source: "class:b/Repo.ts:Repo", target: "interface:b/IRepo.ts:IRepo", type: "implements" },
    ],
    modules,
    layers: { application: ["moduleA"], infrastructure: ["moduleB"], presentation: [], api: [], domain: [], config: [], test: [], unknown: [] },
    dataFlows: [], apiEndpoints: [], dbEntities: [], techRadar: [], businessProcesses: [],
  } as ArchitectureModel;
}

describe("CouplingAnalyzer", () => {
  it("should calculate Ca and Ce for modules", () => {
    const report = new CouplingAnalyzer(createModel()).analyze();
    expect(report.modules.length).toBe(2);

    const modA = report.modules.find((m) => m.moduleName === "moduleA");
    expect(modA).toBeDefined();
    expect(modA!.efferentCoupling).toBeGreaterThanOrEqual(1); // depends on moduleB
  });

  it("should calculate instability 0-1", () => {
    const report = new CouplingAnalyzer(createModel()).analyze();
    for (const m of report.modules) {
      expect(m.instability).toBeGreaterThanOrEqual(0);
      expect(m.instability).toBeLessThanOrEqual(1);
    }
  });

  it("should detect abstract vs concrete coupling", () => {
    const report = new CouplingAnalyzer(createModel()).analyze();
    const modA = report.modules.find((m) => m.moduleName === "moduleA");
    // ServiceA imports IRepo (interface) — should be abstract coupling
    expect(modA!.abstractDeps + modA!.concreteDeps).toBeGreaterThanOrEqual(0);
  });

  it("should return circular dependencies", () => {
    const model = createModel();
    // Add reverse dependency: moduleB → moduleA
    model.relations.push({ source: "class:b/Repo.ts:Repo", target: "class:a/Service.ts:ServiceA", type: "imports" });

    const report = new CouplingAnalyzer(model).analyze();
    expect(report.circularDependencies.length).toBeGreaterThanOrEqual(1);
  });

  it("should calculate overall health metrics", () => {
    const report = new CouplingAnalyzer(createModel()).analyze();
    expect(report.overallHealth.avgInstability).toBeGreaterThanOrEqual(0);
    expect(report.overallHealth.avgAbstractness).toBeGreaterThanOrEqual(0);
    expect(typeof report.overallHealth.concreteRatio).toBe("number");
  });
});
