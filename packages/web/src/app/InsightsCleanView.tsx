/**
 * InsightsCleanView — narrative analysis with constellation style.
 *
 * Sections:
 * 1. Executive verdict (gradient card)
 * 2. Severity count cards (4)
 * 3. Insight cards (sorted by severity)
 * 4. Team notes
 */

import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../lib/store.js";
import { useAllAnalysis, useHotspots as useHotspotsQuery } from "../services/queries.js";
import { api } from "../services/api-client.js";
import { Card } from "../components/ui/Card.js";
import { Badge } from "../components/ui/Badge.js";
import { ProgressBar } from "../components/ui/ProgressBar.js";
import { PageLoader } from "../components/PageLoader.js";
import {
  Sparkles, AlertTriangle, CheckCircle2, Target, Lightbulb,
  ArrowRight, MessageCircle, Send, Trash2,
} from "lucide-react";

type InsightType = "critical" | "warning" | "opportunity" | "info" | "strength";

interface Insight {
  id: string;
  type: InsightType;
  category: string;
  title: string;
  narrative: string;
  evidence: string[];
  action?: { label: string; link: string };
}

const TYPE_CONFIG: Record<InsightType, { icon: React.ElementType; color: string; label: string }> = {
  critical: { icon: AlertTriangle, color: "#ef4444", label: "Critical" },
  warning: { icon: AlertTriangle, color: "#fbbf24", label: "Warning" },
  opportunity: { icon: Target, color: "#60a5fa", label: "Opportunity" },
  info: { icon: Lightbulb, color: "#a78bfa", label: "Info" },
  strength: { icon: CheckCircle2, color: "#34d399", label: "Strength" },
};

export function InsightsCleanView() {
  const { model, simulatorSnapshot } = useStore();
  const navigate = useNavigate();
  const { quality, coupling, security, deadcode, techdebt: techDebt, isLoading } = useAllAnalysis();
  const { data: hotspots } = useHotspotsQuery();
  const [comments, setComments] = useState<Array<{ id: string; text: string; author: string; createdAt: string }>>([]);
  const [newComment, setNewComment] = useState("");
  const [commentsLoaded, setCommentsLoaded] = useState(false);

  // Load comments once
  if (!commentsLoaded) {
    setCommentsLoaded(true);
    api.getComments("insights").then((data) => { if (data) setComments(data as any); });
  }

  // Generate insights from all data sources
  const insights = useMemo((): Insight[] => {
    if (!model) return [];
    const out: Insight[] = [];

    // Quality
    if (quality) {
      if (quality.projectScore >= 85) {
        out.push({ id: "q-good", type: "strength", category: "Quality", title: `Quality score: ${quality.projectScore}/100`, narrative: `The codebase maintains excellent quality with ${quality.totalIssues} issues across ${quality.modules.length} modules.`, evidence: [`${quality.bySeverity?.critical || 0} critical`, `${quality.bySeverity?.major || 0} major`], action: { label: "View details", link: "/quality" } });
      } else if (quality.projectScore < 50) {
        out.push({ id: "q-bad", type: "critical", category: "Quality", title: `Quality critically low (${quality.projectScore}/100)`, narrative: `${quality.totalIssues} issues detected. Focus on the worst modules first.`, evidence: [`${quality.bySeverity?.critical || 0} critical issues`], action: { label: "Fix issues", link: "/quality" } });
      } else {
        out.push({ id: "q-mid", type: "warning", category: "Quality", title: `Quality score: ${quality.projectScore}/100`, narrative: `${quality.totalIssues} issues found. Addressing the top 20% would yield the biggest improvement.`, evidence: [`${quality.modules.length} modules analyzed`], action: { label: "Review", link: "/quality" } });
      }
    }

    // Coupling
    if (coupling?.overallHealth) {
      if (coupling.overallHealth.circularCount > 0) {
        out.push({ id: "c-circ", type: "critical", category: "Architecture", title: `${coupling.overallHealth.circularCount} circular dependencies`, narrative: "Circular dependencies make testing and refactoring harder. Each cycle should be broken.", evidence: coupling.circularDependencies?.slice(0, 3).map((c: any) => (c.cycle || []).join(" ↔ ")) || [], action: { label: "Inspect", link: "/quality" } });
      }
      if (coupling.overallHealth.avgInstability < 0.3) {
        out.push({ id: "c-stable", type: "strength", category: "Architecture", title: "Stable architecture", narrative: `Average instability ${coupling.overallHealth.avgInstability.toFixed(2)} — well-layered.`, evidence: ["No major coupling issues"] });
      }
    }

    // Security
    if (security) {
      if (security.totalIssues > 0) {
        out.push({ id: "s-issues", type: security.totalIssues > 5 ? "critical" : "warning", category: "Security", title: `${security.totalIssues} security vulnerabilities`, narrative: "Address before production deployment.", evidence: [`Score: ${security.score}/100`], action: { label: "Review", link: "/quality" } });
      } else {
        out.push({ id: "s-clean", type: "strength", category: "Security", title: "No security issues", narrative: "Static analysis found no vulnerabilities.", evidence: [`Score: ${security.score}/100`] });
      }
    }

    // Dead code
    if (deadcode && deadcode.totalDead > 10) {
      out.push({ id: "d-dead", type: "opportunity", category: "Maintenance", title: `${deadcode.totalDead} unused symbols`, narrative: `~${deadcode.estimatedCleanupLines.toLocaleString()} lines can be removed.`, evidence: [`${deadcode.totalDead} unreferenced`], action: { label: "Clean up", link: "/quality" } });
    }

    // Tech debt
    if (techDebt && techDebt.totalEstimatedCost > 0) {
      out.push({ id: "td", type: techDebt.totalEstimatedCost > 50000 ? "warning" : "opportunity", category: "Tech Debt", title: `$${(techDebt.totalEstimatedCost / 1000).toFixed(0)}k in tech debt`, narrative: `${techDebt.totalEstimatedHours} hours of work. ${techDebt.quickWins?.length || 0} quick wins available.`, evidence: [`$${(techDebt.totalAnnualCost / 1000).toFixed(0)}k annual cost if unaddressed`], action: { label: "Plan", link: "/quality" } });
    }

    // Hotspots
    if (hotspots && (hotspots as any).hotspots?.length > 0) {
      const high = (hotspots as any).hotspots.filter((h: any) => h.riskScore >= 50);
      if (high.length > 0) {
        out.push({ id: "h-hot", type: "warning", category: "Risk", title: `${high.length} hotspot files`, narrative: `Files that change often AND are complex. Top: ${high[0].filePath.split("/").pop()}`, evidence: high.slice(0, 3).map((h: any) => `${h.filePath.split("/").pop()} (risk: ${h.riskScore})`), action: { label: "View", link: "/quality" } });
      }
    }

    // Simulator
    if (simulatorSnapshot) {
      out.push({
        id: "sim", type: simulatorSnapshot.sloMet ? "info" : "critical", category: "Simulator",
        title: simulatorSnapshot.sloMet ? `Simulator: SLO met` : `Simulator: SLO BREACHED`,
        narrative: `${(simulatorSnapshot.successRate * 100).toFixed(1)}% success, P99 ${Math.round(simulatorSnapshot.p99LatencyMs)}ms, $${Math.round(simulatorSnapshot.monthlyCost).toLocaleString()}/mo`,
        evidence: simulatorSnapshot.topIncidents.map((i) => `${i.nodeLabel}: ${i.label}`),
        action: { label: "Open Simulator", link: "/simulator" },
      });
    }

    // Architecture
    if (model.modules.length > 15) {
      out.push({ id: "arch-large", type: "info", category: "Architecture", title: `${model.modules.length} modules — complex domain`, narrative: `${model.dbEntities.length} entities, ${model.apiEndpoints.length} endpoints. Consider DDD patterns.`, evidence: [`${model.stats.files} files, ${model.stats.totalLines.toLocaleString()} lines`] });
    }

    const order: Record<InsightType, number> = { critical: 0, warning: 1, opportunity: 2, info: 3, strength: 4 };
    return out.sort((a, b) => (order[a.type] ?? 5) - (order[b.type] ?? 5));
  }, [model, quality, coupling, security, deadcode, techDebt, hotspots, simulatorSnapshot]);

  if (!model) return null;
  if (isLoading) return <PageLoader message="Generating insights..." />;

  const counts = {
    critical: insights.filter((i) => i.type === "critical").length,
    warning: insights.filter((i) => i.type === "warning").length,
    opportunity: insights.filter((i) => i.type === "opportunity").length,
    strength: insights.filter((i) => i.type === "strength").length,
  };

  const verdict = counts.critical > 0 ? "needs urgent attention"
    : counts.warning > 2 ? "has notable concerns"
    : counts.strength > counts.warning ? "is in healthy shape"
    : "is functional with room for improvement";

  return (
    <div className="p-6 lg:p-8 max-w-[900px] mx-auto space-y-6">

      {/* ── Verdict ── */}
      <div className="rounded-xl p-6" style={{
        background: "linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(6,182,212,0.04) 100%)",
        border: "1px solid rgba(139,92,246,0.15)",
      }}>
        <div className="flex items-center gap-2 text-[10px] uppercase font-semibold tracking-widest mb-2" style={{ color: "var(--color-accent)" }}>
          <Sparkles className="h-3 w-3" style={{ filter: "drop-shadow(0 0 4px var(--color-accent-glow))" }} /> Executive Summary
        </div>
        <h2 className="text-xl font-bold text-[var(--color-text-primary)]">
          The codebase {verdict}.
        </h2>
        <p className="text-sm text-[var(--color-text-secondary)] mt-2">
          {insights.length} findings across {new Set(insights.map((i) => i.category)).size} categories.
        </p>
      </div>

      {/* ── Counts ── */}
      <div className="grid grid-cols-4 gap-3">
        {([
          { key: "critical", ...TYPE_CONFIG.critical, count: counts.critical },
          { key: "warning", ...TYPE_CONFIG.warning, count: counts.warning },
          { key: "opportunity", ...TYPE_CONFIG.opportunity, count: counts.opportunity },
          { key: "strength", ...TYPE_CONFIG.strength, count: counts.strength },
        ] as const).map((c) => (
          <Card key={c.key} padding="sm">
            <div className="flex items-center gap-2 mb-1" style={{ color: c.color }}>
              <c.icon className="h-3.5 w-3.5" />
              <span className="text-[10px] uppercase font-semibold">{c.label}</span>
            </div>
            <div className="text-2xl font-bold" style={{ color: c.color }}>{c.count}</div>
          </Card>
        ))}
      </div>

      {/* ── Insights ── */}
      <div className="space-y-3">
        {insights.map((ins) => {
          const cfg = TYPE_CONFIG[ins.type];
          return (
            <Card key={ins.id} padding="md">
              <div className="flex items-start gap-3">
                <div className="rounded-lg p-2 flex-shrink-0" style={{ backgroundColor: `${cfg.color}12`, color: cfg.color, boxShadow: `0 0 8px ${cfg.color}20` }}>
                  <cfg.icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={ins.type === "critical" ? "error" : ins.type === "warning" ? "warning" : ins.type === "strength" ? "success" : "info"} size="xs">
                      {ins.type}
                    </Badge>
                    <span className="text-[10px] text-[var(--color-text-muted)] uppercase">{ins.category}</span>
                  </div>
                  <h4 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">{ins.title}</h4>
                  <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{ins.narrative}</p>
                  {ins.evidence.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {ins.evidence.map((e, i) => (
                        <span key={i} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-border-subtle)] text-[var(--color-text-muted)]">{e}</span>
                      ))}
                    </div>
                  )}
                  {ins.action && (
                    <button onClick={() => navigate(ins.action!.link)} className="mt-2 text-[10px] font-semibold flex items-center gap-1 transition-colors" style={{ color: cfg.color }}>
                      {ins.action.label} <ArrowRight className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* ── Team Notes ── */}
      <Card padding="md">
        <div className="flex items-center gap-2 mb-3">
          <MessageCircle className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
          <span className="text-xs font-semibold uppercase text-[var(--color-text-muted)] tracking-wider">Team Notes</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--color-border-subtle)] text-[var(--color-text-muted)]">{comments.length}</span>
        </div>
        <div className="flex gap-2 mb-3">
          <input type="text" value={newComment} onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addComment()}
            placeholder="Add a note..." className="flex-1 rounded-lg bg-[var(--color-deep)] border border-[var(--color-border-default)] px-3 py-2 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]" />
          <button onClick={addComment} disabled={!newComment.trim()}
            className="px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-40" style={{ backgroundColor: "var(--color-accent)", color: "white" }}>
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
        {comments.map((c) => (
          <div key={c.id} className="flex items-start justify-between py-2 border-t border-[var(--color-border-subtle)] group">
            <div>
              <span className="text-[10px] font-semibold" style={{ color: "var(--color-accent)" }}>{c.author}</span>
              <span className="text-[9px] text-[var(--color-text-muted)] ml-2">{new Date(c.createdAt).toLocaleString()}</span>
              <p className="text-xs text-[var(--color-text-primary)] mt-0.5">{c.text}</p>
            </div>
            <button onClick={() => deleteComment(c.id)} className="opacity-0 group-hover:opacity-100 p-1 text-[var(--color-text-muted)] hover:text-red-400">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </Card>
    </div>
  );

  async function addComment() {
    if (!newComment.trim()) return;
    const c = await api.addComment("insights", newComment.trim());
    if (c) { setComments([...comments, c as any]); setNewComment(""); }
  }

  async function deleteComment(id: string) {
    await api.deleteComment(id);
    setComments(comments.filter((c) => c.id !== id));
  }
}
