import { useState } from "react";
import { Network, Boxes, Globe } from "lucide-react";
import { ArchitectureCleanView } from "./ArchitectureCleanView.js";
import { StructureView } from "./StructureView.js";
import { ApiStackView } from "./ApiStackView.js";

/**
 * Architecture page — unified tab navigation.
 *
 * Tab bar is always visible at the top, same style on all tabs.
 * Graph tab gets full height, other tabs scroll normally.
 */

type Tab = "graph" | "modules" | "endpoints";

const TABS: Array<{ id: Tab; icon: React.ElementType; label: string }> = [
  { id: "graph", icon: Network, label: "Graph" },
  { id: "modules", icon: Boxes, label: "Modules" },
  { id: "endpoints", icon: Globe, label: "Endpoints" },
];

export function ArchitectureMergedView() {
  const [tab, setTab] = useState<Tab>("graph");

  return (
    <div className="flex flex-col h-full">
      {/* Always-visible tab bar */}
      <div className="flex items-center border-b border-[var(--color-border-subtle)] bg-surface/80 backdrop-blur-sm px-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-all relative ${
              tab === t.id
                ? "text-[var(--color-text-primary)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
            {/* Active indicator — subtle bottom glow line */}
            {tab === t.id && (
              <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full" style={{
                background: "linear-gradient(90deg, transparent, var(--color-accent), transparent)",
                boxShadow: "0 0 8px var(--color-accent-glow)",
              }} />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {tab === "graph" && <ArchitectureCleanView />}
        {tab === "modules" && (
          <div className="h-full overflow-auto">
            <StructureView />
          </div>
        )}
        {tab === "endpoints" && (
          <div className="h-full overflow-auto">
            <ApiStackView />
          </div>
        )}
      </div>
    </div>
  );
}
