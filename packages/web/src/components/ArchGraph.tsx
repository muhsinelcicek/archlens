import { useEffect, useRef, useCallback } from "react";
import cytoscape, { type Core, type ElementDefinition, type Stylesheet } from "cytoscape";
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

interface ArchGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  layout?: "dagre" | "cola" | "circle" | "grid";
  direction?: "TB" | "LR";
  onNodeClick?: (nodeId: string) => void;
  onNodeDoubleClick?: (nodeId: string) => void;
  onNodeHover?: (nodeId: string | null) => void;
  className?: string;
  showMinimap?: boolean;
}

const layerColors: Record<string, { bg: string; border: string; text: string }> = {
  presentation: { bg: "#065f46", border: "#10b981", text: "#d1fae5" },
  api: { bg: "#1e3a5f", border: "#3b82f6", text: "#dbeafe" },
  application: { bg: "#5c3d0e", border: "#f59e0b", text: "#fef3c7" },
  domain: { bg: "#4c1d95", border: "#8b5cf6", text: "#ede9fe" },
  infrastructure: { bg: "#7f1d1d", border: "#ef4444", text: "#fee2e2" },
  config: { bg: "#374151", border: "#6b7280", text: "#e5e7eb" },
  test: { bg: "#451a03", border: "#d97706", text: "#fef3c7" },
  default: { bg: "#27272a", border: "#52525b", text: "#e4e4e7" },
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
        "font-family": "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
        color: "#e4e4e7",
        "background-color": "#27272a",
        "border-width": 2,
        "border-color": "#52525b",
        "text-wrap": "wrap",
        "text-max-width": "120px",
        shape: "roundrectangle",
        width: "label",
        height: "label",
        padding: "14px",
        "text-margin-y": 0,
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
        "background-color": "#18181b",
        "border-color": "#3f3f46",
        color: "#a1a1aa",
      },
    },
    // Layer-specific node styles
    ...Object.entries(layerColors).map(
      ([group, colors]) =>
        ({
          selector: `node[group="${group}"]`,
          style: {
            "background-color": colors.bg,
            "border-color": colors.border,
            color: colors.text,
          },
        }) as Stylesheet,
    ),
    // Parent group styles
    ...Object.entries(layerColors).map(
      ([group, colors]) =>
        ({
          selector: `node:parent[group="${group}"]`,
          style: {
            "background-color": colors.bg,
            "background-opacity": 0.3,
            "border-color": colors.border,
            color: colors.text,
          },
        }) as Stylesheet,
    ),
    {
      selector: "node:selected",
      style: {
        "border-width": 3,
        "border-color": "#10b981",
        "background-color": "#064e3b",
        "z-index": 999,
      },
    },
    {
      selector: "node.highlighted",
      style: {
        "border-width": 3,
        "border-color": "#fbbf24",
        "z-index": 999,
      },
    },
    {
      selector: "node.dimmed",
      style: {
        opacity: 0.25,
      },
    },
    {
      selector: "edge",
      style: {
        width: 1.5,
        "line-color": "#3f3f46",
        "target-arrow-color": "#3f3f46",
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
        "arrow-scale": 0.8,
        opacity: 0.7,
      },
    },
    {
      selector: "edge[label]",
      style: {
        label: "data(label)",
        "font-size": "9px",
        color: "#71717a",
        "text-rotation": "autorotate",
        "text-margin-y": -8,
      },
    },
    // Edge type styles
    ...Object.entries(edgeTypeStyles).map(
      ([type, style]) =>
        ({
          selector: `edge[type="${type}"]`,
          style: {
            "line-color": style.color,
            "target-arrow-color": style.color,
            "line-style": style.style as "solid" | "dashed" | "dotted",
          },
        }) as Stylesheet,
    ),
    {
      selector: "edge.highlighted",
      style: {
        width: 3,
        opacity: 1,
        "z-index": 999,
      },
    },
    {
      selector: "edge.dimmed",
      style: {
        opacity: 0.1,
      },
    },
  ];
}

export function ArchGraph({
  nodes,
  edges,
  layout = "dagre",
  direction = "TB",
  onNodeClick,
  onNodeDoubleClick,
  onNodeHover,
  className = "",
  showMinimap = false,
}: ArchGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const minimapRef = useRef<HTMLDivElement>(null);

  const initGraph = useCallback(() => {
    if (!containerRef.current) return;

    // Destroy previous instance
    if (cyRef.current) {
      cyRef.current.destroy();
    }

    // Build elements
    const elements: ElementDefinition[] = [];

    // Add compound parent nodes for groups
    const groups = new Set(nodes.filter((n) => n.parent).map((n) => n.parent!));
    for (const group of groups) {
      const groupNode = nodes.find((n) => n.id === group);
      elements.push({
        data: {
          id: group,
          label: groupNode?.label || group,
          group: groupNode?.group || "default",
        },
      });
    }

    // Add nodes
    for (const node of nodes) {
      if (groups.has(node.id) && !node.parent) continue; // Already added as parent
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

    // Add edges
    for (const edge of edges) {
      elements.push({
        data: {
          source: edge.source,
          target: edge.target,
          label: edge.label,
          type: edge.type || "depends_on",
          weight: edge.weight || 1,
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
          ? {
              rankDir: direction,
              nodeSep: 60,
              rankSep: 80,
              edgeSep: 20,
              padding: 40,
            }
          : layout === "cola"
            ? {
                nodeSpacing: 80,
                edgeLength: 150,
                animate: false,
                padding: 40,
              }
            : { padding: 40 }),
      } as cytoscape.LayoutOptions,
      minZoom: 0.2,
      maxZoom: 3,
      wheelSensitivity: 0.3,
    });

    // Interactions
    cy.on("tap", "node", (e) => {
      const node = e.target;
      onNodeClick?.(node.id());

      // Highlight connected nodes
      cy.elements().removeClass("highlighted dimmed");
      const neighborhood = node.neighborhood().add(node);
      cy.elements().not(neighborhood).addClass("dimmed");
      neighborhood.addClass("highlighted");
    });

    cy.on("dbltap", "node", (e) => {
      const node = e.target;
      onNodeDoubleClick?.(node.id());
    });

    cy.on("tap", (e) => {
      if (e.target === cy) {
        cy.elements().removeClass("highlighted dimmed");
      }
    });

    cy.on("mouseover", "node", (e) => {
      const node = e.target;
      containerRef.current!.style.cursor = "pointer";
      onNodeHover?.(node.id());
    });

    cy.on("mouseout", "node", () => {
      containerRef.current!.style.cursor = "default";
      onNodeHover?.(null);
    });

    // Fit to container
    cy.fit(undefined, 40);

    cyRef.current = cy;
  }, [nodes, edges, layout, direction, onNodeClick, onNodeHover]);

  useEffect(() => {
    initGraph();
    return () => {
      cyRef.current?.destroy();
    };
  }, [initGraph]);

  const handleZoomIn = () => cyRef.current?.zoom(cyRef.current.zoom() * 1.3);
  const handleZoomOut = () => cyRef.current?.zoom(cyRef.current.zoom() / 1.3);
  const handleFit = () => cyRef.current?.fit(undefined, 40);

  return (
    <div className={`relative ${className}`}>
      <div ref={containerRef} className="w-full h-full bg-zinc-950 rounded-xl" />

      {/* Zoom Controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1">
        <button
          onClick={handleZoomIn}
          className="w-8 h-8 bg-zinc-800/90 hover:bg-zinc-700 border border-zinc-700 rounded-lg flex items-center justify-center text-zinc-300 text-sm backdrop-blur-sm transition-colors"
        >
          +
        </button>
        <button
          onClick={handleZoomOut}
          className="w-8 h-8 bg-zinc-800/90 hover:bg-zinc-700 border border-zinc-700 rounded-lg flex items-center justify-center text-zinc-300 text-sm backdrop-blur-sm transition-colors"
        >
          -
        </button>
        <button
          onClick={handleFit}
          className="w-8 h-8 bg-zinc-800/90 hover:bg-zinc-700 border border-zinc-700 rounded-lg flex items-center justify-center text-zinc-300 backdrop-blur-sm transition-colors"
          title="Fit to view"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
        </button>
      </div>

      {/* Legend */}
      <div className="absolute top-4 left-4 bg-zinc-900/90 backdrop-blur-sm border border-zinc-800 rounded-lg p-3 text-xs space-y-1.5">
        {Object.entries(layerColors)
          .filter(([key]) => key !== "default")
          .map(([layer, colors]) => (
            <div key={layer} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-sm border"
                style={{ backgroundColor: colors.bg, borderColor: colors.border }}
              />
              <span className="text-zinc-400 capitalize">{layer}</span>
            </div>
          ))}
      </div>

      {showMinimap && (
        <div
          ref={minimapRef}
          className="absolute bottom-4 left-4 w-32 h-24 bg-zinc-900/90 border border-zinc-800 rounded-lg overflow-hidden"
        />
      )}
    </div>
  );
}
