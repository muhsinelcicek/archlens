import { useMemo } from "react";
import type { ArchModel } from "../lib/store.js";
import { ShieldCheck, GitBranch, Skull, ShieldAlert, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { useAllAnalysis } from "../services/queries.js";

interface HealthData {
  qualityScore: number;
  coupling: { level: string; score: number };
  violations: number;
  deadCodePct: number;
  securityScore: number;
  techDebtHours: number;
  topRisks: string[];
}

export function ArchHealthBand({ model }: { model: ArchModel }) {
  const { quality, security, deadcode, coupling } = useAllAnalysis();

  const health = useMemo((): HealthData | null => {
    if (!quality) return null;
    const _deadcode = deadcode as any;
    const _security = security as any;
    const _coupling = coupling as any;
    {
      const risks: string[] = [];

      // Find worst module
      if (quality?.modules) {
        const worst = quality.modules.sort((a: any, b: any) => a.score - b.score)[0];
        if (worst && worst.score < 50) risks.push(`${worst.moduleName} needs refactoring (score: ${worst.score}/100)`);
      }

      // Dead code
      if (_deadcode?.deadPercentage > 15) {
        risks.push(`${_deadcode.deadPercentage}% dead code (~${_deadcode.estimatedCleanupLines.toLocaleString()} lines)`);
      }

      // Security
      if (_security?.bySeverity?.critical > 0) {
        risks.push(`${_security.bySeverity.critical} critical security issues`);
      }

      // Pattern violations
      if (quality?.architecturePatterns) {
        for (const pat of quality.architecturePatterns) {
          if (pat.detected && pat.compliance < 50) {
            risks.push(`${pat.pattern}: ${pat.compliance}% compliance`);
          }
        }
      }

      // Circular dependencies from coupling analyzer
      if (_coupling?.circularDependencies?.length > 0) {
        risks.push(`${_coupling.circularDependencies.length} circular dependencies detected`);
      }
      if (_coupling?.overallHealth?.concreteRatio > 70) {
        risks.push(`${_coupling.overallHealth.concreteRatio}% concrete coupling — use more interfaces`);
      }

      // Calculate coupling
      let totalCross = 0;
      for (const rel of model.relations) {
        if (rel.type === "composes") continue;
        const srcMod = findModForSymbol(model, rel.source);
        const tgtSym = model.symbols[rel.target] as Record<string, unknown> | undefined;
        const tgtMod = tgtSym ? findModForSymbol(model, rel.target) : undefined;
        if (srcMod && tgtMod && srcMod !== tgtMod) totalCross++;
      }
      const avgCoupling = model.modules.length > 0 ? totalCross / model.modules.length : 0;
      const couplingLevel = _coupling?.overallHealth
        ? (_coupling.overallHealth.avgInstability < 0.4 ? "Low" : _coupling.overallHealth.avgInstability < 0.7 ? "Medium" : "High")
        : (avgCoupling < 5 ? "Low" : avgCoupling < 15 ? "Medium" : "High");
      const couplingScore = _coupling?.overallHealth
        ? Math.max(0, 100 - Math.round(_coupling.overallHealth.avgInstability * 60) - _coupling.overallHealth.circularCount * 10)
        : Math.max(0, 100 - avgCoupling * 3);

      // Tech debt estimate (rough: $150/hour developer cost)
      const debtHours = (quality?.totalIssues || 0) * 0.5 + (_deadcode?.estimatedCleanupLines || 0) * 0.01 + (_security?.totalIssues || 0) * 2;

      return {
        qualityScore: quality?.projectScore || 0,
        coupling: { level: couplingLevel, score: Math.round(couplingScore) },
        violations: quality?.architecturePatterns?.reduce((a: number, p: any) => a + p.violations.length, 0) || 0,
        deadCodePct: _deadcode?.deadPercentage || 0,
        securityScore: _security?.score || 0,
        techDebtHours: Math.round(debtHours),
        topRisks: risks.slice(0, 3),
      };
    }
  }, [quality, security, deadcode, coupling, model]);

  if (!health) return <div className="h-[120px] bg-surface animate-pulse rounded-lg" />;

  const overallScore = Math.round((health.qualityScore + health.coupling.score + health.securityScore) / 3);
  const scoreColor = overallScore >= 80 ? "#34d399" : overallScore >= 60 ? "#fbbf24" : overallScore >= 40 ? "#f97316" : "#ef4444";
  const debtCost = health.techDebtHours * 150;

  return (
    <div className="bg-surface border-b border-[var(--color-border-subtle)] px-4 py-3">
      <div className="flex items-center gap-4">
        {/* Score */}
        <div className="flex items-center gap-3 pr-4 border-r border-[var(--color-border-subtle)]">
          <div className="relative w-12 h-12">
            <svg viewBox="0 0 48 48" className="w-full h-full -rotate-90">
              <circle cx="24" cy="24" r="20" fill="none" stroke="var(--color-border-subtle)" strokeWidth="4" />
              <circle cx="24" cy="24" r="20" fill="none" stroke={scoreColor} strokeWidth="4"
                strokeDasharray={`${(overallScore / 100) * 125.6} 125.6`} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-bold" style={{ color: scoreColor }}>{overallScore}</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-[var(--color-text-muted)] font-semibold">Health</div>
            <div className="text-xs font-medium" style={{ color: scoreColor }}>{overallScore >= 80 ? "Healthy" : overallScore >= 60 ? "Moderate" : "At Risk"}</div>
          </div>
        </div>

        {/* Metrics */}
        <div className="flex gap-3 flex-1">
          <MetricChip icon={<GitBranch className="h-3 w-3" />} label="Coupling" value={health.coupling.level} color={health.coupling.score >= 70 ? "#34d399" : health.coupling.score >= 40 ? "#fbbf24" : "#ef4444"} />
          <MetricChip icon={<ShieldCheck className="h-3 w-3" />} label="Security" value={`${health.securityScore}/100`} color={health.securityScore >= 70 ? "#34d399" : health.securityScore >= 40 ? "#fbbf24" : "#ef4444"} />
          <MetricChip icon={<Skull className="h-3 w-3" />} label="Dead Code" value={`${health.deadCodePct}%`} color={health.deadCodePct < 10 ? "#34d399" : health.deadCodePct < 25 ? "#fbbf24" : "#ef4444"} />
          <MetricChip icon={<ShieldAlert className="h-3 w-3" />} label="Violations" value={String(health.violations)} color={health.violations === 0 ? "#34d399" : health.violations < 3 ? "#fbbf24" : "#ef4444"} />
          <MetricChip icon={<DollarSign className="h-3 w-3" />} label="Tech Debt" value={debtCost > 1000 ? `$${(debtCost / 1000).toFixed(0)}k` : `$${debtCost}`} color={debtCost < 10000 ? "#34d399" : debtCost < 50000 ? "#fbbf24" : "#ef4444"} />
        </div>

        {/* Top Risks */}
        {health.topRisks.length > 0 && (
          <div className="pl-4 border-l border-[var(--color-border-subtle)] max-w-[300px]">
            <div className="text-[9px] uppercase text-[var(--color-text-muted)] font-semibold mb-1">Top Risks</div>
            {health.topRisks.map((risk, i) => (
              <div key={i} className="text-[10px] text-[var(--color-text-secondary)] truncate flex items-center gap-1">
                <span className="text-red-400">⚡</span> {risk}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricChip({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-2 bg-elevated rounded-lg px-2.5 py-1.5">
      <span style={{ color }}>{icon}</span>
      <div>
        <div className="text-[9px] text-[var(--color-text-muted)] uppercase">{label}</div>
        <div className="text-xs font-bold" style={{ color }}>{value}</div>
      </div>
    </div>
  );
}

function findModForSymbol(model: ArchModel, uidOrPath: string): string | undefined {
  for (const mod of model.modules) {
    if (mod.symbols.includes(uidOrPath)) return mod.name;
  }
  return undefined;
}
