import { useStore } from "../lib/store.js";
import { StatCard } from "../components/StatCard.js";
import { LanguageBar } from "../components/LanguageBar.js";
import {
  Files, Code2, GitBranch, Boxes, Database, Globe, Cpu, Layers,
} from "lucide-react";

const layerConfig: Record<string, { color: string; bg: string; icon: string }> = {
  presentation: { color: "#10b981", bg: "#10b98115", icon: "UI" },
  api: { color: "#3b82f6", bg: "#3b82f615", icon: "API" },
  application: { color: "#f59e0b", bg: "#f59e0b15", icon: "APP" },
  domain: { color: "#8b5cf6", bg: "#8b5cf615", icon: "DOM" },
  infrastructure: { color: "#ef4444", bg: "#ef444415", icon: "INF" },
  config: { color: "#6b7280", bg: "#6b728015", icon: "CFG" },
};

export function Dashboard() {
  const { model } = useStore();
  if (!model) return null;

  const { stats, modules, apiEndpoints, dbEntities, techRadar } = model;

  const sortedModules = [...modules].sort((a, b) => b.lineCount - a.lineCount);

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{model.project.name}</h2>
          <p className="text-[#5a5a70] text-sm mt-1">
            Architecture analysis / {new Date(model.project.analyzedAt).toLocaleDateString("tr-TR")}
          </p>
        </div>
        <div className="text-right text-xs text-[#5a5a70]">
          <div>ArchLens v{model.project.version}</div>
          <div className="font-mono">{model.project.rootPath}</div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Files" value={stats.files}
          icon={<Files className="h-5 w-5" style={{ color: "#10b981" }} />}
          color="#10b981" borderColor="#10b98130"
        />
        <StatCard
          label="Symbols" value={stats.symbols}
          icon={<Code2 className="h-5 w-5" style={{ color: "#3b82f6" }} />}
          color="#3b82f6" borderColor="#3b82f630"
        />
        <StatCard
          label="Relations" value={stats.relations}
          icon={<GitBranch className="h-5 w-5" style={{ color: "#8b5cf6" }} />}
          color="#8b5cf6" borderColor="#8b5cf630"
        />
        <StatCard
          label="Lines of Code" value={stats.totalLines}
          icon={<Code2 className="h-5 w-5" style={{ color: "#f59e0b" }} />}
          color="#f59e0b" borderColor="#f59e0b30"
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Modules" value={stats.modules}
          icon={<Boxes className="h-5 w-5" style={{ color: "#06b6d4" }} />}
          color="#06b6d4" borderColor="#06b6d430"
        />
        <StatCard
          label="API Endpoints" value={apiEndpoints.length}
          icon={<Globe className="h-5 w-5" style={{ color: "#10b981" }} />}
          color="#10b981" borderColor="#10b98130"
        />
        <StatCard
          label="DB Entities" value={dbEntities.length}
          icon={<Database className="h-5 w-5" style={{ color: "#ef4444" }} />}
          color="#ef4444" borderColor="#ef444430"
        />
        <StatCard
          label="Tech Stack" value={techRadar.length}
          icon={<Cpu className="h-5 w-5" style={{ color: "#fbbf24" }} />}
          color="#fbbf24" borderColor="#fbbf2430"
        />
      </div>

      {/* Languages */}
      <section className="rounded-xl border border-[#2a2a3a] bg-elevated p-6 backdrop-blur-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[#8888a0] mb-4">Languages</h3>
        <LanguageBar languages={stats.languages} totalSymbols={stats.symbols} />
      </section>

      {/* Architecture Layers — Visual Stack */}
      <section className="rounded-xl border border-[#2a2a3a] bg-elevated p-6 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-5">
          <Layers className="h-4 w-4 text-[#5a5a70]" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[#8888a0]">Architecture Layers</h3>
        </div>

        <div className="space-y-2">
          {["presentation", "api", "application", "domain", "infrastructure", "config"].map((layer) => {
            const mods = modules.filter((m) => m.layer === layer);
            if (mods.length === 0) return null;
            const config = layerConfig[layer] || layerConfig.config;
            const totalLines = mods.reduce((a, m) => a + m.lineCount, 0);
            const pct = (totalLines / stats.totalLines) * 100;

            return (
              <div key={layer} className="group">
                <div
                  className="flex items-center gap-3 rounded-lg border p-3 transition-all hover:shadow-lg"
                  style={{ borderColor: `${config.color}30`, backgroundColor: config.bg }}
                >
                  {/* Layer badge */}
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-md text-xs font-bold"
                    style={{ backgroundColor: `${config.color}25`, color: config.color }}
                  >
                    {config.icon}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium capitalize text-[#e4e4ed]">{layer}</span>
                      <span className="text-xs text-[#5a5a70]">{mods.length} modules</span>
                    </div>
                    {/* Modules */}
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {mods.map((mod) => (
                        <span
                          key={mod.name}
                          className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-mono"
                          style={{ backgroundColor: `${config.color}15`, color: config.color }}
                        >
                          {mod.name}/
                          <span className="ml-1 text-[#5a5a70]">{mod.fileCount}f</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Bar */}
                  <div className="hidden sm:flex items-center gap-3 w-40">
                    <div className="flex-1 h-1.5 rounded-full bg-elevated overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, backgroundColor: config.color }}
                      />
                    </div>
                    <span className="text-xs text-[#5a5a70] w-12 text-right tabular-nums">
                      {totalLines.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Modules Detail Grid */}
      <section className="rounded-xl border border-[#2a2a3a] bg-elevated p-6 backdrop-blur-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[#8888a0] mb-4">Modules</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sortedModules.map((mod) => {
            const config = layerConfig[mod.layer] || layerConfig.config;
            return (
              <div
                key={mod.name}
                className="group relative rounded-xl border p-4 transition-all hover:scale-[1.01] hover:shadow-lg"
                style={{ borderColor: `${config.color}20` }}
              >
                <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: `radial-gradient(circle at top right, ${config.color}08, transparent 70%)` }} />
                <div className="relative">
                  <div className="flex items-center justify-between">
                    <h4 className="font-mono font-semibold" style={{ color: config.color }}>{mod.name}/</h4>
                    <span
                      className="text-[10px] font-medium uppercase rounded-full px-2 py-0.5"
                      style={{ backgroundColor: `${config.color}20`, color: config.color }}
                    >
                      {mod.layer}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-xl font-bold text-[#e4e4ed]">{mod.fileCount}</div>
                      <div className="text-[10px] text-[#5a5a70] uppercase">files</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-[#e4e4ed]">{mod.symbols.length}</div>
                      <div className="text-[10px] text-[#5a5a70] uppercase">symbols</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-[#e4e4ed]">{mod.lineCount.toLocaleString()}</div>
                      <div className="text-[10px] text-[#5a5a70] uppercase">lines</div>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-[#5a5a70] font-mono">{mod.language}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Tech Stack */}
      <section className="rounded-xl border border-[#2a2a3a] bg-elevated p-6 backdrop-blur-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[#8888a0] mb-4">Tech Stack</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {techRadar.slice(0, 24).map((tech) => (
            <div
              key={tech.name}
              className="flex items-center gap-2.5 rounded-lg border border-[#2a2a3a] bg-elevated px-3 py-2.5 text-sm transition-colors hover:border-zinc-700 hover:bg-hover"
            >
              <div className="h-2 w-2 rounded-full bg-archlens-500" />
              <span className="text-[#8888a0] truncate">{tech.name}</span>
              {tech.version && (
                <span className="ml-auto text-[10px] text-[#5a5a70] font-mono">{tech.version}</span>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
