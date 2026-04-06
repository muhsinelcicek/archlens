import { useI18n } from "../lib/i18n.js";
import { useState, useMemo } from "react";
import { useStore, type ArchModel } from "../lib/store.js";
import {
  Database, Globe, BarChart3, Bell, Monitor, Upload,
  ChevronDown, ChevronRight, ArrowRight, Lightbulb, Zap,
  FileOutput, Cpu, Server,
} from "lucide-react";

interface BusinessProcess {
  id: string; name: string; description: string; category: string;
  dataSources: Array<{ name: string; type: string; format?: string; description: string }>;
  steps: Array<{ order: number; name: string; description: string; algorithm?: string; symbolRef?: string; inputData: string; outputData: string; details?: string[] }>;
  outputs: Array<{ name: string; type: string; format?: string; description: string }>;
  relatedSymbols: string[];
}

const catCfg: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  "data-ingestion": { icon: Upload, color: "#06b6d4", label: "Data Ingestion" },
  analysis: { icon: BarChart3, color: "#a78bfa", label: "Analysis" },
  "api-service": { icon: Globe, color: "#60a5fa", label: "API Service" },
  presentation: { icon: Monitor, color: "#34d399", label: "Presentation" },
  alert: { icon: Bell, color: "#fbbf24", label: "Alerts" },
};

const layerColors: Record<string, string> = { presentation: "#34d399", api: "#60a5fa", application: "#fbbf24", domain: "#a78bfa", infrastructure: "#f87171", config: "#94a3b8" };

function SystemMap({ model }: { model: ArchModel }) {
  const layers = useMemo(() => {
    const g = new Map<string, typeof model.modules>();
    for (const m of model.modules) { const l = m.layer === "unknown" ? "other" : m.layer; if (!g.has(l)) g.set(l, []); g.get(l)!.push(m); }
    return g;
  }, [model]);

  return (
    <div className="rounded-xl border border-[#2a2a3a] bg-deep p-5 overflow-x-auto">
      <div className="flex items-center gap-2 mb-4">
        <Server className="h-4 w-4 text-archlens-400" />
        <span className="text-sm font-semibold text-[#e4e4ed]">System Architecture Map</span>
        <span className="text-[10px] text-[#5a5a70] ml-2">{model.modules.length} services · {model.apiEndpoints.length} endpoints · {model.dbEntities.length} tables</span>
      </div>
      <div className="flex gap-3 min-w-max items-center">
        <div className="flex flex-col items-center gap-1"><div className="w-14 h-14 rounded-xl bg-[#1e1e2a] border border-[#2a2a3a] flex items-center justify-center"><Monitor className="h-5 w-5 text-[#5a5a70]" /></div><span className="text-[8px] text-[#5a5a70]">Client</span></div>
        <ArrowRight className="h-3 w-3 text-[#2a2a3a]" />
        {["presentation", "api", "application", "domain", "infrastructure", "config", "other"].filter((l) => layers.has(l)).map((layer, i, arr) => {
          const mods = layers.get(layer) || [];
          const c = layerColors[layer] || "#6b7280";
          return (
            <div key={layer} className="flex items-center gap-3">
              <div className="rounded-xl border p-2.5 min-w-[120px]" style={{ borderColor: `${c}25`, backgroundColor: `${c}05` }}>
                <div className="text-[8px] uppercase font-semibold mb-1.5" style={{ color: c }}>{layer}</div>
                {mods.slice(0, 5).map((m) => (<div key={m.name} className="flex items-center gap-1"><div className="w-1 h-1 rounded-full" style={{ backgroundColor: c }} /><span className="text-[9px] font-mono text-[#8888a0] truncate">{m.name}</span></div>))}
                {mods.length > 5 && <span className="text-[8px] text-[#5a5a70]">+{mods.length - 5}</span>}
              </div>
              {i < arr.length - 1 && <ArrowRight className="h-3 w-3 text-[#2a2a3a]" />}
            </div>
          );
        })}
        <ArrowRight className="h-3 w-3 text-[#2a2a3a]" />
        <div className="flex flex-col items-center gap-1"><div className="w-14 h-14 rounded-xl bg-[#1e1e2a] border border-[#2a2a3a] flex items-center justify-center"><Database className="h-5 w-5 text-[#5a5a70]" /></div><span className="text-[8px] text-[#5a5a70]">{model.dbEntities.length} tables</span></div>
      </div>
    </div>
  );
}

function ProcessCard({ process, isExpanded, onToggle }: { process: BusinessProcess; isExpanded: boolean; onToggle: () => void }) {
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const cfg = catCfg[process.category] || catCfg.analysis;
  const Icon = cfg.icon;

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: isExpanded ? `${cfg.color}40` : `${cfg.color}15` }}>
      <button onClick={onToggle} className="w-full flex items-center gap-4 px-5 py-4 hover:bg-hover transition-colors text-left">
        <div className="rounded-lg p-2.5" style={{ backgroundColor: `${cfg.color}12` }}><Icon className="h-5 w-5" style={{ color: cfg.color }} /></div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-[#e4e4ed]">{process.name}</h3>
          <p className="text-[10px] text-[#5a5a70] mt-0.5 line-clamp-1">{process.description}</p>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-[#5a5a70]">
          <span>{process.steps.length} steps</span>
          <span className="rounded-full px-2 py-0.5" style={{ backgroundColor: `${cfg.color}12`, color: cfg.color }}>{cfg.label}</span>
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t" style={{ borderColor: `${cfg.color}15` }}>
          {/* Pipeline */}
          <div className="px-5 py-4 bg-deep">
            <div className="flex items-center gap-1 overflow-x-auto pb-2">
              <div className="flex-shrink-0 rounded-lg bg-cyan-500/8 border border-cyan-500/20 px-3 py-2">
                <div className="text-[8px] text-cyan-600 uppercase mb-0.5">Input</div>
                <div className="text-[10px] text-cyan-300 font-mono">{process.dataSources.map((d) => d.name).join(", ")}</div>
              </div>
              <ArrowRight className="h-3 w-3 text-[#2a2a3a] flex-shrink-0" />
              {process.steps.map((step, i) => (
                <div key={i} className="flex items-center gap-1 flex-shrink-0">
                  {i > 0 && <ArrowRight className="h-2.5 w-2.5 text-[#2a2a3a]" />}
                  <button onClick={() => setExpandedStep(expandedStep === i ? null : i)}
                    className="rounded-lg border px-3 py-2 text-[10px] font-medium whitespace-nowrap transition-all"
                    style={{ borderColor: expandedStep === i ? `${cfg.color}40` : `${cfg.color}20`, backgroundColor: expandedStep === i ? `${cfg.color}10` : "transparent", color: cfg.color }}>
                    <span className="w-4 h-4 inline-flex items-center justify-center rounded-full text-[8px] font-bold mr-1" style={{ backgroundColor: `${cfg.color}20` }}>{step.order}</span>
                    {step.name}
                  </button>
                </div>
              ))}
              <ArrowRight className="h-3 w-3 text-[#2a2a3a] flex-shrink-0" />
              <div className="flex-shrink-0 rounded-lg bg-emerald-500/8 border border-emerald-500/20 px-3 py-2">
                <div className="text-[8px] text-emerald-600 uppercase mb-0.5">Output</div>
                <div className="text-[10px] text-emerald-300 font-mono">{process.outputs.map((o) => o.name).join(", ")}</div>
              </div>
            </div>
          </div>

          {/* Step Detail */}
          {expandedStep !== null && process.steps[expandedStep] && (
            <div className="px-5 py-4 border-t border-[#1e1e2a] animate-slide-up">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ backgroundColor: `${cfg.color}20`, color: cfg.color }}>{process.steps[expandedStep].order}</div>
                <div className="flex-1">
                  <h4 className="font-semibold text-sm text-[#e4e4ed]">{process.steps[expandedStep].name}</h4>
                  <p className="text-xs text-[#8888a0] mt-1">{process.steps[expandedStep].description}</p>
                  <div className="flex items-center gap-2 mt-2 text-[10px] font-mono">
                    <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">{process.steps[expandedStep].inputData}</span>
                    <ArrowRight className="h-3 w-3 text-[#5a5a70]" />
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{process.steps[expandedStep].outputData}</span>
                  </div>
                  {process.steps[expandedStep].algorithm && (
                    <div className="mt-3 rounded-lg bg-amber-500/5 border border-amber-500/20 p-3">
                      <div className="flex items-center gap-1 text-[9px] font-semibold uppercase text-amber-500 mb-1"><Lightbulb className="h-3 w-3" /> Algorithm</div>
                      <p className="text-[11px] text-[#8888a0] font-mono leading-relaxed">{process.steps[expandedStep].algorithm}</p>
                    </div>
                  )}
                  {process.steps[expandedStep].details?.map((d, j) => (
                    <div key={j} className="flex items-start gap-2 text-[10px] text-[#8888a0] mt-1"><Zap className="h-3 w-3 mt-0.5 flex-shrink-0" style={{ color: cfg.color }} />{d}</div>
                  ))}
                  {process.steps[expandedStep].symbolRef && <div className="mt-2 text-[9px] font-mono text-[#5a5a70]">ref: {process.steps[expandedStep].symbolRef}</div>}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ProcessView() {
  const { model } = useStore();
  const [expandedProcess, setExpandedProcess] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);

  if (!model) return null;
  const { t } = useI18n();
  const processes = model.businessProcesses || [];
  const filtered = filterCategory ? processes.filter((p) => p.category === filterCategory) : processes;
  const counts = new Map<string, number>();
  for (const p of processes) counts.set(p.category, (counts.get(p.category) || 0) + 1);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1200px]">
      <div>
        <h2 className="text-2xl font-bold">{t("proc.title")}</h2>
        <p className="text-sm text-[#5a5a70] mt-1">{processes.length} processes · {processes.reduce((a, p) => a + p.steps.length, 0)} steps — click to explore algorithms and data flow</p>
      </div>

      <SystemMap model={model} />

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFilterCategory(null)} className={`rounded-lg px-3 py-1.5 text-xs font-medium border ${!filterCategory ? "bg-archlens-500/12 border-archlens-500/30 text-archlens-300" : "border-[#2a2a3a] text-[#5a5a70]"}`}>All ({processes.length})</button>
        {[...counts.entries()].map(([cat, count]) => {
          const c = catCfg[cat] || catCfg.analysis;
          return <button key={cat} onClick={() => setFilterCategory(filterCategory === cat ? null : cat)} className="rounded-lg px-3 py-1.5 text-xs font-medium border flex items-center gap-1.5" style={{ backgroundColor: filterCategory === cat ? `${c.color}12` : "transparent", borderColor: filterCategory === cat ? `${c.color}30` : "#2a2a3a", color: filterCategory === cat ? c.color : "#5a5a70" }}><c.icon className="h-3 w-3" />{c.label} ({count})</button>;
        })}
      </div>

      <div className="space-y-3">
        {filtered.map((p) => <ProcessCard key={p.id} process={p} isExpanded={expandedProcess === p.id} onToggle={() => setExpandedProcess(expandedProcess === p.id ? null : p.id)} />)}
      </div>
    </div>
  );
}
