import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../lib/store.js";
import {
  Sparkles, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  Lightbulb, Target, Zap, ArrowRight, MessageCircle, Send, Trash2,
} from "lucide-react";
import { PageLoader } from "../components/PageLoader.js";
import { useAllAnalysis, useHotspots as useHotspotsQuery, useComments as useCommentsQuery } from "../services/queries.js";
import { api } from "../services/api-client.js";

interface Insight {
  id: string;
  type: "strength" | "warning" | "critical" | "opportunity" | "info";
  category: string;
  title: string;
  narrative: string;
  evidence: string[];
  action?: { label: string; link: string };
}

interface Comment {
  id: string;
  target: string;
  text: string;
  author: string;
  createdAt: string;
}

const ICONS: Record<string, React.ReactNode> = {
  strength: <CheckCircle2 className="h-5 w-5" />,
  warning: <AlertTriangle className="h-5 w-5" />,
  critical: <AlertTriangle className="h-5 w-5" />,
  opportunity: <Target className="h-5 w-5" />,
  info: <Lightbulb className="h-5 w-5" />,
};

const COLORS: Record<string, string> = {
  strength: "#34d399",
  warning: "#fbbf24",
  critical: "#ef4444",
  opportunity: "#60a5fa",
  info: "#a78bfa",
};

export function InsightsView() {
  const { model } = useStore();
  const navigate = useNavigate();
  const { quality, coupling, security, deadcode, techdebt: techDebt, isLoading: loading } = useAllAnalysis();
  const { data: hotspots } = useHotspotsQuery();
  const { data: commentsData } = useCommentsQuery("insights");
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");

  // Sync query data to local state (for mutations)
  if (commentsData && comments.length === 0 && commentsData.length > 0) {
    setComments(commentsData as Comment[]);
  }

  const insights = useMemo((): Insight[] => {
    if (!model) return [];
    const out: Insight[] = [];

    // Quality
    if (quality) {
      const score = quality.projectScore;
      if (score >= 85) {
        out.push({
          id: "q-strong",
          type: "strength",
          category: "Code Quality",
          title: "High-quality codebase",
          narrative: `The project maintains an excellent quality score of ${score}/100. With only ${quality.totalIssues} issues across ${quality.modules.length} modules, the team has strong coding discipline.`,
          evidence: [
            `Quality score: ${score}/100`,
            `${quality.bySeverity.critical || 0} critical issues`,
            `${quality.modules.length} modules analyzed`,
          ],
          action: { label: "Review quality details", link: "/quality" },
        });
      } else if (score < 50) {
        const critical = quality.bySeverity.critical || 0;
        out.push({
          id: "q-low",
          type: "critical",
          category: "Code Quality",
          title: `Quality score is critically low (${score}/100)`,
          narrative: `The codebase has significant quality concerns. With ${quality.totalIssues} total issues including ${critical} critical violations, immediate attention is needed. Focus on the worst modules first.`,
          evidence: [
            `${critical} critical issues require immediate fixes`,
            `${quality.bySeverity.major || 0} major issues`,
            `${quality.modules.filter((m: any) => m.score < 40).length} modules below 40/100`,
          ],
          action: { label: "Fix critical issues", link: "/quality" },
        });
      } else {
        out.push({
          id: "q-mid",
          type: "warning",
          category: "Code Quality",
          title: `Quality is acceptable but improvable (${score}/100)`,
          narrative: `The codebase has moderate quality. ${quality.totalIssues} issues found — addressing the top 20% would yield the biggest improvement. Consider setting quality gates in CI.`,
          evidence: [
            `${quality.bySeverity.critical || 0} critical, ${quality.bySeverity.major || 0} major`,
            `Average module score: ${Math.round(quality.modules.reduce((a: number, m: any) => a + m.score, 0) / Math.max(quality.modules.length, 1))}`,
          ],
          action: { label: "View modules", link: "/quality" },
        });
      }
    }

    // Coupling
    if (coupling?.overallHealth) {
      const inst = coupling.overallHealth.avgInstability;
      const circs = coupling.circularDependencies?.length || 0;

      if (circs > 0) {
        out.push({
          id: "c-circular",
          type: "critical",
          category: "Architecture",
          title: `${circs} circular dependencies detected`,
          narrative: `Circular dependencies are a strong code smell — they make the system harder to test, refactor, and reason about. Each cycle should be broken by introducing an interface or moving shared code to a lower layer.`,
          evidence: coupling.circularDependencies.slice(0, 3).map((cd: any) => `${(cd.cycle || []).join(" ↔ ")}`),
          action: { label: "Inspect dependencies", link: "/quality" },
        });
      }

      if (inst > 0.7) {
        out.push({
          id: "c-unstable",
          type: "warning",
          category: "Architecture",
          title: "High overall instability",
          narrative: `The codebase has an average instability of ${inst.toFixed(2)}, meaning most modules depend on others rather than being depended upon. While this isn't always bad, it suggests few abstractions and tight coupling.`,
          evidence: [
            `Average instability: ${inst.toFixed(2)}`,
            `Concrete ratio: ${coupling.overallHealth.concreteRatio || 0}%`,
          ],
          action: { label: "View coupling", link: "/quality" },
        });
      } else if (inst < 0.3 && circs === 0) {
        out.push({
          id: "c-stable",
          type: "strength",
          category: "Architecture",
          title: "Stable, well-layered architecture",
          narrative: `The dependency structure is healthy with no circular dependencies and an instability of ${inst.toFixed(2)}. This is the hallmark of a well-designed system following SOLID principles.`,
          evidence: [`No circular dependencies`, `Stable instability: ${inst.toFixed(2)}`],
        });
      }
    }

    // Security
    if (security) {
      if (security.totalIssues > 0) {
        out.push({
          id: "s-issues",
          type: security.totalIssues > 5 ? "critical" : "warning",
          category: "Security",
          title: `${security.totalIssues} security ${security.totalIssues === 1 ? "issue" : "issues"} found`,
          narrative: `Static analysis detected potential security vulnerabilities. While these need manual verification, each one is a potential attack vector. Address these before any production deployment.`,
          evidence: [`Security score: ${security.score}/100`, `${security.totalIssues} potential vulnerabilities`],
          action: { label: "Review security", link: "/quality" },
        });
      } else {
        out.push({
          id: "s-clean",
          type: "strength",
          category: "Security",
          title: "No security issues detected",
          narrative: `Static security analysis found no obvious vulnerabilities. This doesn't replace a full security audit, but it's a good baseline.`,
          evidence: [`Security score: ${security.score}/100`],
        });
      }
    }

    // Dead Code
    if (deadcode && deadcode.totalDead > 10) {
      const lines = deadcode.estimatedCleanupLines;
      out.push({
        id: "d-dead",
        type: "opportunity",
        category: "Maintenance",
        title: `${deadcode.totalDead} unused symbols can be removed`,
        narrative: `Dead code increases cognitive load and maintenance burden. Removing it would clean up approximately ${lines.toLocaleString()} lines of code. This is a low-risk, high-value cleanup opportunity.`,
        evidence: [
          `${deadcode.totalDead} unreferenced symbols`,
          `~${lines.toLocaleString()} lines to remove`,
        ],
        action: { label: "View dead code", link: "/quality" },
      });
    }

    // Tech Debt
    if (techDebt && techDebt.totalEstimatedCost > 0) {
      const cost = techDebt.totalEstimatedCost;
      const annual = techDebt.totalAnnualCost;
      out.push({
        id: "td-debt",
        type: cost > 50000 ? "warning" : "opportunity",
        category: "Tech Debt",
        title: `Tech debt: $${(cost / 1000).toFixed(0)}k to fix`,
        narrative: `Total accumulated debt is estimated at ${techDebt.totalEstimatedHours} hours of refactoring work. Left unaddressed, this debt costs ~$${(annual / 1000).toFixed(0)}k annually in slowdowns and bugs. Prioritize quick wins for fastest ROI.`,
        evidence: [
          `${techDebt.totalEstimatedHours} hours of work`,
          `$${(annual / 1000).toFixed(0)}k annual ongoing cost`,
          `${techDebt.quickWins?.length || 0} quick-win refactorings available`,
        ],
        action: { label: "View tech debt", link: "/quality" },
      });
    }

    // Hotspots
    if (hotspots && hotspots.hotspots && hotspots.hotspots.length > 0) {
      const high = hotspots.hotspots.filter((h: any) => h.riskScore >= 50);
      if (high.length > 0) {
        const top = hotspots.hotspots[0];
        out.push({
          id: "h-hotspot",
          type: "warning",
          category: "Risk",
          title: `${high.length} high-risk hotspots`,
          narrative: `Files that change frequently AND are complex are your highest-risk areas. The top hotspot "${top.filePath.split("/").pop()}" has been changed ${top.changeFrequency} times. Consider refactoring or splitting these files.`,
          evidence: high.slice(0, 3).map((h: any) => `${h.filePath.split("/").pop()} (risk: ${h.riskScore})`),
          action: { label: "View hotspots", link: "/hotspots" },
        });
      }
    }

    // Architecture-level insights from model
    const layerCounts = new Map<string, number>();
    for (const m of model.modules) {
      layerCounts.set(m.layer, (layerCounts.get(m.layer) || 0) + 1);
    }
    if ((layerCounts.get("api") || 0) > model.modules.length * 0.4) {
      out.push({
        id: "arch-api-heavy",
        type: "info",
        category: "Architecture",
        title: "API-first architecture detected",
        narrative: `Over 40% of your modules are in the API layer. This indicates an API-first or microservices architecture. Watch for gateway/orchestration patterns and ensure consistent error handling across services.`,
        evidence: [
          `${layerCounts.get("api")} API modules out of ${model.modules.length}`,
          `${model.apiEndpoints.length} total endpoints`,
        ],
      });
    }

    if (model.dbEntities.length > 15) {
      out.push({
        id: "arch-data-heavy",
        type: "info",
        category: "Architecture",
        title: "Data-rich domain model",
        narrative: `${model.dbEntities.length} database entities suggest a complex domain. Make sure entity relationships are well-documented and consider Domain-Driven Design patterns to manage complexity.`,
        evidence: [
          `${model.dbEntities.length} entities`,
          `${model.dbEntities.reduce((a: number, e: any) => a + e.columns.length, 0)} total columns`,
        ],
        action: { label: "View ER diagram", link: "/structure" },
      });
    }

    // Simulator incidents (if simulation was run)
    const simSnap = useStore.getState().simulatorSnapshot;
    if (simSnap && simSnap.topIncidents.length > 0) {
      out.push({
        id: "sim-summary",
        type: simSnap.sloMet ? "info" : "critical",
        category: "Simulator",
        title: simSnap.sloMet
          ? `Simulator: SLO met (${(simSnap.successRate * 100).toFixed(1)}% success, P99 ${Math.round(simSnap.p99LatencyMs)}ms)`
          : `Simulator: SLO BREACHED — ${simSnap.incidentCount} incidents detected`,
        narrative: simSnap.bottleneck
          ? `Bottleneck: ${simSnap.bottleneck}. Monthly cost estimate: $${Math.round(simSnap.monthlyCost).toLocaleString()}/mo. ${simSnap.totalErrors} errors out of ${simSnap.totalRequests} requests.`
          : `Monthly cost: $${Math.round(simSnap.monthlyCost).toLocaleString()}/mo. Simulation ran for ${simSnap.uptime}s.`,
        evidence: simSnap.topIncidents.map((inc) => `${inc.nodeLabel}: ${inc.label} (${inc.severity}%)`),
        action: { label: "Open Simulator", link: "/simulator" },
      });
    }

    // Sort: critical → warning → opportunity → info → strength
    const order = { critical: 0, warning: 1, opportunity: 2, info: 3, strength: 4 };
    return out.sort((a, b) => (order[a.type] ?? 5) - (order[b.type] ?? 5));
  }, [model, quality, coupling, security, deadcode, techDebt, hotspots]);

  const addComment = async () => {
    if (!newComment.trim()) return;
    const c = await api.addComment("insights", newComment.trim());
    if (c) { setComments([...comments, c]); setNewComment(""); }
  };

  const deleteComment = async (id: string) => {
    await api.deleteComment(id);
    setComments(comments.filter((c) => c.id !== id));
  };

  if (!model) return null;
  if (loading) return <PageLoader message="Generating insights..." />;

  // Counts for summary
  const counts = {
    critical: insights.filter((i) => i.type === "critical").length,
    warning: insights.filter((i) => i.type === "warning").length,
    opportunity: insights.filter((i) => i.type === "opportunity").length,
    strength: insights.filter((i) => i.type === "strength").length,
  };

  // Overall verdict
  let verdict = "";
  if (counts.critical > 0) verdict = "needs urgent attention";
  else if (counts.warning > 2) verdict = "has notable concerns";
  else if (counts.strength > counts.warning) verdict = "is in healthy shape";
  else verdict = "is functional with room for improvement";

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1100px]">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-archlens-400" /> Smart Insights
        </h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Aggregated narrative analysis from all detection engines.
        </p>
      </div>

      {/* Verdict */}
      <div className="rounded-2xl border border-archlens-500/20 bg-gradient-to-br from-archlens-500/5 to-transparent p-6">
        <div className="flex items-center gap-2 text-[10px] uppercase font-semibold text-archlens-300 tracking-widest mb-2">
          <Sparkles className="h-3 w-3" /> Executive Summary
        </div>
        <h3 className="text-xl font-bold text-[var(--color-text-primary)] leading-snug">
          The codebase {verdict}.
        </h3>
        <p className="text-sm text-[var(--color-text-secondary)] mt-2">
          {insights.length} findings across {new Set(insights.map((i) => i.category)).size} categories.
          {counts.critical > 0 && <span className="text-red-400"> {counts.critical} critical {counts.critical === 1 ? "issue" : "issues"} need attention.</span>}
          {counts.opportunity > 0 && <span className="text-blue-400"> {counts.opportunity} {counts.opportunity === 1 ? "opportunity" : "opportunities"} for improvement.</span>}
          {counts.strength > 0 && <span className="text-emerald-400"> {counts.strength} architectural strengths.</span>}
        </p>
      </div>

      {/* Counts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Critical", value: counts.critical, color: COLORS.critical, icon: <AlertTriangle className="h-4 w-4" /> },
          { label: "Warnings", value: counts.warning, color: COLORS.warning, icon: <TrendingDown className="h-4 w-4" /> },
          { label: "Opportunities", value: counts.opportunity, color: COLORS.opportunity, icon: <Target className="h-4 w-4" /> },
          { label: "Strengths", value: counts.strength, color: COLORS.strength, icon: <TrendingUp className="h-4 w-4" /> },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border p-4" style={{ borderColor: `${c.color}30`, backgroundColor: `${c.color}08` }}>
            <div className="flex items-center gap-2 mb-2" style={{ color: c.color }}>
              {c.icon}
              <span className="text-[10px] uppercase font-semibold">{c.label}</span>
            </div>
            <div className="text-2xl font-bold" style={{ color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Insights */}
      <section>
        <h3 className="text-sm font-semibold mb-3">All Insights ({insights.length})</h3>
        <div className="space-y-3">
          {insights.map((insight) => {
            const color = COLORS[insight.type];
            return (
              <div
                key={insight.id}
                className="rounded-xl border overflow-hidden"
                style={{ borderColor: `${color}30` }}
              >
                <div className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="rounded-lg p-2.5 flex-shrink-0" style={{ backgroundColor: `${color}15`, color }}>
                      {ICONS[insight.type]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[9px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded-full" style={{ backgroundColor: `${color}15`, color }}>
                          {insight.type}
                        </span>
                        <span className="text-[9px] text-[var(--color-text-muted)] uppercase">{insight.category}</span>
                      </div>
                      <h4 className="text-base font-semibold text-[var(--color-text-primary)] mb-2">{insight.title}</h4>
                      <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">{insight.narrative}</p>

                      {insight.evidence.length > 0 && (
                        <div className="mt-3 space-y-1">
                          {insight.evidence.map((e, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                              <Zap className="h-3 w-3" style={{ color }} />
                              <span className="font-mono">{e}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {insight.action && (
                        <button
                          onClick={() => navigate(insight.action!.link)}
                          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold transition-colors"
                          style={{ color }}
                        >
                          {insight.action.label} <ArrowRight className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Comments */}
      <section className="rounded-xl border border-[var(--color-border-default)] bg-elevated p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-archlens-400" /> Team Notes ({comments.length})
        </h3>

        {/* Add comment */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addComment()}
            placeholder="Add a note about these findings..."
            className="flex-1 rounded-lg bg-deep border border-[var(--color-border-default)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-archlens-500/40"
          />
          <button
            onClick={addComment}
            disabled={!newComment.trim()}
            className="px-4 py-2 rounded-lg bg-archlens-500 text-white text-sm font-semibold disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>

        {/* Comments list */}
        {comments.length === 0 ? (
          <p className="text-xs text-[var(--color-text-muted)] italic">No notes yet. Add one to start a discussion with your team.</p>
        ) : (
          <div className="space-y-2">
            {comments.map((c) => (
              <div key={c.id} className="rounded-lg bg-[var(--color-border-subtle)] p-3 group">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-archlens-300">{c.author}</span>
                      <span className="text-[10px] text-[var(--color-text-muted)]">{new Date(c.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-[var(--color-text-primary)]">{c.text}</p>
                  </div>
                  <button
                    onClick={() => deleteComment(c.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 text-[var(--color-text-muted)] hover:text-red-400 transition-all"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
