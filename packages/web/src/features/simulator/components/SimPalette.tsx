import {
  Users, Layers, Cloud, Server, Database, Zap, Activity,
  Globe, MessageSquare, HardDrive, Wifi, Shield, Eye, Code, Container, Network,
  Plus,
} from "lucide-react";
import type { NodeType } from "../../../lib/simulator-engine.js";

const CATEGORIES: Array<{ label: string; items: Array<{ type: NodeType; icon: React.ElementType; label: string; color: string }> }> = [
  {
    label: "Traffic & Edge",
    items: [
      { type: "client", icon: Users, label: "Client", color: "#34d399" },
      { type: "loadbalancer", icon: Layers, label: "Load Balancer", color: "#60a5fa" },
      { type: "gateway", icon: Network, label: "Gateway", color: "#84cc16" },
      { type: "cdn", icon: Globe, label: "CDN", color: "#10b981" },
      { type: "dns", icon: Wifi, label: "DNS", color: "#6366f1" },
    ],
  },
  {
    label: "Compute",
    items: [
      { type: "api", icon: Cloud, label: "API", color: "#a78bfa" },
      { type: "service", icon: Server, label: "Service", color: "#fbbf24" },
      { type: "lambda", icon: Code, label: "Lambda", color: "#ec4899" },
      { type: "container", icon: Container, label: "Container", color: "#0ea5e9" },
      { type: "auth", icon: Shield, label: "Auth", color: "#f59e0b" },
    ],
  },
  {
    label: "Storage",
    items: [
      { type: "database", icon: Database, label: "Database", color: "#f87171" },
      { type: "cache", icon: Zap, label: "Cache", color: "#f472b6" },
      { type: "queue", icon: Activity, label: "Queue", color: "#06b6d4" },
      { type: "messagebroker", icon: MessageSquare, label: "Broker", color: "#8b5cf6" },
      { type: "storage", icon: HardDrive, label: "Storage", color: "#ef4444" },
      { type: "monitoring", icon: Eye, label: "Monitoring", color: "#14b8a6" },
    ],
  },
];

interface Props {
  onAddNode: (type: NodeType) => void;
  onConnect: () => void;
  onDelete: () => void;
  connectMode: boolean;
  hasSelection: boolean;
}

export function SimPalette({ onAddNode, onConnect, onDelete, connectMode, hasSelection }: Props) {
  return (
    <aside className="w-44 border-r border-[var(--color-border-default)] bg-surface overflow-y-auto flex-shrink-0">
      {CATEGORIES.map((cat) => (
        <div key={cat.label} className="p-2">
          <div className="text-[9px] uppercase font-semibold text-[var(--color-text-muted)] tracking-wider mb-1.5 px-1">{cat.label}</div>
          <div className="space-y-0.5">
            {cat.items.map((item) => (
              <button key={item.type} onClick={() => onAddNode(item.type)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-hover transition-colors group">
                <div className="rounded p-1" style={{ backgroundColor: `${item.color}15`, color: item.color }}>
                  <item.icon className="h-3 w-3" />
                </div>
                <span className="text-[11px] text-[var(--color-text-muted)] group-hover:text-[var(--color-text-primary)]">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="p-2 border-t border-[var(--color-border-default)]">
        <button onClick={onConnect} disabled={!hasSelection}
          className={`w-full px-2 py-1.5 rounded-md text-[10px] font-semibold mb-1 ${connectMode ? "bg-emerald-500/15 text-emerald-400" : "bg-archlens-500/10 text-archlens-300"} disabled:opacity-40`}>
          {connectMode ? "Click target..." : "Connect"}
        </button>
        <button onClick={onDelete} disabled={!hasSelection}
          className="w-full px-2 py-1.5 rounded-md text-[10px] font-semibold bg-red-500/10 text-red-400 disabled:opacity-40">
          Delete
        </button>
      </div>
    </aside>
  );
}
