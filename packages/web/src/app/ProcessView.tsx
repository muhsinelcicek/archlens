import { useI18n } from "../lib/i18n.js";
import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useStore, type ArchModel } from "../lib/store.js";
import {
  Database, Globe, BarChart3, Bell, Monitor, Upload,
  ChevronDown, ChevronRight, ArrowRight, Lightbulb, Zap,
  FileOutput, Cpu, Server, Search, ArrowUpDown, Layers,
  Activity, GitBranch, ExternalLink, Hash, Box,
  List, AlignJustify,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface BusinessProcess {
  id: string; name: string; description: string; category: string;
  dataSources: Array<{ name: string; type: string; format?: string; description: string }>;
  steps: Array<{ order: number; name: string; description: string; algorithm?: string; symbolRef?: string; inputData: string; outputData: string; details?: string[] }>;
  outputs: Array<{ name: string; type: string; format?: string; description: string }>;
  relatedSymbols: string[];
}

type SortKey = "name" | "steps" | "category";
type ViewMode = "horizontal" | "vertical";

/* ------------------------------------------------------------------ */
/*  Category config                                                    */
/* ------------------------------------------------------------------ */

const catCfg: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  "data-ingestion": { icon: Upload, color: "#06b6d4", label: "Data Ingestion" },
  analysis: { icon: BarChart3, color: "#a78bfa", label: "Analysis" },
  "api-service": { icon: Globe, color: "#60a5fa", label: "API Service" },
  presentation: { icon: Monitor, color: "#34d399", label: "Presentation" },
  alert: { icon: Bell, color: "#fbbf24", label: "Alerts" },
};

const layerColors: Record<string, string> = {
  presentation: "#34d399", api: "#60a5fa", application: "#fbbf24",
  domain: "#a78bfa", infrastructure: "#f87171", config: "#94a3b8",
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getComplexity(stepCount: number): { label: string; color: string; bg: string } {
  if (stepCount <= 2) return { label: "Simple", color: "#34d399", bg: "bg-emerald-500/10" };
  if (stepCount <= 6) return { label: "Medium", color: "#fbbf24", bg: "bg-amber-500/10" };
  return { label: "Complex", color: "#f87171", bg: "bg-red-500/10" };
}

function extractModulesFromProcess(process: BusinessProcess, modules: ArchModel["modules"]): ArchModel["modules"][number][] {
  const refs = new Set<string>();
  for (const step of process.steps) {
    if (step.symbolRef) refs.add(step.symbolRef);
  }
  for (const sym of process.relatedSymbols) refs.add(sym);
  if (refs.size === 0) return [];

  return modules.filter((m) =>
    m.symbols.some((s) => {
      for (const ref of refs) {
        if (s === ref || s.includes(ref) || ref.includes(s)) return true;
      }
      return false;
    })
  );
}

/* ------------------------------------------------------------------ */
/*  Stat Card                                                          */
/* ------------------------------------------------------------------ */

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border-default)] bg-deep p-4 flex items-start gap-3 min-w-0">
      <div className="rounded-lg p-2 flex-shrink-0" style={{ backgroundColor: `${color}12` }}>
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase font-semibold text-[var(--color-text-muted)] tracking-wider">{label}</div>
        <div className="text-xl font-bold text-[var(--color-text-primary)] mt-0.5">{value}</div>
        {sub && <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5 truncate">{sub}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  System Architecture Map (Enhanced)                                 */
/* ------------------------------------------------------------------ */

function SystemMap({ model, processes, highlightedModules }: {
  model: ArchModel;
  processes: BusinessProcess[];
  highlightedModules: Set<string>;
}) {
  const navigate = useNavigate();
  const [hoveredModule, setHoveredModule] = useState<string | null>(null);

  const layers = useMemo(() => {
    const g = new Map<string, typeof model.modules>();
    for (const m of model.modules) {
      const l = m.layer === "unknown" ? "other" : m.layer;
      if (!g.has(l)) g.set(l, []);
      g.get(l)!.push(m);
    }
    return g;
  }, [model]);

  // Count processes per module
  const moduleProcessCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of processes) {
      const mods = extractModulesFromProcess(p, model.modules);
      for (const m of mods) counts.set(m.name, (counts.get(m.name) || 0) + 1);
    }
    return counts;
  }, [processes, model.modules]);

  // Count endpoints per module
  const moduleEndpointCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ep of model.apiEndpoints) {
      for (const m of model.modules) {
        if (m.symbols.includes(ep.handler) || ep.filePath.includes(m.path)) {
          counts.set(m.name, (counts.get(m.name) || 0) + 1);
        }
      }
    }
    return counts;
  }, [model]);

  // Processes touching hovered module
  const hoveredProcesses = useMemo(() => {
    if (!hoveredModule) return new Set<string>();
    const mod = model.modules.find((m) => m.name === hoveredModule);
    if (!mod) return new Set<string>();
    const ids = new Set<string>();
    for (const p of processes) {
      const mods = extractModulesFromProcess(p, model.modules);
      if (mods.some((m) => m.name === hoveredModule)) ids.add(p.id);
    }
    return ids;
  }, [hoveredModule, processes, model.modules]);

  const orderedLayers = ["presentation", "api", "application", "domain", "infrastructure", "config", "other"]
    .filter((l) => layers.has(l));

  return (
    <div className="rounded-xl border border-[var(--color-border-default)] bg-deep p-5 overflow-x-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-archlens-400" />
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">System Architecture Map</span>
          <span className="text-[10px] text-[var(--color-text-muted)] ml-2">
            {model.modules.length} services &middot; {model.apiEndpoints.length} endpoints &middot; {model.dbEntities.length} tables
          </span>
        </div>
        <button
          onClick={() => navigate("/architecture")}
          className="flex items-center gap-1 text-[10px] text-archlens-400 hover:text-archlens-300 transition-colors"
        >
          <ExternalLink className="h-3 w-3" /> View Full Architecture
        </button>
      </div>

      {/* SVG connection map */}
      <div className="relative">
        <div className="flex gap-3 min-w-max items-stretch">
          {/* Client node */}
          <div className="flex flex-col items-center justify-center gap-1">
            <div className="w-14 h-14 rounded-xl bg-[var(--color-border-subtle)] border border-[var(--color-border-default)] flex items-center justify-center">
              <Monitor className="h-5 w-5 text-[var(--color-text-muted)]" />
            </div>
            <span className="text-[8px] text-[var(--color-text-muted)]">Client</span>
          </div>

          {/* Connector */}
          <div className="flex items-center">
            <svg width="32" height="2" className="flex-shrink-0">
              <line x1="0" y1="1" x2="32" y2="1" stroke="var(--color-border-default)" strokeWidth="2" strokeDasharray="4 2" />
              <polygon points="28,0 32,1 28,2" fill="#3a3a4a" />
            </svg>
          </div>

          {/* Layer boxes */}
          {orderedLayers.map((layer, i) => {
            const mods = layers.get(layer) || [];
            const c = layerColors[layer] || "#6b7280";
            return (
              <div key={layer} className="flex items-center gap-3">
                <div
                  className="rounded-xl border p-3 min-w-[140px] cursor-pointer transition-all hover:shadow-lg"
                  style={{
                    borderColor: `${c}30`,
                    backgroundColor: `${c}08`,
                  }}
                  onClick={() => navigate("/architecture")}
                >
                  <div className="text-[9px] uppercase font-bold mb-2 tracking-wider" style={{ color: c }}>{layer}</div>
                  <div className="space-y-1">
                    {mods.slice(0, 6).map((m) => {
                      const epCount = moduleEndpointCount.get(m.name) || 0;
                      const procCount = moduleProcessCount.get(m.name) || 0;
                      const isHighlighted = highlightedModules.has(m.name);
                      const isHovered = hoveredModule === m.name;
                      return (
                        <div
                          key={m.name}
                          className="flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-all cursor-pointer"
                          style={{
                            backgroundColor: isHovered ? `${c}20` : isHighlighted ? `${c}10` : "transparent",
                            outline: isHovered ? `1px solid ${c}40` : "none",
                          }}
                          onMouseEnter={() => setHoveredModule(m.name)}
                          onMouseLeave={() => setHoveredModule(null)}
                        >
                          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: c }} />
                          <span className="text-[9px] font-mono text-[var(--color-text-secondary)] truncate max-w-[100px]">{m.name}</span>
                          {(epCount > 0 || procCount > 0) && (
                            <span className="text-[7px] text-[var(--color-text-muted)] ml-auto whitespace-nowrap">
                              {epCount > 0 && <span>{epCount}ep</span>}
                              {epCount > 0 && procCount > 0 && <span> &middot; </span>}
                              {procCount > 0 && <span>{procCount}p</span>}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {mods.length > 6 && (
                    <span className="text-[8px] text-[var(--color-text-muted)] mt-1 block">+{mods.length - 6} more</span>
                  )}
                </div>
                {i < orderedLayers.length - 1 && (
                  <svg width="32" height="2" className="flex-shrink-0">
                    <line x1="0" y1="1" x2="32" y2="1" stroke="var(--color-border-default)" strokeWidth="2" strokeDasharray="4 2" />
                    <polygon points="28,0 32,1 28,2" fill="#3a3a4a" />
                  </svg>
                )}
              </div>
            );
          })}

          {/* Connector */}
          <div className="flex items-center">
            <svg width="32" height="2" className="flex-shrink-0">
              <line x1="0" y1="1" x2="32" y2="1" stroke="var(--color-border-default)" strokeWidth="2" strokeDasharray="4 2" />
              <polygon points="28,0 32,1 28,2" fill="#3a3a4a" />
            </svg>
          </div>

          {/* Database node */}
          <div className="flex flex-col items-center justify-center gap-1">
            <div className="w-14 h-14 rounded-xl bg-[var(--color-border-subtle)] border border-[var(--color-border-default)] flex items-center justify-center">
              <Database className="h-5 w-5 text-[var(--color-text-muted)]" />
            </div>
            <span className="text-[8px] text-[var(--color-text-muted)]">{model.dbEntities.length} tables</span>
          </div>
        </div>
      </div>

      {/* Hovered module info bar */}
      {hoveredModule && hoveredProcesses.size > 0 && (
        <div className="mt-3 px-3 py-2 rounded-lg bg-[var(--color-border-subtle)] border border-[var(--color-border-default)] text-[10px] text-[var(--color-text-secondary)] flex items-center gap-2 animate-slide-up">
          <Box className="h-3 w-3 text-archlens-400 flex-shrink-0" />
          <span className="font-semibold text-[var(--color-text-primary)]">{hoveredModule}</span>
          <span>&middot;</span>
          <span>Involved in {hoveredProcesses.size} process{hoveredProcesses.size !== 1 ? "es" : ""}</span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Vertical Timeline View                                             */
/* ------------------------------------------------------------------ */

function VerticalTimeline({ process, modules, cfg }: {
  process: BusinessProcess;
  modules: ArchModel["modules"];
  cfg: { color: string };
}) {
  const navigate = useNavigate();
  const involvedModules = extractModulesFromProcess(process, modules);

  return (
    <div className="px-5 py-4 bg-deep">
      {/* Data sources */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-full bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center flex-shrink-0">
          <Database className="h-3.5 w-3.5 text-cyan-400" />
        </div>
        <div>
          <div className="text-[8px] text-cyan-600 uppercase font-semibold">Input Sources</div>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {process.dataSources.map((d, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-mono">
                {d.name}
                {d.format && <span className="text-cyan-600 ml-1">({d.format})</span>}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Vertical line + steps */}
      <div className="relative ml-4 border-l-2 border-dashed pl-6 space-y-3" style={{ borderColor: `${cfg.color}30` }}>
        {process.steps.map((step, i) => (
          <div key={i} className="relative group">
            {/* Circle on the line */}
            <div
              className="absolute -left-[31px] w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold border-2"
              style={{
                backgroundColor: `${cfg.color}15`,
                borderColor: `${cfg.color}40`,
                color: cfg.color,
              }}
            >
              {step.order}
            </div>

            {/* Step card */}
            <div className="rounded-lg border p-3 transition-all hover:shadow-md" style={{ borderColor: `${cfg.color}15`, backgroundColor: `${cfg.color}03` }}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h5 className="text-sm font-semibold text-[var(--color-text-primary)]">{step.name}</h5>
                  <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5 leading-relaxed">{step.description}</p>
                </div>
              </div>

              {/* I/O badges */}
              <div className="flex items-center gap-2 mt-2 text-[10px] font-mono flex-wrap">
                <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">{step.inputData}</span>
                <ArrowRight className="h-3 w-3 text-[var(--color-text-muted)] flex-shrink-0" />
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{step.outputData}</span>
              </div>

              {/* Algorithm */}
              {step.algorithm && (
                <div className="mt-2 rounded-lg bg-amber-500/5 border border-amber-500/20 p-2.5">
                  <div className="flex items-center gap-1 text-[9px] font-semibold uppercase text-amber-500 mb-0.5">
                    <Lightbulb className="h-3 w-3" /> Algorithm
                  </div>
                  <p className="text-[10px] text-[var(--color-text-secondary)] font-mono leading-relaxed">{step.algorithm}</p>
                </div>
              )}

              {/* Details */}
              {step.details?.map((d, j) => (
                <div key={j} className="flex items-start gap-2 text-[10px] text-[var(--color-text-secondary)] mt-1">
                  <Zap className="h-3 w-3 mt-0.5 flex-shrink-0" style={{ color: cfg.color }} />{d}
                </div>
              ))}

              {/* Symbol ref badge */}
              {step.symbolRef && (
                <div className="mt-2 inline-flex items-center gap-1 text-[9px] font-mono px-2 py-0.5 rounded bg-[var(--color-border-subtle)] border border-[var(--color-border-default)] text-[var(--color-text-muted)]">
                  <Hash className="h-2.5 w-2.5" /> {step.symbolRef}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Outputs */}
      <div className="flex items-center gap-3 mt-4">
        <div className="w-8 h-8 rounded-full bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center flex-shrink-0">
          <FileOutput className="h-3.5 w-3.5 text-emerald-400" />
        </div>
        <div>
          <div className="text-[8px] text-emerald-600 uppercase font-semibold">Outputs</div>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {process.outputs.map((o, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-mono">
                {o.name}
                {o.format && <span className="text-emerald-600 ml-1">({o.format})</span>}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Module references + navigation */}
      {involvedModules.length > 0 && (
        <div className="mt-4 pt-3 border-t border-[var(--color-border-subtle)]">
          <div className="text-[9px] uppercase font-semibold text-[var(--color-text-muted)] mb-1.5 flex items-center gap-1">
            <Layers className="h-3 w-3" /> Involved Modules
          </div>
          <div className="flex flex-wrap gap-1.5">
            {involvedModules.map((m) => (
              <button
                key={m.name}
                onClick={() => navigate("/architecture")}
                className="text-[10px] px-2 py-1 rounded-md bg-archlens-500/8 text-archlens-400 border border-archlens-500/20 font-mono hover:bg-archlens-500/15 transition-colors flex items-center gap-1"
              >
                <Box className="h-2.5 w-2.5" /> {m.name}
                <span className="text-[8px] text-[var(--color-text-muted)]">({m.layer})</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Horizontal Pipeline (kept from original, polished)                 */
/* ------------------------------------------------------------------ */

function HorizontalPipeline({ process, cfg }: {
  process: BusinessProcess;
  cfg: { color: string };
}) {
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  return (
    <>
      <div className="px-5 py-4 bg-deep">
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          <div className="flex-shrink-0 rounded-lg bg-cyan-500/8 border border-cyan-500/20 px-3 py-2">
            <div className="text-[8px] text-cyan-600 uppercase mb-0.5">Input</div>
            <div className="text-[10px] text-cyan-300 font-mono">{process.dataSources.map((d) => d.name).join(", ")}</div>
          </div>
          <ArrowRight className="h-3 w-3 text-[var(--color-border-default)] flex-shrink-0" />
          {process.steps.map((step, i) => (
            <div key={i} className="flex items-center gap-1 flex-shrink-0">
              {i > 0 && <ArrowRight className="h-2.5 w-2.5 text-[var(--color-border-default)]" />}
              <button
                onClick={() => setExpandedStep(expandedStep === i ? null : i)}
                className="rounded-lg border px-3 py-2 text-[10px] font-medium whitespace-nowrap transition-all"
                style={{
                  borderColor: expandedStep === i ? `${cfg.color}40` : `${cfg.color}20`,
                  backgroundColor: expandedStep === i ? `${cfg.color}10` : "transparent",
                  color: cfg.color,
                }}
              >
                <span
                  className="w-4 h-4 inline-flex items-center justify-center rounded-full text-[8px] font-bold mr-1"
                  style={{ backgroundColor: `${cfg.color}20` }}
                >
                  {step.order}
                </span>
                {step.name}
              </button>
            </div>
          ))}
          <ArrowRight className="h-3 w-3 text-[var(--color-border-default)] flex-shrink-0" />
          <div className="flex-shrink-0 rounded-lg bg-emerald-500/8 border border-emerald-500/20 px-3 py-2">
            <div className="text-[8px] text-emerald-600 uppercase mb-0.5">Output</div>
            <div className="text-[10px] text-emerald-300 font-mono">{process.outputs.map((o) => o.name).join(", ")}</div>
          </div>
        </div>
      </div>

      {expandedStep !== null && process.steps[expandedStep] && (
        <div className="px-5 py-4 border-t border-[var(--color-border-subtle)] animate-slide-up">
          <div className="flex items-start gap-3">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ backgroundColor: `${cfg.color}20`, color: cfg.color }}
            >
              {process.steps[expandedStep].order}
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-sm text-[var(--color-text-primary)]">{process.steps[expandedStep].name}</h4>
              <p className="text-xs text-[var(--color-text-secondary)] mt-1">{process.steps[expandedStep].description}</p>
              <div className="flex items-center gap-2 mt-2 text-[10px] font-mono">
                <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">{process.steps[expandedStep].inputData}</span>
                <ArrowRight className="h-3 w-3 text-[var(--color-text-muted)]" />
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{process.steps[expandedStep].outputData}</span>
              </div>
              {process.steps[expandedStep].algorithm && (
                <div className="mt-3 rounded-lg bg-amber-500/5 border border-amber-500/20 p-3">
                  <div className="flex items-center gap-1 text-[9px] font-semibold uppercase text-amber-500 mb-1"><Lightbulb className="h-3 w-3" /> Algorithm</div>
                  <p className="text-[11px] text-[var(--color-text-secondary)] font-mono leading-relaxed">{process.steps[expandedStep].algorithm}</p>
                </div>
              )}
              {process.steps[expandedStep].details?.map((d, j) => (
                <div key={j} className="flex items-start gap-2 text-[10px] text-[var(--color-text-secondary)] mt-1">
                  <Zap className="h-3 w-3 mt-0.5 flex-shrink-0" style={{ color: cfg.color }} />{d}
                </div>
              ))}
              {process.steps[expandedStep].symbolRef && (
                <div className="mt-2 text-[9px] font-mono text-[var(--color-text-muted)]">ref: {process.steps[expandedStep].symbolRef}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Process Card (Enhanced)                                            */
/* ------------------------------------------------------------------ */

function ProcessCard({ process, isExpanded, onToggle, modules, viewMode }: {
  process: BusinessProcess;
  isExpanded: boolean;
  onToggle: () => void;
  modules: ArchModel["modules"];
  viewMode: ViewMode;
}) {
  const navigate = useNavigate();
  const cfg = catCfg[process.category] || catCfg.analysis;
  const Icon = cfg.icon;
  const complexity = getComplexity(process.steps.length);
  const involvedModules = useMemo(() => extractModulesFromProcess(process, modules), [process, modules]);

  // Build data flow summary
  const flowSummary = useMemo(() => {
    const inputs = process.dataSources.map((d) => d.format || d.type).filter(Boolean);
    const outputs = process.outputs.map((o) => o.format || o.type).filter(Boolean);
    const inputStr = inputs.length > 0 ? inputs.slice(0, 2).join(", ") : "Data";
    const outputStr = outputs.length > 0 ? outputs.slice(0, 2).join(", ") : "Result";
    return `${inputStr} → ${process.steps.length} steps → ${outputStr}`;
  }, [process]);

  return (
    <div
      className="rounded-xl border overflow-hidden transition-all"
      style={{ borderColor: isExpanded ? `${cfg.color}40` : `${cfg.color}15` }}
    >
      {/* Header */}
      <button onClick={onToggle} className="w-full flex items-center gap-4 px-5 py-4 hover:bg-hover transition-colors text-left">
        <div className="rounded-lg p-2.5 flex-shrink-0" style={{ backgroundColor: `${cfg.color}12` }}>
          <Icon className="h-5 w-5" style={{ color: cfg.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-[var(--color-text-primary)]">{process.name}</h3>
            {/* Complexity badge */}
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${complexity.bg}`}
              style={{ color: complexity.color }}
            >
              {complexity.label}
            </span>
          </div>
          <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 line-clamp-1">{process.description}</p>
          {/* Data flow summary */}
          <div className="text-[9px] text-[var(--color-text-muted)] mt-1 font-mono flex items-center gap-1">
            <GitBranch className="h-2.5 w-2.5 flex-shrink-0" />
            {flowSummary}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-muted)]">
            <span>{process.steps.length} steps</span>
            <span
              className="rounded-full px-2 py-0.5"
              style={{ backgroundColor: `${cfg.color}12`, color: cfg.color }}
            >
              {cfg.label}
            </span>
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </div>
          {/* Module badges (collapsed view) */}
          {involvedModules.length > 0 && !isExpanded && (
            <div className="flex items-center gap-1">
              {involvedModules.slice(0, 3).map((m) => (
                <span
                  key={m.name}
                  className="text-[8px] px-1.5 py-0.5 rounded bg-archlens-500/8 text-archlens-400 border border-archlens-500/15 font-mono"
                >
                  {m.name}
                </span>
              ))}
              {involvedModules.length > 3 && (
                <span className="text-[8px] text-[var(--color-text-muted)]">+{involvedModules.length - 3}</span>
              )}
            </div>
          )}
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t" style={{ borderColor: `${cfg.color}15` }}>
          {viewMode === "horizontal" ? (
            <HorizontalPipeline process={process} cfg={cfg} />
          ) : (
            <VerticalTimeline process={process} modules={modules} cfg={cfg} />
          )}

          {/* Footer with view in architecture button */}
          <div className="px-5 py-3 border-t border-[var(--color-border-subtle)] flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              {involvedModules.length > 0 && viewMode === "horizontal" && (
                <>
                  <span className="text-[9px] uppercase font-semibold text-[var(--color-text-muted)]">Modules:</span>
                  {involvedModules.map((m) => (
                    <span
                      key={m.name}
                      className="text-[9px] px-2 py-0.5 rounded-md bg-archlens-500/8 text-archlens-400 border border-archlens-500/20 font-mono"
                    >
                      {m.name}
                    </span>
                  ))}
                </>
              )}
            </div>
            <button
              onClick={() => navigate("/architecture")}
              className="flex items-center gap-1 text-[10px] text-archlens-400 hover:text-archlens-300 transition-colors font-medium"
            >
              <ExternalLink className="h-3 w-3" /> View in Architecture
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main View                                                          */
/* ------------------------------------------------------------------ */

export function ProcessView() {
  const { model } = useStore();
  const [expandedProcess, setExpandedProcess] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [viewMode, setViewMode] = useState<ViewMode>("horizontal");

  if (!model) return null;
  const { t } = useI18n();
  const processes = model.businessProcesses || [];

  /* ---------- computed stats ---------- */
  const stats = useMemo(() => {
    const totalSteps = processes.reduce((a, p) => a + p.steps.length, 0);
    const dataSources = new Set<string>();
    const outputs = new Set<string>();
    for (const p of processes) {
      for (const ds of p.dataSources) dataSources.add(ds.name);
      for (const o of p.outputs) outputs.add(o.name);
    }
    return { totalSteps, dataSources: dataSources.size, outputs: outputs.size, dataSourceNames: [...dataSources].slice(0, 4).join(", "), outputNames: [...outputs].slice(0, 4).join(", ") };
  }, [processes]);

  /* ---------- filter + sort ---------- */
  const filtered = useMemo(() => {
    let list = processes;

    // category filter
    if (filterCategory) list = list.filter((p) => p.category === filterCategory);

    // search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.steps.some((s) => s.name.toLowerCase().includes(q))
      );
    }

    // sort
    const sorted = [...list];
    if (sortKey === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortKey === "steps") sorted.sort((a, b) => b.steps.length - a.steps.length);
    else if (sortKey === "category") sorted.sort((a, b) => a.category.localeCompare(b.category));

    return sorted;
  }, [processes, filterCategory, searchQuery, sortKey]);

  /* ---------- category counts ---------- */
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of processes) m.set(p.category, (m.get(p.category) || 0) + 1);
    return m;
  }, [processes]);

  /* ---------- highlighted modules (from expanded process) ---------- */
  const highlightedModules = useMemo(() => {
    if (!expandedProcess) return new Set<string>();
    const proc = processes.find((p) => p.id === expandedProcess);
    if (!proc) return new Set<string>();
    const mods = extractModulesFromProcess(proc, model.modules);
    return new Set(mods.map((m) => m.name));
  }, [expandedProcess, processes, model.modules]);

  const cycleSortKey = useCallback(() => {
    setSortKey((prev) => {
      if (prev === "name") return "steps";
      if (prev === "steps") return "category";
      return "name";
    });
  }, []);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1200px]">
      {/* Title */}
      <div>
        <h2 className="text-2xl font-bold">{t("proc.title")}</h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          {processes.length} processes &middot; {stats.totalSteps} steps &mdash; click to explore algorithms and data flow
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Activity} label="Total Processes" value={processes.length} sub={`${[...counts.keys()].length} categories`} color="#a78bfa" />
        <StatCard icon={Layers} label="Total Steps" value={stats.totalSteps} sub={`~${processes.length > 0 ? (stats.totalSteps / processes.length).toFixed(1) : 0} avg per process`} color="#60a5fa" />
        <StatCard icon={Database} label="Data Sources" value={stats.dataSources} sub={stats.dataSourceNames} color="#06b6d4" />
        <StatCard icon={FileOutput} label="Outputs" value={stats.outputs} sub={stats.outputNames} color="#34d399" />
      </div>

      {/* System Architecture Map */}
      <SystemMap model={model} processes={processes} highlightedModules={highlightedModules} />

      {/* Search + Filters + Sort bar */}
      <div className="space-y-3">
        {/* Search + sort row */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-text-muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search processes by name, description, or step..."
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-deep border border-[var(--color-border-default)] text-sm text-[var(--color-text-primary)] placeholder:text-[#3a3a50] focus:outline-none focus:border-archlens-500/40 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
              >
                &times;
              </button>
            )}
          </div>

          {/* Sort button */}
          <button
            onClick={cycleSortKey}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--color-border-default)] text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)] transition-colors"
          >
            <ArrowUpDown className="h-3 w-3" />
            Sort: {sortKey === "name" ? "Name" : sortKey === "steps" ? "Steps" : "Category"}
          </button>

          {/* View mode toggle */}
          <div className="flex items-center border border-[var(--color-border-default)] rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode("horizontal")}
              className={`px-2.5 py-2 transition-colors ${viewMode === "horizontal" ? "bg-archlens-500/12 text-archlens-300" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"}`}
              title="Horizontal pipeline view"
            >
              <AlignJustify className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode("vertical")}
              className={`px-2.5 py-2 transition-colors ${viewMode === "vertical" ? "bg-archlens-500/12 text-archlens-300" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"}`}
              title="Vertical timeline view"
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Category pills */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilterCategory(null)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
              !filterCategory
                ? "bg-archlens-500/12 border-archlens-500/30 text-archlens-300"
                : "border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            }`}
          >
            All ({processes.length})
          </button>
          {[...counts.entries()].map(([cat, count]) => {
            const c = catCfg[cat] || catCfg.analysis;
            const CatIcon = c.icon;
            return (
              <button
                key={cat}
                onClick={() => setFilterCategory(filterCategory === cat ? null : cat)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium border flex items-center gap-1.5 transition-colors"
                style={{
                  backgroundColor: filterCategory === cat ? `${c.color}12` : "transparent",
                  borderColor: filterCategory === cat ? `${c.color}30` : "var(--color-border-default)",
                  color: filterCategory === cat ? c.color : "var(--color-text-muted)",
                }}
              >
                <CatIcon className="h-3 w-3" />
                {c.label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Results count */}
      {(searchQuery || filterCategory) && (
        <div className="text-[11px] text-[var(--color-text-muted)]">
          Showing {filtered.length} of {processes.length} processes
          {searchQuery && <span> matching &ldquo;{searchQuery}&rdquo;</span>}
        </div>
      )}

      {/* Process Cards */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-[var(--color-border-default)] bg-deep p-8 text-center">
            <Search className="h-8 w-8 text-[var(--color-border-default)] mx-auto mb-2" />
            <p className="text-sm text-[var(--color-text-muted)]">No processes match your search.</p>
            <button onClick={() => { setSearchQuery(""); setFilterCategory(null); }} className="text-xs text-archlens-400 hover:text-archlens-300 mt-1">
              Clear filters
            </button>
          </div>
        ) : (
          filtered.map((p) => (
            <ProcessCard
              key={p.id}
              process={p}
              isExpanded={expandedProcess === p.id}
              onToggle={() => setExpandedProcess(expandedProcess === p.id ? null : p.id)}
              modules={model.modules}
              viewMode={viewMode}
            />
          ))
        )}
      </div>
    </div>
  );
}
