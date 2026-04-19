import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useStore, type SimulatorSnapshot } from "../lib/store.js";
import {
  Play, Pause, Server, Database, Cloud, Layers,
  Users, RotateCcw, AlertTriangle, Activity, Skull, TrendingUp,
  Settings, Zap, CheckCircle2, XCircle, Gauge, Clock, DollarSign,
  Save, Upload, Sparkles, Shuffle, Scissors, FileText, ChevronDown,
  BookOpen, Lightbulb, BarChart3, Globe, MessageSquare, HardDrive,
  Wifi, Shield, Eye, Code, Container, Network,
  ZoomIn, ZoomOut, Maximize2, Undo2, Redo2, Grid3x3, Crosshair,
  Copy, Clipboard, Map as MapIcon,
} from "lucide-react";
import { useCanvasTransform } from "../lib/use-canvas-transform.js";
import { useUndoRedo } from "../lib/use-undo-redo.js";
import {
  type SimNode, type SimEdge, type NodeType, type TrafficPattern, type SimulatorConfig,
  type GlobalStats, type EventLogEntry, type RootCauseInsight, type ChaosConfig,
  type NodeIncident,
  simulateTick, getGlobalStats, createNodeMetrics, createCircuitBreaker,
  makeDefaultNode, analyzeRootCause, detectIncidents,
} from "../lib/simulator-engine.js";
import { SCENARIO_TEMPLATES, LOAD_TEST_PRESETS } from "../lib/simulator-scenarios.js";

/* ═══════════════════════════════════════════════════════════════
   Architecture Simulator v3 — Production-grade
   ═══════════════════════════════════════════════════════════════ */

const TYPE_CONFIG: Record<NodeType, { icon: React.ElementType; color: string; label: string }> = {
  client:       { icon: Users,    color: "#34d399", label: "Client" },
  loadbalancer: { icon: Layers,   color: "#60a5fa", label: "Load Balancer" },
  api:          { icon: Cloud,    color: "#a78bfa", label: "API" },
  service:      { icon: Server,   color: "#fbbf24", label: "Service" },
  database:     { icon: Database, color: "#f87171", label: "Database" },
  cache:        { icon: Zap,      color: "#f472b6", label: "Cache" },
  queue:        { icon: Activity, color: "#06b6d4", label: "Queue" },
  cdn:          { icon: Globe,    color: "#10b981", label: "CDN" },
  messagebroker:{ icon: MessageSquare, color: "#8b5cf6", label: "Message Broker" },
  storage:      { icon: HardDrive, color: "#ef4444", label: "Storage" },
  dns:          { icon: Wifi,     color: "#6366f1", label: "DNS" },
  auth:         { icon: Shield,   color: "#f59e0b", label: "Auth" },
  monitoring:   { icon: Eye,      color: "#14b8a6", label: "Monitoring" },
  lambda:       { icon: Code,     color: "#ec4899", label: "Lambda" },
  container:    { icon: Container, color: "#0ea5e9", label: "Container" },
  gateway:      { icon: Network,  color: "#84cc16", label: "Gateway" },
};

const LAYER_TO_TYPE: Record<string, NodeType> = {
  presentation: "client",
  api: "api",
  application: "service",
  domain: "service",
  infrastructure: "database",
  config: "service",
};

const STORAGE_KEY = "archlens-simulator-scenarios";

interface SavedScenario {
  name: string;
  savedAt: string;
  nodes: SimNode[];
  edges: SimEdge[];
  trafficPattern: TrafficPattern;
}

export function SimulatorView() {
  const { model } = useStore();
  const canvasRef = useRef<HTMLDivElement>(null);

  // Canvas transform (zoom/pan)
  const canvas = useCanvasTransform({ minScale: 0.25, maxScale: 4, gridSize: 20 });

  // Topology
  const [nodes, setNodes] = useState<SimNode[]>([]);
  const [edges, setEdges] = useState<SimEdge[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [clipboard, setClipboard] = useState<SimNode | null>(null);
  const [showMinimap, setShowMinimap] = useState(true);
  const [nodeIncidents, setNodeIncidents] = useState<Map<string, NodeIncident[]>>(new Map());
  const [tracing, setTracing] = useState(false);
  const [tracePath, setTracePath] = useState<string[]>([]);
  const [traceStep, setTraceStep] = useState(-1);
  const traceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Compat: single selection helper
  const selectedId = selectedIds.size === 1 ? [...selectedIds][0] : null;

  // Simulation
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [trafficPattern, setTrafficPattern] = useState<TrafficPattern>({
    type: "constant", baseRate: 500,
  });
  const [uptime, setUptime] = useState(0);
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([]);
  const [budgetLimit, setBudgetLimit] = useState(5000); // $/mo

  // Chaos
  const [chaosEnabled, setChaosEnabled] = useState(false);
  const [chaosConfig, setChaosConfig] = useState<ChaosConfig>({
    enabled: false,
    randomKillChancePerMin: 0,
    latencyInjectionMs: 0,
    networkPartitionEdges: [],
  });

  // UI
  const [showEventLog, setShowEventLog] = useState(true);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showLoadTests, setShowLoadTests] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [rightTab, setRightTab] = useState<"inspector" | "insights">("inspector");
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);

  // Simulation refs
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef(0);
  const tickCounterRef = useRef(0);
  const [, forceUpdate] = useState(0);

  // ─── Load saved scenarios from localStorage ───────────────

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSavedScenarios(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  // ─── Initialize from real architecture ─────────────────────

  useEffect(() => {
    if (!model || nodes.length > 0) return;

    const mods = model.modules.slice(0, 8);
    const spacing = 220;
    const startY = 180;

    const initial: SimNode[] = [];

    // Client + LB entry
    initial.push(makeDefaultNode("client-0", "client", "Users", 40, startY + 80));
    initial.push(makeDefaultNode("lb-0", "loadbalancer", "Load Balancer", 220, startY + 80));

    // Group by layer
    const byLayer: Record<string, typeof mods> = {};
    for (const m of mods) {
      const l = m.layer || "unknown";
      if (!byLayer[l]) byLayer[l] = [];
      byLayer[l].push(m);
    }

    const layerOrder = ["api", "application", "domain", "infrastructure", "presentation", "config", "unknown"];
    let colIdx = 2;
    for (const layer of layerOrder) {
      const layerMods = byLayer[layer];
      if (!layerMods || layerMods.length === 0) continue;
      layerMods.forEach((m, rowIdx) => {
        const type = LAYER_TO_TYPE[layer] || "service";
        const y = startY + rowIdx * 110 - ((layerMods.length - 1) * 55);
        const node = makeDefaultNode(`mod-${m.name}`, type, m.name, 40 + colIdx * spacing, y);
        initial.push(node);
      });
      colIdx++;
    }

    setNodes(initial);

    // Edges
    const initialEdges: SimEdge[] = [];
    let eid = 0;
    initialEdges.push(mkEdge(`e${eid++}`, "client-0", "lb-0", 1, 1));

    const moduleNodeIds = new Set(initial.filter((n) => n.id.startsWith("mod-")).map((n) => n.id.replace("mod-", "")));
    const firstLayerNodes = initial.filter((n) => n.id.startsWith("mod-") && n.type === "api");
    if (firstLayerNodes.length > 0) {
      for (const apiNode of firstLayerNodes) {
        initialEdges.push(mkEdge(`e${eid++}`, "lb-0", apiNode.id, 1 / firstLayerNodes.length, 2));
      }
    } else {
      const firstMod = initial.find((n) => n.id.startsWith("mod-"));
      if (firstMod) initialEdges.push(mkEdge(`e${eid++}`, "lb-0", firstMod.id, 1, 2));
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
          initialEdges.push(mkEdge(`e${eid++}`, `mod-${src}`, `mod-${tgt}`, 1, 3));
        }
      }
    }

    setEdges(initialEdges);
  }, [model, nodes.length]);

  // ─── Simulation loop ───────────────────────────────────────

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
          // Deep clone metrics arrays to avoid mutation issues
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

          // Append events
          if (result.events.length > 0) {
            setEventLog((prevLog) => {
              const combined = [...result.events, ...prevLog];
              return combined.slice(0, 100); // cap at 100
            });
          }

          return copy;
        });

        lastTickRef.current = t;
        tickCounterRef.current++;
        // Update uptime every 4 ticks (1s)
        if (tickCounterRef.current % 4 === 0) {
          setUptime((prev) => prev + 1);
        }
        forceUpdate((v) => v + 1);
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running, speed, edges, trafficPattern, chaosEnabled, chaosConfig, uptime]);

  // Update global stats + detect incidents + publish to store
  const { setSimulatorSnapshot } = useStore();
  useEffect(() => {
    if (running) {
      const stats = getGlobalStats(nodes, uptime);
      setGlobalStats(stats);
      const incidents = detectIncidents(nodes, edges, stats);
      setNodeIncidents(incidents);
      // Publish snapshot to global store for cross-page access
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

  // Root cause insights
  const insights = useMemo<RootCauseInsight[]>(() => {
    if (!globalStats || !running) return [];
    return analyzeRootCause(nodes, globalStats);
  }, [globalStats, nodes, running]);

  // ─── Keyboard shortcuts ────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === "z") { e.preventDefault(); /* undo placeholder */ }
      if (meta && e.key === "y") { e.preventDefault(); /* redo placeholder */ }
      if (meta && e.key === "c" && selectedId) {
        e.preventDefault();
        const node = nodes.find((n) => n.id === selectedId);
        if (node) setClipboard(node);
      }
      if (meta && e.key === "v" && clipboard) {
        e.preventDefault();
        const id = `n-${Date.now()}`;
        setNodes((prev) => [...prev, { ...clipboard, id, x: clipboard.x + 40, y: clipboard.y + 40, metrics: createNodeMetrics(), circuitBreaker: createCircuitBreaker() }]);
        setSelectedIds(new Set([id]));
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.size > 0) {
        e.preventDefault();
        setNodes((prev) => prev.filter((n) => !selectedIds.has(n.id)));
        setEdges((prev) => prev.filter((e) => !selectedIds.has(e.source) && !selectedIds.has(e.target)));
        setSelectedIds(new Set());
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId, selectedIds, clipboard, nodes]);

  // ─── Drag-drop (zoom-aware + snap-to-grid) ────────────────

  const onNodeMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDraggingId(id);
    const canvasPos = canvas.screenToCanvas(e.clientX, e.clientY, rect);
    setDragOffset({ x: canvasPos.x - node.x, y: canvasPos.y - node.y });
    if (e.shiftKey) {
      // Multi-select
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    } else {
      setSelectedIds(new Set([id]));
    }
  };

  const onCanvasMouseMove = (e: React.MouseEvent) => {
    canvas.onPanMove(e as React.MouseEvent<HTMLDivElement>);
    if (!draggingId) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const canvasPos = canvas.screenToCanvas(e.clientX, e.clientY, rect);
    const snapped = canvas.snapToGrid(canvasPos.x - dragOffset.x, canvasPos.y - dragOffset.y);
    setNodes((prev) => prev.map((n) => (n.id === draggingId ? { ...n, x: snapped.x, y: snapped.y } : n)));
  };

  const onCanvasMouseUp = () => setDraggingId(null);

  const onNodeClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (connectFrom) {
      if (connectFrom !== id) {
        setEdges((prev) => {
          if (prev.some((p) => p.source === connectFrom && p.target === id)) return prev;
          return [...prev, mkEdge(`e${Date.now()}`, connectFrom, id, 1, 2)];
        });
      }
      setConnectFrom(null);
    } else {
      setSelectedIds(new Set([id]));
    }
  };

  // ─── Actions ───────────────────────────────────────────────

  const addNode = (type: NodeType) => {
    const id = `n-${Date.now()}`;
    const rect = canvasRef.current?.getBoundingClientRect();
    const pos = rect ? canvas.screenToCanvas(rect.width / 2 + rect.left, rect.height / 2 + rect.top, rect) : { x: 400, y: 300 };
    const snapped = canvas.snapToGrid(pos.x, pos.y);
    setNodes((prev) => [...prev, makeDefaultNode(id, type, TYPE_CONFIG[type].label, snapped.x, snapped.y)]);
    setSelectedIds(new Set([id]));
  };

  const deleteSelected = () => {
    if (selectedIds.size === 0) return;
    setNodes((prev) => prev.filter((n) => !selectedIds.has(n.id)));
    setEdges((prev) => prev.filter((e) => !selectedIds.has(e.source) && !selectedIds.has(e.target)));
    setSelectedIds(new Set());
  };

  const killNode = () => {
    if (!selectedId) return;
    setNodes((prev) => prev.map((n) => n.id === selectedId ? { ...n, alive: !n.alive } : n));
  };

  // Request trace: animate a single request through the graph
  const startTrace = useCallback(() => {
    // Build path via BFS from first client
    const outgoing: Map<string, string[]> = new Map();
    for (const ed of edges) {
      if (!outgoing.has(ed.source)) outgoing.set(ed.source, []);
      outgoing.get(ed.source)!.push(ed.target);
    }
    const client = nodes.find((n) => n.type === "client" && n.alive);
    if (!client) return;
    const path: string[] = [];
    const visited = new Set<string>();
    const queue = [client.id];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const node = nodes.find((n) => n.id === id);
      if (!node?.alive) continue;
      path.push(id);
      const targets = outgoing.get(id) || [];
      if (targets.length > 0) queue.push(targets[0]); // follow first path
    }
    setTracePath(path);
    setTraceStep(0);
    setTracing(true);
  }, [nodes, edges]);

  // Animate trace steps
  useEffect(() => {
    if (!tracing || traceStep < 0) return;
    if (traceStep >= tracePath.length) {
      // Trace complete
      const timer = setTimeout(() => { setTracing(false); setTraceStep(-1); setTracePath([]); }, 1500);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => setTraceStep((s) => s + 1), 600);
    traceTimerRef.current = timer;
    return () => clearTimeout(timer);
  }, [tracing, traceStep, tracePath.length]);

  const updateSelected = (patch: Partial<SimNode>) => {
    if (!selectedId) return;
    setNodes((prev) => prev.map((n) => n.id === selectedId ? { ...n, ...patch } : n));
  };

  const reset = () => {
    setRunning(false);
    setUptime(0);
    tickCounterRef.current = 0;
    setEventLog([]);
    setGlobalStats(null);
    setNodes((prev) => prev.map((n) => ({
      ...n,
      alive: true,
      queueDepth: 0,
      incomingRate: 0,
      processedRate: 0,
      droppedRate: 0,
      retryingRate: 0,
      utilization: 0,
      lastScaleTime: 0,
      circuitBreaker: createCircuitBreaker(),
      metrics: createNodeMetrics(),
    })));
  };

  const loadTemplate = (templateId: string) => {
    const tpl = SCENARIO_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;
    const { nodes: n, edges: e } = tpl.build();
    setNodes(n);
    setEdges(e);
    setSelectedIds(new Set());
    setShowTemplates(false);
    reset();
  };

  const loadLoadTest = (presetId: string) => {
    const preset = LOAD_TEST_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setTrafficPattern(preset.trafficPattern as TrafficPattern);
    setShowLoadTests(false);
  };

  const saveCurrent = () => {
    const name = prompt("Scenario name:");
    if (!name) return;
    const scenario: SavedScenario = {
      name,
      savedAt: new Date().toISOString(),
      nodes,
      edges,
      trafficPattern,
    };
    const next = [scenario, ...savedScenarios.filter((s) => s.name !== name)];
    setSavedScenarios(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const loadSaved = (scenario: SavedScenario) => {
    // Rehydrate nodes with fresh runtime state
    const freshNodes = scenario.nodes.map((n) => ({
      ...n,
      alive: true,
      queueDepth: 0,
      incomingRate: 0,
      processedRate: 0,
      droppedRate: 0,
      retryingRate: 0,
      utilization: 0,
      circuitBreaker: createCircuitBreaker(),
      metrics: createNodeMetrics(),
    }));
    setNodes(freshNodes);
    setEdges(scenario.edges);
    setTrafficPattern(scenario.trafficPattern);
    setShowSaved(false);
    reset();
  };

  const deleteSaved = (name: string) => {
    const next = savedScenarios.filter((s) => s.name !== name);
    setSavedScenarios(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const exportJson = () => {
    const data = { nodes, edges, trafficPattern, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `simulator-scenario-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Auto-layout: BFS-based layered positioning
  const autoLayout = useCallback(() => {
    if (nodes.length === 0) return;
    // Find source nodes (clients or nodes with no incoming edges)
    const hasIncoming = new Set(edges.map((e) => e.target));
    const sources = nodes.filter((n) => !hasIncoming.has(n.id) || n.type === "client");
    if (sources.length === 0) return;

    // BFS to assign layers
    const layers = new Map<string, number>();
    const queue = sources.map((s) => s.id);
    for (const id of queue) layers.set(id, 0);
    const outgoing = new Map<string, string[]>();
    for (const ed of edges) {
      if (!outgoing.has(ed.source)) outgoing.set(ed.source, []);
      outgoing.get(ed.source)!.push(ed.target);
    }
    const visited = new Set<string>();
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const layer = layers.get(id) || 0;
      for (const tgt of outgoing.get(id) || []) {
        if (!layers.has(tgt) || layers.get(tgt)! < layer + 1) {
          layers.set(tgt, layer + 1);
        }
        if (!visited.has(tgt)) queue.push(tgt);
      }
    }
    // Unvisited nodes get layer 0
    for (const n of nodes) if (!layers.has(n.id)) layers.set(n.id, 0);

    // Group by layer
    const byLayer = new Map<number, string[]>();
    for (const [id, layer] of layers) {
      if (!byLayer.has(layer)) byLayer.set(layer, []);
      byLayer.get(layer)!.push(id);
    }

    // Position: each layer is a column, nodes spread vertically
    const colSpacing = 220;
    const rowSpacing = 120;
    const startX = 80;

    setNodes((prev) => prev.map((n) => {
      const layer = layers.get(n.id) || 0;
      const group = byLayer.get(layer) || [n.id];
      const idx = group.indexOf(n.id);
      const totalInLayer = group.length;
      const startY = 100 - ((totalInLayer - 1) * rowSpacing) / 2 + 200;
      const snapped = canvas.snapToGrid(startX + layer * colSpacing, startY + idx * rowSpacing);
      return { ...n, x: snapped.x, y: snapped.y };
    }));
  }, [nodes, edges, canvas]);

  const exportReport = () => {
    if (!globalStats) return;
    const incidents = detectIncidents(nodes, edges, globalStats);
    const lines: string[] = [];
    lines.push("# System Design Simulation Report");
    lines.push(`**Date:** ${new Date().toISOString().split("T")[0]}`);
    lines.push(`**Simulation Duration:** ${uptime} seconds (${speed}x speed)`);
    lines.push(`**Traffic Pattern:** ${trafficPattern.type} @ ${trafficPattern.baseRate} req/s base`);
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("## Executive Summary");
    lines.push(`- **Final Availability:** ${(globalStats.successRate * 100).toFixed(1)}%`);
    lines.push(`- **P95 Latency:** ${Math.round(globalStats.p95LatencyMs)}ms`);
    lines.push(`- **P99 Latency:** ${Math.round(globalStats.p99LatencyMs)}ms`);
    lines.push(`- **Total Requests:** ${globalStats.totalRequests.toLocaleString()}`);
    lines.push(`- **Success Rate:** ${(globalStats.successRate * 100).toFixed(2)}%`);
    lines.push(`- **Total Errors:** ${globalStats.totalErrors.toLocaleString()}`);
    lines.push(`- **Cost Spent:** $${globalStats.totalCost.toFixed(2)}`);
    lines.push(`- **Monthly Projected Cost:** $${Math.round(globalStats.monthlyCostEstimate).toLocaleString()}/mo`);
    lines.push(`- **SLO Status:** ${globalStats.sloMet ? "✅ Met" : "❌ Breached"}`);
    if (globalStats.bottleneckNode) lines.push(`- **Bottleneck:** ${globalStats.bottleneckNode}`);
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("## Component Status");
    lines.push("");
    lines.push("| Component | Type | Replicas | Utilization | Incoming | P95 Latency | Errors | Status |");
    lines.push("|-----------|------|----------|-------------|----------|-------------|--------|--------|");
    for (const n of nodes.filter((nd) => nd.type !== "client")) {
      const p95 = n.metrics.latencyP95[n.metrics.latencyP95.length - 1] || 0;
      const status = !n.alive ? "🔴 Dead" : n.utilization > 1 ? "🔴 Overloaded" : n.utilization > 0.8 ? "🟡 Hot" : "🟢 Healthy";
      lines.push(`| ${n.label} | ${n.type} | ${n.replicas} | ${Math.round(n.utilization * 100)}% | ${Math.round(n.incomingRate)} r/s | ${Math.round(p95)}ms | ${n.metrics.totalErrors} | ${status} |`);
    }
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("## Incident History");
    lines.push("");
    lines.push("| Component | Issue | Severity | Explanation | Recommendation |");
    lines.push("|-----------|-------|----------|-------------|----------------|");
    for (const [nodeId, nodeInc] of incidents) {
      const node = nodes.find((nd) => nd.id === nodeId);
      for (const inc of nodeInc) {
        if (inc.type === "TOPOLOGY_PRESSURE") continue;
        lines.push(`| ${node?.label || nodeId} | ${inc.label} | ${inc.severity}% | ${inc.explanation} | ${inc.recommendation} |`);
      }
    }
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("## Engineering Recommendations");
    lines.push("");
    const seen = new Set<string>();
    let recNum = 1;
    for (const [, nodeInc] of incidents) {
      for (const inc of nodeInc) {
        if (inc.type === "TOPOLOGY_PRESSURE" || seen.has(inc.type)) continue;
        seen.add(inc.type);
        lines.push(`${recNum}. **Regarding ${inc.type.replace(/_/g, " ")}:** ${inc.recommendation}`);
        recNum++;
      }
    }
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("*Generated by ArchLens Architecture Simulator*");
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `simulation-report-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data.nodes && data.edges) {
          setNodes(data.nodes.map((n: SimNode) => ({
            ...n,
            alive: true,
            queueDepth: 0,
            incomingRate: 0,
            processedRate: 0,
            droppedRate: 0,
            retryingRate: 0,
            utilization: 0,
            circuitBreaker: createCircuitBreaker(),
            metrics: createNodeMetrics(),
          })));
          setEdges(data.edges);
          if (data.trafficPattern) setTrafficPattern(data.trafficPattern);
          reset();
        }
      } catch (err) {
        alert("Invalid JSON file");
      }
    };
    reader.readAsText(file);
  };

  const selected = nodes.find((n) => n.id === selectedId);

  // ─── Render helpers ────────────────────────────────────────

  // Port-aware edge routing: exits from nearest edge of source, enters nearest edge of target
  const getEdgePath = (edge: SimEdge) => {
    const s = nodes.find((n) => n.id === edge.source);
    const t = nodes.find((n) => n.id === edge.target);
    if (!s || !t) return null;
    const W = 140, H = 70;
    const sc = { x: s.x + W / 2, y: s.y + H / 2 };
    const tc = { x: t.x + W / 2, y: t.y + H / 2 };
    const dx = tc.x - sc.x, dy = tc.y - sc.y;
    // Pick port on source (exit side)
    const { px: x1, py: y1 } = pickPort(s.x, s.y, W, H, dx, dy);
    // Pick port on target (entry side — opposite direction)
    const { px: x2, py: y2 } = pickPort(t.x, t.y, W, H, -dx, -dy);
    const mx = (x1 + x2) / 2;
    // Bezier with midpoint
    const path = Math.abs(dy) > Math.abs(dx)
      ? `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`
      : `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
    return { x1, y1, x2, y2, path };
  };

  const nodeColor = (n: SimNode) => {
    if (!n.alive) return "var(--color-dim)";
    if (n.circuitBreaker.state === "open") return "#9333ea"; // purple for tripped breaker
    if (n.utilization > 1.0) return "#ef4444";
    if (n.utilization > 0.8) return "#f97316";
    if (n.utilization > 0.5) return "#fbbf24";
    return TYPE_CONFIG[n.type].color;
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* ══ Toolbar ══ */}
      <div className="flex items-center gap-3 border-b border-[var(--color-border-default)] bg-surface px-5 py-2.5 flex-wrap">
        <h2 className="text-base font-bold flex items-center gap-2">
          <Activity className="h-5 w-5 text-archlens-400" /> Simulator
        </h2>

        <div className="h-6 w-px bg-[var(--color-border-default)]" />

        <button
          onClick={() => setRunning(!running)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${
            running ? "bg-red-500/15 text-red-400 border border-red-500/30" : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
          }`}
        >
          {running ? <><Pause className="h-3.5 w-3.5" /> Pause</> : <><Play className="h-3.5 w-3.5" /> Run</>}
        </button>
        <button onClick={reset} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--color-border-subtle)] border border-[var(--color-border-default)] text-[var(--color-text-secondary)] text-xs font-medium hover:text-[var(--color-text-primary)]">
          <RotateCcw className="h-3 w-3" /> Reset
        </button>
        <button onClick={autoLayout} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--color-border-subtle)] border border-[var(--color-border-default)] text-[var(--color-text-secondary)] text-xs font-medium hover:text-[var(--color-text-primary)]" title="Auto-arrange nodes">
          <Grid3x3 className="h-3 w-3" /> Layout
        </button>

        <div className="h-6 w-px bg-[var(--color-border-default)]" />

        {/* Zoom display */}
        <span className="text-[10px] font-mono text-[var(--color-text-muted)]">{Math.round(canvas.transform.scale * 100)}%</span>

        <div className="h-6 w-px bg-[var(--color-border-default)]" />

        <div className="flex items-center gap-1">
          <span className="text-[9px] text-[var(--color-text-muted)] uppercase">Speed</span>
          {[1, 2, 5, 10].map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${speed === s ? "bg-archlens-500/20 text-archlens-300" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"}`}
            >
              {s}x
            </button>
          ))}
        </div>

        <div className="h-6 w-px bg-[var(--color-border-default)]" />

        {/* Traffic Pattern selector */}
        <select
          value={trafficPattern.type}
          onChange={(e) => setTrafficPattern({ ...trafficPattern, type: e.target.value as TrafficPattern["type"] })}
          className="rounded-md bg-[var(--color-border-subtle)] border border-[var(--color-border-default)] px-2 py-1 text-[10px] text-[var(--color-text-primary)] outline-none"
        >
          <option value="constant">📊 Constant</option>
          <option value="burst">💥 Burst</option>
          <option value="ramp">📈 Ramp</option>
          <option value="spike">⚡ Spike</option>
          <option value="periodic">🌊 Periodic</option>
          <option value="noise">🌀 Noise</option>
        </select>

        <div className="flex items-center gap-1.5 flex-1 min-w-[150px] max-w-xs">
          <span className="text-[9px] text-[var(--color-text-muted)] uppercase">Rate</span>
          <input
            type="range"
            min="10"
            max="10000"
            step="10"
            value={trafficPattern.baseRate}
            onChange={(e) => setTrafficPattern({ ...trafficPattern, baseRate: Number(e.target.value) })}
            className="flex-1 accent-archlens-500"
          />
          <span className="text-[10px] font-mono text-archlens-300 w-16 text-right">{trafficPattern.baseRate}</span>
        </div>

        <div className="h-6 w-px bg-[var(--color-border-default)]" />

        {/* Templates */}
        <div className="relative">
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--color-border-subtle)] border border-[var(--color-border-default)] text-[var(--color-text-secondary)] text-xs font-medium hover:text-[var(--color-text-primary)]"
          >
            <BookOpen className="h-3 w-3" /> Templates <ChevronDown className="h-3 w-3" />
          </button>
          {showTemplates && (
            <div className="absolute top-full mt-1 right-0 w-64 rounded-lg bg-elevated border border-[var(--color-border-default)] shadow-xl z-50 p-1">
              {SCENARIO_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => loadTemplate(tpl.id)}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-hover flex items-start gap-2"
                >
                  <span className="text-lg">{tpl.icon}</span>
                  <div>
                    <div className="text-xs font-semibold text-[var(--color-text-primary)]">{tpl.name}</div>
                    <div className="text-[10px] text-[var(--color-text-muted)]">{tpl.description}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Load tests */}
        <div className="relative">
          <button
            onClick={() => setShowLoadTests(!showLoadTests)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--color-border-subtle)] border border-[var(--color-border-default)] text-[var(--color-text-secondary)] text-xs font-medium hover:text-[var(--color-text-primary)]"
          >
            <BarChart3 className="h-3 w-3" /> Load Test <ChevronDown className="h-3 w-3" />
          </button>
          {showLoadTests && (
            <div className="absolute top-full mt-1 right-0 w-64 rounded-lg bg-elevated border border-[var(--color-border-default)] shadow-xl z-50 p-1">
              {LOAD_TEST_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => loadLoadTest(p.id)}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-hover"
                >
                  <div className="text-xs font-semibold text-[var(--color-text-primary)]">{p.name}</div>
                  <div className="text-[10px] text-[var(--color-text-muted)]">{p.description}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="h-6 w-px bg-[var(--color-border-default)]" />

        {/* Save/Load */}
        <button onClick={saveCurrent} className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-[var(--color-border-subtle)] border border-[var(--color-border-default)] text-[var(--color-text-secondary)] text-[10px] hover:text-[var(--color-text-primary)]">
          <Save className="h-3 w-3" />
        </button>
        <button onClick={() => setShowSaved(!showSaved)} className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-[var(--color-border-subtle)] border border-[var(--color-border-default)] text-[var(--color-text-secondary)] text-[10px] hover:text-[var(--color-text-primary)]">
          <Upload className="h-3 w-3" /> {savedScenarios.length}
        </button>
        <button onClick={exportJson} className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-[var(--color-border-subtle)] border border-[var(--color-border-default)] text-[var(--color-text-secondary)] text-[10px] hover:text-[var(--color-text-primary)]" title="Export JSON">
          <FileText className="h-3 w-3" />
        </button>
        {running && globalStats && (
          <button onClick={exportReport} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-semibold hover:bg-emerald-500/20" title="Export simulation report">
            <FileText className="h-3 w-3" /> Report
          </button>
        )}
        <label className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-[var(--color-border-subtle)] border border-[var(--color-border-default)] text-[var(--color-text-secondary)] text-[10px] hover:text-[var(--color-text-primary)] cursor-pointer">
          <Upload className="h-3 w-3" />
          <input type="file" accept=".json" onChange={importJson} className="hidden" />
        </label>

        <div className="h-6 w-px bg-[var(--color-border-default)]" />

        {/* Trace */}
        <button
          onClick={startTrace}
          disabled={tracing}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[10px] font-semibold ${
            tracing ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-400" : "bg-[var(--color-border-subtle)] border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          }`}
        >
          <Crosshair className="h-3 w-3" /> {tracing ? `Tracing ${traceStep}/${tracePath.length}` : "Trace"}
        </button>

        {/* Chaos */}
        <button
          onClick={() => setChaosEnabled(!chaosEnabled)}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[10px] font-semibold ${
            chaosEnabled ? "bg-red-500/15 border-red-500/30 text-red-400" : "bg-[var(--color-border-subtle)] border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          }`}
        >
          <Shuffle className="h-3 w-3" /> Chaos {chaosEnabled && "ON"}
        </button>

        {running && globalStats && (
          <div className="ml-auto flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1 font-mono text-[var(--color-text-secondary)]"><Clock className="h-3 w-3" />{formatUptime(uptime)}</span>
            <span className={`flex items-center gap-1 font-semibold ${globalStats.sloMet ? "text-emerald-400" : "text-red-400"}`}>
              {globalStats.sloMet ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
              SLO {globalStats.sloMet ? "OK" : "BREACH"}
            </span>
          </div>
        )}
      </div>

      {/* ══ Saved scenarios popover ══ */}
      {showSaved && savedScenarios.length > 0 && (
        <div className="absolute top-12 right-5 w-72 rounded-lg bg-elevated border border-[var(--color-border-default)] shadow-xl z-50 p-2 max-h-96 overflow-y-auto">
          <div className="text-[9px] uppercase font-semibold text-[var(--color-text-muted)] mb-1 px-2">Saved Scenarios</div>
          {savedScenarios.map((s) => (
            <div key={s.name} className="group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-hover">
              <button onClick={() => loadSaved(s)} className="flex-1 text-left">
                <div className="text-xs font-semibold text-[var(--color-text-primary)]">{s.name}</div>
                <div className="text-[9px] text-[var(--color-text-muted)]">{new Date(s.savedAt).toLocaleString()} · {s.nodes.length} nodes</div>
              </button>
              <button onClick={() => deleteSaved(s.name)} className="opacity-0 group-hover:opacity-100 text-red-400 p-1">
                <Scissors className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ══ Chaos Panel ══ */}
      {chaosEnabled && (
        <div className="flex items-center gap-3 border-b border-red-500/20 bg-red-500/5 px-5 py-2 text-[10px] flex-wrap">
          <span className="text-red-400 font-semibold uppercase flex items-center gap-1"><Shuffle className="h-3 w-3" /> Chaos</span>
          {/* Quick chaos presets */}
          {[
            { label: "⚡ AZ Failure", action: () => { const alive = nodes.filter((nd) => nd.alive && nd.type !== "client"); if (alive.length > 1) { const half = Math.ceil(alive.length / 2); alive.slice(0, half).forEach((nd) => { setNodes((prev) => prev.map((p) => p.id === nd.id ? { ...p, alive: false } : p)); }); } } },
            { label: "🔥 Instance Crash", action: () => { const alive = nodes.filter((nd) => nd.alive && nd.type !== "client"); if (alive.length > 0) { const victim = alive[Math.floor(Math.random() * alive.length)]; setNodes((prev) => prev.map((p) => p.id === victim.id ? { ...p, alive: false } : p)); } } },
            { label: "🐌 Latency +200ms", action: () => setChaosConfig({ ...chaosConfig, latencyInjectionMs: 200 }) },
            { label: "📡 Packet Loss", action: () => { if (selectedId) setNodes((prev) => prev.map((p) => p.id === selectedId ? { ...p, chaosMode: "flaky" as const } : p)); } },
            { label: "💀 Kill Selected", action: () => { if (selectedId) setNodes((prev) => prev.map((p) => p.id === selectedId ? { ...p, alive: false } : p)); } },
            { label: "🔄 Revive All", action: () => setNodes((prev) => prev.map((p) => ({ ...p, alive: true, chaosMode: "none" as const }))) },
          ].map((c, i) => (
            <button key={i} onClick={c.action} className="px-2 py-0.5 rounded bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25 whitespace-nowrap">{c.label}</button>
          ))}
          <div className="flex items-center gap-1.5">
            <span className="text-[var(--color-text-secondary)]">Random kill /min:</span>
            <input
              type="range"
              min="0"
              max="10"
              value={chaosConfig.randomKillChancePerMin}
              onChange={(e) => setChaosConfig({ ...chaosConfig, randomKillChancePerMin: Number(e.target.value) })}
              className="w-20 accent-red-500"
            />
            <span className="text-red-400 font-mono w-6">{chaosConfig.randomKillChancePerMin}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[var(--color-text-secondary)]">+Latency ms:</span>
            <input
              type="range"
              min="0"
              max="500"
              value={chaosConfig.latencyInjectionMs}
              onChange={(e) => setChaosConfig({ ...chaosConfig, latencyInjectionMs: Number(e.target.value) })}
              className="w-20 accent-red-500"
            />
            <span className="text-red-400 font-mono w-10">{chaosConfig.latencyInjectionMs}</span>
          </div>
          {selected && (
            <button
              onClick={() => updateSelected({ chaosMode: selected.chaosMode === "none" ? "flaky" : selected.chaosMode === "flaky" ? "slow" : "none" })}
              className="px-2 py-0.5 rounded bg-red-500/10 border border-red-500/30 text-red-400 font-mono"
            >
              {selected.label} mode: {selected.chaosMode}
            </button>
          )}
        </div>
      )}

      {/* ══ KPI Bar ══ */}
      {running && globalStats && (
        <div className="grid grid-cols-7 gap-2 border-b border-[var(--color-border-default)] bg-deep px-5 py-2">
          <Kpi icon={<TrendingUp className="h-3 w-3" />} label="Throughput" value={`${Math.round(globalStats.totalRequests / Math.max(1, uptime))}`} unit="r/s" color="#60a5fa" />
          <Kpi icon={<CheckCircle2 className="h-3 w-3" />} label="Success" value={`${(globalStats.successRate * 100).toFixed(1)}%`} color={globalStats.successRate >= 0.99 ? "#34d399" : "#f97316"} />
          <Kpi icon={<Gauge className="h-3 w-3" />} label="Avg" value={`${Math.round(globalStats.avgLatencyMs)}`} unit="ms" color="#a78bfa" />
          <Kpi icon={<Gauge className="h-3 w-3" />} label="P95" value={`${Math.round(globalStats.p95LatencyMs)}`} unit="ms" color={globalStats.p95LatencyMs < 300 ? "#34d399" : "#f97316"} />
          <Kpi icon={<Gauge className="h-3 w-3" />} label="P99" value={`${Math.round(globalStats.p99LatencyMs)}`} unit="ms" color={globalStats.p99LatencyMs < 500 ? "#34d399" : "#ef4444"} />
          <Kpi icon={<XCircle className="h-3 w-3" />} label="Errors" value={globalStats.totalErrors.toLocaleString()} color={globalStats.totalErrors > 0 ? "#ef4444" : "#34d399"} />
          <Kpi icon={<DollarSign className="h-3 w-3" />} label="~Month" value={`$${Math.round(globalStats.monthlyCostEstimate).toLocaleString()}`} color={globalStats.monthlyCostEstimate > budgetLimit ? "#ef4444" : "#fbbf24"} />
          <Kpi icon={<DollarSign className="h-3 w-3" />} label="Budget" value={`$${(budgetLimit / 1000).toFixed(1)}K`} color={globalStats.monthlyCostEstimate > budgetLimit ? "#ef4444" : "#34d399"} />
        </div>
      )}

      {/* ══ Main content ══ */}
      <div className="flex flex-1 overflow-hidden">
        {/* ─ Left: Palette ─ */}
        <aside className="w-44 border-r border-[var(--color-border-default)] bg-surface overflow-y-auto flex-shrink-0">
          <div className="p-3">
            <div className="text-[9px] uppercase font-semibold text-[var(--color-text-muted)] mb-2">Add Component</div>
            <div className="space-y-1">
              {(Object.keys(TYPE_CONFIG) as NodeType[]).map((type) => {
                const cfg = TYPE_CONFIG[type];
                const Icon = cfg.icon;
                return (
                  <button
                    key={type}
                    onClick={() => addNode(type)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md bg-[var(--color-border-subtle)] border border-[var(--color-border-default)] hover:border-archlens-500/30 hover:bg-hover"
                  >
                    <div className="rounded p-1" style={{ backgroundColor: `${cfg.color}15`, color: cfg.color }}>
                      <Icon className="h-3 w-3" />
                    </div>
                    <span className="text-[11px] font-medium text-[var(--color-text-secondary)]">{cfg.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-3 border-t border-[var(--color-border-default)]">
            <button
              onClick={() => setConnectFrom(selectedId)}
              disabled={!selectedId}
              className="w-full px-2 py-1.5 rounded-md bg-archlens-500/10 border border-archlens-500/20 text-archlens-300 text-[10px] font-semibold disabled:opacity-40 mb-1.5"
            >
              {connectFrom ? "Click target..." : "Connect"}
            </button>
            <button
              onClick={deleteSelected}
              disabled={!selectedId}
              className="w-full px-2 py-1.5 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-semibold disabled:opacity-40"
            >
              Delete
            </button>
          </div>
        </aside>

        {/* ─ Canvas ─ */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div
            ref={canvasRef}
            onMouseMove={onCanvasMouseMove}
            onMouseUp={(e) => { onCanvasMouseUp(); canvas.onPanEnd(); }}
            onMouseLeave={() => { onCanvasMouseUp(); canvas.onPanEnd(); }}
            onMouseDown={(e) => { canvas.onPanStart(e); }}
            onWheel={canvas.onWheel}
            onClick={() => { setSelectedIds(new Set()); setConnectFrom(null); setShowTemplates(false); setShowLoadTests(false); setShowSaved(false); }}
            className="flex-1 relative overflow-hidden"
            style={{
              backgroundImage: "radial-gradient(circle, #1e1e2a 1px, transparent 1px)",
              backgroundSize: `${20 * canvas.transform.scale}px ${20 * canvas.transform.scale}px`,
              backgroundPosition: `${canvas.transform.offsetX}px ${canvas.transform.offsetY}px`,
              backgroundColor: "var(--color-deep)",
              cursor: canvas.isPanning ? "grabbing" : "default",
            }}
          >
            {/* Zoom controls (bottom-left) */}
            <div className="absolute bottom-3 left-3 z-20 flex items-center gap-1 bg-elevated/90 backdrop-blur rounded-lg border border-[#2a2a3a] p-1">
              <button onClick={canvas.zoomOut} className="p-1.5 rounded hover:bg-hover text-[#8888a0] hover:text-[#e4e4ed]"><ZoomOut className="h-3.5 w-3.5" /></button>
              <span className="text-[10px] font-mono text-[#8888a0] w-10 text-center">{Math.round(canvas.transform.scale * 100)}%</span>
              <button onClick={canvas.zoomIn} className="p-1.5 rounded hover:bg-hover text-[#8888a0] hover:text-[#e4e4ed]"><ZoomIn className="h-3.5 w-3.5" /></button>
              <div className="w-px h-4 bg-[#2a2a3a]" />
              <button onClick={() => canvas.fitToView(nodes, canvasRef.current?.clientWidth || 800, canvasRef.current?.clientHeight || 600)} className="p-1.5 rounded hover:bg-hover text-[#8888a0] hover:text-[#e4e4ed]" title="Fit to view"><Maximize2 className="h-3.5 w-3.5" /></button>
              <button onClick={canvas.resetZoom} className="p-1.5 rounded hover:bg-hover text-[#8888a0] hover:text-[#e4e4ed]" title="Reset zoom"><Crosshair className="h-3.5 w-3.5" /></button>
              <div className="w-px h-4 bg-[#2a2a3a]" />
              <button onClick={() => canvas.setSnapEnabled(!canvas.snapEnabled)} className={`p-1.5 rounded ${canvas.snapEnabled ? "text-archlens-300 bg-archlens-500/15" : "text-[#5a5a70]"}`} title="Snap to grid"><Grid3x3 className="h-3.5 w-3.5" /></button>
              <button onClick={() => setShowMinimap(!showMinimap)} className={`p-1.5 rounded ${showMinimap ? "text-archlens-300 bg-archlens-500/15" : "text-[#5a5a70]"}`} title="Mini-map"><MapIcon className="h-3.5 w-3.5" /></button>
            </div>

            {/* Mini-map (bottom-right) */}
            {showMinimap && nodes.length > 0 && (
              <div className="absolute bottom-3 right-3 z-20 w-40 h-24 bg-elevated/90 backdrop-blur rounded-lg border border-[#2a2a3a] overflow-hidden">
                <svg viewBox={`${Math.min(...nodes.map(n => n.x)) - 20} ${Math.min(...nodes.map(n => n.y)) - 20} ${Math.max(...nodes.map(n => n.x)) - Math.min(...nodes.map(n => n.x)) + 200} ${Math.max(...nodes.map(n => n.y)) - Math.min(...nodes.map(n => n.y)) + 120}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
                  {edges.map((e) => {
                    const s = nodes.find((n) => n.id === e.source);
                    const t = nodes.find((n) => n.id === e.target);
                    if (!s || !t) return null;
                    return <line key={e.id} x1={s.x + 70} y1={s.y + 35} x2={t.x + 70} y2={t.y + 35} stroke="#3a3a5a" strokeWidth={3} />;
                  })}
                  {nodes.map((n) => (
                    <rect key={n.id} x={n.x} y={n.y} width={140} height={50} rx={6}
                      fill={selectedIds.has(n.id) ? "#a78bfa" : nodeColor(n)} fillOpacity={0.7} />
                  ))}
                </svg>
              </div>
            )}

            <div style={{
              position: "relative",
              transform: `translate(${canvas.transform.offsetX}px, ${canvas.transform.offsetY}px) scale(${canvas.transform.scale})`,
              transformOrigin: "0 0",
              minWidth: 3000,
              minHeight: 2000,
            }}>
              <svg className="absolute inset-0 pointer-events-none" style={{ width: 2000, height: 1200 }}>
                <defs>
                  <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#4a4a5e" />
                  </marker>
                  <marker id="arrow-active" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#a78bfa" />
                  </marker>
                </defs>
                {edges.map((e) => {
                  const ep = getEdgePath(e);
                  if (!ep) return null;
                  const srcNode = nodes.find((n) => n.id === e.source);
                  const tgtNode = nodes.find((n) => n.id === e.target);
                  const isActive = running && srcNode?.alive && srcNode.incomingRate > 0;
                  const isFailure = running && (!tgtNode?.alive || (tgtNode && tgtNode.utilization > 1) || (srcNode && !srcNode.alive));
                  const strokeWidth = isActive ? Math.min(6, 1 + srcNode!.incomingRate / 500) : 1.5;
                  const edgeColor = isFailure ? "#ef4444" : isActive ? "#a78bfa" : "var(--color-border-default)";
                  return (
                    <g key={e.id}>
                      <path
                        d={ep.path}
                        fill="none"
                        stroke={edgeColor}
                        strokeWidth={strokeWidth}
                        strokeDasharray={isFailure ? "6 3" : undefined}
                        markerEnd={isActive ? "url(#arrow-active)" : "url(#arrow)"}
                        opacity={isActive ? 0.75 : 0.5}
                      />
                      {isActive && !isFailure && (
                        <circle r="3" fill="#c4b5fd">
                          <animateMotion dur={`${Math.max(0.5, 3 / speed)}s`} repeatCount="indefinite" path={ep.path} />
                        </circle>
                      )}
                    </g>
                  );
                })}
              </svg>

              {nodes.map((n) => {
                const cfg = TYPE_CONFIG[n.type];
                const Icon = cfg.icon;
                const color = nodeColor(n);
                const isSelected = selectedIds.has(n.id);
                const isTraced = tracing && tracePath.includes(n.id);
                const isTraceActive = tracing && tracePath[traceStep] === n.id;
                const isConnectSource = connectFrom === n.id;
                const lastP95 = n.metrics.latencyP95[n.metrics.latencyP95.length - 1] || 0;
                const cbState = n.circuitBreaker.state;
                return (
                  <div
                    key={n.id}
                    onMouseDown={(e) => onNodeMouseDown(e, n.id)}
                    onClick={(e) => onNodeClick(e, n.id)}
                    className={`absolute select-none transition-all duration-200 ${isSelected ? "ring-2 ring-archlens-400" : ""} ${isConnectSource ? "ring-2 ring-emerald-400" : ""} ${isTraceActive ? "ring-2 ring-cyan-400 z-10" : ""}`}
                    style={{
                      left: n.x,
                      top: n.y,
                      width: 140,
                      cursor: draggingId === n.id ? "grabbing" : "grab",
                      borderRadius: 10,
                      backgroundColor: n.alive ? "var(--color-elevated)" : "#0f0f16",
                      border: `2px solid ${isTraceActive ? "#22d3ee" : color}`,
                      boxShadow: isTraceActive ? "0 0 24px rgba(34,211,238,0.5)" : (running && n.utilization > 0.5 ? `0 0 16px ${color}70` : "none"),
                      opacity: tracing && !isTraced ? 0.3 : (n.alive ? 1 : 0.5),
                    }}
                  >
                    <div className="flex items-center gap-2 p-2">
                      <div className="rounded-md p-1" style={{ backgroundColor: `${color}20`, color }}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-semibold text-[var(--color-text-primary)] truncate">{n.label}</div>
                        <div className="text-[8px] text-[var(--color-text-muted)] uppercase flex items-center gap-1">
                          {cfg.label}
                          {cbState === "open" && <span className="text-purple-400">⚡CB</span>}
                          {cbState === "half-open" && <span className="text-amber-400">⚡½</span>}
                        </div>
                      </div>
                      {!n.alive && <Skull className="h-3 w-3 text-red-400" />}
                      {n.replicas > 1 && (
                        <div className="text-[9px] font-bold text-archlens-300 bg-archlens-500/20 rounded-full w-5 h-5 flex items-center justify-center">
                          {n.replicas}
                        </div>
                      )}
                    </div>
                    {running && n.alive && n.type !== "client" && (
                      <div className="px-2 pb-1.5">
                        <div className="flex items-center justify-between text-[8px] mb-0.5">
                          <span className="text-[var(--color-text-muted)]">{Math.round(n.incomingRate)} r/s</span>
                          <span style={{ color }}>{Math.round(n.utilization * 100)}%</span>
                        </div>
                        <div className="h-1 rounded-full bg-[var(--color-border-subtle)] overflow-hidden">
                          <div className="h-full" style={{ width: `${Math.min(100, n.utilization * 100)}%`, backgroundColor: color }} />
                        </div>
                        <div className="flex items-center justify-between text-[8px] mt-1 text-[var(--color-text-muted)]">
                          <span>p95 {Math.round(lastP95)}ms</span>
                          {n.queueDepth > 5 && <span className="text-orange-400">Q:{Math.round(n.queueDepth)}</span>}
                        </div>
                      </div>
                    )}
                    {/* ── Incident badges (Paperdraw-style) ── */}
                    {(() => {
                      const incidents = nodeIncidents.get(n.id);
                      if (!incidents || incidents.length === 0) return null;
                      return (
                        <div className="absolute -right-2 top-0 translate-x-full flex flex-col gap-1 pl-2 z-20 pointer-events-none" style={{ maxWidth: 220 }}>
                          {incidents.slice(0, 5).map((inc, idx) => {
                            const bg = inc.type === "TOPOLOGY_PRESSURE" ? "#92400e"
                              : inc.severity >= 80 ? "#991b1b"
                              : inc.severity >= 60 ? "#92400e"
                              : "#1e3a5f";
                            const border = inc.type === "TOPOLOGY_PRESSURE" ? "#fbbf24"
                              : inc.severity >= 80 ? "#ef4444"
                              : inc.severity >= 60 ? "#f97316"
                              : "#60a5fa";
                            // Auto-fix action for applicable incidents
                            const fixAction = inc.type === "SPOF" || inc.type === "DATA_LOSS_RISK"
                              ? () => setNodes((prev) => prev.map((nd) => nd.id === n.id ? { ...nd, replicas: Math.max(nd.replicas, 2) } : nd))
                              : inc.type === "OVERLOAD" || inc.type === "TRAFFIC_OVERFLOW"
                              ? () => setNodes((prev) => prev.map((nd) => nd.id === n.id ? { ...nd, replicas: nd.replicas + 1 } : nd))
                              : inc.type === "AUTOSCALE_THRASH"
                              ? () => setNodes((prev) => prev.map((nd) => nd.id === n.id ? { ...nd, autoScaleCooldownSec: nd.autoScaleCooldownSec + 10 } : nd))
                              : null;
                            return (
                              <div key={idx} className="flex items-center gap-1">
                                <div className="rounded px-1.5 py-0.5 text-[8px] font-bold uppercase whitespace-nowrap pointer-events-auto"
                                  style={{ backgroundColor: bg, color: "#fff", border: `1px solid ${border}`, fontSize: inc.type === "TOPOLOGY_PRESSURE" ? 9 : 8 }}
                                  title={`${inc.explanation}\n\n💡 ${inc.recommendation}`}
                                >
                                  {inc.label}
                                  {inc.type === "TOPOLOGY_PRESSURE" && (
                                    <div className="text-[7px] font-medium normal-case mt-0.5 text-amber-200">{inc.explanation}</div>
                                  )}
                                </div>
                                {fixAction && inc.type !== "TOPOLOGY_PRESSURE" && (
                                  <button
                                    onClick={(ev) => { ev.stopPropagation(); fixAction(); }}
                                    className="rounded px-1.5 py-0.5 text-[7px] font-bold uppercase bg-emerald-600 text-white border border-emerald-500 pointer-events-auto hover:bg-emerald-500 whitespace-nowrap"
                                  >
                                    🔧 FIX
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─ Event Log (bottom) ─ */}
          {showEventLog && (
            <div className="h-32 border-t border-[var(--color-border-default)] bg-surface overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-4 py-1.5 border-b border-[var(--color-border-default)]">
                <div className="text-[9px] uppercase font-semibold text-[var(--color-text-muted)]">Event Log ({eventLog.length})</div>
                <button onClick={() => setShowEventLog(false)} className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">hide</button>
              </div>
              <div className="flex-1 overflow-y-auto font-mono text-[10px]">
                {eventLog.length === 0 ? (
                  <div className="p-3 text-[var(--color-text-muted)]">No events yet. Start the simulation.</div>
                ) : (
                  eventLog.map((ev) => (
                    <div key={ev.id} className="px-4 py-0.5 border-b border-[var(--color-border-subtle)] flex items-center gap-2">
                      <span className="text-[var(--color-text-muted)] w-10">{formatUptime(ev.timestamp)}</span>
                      <span className={`w-14 text-[9px] font-bold uppercase ${
                        ev.severity === "critical" ? "text-red-400" :
                        ev.severity === "error" ? "text-red-400" :
                        ev.severity === "warning" ? "text-amber-400" : "text-blue-400"
                      }`}>{ev.severity}</span>
                      <span className="w-16 text-[var(--color-text-muted)]">[{ev.category}]</span>
                      <span className="text-[var(--color-text-primary)]">{ev.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
          {!showEventLog && (
            <button onClick={() => setShowEventLog(true)} className="border-t border-[var(--color-border-default)] bg-surface px-4 py-1 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
              Show Event Log ({eventLog.length})
            </button>
          )}
        </div>

        {/* ─ Right: Inspector + Insights ─ */}
        <aside className="w-80 border-l border-[var(--color-border-default)] bg-surface overflow-y-auto flex-shrink-0">
          <div className="flex border-b border-[var(--color-border-default)]">
            <button
              onClick={() => setRightTab("inspector")}
              className={`flex-1 px-3 py-2 text-[10px] uppercase font-semibold ${rightTab === "inspector" ? "text-archlens-300 border-b-2 border-archlens-400" : "text-[var(--color-text-muted)]"}`}
            >
              <Settings className="h-3 w-3 inline mr-1" /> Inspector
            </button>
            <button
              onClick={() => setRightTab("insights")}
              className={`flex-1 px-3 py-2 text-[10px] uppercase font-semibold flex items-center justify-center gap-1 ${rightTab === "insights" ? "text-archlens-300 border-b-2 border-archlens-400" : "text-[var(--color-text-muted)]"}`}
            >
              <Lightbulb className="h-3 w-3" /> Insights {insights.length > 0 && <span className="text-red-400">{insights.length}</span>}
            </button>
          </div>

          {rightTab === "insights" ? (
            <div className="p-3 space-y-2">
              {insights.length === 0 ? (
                <div className="text-center text-[var(--color-text-muted)] text-xs py-8">
                  <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  Run the simulation to get AI insights
                </div>
              ) : (
                insights.map((ins, i) => {
                  const color = ins.severity === "critical" ? "#ef4444" : ins.severity === "warning" ? "#f97316" : "#60a5fa";
                  return (
                    <div key={i} className="rounded-lg border p-3" style={{ borderColor: `${color}30`, backgroundColor: `${color}08` }}>
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" style={{ color }} />
                        <div className="flex-1">
                          <div className="text-xs font-semibold text-[var(--color-text-primary)]">{ins.title}</div>
                          <div className="text-[10px] text-[var(--color-text-secondary)] mt-1 leading-relaxed">{ins.explanation}</div>
                          <div className="text-[10px] text-amber-300 mt-2 leading-relaxed flex items-start gap-1">
                            <Lightbulb className="h-3 w-3 mt-0.5 flex-shrink-0" />
                            {ins.recommendation}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : selected ? (
            <div className="p-3 space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)] flex-1">{selected.label}</h3>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-border-subtle)] text-[var(--color-text-muted)] uppercase">{TYPE_CONFIG[selected.type].label}</span>
              </div>

              <details open className="rounded-lg bg-[var(--color-border-subtle)] p-2.5">
                <summary className="text-[10px] uppercase font-semibold text-[var(--color-text-muted)] cursor-pointer">Config</summary>
                <div className="mt-2 space-y-2">
                  <CI label="Label" value={selected.label} onChange={(v) => updateSelected({ label: v })} />
                  <CI label="Capacity/replica" value={selected.capacityPerReplica} type="number" onChange={(v) => updateSelected({ capacityPerReplica: Number(v) || 0 })} />
                  <CI label="Base latency (ms)" value={selected.baseLatencyMs} type="number" onChange={(v) => updateSelected({ baseLatencyMs: Number(v) || 0 })} />
                  <CI label="Timeout (ms)" value={selected.timeoutMs} type="number" onChange={(v) => updateSelected({ timeoutMs: Number(v) || 0 })} />
                  <Slider label="Replicas" value={selected.replicas} min={1} max={50} onChange={(v) => updateSelected({ replicas: v })} />
                </div>
              </details>

              {/* Component-specific inspector */}
              {(selected.type === "cache" || selected.type === "cdn") && (
                <details open className="rounded-lg bg-[var(--color-border-subtle)] p-2.5">
                  <summary className="text-[10px] uppercase font-semibold text-[var(--color-text-muted)] cursor-pointer">
                    {selected.type === "cdn" ? "CDN" : "Cache"} Settings
                  </summary>
                  <div className="mt-2 space-y-2">
                    <Slider label="Hit Rate %" value={Math.round((selected.cacheHitRate || 0) * 100)} min={0} max={100} onChange={(v) => updateSelected({ cacheHitRate: v / 100 })} />
                    <Toggle label="Stampede Protection" value={selected.cacheStampedeEnabled || false} onChange={(v) => updateSelected({ cacheStampedeEnabled: v })} />
                    <div className="text-[9px] text-[var(--color-text-muted)]">
                      Miss traffic: {Math.round((1 - (selected.cacheHitRate || 0)) * selected.incomingRate)} req/s downstream
                    </div>
                  </div>
                </details>
              )}

              {selected.type === "database" && (
                <details open className="rounded-lg bg-[var(--color-border-subtle)] p-2.5">
                  <summary className="text-[10px] uppercase font-semibold text-[var(--color-text-muted)] cursor-pointer">Database Settings</summary>
                  <div className="mt-2 space-y-2">
                    <Slider label="Connection Pool" value={selected.dbConnectionPoolSize || 50} min={5} max={500} onChange={(v) => updateSelected({ dbConnectionPoolSize: v })} />
                    <div className="text-[9px] text-[var(--color-text-muted)]">
                      Effective capacity: {Math.min(selected.capacityPerReplica * selected.replicas, (selected.dbConnectionPoolSize || 50) * 10)} req/s
                    </div>
                    {running && (
                      <div className="mt-1">
                        <div className="text-[9px] text-[var(--color-text-muted)] mb-0.5">Pool Usage</div>
                        <div className="h-2 rounded-full bg-deep overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{
                            width: `${Math.min(100, selected.utilization * 100)}%`,
                            backgroundColor: selected.utilization > 0.8 ? "#f97316" : "#34d399",
                          }} />
                        </div>
                      </div>
                    )}
                  </div>
                </details>
              )}

              {selected.type === "lambda" && (
                <details open className="rounded-lg bg-[var(--color-border-subtle)] p-2.5">
                  <summary className="text-[10px] uppercase font-semibold text-[var(--color-text-muted)] cursor-pointer">Lambda Settings</summary>
                  <div className="mt-2 space-y-2">
                    <Slider label="Cold Start (ms)" value={selected.lambdaColdStartMs || 200} min={0} max={2000} onChange={(v) => updateSelected({ lambdaColdStartMs: v })} />
                    <Slider label="Concurrency Limit" value={selected.lambdaConcurrencyLimit || 1000} min={1} max={10000} onChange={(v) => updateSelected({ lambdaConcurrencyLimit: v })} />
                    <div className="text-[9px] text-[var(--color-text-muted)]">
                      Auto-scaling: replicas = {selected.replicas} (auto)
                    </div>
                  </div>
                </details>
              )}

              {selected.type === "gateway" && (
                <details open className="rounded-lg bg-[var(--color-border-subtle)] p-2.5">
                  <summary className="text-[10px] uppercase font-semibold text-[var(--color-text-muted)] cursor-pointer">Gateway Settings</summary>
                  <div className="mt-2 space-y-2">
                    <CI label="Rate Limit (req/s)" value={selected.gatewayRateLimitPerSec || 5000} type="number" onChange={(v) => updateSelected({ gatewayRateLimitPerSec: Number(v) || 5000 })} />
                    <CI label="Burst Allowance" value={selected.gatewayBurstAllowance || 500} type="number" onChange={(v) => updateSelected({ gatewayBurstAllowance: Number(v) || 500 })} />
                    {running && selected.incomingRate > (selected.gatewayRateLimitPerSec || 5000) && (
                      <div className="text-[9px] text-red-400 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Rate limited: {Math.round(selected.incomingRate - (selected.gatewayRateLimitPerSec || 5000))} req/s rejected
                      </div>
                    )}
                  </div>
                </details>
              )}

              {(selected.type === "messagebroker" || selected.type === "queue") && (
                <details open className="rounded-lg bg-[var(--color-border-subtle)] p-2.5">
                  <summary className="text-[10px] uppercase font-semibold text-[var(--color-text-muted)] cursor-pointer">Queue Settings</summary>
                  <div className="mt-2 space-y-2">
                    {selected.type === "messagebroker" && (
                      <>
                        <Slider label="Consumer Groups" value={selected.brokerConsumerGroups || 3} min={1} max={20} onChange={(v) => updateSelected({ brokerConsumerGroups: v })} />
                        <CI label="DLQ Threshold" value={selected.brokerDlqThreshold || 1000} type="number" onChange={(v) => updateSelected({ brokerDlqThreshold: Number(v) || 1000 })} />
                      </>
                    )}
                    {running && (
                      <>
                        <Stat label="Queue Depth" value={`${Math.round(selected.queueDepth)}`} warn={selected.queueDepth > 100} danger={selected.queueDepth > (selected.brokerDlqThreshold || 1000)} />
                        <div className="mt-1">
                          <div className="text-[9px] text-[var(--color-text-muted)] mb-0.5">Consumer Lag</div>
                          <div className="h-2 rounded-full bg-deep overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{
                              width: `${Math.min(100, (selected.queueDepth / Math.max(1, selected.brokerDlqThreshold || 1000)) * 100)}%`,
                              backgroundColor: selected.queueDepth > (selected.brokerDlqThreshold || 1000) ? "#ef4444" : "#06b6d4",
                            }} />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </details>
              )}

              {selected.type === "container" && (
                <details open className="rounded-lg bg-[var(--color-border-subtle)] p-2.5">
                  <summary className="text-[10px] uppercase font-semibold text-[var(--color-text-muted)] cursor-pointer">Container Settings</summary>
                  <div className="mt-2 space-y-2">
                    <Slider label="CPU Limit %" value={selected.containerCpuLimit || 100} min={10} max={100} onChange={(v) => updateSelected({ containerCpuLimit: v })} />
                    <CI label="Memory (MB)" value={selected.containerMemoryMb || 512} type="number" onChange={(v) => updateSelected({ containerMemoryMb: Number(v) || 512 })} />
                  </div>
                </details>
              )}

              <details className="rounded-lg bg-[var(--color-border-subtle)] p-2.5">
                <summary className="text-[10px] uppercase font-semibold text-[var(--color-text-muted)] cursor-pointer">Resilience</summary>
                <div className="mt-2 space-y-2">
                  <Toggle label="Circuit Breaker" value={selected.circuitBreakerEnabled} onChange={(v) => updateSelected({ circuitBreakerEnabled: v })} />
                  <CI label="CB Threshold" value={selected.circuitBreakerThreshold} type="number" onChange={(v) => updateSelected({ circuitBreakerThreshold: Number(v) || 5 })} />
                  <Slider label="Retries" value={selected.retryCount} min={0} max={5} onChange={(v) => updateSelected({ retryCount: v })} />
                </div>
              </details>

              <details className="rounded-lg bg-[var(--color-border-subtle)] p-2.5">
                <summary className="text-[10px] uppercase font-semibold text-[var(--color-text-muted)] cursor-pointer">Auto-scaling</summary>
                <div className="mt-2 space-y-2">
                  <Toggle label="Enabled" value={selected.autoScaleEnabled} onChange={(v) => updateSelected({ autoScaleEnabled: v })} />
                  <Slider label="Min replicas" value={selected.autoScaleMin} min={1} max={20} onChange={(v) => updateSelected({ autoScaleMin: v })} />
                  <Slider label="Max replicas" value={selected.autoScaleMax} min={1} max={50} onChange={(v) => updateSelected({ autoScaleMax: v })} />
                  <Slider label="Scale up at %" value={Math.round(selected.autoScaleUpThreshold * 100)} min={10} max={95} onChange={(v) => updateSelected({ autoScaleUpThreshold: v / 100 })} />
                </div>
              </details>

              <details className="rounded-lg bg-[var(--color-border-subtle)] p-2.5">
                <summary className="text-[10px] uppercase font-semibold text-[var(--color-text-muted)] cursor-pointer">Cost</summary>
                <div className="mt-2 space-y-2">
                  <CI label="$/replica/hr" value={selected.costPerReplicaHour} type="number" onChange={(v) => updateSelected({ costPerReplicaHour: Number(v) || 0 })} />
                  <CI label="$/1M req" value={selected.costPerMillionRequests} type="number" onChange={(v) => updateSelected({ costPerMillionRequests: Number(v) || 0 })} />
                  <div className="text-[9px] text-[var(--color-text-muted)]">Running cost: ${selected.metrics.totalCost.toFixed(4)}</div>
                </div>
              </details>

              <button
                onClick={killNode}
                className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${
                  selected.alive ? "bg-red-500/15 text-red-400 border border-red-500/30" : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                }`}
              >
                {selected.alive ? <><Skull className="h-3.5 w-3.5" /> Kill</> : <>Revive</>}
              </button>

              {running && selected.alive && selected.type !== "client" && (
                <>
                  <div className="rounded-lg bg-[var(--color-border-subtle)] p-2.5">
                    <div className="text-[10px] uppercase font-semibold text-[var(--color-text-muted)] mb-2">Live</div>
                    <div className="grid grid-cols-2 gap-1 text-[10px]">
                      <Stat label="In" value={`${Math.round(selected.incomingRate)} /s`} />
                      <Stat label="Out" value={`${Math.round(selected.processedRate)} /s`} />
                      <Stat label="Util" value={`${Math.round(selected.utilization * 100)}%`} warn={selected.utilization > 0.8} danger={selected.utilization > 1} />
                      <Stat label="Queue" value={`${Math.round(selected.queueDepth)}`} warn={selected.queueDepth > 10} />
                      <Stat label="Drop" value={`${Math.round(selected.droppedRate)} /s`} danger={selected.droppedRate > 0} />
                      <Stat label="CB" value={selected.circuitBreaker.state} warn={selected.circuitBreaker.state !== "closed"} />
                    </div>
                  </div>
                  <Chart label="Throughput" data={selected.metrics.throughput} color="#60a5fa" unit="/s" />
                  <Chart label="Latency P50/P95/P99" data={selected.metrics.latencyP50} data2={selected.metrics.latencyP95} data3={selected.metrics.latencyP99} color="#a78bfa" color2="#fbbf24" color3="#ef4444" unit="ms" />
                  <Chart label="Error Rate" data={selected.metrics.errorRate.map((e) => e * 100)} color="#ef4444" unit="%" />
                  <Chart label="Replicas" data={selected.metrics.replicas} color="#34d399" />
                </>
              )}
            </div>
          ) : (
            <div className="p-4 text-center text-[var(--color-text-muted)] text-xs">
              <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
              Select a node
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ─── Helper components ──────────────────────────────────── */

// Pick the nearest port (edge midpoint) on a node given direction vector
function pickPort(nx: number, ny: number, w: number, h: number, dx: number, dy: number): { px: number; py: number } {
  const cx = nx + w / 2, cy = ny + h / 2;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? { px: nx + w, py: cy } : { px: nx, py: cy }; // right or left
  }
  return dy > 0 ? { px: cx, py: ny + h } : { px: cx, py: ny }; // bottom or top
}

function mkEdge(id: string, source: string, target: string, weight: number, latencyMs: number): SimEdge {
  return { id, source, target, weight, latencyMs, retryEnabled: false };
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h${Math.floor((seconds % 3600) / 60)}m`;
}

function Kpi({ icon, label, value, unit, color }: { icon: React.ReactNode; label: string; value: string; unit?: string; color: string }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="rounded p-1.5 flex-shrink-0" style={{ backgroundColor: `${color}15`, color }}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[9px] uppercase text-[var(--color-text-muted)] leading-tight truncate">{label}</div>
        <div className="text-xs font-bold leading-tight truncate" style={{ color }}>
          {value}{unit && <span className="text-[9px] ml-0.5 text-[var(--color-text-muted)]">{unit}</span>}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, warn, danger }: { label: string; value: string; warn?: boolean; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <span className={`font-mono ${danger ? "text-red-400" : warn ? "text-amber-400" : "text-[var(--color-text-primary)]"}`}>{value}</span>
    </div>
  );
}

function CI({ label, value, onChange, type = "text" }: { label: string; value: string | number; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="text-[9px] uppercase font-semibold text-[var(--color-text-muted)]">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full mt-0.5 rounded-md bg-deep border border-[var(--color-border-default)] px-2 py-1 text-[11px] text-[var(--color-text-primary)] outline-none focus:border-archlens-500/40"
      />
    </div>
  );
}

function Slider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-[9px] uppercase font-semibold text-[var(--color-text-muted)]">{label}: {value}</label>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full mt-0.5 accent-archlens-500"
      />
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-[10px] text-[var(--color-text-secondary)]">{label}</label>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-8 h-4 rounded-full transition-colors ${value ? "bg-archlens-500" : "bg-[var(--color-border-default)]"}`}
      >
        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${value ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

function Chart({ label, data, data2, data3, color, color2, color3, unit }: {
  label: string;
  data: number[];
  data2?: number[];
  data3?: number[];
  color: string;
  color2?: string;
  color3?: string;
  unit?: string;
}) {
  const allValues = [...data, ...(data2 || []), ...(data3 || [])];
  const max = Math.max(...allValues, 1);
  const last = data[data.length - 1] || 0;
  const last2 = data2 ? data2[data2.length - 1] || 0 : 0;
  const last3 = data3 ? data3[data3.length - 1] || 0 : 0;

  const pts = (d: number[]) => d.map((v, i) => `${(i / Math.max(d.length - 1, 1)) * 100},${100 - (v / max) * 100}`).join(" ");

  return (
    <div className="rounded-lg bg-[var(--color-border-subtle)] p-2.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] uppercase font-semibold text-[var(--color-text-muted)]">{label}</span>
        <div className="flex items-center gap-2 text-[9px] font-mono">
          {data3 && <span style={{ color: color3 }}>{Math.round(last3)}{unit}</span>}
          {data2 && <span style={{ color: color2 }}>{Math.round(last2)}{unit}</span>}
          <span style={{ color }}>{Math.round(last)}{unit}</span>
        </div>
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-14">
        {data3 && <polyline points={pts(data3)} fill="none" stroke={color3} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
        {data2 && <polyline points={pts(data2)} fill="none" stroke={color2} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
        <polyline points={pts(data)} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
