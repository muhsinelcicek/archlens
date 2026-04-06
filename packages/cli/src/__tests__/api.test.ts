import { describe, it, expect } from "vitest";
import type { ArchitectureModel, Symbol, Module } from "@archlens/core";
import {
  QualityAnalyzer,
  DeadCodeDetector,
  SecurityScanner,
  CouplingAnalyzer,
  EventFlowDetector,
  TechDebtCalculator,
  ConsistencyChecker,
} from "@archlens/core";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ─── Shared fixture builder ─────────────────────────────────────────

function createFixtureModel(overrides: Partial<ArchitectureModel> = {}): ArchitectureModel {
  const symbols = new Map<string, Symbol>();

  symbols.set("class:src/service.ts:UserService", {
    uid: "class:src/service.ts:UserService", name: "UserService", filePath: "src/service.ts",
    kind: "class", language: "typescript", visibility: "public",
    startLine: 1, endLine: 40,
  });
  symbols.set("method:src/service.ts:UserService.getUsers", {
    uid: "method:src/service.ts:UserService.getUsers", name: "UserService.getUsers", filePath: "src/service.ts",
    kind: "method", language: "typescript", visibility: "public",
    startLine: 5, endLine: 15, params: [{ name: "page", type: "number" }],
  });
  symbols.set("interface:src/repo.ts:IUserRepo", {
    uid: "interface:src/repo.ts:IUserRepo", name: "IUserRepo", filePath: "src/repo.ts",
    kind: "interface", language: "typescript", visibility: "public",
    startLine: 1, endLine: 8,
  });
  symbols.set("class:src/repo.ts:UserRepo", {
    uid: "class:src/repo.ts:UserRepo", name: "UserRepo", filePath: "src/repo.ts",
    kind: "class", language: "typescript", visibility: "public",
    startLine: 10, endLine: 50, implements: ["IUserRepo"],
  });
  symbols.set("function:src/utils.ts:formatDate", {
    uid: "function:src/utils.ts:formatDate", name: "formatDate", filePath: "src/utils.ts",
    kind: "function", language: "typescript", visibility: "public",
    startLine: 1, endLine: 8,
  });

  const modules: Module[] = [
    { name: "services", path: "src", layer: "application", symbols: ["class:src/service.ts:UserService", "method:src/service.ts:UserService.getUsers"], dependencies: ["repos"], language: "typescript", fileCount: 1, lineCount: 40 },
    { name: "repos", path: "src", layer: "infrastructure", symbols: ["interface:src/repo.ts:IUserRepo", "class:src/repo.ts:UserRepo"], dependencies: [], language: "typescript", fileCount: 1, lineCount: 50 },
    { name: "utils", path: "src", layer: "application", symbols: ["function:src/utils.ts:formatDate"], dependencies: [], language: "typescript", fileCount: 1, lineCount: 8 },
  ];

  return {
    project: { name: "test-api", rootPath: "/test", analyzedAt: new Date().toISOString(), version: "0.1.0" },
    stats: { files: 3, symbols: 5, relations: 3, modules: 3, languages: { typescript: 5 } as any, totalLines: 98 },
    symbols,
    relations: [
      { source: "class:src/service.ts:UserService", target: "method:src/service.ts:UserService.getUsers", type: "composes" },
      { source: "class:src/service.ts:UserService", target: "interface:src/repo.ts:IUserRepo", type: "imports" },
      { source: "class:src/repo.ts:UserRepo", target: "interface:src/repo.ts:IUserRepo", type: "implements" },
    ],
    modules,
    layers: { application: ["services", "utils"], infrastructure: ["repos"], presentation: [], api: [], domain: [], config: [], test: [], unknown: [] },
    dataFlows: [],
    apiEndpoints: [],
    dbEntities: [],
    techRadar: [],
    businessProcesses: [],
    ...overrides,
  } as ArchitectureModel;
}

// ─── API Response Shape Tests ───────────────────────────────────────

describe("API Response Shapes", () => {
  describe("/api/quality", () => {
    it("should return projectScore, totalIssues, modules array", () => {
      const model = createFixtureModel();
      const analyzer = new QualityAnalyzer(model);
      const report = analyzer.analyze();

      expect(report).toHaveProperty("projectScore");
      expect(report).toHaveProperty("totalIssues");
      expect(report).toHaveProperty("modules");
      expect(typeof report.projectScore).toBe("number");
      expect(report.projectScore).toBeGreaterThanOrEqual(0);
      expect(report.projectScore).toBeLessThanOrEqual(100);
      expect(typeof report.totalIssues).toBe("number");
      expect(Array.isArray(report.modules)).toBe(true);
    });

    it("should include bySeverity and byCategory breakdowns", () => {
      const model = createFixtureModel();
      const report = new QualityAnalyzer(model).analyze();

      expect(report).toHaveProperty("bySeverity");
      expect(report).toHaveProperty("byCategory");
      expect(typeof report.bySeverity).toBe("object");
      expect(typeof report.byCategory).toBe("object");
    });

    it("should include architecturePatterns with compliance", () => {
      const model = createFixtureModel();
      const report = new QualityAnalyzer(model).analyze();

      expect(report).toHaveProperty("architecturePatterns");
      expect(Array.isArray(report.architecturePatterns)).toBe(true);
      for (const pattern of report.architecturePatterns) {
        expect(pattern).toHaveProperty("pattern");
        expect(pattern).toHaveProperty("compliance");
        expect(pattern.compliance).toBeGreaterThanOrEqual(0);
        expect(pattern.compliance).toBeLessThanOrEqual(100);
      }
    });

    it("each module should have name, score, and issues", () => {
      const model = createFixtureModel();
      const report = new QualityAnalyzer(model).analyze();

      for (const mod of report.modules) {
        expect(mod).toHaveProperty("moduleName");
        expect(mod).toHaveProperty("score");
        expect(mod).toHaveProperty("issues");
        expect(typeof mod.moduleName).toBe("string");
        expect(typeof mod.score).toBe("number");
        expect(Array.isArray(mod.issues)).toBe(true);
      }
    });
  });

  describe("/api/coupling", () => {
    it("should return overallHealth, circularDependencies, modules", () => {
      const model = createFixtureModel();
      const report = new CouplingAnalyzer(model).analyze();

      expect(report).toHaveProperty("overallHealth");
      expect(report).toHaveProperty("circularDependencies");
      expect(report).toHaveProperty("modules");
      expect(Array.isArray(report.circularDependencies)).toBe(true);
      expect(Array.isArray(report.modules)).toBe(true);
    });

    it("should have instability between 0 and 1 for each module", () => {
      const model = createFixtureModel();
      const report = new CouplingAnalyzer(model).analyze();

      for (const mod of report.modules) {
        expect(mod.instability).toBeGreaterThanOrEqual(0);
        expect(mod.instability).toBeLessThanOrEqual(1);
        expect(mod).toHaveProperty("afferentCoupling");
        expect(mod).toHaveProperty("efferentCoupling");
        expect(mod).toHaveProperty("abstractness");
      }
    });

    it("overallHealth should contain avgInstability and avgAbstractness", () => {
      const model = createFixtureModel();
      const report = new CouplingAnalyzer(model).analyze();

      expect(report.overallHealth).toHaveProperty("avgInstability");
      expect(report.overallHealth).toHaveProperty("avgAbstractness");
      expect(typeof report.overallHealth.avgInstability).toBe("number");
      expect(typeof report.overallHealth.avgAbstractness).toBe("number");
    });
  });

  describe("/api/deadcode", () => {
    it("should return totalDead, items, estimatedCleanupLines", () => {
      const model = createFixtureModel();
      const report = new DeadCodeDetector(model).detect();

      expect(report).toHaveProperty("totalDead");
      expect(report).toHaveProperty("items");
      expect(report).toHaveProperty("estimatedCleanupLines");
      expect(typeof report.totalDead).toBe("number");
      expect(typeof report.estimatedCleanupLines).toBe("number");
      expect(Array.isArray(report.items)).toBe(true);
    });

    it("items should have name, filePath, kind, and confidence", () => {
      const model = createFixtureModel();
      const report = new DeadCodeDetector(model).detect();

      for (const item of report.items) {
        expect(item).toHaveProperty("name");
        expect(item).toHaveProperty("filePath");
        expect(item).toHaveProperty("kind");
        expect(item).toHaveProperty("confidence");
        expect(["high", "medium", "low"]).toContain(item.confidence);
      }
    });

    it("should include byModule breakdown", () => {
      const model = createFixtureModel();
      const report = new DeadCodeDetector(model).detect();

      expect(report).toHaveProperty("byModule");
      expect(Array.isArray(report.byModule)).toBe(true);
    });
  });

  describe("/api/security", () => {
    it("should return totalIssues, score, issues array", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "archlens-api-test-"));
      const srcDir = path.join(tmpDir, "src");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, "clean.ts"), `export function add(a: number, b: number) { return a + b; }`);

      const symbols = new Map<string, Symbol>();
      symbols.set("fn:src/clean.ts:add", {
        uid: "fn:src/clean.ts:add", name: "add", filePath: "src/clean.ts",
        kind: "function", language: "typescript", visibility: "public",
        startLine: 1, endLine: 1,
      });

      const model = createFixtureModel({
        symbols,
        modules: [{ name: "src", path: "src", layer: "application", symbols: ["fn:src/clean.ts:add"], dependencies: [], language: "typescript", fileCount: 1, lineCount: 1 }],
      });
      model.project.rootPath = tmpDir;

      const report = new SecurityScanner(model, tmpDir).scan();

      expect(report).toHaveProperty("totalIssues");
      expect(report).toHaveProperty("score");
      expect(report).toHaveProperty("issues");
      expect(typeof report.totalIssues).toBe("number");
      expect(typeof report.score).toBe("number");
      expect(report.score).toBeGreaterThanOrEqual(0);
      expect(report.score).toBeLessThanOrEqual(100);
      expect(Array.isArray(report.issues)).toBe(true);

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("issues should have rule, severity, filePath, and message", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "archlens-api-test-"));
      const srcDir = path.join(tmpDir, "src");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, "bad.ts"), `const password = "hunter2";`);

      const symbols = new Map<string, Symbol>();
      symbols.set("fn:src/bad.ts:main", {
        uid: "fn:src/bad.ts:main", name: "main", filePath: "src/bad.ts",
        kind: "function", language: "typescript", visibility: "public",
        startLine: 1, endLine: 1,
      });

      const model = createFixtureModel({
        symbols,
        modules: [{ name: "src", path: "src", layer: "application", symbols: ["fn:src/bad.ts:main"], dependencies: [], language: "typescript", fileCount: 1, lineCount: 1 }],
      });

      const report = new SecurityScanner(model, tmpDir).scan();

      for (const issue of report.issues) {
        expect(issue).toHaveProperty("rule");
        expect(issue).toHaveProperty("severity");
        expect(issue).toHaveProperty("filePath");
        expect(issue).toHaveProperty("description");
        expect(issue).toHaveProperty("title");
        expect(issue).toHaveProperty("recommendation");
      }

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  describe("/api/eventflow", () => {
    it("should return events, boundedContexts, communicationPatterns", () => {
      const model = createFixtureModel();
      const report = new EventFlowDetector(model).detect();

      expect(report).toHaveProperty("events");
      expect(report).toHaveProperty("boundedContexts");
      expect(report).toHaveProperty("communicationPatterns");
      expect(Array.isArray(report.events)).toBe(true);
      expect(Array.isArray(report.boundedContexts)).toBe(true);
      expect(Array.isArray(report.communicationPatterns)).toBe(true);
    });

    it("events should have eventName, publisher, subscribers, eventType when present", () => {
      const symbols = new Map<string, Symbol>();
      symbols.set("class:events/OrderCreatedEvent.ts:OrderCreatedEvent", {
        uid: "class:events/OrderCreatedEvent.ts:OrderCreatedEvent", name: "OrderCreatedEvent",
        filePath: "events/OrderCreatedEvent.ts", kind: "class", language: "typescript",
        visibility: "public", startLine: 1, endLine: 10,
      });
      symbols.set("class:handlers/OrderCreatedHandler.ts:OrderCreatedHandler", {
        uid: "class:handlers/OrderCreatedHandler.ts:OrderCreatedHandler", name: "OrderCreatedHandler",
        filePath: "handlers/OrderCreatedHandler.ts", kind: "class", language: "typescript",
        visibility: "public", startLine: 1, endLine: 20,
      });

      const model = createFixtureModel({
        symbols,
        modules: [{
          name: "ordering", path: "src/ordering", layer: "domain",
          symbols: [...symbols.keys()], dependencies: [],
          language: "typescript", fileCount: 2, lineCount: 30,
        }],
      });

      const report = new EventFlowDetector(model).detect();
      expect(report.events.length).toBeGreaterThan(0);

      for (const event of report.events) {
        expect(event).toHaveProperty("eventName");
        expect(event).toHaveProperty("publisher");
        expect(event).toHaveProperty("subscribers");
        expect(event).toHaveProperty("eventType");
        expect(event.publisher).toHaveProperty("module");
        expect(event.publisher).toHaveProperty("symbol");
        expect(["integration", "domain", "notification"]).toContain(event.eventType);
      }
    });

    it("boundedContexts should have name, modules, entities, events, isClean", () => {
      const model = createFixtureModel();
      const report = new EventFlowDetector(model).detect();

      for (const ctx of report.boundedContexts) {
        expect(ctx).toHaveProperty("name");
        expect(ctx).toHaveProperty("modules");
        expect(ctx).toHaveProperty("entities");
        expect(ctx).toHaveProperty("events");
        expect(ctx).toHaveProperty("isClean");
        expect(typeof ctx.isClean).toBe("boolean");
        expect(Array.isArray(ctx.modules)).toBe(true);
      }
    });
  });

  describe("/api/techdebt", () => {
    it("should return totalEstimatedHours, totalEstimatedCost, items, quickWins", () => {
      const model = createFixtureModel();
      const report = new TechDebtCalculator(model).calculate();

      expect(report).toHaveProperty("totalEstimatedHours");
      expect(report).toHaveProperty("totalEstimatedCost");
      expect(report).toHaveProperty("totalAnnualCost");
      expect(report).toHaveProperty("items");
      expect(report).toHaveProperty("quickWins");
      expect(report).toHaveProperty("costPerDeveloperHour");
      expect(typeof report.totalEstimatedHours).toBe("number");
      expect(typeof report.totalEstimatedCost).toBe("number");
      expect(Array.isArray(report.items)).toBe(true);
      expect(Array.isArray(report.quickWins)).toBe(true);
    });
  });
});
