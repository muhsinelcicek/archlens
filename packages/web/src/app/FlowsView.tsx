import { useState } from "react";
import { Zap, MessageSquare } from "lucide-react";
import { ProcessView } from "./ProcessView.js";
import { EventFlowView } from "./EventFlowView.js";

type Tab = "processes" | "events";

export function FlowsView() {
  const [tab, setTab] = useState<Tab>("processes");

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-[var(--color-border-default)] px-6 pt-2 bg-surface">
        {([
          { id: "processes" as Tab, icon: Zap, label: "Business Processes" },
          { id: "events" as Tab, icon: MessageSquare, label: "Event Flows" },
        ]).map((t) => (
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
      <div className="flex-1 overflow-auto">
        {tab === "processes" && <ProcessView />}
        {tab === "events" && <EventFlowView />}
      </div>
    </div>
  );
}
