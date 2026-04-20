import { useState } from "react";
import { Settings, Plus, Rocket } from "lucide-react";
import { SettingsView } from "./SettingsView.js";
import { ImportView } from "./ImportView.js";
import { OnboardView } from "./OnboardView.js";

type Tab = "settings" | "import" | "onboard";

const TABS: Array<{ id: Tab; icon: React.ElementType; label: string }> = [
  { id: "settings", icon: Settings, label: "General" },
  { id: "import", icon: Plus, label: "Add Project" },
  { id: "onboard", icon: Rocket, label: "Onboarding" },
];

export function SettingsMergedView() {
  const [tab, setTab] = useState<Tab>("settings");

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
        {tab === "settings" && <SettingsView />}
        {tab === "import" && <ImportView />}
        {tab === "onboard" && <OnboardView />}
      </div>
    </div>
  );
}
