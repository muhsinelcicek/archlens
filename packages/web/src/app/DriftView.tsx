import { useI18n } from "../lib/i18n.js";
import { useMemo } from "react";
import { useStore } from "../lib/store.js";
import { ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2, XCircle, ArrowRight, Activity } from "lucide-react";

export function DriftView() {
  const { model } = useStore();
  const { t } = useI18n();  if (!model) return null;

  const analysis = useMemo(() => {
    const layerOrder = ["presentation", "api", "application", "domain", "infrastructure", "config"];

    // Layer violations
    const violations: Array<{ src: string; srcLayer: string; tgt: string; tgtLayer: string }> = [];
    const edgeSet = new Set<string>();

    for (const rel of model.relations) {
      if (rel.type !== "imports") continue;
      const srcMod = rel.source.split("/")[0];
      const tgtSym = model.symbols[rel.target] as Record<string, unknown> | undefined;
      if (!tgtSym) continue;
      const tgtMod = (tgtSym.filePath as string)?.split("/")[0];
      if (!tgtMod || srcMod === tgtMod) continue;

      const srcModule = model.modules.find((m) => m.name === srcMod);
      const tgtModule = model.modules.find((m) => m.name === tgtMod);
      if (!srcModule || !tgtModule) continue;

      const srcIdx = layerOrder.indexOf(srcModule.layer);
      const tgtIdx = layerOrder.indexOf(tgtModule.layer);

      if (srcIdx > tgtIdx && srcIdx !== -1 && tgtIdx !== -1) {
        const key = `${srcMod}->${tgtMod}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          violations.push({ src: srcMod, srcLayer: srcModule.layer, tgt: tgtMod, tgtLayer: tgtModule.layer });
        }
      }
    }

    // Circular deps
    const moduleDeps = new Map<string, Set<string>>();
    for (const rel of model.relations) {
      if (rel.type !== "imports") continue;
      const srcMod = rel.source.split("/")[0];
      const tgtSym = model.symbols[rel.target] as Record<string, unknown> | undefined;
      if (!tgtSym) continue;
      const tgtMod = (tgtSym.filePath as string)?.split("/")[0];
      if (srcMod !== tgtMod) {
        if (!moduleDeps.has(srcMod)) moduleDeps.set(srcMod, new Set());
        moduleDeps.get(srcMod)!.add(tgtMod);
      }
    }

    const circular: string[][] = [];
    for (const [modA, depsA] of moduleDeps) {
      for (const modB of depsA) {
        if (moduleDeps.get(modB)?.has(modA)) {
          const pair = [modA, modB].sort();
          if (!circular.some((c) => c[0] === pair[0] && c[1] === pair[1])) {
            circular.push(pair);
          }
        }
      }
    }

    // Module health
    const moduleHealth = model.modules.map((mod) => {
      const issues: string[] = [];
      if (mod.lineCount > 5000) issues.push(`Large module (${mod.lineCount.toLocaleString()} lines)`);
      if (mod.symbols.length > 200) issues.push(`Too many symbols (${mod.symbols.length})`);
      if (mod.fileCount > 50) issues.push(`Too many files (${mod.fileCount})`);
      return { ...mod, issues, healthy: issues.length === 0 };
    });

    // Index freshness
    const indexDate = new Date(model.project.analyzedAt);
    const hoursSince = (Date.now() - indexDate.getTime()) / (1000 * 60 * 60);

    // Overall score
    const totalChecks = 3 + model.modules.length;
    const passedChecks =
      (violations.length === 0 ? 1 : 0) +
      (circular.length === 0 ? 1 : 0) +
      (hoursSince < 24 ? 1 : 0) +
      moduleHealth.filter((m) => m.healthy).length;
    const score = Math.round((passedChecks / totalChecks) * 100);

    return { violations, circular, moduleHealth, hoursSince, indexDate, score, passedChecks, totalChecks };
  }, [model]);

  const scoreColor = analysis.score >= 80 ? "#10b981" : analysis.score >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-[1000px]">
      {/* Header with Score */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t("health.title")}</h2>
          <p className="text-sm text-[#5a5a70] mt-1">
            Drift detection, layer violations, circular dependencies, and module health
          </p>
        </div>

        {/* Score circle */}
        <div className="relative flex-shrink-0">
          <svg width="80" height="80" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="34" fill="none" stroke="#27272a" strokeWidth="6" />
            <circle
              cx="40" cy="40" r="34" fill="none" stroke={scoreColor} strokeWidth="6"
              strokeDasharray={`${(analysis.score / 100) * 213.6} 213.6`}
              strokeLinecap="round"
              transform="rotate(-90 40 40)"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold" style={{ color: scoreColor }}>{analysis.score}</span>
            <span className="text-[9px] text-[#5a5a70]">SCORE</span>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <HealthCard
          label="Layer Violations"
          value={analysis.violations.length}
          ok={analysis.violations.length === 0}
          detail={analysis.violations.length === 0 ? "Clean" : `${analysis.violations.length} violations`}
        />
        <HealthCard
          label="Circular Dependencies"
          value={analysis.circular.length}
          ok={analysis.circular.length === 0}
          detail={analysis.circular.length === 0 ? "Clean" : `${analysis.circular.length} cycles`}
        />
        <HealthCard
          label="Index Freshness"
          value={Math.round(analysis.hoursSince)}
          ok={analysis.hoursSince < 24}
          detail={analysis.hoursSince < 24 ? "Fresh" : "Stale"}
          suffix="h"
        />
        <HealthCard
          label="Module Health"
          value={analysis.moduleHealth.filter((m) => m.healthy).length}
          ok={analysis.moduleHealth.every((m) => m.healthy)}
          detail={`${analysis.moduleHealth.filter((m) => m.healthy).length}/${model.modules.length} healthy`}
          suffix={`/${model.modules.length}`}
        />
      </div>

      {/* Layer Violations */}
      <section className="rounded-xl border border-[#2a2a3a] overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 bg-elevated border-b border-[#2a2a3a]">
          {analysis.violations.length === 0 ? (
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
          ) : (
            <ShieldAlert className="h-4 w-4 text-red-500" />
          )}
          <h3 className="font-semibold text-sm">Layer Dependency Rules</h3>
          <span className="ml-auto text-xs text-[#5a5a70]">Lower layers should NOT depend on higher layers</span>
        </div>

        <div className="p-5">
          {analysis.violations.length === 0 ? (
            <div className="flex items-center gap-2 text-emerald-400 text-sm">
              <CheckCircle2 className="h-4 w-4" />
              No layer violations detected. Architecture boundaries are clean.
            </div>
          ) : (
            <div className="space-y-2">
              {analysis.violations.map((v, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg bg-red-500/5 border border-red-500/20 px-4 py-2.5">
                  <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                  <span className="font-mono text-sm text-red-300">{v.src}</span>
                  <span className="text-[10px] text-[#5a5a70]">({v.srcLayer})</span>
                  <ArrowRight className="h-3 w-3 text-[#5a5a70]" />
                  <span className="font-mono text-sm text-red-300">{v.tgt}</span>
                  <span className="text-[10px] text-[#5a5a70]">({v.tgtLayer})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Circular Dependencies */}
      <section className="rounded-xl border border-[#2a2a3a] overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 bg-elevated border-b border-[#2a2a3a]">
          {analysis.circular.length === 0 ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          )}
          <h3 className="font-semibold text-sm">Circular Dependencies</h3>
        </div>

        <div className="p-5">
          {analysis.circular.length === 0 ? (
            <div className="flex items-center gap-2 text-emerald-400 text-sm">
              <CheckCircle2 className="h-4 w-4" />
              No circular dependencies between modules.
            </div>
          ) : (
            <div className="space-y-2">
              {analysis.circular.map((pair, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg bg-amber-500/5 border border-amber-500/20 px-4 py-2.5">
                  <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                  <span className="font-mono text-sm text-amber-300">{pair[0]}</span>
                  <span className="text-[#5a5a70]">↔</span>
                  <span className="font-mono text-sm text-amber-300">{pair[1]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Module Health */}
      <section className="rounded-xl border border-[#2a2a3a] overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 bg-elevated border-b border-[#2a2a3a]">
          <Activity className="h-4 w-4 text-archlens-500" />
          <h3 className="font-semibold text-sm">Module Health</h3>
        </div>

        <div className="p-5 space-y-2">
          {analysis.moduleHealth.map((mod) => (
            <div
              key={mod.name}
              className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                mod.healthy
                  ? "border-[#2a2a3a] bg-surface"
                  : "border-amber-500/20 bg-amber-500/5"
              }`}
            >
              <div className="flex items-center gap-3">
                {mod.healthy ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                )}
                <span className="font-mono text-sm font-medium text-[#e4e4ed]">{mod.name}/</span>
                <span className="text-xs text-[#5a5a70]">{mod.layer}</span>
              </div>

              <div className="flex items-center gap-4 text-xs">
                <span className="text-[#5a5a70]">{mod.fileCount} files</span>
                <span className="text-[#5a5a70]">{mod.lineCount.toLocaleString()} lines</span>
                {!mod.healthy && (
                  <span className="text-amber-400">{mod.issues.join(", ")}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <div className="text-center text-xs text-[#5a5a70]">
        Last indexed: {analysis.indexDate.toLocaleString("tr-TR")} ({Math.round(analysis.hoursSince)}h ago)
        {analysis.hoursSince > 24 && (
          <span className="text-amber-500 ml-2">
            — Run <code className="bg-elevated px-1.5 py-0.5 rounded">archlens analyze</code> to refresh
          </span>
        )}
      </div>
    </div>
  );
}

function HealthCard({ label, value, ok, detail, suffix }: {
  label: string; value: number; ok: boolean; detail: string; suffix?: string;
}) {
  return (
    <div className={`rounded-xl border p-4 ${ok ? "border-emerald-500/20 bg-emerald-500/5" : "border-amber-500/20 bg-amber-500/5"}`}>
      <div className="text-xs text-[#5a5a70] mb-1">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-bold ${ok ? "text-emerald-400" : "text-amber-400"}`}>{value}</span>
        {suffix && <span className="text-sm text-[#5a5a70]">{suffix}</span>}
      </div>
      <div className={`text-[11px] mt-1 ${ok ? "text-emerald-600" : "text-amber-600"}`}>{detail}</div>
    </div>
  );
}
