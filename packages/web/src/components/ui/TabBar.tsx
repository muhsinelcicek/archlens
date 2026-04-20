import type { ReactNode } from "react";

interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
  count?: number;
}

export function TabBar({ tabs, active, onChange }: {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex border-b border-[var(--color-border-default)] px-4">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold transition-colors ${
            active === tab.id
              ? "text-archlens-300 border-b-2 border-archlens-400"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
          }`}
        >
          {tab.icon}
          {tab.label}
          {tab.count !== undefined && tab.count > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--color-border-subtle)]">{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
