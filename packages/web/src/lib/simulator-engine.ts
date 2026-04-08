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

export type NodeType = "client" | "loadbalancer" | "api" | "service" | "database" | "cache" | "queue";

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
    const λ = incomingMap.get(id) || 0;
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
    const effectiveBaseLatency = node.baseLatencyMs + extraLatency + (node.chaosMode === "slow" ? 200 : 0);

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

    // Route traffic
    if (node.type === "cache" && node.cacheHitRate) {
      const missedRate = actuallyDelivered * (1 - node.cacheHitRate);
      routeTraffic(id, missedRate, outgoing, incomingMap, nodeMap);
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
 * Root cause analysis — narrative insights from current state.
 */
export interface RootCauseInsight {
  severity: "info" | "warning" | "critical";
  title: string;
  explanation: string;
  recommendation: string;
}

export function analyzeRootCause(nodes: SimNode[], globalStats: GlobalStats): RootCauseInsight[] {
  const insights: RootCauseInsight[] = [];
  const nonClients = nodes.filter((n) => n.type !== "client" && n.alive);

  // Find overloaded nodes
  const overloaded = nonClients.filter((n) => n.utilization > 1);
  if (overloaded.length > 0) {
    const worst = overloaded.reduce((a, b) => a.utilization > b.utilization ? a : b);
    insights.push({
      severity: "critical",
      title: `${worst.label} is the primary bottleneck`,
      explanation: `Running at ${Math.round(worst.utilization * 100)}% utilization with queue depth of ${Math.round(worst.queueDepth)}. This causes cascading latency spikes for all downstream services.`,
      recommendation: `Scale ${worst.label} from ${worst.replicas} to ${Math.ceil(worst.replicas * worst.utilization * 1.2)} replicas. Or increase capacity per replica (currently ${worst.capacityPerReplica} req/s).`,
    });
  }

  // Latency explosion detection
  const highLatency = nonClients.filter((n) => {
    const p99 = n.metrics.latencyP99[n.metrics.latencyP99.length - 1] || 0;
    return p99 > n.baseLatencyMs * 5;
  });
  if (highLatency.length > 0 && overloaded.length === 0) {
    insights.push({
      severity: "warning",
      title: "Latency amplification detected",
      explanation: `${highLatency.length} nodes have p99 latency >5x their base. This is likely due to queue buildup at utilization >80%.`,
      recommendation: "Consider scaling before saturation hits 80%. Use auto-scaling with scale-up threshold of 0.7.",
    });
  }

  // Circuit breakers tripped
  const tripped = nonClients.filter((n) => n.circuitBreaker.state === "open");
  if (tripped.length > 0) {
    insights.push({
      severity: "critical",
      title: `${tripped.length} circuit breaker(s) open`,
      explanation: `${tripped.map((n) => n.label).join(", ")} stopped accepting traffic after repeated failures. Traffic is being shed to prevent cascade.`,
      recommendation: "Investigate the failing dependency. Circuit will attempt recovery after cooldown.",
    });
  }

  // Error rate alerts
  if (globalStats.successRate < 0.95 && globalStats.totalRequests > 100) {
    insights.push({
      severity: globalStats.successRate < 0.9 ? "critical" : "warning",
      title: `Success rate dropped to ${(globalStats.successRate * 100).toFixed(1)}%`,
      explanation: `${globalStats.totalErrors} errors out of ${globalStats.totalRequests} requests. Failures likely concentrated on overloaded or dead nodes.`,
      recommendation: "Enable circuit breakers on affected nodes. Add retry logic with exponential backoff.",
    });
  }

  // Cache opportunity
  const databases = nonClients.filter((n) => n.type === "database");
  const caches = nonClients.filter((n) => n.type === "cache");
  if (databases.length > 0 && caches.length === 0) {
    const dbOverload = databases.some((d) => d.utilization > 0.7);
    if (dbOverload) {
      insights.push({
        severity: "info",
        title: "Consider adding a cache layer",
        explanation: "Database utilization is high. A cache in front could dramatically reduce DB load.",
        recommendation: "Add a Cache node before your databases. Start with 85% hit rate — this reduces DB load to 15% of current.",
      });
    }
  }

  // Cost alerts
  if (globalStats.monthlyCostEstimate > 10000) {
    insights.push({
      severity: "warning",
      title: "High infrastructure cost",
      explanation: `Projected monthly cost: $${Math.round(globalStats.monthlyCostEstimate).toLocaleString()}. Most expensive nodes carry significant replica counts.`,
      recommendation: "Review replicas on low-utilization nodes. Consider auto-scaling to reduce waste during off-peak hours.",
    });
  }

  // SLO met — positive insight
  if (globalStats.sloMet && globalStats.totalRequests > 1000) {
    insights.push({
      severity: "info",
      title: "SLO is being met",
      explanation: `Success rate ${(globalStats.successRate * 100).toFixed(2)}% and p99 latency ${Math.round(globalStats.p99LatencyMs)}ms meet the 99.9/500ms SLO.`,
      recommendation: "Current capacity is well-sized. Monitor during traffic spikes.",
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
