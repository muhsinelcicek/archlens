import { useEffect, useState } from "react";
import { useStore } from "../lib/store.js";
import { Printer, Download, FileText } from "lucide-react";
import { PageLoader } from "../components/PageLoader.js";

interface QualityReport { projectScore: number; totalIssues: number; bySeverity: Record<string, number>; modules: any[]; }
interface CouplingReport { overallHealth: { avgInstability: number; circularCount: number }; circularDependencies: any[]; modules: any[]; }
interface SecurityReport { score: number; totalIssues: number; }
interface DeadCodeReport { totalDead: number; estimatedCleanupLines: number; }
interface TechDebtReport { totalEstimatedHours: number; totalEstimatedCost: number; totalAnnualCost: number; }

export function ReportView() {
  const { model } = useStore();
  const [quality, setQuality] = useState<QualityReport | null>(null);
  const [coupling, setCoupling] = useState<CouplingReport | null>(null);
  const [security, setSecurity] = useState<SecurityReport | null>(null);
  const [deadcode, setDeadcode] = useState<DeadCodeReport | null>(null);
  const [techDebt, setTechDebt] = useState<TechDebtReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/quality").then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/coupling").then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/security").then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/deadcode").then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/techdebt").then((r) => r.ok ? r.json() : null).catch(() => null),
    ]).then(([q, c, s, d, td]) => {
      setQuality(q); setCoupling(c); setSecurity(s); setDeadcode(d); setTechDebt(td);
      setLoading(false);
    });
  }, []);

  if (!model) return null;
  if (loading) return <PageLoader message="Generating report..." />;

  const downloadJson = () => {
    const summary = {
      project: model.project,
      stats: model.stats,
      generated: new Date().toISOString(),
      quality: quality ? { score: quality.projectScore, issues: quality.totalIssues, bySeverity: quality.bySeverity } : null,
      coupling: coupling ? { avgInstability: coupling.overallHealth.avgInstability, circularDeps: coupling.circularDependencies.length } : null,
      security: security ? { score: security.score, issues: security.totalIssues } : null,
      deadcode: deadcode ? { count: deadcode.totalDead, lines: deadcode.estimatedCleanupLines } : null,
      techDebt: techDebt ? { hours: techDebt.totalEstimatedHours, cost: techDebt.totalEstimatedCost, annual: techDebt.totalAnnualCost } : null,
      modules: model.modules.map((m: any) => ({ name: m.name, layer: m.layer, files: m.fileCount, lines: m.lineCount, language: m.language })),
    };
    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${model.project.name}-archlens-report.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const scoreColor = (s: number) => s >= 80 ? "#34d399" : s >= 60 ? "#fbbf24" : s >= 40 ? "#f97316" : "#ef4444";
  const overallScore = quality?.projectScore ?? 0;
  const langs = Object.entries(model.stats.languages).sort(([, a], [, b]) => (b as number) - (a as number));

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          @page { size: A4; margin: 18mm; }
          body { background: white !important; color: black !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .print-section { page-break-inside: avoid; }
          .print-page-break { page-break-after: always; }
          aside, .sidebar { display: none !important; }
          main { overflow: visible !important; height: auto !important; }
          .report-page { background: white !important; color: black !important; max-width: 100% !important; padding: 0 !important; }
          .report-page * { color: black !important; border-color: #ccc !important; }
          .report-page .keep-color { color: inherit !important; }
        }
      `}</style>

      <div className="report-page p-6 lg:p-8 max-w-[900px] mx-auto space-y-6">
        {/* Action bar (hidden in print) */}
        <div className="no-print flex items-center justify-between rounded-xl border border-[#2a2a3a] bg-elevated p-4">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-archlens-400" />
            <div>
              <h2 className="text-base font-bold">Executive Report</h2>
              <p className="text-xs text-[#5a5a70]">Print or export this page as PDF for stakeholders</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={downloadJson}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1e1e2a] border border-[#2a2a3a] text-[#8888a0] text-xs font-semibold hover:text-[#e4e4ed]"
            >
              <Download className="h-4 w-4" /> Download JSON
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-archlens-500 text-white text-xs font-semibold"
            >
              <Printer className="h-4 w-4" /> Print / Save as PDF
            </button>
          </div>
        </div>

        {/* Cover */}
        <section className="print-section rounded-xl border border-[#2a2a3a] p-8 text-center">
          <div className="text-[10px] uppercase font-semibold text-[#5a5a70] tracking-widest mb-3">ArchLens Architecture Report</div>
          <h1 className="text-4xl font-bold text-[#e4e4ed] mb-2">{model.project.name}</h1>
          <p className="text-sm text-[#8888a0]">{model.project.rootPath}</p>
          <p className="text-xs text-[#5a5a70] mt-1">Analyzed: {new Date(model.project.analyzedAt).toLocaleString()}</p>

          <div className="mt-6 flex justify-center">
            <div className="relative w-32 h-32">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="#1e1e2a" strokeWidth="8" />
                <circle cx="50" cy="50" r="42" fill="none" stroke={scoreColor(overallScore)} strokeWidth="8"
                  strokeDasharray={`${(overallScore / 100) * 264} 264`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center keep-color">
                <span className="text-3xl font-bold" style={{ color: scoreColor(overallScore) }}>{overallScore}</span>
                <span className="text-[9px] text-[#5a5a70] uppercase">Quality Score</span>
              </div>
            </div>
          </div>
        </section>

        {/* Project Overview */}
        <section className="print-section">
          <h2 className="text-lg font-bold mb-3 border-b border-[#2a2a3a] pb-2">1. Project Overview</h2>
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              { l: "Files", v: model.stats.files },
              { l: "Symbols", v: model.stats.symbols },
              { l: "Modules", v: model.stats.modules },
              { l: "Lines of Code", v: model.stats.totalLines.toLocaleString() },
              { l: "API Endpoints", v: model.apiEndpoints.length },
              { l: "DB Entities", v: model.dbEntities.length },
              { l: "Dependencies", v: model.stats.relations },
              { l: "Tech Stack", v: model.techRadar.length },
            ].map((s) => (
              <div key={s.l} className="rounded-lg border border-[#2a2a3a] p-3 text-center">
                <div className="text-xl font-bold text-[#e4e4ed]">{s.v}</div>
                <div className="text-[9px] uppercase text-[#5a5a70]">{s.l}</div>
              </div>
            ))}
          </div>

          <div className="text-xs">
            <div className="font-semibold text-[#8888a0] mb-1">Languages</div>
            <div className="flex flex-wrap gap-2">
              {langs.map(([lang, count]) => (
                <span key={lang} className="px-2 py-1 rounded bg-[#1e1e2a] text-[#e4e4ed]">
                  {lang}: <span className="text-[#5a5a70]">{count as number}</span>
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Quality */}
        {quality && (
          <section className="print-section">
            <h2 className="text-lg font-bold mb-3 border-b border-[#2a2a3a] pb-2">2. Code Quality</h2>
            <p className="text-sm text-[#8888a0] mb-3">
              Overall quality score: <strong style={{ color: scoreColor(quality.projectScore) }} className="keep-color">{quality.projectScore}/100</strong>.
              Total issues: <strong>{quality.totalIssues}</strong> across <strong>{quality.modules.length}</strong> modules.
            </p>
            <div className="grid grid-cols-4 gap-3">
              {(["critical", "major", "minor", "info"] as const).map((sev) => {
                const colors = { critical: "#ef4444", major: "#f97316", minor: "#fbbf24", info: "#60a5fa" };
                return (
                  <div key={sev} className="rounded-lg border p-3" style={{ borderColor: `${colors[sev]}30`, backgroundColor: `${colors[sev]}08` }}>
                    <div className="text-[9px] uppercase font-semibold keep-color" style={{ color: colors[sev] }}>{sev}</div>
                    <div className="text-2xl font-bold keep-color" style={{ color: colors[sev] }}>{quality.bySeverity[sev] || 0}</div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Coupling */}
        {coupling && (
          <section className="print-section">
            <h2 className="text-lg font-bold mb-3 border-b border-[#2a2a3a] pb-2">3. Coupling &amp; Dependencies</h2>
            <p className="text-sm text-[#8888a0] mb-3">
              Average instability: <strong>{coupling.overallHealth.avgInstability.toFixed(2)}</strong> (0=stable, 1=unstable).
              Circular dependencies detected: <strong>{coupling.circularDependencies.length}</strong>.
            </p>
            {coupling.circularDependencies.length > 0 && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                <div className="text-xs font-semibold text-amber-400 mb-2 keep-color">Circular Dependencies:</div>
                {coupling.circularDependencies.slice(0, 5).map((cd: any, i: number) => (
                  <div key={i} className="text-xs font-mono text-[#8888a0]">⟳ {(cd.cycle || []).join(" ↔ ")}</div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Security */}
        {security && (
          <section className="print-section">
            <h2 className="text-lg font-bold mb-3 border-b border-[#2a2a3a] pb-2">4. Security</h2>
            <p className="text-sm text-[#8888a0]">
              Security score: <strong style={{ color: scoreColor(security.score) }} className="keep-color">{security.score}/100</strong>.
              Total vulnerabilities: <strong>{security.totalIssues}</strong>.
              {security.totalIssues === 0 ? " No security issues detected." : ` Review the Quality dashboard for details.`}
            </p>
          </section>
        )}

        {/* Dead Code */}
        {deadcode && (
          <section className="print-section">
            <h2 className="text-lg font-bold mb-3 border-b border-[#2a2a3a] pb-2">5. Dead Code</h2>
            <p className="text-sm text-[#8888a0]">
              Unused symbols: <strong>{deadcode.totalDead}</strong>.
              Estimated cleanup: <strong>{deadcode.estimatedCleanupLines.toLocaleString()}</strong> lines of code can be removed.
            </p>
          </section>
        )}

        {/* Tech Debt */}
        {techDebt && (
          <section className="print-section">
            <h2 className="text-lg font-bold mb-3 border-b border-[#2a2a3a] pb-2">6. Technical Debt</h2>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-[#2a2a3a] p-3">
                <div className="text-[9px] uppercase text-[#5a5a70]">Total Fix Cost</div>
                <div className="text-xl font-bold text-red-400 keep-color">${(techDebt.totalEstimatedCost / 1000).toFixed(0)}k</div>
                <div className="text-[10px] text-[#5a5a70]">{techDebt.totalEstimatedHours} hours</div>
              </div>
              <div className="rounded-lg border border-[#2a2a3a] p-3">
                <div className="text-[9px] uppercase text-[#5a5a70]">Annual Cost (ongoing)</div>
                <div className="text-xl font-bold text-amber-400 keep-color">${(techDebt.totalAnnualCost / 1000).toFixed(0)}k</div>
                <div className="text-[10px] text-[#5a5a70]">if not addressed</div>
              </div>
              <div className="rounded-lg border border-[#2a2a3a] p-3">
                <div className="text-[9px] uppercase text-[#5a5a70]">Quality Score</div>
                <div className="text-xl font-bold keep-color" style={{ color: scoreColor(overallScore) }}>{overallScore}/100</div>
                <div className="text-[10px] text-[#5a5a70]">overall</div>
              </div>
            </div>
          </section>
        )}

        {/* Module Breakdown */}
        <section className="print-section">
          <h2 className="text-lg font-bold mb-3 border-b border-[#2a2a3a] pb-2">7. Module Breakdown</h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#2a2a3a] text-left text-[10px] uppercase text-[#5a5a70]">
                <th className="py-2">Module</th>
                <th>Layer</th>
                <th>Language</th>
                <th className="text-right">Files</th>
                <th className="text-right">Lines</th>
              </tr>
            </thead>
            <tbody>
              {[...model.modules].sort((a, b) => b.lineCount - a.lineCount).slice(0, 20).map((m) => (
                <tr key={m.name} className="border-b border-[#1e1e2a]">
                  <td className="py-1.5 font-mono text-[#e4e4ed]">{m.name}</td>
                  <td className="text-[#8888a0]">{m.layer}</td>
                  <td className="text-[#8888a0]">{m.language}</td>
                  <td className="text-right text-[#8888a0]">{m.fileCount}</td>
                  <td className="text-right text-[#8888a0]">{m.lineCount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Footer */}
        <div className="text-center text-[10px] text-[#5a5a70] pt-4 border-t border-[#2a2a3a]">
          Generated by ArchLens v{model.project.version} · {new Date().toLocaleString()}
        </div>
      </div>
    </>
  );
}
