import { type SimNode, type SimEdge, makeDefaultNode } from "./simulator-engine.js";

/**
 * Pre-built architecture scenarios the user can load as starting points.
 */
export interface ScenarioTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  build: () => { nodes: SimNode[]; edges: SimEdge[] };
}

function connect(source: string, target: string, weight = 1, latencyMs = 2): SimEdge {
  return { id: `e-${source}-${target}`, source, target, weight, latencyMs, retryEnabled: false };
}

export const SCENARIO_TEMPLATES: ScenarioTemplate[] = [
  {
    id: "ecommerce",
    name: "E-commerce",
    description: "Classic: LB → API → Services → Cache + DB",
    icon: "🛒",
    build: () => {
      const nodes = [
        makeDefaultNode("client", "client", "Users", 50, 250),
        makeDefaultNode("lb", "loadbalancer", "Load Balancer", 220, 250),
        makeDefaultNode("api", "api", "API Gateway", 400, 250),
        makeDefaultNode("cart", "service", "Cart Service", 600, 120),
        makeDefaultNode("checkout", "service", "Checkout", 600, 250),
        makeDefaultNode("catalog", "service", "Catalog", 600, 380),
        makeDefaultNode("cache", "cache", "Redis", 820, 250),
        makeDefaultNode("db", "database", "PostgreSQL", 1040, 250),
      ];
      const edges = [
        connect("client", "lb"),
        connect("lb", "api"),
        connect("api", "cart"),
        connect("api", "checkout"),
        connect("api", "catalog"),
        connect("cart", "cache"),
        connect("checkout", "cache"),
        connect("catalog", "cache"),
        connect("cache", "db"),
      ];
      return { nodes, edges };
    },
  },
  {
    id: "microservices",
    name: "Microservices",
    description: "Many services with shared cache and multiple DBs",
    icon: "🔗",
    build: () => {
      const nodes = [
        makeDefaultNode("client", "client", "Users", 50, 300),
        makeDefaultNode("gw", "api", "API Gateway", 220, 300),
        makeDefaultNode("auth", "service", "Auth", 440, 100),
        makeDefaultNode("user", "service", "User", 440, 220),
        makeDefaultNode("order", "service", "Order", 440, 340),
        makeDefaultNode("payment", "service", "Payment", 440, 460),
        makeDefaultNode("notify", "service", "Notify", 440, 580),
        makeDefaultNode("cache", "cache", "Redis", 660, 220),
        makeDefaultNode("userdb", "database", "User DB", 660, 340),
        makeDefaultNode("orderdb", "database", "Order DB", 660, 460),
      ];
      const edges = [
        connect("client", "gw"),
        connect("gw", "auth"),
        connect("gw", "user"),
        connect("gw", "order"),
        connect("gw", "payment"),
        connect("gw", "notify"),
        connect("auth", "cache"),
        connect("user", "cache"),
        connect("user", "userdb"),
        connect("order", "orderdb"),
        connect("payment", "orderdb"),
      ];
      return { nodes, edges };
    },
  },
  {
    id: "eventdriven",
    name: "Event-Driven",
    description: "Producer → Queue → Consumers → DB",
    icon: "⚡",
    build: () => {
      const nodes = [
        makeDefaultNode("client", "client", "Events", 50, 250),
        makeDefaultNode("ingest", "api", "Ingest API", 220, 250),
        makeDefaultNode("queue", "queue", "Message Queue", 440, 250),
        makeDefaultNode("worker1", "service", "Worker 1", 660, 150),
        makeDefaultNode("worker2", "service", "Worker 2", 660, 250),
        makeDefaultNode("worker3", "service", "Worker 3", 660, 350),
        makeDefaultNode("db", "database", "TimeSeries DB", 880, 250),
      ];
      const edges = [
        connect("client", "ingest"),
        connect("ingest", "queue"),
        connect("queue", "worker1"),
        connect("queue", "worker2"),
        connect("queue", "worker3"),
        connect("worker1", "db"),
        connect("worker2", "db"),
        connect("worker3", "db"),
      ];
      return { nodes, edges };
    },
  },
  {
    id: "cdn-heavy",
    name: "CDN + Origin",
    description: "Edge caching with fallback to origin",
    icon: "🌐",
    build: () => {
      const nodes = [
        makeDefaultNode("client", "client", "Users", 50, 250),
        makeDefaultNode("cdn", "cache", "CDN Edge", 220, 250),
        makeDefaultNode("lb", "loadbalancer", "Origin LB", 440, 250),
        makeDefaultNode("origin", "api", "Origin API", 660, 250),
        makeDefaultNode("cache", "cache", "Origin Cache", 880, 250),
        makeDefaultNode("db", "database", "Origin DB", 1100, 250),
      ];
      nodes[1].cacheHitRate = 0.95; // High CDN hit rate
      const edges = [
        connect("client", "cdn"),
        connect("cdn", "lb"),
        connect("lb", "origin"),
        connect("origin", "cache"),
        connect("cache", "db"),
      ];
      return { nodes, edges };
    },
  },
  {
    id: "data-pipeline",
    name: "Data Pipeline",
    description: "ETL: API → Queue → Workers → DB + Analytics",
    icon: "📊",
    build: () => {
      const nodes = [
        makeDefaultNode("src", "client", "Data Sources", 50, 250),
        makeDefaultNode("api", "api", "Collector API", 220, 250),
        makeDefaultNode("q1", "queue", "Raw Queue", 440, 150),
        makeDefaultNode("transform", "service", "Transform", 660, 150),
        makeDefaultNode("q2", "queue", "Clean Queue", 880, 150),
        makeDefaultNode("load", "service", "Loader", 1100, 150),
        makeDefaultNode("warehouse", "database", "Data Warehouse", 1320, 250),
        makeDefaultNode("analytics", "service", "Analytics", 660, 380),
        makeDefaultNode("cache", "cache", "Query Cache", 880, 380),
      ];
      const edges = [
        connect("src", "api"),
        connect("api", "q1"),
        connect("q1", "transform"),
        connect("transform", "q2"),
        connect("q2", "load"),
        connect("load", "warehouse"),
        connect("warehouse", "analytics"),
        connect("analytics", "cache"),
      ];
      return { nodes, edges };
    },
  },
];

/**
 * Load test presets — predefined traffic scenarios.
 */
export interface LoadTestPreset {
  id: string;
  name: string;
  description: string;
  trafficPattern: {
    type: "constant" | "burst" | "ramp" | "spike" | "periodic" | "noise";
    baseRate: number;
    burstMultiplier?: number;
    rampTargetRate?: number;
    rampDurationSec?: number;
  };
}

export const LOAD_TEST_PRESETS: LoadTestPreset[] = [
  {
    id: "baseline",
    name: "Baseline",
    description: "Constant 500 req/s",
    trafficPattern: { type: "constant", baseRate: 500 },
  },
  {
    id: "black-friday",
    name: "Black Friday",
    description: "Sudden 5x spike every 30s",
    trafficPattern: { type: "burst", baseRate: 500, burstMultiplier: 5 },
  },
  {
    id: "launch-day",
    name: "Launch Day",
    description: "Ramp from 100 to 3000 req/s over 60s",
    trafficPattern: { type: "ramp", baseRate: 100, rampTargetRate: 3000, rampDurationSec: 60 },
  },
  {
    id: "ddos",
    name: "DDoS Attack",
    description: "10x spike at 20s",
    trafficPattern: { type: "spike", baseRate: 500 },
  },
  {
    id: "daily-cycle",
    name: "Daily Pattern",
    description: "Sine wave: morning peak, night valley",
    trafficPattern: { type: "periodic", baseRate: 1000 },
  },
];
