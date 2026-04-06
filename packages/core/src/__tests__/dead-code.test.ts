import { describe, it, expect } from "vitest";
import type { ArchitectureModel, Symbol, Module } from "../models/index.js";
import { DeadCodeDetector } from "../analyzers/dead-code-detector.js";

function createModel(symbols: Map<string, Symbol>, relations: Array<{ source: string; target: string; type: string }> = []): ArchitectureModel {
  return {
    project: { name: "test", rootPath: "/test", analyzedAt: "", version: "0.1.0" },
    stats: { files: 1, symbols: symbols.size, relations: relations.length, modules: 1, languages: {} as any, totalLines: 50 },
    symbols,
    relations,
    modules: [{ name: "src", path: "src", layer: "application", symbols: [...symbols.keys()], dependencies: [], language: "typescript", fileCount: 1, lineCount: 50 }],
    layers: { application: ["src"], presentation: [], api: [], domain: [], infrastructure: [], config: [], test: [], unknown: [] },
    dataFlows: [], apiEndpoints: [], dbEntities: [], techRadar: [], businessProcesses: [],
  } as ArchitectureModel;
}

describe("DeadCodeDetector", () => {
  it("should detect unreferenced private functions", () => {
    const symbols = new Map<string, Symbol>();
    symbols.set("fn:a", { uid: "fn:a", name: "_helper", filePath: "a.ts", kind: "function", language: "typescript", visibility: "private", startLine: 1, endLine: 10 });

    const report = new DeadCodeDetector(createModel(symbols)).detect();
    expect(report.items.some((i) => i.name === "_helper" && i.confidence === "high")).toBe(true);
  });

  it("should NOT flag main/entry functions", () => {
    const symbols = new Map<string, Symbol>();
    symbols.set("fn:main", { uid: "fn:main", name: "main", filePath: "main.ts", kind: "function", language: "typescript", visibility: "public", startLine: 1, endLine: 10 });

    const report = new DeadCodeDetector(createModel(symbols)).detect();
    expect(report.items.some((i) => i.name === "main")).toBe(false);
  });

  it("should NOT flag React components", () => {
    const symbols = new Map<string, Symbol>();
    symbols.set("fn:App", { uid: "fn:App", name: "App", filePath: "App.tsx", kind: "function", language: "typescript", visibility: "public", startLine: 1, endLine: 20 });

    const report = new DeadCodeDetector(createModel(symbols)).detect();
    expect(report.items.some((i) => i.name === "App")).toBe(false);
  });

  it("should NOT flag referenced symbols", () => {
    const symbols = new Map<string, Symbol>();
    symbols.set("fn:a", { uid: "fn:a", name: "doWork", filePath: "a.ts", kind: "function", language: "typescript", visibility: "public", startLine: 1, endLine: 10 });
    symbols.set("fn:b", { uid: "fn:b", name: "caller", filePath: "b.ts", kind: "function", language: "typescript", visibility: "public", startLine: 1, endLine: 5 });

    const relations = [{ source: "fn:b", target: "fn:a", type: "calls" }];
    const report = new DeadCodeDetector(createModel(symbols, relations)).detect();
    expect(report.items.some((i) => i.name === "doWork")).toBe(false);
  });

  it("should calculate cleanup lines", () => {
    const symbols = new Map<string, Symbol>();
    symbols.set("fn:dead", { uid: "fn:dead", name: "_unused", filePath: "a.ts", kind: "function", language: "typescript", visibility: "private", startLine: 1, endLine: 30 });

    const report = new DeadCodeDetector(createModel(symbols)).detect();
    expect(report.estimatedCleanupLines).toBeGreaterThan(0);
  });

  it("should group by module", () => {
    const symbols = new Map<string, Symbol>();
    symbols.set("fn:a", { uid: "fn:a", name: "_dead1", filePath: "a.ts", kind: "function", language: "typescript", visibility: "private", startLine: 1, endLine: 10 });
    symbols.set("fn:b", { uid: "fn:b", name: "_dead2", filePath: "b.ts", kind: "function", language: "typescript", visibility: "private", startLine: 1, endLine: 10 });

    const report = new DeadCodeDetector(createModel(symbols)).detect();
    expect(report.byModule.length).toBeGreaterThan(0);
  });
});
