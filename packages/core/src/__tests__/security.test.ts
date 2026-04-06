import { describe, it, expect } from "vitest";
import { SecurityScanner } from "../analyzers/security-scanner.js";
import type { ArchitectureModel, Symbol } from "../models/index.js";

function createModelWithFiles(files: Map<string, string>): { model: ArchitectureModel; rootDir: string } {
  const fs = require("fs");
  const path = require("path");
  const os = require("os");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "archlens-test-"));
  const symbols = new Map<string, Symbol>();

  for (const [filePath, content] of files) {
    const absPath = path.join(tmpDir, filePath);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content);

    symbols.set(`file:${filePath}:main`, {
      uid: `file:${filePath}:main`, name: "main", filePath,
      kind: "function", language: "typescript", visibility: "public",
      startLine: 1, endLine: content.split("\n").length,
    });
  }

  return {
    model: {
      project: { name: "test", rootPath: tmpDir, analyzedAt: "", version: "0.1.0" },
      stats: { files: files.size, symbols: symbols.size, relations: 0, modules: 0, languages: {} as any, totalLines: 0 },
      symbols, relations: [], modules: [{ name: "src", path: "src", layer: "application", symbols: [...symbols.keys()], dependencies: [], language: "typescript", fileCount: files.size, lineCount: 0 }],
      layers: { application: ["src"], presentation: [], api: [], domain: [], infrastructure: [], config: [], test: [], unknown: [] },
      dataFlows: [], apiEndpoints: [], dbEntities: [], techRadar: [], businessProcesses: [],
    } as ArchitectureModel,
    rootDir: tmpDir,
  };
}

describe("SecurityScanner", () => {
  it("should detect hardcoded passwords", () => {
    const { model, rootDir } = createModelWithFiles(new Map([
      ["src/config.ts", `const password = "super_secret_123";`],
    ]));
    const report = new SecurityScanner(model, rootDir).scan();
    expect(report.issues.some((i) => i.rule === "security/hardcoded-password")).toBe(true);
  });

  it("should detect eval usage", () => {
    const { model, rootDir } = createModelWithFiles(new Map([
      ["src/danger.ts", `const result = eval(userInput);`],
    ]));
    const report = new SecurityScanner(model, rootDir).scan();
    expect(report.issues.some((i) => i.rule === "security/eval-usage")).toBe(true);
  });

  it("should detect HTTP URLs", () => {
    const { model, rootDir } = createModelWithFiles(new Map([
      ["src/api.ts", `const url = "http://example.com/api";`],
    ]));
    const report = new SecurityScanner(model, rootDir).scan();
    expect(report.issues.some((i) => i.rule === "security/http-not-https")).toBe(true);
  });

  it("should NOT flag localhost HTTP", () => {
    const { model, rootDir } = createModelWithFiles(new Map([
      ["src/dev.ts", `const url = "http://localhost:3000";`],
    ]));
    const report = new SecurityScanner(model, rootDir).scan();
    expect(report.issues.some((i) => i.rule === "security/http-not-https")).toBe(false);
  });

  it("should skip comments", () => {
    const { model, rootDir } = createModelWithFiles(new Map([
      ["src/safe.ts", `// const password = "not_real";\nconst x = 1;`],
    ]));
    const report = new SecurityScanner(model, rootDir).scan();
    expect(report.issues.some((i) => i.rule === "security/hardcoded-password")).toBe(false);
  });

  it("should return score 0-100", () => {
    const { model, rootDir } = createModelWithFiles(new Map([
      ["src/clean.ts", `export function add(a: number, b: number) { return a + b; }`],
    ]));
    const report = new SecurityScanner(model, rootDir).scan();
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
  });
});
