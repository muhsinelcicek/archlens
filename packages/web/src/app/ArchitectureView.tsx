import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useStore, type ArchModel } from "../lib/store.js";
import { SigmaGraph, type SigmaGraphHandle, type GraphNode, type GraphEdge, type ImpactResult } from "../components/SigmaGraph.js";
import { DependencyMatrix } from "../components/DependencyMatrix.js";
import { FeatureTracer } from "../components/FeatureTracer.js";
import {
  ChevronRight, ChevronDown, ArrowLeft, Search, Code2, GitBranch,
  Box, Braces, FunctionSquare, FileCode, Eye, Layers, Zap,
  Target, AlertTriangle, CheckCircle2, Globe, Database, Cpu,
  Filter, Grid3x3, File, Hash, ArrowUpRight,
} from "lucide-react";

type ViewLevel = "system" | "module" | "file";
interface Breadcrumb { level: ViewLevel; id: string; label: string }

const layerMeta: Record<string, { color: string; label: string }> = {
  presentation: { color: "#34d399", label: "Presentation" },
  api: { color: "#60a5fa", label: "API" },
  application: { color: "#fbbf24", label: "Application" },
  domain: { color: "#a78bfa", label: "Domain" },
  infrastructure: { color: "#f87171", label: "Infrastructure" },
  config: { color: "#94a3b8", label: "Config" },
  unknown: { color: "#6b7280", label: "Other" },
};

// ─── Build graphs ────────────────────────────────────────────────────

function buildSystemGraph(model: ArchModel): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  for (const mod of model.modules) {
    nodes.push({
      id: mod.name,
      label: mod.name,
      sublabel: `${mod.fileCount}f · ${mod.lineCount.toLocaleString()}L`,
      group: mod.layer,
      type: "module",
    });
  }

  // Build file→module lookup
  const f2m = new Map<string, string>();
  const u2m = new Map<string, string>();
  for (const mod of model.modules) {
    for (const uid of mod.symbols) {
      u2m.set(uid, mod.name);
      const sym = model.symbols[uid] as Record<string, unknown> | undefined;
      if (sym) f2m.set(sym.filePath as string, mod.name);
    }
  }

  const edgeMap = new Map<string, { count: number; types: Record<string, number> }>();
  for (const rel of model.relations) {
    if (rel.type === "composes") continue;
    const srcMod = f2m.get(rel.source) || u2m.get(rel.source);
    const tgtSym = model.symbols[rel.target] as Record<string, unknown> | undefined;
    let tgtMod = tgtSym ? f2m.get(tgtSym.filePath as string) : undefined;
    if (!tgtMod) tgtMod = u2m.get(rel.target);
    if (!tgtMod && typeof rel.target === "string") {
      for (const [uid, sym] of Object.entries(model.symbols) as Array<[string, Record<string, unknown>]>) {
        if (sym.name === rel.target) { tgtMod = f2m.get(sym.filePath as string); if (tgtMod) break; }
      }
    }
    if (!srcMod || !tgtMod || srcMod === tgtMod) continue;
    const key = `${srcMod}→${tgtMod}`;
    if (!edgeMap.has(key)) edgeMap.set(key, { count: 0, types: {} });
    const e = edgeMap.get(key)!;
    e.count++;
    e.types[rel.type] = (e.types[rel.type] || 0) + 1;
  }

  for (const [key, data] of edgeMap) {
    const [src, tgt] = key.split("→");
    const mainType = Object.entries(data.types).sort((a, b) => b[1] - a[1])[0]?.[0] || "imports";
    edges.push({ source: src, target: tgt, type: mainType, weight: data.count });
  }

  return { nodes, edges };
}

function buildModuleGraph(model: ArchModel, moduleName: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const mod = model.modules.find((m) => m.name === moduleName);
  if (!mod) return { nodes, edges };

  const files = new Map<string, number>();
  for (const uid of mod.symbols) {
    const sym = model.symbols[uid] as Record<string, unknown> | undefined;
    if (sym) {
      const fp = sym.filePath as string;
      files.set(fp, (files.get(fp) || 0) + 1);
    }
  }

  for (const [fp, count] of files) {
    nodes.push({ id: fp, label: fp.split("/").pop() || fp, sublabel: `${count} symbols`, group: "default", type: "file" });
  }

  const edgeSet = new Set<string>();
  for (const rel of model.relations) {
    if (rel.type !== "imports" && rel.type !== "calls") continue;
    const tgtSym = model.symbols[rel.target] as Record<string, unknown> | undefined;
    if (!tgtSym) continue;
    if (files.has(rel.source) && files.has(tgtSym.filePath as string) && rel.source !== tgtSym.filePath) {
      const key = `${rel.source}→${tgtSym.filePath}`;
      if (!edgeSet.has(key)) { edgeSet.add(key); edges.push({ source: rel.source, target: tgtSym.filePath as string, type: rel.type }); }
    }
  }

  return { nodes, edges };
}

// ─── Code Panel ──────────────────────────────────────────────────────

function CodePanel({ model, selectedId, level }: { model: ArchModel; selectedId: string; level: ViewLevel }) {
  if (level === "system") {
    const mod = model.modules.find((m) => m.name === selectedId);
    if (!mod) return null;
    const color = layerMeta[mod.layer]?.color || "#6b7280";

    // Find files and symbols
    const fileSymbols = new Map<string, Array<{ uid: string; name: string; kind: string; line: number }>>();
    for (const uid of mod.symbols) {
      const sym = model.symbols[uid] as Record<string, unknown> | undefined;
      if (!sym) continue;
      const fp = sym.filePath as string;
      if (!fileSymbols.has(fp)) fileSymbols.set(fp, []);
      fileSymbols.get(fp)!.push({
        uid,
        name: sym.name as string,
        kind: sym.kind as string,
        line: (sym.startLine as number) || 0,
      });
    }

    // Dependencies
    const f2m = new Map<string, string>();
    const u2m = new Map<string, string>();
    for (const m of model.modules) {
      for (const uid of m.symbols) {
        u2m.set(uid, m.name);
        const s = model.symbols[uid] as Record<string, unknown> | undefined;
        if (s) f2m.set(s.filePath as string, m.name);
      }
    }

    let ca = 0, ce = 0;
    const dependsOn = new Map<string, number>();
    const dependedBy = new Map<string, number>();
    for (const rel of model.relations) {
      if (rel.type === "composes") continue;
      const srcMod = f2m.get(rel.source) || u2m.get(rel.source);
      const tgtSym = model.symbols[rel.target] as Record<string, unknown> | undefined;
      let tgtMod = tgtSym ? f2m.get(tgtSym.filePath as string) : u2m.get(rel.target);
      if (!srcMod || !tgtMod || srcMod === tgtMod) continue;
      if (tgtMod === mod.name) { ca++; dependedBy.set(srcMod, (dependedBy.get(srcMod) || 0) + 1); }
      if (srcMod === mod.name) { ce++; dependsOn.set(tgtMod, (dependsOn.get(tgtMod) || 0) + 1); }
    }
    const instability = ca + ce > 0 ? (ce / (ca + ce)).toFixed(2) : "0";

    // API endpoints
    const moduleFiles = new Set<string>();
    for (const uid of mod.symbols) {
      const s = model.symbols[uid] as Record<string, unknown> | undefined;
      if (s) moduleFiles.add(s.filePath as string);
    }
    const endpoints = model.apiEndpoints.filter((ep) => moduleFiles.has(ep.filePath));

    return (
      <div className="h-full flex flex-col">
        {/* Module Header */}
        <div className="p-4 border-b border-[#1e1e2a]">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}60` }} />
            <h3 className="font-mono font-bold text-lg" style={{ color }}>{mod.name}/</h3>
          </div>
          <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${color}20`, color }}>{layerMeta[mod.layer]?.label}</span>

          {/* Metrics row */}
          <div className="grid grid-cols-4 gap-2 mt-3">
            {[
              { v: mod.fileCount, l: "files" },
              { v: mod.symbols.length, l: "symbols" },
              { v: mod.lineCount.toLocaleString(), l: "lines" },
              { v: instability, l: "instab.", c: Number(instability) > 0.7 ? "#f87171" : Number(instability) > 0.4 ? "#fbbf24" : "#34d399" },
            ].map((m) => (
              <div key={m.l} className="bg-elevated rounded-lg p-2 text-center">
                <div className="text-sm font-bold" style={{ color: m.c || "#e4e4ed" }}>{m.v}</div>
                <div className="text-[8px] text-[#5a5a70] uppercase">{m.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Dependencies */}
        <div className="px-4 py-3 border-b border-[#1e1e2a]">
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="text-[9px] uppercase font-semibold text-[#5a5a70] mb-1 flex items-center gap-1"><ArrowUpRight className="h-3 w-3" /> Depends On ({dependsOn.size})</div>
              {dependsOn.size === 0 ? <span className="text-[10px] text-[#5a5a70]">none</span> :
                [...dependsOn.entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => (
                  <div key={n} className="text-[10px] font-mono text-[#8888a0]">→ {n} <span className="text-[#5a5a70]">×{c}</span></div>
                ))}
            </div>
            <div className="flex-1">
              <div className="text-[9px] uppercase font-semibold text-[#5a5a70] mb-1">Depended By ({dependedBy.size})</div>
              {dependedBy.size === 0 ? <span className="text-[10px] text-[#5a5a70]">none</span> :
                [...dependedBy.entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => (
                  <div key={n} className="text-[10px] font-mono text-[#8888a0]">← {n} <span className="text-[#5a5a70]">×{c}</span></div>
                ))}
            </div>
          </div>
        </div>

        {/* API Endpoints */}
        {endpoints.length > 0 && (
          <div className="px-4 py-2 border-b border-[#1e1e2a]">
            <div className="text-[9px] uppercase font-semibold text-[#5a5a70] mb-1">API Endpoints ({endpoints.length})</div>
            {endpoints.slice(0, 8).map((ep, i) => {
              const mc: Record<string, string> = { GET: "#60a5fa", POST: "#34d399", PUT: "#fbbf24", DELETE: "#f87171" };
              return <div key={i} className="text-[10px] font-mono"><span style={{ color: mc[ep.method] || "#8888a0" }}>{ep.method}</span> <span className="text-[#8888a0]">{ep.path}</span></div>;
            })}
          </div>
        )}

        {/* Files & Code Structure */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          <div className="text-[9px] uppercase font-semibold text-[#5a5a70] px-2 mb-2">Code Structure ({fileSymbols.size} files)</div>
          {[...fileSymbols.entries()].slice(0, 20).map(([fp, symbols]) => (
            <div key={fp} className="mb-2">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-elevated/50">
                <File className="h-3 w-3 text-[#5a5a70]" />
                <span className="text-[10px] font-mono text-[#8888a0] truncate">{fp.split("/").pop()}</span>
                <span className="ml-auto text-[9px] text-[#5a5a70]">{symbols.length}</span>
              </div>
              <div className="ml-4 mt-0.5 space-y-0">
                {symbols.sort((a, b) => a.line - b.line).slice(0, 15).map((sym) => {
                  const kindColors: Record<string, string> = {
                    class: "#fbbf24", function: "#34d399", method: "#34d399",
                    interface: "#a78bfa", enum: "#f59e0b", property: "#64748b",
                  };
                  const kindIcons: Record<string, React.ReactNode> = {
                    class: <Box className="h-2.5 w-2.5" />, function: <FunctionSquare className="h-2.5 w-2.5" />,
                    method: <FunctionSquare className="h-2.5 w-2.5" />, interface: <Braces className="h-2.5 w-2.5" />,
                    enum: <Hash className="h-2.5 w-2.5" />, property: <Code2 className="h-2.5 w-2.5" />,
                  };
                  return (
                    <div key={sym.uid} className="flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-hover text-[10px] font-mono group">
                      <span style={{ color: kindColors[sym.kind] || "#5a5a70" }}>{kindIcons[sym.kind] || <Code2 className="h-2.5 w-2.5" />}</span>
                      <span className="text-[#8888a0] group-hover:text-[#e4e4ed] truncate">{sym.name}</span>
                      <span className="ml-auto text-[8px] text-[#5a5a70]">L{sym.line}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // File selected — show code
  if (selectedId.includes("/") && selectedId.includes(".")) {
    return <FileCodeViewer filePath={selectedId} model={model} />;
  }

  return (
    <div className="p-4 text-[#5a5a70] text-xs">
      <h3 className="font-mono font-bold text-sm text-[#e4e4ed] mb-2">{selectedId.split("/").pop()}</h3>
      <p className="font-mono text-[10px]">{selectedId}</p>
    </div>
  );
}

// ─── File Code Viewer ────────────────────────────────────────────────

function FileCodeViewer({ filePath, model }: { filePath: string; model: ArchModel }) {
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/file?path=${encodeURIComponent(filePath)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.text();
      })
      .then((text) => { setCode(text); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, [filePath]);

  // Find symbols in this file for annotations
  const fileSymbols = Object.entries(model.symbols)
    .filter(([, s]) => (s as Record<string, unknown>).filePath === filePath)
    .map(([uid, s]) => {
      const sym = s as Record<string, unknown>;
      return { uid, name: sym.name as string, kind: sym.kind as string, startLine: (sym.startLine as number) || 0 };
    })
    .sort((a, b) => a.startLine - b.startLine);

  const ext = filePath.split(".").pop() || "";
  const langNames: Record<string, string> = { cs: "C#", ts: "TypeScript", tsx: "TSX", py: "Python", go: "Go", java: "Java", swift: "Swift", rs: "Rust", js: "JavaScript" };
  const langColors: Record<string, string> = { cs: "#178600", ts: "#3178c6", tsx: "#3178c6", py: "#3572A5", go: "#00ADD8", java: "#b07219", swift: "#F05138", rs: "#dea584", js: "#f0db4f" };

  // Build line→symbol map for annotations
  const lineSymbols = new Map<number, { name: string; kind: string }>();
  for (const sym of fileSymbols) {
    const line = sym.startLine as number;
    if (line) lineSymbols.set(line, { name: sym.name as string, kind: sym.kind as string });
  }

  const kindColors: Record<string, string> = {
    class: "#fbbf24", function: "#34d399", method: "#34d399", interface: "#a78bfa", enum: "#f59e0b", property: "#64748b",
  };

  return (
    <div className="h-full flex flex-col">
      {/* File Header */}
      <div className="px-4 py-3 border-b border-[#1e1e2a] flex items-center justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileCode className="h-4 w-4 flex-shrink-0" style={{ color: langColors[ext] || "#5a5a70" }} />
            <h3 className="font-mono font-bold text-sm text-[#e4e4ed] truncate">{filePath.split("/").pop()}</h3>
          </div>
          <p className="font-mono text-[9px] text-[#5a5a70] mt-0.5 truncate">{filePath}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: `${langColors[ext] || "#5a5a70"}20`, color: langColors[ext] || "#5a5a70" }}>
            {langNames[ext] || ext}
          </span>
          {code && <span className="text-[9px] text-[#5a5a70]">{code.split("\n").length}L</span>}
        </div>
      </div>

      {/* Symbols bar */}
      {fileSymbols.length > 0 && (
        <div className="px-3 py-2 border-b border-[#1e1e2a] flex flex-wrap gap-1">
          {fileSymbols.slice(0, 12).map((sym) => (
            <span key={sym.uid} className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: `${kindColors[sym.kind] || "#5a5a70"}15`, color: kindColors[sym.kind] || "#5a5a70" }}>
              {sym.name.split(".").pop()}
            </span>
          ))}
          {fileSymbols.length > 12 && <span className="text-[9px] text-[#5a5a70]">+{fileSymbols.length - 12}</span>}
        </div>
      )}

      {/* Code */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center h-32 text-[#5a5a70] text-xs">Loading...</div>
        )}
        {error && (
          <div className="p-4 text-[#5a5a70] text-xs">
            <p>Could not load file content</p>
            <p className="text-[9px] mt-1">Make sure the server has access to the source files</p>
          </div>
        )}
        {code && (
          <div className="font-mono text-[11px] leading-[18px]">
            {code.split("\n").map((line, i) => {
              const lineNum = i + 1;
              const sym = lineSymbols.get(lineNum);
              const hasSymbol = !!sym;

              return (
                <div
                  key={i}
                  className={`flex hover:bg-hover/30 ${hasSymbol ? "bg-archlens-500/5" : ""}`}
                >
                  {/* Line number */}
                  <div className="w-10 flex-shrink-0 text-right pr-3 select-none text-[#5a5a70] text-[10px]" style={{ lineHeight: "18px" }}>
                    {lineNum}
                  </div>
                  {/* Symbol marker */}
                  <div className="w-2 flex-shrink-0 flex items-center">
                    {hasSymbol && (
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: kindColors[sym!.kind] || "#5a5a70" }} title={`${sym!.kind}: ${sym!.name}`} />
                    )}
                  </div>
                  {/* Code line */}
                  <pre className="flex-1 text-[#8888a0] overflow-x-auto whitespace-pre" style={{ lineHeight: "18px", tabSize: 4 }}>
                    {line || " "}
                  </pre>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────

export function ArchitectureView() {
  const { model } = useStore();
  const graphRef = useRef<SigmaGraphHandle>(null);

  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([{ level: "system", id: "root", label: "System" }]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [impactMode, setImpactMode] = useState(false);
  const [impactResult, setImpactResult] = useState<ImpactResult | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [bottomTab, setBottomTab] = useState<"trace" | "matrix">("trace");

  const currentLevel = breadcrumbs[breadcrumbs.length - 1];

  const drillDown = useCallback((id: string, label: string, level: ViewLevel) => {
    setBreadcrumbs((prev) => [...prev, { level, id, label }]);
    setSelectedNode(null);
    setImpactResult(null);
    setImpactMode(false);
  }, []);

  const navigateTo = useCallback((index: number) => {
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
    setSelectedNode(null);
    setImpactResult(null);
  }, []);

  const handleNodeClick = useCallback((nodeId: string) => {
    if (!nodeId) { setSelectedNode(null); setImpactResult(null); return; }
    setSelectedNode(nodeId);
    if (impactMode && graphRef.current) {
      const result = graphRef.current.highlightImpact(nodeId);
      setImpactResult(result);
    }
  }, [impactMode]);

  const handleNodeDoubleClick = useCallback((nodeId: string) => {
    if (!model) return;
    if (nodeId.startsWith("layer-")) return;
    if (currentLevel.level === "system") {
      const mod = model.modules.find((m) => m.name === nodeId);
      if (mod) drillDown(nodeId, nodeId, "module");
    } else if (currentLevel.level === "module") {
      drillDown(nodeId, nodeId.split("/").pop() || nodeId, "file");
    }
  }, [model, currentLevel.level, drillDown]);

  const graphData = useMemo(() => {
    if (!model) return { nodes: [], edges: [] };
    if (currentLevel.level === "system") return buildSystemGraph(model);
    if (currentLevel.level === "module") return buildModuleGraph(model, currentLevel.id);
    return { nodes: [], edges: [] };
  }, [model, currentLevel]);

  if (!model) return null;

  // Build file tree from symbol paths
  const fileTree = useMemo(() => {
    if (!model) return new Map<string, Set<string>>();
    const tree = new Map<string, Set<string>>(); // module → set of relative paths
    for (const mod of model.modules) {
      const paths = new Set<string>();
      for (const uid of mod.symbols) {
        const sym = model.symbols[uid] as Record<string, unknown> | undefined;
        if (sym) paths.add(sym.filePath as string);
      }
      tree.set(mod.name, paths);
    }
    return tree;
  }, [model]);

  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const toggleDir = (dir: string) => setExpandedDirs((prev) => { const n = new Set(prev); if (n.has(dir)) n.delete(dir); else n.add(dir); return n; });

  const filteredModules = searchQuery
    ? model.modules.filter((m) => m.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : model.modules;

  // Build nested directory structure for a module
  function buildDirTree(paths: Set<string>, moduleName: string): Array<{ path: string; name: string; isDir: boolean; depth: number; children: number }> {
    const items: Array<{ path: string; name: string; isDir: boolean; depth: number; children: number }> = [];
    const dirs = new Map<string, number>(); // dir path → file count

    for (const fp of paths) {
      const parts = fp.split("/");
      // Build directory entries
      for (let i = 1; i < parts.length; i++) {
        const dirPath = parts.slice(0, i).join("/");
        dirs.set(dirPath, (dirs.get(dirPath) || 0) + (i === parts.length - 1 ? 1 : 0));
      }
    }

    // Sort paths for display
    const sorted = [...paths].sort();
    const addedDirs = new Set<string>();

    for (const fp of sorted) {
      const parts = fp.split("/");
      // Add directory entries
      for (let i = 1; i < parts.length; i++) {
        const dirPath = parts.slice(0, i).join("/");
        if (!addedDirs.has(dirPath)) {
          addedDirs.add(dirPath);
          const dirFiles = [...paths].filter((p) => p.startsWith(dirPath + "/")).length;
          items.push({ path: dirPath, name: parts[i - 1], isDir: true, depth: i - 1, children: dirFiles });
        }
      }
      // Add file
      items.push({ path: fp, name: parts[parts.length - 1], isDir: false, depth: parts.length - 1, children: 0 });
    }

    // Deduplicate and sort: dirs first, then files at each level
    const seen = new Set<string>();
    return items.filter((item) => { if (seen.has(item.path)) return false; seen.add(item.path); return true; });
  }

  return (
    <div className="flex h-full">
      {/* ── LEFT: File Tree Navigator ── */}
      <aside className="w-64 border-r border-[#1e1e2a] bg-surface flex flex-col overflow-hidden">
        <div className="p-2 border-b border-[#1e1e2a]">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#5a5a70]" />
            <input
              type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files..."
              className="w-full rounded-md border border-[#2a2a3a] bg-deep py-1.5 pl-7 pr-2 text-[11px] text-[#8888a0] placeholder:text-[#5a5a70] outline-none focus:border-archlens-500/30"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {filteredModules.map((mod) => {
            const color = layerMeta[mod.layer]?.color || "#6b7280";
            const isModSelected = selectedNode === mod.name;
            const isModExpanded = expandedDirs.has(mod.name);
            const modPaths = fileTree.get(mod.name) || new Set();

            return (
              <div key={mod.name}>
                {/* Module root */}
                <button
                  onClick={() => { setSelectedNode(mod.name); graphRef.current?.selectNode(mod.name); toggleDir(mod.name); }}
                  onDoubleClick={() => drillDown(mod.name, mod.name, "module")}
                  className={`w-full flex items-center gap-1 px-2 py-1 text-[11px] transition-all ${isModSelected ? "bg-amber-500/10 text-amber-300" : "text-[#8888a0] hover:bg-hover"}`}
                  style={isModSelected ? { borderLeft: `2px solid ${color}` } : { paddingLeft: "10px" }}
                >
                  {isModExpanded
                    ? <ChevronDown className="h-3 w-3 flex-shrink-0 text-[#5a5a70]" />
                    : <ChevronRight className="h-3 w-3 flex-shrink-0 text-[#5a5a70]" />}
                  <Box className="h-3 w-3 flex-shrink-0" style={{ color }} />
                  <span className="font-mono font-medium truncate">{mod.name}</span>
                  <span className="ml-auto text-[9px] text-[#5a5a70]">{mod.fileCount}</span>
                </button>

                {/* Expanded file tree */}
                {isModExpanded && (
                  <div className="ml-2">
                    {buildDirTree(modPaths, mod.name).map((item) => {
                      if (item.isDir) {
                        const isDirExpanded = expandedDirs.has(item.path);
                        // Only show if parent is expanded or is direct child
                        const parentDir = item.path.split("/").slice(0, -1).join("/");
                        if (item.depth > 1 && !expandedDirs.has(parentDir)) return null;

                        return (
                          <button
                            key={item.path}
                            onClick={() => toggleDir(item.path)}
                            className="w-full flex items-center gap-1 py-0.5 text-[10px] text-[#5a5a70] hover:text-[#8888a0] hover:bg-hover/50 rounded"
                            style={{ paddingLeft: `${item.depth * 12 + 8}px` }}
                          >
                            {isDirExpanded
                              ? <ChevronDown className="h-2.5 w-2.5 flex-shrink-0" />
                              : <ChevronRight className="h-2.5 w-2.5 flex-shrink-0" />}
                            <span className="font-mono truncate">{item.name}/</span>
                          </button>
                        );
                      }

                      // File
                      const parentDir2 = item.path.split("/").slice(0, -1).join("/");
                      if (item.depth > 1 && !expandedDirs.has(parentDir2)) return null;

                      const isFileSelected = selectedNode === item.path;
                      const ext = item.name.split(".").pop() || "";
                      const extColors: Record<string, string> = { cs: "#178600", ts: "#3178c6", tsx: "#3178c6", py: "#3572A5", go: "#00ADD8", java: "#b07219", swift: "#F05138", rs: "#dea584" };

                      return (
                        <button
                          key={item.path}
                          onClick={() => setSelectedNode(item.path)}
                          className={`w-full flex items-center gap-1 py-0.5 text-[10px] rounded ${isFileSelected ? "bg-amber-500/10 text-amber-300" : "text-[#5a5a70] hover:text-[#8888a0] hover:bg-hover/50"}`}
                          style={{ paddingLeft: `${item.depth * 12 + 8}px` }}
                        >
                          <FileCode className="h-2.5 w-2.5 flex-shrink-0" style={{ color: extColors[ext] || "#5a5a70" }} />
                          <span className="font-mono truncate">{item.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Stats footer */}
        <div className="px-3 py-2 border-t border-[#1e1e2a] text-[9px] text-[#5a5a70]">
          {model.modules.length} modules · {model.stats.files} files
        </div>
      </aside>

      {/* ── CENTER ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="px-4 py-2 border-b border-[#1e1e2a] flex items-center justify-between bg-surface/50">
          <div className="flex items-center gap-2">
            {breadcrumbs.length > 1 && (
              <button onClick={() => navigateTo(breadcrumbs.length - 2)} className="p-1 rounded hover:bg-elevated text-[#5a5a70]"><ArrowLeft className="h-3.5 w-3.5" /></button>
            )}
            {breadcrumbs.map((c, i) => (
              <div key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3 text-[#5a5a70]" />}
                <button onClick={() => navigateTo(i)} className={`text-[11px] font-mono px-1.5 py-0.5 rounded ${i === breadcrumbs.length - 1 ? "bg-archlens-500/12 text-archlens-300" : "text-[#5a5a70] hover:text-[#8888a0]"}`}>
                  {c.label}
                </button>
              </div>
            ))}
            <span className="text-[10px] text-[#5a5a70] ml-2">{graphData.nodes.length}n · {graphData.edges.length}e</span>
          </div>

          <button
            onClick={() => { setImpactMode(!impactMode); if (impactMode) { graphRef.current?.clearHighlight(); setImpactResult(null); } }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${impactMode ? "bg-red-500/20 text-red-400 border border-red-500/30 animate-glow-pulse" : "bg-elevated text-[#5a5a70] hover:text-[#8888a0] border border-[#2a2a3a]"}`}
          >
            <Target className="h-3.5 w-3.5" />
            Impact
          </button>
        </div>

        {/* Graph — Full height */}
        <div className="flex-1 min-h-0">
          <SigmaGraph
            ref={graphRef}
            nodes={graphData.nodes}
            edges={graphData.edges}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={handleNodeDoubleClick}
            impactMode={impactMode}
            className="h-full"
          />
        </div>

        {/* Bottom Panel */}
        {currentLevel.level === "system" && (
          <div className="border-t border-[#1e1e2a] bg-surface">
            <div className="flex items-center gap-0.5 px-4 pt-1">
              <button onClick={() => setBottomTab("trace")} className={`px-3 py-1 rounded-t text-[10px] font-medium ${bottomTab === "trace" ? "bg-elevated text-archlens-300" : "text-[#5a5a70] hover:text-[#8888a0]"}`}>
                <Zap className="h-3 w-3 inline mr-1" />Feature Tracing
              </button>
              <button onClick={() => setBottomTab("matrix")} className={`px-3 py-1 rounded-t text-[10px] font-medium ${bottomTab === "matrix" ? "bg-elevated text-archlens-300" : "text-[#5a5a70] hover:text-[#8888a0]"}`}>
                <Grid3x3 className="h-3 w-3 inline mr-1" />Dependency Matrix
              </button>
            </div>
            <div className="px-4 pb-3 pt-2 max-h-[220px] overflow-auto">
              {bottomTab === "trace" ? <FeatureTracer model={model} graphRef={graphRef as any} /> : <DependencyMatrix model={model} />}
            </div>
          </div>
        )}
      </div>

      {/* ── RIGHT: Code Panel ── */}
      <aside className="w-80 border-l border-[#1e1e2a] bg-surface overflow-hidden flex flex-col">
        {selectedNode ? (
          <CodePanel model={model} selectedId={selectedNode} level={currentLevel.level} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-elevated flex items-center justify-center mb-4">
              <Layers className="h-8 w-8 text-[#2a2a3a]" />
            </div>
            <p className="text-sm font-medium text-[#5a5a70]">Select a module</p>
            <p className="text-[11px] text-[#5a5a70] mt-1">Click to inspect · Double-click to drill down</p>
            {impactMode && <p className="text-[11px] text-red-400 mt-2">Impact mode active</p>}

            {/* Impact Result */}
            {impactResult && impactResult.total > 0 && (
              <div className="mt-4 w-full text-left bg-elevated rounded-xl p-3 space-y-1.5">
                <div className="text-[10px] uppercase font-semibold text-[#5a5a70]">Blast Radius</div>
                <div className="flex items-center gap-2 text-xs"><div className="w-2.5 h-2.5 rounded-full bg-red-500" /> <span className="text-red-400">WILL BREAK: {impactResult.d1.length}</span></div>
                <div className="flex items-center gap-2 text-xs"><div className="w-2.5 h-2.5 rounded-full bg-orange-500" /> <span className="text-orange-400">LIKELY AFFECTED: {impactResult.d2.length}</span></div>
                <div className="flex items-center gap-2 text-xs"><div className="w-2.5 h-2.5 rounded-full bg-yellow-500" /> <span className="text-yellow-400">MAY NEED TEST: {impactResult.d3.length}</span></div>
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
