import { useEffect, useState } from "react";
import { Outlet, NavLink } from "react-router-dom";
import { useStore } from "../lib/store.js";
import {
  LayoutDashboard, Network, Database, GitBranch, Boxes, Cpu,
  Globe, Loader2, AlertCircle, Zap, Rocket, ShieldCheck, ShieldAlert, Settings, DollarSign, MessageSquare, Plus,
  Flame, GitCompare, ScrollText, FileText, Sparkles,
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

  // SSE: file watcher
  useEffect(() => {
    const es = new EventSource("/api/watch");
    es.addEventListener("change", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setFileChange({ file: data.file, ts: data.timestamp });
      } catch { /* ignore */ }
    });
    es.onerror = () => { /* silently ignore disconnects */ };
    return () => es.close();
  }, []);

  const reanalyze = async () => {
    setReanalyzing(true);
    try {
      const res = await fetch("/api/reanalyze", { method: "POST" });
      if (res.ok) {
        await fetchModel();
        setFileChange(null);
      }
    } finally {
      setReanalyzing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-void gap-4">
        <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-archlens-400 to-archlens-700 flex items-center justify-center animate-glow-pulse">
          <Loader2 className="h-8 w-8 animate-spin text-white" />
        </div>
        <p className="text-[#8888a0] font-medium">Loading architecture model...</p>
        <p className="text-[#5a5a70] text-sm">Connecting to ArchLens server</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-void gap-4">
        <div className="h-16 w-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <AlertCircle className="h-8 w-8 text-red-500" />
        </div>
        <h2 className="text-xl font-semibold text-[#e4e4ed]">Connection Error</h2>
        <p className="text-[#5a5a70] text-sm">{error}</p>
        <div className="rounded-xl bg-surface border border-[#1e1e2a] p-4 text-left">
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
        <div className="p-4 border-b border-[#1e1e2a]">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-archlens-400 to-archlens-700 flex items-center justify-center shadow-lg shadow-archlens-500/20">
              <Network className="h-4 w-4 text-white" />
            </div>
            <h1 className="text-base font-semibold tracking-tight">
              <span className="text-archlens-400">Arch</span><span className="text-[#e4e4ed]">Lens</span>
            </h1>
          </div>

          {/* Project Selector */}
          {projects.length > 1 ? (
            <select
              value={activeProject || model?.project.name || ""}
              onChange={(e) => switchProject(e.target.value)}
              className="mt-3 w-full rounded-lg bg-elevated border border-[#2a2a3a] px-2.5 py-1.5 text-xs font-mono text-archlens-300 outline-none cursor-pointer hover:border-archlens-500/40 transition-colors"
            >
              {projects.map((p, i) => (
                <option key={`${p.name}-${i}`} value={p.name}>{p.name} ({p.stats.files}f)</option>
              ))}
            </select>
          ) : model ? (
            <div className="mt-3 rounded-lg bg-elevated border border-[#2a2a3a] px-2.5 py-1.5">
              <p className="text-xs font-mono text-archlens-300 truncate">{model.project.name}</p>
            </div>
          ) : null}
        </div>

        {/* Global Search */}
        <div className="px-3 py-2 border-b border-[#1e1e2a]">
          <GlobalSearch />
        </div>

        {/* Nav — Grouped */}
        <nav className="flex-1 px-2 py-1 overflow-y-auto">
          {navGroups.map((group, gi) => (
            <div key={gi} className={group.labelKey ? "mt-3 mb-1" : "mb-0.5"}>
              {group.labelKey && (
                <div className="px-3 py-1 text-[9px] uppercase font-semibold tracking-wider text-[#5a5a70]">{t(group.labelKey)}</div>
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
                        : "text-[#8888a0] hover:text-[#e4e4ed] hover:bg-hover"
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
          <div className="p-3 border-t border-[#1e1e2a]">
            <div className="grid grid-cols-2 gap-1.5 text-center">
              {[
                { v: model.stats.files, l: "files" },
                { v: model.stats.symbols, l: "symbols" },
                { v: model.stats.relations, l: "relations" },
                { v: model.stats.totalLines.toLocaleString(), l: "lines" },
              ].map((s) => (
                <div key={s.l} className="rounded-lg bg-elevated px-2 py-1.5">
                  <div className="text-sm font-semibold text-[#e4e4ed]">{s.v}</div>
                  <div className="text-[9px] text-[#5a5a70] uppercase tracking-wider">{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* ── Main Content ── */}
      <main className="flex-1 overflow-y-auto" style={{ backgroundColor: theme.colors.deep }}>
        <Outlet />
      </main>

      {/* ── File Change Toast ── */}
      {fileChange && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl border border-archlens-500/30 bg-elevated shadow-2xl shadow-archlens-500/10 p-4 max-w-sm animate-slide-up">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-archlens-500/10 p-2">
              <AlertCircle className="h-4 w-4 text-archlens-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-[#e4e4ed]">File changed</div>
              <div className="text-[10px] font-mono text-[#5a5a70] truncate">{fileChange.file}</div>
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
              className="px-3 py-1.5 rounded-md text-[#5a5a70] hover:text-[#e4e4ed] text-xs"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
