/**
 * Dashboard — Clean, constellation-style overview.
 *
 * Sections:
 * 1. Project header + health score
 * 2. Key metrics (4 cards)
 * 3. Health pulse (progress bars)
 * 4. Action items (top issues)
 * 5. Simulator results (if available)
 */

import { useNavigate } from "react-router-dom";
import { useStore } from "../lib/store.js";
import { useI18n } from "../lib/i18n.js";
import { useAllAnalysis } from "../services/queries.js";
import { Card } from "../components/ui/Card.js";
import { Badge } from "../components/ui/Badge.js";
import { ProgressBar } from "../components/ui/ProgressBar.js";
import { PageLoader } from "../components/PageLoader.js";
import {
  Files, Code2, GitBranch, Boxes, Activity, ArrowRight, AlertTriangle, CheckCircle2,
} from "lucide-react";

export function Dashboard() {
  const { model, simulatorSnapshot: simSnap } = useStore();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { quality, coupling, security, deadcode, techdebt: techDebt, isLoading } = useAllAnalysis();

  if (!model) return null;
  const { stats } = model;

  const qualityScore = quality?.projectScore ?? 0;
  const scoreColor = qualityScore >= 80 ? "#34d399" : qualityScore >= 60 ? "#fbbf24" : qualityScore >= 40 ? "#f97316" : "#ef4444";

  return (
    <div className="p-6 lg:p-8 max-w-[1100px] mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">{model.project.name}</h1>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            {t("dashboard.title")} · {new Date(model.project.analyzedAt).toLocaleDateString()}
          </p>
        </div>
        {!isLoading && (
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate("/quality")}>
            <div className="relative w-16 h-16">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="var(--color-border-default)" strokeWidth="6" />
                <circle cx="50" cy="50" r="42" fill="none" stroke={scoreColor} strokeWidth="6"
                  strokeDasharray={`${(qualityScore / 100) * 264} 264`} strokeLinecap="round"
                  style={{ filter: `drop-shadow(0 0 6px ${scoreColor}60)` }} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-bold" style={{ color: scoreColor }}>{qualityScore}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Key Metrics ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Files", value: stats.files, icon: Files, color: "#34d399" },
          { label: "Symbols", value: stats.symbols, icon: Code2, color: "#60a5fa" },
          { label: "Modules", value: stats.modules, icon: Boxes, color: "#a78bfa" },
          { label: "Lines", value: stats.totalLines.toLocaleString(), icon: GitBranch, color: "#fbbf24" },
        ].map((m) => (
          <Card key={m.label} padding="md">
            <div className="flex items-center gap-3">
              <div className="rounded-lg p-2" style={{ backgroundColor: `${m.color}12`, color: m.color, boxShadow: `0 0 8px ${m.color}20` }}>
                <m.icon className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xl font-bold text-[var(--color-text-primary)]">{m.value}</div>
                <div className="text-[10px] text-[var(--color-text-muted)] uppercase">{m.label}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* ── Health Pulse ── */}
      {!isLoading && (
        <Card padding="md">
          <h3 className="text-xs font-semibold uppercase text-[var(--color-text-muted)] tracking-wider mb-3">Health Pulse</h3>
          <div className="space-y-2">
            <ProgressBar label="Quality" value={qualityScore} showValue />
            <ProgressBar label="Security" value={security?.score ?? 100} showValue color={security && security.totalIssues > 0 ? "#ef4444" : undefined} />
            <ProgressBar label="Coupling" value={coupling ? Math.round((1 - coupling.overallHealth.avgInstability) * 100) : 50} showValue />
            <ProgressBar label="Dead Code" value={deadcode ? Math.max(0, 100 - deadcode.totalDead) : 100} showValue />
            <ProgressBar label="Tech Debt" value={techDebt ? Math.max(0, 100 - Math.min(100, techDebt.totalEstimatedHours / 5)) : 100} showValue />
          </div>
        </Card>
      )}

      {/* ── Action Items ── */}
      {!isLoading && quality && (
        <Card padding="md">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase text-[var(--color-text-muted)] tracking-wider">What to Focus On</h3>
            <button onClick={() => navigate("/quality")} className="text-[10px] text-archlens-300 hover:text-archlens-200 flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="space-y-2">
            {/* Critical quality issues */}
            {quality.bySeverity?.critical > 0 && (
              <ActionRow severity="error" onClick={() => navigate("/quality")}>
                {quality.bySeverity.critical} critical code issues
              </ActionRow>
            )}
            {/* Circular dependencies */}
            {coupling && coupling.overallHealth.circularCount > 0 && (
              <ActionRow severity="warning" onClick={() => navigate("/quality")}>
                {coupling.overallHealth.circularCount} circular dependencies
              </ActionRow>
            )}
            {/* Security */}
            {security && security.totalIssues > 0 && (
              <ActionRow severity={security.totalIssues > 5 ? "error" : "warning"} onClick={() => navigate("/quality")}>
                {security.totalIssues} security vulnerabilities
              </ActionRow>
            )}
            {/* Dead code */}
            {deadcode && deadcode.totalDead > 20 && (
              <ActionRow severity="info" onClick={() => navigate("/quality")}>
                {deadcode.totalDead} unused symbols ({deadcode.estimatedCleanupLines.toLocaleString()} lines)
              </ActionRow>
            )}
            {/* Tech debt */}
            {techDebt && techDebt.totalEstimatedCost > 1000 && (
              <ActionRow severity="info" onClick={() => navigate("/quality")}>
                ${Math.round(techDebt.totalEstimatedCost / 1000)}k tech debt ({techDebt.totalEstimatedHours}h work)
              </ActionRow>
            )}
            {/* All clean */}
            {qualityScore >= 90 && (!security || security.totalIssues === 0) && (!coupling || coupling.overallHealth.circularCount === 0) && (
              <div className="flex items-center gap-2 text-xs text-emerald-400">
                <CheckCircle2 className="h-4 w-4" /> Codebase is in great shape
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ── Simulator Results ── */}
      {simSnap && (
        <Card padding="md" hover onClick={() => navigate("/simulator")}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-archlens-300" style={{ filter: "drop-shadow(0 0 4px rgba(139,92,246,0.4))" }} />
              <h3 className="text-xs font-semibold uppercase text-[var(--color-text-muted)] tracking-wider">Simulator</h3>
            </div>
            <Badge variant={simSnap.sloMet ? "success" : "error"}>
              SLO {simSnap.sloMet ? "MET" : "BREACH"}
            </Badge>
          </div>
          <div className="grid grid-cols-4 gap-3 text-center">
            <div>
              <div className="text-lg font-bold" style={{ color: simSnap.successRate >= 0.99 ? "#34d399" : "#f97316" }}>{(simSnap.successRate * 100).toFixed(1)}%</div>
              <div className="text-[9px] text-[var(--color-text-muted)] uppercase">Success</div>
            </div>
            <div>
              <div className="text-lg font-bold" style={{ color: simSnap.p99LatencyMs < 500 ? "#34d399" : "#ef4444" }}>{Math.round(simSnap.p99LatencyMs)}ms</div>
              <div className="text-[9px] text-[var(--color-text-muted)] uppercase">P99</div>
            </div>
            <div>
              <div className="text-lg font-bold text-amber-400">${Math.round(simSnap.monthlyCost).toLocaleString()}</div>
              <div className="text-[9px] text-[var(--color-text-muted)] uppercase">/month</div>
            </div>
            <div>
              <div className="text-lg font-bold" style={{ color: simSnap.incidentCount > 0 ? "#f97316" : "#34d399" }}>{simSnap.incidentCount}</div>
              <div className="text-[9px] text-[var(--color-text-muted)] uppercase">Incidents</div>
            </div>
          </div>
        </Card>
      )}

      {/* Loading */}
      {isLoading && (
        <Card padding="lg">
          <PageLoader message="Loading health data..." />
        </Card>
      )}
    </div>
  );
}

function ActionRow({ severity, onClick, children }: { severity: "error" | "warning" | "info"; onClick: () => void; children: React.ReactNode }) {
  const colors = { error: "#ef4444", warning: "#f97316", info: "#60a5fa" };
  const c = colors[severity];
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-hover transition-colors text-left group">
      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" style={{ color: c }} />
      <span className="text-xs text-[var(--color-text-secondary)] group-hover:text-[var(--color-text-primary)]">{children}</span>
      <ArrowRight className="h-3 w-3 ml-auto text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100" />
    </button>
  );
}
