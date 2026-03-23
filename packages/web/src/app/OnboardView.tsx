import { useStore } from "../lib/store.js";
import {
  Rocket, Layers, Database, Globe, Cpu, ArrowRight,
  BookOpen, Code2, GitBranch, Box, Zap, Users,
} from "lucide-react";

const layerMeta: Record<string, { color: string; icon: React.ElementType; description: string }> = {
  presentation: { color: "#10b981", icon: Users, description: "User interface — what the end user sees and interacts with" },
  api: { color: "#3b82f6", icon: Globe, description: "HTTP endpoints that receive requests and return responses" },
  application: { color: "#f59e0b", icon: Zap, description: "Orchestrates business operations and coordinates modules" },
  domain: { color: "#8b5cf6", icon: Box, description: "Core algorithms, business rules, and data models" },
  infrastructure: { color: "#ef4444", icon: Database, description: "Database access, external services, file I/O" },
  config: { color: "#6b7280", icon: Cpu, description: "Settings, environment variables, constants" },
  unknown: { color: "#52525b", icon: Code2, description: "Uncategorized modules" },
};

export function OnboardView() {
  const { model } = useStore();
  if (!model) return null;

  const processes = model.businessProcesses || [];

  // Build module dependency map
  const depMap = new Map<string, Set<string>>();
  for (const rel of model.relations) {
    if (rel.type !== "imports") continue;
    const srcMod = rel.source.split("/")[0];
    const tgtSym = model.symbols[rel.target] as Record<string, unknown> | undefined;
    const tgtMod = (tgtSym?.filePath as string)?.split("/")[0];
    if (srcMod && tgtMod && srcMod !== tgtMod) {
      if (!depMap.has(srcMod)) depMap.set(srcMod, new Set());
      depMap.get(srcMod)!.add(tgtMod);
    }
  }

  const layerOrder = ["presentation", "api", "application", "domain", "infrastructure", "config", "unknown"];

  return (
    <div className="p-6 lg:p-8 space-y-10 max-w-[1100px]">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-archlens-500/20 bg-gradient-to-br from-archlens-500/5 via-zinc-900 to-zinc-950 p-8">
        <div className="absolute top-0 right-0 w-64 h-64 bg-archlens-500/5 rounded-full blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-12 w-12 rounded-xl bg-archlens-500/10 border border-archlens-500/20 flex items-center justify-center">
              <Rocket className="h-6 w-6 text-archlens-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Welcome to {model.project.name}</h1>
              <p className="text-zinc-500 text-sm">Onboarding guide — everything you need to understand this project</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            {[
              { label: "Files", value: model.stats.files, icon: Code2 },
              { label: "Lines of Code", value: model.stats.totalLines.toLocaleString(), icon: BookOpen },
              { label: "API Endpoints", value: model.apiEndpoints.length, icon: Globe },
              { label: "Business Processes", value: processes.length, icon: Zap },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg bg-zinc-800/30 border border-zinc-800/50 p-3 text-center">
                <stat.icon className="h-4 w-4 text-archlens-500 mx-auto mb-1" />
                <div className="text-xl font-bold text-zinc-100">{stat.value}</div>
                <div className="text-[10px] text-zinc-600 uppercase">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Section 1: Architecture Layers — Visual Stack */}
      <section>
        <div className="flex items-center gap-2 mb-5">
          <Layers className="h-5 w-5 text-archlens-500" />
          <h2 className="text-xl font-bold">How is it structured?</h2>
        </div>
        <p className="text-sm text-zinc-400 mb-6">
          The codebase follows a layered architecture. Each layer has a specific responsibility.
          Higher layers (UI) depend on lower layers (data), never the reverse.
        </p>

        <div className="relative">
          {/* Visual stack */}
          {layerOrder.map((layer) => {
            const mods = model.modules.filter((m) => m.layer === layer);
            if (mods.length === 0) return null;
            const meta = layerMeta[layer] || layerMeta.unknown;
            const Icon = meta.icon;

            return (
              <div key={layer} className="mb-2">
                <div
                  className="rounded-xl border p-5 transition-all hover:shadow-lg hover:shadow-black/20"
                  style={{ borderColor: `${meta.color}30`, background: `linear-gradient(135deg, ${meta.color}08, transparent)` }}
                >
                  <div className="flex items-start gap-4">
                    <div className="rounded-lg p-2.5 flex-shrink-0" style={{ backgroundColor: `${meta.color}15` }}>
                      <Icon className="h-5 w-5" style={{ color: meta.color }} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold capitalize" style={{ color: meta.color }}>{layer} Layer</h3>
                      </div>
                      <p className="text-xs text-zinc-500 mb-3">{meta.description}</p>

                      <div className="flex flex-wrap gap-2">
                        {mods.map((mod) => (
                          <div
                            key={mod.name}
                            className="rounded-lg border px-3 py-2"
                            style={{ borderColor: `${meta.color}20`, backgroundColor: `${meta.color}05` }}
                          >
                            <div className="font-mono text-sm font-semibold" style={{ color: meta.color }}>{mod.name}/</div>
                            <div className="flex gap-3 text-[10px] text-zinc-600 mt-1">
                              <span>{mod.language}</span>
                              <span>{mod.fileCount} files</span>
                              <span>{mod.lineCount.toLocaleString()} lines</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Arrow down */}
                <div className="flex justify-center py-1">
                  <div className="w-px h-4 bg-zinc-800" />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Section 2: How modules connect */}
      <section>
        <div className="flex items-center gap-2 mb-5">
          <GitBranch className="h-5 w-5 text-archlens-500" />
          <h2 className="text-xl font-bold">How do modules connect?</h2>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
          <div className="space-y-3">
            {[...depMap.entries()].map(([src, deps]) => {
              const srcMod = model.modules.find((m) => m.name === src);
              const srcColor = layerMeta[srcMod?.layer || "unknown"]?.color || "#52525b";
              return (
                <div key={src} className="flex items-center gap-3 flex-wrap">
                  <span className="font-mono text-sm font-bold px-2 py-1 rounded-md" style={{ color: srcColor, backgroundColor: `${srcColor}10` }}>
                    {src}
                  </span>
                  <ArrowRight className="h-4 w-4 text-zinc-700" />
                  <div className="flex gap-2 flex-wrap">
                    {[...deps].map((dep) => {
                      const depMod = model.modules.find((m) => m.name === dep);
                      const depColor = layerMeta[depMod?.layer || "unknown"]?.color || "#52525b";
                      return (
                        <span key={dep} className="font-mono text-xs px-2 py-1 rounded-md border" style={{ color: depColor, borderColor: `${depColor}30` }}>
                          {dep}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Section 3: What does it DO? */}
      <section>
        <div className="flex items-center gap-2 mb-5">
          <Zap className="h-5 w-5 text-archlens-500" />
          <h2 className="text-xl font-bold">What does it DO?</h2>
        </div>
        <p className="text-sm text-zinc-400 mb-6">
          The system implements {processes.length} core business processes. Each process has data sources, a processing pipeline, and outputs.
        </p>

        {/* Process pipeline overview */}
        <div className="space-y-3">
          {processes.filter((p) => p.category !== "presentation" && p.category !== "api-service").map((proc) => {
            const catColors: Record<string, string> = {
              "data-ingestion": "#06b6d4",
              analysis: "#8b5cf6",
              alert: "#f59e0b",
            };
            const color = catColors[proc.category] || "#10b981";

            return (
              <div key={proc.id} className="rounded-xl border bg-zinc-900/30 p-5" style={{ borderColor: `${color}20` }}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                  <h3 className="font-semibold text-zinc-100">{proc.name}</h3>
                  <span className="text-[10px] rounded-full px-2 py-0.5" style={{ backgroundColor: `${color}15`, color }}>
                    {proc.category}
                  </span>
                </div>
                <p className="text-sm text-zinc-400 mb-4">{proc.description}</p>

                {/* Mini pipeline */}
                <div className="flex items-center gap-1 overflow-x-auto pb-2">
                  {/* Data sources */}
                  <div className="flex-shrink-0 rounded-lg bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1.5">
                    <div className="text-[9px] text-cyan-600 uppercase mb-0.5">Input</div>
                    <div className="text-[11px] text-cyan-300 font-mono">
                      {proc.dataSources.map((d) => d.name).join(", ")}
                    </div>
                  </div>

                  <ArrowRight className="h-3.5 w-3.5 text-zinc-700 flex-shrink-0" />

                  {/* Steps as compact pills */}
                  {proc.steps.slice(0, 6).map((step, i) => (
                    <div key={i} className="flex items-center gap-1 flex-shrink-0">
                      {i > 0 && <ArrowRight className="h-3 w-3 text-zinc-800" />}
                      <div className="rounded-md border px-2 py-1 text-[10px] font-medium whitespace-nowrap" style={{ borderColor: `${color}25`, color }}>
                        {step.name}
                      </div>
                    </div>
                  ))}

                  <ArrowRight className="h-3.5 w-3.5 text-zinc-700 flex-shrink-0" />

                  {/* Outputs */}
                  <div className="flex-shrink-0 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5">
                    <div className="text-[9px] text-emerald-600 uppercase mb-0.5">Output</div>
                    <div className="text-[11px] text-emerald-300 font-mono">
                      {proc.outputs.map((o) => o.name).join(", ")}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Section 4: Database Schema Quick View */}
      {model.dbEntities.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-5">
            <Database className="h-5 w-5 text-archlens-500" />
            <h2 className="text-xl font-bold">Database Schema</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {model.dbEntities.map((entity) => (
              <div key={entity.name} className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
                <h4 className="font-mono font-bold text-emerald-400 mb-2">{entity.name}</h4>
                <div className="space-y-0.5">
                  {entity.columns.slice(0, 6).map((col) => (
                    <div key={col.name} className="flex items-center gap-2 text-[11px] font-mono">
                      {col.primary && <span className="text-amber-400">PK</span>}
                      <span className="text-zinc-400">{col.name}</span>
                      <span className="text-zinc-700 ml-auto">{col.type}</span>
                    </div>
                  ))}
                  {entity.columns.length > 6 && (
                    <div className="text-[10px] text-zinc-600">+{entity.columns.length - 6} more columns</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Section 5: Tech Stack */}
      <section>
        <div className="flex items-center gap-2 mb-5">
          <Cpu className="h-5 w-5 text-archlens-500" />
          <h2 className="text-xl font-bold">Tech Stack</h2>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
          {(() => {
            const byCat = new Map<string, typeof model.techRadar>();
            for (const t of model.techRadar) {
              if (!byCat.has(t.category)) byCat.set(t.category, []);
              byCat.get(t.category)!.push(t);
            }
            return [...byCat.entries()].map(([cat, items]) => (
              <div key={cat} className="mb-4 last:mb-0">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">{cat}</h4>
                <div className="flex flex-wrap gap-2">
                  {items.map((t) => (
                    <span key={t.name} className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800/50 border border-zinc-700/50 px-2.5 py-1 text-xs">
                      <span className="text-zinc-300">{t.name}</span>
                      {t.version && <span className="text-zinc-600">{t.version}</span>}
                    </span>
                  ))}
                </div>
              </div>
            ));
          })()}
        </div>
      </section>

      {/* Footer tip */}
      <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/20 p-4 text-center text-sm text-zinc-600">
        Use <span className="font-mono text-archlens-500">Business Processes</span> for algorithm details,{" "}
        <span className="font-mono text-archlens-500">Architecture</span> for drill-down exploration
      </div>
    </div>
  );
}
