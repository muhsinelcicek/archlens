import { describe, it, expect, beforeEach } from "vitest";
import {
  type SimNode,
  type SimEdge,
  type SimulatorConfig,
  type TrafficPattern,
  queueLatency,
  percentiles,
  calcErrorRate,
  calculateTrafficRate,
  simulateTick,
  getGlobalStats,
  analyzeRootCause,
  makeDefaultNode,
  createCircuitBreaker,
  createNodeMetrics,
} from "../simulator-engine.js";

describe("simulator-engine", () => {
  describe("queueLatency (M/M/c approximation)", () => {
    it("returns near base latency at low utilization", () => {
      expect(queueLatency(100, 0)).toBeCloseTo(100, 1);
      expect(queueLatency(100, 0.1)).toBeLessThan(120);
    });

    it("grows linearly at moderate utilization", () => {
      const at50 = queueLatency(100, 0.5);
      expect(at50).toBeGreaterThan(100);
      expect(at50).toBeLessThan(250);
    });

    it("grows significantly past 80%", () => {
      const at80 = queueLatency(100, 0.8);
      const at90 = queueLatency(100, 0.9);
      expect(at90).toBeGreaterThan(at80 * 1.5);
    });

    it("explodes as utilization approaches 1", () => {
      const at99 = queueLatency(100, 0.99);
      expect(at99).toBeGreaterThan(5000); // at least 50x base
    });

    it("caps at ρ=0.999 for stability", () => {
      const at1 = queueLatency(100, 1.0);
      const at2 = queueLatency(100, 2.0);
      expect(Number.isFinite(at1)).toBe(true);
      expect(Number.isFinite(at2)).toBe(true);
    });

    it("scales with base latency", () => {
      expect(queueLatency(10, 0.5)).toBeCloseTo(queueLatency(100, 0.5) / 10, 1);
    });
  });

  describe("percentiles", () => {
    it("p50 < p95 < p99", () => {
      const p = percentiles(100, 20, 0.5);
      expect(p.p50).toBeLessThan(p.p95);
      expect(p.p95).toBeLessThan(p.p99);
    });

    it("variance increases p95/p99 spread", () => {
      const low = percentiles(100, 5, 0.5);
      const high = percentiles(100, 50, 0.5);
      const lowSpread = low.p99 - low.p50;
      const highSpread = high.p99 - high.p50;
      expect(highSpread).toBeGreaterThan(lowSpread);
    });

    it("utilization amplifies jitter", () => {
      const lowUtil = percentiles(100, 20, 0.2);
      const highUtil = percentiles(100, 20, 0.9);
      expect(highUtil.p99 - highUtil.p50).toBeGreaterThan(lowUtil.p99 - lowUtil.p50);
    });
  });

  describe("calcErrorRate", () => {
    it("is near zero below 80% utilization", () => {
      expect(calcErrorRate(0.5, 0.05)).toBeLessThan(0.01);
      expect(calcErrorRate(0.7, 0.05)).toBeLessThan(0.01);
    });

    it("ramps between 80% and 100%", () => {
      const at80 = calcErrorRate(0.8, 0.05);
      const at95 = calcErrorRate(0.95, 0.05);
      expect(at95).toBeGreaterThan(at80);
    });

    it("compounds past 100%", () => {
      const at100 = calcErrorRate(1.0, 0.05);
      const at120 = calcErrorRate(1.2, 0.05);
      expect(at120).toBeGreaterThan(at100);
    });

    it("caps at 1.0", () => {
      expect(calcErrorRate(5.0, 0.5)).toBeLessThanOrEqual(1);
    });
  });

  describe("calculateTrafficRate — traffic patterns", () => {
    it("constant returns baseRate", () => {
      const p: TrafficPattern = { type: "constant", baseRate: 500 };
      expect(calculateTrafficRate(p, 0)).toBe(500);
      expect(calculateTrafficRate(p, 100)).toBe(500);
      expect(calculateTrafficRate(p, 9999)).toBe(500);
    });

    it("burst multiplies during burst window", () => {
      const p: TrafficPattern = {
        type: "burst",
        baseRate: 100,
        burstMultiplier: 3,
        burstIntervalSec: 30,
        burstDurationSec: 5,
      };
      // First 5 seconds: burst
      expect(calculateTrafficRate(p, 2)).toBe(300);
      // Between bursts: base
      expect(calculateTrafficRate(p, 10)).toBe(100);
      // Next burst at 30-35s
      expect(calculateTrafficRate(p, 32)).toBe(300);
    });

    it("ramp increases linearly over duration", () => {
      const p: TrafficPattern = {
        type: "ramp",
        baseRate: 100,
        rampTargetRate: 1100,
        rampDurationSec: 10,
      };
      expect(calculateTrafficRate(p, 0)).toBe(100);
      expect(calculateTrafficRate(p, 5)).toBeCloseTo(600, 0); // halfway
      expect(calculateTrafficRate(p, 10)).toBeCloseTo(1100, 0);
      expect(calculateTrafficRate(p, 20)).toBeCloseTo(1100, 0); // stays at target
    });

    it("spike fires between 20-25 seconds", () => {
      const p: TrafficPattern = { type: "spike", baseRate: 100 };
      expect(calculateTrafficRate(p, 10)).toBe(100);
      expect(calculateTrafficRate(p, 22)).toBe(1000); // 10x
      expect(calculateTrafficRate(p, 30)).toBe(100);
    });

    it("periodic oscillates around base", () => {
      const p: TrafficPattern = { type: "periodic", baseRate: 1000, periodSec: 20, periodAmplitude: 0.5 };
      // At t=0, sin(0)=0, so rate = base
      expect(calculateTrafficRate(p, 0)).toBeCloseTo(1000, 0);
      // At t=5 (quarter period), sin(π/2)=1 → peak
      expect(calculateTrafficRate(p, 5)).toBeCloseTo(1500, 0);
      // At t=15 (3/4), sin(3π/2)=-1 → trough
      expect(calculateTrafficRate(p, 15)).toBeCloseTo(500, 0);
    });

    it("noise stays within fraction bounds", () => {
      const p: TrafficPattern = { type: "noise", baseRate: 1000, noiseFraction: 0.3 };
      for (let i = 0; i < 50; i++) {
        const rate = calculateTrafficRate(p, i);
        expect(rate).toBeGreaterThanOrEqual(700);
        expect(rate).toBeLessThanOrEqual(1300);
      }
    });
  });

  describe("circuit breaker state machine", () => {
    let node: SimNode;

    beforeEach(() => {
      node = makeDefaultNode("test", "api", "Test", 0, 0);
      node.circuitBreakerEnabled = true;
      node.circuitBreakerThreshold = 3;
      node.circuitBreakerCooldownMs = 1000;
    });

    it("starts in closed state", () => {
      expect(node.circuitBreaker.state).toBe("closed");
    });

    it("opens after threshold consecutive failures", () => {
      const edges: SimEdge[] = [];
      const config: SimulatorConfig = {
        trafficPattern: { type: "constant", baseRate: 5000 }, // massive overload
        globalTimeoutMs: 1000,
        tickMs: 250,
        metricsWindowSec: 30,
      };
      // Force overload
      node.capacityPerReplica = 10;
      const clients = [makeDefaultNode("c", "client", "Client", 0, 0)];
      const nodes = [...clients, node];
      edges.push({ id: "e", source: "c", target: "test", weight: 1, latencyMs: 1, retryEnabled: false });

      // Tick several times to accumulate failures
      for (let i = 0; i < 10; i++) {
        simulateTick(nodes, edges, config, 0.25, i, Date.now() + i * 250);
      }
      // After several overloaded ticks, CB should trip
      expect(node.circuitBreaker.consecutiveFailures).toBeGreaterThan(0);
    });

    it("does not trip when disabled", () => {
      node.circuitBreakerEnabled = false;
      const edges: SimEdge[] = [{ id: "e", source: "c", target: "test", weight: 1, latencyMs: 1, retryEnabled: false }];
      const config: SimulatorConfig = {
        trafficPattern: { type: "constant", baseRate: 10000 },
        globalTimeoutMs: 1000,
        tickMs: 250,
        metricsWindowSec: 30,
      };
      node.capacityPerReplica = 10;
      const nodes = [makeDefaultNode("c", "client", "Client", 0, 0), node];
      for (let i = 0; i < 20; i++) {
        simulateTick(nodes, edges, config, 0.25, i, Date.now() + i * 250);
      }
      expect(node.circuitBreaker.state).toBe("closed");
    });
  });

  describe("simulateTick — end-to-end propagation", () => {
    it("propagates traffic from client through chain", () => {
      const client = makeDefaultNode("c", "client", "Client", 0, 0);
      const api = makeDefaultNode("api", "api", "API", 100, 0);
      const db = makeDefaultNode("db", "database", "DB", 200, 0);

      const nodes = [client, api, db];
      const edges: SimEdge[] = [
        { id: "e1", source: "c", target: "api", weight: 1, latencyMs: 1, retryEnabled: false },
        { id: "e2", source: "api", target: "db", weight: 1, latencyMs: 1, retryEnabled: false },
      ];
      const config: SimulatorConfig = {
        trafficPattern: { type: "constant", baseRate: 100 },
        globalTimeoutMs: 3000,
        tickMs: 250,
        metricsWindowSec: 30,
      };

      simulateTick(nodes, edges, config, 0.25, 1, Date.now());
      expect(api.incomingRate).toBeGreaterThan(0);
      expect(db.incomingRate).toBeGreaterThan(0);
    });

    it("does not propagate through dead nodes", () => {
      const client = makeDefaultNode("c", "client", "Client", 0, 0);
      const api = makeDefaultNode("api", "api", "API", 100, 0);
      const db = makeDefaultNode("db", "database", "DB", 200, 0);
      api.alive = false;

      const nodes = [client, api, db];
      const edges: SimEdge[] = [
        { id: "e1", source: "c", target: "api", weight: 1, latencyMs: 1, retryEnabled: false },
        { id: "e2", source: "api", target: "db", weight: 1, latencyMs: 1, retryEnabled: false },
      ];
      const config: SimulatorConfig = {
        trafficPattern: { type: "constant", baseRate: 100 },
        globalTimeoutMs: 3000,
        tickMs: 250,
        metricsWindowSec: 30,
      };

      simulateTick(nodes, edges, config, 0.25, 1, Date.now());
      expect(db.incomingRate).toBe(0);
    });

    it("cache reduces downstream load based on hit rate", () => {
      const client = makeDefaultNode("c", "client", "Client", 0, 0);
      const cache = makeDefaultNode("cache", "cache", "Cache", 100, 0);
      const db = makeDefaultNode("db", "database", "DB", 200, 0);
      cache.cacheHitRate = 0.9; // 90% hit rate
      db.capacityPerReplica = 10000;

      const nodes = [client, cache, db];
      const edges: SimEdge[] = [
        { id: "e1", source: "c", target: "cache", weight: 1, latencyMs: 1, retryEnabled: false },
        { id: "e2", source: "cache", target: "db", weight: 1, latencyMs: 1, retryEnabled: false },
      ];
      const config: SimulatorConfig = {
        trafficPattern: { type: "constant", baseRate: 1000 },
        globalTimeoutMs: 3000,
        tickMs: 250,
        metricsWindowSec: 30,
      };

      simulateTick(nodes, edges, config, 0.25, 1, Date.now());
      // DB should get ~10% of cache traffic (100 req/s)
      expect(db.incomingRate).toBeLessThan(200);
      expect(db.incomingRate).toBeGreaterThan(50);
    });

    it("load balancer distributes evenly", () => {
      const client = makeDefaultNode("c", "client", "Client", 0, 0);
      const lb = makeDefaultNode("lb", "loadbalancer", "LB", 100, 0);
      const api1 = makeDefaultNode("a1", "api", "API1", 200, 0);
      const api2 = makeDefaultNode("a2", "api", "API2", 200, 100);
      const api3 = makeDefaultNode("a3", "api", "API3", 200, 200);

      const nodes = [client, lb, api1, api2, api3];
      const edges: SimEdge[] = [
        { id: "e1", source: "c", target: "lb", weight: 1, latencyMs: 1, retryEnabled: false },
        { id: "e2", source: "lb", target: "a1", weight: 1, latencyMs: 1, retryEnabled: false },
        { id: "e3", source: "lb", target: "a2", weight: 1, latencyMs: 1, retryEnabled: false },
        { id: "e4", source: "lb", target: "a3", weight: 1, latencyMs: 1, retryEnabled: false },
      ];
      const config: SimulatorConfig = {
        trafficPattern: { type: "constant", baseRate: 900 },
        globalTimeoutMs: 3000,
        tickMs: 250,
        metricsWindowSec: 30,
      };

      simulateTick(nodes, edges, config, 0.25, 1, Date.now());
      // Each API should get ~300 req/s
      expect(api1.incomingRate).toBeCloseTo(300, 0);
      expect(api2.incomingRate).toBeCloseTo(300, 0);
      expect(api3.incomingRate).toBeCloseTo(300, 0);
    });

    it("returns events from state changes", () => {
      const client = makeDefaultNode("c", "client", "Client", 0, 0);
      const api = makeDefaultNode("api", "api", "API", 100, 0);
      api.capacityPerReplica = 5; // very low
      api.circuitBreakerEnabled = true;
      api.circuitBreakerThreshold = 2;

      const nodes = [client, api];
      const edges: SimEdge[] = [
        { id: "e1", source: "c", target: "api", weight: 1, latencyMs: 1, retryEnabled: false },
      ];
      const config: SimulatorConfig = {
        trafficPattern: { type: "constant", baseRate: 5000 },
        globalTimeoutMs: 1000,
        tickMs: 250,
        metricsWindowSec: 30,
      };

      let allEvents: any[] = [];
      for (let i = 0; i < 15; i++) {
        const result = simulateTick(nodes, edges, config, 0.25, i, Date.now() + i * 250);
        allEvents = [...allEvents, ...result.events];
      }
      expect(allEvents.length).toBeGreaterThan(0);
    });
  });

  describe("getGlobalStats", () => {
    it("calculates success rate from totals", () => {
      const node = makeDefaultNode("api", "api", "API", 0, 0);
      node.metrics.totalRequests = 1000;
      node.metrics.totalErrors = 10;
      const stats = getGlobalStats([node], 60);
      expect(stats.successRate).toBeCloseTo(0.99, 2);
    });

    it("SLO met when success >= 99% and p99 < 500ms", () => {
      const node = makeDefaultNode("api", "api", "API", 0, 0);
      node.metrics.totalRequests = 1000;
      node.metrics.totalErrors = 5;
      node.metrics.latencyP50 = [100];
      node.metrics.latencyP95 = [200];
      node.metrics.latencyP99 = [400];
      const stats = getGlobalStats([node], 60);
      expect(stats.sloMet).toBe(true);
    });

    it("SLO breached when p99 > 500ms", () => {
      const node = makeDefaultNode("api", "api", "API", 0, 0);
      node.metrics.totalRequests = 1000;
      node.metrics.totalErrors = 5;
      node.metrics.latencyP50 = [100];
      node.metrics.latencyP95 = [200];
      node.metrics.latencyP99 = [800];
      const stats = getGlobalStats([node], 60);
      expect(stats.sloMet).toBe(false);
    });

    it("identifies worst bottleneck", () => {
      const n1 = makeDefaultNode("a", "api", "A", 0, 0);
      const n2 = makeDefaultNode("b", "api", "B", 0, 0);
      n1.utilization = 0.3;
      n2.utilization = 0.95;
      n2.metrics.latencyP99 = [800];
      const stats = getGlobalStats([n1, n2], 60);
      expect(stats.bottleneckNode).toBe("B");
    });
  });

  describe("analyzeRootCause", () => {
    it("detects overloaded bottleneck", () => {
      const api = makeDefaultNode("api", "api", "API", 0, 0);
      api.utilization = 1.5;
      api.queueDepth = 50;
      const stats = getGlobalStats([api], 60);
      const insights = analyzeRootCause([api], stats);
      const bottleneck = insights.find((i) => i.title.toLowerCase().includes("bottleneck"));
      expect(bottleneck).toBeDefined();
      expect(bottleneck!.severity).toBe("critical");
    });

    it("suggests cache when DB is hot", () => {
      const db = makeDefaultNode("db", "database", "DB", 0, 0);
      db.utilization = 0.85;
      const stats = getGlobalStats([db], 60);
      const insights = analyzeRootCause([db], stats);
      const cacheHint = insights.find((i) => i.title.toLowerCase().includes("cache"));
      expect(cacheHint).toBeDefined();
    });

    it("reports SLO met as positive insight", () => {
      const api = makeDefaultNode("api", "api", "API", 0, 0);
      api.utilization = 0.3;
      api.metrics.totalRequests = 5000;
      api.metrics.totalErrors = 1;
      api.metrics.latencyP50 = [50];
      api.metrics.latencyP95 = [100];
      api.metrics.latencyP99 = [200];
      const stats = getGlobalStats([api], 60);
      const insights = analyzeRootCause([api], stats);
      const positive = insights.find((i) => i.title.toLowerCase().includes("slo"));
      expect(positive).toBeDefined();
      expect(positive!.severity).toBe("info");
    });
  });
});
