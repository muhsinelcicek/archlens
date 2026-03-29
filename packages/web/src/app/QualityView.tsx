import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2, XCircle,
  Bug, Code2, Box, Layers, GitBranch, ChevronDown, ChevronRight,
  Lightbulb, ArrowRight, ExternalLink, FileCode,
} from "lucide-react";

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
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/quality")
      .then((r) => r.json())
      .then((d) => { setReport(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64 text-[#5a5a70]">Analyzing code quality...</div>;
  if (!report) return <div className="p-6 text-[#5a5a70]">No quality data available</div>;

  const scoreColor = report.projectScore >= 80 ? "#34d399" : report.projectScore >= 60 ? "#fbbf24" : report.projectScore >= 40 ? "#f97316" : "#ef4444";

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-[1200px]">
      {/* Header + Score */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold">Code Quality & Architecture Patterns</h2>
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

      {/* Architecture Patterns */}
      <section>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Layers className="h-5 w-5 text-archlens-400" /> Architecture Patterns</h3>
        <div className="space-y-2">
          {report.architecturePatterns.map((pat) => {
            const isExpanded = expandedPattern === pat.pattern;
            const compColor = pat.compliance >= 80 ? "#34d399" : pat.compliance >= 50 ? "#fbbf24" : pat.compliance > 0 ? "#f97316" : "#5a5a70";
            return (
              <div key={pat.pattern} className="rounded-xl border border-[#2a2a3a] overflow-hidden">
                <button onClick={() => setExpandedPattern(isExpanded ? null : pat.pattern)} className="w-full flex items-center gap-3 px-5 py-3 hover:bg-hover transition-colors text-left">
                  {isExpanded ? <ChevronDown className="h-4 w-4 text-[#5a5a70]" /> : <ChevronRight className="h-4 w-4 text-[#5a5a70]" />}
                  <span className="font-semibold text-sm text-[#e4e4ed] flex-1">{pat.pattern}</span>
                  {pat.detected ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-archlens-500/10 text-archlens-300">Detected</span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1e1e2a] text-[#5a5a70]">Not detected</span>
                  )}
                  <div className="flex items-center gap-2 w-24">
                    <div className="flex-1 h-2 rounded-full bg-[#1e1e2a] overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pat.compliance}%`, backgroundColor: compColor }} />
                    </div>
                    <span className="text-xs font-bold w-8 text-right" style={{ color: compColor }}>{pat.compliance}%</span>
                  </div>
                </button>
                {isExpanded && (
                  <div className="px-5 py-3 border-t border-[#2a2a3a] bg-surface">
                    {pat.violations.length > 0 && (
                      <div className="mb-3">
                        <div className="text-[10px] uppercase font-semibold text-[#5a5a70] mb-1">Violations</div>
                        {pat.violations.map((v, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-red-400 py-0.5">
                            <XCircle className="h-3 w-3 mt-0.5 flex-shrink-0" /> {v}
                          </div>
                        ))}
                      </div>
                    )}
                    {pat.recommendations.length > 0 && (
                      <div>
                        <div className="text-[10px] uppercase font-semibold text-[#5a5a70] mb-1">Recommendations</div>
                        {pat.recommendations.map((r, i) => (
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
    </div>
  );
}
