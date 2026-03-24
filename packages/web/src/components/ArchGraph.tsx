import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from "react";
import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import dagre from "cytoscape-dagre";
import cola from "cytoscape-cola";
import { useTheme } from "../lib/theme.js";

cytoscape.use(dagre);
cytoscape.use(cola);

export interface GraphNode {
  id: string;
  label: string;
  sublabel?: string;
  group?: string;
  type?: string;
  size?: number;
  parent?: string;
  weight?: number; // connection count for sizing
}

export interface GraphEdge {
  source: string;
  target: string;
  label?: string;
  type?: string;
  weight?: number;
}

export interface ArchGraphHandle {
  highlightImpact: (nodeId: string, maxDepth?: number) => ImpactResult;
  clearHighlight: () => void;
  selectNode: (nodeId: string) => void;
  fitToView: () => void;
  animateFlow: (nodeIds: string[], speed?: number) => void;
  stopAnimation: () => void;
  filterEdgeTypes: (types: string[]) => void;
  showAllEdges: () => void;
}

export interface ImpactResult {
  d1: string[];
  d2: string[];
  d3: string[];
  total: number;
}

interface ArchGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  layout?: "dagre" | "cola" | "cose" | "circle";
  direction?: "TB" | "LR";
  onNodeClick?: (nodeId: string) => void;
  onNodeDoubleClick?: (nodeId: string) => void;
  onNodeHover?: (nodeId: string | null) => void;
  className?: string;
  impactMode?: boolean;
}

// ─── Premium Color Palette ───────────────────────────────────────────

const layerColors: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  presentation: { bg: "#0d3320", border: "#34d399", text: "#a7f3d0", glow: "rgba(52,211,153,0.4)" },
  api:           { bg: "#0c2545", border: "#60a5fa", text: "#bfdbfe", glow: "rgba(96,165,250,0.4)" },
  application:   { bg: "#3a2506", border: "#fbbf24", text: "#fde68a", glow: "rgba(251,191,36,0.4)" },
  domain:        { bg: "#1e0a3e", border: "#a78bfa", text: "#ddd6fe", glow: "rgba(167,139,250,0.4)" },
  infrastructure:{ bg: "#3b0d0d", border: "#f87171", text: "#fecaca", glow: "rgba(248,113,113,0.4)" },
  config:        { bg: "#1a1a2e", border: "#94a3b8", text: "#cbd5e1", glow: "rgba(148,163,184,0.3)" },
  test:          { bg: "#2a1a00", border: "#f59e0b", text: "#fde68a", glow: "rgba(245,158,11,0.4)" },
  default:       { bg: "#1e1e2a", border: "#6b7280", text: "#d1d5db", glow: "rgba(107,114,128,0.3)" },
};

const edgeColors: Record<string, string> = {
  imports: "#818cf8", calls: "#34d399", extends: "#fbbf24",
  implements: "#a78bfa", composes: "#475569", depends_on: "#64748b",
};

// ─── Stylesheet ──────────────────────────────────────────────────────

function buildStylesheet(useForceLayout: boolean): any[] {
  const nodeShape = useForceLayout ? "ellipse" : "roundrectangle";
  const nodeW = useForceLayout ? 50 : 200;
  const nodeH = useForceLayout ? 50 : 60;

  return [
    // ── Nodes ──
    {
      selector: "node",
      style: {
        label: "data(label)",
        "text-valign": useForceLayout ? "bottom" : "center",
        "text-halign": "center",
        "font-size": useForceLayout ? "10px" : "13px",
        "font-weight": "500",
        color: "#e2e8f0",
        "background-color": "#1e1e2a",
        "border-width": 2.5,
        "border-color": "#4a5568",
        "text-wrap": "wrap",
        "text-max-width": useForceLayout ? "100px" : "160px",
        "text-margin-y": useForceLayout ? 8 : 0,
        shape: nodeShape,
        width: useForceLayout ? "data(nodeSize)" : nodeW,
        height: useForceLayout ? "data(nodeSize)" : nodeH,
        padding: useForceLayout ? "0" : "16px",
        "overlay-padding": "8px",
        // Glow effect via shadow
        "shadow-blur": "12",
        "shadow-color": "data(glowColor)",
        "shadow-opacity": 0.5,
        "shadow-offset-x": 0,
        "shadow-offset-y": 0,
        "transition-property": "border-width, border-color, shadow-blur, shadow-opacity, opacity, background-color",
        "transition-duration": "0.2s",
      },
    },
    // ── Compound/Parent ──
    {
      selector: "node:parent",
      style: {
        "background-opacity": 0.06,
        "border-width": 1,
        "border-style": "dashed",
        "border-opacity": 0.4,
        "text-valign": "top",
        "text-halign": "center",
        "font-size": "11px",
        "font-weight": "600",
        "text-transform": "uppercase",
        padding: "30px",
        "background-color": "#0f0f1a",
        "border-color": "#2a2a3a",
        color: "#4a5568",
        "shadow-blur": 0,
        "shadow-opacity": 0,
      },
    },
    // ── Layer Colors ──
    ...Object.entries(layerColors).map(([group, c]) => ({
      selector: `node[group="${group}"]`,
      style: { "background-color": c.bg, "border-color": c.border, color: c.text },
    })),
    ...Object.entries(layerColors).map(([group, c]) => ({
      selector: `node:parent[group="${group}"]`,
      style: { "background-color": c.bg, "background-opacity": 0.1, "border-color": c.border, "border-opacity": 0.3, color: c.text },
    })),
    // ── States ──
    { selector: "node:selected", style: { "border-width": 4, "border-color": "#22d3ee", "shadow-blur": 25, "shadow-color": "rgba(34,211,238,0.5)", "shadow-opacity": 0.8, "z-index": 999 } },
    { selector: "node.highlighted", style: { "border-width": 3.5, "border-color": "#fbbf24", "shadow-blur": 20, "shadow-color": "rgba(251,191,36,0.5)", "shadow-opacity": 0.8, "z-index": 999 } },
    { selector: "node.dimmed", style: { opacity: 0.08 } },
    // ── Impact ──
    { selector: "node.impact-source", style: { "border-width": 5, "border-color": "#fff", "background-color": "#dc2626", color: "#fff", "shadow-blur": 30, "shadow-color": "rgba(220,38,38,0.6)", "shadow-opacity": 1, "z-index": 999 } },
    { selector: "node.impact-d1", style: { "border-width": 4, "border-color": "#ef4444", "background-color": "#450a0a", color: "#fca5a5", "shadow-blur": 20, "shadow-color": "rgba(239,68,68,0.5)", "shadow-opacity": 0.8, "z-index": 998 } },
    { selector: "node.impact-d2", style: { "border-width": 3, "border-color": "#f97316", "background-color": "#431407", color: "#fdba74", "shadow-blur": 15, "shadow-color": "rgba(249,115,22,0.4)", "shadow-opacity": 0.6, "z-index": 997 } },
    { selector: "node.impact-d3", style: { "border-width": 2.5, "border-color": "#eab308", "background-color": "#422006", color: "#fde047", "z-index": 996 } },
    // ── Flow ──
    { selector: "node.flow-active", style: { "border-width": 4, "border-color": "#22d3ee", "background-color": "#083344", color: "#ecfeff", "shadow-blur": 25, "shadow-color": "rgba(34,211,238,0.6)", "shadow-opacity": 1, "z-index": 999 } },
    { selector: "node.flow-done", style: { "border-width": 3, "border-color": "#06b6d4", "background-color": "#0c4a6e", color: "#a5f3fc", "z-index": 998 } },
    // ── Edges ──
    {
      selector: "edge",
      style: {
        width: "data(displayWeight)",
        "line-color": "#334155",
        "target-arrow-color": "#334155",
        "target-arrow-shape": "triangle",
        "curve-style": useForceLayout ? "unbundled-bezier" : "bezier",
        ...(useForceLayout ? { "control-point-distances": [20], "control-point-weights": [0.5] } : {}),
        "arrow-scale": 0.8,
        opacity: "data(edgeOpacity)",
        "line-cap": "round",
        "transition-property": "opacity, width, line-color",
        "transition-duration": "0.2s",
      },
    },
    {
      selector: "edge[label]",
      style: {
        label: "data(label)",
        "font-size": "9px",
        color: "#475569",
        "text-rotation": "autorotate",
        "text-margin-y": -10,
        "text-background-color": "#0a0a10",
        "text-background-opacity": 0.85,
        "text-background-padding": "3px",
      },
    },
    ...Object.entries(edgeColors).map(([type, color]) => ({
      selector: `edge[type="${type}"]`,
      style: {
        "line-color": color,
        "target-arrow-color": color,
        "line-style": type === "implements" ? "dashed" : type === "composes" ? "dotted" : "solid",
      },
    })),
    { selector: "edge.highlighted", style: { width: 4, opacity: 1, "z-index": 999 } },
    { selector: "edge.dimmed", style: { opacity: 0.03 } },
    { selector: "edge.hidden-type", style: { display: "none" } },
    { selector: "edge.impact-edge", style: { width: 3.5, opacity: 1, "line-color": "#ef4444", "target-arrow-color": "#ef4444", "z-index": 998 } },
    { selector: "edge.flow-edge", style: { width: 4, opacity: 1, "line-color": "#22d3ee", "target-arrow-color": "#22d3ee", "z-index": 999 } },
  ];
}

// ─── Component ───────────────────────────────────────────────────────

export const ArchGraph = forwardRef<ArchGraphHandle, ArchGraphProps>(function ArchGraph(
  { nodes, edges, layout = "dagre", direction = "TB", onNodeClick, onNodeDoubleClick, onNodeHover, className = "", impactMode = false },
  ref,
) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const animationRef = useRef<number | null>(null);

  // Determine if we should use force layout (better for many nodes)
  const useForceLayout = layout === "cose" || layout === "cola" || nodes.length > 30;

  useImperativeHandle(ref, () => ({
    highlightImpact(nodeId: string, maxDepth = 3): ImpactResult {
      const cy = cyRef.current;
      if (!cy) return { d1: [], d2: [], d3: [], total: 0 };
      cy.elements().removeClass("impact-source impact-d1 impact-d2 impact-d3 dimmed highlighted impact-edge");
      const source = cy.getElementById(nodeId);
      if (source.empty()) return { d1: [], d2: [], d3: [], total: 0 };
      source.addClass("impact-source");

      const visited = new Map<string, number>();
      visited.set(nodeId, 0);
      const queue = [{ id: nodeId, depth: 0 }];
      const result: ImpactResult = { d1: [], d2: [], d3: [], total: 0 };

      while (queue.length > 0) {
        const { id, depth } = queue.shift()!;
        if (depth >= maxDepth) continue;
        const node = cy.getElementById(id);
        for (const edge of node.connectedEdges()) {
          const other = edge.source().id() === id ? edge.target() : edge.source();
          const oid = other.id();
          if (visited.has(oid)) continue;
          const d = depth + 1;
          visited.set(oid, d);
          if (d === 1) { result.d1.push(oid); other.addClass("impact-d1"); edge.addClass("impact-edge"); }
          else if (d === 2) { result.d2.push(oid); other.addClass("impact-d2"); }
          else if (d === 3) { result.d3.push(oid); other.addClass("impact-d3"); }
          queue.push({ id: oid, depth: d });
        }
      }

      cy.nodes().forEach((n) => { if (!visited.has(n.id())) n.addClass("dimmed"); });
      cy.edges().forEach((e) => { if (!e.hasClass("impact-edge")) e.addClass("dimmed"); });
      result.total = result.d1.length + result.d2.length + result.d3.length;
      return result;
    },
    clearHighlight() { cyRef.current?.elements().removeClass("impact-source impact-d1 impact-d2 impact-d3 dimmed highlighted flow-active flow-done flow-edge impact-edge hidden-type"); },
    selectNode(nodeId) {
      const cy = cyRef.current;
      if (!cy) return;
      cy.elements().removeClass("highlighted dimmed");
      const node = cy.getElementById(nodeId);
      if (node.nonempty()) {
        node.select();
        const nb = node.neighborhood().add(node);
        cy.elements().not(nb).addClass("dimmed");
        nb.addClass("highlighted");
        cy.animate({ center: { eles: node }, zoom: Math.max(cy.zoom(), 1) }, { duration: 400, easing: "ease-in-out-cubic" });
      }
    },
    fitToView() { cyRef.current?.animate({ fit: { eles: cyRef.current.elements(), padding: 60 } }, { duration: 400, easing: "ease-in-out-cubic" }); },
    animateFlow(nodeIds, speed = 800) {
      const cy = cyRef.current;
      if (!cy) return;
      cy.elements().removeClass("flow-active flow-done flow-edge dimmed").addClass("dimmed");
      let step = 0;
      const animate = () => {
        if (step >= nodeIds.length) return;
        const node = cy.getElementById(nodeIds[step]);
        if (node.nonempty()) {
          if (step > 0) {
            const prev = cy.getElementById(nodeIds[step - 1]);
            prev.removeClass("flow-active").addClass("flow-done");
            prev.edgesTo(node).add(node.edgesTo(prev)).removeClass("dimmed").addClass("flow-edge");
          }
          node.removeClass("dimmed").addClass("flow-active");
          cy.animate({ center: { eles: node } }, { duration: 300, easing: "ease-in-out-cubic" });
        }
        step++;
        animationRef.current = window.setTimeout(animate, speed);
      };
      animate();
    },
    stopAnimation() {
      if (animationRef.current) { clearTimeout(animationRef.current); animationRef.current = null; }
      cyRef.current?.elements().removeClass("flow-active flow-done flow-edge dimmed");
    },
    filterEdgeTypes(types) {
      cyRef.current?.edges().forEach((e) => {
        if (types.length > 0 && !types.includes(e.data("type"))) e.addClass("hidden-type");
        else e.removeClass("hidden-type");
      });
    },
    showAllEdges() { cyRef.current?.edges().removeClass("hidden-type"); },
  }));

  const initGraph = useCallback(() => {
    if (!containerRef.current) return;
    if (cyRef.current) cyRef.current.destroy();

    // Calculate node weights (connection count → size)
    const nodeWeights = new Map<string, number>();
    for (const edge of edges) {
      nodeWeights.set(edge.source, (nodeWeights.get(edge.source) || 0) + 1);
      nodeWeights.set(edge.target, (nodeWeights.get(edge.target) || 0) + 1);
    }
    const maxWeight = Math.max(...nodeWeights.values(), 1);

    const elements: ElementDefinition[] = [];
    const groups = new Set(nodes.filter((n) => n.parent).map((n) => n.parent!));

    for (const group of groups) {
      const gn = nodes.find((n) => n.id === group);
      elements.push({ data: { id: group, label: gn?.label || group, group: gn?.group || "default" } });
    }

    for (const node of nodes) {
      if (groups.has(node.id) && !node.parent) continue;
      const w = nodeWeights.get(node.id) || 1;
      const nodeSize = useForceLayout ? Math.max(30, 25 + (w / maxWeight) * 40) : 200;
      const groupColors = layerColors[node.group || "default"] || layerColors.default;

      elements.push({
        data: {
          id: node.id,
          label: useForceLayout ? node.label : (node.sublabel ? `${node.label}\n${node.sublabel}` : node.label),
          group: node.group || "default",
          parent: node.parent,
          nodeSize,
          glowColor: groupColors.glow,
        },
      });
    }

    const validIds = new Set(elements.map((e) => e.data.id).filter(Boolean));
    for (const edge of edges) {
      if (!validIds.has(edge.source) || !validIds.has(edge.target) || edge.source === edge.target) continue;
      const w = edge.weight || 1;
      elements.push({
        data: {
          source: edge.source, target: edge.target,
          label: w > 1 ? `${w}` : "",
          type: edge.type || "depends_on",
          weight: w,
          displayWeight: Math.min(1.5 + Math.log2(w + 1) * 1.5, 8),
          edgeOpacity: Math.min(0.3 + (w / Math.max(...edges.map((e) => e.weight || 1), 1)) * 0.7, 1),
        },
      });
    }

    const layoutConfig = useForceLayout
      ? {
          name: "cola" as const,
          nodeSpacing: 60,
          edgeLength: 150,
          animate: true,
          animationDuration: 800,
          randomize: true,
          padding: 60,
          maxSimulationTime: 3000,
        }
      : {
          name: "dagre" as const,
          rankDir: direction,
          nodeSep: 90,
          rankSep: 120,
          edgeSep: 40,
          padding: 60,
        };

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: buildStylesheet(useForceLayout),
      layout: layoutConfig as cytoscape.LayoutOptions,
      minZoom: 0.08,
      maxZoom: 5,
      pixelRatio: 1, // Better performance
    });

    // ── Interactions ──
    cy.on("tap", "node", (e) => {
      if (impactMode) return;
      const node = e.target;
      onNodeClick?.(node.id());
      cy.elements().removeClass("highlighted dimmed");
      const nb = node.neighborhood().add(node);
      cy.elements().not(nb).addClass("dimmed");
      nb.addClass("highlighted");
    });

    cy.on("dbltap", "node", (e) => onNodeDoubleClick?.(e.target.id()));

    cy.on("tap", (e) => {
      if (e.target === cy) {
        cy.elements().removeClass("highlighted dimmed impact-source impact-d1 impact-d2 impact-d3 impact-edge");
        onNodeClick?.("");
      }
    });

    cy.on("mouseover", "node", (e) => {
      containerRef.current!.style.cursor = "pointer";
      onNodeHover?.(e.target.id());
      // Glow on hover
      e.target.style({ "shadow-blur": 25, "shadow-opacity": 0.9 });
    });
    cy.on("mouseout", "node", (e) => {
      containerRef.current!.style.cursor = "default";
      onNodeHover?.(null);
      e.target.style({ "shadow-blur": 12, "shadow-opacity": 0.5 });
    });

    // Edge hover
    cy.on("mouseover", "edge", (e) => {
      const edge = e.target;
      edge.style({ width: Math.max(edge.data("displayWeight") * 1.5, 3), opacity: 1, label: `${edge.data("type")} ×${edge.data("weight") || 1}` });
    });
    cy.on("mouseout", "edge", (e) => {
      const edge = e.target;
      edge.style({ width: edge.data("displayWeight"), opacity: edge.data("edgeOpacity"), label: edge.data("label") || "" });
    });

    // Fit with animation
    setTimeout(() => cy.animate({ fit: { eles: cy.elements(), padding: 60 } }, { duration: 600, easing: "ease-in-out-cubic" }), useForceLayout ? 3200 : 100);

    cyRef.current = cy;
  }, [nodes, edges, layout, direction, onNodeClick, onNodeDoubleClick, onNodeHover, impactMode, useForceLayout]);

  useEffect(() => {
    initGraph();
    return () => { if (animationRef.current) clearTimeout(animationRef.current); cyRef.current?.destroy(); };
  }, [initGraph]);

  return (
    <div className={`relative ${className}`}>
      <div
        ref={containerRef}
        className="w-full h-full rounded-xl"
        style={{
          background: theme.graphBg,
          backgroundImage: `${theme.graphBg}, ${theme.graphGrid}`,
          backgroundSize: "100% 100%, 20px 20px",
        }}
      />

      {/* Controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1.5">
        {[
          { label: "+", fn: () => cyRef.current?.animate({ zoom: { level: cyRef.current.zoom() * 1.3, position: cyRef.current.extent().x1 !== undefined ? { x: (cyRef.current.extent().x1 + cyRef.current.extent().x2) / 2, y: (cyRef.current.extent().y1 + cyRef.current.extent().y2) / 2 } : cyRef.current.pan() } }, { duration: 200 }) },
          { label: "−", fn: () => cyRef.current?.animate({ zoom: { level: cyRef.current.zoom() / 1.3, position: cyRef.current.extent().x1 !== undefined ? { x: (cyRef.current.extent().x1 + cyRef.current.extent().x2) / 2, y: (cyRef.current.extent().y1 + cyRef.current.extent().y2) / 2 } : cyRef.current.pan() } }, { duration: 200 }) },
          { label: "⊡", fn: () => cyRef.current?.animate({ fit: { eles: cyRef.current!.elements(), padding: 60 } }, { duration: 400, easing: "ease-in-out-cubic" }) },
        ].map(({ label, fn }) => (
          <button key={label} onClick={fn} className="w-9 h-9 bg-slate-800/70 hover:bg-slate-700/80 border border-slate-600/40 rounded-lg flex items-center justify-center text-slate-300 text-sm font-medium backdrop-blur-md transition-all hover:scale-110 shadow-lg">
            {label}
          </button>
        ))}
      </div>

      {/* Impact badge */}
      {impactMode && (
        <div className="absolute top-4 right-4 bg-red-500/15 border border-red-500/40 text-red-400 px-4 py-2 rounded-xl text-xs font-semibold backdrop-blur-md shadow-lg shadow-red-500/10 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          IMPACT MODE
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-slate-900/70 backdrop-blur-md border border-slate-700/40 rounded-xl p-3 shadow-lg">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {Object.entries(layerColors).filter(([k]) => k !== "default" && k !== "test").map(([layer, c]) => (
            <div key={layer} className="flex items-center gap-2">
              <div className="w-3 h-2.5 rounded-sm" style={{ backgroundColor: c.border, boxShadow: `0 0 8px ${c.glow}` }} />
              <span className="text-[10px] text-slate-400 capitalize">{layer}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
