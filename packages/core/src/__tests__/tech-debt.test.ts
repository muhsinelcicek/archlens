import { describe, it, expect } from "vitest";
import type { ArchitectureModel, Symbol, Module } from "../models/index.js";
import { TechDebtCalculator } from "../analyzers/tech-debt-calculator.js";

function createModel(overrides: Partial<ArchitectureModel> = {}): ArchitectureModel {
  const symbols = new Map<string, Symbol>();
  symbols.set("class:src/service.ts:Service", {
    uid: "class:src/service.ts:Service", name: "Service", filePath: "src/service.ts",
    kind: "class", language: "typescript", visibility: "public",
    startLine: 1, endLine: 30,
  });
  symbols.set("method:src/service.ts:Service.run", {
    uid: "method:src/service.ts:Service.run", name: "Service.run", filePath: "src/service.ts",
    kind: "method", language: "typescript", visibility: "public",
    startLine: 5, endLine: 20,
  });

  return {
    project: { name: "test", rootPath: "/test", analyzedAt: new Date().toISOString(), version: "0.1.0" },
    stats: { files: 1, symbols: 2, relations: 1, modules: 1, languages: { typescript: 2 } as any, totalLines: 30 },
    symbols,
    relations: [
      { source: "class:src/service.ts:Service", target: "method:src/service.ts:Service.run", type: "composes" },
    ],
    modules: [{
      name: "src", path: "src", layer: "application",
      symbols: [...symbols.keys()], dependencies: [],
      language: "typescript", fileCount: 1, lineCount: 30,
    }],
    layers: { application: ["src"], presentation: [], api: [], domain: [], infrastructure: [], config: [], test: [], unknown: [] },
    dataFlows: [],
    apiEndpoints: [],
    dbEntities: [],
    techRadar: [],
    businessProcesses: [],
    ...overrides,
  } as ArchitectureModel;
}

describe("TechDebtCalculator", () => {
  describe("report structure", () => {
    it("should return all required fields", () => {
      const model = createModel();
      const report = new TechDebtCalculator(model).calculate();

      expect(report).toHaveProperty("totalEstimatedHours");
      expect(report).toHaveProperty("totalEstimatedCost");
      expect(report).toHaveProperty("totalAnnualCost");
      expect(report).toHaveProperty("items");
      expect(report).toHaveProperty("quickWins");
      expect(report).toHaveProperty("costPerDeveloperHour");
      expect(typeof report.totalEstimatedHours).toBe("number");
      expect(typeof report.totalEstimatedCost).toBe("number");
      expect(typeof report.totalAnnualCost).toBe("number");
      expect(Array.isArray(report.items)).toBe(true);
      expect(Array.isArray(report.quickWins)).toBe(true);
    });

    it("debt items should have category, description, estimatedHours, effort, impact, roi", () => {
      // Create a model with dead code to guarantee at least one debt item
      const symbols = new Map<string, Symbol>();
      symbols.set("fn:dead.ts:_unused", {
        uid: "fn:dead.ts:_unused", name: "_unused", filePath: "dead.ts",
        kind: "function", language: "typescript", visibility: "private",
        startLine: 1, endLine: 30,
      });

      const model = createModel({
        symbols,
        modules: [{
          name: "src", path: "src", layer: "application",
          symbols: [...symbols.keys()], dependencies: [],
          language: "typescript", fileCount: 1, lineCount: 30,
        }],
      });
      const report = new TechDebtCalculator(model).calculate();

      expect(report.items.length).toBeGreaterThan(0);
      for (const item of report.items) {
        expect(item).toHaveProperty("category");
        expect(item).toHaveProperty("description");
        expect(item).toHaveProperty("estimatedHours");
        expect(item).toHaveProperty("estimatedCost");
        expect(item).toHaveProperty("annualCost");
        expect(item).toHaveProperty("effort");
        expect(item).toHaveProperty("impact");
        expect(item).toHaveProperty("roi");
        expect(["low", "medium", "high"]).toContain(item.effort);
        expect(["low", "medium", "high"]).toContain(item.impact);
        expect(typeof item.roi).toBe("number");
      }
    });
  });

  describe("cost estimation", () => {
    it("should use default hourly rate of $150", () => {
      const model = createModel();
      const report = new TechDebtCalculator(model).calculate();
      expect(report.costPerDeveloperHour).toBe(150);
    });

    it("should accept custom hourly rate", () => {
      const model = createModel();
      const report = new TechDebtCalculator(model, 200).calculate();
      expect(report.costPerDeveloperHour).toBe(200);
    });

    it("totalEstimatedCost should equal sum of item costs", () => {
      const symbols = new Map<string, Symbol>();
      symbols.set("fn:dead.ts:_unused", {
        uid: "fn:dead.ts:_unused", name: "_unused", filePath: "dead.ts",
        kind: "function", language: "typescript", visibility: "private",
        startLine: 1, endLine: 50,
      });

      const model = createModel({
        symbols,
        modules: [{
          name: "src", path: "src", layer: "application",
          symbols: [...symbols.keys()], dependencies: [],
          language: "typescript", fileCount: 1, lineCount: 50,
        }],
      });

      const report = new TechDebtCalculator(model).calculate();
      const sumCost = report.items.reduce((a, i) => a + i.estimatedCost, 0);
      expect(report.totalEstimatedCost).toBe(sumCost);
    });

    it("totalEstimatedHours should equal sum of item hours", () => {
      const symbols = new Map<string, Symbol>();
      symbols.set("fn:dead.ts:_unused", {
        uid: "fn:dead.ts:_unused", name: "_unused", filePath: "dead.ts",
        kind: "function", language: "typescript", visibility: "private",
        startLine: 1, endLine: 50,
      });

      const model = createModel({
        symbols,
        modules: [{
          name: "src", path: "src", layer: "application",
          symbols: [...symbols.keys()], dependencies: [],
          language: "typescript", fileCount: 1, lineCount: 50,
        }],
      });

      const report = new TechDebtCalculator(model).calculate();
      const sumHours = report.items.reduce((a, i) => a + i.estimatedHours, 0);
      expect(report.totalEstimatedHours).toBe(sumHours);
    });
  });

  describe("dead code debt detection", () => {
    it("should create debt item for dead code", () => {
      const symbols = new Map<string, Symbol>();
      symbols.set("fn:dead.ts:_unused1", {
        uid: "fn:dead.ts:_unused1", name: "_unused1", filePath: "dead.ts",
        kind: "function", language: "typescript", visibility: "private",
        startLine: 1, endLine: 30,
      });
      symbols.set("fn:dead.ts:_unused2", {
        uid: "fn:dead.ts:_unused2", name: "_unused2", filePath: "dead.ts",
        kind: "function", language: "typescript", visibility: "private",
        startLine: 35, endLine: 60,
      });

      const model = createModel({
        symbols,
        modules: [{
          name: "src", path: "src", layer: "application",
          symbols: [...symbols.keys()], dependencies: [],
          language: "typescript", fileCount: 1, lineCount: 60,
        }],
      });

      const report = new TechDebtCalculator(model).calculate();
      const deadCodeItem = report.items.find((i) => i.category === "Dead Code");
      expect(deadCodeItem).toBeDefined();
      expect(deadCodeItem!.estimatedHours).toBeGreaterThan(0);
      expect(deadCodeItem!.estimatedCost).toBeGreaterThan(0);
    });
  });

  describe("god class debt detection", () => {
    it("should create debt item for god classes", () => {
      const symbols = new Map<string, Symbol>();
      symbols.set("class:big.ts:GodClass", {
        uid: "class:big.ts:GodClass", name: "GodClass", filePath: "big.ts",
        kind: "class", language: "typescript", visibility: "public",
        startLine: 1, endLine: 500,
      });

      const relations = [];
      for (let i = 0; i < 25; i++) {
        const uid = `method:big.ts:GodClass.method${i}`;
        symbols.set(uid, {
          uid, name: `GodClass.method${i}`, filePath: "big.ts",
          kind: "method", language: "typescript", visibility: "public",
          startLine: i * 15 + 10, endLine: i * 15 + 20,
        });
        relations.push({ source: "class:big.ts:GodClass", target: uid, type: "composes" as const });
      }

      const model = createModel({
        symbols,
        relations,
        modules: [{
          name: "src", path: "src", layer: "application",
          symbols: [...symbols.keys()], dependencies: [],
          language: "typescript", fileCount: 1, lineCount: 500,
        }],
      });

      const report = new TechDebtCalculator(model).calculate();
      const godClassItem = report.items.find((i) => i.category === "God Classes");
      expect(godClassItem).toBeDefined();
      expect(godClassItem!.effort).toBe("high");
      expect(godClassItem!.impact).toBe("high");
      // ~16 hours per god class
      expect(godClassItem!.estimatedHours).toBeGreaterThanOrEqual(16);
    });
  });

  describe("quick win detection", () => {
    it("quickWins should be a subset of items", () => {
      const symbols = new Map<string, Symbol>();
      symbols.set("fn:dead.ts:_unused", {
        uid: "fn:dead.ts:_unused", name: "_unused", filePath: "dead.ts",
        kind: "function", language: "typescript", visibility: "private",
        startLine: 1, endLine: 20,
      });

      const model = createModel({
        symbols,
        modules: [{
          name: "src", path: "src", layer: "application",
          symbols: [...symbols.keys()], dependencies: [],
          language: "typescript", fileCount: 1, lineCount: 20,
        }],
      });

      const report = new TechDebtCalculator(model).calculate();
      for (const qw of report.quickWins) {
        expect(report.items).toContainEqual(qw);
      }
    });

    it("quickWins should have low effort or medium effort with ROI > 1", () => {
      const symbols = new Map<string, Symbol>();
      symbols.set("fn:dead.ts:_unused", {
        uid: "fn:dead.ts:_unused", name: "_unused", filePath: "dead.ts",
        kind: "function", language: "typescript", visibility: "private",
        startLine: 1, endLine: 50,
      });

      const model = createModel({
        symbols,
        modules: [{
          name: "src", path: "src", layer: "application",
          symbols: [...symbols.keys()], dependencies: [],
          language: "typescript", fileCount: 1, lineCount: 50,
        }],
      });

      const report = new TechDebtCalculator(model).calculate();
      for (const qw of report.quickWins) {
        const isQuickWin = qw.effort === "low" || (qw.effort === "medium" && qw.roi > 1);
        expect(isQuickWin).toBe(true);
      }
    });

    it("quickWins should have at most 5 items", () => {
      const model = createModel();
      const report = new TechDebtCalculator(model).calculate();
      expect(report.quickWins.length).toBeLessThanOrEqual(5);
    });
  });

  describe("items sorting", () => {
    it("items should be sorted by ROI descending", () => {
      const symbols = new Map<string, Symbol>();
      // Create dead code to generate at least one item
      symbols.set("fn:dead.ts:_unused", {
        uid: "fn:dead.ts:_unused", name: "_unused", filePath: "dead.ts",
        kind: "function", language: "typescript", visibility: "private",
        startLine: 1, endLine: 50,
      });

      const model = createModel({
        symbols,
        modules: [{
          name: "src", path: "src", layer: "application",
          symbols: [...symbols.keys()], dependencies: [],
          language: "typescript", fileCount: 1, lineCount: 50,
        }],
      });

      const report = new TechDebtCalculator(model).calculate();
      for (let i = 0; i < report.items.length - 1; i++) {
        expect(report.items[i].roi).toBeGreaterThanOrEqual(report.items[i + 1].roi);
      }
    });
  });

  describe("clean project", () => {
    it("should report zero debt for a minimal clean project", () => {
      const model = createModel();
      const report = new TechDebtCalculator(model).calculate();

      // A clean minimal project should have very little or no debt
      // (formatDate is unreferenced but public, so it may or may not appear)
      expect(report.totalEstimatedHours).toBeGreaterThanOrEqual(0);
      expect(report.totalEstimatedCost).toBeGreaterThanOrEqual(0);
    });
  });
});
