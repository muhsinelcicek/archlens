import { useStore } from "../lib/store.js";

const methodColors: Record<string, string> = {
  GET: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  POST: "bg-green-500/20 text-green-400 border-green-500/30",
  PUT: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  PATCH: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  DELETE: "bg-red-500/20 text-red-400 border-red-500/30",
};

export function ApiMapView() {
  const { model } = useStore();

  if (!model) return null;

  const { apiEndpoints } = model;

  if (apiEndpoints.length === 0) {
    return (
      <div className="p-6">
        <h2 className="text-2xl font-bold mb-4">API Map</h2>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500">
          No API endpoints detected. Add REST/GraphQL routes to see them here.
        </div>
      </div>
    );
  }

  // Group by path prefix
  const groups = new Map<string, typeof apiEndpoints>();
  for (const ep of apiEndpoints) {
    const prefix = "/" + ep.path.split("/").filter(Boolean).slice(0, 2).join("/");
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix)!.push(ep);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">API Map</h2>
        <span className="text-sm text-zinc-500">{apiEndpoints.length} endpoints</span>
      </div>

      {[...groups.entries()].map(([prefix, endpoints]) => (
        <div key={prefix} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-zinc-800/50 border-b border-zinc-800 font-mono text-sm">
            {prefix}
          </div>
          <div className="divide-y divide-zinc-800/50">
            {endpoints.map((ep, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 hover:bg-zinc-800/30 transition-colors">
                <span
                  className={`px-2 py-0.5 rounded text-xs font-bold font-mono border ${methodColors[ep.method] || "bg-zinc-700 text-zinc-300"}`}
                >
                  {ep.method}
                </span>
                <span className="font-mono text-sm flex-1">{ep.path}</span>
                <span className="text-xs text-zinc-500 font-mono truncate max-w-[200px]">
                  {ep.filePath}:{ep.line}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
