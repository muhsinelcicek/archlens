/**
 * Architecture Simulator Engine v3
 *
 * Full distributed systems simulation:
 * - M/M/c queueing approximation
 * - Circuit breakers (closed/open/half-open)
 * - Retry with exponential backoff
 * - Traffic patterns (constant/burst/ramp/spike/periodic/noise)
 * - Cost modeling
 * - Event log generation
 * - DB connection pools, cache stampede, queue lag
 * - Chaos injection hooks
 * - Root cause analysis
 */

export type NodeType = "client" | "loadbalancer" | "api" | "service" | "database" | "cache" | "queue"
  | "cdn" | "messagebroker" | "storage" | "dns" | "auth" | "monitoring" | "lambda" | "container" | "gateway";

export type TrafficPatternType = "constant" | "burst" | "ramp" | "spike" | "periodic" | "noise";

export interface TrafficPattern {
  type: TrafficPatternType;
  baseRate: number;
  // Pattern-specific config
  burstMultiplier?: number;
  burstDurationSec?: number;
  burstIntervalSec?: number;
  rampTargetRate?: number;
  rampDurationSec?: number;
  periodSec?: number;
  periodAmplitude?: number;
  noiseFraction?: number;
}

export interface CircuitBreakerState {
  state: "closed" | "open" | "half-open";
  consecutiveFailures: number;
  lastFailureTime: number;
  nextRetryTime: number;
  totalTrips: number;
}

export interface SimNode {
  id: string;
  type: NodeType;
  label: string;
  x: number;
  y: number;

  // Configuration
  capacityPerReplica: number;
  baseLatencyMs: number;
  latencyVarianceMs: number;
  replicas: number;
  timeoutMs: number;
  errorRateAtOverload: number;

  // Resilience
  circuitBreakerEnabled: boolean;
  circuitBreakerThreshold: number;   // errors before opening
  circuitBreakerCooldownMs: number;
  retryCount: number;
  retryBackoffMs: number;

  // Auto-scaling
  autoScaleEnabled: boolean;
  autoScaleMin: number;
  autoScaleMax: number;
  autoScaleUpThreshold: number;      // utilization to scale up
  autoScaleDownThreshold: number;
  autoScaleCooldownSec: number;
  lastScaleTime: number;

  // Component-specific
  cacheHitRate?: number;
  cacheStampedeEnabled?: boolean;
  dbConnectionPoolSize?: number;     // limit for DB
  queueMaxLag?: number;              // for queue

  // Lambda-specific
  lambdaColdStartMs?: number;      // extra latency on first request
  lambdaConcurrencyLimit?: number; // max concurrent executions

  // Gateway-specific
  gatewayRateLimitPerSec?: number; // max req/s before rejection
  gatewayBurstAllowance?: number;  // burst above limit

  // MessageBroker-specific
  brokerConsumerGroups?: number;
  brokerDlqThreshold?: number;     // messages before DLQ

  // Container-specific
  containerCpuLimit?: number;      // 0-100 percentage
  containerMemoryMb?: number;

  // Cost
  costPerReplicaHour: number;        // USD per replica per hour
  costPerMillionRequests: number;    // USD per 1M requests

  // Runtime state
  alive: boolean;
  chaosMode: "none" | "slow" | "flaky" | "partition";
  circuitBreaker: CircuitBreakerState;
  queueDepth: number;
  incomingRate: number;
  processedRate: number;
  droppedRate: number;
  retryingRate: number;
  utilization: number;

  metrics: NodeMetrics;
}

export interface NodeMetrics {
  throughput: number[];
  latencyP50: number[];
  latencyP95: number[];
  latencyP99: number[];
  errorRate: number[];
  queueDepth: number[];
  replicas: number[];  // track replica history
  totalRequests: number;
  totalErrors: number;
  totalTimeouts: number;
  totalRetries: number;
  totalCost: number;
}

export interface SimEdge {
  id: string;
  source: string;
  target: string;
  weight: number;
  latencyMs: number;
  retryEnabled: boolean;
}

export interface SimulatorConfig {
  trafficPattern: TrafficPattern;
  globalTimeoutMs: number;
  tickMs: number;
  metricsWindowSec: number;
  chaosConfig?: ChaosConfig;
}

export interface ChaosConfig {
  enabled: boolean;
  randomKillChancePerMin: number;    // chance a random node dies each min
  latencyInjectionMs: number;        // extra latency on all nodes
  networkPartitionEdges: string[];   // edge IDs to "cut"
}

export interface GlobalStats {
  uptime: number;
  totalRequests: number;
  totalSuccesses: number;
  totalErrors: number;
  totalTimeouts: number;
  totalRetries: number;
  successRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  sloMet: boolean;
  totalCost: number;
  monthlyCostEstimate: number;
  bottleneckNode?: string;
  activeEvents: number;
}

export interface EventLogEntry {
  id: string;
  timestamp: number;   // uptime seconds
  severity: "info" | "warning" | "error" | "critical";
  category: "scale" | "failure" | "slo" | "chaos" | "circuit" | "cost";
  message: string;
  nodeId?: string;
}

const METRICS_BUCKETS = 60; // 60 seconds of history

export function createNodeMetrics(): NodeMetrics {
  return {
    throughput: Array(METRICS_BUCKETS).fill(0),
    latencyP50: Array(METRICS_BUCKETS).fill(0),
    latencyP95: Array(METRICS_BUCKETS).fill(0),
    latencyP99: Array(METRICS_BUCKETS).fill(0),
    errorRate: Array(METRICS_BUCKETS).fill(0),
    queueDepth: Array(METRICS_BUCKETS).fill(0),
    replicas: Array(METRICS_BUCKETS).fill(0),
    totalRequests: 0,
    totalErrors: 0,
    totalTimeouts: 0,
    totalRetries: 0,
    totalCost: 0,
  };
}

export function createCircuitBreaker(): CircuitBreakerState {
  return {
    state: "closed",
    consecutiveFailures: 0,
    lastFailureTime: 0,
    nextRetryTime: 0,
    totalTrips: 0,
  };
}

/**
 * Calculate traffic rate based on pattern and uptime.
 */
export function calculateTrafficRate(pattern: TrafficPattern, uptimeSec: number): number {
  const base = pattern.baseRate;
  switch (pattern.type) {
    case "constant":
      return base;

    case "burst": {
      const interval = pattern.burstIntervalSec || 30;
      const duration = pattern.burstDurationSec || 5;
      const mult = pattern.burstMultiplier || 3;
      const phase = uptimeSec % interval;
      return phase < duration ? base * mult : base;
    }

    case "ramp": {
      const target = pattern.rampTargetRate || base * 5;
      const duration = pattern.rampDurationSec || 60;
      const progress = Math.min(1, uptimeSec / duration);
      return base + (target - base) * progress;
    }

    case "spike": {
      // Single sharp spike around 20-25s
      if (uptimeSec >= 20 && uptimeSec < 25) return base * 10;
      return base;
    }

    case "periodic": {
      const period = pattern.periodSec || 20;
      const amp = pattern.periodAmplitude || 0.5;
      return base * (1 + amp * Math.sin((uptimeSec / period) * Math.PI * 2));
    }

    case "noise": {
      const frac = pattern.noiseFraction || 0.3;
      return base * (1 + (Math.random() - 0.5) * 2 * frac);
    }
  }
}

/**
 * M/M/c queue latency approximation.
 */
export function queueLatency(baseLatencyMs: number, utilization: number): number {
  const ρ = Math.max(0, Math.min(0.999, utilization));
  if (ρ < 0.5) return baseLatencyMs * (1 + ρ);
  const queueMultiplier = ρ / (1 - ρ + 0.001);
  return baseLatencyMs * (1 + queueMultiplier);
}

export function percentiles(baseMs: number, varianceMs: number, utilization: number): { p50: number; p95: number; p99: number } {
  const effectiveBase = queueLatency(baseMs, utilization);
  const jitter = varianceMs * (1 + utilization * 3);
  return {
    p50: effectiveBase,
    p95: effectiveBase + jitter * 1.645,
    p99: effectiveBase + jitter * 2.326,
  };
}

export function calcErrorRate(utilization: number, baseErrorRate: number): number {
  if (utilization < 0.8) return baseErrorRate * 0.1;
  if (utilization < 1.0) return baseErrorRate + (utilization - 0.8) * 0.25;
  const overflow = utilization - 1.0;
  return Math.min(1, baseErrorRate + overflow * 0.5 + 0.25);
}

/**
 * Update circuit breaker state based on errors.
 */
function updateCircuitBreaker(
  cb: CircuitBreakerState,
  node: SimNode,
  errorRate: number,
  nowMs: number,
): CircuitBreakerState {
  if (!node.circuitBreakerEnabled) return cb;

  if (cb.state === "open") {
    if (nowMs >= cb.nextRetryTime) {
      return { ...cb, state: "half-open" };
    }
    return cb;
  }

  if (cb.state === "half-open") {
    if (errorRate < 0.05) {
      return { ...cb, state: "closed", consecutiveFailures: 0 };
    } else {
      return {
        ...cb,
        state: "open",
        nextRetryTime: nowMs + node.circuitBreakerCooldownMs,
        totalTrips: cb.totalTrips + 1,
      };
    }
  }

  // closed
  if (errorRate > 0.3) {
    const failures = cb.consecutiveFailures + 1;
    if (failures >= node.circuitBreakerThreshold) {
      return {
        ...cb,
        state: "open",
        consecutiveFailures: failures,
        lastFailureTime: nowMs,
        nextRetryTime: nowMs + node.circuitBreakerCooldownMs,
        totalTrips: cb.totalTrips + 1,
      };
    }
    return { ...cb, consecutiveFailures: failures, lastFailureTime: nowMs };
  } else {
    return { ...cb, consecutiveFailures: Math.max(0, cb.consecutiveFailures - 1) };
  }
}

/**
 * Main simulation tick.
 */
export interface TickResult {
  delivered: number;
  failed: number;
  events: EventLogEntry[];
  costDelta: number;
}

export function simulateTick(
  nodes: SimNode[],
  edges: SimEdge[],
  config: SimulatorConfig,
  tickSeconds: number,
  uptimeSec: number,
  nowMs: number,
): TickResult {
  const events: EventLogEntry[] = [];
  let eventCounter = 0;
  const makeEvent = (severity: EventLogEntry["severity"], category: EventLogEntry["category"], message: string, nodeId?: string) => {
    events.push({
      id: `ev-${nowMs}-${eventCounter++}`,
      timestamp: uptimeSec,
      severity, category, message, nodeId,
    });
  };

  const currentTraffic = calculateTrafficRate(config.trafficPattern, uptimeSec);

  // Apply chaos: random kill
  if (config.chaosConfig?.enabled && config.chaosConfig.randomKillChancePerMin > 0) {
    const perTickChance = (config.chaosConfig.randomKillChancePerMin / 60) * tickSeconds;
    if (Math.random() < perTickChance) {
      const aliveNodes = nodes.filter((n) => n.alive && n.type !== "client");
      if (aliveNodes.length > 0) {
        const victim = aliveNodes[Math.floor(Math.random() * aliveNodes.length)];
        victim.alive = false;
        makeEvent("critical", "chaos", `Chaos monkey killed ${victim.label}`, victim.id);
      }
    }
  }

  // Build adjacency, considering partitioned edges
  const partitioned = new Set(config.chaosConfig?.networkPartitionEdges || []);
  const outgoing = new Map<string, SimEdge[]>();
  for (const e of edges) {
    if (partitioned.has(e.id)) continue;
    if (!outgoing.has(e.source)) outgoing.set(e.source, []);
    outgoing.get(e.source)!.push(e);
  }

  const nodeMap = new Map<string, SimNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  // BFS order
  const clients = nodes.filter((n) => n.type === "client" && n.alive);
  const visited = new Set<string>();
  const order: string[] = [];
  const bfsQueue: string[] = clients.map((c) => c.id);
  while (bfsQueue.length > 0) {
    const id = bfsQueue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    order.push(id);
    const outs = outgoing.get(id) || [];
    for (const e of outs) if (!visited.has(e.target)) bfsQueue.push(e.target);
  }

  // Reset incoming
  const incomingMap = new Map<string, number>();
  for (const n of nodes) {
    incomingMap.set(n.id, n.type === "client" && n.alive ? currentTraffic : 0);
  }

  let totalDelivered = 0;
  let totalFailed = 0;
  let costDelta = 0;

  // Process nodes in BFS order
  for (const id of order) {
    const node = nodeMap.get(id)!;
    let λ = incomingMap.get(id) || 0;
    const capacity = node.capacityPerReplica * node.replicas;

    // Circuit breaker check
    if (node.circuitBreaker.state === "open") {
      node.incomingRate = λ;
      node.processedRate = 0;
      node.droppedRate = λ;
      node.utilization = 0;
      totalFailed += λ * tickSeconds;

      // Update CB
      node.circuitBreaker = updateCircuitBreaker(node.circuitBreaker, node, 1, nowMs);
      if (node.circuitBreaker.state === "half-open") {
        makeEvent("info", "circuit", `${node.label} circuit breaker: open → half-open`, node.id);
      }
      continue;
    }

    if (!node.alive) {
      node.incomingRate = λ;
      node.processedRate = 0;
      node.droppedRate = λ;
      node.utilization = 0;
      totalFailed += λ * tickSeconds;
      continue;
    }

    // Chaos: latency injection
    const extraLatency = config.chaosConfig?.enabled ? (config.chaosConfig.latencyInjectionMs || 0) : 0;
    let effectiveBaseLatency = node.baseLatencyMs + extraLatency + (node.chaosMode === "slow" ? 200 : 0);

    // Lambda: auto-scale and cold start
    if (node.type === "lambda") {
      // Lambda always auto-scales
      node.replicas = Math.max(1, Math.ceil(λ / node.capacityPerReplica));
      // Cold start: if node was idle, add extra latency
      if (node.processedRate === 0 && λ > 0) {
        effectiveBaseLatency += (node.lambdaColdStartMs || 200);
      }
    }

    // Gateway: rate limiting
    if (node.type === "gateway" && node.gatewayRateLimitPerSec) {
      const limit = node.gatewayRateLimitPerSec + (node.gatewayBurstAllowance || 0);
      if (λ > limit) {
        const rejected = λ - limit;
        node.droppedRate += rejected;
        λ = limit;
      }
    }

    // DB connection pool limit
    let effectiveCapacity = capacity;
    if (node.type === "database" && node.dbConnectionPoolSize) {
      effectiveCapacity = Math.min(capacity, node.dbConnectionPoolSize * 10);
    }

    const ρ = effectiveCapacity > 0 ? λ / effectiveCapacity : 0;
    node.utilization = ρ;
    node.incomingRate = λ;

    const processed = Math.min(λ, effectiveCapacity);
    const baseErrRate = node.chaosMode === "flaky" ? 0.3 : node.errorRateAtOverload;
    let errRate = calcErrorRate(ρ, baseErrRate);

    // Retry logic: retry reduces effective error rate at cost of extra load
    let retrying = 0;
    if (node.retryCount > 0 && errRate > 0) {
      const retryEffectiveness = 1 - Math.pow(errRate, node.retryCount + 1);
      retrying = λ * errRate * node.retryCount;
      errRate *= 1 - retryEffectiveness * 0.7;
    }
    node.retryingRate = retrying;

    const dropped = processed * errRate + Math.max(0, λ - effectiveCapacity);
    const actuallyDelivered = Math.max(0, processed - dropped);

    node.processedRate = processed;
    node.droppedRate = dropped;

    // Queue
    if (ρ > 1) {
      node.queueDepth += (λ - effectiveCapacity) * tickSeconds;
    } else {
      node.queueDepth = Math.max(0, node.queueDepth - effectiveCapacity * tickSeconds * 0.5);
    }
    node.queueDepth = Math.min(node.queueDepth, 10000);

    // Latency percentiles with chaos injection
    const pct = percentiles(effectiveBaseLatency, node.latencyVarianceMs, Math.min(ρ, 1.5));

    // Timeout
    let extraTimeouts = 0;
    if (pct.p99 > node.timeoutMs) extraTimeouts += λ * 0.01;
    if (pct.p95 > node.timeoutMs) extraTimeouts += λ * 0.05;
    node.droppedRate += extraTimeouts;

    // Cache stampede: on cache miss under high load, downstream gets hit hard
    if (node.type === "cache" && node.cacheStampedeEnabled && ρ > 0.9) {
      errRate = Math.min(1, errRate + 0.2); // stampede penalty
    }

    // Update metrics
    pushMetric(node.metrics.throughput, actuallyDelivered);
    pushMetric(node.metrics.latencyP50, pct.p50);
    pushMetric(node.metrics.latencyP95, pct.p95);
    pushMetric(node.metrics.latencyP99, pct.p99);
    pushMetric(node.metrics.errorRate, errRate);
    pushMetric(node.metrics.queueDepth, node.queueDepth);
    pushMetric(node.metrics.replicas, node.replicas);
    node.metrics.totalRequests += Math.round(λ * tickSeconds);
    node.metrics.totalErrors += Math.round((dropped + extraTimeouts) * tickSeconds);
    node.metrics.totalRetries += Math.round(retrying * tickSeconds);
    if (pct.p95 > node.timeoutMs) node.metrics.totalTimeouts += Math.round(extraTimeouts * tickSeconds);

    // Circuit breaker update
    const prevCbState = node.circuitBreaker.state;
    node.circuitBreaker = updateCircuitBreaker(node.circuitBreaker, node, errRate, nowMs);
    if (prevCbState !== node.circuitBreaker.state && node.circuitBreaker.state === "open") {
      makeEvent("error", "circuit", `${node.label} circuit breaker tripped (errors ${(errRate * 100).toFixed(0)}%)`, node.id);
    }

    // Cost
    const replicaCost = (node.costPerReplicaHour * node.replicas * tickSeconds) / 3600;
    const reqCost = (actuallyDelivered * tickSeconds * node.costPerMillionRequests) / 1_000_000;
    node.metrics.totalCost += replicaCost + reqCost;
    costDelta += replicaCost + reqCost;

    // Auto-scaling
    if (node.autoScaleEnabled && nowMs - node.lastScaleTime > node.autoScaleCooldownSec * 1000) {
      if (ρ > node.autoScaleUpThreshold && node.replicas < node.autoScaleMax) {
        node.replicas += 1;
        node.lastScaleTime = nowMs;
        makeEvent("info", "scale", `${node.label} scaled up to ${node.replicas} replicas (util ${(ρ * 100).toFixed(0)}%)`, node.id);
      } else if (ρ < node.autoScaleDownThreshold && node.replicas > node.autoScaleMin) {
        node.replicas -= 1;
        node.lastScaleTime = nowMs;
        makeEvent("info", "scale", `${node.label} scaled down to ${node.replicas} replicas`, node.id);
      }
    }

    // SLO alerts
    if (pct.p99 > node.timeoutMs * 0.8) {
      // Only log once per 10 seconds
      if (Math.floor(uptimeSec) % 10 === 0 && tickSeconds > 0.2) {
        makeEvent("warning", "slo", `${node.label} p99 latency ${Math.round(pct.p99)}ms near timeout`, node.id);
      }
    }

    // MessageBroker: DLQ overflow
    if (node.type === "messagebroker" && node.brokerDlqThreshold && node.queueDepth > node.brokerDlqThreshold) {
      const dlqOverflow = (node.queueDepth - node.brokerDlqThreshold) * 0.01;
      node.droppedRate += dlqOverflow;
    }

    // Route traffic
    if ((node.type === "cache" || node.type === "cdn") && node.cacheHitRate) {
      const missedRate = actuallyDelivered * (1 - node.cacheHitRate);
      routeTraffic(id, missedRate, outgoing, incomingMap, nodeMap);
    } else if (node.type === "monitoring") {
      // Monitoring is passive — receives data but doesn't forward it
    } else {
      routeTraffic(id, actuallyDelivered, outgoing, incomingMap, nodeMap);
    }

    totalDelivered += actuallyDelivered * tickSeconds;
    totalFailed += (dropped + extraTimeouts) * tickSeconds;
  }

  return { delivered: totalDelivered, failed: totalFailed, events, costDelta };
}

function routeTraffic(
  sourceId: string,
  throughput: number,
  outgoing: Map<string, SimEdge[]>,
  incomingMap: Map<string, number>,
  nodeMap: Map<string, SimNode>,
): void {
  const outs = outgoing.get(sourceId) || [];
  if (outs.length === 0 || throughput <= 0) return;

  const sourceNode = nodeMap.get(sourceId);
  const aliveOuts = outs.filter((e) => {
    const tn = nodeMap.get(e.target);
    return tn?.alive && tn.circuitBreaker.state !== "open";
  });
  if (aliveOuts.length === 0) return;

  if (sourceNode?.type === "loadbalancer") {
    const share = throughput / aliveOuts.length;
    for (const e of aliveOuts) {
      incomingMap.set(e.target, (incomingMap.get(e.target) || 0) + share);
    }
  } else {
    const totalWeight = aliveOuts.reduce((a, e) => a + e.weight, 0);
    if (totalWeight === 0) {
      const share = throughput / aliveOuts.length;
      for (const e of aliveOuts) {
        incomingMap.set(e.target, (incomingMap.get(e.target) || 0) + share);
      }
    } else {
      for (const e of aliveOuts) {
        const share = throughput * (e.weight / totalWeight);
        incomingMap.set(e.target, (incomingMap.get(e.target) || 0) + share);
      }
    }
  }
}

function pushMetric(buffer: number[], value: number): void {
  buffer.push(value);
  if (buffer.length > METRICS_BUCKETS) buffer.shift();
}

/**
 * Global stats + bottleneck detection
 */
export function getGlobalStats(nodes: SimNode[], uptimeSec: number): GlobalStats {
  let totalRequests = 0;
  let totalErrors = 0;
  let totalTimeouts = 0;
  let totalRetries = 0;
  let totalCost = 0;
  const latencies: number[] = [];

  const nonClients = nodes.filter((n) => n.type !== "client");
  let worstBottleneck = { node: "", score: 0 };

  for (const n of nonClients) {
    totalRequests += n.metrics.totalRequests;
    totalErrors += n.metrics.totalErrors;
    totalTimeouts += n.metrics.totalTimeouts;
    totalRetries += n.metrics.totalRetries;
    totalCost += n.metrics.totalCost;
    const lastP50 = n.metrics.latencyP50[n.metrics.latencyP50.length - 1] || 0;
    const lastP95 = n.metrics.latencyP95[n.metrics.latencyP95.length - 1] || 0;
    const lastP99 = n.metrics.latencyP99[n.metrics.latencyP99.length - 1] || 0;
    if (lastP50 > 0) latencies.push(lastP50, lastP95, lastP99);

    const bottleneckScore = n.utilization + (lastP99 / 1000);
    if (bottleneckScore > worstBottleneck.score) {
      worstBottleneck = { node: n.label, score: bottleneckScore };
    }
  }

  latencies.sort((a, b) => a - b);
  const avg = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;
  const p99 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)] : 0;
  const successRate = totalRequests > 0 ? (totalRequests - totalErrors) / totalRequests : 1;
  const sloMet = successRate >= 0.99 && p99 < 500;

  // Monthly cost extrapolation
  const monthlyCostEstimate = uptimeSec > 0 ? (totalCost / uptimeSec) * 3600 * 24 * 30 : 0;

  return {
    uptime: uptimeSec,
    totalRequests,
    totalSuccesses: totalRequests - totalErrors,
    totalErrors,
    totalTimeouts,
    totalRetries,
    successRate,
    avgLatencyMs: avg,
    p95LatencyMs: p95,
    p99LatencyMs: p99,
    sloMet,
    totalCost,
    monthlyCostEstimate,
    bottleneckNode: worstBottleneck.node || undefined,
    activeEvents: 0,
  };
}

/**
 * Node-level incident — Paperdraw-style per-node issue detection.
 * Each node accumulates incidents that are shown as badges/cards on the canvas.
 */
export interface NodeIncident {
  type: string;         // SPOF, CASCADE, OVERLOAD, SLOW_NODE, etc.
  severity: number;     // 0-100 percentage
  label: string;        // Short badge text: "SPOF", "502 BAD GATEWAY"
  explanation: string;  // Detailed narrative
  recommendation: string;
  category: "topology" | "performance" | "reliability" | "cost";
}

/**
 * Detect incidents per node — called each tick.
 * Returns a map of nodeId → incidents.
 */
export function detectIncidents(
  nodes: SimNode[],
  edges: SimEdge[],
  globalStats: GlobalStats,
): Map<string, NodeIncident[]> {
  const result = new Map<string, NodeIncident[]>();
  const getOrCreate = (id: string): NodeIncident[] => {
    if (!result.has(id)) result.set(id, []);
    return result.get(id)!;
  };

  // Build adjacency for cascade detection
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const e of edges) {
    if (!outgoing.has(e.source)) outgoing.set(e.source, []);
    outgoing.get(e.source)!.push(e.target);
    if (!incoming.has(e.target)) incoming.set(e.target, []);
    incoming.get(e.target)!.push(e.source);
  }

  const nonClients = nodes.filter((n) => n.type !== "client");
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  for (const n of nonClients) {
    const incidents = getOrCreate(n.id);
    if (!n.alive) continue;

    const p99 = n.metrics.latencyP99[n.metrics.latencyP99.length - 1] || 0;
    const errRate = n.metrics.errorRate[n.metrics.errorRate.length - 1] || 0;
    const capacity = n.capacityPerReplica * n.replicas;

    // ── SPOF: Single Point of Failure ──
    if (n.replicas <= 1 && n.type !== "monitoring" && n.type !== "client") {
      incidents.push({
        type: "SPOF",
        severity: 80,
        label: "SPOF",
        explanation: `${n.label} is a single point of failure`,
        recommendation: `Increase instance count, enable autoscaling, or add a redundant ${n.label} node`,
        category: "reliability",
      });
    }

    // ── Data Loss Risk (DB without replication) ──
    if ((n.type === "database" || n.type === "storage") && n.replicas <= 1) {
      incidents.push({
        type: "DATA_LOSS_RISK",
        severity: 90,
        label: "DATA LOSS RISK",
        explanation: `${n.label} has no replication — risk of data loss`,
        recommendation: "Enable replication with factor >= 2 or add a redundant database node",
        category: "reliability",
      });
    }

    // ── Overload ──
    if (n.utilization > 0.9) {
      const overflow = Math.max(0, Math.round((n.utilization - 1) * 100));
      incidents.push({
        type: "OVERLOAD",
        severity: Math.min(95, 70 + overflow),
        label: `LOAD: ${Math.round(n.utilization * 100)}%`,
        explanation: overflow > 0
          ? `${n.label} receiving ${Math.round(n.incomingRate)} RPS but capacity is ${capacity} RPS (+${overflow}% overflow)`
          : `${n.label} saturated at ${Math.round(n.incomingRate)} RPS against ${capacity} RPS capacity (${Math.round(n.utilization * 100)}% load)`,
        recommendation: overflow > 0
          ? "Scale capacity, implement rate limiting, or optimize processing"
          : "Add horizontal headroom before the next traffic burst",
        category: "performance",
      });
    }

    // ── Slow Node ──
    if (p99 > n.baseLatencyMs * 2 && n.baseLatencyMs > 0) {
      const slowFactor = (p99 / n.baseLatencyMs).toFixed(1);
      incidents.push({
        type: "SLOW_NODE",
        severity: 70,
        label: `${slowFactor}× SLOWER`,
        explanation: `${n.label} responding ${slowFactor}× slower than normal (p99: ${Math.round(p99)}ms vs base: ${n.baseLatencyMs}ms)`,
        recommendation: "Investigate node health, restart or replace slow instance",
        category: "performance",
      });
    }

    // ── HTTP Error: 502 Bad Gateway ──
    if (errRate > 0.05 && n.utilization > 0.8) {
      const degraded = Math.round(errRate * 100);
      incidents.push({
        type: "HTTP_ERROR",
        severity: 75,
        label: "502 BAD GATEWAY",
        explanation: `${n.label} returning errors at ${degraded}% rate`,
        recommendation: "Scale backend capacity or enable circuit breakers",
        category: "reliability",
      });
    }

    // ── Traffic Overflow ──
    if (n.incomingRate > capacity && capacity > 0) {
      const overflowPct = Math.round(((n.incomingRate - capacity) / capacity) * 100);
      incidents.push({
        type: "TRAFFIC_OVERFLOW",
        severity: 72 + Math.min(20, overflowPct / 5),
        label: `+${overflowPct}% OVERFLOW`,
        explanation: `${n.label} receiving ${Math.round(n.incomingRate)} RPS but runtime capacity is ${capacity} RPS (+${overflowPct}% overflow)`,
        recommendation: "Stabilize the failing path, reduce blast radius, and add observability",
        category: "performance",
      });
    }

    // ── Health Check Failure ──
    if (errRate > 0.1 && n.incomingRate > 0) {
      incidents.push({
        type: "HEALTH_CHECK_FAILURE",
        severity: 72,
        label: "UNHEALTHY",
        explanation: `${n.label} is unhealthy but traffic is still being routed to it`,
        recommendation: "Implement /health endpoint, verify thresholds, drain unhealthy instances",
        category: "reliability",
      });
    }

    // ── Consumer Lag (queues) ──
    if ((n.type === "queue" || n.type === "messagebroker") && n.queueDepth > 50) {
      incidents.push({
        type: "CONSUMER_LAG",
        severity: 76,
        label: `LAG: ${Math.round(n.queueDepth)}`,
        explanation: `${n.label} processing rate slower than ingestion rate (queue depth: ${Math.round(n.queueDepth)})`,
        recommendation: "Scale workers, split noisy queues, keep backlog bounded",
        category: "performance",
      });
    }

    // ── Cascading Failure ──
    const upstreams = incoming.get(n.id) || [];
    for (const upId of upstreams) {
      const upstream = nodeMap.get(upId);
      if (upstream && (!upstream.alive || upstream.utilization > 1 || upstream.circuitBreaker.state === "open")) {
        incidents.push({
          type: "CASCADE",
          severity: 72,
          label: `CASCADE: from ${upstream.label}`,
          explanation: `${n.label} is reacting to dependency pressure from ${upstream.label}`,
          recommendation: `Review dependencies, retries, and failover behavior for ${n.label}`,
          category: "reliability",
        });
        break; // one cascade badge per node
      }
    }

    // ── Dependency Unavailable ──
    const downstreams = outgoing.get(n.id) || [];
    for (const downId of downstreams) {
      const downstream = nodeMap.get(downId);
      if (downstream && !downstream.alive) {
        incidents.push({
          type: "DEPENDENCY_UNAVAILABLE",
          severity: 85,
          label: "DEP UNAVAILABLE",
          explanation: `Critical downstream dependency ${downstream.label} is unreachable`,
          recommendation: `Check health and logs of ${downstream.label}, review deployment status`,
          category: "reliability",
        });
        break;
      }
    }

    // ── Error Budget Burn ──
    if (n.metrics.totalRequests > 100) {
      const nodeErrRate = n.metrics.totalErrors / n.metrics.totalRequests;
      if (nodeErrRate > 0.01) {
        const burnRate = nodeErrRate / 0.001; // relative to 99.9% SLO
        if (burnRate > 5) {
          incidents.push({
            type: "ERROR_BUDGET_BURN",
            severity: 75,
            label: `${burnRate.toFixed(0)}× BURN`,
            explanation: `${n.label} is burning its SLO budget at ${burnRate.toFixed(1)}× normal pace`,
            recommendation: "Slow rollout, lower retry pressure, stabilize latency",
            category: "reliability",
          });
        }
      }
    }

    // ── Autoscale Thrash ──
    if (n.autoScaleEnabled) {
      const replicaHistory = n.metrics.replicas;
      if (replicaHistory.length >= 10) {
        const recent = replicaHistory.slice(-10);
        let changes = 0;
        for (let i = 1; i < recent.length; i++) {
          if (recent[i] !== recent[i - 1]) changes++;
        }
        if (changes >= 4) {
          incidents.push({
            type: "AUTOSCALE_THRASH",
            severity: 45,
            label: "THRASHING",
            explanation: `${n.label} autoscaling is oscillating (${changes} changes in 10 ticks)`,
            recommendation: "Widen autoscaling cooldowns, raise min capacity, scale on smoothed demand",
            category: "performance",
          });
        }
      }
    }

    // ── Cold Start Penalty ──
    if (n.type === "lambda" && n.processedRate === 0 && n.incomingRate > 0) {
      incidents.push({
        type: "COLD_START",
        severity: 30,
        label: "COLD START",
        explanation: `Cold start penalty: new instances at reduced capacity`,
        recommendation: "Pre-warm capacity or reduce startup cost",
        category: "performance",
      });
    }

    // ── Retry Amplification ──
    if (n.retryingRate > n.incomingRate * 0.1) {
      incidents.push({
        type: "RETRY_AMPLIFICATION",
        severity: 63,
        label: "RETRY STORM",
        explanation: `Retries spiked while downstream remained unstable`,
        recommendation: "Reduce retry pressure, add backoff/circuit breaking",
        category: "reliability",
      });
    }

    // ── Topology Pressure (summary card) ──
    if (incidents.length >= 2) {
      const degradedPct = Math.round(errRate * 100);
      const droppedPct = Math.round((n.droppedRate / Math.max(1, n.incomingRate)) * 100);
      if (degradedPct > 0 || droppedPct > 0) {
        incidents.unshift({
          type: "TOPOLOGY_PRESSURE",
          severity: Math.max(...incidents.map((i) => i.severity)),
          label: `${n.type.toUpperCase()} TOPOLOGY PRESSURE`,
          explanation: `IMPACT: ${degradedPct}% DEGRADED${droppedPct > 0 ? ` + ${droppedPct}% DROPPED` : ""}`,
          recommendation: "Review the topology issues listed below",
          category: "topology",
        });
      }
    }
  }

  return result;
}

/**
 * Root cause analysis — narrative insights from current state (kept for insights panel).
 */
export interface RootCauseInsight {
  severity: "info" | "warning" | "critical";
  title: string;
  explanation: string;
  recommendation: string;
}

export function analyzeRootCause(nodes: SimNode[], globalStats: GlobalStats): RootCauseInsight[] {
  const incidents = detectIncidents(nodes, [], globalStats);
  const insights: RootCauseInsight[] = [];

  // Convert top incidents to insights
  const allIncidents: Array<NodeIncident & { nodeId: string }> = [];
  for (const [nodeId, nodeInc] of incidents) {
    for (const inc of nodeInc) {
      if (inc.type !== "TOPOLOGY_PRESSURE") {
        allIncidents.push({ ...inc, nodeId });
      }
    }
  }
  allIncidents.sort((a, b) => b.severity - a.severity);

  // Dedupe by type and take top 8
  const seenTypes = new Set<string>();
  for (const inc of allIncidents) {
    if (seenTypes.has(inc.type)) continue;
    seenTypes.add(inc.type);
    insights.push({
      severity: inc.severity >= 75 ? "critical" : inc.severity >= 50 ? "warning" : "info",
      title: inc.label,
      explanation: inc.explanation,
      recommendation: inc.recommendation,
    });
    if (insights.length >= 8) break;
  }

  // SLO positive
  if (globalStats.sloMet && globalStats.totalRequests > 1000 && insights.length === 0) {
    insights.push({
      severity: "info",
      title: "SLO is being met",
      explanation: `Success rate ${(globalStats.successRate * 100).toFixed(2)}% and p99 ${Math.round(globalStats.p99LatencyMs)}ms meet the 99.9/500ms SLO.`,
      recommendation: "Current capacity is well-sized.",
    });
  }

  return insights;
}

export const NODE_DEFAULTS: Record<NodeType, Partial<SimNode>> = {
  client: {
    capacityPerReplica: 999999, baseLatencyMs: 0, latencyVarianceMs: 0,
    replicas: 1, timeoutMs: 5000, errorRateAtOverload: 0,
    costPerReplicaHour: 0, costPerMillionRequests: 0,
  },
  loadbalancer: {
    capacityPerReplica: 20000, baseLatencyMs: 2, latencyVarianceMs: 1,
    replicas: 2, timeoutMs: 5000, errorRateAtOverload: 0.001,
    costPerReplicaHour: 0.05, costPerMillionRequests: 0.02,
  },
  api: {
    capacityPerReplica: 500, baseLatencyMs: 25, latencyVarianceMs: 10,
    replicas: 2, timeoutMs: 3000, errorRateAtOverload: 0.05,
    costPerReplicaHour: 0.10, costPerMillionRequests: 0.10,
  },
  service: {
    capacityPerReplica: 400, baseLatencyMs: 40, latencyVarianceMs: 15,
    replicas: 2, timeoutMs: 5000, errorRateAtOverload: 0.05,
    costPerReplicaHour: 0.08, costPerMillionRequests: 0.08,
  },
  database: {
    capacityPerReplica: 300, baseLatencyMs: 15, latencyVarianceMs: 8,
    replicas: 1, timeoutMs: 10000, errorRateAtOverload: 0.1,
    costPerReplicaHour: 0.50, costPerMillionRequests: 0.05,
    dbConnectionPoolSize: 50,
  },
  cache: {
    capacityPerReplica: 50000, baseLatencyMs: 1, latencyVarianceMs: 0.5,
    replicas: 1, timeoutMs: 100, errorRateAtOverload: 0.001,
    costPerReplicaHour: 0.15, costPerMillionRequests: 0.01,
    cacheHitRate: 0.85, cacheStampedeEnabled: true,
  },
  queue: {
    capacityPerReplica: 10000, baseLatencyMs: 5, latencyVarianceMs: 2,
    replicas: 1, timeoutMs: 30000, errorRateAtOverload: 0.01,
    costPerReplicaHour: 0.20, costPerMillionRequests: 0.03,
    queueMaxLag: 1000,
  },
  cdn: {
    capacityPerReplica: 100000, baseLatencyMs: 1, latencyVarianceMs: 0.5,
    replicas: 1, timeoutMs: 1000, errorRateAtOverload: 0.001,
    costPerReplicaHour: 0.30, costPerMillionRequests: 0.01,
    cacheHitRate: 0.95, // CDN edge cache hit rate
  },
  messagebroker: {
    capacityPerReplica: 50000, baseLatencyMs: 3, latencyVarianceMs: 1,
    replicas: 3, timeoutMs: 30000, errorRateAtOverload: 0.01,
    costPerReplicaHour: 0.25, costPerMillionRequests: 0.02,
    brokerConsumerGroups: 3, brokerDlqThreshold: 1000,
  },
  storage: {
    capacityPerReplica: 5000, baseLatencyMs: 50, latencyVarianceMs: 30,
    replicas: 1, timeoutMs: 60000, errorRateAtOverload: 0.005,
    costPerReplicaHour: 0.10, costPerMillionRequests: 0.004,
  },
  dns: {
    capacityPerReplica: 1000000, baseLatencyMs: 1, latencyVarianceMs: 0.2,
    replicas: 2, timeoutMs: 500, errorRateAtOverload: 0.0001,
    costPerReplicaHour: 0.01, costPerMillionRequests: 0.001,
  },
  auth: {
    capacityPerReplica: 2000, baseLatencyMs: 10, latencyVarianceMs: 5,
    replicas: 2, timeoutMs: 2000, errorRateAtOverload: 0.02,
    costPerReplicaHour: 0.08, costPerMillionRequests: 0.05,
  },
  monitoring: {
    capacityPerReplica: 100000, baseLatencyMs: 1, latencyVarianceMs: 0.5,
    replicas: 1, timeoutMs: 5000, errorRateAtOverload: 0.001,
    costPerReplicaHour: 0.20, costPerMillionRequests: 0.001,
  },
  lambda: {
    capacityPerReplica: 1000, baseLatencyMs: 15, latencyVarianceMs: 10,
    replicas: 1, timeoutMs: 30000, errorRateAtOverload: 0.05,
    costPerReplicaHour: 0.00, costPerMillionRequests: 0.20, // pay per invocation
    lambdaColdStartMs: 200, lambdaConcurrencyLimit: 1000,
  },
  container: {
    capacityPerReplica: 500, baseLatencyMs: 20, latencyVarianceMs: 10,
    replicas: 2, timeoutMs: 5000, errorRateAtOverload: 0.05,
    costPerReplicaHour: 0.06, costPerMillionRequests: 0.05,
  },
  gateway: {
    capacityPerReplica: 10000, baseLatencyMs: 3, latencyVarianceMs: 1,
    replicas: 2, timeoutMs: 5000, errorRateAtOverload: 0.01,
    costPerReplicaHour: 0.12, costPerMillionRequests: 0.03,
    gatewayRateLimitPerSec: 5000, gatewayBurstAllowance: 500,
  },
};

export function makeDefaultNode(id: string, type: NodeType, label: string, x: number, y: number): SimNode {
  const d = NODE_DEFAULTS[type];
  return {
    id, type, label, x, y,
    capacityPerReplica: d.capacityPerReplica!,
    baseLatencyMs: d.baseLatencyMs!,
    latencyVarianceMs: d.latencyVarianceMs!,
    replicas: d.replicas!,
    timeoutMs: d.timeoutMs!,
    errorRateAtOverload: d.errorRateAtOverload!,
    circuitBreakerEnabled: type !== "client",
    circuitBreakerThreshold: 5,
    circuitBreakerCooldownMs: 10000,
    retryCount: 0,
    retryBackoffMs: 100,
    autoScaleEnabled: false,
    autoScaleMin: 1,
    autoScaleMax: 10,
    autoScaleUpThreshold: 0.7,
    autoScaleDownThreshold: 0.3,
    autoScaleCooldownSec: 10,
    lastScaleTime: 0,
    cacheHitRate: d.cacheHitRate,
    cacheStampedeEnabled: d.cacheStampedeEnabled,
    dbConnectionPoolSize: d.dbConnectionPoolSize,
    queueMaxLag: d.queueMaxLag,
    lambdaColdStartMs: d.lambdaColdStartMs,
    lambdaConcurrencyLimit: d.lambdaConcurrencyLimit,
    gatewayRateLimitPerSec: d.gatewayRateLimitPerSec,
    gatewayBurstAllowance: d.gatewayBurstAllowance,
    brokerConsumerGroups: d.brokerConsumerGroups,
    brokerDlqThreshold: d.brokerDlqThreshold,
    containerCpuLimit: d.containerCpuLimit,
    containerMemoryMb: d.containerMemoryMb,
    costPerReplicaHour: d.costPerReplicaHour!,
    costPerMillionRequests: d.costPerMillionRequests!,
    alive: true,
    chaosMode: "none",
    circuitBreaker: createCircuitBreaker(),
    queueDepth: 0,
    incomingRate: 0,
    processedRate: 0,
    droppedRate: 0,
    retryingRate: 0,
    utilization: 0,
    metrics: createNodeMetrics(),
  };
}
