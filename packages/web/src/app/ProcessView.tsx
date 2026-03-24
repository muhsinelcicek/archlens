import { useState } from "react";
import { useStore } from "../lib/store.js";
import {
  Database, Globe, BarChart3, Bell, Monitor, Upload,
  ChevronDown, ChevronRight, ArrowRight, Lightbulb, Zap,
  FileInput, FileOutput, Cpu,
} from "lucide-react";

const categoryConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  "data-ingestion": { icon: Upload, color: "#06b6d4", label: "Data Ingestion" },
  analysis: { icon: BarChart3, color: "#8b5cf6", label: "Analysis" },
  "api-service": { icon: Globe, color: "#3b82f6", label: "API Service" },
  presentation: { icon: Monitor, color: "#10b981", label: "Presentation" },
  alert: { icon: Bell, color: "#f59e0b", label: "Alerts" },
  export: { icon: FileOutput, color: "#ec4899", label: "Export" },
};

interface BusinessProcess {
  id: string;
  name: string;
  description: string;
  category: string;
  dataSources: Array<{ name: string; type: string; format?: string; description: string }>;
  steps: Array<{
    order: number;
    name: string;
    description: string;
    algorithm?: string;
    symbolRef?: string;
    inputData: string;
    outputData: string;
    details?: string[];
  }>;
  outputs: Array<{ name: string; type: string; format?: string; description: string }>;
  relatedSymbols: string[];
}

function ProcessCard({ process, isExpanded, onToggle }: {
  process: BusinessProcess;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const config = categoryConfig[process.category] || categoryConfig.analysis;
  const Icon = config.icon;

  return (
    <div className="rounded-xl border overflow-hidden transition-all" style={{ borderColor: `${config.color}25` }}>
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-elevated transition-colors text-left"
      >
        <div className="rounded-lg p-2.5" style={{ backgroundColor: `${config.color}15` }}>
          <Icon className="h-5 w-5" style={{ color: config.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-[#e4e4ed]">{process.name}</h3>
          <p className="text-xs text-[#5a5a70] mt-0.5 line-clamp-1">{process.description}</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-[#5a5a70]">
          <span>{process.steps.length} steps</span>
          <span className="rounded-full px-2 py-0.5" style={{ backgroundColor: `${config.color}15`, color: config.color }}>
            {config.label}
          </span>
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t" style={{ borderColor: `${config.color}15` }}>
          {/* Description */}
          <div className="px-5 py-4 bg-surface">
            <p className="text-sm text-[#8888a0] leading-relaxed">{process.description}</p>
          </div>

          {/* Data Sources */}
          {process.dataSources.length > 0 && (
            <div className="px-5 py-4 border-t border-[#2a2a3a]">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#5a5a70] mb-3 flex items-center gap-2">
                <FileInput className="h-3.5 w-3.5" />
                Data Sources
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {process.dataSources.map((ds, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-lg bg-elevated border border-[#2a2a3a] p-3">
                    <Database className="h-4 w-4 text-cyan-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-[#e4e4ed]">{ds.name}</div>
                      <div className="text-[11px] text-[#5a5a70] mt-0.5">{ds.description}</div>
                      {ds.format && (
                        <span className="inline-block mt-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-elevated text-[#8888a0]">
                          {ds.format}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Steps — The Core Pipeline */}
          <div className="px-5 py-4 border-t border-[#2a2a3a]">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#5a5a70] mb-4 flex items-center gap-2">
              <Cpu className="h-3.5 w-3.5" />
              Processing Pipeline ({process.steps.length} steps)
            </h4>

            <div className="space-y-0">
              {process.steps.map((step, i) => {
                const isStepExpanded = expandedStep === i;
                return (
                  <div key={i}>
                    {/* Connector line */}
                    {i > 0 && (
                      <div className="flex items-center ml-5 py-1">
                        <div className="w-px h-6 border-l-2 border-dashed" style={{ borderColor: `${config.color}30` }} />
                      </div>
                    )}

                    {/* Step card */}
                    <button
                      onClick={() => setExpandedStep(isStepExpanded ? null : i)}
                      className="w-full text-left"
                    >
                      <div
                        className={`rounded-lg border p-4 transition-all ${
                          isStepExpanded
                            ? "bg-hover shadow-lg"
                            : "bg-surface hover:bg-hover"
                        }`}
                        style={{ borderColor: isStepExpanded ? `${config.color}40` : "rgb(39 39 42 / 0.5)" }}
                      >
                        <div className="flex items-start gap-3">
                          {/* Step number */}
                          <div
                            className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                            style={{ backgroundColor: `${config.color}20`, color: config.color }}
                          >
                            {step.order}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h5 className="font-semibold text-sm text-[#e4e4ed]">{step.name}</h5>
                              {isStepExpanded ? <ChevronDown className="h-3 w-3 text-[#5a5a70]" /> : <ChevronRight className="h-3 w-3 text-[#5a5a70]" />}
                            </div>
                            <p className="text-xs text-[#8888a0] mt-1">{step.description}</p>

                            {/* Data flow badge */}
                            <div className="flex items-center gap-2 mt-2 text-[10px] font-mono">
                              <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                {step.inputData}
                              </span>
                              <ArrowRight className="h-3 w-3 text-[#5a5a70]" />
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                {step.outputData}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Expanded details */}
                        {isStepExpanded && (
                          <div className="mt-4 ml-10 space-y-3">
                            {/* Algorithm */}
                            {step.algorithm && (
                              <div className="rounded-lg bg-surface/50 border border-[#2a2a3a] p-3">
                                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-500 mb-1.5">
                                  <Lightbulb className="h-3 w-3" />
                                  Algorithm
                                </div>
                                <p className="text-xs text-[#8888a0] leading-relaxed font-mono">{step.algorithm}</p>
                              </div>
                            )}

                            {/* Details */}
                            {step.details && step.details.length > 0 && (
                              <div>
                                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#5a5a70] mb-1.5">
                                  Implementation Details
                                </div>
                                <ul className="space-y-1">
                                  {step.details.map((detail, j) => (
                                    <li key={j} className="flex items-start gap-2 text-xs text-[#8888a0]">
                                      <Zap className="h-3 w-3 mt-0.5 flex-shrink-0" style={{ color: config.color }} />
                                      <span>{detail}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Symbol reference */}
                            {step.symbolRef && (
                              <div className="text-[10px] font-mono text-[#5a5a70]">
                                ref: {step.symbolRef}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Outputs */}
          {process.outputs.length > 0 && (
            <div className="px-5 py-4 border-t border-[#2a2a3a]">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#5a5a70] mb-3 flex items-center gap-2">
                <FileOutput className="h-3.5 w-3.5" />
                Outputs
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {process.outputs.map((out, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-lg bg-elevated border border-[#2a2a3a] p-3">
                    <div className="h-4 w-4 mt-0.5 flex-shrink-0 rounded-full" style={{ backgroundColor: config.color }} />
                    <div>
                      <div className="text-sm font-medium text-[#e4e4ed]">{out.name}</div>
                      <div className="text-[11px] text-[#5a5a70] mt-0.5">{out.description}</div>
                      {out.format && (
                        <span className="inline-block mt-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-elevated text-[#8888a0]">
                          {out.format}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
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

  const processes = model.businessProcesses || [];

  if (processes.length === 0) {
    return (
      <div className="p-6">
        <h2 className="text-2xl font-bold mb-4">Business Processes</h2>
        <div className="rounded-xl border border-[#2a2a3a] bg-elevated p-12 text-center">
          <BarChart3 className="h-12 w-12 text-[#5a5a70] mx-auto mb-3" />
          <p className="text-[#5a5a70]">No business processes detected.</p>
        </div>
      </div>
    );
  }

  // Category counts
  const categoryCounts = new Map<string, number>();
  for (const p of processes) {
    categoryCounts.set(p.category, (categoryCounts.get(p.category) || 0) + 1);
  }

  const filtered = filterCategory
    ? processes.filter((p) => p.category === filterCategory)
    : processes;

  const totalSteps = processes.reduce((a, p) => a + p.steps.length, 0);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1100px]">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Business Processes</h2>
        <p className="text-sm text-[#5a5a70] mt-1">
          {processes.length} processes detected with {totalSteps} total processing steps.
          Click to explore algorithms, data sources, and outputs.
        </p>
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilterCategory(null)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
            !filterCategory
              ? "bg-zinc-700 border-zinc-600 text-white"
              : "bg-surface border-[#2a2a3a] text-[#5a5a70] hover:text-[#8888a0]"
          }`}
        >
          All ({processes.length})
        </button>
        {[...categoryCounts.entries()].map(([cat, count]) => {
          const config = categoryConfig[cat] || categoryConfig.analysis;
          const isActive = filterCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setFilterCategory(isActive ? null : cat)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors flex items-center gap-1.5"
              style={{
                backgroundColor: isActive ? `${config.color}15` : "transparent",
                borderColor: isActive ? `${config.color}40` : "rgb(39 39 42)",
                color: isActive ? config.color : "#71717a",
              }}
            >
              <config.icon className="h-3 w-3" />
              {config.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Process pipeline overview — horizontal flow */}
      <div className="rounded-xl border border-[#2a2a3a] bg-surface p-4 overflow-x-auto">
        <div className="flex items-center gap-2 min-w-max">
          {processes.map((p, i) => {
            const config = categoryConfig[p.category] || categoryConfig.analysis;
            return (
              <div key={p.id} className="flex items-center gap-2">
                {i > 0 && (
                  <ArrowRight className="h-4 w-4 text-[#5a5a70] flex-shrink-0" />
                )}
                <button
                  onClick={() => {
                    setExpandedProcess(expandedProcess === p.id ? null : p.id);
                    setFilterCategory(null);
                  }}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-all hover:scale-105"
                  style={{
                    borderColor: expandedProcess === p.id ? `${config.color}50` : `${config.color}20`,
                    backgroundColor: expandedProcess === p.id ? `${config.color}10` : "transparent",
                  }}
                >
                  <config.icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: config.color }} />
                  <span className="font-medium text-[#8888a0] whitespace-nowrap">{p.name}</span>
                  <span className="text-[#5a5a70]">{p.steps.length}s</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Process Cards */}
      <div className="space-y-3">
        {filtered.map((process) => (
          <ProcessCard
            key={process.id}
            process={process}
            isExpanded={expandedProcess === process.id}
            onToggle={() => setExpandedProcess(expandedProcess === process.id ? null : process.id)}
          />
        ))}
      </div>
    </div>
  );
}
