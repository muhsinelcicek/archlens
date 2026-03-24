import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from "react";
import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import dagre from "cytoscape-dagre";
import cola from "cytoscape-cola";

cytoscape.use(dagre);
cytoscape.use(cola);

export interface GraphNode {
  id: string;
  label: string;
  sublabel?: string;
  group?: string;
  type?: string;
  size?: number;
  color?: string;
  parent?: string;
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
  layout?: "dagre" | "cola" | "circle" | "grid";
  direction?: "TB" | "LR";
  onNodeClick?: (nodeId: string) => void;
  onNodeDoubleClick?: (nodeId: string) => void;
  onNodeHover?: (nodeId: string | null) => void;
  className?: string;
  impactMode?: boolean;
}

// ─── Premium Color Palette ───────────────────────────────────────────

const layerColors: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  presentation: { bg: "#0d3320", border: "#34d399", text: "#a7f3d0", glow: "rgba(52,211,153,0.3)" },
  api:           { bg: "#0c2545", border: "#60a5fa", text: "#bfdbfe", glow: "rgba(96,165,250,0.3)" },
  application:   { bg: "#3a2506", border: "#fbbf24", text: "#fde68a", glow: "rgba(251,191,36,0.3)" },
  domain:        { bg: "#1e0a3e", border: "#a78bfa", text: "#ddd6fe", glow: "rgba(167,139,250,0.3)" },
  infrastructure:{ bg: "#3b0d0d", border: "#f87171", text: "#fecaca", glow: "rgba(248,113,113,0.3)" },
  config:        { bg: "#1a1a2e", border: "#94a3b8", text: "#cbd5e1", glow: "rgba(148,163,184,0.2)" },
  test:          { bg: "#2a1a00", border: "#f59e0b", text: "#fde68a", glow: "rgba(245,158,11,0.3)" },
  default:       { bg: "#1e1e2a", border: "#6b7280", text: "#d1d5db", glow: "rgba(107,114,128,0.2)" },
};

const edgeColors: Record<string, string> = {
  imports:    "#818cf8",
  calls:      "#34d399",
  extends:    "#fbbf24",
  implements: "#a78bfa",
  composes:   "#6b7280",
  depends_on: "#94a3b8",
};

// ─── Cytoscape Stylesheet ────────────────────────────────────────────

function buildStylesheet(): any[] {
  return [
    // ── Default Node ──
    {
      selector: "node",
      style: {
        label: "data(label)",
        "text-valign": "center",
        "text-halign": "center",
        "font-size": "13px",
        color: "#e2e8f0",
        "background-color": "#1e1e2a",
        "border-width": 2,
        "border-color": "#4a5568",
        "text-wrap": "wrap",
        "text-max-width": "160px",
        shape: "roundrectangle",
        width: 200,
        height: 60,
        padding: "18px",
        "overlay-padding": "6px",
        "background-opacity": 1,
      },
    },
    // ── Compound/Parent Nodes ──
    {
      selector: "node:parent",
      style: {
        "background-opacity": 0.08,
        "border-width": 1.5,
        "border-style": "dashed",
        "border-opacity": 0.5,
        "text-valign": "top",
        "text-halign": "center",
        "font-size": "11px",
        "font-weight": "600",
        "text-transform": "uppercase",
        padding: "30px",
        "background-color": "#1a1a2e",
        "border-color": "#334155",
        color: "#64748b",
      },
    },
    // ── Layer-specific Node Styles ──
    ...Object.entries(layerColors).map(([group, c]) => ({
      selector: `node[group="${group}"]`,
      style: {
        "background-color": c.bg,
        "border-color": c.border,
        "border-width": 2.5,
        color: c.text,
      },
    })),
    // ── Layer-specific Parent Styles ──
    ...Object.entries(layerColors).map(([group, c]) => ({
      selector: `node:parent[group="${group}"]`,
      style: {
        "background-color": c.bg,
        "background-opacity": 0.12,
        "border-color": c.border,
        "border-opacity": 0.4,
        color: c.text,
      },
    })),
    // ── Selection & Hover ──
    { selector: "node:selected", style: { "border-width": 4, "border-color": "#22d3ee", "z-index": 999 } },
    { selector: "node.highlighted", style: { "border-width": 3.5, "border-color": "#fbbf24", "z-index": 999 } },
    { selector: "node.dimmed", style: { opacity: 0.12 } },
    // ── Impact Radius ──
    { selector: "node.impact-source", style: { "border-width": 5, "border-color": "#ffffff", "background-color": "#dc2626", color: "#ffffff", "z-index": 999 } },
    { selector: "node.impact-d1", style: { "border-width": 4, "border-color": "#ef4444", "background-color": "#450a0a", color: "#fca5a5", "z-index": 998 } },
    { selector: "node.impact-d2", style: { "border-width": 3, "border-color": "#f97316", "background-color": "#431407", color: "#fdba74", "z-index": 997 } },
    { selector: "node.impact-d3", style: { "border-width": 2.5, "border-color": "#eab308", "background-color": "#422006", color: "#fde047", "z-index": 996 } },
    // ── Flow Animation ──
    { selector: "node.flow-active", style: { "border-width": 4, "border-color": "#22d3ee", "background-color": "#083344", color: "#ecfeff", "z-index": 999 } },
    { selector: "node.flow-done", style: { "border-width": 3, "border-color": "#06b6d4", "background-color": "#0c4a6e", color: "#a5f3fc", "z-index": 998 } },
    // ── Default Edge ──
    {
      selector: "edge",
      style: {
        width: "data(displayWeight)",
        "line-color": "#475569",
        "target-arrow-color": "#475569",
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
        "arrow-scale": 0.9,
        opacity: 0.7,
        "line-cap": "round",
      },
    },
    // ── Edge Labels ──
    {
      selector: "edge[label]",
      style: {
        label: "data(label)",
        "font-size": "10px",
        color: "#64748b",
        "text-rotation": "autorotate",
        "text-margin-y": -10,
        "text-background-color": "#0f172a",
        "text-background-opacity": 0.8,
        "text-background-padding": "2px",
      },
    },
    // ── Edge Type Colors ──
    ...Object.entries(edgeColors).map(([type, color]) => ({
      selector: `edge[type="${type}"]`,
      style: {
        "line-color": color,
        "target-arrow-color": color,
        "line-style": type === "implements" ? "dashed" : type === "composes" ? "dotted" : "solid",
      },
    })),
    // ── Edge States ──
    { selector: "edge.highlighted", style: { width: 4, opacity: 1, "z-index": 999 } },
    { selector: "edge.dimmed", style: { opacity: 0.05 } },
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
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const animationRef = useRef<number | null>(null);

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
      const queue: Array<{ id: string; depth: number }> = [{ id: nodeId, depth: 0 }];
      const result: ImpactResult = { d1: [], d2: [], d3: [], total: 0 };

      while (queue.length > 0) {
        const { id, depth } = queue.shift()!;
        if (depth >= maxDepth) continue;
        const node = cy.getElementById(id);
        const neighbors = node.incomers("edge").add(node.outgoers("edge"));
        for (const edge of neighbors) {
          const other = edge.source().id() === id ? edge.target() : edge.source();
          const otherId = other.id();
          if (visited.has(otherId)) continue;
          const d = depth + 1;
          visited.set(otherId, d);
          if (d === 1) { result.d1.push(otherId); other.addClass("impact-d1"); edge.addClass("impact-edge"); }
          else if (d === 2) { result.d2.push(otherId); other.addClass("impact-d2"); }
          else if (d === 3) { result.d3.push(otherId); other.addClass("impact-d3"); }
          queue.push({ id: otherId, depth: d });
        }
      }

      cy.nodes().forEach((n) => { if (!visited.has(n.id())) n.addClass("dimmed"); });
      cy.edges().forEach((e) => { if (!e.hasClass("impact-edge")) e.addClass("dimmed"); });
      result.total = result.d1.length + result.d2.length + result.d3.length;
      return result;
    },
    clearHighlight() { cyRef.current?.elements().removeClass("impact-source impact-d1 impact-d2 impact-d3 dimmed highlighted flow-active flow-done flow-edge impact-edge hidden-type"); },
    selectNode(nodeId: string) {
      const cy = cyRef.current;
      if (!cy) return;
      cy.elements().removeClass("highlighted dimmed");
      const node = cy.getElementById(nodeId);
      if (node.nonempty()) {
        node.select();
        const neighborhood = node.neighborhood().add(node);
        cy.elements().not(neighborhood).addClass("dimmed");
        neighborhood.addClass("highlighted");
        cy.animate({ center: { eles: node }, zoom: cy.zoom() }, { duration: 300 });
      }
    },
    fitToView() { cyRef.current?.fit(undefined, 50); },
    animateFlow(nodeIds: string[], speed = 800) {
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
          cy.animate({ center: { eles: node } }, { duration: 200 });
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
    filterEdgeTypes(types: string[]) {
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

    const elements: ElementDefinition[] = [];
    const groups = new Set(nodes.filter((n) => n.parent).map((n) => n.parent!));

    for (const group of groups) {
      const gn = nodes.find((n) => n.id === group);
      elements.push({ data: { id: group, label: gn?.label || group, group: gn?.group || "default" } });
    }

    for (const node of nodes) {
      if (groups.has(node.id) && !node.parent) continue;
      elements.push({
        data: {
          id: node.id,
          label: node.sublabel ? `${node.label}\n${node.sublabel}` : node.label,
          group: node.group || "default",
          parent: node.parent,
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
          label: w > 1 ? `${w}` : (edge.label || ""),
          type: edge.type || "depends_on",
          weight: w,
          displayWeight: Math.min(1.5 + Math.log2(w + 1) * 1.2, 7),
        },
      });
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: buildStylesheet(),
      layout: {
        name: layout,
        ...(layout === "dagre"
          ? { rankDir: direction, nodeSep: 90, rankSep: 110, edgeSep: 40, padding: 60 }
          : layout === "cola"
            ? { nodeSpacing: 100, edgeLength: 180, animate: false, padding: 60 }
            : { padding: 60 }),
      } as cytoscape.LayoutOptions,
      minZoom: 0.1,
      maxZoom: 4,
    });

    // ── Interactions ──
    cy.on("tap", "node", (e) => {
      const node = e.target;
      if (impactMode) return;
      onNodeClick?.(node.id());
      cy.elements().removeClass("highlighted dimmed");
      const neighborhood = node.neighborhood().add(node);
      cy.elements().not(neighborhood).addClass("dimmed");
      neighborhood.addClass("highlighted");
    });

    cy.on("dbltap", "node", (e) => onNodeDoubleClick?.(e.target.id()));

    cy.on("tap", (e) => {
      if (e.target === cy) { cy.elements().removeClass("highlighted dimmed impact-source impact-d1 impact-d2 impact-d3 impact-edge"); onNodeClick?.(""); }
    });

    cy.on("mouseover", "node", (e) => { containerRef.current!.style.cursor = "pointer"; onNodeHover?.(e.target.id()); });
    cy.on("mouseout", "node", () => { containerRef.current!.style.cursor = "default"; onNodeHover?.(null); });

    // Edge hover
    cy.on("mouseover", "edge", (e) => {
      const edge = e.target;
      const w = edge.data("weight") || 1;
      const t = edge.data("type") || "?";
      edge.style({ label: `${t} ×${w}`, "font-size": "11px", color: "#94a3b8" });
    });
    cy.on("mouseout", "edge", (e) => {
      const edge = e.target;
      edge.style({ label: edge.data("label") || "", "font-size": "10px", color: "#64748b" });
    });

    cy.fit(undefined, 50);
    cyRef.current = cy;
  }, [nodes, edges, layout, direction, onNodeClick, onNodeDoubleClick, onNodeHover, impactMode]);

  useEffect(() => {
    initGraph();
    return () => { if (animationRef.current) clearTimeout(animationRef.current); cyRef.current?.destroy(); };
  }, [initGraph]);

  return (
    <div className={`relative ${className}`}>
      {/* Canvas with subtle grid */}
      <div
        ref={containerRef}
        className="w-full h-full rounded-xl"
        style={{
          background: "radial-gradient(circle at 50% 50%, rgba(124,58,237,0.04) 0%, transparent 60%), linear-gradient(to bottom, #06060a, #0a0a10)",
          backgroundImage: "radial-gradient(circle at 50% 50%, rgba(124,58,237,0.04) 0%, transparent 60%), radial-gradient(circle, #1a1a2e 0.8px, transparent 0.8px)",
          backgroundSize: "100% 100%, 20px 20px",
        }}
      />

      {/* Zoom Controls — glassmorphism */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1.5">
        {[
          { label: "+", action: () => cyRef.current?.zoom(cyRef.current.zoom() * 1.3) },
          { label: "−", action: () => cyRef.current?.zoom(cyRef.current.zoom() / 1.3) },
          { label: "⊡", action: () => cyRef.current?.fit(undefined, 50) },
        ].map(({ label, action }) => (
          <button
            key={label}
            onClick={action}
            className="w-9 h-9 bg-slate-800/80 hover:bg-slate-700/90 border border-slate-600/50 rounded-lg flex items-center justify-center text-slate-300 text-sm font-medium backdrop-blur-md transition-all hover:scale-105 shadow-lg"
          >
            {label}
          </button>
        ))}
      </div>

      {/* Impact Mode badge */}
      {impactMode && (
        <div className="absolute top-4 right-4 bg-red-500/15 border border-red-500/40 text-red-400 px-4 py-2 rounded-xl text-xs font-semibold backdrop-blur-md shadow-lg shadow-red-500/10 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          IMPACT MODE
        </div>
      )}

      {/* Legend — bottom left */}
      <div className="absolute bottom-4 left-4 bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-xl p-3 shadow-lg">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {Object.entries(layerColors).filter(([k]) => k !== "default" && k !== "test").map(([layer, c]) => (
            <div key={layer} className="flex items-center gap-2">
              <div className="w-3 h-2 rounded-sm" style={{ backgroundColor: c.border, boxShadow: `0 0 6px ${c.glow}` }} />
              <span className="text-[10px] text-slate-400 capitalize">{layer}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
