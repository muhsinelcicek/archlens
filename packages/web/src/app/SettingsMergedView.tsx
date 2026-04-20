import { useState } from "react";
import { Settings, Plus, Rocket } from "lucide-react";
import { SettingsView } from "./SettingsView.js";
import { ImportView } from "./ImportView.js";
import { OnboardView } from "./OnboardView.js";

type Tab = "settings" | "import" | "onboard";

export function SettingsMergedView() {
  const [tab, setTab] = useState<Tab>("settings");

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-[var(--color-border-default)] px-6 pt-2 bg-surface">
        {([
          { id: "settings" as Tab, icon: Settings, label: "General" },
          { id: "import" as Tab, icon: Plus, label: "Add Project" },
          { id: "onboard" as Tab, icon: Rocket, label: "Onboarding" },
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
        {tab === "settings" && <SettingsView />}
        {tab === "import" && <ImportView />}
        {tab === "onboard" && <OnboardView />}
      </div>
    </div>
  );
}
