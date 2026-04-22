import { describe, it, expect } from "vitest";
import type { ArchitectureModel, Module } from "../models/index.js";
import { generateScenario } from "../generators/scenario-generator.js";

function makeModel(overrides: Partial<ArchitectureModel> = {}): ArchitectureModel {
  return {
    project: { name: "test", rootPath: "/test", analyzedAt: "2026-04-22T00:00:00Z", version: "0.1.0" },
    stats: { files: 0, symbols: 0, relations: 0, modules: 0, languages: {} as any, totalLines: 0 },
    symbols: new Map(),
    relations: [],
    modules: [],
    layers: { application: [], infrastructure: [], presentation: [], api: [], domain: [], config: [], test: [], unknown: [] },
    dataFlows: [], apiEndpoints: [], dbEntities: [], techRadar: [], businessProcesses: [],
    ...overrides,
  } as ArchitectureModel;
}

function mod(name: string, layer: Module["layer"], deps: string[] = []): Module {
  return { name, path: name, layer, symbols: [], dependencies: deps, language: "typescript", fileCount: 1, lineCount: 10 };
}

describe("generateScenario", () => {
  it("returns a client-only scenario for an empty model", () => {
    const s = generateScenario(makeModel());
    expect(s.nodes).toHaveLength(1);
    expect(s.nodes[0].type).toBe("client");
    expect(s.edges).toHaveLength(0);
    expect(s.trafficPattern.type).toBe("constant");
    expect(s.trafficPattern.baseRate).toBe(20); // floor
  });

  it("creates api + database + wires them when DB entities exist", () => {
    const s = generateScenario(makeModel({
      modules: [mod("api", "api")],
      dbEntities: [{ name: "User", filePath: "x", columns: [], relations: [] }],
      apiEndpoints: [{ method: "GET", path: "/u", handler: "u", filePath: "x", line: 1 }],
    }));
    expect(s.nodes.find((n) => n.type === "api")).toBeDefined();
    expect(s.nodes.find((n) => n.type === "database")).toBeDefined();
    // client -> api
    expect(s.edges.find((e) => e.source === "client" && e.target.startsWith("n_api"))).toBeDefined();
    // api -> database
    expect(s.edges.find((e) => e.target === "database")).toBeDefined();
  });

  it("adds a load balancer when there are 2+ api-facing modules", () => {
    const s = generateScenario(makeModel({
      modules: [mod("web", "presentation"), mod("admin", "presentation")],
    }));
    expect(s.nodes.find((n) => n.type === "loadbalancer")).toBeDefined();
    const lbEdges = s.edges.filter((e) => e.source === "loadbalancer");
    expect(lbEdges.length).toBeGreaterThanOrEqual(2);
  });

  it("detects cache/queue/messagebroker from module names", () => {
    const s = generateScenario(makeModel({
      modules: [
        mod("api", "api"),
        mod("redis-cache", "infrastructure"),
        mod("kafka-broker", "infrastructure"),
        mod("job-queue", "infrastructure"),
      ],
    }));
    expect(s.nodes.find((n) => n.type === "cache")).toBeDefined();
    expect(s.nodes.find((n) => n.type === "messagebroker")).toBeDefined();
    expect(s.nodes.find((n) => n.type === "queue")).toBeDefined();
  });

  it("maps application/domain layers to `service` nodes", () => {
    const s = generateScenario(makeModel({
      modules: [mod("billing", "application"), mod("order-domain", "domain")],
    }));
    const services = s.nodes.filter((n) => n.type === "service");
    expect(services).toHaveLength(2);
  });

  it("wires module→module dependencies as edges", () => {
    const s = generateScenario(makeModel({
      modules: [mod("api", "api", ["billing"]), mod("billing", "application", [])],
    }));
    const dep = s.edges.find((e) => e.source.includes("api") && e.target.includes("billing"));
    expect(dep).toBeDefined();
  });

  it("skips test/config/unknown layers", () => {
    const s = generateScenario(makeModel({
      modules: [mod("spec", "test"), mod("env", "config"), mod("x", "unknown"), mod("api", "api")],
    }));
    // client + api only (no LB, only 1 api-facing)
    expect(s.nodes.filter((n) => n.type !== "client")).toHaveLength(1);
  });

  it("scales traffic baseline with endpoint count", () => {
    const s = generateScenario(makeModel({
      modules: [mod("api", "api")],
      apiEndpoints: Array.from({ length: 30 }, (_, i) => ({
        method: "GET", path: `/e${i}`, handler: "h", filePath: "f", line: 1,
      })) as any,
    }));
    expect(s.trafficPattern.baseRate).toBe(300);
  });

  it("dedupes duplicate edges", () => {
    const s = generateScenario(makeModel({
      modules: [
        mod("api", "api", ["svc", "svc"]), // duplicate dep
        mod("svc", "application"),
      ],
    }));
    const apiToSvc = s.edges.filter((e) => e.source.includes("api") && e.target.includes("svc"));
    expect(apiToSvc).toHaveLength(1);
  });

  it("assigns distinct positions to each node", () => {
    const s = generateScenario(makeModel({
      modules: [mod("a", "presentation"), mod("b", "presentation"), mod("c", "application")],
    }));
    const coords = new Set(s.nodes.map((n) => `${n.x},${n.y}`));
    expect(coords.size).toBe(s.nodes.length);
  });

  it("carries source metadata for UI display", () => {
    const s = generateScenario(makeModel({
      project: { name: "my-app", rootPath: "/", analyzedAt: "2026-01-01T00:00:00Z", version: "0.1.0" },
      modules: [mod("api", "api")],
      apiEndpoints: [{ method: "GET", path: "/x", handler: "h", filePath: "f", line: 1 }] as any,
      dbEntities: [{ name: "User", filePath: "x", columns: [], relations: [] }],
    }));
    expect(s.source.projectName).toBe("my-app");
    expect(s.source.modules).toBe(1);
    expect(s.source.endpoints).toBe(1);
    expect(s.source.entities).toBe(1);
    expect(s.inferences.length).toBeGreaterThan(0);
  });
});
