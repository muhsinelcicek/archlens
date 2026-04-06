import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { ArchitectureModel, Symbol, Module } from "../models/index.js";
import { ConsistencyChecker } from "../analyzers/consistency-checker.js";

function createTmpProject(files: Record<string, string>): { rootDir: string; cleanup: () => void } {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "archlens-consistency-"));
  for (const [filePath, content] of Object.entries(files)) {
    const absPath = path.join(rootDir, filePath);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content);
  }
  return { rootDir, cleanup: () => fs.rmSync(rootDir, { recursive: true, force: true }) };
}

function createModel(rootDir: string, files: Record<string, string>, lang: string = "typescript"): ArchitectureModel {
  const symbols = new Map<string, Symbol>();
  const ext = lang === "typescript" ? "ts" : lang === "python" ? "py" : lang === "csharp" ? "cs" : lang === "java" ? "java" : lang === "go" ? "go" : "ts";

  for (const filePath of Object.keys(files)) {
    const uid = `fn:${filePath}:main`;
    symbols.set(uid, {
      uid, name: "main", filePath,
      kind: "function", language: lang as any, visibility: "public",
      startLine: 1, endLine: files[filePath].split("\n").length,
    });
  }

  return {
    project: { name: "test", rootPath: rootDir, analyzedAt: "", version: "0.1.0" },
    stats: { files: Object.keys(files).length, symbols: symbols.size, relations: 0, modules: 1, languages: {} as any, totalLines: 0 },
    symbols,
    relations: [],
    modules: [{
      name: "src", path: "src", layer: "application",
      symbols: [...symbols.keys()], dependencies: [],
      language: lang as any, fileCount: Object.keys(files).length, lineCount: 100,
    }],
    layers: { application: ["src"], presentation: [], api: [], domain: [], infrastructure: [], config: [], test: [], unknown: [] },
    dataFlows: [], apiEndpoints: [], dbEntities: [], techRadar: [], businessProcesses: [],
  } as ArchitectureModel;
}

describe("ConsistencyChecker", () => {
  describe("error handling consistency", () => {
    it("should detect empty catch blocks in TypeScript", () => {
      const files = { "src/service.ts": `
try {
  doSomething();
} catch (e) {}
` };
      const { rootDir, cleanup } = createTmpProject(files);
      try {
        const model = createModel(rootDir, files);
        const report = new ConsistencyChecker(model, rootDir).check();
        const emptyCatch = report.issues.find((i) => i.category === "error-handling" && i.description.includes("empty catch"));
        expect(emptyCatch).toBeDefined();
        expect(emptyCatch!.severity).toBe("major");
      } finally {
        cleanup();
      }
    });

    it("should detect bare except in Python", () => {
      const files = { "src/handler.py": `
try:
    do_something()
except:
    pass
` };
      const { rootDir, cleanup } = createTmpProject(files);
      try {
        const model = createModel(rootDir, files, "python");
        const report = new ConsistencyChecker(model, rootDir).check();
        const bareExcept = report.issues.find((i) => i.category === "error-handling" && i.description.includes("Bare except"));
        expect(bareExcept).toBeDefined();
        expect(bareExcept!.severity).toBe("major");
      } finally {
        cleanup();
      }
    });

    it("should detect unchecked errors in Go", () => {
      const files = { "src/main.go": `
package main
func main() {
    result, _ := doStuff()
    data, _ := readFile()
    val, _ := parse()
}
` };
      const { rootDir, cleanup } = createTmpProject(files);
      try {
        const model = createModel(rootDir, files, "go");
        const report = new ConsistencyChecker(model, rootDir).check();
        const goErrors = report.issues.find((i) => i.category === "error-handling" && i.description.includes("unchecked error"));
        expect(goErrors).toBeDefined();
      } finally {
        cleanup();
      }
    });

    it("should not flag proper error handling", () => {
      const files = { "src/clean.ts": `
try {
  doSomething();
} catch (e) {
  console.error(e);
  throw e;
}
` };
      const { rootDir, cleanup } = createTmpProject(files);
      try {
        const model = createModel(rootDir, files);
        const report = new ConsistencyChecker(model, rootDir).check();
        const emptyCatch = report.issues.filter((i) => i.category === "error-handling" && i.description.includes("empty catch"));
        expect(emptyCatch.length).toBe(0);
      } finally {
        cleanup();
      }
    });
  });

  describe("logging consistency", () => {
    it("should detect Console.Write in C# production code", () => {
      const files = { "src/Service.cs": `
public class Service {
    public void Process() {
        Console.WriteLine("Processing...");
    }
}
` };
      const { rootDir, cleanup } = createTmpProject(files);
      try {
        const model = createModel(rootDir, files, "csharp");
        const report = new ConsistencyChecker(model, rootDir).check();
        const consoleIssue = report.issues.find((i) => i.category === "logging" && i.description.includes("Console.Write"));
        expect(consoleIssue).toBeDefined();
        expect(consoleIssue!.severity).toBe("minor");
      } finally {
        cleanup();
      }
    });

    it("should detect excessive console.log in TypeScript", () => {
      const files = { "src/debug.ts": `
console.log("step 1");
console.log("step 2");
console.log("step 3");
console.log("step 4");
` };
      const { rootDir, cleanup } = createTmpProject(files);
      try {
        const model = createModel(rootDir, files);
        const report = new ConsistencyChecker(model, rootDir).check();
        const logIssue = report.issues.find((i) => i.category === "logging" && i.description.includes("console.log"));
        expect(logIssue).toBeDefined();
      } finally {
        cleanup();
      }
    });

    it("should detect print() instead of logging in Python", () => {
      const files = { "src/service.py": `
def process():
    print("Starting process")
    result = do_work()
    print(f"Done: {result}")
` };
      const { rootDir, cleanup } = createTmpProject(files);
      try {
        const model = createModel(rootDir, files, "python");
        const report = new ConsistencyChecker(model, rootDir).check();
        const printIssue = report.issues.find((i) => i.category === "logging" && i.description.includes("print()"));
        expect(printIssue).toBeDefined();
      } finally {
        cleanup();
      }
    });

    it("should detect System.out in Java", () => {
      const files = { "src/Service.java": `
public class Service {
    public void run() {
        System.out.println("Running...");
    }
}
` };
      const { rootDir, cleanup } = createTmpProject(files);
      try {
        const model = createModel(rootDir, files, "java");
        const report = new ConsistencyChecker(model, rootDir).check();
        const sysOut = report.issues.find((i) => i.category === "logging" && i.description.includes("System.out"));
        expect(sysOut).toBeDefined();
      } finally {
        cleanup();
      }
    });

    it("should skip test files for logging checks", () => {
      const files = { "src/service.test.ts": `
console.log("test output 1");
console.log("test output 2");
console.log("test output 3");
console.log("test output 4");
` };
      const { rootDir, cleanup } = createTmpProject(files);
      try {
        const model = createModel(rootDir, files);
        const report = new ConsistencyChecker(model, rootDir).check();
        const logIssues = report.issues.filter((i) => i.category === "logging");
        expect(logIssues.length).toBe(0);
      } finally {
        cleanup();
      }
    });
  });

  describe("report structure", () => {
    it("should return issues, moduleScores, and summary", () => {
      const files = { "src/clean.ts": `export const x = 1;` };
      const { rootDir, cleanup } = createTmpProject(files);
      try {
        const model = createModel(rootDir, files);
        const report = new ConsistencyChecker(model, rootDir).check();

        expect(report).toHaveProperty("issues");
        expect(report).toHaveProperty("moduleScores");
        expect(report).toHaveProperty("summary");
        expect(Array.isArray(report.issues)).toBe(true);
        expect(Array.isArray(report.moduleScores)).toBe(true);
        expect(typeof report.summary).toBe("string");
      } finally {
        cleanup();
      }
    });

    it("moduleScores should contain errorHandling, logging, overall between 0-100", () => {
      const files = { "src/app.ts": `export function run() { return 1; }` };
      const { rootDir, cleanup } = createTmpProject(files);
      try {
        const model = createModel(rootDir, files);
        const report = new ConsistencyChecker(model, rootDir).check();

        for (const score of report.moduleScores) {
          expect(score).toHaveProperty("module");
          expect(score).toHaveProperty("errorHandling");
          expect(score).toHaveProperty("logging");
          expect(score).toHaveProperty("overall");
          expect(score.errorHandling).toBeGreaterThanOrEqual(0);
          expect(score.errorHandling).toBeLessThanOrEqual(100);
          expect(score.logging).toBeGreaterThanOrEqual(0);
          expect(score.logging).toBeLessThanOrEqual(100);
          expect(score.overall).toBeGreaterThanOrEqual(0);
          expect(score.overall).toBeLessThanOrEqual(100);
        }
      } finally {
        cleanup();
      }
    });

    it("should produce appropriate summary for clean project", () => {
      const files = { "src/clean.ts": `export function add(a: number, b: number) { return a + b; }` };
      const { rootDir, cleanup } = createTmpProject(files);
      try {
        const model = createModel(rootDir, files);
        const report = new ConsistencyChecker(model, rootDir).check();

        if (report.issues.length === 0) {
          expect(report.summary).toContain("consistent");
        } else {
          expect(report.summary).toContain("consistency issues");
        }
      } finally {
        cleanup();
      }
    });

    it("issues should have category, module, description, severity, evidence", () => {
      const files = { "src/bad.ts": `try { x(); } catch (e) {}` };
      const { rootDir, cleanup } = createTmpProject(files);
      try {
        const model = createModel(rootDir, files);
        const report = new ConsistencyChecker(model, rootDir).check();

        for (const issue of report.issues) {
          expect(issue).toHaveProperty("category");
          expect(issue).toHaveProperty("module");
          expect(issue).toHaveProperty("description");
          expect(issue).toHaveProperty("severity");
          expect(issue).toHaveProperty("evidence");
          expect(["error-handling", "logging", "validation", "configuration", "naming-convention"]).toContain(issue.category);
          expect(["major", "minor", "info"]).toContain(issue.severity);
        }
      } finally {
        cleanup();
      }
    });
  });

  describe("cross-module consistency", () => {
    it("should flag modules significantly below average error handling", () => {
      const files = {
        "src/good.ts": `
try { doA(); } catch (e) { handleError(e); }
try { doB(); } catch (e) { handleError(e); }
`,
        "src/bad.ts": `
try { doX(); } catch (e) {}
try { doY(); } catch (e) {}
try { doZ(); } catch (e) {}
try { doW(); } catch (e) {}
`,
      };
      const { rootDir, cleanup } = createTmpProject(files);
      try {
        const symbols = new Map<string, Symbol>();
        symbols.set("fn:src/good.ts:main", {
          uid: "fn:src/good.ts:main", name: "main", filePath: "src/good.ts",
          kind: "function", language: "typescript", visibility: "public",
          startLine: 1, endLine: 3,
        });
        symbols.set("fn:src/bad.ts:main", {
          uid: "fn:src/bad.ts:main", name: "main", filePath: "src/bad.ts",
          kind: "function", language: "typescript", visibility: "public",
          startLine: 1, endLine: 5,
        });

        const model: ArchitectureModel = {
          project: { name: "test", rootPath: rootDir, analyzedAt: "", version: "0.1.0" },
          stats: { files: 2, symbols: 2, relations: 0, modules: 2, languages: {} as any, totalLines: 0 },
          symbols,
          relations: [],
          modules: [
            { name: "good-module", path: "src", layer: "application", symbols: ["fn:src/good.ts:main"], dependencies: [], language: "typescript", fileCount: 1, lineCount: 50 },
            { name: "bad-module", path: "src", layer: "application", symbols: ["fn:src/bad.ts:main"], dependencies: [], language: "typescript", fileCount: 1, lineCount: 50 },
          ],
          layers: { application: ["good-module", "bad-module"], presentation: [], api: [], domain: [], infrastructure: [], config: [], test: [], unknown: [] },
          dataFlows: [], apiEndpoints: [], dbEntities: [], techRadar: [], businessProcesses: [],
        } as ArchitectureModel;

        const report = new ConsistencyChecker(model, rootDir).check();
        // The bad module should have a lower error handling score
        const badScore = report.moduleScores.find((s) => s.module === "bad-module");
        const goodScore = report.moduleScores.find((s) => s.module === "good-module");
        expect(badScore).toBeDefined();
        expect(goodScore).toBeDefined();
        expect(badScore!.errorHandling).toBeLessThan(goodScore!.errorHandling);
      } finally {
        cleanup();
      }
    });
  });
});
