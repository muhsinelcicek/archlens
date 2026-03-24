import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from "react";
import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Stylesheet = any;
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
  d1: string[]; // direct — WILL BREAK
  d2: string[]; // indirect — LIKELY AFFECTED
  d3: string[]; // transitive — MAY NEED TESTING
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

const layerColors: Record<string, { bg: string; border: string; text: string }> = {
  presentation: { bg: "#1a3a2a", border: "#34d399", text: "#a7f3d0" },
  api: { bg: "#1a2a4a", border: "#60a5fa", text: "#bfdbfe" },
  application: { bg: "#3a2a0a", border: "#fbbf24", text: "#fde68a" },
  domain: { bg: "#2a1a4a", border: "#a78bfa", text: "#ddd6fe" },
  infrastructure: { bg: "#3a1a1a", border: "#f87171", text: "#fecaca" },
  config: { bg: "#2a2a2a", border: "#9ca3af", text: "#d1d5db" },
  test: { bg: "#3a2a0a", border: "#f59e0b", text: "#fde68a" },
  default: { bg: "#333333", border: "#666666", text: "#cccccc" },
};

const edgeTypeStyles: Record<string, { color: string; style: string }> = {
  imports: { color: "#6366f1", style: "solid" },
  calls: { color: "#10b981", style: "solid" },
  extends: { color: "#f59e0b", style: "solid" },
  implements: { color: "#8b5cf6", style: "dashed" },
  composes: { color: "#64748b", style: "dotted" },
  depends_on: { color: "#64748b", style: "solid" },
};

function buildStylesheet(): Stylesheet[] {
  return [
    {
      selector: "node",
      style: {
        label: "data(label)",
        "text-valign": "center",
        "text-halign": "center",
        "font-size": "11px",
        color: "#e0e0e0",
        "background-color": "#333333",
        "border-width": 2,
        "border-color": "#555555",
        "text-wrap": "wrap",
        "text-max-width": "140px",
        shape: "roundrectangle",
        width: 160,
        height: 50,
        padding: "14px",
      },
    },
    {
      selector: "node:parent",
      style: {
        "background-opacity": 0.15,
        "border-width": 2,
        "border-style": "dashed",
        "text-valign": "top",
        "text-halign": "center",
        "font-size": "13px",
        "font-weight": "bold",
        padding: "24px",
        "background-color": "#252525",
        "border-color": "#444444",
        color: "#aaaaaa",
      },
    },
    ...Object.entries(layerColors).map(
      ([group, colors]) =>
        ({ selector: `node[group="${group}"]`, style: { "background-color": colors.bg, "border-color": colors.border, color: colors.text } }) as Stylesheet,
    ),
    ...Object.entries(layerColors).map(
      ([group, colors]) =>
        ({ selector: `node:parent[group="${group}"]`, style: { "background-color": colors.bg, "background-opacity": 0.3, "border-color": colors.border, color: colors.text } }) as Stylesheet,
    ),
    { selector: "node:selected", style: { "border-width": 3, "border-color": "#10b981", "z-index": 999 } },
    { selector: "node.highlighted", style: { "border-width": 3, "border-color": "#fbbf24", "z-index": 999 } },
    { selector: "node.dimmed", style: { opacity: 0.15 } },
    // Impact radius classes
    { selector: "node.impact-d1", style: { "border-width": 4, "border-color": "#ef4444", "background-color": "#7f1d1d", color: "#fca5a5", "z-index": 998 } },
    { selector: "node.impact-d2", style: { "border-width": 3, "border-color": "#f97316", "background-color": "#7c2d12", color: "#fdba74", "z-index": 997 } },
    { selector: "node.impact-d3", style: { "border-width": 2, "border-color": "#eab308", "background-color": "#713f12", color: "#fde047", "z-index": 996 } },
    { selector: "node.impact-source", style: { "border-width": 5, "border-color": "#fff", "background-color": "#dc2626", color: "#fff", "z-index": 999 } },
    // Flow animation
    { selector: "node.flow-active", style: { "border-width": 4, "border-color": "#22d3ee", "background-color": "#0e7490", color: "#fff", "z-index": 999 } },
    { selector: "node.flow-done", style: { "border-width": 3, "border-color": "#06b6d4", "background-color": "#164e63", color: "#a5f3fc", "z-index": 998 } },
    // Edges
    {
      selector: "edge",
      style: {
        width: "data(displayWeight)",
        "line-color": "#666666",
        "target-arrow-color": "#666666",
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
        "arrow-scale": 0.8,
        opacity: 0.8,
      },
    },
    {
      selector: "edge[label]",
      style: {
        label: "data(label)",
        "font-size": "9px",
        color: "#6b7280",
        "text-rotation": "autorotate",
        "text-margin-y": -8,
      },
    },
    ...Object.entries(edgeTypeStyles).map(
      ([type, style]) =>
        ({ selector: `edge[type="${type}"]`, style: { "line-color": style.color, "target-arrow-color": style.color, "line-style": style.style as "solid" | "dashed" | "dotted" } }) as Stylesheet,
    ),
    { selector: "edge.highlighted", style: { width: 4, opacity: 1, "z-index": 999 } },
    { selector: "edge.dimmed", style: { opacity: 0.05 } },
    { selector: "edge.hidden-type", style: { display: "none" } },
    { selector: "edge.impact-edge", style: { width: 3, opacity: 1, "line-color": "#ef4444", "target-arrow-color": "#ef4444", "z-index": 998 } },
    { selector: "edge.flow-edge", style: { width: 4, opacity: 1, "line-color": "#22d3ee", "target-arrow-color": "#22d3ee", "line-style": "solid", "z-index": 999 } },
  ];
}

export const ArchGraph = forwardRef<ArchGraphHandle, ArchGraphProps>(function ArchGraph(
  {
    nodes,
    edges,
    layout = "dagre",
    direction = "TB",
    onNodeClick,
    onNodeDoubleClick,
    onNodeHover,
    className = "",
    impactMode = false,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const animationRef = useRef<number | null>(null);

  // Expose imperative methods
  useImperativeHandle(ref, () => ({
    highlightImpact(nodeId: string, maxDepth = 3): ImpactResult {
      const cy = cyRef.current;
      if (!cy) return { d1: [], d2: [], d3: [], total: 0 };

      cy.elements().removeClass("impact-source impact-d1 impact-d2 impact-d3 dimmed highlighted");

      const source = cy.getElementById(nodeId);
      if (source.empty()) return { d1: [], d2: [], d3: [], total: 0 };

      source.addClass("impact-source");

      // BFS from source following incoming edges (who depends on me)
      const visited = new Map<string, number>(); // nodeId → depth
      visited.set(nodeId, 0);
      const queue: Array<{ id: string; depth: number }> = [{ id: nodeId, depth: 0 }];
      const result: ImpactResult = { d1: [], d2: [], d3: [], total: 0 };

      while (queue.length > 0) {
        const { id, depth } = queue.shift()!;
        if (depth >= maxDepth) continue;

        // Find all nodes that import/call/depend on this node
        const incomers = cy.getElementById(id).incomers("edge");
        for (const edge of incomers) {
          const sourceNode = edge.source();
          const sourceId = sourceNode.id();
          if (visited.has(sourceId)) continue;

          const newDepth = depth + 1;
          visited.set(sourceId, newDepth);

          if (newDepth === 1) { result.d1.push(sourceId); sourceNode.addClass("impact-d1"); edge.addClass("impact-edge"); }
          else if (newDepth === 2) { result.d2.push(sourceId); sourceNode.addClass("impact-d2"); }
          else if (newDepth === 3) { result.d3.push(sourceId); sourceNode.addClass("impact-d3"); }

          queue.push({ id: sourceId, depth: newDepth });
        }

        // Also follow outgoing for downstream impact
        const outgoers = cy.getElementById(id).outgoers("edge");
        for (const edge of outgoers) {
          const targetNode = edge.target();
          const targetId = targetNode.id();
          if (visited.has(targetId)) continue;

          const newDepth = depth + 1;
          visited.set(targetId, newDepth);

          if (newDepth === 1) { result.d1.push(targetId); targetNode.addClass("impact-d1"); edge.addClass("impact-edge"); }
          else if (newDepth === 2) { result.d2.push(targetId); targetNode.addClass("impact-d2"); }
          else if (newDepth === 3) { result.d3.push(targetId); targetNode.addClass("impact-d3"); }

          queue.push({ id: targetId, depth: newDepth });
        }
      }

      // Dim unaffected nodes
      cy.nodes().forEach((n) => {
        if (!visited.has(n.id())) n.addClass("dimmed");
      });
      cy.edges().forEach((e) => {
        if (!e.hasClass("impact-edge")) e.addClass("dimmed");
      });

      result.total = result.d1.length + result.d2.length + result.d3.length;
      return result;
    },

    clearHighlight() {
      cyRef.current?.elements().removeClass("impact-source impact-d1 impact-d2 impact-d3 dimmed highlighted flow-active flow-done flow-edge impact-edge hidden-type");
    },

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

    fitToView() {
      cyRef.current?.fit(undefined, 40);
    },

    animateFlow(nodeIds: string[], speed = 800) {
      const cy = cyRef.current;
      if (!cy) return;

      cy.elements().removeClass("flow-active flow-done flow-edge dimmed");
      cy.elements().addClass("dimmed");

      let step = 0;
      const animate = () => {
        if (step >= nodeIds.length) return;

        const nodeId = nodeIds[step];
        const node = cy.getElementById(nodeId);
        if (node.nonempty()) {
          if (step > 0) {
            const prevNode = cy.getElementById(nodeIds[step - 1]);
            prevNode.removeClass("flow-active").addClass("flow-done");
            // Highlight edge between prev and current
            const connecting = prevNode.edgesTo(node).add(node.edgesTo(prevNode));
            connecting.removeClass("dimmed").addClass("flow-edge");
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
      if (animationRef.current) {
        clearTimeout(animationRef.current);
        animationRef.current = null;
      }
      cyRef.current?.elements().removeClass("flow-active flow-done flow-edge dimmed");
    },

    filterEdgeTypes(types: string[]) {
      const cy = cyRef.current;
      if (!cy) return;
      cy.edges().forEach((e) => {
        const edgeType = e.data("type");
        if (types.length > 0 && !types.includes(edgeType)) {
          e.addClass("hidden-type");
        } else {
          e.removeClass("hidden-type");
        }
      });
    },

    showAllEdges() {
      cyRef.current?.edges().removeClass("hidden-type");
    },
  }));

  const initGraph = useCallback(() => {
    if (!containerRef.current) return;
    if (cyRef.current) cyRef.current.destroy();

    const elements: ElementDefinition[] = [];
    const groups = new Set(nodes.filter((n) => n.parent).map((n) => n.parent!));

    for (const group of groups) {
      const groupNode = nodes.find((n) => n.id === group);
      elements.push({ data: { id: group, label: groupNode?.label || group, group: groupNode?.group || "default" } });
    }

    for (const node of nodes) {
      if (groups.has(node.id) && !node.parent) continue;
      elements.push({
        data: {
          id: node.id,
          label: node.sublabel ? `${node.label}\n${node.sublabel}` : node.label,
          group: node.group || "default",
          parent: node.parent,
          nodeType: node.type,
        },
      });
    }

    // Collect valid node IDs
    const validNodeIds = new Set(elements.map((e) => e.data.id).filter(Boolean));

    for (const edge of edges) {
      // Skip edges with nonexistent source or target
      if (!validNodeIds.has(edge.source) || !validNodeIds.has(edge.target)) continue;
      if (edge.source === edge.target) continue; // skip self-loops

      const w = edge.weight || 1;
      elements.push({
        data: {
          source: edge.source,
          target: edge.target,
          label: edge.label,
          type: edge.type || "depends_on",
          weight: w,
          displayWeight: Math.min(1 + Math.log2(w + 1), 6),
        },
      });
    }

    containerRef.current.style.backgroundColor = "#1e1e1e";

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: buildStylesheet(),
      layout: {
        name: layout,
        ...(layout === "dagre"
          ? { rankDir: direction, nodeSep: 60, rankSep: 80, edgeSep: 20, padding: 40 }
          : layout === "cola"
            ? { nodeSpacing: 80, edgeLength: 150, animate: false, padding: 40 }
            : { padding: 40 }),
      } as cytoscape.LayoutOptions,
      minZoom: 0.15,
      maxZoom: 4,
      // default wheel sensitivity
    });

    // Interactions
    cy.on("tap", "node", (e) => {
      const node = e.target;
      if (impactMode) return; // Impact mode handles its own click

      onNodeClick?.(node.id());
      cy.elements().removeClass("highlighted dimmed");
      const neighborhood = node.neighborhood().add(node);
      cy.elements().not(neighborhood).addClass("dimmed");
      neighborhood.addClass("highlighted");
    });

    cy.on("dbltap", "node", (e) => {
      onNodeDoubleClick?.(e.target.id());
    });

    cy.on("tap", (e) => {
      if (e.target === cy) {
        cy.elements().removeClass("highlighted dimmed impact-source impact-d1 impact-d2 impact-d3 impact-edge");
        onNodeClick?.("");
      }
    });

    cy.on("mouseover", "node", (e) => {
      containerRef.current!.style.cursor = "pointer";
      onNodeHover?.(e.target.id());
    });

    cy.on("mouseout", "node", () => {
      containerRef.current!.style.cursor = "default";
      onNodeHover?.(null);
    });

    // Edge hover tooltip
    cy.on("mouseover", "edge", (e) => {
      const edge = e.target;
      const w = edge.data("weight") || 1;
      const t = edge.data("type") || "?";
      edge.style("label", `${t} (${w})`);
      edge.style("font-size", "10px");
      edge.style("color", "#a1a1aa");
    });

    cy.on("mouseout", "edge", (e) => {
      const edge = e.target;
      edge.style("label", edge.data("label") || "");
    });

    cy.fit(undefined, 40);
    cyRef.current = cy;
  }, [nodes, edges, layout, direction, onNodeClick, onNodeDoubleClick, onNodeHover, impactMode]);

  useEffect(() => {
    initGraph();
    return () => {
      if (animationRef.current) clearTimeout(animationRef.current);
      cyRef.current?.destroy();
    };
  }, [initGraph]);

  const handleZoomIn = () => cyRef.current?.zoom(cyRef.current.zoom() * 1.3);
  const handleZoomOut = () => cyRef.current?.zoom(cyRef.current.zoom() / 1.3);
  const handleFit = () => cyRef.current?.fit(undefined, 40);

  return (
    <div className={`relative ${className}`}>
      <div ref={containerRef} className="w-full h-full rounded-xl" style={{ backgroundColor: "#1e1e1e" }} />

      {/* Zoom Controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1">
        <button onClick={handleZoomIn} className="w-8 h-8 bg-[#383838]/90 hover:bg-zinc-700 border border-zinc-700 rounded-lg flex items-center justify-center text-[#b0b0b0] text-sm backdrop-blur-sm">+</button>
        <button onClick={handleZoomOut} className="w-8 h-8 bg-[#383838]/90 hover:bg-zinc-700 border border-zinc-700 rounded-lg flex items-center justify-center text-[#b0b0b0] text-sm backdrop-blur-sm">-</button>
        <button onClick={handleFit} className="w-8 h-8 bg-[#383838]/90 hover:bg-zinc-700 border border-zinc-700 rounded-lg flex items-center justify-center text-[#b0b0b0] backdrop-blur-sm" title="Fit">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
        </button>
      </div>

      {/* Impact Mode indicator */}
      {impactMode && (
        <div className="absolute top-4 right-4 bg-red-500/10 border border-red-500/30 text-red-400 px-3 py-1.5 rounded-lg text-xs font-medium backdrop-blur-sm">
          IMPACT MODE — click a node to see blast radius
        </div>
      )}
    </div>
  );
});
