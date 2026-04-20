import { useState } from "react";
import { Network, Boxes, Globe, Database } from "lucide-react";
import { ArchitectureCleanView } from "./ArchitectureCleanView.js";
import { StructureView } from "./StructureView.js";
import { ApiStackView } from "./ApiStackView.js";

/**
 * Merged Architecture page: combines Architecture graph, Structure modules,
 * API endpoints, and Database into a single tabbed view.
 *
 * Each tab renders the existing standalone component — no logic duplication.
 */

type Tab = "graph" | "modules" | "endpoints";

const TABS: Array<{ id: Tab; icon: React.ElementType; label: string }> = [
  { id: "graph", icon: Network, label: "Architecture" },
  { id: "modules", icon: Boxes, label: "Structure" },
  { id: "endpoints", icon: Globe, label: "API & Stack" },
];

export function ArchitectureMergedView() {
  const [tab, setTab] = useState<Tab>("graph");

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar — only show when NOT on graph (graph has its own full layout) */}
      {tab !== "graph" && (
        <div className="flex border-b border-[var(--color-border-default)] px-4 bg-surface">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold transition-colors ${
                tab === t.id
                  ? "text-archlens-300 border-b-2 border-archlens-400"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
              }`}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Graph tab — mini tab bar embedded in Architecture's own toolbar */}
      {tab === "graph" && (
        <div className="absolute top-2 right-4 z-30 flex gap-1">
          {TABS.filter((t) => t.id !== "graph").map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-elevated/80 backdrop-blur border border-[var(--color-border-default)] text-[10px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            >
              <t.icon className="h-3 w-3" />
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-hidden relative">
        {tab === "graph" && <ArchitectureCleanView />}
        {tab === "modules" && (
          <div className="h-full overflow-auto">
            <div className="absolute top-2 left-4 z-30">
              <button
                onClick={() => setTab("graph")}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-elevated/80 backdrop-blur border border-[var(--color-border-default)] text-[10px] font-medium text-archlens-300"
              >
                <Network className="h-3 w-3" /> ← Graph
              </button>
            </div>
            <StructureView />
          </div>
        )}
        {tab === "endpoints" && (
          <div className="h-full overflow-auto">
            <div className="absolute top-2 left-4 z-30">
              <button
                onClick={() => setTab("graph")}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-elevated/80 backdrop-blur border border-[var(--color-border-default)] text-[10px] font-medium text-archlens-300"
              >
                <Network className="h-3 w-3" /> ← Graph
              </button>
            </div>
            <ApiStackView />
          </div>
        )}
      </div>
    </div>
  );
}
