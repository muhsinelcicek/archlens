import type { GlobalStats } from "../../../lib/simulator-engine.js";

export function SimKpiStrip({ stats, budgetLimit }: { stats: GlobalStats; budgetLimit: number }) {
  return (
    <div className="flex items-center gap-4 border-b border-[var(--color-border-default)] bg-deep/80 px-5 py-1.5 text-[10px] overflow-x-auto">
      <span className="font-mono font-bold text-blue-400">{Math.round(stats.totalRequests / Math.max(1, stats.uptime))} r/s</span>
      <span className="font-mono" style={{ color: stats.successRate >= 0.99 ? "#34d399" : "#f97316" }}>{(stats.successRate * 100).toFixed(1)}%</span>
      <span className="text-[var(--color-text-muted)]">P95:<span className="font-mono ml-0.5" style={{ color: stats.p95LatencyMs < 300 ? "#34d399" : "#f97316" }}>{Math.round(stats.p95LatencyMs)}ms</span></span>
      <span className="text-[var(--color-text-muted)]">P99:<span className="font-mono ml-0.5" style={{ color: stats.p99LatencyMs < 500 ? "#34d399" : "#ef4444" }}>{Math.round(stats.p99LatencyMs)}ms</span></span>
      <span className="font-mono" style={{ color: stats.totalErrors > 0 ? "#ef4444" : "#34d399" }}>{stats.totalErrors} err</span>
      <span className="font-mono text-amber-400">${Math.round(stats.monthlyCostEstimate).toLocaleString()}/mo</span>
      <span className={`font-bold ${stats.sloMet ? "text-emerald-400" : "text-red-400"}`}>SLO {stats.sloMet ? "✓" : "✗"}</span>
    </div>
  );
}
