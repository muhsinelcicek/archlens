import { useState, useMemo, useCallback } from "react";
import { useStore, type ArchModel } from "../lib/store.js";
import { ArchGraph, type GraphNode, type GraphEdge } from "../components/ArchGraph.js";
import {
  ChevronRight, ArrowLeft, Files, Code2, GitBranch,
  Box, Braces, FunctionSquare, FileCode, Eye, Layers, Zap,
} from "lucide-react";

type ViewLevel = "system" | "module" | "file";

interface BreadcrumbItem {
  level: ViewLevel;
  id: string;
  label: string;
}

const layerMeta: Record<string, { color: string; label: string }> = {
  presentation: { color: "#10b981", label: "Presentation" },
  api: { color: "#3b82f6", label: "API" },
  application: { color: "#f59e0b", label: "Application" },
  domain: { color: "#8b5cf6", label: "Domain" },
  infrastructure: { color: "#ef4444", label: "Infrastructure" },
  config: { color: "#6b7280", label: "Config" },
  unknown: { color: "#52525b", label: "Other" },
};

const symbolIcons: Record<string, React.ReactNode> = {
  class: <Box className="h-3.5 w-3.5" />,
  function: <FunctionSquare className="h-3.5 w-3.5" />,
  interface: <Braces className="h-3.5 w-3.5" />,
  method: <FunctionSquare className="h-3.5 w-3.5" />,
  type_alias: <Braces className="h-3.5 w-3.5" />,
  enum: <Braces className="h-3.5 w-3.5" />,
  route: <GitBranch className="h-3.5 w-3.5" />,
  component: <Eye className="h-3.5 w-3.5" />,
};

function getSymbolsForModule(model: ArchModel, moduleName: string) {
  const entries = Object.entries(model.symbols) as [string, Record<string, unknown>][];
  return entries.filter(([, sym]) => {
    const fp = sym.filePath as string;
    return fp?.startsWith(moduleName + "/") || fp === moduleName;
  });
}

function getFilesForModule(model: ArchModel, moduleName: string): Map<string, Array<[string, Record<string, unknown>]>> {
  const symbols = getSymbolsForModule(model, moduleName);
  const fileMap = new Map<string, Array<[string, Record<string, unknown>]>>();

  for (const [uid, sym] of symbols) {
    const fp = sym.filePath as string;
    if (!fileMap.has(fp)) fileMap.set(fp, []);
    fileMap.get(fp)!.push([uid, sym]);
  }

  return fileMap;
}

function getSymbolsForFile(model: ArchModel, filePath: string) {
  const entries = Object.entries(model.symbols) as [string, Record<string, unknown>][];
  return entries.filter(([, sym]) => (sym.filePath as string) === filePath);
}

function getRelationsForSymbols(model: ArchModel, symbolUids: Set<string>) {
  return model.relations.filter(
    (r) => symbolUids.has(r.source) || symbolUids.has(r.target),
  );
}

// ─── System Level ────────────────────────────────────────────────────

function buildSystemGraph(model: ArchModel): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const layerOrder = ["presentation", "api", "application", "domain", "infrastructure", "config", "unknown"];
  for (const layer of layerOrder) {
    const mods = model.modules.filter((m) => m.layer === layer);
    if (mods.length === 0) continue;

    nodes.push({
      id: `layer-${layer}`,
      label: layerMeta[layer]?.label || layer,
      group: layer,
      type: "layer",
    });

    for (const mod of mods) {
      nodes.push({
        id: mod.name,
        label: mod.name,
        sublabel: `${mod.fileCount} files  |  ${mod.lineCount.toLocaleString()} LOC  |  ${mod.symbols.length} symbols`,
        group: layer,
        parent: `layer-${layer}`,
        type: "module",
      });
    }
  }

  const edgeSet = new Set<string>();
  for (const rel of model.relations) {
    if (rel.type !== "imports") continue;
    const srcMod = rel.source.split("/")[0];
    const tgtSym = model.symbols[rel.target] as Record<string, unknown> | undefined;
    if (!tgtSym) continue;
    const tgtMod = (tgtSym.filePath as string)?.split("/")[0];
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

// ─── Module Level ────────────────────────────────────────────────────

function buildModuleGraph(model: ArchModel, moduleName: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const fileMap = getFilesForModule(model, moduleName);
  const allUids = new Set<string>();

  // Group files by subdirectory
  const dirs = new Map<string, string[]>();
  for (const fp of fileMap.keys()) {
    const parts = fp.split("/");
    const dir = parts.length > 2 ? parts.slice(0, 2).join("/") : parts[0];
    if (!dirs.has(dir)) dirs.set(dir, []);
    dirs.get(dir)!.push(fp);
  }

  // If there are subdirectories, create parent nodes
  const hasSubdirs = dirs.size > 1;

  if (hasSubdirs) {
    for (const [dir] of dirs) {
      if (dir !== moduleName) {
        nodes.push({
          id: `dir-${dir}`,
          label: dir.replace(moduleName + "/", ""),
          group: "config",
          type: "directory",
        });
      }
    }
  }

  for (const [fp, symbols] of fileMap) {
    const fileName = fp.split("/").pop() || fp;
    const symbolCount = symbols.length;
    const kinds = [...new Set(symbols.map(([, s]) => s.kind as string))];

    const parts = fp.split("/");
    const dir = parts.length > 2 ? parts.slice(0, 2).join("/") : parts[0];
    const parent = hasSubdirs && dir !== moduleName ? `dir-${dir}` : undefined;

    // Determine node group based on content
    let group = "default";
    if (kinds.includes("class")) group = "domain";
    else if (kinds.includes("function") && symbols.some(([, s]) => (s.annotations as string[])?.some((a: string) => a.includes("app.")))) group = "api";
    else if (kinds.includes("component")) group = "presentation";
    else if (fileName.includes("model") || fileName.includes("schema")) group = "infrastructure";
    else if (fileName.includes("config") || fileName.includes("settings")) group = "config";

    nodes.push({
      id: fp,
      label: fileName,
      sublabel: `${symbolCount} symbols  |  ${kinds.join(", ")}`,
      group,
      type: "file",
      parent,
    });

    for (const [uid] of symbols) {
      allUids.add(uid);
    }
  }

  // Edges: file-to-file imports
  const fileEdgeSet = new Set<string>();
  for (const rel of model.relations) {
    if (rel.type !== "imports") continue;
    const srcFile = rel.source;
    const tgtSym = model.symbols[rel.target] as Record<string, unknown> | undefined;
    if (!tgtSym) continue;
    const tgtFile = tgtSym.filePath as string;

    if (fileMap.has(srcFile) && fileMap.has(tgtFile) && srcFile !== tgtFile) {
      const key = `${srcFile}->${tgtFile}`;
      if (!fileEdgeSet.has(key)) {
        fileEdgeSet.add(key);
        edges.push({ source: srcFile, target: tgtFile, type: "imports" });
      }
    }
  }

  // Edges: calls between files
  for (const rel of model.relations) {
    if (rel.type !== "calls") continue;
    if (allUids.has(rel.source) && allUids.has(rel.target)) {
      const srcSym = model.symbols[rel.source] as Record<string, unknown> | undefined;
      const tgtSym = model.symbols[rel.target] as Record<string, unknown> | undefined;
      if (srcSym && tgtSym) {
        const srcFile = srcSym.filePath as string;
        const tgtFile = tgtSym.filePath as string;
        if (fileMap.has(srcFile) && fileMap.has(tgtFile) && srcFile !== tgtFile) {
          const key = `call:${srcFile}->${tgtFile}`;
          if (!fileEdgeSet.has(key)) {
            fileEdgeSet.add(key);
            edges.push({ source: srcFile, target: tgtFile, type: "calls" });
          }
        }
      }
    }
  }

  return { nodes, edges };
}

// ─── File Level ──────────────────────────────────────────────────────

function buildFileGraph(model: ArchModel, filePath: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const symbols = getSymbolsForFile(model, filePath);

  for (const [uid, sym] of symbols) {
    const kind = sym.kind as string;
    const name = sym.name as string;
    const startLine = sym.startLine as number;
    const endLine = sym.endLine as number;
    const visibility = sym.visibility as string;

    let group = "default";
    if (kind === "class") group = "domain";
    else if (kind === "function") group = "api";
    else if (kind === "interface" || kind === "type_alias") group = "application";
    else if (kind === "method") group = "presentation";
    else if (kind === "enum") group = "config";

    nodes.push({
      id: uid,
      label: name,
      sublabel: `${kind}  |  L${startLine}-${endLine}  |  ${visibility}`,
      group,
      type: kind,
    });
  }

  const symbolUids = new Set(symbols.map(([uid]) => uid));
  const rels = getRelationsForSymbols(model, symbolUids);

  for (const rel of rels) {
    if (symbolUids.has(rel.source) && symbolUids.has(rel.target)) {
      edges.push({
        source: rel.source,
        target: rel.target,
        type: rel.type,
        label: rel.type,
      });
    }
  }

  return { nodes, edges };
}

// ─── Detail Panel ────────────────────────────────────────────────────

function DetailPanel({
  model,
  selectedId,
  level,
  onDrillDown,
}: {
  model: ArchModel;
  selectedId: string;
  level: ViewLevel;
  onDrillDown: (id: string, label: string, level: ViewLevel) => void;
}) {
  if (level === "system") {
    const mod = model.modules.find((m) => m.name === selectedId);
    if (!mod) return null;
    const config = layerMeta[mod.layer] || layerMeta.unknown;
    const fileMap = getFilesForModule(model, mod.name);
    const files = [...fileMap.keys()].sort();

    return (
      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: config.color }} />
            <h3 className="font-mono font-bold text-lg" style={{ color: config.color }}>{mod.name}/</h3>
          </div>
          <span className="text-xs rounded-full px-2 py-0.5 mt-1 inline-block" style={{ backgroundColor: `${config.color}20`, color: config.color }}>
            {config.label} Layer
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-zinc-800/50 p-2">
            <div className="text-lg font-bold text-zinc-200">{mod.fileCount}</div>
            <div className="text-[10px] text-zinc-600">files</div>
          </div>
          <div className="rounded-lg bg-zinc-800/50 p-2">
            <div className="text-lg font-bold text-zinc-200">{mod.symbols.length}</div>
            <div className="text-[10px] text-zinc-600">symbols</div>
          </div>
          <div className="rounded-lg bg-zinc-800/50 p-2">
            <div className="text-lg font-bold text-zinc-200">{mod.lineCount.toLocaleString()}</div>
            <div className="text-[10px] text-zinc-600">lines</div>
          </div>
        </div>

        <button
          onClick={() => onDrillDown(mod.name, mod.name, "module")}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-archlens-500/10 border border-archlens-500/30 text-archlens-400 py-2 text-sm font-medium hover:bg-archlens-500/20 transition-colors"
        >
          <Eye className="h-4 w-4" />
          Explore Module
        </button>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Files ({files.length})</h4>
          <div className="space-y-1 max-h-[300px] overflow-y-auto">
            {files.map((fp) => {
              const symbolCount = fileMap.get(fp)?.length || 0;
              const fileName = fp.split("/").pop();
              return (
                <button
                  key={fp}
                  onClick={() => onDrillDown(fp, fileName || fp, "file")}
                  className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-zinc-800/50 transition-colors group"
                >
                  <FileCode className="h-3.5 w-3.5 text-zinc-600 group-hover:text-archlens-400" />
                  <span className="text-xs font-mono text-zinc-400 group-hover:text-zinc-200 truncate flex-1">{fp}</span>
                  <span className="text-[10px] text-zinc-600">{symbolCount}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (level === "module") {
    // File selected within module view
    const symbols = getSymbolsForFile(model, selectedId);
    const fileName = selectedId.split("/").pop();

    return (
      <div className="space-y-4">
        <div>
          <h3 className="font-mono font-bold text-sm text-zinc-200">{fileName}</h3>
          <p className="text-[11px] text-zinc-600 font-mono mt-0.5">{selectedId}</p>
        </div>

        <button
          onClick={() => onDrillDown(selectedId, fileName || selectedId, "file")}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-archlens-500/10 border border-archlens-500/30 text-archlens-400 py-2 text-sm font-medium hover:bg-archlens-500/20 transition-colors"
        >
          <Eye className="h-4 w-4" />
          Explore File Symbols
        </button>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Symbols ({symbols.length})</h4>
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {symbols.map(([uid, sym]) => {
              const kind = sym.kind as string;
              const name = sym.name as string;
              const vis = sym.visibility as string;
              return (
                <div key={uid} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-zinc-800/30">
                  <span className="text-zinc-500">{symbolIcons[kind] || <Code2 className="h-3.5 w-3.5" />}</span>
                  <span className="text-xs font-mono text-zinc-300 flex-1 truncate">{name}</span>
                  <span className="text-[10px] text-zinc-600">{kind}</span>
                  {vis === "private" && <span className="text-[9px] text-red-500/60">priv</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // File level — show symbol details
  const sym = model.symbols[selectedId] as Record<string, unknown> | undefined;
  if (!sym) return null;

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center gap-2">
          {symbolIcons[sym.kind as string] || <Code2 className="h-4 w-4 text-zinc-400" />}
          <h3 className="font-mono font-bold text-sm text-zinc-200">{sym.name as string}</h3>
        </div>
        <div className="flex gap-2 mt-1.5">
          <span className="text-[10px] rounded-full px-2 py-0.5 bg-zinc-800 text-zinc-400">{sym.kind as string}</span>
          <span className="text-[10px] rounded-full px-2 py-0.5 bg-zinc-800 text-zinc-400">{sym.visibility as string}</span>
          <span className="text-[10px] rounded-full px-2 py-0.5 bg-zinc-800 text-zinc-400">L{sym.startLine as number}-{sym.endLine as number}</span>
        </div>
      </div>

      {(sym.extends as string[])?.length > 0 && (
        <div>
          <h4 className="text-[10px] text-zinc-600 uppercase mb-1">Extends</h4>
          {(sym.extends as string[]).map((e: string) => (
            <span key={e} className="text-xs font-mono text-amber-400">{e}</span>
          ))}
        </div>
      )}

      {(sym.params as Array<{ name: string; type?: string }>)?.length > 0 && (
        <div>
          <h4 className="text-[10px] text-zinc-600 uppercase mb-1">Parameters</h4>
          <div className="space-y-0.5">
            {(sym.params as Array<{ name: string; type?: string }>).map((p) => (
              <div key={p.name} className="text-xs font-mono">
                <span className="text-zinc-300">{p.name}</span>
                {p.type && <span className="text-zinc-600">: {p.type}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {sym.returnType && (
        <div>
          <h4 className="text-[10px] text-zinc-600 uppercase mb-1">Returns</h4>
          <span className="text-xs font-mono text-blue-400">{sym.returnType as string}</span>
        </div>
      )}
    </div>
  );
}

// ─── Main Architecture View ──────────────────────────────────────────

export function ArchitectureView() {
  const { model } = useStore();
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
    { level: "system", id: "root", label: "System" },
  ]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const currentLevel = breadcrumbs[breadcrumbs.length - 1];

  const drillDown = useCallback((id: string, label: string, level: ViewLevel) => {
    setBreadcrumbs((prev) => [...prev, { level, id, label }]);
    setSelectedNode(null);
  }, []);

  const navigateTo = useCallback((index: number) => {
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
    setSelectedNode(null);
  }, []);

  const goBack = useCallback(() => {
    if (breadcrumbs.length > 1) {
      setBreadcrumbs((prev) => prev.slice(0, -1));
      setSelectedNode(null);
    }
  }, [breadcrumbs.length]);

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNode(nodeId);
  }, []);

  const handleNodeDoubleClick = useCallback(
    (nodeId: string) => {
      if (!model) return;
      if (currentLevel.level === "system") {
        const mod = model.modules.find((m) => m.name === nodeId);
        if (mod) drillDown(nodeId, nodeId, "module");
      } else if (currentLevel.level === "module") {
        const sym = model.symbols[nodeId] as Record<string, unknown> | undefined;
        if (sym || nodeId.includes("/")) {
          drillDown(nodeId, nodeId.split("/").pop() || nodeId, "file");
        }
      }
    },
    [model, currentLevel.level, drillDown],
  );

  const graphData = useMemo(() => {
    if (!model) return { nodes: [], edges: [] };

    switch (currentLevel.level) {
      case "system":
        return buildSystemGraph(model);
      case "module":
        return buildModuleGraph(model, currentLevel.id);
      case "file":
        return buildFileGraph(model, currentLevel.id);
      default:
        return { nodes: [], edges: [] };
    }
  }, [model, currentLevel]);

  if (!model) return null;

  const levelLabels: Record<ViewLevel, string> = {
    system: "System Architecture — click a module to inspect, double-click to drill down",
    module: `Module: ${currentLevel.id} — files & internal dependencies`,
    file: `File: ${currentLevel.id} — symbols & relationships`,
  };

  return (
    <div className="flex h-full">
      {/* Main Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {breadcrumbs.length > 1 && (
                <button
                  onClick={goBack}
                  className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              <div>
                <h2 className="text-lg font-bold">System Architecture</h2>
                <p className="text-xs text-zinc-500 mt-0.5">{levelLabels[currentLevel.level]}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-zinc-600">{graphData.nodes.length} nodes</span>
              <span className="text-zinc-700">|</span>
              <span className="text-zinc-600">{graphData.edges.length} edges</span>
            </div>
          </div>

          {/* Breadcrumbs */}
          <div className="flex items-center gap-1 mt-3">
            {breadcrumbs.map((crumb, i) => (
              <div key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3 text-zinc-700" />}
                <button
                  onClick={() => navigateTo(i)}
                  className={`text-xs font-mono px-2 py-0.5 rounded transition-colors ${
                    i === breadcrumbs.length - 1
                      ? "bg-archlens-500/10 text-archlens-400 border border-archlens-500/20"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                  }`}
                >
                  {crumb.label}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Graph */}
        <div className="flex-1">
          <ArchGraph
            nodes={graphData.nodes}
            edges={graphData.edges}
            layout={currentLevel.level === "file" ? "cola" : "dagre"}
            direction={currentLevel.level === "system" ? "TB" : "LR"}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={handleNodeDoubleClick}
            className="h-full"
          />
        </div>

        {/* Business Flow Panel — bottom strip */}
        {model.dataFlows.length > 0 && currentLevel.level === "system" && (
          <BusinessFlowPanel model={model} />
        )}
      </div>

      {/* Detail Sidebar */}
      <aside className="w-80 border-l border-zinc-800/50 bg-zinc-950 overflow-y-auto">
        <div className="p-4">
          {selectedNode ? (
            <DetailPanel
              model={model}
              selectedId={selectedNode}
              level={currentLevel.level}
              onDrillDown={drillDown}
            />
          ) : (
            <div className="text-center py-12">
              <Layers className="h-8 w-8 text-zinc-800 mx-auto mb-3" />
              <p className="text-xs text-zinc-600">Click a node to see details</p>
              <p className="text-[10px] text-zinc-700 mt-1">Double-click to drill down</p>
            </div>
          )}

          {/* API Endpoints Summary in sidebar */}
          {currentLevel.level === "system" && model.apiEndpoints.length > 0 && (
            <div className="mt-6 pt-4 border-t border-zinc-800/50">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                API Endpoints ({model.apiEndpoints.length})
              </h4>
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                {model.apiEndpoints.slice(0, 20).map((ep, i) => {
                  const methodColors: Record<string, string> = {
                    GET: "text-blue-400", POST: "text-emerald-400",
                    PUT: "text-amber-400", DELETE: "text-red-400",
                  };
                  return (
                    <div key={i} className="flex items-center gap-2 text-[11px] font-mono py-0.5">
                      <span className={`w-8 font-bold ${methodColors[ep.method] || "text-zinc-400"}`}>
                        {ep.method}
                      </span>
                      <span className="text-zinc-400 truncate">{ep.path}</span>
                    </div>
                  );
                })}
                {model.apiEndpoints.length > 20 && (
                  <p className="text-[10px] text-zinc-600 mt-1">+{model.apiEndpoints.length - 20} more</p>
                )}
              </div>
            </div>
          )}

          {/* DB Entities Summary in sidebar */}
          {currentLevel.level === "system" && model.dbEntities.length > 0 && (
            <div className="mt-4 pt-4 border-t border-zinc-800/50">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                Database Entities ({model.dbEntities.length})
              </h4>
              <div className="space-y-1">
                {model.dbEntities.map((entity) => (
                  <div key={entity.name} className="flex items-center justify-between text-[11px] font-mono py-0.5">
                    <span className="text-emerald-400">{entity.name}</span>
                    <span className="text-zinc-600">{entity.columns.length} cols</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

// ─── Business Flow Panel ─────────────────────────────────────────────

function BusinessFlowPanel({ model }: { model: ArchModel }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border-t border-zinc-800/50 bg-zinc-900/30">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-6 py-2 text-left hover:bg-zinc-800/30 transition-colors"
      >
        <Zap className="h-3.5 w-3.5 text-amber-500" />
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Business Flows ({model.dataFlows.length})
        </span>
        <ChevronRight className={`h-3 w-3 text-zinc-600 ml-auto transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>

      {expanded && (
        <div className="px-6 pb-4 space-y-3">
          {model.dataFlows.map((flow) => (
            <div key={flow.id} className="rounded-lg border border-zinc-800/50 bg-zinc-900/50 p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-zinc-200">{flow.name}</span>
                {flow.description && (
                  <span className="text-[10px] text-zinc-600">— {flow.description}</span>
                )}
              </div>
              {/* Flow steps as a horizontal pipeline */}
              <div className="flex items-center gap-0 overflow-x-auto pb-1">
                {flow.steps.map((step, i) => (
                  <div key={i} className="flex items-center gap-0 flex-shrink-0">
                    {/* Source node */}
                    {i === 0 && (
                      <div className="rounded-md bg-zinc-800 border border-zinc-700 px-2.5 py-1 text-[11px] font-mono text-zinc-300">
                        {step.source}
                      </div>
                    )}
                    {/* Arrow with action label */}
                    <div className="flex flex-col items-center mx-1">
                      <span className="text-[9px] text-zinc-600 whitespace-nowrap mb-0.5">{step.action}</span>
                      <div className="flex items-center">
                        <div className="w-8 h-px bg-archlens-500/50" />
                        <div className="w-0 h-0 border-l-[5px] border-l-archlens-500/50 border-y-[3px] border-y-transparent" />
                      </div>
                      {step.dataType && (
                        <span className="text-[8px] text-zinc-700 mt-0.5">[{step.dataType}]</span>
                      )}
                    </div>
                    {/* Target node */}
                    <div className="rounded-md bg-zinc-800 border border-zinc-700 px-2.5 py-1 text-[11px] font-mono text-zinc-300">
                      {step.target}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

