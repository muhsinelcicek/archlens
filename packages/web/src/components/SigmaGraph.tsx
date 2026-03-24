import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef, useState } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import EdgeCurveProgram from "@sigma/edge-curve";
import FA2Layout from "graphology-layout-forceatlas2/worker";
import forceAtlas2 from "graphology-layout-forceatlas2";
import { useTheme } from "../lib/theme.js";

// Re-export types for compatibility
export interface GraphNode {
  id: string;
  label: string;
  sublabel?: string;
  group?: string;
  type?: string;
  size?: number;
  parent?: string;
  weight?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  label?: string;
  type?: string;
  weight?: number;
}

export interface ImpactResult {
  d1: string[];
  d2: string[];
  d3: string[];
  total: number;
}

export interface SigmaGraphHandle {
  highlightImpact: (nodeId: string, maxDepth?: number) => ImpactResult;
  clearHighlight: () => void;
  selectNode: (nodeId: string) => void;
  fitToView: () => void;
  animateFlow: (nodeIds: string[], speed?: number) => void;
  stopAnimation: () => void;
  filterEdgeTypes: (types: string[]) => void;
  showAllEdges: () => void;
}

interface SigmaGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick?: (nodeId: string) => void;
  onNodeDoubleClick?: (nodeId: string) => void;
  onNodeHover?: (nodeId: string | null) => void;
  className?: string;
  impactMode?: boolean;
}

// ─── Colors ──────────────────────────────────────────────────────────

const layerNodeColors: Record<string, { fill: string; border: string }> = {
  presentation: { fill: "#0d3320", border: "#34d399" },
  api:           { fill: "#0c2545", border: "#60a5fa" },
  application:   { fill: "#3a2506", border: "#fbbf24" },
  domain:        { fill: "#1e0a3e", border: "#a78bfa" },
  infrastructure:{ fill: "#3b0d0d", border: "#f87171" },
  config:        { fill: "#1a1a2e", border: "#94a3b8" },
  test:          { fill: "#2a1a00", border: "#f59e0b" },
  default:       { fill: "#1e1e2a", border: "#6b7280" },
};

const edgeTypeColors: Record<string, string> = {
  imports: "#818cf8", calls: "#34d399", extends: "#fbbf24",
  implements: "#a78bfa", composes: "#334155", depends_on: "#475569",
};

const DIM_COLOR = "#12121c";

function blendColor(color: string, target: string, amount: number): string {
  const parse = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const [r1, g1, b1] = parse(color);
  const [r2, g2, b2] = parse(target);
  const r = Math.round(r1 + (r2 - r1) * amount);
  const g = Math.round(g1 + (g2 - g1) * amount);
  const b = Math.round(b1 + (b2 - b1) * amount);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// ─── Component ───────────────────────────────────────────────────────

export const SigmaGraph = forwardRef<SigmaGraphHandle, SigmaGraphProps>(function SigmaGraph(
  { nodes, edges, onNodeClick, onNodeDoubleClick, onNodeHover, className = "", impactMode = false },
  ref,
) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const layoutRef = useRef<FA2Layout | null>(null);
  const animationRef = useRef<number | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [layoutRunning, setLayoutRunning] = useState(false);

  // ── Imperative Handle ──
  useImperativeHandle(ref, () => ({
    highlightImpact(nodeId: string, maxDepth = 3): ImpactResult {
      const graph = graphRef.current;
      if (!graph || !graph.hasNode(nodeId)) return { d1: [], d2: [], d3: [], total: 0 };

      const visited = new Map<string, number>();
      visited.set(nodeId, 0);
      const queue = [{ id: nodeId, depth: 0 }];
      const result: ImpactResult = { d1: [], d2: [], d3: [], total: 0 };

      while (queue.length > 0) {
        const { id, depth } = queue.shift()!;
        if (depth >= maxDepth) continue;
        for (const neighbor of graph.neighbors(id)) {
          if (visited.has(neighbor)) continue;
          const d = depth + 1;
          visited.set(neighbor, d);
          if (d === 1) result.d1.push(neighbor);
          else if (d === 2) result.d2.push(neighbor);
          else if (d === 3) result.d3.push(neighbor);
          queue.push({ id: neighbor, depth: d });
        }
      }

      // Apply visual
      graph.forEachNode((id, attrs) => {
        const d = visited.get(id);
        if (d === 0) { graph.setNodeAttribute(id, "color", "#ffffff"); graph.setNodeAttribute(id, "size", (attrs.originalSize || 8) * 2); }
        else if (d === 1) { graph.setNodeAttribute(id, "color", "#ef4444"); graph.setNodeAttribute(id, "size", (attrs.originalSize || 8) * 1.5); }
        else if (d === 2) { graph.setNodeAttribute(id, "color", "#f97316"); }
        else if (d === 3) { graph.setNodeAttribute(id, "color", "#eab308"); }
        else { graph.setNodeAttribute(id, "color", blendColor(attrs.originalColor || "#6b7280", DIM_COLOR, 0.8)); graph.setNodeAttribute(id, "size", (attrs.originalSize || 8) * 0.5); }
      });
      graph.forEachEdge((id, attrs) => {
        const src = graph.source(id);
        const tgt = graph.target(id);
        if (visited.has(src) && visited.has(tgt) && Math.abs((visited.get(src) || 0) - (visited.get(tgt) || 0)) <= 1) {
          graph.setEdgeAttribute(id, "color", "#ef4444");
          graph.setEdgeAttribute(id, "size", 3);
        } else {
          graph.setEdgeAttribute(id, "color", blendColor(attrs.originalColor || "#475569", DIM_COLOR, 0.9));
          graph.setEdgeAttribute(id, "size", 0.3);
        }
      });
      sigmaRef.current?.refresh();

      result.total = result.d1.length + result.d2.length + result.d3.length;
      return result;
    },

    clearHighlight() {
      const graph = graphRef.current;
      if (!graph) return;
      graph.forEachNode((id, attrs) => {
        graph.setNodeAttribute(id, "color", attrs.originalColor);
        graph.setNodeAttribute(id, "size", attrs.originalSize);
      });
      graph.forEachEdge((id, attrs) => {
        graph.setEdgeAttribute(id, "color", attrs.originalColor);
        graph.setEdgeAttribute(id, "size", attrs.originalSize);
      });
      setSelectedNode(null);
      sigmaRef.current?.refresh();
    },

    selectNode(nodeId: string) {
      const graph = graphRef.current;
      const sigma = sigmaRef.current;
      if (!graph || !sigma || !graph.hasNode(nodeId)) return;

      setSelectedNode(nodeId);
      applySelection(graph, nodeId);
      sigma.refresh();

      // Animate camera to node
      const pos = graph.getNodeAttributes(nodeId);
      sigma.getCamera().animate({ x: pos.x, y: pos.y, ratio: 0.3 }, { duration: 400 });
    },

    fitToView() {
      sigmaRef.current?.getCamera().animate({ x: 0.5, y: 0.5, ratio: 1, angle: 0 }, { duration: 400 });
    },

    animateFlow(nodeIds: string[], speed = 800) {
      const graph = graphRef.current;
      if (!graph) return;
      // Dim all
      graph.forEachNode((id, attrs) => {
        graph.setNodeAttribute(id, "color", blendColor(attrs.originalColor || "#6b7280", DIM_COLOR, 0.85));
        graph.setNodeAttribute(id, "size", (attrs.originalSize || 8) * 0.5);
      });
      graph.forEachEdge((id, attrs) => {
        graph.setEdgeAttribute(id, "color", blendColor(attrs.originalColor || "#475569", DIM_COLOR, 0.9));
      });

      let step = 0;
      const animate = () => {
        if (step >= nodeIds.length || !graph.hasNode(nodeIds[step])) return;
        const nid = nodeIds[step];
        graph.setNodeAttribute(nid, "color", "#22d3ee");
        graph.setNodeAttribute(nid, "size", (graph.getNodeAttribute(nid, "originalSize") || 8) * 2);
        if (step > 0 && graph.hasNode(nodeIds[step - 1])) {
          graph.setNodeAttribute(nodeIds[step - 1], "color", "#06b6d4");
          graph.setNodeAttribute(nodeIds[step - 1], "size", (graph.getNodeAttribute(nodeIds[step - 1], "originalSize") || 8) * 1.3);
        }
        sigmaRef.current?.refresh();
        const pos = graph.getNodeAttributes(nid);
        sigmaRef.current?.getCamera().animate({ x: pos.x, y: pos.y }, { duration: 300 });
        step++;
        animationRef.current = window.setTimeout(animate, speed);
      };
      animate();
    },

    stopAnimation() {
      if (animationRef.current) { clearTimeout(animationRef.current); animationRef.current = null; }
      this.clearHighlight();
    },

    filterEdgeTypes(types: string[]) {
      const graph = graphRef.current;
      if (!graph) return;
      graph.forEachEdge((id, attrs) => {
        if (types.length > 0 && !types.includes(attrs.edgeType || "")) {
          graph.setEdgeAttribute(id, "hidden", true);
        } else {
          graph.setEdgeAttribute(id, "hidden", false);
        }
      });
      sigmaRef.current?.refresh();
    },

    showAllEdges() {
      graphRef.current?.forEachEdge((id) => { graphRef.current!.setEdgeAttribute(id, "hidden", false); });
      sigmaRef.current?.refresh();
    },
  }));

  // ── Selection Logic ──
  function applySelection(graph: Graph, nodeId: string | null) {
    if (!nodeId) {
      graph.forEachNode((id, attrs) => {
        graph.setNodeAttribute(id, "color", attrs.originalColor);
        graph.setNodeAttribute(id, "size", attrs.originalSize);
      });
      graph.forEachEdge((id, attrs) => {
        graph.setEdgeAttribute(id, "color", attrs.originalColor);
        graph.setEdgeAttribute(id, "size", attrs.originalSize);
      });
      return;
    }

    const neighbors = new Set(graph.neighbors(nodeId));
    neighbors.add(nodeId);

    graph.forEachNode((id, attrs) => {
      if (id === nodeId) {
        graph.setNodeAttribute(id, "color", attrs.originalColor);
        graph.setNodeAttribute(id, "size", (attrs.originalSize || 8) * 1.8);
        graph.setNodeAttribute(id, "zIndex", 2);
      } else if (neighbors.has(id)) {
        graph.setNodeAttribute(id, "color", attrs.originalColor);
        graph.setNodeAttribute(id, "size", (attrs.originalSize || 8) * 1.3);
        graph.setNodeAttribute(id, "zIndex", 1);
      } else {
        graph.setNodeAttribute(id, "color", blendColor(attrs.originalColor || "#6b7280", DIM_COLOR, 0.75));
        graph.setNodeAttribute(id, "size", (attrs.originalSize || 8) * 0.6);
        graph.setNodeAttribute(id, "zIndex", 0);
      }
    });

    graph.forEachEdge((id, attrs, source, target) => {
      if (neighbors.has(source) && neighbors.has(target)) {
        graph.setEdgeAttribute(id, "color", attrs.originalColor);
        graph.setEdgeAttribute(id, "size", (attrs.originalSize || 1) * 3);
      } else {
        graph.setEdgeAttribute(id, "color", blendColor(attrs.originalColor || "#475569", DIM_COLOR, 0.9));
        graph.setEdgeAttribute(id, "size", 0.2);
      }
    });
  }

  // ── Init ──
  const initGraph = useCallback(() => {
    if (!containerRef.current) return;

    // Cleanup
    if (layoutRef.current) { layoutRef.current.kill(); layoutRef.current = null; }
    if (sigmaRef.current) { sigmaRef.current.kill(); sigmaRef.current = null; }

    const graph = new Graph();

    // Calculate weights
    const nodeWeights = new Map<string, number>();
    for (const edge of edges) {
      nodeWeights.set(edge.source, (nodeWeights.get(edge.source) || 0) + (edge.weight || 1));
      nodeWeights.set(edge.target, (nodeWeights.get(edge.target) || 0) + (edge.weight || 1));
    }
    const maxWeight = Math.max(...nodeWeights.values(), 1);

    // Add nodes with smart initial positions (golden angle spiral)
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    let nodeIndex = 0;

    for (const node of nodes) {
      if (node.parent) continue; // Skip compound parents for now

      const w = nodeWeights.get(node.id) || 1;
      const size = 4 + (w / maxWeight) * 16; // 4-20px range
      const colors = layerNodeColors[node.group || "default"] || layerNodeColors.default;

      // Golden angle spiral positioning
      const angle = nodeIndex * goldenAngle;
      const radius = Math.sqrt(nodeIndex + 1) * 40;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      graph.addNode(node.id, {
        x,
        y,
        size,
        color: colors.border,
        borderColor: colors.border,
        label: node.label,
        originalColor: colors.border,
        originalSize: size,
        group: node.group,
        nodeType: node.type,
      });

      nodeIndex++;
    }

    // Add edges
    for (const edge of edges) {
      if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) continue;
      if (edge.source === edge.target) continue;

      const edgeKey = `${edge.source}->${edge.target}`;
      if (graph.hasEdge(edgeKey)) continue;

      const w = edge.weight || 1;
      const color = edgeTypeColors[edge.type || "depends_on"] || "#475569";
      const edgeSize = Math.max(0.5, Math.log2(w + 1) * 0.8);
      const curvature = 0.12 + Math.random() * 0.08;

      graph.addEdgeWithKey(edgeKey, edge.source, edge.target, {
        size: edgeSize,
        color,
        originalColor: color,
        originalSize: edgeSize,
        edgeType: edge.type || "depends_on",
        weight: w,
        type: "curved",
        curvature,
      });
    }

    graphRef.current = graph;

    // Create Sigma renderer
    const sigma = new Sigma(graph, containerRef.current, {
      allowInvalidContainer: true,
      defaultEdgeType: "curved",
      edgeProgramClasses: { curved: EdgeCurveProgram },
      renderEdgeLabels: false,
      labelRenderedSizeThreshold: 6,
      labelDensity: 0.15,
      labelFont: "JetBrains Mono, Fira Code, monospace",
      labelSize: 12,
      labelWeight: "500",
      labelColor: { color: "#e4e4ed" },
      zIndex: true,
      hideEdgesOnMove: true,
      defaultNodeColor: "#6b7280",
      defaultEdgeColor: "#334155",
      minCameraRatio: 0.02,
      maxCameraRatio: 20,
    });

    // ── Interactions ──
    sigma.on("clickNode", ({ node }) => {
      if (impactMode) return;
      setSelectedNode(node);
      applySelection(graph, node);
      sigma.refresh();
      onNodeClick?.(node);
    });

    sigma.on("doubleClickNode", ({ node }) => {
      onNodeDoubleClick?.(node);
    });

    sigma.on("clickStage", () => {
      setSelectedNode(null);
      applySelection(graph, null);
      sigma.refresh();
      onNodeClick?.("");
    });

    sigma.on("enterNode", ({ node }) => {
      onNodeHover?.(node);
      containerRef.current!.style.cursor = "pointer";
      // Hover glow
      graph.setNodeAttribute(node, "size", (graph.getNodeAttribute(node, "originalSize") || 8) * 1.5);
      sigma.refresh();
    });

    sigma.on("leaveNode", ({ node }) => {
      onNodeHover?.(null);
      containerRef.current!.style.cursor = "default";
      if (!selectedNode || (selectedNode !== node && !graph.neighbors(selectedNode || "").includes(node))) {
        graph.setNodeAttribute(node, "size", graph.getNodeAttribute(node, "originalSize") || 8);
      }
      sigma.refresh();
    });

    sigmaRef.current = sigma;

    // ── Start Force Layout ──
    if (nodes.length > 2) {
      const inferred = forceAtlas2.inferSettings(graph);
      const custom = getFA2Settings(nodes.length);
      const settings = { ...inferred, ...custom };
      const fa2 = new FA2Layout(graph, { settings });
      fa2.start();
      layoutRef.current = fa2;
      setLayoutRunning(true);

      // Auto-stop after duration
      const duration = getLayoutDuration(nodes.length);
      setTimeout(() => {
        if (fa2.isRunning()) {
          fa2.stop();
          setLayoutRunning(false);
        }
      }, duration);
    }
  }, [nodes, edges, onNodeClick, onNodeDoubleClick, onNodeHover, impactMode, selectedNode]);

  useEffect(() => {
    // Delay to ensure container is mounted and sized
    const timer = setTimeout(initGraph, 100);
    return () => {
      clearTimeout(timer);
      if (animationRef.current) clearTimeout(animationRef.current);
      if (layoutRef.current) { layoutRef.current.kill(); layoutRef.current = null; }
      if (sigmaRef.current) { sigmaRef.current.kill(); sigmaRef.current = null; }
    };
  }, [initGraph]);

  // ── Layout Controls ──
  const toggleLayout = () => {
    if (!layoutRef.current || !graphRef.current) return;
    if (layoutRef.current.isRunning()) {
      layoutRef.current.stop();
      setLayoutRunning(false);
    } else {
      layoutRef.current.start();
      setLayoutRunning(true);
      setTimeout(() => { layoutRef.current?.stop(); setLayoutRunning(false); }, 5000);
    }
  };

  return (
    <div className={`relative ${className}`}>
      <div
        ref={containerRef}
        className="w-full h-full rounded-xl"
        style={{
          background: theme.graphBg,
        }}
      />

      {/* Controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1.5">
        <button onClick={() => sigmaRef.current?.getCamera().animate({ ratio: sigmaRef.current.getCamera().ratio / 1.3 }, { duration: 200 })} className="w-9 h-9 bg-slate-800/70 hover:bg-slate-700/80 border border-slate-600/40 rounded-lg flex items-center justify-center text-slate-300 text-sm font-medium backdrop-blur-md transition-all hover:scale-110 shadow-lg">+</button>
        <button onClick={() => sigmaRef.current?.getCamera().animate({ ratio: sigmaRef.current.getCamera().ratio * 1.3 }, { duration: 200 })} className="w-9 h-9 bg-slate-800/70 hover:bg-slate-700/80 border border-slate-600/40 rounded-lg flex items-center justify-center text-slate-300 text-sm font-medium backdrop-blur-md transition-all hover:scale-110 shadow-lg">−</button>
        <button onClick={() => sigmaRef.current?.getCamera().animate({ x: 0.5, y: 0.5, ratio: 1, angle: 0 }, { duration: 400 })} className="w-9 h-9 bg-slate-800/70 hover:bg-slate-700/80 border border-slate-600/40 rounded-lg flex items-center justify-center text-slate-300 text-sm font-medium backdrop-blur-md transition-all hover:scale-110 shadow-lg">⊡</button>
        <button
          onClick={toggleLayout}
          className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-medium backdrop-blur-md transition-all hover:scale-110 shadow-lg ${layoutRunning ? "bg-emerald-500/30 border border-emerald-500/50 text-emerald-400 animate-pulse" : "bg-slate-800/70 border border-slate-600/40 text-slate-300 hover:bg-slate-700/80"}`}
          title={layoutRunning ? "Stop layout" : "Run layout"}
        >
          {layoutRunning ? "⏸" : "▶"}
        </button>
      </div>

      {/* Impact badge */}
      {impactMode && (
        <div className="absolute top-4 right-4 bg-red-500/15 border border-red-500/40 text-red-400 px-4 py-2 rounded-xl text-xs font-semibold backdrop-blur-md shadow-lg shadow-red-500/10 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          IMPACT MODE
        </div>
      )}

      {/* Layout indicator */}
      {layoutRunning && (
        <div className="absolute top-4 left-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-3 py-1.5 rounded-lg text-xs font-medium backdrop-blur-md flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          Layout optimizing...
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-slate-900/70 backdrop-blur-md border border-slate-700/40 rounded-xl p-3 shadow-lg">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {Object.entries(layerNodeColors).filter(([k]) => k !== "default" && k !== "test").map(([layer, c]) => (
            <div key={layer} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: c.border, boxShadow: `0 0 8px ${c.border}60` }} />
              <span className="text-[10px] text-slate-400 capitalize">{layer}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

// ─── FA2 Settings per graph size ─────────────────────────────────────

function getFA2Settings(nodeCount: number) {
  if (nodeCount > 500) return { gravity: 0.3, scalingRatio: 60, slowDown: 3, barnesHutOptimize: true, barnesHutTheta: 0.7 };
  if (nodeCount > 100) return { gravity: 0.5, scalingRatio: 30, slowDown: 2, barnesHutOptimize: true, barnesHutTheta: 0.6 };
  return { gravity: 0.8, scalingRatio: 15, slowDown: 1, barnesHutOptimize: false };
}

function getLayoutDuration(nodeCount: number) {
  if (nodeCount > 500) return 15000;
  if (nodeCount > 100) return 8000;
  return 4000;
}
