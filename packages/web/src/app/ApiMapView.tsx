import { useState } from "react";
import { useStore } from "../lib/store.js";
import { Search, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";

const methodStyle: Record<string, { bg: string; text: string; border: string; badge: string }> = {
  GET: { bg: "#3b82f610", text: "#60a5fa", border: "#3b82f630", badge: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  POST: { bg: "#10b98110", text: "#34d399", border: "#10b98130", badge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  PUT: { bg: "#f59e0b10", text: "#fbbf24", border: "#f59e0b30", badge: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  PATCH: { bg: "#eab30810", text: "#fde047", border: "#eab30830", badge: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  DELETE: { bg: "#ef444410", text: "#f87171", border: "#ef444430", badge: "bg-red-500/20 text-red-400 border-red-500/30" },
};

export function ApiMapView() {
  const { model } = useStore();
  const [search, setSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  if (!model) return null;

  const { apiEndpoints } = model;

  // Filter
  const filtered = search
    ? apiEndpoints.filter(
        (ep) =>
          ep.path.toLowerCase().includes(search.toLowerCase()) ||
          ep.method.toLowerCase().includes(search.toLowerCase()),
      )
    : apiEndpoints;

  // Group by prefix
  const groups = new Map<string, typeof apiEndpoints>();
  for (const ep of filtered) {
    const parts = ep.path.split("/").filter(Boolean);
    const prefix = parts.length >= 2 ? `/${parts[0]}/${parts[1]}` : `/${parts[0] || ""}`;
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix)!.push(ep);
  }

  const toggleGroup = (prefix: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(prefix)) next.delete(prefix);
      else next.add(prefix);
      return next;
    });
  };

  // Count methods
  const methodCounts: Record<string, number> = {};
  for (const ep of apiEndpoints) {
    methodCounts[ep.method] = (methodCounts[ep.method] || 0) + 1;
  }

  if (apiEndpoints.length === 0) {
    return (
      <div className="p-6">
        <h2 className="text-2xl font-bold mb-4">API Map</h2>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-12 text-center">
          <Globe className="h-12 w-12 text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-500">No API endpoints detected.</p>
          <p className="text-zinc-600 text-sm mt-1">Add FastAPI, Express, or NestJS routes to see them here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1000px]">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold">API Map</h2>
          <p className="text-sm text-zinc-500 mt-1">
            {apiEndpoints.length} endpoints auto-discovered
          </p>
        </div>

        {/* Method badges */}
        <div className="flex gap-2">
          {Object.entries(methodCounts).sort((a, b) => b[1] - a[1]).map(([method, count]) => {
            const style = methodStyle[method] || methodStyle.GET;
            return (
              <span
                key={method}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-mono font-bold ${style.badge}`}
              >
                {method}
                <span className="text-zinc-500">{count}</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search endpoints... (e.g. /api/sales, POST)"
          className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 py-2.5 pl-10 pr-4 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-archlens-500/50 focus:ring-1 focus:ring-archlens-500/20 transition-colors"
        />
      </div>

      {/* Endpoint Groups */}
      <div className="space-y-3">
        {[...groups.entries()].map(([prefix, endpoints]) => {
          const isExpanded = expandedGroups.has(prefix) || search.length > 0;

          return (
            <div key={prefix} className="rounded-xl border border-zinc-800 overflow-hidden">
              {/* Group Header */}
              <button
                onClick={() => toggleGroup(prefix)}
                className="flex w-full items-center gap-3 px-4 py-3 bg-zinc-900/80 hover:bg-zinc-800/80 transition-colors text-left"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-zinc-500" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-zinc-500" />
                )}
                <span className="font-mono text-sm font-medium text-zinc-300">{prefix}</span>
                <span className="ml-auto text-xs text-zinc-600">{endpoints.length} endpoints</span>
              </button>

              {/* Endpoints */}
              {isExpanded && (
                <div className="divide-y divide-zinc-800/50">
                  {endpoints.map((ep, i) => {
                    const style = methodStyle[ep.method] || methodStyle.GET;
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-4 px-4 py-3 hover:bg-zinc-800/20 transition-colors group"
                      >
                        <span
                          className={`inline-flex w-[52px] justify-center rounded-md border px-1.5 py-0.5 text-[11px] font-bold font-mono ${style.badge}`}
                        >
                          {ep.method}
                        </span>

                        <span className="font-mono text-sm text-zinc-200 flex-1">{ep.path}</span>

                        <span className="text-xs text-zinc-600 font-mono flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {ep.filePath}:{ep.line}
                          <ExternalLink className="h-3 w-3" />
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Globe({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}
