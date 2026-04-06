import { describe, it, expect } from "vitest";
import type { ArchitectureModel, Symbol, Module } from "../models/index.js";
import { EventFlowDetector } from "../analyzers/event-flow-detector.js";

function createModel(overrides: Partial<ArchitectureModel> = {}): ArchitectureModel {
  const symbols = new Map<string, Symbol>();
  const modules: Module[] = [];

  return {
    project: { name: "test", rootPath: "/test", analyzedAt: new Date().toISOString(), version: "0.1.0" },
    stats: { files: 0, symbols: 0, relations: 0, modules: 0, languages: {} as any, totalLines: 0 },
    symbols,
    relations: [],
    modules,
    layers: { application: [], presentation: [], api: [], domain: [], infrastructure: [], config: [], test: [], unknown: [] },
    dataFlows: [],
    apiEndpoints: [],
    dbEntities: [],
    techRadar: [],
    businessProcesses: [],
    ...overrides,
  } as ArchitectureModel;
}

describe("EventFlowDetector", () => {
  describe("event detection", () => {
    it("should detect domain events with matching handlers", () => {
      const symbols = new Map<string, Symbol>();
      symbols.set("class:events/OrderPlacedEvent.ts:OrderPlacedEvent", {
        uid: "class:events/OrderPlacedEvent.ts:OrderPlacedEvent", name: "OrderPlacedEvent",
        filePath: "events/OrderPlacedEvent.ts", kind: "class", language: "typescript",
        visibility: "public", startLine: 1, endLine: 10,
      });
      symbols.set("class:handlers/OrderPlacedHandler.ts:OrderPlacedHandler", {
        uid: "class:handlers/OrderPlacedHandler.ts:OrderPlacedHandler", name: "OrderPlacedHandler",
        filePath: "handlers/OrderPlacedHandler.ts", kind: "class", language: "typescript",
        visibility: "public", startLine: 1, endLine: 20,
      });

      const model = createModel({
        symbols,
        modules: [{
          name: "ordering", path: "src/ordering", layer: "domain",
          symbols: [...symbols.keys()], dependencies: [],
          language: "typescript", fileCount: 2, lineCount: 30,
        }],
      });

      const report = new EventFlowDetector(model).detect();
      const orderEvent = report.events.find((e) => e.eventName === "OrderPlacedEvent");
      expect(orderEvent).toBeDefined();
      expect(orderEvent!.subscribers.length).toBe(1);
      expect(orderEvent!.subscribers[0].symbol).toBe("OrderPlacedHandler");
    });

    it("should classify IntegrationEvent as integration type", () => {
      const symbols = new Map<string, Symbol>();
      symbols.set("class:events/OrderShippedIntegrationEvent.ts:OrderShippedIntegrationEvent", {
        uid: "class:events/OrderShippedIntegrationEvent.ts:OrderShippedIntegrationEvent",
        name: "OrderShippedIntegrationEvent",
        filePath: "events/OrderShippedIntegrationEvent.ts", kind: "class", language: "csharp",
        visibility: "public", startLine: 1, endLine: 15,
      });
      // Integration events should appear even without subscribers
      const model = createModel({
        symbols,
        modules: [{
          name: "shipping", path: "src/shipping", layer: "domain",
          symbols: [...symbols.keys()], dependencies: [],
          language: "csharp", fileCount: 1, lineCount: 15,
        }],
      });

      const report = new EventFlowDetector(model).detect();
      const event = report.events.find((e) => e.eventName === "OrderShippedIntegrationEvent");
      expect(event).toBeDefined();
      expect(event!.eventType).toBe("integration");
    });

    it("should classify DomainEvent as domain type", () => {
      const symbols = new Map<string, Symbol>();
      // DomainEvent: name contains "Domain" and ends with "Event"
      // The detector strips "IntegrationEvent" then "Event", leaving "PaymentDomain"
      // So the handler name must contain "PaymentDomain"
      symbols.set("class:events/PaymentDomainEvent.ts:PaymentDomainEvent", {
        uid: "class:events/PaymentDomainEvent.ts:PaymentDomainEvent",
        name: "PaymentDomainEvent",
        filePath: "events/PaymentDomainEvent.ts", kind: "class", language: "typescript",
        visibility: "public", startLine: 1, endLine: 10,
      });
      symbols.set("class:handlers/PaymentDomainHandler.ts:PaymentDomainHandler", {
        uid: "class:handlers/PaymentDomainHandler.ts:PaymentDomainHandler",
        name: "PaymentDomainHandler",
        filePath: "handlers/PaymentDomainHandler.ts", kind: "class", language: "typescript",
        visibility: "public", startLine: 1, endLine: 20,
      });

      const model = createModel({
        symbols,
        modules: [{
          name: "payments", path: "src/payments", layer: "domain",
          symbols: [...symbols.keys()], dependencies: [],
          language: "typescript", fileCount: 2, lineCount: 30,
        }],
      });

      const report = new EventFlowDetector(model).detect();
      const event = report.events.find((e) => e.eventName === "PaymentDomainEvent");
      expect(event).toBeDefined();
      expect(event!.eventType).toBe("domain");
      expect(event!.subscribers.length).toBe(1);
    });

    it("should match Consumer suffix as subscriber", () => {
      const symbols = new Map<string, Symbol>();
      symbols.set("class:events/StockUpdatedEvent.ts:StockUpdatedEvent", {
        uid: "class:events/StockUpdatedEvent.ts:StockUpdatedEvent",
        name: "StockUpdatedEvent",
        filePath: "events/StockUpdatedEvent.ts", kind: "class", language: "typescript",
        visibility: "public", startLine: 1, endLine: 10,
      });
      symbols.set("class:consumers/StockUpdatedConsumer.ts:StockUpdatedConsumer", {
        uid: "class:consumers/StockUpdatedConsumer.ts:StockUpdatedConsumer",
        name: "StockUpdatedConsumer",
        filePath: "consumers/StockUpdatedConsumer.ts", kind: "class", language: "typescript",
        visibility: "public", startLine: 1, endLine: 20,
      });

      const model = createModel({
        symbols,
        modules: [{
          name: "inventory", path: "src/inventory", layer: "application",
          symbols: [...symbols.keys()], dependencies: [],
          language: "typescript", fileCount: 2, lineCount: 30,
        }],
      });

      const report = new EventFlowDetector(model).detect();
      const event = report.events.find((e) => e.eventName === "StockUpdatedEvent");
      expect(event).toBeDefined();
      expect(event!.subscribers.some((s) => s.symbol === "StockUpdatedConsumer")).toBe(true);
    });

    it("should not include events without subscribers unless integration type", () => {
      const symbols = new Map<string, Symbol>();
      symbols.set("class:events/OrphanEvent.ts:OrphanEvent", {
        uid: "class:events/OrphanEvent.ts:OrphanEvent",
        name: "OrphanEvent",
        filePath: "events/OrphanEvent.ts", kind: "class", language: "typescript",
        visibility: "public", startLine: 1, endLine: 5,
      });

      const model = createModel({
        symbols,
        modules: [{
          name: "orphan", path: "src/orphan", layer: "domain",
          symbols: [...symbols.keys()], dependencies: [],
          language: "typescript", fileCount: 1, lineCount: 5,
        }],
      });

      const report = new EventFlowDetector(model).detect();
      // OrphanEvent is "notification" type (not integration) and has no subscribers, so it should be filtered
      expect(report.events.find((e) => e.eventName === "OrphanEvent")).toBeUndefined();
    });

    it("should return empty events for model with no event classes", () => {
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

      const report = new EventFlowDetector(model).detect();
      expect(report.events).toHaveLength(0);
    });
  });

  describe("bounded context detection", () => {
    it("should group modules by name prefix into contexts", () => {
      const symbols = new Map<string, Symbol>();
      symbols.set("class:order/OrderService.ts:OrderService", {
        uid: "class:order/OrderService.ts:OrderService", name: "OrderService",
        filePath: "order/OrderService.ts", kind: "class", language: "csharp",
        visibility: "public", startLine: 1, endLine: 30,
      });

      const model = createModel({
        symbols,
        modules: [
          { name: "Ordering.API", path: "src/Ordering.API", layer: "api", symbols: [], dependencies: [], language: "csharp", fileCount: 3, lineCount: 100 },
          { name: "Ordering.Domain", path: "src/Ordering.Domain", layer: "domain", symbols: ["class:order/OrderService.ts:OrderService"], dependencies: [], language: "csharp", fileCount: 5, lineCount: 200 },
          { name: "Ordering.Infrastructure", path: "src/Ordering.Infrastructure", layer: "infrastructure", symbols: [], dependencies: [], language: "csharp", fileCount: 4, lineCount: 150 },
        ],
      });

      const report = new EventFlowDetector(model).detect();
      const orderingCtx = report.boundedContexts.find((c) => c.name === "Ordering");
      expect(orderingCtx).toBeDefined();
      expect(orderingCtx!.modules).toContain("Ordering.API");
      expect(orderingCtx!.modules).toContain("Ordering.Domain");
      expect(orderingCtx!.modules).toContain("Ordering.Infrastructure");
    });

    it("should detect events within bounded contexts", () => {
      const symbols = new Map<string, Symbol>();
      symbols.set("class:events/PaymentCompletedEvent.ts:PaymentCompletedEvent", {
        uid: "class:events/PaymentCompletedEvent.ts:PaymentCompletedEvent",
        name: "PaymentCompletedEvent",
        filePath: "events/PaymentCompletedEvent.ts", kind: "class", language: "csharp",
        visibility: "public", startLine: 1, endLine: 10,
      });

      const model = createModel({
        symbols,
        modules: [
          { name: "Payment.Domain", path: "src/Payment.Domain", layer: "domain", symbols: ["class:events/PaymentCompletedEvent.ts:PaymentCompletedEvent"], dependencies: [], language: "csharp", fileCount: 2, lineCount: 50 },
        ],
      });

      const report = new EventFlowDetector(model).detect();
      const paymentCtx = report.boundedContexts.find((c) => c.name === "Payment");
      expect(paymentCtx).toBeDefined();
      expect(paymentCtx!.events).toContain("PaymentCompletedEvent");
    });

    it("should mark context as clean when cross-context dependencies are minimal", () => {
      const symbols = new Map<string, Symbol>();
      symbols.set("class:a.ts:A", { uid: "class:a.ts:A", name: "A", filePath: "a.ts", kind: "class", language: "typescript", visibility: "public", startLine: 1, endLine: 10 });

      const model = createModel({
        symbols,
        modules: [
          { name: "Catalog.Domain", path: "src/Catalog", layer: "domain", symbols: ["class:a.ts:A"], dependencies: [], language: "typescript", fileCount: 1, lineCount: 10 },
        ],
        relations: [], // no cross-context deps
      });

      const report = new EventFlowDetector(model).detect();
      const ctx = report.boundedContexts.find((c) => c.name === "Catalog");
      expect(ctx).toBeDefined();
      expect(ctx!.isClean).toBe(true);
    });
  });

  describe("communication pattern detection", () => {
    it("should detect REST API pattern when apiEndpoints exist", () => {
      const model = createModel({
        apiEndpoints: [
          { method: "GET", path: "/api/orders", handler: "fn:OrderController.list", params: [], filePath: "controller.ts", line: 10 },
          { method: "POST", path: "/api/orders", handler: "fn:OrderController.create", params: [], filePath: "controller.ts", line: 20 },
        ],
      });

      const report = new EventFlowDetector(model).detect();
      const restPattern = report.communicationPatterns.find((p) => p.type === "REST API");
      expect(restPattern).toBeDefined();
      expect(restPattern!.description).toContain("2 HTTP endpoints");
    });

    it("should detect Event Bus when eventbus module exists", () => {
      const model = createModel({
        modules: [
          { name: "eventbus", path: "src/eventbus", layer: "infrastructure", symbols: [], dependencies: [], language: "typescript", fileCount: 1, lineCount: 50 },
        ],
      });

      const report = new EventFlowDetector(model).detect();
      const busPatt = report.communicationPatterns.find((p) => p.type === "Event Bus");
      expect(busPatt).toBeDefined();
    });

    it("should detect gRPC pattern when grpc symbols exist", () => {
      const symbols = new Map<string, Symbol>();
      symbols.set("class:grpc/OrderGrpcService.ts:OrderGrpcService", {
        uid: "class:grpc/OrderGrpcService.ts:OrderGrpcService",
        name: "OrderGrpcService",
        filePath: "grpc/OrderGrpcService.ts", kind: "class", language: "typescript",
        visibility: "public", startLine: 1, endLine: 30,
      });

      const model = createModel({
        symbols,
        modules: [{
          name: "grpc-services", path: "src/grpc", layer: "api",
          symbols: [...symbols.keys()], dependencies: [],
          language: "typescript", fileCount: 1, lineCount: 30,
        }],
      });

      const report = new EventFlowDetector(model).detect();
      const grpcPattern = report.communicationPatterns.find((p) => p.type === "gRPC");
      expect(grpcPattern).toBeDefined();
    });

    it("should detect Background Processing when worker modules exist", () => {
      const model = createModel({
        modules: [
          { name: "order-worker", path: "src/worker", layer: "application", symbols: [], dependencies: [], language: "typescript", fileCount: 2, lineCount: 80 },
        ],
      });

      const report = new EventFlowDetector(model).detect();
      const bgPattern = report.communicationPatterns.find((p) => p.type === "Background Processing");
      expect(bgPattern).toBeDefined();
      expect(bgPattern!.modules).toContain("order-worker");
    });

    it("should return empty patterns for a bare model", () => {
      const model = createModel();
      const report = new EventFlowDetector(model).detect();
      expect(report.communicationPatterns).toHaveLength(0);
    });
  });
});
