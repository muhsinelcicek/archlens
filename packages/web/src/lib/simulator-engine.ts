/**
 * Architecture Simulator Engine
 *
 * Models a distributed system using queueing theory (M/M/c approximation).
 * Each node has a service rate, queue, and statistical metrics.
 *
 * Key concepts:
 * - Arrival rate (λ): incoming requests per second
 * - Service rate (μ): capacity per replica
 * - Utilization (ρ): λ / (μ * replicas)
 * - Queue grows when ρ > 1 (unstable)
 * - Latency explodes as ρ → 1 (Little's Law approximation)
 * - Timeouts/errors appear under sustained overload
 */

export type NodeType = "client" | "loadbalancer" | "api" | "service" | "database" | "cache" | "queue";

export interface SimNode {
  id: string;
  type: NodeType;
  label: string;
  x: number;
  y: number;

  // Configuration
  capacityPerReplica: number; // req/s per replica (service rate μ)
  baseLatencyMs: number;      // p50 base latency
  latencyVarianceMs: number;  // stddev for p95/p99 calculation
  replicas: number;
  timeoutMs: number;          // request deadline (fails if exceeded)
  errorRateAtOverload: number; // fraction that fails at 100% saturation (0-1)

  // Component-specific
  cacheHitRate?: number;      // 0-1, only for cache type
  retryCount?: number;        // retry attempts on failure
  autoScale?: {
    enabled: boolean;
    minReplicas: number;
    maxReplicas: number;
    scaleUpThreshold: number;   // saturation at which to scale up
    scaleDownThreshold: number;
  };

  // Runtime state
  alive: boolean;
  queueDepth: number;           // requests currently queued
  activeRequests: number;       // in-flight requests
  incomingRate: number;         // req/s arriving (λ)
  processedRate: number;        // req/s actually processed
  droppedRate: number;          // req/s dropped due to overload/timeout
  utilization: number;          // ρ = λ / (μ*c)

  // Metrics (rolling window)
  metrics: NodeMetrics;
}

export interface NodeMetrics {
  throughput: number[];       // req/s per bucket
  latencyP50: number[];       // ms
  latencyP95: number[];
  latencyP99: number[];
  errorRate: number[];        // 0-1
  queueDepth: number[];       // queue size snapshots
  totalRequests: number;
  totalErrors: number;
  totalTimeouts: number;
}

export interface SimEdge {
  id: string;
  source: string;
  target: string;
  weight: number;             // 0-1 routing weight (for LB distribution)
  latencyMs: number;          // network latency on this hop
}

export interface SimulatorConfig {
  trafficRate: number;        // req/s per client source
  globalTimeoutMs: number;    // default timeout
  tickMs: number;             // simulation tick interval
  metricsWindowSec: number;   // rolling window size
}

export interface GlobalStats {
  uptime: number;             // seconds since start
  totalRequests: number;
  totalSuccesses: number;
  totalErrors: number;
  totalTimeouts: number;
  successRate: number;        // 0-1
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  sloMet: boolean;            // e.g., p99 < 500ms AND success > 99%
}

const METRICS_BUCKETS = 30; // 30 seconds of history

export function createNodeMetrics(): NodeMetrics {
  return {
    throughput: Array(METRICS_BUCKETS).fill(0),
    latencyP50: Array(METRICS_BUCKETS).fill(0),
    latencyP95: Array(METRICS_BUCKETS).fill(0),
    latencyP99: Array(METRICS_BUCKETS).fill(0),
    errorRate: Array(METRICS_BUCKETS).fill(0),
    queueDepth: Array(METRICS_BUCKETS).fill(0),
    totalRequests: 0,
    totalErrors: 0,
    totalTimeouts: 0,
  };
}

/**
 * M/M/c queue latency approximation.
 * Returns effective latency at the given utilization ρ.
 * As ρ → 1, latency explodes due to queueing delay (Erlang C).
 */
export function queueLatency(baseLatencyMs: number, utilization: number): number {
  const ρ = Math.max(0, Math.min(0.999, utilization));
  // Simplified M/M/1 wait time: W_q = ρ / (μ(1-ρ))
  // Total time in system: W = baseLatency + W_q
  // We express W_q as a multiplier on baseLatency:
  // At ρ=0.5: ~1.5x
  // At ρ=0.8: ~4x
  // At ρ=0.9: ~9x
  // At ρ=0.99: ~100x
  if (ρ < 0.5) return baseLatencyMs * (1 + ρ);
  const queueMultiplier = ρ / (1 - ρ + 0.001);
  return baseLatencyMs * (1 + queueMultiplier);
}

/**
 * Approximate percentiles from a base + variance.
 * In a real system you'd use a histogram; this is a normal-ish approximation.
 */
export function percentiles(baseMs: number, varianceMs: number, utilization: number): { p50: number; p95: number; p99: number } {
  const effectiveBase = queueLatency(baseMs, utilization);
  const jitter = varianceMs * (1 + utilization * 3);
  return {
    p50: effectiveBase,
    p95: effectiveBase + jitter * 1.645,   // normal z-score for 95%
    p99: effectiveBase + jitter * 2.326,   // normal z-score for 99%
  };
}

/**
 * Calculate error rate based on utilization.
 * Errors start appearing at 90% utilization and grow rapidly past 100%.
 */
export function calcErrorRate(utilization: number, baseErrorRate: number): number {
  if (utilization < 0.8) return 0;
  if (utilization < 1.0) return (utilization - 0.8) * 0.25 * baseErrorRate * 5; // ramp to 25%*base
  // Over 100%: errors compound rapidly
  const overflow = utilization - 1.0;
  return Math.min(1, baseErrorRate + overflow * 0.5 + 0.25 * baseErrorRate * 5);
}

/**
 * Main simulation tick. Mutates nodes in place.
 * Propagates traffic, updates stats, applies failure modes.
 */
export function simulateTick(
  nodes: SimNode[],
  edges: SimEdge[],
  config: SimulatorConfig,
  tickSeconds: number,
): { delivered: number; failed: number; avgLatency: number; p95: number; p99: number } {
  // Build adjacency
  const outgoing = new Map<string, SimEdge[]>();
  for (const e of edges) {
    if (!outgoing.has(e.source)) outgoing.set(e.source, []);
    outgoing.get(e.source)!.push(e);
  }

  const nodeMap = new Map<string, SimNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  // Topological-ish order (BFS from clients)
  const clients = nodes.filter((n) => n.type === "client" && n.alive);
  const visited = new Set<string>();
  const order: string[] = [];
  const queue: string[] = clients.map((c) => c.id);
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    order.push(id);
    const outs = outgoing.get(id) || [];
    for (const e of outs) {
      if (!visited.has(e.target)) queue.push(e.target);
    }
  }

  // Reset incoming rates for non-clients
  const incomingMap = new Map<string, number>();
  for (const n of nodes) {
    incomingMap.set(n.id, n.type === "client" && n.alive ? config.trafficRate : 0);
  }

  let totalDelivered = 0;
  let totalFailed = 0;
  const allLatencies: number[] = [];

  // Propagate along order
  for (const id of order) {
    const node = nodeMap.get(id)!;
    const λ = incomingMap.get(id) || 0;
    const capacity = node.capacityPerReplica * node.replicas;

    if (!node.alive) {
      node.incomingRate = λ;
      node.processedRate = 0;
      node.droppedRate = λ;
      node.utilization = 0;
      node.queueDepth = 0;
      totalFailed += λ * tickSeconds;
      continue;
    }

    // Utilization
    const ρ = capacity > 0 ? λ / capacity : 0;
    node.utilization = ρ;
    node.incomingRate = λ;

    // Processed rate (capped at capacity)
    const processed = Math.min(λ, capacity);

    // Error rate from queueing + base error rate
    const errRate = calcErrorRate(ρ, node.errorRateAtOverload || 0.05);

    // Requests dropped (timeout + overflow)
    const dropped = λ * errRate + Math.max(0, λ - capacity);
    const actuallyDelivered = Math.max(0, processed - dropped);

    node.processedRate = processed;
    node.droppedRate = dropped;

    // Queue depth grows when λ > μ (approximation)
    if (ρ > 1) {
      node.queueDepth += (λ - capacity) * tickSeconds;
    } else {
      // Queue drains
      node.queueDepth = Math.max(0, node.queueDepth - capacity * tickSeconds * 0.5);
    }
    // Cap queue depth
    node.queueDepth = Math.min(node.queueDepth, 10000);

    // Latency percentiles
    const pct = percentiles(node.baseLatencyMs, node.latencyVarianceMs, Math.min(ρ, 1.5));
    // Timeout: if p99 > timeoutMs, those become errors
    let extraTimeouts = 0;
    if (pct.p99 > node.timeoutMs) {
      extraTimeouts = λ * 0.01; // 1% timeout at p99
    }
    if (pct.p95 > node.timeoutMs) {
      extraTimeouts += λ * 0.05; // additional 5%
    }
    node.droppedRate += extraTimeouts;

    // Update metrics rolling window
    pushMetric(node.metrics.throughput, actuallyDelivered);
    pushMetric(node.metrics.latencyP50, pct.p50);
    pushMetric(node.metrics.latencyP95, pct.p95);
    pushMetric(node.metrics.latencyP99, pct.p99);
    pushMetric(node.metrics.errorRate, errRate);
    pushMetric(node.metrics.queueDepth, node.queueDepth);
    node.metrics.totalRequests += Math.round(λ * tickSeconds);
    node.metrics.totalErrors += Math.round((dropped + extraTimeouts) * tickSeconds);
    if (pct.p95 > node.timeoutMs) node.metrics.totalTimeouts += Math.round(extraTimeouts * tickSeconds);

    allLatencies.push(pct.p50, pct.p95, pct.p99);

    // Handle component-specific behaviors
    if (node.type === "cache" && node.cacheHitRate) {
      // On cache hit, request does NOT propagate downstream
      const missedRate = actuallyDelivered * (1 - node.cacheHitRate);
      routeTraffic(id, missedRate, outgoing, incomingMap, nodeMap);
    } else {
      // Normal propagation
      routeTraffic(id, actuallyDelivered, outgoing, incomingMap, nodeMap);
    }

    // Auto-scaling (simple)
    if (node.autoScale?.enabled) {
      if (ρ > node.autoScale.scaleUpThreshold && node.replicas < node.autoScale.maxReplicas) {
        node.replicas += 1;
      } else if (ρ < node.autoScale.scaleDownThreshold && node.replicas > node.autoScale.minReplicas) {
        node.replicas = Math.max(node.autoScale.minReplicas, node.replicas - 1);
      }
    }

    totalDelivered += actuallyDelivered * tickSeconds;
    totalFailed += (dropped + extraTimeouts) * tickSeconds;
  }

  allLatencies.sort((a, b) => a - b);
  const avgLatency = allLatencies.length > 0 ? allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length : 0;
  const p95 = allLatencies.length > 0 ? allLatencies[Math.floor(allLatencies.length * 0.95)] : 0;
  const p99 = allLatencies.length > 0 ? allLatencies[Math.floor(allLatencies.length * 0.99)] : 0;

  return { delivered: totalDelivered, failed: totalFailed, avgLatency, p95, p99 };
}

/**
 * Route outgoing traffic using edge weights or round-robin for LB.
 */
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

  // Filter to edges whose targets are alive
  const aliveOuts = outs.filter((e) => nodeMap.get(e.target)?.alive);
  if (aliveOuts.length === 0) return;

  if (sourceNode?.type === "loadbalancer") {
    // Round-robin: equal weight across alive targets
    const share = throughput / aliveOuts.length;
    for (const e of aliveOuts) {
      incomingMap.set(e.target, (incomingMap.get(e.target) || 0) + share);
    }
  } else {
    // Weighted routing
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
 * Calculate global stats across all nodes.
 */
export function getGlobalStats(nodes: SimNode[], uptimeSec: number): GlobalStats {
  let totalRequests = 0;
  let totalErrors = 0;
  let totalTimeouts = 0;
  const latencies: number[] = [];

  const nonClients = nodes.filter((n) => n.type !== "client");
  for (const n of nonClients) {
    totalRequests += n.metrics.totalRequests;
    totalErrors += n.metrics.totalErrors;
    totalTimeouts += n.metrics.totalTimeouts;
    const lastP50 = n.metrics.latencyP50[n.metrics.latencyP50.length - 1] || 0;
    const lastP95 = n.metrics.latencyP95[n.metrics.latencyP95.length - 1] || 0;
    const lastP99 = n.metrics.latencyP99[n.metrics.latencyP99.length - 1] || 0;
    if (lastP50 > 0) latencies.push(lastP50, lastP95, lastP99);
  }

  latencies.sort((a, b) => a - b);
  const avg = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;
  const p99 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)] : 0;
  const successRate = totalRequests > 0 ? (totalRequests - totalErrors) / totalRequests : 1;
  // SLO: 99% success + p99 < 500ms
  const sloMet = successRate >= 0.99 && p99 < 500;

  return {
    uptime: uptimeSec,
    totalRequests,
    totalSuccesses: totalRequests - totalErrors,
    totalErrors,
    totalTimeouts,
    successRate,
    avgLatencyMs: avg,
    p95LatencyMs: p95,
    p99LatencyMs: p99,
    sloMet,
  };
}

export const NODE_DEFAULTS: Record<NodeType, Partial<SimNode>> = {
  client: {
    capacityPerReplica: 999999,
    baseLatencyMs: 0,
    latencyVarianceMs: 0,
    replicas: 1,
    timeoutMs: 5000,
    errorRateAtOverload: 0,
  },
  loadbalancer: {
    capacityPerReplica: 20000,
    baseLatencyMs: 2,
    latencyVarianceMs: 1,
    replicas: 2,
    timeoutMs: 5000,
    errorRateAtOverload: 0.001,
  },
  api: {
    capacityPerReplica: 500,
    baseLatencyMs: 25,
    latencyVarianceMs: 10,
    replicas: 2,
    timeoutMs: 3000,
    errorRateAtOverload: 0.05,
  },
  service: {
    capacityPerReplica: 400,
    baseLatencyMs: 40,
    latencyVarianceMs: 15,
    replicas: 2,
    timeoutMs: 5000,
    errorRateAtOverload: 0.05,
  },
  database: {
    capacityPerReplica: 300,
    baseLatencyMs: 15,
    latencyVarianceMs: 8,
    replicas: 1,
    timeoutMs: 10000,
    errorRateAtOverload: 0.1,
  },
  cache: {
    capacityPerReplica: 50000,
    baseLatencyMs: 1,
    latencyVarianceMs: 0.5,
    replicas: 1,
    timeoutMs: 100,
    errorRateAtOverload: 0.001,
    cacheHitRate: 0.85,
  },
  queue: {
    capacityPerReplica: 10000,
    baseLatencyMs: 5,
    latencyVarianceMs: 2,
    replicas: 1,
    timeoutMs: 30000,
    errorRateAtOverload: 0.01,
  },
};
