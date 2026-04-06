import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../lib/store.js";
import { useI18n } from "../lib/i18n.js";
import {
  Boxes, GitBranch, Database, Files, Code2, FileCode,
  Search, ArrowUpDown, AlertTriangle, Activity,
} from "lucide-react";
import { ArchGraph, type GraphNode, type GraphEdge } from "../components/ArchGraph.js";
import { ERDiagram } from "../components/ERDiagram.js";

const layerConfig: Record<string, { color: string; label: string }> = {
  presentation: { color: "#34d399", label: "Presentation" },
  api: { color: "#60a5fa", label: "API" },
  application: { color: "#fbbf24", label: "Application" },
  domain: { color: "#a78bfa", label: "Domain" },
  infrastructure: { color: "#f87171", label: "Infrastructure" },
  config: { color: "#94a3b8", label: "Config" },
  unknown: { color: "#6b7280", label: "Other" },
};

const layerOrder = ["presentation", "api", "application", "domain", "infrastructure", "config", "unknown"];

type SortKey = "lines" | "name" | "instability";
type EdgeTypeFilter = "imports" | "calls" | "extends" | "implements";

export function StructureView() {
  const { model } = useStore();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"modules" | "deps" | "database">("modules");

  // Module tab state
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("lines");
  const [filterLayer, setFilterLayer] = useState<string | null>(null);

  // Deps tab state
  const [edgeTypeFilters, setEdgeTypeFilters] = useState<Set<EdgeTypeFilter>>(
    new Set(["imports", "calls", "extends", "implements"]),
  );

  if (!model) return null;

  // Build file-to-module and symbol-to-module maps
  const f2m = new Map<string, string>();
  const u2m = new Map<string, string>();
  for (const mod of model.modules) {
    for (const uid of mod.symbols) {
      u2m.set(uid, mod.name);
      const sym = model.symbols[uid] as Record<string, unknown> | undefined;
      if (sym) f2m.set(sym.filePath as string, mod.name);
    }
  }

  // Build full edge map with types
  const edgeMap = new Map<string, { weight: number; types: Record<string, number> }>();
  for (const rel of model.relations) {
    if (rel.type === "composes") continue;
    const srcMod = f2m.get(rel.source) || u2m.get(rel.source);
    const tgtSym = model.symbols[rel.target] as Record<string, unknown> | undefined;
    const tgtMod = tgtSym ? (f2m.get(tgtSym.filePath as string) || u2m.get(rel.target)) : undefined;
    if (srcMod && tgtMod && srcMod !== tgtMod) {
      const key = `${srcMod}→${tgtMod}`;
      if (!edgeMap.has(key)) edgeMap.set(key, { weight: 0, types: {} });
      const entry = edgeMap.get(key)!;
      entry.weight++;
      entry.types[rel.type] = (entry.types[rel.type] || 0) + 1;
    }
  }

  // Compute Ca (afferent) and Ce (efferent) per module
  const caMap = new Map<string, number>();
  const ceMap = new Map<string, number>();
  for (const [key] of edgeMap) {
    const [src, tgt] = key.split("→");
    ceMap.set(src, (ceMap.get(src) || 0) + 1);
    caMap.set(tgt, (caMap.get(tgt) || 0) + 1);
  }

  // Count layer violations
  const layerViolations: Array<{ from: string; to: string }> = [];
  for (const [key] of edgeMap) {
    const [src, tgt] = key.split("→");
    const srcMod = model.modules.find((m) => m.name === src);
    const tgtMod = model.modules.find((m) => m.name === tgt);
    if (srcMod && tgtMod) {
      const srcIdx = layerOrder.indexOf(srcMod.layer);
      const tgtIdx = layerOrder.indexOf(tgtMod.layer);
      if (srcIdx > tgtIdx && srcIdx !== -1 && tgtIdx !== -1) {
        layerViolations.push({ from: src, to: tgt });
      }
    }
  }
  const violatingModules = new Set(layerViolations.flatMap((v) => [v.from, v.to]));

  // Instability per module: I = Ce / (Ca + Ce)
  const instabilityOf = (name: string) => {
    const ca = caMap.get(name) || 0;
    const ce = ceMap.get(name) || 0;
    return ca + ce === 0 ? 0 : ce / (ca + ce);
  };

  // Build dependency graph edges (all types)
  const allDepEdges: (GraphEdge & { edgeType: string })[] = [];
  for (const [key, data] of edgeMap) {
    const [src, tgt] = key.split("→");
    const mainType = Object.entries(data.types).sort((a, b) => b[1] - a[1])[0]?.[0] || "imports";
    allDepEdges.push({ source: src, target: tgt, weight: data.weight, type: mainType, edgeType: mainType });
  }

  const depNodes: GraphNode[] = model.modules.map((m) => ({
    id: m.name, label: m.name, sublabel: `${m.fileCount}f · ${m.lineCount.toLocaleString()}L`,
    group: m.layer, type: "module",
  }));

  // Layer counts
  const layerCounts = new Map<string, number>();
  for (const mod of model.modules) {
    const layer = mod.layer || "unknown";
    layerCounts.set(layer, (layerCounts.get(layer) || 0) + 1);
  }

  // Filtered + sorted modules
  const filteredModules = useMemo(() => {
    let mods = [...model.modules];
    if (search) {
      const q = search.toLowerCase();
      mods = mods.filter((m) => m.name.toLowerCase().includes(q));
    }
    if (filterLayer) {
      mods = mods.filter((m) => m.layer === filterLayer);
    }
    switch (sortBy) {
      case "lines": mods.sort((a, b) => b.lineCount - a.lineCount); break;
      case "name": mods.sort((a, b) => a.name.localeCompare(b.name)); break;
      case "instability": mods.sort((a, b) => instabilityOf(b.name) - instabilityOf(a.name)); break;
    }
    return mods;
  }, [model.modules, search, filterLayer, sortBy]);

  const maxLines = Math.max(...model.modules.map((m) => m.lineCount), 1);

  // Filtered dep edges for graph
  const filteredDepEdges = allDepEdges.filter((e) => edgeTypeFilters.has(e.edgeType as EdgeTypeFilter));

  const toggleEdgeType = (type: EdgeTypeFilter) => {
    setEdgeTypeFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  };

  // Unique edge types actually present
  const presentEdgeTypes = useMemo(() => {
    const types = new Set<string>();
    for (const e of allDepEdges) types.add(e.edgeType);
    return [...types].sort();
  }, [allDepEdges]);

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-[#2a2a3a] px-6 pt-4">
        {[
          { id: "modules" as const, icon: Boxes, label: `${t("nav.modules")} (${model.modules.length})` },
          { id: "deps" as const, icon: GitBranch, label: `${t("nav.dependencies")} (${allDepEdges.length})` },
          { id: "database" as const, icon: Database, label: `${t("nav.er_diagram")} (${model.dbEntities.length})` },
        ].map((tb) => (
          <button key={tb.id} onClick={() => setTab(tb.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold transition-colors ${tab === tb.id ? "text-archlens-300 border-b-2 border-archlens-400" : "text-[#5a5a70] hover:text-[#8888a0]"}`}>
            <tb.icon className="h-3.5 w-3.5" /> {tb.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {tab === "modules" && (
          <div className="p-6 max-w-[1200px]">
            {/* Search + Sort bar */}
            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#5a5a70]" />
                <input
                  type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search modules..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-elevated border border-[#2a2a3a] text-sm text-[#e4e4ed] placeholder-[#5a5a70] focus:outline-none focus:border-archlens-400/50"
                />
              </div>
              <div className="flex items-center gap-1 text-xs text-[#5a5a70]">
                <ArrowUpDown className="h-3 w-3" />
                {(["lines", "name", "instability"] as SortKey[]).map((key) => (
                  <button key={key} onClick={() => setSortBy(key)}
                    className={`px-2.5 py-1.5 rounded-md font-medium transition-colors ${sortBy === key ? "bg-archlens-500/12 text-archlens-300 border border-archlens-500/30" : "border border-[#2a2a3a] hover:text-[#8888a0]"}`}>
                    {key === "lines" ? "Size" : key === "name" ? "Name" : "Instability"}
                  </button>
                ))}
              </div>
            </div>

            {/* Layer filter pills */}
            <div className="flex flex-wrap gap-2 mb-4">
              <button onClick={() => setFilterLayer(null)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${!filterLayer ? "bg-archlens-500/12 border-archlens-500/30 text-archlens-300" : "border-[#2a2a3a] text-[#5a5a70] hover:text-[#8888a0]"}`}>
                All ({model.modules.length})
              </button>
              {[...layerCounts.entries()].map(([layer, count]) => {
                const cfg = layerConfig[layer] || layerConfig.unknown;
                return (
                  <button key={layer} onClick={() => setFilterLayer(filterLayer === layer ? null : layer)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium border flex items-center gap-1.5 transition-colors"
                    style={{
                      backgroundColor: filterLayer === layer ? `${cfg.color}12` : "transparent",
                      borderColor: filterLayer === layer ? `${cfg.color}30` : "#2a2a3a",
                      color: filterLayer === layer ? cfg.color : "#5a5a70",
                    }}>
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.color }} />
                    {cfg.label} ({count})
                  </button>
                );
              })}
            </div>

            {/* Module cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredModules.map((mod) => {
                const cfg = layerConfig[mod.layer] || layerConfig.unknown;
                const barWidth = (mod.lineCount / maxLines) * 100;
                const ca = caMap.get(mod.name) || 0;
                const ce = ceMap.get(mod.name) || 0;
                const instability = instabilityOf(mod.name);
                const isViolating = violatingModules.has(mod.name);
                const instColor = instability < 0.4 ? "#34d399" : instability < 0.7 ? "#fbbf24" : "#f87171";

                return (
                  <div
                    key={mod.name}
                    onClick={() => navigate("/architecture")}
                    className="rounded-xl border overflow-hidden transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-black/20 cursor-pointer"
                    style={{ borderColor: isViolating ? "rgba(239,68,68,0.4)" : `${cfg.color}30` }}
                  >
                    {/* Header */}
                    <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: `${cfg.color}08` }}>
                      <div className="flex items-center gap-2 min-w-0">
                        <h3 className="font-mono font-bold text-base truncate" style={{ color: cfg.color }}>{mod.name}/</h3>
                        {isViolating && <AlertTriangle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />}
                      </div>
                      <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: `${cfg.color}20`, color: cfg.color }}>{cfg.label}</span>
                    </div>

                    {/* Body */}
                    <div className="px-4 py-3 bg-surface">
                      {/* Stats row */}
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div><Files className="h-3 w-3 text-[#5a5a70] mx-auto mb-0.5" /><div className="text-lg font-bold text-[#e4e4ed]">{mod.fileCount}</div><div className="text-[9px] text-[#5a5a70] uppercase">{t("modules.files")}</div></div>
                        <div><Code2 className="h-3 w-3 text-[#5a5a70] mx-auto mb-0.5" /><div className="text-lg font-bold text-[#e4e4ed]">{mod.symbols.length}</div><div className="text-[9px] text-[#5a5a70] uppercase">{t("modules.symbols")}</div></div>
                        <div><FileCode className="h-3 w-3 text-[#5a5a70] mx-auto mb-0.5" /><div className="text-lg font-bold text-[#e4e4ed]">{mod.lineCount.toLocaleString()}</div><div className="text-[9px] text-[#5a5a70] uppercase">{t("modules.lines")}</div></div>
                      </div>

                      {/* Dependencies info */}
                      <div className="mt-2.5 flex items-center justify-between text-[10px] text-[#8888a0]">
                        <span>Depends on <span className="text-[#e4e4ed] font-semibold">{ce}</span> · Depended by <span className="text-[#e4e4ed] font-semibold">{ca}</span></span>
                        <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold" style={{ backgroundColor: `${instColor}18`, color: instColor }}>
                          I={instability.toFixed(2)}
                        </span>
                      </div>

                      {/* Size bar */}
                      <div className="mt-2.5 h-1.5 rounded-full bg-elevated overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${barWidth}%`, backgroundColor: cfg.color }} />
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-[9px] font-mono text-[#5a5a70]">{mod.language}</span>
                        <span className="text-[9px] text-[#5a5a70]">{barWidth.toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredModules.length === 0 && (
              <div className="text-center text-[#5a5a70] py-12 text-sm">No modules match your search.</div>
            )}
          </div>
        )}

        {tab === "deps" && (
          <div className="flex flex-col h-full">
            {/* Stats bar + edge type filters */}
            <div className="px-6 py-3 border-b border-[#2a2a3a] flex items-center gap-4 flex-wrap">
              {/* Stats */}
              <div className="flex items-center gap-3 text-xs text-[#8888a0]">
                <span><span className="text-[#e4e4ed] font-semibold">{model.modules.length}</span> modules</span>
                <span className="text-[#2a2a3a]">·</span>
                <span><span className="text-[#e4e4ed] font-semibold">{filteredDepEdges.length}</span> edges</span>
                <span className="text-[#2a2a3a]">·</span>
                <span className="flex items-center gap-1">
                  {layerViolations.length > 0 ? (
                    <><AlertTriangle className="h-3 w-3 text-red-400" /><span className="text-red-400 font-semibold">{layerViolations.length} layer violation{layerViolations.length !== 1 ? "s" : ""}</span></>
                  ) : (
                    <span className="text-emerald-400">No layer violations</span>
                  )}
                </span>
              </div>

              <div className="ml-auto flex items-center gap-2">
                <span className="text-[10px] text-[#5a5a70] uppercase font-semibold">Edge types:</span>
                {(["imports", "calls", "extends", "implements"] as EdgeTypeFilter[]).map((type) => {
                  const isPresent = presentEdgeTypes.includes(type);
                  const isActive = edgeTypeFilters.has(type);
                  return (
                    <label key={type} className={`flex items-center gap-1.5 text-xs cursor-pointer select-none ${!isPresent ? "opacity-30" : ""}`}>
                      <input
                        type="checkbox"
                        checked={isActive}
                        onChange={() => toggleEdgeType(type)}
                        disabled={!isPresent}
                        className="accent-archlens-400 h-3 w-3"
                      />
                      <span className={isActive ? "text-[#e4e4ed]" : "text-[#5a5a70]"}>{type}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Graph */}
            <div className="flex-1">
              <ArchGraph nodes={depNodes} edges={filteredDepEdges} layout="cose" className="h-full" />
            </div>
          </div>
        )}

        {tab === "database" && (
          <div className="h-full">
            <ERDiagram entities={model.dbEntities} className="h-full" />
          </div>
        )}
      </div>
    </div>
  );
}
