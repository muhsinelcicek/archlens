import { describe, it, expect } from "vitest";
import type { ArchitectureModel, Symbol, Module } from "../models/index.js";
import { ProcessDetector } from "../analyzers/process-detector.js";

function createModel(overrides: Partial<ArchitectureModel> = {}): ArchitectureModel {
  return {
    project: { name: "test", rootPath: "/test", analyzedAt: new Date().toISOString(), version: "0.1.0" },
    stats: { files: 0, symbols: 0, relations: 0, modules: 0, languages: {} as any, totalLines: 0 },
    symbols: new Map<string, Symbol>(),
    relations: [],
    modules: [],
    layers: { application: [], presentation: [], api: [], domain: [], infrastructure: [], config: [], test: [], unknown: [] },
    dataFlows: [],
    apiEndpoints: [],
    dbEntities: [],
    techRadar: [],
    businessProcesses: [],
    ...overrides,
  } as ArchitectureModel;
}

describe("ProcessDetector", () => {
  describe("ETL process detection", () => {
    it("should detect ETL process when adapter/importer symbols exist", () => {
      const symbols = new Map<string, Symbol>();
      symbols.set("class:adapters/CsvAdapter.ts:CsvAdapter", {
        uid: "class:adapters/CsvAdapter.ts:CsvAdapter", name: "CsvAdapter",
        filePath: "adapters/CsvAdapter.ts", kind: "class", language: "typescript",
        visibility: "public", startLine: 1, endLine: 80,
      });
      symbols.set("method:adapters/CsvAdapter.ts:CsvAdapter.read_csv", {
        uid: "method:adapters/CsvAdapter.ts:CsvAdapter.read_csv", name: "CsvAdapter.read_csv",
        filePath: "adapters/CsvAdapter.ts", kind: "method", language: "typescript",
        visibility: "public", startLine: 10, endLine: 25,
      });
      symbols.set("method:adapters/CsvAdapter.ts:CsvAdapter.transform", {
        uid: "method:adapters/CsvAdapter.ts:CsvAdapter.transform", name: "CsvAdapter.transform",
        filePath: "adapters/CsvAdapter.ts", kind: "method", language: "typescript",
        visibility: "public", startLine: 30, endLine: 50,
      });
      symbols.set("method:adapters/CsvAdapter.ts:CsvAdapter.load", {
        uid: "method:adapters/CsvAdapter.ts:CsvAdapter.load", name: "CsvAdapter.load",
        filePath: "adapters/CsvAdapter.ts", kind: "method", language: "typescript",
        visibility: "public", startLine: 55, endLine: 70,
      });

      const model = createModel({
        symbols,
        relations: [
          { source: "class:adapters/CsvAdapter.ts:CsvAdapter", target: "method:adapters/CsvAdapter.ts:CsvAdapter.read_csv", type: "composes" },
          { source: "class:adapters/CsvAdapter.ts:CsvAdapter", target: "method:adapters/CsvAdapter.ts:CsvAdapter.transform", type: "composes" },
          { source: "class:adapters/CsvAdapter.ts:CsvAdapter", target: "method:adapters/CsvAdapter.ts:CsvAdapter.load", type: "composes" },
        ],
        modules: [{
          name: "adapters", path: "src/adapters", layer: "infrastructure",
          symbols: [...symbols.keys()], dependencies: [],
          language: "typescript", fileCount: 1, lineCount: 80,
        }],
      });

      const detector = new ProcessDetector();
      const processes = detector.detect(model);

      const etl = processes.find((p) => p.id === "etl-pipeline");
      expect(etl).toBeDefined();
      expect(etl!.category).toBe("data-ingestion");
      expect(etl!.dataSources.length).toBeGreaterThan(0);
      expect(etl!.steps.length).toBeGreaterThanOrEqual(3); // extract, transform, load
    });

    it("should detect CSV/Excel data sources", () => {
      const symbols = new Map<string, Symbol>();
      symbols.set("class:adapters/ExcelImporter.ts:ExcelImporter", {
        uid: "class:adapters/ExcelImporter.ts:ExcelImporter", name: "ExcelImporter",
        filePath: "adapters/ExcelImporter.ts", kind: "class", language: "typescript",
        visibility: "public", startLine: 1, endLine: 40,
      });

      const model = createModel({
        symbols,
        modules: [{
          name: "adapters", path: "src/adapters", layer: "infrastructure",
          symbols: [...symbols.keys()], dependencies: [],
          language: "typescript", fileCount: 1, lineCount: 40,
        }],
      });

      const processes = new ProcessDetector().detect(model);
      const etl = processes.find((p) => p.id === "etl-pipeline");
      expect(etl).toBeDefined();
      expect(etl!.dataSources.some((ds) => ds.type === "file")).toBe(true);
    });

    it("should detect database adapter data sources", () => {
      const symbols = new Map<string, Symbol>();
      symbols.set("class:adapters/DbLoader.ts:DbLoader", {
        uid: "class:adapters/DbLoader.ts:DbLoader", name: "DbLoader",
        filePath: "adapters/DbLoader.ts", kind: "class", language: "typescript",
        visibility: "public", startLine: 1, endLine: 60,
      });

      const model = createModel({
        symbols,
        modules: [{
          name: "adapters", path: "src/adapters", layer: "infrastructure",
          symbols: [...symbols.keys()], dependencies: [],
          language: "typescript", fileCount: 1, lineCount: 60,
        }],
      });

      const processes = new ProcessDetector().detect(model);
      const etl = processes.find((p) => p.id === "etl-pipeline");
      expect(etl).toBeDefined();
      expect(etl!.dataSources.some((ds) => ds.type === "database")).toBe(true);
    });

    it("should produce generic ETL steps when no specific methods detected", () => {
      const symbols = new Map<string, Symbol>();
      symbols.set("class:pipeline/Connector.ts:Connector", {
        uid: "class:pipeline/Connector.ts:Connector", name: "Connector",
        filePath: "pipeline/Connector.ts", kind: "class", language: "typescript",
        visibility: "public", startLine: 1, endLine: 20,
      });

      const model = createModel({
        symbols,
        modules: [{
          name: "pipeline", path: "src/pipeline", layer: "infrastructure",
          symbols: [...symbols.keys()], dependencies: [],
          language: "typescript", fileCount: 1, lineCount: 20,
        }],
      });

      const processes = new ProcessDetector().detect(model);
      const etl = processes.find((p) => p.id === "etl-pipeline");
      expect(etl).toBeDefined();
      expect(etl!.steps.length).toBe(3); // generic Extract/Transform/Load
      expect(etl!.steps[0].name).toBe("Extract");
      expect(etl!.steps[1].name).toBe("Transform");
      expect(etl!.steps[2].name).toBe("Load");
    });
  });

  describe("analysis process detection", () => {
    it("should detect sales analysis process from SalesAnalyzer class", () => {
      const symbols = new Map<string, Symbol>();
      symbols.set("class:analytics/SalesAnalyzer.ts:SalesAnalyzer", {
        uid: "class:analytics/SalesAnalyzer.ts:SalesAnalyzer", name: "SalesAnalyzer",
        filePath: "analytics/SalesAnalyzer.ts", kind: "class", language: "typescript",
        visibility: "public", startLine: 1, endLine: 200,
      });
      symbols.set("method:analytics/SalesAnalyzer.ts:SalesAnalyzer.summary", {
        uid: "method:analytics/SalesAnalyzer.ts:SalesAnalyzer.summary", name: "SalesAnalyzer.summary",
        filePath: "analytics/SalesAnalyzer.ts", kind: "method", language: "typescript",
        visibility: "public", startLine: 10, endLine: 40,
      });
      symbols.set("method:analytics/SalesAnalyzer.ts:SalesAnalyzer.top_products", {
        uid: "method:analytics/SalesAnalyzer.ts:SalesAnalyzer.top_products", name: "SalesAnalyzer.top_products",
        filePath: "analytics/SalesAnalyzer.ts", kind: "method", language: "typescript",
        visibility: "public", startLine: 45, endLine: 80,
      });

      const model = createModel({
        symbols,
        relations: [
          { source: "class:analytics/SalesAnalyzer.ts:SalesAnalyzer", target: "method:analytics/SalesAnalyzer.ts:SalesAnalyzer.summary", type: "composes" },
          { source: "class:analytics/SalesAnalyzer.ts:SalesAnalyzer", target: "method:analytics/SalesAnalyzer.ts:SalesAnalyzer.top_products", type: "composes" },
        ],
        modules: [{
          name: "analytics", path: "src/analytics", layer: "application",
          symbols: [...symbols.keys()], dependencies: [],
          language: "typescript", fileCount: 1, lineCount: 200,
        }],
      });

      const processes = new ProcessDetector().detect(model);
      const sales = processes.find((p) => p.name === "Sales Analysis Engine");
      expect(sales).toBeDefined();
      expect(sales!.category).toBe("analysis");
      expect(sales!.steps.some((s) => s.name === "Calculate KPIs")).toBe(true);
      expect(sales!.steps.some((s) => s.name.includes("Pareto"))).toBe(true);
    });

    it("should detect stock/inventory analysis process", () => {
      const symbols = new Map<string, Symbol>();
      symbols.set("class:analytics/StockAnalyzer.ts:StockAnalyzer", {
        uid: "class:analytics/StockAnalyzer.ts:StockAnalyzer", name: "StockAnalyzer",
        filePath: "analytics/StockAnalyzer.ts", kind: "class", language: "typescript",
        visibility: "public", startLine: 1, endLine: 150,
      });
      symbols.set("method:analytics/StockAnalyzer.ts:StockAnalyzer.abc_analysis", {
        uid: "method:analytics/StockAnalyzer.ts:StockAnalyzer.abc_analysis", name: "StockAnalyzer.abc_analysis",
        filePath: "analytics/StockAnalyzer.ts", kind: "method", language: "typescript",
        visibility: "public", startLine: 10, endLine: 50,
      });

      const model = createModel({
        symbols,
        relations: [
          { source: "class:analytics/StockAnalyzer.ts:StockAnalyzer", target: "method:analytics/StockAnalyzer.ts:StockAnalyzer.abc_analysis", type: "composes" },
        ],
        modules: [{
          name: "analytics", path: "src/analytics", layer: "application",
          symbols: [...symbols.keys()], dependencies: [],
          language: "typescript", fileCount: 1, lineCount: 150,
        }],
      });

      const processes = new ProcessDetector().detect(model);
      const stock = processes.find((p) => p.name === "Stock & Inventory Analysis Engine");
      expect(stock).toBeDefined();
      expect(stock!.category).toBe("analysis");
      expect(stock!.steps.some((s) => s.name.includes("ABC"))).toBe(true);
    });

    it("should detect customer RFM analysis process", () => {
      const symbols = new Map<string, Symbol>();
      symbols.set("class:analytics/CustomerAnalyzer.ts:CustomerAnalyzer", {
        uid: "class:analytics/CustomerAnalyzer.ts:CustomerAnalyzer", name: "CustomerAnalyzer",
        filePath: "analytics/CustomerAnalyzer.ts", kind: "class", language: "typescript",
        visibility: "public", startLine: 1, endLine: 180,
      });
      symbols.set("method:analytics/CustomerAnalyzer.ts:CustomerAnalyzer.rfm_analysis", {
        uid: "method:analytics/CustomerAnalyzer.ts:CustomerAnalyzer.rfm_analysis", name: "CustomerAnalyzer.rfm_analysis",
        filePath: "analytics/CustomerAnalyzer.ts", kind: "method", language: "typescript",
        visibility: "public", startLine: 10, endLine: 60,
      });
      symbols.set("method:analytics/CustomerAnalyzer.ts:CustomerAnalyzer.segment", {
        uid: "method:analytics/CustomerAnalyzer.ts:CustomerAnalyzer.segment", name: "CustomerAnalyzer.segment",
        filePath: "analytics/CustomerAnalyzer.ts", kind: "method", language: "typescript",
        visibility: "public", startLine: 65, endLine: 120,
      });

      const model = createModel({
        symbols,
        relations: [
          { source: "class:analytics/CustomerAnalyzer.ts:CustomerAnalyzer", target: "method:analytics/CustomerAnalyzer.ts:CustomerAnalyzer.rfm_analysis", type: "composes" },
          { source: "class:analytics/CustomerAnalyzer.ts:CustomerAnalyzer", target: "method:analytics/CustomerAnalyzer.ts:CustomerAnalyzer.segment", type: "composes" },
        ],
        modules: [{
          name: "analytics", path: "src/analytics", layer: "application",
          symbols: [...symbols.keys()], dependencies: [],
          language: "typescript", fileCount: 1, lineCount: 180,
        }],
      });

      const processes = new ProcessDetector().detect(model);
      const customer = processes.find((p) => p.name === "Customer Intelligence Engine");
      expect(customer).toBeDefined();
      expect(customer!.category).toBe("analysis");
      expect(customer!.steps.some((s) => s.name.includes("RFM"))).toBe(true);
      expect(customer!.steps.some((s) => s.name.includes("Segmentation"))).toBe(true);
    });
  });

  describe("API process detection", () => {
    it("should detect API service layer from apiEndpoints", () => {
      const model = createModel({
        apiEndpoints: [
          { method: "GET", path: "/api/users", handler: "fn:UserController.list", params: [], filePath: "controller.ts", line: 10 },
          { method: "POST", path: "/api/users", handler: "fn:UserController.create", params: [], filePath: "controller.ts", line: 20 },
          { method: "GET", path: "/api/orders", handler: "fn:OrderController.list", params: [], filePath: "controller.ts", line: 30 },
        ],
      });

      const processes = new ProcessDetector().detect(model);
      const api = processes.find((p) => p.id === "api-services");
      expect(api).toBeDefined();
      expect(api!.category).toBe("api-service");
      expect(api!.description).toContain("3 endpoints");
    });

    it("should group endpoints by resource", () => {
      const model = createModel({
        apiEndpoints: [
          { method: "GET", path: "/api/products", handler: "fn:a", params: [], filePath: "a.ts", line: 1 },
          { method: "POST", path: "/api/products", handler: "fn:b", params: [], filePath: "a.ts", line: 5 },
          { method: "GET", path: "/api/categories", handler: "fn:c", params: [], filePath: "b.ts", line: 1 },
        ],
      });

      const processes = new ProcessDetector().detect(model);
      const api = processes.find((p) => p.id === "api-services");
      expect(api).toBeDefined();
      // 2 resource groups: products, categories
      expect(api!.steps.length).toBe(2);
    });

    it("should not create API process when no endpoints exist", () => {
      const model = createModel();
      const processes = new ProcessDetector().detect(model);
      expect(processes.find((p) => p.id === "api-services")).toBeUndefined();
    });
  });

  describe("alert process detection", () => {
    it("should detect alert system from alert-related symbols", () => {
      const symbols = new Map<string, Symbol>();
      symbols.set("class:alerts/ExpiryAlert.ts:ExpiryAlert", {
        uid: "class:alerts/ExpiryAlert.ts:ExpiryAlert", name: "ExpiryAlert",
        filePath: "alerts/ExpiryAlert.ts", kind: "class", language: "typescript",
        visibility: "public", startLine: 1, endLine: 40,
      });

      const model = createModel({
        symbols,
        modules: [{
          name: "alerts", path: "src/alerts", layer: "application",
          symbols: [...symbols.keys()], dependencies: [],
          language: "typescript", fileCount: 1, lineCount: 40,
        }],
      });

      const processes = new ProcessDetector().detect(model);
      const alert = processes.find((p) => p.id === "alert-system");
      expect(alert).toBeDefined();
      expect(alert!.category).toBe("alert");
      expect(alert!.steps.length).toBeGreaterThanOrEqual(3);
    });

    it("should not create alert process if no alert symbols exist", () => {
      const symbols = new Map<string, Symbol>();
      symbols.set("class:svc.ts:UserService", {
        uid: "class:svc.ts:UserService", name: "UserService", filePath: "svc.ts",
        kind: "class", language: "typescript", visibility: "public",
        startLine: 1, endLine: 20,
      });

      const model = createModel({
        symbols,
        modules: [{
          name: "services", path: "src", layer: "application",
          symbols: [...symbols.keys()], dependencies: [],
          language: "typescript", fileCount: 1, lineCount: 20,
        }],
      });

      const processes = new ProcessDetector().detect(model);
      expect(processes.find((p) => p.id === "alert-system")).toBeUndefined();
    });
  });

  describe("presentation process detection", () => {
    it("should detect dashboard from page/component symbols", () => {
      const symbols = new Map<string, Symbol>();
      symbols.set("fn:pages/DashboardPage.tsx:DashboardPage", {
        uid: "fn:pages/DashboardPage.tsx:DashboardPage", name: "DashboardPage",
        filePath: "pages/DashboardPage.tsx", kind: "function", language: "typescript",
        visibility: "public", startLine: 1, endLine: 50,
      });
      symbols.set("fn:pages/ReportsPage.tsx:ReportsPage", {
        uid: "fn:pages/ReportsPage.tsx:ReportsPage", name: "ReportsPage",
        filePath: "pages/ReportsPage.tsx", kind: "function", language: "typescript",
        visibility: "public", startLine: 1, endLine: 40,
      });

      const model = createModel({
        symbols,
        modules: [{
          name: "ui", path: "src/pages", layer: "presentation",
          symbols: [...symbols.keys()], dependencies: [],
          language: "typescript", fileCount: 2, lineCount: 90,
        }],
      });

      const processes = new ProcessDetector().detect(model);
      const presentation = processes.find((p) => p.id === "presentation-layer");
      expect(presentation).toBeDefined();
      expect(presentation!.category).toBe("presentation");
      expect(presentation!.description).toContain("2 pages");
    });
  });

  describe("process output structure", () => {
    it("each process should have required fields", () => {
      const symbols = new Map<string, Symbol>();
      symbols.set("class:loader/DataImporter.ts:DataImporter", {
        uid: "class:loader/DataImporter.ts:DataImporter", name: "DataImporter",
        filePath: "loader/DataImporter.ts", kind: "class", language: "typescript",
        visibility: "public", startLine: 1, endLine: 60,
      });

      const model = createModel({
        symbols,
        modules: [{
          name: "loader", path: "src/loader", layer: "infrastructure",
          symbols: [...symbols.keys()], dependencies: [],
          language: "typescript", fileCount: 1, lineCount: 60,
        }],
      });

      const processes = new ProcessDetector().detect(model);
      for (const process of processes) {
        expect(process).toHaveProperty("id");
        expect(process).toHaveProperty("name");
        expect(process).toHaveProperty("description");
        expect(process).toHaveProperty("category");
        expect(process).toHaveProperty("dataSources");
        expect(process).toHaveProperty("steps");
        expect(process).toHaveProperty("outputs");
        expect(process).toHaveProperty("relatedSymbols");
        expect(["data-ingestion", "analysis", "api-service", "presentation", "alert", "export"]).toContain(process.category);
        expect(Array.isArray(process.dataSources)).toBe(true);
        expect(Array.isArray(process.steps)).toBe(true);
        expect(Array.isArray(process.outputs)).toBe(true);
      }
    });

    it("steps should be ordered sequentially", () => {
      const symbols = new Map<string, Symbol>();
      symbols.set("class:adapters/CsvAdapter.ts:CsvAdapter", {
        uid: "class:adapters/CsvAdapter.ts:CsvAdapter", name: "CsvAdapter",
        filePath: "adapters/CsvAdapter.ts", kind: "class", language: "typescript",
        visibility: "public", startLine: 1, endLine: 80,
      });

      const model = createModel({
        symbols,
        modules: [{
          name: "adapters", path: "src/adapters", layer: "infrastructure",
          symbols: [...symbols.keys()], dependencies: [],
          language: "typescript", fileCount: 1, lineCount: 80,
        }],
      });

      const processes = new ProcessDetector().detect(model);
      for (const process of processes) {
        for (let i = 0; i < process.steps.length; i++) {
          expect(process.steps[i].order).toBe(i + 1);
        }
      }
    });
  });
});
