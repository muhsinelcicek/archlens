import { useState } from "react";
import { useParams } from "react-router-dom";
import { useStore, type ArchModel } from "../lib/store.js";
import { ArchGraph, type GraphNode, type GraphEdge } from "../components/ArchGraph.js";
import { ERDiagram } from "../components/ERDiagram.js";
import { TechRadar } from "../components/TechRadar.js";
import { Download, Info } from "lucide-react";

const diagramLabels: Record<string, { title: string; description: string }> = {
  "system-architecture": {
    title: "System Architecture",
    description: "C4-style layered architecture view showing modules grouped by their role (presentation, API, domain, infrastructure).",
  },
  "er-diagram": {
    title: "Entity-Relationship Diagram",
    description: "Database schema extracted from ORM models (SQLAlchemy, Prisma, TypeORM). Shows tables, columns, types, and primary keys.",
  },
  "data-flow": {
    title: "Data Flow Diagram",
    description: "Traces how data moves through the system — from user interaction through API calls to database operations.",
  },
  "dependency-graph": {
    title: "Dependency Graph",
    description: "Module-level dependency map showing import relationships between packages and directories.",
  },
  "api-map": {
    title: "API Endpoint Map",
    description: "All REST/GraphQL endpoints auto-discovered from route decorators and handler registrations.",
  },
  "tech-radar": {
    title: "Technology Radar",
    description: "Full technology stack extracted from package manifests, with categorization by type.",
  },
};

function buildArchitectureGraph(model: ArchModel): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // Layer parent nodes
  const layerOrder = ["presentation", "api", "application", "domain", "infrastructure", "config"];
  for (const layer of layerOrder) {
    const mods = model.modules.filter((m) => m.layer === layer);
    if (mods.length === 0) continue;

    nodes.push({
      id: `layer-${layer}`,
      label: layer.charAt(0).toUpperCase() + layer.slice(1) + " Layer",
      group: layer,
      type: "layer",
    });

    for (const mod of mods) {
      nodes.push({
        id: mod.name,
        label: mod.name,
        sublabel: `${mod.fileCount} files / ${mod.lineCount.toLocaleString()} lines`,
        group: layer,
        parent: `layer-${layer}`,
        type: "module",
      });
    }
  }

  // Unknown layer modules (no parent)
  for (const mod of model.modules.filter((m) => m.layer === "unknown")) {
    nodes.push({
      id: mod.name,
      label: mod.name,
      sublabel: `${mod.fileCount} files / ${mod.lineCount.toLocaleString()} lines`,
      group: "default",
      type: "module",
    });
  }

  // Edges from relations
  const edgeSet = new Set<string>();
  for (const rel of model.relations) {
    if (rel.type !== "imports") continue;
    const srcParts = rel.source.split("/");
    const srcMod = srcParts.length > 1 ? srcParts[0] : "root";

    const tgtSymbol = model.symbols[rel.target];
    if (!tgtSymbol) continue;
    const tgtParts = (tgtSymbol as { filePath?: string }).filePath?.split("/") || [];
    const tgtMod = tgtParts.length > 1 ? tgtParts[0] : "root";

    if (srcMod && tgtMod && srcMod !== tgtMod) {
      const key = `${srcMod}->${tgtMod}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push({ source: srcMod, target: tgtMod, type: "imports" });
      }
    }
  }

  return { nodes, edges };
}

function buildDependencyGraph(model: ArchModel): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = model.modules.map((mod) => ({
    id: mod.name,
    label: mod.name,
    sublabel: `${mod.language} / ${mod.fileCount} files`,
    group: mod.layer,
    type: "module",
  }));

  const edges: GraphEdge[] = [];
  const edgeSet = new Set<string>();

  for (const rel of model.relations) {
    if (rel.type !== "imports") continue;
    const srcParts = rel.source.split("/");
    const srcMod = srcParts.length > 1 ? srcParts[0] : "root";

    const tgtSymbol = model.symbols[rel.target];
    if (!tgtSymbol) continue;
    const tgtParts = (tgtSymbol as { filePath?: string }).filePath?.split("/") || [];
    const tgtMod = tgtParts.length > 1 ? tgtParts[0] : "root";

    if (srcMod && tgtMod && srcMod !== tgtMod) {
      const key = `${srcMod}->${tgtMod}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push({ source: srcMod, target: tgtMod, type: "imports", label: "imports" });
      }
    }
  }

  return { nodes, edges };
}

function buildDataFlowGraph(model: ArchModel): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeSet = new Set<string>();

  for (const flow of model.dataFlows) {
    for (const step of flow.steps) {
      if (!nodeSet.has(step.source)) {
        nodeSet.add(step.source);
        nodes.push({
          id: step.source,
          label: step.source,
          group: step.source === "User" ? "presentation" : "default",
        });
      }
      if (!nodeSet.has(step.target)) {
        nodeSet.add(step.target);
        const mod = model.modules.find((m) => m.name === step.target);
        nodes.push({
          id: step.target,
          label: step.target,
          group: mod?.layer || "default",
        });
      }
      edges.push({
        source: step.source,
        target: step.target,
        label: step.action,
        type: "calls",
      });
    }
  }

  return { nodes, edges };
}

export function DiagramView() {
  const { type } = useParams<{ type: string }>();
  const { model, diagrams } = useStore();
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  if (!model || !type) return null;

  const info = diagramLabels[type] || { title: type, description: "" };

  // Download mermaid as .mmd (still available from core export)
  const handleDownloadMermaid = () => {
    const mmd = diagrams[type];
    if (!mmd) return;
    const blob = new Blob([mmd], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${type}.mmd`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderDiagram = () => {
    switch (type) {
      case "system-architecture": {
        const { nodes, edges } = buildArchitectureGraph(model);
        return (
          <ArchGraph
            nodes={nodes}
            edges={edges}
            layout="dagre"
            direction="TB"
            onNodeClick={setSelectedNode}
            className="h-[calc(100vh-220px)]"
          />
        );
      }

      case "dependency-graph": {
        const { nodes, edges } = buildDependencyGraph(model);
        return (
          <ArchGraph
            nodes={nodes}
            edges={edges}
            layout="cola"
            onNodeClick={setSelectedNode}
            className="h-[calc(100vh-220px)]"
          />
        );
      }

      case "data-flow": {
        const { nodes, edges } = buildDataFlowGraph(model);
        return (
          <ArchGraph
            nodes={nodes}
            edges={edges}
            layout="dagre"
            direction="LR"
            onNodeClick={setSelectedNode}
            className="h-[calc(100vh-220px)]"
          />
        );
      }

      case "er-diagram":
        return (
          <ERDiagram
            entities={model.dbEntities}
            className="h-[calc(100vh-220px)]"
          />
        );

      case "tech-radar":
        return (
          <TechRadar
            entries={model.techRadar}
            className="h-[calc(100vh-220px)]"
          />
        );

      case "api-map":
        return null; // Handled by ApiMapView

      default:
        return <div className="text-[#5a5a70] p-8">Unknown diagram type: {type}</div>;
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold">{info.title}</h2>
          <p className="text-sm text-[#5a5a70] mt-1 flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5" />
            {info.description}
          </p>
        </div>
        <div className="flex gap-2">
          {diagrams[type] && (
            <button
              onClick={handleDownloadMermaid}
              className="flex items-center gap-2 px-3 py-1.5 bg-elevated hover:bg-zinc-700 border border-zinc-700 rounded-lg text-sm transition-colors"
            >
              <Download className="h-4 w-4" />
              Export .mmd
            </button>
          )}
        </div>
      </div>

      {/* Selected Node Info */}
      {selectedNode && (
        <div className="rounded-lg border border-archlens-500/30 bg-archlens-500/5 px-4 py-2 text-sm">
          <span className="text-[#8888a0]">Selected:</span>{" "}
          <span className="font-mono text-archlens-400">{selectedNode}</span>
          <button
            onClick={() => setSelectedNode(null)}
            className="ml-3 text-[#5a5a70] hover:text-[#8888a0]"
          >
            Clear
          </button>
        </div>
      )}

      {/* Diagram */}
      <div className="rounded-xl border border-[#2a2a3a] overflow-hidden">
        {renderDiagram()}
      </div>
    </div>
  );
}
