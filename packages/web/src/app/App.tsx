import { useEffect } from "react";
import { Outlet, NavLink } from "react-router-dom";
import { useStore } from "../lib/store.js";
import {
  LayoutDashboard, Network, Database, GitBranch, Boxes, Cpu,
  Globe, Loader2, AlertCircle, Zap, Rocket, ShieldCheck, ShieldAlert, Settings,
} from "lucide-react";
import { useTheme } from "../lib/theme.js";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/architecture", icon: Network, label: "Architecture" },
  { to: "/processes", icon: Zap, label: "Business Processes" },
  { to: "/sequence", icon: GitBranch, label: "Sequence Diagrams" },
  { to: "/diagram/dependency-graph", icon: GitBranch, label: "Dependencies" },
  { to: "/diagram/er-diagram", icon: Database, label: "ER Diagram" },
  { to: "/endpoints", icon: Globe, label: "API Map" },
  { to: "/diagram/tech-radar", icon: Cpu, label: "Tech Radar" },
  { to: "/onboard", icon: Rocket, label: "Onboarding" },
  { to: "/quality", icon: ShieldAlert, label: "Code Quality" },
  { to: "/drift", icon: ShieldCheck, label: "Health Check" },
  { to: "/modules", icon: Boxes, label: "Modules" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function App() {
  const { model, loading, error, projects, activeProject, fetchModel, fetchDiagrams, fetchProjects, switchProject } = useStore();
  const { theme } = useTheme();

  useEffect(() => {
    fetchModel();
    fetchDiagrams();
    fetchProjects();
  }, [fetchModel, fetchDiagrams, fetchProjects]);

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

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-archlens-500/12 text-archlens-300 shadow-sm shadow-archlens-500/5 border-l-2 border-archlens-400 ml-0"
                    : "text-[#8888a0] hover:text-[#e4e4ed] hover:bg-hover"
                }`
              }
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              {item.label}
            </NavLink>
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
    </div>
  );
}
