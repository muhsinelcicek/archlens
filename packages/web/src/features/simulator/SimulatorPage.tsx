/**
 * SimulatorPage — composition layer.
 *
 * ~150 lines. All logic lives in hooks, all UI in sub-components.
 * This file ONLY composes them together.
 */

import { useRef, useMemo } from "react";
import { useSimulation } from "./hooks/useSimulation.js";
import { useDragDrop } from "./hooks/useDragDrop.js";
import { SimToolbar } from "./components/SimToolbar.js";
import { SimPalette } from "./components/SimPalette.js";
import { SimCanvas } from "./components/SimCanvas.js";
import { SimInspector } from "./components/SimInspector.js";
import { SimKpiStrip } from "./components/SimKpiStrip.js";
import { SimEventLog } from "./components/SimEventLog.js";
import { SimChaosBar } from "./components/SimChaosBar.js";
import { analyzeRootCause, type RootCauseInsight } from "../../lib/simulator-engine.js";

export function SimulatorPage() {
  const sim = useSimulation();
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useDragDrop(sim.nodes, sim.setNodes, sim.deleteNodes);

  const insights = useMemo<RootCauseInsight[]>(() => {
    if (!sim.globalStats || !sim.running) return [];
    return analyzeRootCause(sim.nodes, sim.globalStats);
  }, [sim.globalStats, sim.nodes, sim.running]);

  // Selected node object
  const selectedNode = drag.selectedId
    ? sim.nodes.find((n) => n.id === drag.selectedId) || null
    : null;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Analyzed-scenario banner — appears when `archlens-studio simulate` has produced a scenario.json */}
      {sim.analyzedScenario && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface)]">
          <div className="flex items-center gap-3 text-xs text-[var(--color-text-secondary)]">
            <span className="inline-flex h-2 w-2 rounded-full bg-archlens-400 animate-pulse" />
            <span>
              <strong className="text-[var(--color-text-primary)]">{sim.analyzedScenario.projectName}</strong>
              <span className="text-[var(--color-text-muted)]"> · </span>
              {sim.analyzedScenario.nodeCount} nodes, {sim.analyzedScenario.edgeCount} edges inferred from your code
              <span className="text-[var(--color-text-muted)]"> · </span>
              {sim.analyzedScenario.modules} modules
              {sim.analyzedScenario.endpoints > 0 && ` · ${sim.analyzedScenario.endpoints} endpoints`}
              {sim.analyzedScenario.entities > 0 && ` · ${sim.analyzedScenario.entities} entities`}
            </span>
          </div>
          <button
            onClick={() => sim.loadAnalyzedScenario()}
            className="text-xs font-medium px-3 py-1.5 rounded-md bg-archlens-500 hover:bg-archlens-400 text-white transition-colors"
          >
            Load analyzed scenario
          </button>
        </div>
      )}

      {/* Toolbar */}
      <SimToolbar
        running={sim.running}
        onToggleRun={() => sim.setRunning(!sim.running)}
        onReset={sim.reset}
        speed={sim.speed}
        onSpeedChange={sim.setSpeed}
        trafficPattern={sim.trafficPattern}
        onTrafficChange={sim.setTrafficPattern}
        chaosEnabled={sim.chaosEnabled}
        onChaosToggle={() => sim.setChaosEnabled(!sim.chaosEnabled)}
        globalStats={sim.globalStats}
        uptime={sim.uptime}
        budgetLimit={sim.budgetLimit}
        templates={sim.templates}
        onLoadTemplate={sim.loadTemplate}
        loadTestPresets={sim.loadTestPresets}
        onLoadTest={sim.loadLoadTest}
        onSave={() => {
          const name = prompt("Scenario name:");
          if (name) sim.saveCurrent(name);
        }}
        onExportJson={() => {
          const data = { nodes: sim.nodes, edges: sim.edges, trafficPattern: sim.trafficPattern };
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
          const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
          a.download = `simulator-${Date.now()}.json`; a.click();
        }}
        onExportReport={() => exportReport(sim)}
        onAutoLayout={() => autoLayout(sim.nodes, sim.edges, sim.setNodes, drag.canvas)}
        savedScenarios={sim.savedScenarios}
        onLoadSaved={sim.loadSaved}
        onDeleteSaved={sim.deleteSaved}
        nodeCount={sim.nodes.length}
        edgeCount={sim.edges.length}
        zoomLevel={drag.canvas.transform.scale}
      />

      {/* Chaos bar */}
      {sim.chaosEnabled && (
        <SimChaosBar
          chaosConfig={sim.chaosConfig}
          onConfigChange={sim.setChaosConfig}
          nodes={sim.nodes}
          setNodes={sim.setNodes}
          selectedId={drag.selectedId}
        />
      )}

      {/* KPI strip */}
      {sim.running && sim.globalStats && (
        <SimKpiStrip stats={sim.globalStats} budgetLimit={sim.budgetLimit} />
      )}

      {/* Main: palette + canvas + inspector */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Palette */}
        <SimPalette
          onAddNode={(type) => {
            const rect = canvasRef.current?.getBoundingClientRect();
            const pos = rect
              ? drag.canvas.screenToCanvas(rect.width / 2 + rect.left, rect.height / 2 + rect.top, rect)
              : { x: 400, y: 300 };
            const snapped = drag.canvas.snapToGrid(pos.x, pos.y);
            const id = sim.addNode(type, snapped.x, snapped.y);
            drag.selectNode(id);
          }}
          onConnect={() => drag.setConnectFrom(drag.selectedId)}
          onDelete={() => { sim.deleteNodes(drag.selectedIds); drag.clearSelection(); }}
          connectMode={!!drag.connectFrom}
          hasSelection={drag.selectedIds.size > 0}
        />

        {/* Canvas */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <SimCanvas
            ref={canvasRef}
            nodes={sim.nodes}
            edges={sim.edges}
            canvas={drag.canvas}
            selectedIds={drag.selectedIds}
            connectFrom={drag.connectFrom}
            draggingId={drag.draggingId}
            running={sim.running}
            speed={sim.speed}
            nodeIncidents={sim.nodeIncidents}
            setNodes={sim.setNodes}
            onNodeMouseDown={(e, id) => drag.onNodeMouseDown(e, id, canvasRef.current)}
            onNodeClick={(e, id) => {
              e.stopPropagation();
              if (drag.connectFrom) {
                if (drag.connectFrom !== id) sim.connectNodes(drag.connectFrom, id);
                drag.setConnectFrom(null);
              } else {
                drag.selectNode(id);
              }
            }}
            onCanvasMouseMove={(e) => drag.onCanvasMouseMove(e, canvasRef.current)}
            onCanvasMouseUp={drag.onCanvasMouseUp}
            onCanvasClick={drag.clearSelection}
          />

          {/* Event log */}
          <SimEventLog events={sim.eventLog} />
        </div>

        {/* Inspector */}
        <SimInspector
          open={!!selectedNode}
          node={selectedNode}
          onClose={drag.clearSelection}
          onUpdate={(patch) => drag.selectedId && sim.updateNode(drag.selectedId, patch)}
          onKill={() => drag.selectedId && sim.killNode(drag.selectedId)}
          running={sim.running}
          insights={insights}
        />
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────

function autoLayout(
  nodes: ReturnType<typeof useSimulation>["nodes"],
  edges: ReturnType<typeof useSimulation>["edges"],
  setNodes: ReturnType<typeof useSimulation>["setNodes"],
  canvas: ReturnType<typeof useDragDrop>["canvas"],
) {
  if (nodes.length === 0) return;
  const hasIncoming = new Set(edges.map((e) => e.target));
  const sources = nodes.filter((n) => !hasIncoming.has(n.id) || n.type === "client");
  if (sources.length === 0) return;

  const layers = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const ed of edges) {
    if (!outgoing.has(ed.source)) outgoing.set(ed.source, []);
    outgoing.get(ed.source)!.push(ed.target);
  }
  const queue = sources.map((s) => s.id);
  for (const id of queue) layers.set(id, 0);
  const visited = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const layer = layers.get(id) || 0;
    for (const tgt of outgoing.get(id) || []) {
      if (!layers.has(tgt) || layers.get(tgt)! < layer + 1) layers.set(tgt, layer + 1);
      if (!visited.has(tgt)) queue.push(tgt);
    }
  }
  for (const n of nodes) if (!layers.has(n.id)) layers.set(n.id, 0);

  const byLayer = new Map<number, string[]>();
  for (const [id, layer] of layers) {
    if (!byLayer.has(layer)) byLayer.set(layer, []);
    byLayer.get(layer)!.push(id);
  }

  setNodes((prev) => prev.map((n) => {
    const layer = layers.get(n.id) || 0;
    const group = byLayer.get(layer) || [n.id];
    const idx = group.indexOf(n.id);
    const total = group.length;
    const snapped = canvas.snapToGrid(80 + layer * 220, 300 - ((total - 1) * 120) / 2 + idx * 120);
    return { ...n, x: snapped.x, y: snapped.y };
  }));
}

function exportReport(sim: ReturnType<typeof useSimulation>) {
  if (!sim.globalStats) return;
  const { detectIncidents } = require("../../lib/simulator-engine.js");
  const incidents = detectIncidents(sim.nodes, sim.edges, sim.globalStats);
  const lines: string[] = [];
  lines.push("# System Design Simulation Report");
  lines.push(`**Date:** ${new Date().toISOString().split("T")[0]}`);
  lines.push(`**Duration:** ${sim.uptime}s | **Traffic:** ${sim.trafficPattern.type} @ ${sim.trafficPattern.baseRate} req/s`);
  lines.push("");
  lines.push("## Executive Summary");
  lines.push(`- **Availability:** ${(sim.globalStats.successRate * 100).toFixed(1)}%`);
  lines.push(`- **P95/P99:** ${Math.round(sim.globalStats.p95LatencyMs)}ms / ${Math.round(sim.globalStats.p99LatencyMs)}ms`);
  lines.push(`- **Total Requests:** ${sim.globalStats.totalRequests.toLocaleString()}`);
  lines.push(`- **Errors:** ${sim.globalStats.totalErrors.toLocaleString()}`);
  lines.push(`- **Monthly Cost:** $${Math.round(sim.globalStats.monthlyCostEstimate).toLocaleString()}/mo`);
  lines.push(`- **SLO:** ${sim.globalStats.sloMet ? "✅ Met" : "❌ Breached"}`);
  lines.push("");
  lines.push("## Components");
  lines.push("| Component | Type | Replicas | Load | P95 | Errors |");
  lines.push("|-----------|------|----------|------|-----|--------|");
  for (const n of sim.nodes.filter((nd) => nd.type !== "client")) {
    const p95 = n.metrics.latencyP95[n.metrics.latencyP95.length - 1] || 0;
    lines.push(`| ${n.label} | ${n.type} | ${n.replicas} | ${Math.round(n.utilization * 100)}% | ${Math.round(p95)}ms | ${n.metrics.totalErrors} |`);
  }
  lines.push("");
  lines.push("## Incidents");
  lines.push("| Component | Issue | Severity | Recommendation |");
  lines.push("|-----------|-------|----------|----------------|");
  for (const [nodeId, nodeInc] of incidents) {
    const node = sim.nodes.find((nd) => nd.id === nodeId);
    for (const inc of nodeInc) {
      if (inc.type !== "TOPOLOGY_PRESSURE") {
        lines.push(`| ${node?.label || nodeId} | ${inc.label} | ${inc.severity}% | ${inc.recommendation} |`);
      }
    }
  }
  lines.push("\n---\n*Generated by ArchLens Simulator*");
  const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `sim-report-${Date.now()}.md`; a.click();
}
