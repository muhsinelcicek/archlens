import { useState, useMemo } from "react";
import { ShieldAlert, Flame, GitCompare, ScrollText, FileText, GitBranch, DollarSign, CheckCircle2 } from "lucide-react";
import { useAllAnalysis, usePatterns, useConsistency } from "../services/queries.js";
import { Card } from "../components/ui/Card.js";
import { Badge } from "../components/ui/Badge.js";
import { ProgressBar } from "../components/ui/ProgressBar.js";
import { PageLoader } from "../components/PageLoader.js";
import { HotspotsCleanView } from "./HotspotsCleanView.js";
import { DiffCleanView } from "./DiffCleanView.js";
import { RulesCleanView } from "./RulesCleanView.js";
import { ReportView } from "./ReportView.js";

type Tab = "overview" | "modules" | "coupling" | "hotspots" | "debt" | "diff" | "rules" | "report";

const TABS: Array<{ id: Tab; icon: React.ElementType; label: string }> = [
  { id: "overview", icon: ShieldAlert, label: "Overview" },
  { id: "modules", icon: CheckCircle2, label: "Modules" },
  { id: "coupling", icon: GitBranch, label: "Coupling" },
  { id: "hotspots", icon: Flame, label: "Hotspots" },
  { id: "debt", icon: DollarSign, label: "Tech Debt" },
  { id: "diff", icon: GitCompare, label: "Diff" },
  { id: "rules", icon: ScrollText, label: "Rules" },
  { id: "report", icon: FileText, label: "Report" },
];

export function QualityMergedView() {
  const [tab, setTab] = useState<Tab>("overview");
  const { quality, coupling, security, deadcode, techdebt, isLoading } = useAllAnalysis();
  const { data: patterns } = usePatterns();
  const { data: consistency } = useConsistency();
  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center border-b border-[var(--color-border-subtle)] bg-surface/80 backdrop-blur-sm px-4 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-medium transition-all relative whitespace-nowrap ${
              tab === t.id ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            }`}>
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
            {tab === t.id && (
              <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full" style={{
                background: "linear-gradient(90deg, transparent, var(--color-accent), transparent)",
                boxShadow: "0 0 8px var(--color-accent-glow)",
              }} />
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto">
        {/* Existing sub-pages for complex tabs */}
        {tab === "hotspots" && <HotspotsCleanView />}
        {tab === "diff" && <DiffCleanView />}
        {tab === "rules" && <RulesCleanView />}
        {tab === "report" && <ReportView />}

        {/* Overview — clean summary */}
        {tab === "overview" && (
          <div className="p-6 max-w-[900px] mx-auto space-y-6">
            {isLoading ? <PageLoader message="Analyzing..." /> : quality ? (
              <>
                {/* Score + severity cards */}
                <div className="flex items-start gap-6">
                  <div className="flex-shrink-0 relative w-24 h-24">
                    <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                      <circle cx="50" cy="50" r="42" fill="none" stroke="var(--color-border-default)" strokeWidth="6" />
                      <circle cx="50" cy="50" r="42" fill="none" stroke={scoreColor(quality.projectScore)} strokeWidth="6"
                        strokeDasharray={`${(quality.projectScore / 100) * 264} 264`} strokeLinecap="round"
                        style={{ filter: `drop-shadow(0 0 8px ${scoreColor(quality.projectScore)}60)` }} />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-bold" style={{ color: scoreColor(quality.projectScore) }}>{quality.projectScore}</span>
                      <span className="text-[8px] text-[var(--color-text-muted)] uppercase">score</span>
                    </div>
                  </div>
                  <div className="flex-1 grid grid-cols-4 gap-3">
                    {(["critical", "major", "minor", "info"] as const).map((sev) => {
                      const colors = { critical: "#ef4444", major: "#f97316", minor: "#fbbf24", info: "#60a5fa" };
                      const count = quality.bySeverity?.[sev] || 0;
                      return (
                        <Card key={sev} padding="sm">
                          <div className="text-[10px] uppercase font-semibold" style={{ color: colors[sev] }}>{sev}</div>
                          <div className="text-xl font-bold" style={{ color: colors[sev] }}>{count}</div>
                        </Card>
                      );
                    })}
                  </div>
                </div>

                {/* Patterns */}
                {patterns && (patterns as any[]).length > 0 && (
                  <Card padding="md">
                    <h3 className="text-xs font-semibold uppercase text-[var(--color-text-muted)] tracking-wider mb-3">Architecture Patterns</h3>
                    <div className="space-y-2">
                      {(patterns as any[]).map((p: any) => (
                        <div key={p.id || p.pattern} className="flex items-center gap-3">
                          <span className="text-xs font-semibold text-[var(--color-text-primary)] w-40 truncate">{p.pattern}</span>
                          <ProgressBar value={p.compliance} showValue size="sm" />
                          <Badge variant={p.status === "excellent" ? "success" : p.status === "partial" ? "warning" : "default"} size="xs">{p.status}</Badge>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Quick stats */}
                <div className="grid grid-cols-3 gap-3">
                  <Card padding="md">
                    <div className="text-[10px] text-[var(--color-text-muted)] uppercase mb-1">Security</div>
                    <div className="text-2xl font-bold" style={{ color: security && security.totalIssues > 0 ? "#ef4444" : "#34d399" }}>{security?.totalIssues || 0}</div>
                    <div className="text-[10px] text-[var(--color-text-muted)]">vulnerabilities</div>
                  </Card>
                  <Card padding="md">
                    <div className="text-[10px] text-[var(--color-text-muted)] uppercase mb-1">Dead Code</div>
                    <div className="text-2xl font-bold text-amber-400">{deadcode?.totalDead || 0}</div>
                    <div className="text-[10px] text-[var(--color-text-muted)]">unused symbols</div>
                  </Card>
                  <Card padding="md">
                    <div className="text-[10px] text-[var(--color-text-muted)] uppercase mb-1">Tech Debt</div>
                    <div className="text-2xl font-bold text-red-400">${techdebt ? Math.round(techdebt.totalEstimatedCost / 1000) : 0}k</div>
                    <div className="text-[10px] text-[var(--color-text-muted)]">{techdebt?.totalEstimatedHours || 0} hours</div>
                  </Card>
                </div>
              </>
            ) : <div className="text-center py-16 text-[var(--color-text-muted)]">No quality data</div>}
          </div>
        )}

        {/* Modules — per-module scores */}
        {tab === "modules" && quality && (
          <div className="p-6 max-w-[900px] mx-auto space-y-2">
            {quality.modules.sort((a: any, b: any) => a.score - b.score).map((mod: any) => {
              const sc = scoreColor(mod.score);
              const isExpanded = expandedModule === mod.moduleName;
              return (
                <Card key={mod.moduleName} padding="sm">
                  <button onClick={() => setExpandedModule(isExpanded ? null : mod.moduleName)} className="w-full flex items-center gap-3 text-left">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${sc}15` }}>
                      <span className="text-sm font-bold" style={{ color: sc }}>{mod.score}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-[var(--color-text-primary)]">{mod.moduleName}</span>
                      <span className="text-[10px] text-[var(--color-text-muted)] ml-2">{mod.issues.length} issues</span>
                    </div>
                    <ProgressBar value={mod.score} size="sm" />
                  </button>
                  {isExpanded && mod.issues.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-[var(--color-border-subtle)] space-y-1 max-h-48 overflow-y-auto">
                      {mod.issues.slice(0, 15).map((issue: any, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-[10px] py-0.5">
                          <Badge variant={issue.severity === "critical" ? "error" : issue.severity === "major" ? "warning" : "default"} size="xs">{issue.severity}</Badge>
                          <span className="text-[var(--color-text-secondary)] flex-1">{issue.message}</span>
                          <span className="text-[var(--color-text-muted)] font-mono">{issue.filePath?.split("/").pop()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {/* Coupling */}
        {tab === "coupling" && (
          <div className="p-6 max-w-[900px] mx-auto space-y-4">
            {isLoading ? <PageLoader message="Loading..." /> : coupling ? (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <Card padding="md">
                    <div className="text-[10px] text-[var(--color-text-muted)] uppercase">Avg Instability</div>
                    <div className="text-2xl font-bold" style={{ color: coupling.overallHealth.avgInstability > 0.6 ? "#f97316" : "#34d399" }}>{coupling.overallHealth.avgInstability.toFixed(2)}</div>
                  </Card>
                  <Card padding="md">
                    <div className="text-[10px] text-[var(--color-text-muted)] uppercase">Circular Deps</div>
                    <div className="text-2xl font-bold" style={{ color: coupling.overallHealth.circularCount > 0 ? "#ef4444" : "#34d399" }}>{coupling.overallHealth.circularCount}</div>
                  </Card>
                  <Card padding="md">
                    <div className="text-[10px] text-[var(--color-text-muted)] uppercase">Modules</div>
                    <div className="text-2xl font-bold text-[var(--color-text-primary)]">{coupling.modules.length}</div>
                  </Card>
                </div>

                {coupling.circularDependencies?.length > 0 && (
                  <Card padding="md">
                    <h3 className="text-xs font-semibold text-red-400 mb-2">Circular Dependencies</h3>
                    {coupling.circularDependencies.map((cd: any, i: number) => (
                      <div key={i} className="text-xs font-mono text-[var(--color-text-secondary)] py-0.5">⟳ {(cd.cycle || []).join(" ↔ ")}</div>
                    ))}
                  </Card>
                )}

                <Card padding="md">
                  <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-3">Module Instability</h3>
                  <div className="space-y-1.5">
                    {coupling.modules.sort((a: any, b: any) => b.instability - a.instability).map((m: any) => (
                      <div key={m.moduleName} className="flex items-center gap-3 text-xs">
                        <span className="font-mono text-[var(--color-text-primary)] w-40 truncate">{m.moduleName}</span>
                        <ProgressBar value={(1 - m.instability) * 100} label="I" showValue size="xs" />
                        <span className="text-[var(--color-text-muted)] w-16">Ca:{m.afferentCoupling} Ce:{m.efferentCoupling}</span>
                      </div>
                    ))}
                  </div>
                </Card>

                {/* Consistency */}
                {consistency && (consistency as any).moduleScores?.length > 0 && (
                  <Card padding="md">
                    <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-3">Cross-Cutting Consistency</h3>
                    <p className="text-xs text-[var(--color-text-secondary)] mb-3">{(consistency as any).summary}</p>
                    <div className="space-y-1.5">
                      {(consistency as any).moduleScores.sort((a: any, b: any) => a.overall - b.overall).map((m: any) => (
                        <div key={m.module} className="flex items-center gap-3 text-xs">
                          <span className="font-mono text-[var(--color-text-primary)] w-40 truncate">{m.module}</span>
                          <ProgressBar value={m.errorHandling} label="Err" showValue size="xs" />
                          <ProgressBar value={m.logging} label="Log" showValue size="xs" />
                          <span className="font-bold w-8 text-right" style={{ color: m.overall >= 80 ? "#34d399" : "#fbbf24" }}>{m.overall}%</span>
                        </div>
                      ))}
                    </div>
                    {(consistency as any).issues?.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-[var(--color-border-subtle)]">
                        <div className="text-[10px] text-[var(--color-text-muted)] uppercase mb-2">Issues ({(consistency as any).issues.length})</div>
                        {(consistency as any).issues.slice(0, 5).map((issue: any, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-[10px] py-0.5">
                            <Badge variant={issue.severity === "major" ? "warning" : "default"} size="xs">{issue.severity}</Badge>
                            <span className="text-[var(--color-text-secondary)]">{issue.description}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                )}
              </>
            ) : <div className="text-center py-16 text-[var(--color-text-muted)]">No coupling data</div>}
          </div>
        )}

        {/* Tech Debt */}
        {tab === "debt" && (
          <div className="p-6 max-w-[900px] mx-auto space-y-4">
            {isLoading ? <PageLoader message="Loading..." /> : techdebt ? (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <Card padding="md">
                    <div className="text-[10px] text-[var(--color-text-muted)] uppercase">Total Fix Cost</div>
                    <div className="text-2xl font-bold text-red-400">${Math.round(techdebt.totalEstimatedCost / 1000)}k</div>
                    <div className="text-[10px] text-[var(--color-text-muted)]">{techdebt.totalEstimatedHours} hours</div>
                  </Card>
                  <Card padding="md">
                    <div className="text-[10px] text-[var(--color-text-muted)] uppercase">Annual Cost</div>
                    <div className="text-2xl font-bold text-amber-400">${Math.round(techdebt.totalAnnualCost / 1000)}k/yr</div>
                  </Card>
                  <Card padding="md">
                    <div className="text-[10px] text-[var(--color-text-muted)] uppercase">Quick Wins</div>
                    <div className="text-2xl font-bold text-emerald-400">{techdebt.quickWins?.length || 0}</div>
                  </Card>
                </div>
                {techdebt.items?.map((item: any, i: number) => (
                  <Card key={i} padding="sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-[var(--color-text-primary)]">{item.category}</div>
                        <div className="text-xs text-[var(--color-text-muted)] mt-0.5">{item.description}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-[var(--color-text-primary)]">${(item.estimatedCost / 1000).toFixed(1)}k</div>
                        <Badge size="xs" variant="purple">ROI: {item.roi?.toFixed(1) || "?"}x</Badge>
                      </div>
                    </div>
                  </Card>
                ))}
              </>
            ) : <div className="text-center py-16 text-[var(--color-text-muted)]">No tech debt data</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function scoreColor(score: number): string {
  if (score >= 80) return "#34d399";
  if (score >= 60) return "#fbbf24";
  if (score >= 40) return "#f97316";
  return "#ef4444";
}
