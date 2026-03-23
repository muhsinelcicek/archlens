import { useStore } from "../lib/store.js";
import { Files, Code2, GitBranch, Boxes, Database, Globe, Cpu } from "lucide-react";

function StatCard({
  label,
  value,
  icon: Icon,
  color = "text-archlens-500",
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color?: string;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4">
      <div className={`p-3 rounded-lg bg-zinc-800 ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-2xl font-bold">{typeof value === "number" ? value.toLocaleString() : value}</div>
        <div className="text-xs text-zinc-500">{label}</div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { model } = useStore();

  if (!model) return null;

  const { stats, modules, apiEndpoints, dbEntities, techRadar } = model;

  const languages = Object.entries(stats.languages)
    .sort((a, b) => b[1] - a[1]);

  const layerOrder = ["presentation", "api", "application", "domain", "infrastructure", "config"];
  const layerColors: Record<string, string> = {
    presentation: "bg-green-500",
    api: "bg-blue-500",
    application: "bg-orange-500",
    domain: "bg-purple-500",
    infrastructure: "bg-red-500",
    config: "bg-gray-500",
  };

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">{model.project.name}</h2>
        <p className="text-zinc-500 text-sm mt-1">
          Analyzed on {new Date(model.project.analyzedAt).toLocaleDateString()} — {model.project.rootPath}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Files" value={stats.files} icon={Files} />
        <StatCard label="Symbols" value={stats.symbols} icon={Code2} color="text-blue-500" />
        <StatCard label="Relations" value={stats.relations} icon={GitBranch} color="text-purple-500" />
        <StatCard label="Lines of Code" value={stats.totalLines} icon={Code2} color="text-orange-500" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Modules" value={stats.modules} icon={Boxes} color="text-cyan-500" />
        <StatCard label="API Endpoints" value={apiEndpoints.length} icon={Globe} color="text-green-500" />
        <StatCard label="DB Entities" value={dbEntities.length} icon={Database} color="text-red-500" />
        <StatCard label="Tech Stack" value={techRadar.length} icon={Cpu} color="text-yellow-500" />
      </div>

      {/* Languages */}
      <section>
        <h3 className="text-lg font-semibold mb-3">Languages</h3>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex gap-1 h-8 rounded-lg overflow-hidden mb-3">
            {languages.map(([lang, count]) => {
              const pct = (count / stats.symbols) * 100;
              const colors: Record<string, string> = {
                typescript: "bg-blue-500",
                javascript: "bg-yellow-500",
                python: "bg-green-500",
                java: "bg-red-500",
                go: "bg-cyan-500",
                rust: "bg-orange-500",
              };
              return (
                <div
                  key={lang}
                  className={`${colors[lang] || "bg-zinc-600"} transition-all`}
                  style={{ width: `${pct}%` }}
                  title={`${lang}: ${count} symbols (${pct.toFixed(1)}%)`}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            {languages.map(([lang, count]) => (
              <div key={lang} className="flex items-center gap-2">
                <span className="font-mono text-zinc-300">{lang}</span>
                <span className="text-zinc-500">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Modules by Layer */}
      <section>
        <h3 className="text-lg font-semibold mb-3">Architecture Layers</h3>
        <div className="space-y-2">
          {layerOrder.map((layer) => {
            const mods = modules.filter((m) => m.layer === layer);
            if (mods.length === 0) return null;
            return (
              <div key={layer} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-3 h-3 rounded-full ${layerColors[layer]}`} />
                  <span className="font-medium capitalize">{layer}</span>
                  <span className="text-zinc-500 text-sm">({mods.length} modules)</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {mods.map((mod) => (
                    <div key={mod.name} className="bg-zinc-800/50 rounded-lg p-3">
                      <div className="font-mono text-sm text-archlens-400">{mod.name}/</div>
                      <div className="flex gap-4 text-xs text-zinc-500 mt-1">
                        <span>{mod.fileCount} files</span>
                        <span>{mod.lineCount.toLocaleString()} lines</span>
                        <span>{mod.language}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Tech Stack */}
      <section>
        <h3 className="text-lg font-semibold mb-3">Tech Stack</h3>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {techRadar.slice(0, 20).map((tech) => (
              <div
                key={tech.name}
                className="flex items-center gap-2 bg-zinc-800/50 rounded-lg px-3 py-2 text-sm"
              >
                <span className="text-zinc-300">{tech.name}</span>
                {tech.version && (
                  <span className="text-zinc-600 text-xs">{tech.version}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
