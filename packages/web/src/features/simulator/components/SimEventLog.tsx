import { useState } from "react";
import type { EventLogEntry } from "../../../lib/simulator-engine.js";

export function SimEventLog({ events }: { events: EventLogEntry[] }) {
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="border-t border-[var(--color-border-default)] bg-surface px-4 py-1 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
        Event Log ({events.length})
      </button>
    );
  }

  return (
    <div className="h-28 border-t border-[var(--color-border-default)] bg-surface overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 py-1 border-b border-[var(--color-border-default)]">
        <span className="text-[9px] uppercase font-semibold text-[var(--color-text-muted)]">Event Log ({events.length})</span>
        <button onClick={() => setOpen(false)} className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">hide</button>
      </div>
      <div className="flex-1 overflow-y-auto font-mono text-[10px]">
        {events.length === 0 ? (
          <div className="p-3 text-[var(--color-text-muted)]">No events yet.</div>
        ) : events.map((ev) => (
          <div key={ev.id} className="px-4 py-0.5 border-b border-[var(--color-border-subtle)] flex items-center gap-2">
            <span className="text-[var(--color-text-muted)] w-10">{formatTime(ev.timestamp)}</span>
            <span className={`w-12 text-[9px] font-bold uppercase ${SEV_COLOR[ev.severity] || "text-blue-400"}`}>{ev.severity}</span>
            <span className="w-14 text-[var(--color-text-muted)]">[{ev.category}]</span>
            <span className="text-[var(--color-text-primary)] truncate">{ev.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const SEV_COLOR: Record<string, string> = {
  critical: "text-red-400",
  error: "text-red-400",
  warning: "text-amber-400",
  info: "text-blue-400",
};

function formatTime(s: number): string {
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${s % 60}s`;
}
