import { useStore } from "../lib/store.js";

const layerColors: Record<string, string> = {
  presentation: "border-green-500/50 bg-green-500/5",
  api: "border-blue-500/50 bg-blue-500/5",
  application: "border-orange-500/50 bg-orange-500/5",
  domain: "border-purple-500/50 bg-purple-500/5",
  infrastructure: "border-red-500/50 bg-red-500/5",
  config: "border-gray-500/50 bg-gray-500/5",
  test: "border-yellow-500/50 bg-yellow-500/5",
  unknown: "border-zinc-500/50 bg-zinc-500/5",
};

const layerBadge: Record<string, string> = {
  presentation: "bg-green-500/20 text-green-400",
  api: "bg-blue-500/20 text-blue-400",
  application: "bg-orange-500/20 text-orange-400",
  domain: "bg-purple-500/20 text-purple-400",
  infrastructure: "bg-red-500/20 text-red-400",
  config: "bg-gray-500/20 text-gray-400",
  test: "bg-yellow-500/20 text-yellow-400",
  unknown: "bg-zinc-500/20 text-[#888888]",
};

export function ModulesView() {
  const { model } = useStore();

  if (!model) return null;

  const { modules } = model;
  const sorted = [...modules].sort((a, b) => b.lineCount - a.lineCount);

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-bold">Modules</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sorted.map((mod) => (
          <div
            key={mod.name}
            className={`border rounded-xl p-5 ${layerColors[mod.layer] || layerColors.unknown}`}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-lg font-mono font-semibold">{mod.name}/</h3>
                <span
                  className={`inline-block text-xs px-2 py-0.5 rounded-full mt-1 ${layerBadge[mod.layer] || layerBadge.unknown}`}
                >
                  {mod.layer}
                </span>
              </div>
              <span className="text-xs text-[#707070] font-mono">{mod.language}</span>
            </div>

            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-xl font-bold">{mod.fileCount}</div>
                <div className="text-xs text-[#707070]">files</div>
              </div>
              <div>
                <div className="text-xl font-bold">{mod.symbols.length}</div>
                <div className="text-xs text-[#707070]">symbols</div>
              </div>
              <div>
                <div className="text-xl font-bold">{mod.lineCount.toLocaleString()}</div>
                <div className="text-xs text-[#707070]">lines</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
