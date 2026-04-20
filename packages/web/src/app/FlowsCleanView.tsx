/**
 * FlowsCleanView — request flows + module flows + events.
 *
 * Works for ALL languages:
 * - Endpoints tab: API endpoint → handler → dependencies (from framework detector)
 * - Modules tab: layer-based module flow visualization
 * - Events tab: event flows (if detected, mostly C#/.NET)
 */

import { useState, useMemo } from "react";
import { useStore } from "../lib/store.js";
import { useEventFlow } from "../services/queries.js";
import { Card } from "../components/ui/Card.js";
import { Badge } from "../components/ui/Badge.js";
import {
  Globe, ArrowRight, Boxes, MessageSquare, ChevronDown, ChevronRight,
  Database, Server, Cloud, Layers, Zap,
} from "lucide-react";

const METHOD_COLORS: Record<string, string> = {
  GET: "#60a5fa", POST: "#34d399", PUT: "#fbbf24", PATCH: "#f97316", DELETE: "#ef4444",
};

const LAYER_COLORS: Record<string, string> = {
  presentation: "#34d399", api: "#60a5fa", application: "#fbbf24",
  domain: "#a78bfa", infrastructure: "#f87171", config: "#94a3b8",
};

type Tab = "endpoints" | "modules" | "events";

export function FlowsCleanView() {
  const { model } = useStore();
  const { data: eventData } = useEventFlow();
  const [tab, setTab] = useState<Tab>("endpoints");
  const [expandedEndpoint, setExpandedEndpoint] = useState<string | null>(null);
  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  if (!model) return null;

  const events = (eventData as any)?.events || [];
  const hasEvents = events.length > 0;

  const tabs: Array<{ id: Tab; icon: React.ElementType; label: string; count: number }> = [
    { id: "endpoints", icon: Globe, label: "Request Flows", count: model.apiEndpoints.length },
    { id: "modules", icon: Boxes, label: "Module Flows", count: model.modules.length },
    ...(hasEvents ? [{ id: "events" as Tab, icon: MessageSquare, label: "Events", count: events.length }] : []),
  ];

  // Group endpoints by module
  const endpointsByModule = useMemo(() => {
    const groups = new Map<string, typeof model.apiEndpoints>();
    const f2m = new Map<string, string>();
    for (const mod of model.modules) {
      for (const uid of mod.symbols) {
        const sym = model.symbols[uid] as Record<string, unknown> | undefined;
        if (sym) f2m.set(sym.filePath as string, mod.name);
      }
    }
    for (const ep of model.apiEndpoints) {
      const modName = f2m.get(ep.filePath) || "Ungrouped";
      if (!groups.has(modName)) groups.set(modName, []);
      groups.get(modName)!.push(ep);
    }
    return groups;
  }, [model]);

  // Module dependency flows (simplified)
  const moduleFlows = useMemo(() => {
    const deps = new Map<string, Set<string>>();
    const f2m = new Map<string, string>();
    const u2m = new Map<string, string>();
    for (const mod of model.modules) {
      for (const uid of mod.symbols) {
        u2m.set(uid, mod.name);
        const sym = model.symbols[uid] as Record<string, unknown> | undefined;
        if (sym) f2m.set(sym.filePath as string, mod.name);
      }
    }
    for (const rel of model.relations) {
      const srcMod = f2m.get(rel.source) || u2m.get(rel.source);
      const tgtSym = model.symbols[rel.target] as Record<string, unknown> | undefined;
      const tgtMod = tgtSym ? (f2m.get(tgtSym.filePath as string) || u2m.get(rel.target)) : undefined;
      if (srcMod && tgtMod && srcMod !== tgtMod) {
        if (!deps.has(srcMod)) deps.set(srcMod, new Set());
        deps.get(srcMod)!.add(tgtMod);
      }
    }
    return deps;
  }, [model]);

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center border-b border-[var(--color-border-subtle)] bg-surface/80 backdrop-blur-sm px-4">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-all relative ${
              tab === t.id ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            }`}>
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--color-border-subtle)]">{t.count}</span>
            {tab === t.id && (
              <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full" style={{
                background: "linear-gradient(90deg, transparent, var(--color-accent), transparent)",
                boxShadow: "0 0 8px var(--color-accent-glow)",
              }} />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6 max-w-[1100px] mx-auto w-full">

        {/* ── Endpoints Tab ── */}
        {tab === "endpoints" && (
          <div className="space-y-4">
            {model.apiEndpoints.length === 0 ? (
              <div className="text-center py-16 text-[var(--color-text-muted)]">
                <Globe className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No API endpoints detected</p>
                <p className="text-xs mt-1">This project may not have a web framework, or the framework isn't supported yet.</p>
              </div>
            ) : (
              [...endpointsByModule.entries()].map(([modName, endpoints]) => {
                const mod = model.modules.find((m) => m.name === modName);
                const layerColor = LAYER_COLORS[mod?.layer || "unknown"] || "#6b7280";
                const isExpanded = expandedModule === modName;

                return (
                  <Card key={modName} padding="sm">
                    <button onClick={() => setExpandedModule(isExpanded ? null : modName)}
                      className="w-full flex items-center gap-3 p-2 text-left">
                      {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-[var(--color-text-muted)]" /> : <ChevronRight className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />}
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: layerColor, boxShadow: `0 0 6px ${layerColor}60` }} />
                      <span className="text-sm font-semibold text-[var(--color-text-primary)]">{modName}</span>
                      <Badge size="xs">{endpoints.length} endpoints</Badge>
                      {mod && <span className="text-[10px] text-[var(--color-text-muted)] ml-auto capitalize">{mod.layer}</span>}
                    </button>

                    {isExpanded && (
                      <div className="mt-1 space-y-1 px-2 pb-2">
                        {endpoints.map((ep, i) => {
                          const epKey = `${ep.method}:${ep.path}`;
                          const isEpExpanded = expandedEndpoint === epKey;
                          const methodColor = METHOD_COLORS[ep.method] || "#94a3b8";

                          // Find downstream modules this handler depends on
                          const handlerDeps = moduleFlows.get(modName);

                          return (
                            <div key={i}>
                              <button onClick={() => setExpandedEndpoint(isEpExpanded ? null : epKey)}
                                className="w-full flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-hover transition-colors text-left">
                                <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded" style={{ backgroundColor: `${methodColor}15`, color: methodColor }}>
                                  {ep.method}
                                </span>
                                <span className="text-xs font-mono text-[var(--color-text-primary)] flex-1">{ep.path}</span>
                                <span className="text-[9px] text-[var(--color-text-muted)] font-mono">{ep.filePath.split("/").pop()}</span>
                              </button>

                              {/* Request flow visualization */}
                              {isEpExpanded && (
                                <div className="ml-8 py-3 pl-4 border-l-2 border-[var(--color-accent)] space-y-2">
                                  {/* Handler */}
                                  <FlowStep icon={<Cloud className="h-3 w-3" />} label={modName} sublabel={ep.filePath.split("/").pop() || ""} color={layerColor} />

                                  {/* Dependencies */}
                                  {handlerDeps && [...handlerDeps].map((depName) => {
                                    const depMod = model.modules.find((m) => m.name === depName);
                                    const depColor = LAYER_COLORS[depMod?.layer || "unknown"] || "#6b7280";
                                    const depIcon = depMod?.layer === "infrastructure" ? <Database className="h-3 w-3" />
                                      : depMod?.layer === "domain" ? <Zap className="h-3 w-3" />
                                      : <Server className="h-3 w-3" />;

                                    return (
                                      <FlowStep key={depName} icon={depIcon} label={depName} sublabel={depMod?.layer || "unknown"} color={depColor} />
                                    );
                                  })}

                                  {/* DB entities if infrastructure */}
                                  {model.dbEntities.length > 0 && handlerDeps && [...handlerDeps].some((d) => model.modules.find((m) => m.name === d)?.layer === "infrastructure") && (
                                    <FlowStep icon={<Database className="h-3 w-3" />} label="Database" sublabel={`${model.dbEntities.length} tables`} color="#f87171" />
                                  )}

                                  {!handlerDeps && (
                                    <div className="text-[10px] text-[var(--color-text-muted)] italic">No downstream dependencies detected</div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                );
              })
            )}
          </div>
        )}

        {/* ── Modules Tab ── */}
        {tab === "modules" && (
          <div className="space-y-6">
            {["presentation", "api", "application", "domain", "infrastructure", "config"].map((layer) => {
              const mods = model.modules.filter((m) => m.layer === layer);
              if (mods.length === 0) return null;
              const color = LAYER_COLORS[layer] || "#6b7280";

              return (
                <div key={layer}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}60` }} />
                    <span className="text-xs font-semibold uppercase tracking-wider" style={{ color }}>{layer}</span>
                    <span className="text-[10px] text-[var(--color-text-muted)]">{mods.length} modules</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {mods.map((mod) => {
                      const deps = moduleFlows.get(mod.name);
                      return (
                        <Card key={mod.name} padding="sm" hover>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm font-semibold text-[var(--color-text-primary)]">{mod.name}</span>
                            <span className="text-[10px] text-[var(--color-text-muted)]">{mod.fileCount}f · {mod.lineCount.toLocaleString()}L</span>
                          </div>
                          {deps && deps.size > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {[...deps].slice(0, 4).map((dep) => (
                                <span key={dep} className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-border-subtle)] text-[var(--color-text-muted)] font-mono flex items-center gap-1">
                                  <ArrowRight className="h-2 w-2" />{dep}
                                </span>
                              ))}
                              {deps.size > 4 && <span className="text-[9px] text-[var(--color-text-muted)]">+{deps.size - 4}</span>}
                            </div>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Events Tab ── */}
        {tab === "events" && (
          <div className="space-y-3">
            {events.length === 0 ? (
              <div className="text-center py-16 text-[var(--color-text-muted)]">
                <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No events detected</p>
                <p className="text-xs mt-1">Event detection works best with C#/.NET projects using domain events.</p>
              </div>
            ) : (
              events.map((evt: any, i: number) => (
                <Card key={i} padding="sm">
                  <div className="flex items-center gap-3">
                    <Badge variant={evt.eventType === "domain" ? "purple" : "info"} size="xs">{evt.eventType}</Badge>
                    <span className="text-sm font-semibold text-[var(--color-text-primary)]">{evt.eventName}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[10px]">
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono">{evt.publisher?.module}</span>
                    <ArrowRight className="h-3 w-3 text-[var(--color-text-muted)]" />
                    {evt.subscribers?.map((sub: any, j: number) => (
                      <span key={j} className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 font-mono">{sub.module}</span>
                    ))}
                    {(!evt.subscribers || evt.subscribers.length === 0) && (
                      <span className="text-[var(--color-text-muted)] italic">no subscribers</span>
                    )}
                  </div>
                </Card>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FlowStep({ icon, label, sublabel, color }: { icon: React.ReactNode; label: string; sublabel: string; color: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-px h-3 bg-[var(--color-accent)] opacity-30" />
      <div className="rounded-md p-1.5" style={{ backgroundColor: `${color}12`, color, boxShadow: `0 0 6px ${color}20` }}>
        {icon}
      </div>
      <div>
        <span className="text-xs font-semibold text-[var(--color-text-primary)]">{label}</span>
        <span className="text-[10px] text-[var(--color-text-muted)] ml-2">{sublabel}</span>
      </div>
    </div>
  );
}
