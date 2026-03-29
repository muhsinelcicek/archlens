import { describe, it, expect } from "vitest";
import { calculateComplexity, getLanguageRules } from "../analyzers/language-rules.js";
import type { Symbol } from "../models/index.js";

function makeSym(overrides: Partial<Symbol> = {}): Symbol {
  return { uid: "test", name: "test", filePath: "test.ts", kind: "function", language: "typescript", visibility: "public", startLine: 1, endLine: 10, ...overrides };
}

describe("calculateComplexity", () => {
  it("should return base complexity 1 for simple function", () => {
    const result = calculateComplexity("function foo() { return 1; }", "typescript");
    expect(result.cyclomatic).toBe(1);
  });

  it("should count if/else branches", () => {
    const code = `function foo(x) {
      if (x > 0) { return 1; }
      else if (x < 0) { return -1; }
      else { return 0; }
    }`;
    const result = calculateComplexity(code, "typescript");
    expect(result.cyclomatic).toBeGreaterThanOrEqual(3);
  });

  it("should count Python branches (elif, and, or)", () => {
    const code = `def foo(x):
    if x > 0 and x < 10:
        return True
    elif x < 0 or x > 100:
        return False
    for i in range(10):
        pass`;
    const result = calculateComplexity(code, "python");
    expect(result.cyclomatic).toBeGreaterThanOrEqual(5);
  });

  it("should count C# specific patterns (foreach, ??)", () => {
    const code = `public void Process(List<int> items) {
      foreach (var item in items) {
        if (item > 0) { Do(item); }
      }
      var x = value ?? defaultValue;
    }`;
    const result = calculateComplexity(code, "csharp");
    expect(result.cyclomatic).toBeGreaterThanOrEqual(3);
  });

  it("should count Go select/case", () => {
    const code = `func handler(ch chan int) {
      select {
      case v := <-ch:
        fmt.Println(v)
      case <-time.After(1 * time.Second):
        fmt.Println("timeout")
      }
    }`;
    const result = calculateComplexity(code, "go");
    expect(result.cyclomatic).toBeGreaterThanOrEqual(3);
  });

  it("should track nesting depth", () => {
    const code = `function deep() {
      if (a) {
        if (b) {
          if (c) {
            if (d) {
              if (e) { return true; }
            }
          }
        }
      }
    }`;
    const result = calculateComplexity(code, "typescript");
    expect(result.nesting).toBeGreaterThanOrEqual(5);
  });

  it("should calculate cognitive complexity with nesting penalty", () => {
    const simple = `function simple(x) {\n  if (x) return 1;\n  return 0;\n}`;
    const nested = `function nested(x) {\n  if (x) {\n    if (x > 1) {\n      if (x > 2) {\n        return 3;\n      }\n    }\n  }\n  return 0;\n}`;
    const simpleResult = calculateComplexity(simple, "typescript");
    const nestedResult = calculateComplexity(nested, "typescript");
    expect(nestedResult.cognitive).toBeGreaterThanOrEqual(simpleResult.cognitive);
    expect(nestedResult.nesting).toBeGreaterThan(simpleResult.nesting);
  });
});

describe("getLanguageRules — C#", () => {
  it("should detect async without await", () => {
    const sym = makeSym({ language: "csharp", filePath: "test.cs" });
    const issues = getLanguageRules(sym, "public async Task DoWork() { Thread.Sleep(1000); }", "csharp");
    expect(issues.some((i) => i.rule === "csharp/async-without-await")).toBe(true);
  });

  it("should detect empty catch", () => {
    const sym = makeSym({ language: "csharp", filePath: "test.cs" });
    const issues = getLanguageRules(sym, "try { Do(); } catch (Exception ex) { }", "csharp");
    expect(issues.some((i) => i.rule === "csharp/empty-catch")).toBe(true);
  });
});

describe("getLanguageRules — TypeScript", () => {
  it("should detect any usage", () => {
    const sym = makeSym();
    const issues = getLanguageRules(sym, "function foo(data: any): any { return data; }", "typescript");
    expect(issues.some((i) => i.rule === "typescript/no-any")).toBe(true);
  });

  it("should detect console.log", () => {
    const sym = makeSym({ filePath: "src/service.ts" });
    const issues = getLanguageRules(sym, "console.log('debug');", "typescript");
    expect(issues.some((i) => i.rule === "typescript/no-console")).toBe(true);
  });

  it("should NOT flag console.log in test files", () => {
    const sym = makeSym({ filePath: "src/service.test.ts" });
    const issues = getLanguageRules(sym, "console.log('debug');", "typescript");
    expect(issues.some((i) => i.rule === "typescript/no-console")).toBe(false);
  });
});

describe("getLanguageRules — Python", () => {
  it("should detect bare except", () => {
    const sym = makeSym({ language: "python", filePath: "test.py" });
    const issues = getLanguageRules(sym, "try:\n  do()\nexcept:\n  pass", "python");
    expect(issues.some((i) => i.rule === "python/bare-except")).toBe(true);
  });

  it("should detect mutable default argument", () => {
    const sym = makeSym({ language: "python", filePath: "test.py" });
    const issues = getLanguageRules(sym, "def foo(items=[]):\n  items.append(1)", "python");
    expect(issues.some((i) => i.rule === "python/mutable-default")).toBe(true);
  });
});

describe("getLanguageRules — Go", () => {
  it("should detect unchecked error", () => {
    const sym = makeSym({ language: "go", filePath: "test.go" });
    const issues = getLanguageRules(sym, "result, _ := doSomething()", "go");
    expect(issues.some((i) => i.rule === "go/unchecked-error")).toBe(true);
  });
});

describe("getLanguageRules — Rust", () => {
  it("should detect excessive unwrap", () => {
    const sym = makeSym({ language: "rust", filePath: "test.rs" });
    const issues = getLanguageRules(sym, "let a = x.unwrap();\nlet b = y.unwrap();\nlet c = z.unwrap();", "rust");
    expect(issues.some((i) => i.rule === "rust/excessive-unwrap")).toBe(true);
  });
});

describe("getLanguageRules — Swift", () => {
  it("should detect excessive force unwrap", () => {
    const sym = makeSym({ language: "swift", filePath: "test.swift" });
    const issues = getLanguageRules(sym, "let a = x!\nlet b = y!\nlet c = z!\nlet d = w!", "swift");
    expect(issues.some((i) => i.rule === "swift/force-unwrap")).toBe(true);
  });
});
