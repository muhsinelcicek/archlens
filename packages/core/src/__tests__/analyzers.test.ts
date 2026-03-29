import { describe, it, expect } from "vitest";
import type { ArchitectureModel, Symbol, Module } from "../models/index.js";
import { QualityAnalyzer } from "../analyzers/quality-analyzer.js";
import { DeadCodeDetector } from "../analyzers/dead-code-detector.js";
import { SecurityScanner } from "../analyzers/security-scanner.js";
import { PatternDeepAnalyzer } from "../analyzers/pattern-deep-analyzer.js";

// ─── Test Helpers ─────────────────────────────────────────────────

function createMockModel(overrides: Partial<ArchitectureModel> = {}): ArchitectureModel {
  const symbols = new Map<string, Symbol>();
  symbols.set("class:test.ts:MyClass", {
    uid: "class:test.ts:MyClass", name: "MyClass", filePath: "test.ts",
    kind: "class", language: "typescript", visibility: "public",
    startLine: 1, endLine: 50,
  });
  symbols.set("method:test.ts:MyClass.doWork", {
    uid: "method:test.ts:MyClass.doWork", name: "MyClass.doWork", filePath: "test.ts",
    kind: "method", language: "typescript", visibility: "public",
    startLine: 5, endLine: 20, params: [{ name: "data", type: "string" }],
  });
  symbols.set("function:utils.ts:helper", {
    uid: "function:utils.ts:helper", name: "helper", filePath: "utils.ts",
    kind: "function", language: "typescript", visibility: "public",
    startLine: 1, endLine: 10,
  });

  const modules: Module[] = [
    { name: "src", path: "src", layer: "application", symbols: ["class:test.ts:MyClass", "method:test.ts:MyClass.doWork", "function:utils.ts:helper"], dependencies: [], language: "typescript", fileCount: 2, lineCount: 60 },
  ];

  return {
    project: { name: "test-project", rootPath: "/test", analyzedAt: new Date().toISOString(), version: "0.1.0" },
    stats: { files: 2, symbols: 3, relations: 1, modules: 1, languages: { typescript: 3 } as any, totalLines: 60 },
    symbols,
    relations: [
      { source: "class:test.ts:MyClass", target: "method:test.ts:MyClass.doWork", type: "composes" },
    ],
    modules,
    layers: { application: ["src"], presentation: [], api: [], domain: [], infrastructure: [], config: [], test: [], unknown: [] },
    dataFlows: [],
    apiEndpoints: [],
    dbEntities: [],
    techRadar: [],
    businessProcesses: [],
    ...overrides,
  } as ArchitectureModel;
}

// ─── Quality Analyzer Tests ───────────────────────────────────────

describe("QualityAnalyzer", () => {
  it("should return a score between 0-100", () => {
    const model = createMockModel();
    const analyzer = new QualityAnalyzer(model);
    const report = analyzer.analyze();
    expect(report.projectScore).toBeGreaterThanOrEqual(0);
    expect(report.projectScore).toBeLessThanOrEqual(100);
  });

  it("should detect god classes", () => {
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

    const model = createMockModel({ symbols, relations, modules: [{ name: "src", path: "src", layer: "application", symbols: [...symbols.keys()], dependencies: [], language: "typescript", fileCount: 1, lineCount: 500 }] });
    const report = new QualityAnalyzer(model).analyze();
    const godClassIssues = report.modules.flatMap((m) => m.issues.filter((i) => i.rule === "code-smell/god-class"));
    expect(godClassIssues.length).toBeGreaterThan(0);
  });

  it("should not flag C# PascalCase as naming violation", () => {
    const symbols = new Map<string, Symbol>();
    symbols.set("method:test.cs:Service.GetUsers", {
      uid: "method:test.cs:Service.GetUsers", name: "Service.GetUsers", filePath: "test.cs",
      kind: "method", language: "csharp", visibility: "public",
      startLine: 1, endLine: 5,
    });

    const model = createMockModel({
      symbols,
      modules: [{ name: "src", path: "src", layer: "api", symbols: [...symbols.keys()], dependencies: [], language: "csharp", fileCount: 1, lineCount: 5 }],
    });
    const report = new QualityAnalyzer(model).analyze();
    const namingIssues = report.modules.flatMap((m) => m.issues.filter((i) => i.rule === "naming/camel-case"));
    expect(namingIssues.length).toBe(0);
  });

  it("should skip migration files", () => {
    const symbols = new Map<string, Symbol>();
    symbols.set("class:migration/Initial.cs:Initial", {
      uid: "class:migration/Initial.cs:Initial", name: "Initial", filePath: "migration/Initial.cs",
      kind: "class", language: "csharp", visibility: "public",
      startLine: 1, endLine: 500,
    });

    const model = createMockModel({
      symbols,
      modules: [{ name: "src", path: "src", layer: "infrastructure", symbols: [...symbols.keys()], dependencies: [], language: "csharp", fileCount: 1, lineCount: 500 }],
    });
    const report = new QualityAnalyzer(model).analyze();
    const issues = report.modules.flatMap((m) => m.issues);
    expect(issues.length).toBe(0); // Migration file should be skipped
  });
});

// ─── Dead Code Detector Tests ─────────────────────────────────────

describe("DeadCodeDetector", () => {
  it("should detect unreferenced symbols", () => {
    const model = createMockModel();
    const detector = new DeadCodeDetector(model);
    const report = detector.detect();
    // helper function is not referenced by anything
    const deadHelper = report.items.find((i) => i.name === "helper");
    expect(deadHelper).toBeDefined();
  });

  it("should not flag entry points as dead", () => {
    const symbols = new Map<string, Symbol>();
    symbols.set("function:main.ts:main", {
      uid: "function:main.ts:main", name: "main", filePath: "main.ts",
      kind: "function", language: "typescript", visibility: "public",
      startLine: 1, endLine: 10,
    });

    const model = createMockModel({ symbols, modules: [{ name: "src", path: "src", layer: "application", symbols: [...symbols.keys()], dependencies: [], language: "typescript", fileCount: 1, lineCount: 10 }] });
    const report = new DeadCodeDetector(model).detect();
    expect(report.items.find((i) => i.name === "main")).toBeUndefined();
  });
});

// ─── Pattern Deep Analyzer Tests ──────────────────────────────────

describe("PatternDeepAnalyzer", () => {
  it("should detect 6 patterns", () => {
    const model = createMockModel();
    const analyzer = new PatternDeepAnalyzer(model);
    const patterns = analyzer.analyze();
    expect(patterns.length).toBe(6);
    expect(patterns.map((p) => p.id)).toContain("ddd");
    expect(patterns.map((p) => p.id)).toContain("clean-architecture");
    expect(patterns.map((p) => p.id)).toContain("repository");
    expect(patterns.map((p) => p.id)).toContain("cqrs");
    expect(patterns.map((p) => p.id)).toContain("event-driven");
    expect(patterns.map((p) => p.id)).toContain("microservice");
  });

  it("should return compliance 0-100 for each pattern", () => {
    const model = createMockModel();
    const patterns = new PatternDeepAnalyzer(model).analyze();
    for (const p of patterns) {
      expect(p.compliance).toBeGreaterThanOrEqual(0);
      expect(p.compliance).toBeLessThanOrEqual(100);
    }
  });
});
