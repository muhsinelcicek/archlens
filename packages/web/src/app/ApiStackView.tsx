import { useState } from "react";
import { useStore } from "../lib/store.js";
import { useI18n } from "../lib/i18n.js";
import { Globe, Cpu, Search, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { TechRadar } from "../components/TechRadar.js";

const methodStyle: Record<string, string> = {
  GET: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  POST: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  PUT: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  PATCH: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  DELETE: "bg-red-500/20 text-red-400 border-red-500/30",
};

export function ApiStackView() {
  const { model } = useStore();
  const { t } = useI18n();
  const [tab, setTab] = useState<"endpoints" | "techstack">("endpoints");
  const [search, setSearch] = useState("");

  if (!model) return null;

  const endpoints = model.apiEndpoints;
  const filtered = search
    ? endpoints.filter((ep) => ep.path.toLowerCase().includes(search.toLowerCase()) || ep.method.toLowerCase().includes(search.toLowerCase()))
    : endpoints;

  const groups = new Map<string, typeof endpoints>();
  for (const ep of filtered) {
    const prefix = "/" + ep.path.split("/").filter(Boolean)[0] || "/";
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix)!.push(ep);
  }

  const methodCounts: Record<string, number> = {};
  for (const ep of endpoints) methodCounts[ep.method] = (methodCounts[ep.method] || 0) + 1;

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-[#2a2a3a] px-6 pt-4">
        <button onClick={() => setTab("endpoints")} className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold ${tab === "endpoints" ? "text-archlens-300 border-b-2 border-archlens-400" : "text-[#5a5a70]"}`}>
          <Globe className="h-3.5 w-3.5" /> Endpoints ({endpoints.length})
        </button>
        <button onClick={() => setTab("techstack")} className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold ${tab === "techstack" ? "text-archlens-300 border-b-2 border-archlens-400" : "text-[#5a5a70]"}`}>
          <Cpu className="h-3.5 w-3.5" /> Tech Stack ({model.techRadar.length})
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {tab === "endpoints" && (
          <div className="p-6 max-w-[1000px]">
            {/* Header */}
            <div className="flex items-end justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold">{t("nav.api_map")}</h2>
                <p className="text-xs text-[#5a5a70]">{endpoints.length} endpoints auto-discovered</p>
              </div>
              <div className="flex gap-2">
                {Object.entries(methodCounts).sort((a, b) => b[1] - a[1]).map(([method, count]) => (
                  <span key={method} className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-mono font-bold ${methodStyle[method] || ""}`}>
                    {method} <span className="text-[#5a5a70]">{count}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#5a5a70]" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("seq.search")}
                className="w-full rounded-lg border border-[#2a2a3a] bg-deep py-2.5 pl-10 pr-4 text-sm text-[#e4e4ed] placeholder:text-[#5a5a70] outline-none focus:border-archlens-500/30" />
            </div>

            {/* Grouped endpoints */}
            <div className="space-y-2">
              {[...groups.entries()].map(([prefix, eps]) => (
                <div key={prefix} className="rounded-xl border border-[#2a2a3a] overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-2.5 bg-surface">
                    <span className="font-mono text-sm font-medium text-[#8888a0]">{prefix}</span>
                    <span className="ml-auto text-xs text-[#5a5a70]">{eps.length} endpoints</span>
                  </div>
                  <div className="divide-y divide-[#1e1e2a]">
                    {eps.map((ep, i) => (
                      <div key={i} className="flex items-center gap-4 px-4 py-2.5 hover:bg-hover transition-colors group">
                        <span className={`inline-flex w-[52px] justify-center rounded-md border px-1.5 py-0.5 text-[11px] font-bold font-mono ${methodStyle[ep.method] || ""}`}>{ep.method}</span>
                        <span className="font-mono text-sm text-[#e4e4ed] flex-1">{ep.path}</span>
                        <span className="text-xs text-[#5a5a70] font-mono opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                          {ep.filePath.split("/").pop()}:{ep.line} <ExternalLink className="h-3 w-3" />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "techstack" && (
          <div className="p-6">
            <h2 className="text-xl font-bold mb-4">{t("nav.tech_radar")}</h2>
            <TechRadar entries={model.techRadar} className="h-[calc(100vh-200px)]" />
          </div>
        )}
      </div>
    </div>
  );
}
