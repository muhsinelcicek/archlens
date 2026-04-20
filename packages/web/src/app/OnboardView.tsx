import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../lib/i18n.js";
import { useStore } from "../lib/store.js";
import {
  Rocket, Layers, Database, Globe, Cpu, ArrowRight,
  BookOpen, Code2, GitBranch, Box, Zap, Users,
  ChevronDown, ChevronRight, CheckCircle2,
  ShieldCheck, AlertTriangle, Activity, Workflow,
  Compass, BarChart3, Radio, Search,
} from "lucide-react";
import { useAllAnalysis } from "../services/queries.js";

/* ─── Constants ───────────────────────────────────────────── */

const LAYER_COLORS: Record<string, string> = {
  presentation: "#34d399",
  api: "#60a5fa",
  application: "#fbbf24",
  domain: "#a78bfa",
  infrastructure: "#f87171",
  config: "#94a3b8",
  unknown: "#52525b",
};

const LAYER_ICONS: Record<string, React.ElementType> = {
  presentation: Users,
  api: Globe,
  application: Zap,
  domain: Box,
  infrastructure: Database,
  config: Cpu,
  unknown: Code2,
};

const LAYER_DESCRIPTIONS: Record<string, string> = {
  presentation: "User-facing UI components and views",
  api: "HTTP endpoints, controllers, and route handlers",
  application: "Use cases, orchestration, and business coordination",
  domain: "Core business logic, entities, and value objects",
  infrastructure: "Database access, external integrations, and I/O",
  config: "Configuration, constants, and environment setup",
  unknown: "Uncategorized modules",
};

const LAYER_ORDER = ["presentation", "api", "application", "domain", "infrastructure", "config", "unknown"];

/* ─── Types ───────────────────────────────────────────────── */

interface QualityReport {
  projectScore: number;
  totalIssues: number;
  bySeverity: Record<string, number>;
  byCategory: Record<string, number>;
  modules: Array<{ moduleName: string; score: number }>;
  architecturePatterns: Array<{ pattern: string; detected: boolean; compliance: number }>;
}

interface CouplingReport {
  overallHealth: {
    avgInstability: number;
    avgAbstractness: number;
    avgDistance: number;
    circularCount: number;
  };
  modules: Array<{ moduleName: string; instability: number }>;
}

interface SecurityReport {
  totalIssues: number;
  bySeverity: Record<string, number>;
  score: number;
}

/* ─── Helpers ─────────────────────────────────────────────── */

function scoreColor(score: number): string {
  if (score >= 80) return "#34d399";
  if (score >= 60) return "#fbbf24";
  if (score >= 40) return "#f97316";
  return "#ef4444";
}

function generateProjectSummary(model: any): string {
  const langs = model.stats.languages;
  const sortedLangs = Object.entries(langs).sort(([, a]: any, [, b]: any) => b - a);
  const primaryLang = sortedLangs[0]?.[0] || "multi-language";

  const endpoints = model.apiEndpoints.length;
  const entities = model.dbEntities.length;
  const processes = (model.businessProcesses || []).length;
  const modules = model.stats.modules;

  let type: string;
  if (endpoints > 20) type = "API-heavy platform";
  else if (entities > 10) type = "data-driven application";
  else if (processes > 5) type = "process-oriented system";
  else type = "software project";

  const parts: string[] = [];
  if (modules > 1) parts.push(`${modules} modules`);
  if (endpoints > 0) parts.push(`${endpoints} API endpoints`);
  if (entities > 0) parts.push(`${entities} database tables`);

  return `A ${primaryLang} ${type} with ${parts.join(", ")}`;
}

function generateLayerInsight(model: any): string {
  const layerStats = LAYER_ORDER.map((layer) => {
    const mods = model.modules.filter((m: any) => m.layer === layer);
    const lines = mods.reduce((a: number, m: any) => a + m.lineCount, 0);
    return { layer, mods: mods.length, lines };
  }).filter((l) => l.mods > 0);

  const totalLines = model.stats.totalLines || 1;
  const biggest = layerStats.reduce((a, b) => (a.lines > b.lines ? a : b), layerStats[0]);
  const mostModules = layerStats.reduce((a, b) => (a.mods > b.mods ? a : b), layerStats[0]);

  if (!biggest) return "Architecture analysis in progress.";

  const pct = Math.round((biggest.lines / totalLines) * 100);

  if (biggest.layer === "domain" && pct > 35) {
    return `The domain layer contains ${pct}% of the codebase — this is a domain-rich application with strong business logic encapsulation.`;
  }
  if (biggest.layer === "api" || mostModules.layer === "api") {
    return `The API layer has the most modules (${mostModules.mods}) — this is an API-first architecture with ${pct}% of code in the ${biggest.layer} layer.`;
  }
  if (biggest.layer === "infrastructure") {
    return `The infrastructure layer is the largest at ${pct}% — this project has significant integration and data access complexity.`;
  }
  return `The ${biggest.layer} layer contains ${pct}% of the codebase (${biggest.lines.toLocaleString()} lines) across ${biggest.mods} modules.`;
}

function generateFlowInsight(processes: any[]): string {
  const filtered = processes.filter(
    (p: any) => p.category !== "presentation" && p.category !== "api-service",
  );
  if (filtered.length === 0) return "No business process flows detected.";

  const avgSteps = Math.round(
    filtered.reduce((a: number, p: any) => a + p.steps.length, 0) / filtered.length,
  );
  const mostComplex = filtered.reduce((a: any, b: any) =>
    a.steps.length > b.steps.length ? a : b,
  );
  return `The system processes data through ${avgSteps} average steps. Most complex flow: ${mostComplex.name} (${mostComplex.steps.length} steps).`;
}

function generateHealthInsight(
  quality: QualityReport | null,
  coupling: CouplingReport | null,
  security: SecurityReport | null,
): string {
  const parts: string[] = [];

  if (quality) {
    if (quality.projectScore >= 80) parts.push("Overall healthy codebase");
    else if (quality.projectScore >= 60) parts.push("Moderate code quality");
    else parts.push("Code quality needs attention");
  }

  if (coupling?.overallHealth) {
    if (coupling.overallHealth.circularCount > 0) {
      parts.push(`${coupling.overallHealth.circularCount} circular dependencies to resolve`);
    }
    const unstable = coupling.modules?.filter((m) => m.instability > 0.8) || [];
    if (unstable.length > 0) {
      parts.push(`watch coupling in ${unstable[0].moduleName}`);
    }
  }

  if (security && security.totalIssues > 0) {
    parts.push(`${security.totalIssues} security issue${security.totalIssues > 1 ? "s" : ""} found`);
  }

  return parts.length > 0 ? parts.join(". ") + "." : "Health data loading...";
}

/* ─── ScoreRing ───────────────────────────────────────────── */

function ScoreRing({ score, size = 80, label }: { score: number; size?: number; label?: string }) {
  const color = scoreColor(score);
  const r = (size - 8) / 2;
  const circumference = 2 * Math.PI * r;
  const dashLen = (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full -rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-border-subtle)" strokeWidth="5" />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="5"
            strokeDasharray={`${dashLen} ${circumference}`} strokeLinecap="round"
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold" style={{ color }}>{score}</span>
        </div>
      </div>
      {label && <span className="text-[10px] text-[var(--color-text-muted)] uppercase font-semibold">{label}</span>}
    </div>
  );
}

/* ─── CollapsibleSection ──────────────────────────────────── */

function CollapsibleSection({
  title,
  icon: Icon,
  stepNumber,
  expanded,
  onToggle,
  visited,
  children,
}: {
  title: string;
  icon: React.ElementType;
  stepNumber: number;
  expanded: boolean;
  onToggle: () => void;
  visited: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--color-border-default)] bg-surface overflow-hidden transition-all duration-300">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-5 hover:bg-hover transition-colors text-left"
      >
        <div
          className="flex items-center justify-center h-8 w-8 rounded-lg text-xs font-bold flex-shrink-0"
          style={{
            backgroundColor: visited ? "#34d39920" : "var(--color-border-default)",
            color: visited ? "#34d399" : "var(--color-text-muted)",
          }}
        >
          {visited ? <CheckCircle2 className="h-4 w-4" /> : stepNumber}
        </div>
        <Icon className="h-5 w-5 text-archlens-500 flex-shrink-0" />
        <span className="text-base font-semibold text-[var(--color-text-primary)] flex-1">{title}</span>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-[var(--color-text-muted)] transition-transform" />
        ) : (
          <ChevronRight className="h-4 w-4 text-[var(--color-text-muted)] transition-transform" />
        )}
      </button>
      <div
        className="overflow-hidden transition-all duration-500"
        style={{ maxHeight: expanded ? "2000px" : "0px", opacity: expanded ? 1 : 0 }}
      >
        <div className="px-5 pb-6 pt-1">{children}</div>
      </div>
    </section>
  );
}

/* ─── InsightBox ──────────────────────────────────────────── */

function InsightBox({ text, color = "#60a5fa" }: { text: string; color?: string }) {
  return (
    <div
      className="mt-5 rounded-xl border px-4 py-3 text-sm"
      style={{ borderColor: `${color}30`, backgroundColor: `${color}08`, color: `${color}dd` }}
    >
      <span className="text-[10px] uppercase font-bold tracking-wider mr-2" style={{ color }}>
        Insight
      </span>
      {text}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   OnboardView
   ═══════════════════════════════════════════════════════════════ */

export function OnboardView() {
  const { model } = useStore();
  const navigate = useNavigate();

  // Collapsible section state
  const [expandedSections, setExpandedSections] = useState<Record<number, boolean>>({
    1: true, // Big Picture is open by default
  });
  const [visitedSections, setVisitedSections] = useState<Set<number>>(new Set([1]));

  // Health data — React Query (cached)
  const { quality, coupling, security, isLoading: healthLoading } = useAllAnalysis();
  const healthError = (!quality && !coupling && !healthLoading) ? "Health data unavailable" : null;


  const toggleSection = useCallback((num: number) => {
    setExpandedSections((prev) => ({ ...prev, [num]: !prev[num] }));
    setVisitedSections((prev) => new Set(prev).add(num));
  }, []);

  if (!model) return null;

  const processes = model.businessProcesses || [];
  const summary = generateProjectSummary(model);

  // Build inter-layer import counts
  const layerImports = new Map<string, Map<string, number>>();
  for (const rel of model.relations) {
    if (rel.type !== "imports") continue;
    const srcMod = rel.source.split("/")[0];
    const tgtSym = model.symbols[rel.target] as Record<string, unknown> | undefined;
    const tgtMod = (tgtSym?.filePath as string)?.split("/")[0];
    if (!srcMod || !tgtMod || srcMod === tgtMod) continue;
    const srcLayer = model.modules.find((m) => m.name === srcMod)?.layer || "unknown";
    const tgtLayer = model.modules.find((m) => m.name === tgtMod)?.layer || "unknown";
    if (srcLayer === tgtLayer) continue;
    const key = `${srcLayer}>${tgtLayer}`;
    if (!layerImports.has(key)) layerImports.set(key, new Map());
    layerImports.get(key)!.set(srcMod, (layerImports.get(key)!.get(srcMod) || 0) + 1);
  }

  // Count imports between adjacent layers
  function getImportCount(fromLayer: string, toLayer: string): number {
    const key = `${fromLayer}>${toLayer}`;
    const reverseKey = `${toLayer}>${fromLayer}`;
    let count = 0;
    const fwd = layerImports.get(key);
    const rev = layerImports.get(reverseKey);
    if (fwd) for (const v of fwd.values()) count += v;
    if (rev) for (const v of rev.values()) count += v;
    return count;
  }

  // Top 3 processes by step count (non-presentation, non-api-service)
  const topProcesses = [...processes]
    .filter((p) => p.category !== "presentation" && p.category !== "api-service")
    .sort((a, b) => b.steps.length - a.steps.length)
    .slice(0, 3);

  // Stats for hero
  const primaryLang = Object.entries(model.stats.languages)
    .sort(([, a], [, b]) => b - a)[0]?.[0] || "N/A";
  const langCount = Object.keys(model.stats.languages).length;

  const totalSectionsCount = 5;
  const visitedCount = visitedSections.size;

  // Populated layers
  const populatedLayers = LAYER_ORDER.filter(
    (layer) => model.modules.some((m) => m.layer === layer),
  );

  // Health scores
  const qualityScore = quality?.projectScore ?? 0;
  const couplingHealth = coupling?.overallHealth
    ? Math.max(0, 100 - Math.round(coupling.overallHealth.avgInstability * 60) - (coupling.overallHealth.circularCount * 10))
    : 0;
  const securityScore = security?.score ?? 100;
  const patternCompliance = quality?.architecturePatterns
    ? Math.round(
        quality.architecturePatterns.reduce((a, p) => a + (p.compliance || 0), 0) /
          (quality.architecturePatterns.length || 1),
      )
    : 0;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1100px]">
      {/* ── Hero Section ───────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-archlens-500/20 bg-gradient-to-br from-archlens-500/8 via-zinc-900 to-zinc-950 p-8">
        {/* Decorative blobs */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-archlens-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative">
          {/* Title row */}
          <div className="flex items-start gap-4 mb-2">
            <div className="h-14 w-14 rounded-2xl bg-archlens-500/10 border border-archlens-500/20 flex items-center justify-center flex-shrink-0">
              <Rocket className="h-7 w-7 text-archlens-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl font-bold tracking-tight text-[var(--color-text-primary)]">
                Welcome to {model.project.name}
              </h1>
              <p className="text-[var(--color-text-secondary)] text-sm mt-1 leading-relaxed">
                {summary}
              </p>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
            {[
              { label: "Modules", value: model.stats.modules, icon: Layers, color: "#60a5fa" },
              { label: "API Endpoints", value: model.apiEndpoints.length, icon: Globe, color: "#34d399" },
              { label: "DB Tables", value: model.dbEntities.length, icon: Database, color: "#a78bfa" },
              {
                label: "Languages",
                value: langCount,
                icon: Code2,
                color: "#fbbf24",
                sub: primaryLang,
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border px-4 py-3 text-center transition-all hover:scale-[1.02]"
                style={{ borderColor: `${stat.color}25`, backgroundColor: `${stat.color}06` }}
              >
                <stat.icon className="h-4 w-4 mx-auto mb-1.5" style={{ color: stat.color }} />
                <div className="text-2xl font-bold text-[var(--color-text-primary)]">{stat.value}</div>
                <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">{stat.label}</div>
                {"sub" in stat && stat.sub && (
                  <div className="text-[9px] font-mono mt-0.5" style={{ color: stat.color }}>
                    {stat.sub}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Progress dots */}
          <div className="flex items-center justify-center gap-2 mt-7">
            {Array.from({ length: totalSectionsCount }, (_, i) => {
              const num = i + 1;
              const visited = visitedSections.has(num);
              return (
                <button
                  key={num}
                  onClick={() => toggleSection(num)}
                  className="flex items-center gap-1.5 group"
                  title={`Section ${num}`}
                >
                  <div
                    className="h-2 rounded-full transition-all duration-500"
                    style={{
                      width: visited ? "28px" : "10px",
                      backgroundColor: visited ? "#34d399" : "var(--color-border-default)",
                    }}
                  />
                </button>
              );
            })}
            <span className="text-[10px] text-[var(--color-text-muted)] ml-2">
              {visitedCount}/{totalSectionsCount} explored
            </span>
          </div>
        </div>
      </div>

      {/* ── Section 1: The Big Picture ─────────────────────────── */}
      <CollapsibleSection
        title="The Big Picture"
        icon={Layers}
        stepNumber={1}
        expanded={!!expandedSections[1]}
        onToggle={() => toggleSection(1)}
        visited={visitedSections.has(1)}
      >
        <p className="text-sm text-[var(--color-text-secondary)] mb-5">
          Architecture overview — modules arranged by layer from presentation down to infrastructure.
        </p>

        <div className="space-y-1">
          {populatedLayers.map((layer, layerIdx) => {
            const mods = model.modules.filter((m) => m.layer === layer);
            const color = LAYER_COLORS[layer] || LAYER_COLORS.unknown;
            const Icon = LAYER_ICONS[layer] || Code2;
            const nextLayer = populatedLayers[layerIdx + 1];
            const importCount = nextLayer ? getImportCount(layer, nextLayer) : 0;

            return (
              <div key={layer}>
                {/* Layer row */}
                <div
                  className="rounded-xl border p-4 transition-all hover:shadow-lg hover:shadow-black/20 cursor-pointer"
                  style={{
                    borderColor: `${color}25`,
                    background: `linear-gradient(135deg, ${color}06, transparent)`,
                  }}
                  onClick={() => navigate("/architecture")}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="flex items-center justify-center h-8 w-8 rounded-lg flex-shrink-0"
                      style={{ backgroundColor: `${color}15` }}
                    >
                      <Icon className="h-4 w-4" style={{ color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold capitalize text-sm" style={{ color }}>
                          {layer}
                        </h3>
                        <span
                          className="text-[10px] font-bold rounded-full px-2 py-0.5"
                          style={{ backgroundColor: `${color}15`, color }}
                        >
                          {mods.length} module{mods.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                    <div className="text-right hidden sm:block">
                      <div className="text-xs text-[var(--color-text-muted)] tabular-nums">
                        {mods.reduce((a, m) => a + m.fileCount, 0)} files
                      </div>
                      <div className="text-[10px] text-[var(--color-text-muted)] tabular-nums">
                        {mods.reduce((a, m) => a + m.lineCount, 0).toLocaleString()} lines
                      </div>
                    </div>
                  </div>

                  {/* Module chips */}
                  <div className="flex flex-wrap gap-2 ml-11">
                    {mods.map((mod) => (
                      <div
                        key={mod.name}
                        className="rounded-lg border px-3 py-1.5 transition-all hover:scale-[1.03]"
                        style={{ borderColor: `${color}20`, backgroundColor: `${color}06` }}
                      >
                        <span className="font-mono text-xs font-semibold" style={{ color }}>
                          {mod.name}/
                        </span>
                        <div className="flex gap-2 text-[9px] text-[var(--color-text-muted)] mt-0.5">
                          <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 bg-[var(--color-border-subtle)]">
                            {mod.language}
                          </span>
                          <span>{mod.fileCount} files</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Arrow between layers */}
                {nextLayer && (
                  <div className="flex flex-col items-center py-1">
                    <div className="w-px h-2 bg-[var(--color-border-default)]" />
                    {importCount > 0 && (
                      <span className="text-[9px] text-[var(--color-text-muted)] bg-[var(--color-border-subtle)] border border-[var(--color-border-default)] rounded-full px-2 py-0.5 my-0.5">
                        {importCount} imports
                      </span>
                    )}
                    <div className="w-px h-2 bg-[var(--color-border-default)]" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CollapsibleSection>

      {/* ── Section 2: How It's Built ──────────────────────────── */}
      <CollapsibleSection
        title="How It's Built"
        icon={BarChart3}
        stepNumber={2}
        expanded={!!expandedSections[2]}
        onToggle={() => toggleSection(2)}
        visited={visitedSections.has(2)}
      >
        <p className="text-sm text-[var(--color-text-secondary)] mb-5">
          Architecture layers as a horizontal swimlane — see where the code lives.
        </p>

        <div className="space-y-3">
          {populatedLayers.map((layer) => {
            const mods = model.modules.filter((m) => m.layer === layer);
            const color = LAYER_COLORS[layer] || LAYER_COLORS.unknown;
            const totalFiles = mods.reduce((a, m) => a + m.fileCount, 0);
            const totalLines = mods.reduce((a, m) => a + m.lineCount, 0);
            const pct = model.stats.totalLines ? Math.round((totalLines / model.stats.totalLines) * 100) : 0;

            return (
              <div
                key={layer}
                className="flex items-stretch gap-0 rounded-xl border overflow-hidden transition-all hover:shadow-lg hover:shadow-black/10"
                style={{ borderColor: `${color}20` }}
              >
                {/* Layer label */}
                <div
                  className="flex flex-col justify-center items-center px-4 py-3 min-w-[110px]"
                  style={{ backgroundColor: `${color}10` }}
                >
                  <span className="font-semibold capitalize text-xs" style={{ color }}>
                    {layer}
                  </span>
                  <span className="text-[9px] text-[var(--color-text-muted)] mt-0.5">
                    {totalFiles} files / {totalLines.toLocaleString()} lines
                  </span>
                  {/* Percentage bar */}
                  <div className="w-full h-1 rounded-full bg-[var(--color-border-subtle)] mt-2 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>
                  <span className="text-[9px] mt-0.5" style={{ color: `${color}aa` }}>
                    {pct}%
                  </span>
                </div>

                {/* Module chips scrollable */}
                <div className="flex-1 flex items-center gap-2 px-4 py-3 overflow-x-auto bg-surface">
                  {mods.map((mod) => (
                    <button
                      key={mod.name}
                      onClick={() => navigate("/architecture")}
                      className="flex-shrink-0 rounded-lg border px-3 py-1.5 text-left transition-all hover:scale-[1.03] hover:shadow-md cursor-pointer"
                      style={{ borderColor: `${color}20`, backgroundColor: `${color}06` }}
                    >
                      <span className="font-mono text-[11px] font-semibold block" style={{ color }}>
                        {mod.name}/
                      </span>
                      <span className="text-[9px] text-[var(--color-text-muted)]">
                        {mod.fileCount} files
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <InsightBox text={generateLayerInsight(model)} color="#60a5fa" />
      </CollapsibleSection>

      {/* ── Section 3: Key Data Flows ──────────────────────────── */}
      <CollapsibleSection
        title="Key Data Flows"
        icon={Workflow}
        stepNumber={3}
        expanded={!!expandedSections[3]}
        onToggle={() => toggleSection(3)}
        visited={visitedSections.has(3)}
      >
        {topProcesses.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">No business processes detected in this codebase.</p>
        ) : (
          <>
            <p className="text-sm text-[var(--color-text-secondary)] mb-5">
              Top {topProcesses.length} most complex business flows — click any step to explore.
            </p>

            <div className="space-y-4">
              {topProcesses.map((proc) => {
                const catColors: Record<string, string> = {
                  "data-ingestion": "#06b6d4",
                  analysis: "#a78bfa",
                  alert: "#fbbf24",
                  integration: "#f87171",
                };
                const color = catColors[proc.category] || "#34d399";

                return (
                  <div
                    key={proc.id}
                    className="rounded-xl border bg-surface p-5 transition-all hover:shadow-lg hover:shadow-black/10"
                    style={{ borderColor: `${color}20` }}
                  >
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-1">
                      <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                      <h4 className="font-semibold text-sm text-[var(--color-text-primary)]">{proc.name}</h4>
                      <span
                        className="text-[9px] rounded-full px-2 py-0.5 font-medium"
                        style={{ backgroundColor: `${color}15`, color }}
                      >
                        {proc.category}
                      </span>
                      <span className="text-[9px] text-[var(--color-text-muted)] ml-auto">
                        {proc.steps.length} steps
                      </span>
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)] mb-4 ml-5">{proc.description}</p>

                    {/* Pipeline */}
                    <div
                      className="flex items-center gap-1.5 overflow-x-auto pb-2 cursor-pointer"
                      onClick={() => navigate("/processes")}
                    >
                      {/* Input */}
                      <div className="flex-shrink-0 rounded-lg bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1.5">
                        <div className="text-[8px] text-cyan-600 uppercase font-bold mb-0.5">Input</div>
                        <div className="text-[10px] text-cyan-300 font-mono">
                          {proc.dataSources.map((d) => d.name).join(", ")}
                        </div>
                      </div>

                      <ArrowRight className="h-3 w-3 text-[var(--color-text-muted)] flex-shrink-0" />

                      {/* Steps */}
                      {proc.steps.slice(0, 6).map((step, i) => {
                        // Find the module's layer for this step, color accordingly
                        const stepSymbol = step.symbolRef;
                        const stepMod = stepSymbol
                          ? model.modules.find((m) =>
                              m.symbols.some((s) => s === stepSymbol || s.endsWith(`/${stepSymbol}`)),
                            )
                          : null;
                        const stepColor = stepMod
                          ? LAYER_COLORS[stepMod.layer] || color
                          : color;

                        return (
                          <div key={i} className="flex items-center gap-1.5 flex-shrink-0">
                            {i > 0 && <ArrowRight className="h-3 w-3 text-[var(--color-border-default)]" />}
                            <div
                              className="rounded-md border px-2.5 py-1 text-[10px] font-medium whitespace-nowrap transition-all hover:scale-105"
                              style={{ borderColor: `${stepColor}30`, color: stepColor, backgroundColor: `${stepColor}08` }}
                            >
                              {step.name}
                            </div>
                          </div>
                        );
                      })}
                      {proc.steps.length > 6 && (
                        <span className="text-[9px] text-[var(--color-text-muted)] flex-shrink-0 ml-1">
                          +{proc.steps.length - 6} more
                        </span>
                      )}

                      <ArrowRight className="h-3 w-3 text-[var(--color-text-muted)] flex-shrink-0" />

                      {/* Output */}
                      <div className="flex-shrink-0 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5">
                        <div className="text-[8px] text-emerald-600 uppercase font-bold mb-0.5">Output</div>
                        <div className="text-[10px] text-emerald-300 font-mono">
                          {proc.outputs.map((o) => o.name).join(", ")}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <InsightBox text={generateFlowInsight(processes)} color="#a78bfa" />
          </>
        )}
      </CollapsibleSection>

      {/* ── Section 4: Health Check ────────────────────────────── */}
      <CollapsibleSection
        title="Health Check"
        icon={Activity}
        stepNumber={4}
        expanded={!!expandedSections[4]}
        onToggle={() => toggleSection(4)}
        visited={visitedSections.has(4)}
      >
        {healthLoading ? (
          <div className="flex flex-col items-center justify-center h-36 gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-archlens-400 border-t-transparent" />
            <p className="text-sm text-[var(--color-text-muted)]">Loading health data...</p>
          </div>
        ) : healthError ? (
          <div className="flex flex-col items-center justify-center h-36 gap-2">
            <AlertTriangle className="h-6 w-6 text-amber-500" />
            <p className="text-sm text-[var(--color-text-muted)]">{healthError}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Quality Score */}
              <div
                className="rounded-xl border border-[var(--color-border-default)] bg-elevated p-4 flex flex-col items-center cursor-pointer transition-all hover:border-[var(--color-border-strong)] hover:scale-[1.02]"
                onClick={() => navigate("/quality")}
              >
                <ScoreRing score={qualityScore} size={72} />
                <span className="text-[10px] text-[var(--color-text-muted)] uppercase font-semibold mt-2">Quality</span>
                <span className="text-[9px] mt-0.5" style={{ color: scoreColor(qualityScore) }}>
                  {quality?.totalIssues ?? 0} issues
                </span>
              </div>

              {/* Coupling */}
              <div
                className="rounded-xl border border-[var(--color-border-default)] bg-elevated p-4 flex flex-col items-center cursor-pointer transition-all hover:border-[var(--color-border-strong)] hover:scale-[1.02]"
                onClick={() => navigate("/quality")}
              >
                <ScoreRing score={couplingHealth} size={72} />
                <span className="text-[10px] text-[var(--color-text-muted)] uppercase font-semibold mt-2">Coupling</span>
                <span className="text-[9px] mt-0.5" style={{ color: scoreColor(couplingHealth) }}>
                  {coupling?.overallHealth?.avgInstability
                    ? `${(coupling.overallHealth.avgInstability * 100).toFixed(0)}% instability`
                    : "N/A"}
                </span>
              </div>

              {/* Security */}
              <div
                className="rounded-xl border border-[var(--color-border-default)] bg-elevated p-4 flex flex-col items-center cursor-pointer transition-all hover:border-[var(--color-border-strong)] hover:scale-[1.02]"
                onClick={() => navigate("/quality")}
              >
                <ScoreRing score={securityScore} size={72} />
                <span className="text-[10px] text-[var(--color-text-muted)] uppercase font-semibold mt-2">Security</span>
                <span className="text-[9px] mt-0.5" style={{ color: scoreColor(securityScore) }}>
                  {security?.totalIssues
                    ? `${security.totalIssues} vulnerabilit${security.totalIssues === 1 ? "y" : "ies"}`
                    : "No issues"}
                </span>
              </div>

              {/* Architecture Patterns */}
              <div
                className="rounded-xl border border-[var(--color-border-default)] bg-elevated p-4 flex flex-col items-center cursor-pointer transition-all hover:border-[var(--color-border-strong)] hover:scale-[1.02]"
                onClick={() => navigate("/quality")}
              >
                <ScoreRing score={patternCompliance} size={72} />
                <span className="text-[10px] text-[var(--color-text-muted)] uppercase font-semibold mt-2">Architecture</span>
                <span className="text-[9px] mt-0.5" style={{ color: scoreColor(patternCompliance) }}>
                  {quality?.architecturePatterns
                    ? `${quality.architecturePatterns.filter((p) => p.detected).length} patterns`
                    : "N/A"}
                </span>
              </div>
            </div>

            <InsightBox
              text={generateHealthInsight(quality as any, coupling as any, security as any)}
              color={qualityScore >= 70 ? "#34d399" : "#fbbf24"}
            />
          </>
        )}
      </CollapsibleSection>

      {/* ── Section 5: Where to Go Next ────────────────────────── */}
      <section>
        <div className="flex items-center gap-3 mb-4 px-1">
          <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-archlens-500/10 text-archlens-500 text-xs font-bold flex-shrink-0">
            5
          </div>
          <Compass className="h-5 w-5 text-archlens-500" />
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Where to Go Next</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            {
              title: "Explore Architecture",
              description: `Drill into ${model.stats.modules} modules, ${model.stats.files} files, and their connections`,
              icon: Layers,
              path: "/architecture",
              color: "#60a5fa",
            },
            {
              title: "Review Quality",
              description: `${quality?.totalIssues ?? "?"} issues to review, ${quality?.architecturePatterns?.filter((p) => p.detected).length ?? "?"} patterns detected`,
              icon: ShieldCheck,
              path: "/quality",
              color: "#34d399",
            },
            {
              title: "Trace Processes",
              description: `${processes.length} business flows to understand and trace end-to-end`,
              icon: Workflow,
              path: "/processes",
              color: "#a78bfa",
            },
            {
              title: "Check Events",
              description: `Explore event flows, bounded contexts, and async communication`,
              icon: Radio,
              path: "/events",
              color: "#fbbf24",
            },
          ].map((card) => (
            <button
              key={card.path}
              onClick={() => navigate(card.path)}
              className="group flex items-center gap-4 rounded-xl border p-4 text-left transition-all hover:scale-[1.01] hover:shadow-lg hover:shadow-black/20"
              style={{ borderColor: `${card.color}20`, background: `linear-gradient(135deg, ${card.color}04, transparent)` }}
            >
              <div
                className="flex items-center justify-center h-11 w-11 rounded-xl flex-shrink-0 transition-transform group-hover:scale-110"
                style={{ backgroundColor: `${card.color}12` }}
              >
                <card.icon className="h-5 w-5" style={{ color: card.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm text-[var(--color-text-primary)] group-hover:text-white transition-colors">
                  {card.title}
                </h3>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5 truncate">{card.description}</p>
              </div>
              <ArrowRight
                className="h-4 w-4 text-[var(--color-text-muted)] group-hover:text-[var(--color-text-secondary)] transition-all group-hover:translate-x-1 flex-shrink-0"
              />
            </button>
          ))}
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <div className="text-center text-[10px] text-[var(--color-text-muted)] pt-2 pb-4">
        ArchLens v{model.project.version} &middot; Analyzed {new Date(model.project.analyzedAt).toLocaleDateString()} &middot; {model.stats.totalLines.toLocaleString()} lines of code
      </div>
    </div>
  );
}
