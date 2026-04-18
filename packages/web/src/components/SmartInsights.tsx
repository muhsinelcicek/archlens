import { useEffect, useState } from "react";
import type { ArchModel } from "../lib/store.js";
import { Zap, AlertTriangle, CheckCircle2, TrendingDown, Skull, ShieldAlert, Box, ArrowRight } from "lucide-react";
import { apiFetch } from "../lib/api.js";

interface Insight {
  type: "critical" | "warning" | "success" | "info";
  title: string;
  detail: string;
  action?: string;
}

interface ModuleRank {
  name: string;
  score: number;
  issues: number;
  layer: string;
}

export function SmartInsights({ model, onModuleSelect }: { model: ArchModel; onModuleSelect?: (name: string) => void }) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [moduleRanks, setModuleRanks] = useState<ModuleRank[]>([]);

  useEffect(() => {
    Promise.all([
      apiFetch("/api/quality").then((r) => r.ok ? r.json() : null),
      apiFetch("/api/deadcode").then((r) => r.ok ? r.json() : null),
      apiFetch("/api/security").then((r) => r.ok ? r.json() : null),
      apiFetch("/api/coupling").then((r) => r.ok ? r.json() : null),
    ]).then(([quality, deadcode, security, coupling]) => {
      const ins: Insight[] = [];

      // Quality insights
      if (quality?.modules) {
        const sorted = [...quality.modules].sort((a: any, b: any) => a.score - b.score);
        setModuleRanks(sorted.map((m: any) => ({ name: m.moduleName, score: m.score, issues: m.issues.length, layer: "" })));

        const worst = sorted[0];
        if (worst && worst.score < 50) {
          ins.push({ type: "critical", title: `${worst.moduleName} is a liability`, detail: `Score ${worst.score}/100 with ${worst.issues.length} issues — highest risk module`, action: "Consider extracting or refactoring" });
        }

        const best = sorted[sorted.length - 1];
        if (best && best.score >= 90) {
          ins.push({ type: "success", title: `${best.moduleName} is exemplary`, detail: `Score ${best.score}/100 — follow this pattern for other modules` });
        }

        // God classes
        const godClasses = quality.modules.flatMap((m: any) => m.issues.filter((i: any) => i.rule === "code-smell/god-class"));
        if (godClasses.length > 0) {
          ins.push({ type: "warning", title: `${godClasses.length} God Class(es) detected`, detail: godClasses.map((i: any) => i.message.split('"')[1]).join(", "), action: "Split by responsibility (SRP)" });
        }

        // Pattern compliance
        for (const pat of quality.architecturePatterns || []) {
          if (pat.detected && pat.compliance >= 90) {
            ins.push({ type: "success", title: `${pat.pattern}: ${pat.compliance}% compliant`, detail: "Architecture boundaries are well maintained" });
          } else if (pat.detected && pat.compliance < 50) {
            ins.push({ type: "warning", title: `${pat.pattern}: only ${pat.compliance}%`, detail: pat.violations?.[0] || "Multiple violations found", action: pat.recommendations?.[0] });
          }
        }
      }

      // Dead code
      if (deadcode?.deadPercentage > 15) {
        const costEstimate = Math.round(deadcode.estimatedCleanupLines * 0.015 * 150); // $1.5/line/yr maintenance × $150/hr
        ins.push({ type: "warning", title: `${deadcode.deadPercentage}% dead code`, detail: `~${deadcode.estimatedCleanupLines.toLocaleString()} lines — cleanup saves ~$${(costEstimate / 1000).toFixed(0)}k/year`, action: "Start with high-confidence private symbols" });
      }

      // Security
      if (security?.totalIssues > 0) {
        const critical = security.bySeverity?.critical || 0;
        const high = security.bySeverity?.high || 0;
        if (critical > 0) {
          ins.push({ type: "critical", title: `${critical} critical security issue(s)`, detail: "Immediate attention required", action: "Review hardcoded secrets and injection risks" });
        } else if (high > 0) {
          ins.push({ type: "warning", title: `${high} high security issue(s)`, detail: `Security score: ${security.score}/100` });
        } else {
          ins.push({ type: "info", title: `${security.totalIssues} security findings`, detail: `Score: ${security.score}/100 — mostly medium/low severity` });
        }
      }

      // Coupling insights
      if (coupling?.circularDependencies?.length > 0) {
        ins.push({ type: "warning", title: `${coupling.circularDependencies.length} circular dependencies`, detail: coupling.circularDependencies.map((c: any) => c.cycle.join(" ↔ ")).join(", "), action: "Break cycles with interface extraction or mediator pattern" });
      }
      if (coupling?.overallHealth?.concreteRatio > 70) {
        ins.push({ type: "warning", title: `${coupling.overallHealth.concreteRatio}% concrete coupling`, detail: "Most dependencies are to concrete classes, not interfaces", action: "Apply Dependency Inversion: depend on abstractions" });
      }
      // Most unstable module
      if (coupling?.modules?.length > 0) {
        const mostUnstable = coupling.modules.sort((a: any, b: any) => b.instability - a.instability)[0];
        if (mostUnstable?.instability > 0.8) {
          ins.push({ type: "info", title: `${mostUnstable.moduleName} is highly unstable (I=${mostUnstable.instability})`, detail: `${mostUnstable.efferentCoupling} outgoing deps, ${mostUnstable.afferentCoupling} incoming — changes here ripple outward` });
        }
      }

      // Module count insight
      if (model.modules.length > 15) {
        ins.push({ type: "info", title: `Large project: ${model.modules.length} modules`, detail: `${model.stats.files} files, ${model.stats.totalLines.toLocaleString()} lines — microservice architecture detected` });
      }

      setInsights(ins);
    }).catch(() => {});
  }, [model]);

  const iconMap = {
    critical: <AlertTriangle className="h-3.5 w-3.5 text-red-400" />,
    warning: <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />,
    success: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />,
    info: <Zap className="h-3.5 w-3.5 text-blue-400" />,
  };

  const colorMap = { critical: "#ef4444", warning: "#fbbf24", success: "#34d399", info: "#60a5fa" };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Insights */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        <div className="text-[9px] uppercase font-semibold tracking-wider text-[var(--color-text-muted)] mb-1 flex items-center gap-1">
          <Zap className="h-3 w-3" /> Key Findings
        </div>

        {insights.map((ins, i) => (
          <div key={i} className="rounded-lg border p-2.5" style={{ borderColor: `${colorMap[ins.type]}25`, backgroundColor: `${colorMap[ins.type]}05` }}>
            <div className="flex items-start gap-2">
              {iconMap[ins.type]}
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold text-[var(--color-text-primary)]">{ins.title}</div>
                <div className="text-[10px] text-[var(--color-text-secondary)] mt-0.5">{ins.detail}</div>
                {ins.action && (
                  <div className="text-[9px] text-archlens-400 mt-1 flex items-center gap-1">
                    <ArrowRight className="h-2.5 w-2.5" /> {ins.action}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Module Ranking */}
      <div className="border-t border-[var(--color-border-subtle)] px-3 py-2">
        <div className="text-[9px] uppercase font-semibold tracking-wider text-[var(--color-text-muted)] mb-1.5 flex items-center gap-1">
          <Box className="h-3 w-3" /> Module Risk Ranking
        </div>
        <div className="space-y-1 max-h-[200px] overflow-y-auto">
          {moduleRanks.slice(0, 10).map((mod) => {
            const sc = mod.score >= 80 ? "#34d399" : mod.score >= 60 ? "#fbbf24" : mod.score >= 40 ? "#f97316" : "#ef4444";
            return (
              <button
                key={mod.name}
                onClick={() => onModuleSelect?.(mod.name)}
                className="w-full flex items-center gap-2 rounded-md px-2 py-1 hover:bg-hover text-left transition-colors"
              >
                <div className="w-6 text-right">
                  <span className="text-[10px] font-bold" style={{ color: sc }}>{mod.score}</span>
                </div>
                <div className="flex-1 h-1.5 rounded-full bg-[var(--color-border-subtle)] overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${mod.score}%`, backgroundColor: sc }} />
                </div>
                <span className="text-[10px] font-mono text-[var(--color-text-secondary)] truncate max-w-[100px]">{mod.name}</span>
                <span className="text-[9px] text-[var(--color-text-muted)]">{mod.issues}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
