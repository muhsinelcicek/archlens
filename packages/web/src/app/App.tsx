import { useEffect } from "react";
import { Outlet, NavLink } from "react-router-dom";
import { useStore } from "../lib/store.js";
import {
  LayoutDashboard,
  Network,
  Database,
  Globe,
  Boxes,
  Cpu,
  Loader2,
  AlertCircle,
} from "lucide-react";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/diagram/system-architecture", icon: Network, label: "Architecture" },
  { to: "/diagram/er-diagram", icon: Database, label: "ER Diagram" },
  { to: "/diagram/data-flow", icon: Globe, label: "Data Flow" },
  { to: "/diagram/dependency-graph", icon: Boxes, label: "Dependencies" },
  { to: "/diagram/tech-radar", icon: Cpu, label: "Tech Radar" },
  { to: "/modules", icon: Boxes, label: "Modules" },
  { to: "/api", icon: Globe, label: "API Map" },
];

export function App() {
  const { model, loading, error, fetchModel, fetchDiagrams } = useStore();

  useEffect(() => {
    fetchModel();
    fetchDiagrams();
  }, [fetchModel, fetchDiagrams]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <Loader2 className="h-8 w-8 animate-spin text-archlens-500" />
        <span className="ml-3 text-lg text-zinc-400">Loading architecture model...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-zinc-950 text-white">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-xl font-bold mb-2">Connection Error</h2>
        <p className="text-zinc-400 mb-4">{error}</p>
        <p className="text-zinc-500 text-sm">
          Run <code className="bg-zinc-800 px-2 py-1 rounded">archlens analyze</code> then{" "}
          <code className="bg-zinc-800 px-2 py-1 rounded">archlens serve</code>
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-zinc-950 text-white">
      {/* Sidebar */}
      <aside className="w-64 border-r border-zinc-800 flex flex-col">
        <div className="p-4 border-b border-zinc-800">
          <h1 className="text-xl font-bold tracking-tight">
            <span className="text-archlens-500">Arch</span>Lens
          </h1>
          {model && (
            <p className="text-xs text-zinc-500 mt-1">{model.project.name}</p>
          )}
        </div>

        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-archlens-500/10 text-archlens-400"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {model && (
          <div className="p-4 border-t border-zinc-800 text-xs text-zinc-500 space-y-1">
            <div>{model.stats.files} files</div>
            <div>{model.stats.symbols} symbols</div>
            <div>{model.stats.totalLines.toLocaleString()} lines</div>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
