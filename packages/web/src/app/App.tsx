import { useEffect } from "react";
import { Outlet, NavLink } from "react-router-dom";
import { useStore } from "../lib/store.js";
import {
  LayoutDashboard,
  Network,
  Database,
  GitBranch,
  Boxes,
  Cpu,
  Globe,
  Loader2,
  AlertCircle,
  Zap,
} from "lucide-react";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/architecture", icon: Network, label: "Architecture" },
  { to: "/processes", icon: Zap, label: "Business Processes" },
  { to: "/diagram/dependency-graph", icon: GitBranch, label: "Dependencies" },
  { to: "/diagram/er-diagram", icon: Database, label: "ER Diagram" },
  { to: "/api", icon: Globe, label: "API Map" },
  { to: "/diagram/tech-radar", icon: Cpu, label: "Tech Radar" },
  { to: "/modules", icon: Boxes, label: "Modules" },
];

export function App() {
  const { model, loading, error, fetchModel, fetchDiagrams } = useStore();

  useEffect(() => {
    fetchModel();
    fetchDiagrams();
  }, [fetchModel, fetchDiagrams]);

  if (loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-zinc-950 gap-4">
        <div className="relative">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-archlens-500 to-archlens-700 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
          </div>
        </div>
        <div className="text-center">
          <p className="text-zinc-300 font-medium">Loading architecture model...</p>
          <p className="text-zinc-600 text-sm mt-1">Connecting to ArchLens server</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-zinc-950 gap-4">
        <div className="h-16 w-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <AlertCircle className="h-8 w-8 text-red-500" />
        </div>
        <div className="text-center max-w-sm">
          <h2 className="text-xl font-bold text-white">Connection Error</h2>
          <p className="text-zinc-500 mt-2 text-sm">{error}</p>
          <div className="mt-4 rounded-lg bg-zinc-900 border border-zinc-800 p-3 text-left">
            <p className="text-zinc-400 text-xs mb-2">Run these commands first:</p>
            <code className="text-archlens-400 text-xs block">archlens analyze .</code>
            <code className="text-archlens-400 text-xs block mt-1">archlens serve</code>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-zinc-950 text-white overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 border-r border-zinc-800/50 flex flex-col bg-zinc-950">
        {/* Logo */}
        <div className="p-5 border-b border-zinc-800/50">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-archlens-500 to-archlens-700 flex items-center justify-center">
              <Network className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight">
                <span className="text-archlens-400">Arch</span>
                <span className="text-white">Lens</span>
              </h1>
            </div>
          </div>
          {model && (
            <div className="mt-3 rounded-md bg-zinc-900/50 border border-zinc-800/50 px-2.5 py-1.5">
              <p className="text-xs font-mono text-archlens-400 truncate">{model.project.name}</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all ${
                  isActive
                    ? "bg-archlens-500/10 text-archlens-400 shadow-sm shadow-archlens-500/5"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
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
          <div className="p-4 border-t border-zinc-800/50">
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-md bg-zinc-900/50 px-2 py-1.5">
                <div className="text-sm font-bold text-zinc-300">{model.stats.files}</div>
                <div className="text-[10px] text-zinc-600">files</div>
              </div>
              <div className="rounded-md bg-zinc-900/50 px-2 py-1.5">
                <div className="text-sm font-bold text-zinc-300">{model.stats.symbols}</div>
                <div className="text-[10px] text-zinc-600">symbols</div>
              </div>
              <div className="rounded-md bg-zinc-900/50 px-2 py-1.5">
                <div className="text-sm font-bold text-zinc-300">{model.stats.relations}</div>
                <div className="text-[10px] text-zinc-600">relations</div>
              </div>
              <div className="rounded-md bg-zinc-900/50 px-2 py-1.5">
                <div className="text-sm font-bold text-zinc-300">{model.stats.totalLines.toLocaleString()}</div>
                <div className="text-[10px] text-zinc-600">lines</div>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
