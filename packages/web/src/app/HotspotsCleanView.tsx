/**
 * HotspotsCleanView — git×complexity risk analysis.
 * Shallow clone aware: shows warning + falls back to complexity-only mode.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Flame, AlertTriangle, Activity, FileCode, Users, Info } from "lucide-react";
import { useHotspots } from "../services/queries.js";
import { Card } from "../components/ui/Card.js";
import { Badge } from "../components/ui/Badge.js";
import { ProgressBar } from "../components/ui/ProgressBar.js";
import { PageLoader, PageEmpty } from "../components/PageLoader.js";

type SortKey = "risk" | "changes" | "complexity" | "file";

export function HotspotsCleanView() {
  const navigate = useNavigate();
  const { data: report, isLoading } = useHotspots();
  const [sortKey, setSortKey] = useState<SortKey>("risk");

  const sorted = useMemo(() => {
    if (!report) return [];
    const arr = [...report.hotspots];
    switch (sortKey) {
      case "risk": return arr.sort((a, b) => b.riskScore - a.riskScore);
      case "changes": return arr.sort((a, b) => b.changeFrequency - a.changeFrequency);
      case "complexity": return arr.sort((a, b) => b.complexity - a.complexity);
      case "file": return arr.sort((a, b) => a.filePath.localeCompare(b.filePath));
    }
  }, [report, sortKey]);

  if (isLoading) return <PageLoader message="Analyzing hotspots..." />;
  if (!report) return <PageEmpty message="No hotspot data available" />;

  const validHotspots = report.hotspots.filter((h) => h.complexity > 0);
  const highRisk = validHotspots.filter((h) => h.riskScore >= 50);
  const isShallow = report.isShallowClone;

  return (
    <div className="p-6 max-w-[1000px] mx-auto space-y-4">

      {/* Shallow clone warning */}
      {isShallow && (
        <Card padding="md" className="border-amber-500/20">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-amber-300">Limited Git History</h3>
              <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                This project was cloned with <code className="text-amber-400">--depth 1</code>. Hotspot analysis works best with full git history.
                Showing <strong>complexity-only</strong> rankings instead of change frequency × complexity.
              </p>
              <p className="text-xs text-[var(--color-text-muted)] mt-2 font-mono">
                Fix: git fetch --unshallow
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card padding="md">
          <div className="text-[10px] text-[var(--color-text-muted)] uppercase">Files Analyzed</div>
          <div className="text-2xl font-bold text-[var(--color-text-primary)]">{report.totalFiles}</div>
        </Card>
        <Card padding="md">
          <div className="text-[10px] text-[var(--color-text-muted)] uppercase">{isShallow ? "Complex Files" : "High Risk"}</div>
          <div className="text-2xl font-bold" style={{ color: highRisk.length > 0 ? "#f97316" : "#34d399" }}>{highRisk.length}</div>
        </Card>
        <Card padding="md">
          <div className="text-[10px] text-[var(--color-text-muted)] uppercase">Riskiest Module</div>
          <div className="text-sm font-bold text-[var(--color-text-primary)] font-mono truncate">{report.riskiestModule || "—"}</div>
        </Card>
      </div>

      {/* Sort */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[var(--color-text-muted)] uppercase">Sort by:</span>
        {(["risk", isShallow ? null : "changes", "complexity", "file"] as const).filter(Boolean).map((k) => (
          <button key={k!} onClick={() => setSortKey(k!)}
            className={`px-2.5 py-1 rounded-md text-[10px] font-semibold ${sortKey === k ? "bg-[var(--color-accent)]  text-white" : "bg-[var(--color-border-subtle)] text-[var(--color-text-muted)]"}`}>
            {k === "risk" ? (isShallow ? "Complexity" : "Risk") : k}
          </button>
        ))}
      </div>

      {/* File list */}
      <div className="space-y-1.5">
        {sorted.slice(0, 40).map((h, i) => {
          const riskColor = h.riskScore >= 70 ? "#ef4444" : h.riskScore >= 40 ? "#f97316" : h.riskScore >= 20 ? "#fbbf24" : "#34d399";
          return (
            <Card key={i} padding="sm" hover onClick={() => { sessionStorage.setItem("archlens-goto-file", h.filePath); navigate("/architecture"); }}>
              <div className="flex items-center gap-3">
                <div className="w-10 text-right">
                  <span className="text-sm font-bold" style={{ color: riskColor }}>{h.riskScore}</span>
                </div>
                <ProgressBar value={h.riskScore} size="xs" color={riskColor} />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-mono text-[var(--color-text-primary)] truncate block">{h.filePath.split("/").pop()}</span>
                  <span className="text-[9px] text-[var(--color-text-muted)] truncate block">{h.filePath}</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-[var(--color-text-muted)]">
                  {!isShallow && <span>{h.changeFrequency} changes</span>}
                  <span>complexity: {h.complexity}</span>
                  <Badge size="xs">{h.module}</Badge>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
