import { useI18n } from "../lib/i18n.js";
import { useState, useEffect } from "react";
import { MessageSquare, ArrowRight, Box, CheckCircle2, AlertTriangle, Globe, Server, Zap } from "lucide-react";

interface EventFlow { eventName: string; publisher: { module: string; symbol: string; filePath: string }; subscribers: Array<{ module: string; symbol: string; filePath: string }>; eventType: string; }
interface BoundedContext { name: string; modules: string[]; entities: string[]; events: string[]; isClean: boolean; }
interface CommPattern { type: string; description: string; modules: string[]; }
interface EventFlowReport { events: EventFlow[]; boundedContexts: BoundedContext[]; communicationPatterns: CommPattern[]; }

const ctxColors = ["#60a5fa", "#34d399", "#a78bfa", "#fbbf24", "#f87171", "#06b6d4", "#f472b6", "#94a3b8"];

export function EventFlowView() {
  const [report, setReport] = useState<EventFlowReport | null>(null);
  const [loading, setLoading] = useState(true);
  const { t } = useI18n();
  useEffect(() => {
    fetch("/api/eventflow").then((r) => r.ok ? r.json() : null).then((d) => { setReport(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64 text-[#5a5a70]">Detecting event flows...</div>;
  if (!report) return <div className="p-6 text-[#5a5a70]">No data</div>;

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-[1100px]">
      <div>
        <h2 className="text-2xl font-bold">{t("event.title")}</h2>
        <p className="text-sm text-[#5a5a70] mt-1">
          {report.events.length} events · {report.boundedContexts.length} contexts · {report.communicationPatterns.length} patterns
        </p>
      </div>

      {/* Communication Patterns */}
      <section>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Globe className="h-5 w-5 text-archlens-400" /> Communication Patterns</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {report.communicationPatterns.map((pat, i) => (
            <div key={i} className="rounded-xl border border-[#2a2a3a] p-4">
              <div className="flex items-center gap-2 mb-2">
                <Server className="h-4 w-4 text-archlens-400" />
                <span className="font-semibold text-[#e4e4ed]">{pat.type}</span>
              </div>
              <p className="text-xs text-[#8888a0]">{pat.description}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {pat.modules.map((m) => (
                  <span key={m} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-archlens-500/10 text-archlens-300">{m}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Bounded Contexts */}
      <section>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Box className="h-5 w-5 text-archlens-400" /> Bounded Contexts (DDD)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {report.boundedContexts.map((ctx, i) => {
            const color = ctxColors[i % ctxColors.length];
            return (
              <div key={ctx.name} className="rounded-xl border p-4" style={{ borderColor: `${color}30` }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                    <span className="font-semibold text-[#e4e4ed]">{ctx.name} Context</span>
                  </div>
                  {ctx.isClean
                    ? <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Clean</span>
                    : <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Coupled</span>
                  }
                </div>

                {/* Modules */}
                <div className="mb-2">
                  <div className="text-[9px] uppercase text-[#5a5a70] font-semibold mb-1">Modules ({ctx.modules.length})</div>
                  <div className="flex flex-wrap gap-1">
                    {ctx.modules.map((m) => <span key={m} className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: `${color}12`, color }}>{m}</span>)}
                  </div>
                </div>

                {/* Entities */}
                {ctx.entities.length > 0 && (
                  <div className="mb-2">
                    <div className="text-[9px] uppercase text-[#5a5a70] font-semibold mb-1">Entities ({ctx.entities.length})</div>
                    <div className="text-[10px] text-[#8888a0] font-mono">{ctx.entities.join(", ")}</div>
                  </div>
                )}

                {/* Events */}
                {ctx.events.length > 0 && (
                  <div>
                    <div className="text-[9px] uppercase text-[#5a5a70] font-semibold mb-1">Events ({ctx.events.length})</div>
                    <div className="text-[10px] text-[#8888a0] font-mono">{ctx.events.join(", ")}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Event Flows */}
      {report.events.length > 0 && (
        <section>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><MessageSquare className="h-5 w-5 text-archlens-400" /> Event Flows</h3>
          <div className="space-y-2">
            {report.events.map((evt, i) => (
              <div key={i} className="rounded-xl border border-[#2a2a3a] p-4">
                <div className="flex items-center gap-3 mb-2">
                  <Zap className="h-4 w-4 text-amber-400" />
                  <span className="font-mono font-semibold text-[#e4e4ed]">{evt.eventName}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-archlens-500/10 text-archlens-300">{evt.eventType}</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <div className="rounded-lg bg-blue-500/8 border border-blue-500/20 px-2.5 py-1.5">
                    <div className="text-[8px] text-blue-600 uppercase">Publisher</div>
                    <div className="font-mono text-blue-300">{evt.publisher.module}</div>
                  </div>
                  <ArrowRight className="h-3 w-3 text-[#5a5a70]" />
                  {evt.subscribers.length > 0 ? evt.subscribers.map((sub, j) => (
                    <div key={j} className="flex items-center gap-2">
                      {j > 0 && <span className="text-[#5a5a70]">+</span>}
                      <div className="rounded-lg bg-emerald-500/8 border border-emerald-500/20 px-2.5 py-1.5">
                        <div className="text-[8px] text-emerald-600 uppercase">Subscriber</div>
                        <div className="font-mono text-emerald-300">{sub.module}</div>
                      </div>
                    </div>
                  )) : <span className="text-[10px] text-[#5a5a70]">No subscribers detected</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
