/**
 * Scenario Generator — infers a simulator scenario from an ArchitectureModel.
 *
 * Heuristics:
 * - Client node always present (traffic source).
 * - Load balancer added if 2+ API-facing modules.
 * - Module layer + name + framework detection maps to one of 16 NodeTypes.
 * - DB entities → one `database` node (shared) wired to data-layer modules.
 * - Tech radar keywords detect cache / queue / messagebroker presence.
 * - Module dependencies become edges; data-layer modules auto-edge to database.
 * - Layered layout: client top, LB next, API row, service row, data row at bottom.
 * - Traffic pattern baseline = max(20, apiEndpointCount * 10) RPS.
 *
 * Output matches the simulator's save/load JSON format used by the web dashboard.
 */
import type { ArchitectureModel, Module } from "../models/index.js";

export type ScenarioNodeType =
  | "client" | "loadbalancer" | "api" | "service" | "database" | "cache" | "queue"
  | "cdn" | "messagebroker" | "storage" | "dns" | "auth" | "monitoring" | "lambda"
  | "container" | "gateway";

export interface ScenarioNode {
  id: string;
  type: ScenarioNodeType;
  label: string;
  x: number;
  y: number;
  moduleRef?: string; // traceability back to source module
}

export interface ScenarioEdge {
  id: string;
  source: string;
  target: string;
  weight: number;
  latencyMs: number;
  retryEnabled: boolean;
}

export interface ScenarioTrafficPattern {
  type: "constant" | "burst" | "ramp" | "spike" | "periodic" | "noise";
  baseRate: number;
  burstMultiplier?: number;
  burstDurationSec?: number;
  burstIntervalSec?: number;
  rampTargetRate?: number;
  rampDurationSec?: number;
  periodSec?: number;
  periodAmplitude?: number;
  noiseFraction?: number;
}

export interface GeneratedScenario {
  /** Schema version so the UI can refuse future-incompatible payloads gracefully */
  schemaVersion: 1;
  /** What the scenario was derived from — useful in banner text / debugging */
  source: {
    projectName: string;
    analyzedAt: string;
    modules: number;
    endpoints: number;
    entities: number;
  };
  /** Short reasoning summary for the UI to display */
  inferences: string[];
  nodes: ScenarioNode[];
  edges: ScenarioEdge[];
  trafficPattern: ScenarioTrafficPattern;
}

// ──────────────────────────────────────────────────────────────────────
//  Node type inference
// ──────────────────────────────────────────────────────────────────────

const CACHE_PATTERNS = /\b(cache|caches|redis|memcached|keyv)\b/i;
const QUEUE_PATTERNS = /\b(queue|queues|bull|agenda|celery|sidekiq)\b/i;
const BROKER_PATTERNS = /\b(kafka|rabbitmq|nats|pulsar|mq|broker)\b/i;
const STORAGE_PATTERNS = /\b(s3|storage|blob|minio|azure-storage)\b/i;
const AUTH_PATTERNS = /\b(auth|oauth|jwt|keycloak|authentik|cognito)\b/i;
const CDN_PATTERNS = /\b(cdn|cloudfront|fastly)\b/i;
const GATEWAY_PATTERNS = /\b(gateway|apigw|envoy|kong|traefik)\b/i;
const MONITORING_PATTERNS = /\b(monitoring|telemetry|metrics|prometheus|grafana|sentry)\b/i;
const LAMBDA_PATTERNS = /\b(lambda|functions?|serverless)\b/i;

function inferModuleNodeType(mod: Module, hasDb: boolean): ScenarioNodeType | null {
  const name = mod.name.toLowerCase();

  // Skip non-runtime modules
  if (mod.layer === "test" || mod.layer === "config" || mod.layer === "unknown") return null;

  // Specific keyword wins over layer
  if (CACHE_PATTERNS.test(name)) return "cache";
  if (QUEUE_PATTERNS.test(name)) return "queue";
  if (BROKER_PATTERNS.test(name)) return "messagebroker";
  if (STORAGE_PATTERNS.test(name)) return "storage";
  if (AUTH_PATTERNS.test(name)) return "auth";
  if (CDN_PATTERNS.test(name)) return "cdn";
  if (GATEWAY_PATTERNS.test(name)) return "gateway";
  if (MONITORING_PATTERNS.test(name)) return "monitoring";
  if (LAMBDA_PATTERNS.test(name)) return "lambda";

  // Layer-based fallback
  switch (mod.layer) {
    case "presentation":
    case "api":
      return "api";
    case "application":
    case "domain":
      return "service";
    case "infrastructure":
      // Infra modules that touch the DB become part of the data layer — skip
      // in favor of the single shared database node. Otherwise treat as service.
      return hasDb ? null : "service";
    default:
      return null;
  }
}

// ──────────────────────────────────────────────────────────────────────
//  Layout
// ──────────────────────────────────────────────────────────────────────

interface LaneAssignment {
  lane: "client" | "lb" | "api" | "service" | "data";
  order: number;
}

function laneForNode(type: ScenarioNodeType): LaneAssignment["lane"] {
  switch (type) {
    case "client":       return "client";
    case "loadbalancer":
    case "gateway":
    case "cdn":
    case "dns":          return "lb";
    case "api":
    case "auth":         return "api";
    case "service":
    case "lambda":
    case "container":    return "service";
    case "database":
    case "cache":
    case "queue":
    case "messagebroker":
    case "storage":
    case "monitoring":   return "data";
  }
}

function assignPositions(nodes: ScenarioNode[]): void {
  const lanes = new Map<string, ScenarioNode[]>();
  for (const n of nodes) {
    const lane = laneForNode(n.type);
    if (!lanes.has(lane)) lanes.set(lane, []);
    lanes.get(lane)!.push(n);
  }

  const laneOrder: Array<LaneAssignment["lane"]> = ["client", "lb", "api", "service", "data"];
  const laneYGap = 180;
  const laneXGap = 220;

  laneOrder.forEach((lane, laneIdx) => {
    const items = lanes.get(lane) ?? [];
    if (items.length === 0) return;
    const totalWidth = (items.length - 1) * laneXGap;
    const startX = 400 - totalWidth / 2;
    items.forEach((n, i) => {
      n.x = startX + i * laneXGap;
      n.y = 120 + laneIdx * laneYGap;
    });
  });
}

// ──────────────────────────────────────────────────────────────────────
//  Main generator
// ──────────────────────────────────────────────────────────────────────

export function generateScenario(model: ArchitectureModel): GeneratedScenario {
  const inferences: string[] = [];
  const nodes: ScenarioNode[] = [];
  const edges: ScenarioEdge[] = [];
  const moduleNodeId = new Map<string, string>(); // moduleName -> nodeId

  // Always add a client
  nodes.push({ id: "client", type: "client", label: "Client", x: 0, y: 0 });

  const hasDb = model.dbEntities.length > 0;

  // Map modules → nodes
  const apiCandidates: string[] = [];
  for (const mod of model.modules) {
    const type = inferModuleNodeType(mod, hasDb);
    if (!type) continue;
    const id = `n_${sanitize(mod.name)}`;
    moduleNodeId.set(mod.name, id);
    nodes.push({
      id,
      type,
      label: truncateLabel(mod.name),
      x: 0,
      y: 0,
      moduleRef: mod.name,
    });
    if (type === "api") apiCandidates.push(id);
  }

  // Tech-radar signals → standalone infra nodes if not already covered by a module
  const techBlob = model.techRadar.map((t) => t.name.toLowerCase()).join(" ");
  addInfraIfMissing(nodes, "cache", "Cache", CACHE_PATTERNS, techBlob, inferences);
  addInfraIfMissing(nodes, "queue", "Queue", QUEUE_PATTERNS, techBlob, inferences);
  addInfraIfMissing(nodes, "messagebroker", "Message Broker", BROKER_PATTERNS, techBlob, inferences);

  // Database node if entities exist
  if (hasDb) {
    nodes.push({ id: "database", type: "database", label: "Database", x: 0, y: 0 });
    inferences.push(`database node added (${model.dbEntities.length} entities detected)`);
  }

  // Load balancer if 2+ API-facing modules
  let lbId: string | null = null;
  if (apiCandidates.length >= 2) {
    lbId = "loadbalancer";
    nodes.push({ id: lbId, type: "loadbalancer", label: "Load Balancer", x: 0, y: 0 });
    inferences.push(`load balancer added (${apiCandidates.length} API-facing modules)`);
  }

  // Position nodes
  assignPositions(nodes);

  // ── Edges ──
  if (lbId) {
    edges.push(edge("client", lbId, 1));
    for (const api of apiCandidates) edges.push(edge(lbId, api, 1 / apiCandidates.length));
  } else {
    // Client → each API-facing module directly (or first node after client if no APIs)
    const targets = apiCandidates.length > 0
      ? apiCandidates
      : firstNonClientService(nodes);
    for (const t of targets) edges.push(edge("client", t, 1 / Math.max(targets.length, 1)));
  }

  // Module dependencies → inter-service edges
  for (const mod of model.modules) {
    const srcId = moduleNodeId.get(mod.name);
    if (!srcId) continue;
    for (const dep of mod.dependencies) {
      const tgtId = moduleNodeId.get(dep);
      if (!tgtId || tgtId === srcId) continue;
      edges.push(edge(srcId, tgtId, 1));
    }
  }

  // Service → database
  if (hasDb) {
    const dataConsumers = nodes.filter((n) => n.type === "service" || n.type === "api");
    for (const n of dataConsumers) {
      edges.push(edge(n.id, "database", 0.5, 3));
    }
  }

  // Service → cache / queue / broker (best-effort: wire from any api node)
  const firstApi = apiCandidates[0] ?? firstNonClientService(nodes)[0];
  if (firstApi) {
    for (const t of ["cache", "queue", "messagebroker"] as const) {
      const node = nodes.find((n) => n.id === t);
      if (node) edges.push(edge(firstApi, node.id, 0.3, 1));
    }
  }

  dedupeEdges(edges);

  // Traffic pattern
  const endpointCount = model.apiEndpoints.length;
  const baseRate = Math.max(20, endpointCount * 10);
  const trafficPattern: ScenarioTrafficPattern = {
    type: "constant",
    baseRate,
  };
  inferences.unshift(
    `${nodes.length} nodes + ${edges.length} edges inferred from ${model.modules.length} modules`,
  );
  if (endpointCount > 0) {
    inferences.push(`traffic baseline = ${baseRate} req/s (${endpointCount} endpoints × 10)`);
  }

  return {
    schemaVersion: 1,
    source: {
      projectName: model.project.name,
      analyzedAt: model.project.analyzedAt,
      modules: model.modules.length,
      endpoints: model.apiEndpoints.length,
      entities: model.dbEntities.length,
    },
    inferences,
    nodes,
    edges,
    trafficPattern,
  };
}

// ──────────────────────────────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────────────────────────────

function edge(source: string, target: string, weight: number, latencyMs = 2): ScenarioEdge {
  return {
    id: `e_${source}__${target}`,
    source,
    target,
    weight,
    latencyMs,
    retryEnabled: false,
  };
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function truncateLabel(s: string, max = 22): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function addInfraIfMissing(
  nodes: ScenarioNode[],
  type: ScenarioNodeType,
  label: string,
  pattern: RegExp,
  techBlob: string,
  inferences: string[],
): void {
  if (nodes.some((n) => n.type === type)) return;
  if (!pattern.test(techBlob)) return;
  nodes.push({ id: type, type, label, x: 0, y: 0 });
  inferences.push(`${type} node added (detected in tech stack)`);
}

function firstNonClientService(nodes: ScenarioNode[]): string[] {
  const hit = nodes.find((n) => n.type !== "client" && laneForNode(n.type) !== "data");
  return hit ? [hit.id] : [];
}

function dedupeEdges(edges: ScenarioEdge[]): void {
  const seen = new Set<string>();
  for (let i = edges.length - 1; i >= 0; i--) {
    const key = `${edges[i].source}->${edges[i].target}`;
    if (seen.has(key)) edges.splice(i, 1);
    else seen.add(key);
  }
}
