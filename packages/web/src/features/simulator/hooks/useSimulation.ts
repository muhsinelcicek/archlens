/**
 * useSimulation — core simulation loop, state, and actions.
 *
 * Encapsulates: nodes, edges, running state, tick loop,
 * traffic pattern, speed, uptime, global stats, events.
 *
 * SimulatorPage just calls this hook and passes parts to sub-components.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useStore, type SimulatorSnapshot } from "../../../lib/store.js";
import {
  type SimNode, type SimEdge, type TrafficPattern, type SimulatorConfig,
  type GlobalStats, type EventLogEntry, type NodeIncident, type ChaosConfig,
  simulateTick, getGlobalStats, createNodeMetrics, createCircuitBreaker,
  makeDefaultNode, detectIncidents,
  type NodeType,
} from "../../../lib/simulator-engine.js";
import { SCENARIO_TEMPLATES, LOAD_TEST_PRESETS } from "../../../lib/simulator-scenarios.js";

const STORAGE_KEY = "archlens-simulator-scenarios";

export interface SavedScenario {
  name: string;
  savedAt: string;
  nodes: SimNode[];
  edges: SimEdge[];
  trafficPattern: TrafficPattern;
}

export function useSimulation() {
  const { model, setSimulatorSnapshot } = useStore();

  // Topology
  const [nodes, setNodes] = useState<SimNode[]>([]);
  const [edges, setEdges] = useState<SimEdge[]>([]);

  // Simulation
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [trafficPattern, setTrafficPattern] = useState<TrafficPattern>({
    type: "constant", baseRate: 500,
  });
  const [uptime, setUptime] = useState(0);
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([]);
  const [nodeIncidents, setNodeIncidents] = useState<Map<string, NodeIncident[]>>(new Map());
  const [budgetLimit] = useState(5000);

  // Chaos
  const [chaosEnabled, setChaosEnabled] = useState(false);
  const [chaosConfig, setChaosConfig] = useState<ChaosConfig>({
    enabled: false, randomKillChancePerMin: 0, latencyInjectionMs: 0, networkPartitionEdges: [],
  });

  // Saved scenarios
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);

  // Refs
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef(0);
  const tickCounterRef = useRef(0);
  const [, forceUpdate] = useState(0);

  // Load saved scenarios
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSavedScenarios(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  // Auto-init from model
  useEffect(() => {
    if (!model || nodes.length > 0) return;
    initFromModel();
  }, [model, nodes.length]);

  const initFromModel = useCallback(() => {
    if (!model) return;
    const mods = model.modules.slice(0, 8);
    const spacing = 220;
    const startY = 180;
    const initial: SimNode[] = [];

    initial.push(makeDefaultNode("client-0", "client", "Users", 40, startY + 80));
    initial.push(makeDefaultNode("lb-0", "loadbalancer", "Load Balancer", 220, startY + 80));

    const byLayer: Record<string, typeof mods> = {};
    for (const m of mods) {
      const l = m.layer || "unknown";
      if (!byLayer[l]) byLayer[l] = [];
      byLayer[l].push(m);
    }

    const LAYER_TO_TYPE: Record<string, NodeType> = {
      presentation: "client", api: "api", application: "service",
      domain: "service", infrastructure: "database", config: "service",
    };
    const layerOrder = ["api", "application", "domain", "infrastructure", "presentation", "config", "unknown"];
    let colIdx = 2;
    for (const layer of layerOrder) {
      const layerMods = byLayer[layer];
      if (!layerMods) continue;
      layerMods.forEach((m, rowIdx) => {
        const type = LAYER_TO_TYPE[layer] || "service";
        const y = startY + rowIdx * 110 - ((layerMods.length - 1) * 55);
        initial.push(makeDefaultNode(`mod-${m.name}`, type, m.name, 40 + colIdx * spacing, y));
      });
      colIdx++;
    }

    setNodes(initial);

    const initialEdges: SimEdge[] = [];
    let eid = 0;
    initialEdges.push({ id: `e${eid++}`, source: "client-0", target: "lb-0", weight: 1, latencyMs: 1, retryEnabled: false });

    const moduleNodeIds = new Set(initial.filter((n) => n.id.startsWith("mod-")).map((n) => n.id.replace("mod-", "")));
    const firstLayerNodes = initial.filter((n) => n.id.startsWith("mod-") && n.type === "api");
    if (firstLayerNodes.length > 0) {
      for (const apiNode of firstLayerNodes) {
        initialEdges.push({ id: `e${eid++}`, source: "lb-0", target: apiNode.id, weight: 1 / firstLayerNodes.length, latencyMs: 2, retryEnabled: false });
      }
    } else {
      const firstMod = initial.find((n) => n.id.startsWith("mod-"));
      if (firstMod) initialEdges.push({ id: `e${eid++}`, source: "lb-0", target: firstMod.id, weight: 1, latencyMs: 2, retryEnabled: false });
    }

    const edgeSet = new Set<string>();
    for (const rel of model.relations.slice(0, 150)) {
      const src = rel.source.split("/")[0];
      const tgtSym = (model.symbols as Record<string, { filePath?: string }>)[rel.target];
      const tgt = tgtSym?.filePath?.split("/")[0];
      if (src && tgt && src !== tgt && moduleNodeIds.has(src) && moduleNodeIds.has(tgt)) {
        const key = `mod-${src}→mod-${tgt}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          initialEdges.push({ id: `e${eid++}`, source: `mod-${src}`, target: `mod-${tgt}`, weight: 1, latencyMs: 3, retryEnabled: false });
        }
      }
    }
    setEdges(initialEdges);
  }, [model]);

  // ─── Simulation loop ───────────────────────────────────

  useEffect(() => {
    if (!running) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTickRef.current = 0;
      return;
    }

    const tickIntervalMs = 250;
    const loop = (t: number) => {
      if (!lastTickRef.current) lastTickRef.current = t;
      const dt = t - lastTickRef.current;

      if (dt >= tickIntervalMs / speed) {
        const tickSeconds = (dt / 1000) * speed;
        const nowMs = Date.now();

        setNodes((prev) => {
          const copy = prev.map((n) => ({
            ...n,
            metrics: {
              ...n.metrics,
              throughput: [...n.metrics.throughput],
              latencyP50: [...n.metrics.latencyP50],
              latencyP95: [...n.metrics.latencyP95],
              latencyP99: [...n.metrics.latencyP99],
              errorRate: [...n.metrics.errorRate],
              queueDepth: [...n.metrics.queueDepth],
              replicas: [...n.metrics.replicas],
            },
          }));

          const config: SimulatorConfig = {
            trafficPattern,
            globalTimeoutMs: 3000,
            tickMs: tickIntervalMs,
            metricsWindowSec: 60,
            chaosConfig: chaosEnabled ? chaosConfig : undefined,
          };

          const result = simulateTick(copy, edges, config, tickSeconds, uptime, nowMs);

          if (result.events.length > 0) {
            setEventLog((prevLog) => [...result.events, ...prevLog].slice(0, 100));
          }

          return copy;
        });

        lastTickRef.current = t;
        tickCounterRef.current++;
        if (tickCounterRef.current % 4 === 0) {
          setUptime((prev) => prev + 1);
        }
        forceUpdate((v) => v + 1);
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [running, speed, edges, trafficPattern, chaosEnabled, chaosConfig, uptime]);

  // Update stats + incidents + publish snapshot
  useEffect(() => {
    if (running) {
      const stats = getGlobalStats(nodes, uptime);
      setGlobalStats(stats);
      const incidents = detectIncidents(nodes, edges, stats);
      setNodeIncidents(incidents);

      const topInc: SimulatorSnapshot["topIncidents"] = [];
      for (const [nodeId, nodeInc] of incidents) {
        const node = nodes.find((nd) => nd.id === nodeId);
        for (const inc of nodeInc) {
          if (inc.type !== "TOPOLOGY_PRESSURE" && topInc.length < 5) {
            topInc.push({ nodeLabel: node?.label || nodeId, type: inc.type, severity: inc.severity, label: inc.label });
          }
        }
      }
      topInc.sort((a, b) => b.severity - a.severity);
      setSimulatorSnapshot({
        timestamp: new Date().toISOString(),
        uptime,
        successRate: stats.successRate,
        p95LatencyMs: stats.p95LatencyMs,
        p99LatencyMs: stats.p99LatencyMs,
        totalRequests: stats.totalRequests,
        totalErrors: stats.totalErrors,
        monthlyCost: stats.monthlyCostEstimate,
        sloMet: stats.sloMet,
        bottleneck: stats.bottleneckNode || null,
        incidentCount: topInc.length,
        topIncidents: topInc,
      });
    } else {
      setSimulatorSnapshot(null);
    }
  }, [uptime, nodes, edges, running, setSimulatorSnapshot]);

  // ─── Actions ───────────────────────────────────────────

  const addNode = useCallback((type: NodeType, x: number, y: number) => {
    const id = `n-${Date.now()}`;
    setNodes((prev) => [...prev, makeDefaultNode(id, type, type, x, y)]);
    return id;
  }, []);

  const deleteNodes = useCallback((ids: Set<string>) => {
    setNodes((prev) => prev.filter((n) => !ids.has(n.id)));
    setEdges((prev) => prev.filter((e) => !ids.has(e.source) && !ids.has(e.target)));
  }, []);

  const updateNode = useCallback((id: string, patch: Partial<SimNode>) => {
    setNodes((prev) => prev.map((n) => n.id === id ? { ...n, ...patch } : n));
  }, []);

  const killNode = useCallback((id: string) => {
    setNodes((prev) => prev.map((n) => n.id === id ? { ...n, alive: !n.alive } : n));
  }, []);

  const connectNodes = useCallback((source: string, target: string) => {
    setEdges((prev) => {
      if (prev.some((e) => e.source === source && e.target === target)) return prev;
      return [...prev, { id: `e${Date.now()}`, source, target, weight: 1, latencyMs: 2, retryEnabled: false }];
    });
  }, []);

  const reset = useCallback(() => {
    setRunning(false);
    setUptime(0);
    tickCounterRef.current = 0;
    setEventLog([]);
    setGlobalStats(null);
    setNodeIncidents(new Map());
    setNodes((prev) => prev.map((n) => ({
      ...n, alive: true, queueDepth: 0, incomingRate: 0, processedRate: 0,
      droppedRate: 0, retryingRate: 0, utilization: 0, lastScaleTime: 0,
      circuitBreaker: createCircuitBreaker(), metrics: createNodeMetrics(),
    })));
  }, []);

  const loadTemplate = useCallback((templateId: string) => {
    const tpl = SCENARIO_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;
    const { nodes: n, edges: e } = tpl.build();
    setNodes(n);
    setEdges(e);
    reset();
  }, [reset]);

  const loadLoadTest = useCallback((presetId: string) => {
    const preset = LOAD_TEST_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setTrafficPattern(preset.trafficPattern as TrafficPattern);
  }, []);

  const saveCurrent = useCallback((name: string) => {
    const scenario: SavedScenario = { name, savedAt: new Date().toISOString(), nodes, edges, trafficPattern };
    const next = [scenario, ...savedScenarios.filter((s) => s.name !== name)];
    setSavedScenarios(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, [nodes, edges, trafficPattern, savedScenarios]);

  const loadSaved = useCallback((scenario: SavedScenario) => {
    const freshNodes = scenario.nodes.map((n) => ({
      ...n, alive: true, queueDepth: 0, incomingRate: 0, processedRate: 0,
      droppedRate: 0, retryingRate: 0, utilization: 0,
      circuitBreaker: createCircuitBreaker(), metrics: createNodeMetrics(),
    }));
    setNodes(freshNodes);
    setEdges(scenario.edges);
    setTrafficPattern(scenario.trafficPattern);
    reset();
  }, [reset]);

  const deleteSaved = useCallback((name: string) => {
    const next = savedScenarios.filter((s) => s.name !== name);
    setSavedScenarios(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, [savedScenarios]);

  return {
    // State
    nodes, setNodes, edges, setEdges,
    running, setRunning, speed, setSpeed,
    trafficPattern, setTrafficPattern,
    uptime, globalStats, eventLog, nodeIncidents,
    budgetLimit,
    chaosEnabled, setChaosEnabled, chaosConfig, setChaosConfig,
    savedScenarios,

    // Actions
    addNode, deleteNodes, updateNode, killNode, connectNodes, reset,
    loadTemplate, loadLoadTest, saveCurrent, loadSaved, deleteSaved,

    // Templates & presets (for UI)
    templates: SCENARIO_TEMPLATES,
    loadTestPresets: LOAD_TEST_PRESETS,
  };
}
