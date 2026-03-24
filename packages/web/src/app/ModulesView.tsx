import { useStore } from "../lib/store.js";
import { Files, Code2, FileCode } from "lucide-react";

const layerConfig: Record<string, { color: string; label: string }> = {
  presentation: { color: "#34d399", label: "Presentation" },
  api: { color: "#60a5fa", label: "API" },
  application: { color: "#fbbf24", label: "Application" },
  domain: { color: "#a78bfa", label: "Domain" },
  infrastructure: { color: "#f87171", label: "Infrastructure" },
  config: { color: "#94a3b8", label: "Config" },
  test: { color: "#f59e0b", label: "Test" },
  unknown: { color: "#6b7280", label: "Other" },
};

export function ModulesView() {
  const { model } = useStore();
  if (!model) return null;

  const sorted = [...model.modules].sort((a, b) => b.lineCount - a.lineCount);
  const maxLines = Math.max(...sorted.map((m) => m.lineCount), 1);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1200px]">
      <div>
        <h2 className="text-2xl font-bold">Modules</h2>
        <p className="text-sm text-[#5a5a70] mt-1">{model.modules.length} modules detected across the codebase</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sorted.map((mod) => {
          const cfg = layerConfig[mod.layer] || layerConfig.unknown;
          const barWidth = (mod.lineCount / maxLines) * 100;

          return (
            <div
              key={mod.name}
              className="group rounded-xl border overflow-hidden transition-all hover:scale-[1.01] hover:shadow-lg hover:shadow-black/30"
              style={{ borderColor: `${cfg.color}30` }}
            >
              {/* Header */}
              <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: `${cfg.color}08` }}>
                <h3 className="font-mono font-bold text-base" style={{ color: cfg.color }}>{mod.name}/</h3>
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full" style={{ backgroundColor: `${cfg.color}20`, color: cfg.color }}>
                  {cfg.label}
                </span>
              </div>

              {/* Stats */}
              <div className="px-4 py-3 bg-surface">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <Files className="h-3 w-3 text-[#5a5a70] mx-auto mb-0.5" />
                    <div className="text-lg font-bold text-[#e4e4ed]">{mod.fileCount}</div>
                    <div className="text-[9px] text-[#5a5a70] uppercase">files</div>
                  </div>
                  <div>
                    <Code2 className="h-3 w-3 text-[#5a5a70] mx-auto mb-0.5" />
                    <div className="text-lg font-bold text-[#e4e4ed]">{mod.symbols.length}</div>
                    <div className="text-[9px] text-[#5a5a70] uppercase">symbols</div>
                  </div>
                  <div>
                    <FileCode className="h-3 w-3 text-[#5a5a70] mx-auto mb-0.5" />
                    <div className="text-lg font-bold text-[#e4e4ed]">{mod.lineCount.toLocaleString()}</div>
                    <div className="text-[9px] text-[#5a5a70] uppercase">lines</div>
                  </div>
                </div>

                {/* Size bar */}
                <div className="mt-3 h-1.5 rounded-full bg-elevated overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${barWidth}%`, backgroundColor: cfg.color }} />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[9px] font-mono text-[#5a5a70]">{mod.language}</span>
                  <span className="text-[9px] text-[#5a5a70]">{barWidth.toFixed(0)}% of codebase</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
