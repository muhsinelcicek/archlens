/**
 * SimCanvas — graph rendering (nodes + edges + badges).
 *
 * Receives all state as props — no internal state except UI hover.
 */

import { forwardRef } from "react";
import {
  Users, Layers, Cloud, Server, Database, Zap, Activity,
  Globe, MessageSquare, HardDrive, Wifi, Shield, Eye, Code, Container, Network,
  Skull, ZoomIn, ZoomOut, Maximize2, Crosshair, Grid3x3, Map as MapIcon,
} from "lucide-react";
import { useState } from "react";
import type { SimNode, SimEdge, NodeType, NodeIncident } from "../../../lib/simulator-engine.js";
import type { CanvasTransform } from "../../../lib/use-canvas-transform.js";

const TYPE_ICONS: Record<NodeType, React.ElementType> = {
  client: Users, loadbalancer: Layers, api: Cloud, service: Server,
  database: Database, cache: Zap, queue: Activity, cdn: Globe,
  messagebroker: MessageSquare, storage: HardDrive, dns: Wifi,
  auth: Shield, monitoring: Eye, lambda: Code, container: Container, gateway: Network,
};

const TYPE_COLORS: Record<NodeType, string> = {
  client: "#34d399", loadbalancer: "#60a5fa", api: "#a78bfa", service: "#fbbf24",
  database: "#f87171", cache: "#f472b6", queue: "#06b6d4", cdn: "#10b981",
  messagebroker: "#8b5cf6", storage: "#ef4444", dns: "#6366f1", auth: "#f59e0b",
  monitoring: "#14b8a6", lambda: "#ec4899", container: "#0ea5e9", gateway: "#84cc16",
};

interface Props {
  nodes: SimNode[];
  edges: SimEdge[];
  canvas: { transform: CanvasTransform; snapEnabled: boolean; onWheel: (e: React.WheelEvent<HTMLDivElement>) => void; onPanStart: (e: React.MouseEvent<HTMLDivElement>) => void; zoomIn: () => void; zoomOut: () => void; resetZoom: () => void; fitToView: (nodes: Array<{x:number;y:number}>, w:number, h:number) => void; setSnapEnabled: (b:boolean) => void; };
  selectedIds: Set<string>;
  connectFrom: string | null;
  draggingId: string | null;
  running: boolean;
  speed: number;
  nodeIncidents: Map<string, NodeIncident[]>;
  setNodes: React.Dispatch<React.SetStateAction<SimNode[]>>;
  onNodeMouseDown: (e: React.MouseEvent, id: string) => void;
  onNodeClick: (e: React.MouseEvent, id: string) => void;
  onCanvasMouseMove: (e: React.MouseEvent) => void;
  onCanvasMouseUp: () => void;
  onCanvasClick: () => void;
}

export const SimCanvas = forwardRef<HTMLDivElement, Props>(function SimCanvas(props, ref) {
  const { nodes, edges, canvas, selectedIds, connectFrom, draggingId, running, speed, nodeIncidents } = props;
  const [showMinimap, setShowMinimap] = useState(true);

  function nodeColor(n: SimNode): string {
    if (!n.alive) return "#3f3f46";
    if (n.circuitBreaker.state === "open") return "#9333ea";
    if (n.utilization > 1.0) return "#ef4444";
    if (n.utilization > 0.8) return "#f97316";
    if (n.utilization > 0.5) return "#fbbf24";
    return TYPE_COLORS[n.type];
  }

  function getEdgePath(edge: SimEdge) {
    const s = nodes.find((n) => n.id === edge.source);
    const t = nodes.find((n) => n.id === edge.target);
    if (!s || !t) return null;
    const W = 140, H = 70;
    const dx = (t.x + W / 2) - (s.x + W / 2);
    const dy = (t.y + H / 2) - (s.y + H / 2);
    const pickPort = (nx: number, ny: number, ddx: number, ddy: number) => {
      if (Math.abs(ddx) > Math.abs(ddy)) return ddx > 0 ? { x: nx + W, y: ny + H / 2 } : { x: nx, y: ny + H / 2 };
      return ddy > 0 ? { x: nx + W / 2, y: ny + H } : { x: nx + W / 2, y: ny };
    };
    const p1 = pickPort(s.x, s.y, dx, dy);
    const p2 = pickPort(t.x, t.y, -dx, -dy);
    const path = Math.abs(dy) > Math.abs(dx)
      ? `M ${p1.x} ${p1.y} C ${p1.x} ${(p1.y + p2.y) / 2}, ${p2.x} ${(p1.y + p2.y) / 2}, ${p2.x} ${p2.y}`
      : `M ${p1.x} ${p1.y} C ${(p1.x + p2.x) / 2} ${p1.y}, ${(p1.x + p2.x) / 2} ${p2.y}, ${p2.x} ${p2.y}`;
    return { path };
  }

  return (
    <div
      ref={ref}
      onMouseMove={props.onCanvasMouseMove}
      onMouseUp={props.onCanvasMouseUp}
      onMouseLeave={props.onCanvasMouseUp}
      onMouseDown={(e) => canvas.onPanStart(e)}
      onWheel={canvas.onWheel}
      onClick={props.onCanvasClick}
      className="flex-1 relative overflow-hidden"
      style={{
        backgroundImage: "radial-gradient(circle, var(--color-border-subtle) 1px, transparent 1px)",
        backgroundSize: `${20 * canvas.transform.scale}px ${20 * canvas.transform.scale}px`,
        backgroundPosition: `${canvas.transform.offsetX}px ${canvas.transform.offsetY}px`,
        backgroundColor: "var(--color-deep)",
      }}
    >
      {/* Zoom controls */}
      <div className="absolute bottom-3 left-3 z-20 flex items-center gap-1 bg-elevated/90 backdrop-blur rounded-lg border border-[var(--color-border-default)] p-1">
        <button onClick={canvas.zoomOut} className="p-1.5 rounded hover:bg-hover text-[var(--color-text-muted)]"><ZoomOut className="h-3.5 w-3.5" /></button>
        <span className="text-[10px] font-mono text-[var(--color-text-muted)] w-10 text-center">{Math.round(canvas.transform.scale * 100)}%</span>
        <button onClick={canvas.zoomIn} className="p-1.5 rounded hover:bg-hover text-[var(--color-text-muted)]"><ZoomIn className="h-3.5 w-3.5" /></button>
        <button onClick={canvas.resetZoom} className="p-1.5 rounded hover:bg-hover text-[var(--color-text-muted)]"><Crosshair className="h-3.5 w-3.5" /></button>
        <button onClick={() => canvas.setSnapEnabled(!canvas.snapEnabled)} className={`p-1.5 rounded ${canvas.snapEnabled ? "text-archlens-300 bg-archlens-500/15" : "text-[var(--color-text-muted)]"}`}><Grid3x3 className="h-3.5 w-3.5" /></button>
      </div>

      {/* Minimap */}
      {showMinimap && nodes.length > 0 && (
        <div className="absolute bottom-3 right-3 z-20 w-36 h-20 bg-elevated/90 backdrop-blur rounded-lg border border-[var(--color-border-default)] overflow-hidden">
          <svg viewBox={`${Math.min(...nodes.map(n => n.x)) - 20} ${Math.min(...nodes.map(n => n.y)) - 20} ${Math.max(...nodes.map(n => n.x)) - Math.min(...nodes.map(n => n.x)) + 200} ${Math.max(...nodes.map(n => n.y)) - Math.min(...nodes.map(n => n.y)) + 120}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
            {edges.map((e) => { const s = nodes.find(n => n.id === e.source); const t = nodes.find(n => n.id === e.target); if (!s || !t) return null; return <line key={e.id} x1={s.x + 70} y1={s.y + 35} x2={t.x + 70} y2={t.y + 35} stroke="#3a3a5a" strokeWidth={3} />; })}
            {nodes.map((n) => <rect key={n.id} x={n.x} y={n.y} width={140} height={50} rx={6} fill={selectedIds.has(n.id) ? "#a78bfa" : nodeColor(n)} fillOpacity={0.7} />)}
          </svg>
        </div>
      )}

      {/* Transform container */}
      <div style={{ transform: `translate(${canvas.transform.offsetX}px, ${canvas.transform.offsetY}px) scale(${canvas.transform.scale})`, transformOrigin: "0 0", position: "relative", minWidth: 3000, minHeight: 2000 }}>
        {/* SVG edges */}
        <svg className="absolute inset-0 pointer-events-none" style={{ width: 3000, height: 2000 }}>
          <defs>
            <marker id="sim-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#4a4a5e" /></marker>
            <marker id="sim-arrow-active" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#a78bfa" /></marker>
          </defs>
          {edges.map((e) => {
            const ep = getEdgePath(e);
            if (!ep) return null;
            const src = nodes.find(n => n.id === e.source);
            const tgt = nodes.find(n => n.id === e.target);
            const isActive = running && src?.alive && (src.incomingRate || 0) > 0;
            const isFail = running && (!tgt?.alive || (tgt && tgt.utilization > 1));
            const color = isFail ? "#ef4444" : isActive ? "#a78bfa" : "var(--color-border-default)";
            const sw = isActive ? Math.min(5, 1 + (src!.incomingRate || 0) / 500) : 1.5;
            return (
              <g key={e.id}>
                <path d={ep.path} fill="none" stroke={color} strokeWidth={sw} strokeDasharray={isFail ? "6 3" : undefined} markerEnd={isActive ? "url(#sim-arrow-active)" : "url(#sim-arrow)"} opacity={isActive ? 0.75 : 0.4} />
                {isActive && !isFail && <circle r="3" fill="#c4b5fd"><animateMotion dur={`${Math.max(0.5, 3 / speed)}s`} repeatCount="indefinite" path={ep.path} /></circle>}
              </g>
            );
          })}
        </svg>

        {/* Nodes */}
        {nodes.map((n) => {
          const Icon = TYPE_ICONS[n.type];
          const color = nodeColor(n);
          const isSelected = selectedIds.has(n.id);
          const p95 = n.metrics.latencyP95[n.metrics.latencyP95.length - 1] || 0;
          const incidents = nodeIncidents.get(n.id);

          return (
            <div key={n.id}
              onMouseDown={(e) => props.onNodeMouseDown(e, n.id)}
              onClick={(e) => props.onNodeClick(e, n.id)}
              className={`absolute select-none transition-shadow ${isSelected ? "ring-2 ring-archlens-400" : ""} ${connectFrom === n.id ? "ring-2 ring-emerald-400" : ""}`}
              style={{ left: n.x, top: n.y, width: 140, cursor: draggingId === n.id ? "grabbing" : "grab", borderRadius: 10, backgroundColor: n.alive ? "var(--color-elevated)" : "#0f0f16", border: `2px solid ${color}`, boxShadow: running && n.utilization > 0.5 ? `0 0 16px ${color}70` : "none", opacity: n.alive ? 1 : 0.5 }}
            >
              <div className="flex items-center gap-2 p-2">
                <div className="rounded-md p-1" style={{ backgroundColor: `${color}20`, color }}><Icon className="h-3.5 w-3.5" /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold text-[var(--color-text-primary)] truncate">{n.label}</div>
                  <div className="text-[8px] text-[var(--color-text-muted)] uppercase">{n.type}{n.circuitBreaker.state === "open" ? " ⚡CB" : ""}</div>
                </div>
                {!n.alive && <Skull className="h-3 w-3 text-red-400" />}
                {n.replicas > 1 && <div className="text-[9px] font-bold text-archlens-300 bg-archlens-500/20 rounded-full w-5 h-5 flex items-center justify-center">{n.replicas}</div>}
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
                    <span>p95 {Math.round(p95)}ms</span>
                    {n.queueDepth > 5 && <span className="text-orange-400">Q:{Math.round(n.queueDepth)}</span>}
                  </div>
                </div>
              )}
              {/* Incident badges */}
              {incidents && incidents.length > 0 && (
                <div className="absolute -right-2 top-0 translate-x-full flex flex-col gap-1 pl-2 z-20 pointer-events-none" style={{ maxWidth: 200 }}>
                  {incidents.slice(0, 4).map((inc, idx) => {
                    const bg = inc.type === "TOPOLOGY_PRESSURE" ? "#92400e" : inc.severity >= 80 ? "#991b1b" : inc.severity >= 60 ? "#92400e" : "#1e3a5f";
                    return (
                      <div key={idx} className="flex items-center gap-1">
                        <div className="rounded px-1.5 py-0.5 text-[8px] font-bold uppercase whitespace-nowrap pointer-events-auto"
                          style={{ backgroundColor: bg, color: "#fff", border: `1px solid ${inc.severity >= 80 ? "#ef4444" : "#f97316"}` }}
                          title={inc.explanation}>
                          {inc.label}
                          {inc.type === "TOPOLOGY_PRESSURE" && <div className="text-[7px] font-medium normal-case mt-0.5 text-amber-200">{inc.explanation}</div>}
                        </div>
                        {(inc.type === "SPOF" || inc.type === "OVERLOAD") && (
                          <button onClick={(ev) => { ev.stopPropagation(); props.setNodes((prev) => prev.map((nd) => nd.id === n.id ? { ...nd, replicas: Math.max(nd.replicas, 2) } : nd)); }}
                            className="rounded px-1 py-0.5 text-[7px] font-bold bg-emerald-600 text-white pointer-events-auto">FIX</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
