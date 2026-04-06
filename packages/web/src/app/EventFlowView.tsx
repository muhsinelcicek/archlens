import { useI18n } from "../lib/i18n.js";
import { useState, useEffect } from "react";
import {
  MessageSquare, ArrowRight, Box, CheckCircle2, AlertTriangle,
  Globe, Server, Zap, Radio, ChevronDown, ChevronRight,
  ArrowDown, Workflow, Send, Inbox,
} from "lucide-react";

interface EventFlow { eventName: string; publisher: { module: string; symbol: string; filePath: string }; subscribers: Array<{ module: string; symbol: string; filePath: string }>; eventType: string; }
interface BoundedContext { name: string; modules: string[]; entities: string[]; events: string[]; isClean: boolean; }
interface CommPattern { type: string; description: string; modules: string[]; }
interface EventFlowReport { events: EventFlow[]; boundedContexts: BoundedContext[]; communicationPatterns: CommPattern[]; }

const ctxColors = ["#60a5fa", "#34d399", "#a78bfa", "#fbbf24", "#f87171", "#06b6d4", "#f472b6", "#94a3b8", "#818cf8", "#fb923c"];
const patternIcons: Record<string, React.ReactNode> = {
  "Event Bus": <Radio className="h-5 w-5" />,
  "gRPC": <Workflow className="h-5 w-5" />,
  "REST API": <Globe className="h-5 w-5" />,
  "Background Processing": <Server className="h-5 w-5" />,
};

export function EventFlowView() {
  const { t } = useI18n();
  const [report, setReport] = useState<EventFlowReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "events" | "contexts">("overview");
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/eventflow").then((r) => r.ok ? r.json() : null).then((d) => { setReport(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64 text-[#5a5a70]">{t("common.loading")}</div>;
  if (!report) return <div className="p-6 text-[#5a5a70]">{t("common.no_data")}</div>;

  const integrationEvents = report.events.filter((e) => e.eventType === "integration");
  const domainEvents = report.events.filter((e) => e.eventType === "domain");
  const activeContexts = report.boundedContexts.filter((c) => c.modules.length > 0);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1200px]">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">{t("event.title")}</h2>
        <p className="text-sm text-[#5a5a70] mt-1">
          {report.events.length} events · {activeContexts.length} bounded contexts · {report.communicationPatterns.length} communication patterns
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 mb-1"><Zap className="h-4 w-4 text-amber-400" /><span className="text-[10px] text-[#5a5a70] uppercase">Integration Events</span></div>
          <div className="text-2xl font-bold text-amber-400">{integrationEvents.length}</div>
        </div>
        <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
          <div className="flex items-center gap-2 mb-1"><MessageSquare className="h-4 w-4 text-purple-400" /><span className="text-[10px] text-[#5a5a70] uppercase">Domain Events</span></div>
          <div className="text-2xl font-bold text-purple-400">{domainEvents.length}</div>
        </div>
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
          <div className="flex items-center gap-2 mb-1"><Box className="h-4 w-4 text-blue-400" /><span className="text-[10px] text-[#5a5a70] uppercase">Bounded Contexts</span></div>
          <div className="text-2xl font-bold text-blue-400">{activeContexts.length}</div>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="flex items-center gap-2 mb-1"><Radio className="h-4 w-4 text-emerald-400" /><span className="text-[10px] text-[#5a5a70] uppercase">Comm Patterns</span></div>
          <div className="text-2xl font-bold text-emerald-400">{report.communicationPatterns.length}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#2a2a3a]">
        {[
          { id: "overview" as const, label: "Communication Overview" },
          { id: "events" as const, label: `Event Flows (${report.events.length})` },
          { id: "contexts" as const, label: `Bounded Contexts (${activeContexts.length})` },
        ].map((tb) => (
          <button key={tb.id} onClick={() => setActiveTab(tb.id)}
            className={`px-4 py-2.5 text-xs font-semibold transition-colors ${activeTab === tb.id ? "text-archlens-300 border-b-2 border-archlens-400" : "text-[#5a5a70] hover:text-[#8888a0]"}`}>
            {tb.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Communication Patterns — Visual */}
          <section>
            <h3 className="text-lg font-semibold mb-4">{t("event.comm_patterns")}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {report.communicationPatterns.map((pat, i) => {
                const colors = ["#60a5fa", "#34d399", "#fbbf24", "#a78bfa"];
                const color = colors[i % colors.length];
                return (
                  <div key={i} className="rounded-xl border p-5" style={{ borderColor: `${color}30` }}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}15`, color }}>
                        {patternIcons[pat.type] || <Globe className="h-5 w-5" />}
                      </div>
                      <div>
                        <h4 className="font-semibold text-[#e4e4ed]">{pat.type}</h4>
                        <p className="text-[10px] text-[#5a5a70]">{pat.description}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {pat.modules.map((m) => (
                        <span key={m} className="text-[9px] font-mono px-2 py-0.5 rounded-md" style={{ backgroundColor: `${color}12`, color }}>{m}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Visual Flow: How services communicate */}
          <section>
            <h3 className="text-lg font-semibold mb-4">Service Communication Flow</h3>
            <div className="rounded-xl border border-[#2a2a3a] bg-deep p-6">
              <div className="flex flex-col items-center gap-4">
                {/* Sync layer */}
                <div className="text-[9px] uppercase font-semibold text-[#5a5a70] self-start">Synchronous</div>
                <div className="flex items-center gap-3 flex-wrap justify-center">
                  {report.communicationPatterns.filter((p) => p.type === "REST API" || p.type === "gRPC").map((pat, i) => (
                    <div key={i} className="flex items-center gap-2">
                      {pat.modules.map((m, j) => (
                        <div key={m} className="flex items-center gap-2">
                          {j > 0 && <ArrowRight className="h-3 w-3 text-blue-400" />}
                          <div className="rounded-lg border border-blue-500/30 bg-blue-500/8 px-3 py-2 text-center">
                            <div className="text-[10px] font-mono text-blue-300">{m}</div>
                            <div className="text-[8px] text-blue-500">{pat.type}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                <ArrowDown className="h-4 w-4 text-[#2a2a3a]" />

                {/* Async layer */}
                <div className="text-[9px] uppercase font-semibold text-[#5a5a70] self-start">Asynchronous</div>
                <div className="w-full rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <Radio className="h-4 w-4 text-amber-400" />
                    <span className="text-sm font-semibold text-amber-300">Event Bus</span>
                    <span className="text-[10px] text-amber-500">({integrationEvents.length} events)</span>
                  </div>
                  {/* Top events */}
                  <div className="flex flex-wrap justify-center gap-2">
                    {integrationEvents.slice(0, 8).map((evt) => (
                      <div key={evt.eventName} className="flex items-center gap-1.5 rounded-lg bg-[#1e1e2a] px-2.5 py-1.5">
                        <Send className="h-2.5 w-2.5 text-amber-500" />
                        <span className="text-[9px] font-mono text-amber-300">{evt.publisher.module}</span>
                        <ArrowRight className="h-2 w-2 text-[#5a5a70]" />
                        {evt.subscribers.length > 0 ? (
                          <span className="text-[9px] font-mono text-emerald-300">{evt.subscribers.map((s) => s.module).join(", ")}</span>
                        ) : (
                          <span className="text-[9px] text-[#5a5a70]">no subscribers</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {report.communicationPatterns.some((p) => p.type === "Background Processing") && (
                  <>
                    <ArrowDown className="h-4 w-4 text-[#2a2a3a]" />
                    <div className="text-[9px] uppercase font-semibold text-[#5a5a70] self-start">Background</div>
                    <div className="flex gap-3">
                      {report.communicationPatterns.filter((p) => p.type === "Background Processing").flatMap((p) => p.modules).map((m) => (
                        <div key={m} className="rounded-lg border border-purple-500/30 bg-purple-500/8 px-3 py-2 text-center">
                          <Server className="h-4 w-4 text-purple-400 mx-auto mb-1" />
                          <div className="text-[10px] font-mono text-purple-300">{m}</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Events Tab */}
      {activeTab === "events" && (
        <div className="space-y-3">
          {report.events.length === 0 ? (
            <div className="text-center py-12 text-[#5a5a70]">No events detected</div>
          ) : (
            report.events.map((evt, i) => {
              const isExpanded = expandedEvent === evt.eventName;
              const isIntegration = evt.eventType === "integration";
              const color = isIntegration ? "#fbbf24" : "#a78bfa";

              return (
                <div key={i} className="rounded-xl border overflow-hidden" style={{ borderColor: isExpanded ? `${color}40` : "#2a2a3a" }}>
                  <button onClick={() => setExpandedEvent(isExpanded ? null : evt.eventName)} className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-hover transition-colors text-left">
                    {isExpanded ? <ChevronDown className="h-4 w-4 text-[#5a5a70]" /> : <ChevronRight className="h-4 w-4 text-[#5a5a70]" />}
                    <Zap className="h-4 w-4" style={{ color }} />
                    <div className="flex-1 min-w-0">
                      <span className="font-mono font-semibold text-[#e4e4ed]">{evt.eventName}</span>
                    </div>
                    <span className="text-[9px] px-2 py-0.5 rounded-full" style={{ backgroundColor: `${color}15`, color }}>{evt.eventType}</span>
                    <div className="flex items-center gap-2 text-[10px] text-[#5a5a70]">
                      <Send className="h-3 w-3" /> {evt.publisher.module}
                      <ArrowRight className="h-3 w-3" />
                      <Inbox className="h-3 w-3" /> {evt.subscribers.length}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-5 py-4 border-t border-[#1e1e2a] bg-deep">
                      {/* Visual flow */}
                      <div className="flex items-center gap-4 mb-4">
                        {/* Publisher */}
                        <div className="rounded-xl border border-blue-500/30 bg-blue-500/8 p-3 text-center min-w-[120px]">
                          <Send className="h-4 w-4 text-blue-400 mx-auto mb-1" />
                          <div className="text-[10px] uppercase text-blue-500 mb-0.5">{t("event.publisher")}</div>
                          <div className="font-mono text-xs text-blue-300">{evt.publisher.module}</div>
                          <div className="text-[9px] text-[#5a5a70] mt-1 truncate">{evt.publisher.filePath.split("/").pop()}</div>
                        </div>

                        {/* Arrow with event name */}
                        <div className="flex flex-col items-center flex-1">
                          <div className="text-[9px] font-mono px-2 py-0.5 rounded" style={{ backgroundColor: `${color}12`, color }}>
                            {evt.eventName}
                          </div>
                          <div className="w-full h-px my-1" style={{ backgroundColor: color }} />
                          <ArrowRight className="h-3 w-3" style={{ color }} />
                        </div>

                        {/* Subscribers */}
                        <div className="flex flex-col gap-2">
                          {evt.subscribers.length > 0 ? evt.subscribers.map((sub, j) => (
                            <div key={j} className="rounded-xl border border-emerald-500/30 bg-emerald-500/8 p-3 text-center min-w-[120px]">
                              <Inbox className="h-4 w-4 text-emerald-400 mx-auto mb-1" />
                              <div className="text-[10px] uppercase text-emerald-500 mb-0.5">{t("event.subscriber")}</div>
                              <div className="font-mono text-xs text-emerald-300">{sub.module}</div>
                              <div className="text-[9px] text-[#5a5a70] mt-1 truncate">{sub.filePath.split("/").pop()}</div>
                            </div>
                          )) : (
                            <div className="rounded-xl border border-[#2a2a3a] bg-[#1e1e2a] p-3 text-center min-w-[120px]">
                              <AlertTriangle className="h-4 w-4 text-amber-500 mx-auto mb-1" />
                              <div className="text-[10px] text-amber-500">No subscribers</div>
                              <div className="text-[9px] text-[#5a5a70]">Event published but unused</div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Bounded Contexts Tab */}
      {activeTab === "contexts" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeContexts.map((ctx, i) => {
              const color = ctxColors[i % ctxColors.length];
              return (
                <div key={ctx.name} className="rounded-xl border p-5" style={{ borderColor: `${color}30` }}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: color }} />
                      <h4 className="font-semibold text-lg text-[#e4e4ed]">{ctx.name}</h4>
                    </div>
                    {ctx.isClean
                      ? <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> {t("event.clean")}</span>
                      : <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {t("event.coupled")}</span>
                    }
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3 text-center mb-4">
                    <div className="rounded-lg bg-[#1e1e2a] p-2">
                      <div className="text-lg font-bold text-[#e4e4ed]">{ctx.modules.length}</div>
                      <div className="text-[8px] text-[#5a5a70] uppercase">Modules</div>
                    </div>
                    <div className="rounded-lg bg-[#1e1e2a] p-2">
                      <div className="text-lg font-bold text-[#e4e4ed]">{ctx.entities.length}</div>
                      <div className="text-[8px] text-[#5a5a70] uppercase">Entities</div>
                    </div>
                    <div className="rounded-lg bg-[#1e1e2a] p-2">
                      <div className="text-lg font-bold text-[#e4e4ed]">{ctx.events.length}</div>
                      <div className="text-[8px] text-[#5a5a70] uppercase">Events</div>
                    </div>
                  </div>

                  {/* Modules */}
                  <div className="mb-3">
                    <div className="text-[9px] uppercase text-[#5a5a70] font-semibold mb-1.5">Modules</div>
                    <div className="flex flex-wrap gap-1.5">
                      {ctx.modules.map((m) => <span key={m} className="text-[10px] font-mono px-2 py-0.5 rounded-md" style={{ backgroundColor: `${color}10`, color }}>{m}</span>)}
                    </div>
                  </div>

                  {/* Entities */}
                  {ctx.entities.length > 0 && (
                    <div className="mb-3">
                      <div className="text-[9px] uppercase text-[#5a5a70] font-semibold mb-1.5">Entities</div>
                      <div className="text-[10px] font-mono text-[#8888a0]">{ctx.entities.join(", ")}</div>
                    </div>
                  )}

                  {/* Events */}
                  {ctx.events.length > 0 && (
                    <div>
                      <div className="text-[9px] uppercase text-[#5a5a70] font-semibold mb-1.5">Events</div>
                      <div className="flex flex-wrap gap-1">
                        {ctx.events.slice(0, 5).map((e) => (
                          <span key={e} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">{e.replace("IntegrationEvent", "").replace("DomainEvent", "")}</span>
                        ))}
                        {ctx.events.length > 5 && <span className="text-[9px] text-[#5a5a70]">+{ctx.events.length - 5}</span>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
