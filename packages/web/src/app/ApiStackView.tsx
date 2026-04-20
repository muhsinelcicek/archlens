import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../lib/store.js";
import { useI18n } from "../lib/i18n.js";
import {
  Globe,
  Cpu,
  Search,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  List,
  LayoutGrid,
  ArrowUpDown,
} from "lucide-react";
import { TechRadar } from "../components/TechRadar.js";

const methodStyle: Record<string, string> = {
  GET: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  POST: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  PUT: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  PATCH: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  DELETE: "bg-red-500/20 text-red-400 border-red-500/30",
};

const layerColors: Record<string, string> = {
  api: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  service: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  domain: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  infrastructure: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  presentation: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  data: "bg-rose-500/20 text-rose-400 border-rose-500/30",
};

const categoryColors: Record<string, string> = {
  framework: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  library: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  tool: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  database: "bg-red-500/20 text-red-400 border-red-500/30",
  language: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  runtime: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
};

export function ApiStackView() {
  const { model } = useStore();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"endpoints" | "techstack">("endpoints");
  const [search, setSearch] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [techViewMode, setTechViewMode] = useState<"radar" | "table">("radar");
  const [techSortBy, setTechSortBy] = useState<"name" | "category">("category");

  // Build module-to-filePaths mapping
  const moduleFileMap = useMemo(() => {
    if (!model) return new Map<string, Set<string>>();
    const map = new Map<string, Set<string>>();
    for (const mod of model.modules) {
      const files = new Set<string>();
      for (const uid of mod.symbols) {
        const sym = model.symbols[uid] as Record<string, unknown> | undefined;
        if (sym?.filePath) files.add(sym.filePath as string);
      }
      map.set(mod.name, files);
    }
    return map;
  }, [model]);

  if (!model) return null;

  const endpoints = model.apiEndpoints;
  const filtered = search
    ? endpoints.filter(
        (ep) =>
          ep.path.toLowerCase().includes(search.toLowerCase()) ||
          ep.method.toLowerCase().includes(search.toLowerCase()) ||
          ep.handler.toLowerCase().includes(search.toLowerCase()) ||
          ep.filePath.toLowerCase().includes(search.toLowerCase()),
      )
    : endpoints;

  // Group endpoints by module
  const moduleGroups = new Map<string, { module: (typeof model.modules)[0] | null; endpoints: typeof endpoints }>();

  for (const ep of filtered) {
    let matchedModule: (typeof model.modules)[0] | null = null;
    for (const mod of model.modules) {
      const files = moduleFileMap.get(mod.name);
      if (files?.has(ep.filePath)) {
        matchedModule = mod;
        break;
      }
    }
    const groupName = matchedModule?.name || "Ungrouped";
    if (!moduleGroups.has(groupName)) {
      moduleGroups.set(groupName, { module: matchedModule, endpoints: [] });
    }
    moduleGroups.get(groupName)!.endpoints.push(ep);
  }

  // Sort groups: named modules first (alphabetically), "Ungrouped" last
  const sortedGroups = [...moduleGroups.entries()].sort((a, b) => {
    if (a[0] === "Ungrouped") return 1;
    if (b[0] === "Ungrouped") return -1;
    return a[0].localeCompare(b[0]);
  });

  const methodCounts: Record<string, number> = {};
  for (const ep of endpoints) methodCounts[ep.method] = (methodCounts[ep.method] || 0) + 1;

  const toggleGroup = (name: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const extractHandlerName = (ep: { handler: string; filePath: string }): string => {
    if (ep.handler) {
      // e.g. "UserController.GetAll" -> "GetAll"
      const parts = ep.handler.split(".");
      return parts.length > 1 ? parts[parts.length - 1] : ep.handler;
    }
    return "";
  };

  const extractFileName = (filePath: string): string => {
    return filePath.split("/").pop() || filePath;
  };

  const handleEndpointClick = (ep: { filePath: string }) => {
    sessionStorage.setItem("archlens-goto-file", ep.filePath);
    navigate("/architecture");
  };

  // --- Tech Stack helpers ---
  const techEntries = model.techRadar;
  const categorySummary = useMemo(() => {
    const map = new Map<string, typeof techEntries>();
    for (const entry of techEntries) {
      const cat = entry.category || "other";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(entry);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [techEntries]);

  const sortedTechEntries = useMemo(() => {
    return [...techEntries].sort((a, b) => {
      if (techSortBy === "name") return a.name.localeCompare(b.name);
      return (a.category || "").localeCompare(b.category || "") || a.name.localeCompare(b.name);
    });
  }, [techEntries, techSortBy]);

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-[var(--color-border-default)] px-6 pt-4">
        <button
          onClick={() => setTab("endpoints")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold ${tab === "endpoints" ? "text-archlens-300 border-b-2 border-archlens-400" : "text-[var(--color-text-muted)]"}`}
        >
          <Globe className="h-3.5 w-3.5" /> Endpoints ({endpoints.length})
        </button>
        <button
          onClick={() => setTab("techstack")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold ${tab === "techstack" ? "text-archlens-300 border-b-2 border-archlens-400" : "text-[var(--color-text-muted)]"}`}
        >
          <Cpu className="h-3.5 w-3.5" /> Tech Stack ({techEntries.length})
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {/* ======== ENDPOINTS TAB ======== */}
        {tab === "endpoints" && (
          <div className="p-6 max-w-[1100px]">
            {/* Header */}
            <div className="flex items-end justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold">{t("nav.api_map")}</h2>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {endpoints.length} endpoints across {moduleGroups.size} modules
                </p>
              </div>
              <div className="flex gap-2 flex-wrap justify-end">
                {Object.entries(methodCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([method, count]) => (
                    <span
                      key={method}
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-mono font-bold ${methodStyle[method] || ""}`}
                    >
                      {method} <span className="text-[var(--color-text-muted)]">{count}</span>
                    </span>
                  ))}
              </div>
            </div>

            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-muted)]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search endpoints, handlers, files..."
                className="w-full rounded-lg border border-[var(--color-border-default)] bg-deep py-2.5 pl-10 pr-4 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none focus:border-archlens-500/30"
              />
            </div>

            {/* Grouped endpoints by module */}
            <div className="space-y-3">
              {sortedGroups.map(([groupName, { module: mod, endpoints: eps }]) => {
                const isCollapsed = collapsedGroups.has(groupName);
                return (
                  <div key={groupName} className="rounded-xl border border-[var(--color-border-default)] overflow-hidden">
                    {/* Group header */}
                    <button
                      onClick={() => toggleGroup(groupName)}
                      className="w-full flex items-center gap-3 px-4 py-3 bg-surface hover:bg-hover transition-colors text-left"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-4 w-4 text-[var(--color-text-muted)] flex-shrink-0" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-[var(--color-text-muted)] flex-shrink-0" />
                      )}
                      <span className="font-semibold text-sm text-[var(--color-text-primary)]">{groupName}</span>
                      {mod?.layer && (
                        <span
                          className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${layerColors[mod.layer.toLowerCase()] || "bg-[var(--color-border-default)] text-[var(--color-text-secondary)] border-[var(--color-border-strong)]"}`}
                        >
                          {mod.layer}
                        </span>
                      )}
                      <span className="ml-auto text-xs text-[var(--color-text-muted)]">{eps.length} endpoints</span>
                    </button>

                    {/* Endpoint rows */}
                    {!isCollapsed && (
                      <div className="divide-y divide-[var(--color-border-subtle)]">
                        {eps.map((ep, i) => {
                          const handlerName = extractHandlerName(ep);
                          const fileName = extractFileName(ep.filePath);
                          return (
                            <div
                              key={i}
                              onClick={() => handleEndpointClick(ep)}
                              className="flex items-center gap-3 px-4 py-2.5 hover:bg-hover transition-colors cursor-pointer group"
                            >
                              {/* Method badge */}
                              <span
                                className={`inline-flex w-[52px] justify-center rounded-md border px-1.5 py-0.5 text-[11px] font-bold font-mono flex-shrink-0 ${methodStyle[ep.method] || ""}`}
                              >
                                {ep.method}
                              </span>

                              {/* Path */}
                              <span className="font-mono text-sm text-[var(--color-text-primary)] flex-1 min-w-0 truncate">
                                {ep.path}
                              </span>

                              {/* Handler name */}
                              {handlerName && (
                                <span className="text-xs text-[var(--color-text-secondary)] font-mono flex-shrink-0 hidden sm:inline">
                                  {handlerName}
                                </span>
                              )}

                              {/* File location - always visible */}
                              <span className="text-xs text-[var(--color-text-muted)] font-mono flex-shrink-0 flex items-center gap-1">
                                {fileName}:{ep.line}
                                <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {sortedGroups.length === 0 && (
                <div className="text-center py-12 text-[var(--color-text-muted)] text-sm">No endpoints match your search.</div>
              )}
            </div>
          </div>
        )}

        {/* ======== TECH STACK TAB ======== */}
        {tab === "techstack" && (
          <div className="p-6 max-w-[1100px]">
            <h2 className="text-xl font-bold mb-4">{t("nav.tech_radar")}</h2>

            {/* Category summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
              {categorySummary.map(([category, items]) => {
                const topItems = items.slice(0, 4).map((i) => i.name);
                const remaining = items.length - topItems.length;
                return (
                  <div
                    key={category}
                    className="rounded-xl border border-[var(--color-border-default)] bg-surface p-3"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span
                        className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${categoryColors[category] || "bg-[var(--color-border-default)] text-[var(--color-text-secondary)] border-[var(--color-border-strong)]"}`}
                      >
                        {category}
                      </span>
                      <span className="text-xs text-[var(--color-text-muted)] ml-auto">{items.length}</span>
                    </div>
                    <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                      {topItems.join(", ")}
                      {remaining > 0 && (
                        <span className="text-[var(--color-text-muted)]"> +{remaining} more</span>
                      )}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* View mode toggle */}
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => setTechViewMode("radar")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${techViewMode === "radar" ? "bg-archlens-500/20 text-archlens-300 border border-archlens-500/30" : "text-[var(--color-text-muted)] border border-[var(--color-border-default)] hover:text-[var(--color-text-secondary)]"}`}
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Radar
              </button>
              <button
                onClick={() => setTechViewMode("table")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${techViewMode === "table" ? "bg-archlens-500/20 text-archlens-300 border border-archlens-500/30" : "text-[var(--color-text-muted)] border border-[var(--color-border-default)] hover:text-[var(--color-text-secondary)]"}`}
              >
                <List className="h-3.5 w-3.5" /> Table
              </button>
            </div>

            {/* Radar view */}
            {techViewMode === "radar" && (
              <TechRadar entries={techEntries} className="h-[calc(100vh-360px)]" />
            )}

            {/* Table view */}
            {techViewMode === "table" && (
              <div className="rounded-xl border border-[var(--color-border-default)] overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-[1fr_100px_120px_1fr] gap-2 px-4 py-2.5 bg-surface text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                  <button
                    onClick={() => setTechSortBy("name")}
                    className="flex items-center gap-1 hover:text-[var(--color-text-secondary)] transition-colors text-left"
                  >
                    Name
                    {techSortBy === "name" && <ArrowUpDown className="h-3 w-3" />}
                  </button>
                  <span>Version</span>
                  <button
                    onClick={() => setTechSortBy("category")}
                    className="flex items-center gap-1 hover:text-[var(--color-text-secondary)] transition-colors text-left"
                  >
                    Category
                    {techSortBy === "category" && <ArrowUpDown className="h-3 w-3" />}
                  </button>
                  <span>Source</span>
                </div>

                {/* Table rows */}
                <div className="divide-y divide-[var(--color-border-subtle)] max-h-[calc(100vh-400px)] overflow-auto">
                  {sortedTechEntries.map((entry, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[1fr_100px_120px_1fr] gap-2 px-4 py-2 hover:bg-hover transition-colors"
                    >
                      <span className="text-sm text-[var(--color-text-primary)] font-medium truncate">{entry.name}</span>
                      <span className="text-xs text-[var(--color-text-secondary)] font-mono">{entry.version || "-"}</span>
                      <span
                        className={`inline-flex self-center w-fit rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${categoryColors[entry.category] || "bg-[var(--color-border-default)] text-[var(--color-text-secondary)] border-[var(--color-border-strong)]"}`}
                      >
                        {entry.category}
                      </span>
                      <span className="text-xs text-[var(--color-text-muted)] font-mono truncate">{entry.source}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
