import { describe, it, expect } from "vitest";
import { TypeScriptParser } from "../parsers/typescript-parser.js";
import { PythonParser } from "../parsers/python-parser.js";
import { CSharpParser } from "../parsers/csharp-parser.js";
import { GoParser } from "../parsers/go-parser.js";
import { JavaParser } from "../parsers/java-parser.js";
import { getParserForFile, getSupportedExtensions } from "../parsers/index.js";

describe("Parser Registry", () => {
  it("should support 10 file extensions", () => {
    const exts = getSupportedExtensions();
    expect(exts).toContain(".ts");
    expect(exts).toContain(".py");
    expect(exts).toContain(".cs");
    expect(exts).toContain(".go");
    expect(exts).toContain(".java");
    expect(exts).toContain(".swift");
    expect(exts).toContain(".rs");
    expect(exts.length).toBeGreaterThanOrEqual(10);
  });

  it("should return correct parser for each extension", () => {
    expect(getParserForFile("foo.ts")).toBeInstanceOf(TypeScriptParser);
    expect(getParserForFile("foo.py")).toBeInstanceOf(PythonParser);
    expect(getParserForFile("foo.cs")).toBeInstanceOf(CSharpParser);
    expect(getParserForFile("foo.go")).toBeInstanceOf(GoParser);
    expect(getParserForFile("foo.java")).toBeInstanceOf(JavaParser);
    expect(getParserForFile("foo.unknown")).toBeUndefined();
  });
});

describe("TypeScript Parser", () => {
  const parser = new TypeScriptParser();

  it("should extract functions", () => {
    const result = parser.parse("test.ts", `export function hello(name: string): string { return name; }`, { rootDir: "." });
    expect(result.symbols.length).toBeGreaterThan(0);
    const fn = result.symbols.find((s) => s.name === "hello");
    expect(fn).toBeDefined();
    expect(fn!.kind).toBe("function");
    expect(fn!.language).toBe("typescript");
  });

  it("should extract classes with methods", () => {
    const result = parser.parse("test.ts", `
      class UserService {
        getUser(id: number): User { return {} as User; }
        createUser(data: any): void {}
      }
    `, { rootDir: "." });
    const cls = result.symbols.find((s) => s.kind === "class");
    expect(cls).toBeDefined();
    expect(cls!.name).toBe("UserService");
    const methods = result.symbols.filter((s) => s.kind === "method");
    expect(methods.length).toBe(2);
  });

  it("should extract interfaces", () => {
    const result = parser.parse("test.ts", `interface IUserRepo { getById(id: number): User; }`, { rootDir: "." });
    const iface = result.symbols.find((s) => s.kind === "interface");
    expect(iface).toBeDefined();
    expect(iface!.name).toBe("IUserRepo");
  });

  it("should extract imports", () => {
    const result = parser.parse("test.ts", `import { Router } from "express";`, { rootDir: "." });
    expect(result.imports.length).toBeGreaterThan(0);
    expect(result.imports[0].names).toContain("Router");
  });

  it("should detect React framework", () => {
    const result = parser.detectFrameworkPatterns("app.tsx", `import React from "react"; function App() { return <div/>; }`);
    expect(result.framework).toBe("react");
  });
});

describe("Python Parser", () => {
  const parser = new PythonParser();

  it("should extract functions", () => {
    const result = parser.parse("test.py", `def calculate(x: int, y: int) -> int:\n    return x + y`, { rootDir: "." });
    const fn = result.symbols.find((s) => s.name === "calculate");
    expect(fn).toBeDefined();
    expect(fn!.kind).toBe("function");
    expect(fn!.language).toBe("python");
  });

  it("should extract classes", () => {
    const result = parser.parse("test.py", `class UserService:\n    def get_user(self, id):\n        pass`, { rootDir: "." });
    const cls = result.symbols.find((s) => s.kind === "class");
    expect(cls).toBeDefined();
  });

  it("should detect FastAPI endpoints", () => {
    const result = parser.parse("test.py", `from fastapi import FastAPI\napp = FastAPI()\n@app.get("/users")\ndef get_users():\n    pass`, { rootDir: "." });
    expect(result.apiEndpoints.length).toBeGreaterThan(0);
    expect(result.apiEndpoints[0].path).toBe("/users");
    expect(result.apiEndpoints[0].method).toBe("GET");
  });

  it("should detect SQLAlchemy models", () => {
    const result = parser.parse("test.py", `from sqlalchemy import Column, String\nclass User(Base):\n    __tablename__ = "users"\n    name = Column(String)`, { rootDir: "." });
    expect(result.dbEntities.length).toBeGreaterThan(0);
    expect(result.dbEntities[0].name).toBe("User");
  });
});

describe("C# Parser", () => {
  const parser = new CSharpParser();

  it("should extract classes", () => {
    const result = parser.parse("test.cs", `namespace Test { public class Order { public int Id { get; set; } } }`, { rootDir: "." });
    const cls = result.symbols.find((s) => s.kind === "class" && s.name === "Order");
    expect(cls).toBeDefined();
    expect(cls!.language).toBe("csharp");
  });

  it("should extract ASP.NET endpoints", () => {
    const result = parser.parse("test.cs", `
      [ApiController]
      [Route("api/[controller]")]
      public class UsersController : ControllerBase {
        [HttpGet]
        public IActionResult GetAll() { return Ok(); }
        [HttpPost]
        public IActionResult Create() { return Ok(); }
      }
    `, { rootDir: "." });
    expect(result.apiEndpoints.length).toBeGreaterThanOrEqual(2);
  });

  it("should extract using statements", () => {
    const result = parser.parse("test.cs", `using System.Collections.Generic;\nusing MyApp.Models;\npublic class Test {}`, { rootDir: "." });
    expect(result.imports.length).toBeGreaterThan(0);
  });
});

describe("Go Parser", () => {
  const parser = new GoParser();

  it("should extract functions", () => {
    const result = parser.parse("test.go", `package main\nfunc Hello(name string) string { return name }`, { rootDir: "." });
    const fn = result.symbols.find((s) => s.name === "Hello");
    expect(fn).toBeDefined();
    expect(fn!.visibility).toBe("public"); // Uppercase = exported
  });

  it("should extract structs", () => {
    const result = parser.parse("test.go", `package main\ntype User struct { Name string; Age int }`, { rootDir: "." });
    const cls = result.symbols.find((s) => s.kind === "class" && s.name === "User");
    expect(cls).toBeDefined();
  });
});

describe("Java Parser", () => {
  const parser = new JavaParser();

  it("should extract classes", () => {
    const result = parser.parse("Test.java", `public class UserService { public User getUser(int id) { return null; } }`, { rootDir: "." });
    const cls = result.symbols.find((s) => s.kind === "class");
    expect(cls).toBeDefined();
  });

  it("should detect Spring endpoints", () => {
    const result = parser.parse("Test.java", `
      @RestController
      @RequestMapping("/api/users")
      public class UserController {
        @GetMapping("/{id}")
        public User getById(@PathVariable int id) { return null; }
      }
    `, { rootDir: "." });
    expect(result.apiEndpoints.length).toBeGreaterThan(0);
  });
});
