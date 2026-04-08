import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useStore } from "../lib/store.js";
import {
  Play, Pause, Square, Zap, Server, Database, Cloud, Layers,
  Users, Trash2, Plus, RotateCcw, AlertTriangle, Activity,
  Skull, TrendingUp, Settings,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   Architecture Simulator — drag-drop + traffic/failure simulation
   ═══════════════════════════════════════════════════════════════ */

type NodeType = "client" | "loadbalancer" | "api" | "service" | "database" | "cache" | "queue";

interface SimNode {
  id: string;
  type: NodeType;
  label: string;
  x: number;
  y: number;
  // Capacity + latency characteristics
  capacityPerReplica: number; // req/s per replica
  baseLatencyMs: number;      // ms per request
  replicas: number;           // scaling factor
  alive: boolean;             // failure state
  // Runtime state
  currentLoad: number;        // current req/s incoming
  effectiveLatency: number;   // calculated latency
  saturation: number;         // 0-1+ (>1 = overloaded)
}

interface SimEdge {
  id: string;
  source: string;
  target: string;
}

interface Particle {
  id: number;
  edgeId: string;
  progress: number; // 0-1
  speed: number;
}

// ─── Node type config ─────────────────────────────────────────

const TYPE_CONFIG: Record<NodeType, {
  icon: React.ElementType;
  color: string;
  label: string;
  capacity: number;
  latency: number;
  isSource?: boolean;
}> = {
  client:       { icon: Users,    color: "#34d399", label: "Client",        capacity: 99999, latency: 0,   isSource: true },
  loadbalancer: { icon: Layers,   color: "#60a5fa", label: "Load Balancer", capacity: 20000, latency: 2 },
  api:          { icon: Cloud,    color: "#a78bfa", label: "API",           capacity: 1000,  latency: 15 },
  service:      { icon: Server,   color: "#fbbf24", label: "Service",       capacity: 800,   latency: 20 },
  database:     { icon: Database, color: "#f87171", label: "Database",      capacity: 500,   latency: 30 },
  cache:        { icon: Zap,      color: "#f472b6", label: "Cache",         capacity: 10000, latency: 1 },
  queue:        { icon: Activity, color: "#06b6d4", label: "Queue",         capacity: 5000,  latency: 5 },
};

// ─── Layer → Node type mapping ────────────────────────────────

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
  const [trafficRate, setTrafficRate] = useState(500); // req/s from each client
  const [particles, setParticles] = useState<Particle[]>([]);
  const particleIdRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef(0);

  // ─── Initialize from real architecture ─────────────────────

  useEffect(() => {
    if (!model || nodes.length > 0) return;

    // Convert modules to nodes
    const mods = model.modules.slice(0, 12); // cap at 12 for layout
    const cols = Math.ceil(Math.sqrt(mods.length + 1));
    const spacing = 180;
    const startX = 80;
    const startY = 100;

    const initialNodes: SimNode[] = [];

    // Add a client source
    initialNodes.push({
      id: "client-0",
      type: "client",
      label: "Client",
      x: 40,
      y: startY + ((mods.length / cols) * spacing) / 2,
      ...typeDefaults("client"),
      alive: true,
      currentLoad: 0,
      effectiveLatency: 0,
      saturation: 0,
    });

    // Layer modules by layer
    const byLayer: Record<string, typeof mods> = {};
    for (const m of mods) {
      const l = m.layer || "unknown";
      if (!byLayer[l]) byLayer[l] = [];
      byLayer[l].push(m);
    }

    const layerOrder = ["presentation", "api", "application", "domain", "infrastructure", "config", "unknown"];
    let colIdx = 1;
    for (const layer of layerOrder) {
      const layerMods = byLayer[layer];
      if (!layerMods) continue;
      layerMods.forEach((m, rowIdx) => {
        const type = LAYER_TO_TYPE[layer] || "service";
        initialNodes.push({
          id: `mod-${m.name}`,
          type,
          label: m.name,
          x: startX + colIdx * spacing,
          y: startY + rowIdx * 100,
          ...typeDefaults(type),
          alive: true,
          currentLoad: 0,
          effectiveLatency: 0,
          saturation: 0,
        });
      });
      colIdx++;
    }

    setNodes(initialNodes);

    // Auto-create edges from real relations (module-level)
    const moduleNodeIds = new Set(initialNodes.filter((n) => n.id.startsWith("mod-")).map((n) => n.id.replace("mod-", "")));
    const edgeSet = new Set<string>();
    const initialEdges: SimEdge[] = [];
    let edgeId = 0;

    // Client → first layer
    const firstLayerMod = initialNodes.find((n) => n.type === "api" || n.id.startsWith("mod-"));
    if (firstLayerMod) {
      initialEdges.push({ id: `e${edgeId++}`, source: "client-0", target: firstLayerMod.id });
    }

    for (const rel of model.relations.slice(0, 100)) {
      const src = rel.source.split("/")[0];
      const tgtSym = (model.symbols as any)[rel.target];
      const tgt = tgtSym?.filePath?.split("/")[0];
      if (src && tgt && src !== tgt && moduleNodeIds.has(src) && moduleNodeIds.has(tgt)) {
        const key = `mod-${src}→mod-${tgt}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          initialEdges.push({ id: `e${edgeId++}`, source: `mod-${src}`, target: `mod-${tgt}` });
        }
      }
    }

    setEdges(initialEdges);
  }, [model, nodes.length]);

  // ─── Simulation tick ───────────────────────────────────────

  const tick = useCallback(() => {
    setNodes((prevNodes) => {
      // Build adjacency
      const outgoing = new Map<string, string[]>();
      for (const e of edges) {
        if (!outgoing.has(e.source)) outgoing.set(e.source, []);
        outgoing.get(e.source)!.push(e.target);
      }

      // Reset load
      const loads = new Map<string, number>();
      for (const n of prevNodes) loads.set(n.id, 0);

      // Propagate traffic from clients (BFS with levels)
      const clients = prevNodes.filter((n) => n.type === "client" && n.alive);
      for (const c of clients) loads.set(c.id, trafficRate);

      // Simple BFS propagation (no cycles)
      const visited = new Set<string>();
      const queue: string[] = clients.map((c) => c.id);
      const order: string[] = [];
      while (queue.length > 0) {
        const id = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);
        order.push(id);
        const outs = outgoing.get(id) || [];
        for (const o of outs) if (!visited.has(o)) queue.push(o);
      }

      // Propagate load along edges
      for (const id of order) {
        const node = prevNodes.find((n) => n.id === id);
        if (!node || !node.alive) continue;
        const outs = outgoing.get(id) || [];
        if (outs.length === 0) continue;
        const currentLoad = loads.get(id) || 0;
        const capacity = node.capacityPerReplica * node.replicas;
        // If overloaded, only capacity passes through (backpressure)
        const throughput = Math.min(currentLoad, capacity);
        const share = throughput / outs.length;
        for (const o of outs) {
          const oNode = prevNodes.find((n) => n.id === o);
          if (oNode && oNode.alive) {
            loads.set(o, (loads.get(o) || 0) + share);
          }
        }
      }

      // Compute stats per node
      return prevNodes.map((n) => {
        const load = loads.get(n.id) || 0;
        const capacity = n.capacityPerReplica * n.replicas;
        const sat = capacity > 0 ? load / capacity : 0;
        // Effective latency increases with saturation
        const effLat = n.baseLatencyMs * (1 + Math.max(0, sat - 0.7) * 5);
        return { ...n, currentLoad: load, saturation: sat, effectiveLatency: effLat };
      });
    });
  }, [edges, trafficRate]);

  // ─── Simulation loop ───────────────────────────────────────

  useEffect(() => {
    if (!running) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    let particleCounter = 0;
    const loop = (t: number) => {
      if (!lastTickRef.current) lastTickRef.current = t;
      const dt = t - lastTickRef.current;
      if (dt > 500 / speed) {
        tick();
        lastTickRef.current = t;
      }

      // Spawn particles on edges with load
      setParticles((prev) => {
        const newParticles: Particle[] = [];
        // Move existing particles
        for (const p of prev) {
          const np = { ...p, progress: p.progress + 0.02 * speed };
          if (np.progress < 1) newParticles.push(np);
        }
        // Spawn new ones based on load
        if (particleCounter++ % 2 === 0) {
          setNodes((cur) => {
            const outgoingMap = new Map<string, string[]>();
            for (const e of edges) {
              if (!outgoingMap.has(e.source)) outgoingMap.set(e.source, []);
              outgoingMap.get(e.source)!.push(e.id);
            }
            for (const n of cur) {
              if (!n.alive || n.currentLoad < 10) continue;
              const outEdgeIds = outgoingMap.get(n.id) || [];
              for (const eid of outEdgeIds) {
                if (Math.random() < Math.min(0.8, n.currentLoad / 2000)) {
                  newParticles.push({
                    id: particleIdRef.current++,
                    edgeId: eid,
                    progress: 0,
                    speed: 1,
                  });
                }
              }
            }
            return cur;
          });
        }
        return newParticles.slice(0, 150); // cap particle count
      });

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTickRef.current = 0;
    };
  }, [running, speed, tick, edges]);

  // ─── Drag-drop handlers ────────────────────────────────────

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

  const onCanvasMouseUp = () => { setDraggingId(null); };

  const onNodeClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (connectFrom) {
      if (connectFrom !== id) {
        setEdges((prev) => {
          // Prevent duplicates
          if (prev.some((p) => p.source === connectFrom && p.target === id)) return prev;
          return [...prev, { id: `e${Date.now()}`, source: connectFrom, target: id }];
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
    const x = rect ? rect.width / 2 - 50 : 300;
    const y = rect ? rect.height / 2 - 25 : 200;
    setNodes((prev) => [...prev, {
      id, type, label: TYPE_CONFIG[type].label,
      x, y,
      ...typeDefaults(type),
      alive: true, currentLoad: 0, effectiveLatency: 0, saturation: 0,
    }]);
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
    setNodes((prev) => prev.map((n) => ({ ...n, alive: true, currentLoad: 0, saturation: 0, effectiveLatency: n.baseLatencyMs })));
    setParticles([]);
  };

  const selected = nodes.find((n) => n.id === selectedId);

  // ─── Render helpers ────────────────────────────────────────

  const getEdgePath = (edge: SimEdge) => {
    const s = nodes.find((n) => n.id === edge.source);
    const t = nodes.find((n) => n.id === edge.target);
    if (!s || !t) return null;
    const x1 = s.x + 60, y1 = s.y + 25;
    const x2 = t.x + 60, y2 = t.y + 25;
    const dx = x2 - x1;
    const midX = x1 + dx / 2;
    return { x1, y1, x2, y2, path: `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}` };
  };

  const getParticlePosition = (p: Particle) => {
    const edge = edges.find((e) => e.id === p.edgeId);
    if (!edge) return null;
    const ep = getEdgePath(edge);
    if (!ep) return null;
    // Cubic bezier interpolation
    const t = p.progress;
    const midX = ep.x1 + (ep.x2 - ep.x1) / 2;
    const x = (1 - t) ** 3 * ep.x1 + 3 * (1 - t) ** 2 * t * midX + 3 * (1 - t) * t ** 2 * midX + t ** 3 * ep.x2;
    const y = (1 - t) ** 3 * ep.y1 + 3 * (1 - t) ** 2 * t * ep.y1 + 3 * (1 - t) * t ** 2 * ep.y2 + t ** 3 * ep.y2;
    return { x, y };
  };

  const nodeColor = (n: SimNode) => {
    if (!n.alive) return "#3f3f46";
    if (n.saturation > 1.0) return "#ef4444";  // overloaded red
    if (n.saturation > 0.8) return "#f97316";  // hot orange
    if (n.saturation > 0.5) return "#fbbf24";  // warm yellow
    return TYPE_CONFIG[n.type].color;
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 border-b border-[#2a2a3a] bg-surface px-6 py-3">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Activity className="h-5 w-5 text-archlens-400" /> Simulator
        </h2>
        <div className="h-6 w-px bg-[#2a2a3a]" />

        {/* Playback */}
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

        {/* Speed */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#5a5a70] uppercase">Speed</span>
          {[1, 2, 5].map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono ${speed === s ? "bg-archlens-500/20 text-archlens-300" : "text-[#5a5a70] hover:text-[#8888a0]"}`}
            >
              {s}x
            </button>
          ))}
        </div>

        <div className="h-6 w-px bg-[#2a2a3a]" />

        {/* Traffic */}
        <div className="flex items-center gap-2 flex-1 max-w-xs">
          <span className="text-[10px] text-[#5a5a70] uppercase">Traffic</span>
          <input
            type="range"
            min="10"
            max="5000"
            step="10"
            value={trafficRate}
            onChange={(e) => setTrafficRate(Number(e.target.value))}
            className="flex-1 accent-archlens-500"
          />
          <span className="text-xs font-mono text-archlens-300 w-20 text-right">{trafficRate} req/s</span>
        </div>

        <div className="ml-auto flex items-center gap-2 text-[10px] text-[#5a5a70]">
          <span>{nodes.length} nodes</span>
          <span>·</span>
          <span>{edges.length} edges</span>
          {running && <><span>·</span><span className="text-emerald-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> LIVE</span></>}
        </div>
      </div>

      {/* ── Main content: palette | canvas | inspector ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left: Component palette ── */}
        <aside className="w-48 border-r border-[#2a2a3a] bg-surface overflow-y-auto">
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
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg bg-[#1e1e2a] border border-[#2a2a3a] hover:border-archlens-500/30 hover:bg-hover transition-all group"
                  >
                    <div className="rounded-md p-1.5" style={{ backgroundColor: `${cfg.color}15`, color: cfg.color }}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-xs font-medium text-[#8888a0] group-hover:text-[#e4e4ed]">{cfg.label}</span>
                    <Plus className="h-3 w-3 ml-auto text-[#5a5a70] opacity-0 group-hover:opacity-100" />
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
              {connectFrom ? "Click target..." : "Connect"}
            </button>
            <button
              onClick={deleteSelected}
              disabled={!selectedId}
              className="w-full px-2.5 py-1.5 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-semibold disabled:opacity-40"
            >
              Delete Node
            </button>
          </div>

          <div className="p-3 border-t border-[#2a2a3a]">
            <div className="text-[9px] uppercase font-semibold text-[#5a5a70] tracking-wider mb-2">Legend</div>
            <div className="space-y-1 text-[9px] text-[#5a5a70]">
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#34d399" }} /> Healthy (&lt; 50%)</div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#fbbf24" }} /> Warm (50-80%)</div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#f97316" }} /> Hot (80-100%)</div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#ef4444" }} /> Overload (&gt; 100%)</div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#3f3f46" }} /> Dead</div>
            </div>
          </div>
        </aside>

        {/* ── Canvas ── */}
        <div
          ref={canvasRef}
          onMouseMove={onCanvasMouseMove}
          onMouseUp={onCanvasMouseUp}
          onMouseLeave={onCanvasMouseUp}
          onClick={() => { setSelectedId(null); setConnectFrom(null); }}
          className="flex-1 relative overflow-hidden cursor-default"
          style={{
            backgroundImage: "radial-gradient(circle, #1e1e2a 1px, transparent 1px)",
            backgroundSize: "20px 20px",
            backgroundColor: "#0a0a10",
          }}
        >
          {/* SVG edges + particles */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#4a4a5e" />
              </marker>
            </defs>
            {edges.map((e) => {
              const ep = getEdgePath(e);
              if (!ep) return null;
              const srcNode = nodes.find((n) => n.id === e.source);
              const isActive = running && srcNode && srcNode.alive && srcNode.currentLoad > 0;
              return (
                <path
                  key={e.id}
                  d={ep.path}
                  fill="none"
                  stroke={isActive ? "#7c3aed" : "#2a2a3a"}
                  strokeWidth={isActive ? 2 : 1.5}
                  markerEnd="url(#arrow)"
                  opacity={isActive ? 0.7 : 0.5}
                />
              );
            })}

            {/* Particles */}
            {particles.map((p) => {
              const pos = getParticlePosition(p);
              if (!pos) return null;
              return (
                <circle
                  key={p.id}
                  cx={pos.x}
                  cy={pos.y}
                  r="3"
                  fill="#a78bfa"
                  opacity={0.8}
                  className="drop-shadow-[0_0_4px_rgba(167,139,250,0.8)]"
                />
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
            return (
              <div
                key={n.id}
                onMouseDown={(e) => onNodeMouseDown(e, n.id)}
                onClick={(e) => onNodeClick(e, n.id)}
                className={`absolute select-none transition-shadow ${isSelected ? "ring-2 ring-archlens-400" : ""} ${isConnectSource ? "ring-2 ring-emerald-400" : ""}`}
                style={{
                  left: n.x,
                  top: n.y,
                  width: 120,
                  cursor: draggingId === n.id ? "grabbing" : "grab",
                  borderRadius: 12,
                  backgroundColor: n.alive ? "#16161f" : "#0f0f16",
                  border: `2px solid ${color}`,
                  boxShadow: running && n.saturation > 0.5 ? `0 0 20px ${color}60` : "none",
                  opacity: n.alive ? 1 : 0.4,
                }}
              >
                <div className="flex items-center gap-2 p-2">
                  <div className="rounded-md p-1" style={{ backgroundColor: `${color}20`, color }}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-semibold text-[#e4e4ed] truncate">{n.label}</div>
                    <div className="text-[8px] text-[#5a5a70] uppercase">{n.type}</div>
                  </div>
                  {!n.alive && <Skull className="h-3 w-3 text-red-400" />}
                </div>
                {running && n.alive && (
                  <div className="px-2 pb-1.5">
                    <div className="flex items-center justify-between text-[8px] text-[#5a5a70] mb-0.5">
                      <span>{Math.round(n.currentLoad)} req/s</span>
                      <span style={{ color }}>{Math.round(n.saturation * 100)}%</span>
                    </div>
                    <div className="h-1 rounded-full bg-[#1e1e2a] overflow-hidden">
                      <div
                        className="h-full transition-all duration-300"
                        style={{
                          width: `${Math.min(100, n.saturation * 100)}%`,
                          backgroundColor: color,
                        }}
                      />
                    </div>
                  </div>
                )}
                {n.replicas > 1 && (
                  <div className="absolute -top-1 -right-1 bg-archlens-500 text-white text-[8px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {n.replicas}
                  </div>
                )}
              </div>
            );
          })}

          {/* Empty state hint */}
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-[#5a5a70] text-sm">
              Add components from the palette to start
            </div>
          )}
        </div>

        {/* ── Right: Inspector ── */}
        <aside className="w-72 border-l border-[#2a2a3a] bg-surface overflow-y-auto">
          {selected ? (
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-archlens-400" />
                <h3 className="text-sm font-semibold text-[#e4e4ed]">Node Inspector</h3>
              </div>

              {/* Label */}
              <div>
                <label className="text-[9px] uppercase font-semibold text-[#5a5a70]">Label</label>
                <input
                  type="text"
                  value={selected.label}
                  onChange={(e) => updateSelected({ label: e.target.value })}
                  className="w-full mt-1 rounded-md bg-deep border border-[#2a2a3a] px-2 py-1.5 text-xs text-[#e4e4ed] outline-none focus:border-archlens-500/40"
                />
              </div>

              {/* Type */}
              <div>
                <label className="text-[9px] uppercase font-semibold text-[#5a5a70]">Type</label>
                <div className="mt-1 text-xs font-mono text-archlens-300">{TYPE_CONFIG[selected.type].label}</div>
              </div>

              {/* Capacity */}
              <div>
                <label className="text-[9px] uppercase font-semibold text-[#5a5a70]">Capacity (req/s per replica)</label>
                <input
                  type="number"
                  value={selected.capacityPerReplica}
                  onChange={(e) => updateSelected({ capacityPerReplica: Number(e.target.value) })}
                  className="w-full mt-1 rounded-md bg-deep border border-[#2a2a3a] px-2 py-1.5 text-xs text-[#e4e4ed] outline-none focus:border-archlens-500/40"
                />
              </div>

              {/* Latency */}
              <div>
                <label className="text-[9px] uppercase font-semibold text-[#5a5a70]">Base Latency (ms)</label>
                <input
                  type="number"
                  value={selected.baseLatencyMs}
                  onChange={(e) => updateSelected({ baseLatencyMs: Number(e.target.value) })}
                  className="w-full mt-1 rounded-md bg-deep border border-[#2a2a3a] px-2 py-1.5 text-xs text-[#e4e4ed] outline-none focus:border-archlens-500/40"
                />
              </div>

              {/* Replicas */}
              <div>
                <label className="text-[9px] uppercase font-semibold text-[#5a5a70]">Replicas: {selected.replicas}</label>
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={selected.replicas}
                  onChange={(e) => updateSelected({ replicas: Number(e.target.value) })}
                  className="w-full mt-1 accent-archlens-500"
                />
                <div className="flex justify-between text-[9px] text-[#5a5a70]">
                  <span>1</span><span>10</span><span>20</span>
                </div>
              </div>

              {/* Failure */}
              <button
                onClick={killNode}
                className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  selected.alive ? "bg-red-500/15 text-red-400 border border-red-500/30" : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                }`}
              >
                {selected.alive ? <><Skull className="h-3.5 w-3.5" /> Kill Node</> : <>Revive</>}
              </button>

              {/* Runtime stats */}
              {running && selected.alive && (
                <div className="rounded-lg bg-[#1e1e2a] p-3 space-y-2">
                  <div className="text-[9px] uppercase font-semibold text-[#5a5a70] mb-2">Live Stats</div>
                  <Stat label="Load" value={`${Math.round(selected.currentLoad)} req/s`} />
                  <Stat label="Capacity" value={`${selected.capacityPerReplica * selected.replicas} req/s`} />
                  <Stat label="Saturation" value={`${Math.round(selected.saturation * 100)}%`} warn={selected.saturation > 0.8} />
                  <Stat label="Eff. Latency" value={`${Math.round(selected.effectiveLatency)} ms`} warn={selected.effectiveLatency > selected.baseLatencyMs * 2} />
                  {selected.saturation > 1 && (
                    <div className="flex items-center gap-1.5 text-[10px] text-red-400 mt-2 pt-2 border-t border-red-500/20">
                      <AlertTriangle className="h-3 w-3" /> OVERLOADED — bottleneck detected
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 text-center text-[#5a5a70] text-xs">
              <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Select a node to inspect</p>
              <p className="mt-2 text-[10px]">Click "Connect" in the palette to link nodes</p>
            </div>
          )}

          {/* Global stats */}
          {running && (
            <div className="p-4 border-t border-[#2a2a3a]">
              <div className="text-[9px] uppercase font-semibold text-[#5a5a70] mb-2">System Health</div>
              {(() => {
                const alive = nodes.filter((n) => n.alive);
                const overloaded = alive.filter((n) => n.saturation > 1);
                const hot = alive.filter((n) => n.saturation > 0.8 && n.saturation <= 1);
                const totalLoad = alive.reduce((a, n) => a + n.currentLoad, 0);
                return (
                  <div className="space-y-1.5 text-[10px]">
                    <div className="flex justify-between"><span className="text-[#5a5a70]">Total throughput</span><span className="text-[#e4e4ed] font-mono">{Math.round(totalLoad)} req/s</span></div>
                    <div className="flex justify-between"><span className="text-[#5a5a70]">Overloaded</span><span className={overloaded.length > 0 ? "text-red-400 font-mono" : "text-[#e4e4ed] font-mono"}>{overloaded.length}</span></div>
                    <div className="flex justify-between"><span className="text-[#5a5a70]">Hot</span><span className={hot.length > 0 ? "text-orange-400 font-mono" : "text-[#e4e4ed] font-mono"}>{hot.length}</span></div>
                    <div className="flex justify-between"><span className="text-[#5a5a70]">Dead</span><span className="text-[#e4e4ed] font-mono">{nodes.length - alive.length}</span></div>
                  </div>
                );
              })()}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ─── Helpers ──────────────────────────────────────────── */

function typeDefaults(type: NodeType) {
  const cfg = TYPE_CONFIG[type];
  return {
    capacityPerReplica: cfg.capacity,
    baseLatencyMs: cfg.latency,
    replicas: 1,
  };
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between text-[10px]">
      <span className="text-[#5a5a70]">{label}</span>
      <span className={`font-mono ${warn ? "text-amber-400" : "text-[#e4e4ed]"}`}>{value}</span>
    </div>
  );
}
