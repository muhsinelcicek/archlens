import { useState } from "react";
import { useStore } from "../lib/store.js";
import { useI18n } from "../lib/i18n.js";
import { Boxes, GitBranch, Database, Files, Code2, FileCode } from "lucide-react";
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

export function StructureView() {
  const { model } = useStore();
  const { t } = useI18n();
  const [tab, setTab] = useState<"modules" | "deps" | "database">("modules");

  if (!model) return null;

  const sorted = [...model.modules].sort((a, b) => b.lineCount - a.lineCount);
  const maxLines = Math.max(...sorted.map((m) => m.lineCount), 1);

  // Build dependency graph
  const depNodes: GraphNode[] = model.modules.map((m) => ({
    id: m.name, label: m.name, sublabel: `${m.fileCount}f · ${m.lineCount.toLocaleString()}L`,
    group: m.layer, type: "module",
  }));
  const depEdges: GraphEdge[] = [];
  const f2m = new Map<string, string>();
  const u2m = new Map<string, string>();
  for (const mod of model.modules) {
    for (const uid of mod.symbols) {
      u2m.set(uid, mod.name);
      const sym = model.symbols[uid] as Record<string, unknown> | undefined;
      if (sym) f2m.set(sym.filePath as string, mod.name);
    }
  }
  const edgeMap = new Map<string, number>();
  for (const rel of model.relations) {
    if (rel.type === "composes") continue;
    const srcMod = f2m.get(rel.source) || u2m.get(rel.source);
    const tgtSym = model.symbols[rel.target] as Record<string, unknown> | undefined;
    const tgtMod = tgtSym ? (f2m.get(tgtSym.filePath as string) || u2m.get(rel.target)) : undefined;
    if (srcMod && tgtMod && srcMod !== tgtMod) {
      const key = `${srcMod}→${tgtMod}`;
      edgeMap.set(key, (edgeMap.get(key) || 0) + 1);
    }
  }
  for (const [key, weight] of edgeMap) {
    const [src, tgt] = key.split("→");
    depEdges.push({ source: src, target: tgt, weight, type: "imports" });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-[#2a2a3a] px-6 pt-4">
        {[
          { id: "modules" as const, icon: Boxes, label: `${t("nav.modules")} (${model.modules.length})` },
          { id: "deps" as const, icon: GitBranch, label: `${t("nav.dependencies")} (${depEdges.length})` },
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sorted.map((mod) => {
                const cfg = layerConfig[mod.layer] || layerConfig.unknown;
                const barWidth = (mod.lineCount / maxLines) * 100;
                return (
                  <div key={mod.name} className="rounded-xl border overflow-hidden transition-all hover:scale-[1.01] hover:shadow-lg" style={{ borderColor: `${cfg.color}30` }}>
                    <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: `${cfg.color}08` }}>
                      <h3 className="font-mono font-bold text-base" style={{ color: cfg.color }}>{mod.name}/</h3>
                      <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full" style={{ backgroundColor: `${cfg.color}20`, color: cfg.color }}>{cfg.label}</span>
                    </div>
                    <div className="px-4 py-3 bg-surface">
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div><Files className="h-3 w-3 text-[#5a5a70] mx-auto mb-0.5" /><div className="text-lg font-bold text-[#e4e4ed]">{mod.fileCount}</div><div className="text-[9px] text-[#5a5a70] uppercase">{t("modules.files")}</div></div>
                        <div><Code2 className="h-3 w-3 text-[#5a5a70] mx-auto mb-0.5" /><div className="text-lg font-bold text-[#e4e4ed]">{mod.symbols.length}</div><div className="text-[9px] text-[#5a5a70] uppercase">{t("modules.symbols")}</div></div>
                        <div><FileCode className="h-3 w-3 text-[#5a5a70] mx-auto mb-0.5" /><div className="text-lg font-bold text-[#e4e4ed]">{mod.lineCount.toLocaleString()}</div><div className="text-[9px] text-[#5a5a70] uppercase">{t("modules.lines")}</div></div>
                      </div>
                      <div className="mt-3 h-1.5 rounded-full bg-elevated overflow-hidden">
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
          </div>
        )}

        {tab === "deps" && (
          <div className="h-full">
            <ArchGraph nodes={depNodes} edges={depEdges} layout="cose" className="h-full" />
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
