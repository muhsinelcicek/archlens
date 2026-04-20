import { useState } from "react";
import { ShieldAlert, Flame, GitCompare, ScrollText, FileText } from "lucide-react";
import { QualityView } from "./QualityView.js";
import { HotspotsView } from "./HotspotsView.js";
import { DiffView } from "./DiffView.js";
import { RulesView } from "./RulesView.js";
import { ReportView } from "./ReportView.js";

type Tab = "quality" | "hotspots" | "diff" | "rules" | "report";

const TABS: Array<{ id: Tab; icon: React.ElementType; label: string }> = [
  { id: "quality", icon: ShieldAlert, label: "Code Quality" },
  { id: "hotspots", icon: Flame, label: "Hotspots" },
  { id: "diff", icon: GitCompare, label: "Diff" },
  { id: "rules", icon: ScrollText, label: "Rules" },
  { id: "report", icon: FileText, label: "Report" },
];

export function QualityMergedView() {
  const [tab, setTab] = useState<Tab>("quality");

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-[var(--color-border-default)] px-6 pt-2 bg-surface">
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
      <div className="flex-1 overflow-auto">
        {tab === "quality" && <QualityView />}
        {tab === "hotspots" && <HotspotsView />}
        {tab === "diff" && <DiffView />}
        {tab === "rules" && <RulesView />}
        {tab === "report" && <ReportView />}
      </div>
    </div>
  );
}
