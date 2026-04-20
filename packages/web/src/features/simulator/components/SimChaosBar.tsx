import { Shuffle } from "lucide-react";
import type { ChaosConfig, SimNode } from "../../../lib/simulator-engine.js";

interface Props {
  chaosConfig: ChaosConfig;
  onConfigChange: (c: ChaosConfig) => void;
  nodes: SimNode[];
  setNodes: React.Dispatch<React.SetStateAction<SimNode[]>>;
  selectedId: string | null;
}

export function SimChaosBar({ chaosConfig, onConfigChange, nodes, setNodes, selectedId }: Props) {
  const chaosPresets = [
    { label: "⚡ AZ Failure", action: () => {
      const alive = nodes.filter((n) => n.alive && n.type !== "client");
      alive.slice(0, Math.ceil(alive.length / 2)).forEach((n) => setNodes((prev) => prev.map((p) => p.id === n.id ? { ...p, alive: false } : p)));
    }},
    { label: "🔥 Kill Random", action: () => {
      const alive = nodes.filter((n) => n.alive && n.type !== "client");
      if (alive.length > 0) {
        const v = alive[Math.floor(Math.random() * alive.length)];
        setNodes((prev) => prev.map((p) => p.id === v.id ? { ...p, alive: false } : p));
      }
    }},
    { label: "🐌 +200ms", action: () => onConfigChange({ ...chaosConfig, latencyInjectionMs: 200 }) },
    { label: "💀 Kill Selected", action: () => { if (selectedId) setNodes((prev) => prev.map((p) => p.id === selectedId ? { ...p, alive: false } : p)); } },
    { label: "🔄 Revive All", action: () => setNodes((prev) => prev.map((p) => ({ ...p, alive: true, chaosMode: "none" as const }))) },
  ];

  return (
    <div className="flex items-center gap-3 border-b border-red-500/20 bg-red-500/5 px-5 py-2 text-[10px] flex-wrap">
      <span className="text-red-400 font-semibold uppercase flex items-center gap-1"><Shuffle className="h-3 w-3" /> Chaos</span>
      {chaosPresets.map((c, i) => (
        <button key={i} onClick={c.action} className="px-2 py-0.5 rounded bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25 whitespace-nowrap">{c.label}</button>
      ))}
      <div className="flex items-center gap-1.5 ml-2">
        <span className="text-[var(--color-text-muted)]">Kill/min:</span>
        <input type="range" min="0" max="10" value={chaosConfig.randomKillChancePerMin}
          onChange={(e) => onConfigChange({ ...chaosConfig, randomKillChancePerMin: Number(e.target.value) })}
          className="w-16 accent-red-500" />
        <span className="text-red-400 font-mono w-4">{chaosConfig.randomKillChancePerMin}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[var(--color-text-muted)]">+Lat:</span>
        <input type="range" min="0" max="500" value={chaosConfig.latencyInjectionMs}
          onChange={(e) => onConfigChange({ ...chaosConfig, latencyInjectionMs: Number(e.target.value) })}
          className="w-16 accent-red-500" />
        <span className="text-red-400 font-mono w-8">{chaosConfig.latencyInjectionMs}ms</span>
      </div>
    </div>
  );
}
