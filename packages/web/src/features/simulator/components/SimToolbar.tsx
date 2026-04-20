import {
  Play, Pause, RotateCcw, Grid3x3, ChevronDown,
  BookOpen, BarChart3, Save, Upload, FileText, Clock, CheckCircle2, XCircle,
} from "lucide-react";
import { ActionButton } from "../../../components/ui/ActionButton.js";
import type { TrafficPattern, GlobalStats } from "../../../lib/simulator-engine.js";
import type { SavedScenario } from "../hooks/useSimulation.js";
import { useState } from "react";

interface Props {
  running: boolean;
  onToggleRun: () => void;
  onReset: () => void;
  speed: number;
  onSpeedChange: (s: number) => void;
  trafficPattern: TrafficPattern;
  onTrafficChange: (p: TrafficPattern) => void;
  chaosEnabled: boolean;
  onChaosToggle: () => void;
  globalStats: GlobalStats | null;
  uptime: number;
  budgetLimit: number;
  templates: Array<{ id: string; name: string; icon: string }>;
  onLoadTemplate: (id: string) => void;
  loadTestPresets: Array<{ id: string; name: string; description: string }>;
  onLoadTest: (id: string) => void;
  onSave: () => void;
  onExportJson: () => void;
  onExportReport: () => void;
  onAutoLayout: () => void;
  savedScenarios: SavedScenario[];
  onLoadSaved: (s: SavedScenario) => void;
  onDeleteSaved: (name: string) => void;
  nodeCount: number;
  edgeCount: number;
  zoomLevel: number;
}

export function SimToolbar(props: Props) {
  const [showTemplates, setShowTemplates] = useState(false);
  const [showLoadTests, setShowLoadTests] = useState(false);

  return (
    <div className="flex items-center gap-2 border-b border-[var(--color-border-default)] bg-surface px-4 py-2 flex-wrap text-xs">
      {/* Play/Pause + Reset + Layout */}
      <ActionButton onClick={props.onToggleRun} variant={props.running ? "danger" : "success"} size="sm">
        {props.running ? <><Pause className="h-3.5 w-3.5" /> Pause</> : <><Play className="h-3.5 w-3.5" /> Run</>}
      </ActionButton>
      <ActionButton onClick={props.onReset} size="sm"><RotateCcw className="h-3 w-3" /> Reset</ActionButton>
      <ActionButton onClick={props.onAutoLayout} size="sm"><Grid3x3 className="h-3 w-3" /> Layout</ActionButton>

      <div className="w-px h-5 bg-[var(--color-border-default)]" />

      {/* Speed */}
      {[1, 2, 5, 10].map((s) => (
        <button key={s} onClick={() => props.onSpeedChange(s)}
          className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${props.speed === s ? "bg-archlens-500/20 text-archlens-300" : "text-[var(--color-text-muted)]"}`}>
          {s}x
        </button>
      ))}

      <div className="w-px h-5 bg-[var(--color-border-default)]" />

      {/* Traffic */}
      <select value={props.trafficPattern.type}
        onChange={(e) => props.onTrafficChange({ ...props.trafficPattern, type: e.target.value as TrafficPattern["type"] })}
        className="rounded-md bg-elevated border border-[var(--color-border-default)] px-2 py-1 text-[10px] text-[var(--color-text-primary)] outline-none">
        <option value="constant">Constant</option>
        <option value="burst">Burst</option>
        <option value="ramp">Ramp</option>
        <option value="spike">Spike</option>
        <option value="periodic">Periodic</option>
        <option value="noise">Noise</option>
      </select>
      <input type="range" min="10" max="10000" step="10" value={props.trafficPattern.baseRate}
        onChange={(e) => props.onTrafficChange({ ...props.trafficPattern, baseRate: Number(e.target.value) })}
        className="w-24 accent-archlens-500" />
      <span className="text-[10px] font-mono text-archlens-300 w-14 text-right">{props.trafficPattern.baseRate}</span>

      <div className="w-px h-5 bg-[var(--color-border-default)]" />

      {/* Templates dropdown */}
      <div className="relative">
        <ActionButton size="xs" onClick={() => { setShowTemplates(!showTemplates); setShowLoadTests(false); }}>
          <BookOpen className="h-3 w-3" /> Templates <ChevronDown className="h-3 w-3" />
        </ActionButton>
        {showTemplates && (
          <div className="absolute top-full mt-1 left-0 w-56 rounded-lg bg-elevated border border-[var(--color-border-default)] shadow-xl z-50 p-1">
            {props.templates.map((t) => (
              <button key={t.id} onClick={() => { props.onLoadTemplate(t.id); setShowTemplates(false); }}
                className="w-full text-left px-3 py-2 rounded-md hover:bg-hover text-xs">
                <span className="mr-2">{t.icon}</span>{t.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Load test dropdown */}
      <div className="relative">
        <ActionButton size="xs" onClick={() => { setShowLoadTests(!showLoadTests); setShowTemplates(false); }}>
          <BarChart3 className="h-3 w-3" /> Load <ChevronDown className="h-3 w-3" />
        </ActionButton>
        {showLoadTests && (
          <div className="absolute top-full mt-1 left-0 w-56 rounded-lg bg-elevated border border-[var(--color-border-default)] shadow-xl z-50 p-1">
            {props.loadTestPresets.map((p) => (
              <button key={p.id} onClick={() => { props.onLoadTest(p.id); setShowLoadTests(false); }}
                className="w-full text-left px-3 py-2 rounded-md hover:bg-hover text-xs">
                <div className="font-semibold">{p.name}</div>
                <div className="text-[9px] text-[var(--color-text-muted)]">{p.description}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-px h-5 bg-[var(--color-border-default)]" />

      {/* Save/Export */}
      <ActionButton size="xs" onClick={props.onSave}><Save className="h-3 w-3" /></ActionButton>
      <ActionButton size="xs" onClick={props.onExportJson}><FileText className="h-3 w-3" /></ActionButton>
      {props.running && <ActionButton size="xs" variant="success" onClick={props.onExportReport}><FileText className="h-3 w-3" /> Report</ActionButton>}

      {/* Chaos */}
      <ActionButton size="xs" variant={props.chaosEnabled ? "danger" : "default"} onClick={props.onChaosToggle}>
        Chaos {props.chaosEnabled && "ON"}
      </ActionButton>

      {/* Right: status */}
      <div className="ml-auto flex items-center gap-3 text-[10px]">
        <span className="text-[var(--color-text-muted)]">{props.nodeCount}n · {props.edgeCount}e</span>
        <span className="font-mono text-[var(--color-text-muted)]">{Math.round(props.zoomLevel * 100)}%</span>
        {props.running && props.globalStats && (
          <>
            <span className="font-mono text-[var(--color-text-muted)]"><Clock className="h-3 w-3 inline" /> {formatUptime(props.uptime)}</span>
            <span className={`font-bold ${props.globalStats.sloMet ? "text-emerald-400" : "text-red-400"}`}>
              {props.globalStats.sloMet ? <CheckCircle2 className="h-3 w-3 inline" /> : <XCircle className="h-3 w-3 inline" />}
              {" "}SLO
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function formatUptime(s: number): string {
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${s % 60}s`;
}
