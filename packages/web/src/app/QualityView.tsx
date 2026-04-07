import { useI18n } from "../lib/i18n.js";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PageLoader } from "../components/PageLoader.js";
import { PageEmpty } from "../components/PageLoader.js";
import {
  ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2, XCircle,
  Bug, Code2, Box, Layers, GitBranch, ChevronDown, ChevronRight,
  Lightbulb, ArrowRight, ExternalLink, FileCode,
} from "lucide-react";
import { apiFetch } from "../lib/api.js";

interface QualityIssue {
  id: string; rule: string; category: string; severity: string;
  message: string; filePath: string; symbolRef?: string; line?: number; suggestion?: string;
}
interface ModuleQuality {
  moduleName: string; score: number; issues: QualityIssue[];
  metrics: { totalSymbols: number; avgComplexity: number; maxMethodLines: number; godClasses: number; namingViolations: number; typeUnsafe: number; patternViolations: number };
}
interface PatternAnalysis {
  pattern: string; detected: boolean; compliance: number; violations: string[]; recommendations: string[];
}
interface QualityReport {
  projectScore: number; totalIssues: number;
  bySeverity: Record<string, number>; byCategory: Record<string, number>;
  modules: ModuleQuality[]; architecturePatterns: PatternAnalysis[]; topIssues: QualityIssue[];
}

const severityConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  critical: { color: "#ef4444", icon: <XCircle className="h-3.5 w-3.5" />, label: "Critical" },
  major: { color: "#f97316", icon: <AlertTriangle className="h-3.5 w-3.5" />, label: "Major" },
  minor: { color: "#fbbf24", icon: <Bug className="h-3.5 w-3.5" />, label: "Minor" },
  info: { color: "#60a5fa", icon: <Lightbulb className="h-3.5 w-3.5" />, label: "Info" },
};

const categoryIcons: Record<string, React.ReactNode> = {
  naming: <Code2 className="h-3 w-3" />, complexity: <GitBranch className="h-3 w-3" />,
  "code-smell": <Bug className="h-3 w-3" />, "type-safety": <ShieldCheck className="h-3 w-3" />,
  ddd: <Layers className="h-3 w-3" />, "clean-architecture": <Layers className="h-3 w-3" />,
  solid: <Box className="h-3 w-3" />, pattern: <GitBranch className="h-3 w-3" />,
};

export function QualityView() {
  const [report, setReport] = useState<QualityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const [expandedPattern, setExpandedPattern] = useState<string | null>(null);
  const [deepPatterns, setDeepPatterns] = useState<any[] | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);
  const { t } = useI18n();  const [coupling, setCoupling] = useState<any | null>(null);
  const [consistency, setConsistency] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<"quality" | "coupling" | "consistency" | "debt" | "health">("quality");
  const [techDebt, setTechDebt] = useState<any | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch("/api/quality").then((r) => r.ok ? r.json() : null),
      apiFetch("/api/patterns").then((r) => r.ok ? r.json() : null),
      apiFetch("/api/coupling").then((r) => r.ok ? r.json() : null),
      apiFetch("/api/consistency").then((r) => r.ok ? r.json() : null),
      apiFetch("/api/techdebt").then((r) => r.ok ? r.json() : null),
    ]).then(([q, p, c, con, td]) => {
      if (q) setReport(q);
      if (p) setDeepPatterns(p);
      if (c) setCoupling(c);
      if (con) setConsistency(con);
      if (td) setTechDebt(td);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <PageLoader message="Analyzing code quality..." />;
  if (!report) return <PageEmpty message="No quality data available. Run 'archlens analyze' first." />;

  const scoreColor = report.projectScore >= 80 ? "#34d399" : report.projectScore >= 60 ? "#fbbf24" : report.projectScore >= 40 ? "#f97316" : "#ef4444";

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-[1200px]">
      {/* Header + Score */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t("quality.title")}</h2>
          <p className="text-sm text-[#5a5a70] mt-1">{report.totalIssues} issues found across {report.modules.length} modules</p>
        </div>
        <div className="relative flex-shrink-0">
          <svg width="100" height="100" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" fill="none" stroke="#1e1e2a" strokeWidth="8" />
            <circle cx="50" cy="50" r="42" fill="none" stroke={scoreColor} strokeWidth="8"
              strokeDasharray={`${(report.projectScore / 100) * 264} 264`}
              strokeLinecap="round" transform="rotate(-90 50 50)" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold" style={{ color: scoreColor }}>{report.projectScore}</span>
            <span className="text-[9px] text-[#5a5a70]">QUALITY</span>
          </div>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 border-b border-[#2a2a3a]">
        {[
          { id: "quality" as const, label: "Code Quality", count: report.totalIssues },
          { id: "coupling" as const, label: "Coupling Analysis", count: coupling?.circularDependencies?.length || 0 },
          { id: "consistency" as const, label: "Consistency", count: consistency?.issues?.length || 0 },
          { id: "debt" as const, label: t("nav.tech_debt"), count: techDebt?.items?.length || 0 },
        ].map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-xs font-semibold transition-colors ${activeTab === tab.id ? "text-archlens-300 border-b-2 border-archlens-400" : "text-[#5a5a70] hover:text-[#8888a0]"}`}>
            {tab.label} {tab.count > 0 && <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded-full bg-[#1e1e2a]">{tab.count}</span>}
          </button>
        ))}
      </div>

      {activeTab === "quality" && (<>
      {/* Severity Summary */}
      <div className="grid grid-cols-4 gap-3">
        {(["critical", "major", "minor", "info"] as const).map((sev) => {
          const cfg = severityConfig[sev];
          const count = report.bySeverity[sev] || 0;
          return (
            <div key={sev} className="rounded-xl border p-4" style={{ borderColor: `${cfg.color}30`, backgroundColor: `${cfg.color}08` }}>
              <div className="flex items-center gap-2 mb-2" style={{ color: cfg.color }}>{cfg.icon} <span className="text-xs font-semibold uppercase">{cfg.label}</span></div>
              <div className="text-2xl font-bold" style={{ color: cfg.color }}>{count}</div>
            </div>
          );
        })}
      </div>

      {/* Architecture Patterns — Deep Analysis */}
      <section>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Layers className="h-5 w-5 text-archlens-400" /> Architecture Patterns</h3>
        <div className="space-y-3">
          {(deepPatterns || report.architecturePatterns.map((p) => ({ ...p, id: p.pattern, status: p.compliance >= 80 ? "excellent" : p.compliance >= 50 ? "good" : "partial", summary: "", evidence: [], relatedPatterns: [] }))).map((pat: any) => {
            const isExpanded = expandedPattern === pat.id;
            const statusColors: Record<string, string> = { excellent: "#34d399", good: "#60a5fa", partial: "#fbbf24", poor: "#ef4444", "not-detected": "#5a5a70" };
            const sc = statusColors[pat.status] || "#5a5a70";
            const evidence = pat.evidence || [];
            const violations = pat.violations || [];

            return (
              <div key={pat.id} className="rounded-xl border overflow-hidden" style={{ borderColor: isExpanded ? `${sc}40` : "#2a2a3a" }}>
                <button onClick={() => setExpandedPattern(isExpanded ? null : pat.id)} className="w-full flex items-center gap-3 px-5 py-4 hover:bg-hover transition-colors text-left">
                  {isExpanded ? <ChevronDown className="h-4 w-4 text-[#5a5a70]" /> : <ChevronRight className="h-4 w-4 text-[#5a5a70]" />}
                  <span className="font-semibold text-[#e4e4ed] flex-1">{pat.pattern}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full capitalize" style={{ backgroundColor: `${sc}15`, color: sc }}>{pat.status}</span>
                  <div className="flex items-center gap-2 w-28">
                    <div className="flex-1 h-2 rounded-full bg-[#1e1e2a] overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pat.compliance}%`, backgroundColor: sc }} />
                    </div>
                    <span className="text-xs font-bold w-8 text-right" style={{ color: sc }}>{pat.compliance}%</span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-[#2a2a3a]">
                    {/* Summary */}
                    <div className="px-5 py-3 bg-deep">
                      <p className="text-sm text-[#8888a0]">{pat.summary}</p>
                      {pat.relatedPatterns?.length > 0 && (
                        <div className="flex gap-1.5 mt-2">
                          {pat.relatedPatterns.map((rp: string) => <span key={rp} className="text-[9px] px-1.5 py-0.5 rounded bg-[#1e1e2a] text-[#5a5a70]">{rp}</span>)}
                        </div>
                      )}
                    </div>

                    {/* Evidence */}
                    {evidence.length > 0 && (
                      <div className="px-5 py-3 border-t border-[#1e1e2a]">
                        <div className="text-[9px] uppercase font-semibold text-[#5a5a70] mb-2">Evidence ({evidence.length})</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                          {evidence.slice(0, 12).map((e: any, i: number) => {
                            const typeColors: Record<string, string> = { aggregate: "#fbbf24", "value-object": "#a78bfa", "domain-event": "#f472b6", entity: "#34d399", repository: "#60a5fa", interface: "#06b6d4", command: "#f97316", query: "#60a5fa", handler: "#34d399", service: "#8888a0", event: "#f472b6", controller: "#60a5fa" };
                            const tc = typeColors[e.type] || "#5a5a70";
                            return (
                              <div key={i} className="flex items-center gap-2 rounded-lg bg-[#1e1e2a] px-2.5 py-1.5">
                                <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ backgroundColor: `${tc}15`, color: tc }}>{e.type}</span>
                                <span className="text-[10px] font-mono text-[#e4e4ed] truncate">{e.name}</span>
                                {e.details && <span className="text-[9px] text-[#5a5a70] ml-auto truncate max-w-[120px]">{e.details}</span>}
                              </div>
                            );
                          })}
                          {evidence.length > 12 && <div className="text-[9px] text-[#5a5a70] px-2">+{evidence.length - 12} more</div>}
                        </div>
                      </div>
                    )}

                    {/* Violations */}
                    {violations.length > 0 && (
                      <div className="px-5 py-3 border-t border-[#1e1e2a]">
                        <div className="text-[9px] uppercase font-semibold text-red-400 mb-2">Violations ({violations.length})</div>
                        {violations.map((v: any, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-xs py-1">
                            <XCircle className="h-3 w-3 mt-0.5 flex-shrink-0 text-red-400" />
                            <div>
                              <span className="text-red-300">{v.message}</span>
                              {v.fix && <div className="text-[10px] text-amber-500 mt-0.5 flex items-center gap-1"><Lightbulb className="h-3 w-3" /> {v.fix}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Recommendations */}
                    {(pat.recommendations || []).length > 0 && (
                      <div className="px-5 py-3 border-t border-[#1e1e2a]">
                        <div className="text-[9px] uppercase font-semibold text-[#5a5a70] mb-2">Recommendations</div>
                        {pat.recommendations.map((r: string, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-[#8888a0] py-0.5">
                            <Lightbulb className="h-3 w-3 mt-0.5 flex-shrink-0 text-amber-500" /> {r}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Module Scores */}
      <section>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Box className="h-5 w-5 text-archlens-400" /> Module Quality</h3>
        <div className="space-y-2">
          {report.modules.sort((a, b) => a.score - b.score).map((mod) => {
            const isExpanded = expandedModule === mod.moduleName;
            const sc = mod.score >= 80 ? "#34d399" : mod.score >= 60 ? "#fbbf24" : mod.score >= 40 ? "#f97316" : "#ef4444";
            return (
              <div key={mod.moduleName} className="rounded-xl border border-[#2a2a3a] overflow-hidden">
                <button onClick={() => setExpandedModule(isExpanded ? null : mod.moduleName)} className="w-full flex items-center gap-3 px-5 py-3 hover:bg-hover transition-colors text-left">
                  {isExpanded ? <ChevronDown className="h-4 w-4 text-[#5a5a70]" /> : <ChevronRight className="h-4 w-4 text-[#5a5a70]" />}
                  <span className="font-mono font-semibold text-sm text-[#e4e4ed] flex-1">{mod.moduleName}/</span>
                  <span className="text-xs text-[#5a5a70]">{mod.issues.length} issues</span>
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${sc}15` }}>
                    <span className="text-sm font-bold" style={{ color: sc }}>{mod.score}</span>
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t border-[#2a2a3a]">
                    {/* Metrics */}
                    <div className="px-5 py-3 bg-surface grid grid-cols-4 gap-3 text-center">
                      {[
                        { l: "Symbols", v: mod.metrics.totalSymbols },
                        { l: "Avg Lines/Method", v: mod.metrics.avgComplexity },
                        { l: "Max Method Lines", v: mod.metrics.maxMethodLines, warn: mod.metrics.maxMethodLines > 50 },
                        { l: "God Classes", v: mod.metrics.godClasses, warn: mod.metrics.godClasses > 0 },
                      ].map((m) => (
                        <div key={m.l} className="rounded-lg bg-elevated p-2">
                          <div className={`text-sm font-bold ${m.warn ? "text-amber-400" : "text-[#e4e4ed]"}`}>{m.v}</div>
                          <div className="text-[8px] text-[#5a5a70] uppercase">{m.l}</div>
                        </div>
                      ))}
                    </div>
                    {/* Issues */}
                    <div className="px-5 py-2 max-h-[400px] overflow-y-auto divide-y divide-[#1e1e2a]">
                      {mod.issues.slice(0, 30).map((issue) => {
                        const cfg = severityConfig[issue.severity] || severityConfig.info;
                        const isSelected = selectedIssue === issue.id;
                        const hasFile = issue.filePath && issue.filePath.includes("/");

                        return (
                          <div key={issue.id} className={`py-2 transition-all ${isSelected ? "bg-archlens-500/5 -mx-5 px-5 rounded-lg" : ""}`}>
                            <button
                              onClick={() => setSelectedIssue(isSelected ? null : issue.id)}
                              className="w-full flex items-start gap-3 text-left"
                            >
                              <span style={{ color: cfg.color }} className="mt-0.5">{cfg.icon}</span>
                              <div className="flex-1 min-w-0">
                                <div className="text-xs text-[#e4e4ed]">{issue.message}</div>
                                <div className="flex items-center gap-2 mt-1 text-[10px] text-[#5a5a70]">
                                  <span className="font-mono px-1 py-0.5 rounded bg-[#1e1e2a]">{issue.rule}</span>
                                  {issue.filePath && <span className="truncate max-w-[200px]">{issue.filePath.split("/").pop()}</span>}
                                  {issue.line && <span className="text-archlens-400">L{issue.line}</span>}
                                </div>
                              </div>
                              <ChevronRight className={`h-3 w-3 text-[#5a5a70] mt-1 transition-transform ${isSelected ? "rotate-90" : ""}`} />
                            </button>

                            {/* Expanded detail */}
                            {isSelected && (
                              <div className="ml-7 mt-2 space-y-2 animate-slide-up">
                                {/* File path */}
                                {issue.filePath && (
                                  <div className="flex items-center gap-2 text-[10px] font-mono text-[#8888a0]">
                                    <FileCode className="h-3 w-3 text-[#5a5a70]" />
                                    <span>{issue.filePath}</span>
                                    {issue.line && <span className="text-archlens-400">: line {issue.line}</span>}
                                  </div>
                                )}

                                {/* Suggestion */}
                                {issue.suggestion && (
                                  <div className="flex items-start gap-2 rounded-lg bg-amber-500/5 border border-amber-500/20 p-2.5">
                                    <Lightbulb className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-amber-500" />
                                    <div>
                                      <div className="text-[10px] uppercase font-semibold text-amber-500 mb-0.5">Suggestion</div>
                                      <div className="text-xs text-[#8888a0]">{issue.suggestion}</div>
                                    </div>
                                  </div>
                                )}

                                {/* Category + Severity detail */}
                                <div className="flex items-center gap-3 text-[10px]">
                                  <span className="px-1.5 py-0.5 rounded" style={{ backgroundColor: `${cfg.color}15`, color: cfg.color }}>{issue.severity}</span>
                                  <span className="text-[#5a5a70]">{issue.category}</span>
                                </div>

                                {/* Go to code button */}
                                {hasFile && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      // Navigate to architecture view with file selected
                                      navigate("/architecture");
                                      // Store selected file for architecture view to pick up
                                      sessionStorage.setItem("archlens-goto-file", issue.filePath);
                                    }}
                                    className="flex items-center gap-1.5 text-[10px] font-medium text-archlens-400 hover:text-archlens-300 transition-colors"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    View in Architecture → {issue.filePath.split("/").pop()}
                                    {issue.line ? `:${issue.line}` : ""}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {mod.issues.length > 30 && (
                        <div className="py-2 text-center text-[10px] text-[#5a5a70]">
                          +{mod.issues.length - 30} more issues
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
      </>)}

      {/* Coupling Tab */}
      {activeTab === "coupling" && coupling && (
        <div className="space-y-6">
          {/* Health Summary */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "Avg Instability", value: coupling.overallHealth.avgInstability, warn: coupling.overallHealth.avgInstability > 0.6 },
              { label: "Avg Abstractness", value: coupling.overallHealth.avgAbstractness, warn: coupling.overallHealth.avgAbstractness < 0.1 },
              { label: "Distance", value: coupling.overallHealth.avgDistance, warn: coupling.overallHealth.avgDistance > 0.5 },
              { label: "Concrete %", value: `${coupling.overallHealth.concreteRatio}%`, warn: coupling.overallHealth.concreteRatio > 70 },
              { label: "Circular Deps", value: coupling.circularDependencies.length, warn: coupling.circularDependencies.length > 0 },
            ].map((m) => (
              <div key={m.label} className={`rounded-xl border p-4 ${m.warn ? "border-amber-500/20 bg-amber-500/5" : "border-[#2a2a3a]"}`}>
                <div className="text-[10px] text-[#5a5a70] uppercase">{m.label}</div>
                <div className={`text-xl font-bold ${m.warn ? "text-amber-400" : "text-[#e4e4ed]"}`}>{m.value}</div>
              </div>
            ))}
          </div>

          {/* Circular Dependencies */}
          {coupling.circularDependencies.length > 0 && (
            <section className="rounded-xl border border-amber-500/20 p-4">
              <h3 className="text-sm font-semibold mb-3 text-amber-400">Circular Dependencies ({coupling.circularDependencies.length})</h3>
              {coupling.circularDependencies.map((cd: any, i: number) => (
                <div key={i} className="flex items-center gap-2 py-1 text-xs">
                  <span className="text-amber-400">⟳</span>
                  <span className="font-mono text-[#e4e4ed]">{cd.cycle.join(" ↔ ")}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1e1e2a] text-[#5a5a70]">{cd.level}</span>
                  <span className="text-[10px] text-[#5a5a70]">{cd.description}</span>
                </div>
              ))}
            </section>
          )}

          {/* Module Coupling Table */}
          <section>
            <h3 className="text-sm font-semibold mb-3">Module Coupling Metrics</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2a2a3a] text-[#5a5a70] text-[10px] uppercase">
                    <th className="text-left py-2 px-3">Module</th>
                    <th className="text-right px-2">Ca</th>
                    <th className="text-right px-2">Ce</th>
                    <th className="text-right px-2">I</th>
                    <th className="text-right px-2">A</th>
                    <th className="text-right px-2">D</th>
                    <th className="text-right px-2">Concrete</th>
                    <th className="text-right px-2">Abstract</th>
                    <th className="text-right px-2">Ratio</th>
                  </tr>
                </thead>
                <tbody>
                  {coupling.modules.slice(0, 15).map((m: any) => {
                    const iColor = m.instability > 0.7 ? "#ef4444" : m.instability > 0.4 ? "#fbbf24" : "#34d399";
                    return (
                      <tr key={m.moduleName} className="border-b border-[#1e1e2a] hover:bg-hover">
                        <td className="py-2 px-3 font-mono text-[#e4e4ed]">{m.moduleName}</td>
                        <td className="text-right px-2 text-[#8888a0]">{m.afferentCoupling}</td>
                        <td className="text-right px-2 text-[#8888a0]">{m.efferentCoupling}</td>
                        <td className="text-right px-2 font-bold" style={{ color: iColor }}>{m.instability}</td>
                        <td className="text-right px-2 text-[#8888a0]">{m.abstractness}</td>
                        <td className="text-right px-2 text-[#8888a0]">{m.distanceFromMainSeq}</td>
                        <td className="text-right px-2 text-red-400">{m.concreteDeps}</td>
                        <td className="text-right px-2 text-emerald-400">{m.abstractDeps}</td>
                        <td className="text-right px-2" style={{ color: m.couplingRatio > 0.5 ? "#34d399" : "#fbbf24" }}>{Math.round(m.couplingRatio * 100)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-[9px] text-[#5a5a70]">
              Ca=Afferent (incoming) · Ce=Efferent (outgoing) · I=Instability · A=Abstractness · D=Distance from main sequence
            </div>
          </section>
        </div>
      )}

      {/* Consistency Tab */}
      {activeTab === "consistency" && consistency && (
        <div className="space-y-6">
          <p className="text-sm text-[#8888a0]">{consistency.summary}</p>

          {/* Module Scores */}
          <section>
            <h3 className="text-sm font-semibold mb-3">Cross-Cutting Concern Consistency</h3>
            <div className="space-y-2">
              {consistency.moduleScores.sort((a: any, b: any) => a.overall - b.overall).map((m: any) => (
                <div key={m.module} className="flex items-center gap-3 rounded-lg border border-[#2a2a3a] px-4 py-2">
                  <span className="font-mono text-sm text-[#e4e4ed] w-40 truncate">{m.module}</span>
                  <div className="flex-1 flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-[#5a5a70]">Error Handling</span>
                      <div className="w-20 h-1.5 rounded-full bg-[#1e1e2a]"><div className="h-full rounded-full" style={{ width: `${m.errorHandling}%`, backgroundColor: m.errorHandling >= 80 ? "#34d399" : m.errorHandling >= 50 ? "#fbbf24" : "#ef4444" }} /></div>
                      <span className="text-[10px] font-bold" style={{ color: m.errorHandling >= 80 ? "#34d399" : "#fbbf24" }}>{m.errorHandling}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-[#5a5a70]">Logging</span>
                      <div className="w-20 h-1.5 rounded-full bg-[#1e1e2a]"><div className="h-full rounded-full" style={{ width: `${m.logging}%`, backgroundColor: m.logging >= 80 ? "#34d399" : m.logging >= 50 ? "#fbbf24" : "#ef4444" }} /></div>
                      <span className="text-[10px] font-bold" style={{ color: m.logging >= 80 ? "#34d399" : "#fbbf24" }}>{m.logging}%</span>
                    </div>
                  </div>
                  <span className="text-sm font-bold" style={{ color: m.overall >= 80 ? "#34d399" : m.overall >= 50 ? "#fbbf24" : "#ef4444" }}>{m.overall}%</span>
                </div>
              ))}
            </div>
          </section>

          {/* Issues */}
          {consistency.issues.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold mb-3">Consistency Issues ({consistency.issues.length})</h3>
              <div className="space-y-2">
                {consistency.issues.map((issue: any, i: number) => (
                  <div key={i} className="rounded-lg border border-[#2a2a3a] px-4 py-3">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: issue.severity === "major" ? "rgba(239,68,68,0.1)" : "rgba(251,191,36,0.1)", color: issue.severity === "major" ? "#ef4444" : "#fbbf24" }}>{issue.severity}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#1e1e2a] text-[#5a5a70]">{issue.category}</span>
                      <span className="font-mono text-[#8888a0]">{issue.module}</span>
                    </div>
                    <div className="text-xs text-[#e4e4ed] mt-1">{issue.description}</div>
                    <div className="text-[10px] text-[#5a5a70] mt-0.5">{issue.evidence}</div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
      {/* Tech Debt Tab */}
      {activeTab === "debt" && techDebt && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5">
              <div className="text-xs text-[#5a5a70] uppercase mb-2">{t("debt.total_fix")}</div>
              <div className="text-3xl font-bold text-red-400">${(techDebt.totalEstimatedCost / 1000).toFixed(0)}k</div>
              <div className="text-xs text-[#5a5a70] mt-1">{techDebt.totalEstimatedHours} {t("debt.hours")}</div>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
              <div className="text-xs text-[#5a5a70] uppercase mb-2">{t("debt.annual")}</div>
              <div className="text-3xl font-bold text-amber-400">${(techDebt.totalAnnualCost / 1000).toFixed(0)}k</div>
              <div className="text-xs text-[#5a5a70] mt-1">{t("debt.ongoing")}</div>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
              <div className="text-xs text-[#5a5a70] uppercase mb-2">{t("debt.best_roi")}</div>
              <div className="text-3xl font-bold text-emerald-400">{techDebt.quickWins.length}</div>
              <div className="text-xs text-[#5a5a70] mt-1">{t("debt.quick_wins")}</div>
            </div>
          </div>
          {techDebt.items.map((item: any, i: number) => (
            <div key={i} className="rounded-xl border border-[#2a2a3a] p-4 flex items-center justify-between">
              <div>
                <div className="font-semibold text-[#e4e4ed]">{item.category}</div>
                <div className="text-xs text-[#8888a0] mt-0.5">{item.description}</div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-[#e4e4ed]">${(item.estimatedCost / 1000).toFixed(1)}k</span>
                <span className="text-amber-400">${(item.annualCost / 1000).toFixed(1)}k/yr</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-archlens-500/10 text-archlens-300">ROI: {item.roi.toFixed(1)}x</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
