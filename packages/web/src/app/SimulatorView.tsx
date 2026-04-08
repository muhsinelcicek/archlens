import { useEffect, useRef, useState, useCallback } from "react";
import { useStore } from "../lib/store.js";
import {
  Play, Pause, Server, Database, Cloud, Layers,
  Users, Plus, RotateCcw, AlertTriangle, Activity,
  Skull, TrendingUp, Settings, Zap, CheckCircle2, XCircle,
  Gauge, Clock, Percent,
} from "lucide-react";
import {
  type SimNode, type SimEdge, type NodeType, type SimulatorConfig,
  type GlobalStats, NODE_DEFAULTS, createNodeMetrics, simulateTick,
  getGlobalStats,
} from "../lib/simulator-engine.js";

/* ═══════════════════════════════════════════════════════════════
   Architecture Simulator — queueing theory + time series metrics
   ═══════════════════════════════════════════════════════════════ */

const TYPE_CONFIG: Record<NodeType, { icon: React.ElementType; color: string; label: string }> = {
  client:       { icon: Users,    color: "#34d399", label: "Client" },
  loadbalancer: { icon: Layers,   color: "#60a5fa", label: "Load Balancer" },
  api:          { icon: Cloud,    color: "#a78bfa", label: "API" },
  service:      { icon: Server,   color: "#fbbf24", label: "Service" },
  database:     { icon: Database, color: "#f87171", label: "Database" },
  cache:        { icon: Zap,      color: "#f472b6", label: "Cache" },
  queue:        { icon: Activity, color: "#06b6d4", label: "Queue" },
};

const LAYER_TO_TYPE: Record<string, NodeType> = {
  presentation: "client",
  api: "api",
  application: "service",
  domain: "service",
  infrastructure: "database",
  config: "service",
};

export function SimulatorView() {
  const { model } = useStore();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<SimNode[]>([]);
  const [edges, setEdges] = useState<SimEdge[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Simulation state
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [trafficRate, setTrafficRate] = useState(500);
  const [uptime, setUptime] = useState(0);
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef(0);
  const startTimeRef = useRef(0);
  const [tick, forceTick] = useState(0); // force re-render on metric updates

  // ─── Initialize from real architecture ─────────────────────

  useEffect(() => {
    if (!model || nodes.length > 0) return;

    const mods = model.modules.slice(0, 10);
    const spacing = 200;
    const startY = 140;

    const initial: SimNode[] = [];

    // Client source
    initial.push(makeNode("client-0", "client", "Users", 50, startY + 100));

    // Auto-add a load balancer
    initial.push(makeNode("lb-0", "loadbalancer", "Load Balancer", 200, startY + 100));

    // Group modules by layer
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
      if (!layerMods) continue;
      layerMods.forEach((m, rowIdx) => {
        const type = LAYER_TO_TYPE[layer] || "service";
        const node = makeNode(`mod-${m.name}`, type, m.name, 50 + colIdx * spacing, startY + rowIdx * 110 - ((layerMods.length - 1) * 55));
        initial.push(node);
      });
      colIdx++;
    }

    setNodes(initial);

    // Edges
    const initialEdges: SimEdge[] = [];
    let eid = 0;
    // Client → LB
    initialEdges.push({ id: `e${eid++}`, source: "client-0", target: "lb-0", weight: 1, latencyMs: 1 });
    // LB → first layer
    const firstLayerNodes = initial.filter((n) => n.type === "api" && n.id.startsWith("mod-"));
    if (firstLayerNodes.length === 0) {
      // If no API layer, connect LB to whatever is after
      const firstModNode = initial.find((n) => n.id.startsWith("mod-"));
      if (firstModNode) initialEdges.push({ id: `e${eid++}`, source: "lb-0", target: firstModNode.id, weight: 1, latencyMs: 2 });
    } else {
      for (const apiNode of firstLayerNodes) {
        initialEdges.push({ id: `e${eid++}`, source: "lb-0", target: apiNode.id, weight: 1 / firstLayerNodes.length, latencyMs: 2 });
      }
    }

    // Module → module from real relations
    const moduleNodeIds = new Set(initial.filter((n) => n.id.startsWith("mod-")).map((n) => n.id.replace("mod-", "")));
    const edgeSet = new Set<string>();
    for (const rel of model.relations.slice(0, 200)) {
      const src = rel.source.split("/")[0];
      const tgtSym = (model.symbols as any)[rel.target];
      const tgt = tgtSym?.filePath?.split("/")[0];
      if (src && tgt && src !== tgt && moduleNodeIds.has(src) && moduleNodeIds.has(tgt)) {
        const key = `mod-${src}→mod-${tgt}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          initialEdges.push({ id: `e${eid++}`, source: `mod-${src}`, target: `mod-${tgt}`, weight: 1, latencyMs: 3 });
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

    startTimeRef.current = Date.now();
    const tickInterval = 250; // ms between ticks
    let tickCount = 0;

    const loop = (t: number) => {
      if (!lastTickRef.current) lastTickRef.current = t;
      const dt = t - lastTickRef.current;

      if (dt >= tickInterval / speed) {
        const tickSeconds = (dt / 1000) * speed;
        const config: SimulatorConfig = {
          trafficRate,
          globalTimeoutMs: 3000,
          tickMs: tickInterval,
          metricsWindowSec: 30,
        };
        // Mutate nodes in place
        setNodes((prev) => {
          const copy = prev.map((n) => ({ ...n, metrics: { ...n.metrics, throughput: [...n.metrics.throughput], latencyP50: [...n.metrics.latencyP50], latencyP95: [...n.metrics.latencyP95], latencyP99: [...n.metrics.latencyP99], errorRate: [...n.metrics.errorRate], queueDepth: [...n.metrics.queueDepth] } }));
          simulateTick(copy, edges, config, tickSeconds);
          return copy;
        });

        lastTickRef.current = t;
        tickCount++;
        // Update global stats every 4 ticks (1s)
        if (tickCount % 4 === 0) {
          setUptime((prev) => prev + 1);
          forceTick((v) => v + 1);
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running, speed, trafficRate, edges]);

  // Recalculate global stats on tick
  useEffect(() => {
    if (!running) return;
    const stats = getGlobalStats(nodes, uptime);
    setGlobalStats(stats);
  }, [tick, running, nodes, uptime]);

  // ─── Drag-drop ─────────────────────────────────────────────

  const onNodeMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDraggingId(id);
    setDragOffset({ x: e.clientX - rect.left - node.x, y: e.clientY - rect.top - node.y });
    setSelectedId(id);
  };

  const onCanvasMouseMove = (e: React.MouseEvent) => {
    if (!draggingId) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nx = e.clientX - rect.left - dragOffset.x;
    const ny = e.clientY - rect.top - dragOffset.y;
    setNodes((prev) => prev.map((n) => (n.id === draggingId ? { ...n, x: nx, y: ny } : n)));
  };

  const onCanvasMouseUp = () => setDraggingId(null);

  const onNodeClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (connectFrom) {
      if (connectFrom !== id) {
        setEdges((prev) => {
          if (prev.some((p) => p.source === connectFrom && p.target === id)) return prev;
          return [...prev, { id: `e${Date.now()}`, source: connectFrom, target: id, weight: 1, latencyMs: 2 }];
        });
      }
      setConnectFrom(null);
    } else {
      setSelectedId(id);
    }
  };

  // ─── Actions ───────────────────────────────────────────────

  const addNode = (type: NodeType) => {
    const id = `n-${Date.now()}`;
    const rect = canvasRef.current?.getBoundingClientRect();
    const x = rect ? rect.width / 2 - 60 : 400;
    const y = rect ? rect.height / 2 - 40 : 300;
    setNodes((prev) => [...prev, makeNode(id, type, TYPE_CONFIG[type].label, x, y)]);
    setSelectedId(id);
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setNodes((prev) => prev.filter((n) => n.id !== selectedId));
    setEdges((prev) => prev.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null);
  };

  const killNode = () => {
    if (!selectedId) return;
    setNodes((prev) => prev.map((n) => n.id === selectedId ? { ...n, alive: !n.alive } : n));
  };

  const updateSelected = (patch: Partial<SimNode>) => {
    if (!selectedId) return;
    setNodes((prev) => prev.map((n) => n.id === selectedId ? { ...n, ...patch } : n));
  };

  const reset = () => {
    setRunning(false);
    setUptime(0);
    setNodes((prev) => prev.map((n) => ({ ...n, alive: true, queueDepth: 0, incomingRate: 0, processedRate: 0, droppedRate: 0, utilization: 0, metrics: createNodeMetrics() })));
    setGlobalStats(null);
  };

  const selected = nodes.find((n) => n.id === selectedId);

  // ─── Render helpers ────────────────────────────────────────

  const getEdgePath = (edge: SimEdge) => {
    const s = nodes.find((n) => n.id === edge.source);
    const t = nodes.find((n) => n.id === edge.target);
    if (!s || !t) return null;
    const x1 = s.x + 70, y1 = s.y + 35;
    const x2 = t.x + 70, y2 = t.y + 35;
    const dx = x2 - x1;
    const midX = x1 + dx / 2;
    return { x1, y1, x2, y2, path: `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}` };
  };

  const nodeColor = (n: SimNode) => {
    if (!n.alive) return "#3f3f46";
    if (n.utilization > 1.0) return "#ef4444";
    if (n.utilization > 0.8) return "#f97316";
    if (n.utilization > 0.5) return "#fbbf24";
    return TYPE_CONFIG[n.type].color;
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 border-b border-[#2a2a3a] bg-surface px-5 py-3">
        <h2 className="text-base font-bold flex items-center gap-2">
          <Activity className="h-5 w-5 text-archlens-400" /> Simulator
        </h2>
        <div className="h-6 w-px bg-[#2a2a3a]" />

        <button
          onClick={() => setRunning(!running)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            running ? "bg-red-500/15 text-red-400 border border-red-500/30" : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
          }`}
        >
          {running ? <><Pause className="h-3.5 w-3.5" /> Pause</> : <><Play className="h-3.5 w-3.5" /> Run</>}
        </button>
        <button onClick={reset} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1e1e2a] border border-[#2a2a3a] text-[#8888a0] text-xs font-medium hover:text-[#e4e4ed]">
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </button>

        <div className="h-6 w-px bg-[#2a2a3a]" />

        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-[#5a5a70] uppercase">Speed</span>
          {[1, 2, 5, 10].map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${speed === s ? "bg-archlens-500/20 text-archlens-300" : "text-[#5a5a70] hover:text-[#8888a0]"}`}
            >
              {s}x
            </button>
          ))}
        </div>

        <div className="h-6 w-px bg-[#2a2a3a]" />

        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <span className="text-[9px] text-[#5a5a70] uppercase">Traffic</span>
          <input
            type="range"
            min="10"
            max="10000"
            step="10"
            value={trafficRate}
            onChange={(e) => setTrafficRate(Number(e.target.value))}
            className="flex-1 accent-archlens-500"
          />
          <span className="text-xs font-mono text-archlens-300 w-24 text-right">{trafficRate.toLocaleString()} req/s</span>
        </div>

        {running && globalStats && (
          <div className="ml-auto flex items-center gap-4 text-[10px]">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-[#5a5a70]" />
              <span className="font-mono text-[#e4e4ed]">{formatUptime(uptime)}</span>
            </div>
            <div className={`flex items-center gap-1 font-semibold ${globalStats.sloMet ? "text-emerald-400" : "text-red-400"}`}>
              {globalStats.sloMet ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
              SLO: {globalStats.sloMet ? "OK" : "BREACH"}
            </div>
          </div>
        )}
      </div>

      {/* ── KPI Bar (when running) ── */}
      {running && globalStats && (
        <div className="grid grid-cols-6 gap-2 border-b border-[#2a2a3a] bg-deep px-5 py-2.5">
          <Kpi icon={<TrendingUp className="h-3 w-3" />} label="Throughput" value={`${Math.round(globalStats.totalRequests / Math.max(1, uptime))}`} unit="req/s" color="#60a5fa" />
          <Kpi icon={<CheckCircle2 className="h-3 w-3" />} label="Success Rate" value={`${(globalStats.successRate * 100).toFixed(2)}%`} color={globalStats.successRate >= 0.99 ? "#34d399" : "#f97316"} />
          <Kpi icon={<Gauge className="h-3 w-3" />} label="Avg Latency" value={`${Math.round(globalStats.avgLatencyMs)}`} unit="ms" color="#a78bfa" />
          <Kpi icon={<Gauge className="h-3 w-3" />} label="P95 Latency" value={`${Math.round(globalStats.p95LatencyMs)}`} unit="ms" color={globalStats.p95LatencyMs < 300 ? "#34d399" : "#f97316"} />
          <Kpi icon={<Gauge className="h-3 w-3" />} label="P99 Latency" value={`${Math.round(globalStats.p99LatencyMs)}`} unit="ms" color={globalStats.p99LatencyMs < 500 ? "#34d399" : "#ef4444"} />
          <Kpi icon={<XCircle className="h-3 w-3" />} label="Errors" value={globalStats.totalErrors.toLocaleString()} color={globalStats.totalErrors > 0 ? "#ef4444" : "#34d399"} />
        </div>
      )}

      {/* ── Main: palette | canvas | inspector ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left: Palette ── */}
        <aside className="w-44 border-r border-[#2a2a3a] bg-surface overflow-y-auto">
          <div className="p-3">
            <div className="text-[9px] uppercase font-semibold text-[#5a5a70] tracking-wider mb-2">Components</div>
            <div className="space-y-1.5">
              {(Object.keys(TYPE_CONFIG) as NodeType[]).map((type) => {
                const cfg = TYPE_CONFIG[type];
                const Icon = cfg.icon;
                return (
                  <button
                    key={type}
                    onClick={() => addNode(type)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#1e1e2a] border border-[#2a2a3a] hover:border-archlens-500/30 hover:bg-hover transition-all group"
                  >
                    <div className="rounded-md p-1" style={{ backgroundColor: `${cfg.color}15`, color: cfg.color }}>
                      <Icon className="h-3 w-3" />
                    </div>
                    <span className="text-[11px] font-medium text-[#8888a0] group-hover:text-[#e4e4ed]">{cfg.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-3 border-t border-[#2a2a3a]">
            <div className="text-[9px] uppercase font-semibold text-[#5a5a70] tracking-wider mb-2">Actions</div>
            <button
              onClick={() => setConnectFrom(selectedId)}
              disabled={!selectedId}
              className="w-full px-2.5 py-1.5 rounded-md bg-archlens-500/10 border border-archlens-500/20 text-archlens-300 text-[10px] font-semibold disabled:opacity-40 mb-1.5"
            >
              {connectFrom ? "Click target..." : "Connect Node"}
            </button>
            <button
              onClick={deleteSelected}
              disabled={!selectedId}
              className="w-full px-2.5 py-1.5 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-semibold disabled:opacity-40"
            >
              Delete Node
            </button>
          </div>
        </aside>

        {/* ── Canvas ── */}
        <div
          ref={canvasRef}
          onMouseMove={onCanvasMouseMove}
          onMouseUp={onCanvasMouseUp}
          onMouseLeave={onCanvasMouseUp}
          onClick={() => { setSelectedId(null); setConnectFrom(null); }}
          className="flex-1 relative overflow-auto"
          style={{
            backgroundImage: "radial-gradient(circle, #1e1e2a 1px, transparent 1px)",
            backgroundSize: "20px 20px",
            backgroundColor: "#0a0a10",
            minHeight: "100%",
          }}
        >
          {/* SVG edges */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ minHeight: 1000, minWidth: 2000 }}>
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
              const isActive = running && srcNode?.alive && srcNode.incomingRate > 0;
              const strokeWidth = isActive ? Math.min(6, 1 + (srcNode!.incomingRate / 500)) : 1.5;
              return (
                <g key={e.id}>
                  <path
                    d={ep.path}
                    fill="none"
                    stroke={isActive ? "#a78bfa" : "#2a2a3a"}
                    strokeWidth={strokeWidth}
                    markerEnd={isActive ? "url(#arrow-active)" : "url(#arrow)"}
                    opacity={isActive ? 0.75 : 0.5}
                  />
                  {/* Flow animation */}
                  {isActive && (
                    <circle r="3" fill="#c4b5fd">
                      <animateMotion dur={`${Math.max(0.5, 3 / speed)}s`} repeatCount="indefinite" path={ep.path} />
                    </circle>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Nodes */}
          {nodes.map((n) => {
            const cfg = TYPE_CONFIG[n.type];
            const Icon = cfg.icon;
            const color = nodeColor(n);
            const isSelected = selectedId === n.id;
            const isConnectSource = connectFrom === n.id;
            const lastP95 = n.metrics.latencyP95[n.metrics.latencyP95.length - 1] || 0;
            return (
              <div
                key={n.id}
                onMouseDown={(e) => onNodeMouseDown(e, n.id)}
                onClick={(e) => onNodeClick(e, n.id)}
                className={`absolute select-none ${isSelected ? "ring-2 ring-archlens-400" : ""} ${isConnectSource ? "ring-2 ring-emerald-400" : ""}`}
                style={{
                  left: n.x,
                  top: n.y,
                  width: 140,
                  cursor: draggingId === n.id ? "grabbing" : "grab",
                  borderRadius: 10,
                  backgroundColor: n.alive ? "#16161f" : "#0f0f16",
                  border: `2px solid ${color}`,
                  boxShadow: running && n.utilization > 0.5 ? `0 0 16px ${color}70` : "none",
                  opacity: n.alive ? 1 : 0.5,
                  transition: "box-shadow 0.2s, border-color 0.2s",
                }}
              >
                <div className="flex items-center gap-2 p-2">
                  <div className="rounded-md p-1" style={{ backgroundColor: `${color}20`, color }}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-semibold text-[#e4e4ed] truncate">{n.label}</div>
                    <div className="text-[8px] text-[#5a5a70] uppercase">{cfg.label}</div>
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
                    {/* Saturation bar */}
                    <div className="flex items-center justify-between text-[8px] mb-0.5">
                      <span className="text-[#5a5a70]">{Math.round(n.incomingRate)} req/s</span>
                      <span style={{ color }}>{Math.round(n.utilization * 100)}%</span>
                    </div>
                    <div className="h-1 rounded-full bg-[#1e1e2a] overflow-hidden">
                      <div
                        className="h-full transition-all duration-200"
                        style={{ width: `${Math.min(100, n.utilization * 100)}%`, backgroundColor: color }}
                      />
                    </div>
                    {/* Quick latency */}
                    <div className="flex items-center justify-between text-[8px] mt-1 text-[#5a5a70]">
                      <span>p95 {Math.round(lastP95)}ms</span>
                      {n.queueDepth > 5 && <span className="text-orange-400">Q:{Math.round(n.queueDepth)}</span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-[#5a5a70] text-sm">
              Add components from the palette
            </div>
          )}
        </div>

        {/* ── Right: Inspector + charts ── */}
        <aside className="w-80 border-l border-[#2a2a3a] bg-surface overflow-y-auto">
          {selected ? (
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-archlens-400" />
                <h3 className="text-sm font-semibold text-[#e4e4ed]">{selected.label}</h3>
                <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-[#1e1e2a] text-[#5a5a70] uppercase">{TYPE_CONFIG[selected.type].label}</span>
              </div>

              {/* Config */}
              <details open className="rounded-lg bg-[#1e1e2a] p-3">
                <summary className="text-[10px] uppercase font-semibold text-[#5a5a70] cursor-pointer select-none">Configuration</summary>
                <div className="mt-3 space-y-2.5">
                  <ConfigInput label="Label" value={selected.label} onChange={(v) => updateSelected({ label: v })} />
                  <ConfigInput label="Capacity / replica (req/s)" value={selected.capacityPerReplica} onChange={(v) => updateSelected({ capacityPerReplica: Number(v) || 0 })} type="number" />
                  <ConfigInput label="Base latency (ms)" value={selected.baseLatencyMs} onChange={(v) => updateSelected({ baseLatencyMs: Number(v) || 0 })} type="number" />
                  <ConfigInput label="Latency variance (ms)" value={selected.latencyVarianceMs} onChange={(v) => updateSelected({ latencyVarianceMs: Number(v) || 0 })} type="number" />
                  <ConfigInput label="Timeout (ms)" value={selected.timeoutMs} onChange={(v) => updateSelected({ timeoutMs: Number(v) || 0 })} type="number" />
                  <div>
                    <label className="text-[9px] uppercase font-semibold text-[#5a5a70]">Replicas: {selected.replicas}</label>
                    <input
                      type="range"
                      min="1"
                      max="50"
                      value={selected.replicas}
                      onChange={(e) => updateSelected({ replicas: Number(e.target.value) })}
                      className="w-full mt-1 accent-archlens-500"
                    />
                  </div>
                  {selected.type === "cache" && (
                    <div>
                      <label className="text-[9px] uppercase font-semibold text-[#5a5a70]">Hit Rate: {Math.round((selected.cacheHitRate || 0) * 100)}%</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={(selected.cacheHitRate || 0) * 100}
                        onChange={(e) => updateSelected({ cacheHitRate: Number(e.target.value) / 100 })}
                        className="w-full mt-1 accent-archlens-500"
                      />
                    </div>
                  )}
                </div>
              </details>

              <button
                onClick={killNode}
                className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${
                  selected.alive ? "bg-red-500/15 text-red-400 border border-red-500/30" : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                }`}
              >
                {selected.alive ? <><Skull className="h-3.5 w-3.5" /> Kill Node</> : <>Revive</>}
              </button>

              {/* Live stats */}
              {running && selected.alive && selected.type !== "client" && (
                <div className="space-y-3">
                  <div className="rounded-lg bg-[#1e1e2a] p-3">
                    <div className="text-[9px] uppercase font-semibold text-[#5a5a70] mb-2 flex items-center justify-between">
                      <span>Live Metrics</span>
                      <span className="text-emerald-400 flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" /> LIVE</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <Stat label="Incoming" value={`${Math.round(selected.incomingRate)} /s`} />
                      <Stat label="Processed" value={`${Math.round(selected.processedRate)} /s`} />
                      <Stat label="Utilization" value={`${Math.round(selected.utilization * 100)}%`} warn={selected.utilization > 0.8} danger={selected.utilization > 1} />
                      <Stat label="Queue Depth" value={`${Math.round(selected.queueDepth)}`} warn={selected.queueDepth > 10} />
                      <Stat label="Dropped" value={`${Math.round(selected.droppedRate)} /s`} danger={selected.droppedRate > 0} />
                      <Stat label="Capacity" value={`${selected.capacityPerReplica * selected.replicas} /s`} />
                    </div>
                    {selected.utilization > 1 && (
                      <div className="mt-2 pt-2 border-t border-red-500/20 flex items-center gap-1.5 text-[10px] text-red-400">
                        <AlertTriangle className="h-3 w-3" /> OVERLOADED — bottleneck
                      </div>
                    )}
                  </div>

                  {/* Throughput chart */}
                  <MetricChart label="Throughput (req/s)" data={selected.metrics.throughput} color="#60a5fa" unit="/s" />

                  {/* Latency chart */}
                  <MetricChart
                    label="Latency P50/P95/P99 (ms)"
                    data={selected.metrics.latencyP50}
                    data2={selected.metrics.latencyP95}
                    data3={selected.metrics.latencyP99}
                    color="#a78bfa"
                    color2="#fbbf24"
                    color3="#ef4444"
                    unit="ms"
                  />

                  {/* Error rate */}
                  <MetricChart label="Error Rate" data={selected.metrics.errorRate.map((e) => e * 100)} color="#ef4444" unit="%" />

                  {/* Queue depth */}
                  {Math.max(...selected.metrics.queueDepth) > 0 && (
                    <MetricChart label="Queue Depth" data={selected.metrics.queueDepth} color="#f97316" />
                  )}

                  {/* Totals */}
                  <div className="rounded-lg bg-[#1e1e2a] p-3 space-y-1">
                    <div className="text-[9px] uppercase font-semibold text-[#5a5a70] mb-1.5">Totals</div>
                    <Stat label="Total Requests" value={selected.metrics.totalRequests.toLocaleString()} />
                    <Stat label="Total Errors" value={selected.metrics.totalErrors.toLocaleString()} danger={selected.metrics.totalErrors > 0} />
                    <Stat label="Total Timeouts" value={selected.metrics.totalTimeouts.toLocaleString()} />
                    <Stat label="Error Rate" value={`${((selected.metrics.totalErrors / Math.max(1, selected.metrics.totalRequests)) * 100).toFixed(2)}%`} warn={(selected.metrics.totalErrors / Math.max(1, selected.metrics.totalRequests)) > 0.01} />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 text-center text-[#5a5a70] text-xs">
              <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Select a node to inspect</p>
              <p className="mt-2 text-[10px]">Click "Connect Node" to link nodes</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ─── Helper components ──────────────────────────────────── */

function makeNode(id: string, type: NodeType, label: string, x: number, y: number): SimNode {
  const defaults = NODE_DEFAULTS[type];
  return {
    id,
    type,
    label,
    x,
    y,
    capacityPerReplica: defaults.capacityPerReplica!,
    baseLatencyMs: defaults.baseLatencyMs!,
    latencyVarianceMs: defaults.latencyVarianceMs!,
    replicas: defaults.replicas!,
    timeoutMs: defaults.timeoutMs!,
    errorRateAtOverload: defaults.errorRateAtOverload!,
    cacheHitRate: defaults.cacheHitRate,
    alive: true,
    queueDepth: 0,
    activeRequests: 0,
    incomingRate: 0,
    processedRate: 0,
    droppedRate: 0,
    utilization: 0,
    metrics: createNodeMetrics(),
  };
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function Kpi({ icon, label, value, unit, color }: { icon: React.ReactNode; label: string; value: string; unit?: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="rounded p-1.5" style={{ backgroundColor: `${color}15`, color }}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[9px] uppercase text-[#5a5a70] leading-tight">{label}</div>
        <div className="text-sm font-bold leading-tight" style={{ color }}>
          {value}{unit && <span className="text-[9px] ml-0.5 text-[#5a5a70]">{unit}</span>}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, warn, danger }: { label: string; value: string; warn?: boolean; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between text-[10px]">
      <span className="text-[#5a5a70]">{label}</span>
      <span className={`font-mono ${danger ? "text-red-400" : warn ? "text-amber-400" : "text-[#e4e4ed]"}`}>{value}</span>
    </div>
  );
}

function ConfigInput({ label, value, onChange, type = "text" }: { label: string; value: string | number; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="text-[9px] uppercase font-semibold text-[#5a5a70]">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full mt-0.5 rounded-md bg-deep border border-[#2a2a3a] px-2 py-1 text-[11px] text-[#e4e4ed] outline-none focus:border-archlens-500/40"
      />
    </div>
  );
}

function MetricChart({ label, data, data2, data3, color, color2, color3, unit }: {
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

  const makePoints = (d: number[]) => {
    if (d.length === 0) return "";
    return d.map((v, i) => `${(i / Math.max(d.length - 1, 1)) * 100},${100 - (v / max) * 100}`).join(" ");
  };

  return (
    <div className="rounded-lg bg-[#1e1e2a] p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] uppercase font-semibold text-[#5a5a70]">{label}</span>
        <div className="flex items-center gap-2 text-[9px] font-mono">
          {data3 && <span style={{ color: color3 }}>{Math.round(last3)}{unit}</span>}
          {data2 && <span style={{ color: color2 }}>{Math.round(last2)}{unit}</span>}
          <span style={{ color }}>{Math.round(last)}{unit}</span>
        </div>
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-16">
        {data3 && <polyline points={makePoints(data3)} fill="none" stroke={color3} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
        {data2 && <polyline points={makePoints(data2)} fill="none" stroke={color2} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
        <polyline points={makePoints(data)} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
