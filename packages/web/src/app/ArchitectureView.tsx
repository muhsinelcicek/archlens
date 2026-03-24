import { useState, useMemo, useCallback, useRef } from "react";
import { useStore, type ArchModel } from "../lib/store.js";
import { ArchGraph, type GraphNode, type GraphEdge, type ArchGraphHandle, type ImpactResult } from "../components/ArchGraph.js";
import { DependencyMatrix } from "../components/DependencyMatrix.js";
import { FeatureTracer } from "../components/FeatureTracer.js";
import {
  ChevronRight, ChevronDown, ArrowLeft, Search, Code2, GitBranch,
  Box, Braces, FunctionSquare, FileCode, Eye, Layers, Zap,
  Target, AlertTriangle, CheckCircle2, Globe, Database, Cpu,
  Filter, Grid3x3,
} from "lucide-react";

type ViewLevel = "system" | "module" | "file";
interface Breadcrumb { level: ViewLevel; id: string; label: string }

const layerMeta: Record<string, { color: string; label: string }> = {
  presentation: { color: "#10b981", label: "Presentation" },
  api: { color: "#3b82f6", label: "API" },
  application: { color: "#f59e0b", label: "Application" },
  domain: { color: "#8b5cf6", label: "Domain" },
  infrastructure: { color: "#ef4444", label: "Infrastructure" },
  config: { color: "#6b7280", label: "Config" },
  unknown: { color: "#52525b", label: "Other" },
};

// ─── Graph Builders ──────────────────────────────────────────────────

function buildSystemGraph(model: ArchModel, edgeFilters: Set<string>): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  for (const layer of ["presentation", "api", "application", "domain", "infrastructure", "config", "unknown"]) {
    const mods = model.modules.filter((m) => m.layer === layer);
    if (mods.length === 0) continue;
    nodes.push({ id: `layer-${layer}`, label: layerMeta[layer]?.label || layer, group: layer, type: "layer" });
    for (const mod of mods) {
      nodes.push({
        id: mod.name,
        label: mod.name,
        sublabel: `${mod.fileCount}f | ${mod.lineCount.toLocaleString()}L | ${mod.symbols.length}s`,
        group: layer,
        parent: `layer-${layer}`,
        type: "module",
      });
    }
  }

  // Build file→module lookup from model
  const fileToModule = new Map<string, string>();
  for (const mod of model.modules) {
    for (const symUid of mod.symbols) {
      const sym = model.symbols[symUid] as Record<string, unknown> | undefined;
      if (sym) fileToModule.set(sym.filePath as string, mod.name);
    }
  }

  // Also build uid→module lookup for non-file sources (symbols as source)
  const uidToModule = new Map<string, string>();
  for (const mod of model.modules) {
    for (const uid of mod.symbols) {
      uidToModule.set(uid, mod.name);
    }
  }

  // Weighted edges — consider ALL relation types (imports, calls, extends, composes, implements)
  const edgeMap = new Map<string, { count: number; types: Record<string, number> }>();
  for (const rel of model.relations) {
    if (edgeFilters.size > 0 && !edgeFilters.has(rel.type)) continue;
    // Skip composes (internal class→method) — not useful for module-level graph
    if (rel.type === "composes") continue;

    // Resolve source module: try file path first, then uid
    const srcMod = fileToModule.get(rel.source) || uidToModule.get(rel.source);

    // Resolve target module: try as symbol uid
    const tgtSym = model.symbols[rel.target] as Record<string, unknown> | undefined;
    let tgtMod: string | undefined;
    if (tgtSym) {
      tgtMod = fileToModule.get(tgtSym.filePath as string);
    }
    // If target is not a known symbol, try matching by name against module symbols
    if (!tgtMod) {
      tgtMod = uidToModule.get(rel.target);
    }
    // If target is a bare name (e.g., "BaseEntity"), find which module has it
    if (!tgtMod && typeof rel.target === "string") {
      for (const [uid, sym] of Object.entries(model.symbols) as Array<[string, Record<string, unknown>]>) {
        if (sym.name === rel.target) {
          tgtMod = fileToModule.get(sym.filePath as string);
          if (tgtMod) break;
        }
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
    edges.push({ source: src, target: tgt, type: mainType, weight: data.count, label: `${data.count}` });
  }

  return { nodes, edges };
}

function buildModuleGraph(model: ArchModel, moduleName: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const files = new Map<string, number>();

  // Find files belonging to this module via module.symbols
  const mod = model.modules.find((m) => m.name === moduleName);
  if (mod) {
    for (const symUid of mod.symbols) {
      const sym = model.symbols[symUid] as Record<string, unknown> | undefined;
      if (sym) {
        const fp = sym.filePath as string;
        files.set(fp, (files.get(fp) || 0) + 1);
      }
    }
  }

  for (const [fp, symCount] of files) {
    const fileName = fp.split("/").pop() || fp;
    nodes.push({ id: fp, label: fileName, sublabel: `${symCount} symbols`, group: "default", type: "file" });
  }

  const edgeSet = new Set<string>();
  for (const rel of model.relations) {
    if (rel.type !== "imports") continue;
    const tgtSym = model.symbols[rel.target] as Record<string, unknown> | undefined;
    if (!tgtSym) continue;
    const srcFile = rel.source;
    const tgtFile = tgtSym.filePath as string;
    if (files.has(srcFile) && files.has(tgtFile) && srcFile !== tgtFile) {
      const key = `${srcFile}→${tgtFile}`;
      if (!edgeSet.has(key)) { edgeSet.add(key); edges.push({ source: srcFile, target: tgtFile, type: "imports" }); }
    }
  }

  return { nodes, edges };
}

// ─── Smart Detail Panel ──────────────────────────────────────────────

function SmartDetailPanel({ model, selectedId, level, impactResult, onDrillDown, onShowImpact }: {
  model: ArchModel;
  selectedId: string;
  level: ViewLevel;
  impactResult: ImpactResult | null;
  onDrillDown: (id: string, label: string, level: ViewLevel) => void;
  onShowImpact: () => void;
}) {
  const mod = model.modules.find((m) => m.name === selectedId);
  if (!mod && level === "system") return null;

  if (level === "system" && mod) {
    const color = layerMeta[mod.layer]?.color || "#52525b";

    // Build file→module lookup
    const f2m = new Map<string, string>();
    for (const m of model.modules) {
      for (const uid of m.symbols) {
        const s = model.symbols[uid] as Record<string, unknown> | undefined;
        if (s) f2m.set(s.filePath as string, m.name);
      }
    }

    // Also build uid→module for symbol-level relations
    const u2m = new Map<string, string>();
    for (const m of model.modules) {
      for (const uid of m.symbols) u2m.set(uid, m.name);
    }

    // Calculate coupling — ALL relation types except composes
    let ca = 0, ce = 0;
    const dependsOn = new Map<string, number>();
    const dependedBy = new Map<string, number>();

    for (const rel of model.relations) {
      if (rel.type === "composes") continue;

      const srcMod = f2m.get(rel.source) || u2m.get(rel.source);
      const tgtSym = model.symbols[rel.target] as Record<string, unknown> | undefined;
      let tgtMod = tgtSym ? f2m.get(tgtSym.filePath as string) : undefined;
      if (!tgtMod) tgtMod = u2m.get(rel.target);
      // Bare name resolution
      if (!tgtMod && typeof rel.target === "string") {
        for (const [uid, sym] of Object.entries(model.symbols) as Array<[string, Record<string, unknown>]>) {
          if (sym.name === rel.target) { tgtMod = f2m.get(sym.filePath as string); if (tgtMod) break; }
        }
      }

      if (!srcMod || !tgtMod || srcMod === tgtMod) continue;
      if (tgtMod === mod.name) { ca++; dependedBy.set(srcMod, (dependedBy.get(srcMod) || 0) + 1); }
      if (srcMod === mod.name) { ce++; dependsOn.set(tgtMod, (dependsOn.get(tgtMod) || 0) + 1); }
    }
    const instability = ca + ce > 0 ? (ce / (ca + ce)).toFixed(2) : "0";

    // API endpoints for this module
    // Find files for this module
    const moduleFiles = new Set<string>();
    for (const uid of mod.symbols) {
      const s = model.symbols[uid] as Record<string, unknown> | undefined;
      if (s) moduleFiles.add(s.filePath as string);
    }
    const moduleEndpoints = model.apiEndpoints.filter((ep) => moduleFiles.has(ep.filePath));

    // DB entities for this module
    const moduleEntities = model.dbEntities.filter((e) => {
      const fp = (e as unknown as { filePath?: string }).filePath;
      return fp ? moduleFiles.has(fp) : false;
    });

    // Health
    const issues: string[] = [];
    if (mod.lineCount > 5000) issues.push(`Large (${mod.lineCount.toLocaleString()} LOC)`);
    if (mod.symbols.length > 200) issues.push(`Many symbols (${mod.symbols.length})`);

    return (
      <div className="space-y-4 text-xs">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
            <h3 className="font-mono font-bold text-base" style={{ color }}>{mod.name}/</h3>
          </div>
          <span className="text-[10px] rounded-full px-2 py-0.5 mt-1 inline-block" style={{ backgroundColor: `${color}20`, color }}>
            {layerMeta[mod.layer]?.label} Layer
          </span>
        </div>

        {/* Metrics */}
        <Section title="METRICS">
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Files" value={mod.fileCount} />
            <Metric label="Symbols" value={mod.symbols.length} />
            <Metric label="Lines" value={mod.lineCount.toLocaleString()} />
            <Metric label="Language" value={mod.language} />
            <Metric label="Coupling (Ca/Ce)" value={`${ca}/${ce}`} />
            <Metric label="Instability" value={instability} color={Number(instability) > 0.7 ? "#ef4444" : Number(instability) > 0.4 ? "#f59e0b" : "#10b981"} />
          </div>
        </Section>

        {/* Impact Result */}
        {impactResult && impactResult.total > 0 && (
          <Section title="IMPACT RADIUS">
            <div className="space-y-1">
              <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-red-500" /> <span className="text-red-400">d=1 WILL BREAK: {impactResult.d1.length}</span></div>
              <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-orange-500" /> <span className="text-orange-400">d=2 LIKELY AFFECTED: {impactResult.d2.length}</span></div>
              <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-yellow-500" /> <span className="text-yellow-400">d=3 MAY NEED TEST: {impactResult.d3.length}</span></div>
              <div className="text-[#707070] mt-1">Total: {impactResult.total} affected</div>
            </div>
          </Section>
        )}

        {/* Depends On */}
        <Section title={`DEPENDS ON (${dependsOn.size})`}>
          {dependsOn.size === 0 ? <span className="text-[#606060]">No dependencies (root module)</span> :
            [...dependsOn.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => (
              <div key={name} className="flex items-center justify-between py-0.5">
                <span className="text-[#b0b0b0] font-mono">→ {name}</span>
                <span className="text-[#606060]">{count} refs</span>
              </div>
            ))}
        </Section>

        {/* Depended By */}
        <Section title={`DEPENDED BY (${dependedBy.size})`}>
          {dependedBy.size === 0 ? <span className="text-[#606060]">Leaf module (no dependents)</span> :
            [...dependedBy.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => (
              <div key={name} className="flex items-center justify-between py-0.5">
                <span className="text-[#b0b0b0] font-mono">← {name}</span>
                <span className="text-[#606060]">{count} refs</span>
              </div>
            ))}
        </Section>

        {/* API Endpoints */}
        {moduleEndpoints.length > 0 && (
          <Section title={`API ENDPOINTS (${moduleEndpoints.length})`}>
            {moduleEndpoints.slice(0, 10).map((ep, i) => {
              const mc: Record<string, string> = { GET: "text-blue-400", POST: "text-emerald-400", PUT: "text-amber-400", DELETE: "text-red-400" };
              return <div key={i} className="font-mono py-0.5"><span className={`${mc[ep.method] || "text-[#888888]"} w-7 inline-block`}>{ep.method}</span> <span className="text-[#888888]">{ep.path}</span></div>;
            })}
          </Section>
        )}

        {/* DB Entities */}
        {moduleEntities.length > 0 && (
          <Section title={`DB TABLES (${moduleEntities.length})`}>
            {moduleEntities.map((e) => <div key={e.name} className="font-mono text-emerald-400 py-0.5">{e.name} <span className="text-[#606060]">{e.columns.length} cols</span></div>)}
          </Section>
        )}

        {/* Health */}
        <Section title="HEALTH">
          {issues.length === 0
            ? <div className="flex items-center gap-1.5 text-emerald-400"><CheckCircle2 className="h-3 w-3" /> All checks passed</div>
            : issues.map((issue, i) => <div key={i} className="flex items-center gap-1.5 text-amber-400"><AlertTriangle className="h-3 w-3" /> {issue}</div>)
          }
        </Section>

        {/* Actions */}
        <div className="space-y-1.5 pt-2">
          <button onClick={() => onDrillDown(mod.name, mod.name, "module")} className="w-full flex items-center justify-center gap-2 rounded-lg bg-archlens-500/10 border border-archlens-500/30 text-archlens-400 py-2 text-xs font-medium hover:bg-archlens-500/20">
            <Eye className="h-3.5 w-3.5" /> Explore Module
          </button>
          <button onClick={onShowImpact} className="w-full flex items-center justify-center gap-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 py-2 text-xs font-medium hover:bg-red-500/20">
            <Target className="h-3.5 w-3.5" /> Show Impact
          </button>
          {moduleEndpoints.length > 0 && (
            <a href="/sequence" className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 py-2 text-xs font-medium hover:bg-blue-500/20">
              <GitBranch className="h-3.5 w-3.5" /> Sequence Diagrams
            </a>
          )}
        </div>
      </div>
    );
  }

  // File/symbol level — simpler panel
  const symbols = Object.entries(model.symbols).filter(([, s]) => (s as Record<string, unknown>).filePath === selectedId) as Array<[string, Record<string, unknown>]>;
  if (symbols.length === 0 && level !== "system") {
    return <div className="text-[#606060] text-xs">No data for selection</div>;
  }

  return (
    <div className="space-y-3 text-xs">
      <h3 className="font-mono font-bold text-sm text-[#d4d4d4]">{selectedId.split("/").pop()}</h3>
      <p className="text-[10px] text-[#606060] font-mono">{selectedId}</p>
      <button onClick={() => onDrillDown(selectedId, selectedId.split("/").pop() || selectedId, "file")} className="w-full flex items-center justify-center gap-2 rounded-lg bg-archlens-500/10 border border-archlens-500/30 text-archlens-400 py-2 text-xs font-medium hover:bg-archlens-500/20">
        <Eye className="h-3.5 w-3.5" /> Explore Symbols
      </button>
      <Section title={`SYMBOLS (${symbols.length})`}>
        {symbols.slice(0, 20).map(([uid, sym]) => (
          <div key={uid} className="flex items-center gap-2 py-0.5">
            <span className="text-[#707070]">{sym.kind as string}</span>
            <span className="text-[#b0b0b0] font-mono truncate">{sym.name as string}</span>
          </div>
        ))}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[#606060] mb-1.5">{title}</h4>
      <div>{children}</div>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="rounded-md bg-[#3a3a3a] px-2 py-1.5">
      <div className="text-sm font-bold" style={{ color: color || "#e4e4e7" }}>{value}</div>
      <div className="text-[9px] text-[#606060]">{label}</div>
    </div>
  );
}

// ─── Main View ───────────────────────────────────────────────────────

export function ArchitectureView() {
  const { model } = useStore();
  const graphRef = useRef<ArchGraphHandle>(null);

  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([{ level: "system", id: "root", label: "System" }]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [impactMode, setImpactMode] = useState(false);
  const [impactResult, setImpactResult] = useState<ImpactResult | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [edgeFilters, setEdgeFilters] = useState<Set<string>>(new Set());
  const [bottomTab, setBottomTab] = useState<"trace" | "matrix">("trace");
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

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
    // Skip compound/layer parent nodes
    if (nodeId.startsWith("layer-")) return;

    if (currentLevel.level === "system") {
      const mod = model.modules.find((m) => m.name === nodeId);
      if (mod) drillDown(nodeId, nodeId, "module");
    } else if (currentLevel.level === "module") {
      drillDown(nodeId, nodeId.split("/").pop() || nodeId, "file");
    }
  }, [model, currentLevel.level, drillDown]);

  const handleShowImpact = useCallback(() => {
    if (selectedNode && graphRef.current) {
      setImpactMode(true);
      const result = graphRef.current.highlightImpact(selectedNode);
      setImpactResult(result);
    }
  }, [selectedNode]);

  const toggleEdgeFilter = useCallback((type: string) => {
    setEdgeFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      if (graphRef.current) {
        if (next.size > 0) graphRef.current.filterEdgeTypes([...next]);
        else graphRef.current.showAllEdges();
      }
      return next;
    });
  }, []);

  const graphData = useMemo(() => {
    if (!model) return { nodes: [], edges: [] };
    if (currentLevel.level === "system") return buildSystemGraph(model, edgeFilters);
    if (currentLevel.level === "module") return buildModuleGraph(model, currentLevel.id);
    return { nodes: [], edges: [] };
  }, [model, currentLevel, edgeFilters]);

  if (!model) return null;

  // Navigator data
  const filteredModules = searchQuery
    ? model.modules.filter((m) => m.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : model.modules;

  const edgeTypes = [...new Set(model.relations.map((r) => r.type))];

  return (
    <div className="flex h-full">
      {/* LEFT: Navigator Panel */}
      <aside className="w-52 border-r border-[#383838] bg-[#2c2c2c] flex flex-col overflow-hidden">
        {/* Search */}
        <div className="p-2 border-b border-[#383838]">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#606060]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-full rounded-md border border-[#404040] bg-[#2c2c2c]/50 py-1.5 pl-7 pr-2 text-[11px] text-[#b0b0b0] placeholder:text-[#505050] outline-none focus:border-archlens-500/30"
            />
          </div>
        </div>

        {/* Module Tree */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-[#606060] px-1 mb-1">Modules</div>
          {filteredModules.map((mod) => {
            const color = layerMeta[mod.layer]?.color || "#52525b";
            const isSelected = selectedNode === mod.name;
            const isExpanded = expandedModules.has(mod.name);

            return (
              <div key={mod.name}>
                <button
                  onClick={() => {
                    setSelectedNode(mod.name);
                    graphRef.current?.selectNode(mod.name);
                    setExpandedModules((prev) => {
                      const next = new Set(prev);
                      if (next.has(mod.name)) next.delete(mod.name);
                      else next.add(mod.name);
                      return next;
                    });
                  }}
                  className={`w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-[11px] transition-colors ${isSelected ? "bg-archlens-500/10 text-archlens-400" : "text-[#888888] hover:bg-[#3a3a3a] hover:text-[#b0b0b0]"}`}
                >
                  {isExpanded ? <ChevronDown className="h-3 w-3 flex-shrink-0 text-[#606060]" /> : <ChevronRight className="h-3 w-3 flex-shrink-0 text-[#606060]" />}
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  <span className="font-mono truncate">{mod.name}</span>
                  <span className="ml-auto text-[9px] text-[#505050]">{mod.fileCount}</span>
                </button>

                {isExpanded && (
                  <div className="ml-5 space-y-0.5 mt-0.5">
                    {Object.entries(model.symbols)
                      .filter(([, s]) => (s as Record<string, unknown>).filePath?.toString().startsWith(mod.name + "/"))
                      .reduce((files, [, s]) => {
                        const fp = (s as Record<string, unknown>).filePath as string;
                        if (!files.includes(fp)) files.push(fp);
                        return files;
                      }, [] as string[])
                      .slice(0, 15)
                      .map((fp) => (
                        <button
                          key={fp}
                          onClick={() => { setSelectedNode(fp); }}
                          className={`w-full flex items-center gap-1 px-1 py-0.5 rounded text-[10px] transition-colors ${selectedNode === fp ? "text-archlens-400" : "text-[#606060] hover:text-[#888888]"}`}
                        >
                          <FileCode className="h-2.5 w-2.5 flex-shrink-0" />
                          <span className="font-mono truncate">{fp.split("/").pop()}</span>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Edge Filters */}
        <div className="p-2 border-t border-[#383838]">
          <div className="flex items-center gap-1 mb-1.5">
            <Filter className="h-3 w-3 text-[#606060]" />
            <span className="text-[9px] font-semibold uppercase tracking-wider text-[#606060]">Relations</span>
          </div>
          <div className="space-y-0.5">
            {edgeTypes.slice(0, 6).map((type) => {
              const active = edgeFilters.size === 0 || edgeFilters.has(type);
              return (
                <button
                  key={type}
                  onClick={() => toggleEdgeFilter(type)}
                  className={`flex items-center gap-1.5 w-full px-1.5 py-0.5 rounded text-[10px] transition-colors ${active ? "text-[#b0b0b0]" : "text-[#505050]"}`}
                >
                  <div className={`w-2 h-2 rounded-sm ${active ? "" : "opacity-30"}`} style={{ backgroundColor: active ? (edgeFilters.size > 0 ? "#10b981" : "#52525b") : "#27272a" }} />
                  {type}
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      {/* CENTER + BOTTOM */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="px-4 py-2 border-b border-[#383838] flex items-center justify-between">
          <div className="flex items-center gap-2">
            {breadcrumbs.length > 1 && (
              <button onClick={() => navigateTo(breadcrumbs.length - 2)} className="p-1 rounded hover:bg-[#383838] text-[#707070]"><ArrowLeft className="h-3.5 w-3.5" /></button>
            )}
            {breadcrumbs.map((c, i) => (
              <div key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3 text-[#505050]" />}
                <button onClick={() => navigateTo(i)} className={`text-[11px] font-mono px-1.5 py-0.5 rounded ${i === breadcrumbs.length - 1 ? "bg-archlens-500/10 text-archlens-400" : "text-[#707070] hover:text-[#b0b0b0]"}`}>
                  {c.label}
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#606060]">{graphData.nodes.length}n {graphData.edges.length}e</span>
            <button
              onClick={() => {
                setImpactMode(!impactMode);
                if (impactMode) { graphRef.current?.clearHighlight(); setImpactResult(null); }
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${impactMode ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-[#383838] text-[#707070] hover:text-[#b0b0b0] border border-zinc-700"}`}
            >
              <Target className="h-3 w-3" />
              Impact
            </button>
          </div>
        </div>

        {/* Graph */}
        <div className="flex-1 min-h-0">
          <ArchGraph
            ref={graphRef}
            nodes={graphData.nodes}
            edges={graphData.edges}
            layout={currentLevel.level === "file" ? "cola" : "dagre"}
            direction={currentLevel.level === "system" ? "TB" : "LR"}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={handleNodeDoubleClick}
            impactMode={impactMode}
            className="h-full"
          />
        </div>

        {/* Bottom Panel */}
        {currentLevel.level === "system" && (
          <div className="border-t border-[#383838] bg-[#2c2c2c]/30">
            <div className="flex items-center gap-0.5 px-4 pt-1">
              <button onClick={() => setBottomTab("trace")} className={`px-3 py-1 rounded-t text-[10px] font-medium ${bottomTab === "trace" ? "bg-[#383838] text-archlens-400" : "text-[#606060] hover:text-[#888888]"}`}>
                <Zap className="h-3 w-3 inline mr-1" />Feature Tracing
              </button>
              <button onClick={() => setBottomTab("matrix")} className={`px-3 py-1 rounded-t text-[10px] font-medium ${bottomTab === "matrix" ? "bg-[#383838] text-archlens-400" : "text-[#606060] hover:text-[#888888]"}`}>
                <Grid3x3 className="h-3 w-3 inline mr-1" />Dependency Matrix
              </button>
            </div>
            <div className="px-4 pb-3 pt-2 max-h-[250px] overflow-auto">
              {bottomTab === "trace" && (
                <FeatureTracer model={model} graphRef={graphRef} />
              )}
              {bottomTab === "matrix" && (
                <DependencyMatrix
                  model={model}
                  onCellClick={(src, tgt) => {
                    // Highlight the edge between these modules
                    graphRef.current?.clearHighlight();
                    graphRef.current?.selectNode(src);
                  }}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* RIGHT: Detail Panel */}
      <aside className="w-72 border-l border-[#383838] bg-[#2c2c2c] overflow-y-auto">
        <div className="p-3">
          {selectedNode ? (
            <SmartDetailPanel
              model={model}
              selectedId={selectedNode}
              level={currentLevel.level}
              impactResult={impactResult}
              onDrillDown={drillDown}
              onShowImpact={handleShowImpact}
            />
          ) : (
            <div className="text-center py-12">
              <Layers className="h-8 w-8 text-zinc-800 mx-auto mb-3" />
              <p className="text-[11px] text-[#606060]">Click a node to inspect</p>
              <p className="text-[10px] text-[#505050] mt-1">Double-click to drill down</p>
              <p className="text-[10px] text-[#505050]">Enable Impact mode for blast radius</p>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
