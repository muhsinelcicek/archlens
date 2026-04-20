import { useState } from "react";
import { Zap, MessageSquare } from "lucide-react";
import { ProcessView } from "./ProcessView.js";
import { EventFlowView } from "./EventFlowView.js";

type Tab = "processes" | "events";

const TABS: Array<{ id: Tab; icon: React.ElementType; label: string }> = [
  { id: "processes", icon: Zap, label: "Processes" },
  { id: "events", icon: MessageSquare, label: "Events" },
];

export function FlowsView() {
  const [tab, setTab] = useState<Tab>("processes");

  return (
    <div className="flex flex-col h-full">
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
            {tab === t.id && (
              <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full" style={{
                background: "linear-gradient(90deg, transparent, var(--color-accent), transparent)",
                boxShadow: "0 0 8px var(--color-accent-glow)",
              }} />
            )}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto">
        {tab === "processes" && <ProcessView />}
        {tab === "events" && <EventFlowView />}
      </div>
    </div>
  );
}
