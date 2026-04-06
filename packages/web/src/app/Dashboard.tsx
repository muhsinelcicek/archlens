import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../lib/store.js";
import { useI18n } from "../lib/i18n.js";
import { StatCard } from "../components/StatCard.js";
import { LanguageBar } from "../components/LanguageBar.js";
import {
  Files, Code2, GitBranch, Boxes, Database, Globe, Cpu, Layers,
  ShieldCheck, Skull, AlertTriangle, DollarSign, Activity,
  ArrowRight, ExternalLink, ChevronRight,
} from "lucide-react";

/* ─── Types for API responses ──────────────────────────────── */

interface QualityIssue {
  id: string; rule: string; category: string; severity: string;
  message: string; filePath: string; symbolRef?: string; line?: number; suggestion?: string;
}
interface ModuleQuality {
  moduleName: string; score: number;
  issues: QualityIssue[];
  metrics: { totalSymbols: number; avgComplexity: number; maxMethodLines: number; godClasses: number; namingViolations: number; typeUnsafe: number; patternViolations: number };
}
interface QualityReport {
  projectScore: number; totalIssues: number;
  bySeverity: Record<string, number>; byCategory: Record<string, number>;
  modules: ModuleQuality[]; architecturePatterns: Array<{ pattern: string; detected: boolean; compliance: number; violations: string[]; recommendations: string[] }>;
  topIssues: QualityIssue[];
}
interface CouplingReport {
  overallHealth: { avgInstability: number; avgAbstractness: number; avgDistance: number; circularCount: number; concreteRatio: number };
  circularDependencies: Array<{ cycle: string[]; level: string; description: string }>;
  modules: Array<{ moduleName: string; afferentCoupling: number; efferentCoupling: number; instability: number }>;
}
interface SecurityReport {
  totalIssues: number;
  bySeverity: Record<string, number>;
  issues: Array<{ id: string; severity: string; title: string; description: string; filePath: string; line: number; recommendation: string }>;
  score: number;
}
interface DeadCodeReport {
  totalDead: number; totalSymbols: number; deadPercentage: number;
  items: Array<{ uid: string; name: string; kind: string; filePath: string; line: number; reason: string; confidence: string }>;
  byModule: Array<{ module: string; count: number }>;
  estimatedCleanupLines: number;
}
interface TechDebtReport {
  totalEstimatedHours: number; totalEstimatedCost: number; totalAnnualCost: number;
  items: Array<{ category: string; description: string; estimatedCost: number; effort: string; severity: string }>;
  quickWins: Array<{ category: string; description: string; estimatedCost: number }>;
}

/* ─── Action item from combined analysis ───────────────────── */

interface ActionItem {
  severity: "critical" | "major" | "warning" | "info";
  message: string;
  module?: string;
  link: string;
}

/* ─── Layer config ─────────────────────────────────────────── */

const layerConfig: Record<string, { color: string; bg: string; icon: string }> = {
  presentation: { color: "#10b981", bg: "#10b98115", icon: "UI" },
  api: { color: "#3b82f6", bg: "#3b82f615", icon: "API" },
  application: { color: "#f59e0b", bg: "#f59e0b15", icon: "APP" },
  domain: { color: "#8b5cf6", bg: "#8b5cf615", icon: "DOM" },
  infrastructure: { color: "#ef4444", bg: "#ef444415", icon: "INF" },
  config: { color: "#6b7280", bg: "#6b728015", icon: "CFG" },
};

/* ─── Severity styling ─────────────────────────────────────── */

const severityStyles: Record<string, { color: string; bg: string; label: string }> = {
  critical: { color: "#ef4444", bg: "#ef444420", label: "Critical" },
  major: { color: "#f97316", bg: "#f9731620", label: "Major" },
  warning: { color: "#fbbf24", bg: "#fbbf2420", label: "Warning" },
  info: { color: "#60a5fa", bg: "#60a5fa20", label: "Info" },
};

/* ─── Helper: build action items ───────────────────────────── */

function buildActionItems(
  quality: QualityReport | null,
  coupling: CouplingReport | null,
  security: SecurityReport | null,
  deadcode: DeadCodeReport | null,
  techDebt: TechDebtReport | null,
): ActionItem[] {
  const items: ActionItem[] = [];

  // Security critical issues
  if (security && security.bySeverity?.critical > 0) {
    for (const issue of security.issues.filter((i) => i.severity === "critical").slice(0, 2)) {
      items.push({
        severity: "critical",
        message: `Security: ${issue.title} in ${issue.filePath.split("/").pop()}`,
        link: "/quality?tab=health",
      });
    }
  }

  // God classes and worst quality modules
  if (quality?.modules) {
    const worst = [...quality.modules].sort((a, b) => a.score - b.score);
    for (const mod of worst.slice(0, 2)) {
      if (mod.score < 50) {
        const godCount = mod.metrics.godClasses;
        const msg = godCount > 0
          ? `God class with ${mod.metrics.maxMethodLines} LOC in ${mod.moduleName}`
          : `Low quality score (${mod.score}/100) in ${mod.moduleName}`;
        items.push({
          severity: mod.score < 30 ? "critical" : "major",
          message: msg,
          module: mod.moduleName,
          link: "/quality",
        });
      }
    }
  }

  // Circular dependencies
  if (coupling?.circularDependencies) {
    for (const circ of coupling.circularDependencies.slice(0, 2)) {
      const names = (circ.cycle || []).join(" <-> ");
      items.push({
        severity: "warning",
        message: `Circular dependency: ${names}`,
        link: "/quality?tab=coupling",
      });
    }
  }

  // High instability modules
  if (coupling?.modules) {
    const unstable = coupling.modules.filter((m: any) => m.instability > 0.8);
    if (unstable.length > 0) {
      items.push({
        severity: "warning",
        message: `${unstable.length} module(s) with very high instability (>0.8)`,
        link: "/quality?tab=coupling",
      });
    }
  }

  // Dead code
  if (deadcode && deadcode.totalDead > 20) {
    items.push({
      severity: "warning",
      message: `${deadcode.totalDead} unused symbols (~${deadcode.estimatedCleanupLines.toLocaleString()} lines to clean)`,
      link: "/quality?tab=health",
    });
  }

  // Tech debt quick wins
  if (techDebt?.quickWins && techDebt.quickWins.length > 0) {
    items.push({
      severity: "info",
      message: `${techDebt.quickWins.length} quick-win refactoring opportunities ($${(techDebt.quickWins.reduce((a: number, i: any) => a + (i.estimatedCost || 0), 0) / 1000).toFixed(1)}k savings)`,
      link: "/quality?tab=debt",
    });
  }

  // Critical quality issues from topIssues
  if (quality?.topIssues) {
    for (const issue of quality.topIssues.filter((i) => i.severity === "critical").slice(0, 2)) {
      if (!items.some((a) => a.message.includes(issue.message.substring(0, 30)))) {
        items.push({
          severity: "critical",
          message: issue.message,
          module: issue.filePath.split("/")[0],
          link: "/quality",
        });
      }
    }
  }

  return items.slice(0, 8);
}

/* ─── Health bar color helpers ─────────────────────────────── */

function scoreColor(score: number): string {
  if (score >= 80) return "#34d399";
  if (score >= 60) return "#fbbf24";
  if (score >= 40) return "#f97316";
  return "#ef4444";
}

function scoreLabel(score: number): string {
  if (score >= 80) return "Healthy";
  if (score >= 60) return "Moderate";
  if (score >= 40) return "Needs Work";
  return "At Risk";
}

/* ─── Circular Score Ring ──────────────────────────────────── */

function ScoreRing({ score, size = 96 }: { score: number; size?: number }) {
  const color = scoreColor(score);
  const r = (size - 8) / 2;
  const circumference = 2 * Math.PI * r;
  const dashLen = (score / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1e1e2a" strokeWidth="6" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={`${dashLen} ${circumference}`} strokeLinecap="round"
          className="transition-all duration-1000"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold" style={{ color }}>{score}</span>
        <span className="text-[10px] text-[#5a5a70] uppercase font-semibold">/100</span>
      </div>
    </div>
  );
}

/* ─── Health bar row ───────────────────────────────────────── */

function HealthBar({ label, value, max, color, suffix, icon }: {
  label: string; value: number; max: number; color: string; suffix?: string; icon: React.ReactNode;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center justify-center w-8 h-8 rounded-lg" style={{ backgroundColor: `${color}15` }}>
        <span style={{ color }}>{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-[#e4e4ed]">{label}</span>
          <span className="text-xs font-bold tabular-nums" style={{ color }}>
            {suffix || `${value}/${max}`}
          </span>
        </div>
        <div className="h-2 rounded-full bg-[#1e1e2a] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Dashboard Component
   ═══════════════════════════════════════════════════════════════ */

export function Dashboard() {
  const { model } = useStore();
  const { t } = useI18n();
  const navigate = useNavigate();

  const [quality, setQuality] = useState<QualityReport | null>(null);
  const [coupling, setCoupling] = useState<CouplingReport | null>(null);
  const [security, setSecurity] = useState<SecurityReport | null>(null);
  const [deadcode, setDeadcode] = useState<DeadCodeReport | null>(null);
  const [techDebt, setTechDebt] = useState<TechDebtReport | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/quality").then((r) => r.ok ? r.json() : null),
      fetch("/api/coupling").then((r) => r.ok ? r.json() : null),
      fetch("/api/security").then((r) => r.ok ? r.json() : null),
      fetch("/api/deadcode").then((r) => r.ok ? r.json() : null),
      fetch("/api/techdebt").then((r) => r.ok ? r.json() : null),
    ]).then(([q, c, s, d, td]) => {
      if (q) setQuality(q);
      if (c) setCoupling(c);
      if (s) setSecurity(s);
      if (d) setDeadcode(d);
      if (td) setTechDebt(td);
      setHealthLoading(false);
    }).catch(() => setHealthLoading(false));
  }, []);

  if (!model) return null;

  const { stats, modules, apiEndpoints, dbEntities, techRadar } = model;

  // Derived health values
  const qualityScore = quality?.projectScore ?? 0;
  const couplingHealth = coupling?.overallHealth
    ? Math.max(0, 100 - Math.round(coupling.overallHealth.avgInstability * 60) - coupling.overallHealth.circularCount * 10)
    : 0;
  const securityIssues = security?.totalIssues ?? 0;
  const securityScore = security?.score ?? 100;
  const deadCount = deadcode?.totalDead ?? 0;
  const debtCost = techDebt?.totalEstimatedCost ?? 0;

  const actionItems = buildActionItems(quality, coupling, security, deadcode, techDebt);

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-[1400px]">

      {/* ── Section 1: Project Health at a Glance ─────────────── */}
      <div className="flex items-start gap-6">
        {/* Left: Project info + health ring */}
        <div className="flex-1">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">{model.project.name}</h2>
              <p className="text-[#5a5a70] text-sm mt-1">
                {t("dashboard.title")} / {new Date(model.project.analyzedAt).toLocaleDateString("tr-TR")}
              </p>
            </div>
            <div className="text-right text-xs text-[#5a5a70]">
              <div>ArchLens v{model.project.version}</div>
              <div className="font-mono">{model.project.rootPath}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Health Score + Stats */}
      <div className="flex gap-6">
        {/* Circular health score */}
        {!healthLoading && quality && (
          <div
            className="rounded-xl border border-[#2a2a3a] bg-elevated p-5 backdrop-blur-sm flex flex-col items-center justify-center cursor-pointer hover:border-[#3a3a4a] transition-colors"
            onClick={() => navigate("/quality")}
          >
            <ScoreRing score={qualityScore} size={100} />
            <div className="mt-2 text-xs font-semibold uppercase text-[#5a5a70]">Health Score</div>
            <div className="text-xs font-medium mt-0.5" style={{ color: scoreColor(qualityScore) }}>
              {scoreLabel(qualityScore)}
            </div>
          </div>
        )}

        {/* Key metric cards */}
        <div className="flex-1 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label={t("dashboard.files")} value={stats.files}
              icon={<Files className="h-5 w-5" style={{ color: "#10b981" }} />}
              color="#10b981" borderColor="#10b98130"
            />
            <StatCard
              label={t("dashboard.symbols")} value={stats.symbols}
              icon={<Code2 className="h-5 w-5" style={{ color: "#3b82f6" }} />}
              color="#3b82f6" borderColor="#3b82f630"
            />
            <StatCard
              label={t("dashboard.relations")} value={stats.relations}
              icon={<GitBranch className="h-5 w-5" style={{ color: "#8b5cf6" }} />}
              color="#8b5cf6" borderColor="#8b5cf630"
            />
            <StatCard
              label={t("dashboard.lines")} value={stats.totalLines}
              icon={<Code2 className="h-5 w-5" style={{ color: "#f59e0b" }} />}
              color="#f59e0b" borderColor="#f59e0b30"
            />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label={t("dashboard.modules")} value={stats.modules}
              icon={<Boxes className="h-5 w-5" style={{ color: "#06b6d4" }} />}
              color="#06b6d4" borderColor="#06b6d430"
            />
            <StatCard
              label={t("dashboard.endpoints")} value={apiEndpoints.length}
              icon={<Globe className="h-5 w-5" style={{ color: "#10b981" }} />}
              color="#10b981" borderColor="#10b98130"
            />
            <StatCard
              label={t("dashboard.entities")} value={dbEntities.length}
              icon={<Database className="h-5 w-5" style={{ color: "#ef4444" }} />}
              color="#ef4444" borderColor="#ef444430"
            />
            <StatCard
              label={t("dashboard.tech_stack")} value={techRadar.length}
              icon={<Cpu className="h-5 w-5" style={{ color: "#fbbf24" }} />}
              color="#fbbf24" borderColor="#fbbf2430"
            />
          </div>
        </div>
      </div>

      {/* ── Section 2: Health Pulse ───────────────────────────── */}
      <section className="rounded-xl border border-[#2a2a3a] bg-elevated p-6 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-5">
          <Activity className="h-4 w-4 text-[#5a5a70]" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[#8888a0]">Health Pulse</h3>
        </div>

        {healthLoading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 bg-[#1e1e2a] rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <HealthBar
              label="Quality Score"
              value={qualityScore}
              max={100}
              color={scoreColor(qualityScore)}
              suffix={`${qualityScore}/100`}
              icon={<ShieldCheck className="h-4 w-4" />}
            />
            <HealthBar
              label="Coupling Health"
              value={couplingHealth}
              max={100}
              color={scoreColor(couplingHealth)}
              suffix={`${couplingHealth}/100`}
              icon={<GitBranch className="h-4 w-4" />}
            />
            <HealthBar
              label="Security"
              value={securityScore}
              max={100}
              color={securityIssues === 0 ? "#34d399" : securityIssues <= 5 ? "#fbbf24" : "#ef4444"}
              suffix={securityIssues === 0 ? "No issues" : `${securityIssues} vulnerabilities`}
              icon={<AlertTriangle className="h-4 w-4" />}
            />
            <HealthBar
              label="Dead Code"
              value={Math.max(0, 100 - (deadcode?.deadPercentage ?? 0))}
              max={100}
              color={deadCount < 5 ? "#34d399" : deadCount < 20 ? "#fbbf24" : "#ef4444"}
              suffix={`${deadCount} unused symbols`}
              icon={<Skull className="h-4 w-4" />}
            />
            <HealthBar
              label="Tech Debt"
              value={Math.max(0, 100 - Math.min(100, debtCost / 1000))}
              max={100}
              color={debtCost < 10000 ? "#34d399" : debtCost < 50000 ? "#fbbf24" : "#ef4444"}
              suffix={debtCost > 1000 ? `$${(debtCost / 1000).toFixed(1)}k estimated` : `$${debtCost} estimated`}
              icon={<DollarSign className="h-4 w-4" />}
            />
          </div>
        )}
      </section>

      {/* ── Section 3: Top Issues / Action Items ──────────────── */}
      {!healthLoading && actionItems.length > 0 && (
        <section className="rounded-xl border border-[#2a2a3a] bg-elevated p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[#5a5a70]" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-[#8888a0]">What to Focus On</h3>
            </div>
            <span className="text-xs text-[#5a5a70]">{actionItems.length} items</span>
          </div>

          <div className="space-y-2">
            {actionItems.map((item, idx) => {
              const style = severityStyles[item.severity] || severityStyles.info;
              return (
                <div
                  key={idx}
                  className="group flex items-center gap-3 rounded-lg border border-[#2a2a3a] p-3 cursor-pointer transition-all hover:border-[#3a3a4a] hover:bg-hover"
                  onClick={() => navigate(item.link)}
                >
                  {/* Severity badge */}
                  <span
                    className="flex-shrink-0 text-[10px] font-bold uppercase rounded-full px-2.5 py-1"
                    style={{ backgroundColor: style.bg, color: style.color }}
                  >
                    {style.label}
                  </span>

                  {/* Message */}
                  <span className="flex-1 text-sm text-[#e4e4ed] truncate">{item.message}</span>

                  {/* Module badge */}
                  {item.module && (
                    <span className="text-[10px] text-[#5a5a70] font-mono bg-[#1e1e2a] rounded px-2 py-0.5">
                      {item.module}
                    </span>
                  )}

                  {/* Navigate arrow */}
                  <ChevronRight className="h-4 w-4 text-[#5a5a70] group-hover:text-[#8888a0] transition-colors flex-shrink-0" />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Section 4: Architecture Overview (compact, clickable) ─ */}
      <section className="rounded-xl border border-[#2a2a3a] bg-elevated p-6 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-[#5a5a70]" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[#8888a0]">{t("dashboard.arch_layers")}</h3>
          </div>
          <button
            className="flex items-center gap-1 text-xs text-[#5a5a70] hover:text-[#8888a0] transition-colors"
            onClick={() => navigate("/architecture")}
          >
            View full architecture <ExternalLink className="h-3 w-3" />
          </button>
        </div>

        <div className="space-y-2">
          {["presentation", "api", "application", "domain", "infrastructure", "config"].map((layer) => {
            const mods = modules.filter((m) => m.layer === layer);
            if (mods.length === 0) return null;
            const config = layerConfig[layer] || layerConfig.config;
            const totalLines = mods.reduce((a, m) => a + m.lineCount, 0);
            const pct = (totalLines / stats.totalLines) * 100;

            return (
              <div
                key={layer}
                className="group cursor-pointer"
                onClick={() => navigate("/architecture")}
              >
                <div
                  className="flex items-center gap-3 rounded-lg border p-3 transition-all hover:shadow-lg hover:scale-[1.005]"
                  style={{ borderColor: `${config.color}30`, backgroundColor: config.bg }}
                >
                  {/* Layer badge */}
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-md text-[10px] font-bold"
                    style={{ backgroundColor: `${config.color}25`, color: config.color }}
                  >
                    {config.icon}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium capitalize text-sm text-[#e4e4ed]">{layer}</span>
                      <span
                        className="text-[10px] font-bold rounded-full px-2 py-0.5"
                        style={{ backgroundColor: `${config.color}20`, color: config.color }}
                      >
                        {mods.length} {mods.length === 1 ? "module" : "modules"}
                      </span>
                    </div>
                    {/* Module chips */}
                    <div className="flex flex-wrap gap-1 mt-1">
                      {mods.slice(0, 6).map((mod) => (
                        <span
                          key={mod.name}
                          className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono"
                          style={{ backgroundColor: `${config.color}10`, color: config.color }}
                        >
                          {mod.name}/
                        </span>
                      ))}
                      {mods.length > 6 && (
                        <span className="text-[10px] text-[#5a5a70]">+{mods.length - 6} more</span>
                      )}
                    </div>
                  </div>

                  {/* Bar + line count */}
                  <div className="hidden sm:flex items-center gap-3 w-36">
                    <div className="flex-1 h-1.5 rounded-full bg-[#1e1e2a] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, backgroundColor: config.color }}
                      />
                    </div>
                    <span className="text-xs text-[#5a5a70] w-12 text-right tabular-nums">
                      {totalLines.toLocaleString()}
                    </span>
                  </div>

                  <ArrowRight className="h-4 w-4 text-[#5a5a70] opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Section 5: Language Distribution ───────────────────── */}
      <section className="rounded-xl border border-[#2a2a3a] bg-elevated p-6 backdrop-blur-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[#8888a0] mb-4">{t("dashboard.languages")}</h3>
        <LanguageBar languages={stats.languages} totalSymbols={stats.symbols} />
      </section>
    </div>
  );
}
