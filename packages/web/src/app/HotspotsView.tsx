import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Flame, AlertTriangle, GitBranch, Activity, FileCode, Users } from "lucide-react";
import { PageLoader, PageEmpty } from "../components/PageLoader.js";
import { apiFetch } from "../lib/api.js";

interface Hotspot {
  filePath: string;
  changeFrequency: number;
  complexity: number;
  riskScore: number;
  authors: string[];
  module: string;
}

interface HotspotReport {
  hotspots: Hotspot[];
  totalFiles: number;
  riskiestModule: string;
  topRiskFiles: Hotspot[];
  error?: string;
}

type SortKey = "risk" | "changes" | "complexity" | "file";

export function HotspotsView() {
  const navigate = useNavigate();
  const [report, setReport] = useState<HotspotReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("risk");
  const [hoveredFile, setHoveredFile] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/hotspots")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { setReport(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

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

  if (loading) return <PageLoader message="Analyzing git history and complexity..." />;
  if (!report) return <PageEmpty message="No hotspot data available" />;
  if (report.error || (report.hotspots.length === 0 && report.totalFiles > 0)) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6 flex items-start gap-4">
          <AlertTriangle className="h-6 w-6 text-amber-400 flex-shrink-0 mt-1" />
          <div>
            <h3 className="text-base font-semibold text-amber-300 mb-2">Git history required</h3>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Hotspot analysis requires git history. Make sure your project is a git repository with commit history.
            </p>
            {report.error && <p className="text-xs text-[var(--color-text-muted)] mt-2 font-mono">{report.error}</p>}
          </div>
        </div>
      </div>
    );
  }

  const validHotspots = report.hotspots.filter((h) => h.changeFrequency > 0 || h.complexity > 0);
  const highRisk = validHotspots.filter((h) => h.riskScore >= 50);
  const avgRisk = validHotspots.length > 0
    ? Math.round(validHotspots.reduce((a, h) => a + h.riskScore, 0) / validHotspots.length)
    : 0;
  const topFile = report.topRiskFiles[0];

  // Insight
  const top20pct = Math.ceil(validHotspots.length * 0.2);
  const top20pctChanges = validHotspots.slice(0, top20pct).reduce((a, h) => a + h.changeFrequency, 0);
  const totalChanges = validHotspots.reduce((a, h) => a + h.changeFrequency, 0);
  const top20pctRatio = totalChanges > 0 ? Math.round((top20pctChanges / totalChanges) * 100) : 0;

  const maxFreq = Math.max(...validHotspots.map((h) => h.changeFrequency), 1);
  const maxComp = Math.max(...validHotspots.map((h) => h.complexity), 1);

  const goToFile = (filePath: string) => {
    sessionStorage.setItem("archlens-goto-file", filePath);
    navigate("/architecture");
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1300px]">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Flame className="h-6 w-6 text-orange-400" /> Code Hotspots
          </h2>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Files that change frequently AND have high complexity. These are your highest-risk areas.
          </p>
        </div>
      </div>

      {/* Insight */}
      {top20pctRatio > 50 && (
        <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4 flex items-start gap-3">
          <Activity className="h-5 w-5 text-orange-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-[var(--color-text-secondary)]">
            <span className="font-semibold text-orange-300">{top20pctRatio}% of all changes</span>
            {" "}are concentrated in just <span className="font-semibold text-[var(--color-text-primary)]">{top20pct} files</span> ({Math.round((top20pct / validHotspots.length) * 100)}% of analyzed files).
            {topFile && <> Top hotspot: <code className="text-orange-300 font-mono">{topFile.filePath.split("/").pop()}</code> changed <span className="font-semibold text-[var(--color-text-primary)]">{topFile.changeFrequency}</span> times.</>}
          </div>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Files Analyzed", value: report.totalFiles, icon: <FileCode className="h-4 w-4" />, color: "#60a5fa" },
          { label: "High Risk", value: highRisk.length, icon: <Flame className="h-4 w-4" />, color: "#f97316" },
          { label: "Avg Risk Score", value: avgRisk, icon: <Activity className="h-4 w-4" />, color: "#fbbf24" },
          { label: "Riskiest Module", value: report.riskiestModule || "—", icon: <GitBranch className="h-4 w-4" />, color: "#a78bfa", small: true },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-[var(--color-border-default)] bg-elevated p-4">
            <div className="flex items-center gap-2 mb-2" style={{ color: s.color }}>
              {s.icon}
              <span className="text-[10px] uppercase font-semibold tracking-wider">{s.label}</span>
            </div>
            <div className={`font-bold text-[var(--color-text-primary)] ${s.small ? "text-sm font-mono truncate" : "text-2xl"}`}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Risk Quadrant Chart */}
      <section className="rounded-xl border border-[var(--color-border-default)] bg-elevated p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-archlens-400" /> Risk Quadrant
        </h3>
        <p className="text-xs text-[var(--color-text-muted)] mb-4">
          X = Complexity · Y = Change Frequency. Top-right = Refactor priority.
        </p>
        <div className="relative w-full" style={{ aspectRatio: "2 / 1" }}>
          <svg viewBox="0 0 800 400" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
            {/* Quadrant backgrounds */}
            <rect x="0" y="0" width="400" height="200" fill="#fbbf2408" />
            <rect x="400" y="0" width="400" height="200" fill="#ef444412" />
            <rect x="0" y="200" width="400" height="200" fill="#34d39908" />
            <rect x="400" y="200" width="400" height="200" fill="#60a5fa08" />

            {/* Quadrant borders */}
            <line x1="400" y1="0" x2="400" y2="400" stroke="var(--color-border-default)" strokeDasharray="4 4" />
            <line x1="0" y1="200" x2="800" y2="200" stroke="var(--color-border-default)" strokeDasharray="4 4" />

            {/* Quadrant labels */}
            <text x="20" y="25" fontSize="11" fill="#fbbf24" fontWeight="600">⚡ Active &amp; Simple</text>
            <text x="780" y="25" fontSize="11" fill="#ef4444" fontWeight="600" textAnchor="end">🔥 REFACTOR PRIORITY</text>
            <text x="20" y="395" fontSize="11" fill="#34d399" fontWeight="600">✓ Healthy</text>
            <text x="780" y="395" fontSize="11" fill="#60a5fa" fontWeight="600" textAnchor="end">📦 Legacy &amp; Stable</text>

            {/* Axis labels */}
            <text x="400" y="395" fontSize="10" fill="var(--color-text-muted)" textAnchor="middle">→ complexity</text>
            <text x="5" y="200" fontSize="10" fill="var(--color-text-muted)" textAnchor="start" transform="rotate(-90 5 200)">↑ change frequency</text>

            {/* Dots */}
            {validHotspots.map((h, i) => {
              const x = (h.complexity / maxComp) * 760 + 20;
              const y = 380 - (h.changeFrequency / maxFreq) * 360;
              const r = 3 + (h.riskScore / 100) * 6;
              const color = h.riskScore >= 70 ? "#ef4444" : h.riskScore >= 40 ? "#f97316" : h.riskScore >= 20 ? "#fbbf24" : "#34d399";
              const isHovered = hoveredFile === h.filePath;
              return (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r={isHovered ? r + 3 : r}
                  fill={color}
                  fillOpacity={isHovered ? 1 : 0.7}
                  stroke={isHovered ? "#fff" : color}
                  strokeWidth={isHovered ? 2 : 0}
                  className="cursor-pointer transition-all"
                  onMouseEnter={() => setHoveredFile(h.filePath)}
                  onMouseLeave={() => setHoveredFile(null)}
                  onClick={() => goToFile(h.filePath)}
                />
              );
            })}
          </svg>
          {hoveredFile && (
            <div className="absolute top-2 right-2 rounded-lg bg-[var(--color-border-subtle)] border border-[#3a3a4a] px-3 py-2 text-xs pointer-events-none shadow-lg">
              <div className="font-mono text-[var(--color-text-primary)]">{hoveredFile.split("/").pop()}</div>
              <div className="text-[10px] text-[var(--color-text-muted)] truncate max-w-[300px]">{hoveredFile}</div>
            </div>
          )}
        </div>
      </section>

      {/* Hotspot List */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Hotspot Files ({validHotspots.length})</h3>
          <div className="flex gap-1">
            {(["risk", "changes", "complexity", "file"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setSortKey(k)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase transition-colors ${
                  sortKey === k ? "bg-archlens-500/15 text-archlens-300" : "bg-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                }`}
              >
                {k}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--color-border-default)] overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-surface">
              <tr className="text-[10px] uppercase text-[var(--color-text-muted)]">
                <th className="text-left py-2 px-3">File</th>
                <th className="text-left py-2 px-2">Module</th>
                <th className="text-right py-2 px-2">Changes</th>
                <th className="text-right py-2 px-2">Complexity</th>
                <th className="text-right py-2 px-2">Authors</th>
                <th className="text-right py-2 px-3">Risk</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 50).map((h, i) => {
                const color = h.riskScore >= 70 ? "#ef4444" : h.riskScore >= 40 ? "#f97316" : h.riskScore >= 20 ? "#fbbf24" : "#34d399";
                return (
                  <tr
                    key={i}
                    onClick={() => goToFile(h.filePath)}
                    className="border-t border-[var(--color-border-subtle)] hover:bg-hover cursor-pointer transition-colors"
                  >
                    <td className="py-2 px-3 font-mono text-[var(--color-text-primary)] truncate max-w-[400px]">
                      {h.filePath.split("/").pop()}
                      <div className="text-[9px] text-[var(--color-text-muted)] truncate">{h.filePath}</div>
                    </td>
                    <td className="py-2 px-2 text-[var(--color-text-secondary)] font-mono">{h.module}</td>
                    <td className="py-2 px-2 text-right text-[var(--color-text-secondary)]">{h.changeFrequency}</td>
                    <td className="py-2 px-2 text-right text-[var(--color-text-secondary)]">{h.complexity}</td>
                    <td className="py-2 px-2 text-right">
                      {h.authors.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-[var(--color-text-muted)]">
                          <Users className="h-3 w-3" /> {h.authors.length}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <span
                        className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold"
                        style={{ backgroundColor: `${color}15`, color }}
                      >
                        {h.riskScore}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {sorted.length > 50 && (
            <div className="py-2 text-center text-[10px] text-[var(--color-text-muted)] bg-surface">
              +{sorted.length - 50} more files
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
