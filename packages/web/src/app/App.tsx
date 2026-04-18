import { useEffect, useState } from "react";
import { Outlet, NavLink } from "react-router-dom";
import { useStore } from "../lib/store.js";
import {
  LayoutDashboard, Network, Database, GitBranch, Boxes, Cpu,
  Globe, Loader2, AlertCircle, Zap, Rocket, ShieldCheck, ShieldAlert, Settings, DollarSign, MessageSquare, Plus,
  Flame, GitCompare, ScrollText, FileText, Sparkles, Activity,
} from "lucide-react";
import { useTheme } from "../lib/theme.js";
import { useI18n } from "../lib/i18n.js";
import { GlobalSearch } from "../components/GlobalSearch.js";

interface NavGroup { labelKey: string; items: Array<{ to: string; icon: React.ElementType; labelKey: string; end?: boolean }> }

const navGroups: NavGroup[] = [
  { labelKey: "", items: [
    { to: "/", icon: LayoutDashboard, labelKey: "nav.dashboard", end: true },
    { to: "/architecture", icon: Network, labelKey: "nav.architecture" },
  ]},
  { labelKey: "nav.group.analysis", items: [
    { to: "/insights", icon: Sparkles, labelKey: "nav.insights" },
    { to: "/simulator", icon: Activity, labelKey: "nav.simulator" },
    { to: "/processes", icon: Zap, labelKey: "nav.processes" },
    { to: "/events", icon: MessageSquare, labelKey: "nav.event_flow" },
    { to: "/structure", icon: Boxes, labelKey: "nav.structure" },
    { to: "/stack", icon: Globe, labelKey: "nav.api_stack" },
  ]},
  { labelKey: "nav.group.quality", items: [
    { to: "/quality", icon: ShieldAlert, labelKey: "nav.code_quality" },
    { to: "/hotspots", icon: Flame, labelKey: "nav.hotspots" },
    { to: "/diff", icon: GitCompare, labelKey: "nav.diff" },
    { to: "/rules", icon: ScrollText, labelKey: "nav.rules" },
    { to: "/report", icon: FileText, labelKey: "nav.report" },
  ]},
  { labelKey: "", items: [
    { to: "/onboard", icon: Rocket, labelKey: "nav.onboarding" },
    { to: "/import", icon: Plus, labelKey: "nav.import" },
    { to: "/settings", icon: Settings, labelKey: "nav.settings" },
  ]},
];

export function App() {
  const { model, loading, error, projects, activeProject, fetchModel, fetchDiagrams, fetchProjects, switchProject } = useStore();
  const { theme } = useTheme();
  const { t } = useI18n();
  const [fileChange, setFileChange] = useState<{ file: string; ts: number } | null>(null);
  const [reanalyzing, setReanalyzing] = useState(false);

  useEffect(() => {
    fetchModel();
    fetchDiagrams();
    fetchProjects();
  }, [fetchModel, fetchDiagrams, fetchProjects]);

  // SSE: file watcher (re-subscribes when active project changes)
  useEffect(() => {
    const url = activeProject ? `/api/watch?project=${encodeURIComponent(activeProject)}` : "/api/watch";
    const es = new EventSource(url);
    es.addEventListener("change", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setFileChange({ file: data.file, ts: data.timestamp });
      } catch { /* ignore */ }
    });
    es.onerror = () => { /* silently ignore disconnects */ };
    return () => es.close();
  }, [activeProject]);

  const reanalyze = async () => {
    setReanalyzing(true);
    try {
      const url = activeProject
        ? `/api/reanalyze?project=${encodeURIComponent(activeProject)}`
        : "/api/reanalyze";
      const res = await fetch(url, { method: "POST" });
      if (res.ok) {
        // Reload the active project's model
        if (activeProject) {
          await switchProject(activeProject);
        } else {
          await fetchModel();
        }
        setFileChange(null);
      }
    } finally {
      setReanalyzing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[var(--color-void)] gap-4">
        <svg className="h-14 w-14 animate-pulse" viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="10" fill="#7c3aed"/>
          <path d="M9 15 L9 9 L15 9"  stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M25 9 L31 9 L31 15" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M9 25 L9 31 L15 31" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M25 31 L31 31 L31 25" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="20" cy="20" r="3" fill="white"/>
        </svg>
        <Loader2 className="h-4 w-4 animate-spin text-[var(--color-text-muted)]" />
        <p className="text-[var(--color-text-secondary)] font-medium text-sm">Loading architecture model</p>
        <p className="text-[var(--color-text-muted)] text-xs">Connecting to ArchLens server</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-void gap-4">
        <div className="h-16 w-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <AlertCircle className="h-8 w-8 text-red-500" />
        </div>
        <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">Connection Error</h2>
        <p className="text-[var(--color-text-muted)] text-sm">{error}</p>
        <div className="rounded-xl bg-surface border border-[var(--color-border-subtle)] p-4 text-left">
          <code className="text-archlens-400 text-xs block">archlens analyze .</code>
          <code className="text-archlens-400 text-xs block mt-1">archlens serve</code>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: theme.colors.void, color: theme.colors.textPrimary }}>
      {/* ── Sidebar ── */}
      <aside className="w-56 flex flex-col" style={{ backgroundColor: theme.colors.surface, borderRight: `1px solid ${theme.colors.borderSubtle}` }}>
        {/* Logo */}
        <div className="p-4 border-b border-[var(--color-border-subtle)]">
          <div className="flex items-center gap-2.5">
            <svg className="h-7 w-7" viewBox="0 0 40 40" fill="none" aria-label="ArchLens">
              <rect width="40" height="40" rx="10" fill="#7c3aed"/>
              <path d="M9 15 L9 9 L15 9"  stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M25 9 L31 9 L31 15" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M9 25 L9 31 L15 31" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M25 31 L31 31 L31 25" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="20" cy="20" r="3" fill="white"/>
            </svg>
            <h1 className="text-[15px] font-semibold tracking-tight">
              <span className="text-[var(--color-text-primary)]">Arch</span><span className="text-[var(--color-text-muted)]">Lens</span>
            </h1>
          </div>

          {/* Project Selector */}
          {projects.length > 1 ? (
            <select
              value={activeProject || model?.project.name || ""}
              onChange={(e) => switchProject(e.target.value)}
              className="mt-3 w-full rounded-lg bg-elevated border border-[var(--color-border-default)] px-2.5 py-1.5 text-xs font-mono text-archlens-300 outline-none cursor-pointer hover:border-archlens-500/40 transition-colors"
            >
              {projects.map((p, i) => (
                <option key={`${p.name}-${i}`} value={p.name}>{p.name} ({p.stats.files}f)</option>
              ))}
            </select>
          ) : model ? (
            <div className="mt-3 rounded-lg bg-elevated border border-[var(--color-border-default)] px-2.5 py-1.5">
              <p className="text-xs font-mono text-archlens-300 truncate">{model.project.name}</p>
            </div>
          ) : null}
        </div>

        {/* Global Search */}
        <div className="px-3 py-2 border-b border-[var(--color-border-subtle)]">
          <GlobalSearch />
        </div>

        {/* Nav — Grouped */}
        <nav className="flex-1 px-2 py-1 overflow-y-auto">
          {navGroups.map((group, gi) => (
            <div key={gi} className={group.labelKey ? "mt-3 mb-1" : "mb-0.5"}>
              {group.labelKey && (
                <div className="px-3 py-1 text-[9px] uppercase font-semibold tracking-wider text-[var(--color-text-muted)]">{t(group.labelKey)}</div>
              )}
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-200 ${
                      isActive
                        ? "bg-archlens-500/12 text-archlens-300 shadow-sm shadow-archlens-500/5 border-l-2 border-archlens-400"
                        : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-hover"
                    }`
                  }
                >
                  <item.icon className="h-3.5 w-3.5 flex-shrink-0" />
                  {t(item.labelKey)}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer Stats */}
        {model && (
          <div className="p-3 border-t border-[var(--color-border-subtle)]">
            <div className="grid grid-cols-2 gap-1.5 text-center">
              {[
                { v: model.stats.files, l: "files" },
                { v: model.stats.symbols, l: "symbols" },
                { v: model.stats.relations, l: "relations" },
                { v: model.stats.totalLines.toLocaleString(), l: "lines" },
              ].map((s) => (
                <div key={s.l} className="rounded-lg bg-elevated px-2 py-1.5">
                  <div className="text-sm font-semibold text-[var(--color-text-primary)]">{s.v}</div>
                  <div className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider">{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* ── Main Content ── */}
      <main className="flex-1 overflow-y-auto" style={{ backgroundColor: theme.colors.deep }}>
        <Outlet key={activeProject || "default"} />
      </main>

      {/* ── File Change Toast ── */}
      {fileChange && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl border border-archlens-500/30 bg-elevated shadow-2xl shadow-archlens-500/10 p-4 max-w-sm animate-slide-up">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-archlens-500/10 p-2">
              <AlertCircle className="h-4 w-4 text-archlens-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-[var(--color-text-primary)]">File changed</div>
              <div className="text-[10px] font-mono text-[var(--color-text-muted)] truncate">{fileChange.file}</div>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={reanalyze}
              disabled={reanalyzing}
              className="flex-1 px-3 py-1.5 rounded-md bg-archlens-500/15 border border-archlens-500/30 text-archlens-300 text-xs font-semibold hover:bg-archlens-500/25 disabled:opacity-50"
            >
              {reanalyzing ? "Re-analyzing..." : "Re-analyze"}
            </button>
            <button
              onClick={() => setFileChange(null)}
              className="px-3 py-1.5 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-xs"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
