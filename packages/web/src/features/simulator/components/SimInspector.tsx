/**
 * SimInspector — right slide-in panel for selected node.
 */

import { motion, AnimatePresence } from "framer-motion";
import { Settings, Skull, AlertTriangle, Lightbulb, Sparkles, TrendingUp } from "lucide-react";
import { Section } from "../../../components/ui/Section.js";
import { ProgressBar } from "../../../components/ui/ProgressBar.js";
import type { SimNode, RootCauseInsight } from "../../../lib/simulator-engine.js";

interface Props {
  open: boolean;
  node: SimNode | null;
  onClose: () => void;
  onUpdate: (patch: Partial<SimNode>) => void;
  onKill: () => void;
  running: boolean;
  insights: RootCauseInsight[];
}

export function SimInspector({ open, node, onClose, onUpdate, onKill, running, insights }: Props) {
  return (
    <AnimatePresence>
      {open && node && (
        <motion.aside
          initial={{ x: 320, opacity: 0.8 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 320, opacity: 0.8 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="absolute top-0 right-0 h-full w-80 bg-surface border-l border-[var(--color-border-default)] shadow-2xl z-30 overflow-y-auto flex-shrink-0"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-subtle)] sticky top-0 bg-surface z-10">
            <div>
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{node.label}</h3>
              <span className="text-[9px] text-[var(--color-text-muted)] uppercase">{node.type}</span>
            </div>
            <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-lg">&times;</button>
          </div>

          <div className="p-4 space-y-3">
            {/* Config */}
            <Section title="Configuration">
              <div className="space-y-2">
                <Input label="Capacity/replica" value={node.capacityPerReplica} type="number" onChange={(v) => onUpdate({ capacityPerReplica: Number(v) || 0 })} />
                <Input label="Base latency (ms)" value={node.baseLatencyMs} type="number" onChange={(v) => onUpdate({ baseLatencyMs: Number(v) || 0 })} />
                <Input label="Timeout (ms)" value={node.timeoutMs} type="number" onChange={(v) => onUpdate({ timeoutMs: Number(v) || 0 })} />
                <Slider label="Replicas" value={node.replicas} min={1} max={50} onChange={(v) => onUpdate({ replicas: v })} />
                {(node.type === "cache" || node.type === "cdn") && (
                  <Slider label="Hit Rate %" value={Math.round((node.cacheHitRate || 0) * 100)} min={0} max={100} onChange={(v) => onUpdate({ cacheHitRate: v / 100 })} />
                )}
                {node.type === "database" && (
                  <Slider label="Pool Size" value={node.dbConnectionPoolSize || 50} min={5} max={500} onChange={(v) => onUpdate({ dbConnectionPoolSize: v })} />
                )}
                {node.type === "lambda" && (
                  <Slider label="Cold Start (ms)" value={node.lambdaColdStartMs || 200} min={0} max={2000} onChange={(v) => onUpdate({ lambdaColdStartMs: v })} />
                )}
                {node.type === "gateway" && (
                  <Input label="Rate Limit (r/s)" value={node.gatewayRateLimitPerSec || 5000} type="number" onChange={(v) => onUpdate({ gatewayRateLimitPerSec: Number(v) || 5000 })} />
                )}
              </div>
            </Section>

            {/* Resilience */}
            <Section title="Resilience" defaultOpen={false}>
              <div className="space-y-2">
                <Toggle label="Circuit Breaker" value={node.circuitBreakerEnabled} onChange={(v) => onUpdate({ circuitBreakerEnabled: v })} />
                <Slider label="Retries" value={node.retryCount} min={0} max={5} onChange={(v) => onUpdate({ retryCount: v })} />
                <Toggle label="Auto-scale" value={node.autoScaleEnabled} onChange={(v) => onUpdate({ autoScaleEnabled: v })} />
                {node.autoScaleEnabled && (
                  <Slider label="Max replicas" value={node.autoScaleMax} min={1} max={50} onChange={(v) => onUpdate({ autoScaleMax: v })} />
                )}
              </div>
            </Section>

            {/* Kill button */}
            <button onClick={onKill}
              className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${node.alive ? "bg-red-500/15 text-red-400 border border-red-500/30" : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"}`}>
              {node.alive ? <><Skull className="h-3.5 w-3.5" /> Kill</> : <>Revive</>}
            </button>

            {/* Live metrics */}
            {running && node.alive && node.type !== "client" && (
              <Section title="Live Metrics">
                <div className="space-y-1">
                  <ProgressBar label="Load" value={node.utilization * 100} showValue size="sm" />
                  <ProgressBar label="Queue" value={Math.min(100, node.queueDepth)} showValue size="sm" color={node.queueDepth > 50 ? "#f97316" : undefined} />
                  <div className="grid grid-cols-2 gap-1 text-[10px] mt-2">
                    <Stat label="In" value={`${Math.round(node.incomingRate)} /s`} />
                    <Stat label="Out" value={`${Math.round(node.processedRate)} /s`} />
                    <Stat label="Drop" value={`${Math.round(node.droppedRate)} /s`} warn={node.droppedRate > 0} />
                    <Stat label="CB" value={node.circuitBreaker.state} warn={node.circuitBreaker.state !== "closed"} />
                  </div>
                </div>
              </Section>
            )}

            {/* Charts */}
            {running && node.alive && node.type !== "client" && (
              <>
                <MiniChart label="Throughput" data={node.metrics.throughput} color="#60a5fa" unit="/s" />
                <MiniChart label="Latency P50/P95/P99" data={node.metrics.latencyP50} data2={node.metrics.latencyP95} data3={node.metrics.latencyP99} color="#a78bfa" color2="#fbbf24" color3="#ef4444" unit="ms" />
                <MiniChart label="Error Rate" data={node.metrics.errorRate.map((e) => e * 100)} color="#ef4444" unit="%" />
              </>
            )}

            {/* Insights */}
            {insights.length > 0 && (
              <Section title="Insights" count={insights.length}>
                <div className="space-y-2">
                  {insights.slice(0, 5).map((ins, i) => {
                    const color = ins.severity === "critical" ? "#ef4444" : ins.severity === "warning" ? "#f97316" : "#60a5fa";
                    return (
                      <div key={i} className="rounded-lg border p-2" style={{ borderColor: `${color}30` }}>
                        <div className="text-[10px] font-semibold" style={{ color }}>{ins.title}</div>
                        <div className="text-[9px] text-[var(--color-text-muted)] mt-0.5">{ins.recommendation}</div>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

// ─── Sub-components ─────────────────────────────────────

function Input({ label, value, onChange, type = "text" }: { label: string; value: string | number; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="text-[9px] uppercase font-semibold text-[var(--color-text-muted)]">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full mt-0.5 rounded-md bg-deep border border-[var(--color-border-default)] px-2 py-1 text-[11px] text-[var(--color-text-primary)] outline-none focus:border-archlens-500/40" />
    </div>
  );
}

function Slider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-[9px] uppercase font-semibold text-[var(--color-text-muted)]">{label}: {value}</label>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full mt-0.5 accent-archlens-500" />
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-[10px] text-[var(--color-text-muted)]">{label}</label>
      <button onClick={() => onChange(!value)} className={`relative w-8 h-4 rounded-full transition-colors ${value ? "bg-archlens-500" : "bg-[var(--color-border-default)]"}`}>
        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${value ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <span className={`font-mono ${warn ? "text-amber-400" : "text-[var(--color-text-primary)]"}`}>{value}</span>
    </div>
  );
}

function MiniChart({ label, data, data2, data3, color, color2, color3, unit }: {
  label: string; data: number[]; data2?: number[]; data3?: number[];
  color: string; color2?: string; color3?: string; unit?: string;
}) {
  const allValues = [...data, ...(data2 || []), ...(data3 || [])];
  const max = Math.max(...allValues, 1);
  const pts = (d: number[]) => d.map((v, i) => `${(i / Math.max(d.length - 1, 1)) * 100},${100 - (v / max) * 100}`).join(" ");
  const last = data[data.length - 1] || 0;

  return (
    <div className="rounded-lg bg-[var(--color-border-subtle)] p-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] uppercase font-semibold text-[var(--color-text-muted)]">{label}</span>
        <span className="text-[9px] font-mono" style={{ color }}>{Math.round(last)}{unit}</span>
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-12">
        {data3 && <polyline points={pts(data3)} fill="none" stroke={color3} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
        {data2 && <polyline points={pts(data2)} fill="none" stroke={color2} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
        <polyline points={pts(data)} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
