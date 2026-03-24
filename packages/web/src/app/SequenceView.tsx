import { useState, useMemo } from "react";
import { useStore, type ArchModel } from "../lib/store.js";
import { ArrowRight, Play, ChevronDown, ChevronRight, Globe, FunctionSquare, Lightbulb } from "lucide-react";

interface SequenceStep {
  from: string;
  to: string;
  action: string;
  fromModule?: string;
  toModule?: string;
  depth: number;
  returnType?: string;
}

interface Sequence {
  title: string;
  participants: Array<{ name: string; module: string; kind: string }>;
  steps: SequenceStep[];
}

const moduleColors: Record<string, string> = {
  api: "#3b82f6", presentation: "#10b981", application: "#f59e0b",
  domain: "#8b5cf6", infrastructure: "#ef4444", config: "#6b7280",
  external: "#06b6d4", unknown: "#71717a",
};

function traceEndpoint(model: ArchModel | null, method: string, path: string): Sequence | null {
  if (!model) return null;

  const ep = model.apiEndpoints.find((e: { method: string; path: string }) => e.method === method && e.path === path);
  if (!ep) return null;

  const handlerSym = model.symbols[ep.handler] as Record<string, unknown> | undefined;
  const handlerName = (handlerSym?.name as string) || ep.handler;

  // Find handler module
  const findModule = (uid: string): string => {
    for (const mod of model.modules) {
      if (mod.symbols.includes(uid)) return mod.name;
    }
    return "unknown";
  };

  const handlerModule = findModule(ep.handler);

  const participants: Sequence["participants"] = [
    { name: "Client", module: "external", kind: "actor" },
    { name: handlerName, module: handlerModule, kind: (handlerSym?.kind as string) || "function" },
  ];

  const steps: SequenceStep[] = [
    { from: "Client", to: handlerName, action: `${method} ${path}`, fromModule: "external", toModule: handlerModule, depth: 0 },
  ];

  // Trace calls from handler
  const visited = new Set<string>();
  const traceFrom = (uid: string, depth: number) => {
    if (depth > 4 || visited.has(uid)) return;
    visited.add(uid);

    const callerSym = model.symbols[uid] as Record<string, unknown> | undefined;
    const callerName = (callerSym?.name as string) || uid;
    const callerModule = findModule(uid);

    for (const rel of model.relations) {
      if (rel.source !== uid) continue;
      if (rel.type !== "calls" && rel.type !== "imports") continue;

      const targetSym = model.symbols[rel.target] as Record<string, unknown> | undefined;
      if (!targetSym) continue;

      const targetName = targetSym.name as string;
      const targetModule = findModule(rel.target);

      if (!participants.some((p) => p.name === targetName)) {
        participants.push({ name: targetName, module: targetModule, kind: (targetSym.kind as string) || "?" });
      }

      steps.push({
        from: callerName, to: targetName,
        action: `${(targetName.split(".").pop() || targetName)}()`,
        fromModule: callerModule, toModule: targetModule, depth,
      });

      traceFrom(rel.target, depth + 1);
    }
  };

  traceFrom(ep.handler, 1);

  steps.push({ from: handlerName, to: "Client", action: "Response", fromModule: handlerModule, toModule: "external", depth: 0 });

  return { title: `${method} ${path}`, participants, steps };
}

export function SequenceView() {
  const { model } = useStore();
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  if (!model) return null;

  const endpoints = model.apiEndpoints;

  // Auto-select first endpoint
  const [selectedEndpoint, setSelectedEndpoint] = useState<string | null>(
    endpoints.length > 0 ? `${endpoints[0].method}:${endpoints[0].path}` : null,
  );
  const filtered = search
    ? endpoints.filter((ep) => ep.path.toLowerCase().includes(search.toLowerCase()) || ep.method.toLowerCase().includes(search.toLowerCase()))
    : endpoints;

  const selected = selectedEndpoint
    ? endpoints.find((ep) => `${ep.method}:${ep.path}` === selectedEndpoint)
    : null;

  const sequence = selected ? traceEndpoint(model, selected.method, selected.path) : null;

  // Group unique modules for color assignment
  const moduleLayerMap = new Map<string, string>();
  moduleLayerMap.set("external", "external");
  for (const mod of model.modules) {
    moduleLayerMap.set(mod.name, mod.layer);
  }

  const getColor = (moduleName: string): string => {
    const layer = moduleLayerMap.get(moduleName) || "unknown";
    return moduleColors[layer] || moduleColors.unknown;
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1100px]">
      <div>
        <h2 className="text-2xl font-bold">Sequence Diagrams</h2>
        <p className="text-sm text-[#5a5a70] mt-1">
          Select an API endpoint to trace its execution flow — who calls whom, in what order, across modules.
        </p>
      </div>

      {/* Endpoint Selector */}
      <div className="flex gap-3 items-start">
        <div className="flex-1 relative">
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setShowDropdown(true); }}
            onFocus={() => setShowDropdown(true)}
            placeholder="Search endpoints... (e.g. /api/sales, GET)"
            className="w-full rounded-lg border border-[#2a2a3a] bg-elevated py-2.5 px-4 text-sm text-[#e4e4ed] placeholder:text-[#5a5a70] outline-none focus:border-archlens-500/30"
          />
          {showDropdown && filtered.length > 0 && (
            <div className="absolute z-50 mt-1 w-full bg-surface border border-[#2a2a3a] rounded-lg shadow-xl max-h-60 overflow-y-auto">
              {filtered.slice(0, 20).map((ep, i) => {
                const key = `${ep.method}:${ep.path}`;
                const mc: Record<string, string> = { GET: "text-blue-400", POST: "text-emerald-400", PUT: "text-amber-400", DELETE: "text-red-400" };
                return (
                  <button
                    key={i}
                    onClick={() => { setSelectedEndpoint(key); setShowDropdown(false); setSearch(`${ep.method} ${ep.path}`); }}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-xs hover:bg-elevated transition-colors ${selectedEndpoint === key ? "bg-elevated" : ""}`}
                  >
                    <span className={`font-mono font-bold w-10 ${mc[ep.method] || "text-[#8888a0]"}`}>{ep.method}</span>
                    <span className="font-mono text-[#8888a0]">{ep.path}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Sequence Diagram */}
      {sequence ? (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-[#e4e4ed]">{sequence.title}</h3>

          {/* Participants */}
          <div className="flex gap-2 flex-wrap">
            {sequence.participants.map((p) => (
              <div
                key={p.name}
                className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs"
                style={{ borderColor: `${getColor(p.module)}40`, backgroundColor: `${getColor(p.module)}10` }}
              >
                {p.kind === "actor" ? <Globe className="h-3 w-3" style={{ color: getColor(p.module) }} /> : <FunctionSquare className="h-3 w-3" style={{ color: getColor(p.module) }} />}
                <span className="font-mono font-medium" style={{ color: getColor(p.module) }}>{p.name}</span>
                <span className="text-[#5a5a70]">{p.module}</span>
              </div>
            ))}
          </div>

          {/* Sequence Steps — Visual Timeline */}
          <div className="rounded-xl border border-[#2a2a3a] bg-deep p-5 space-y-0">
            {sequence.steps.map((step, i) => {
              const fromColor = getColor(step.fromModule || "unknown");
              const toColor = getColor(step.toModule || "unknown");
              const isReturn = step.to === "Client";
              const isCrossModule = step.fromModule !== step.toModule;

              return (
                <div key={i} className="flex items-center gap-3 py-2">
                  {/* Depth indent */}
                  <div style={{ width: step.depth * 24 }} />

                  {/* From */}
                  <div className="w-36 text-right flex-shrink-0">
                    <span className="font-mono text-xs font-medium truncate inline-block max-w-full" style={{ color: fromColor }}>
                      {step.from.split(".").pop() || step.from}
                    </span>
                  </div>

                  {/* Arrow */}
                  <div className="flex items-center gap-1 flex-shrink-0 w-24 justify-center">
                    {isReturn ? (
                      <>
                        <div className="w-0 h-0 border-r-[5px] border-y-[3px] border-y-transparent" style={{ borderRightColor: "#606060" }} />
                        <div className="flex-1 h-px border-t border-dashed" style={{ borderColor: "#606060" }} />
                      </>
                    ) : (
                      <>
                        <div className="flex-1 h-px" style={{ backgroundColor: isCrossModule ? toColor : "#505050" }} />
                        <div className="w-0 h-0 border-l-[5px] border-y-[3px] border-y-transparent" style={{ borderLeftColor: isCrossModule ? toColor : "#505050" }} />
                      </>
                    )}
                  </div>

                  {/* To */}
                  <div className="w-36 flex-shrink-0">
                    <span className="font-mono text-xs font-medium truncate inline-block max-w-full" style={{ color: toColor }}>
                      {step.to.split(".").pop() || step.to}
                    </span>
                  </div>

                  {/* Action label */}
                  <div className="flex-1 min-w-0">
                    <span className={`text-[11px] font-mono ${isReturn ? "text-[#5a5a70] italic" : "text-[#8888a0]"}`}>
                      {step.action}
                    </span>
                    {isCrossModule && !isReturn && (
                      <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: `${toColor}15`, color: toColor }}>
                        {step.fromModule} → {step.toModule}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-[#2a2a3a] bg-deep p-12 text-center">
          <Play className="h-10 w-10 text-[#404040] mx-auto mb-3" />
          <p className="text-[#5a5a70]">Select an API endpoint to generate a sequence diagram</p>
          <p className="text-[#5a5a70] text-sm mt-1">{endpoints.length} endpoints available</p>
        </div>
      )}
    </div>
  );
}
