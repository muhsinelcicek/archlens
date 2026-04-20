/**
 * ArchitectureCleanView — Railway.com-inspired clean graph
 *
 * Philosophy: Graph is the hero. Minimal chrome. Detail on demand.
 *
 * Removed (moved to other pages):
 * - ArchHealthBand → Dashboard
 * - SmartInsights → Insights page
 * - File tree → drill-down handles this
 * - 8 overlay modes → 3 (default, risk, impact)
 * - Topology badges → Quality page
 * - Bottom panel (tracer+matrix) → collapsed toggle
 *
 * Kept:
 * - Sigma.js graph (full width)
 * - Drill-down (system → module → file)
 * - Impact mode
 * - Risk overlay (single toggle)
 * - Slide-in detail panel (click node)
 * - Code viewer (file level)
 */

import { useState, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useStore, type ArchModel } from "../lib/store.js";
import { SigmaGraph, type SigmaGraphHandle, type GraphNode, type GraphEdge, type ImpactResult, type NodeQualityData } from "../components/SigmaGraph.js";
import { useAllAnalysis } from "../services/queries.js";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, ChevronRight, Target, Flame,
  Code2, GitBranch, FileCode, Box,
  ArrowUpRight, Globe,
} from "lucide-react";
import { ProgressBar } from "../components/ui/ProgressBar.js";
import { Badge } from "../components/ui/Badge.js";

type ViewLevel = "system" | "module" | "file";
interface Breadcrumb { level: ViewLevel; id: string; label: string }

const LAYER_COLORS: Record<string, string> = {
  presentation: "#34d399", api: "#60a5fa", application: "#fbbf24",
  domain: "#a78bfa", infrastructure: "#f87171", config: "#94a3b8", unknown: "#6b7280",
};

// ─── Graph builders (same logic, simplified) ────────────

function buildSystemGraph(model: ArchModel): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = model.modules.map((m) => ({
    id: m.name,
    label: m.name,
    sublabel: `${m.layer} · ${m.fileCount}f`,
    group: m.layer,
    type: "module",
  }));

  const edgeMap = new Map<string, { weight: number; type: string }>();
  const f2m = new Map<string, string>();
  const u2m = new Map<string, string>();
  for (const mod of model.modules) {
    for (const uid of mod.symbols) {
      u2m.set(uid, mod.name);
      const sym = model.symbols[uid] as Record<string, unknown> | undefined;
      if (sym) f2m.set(sym.filePath as string, mod.name);
    }
  }
  for (const rel of model.relations) {
    if (rel.type === "composes") continue;
    const srcMod = f2m.get(rel.source) || u2m.get(rel.source);
    const tgtSym = model.symbols[rel.target] as Record<string, unknown> | undefined;
    const tgtMod = tgtSym ? (f2m.get(tgtSym.filePath as string) || u2m.get(rel.target)) : undefined;
    if (srcMod && tgtMod && srcMod !== tgtMod) {
      const key = `${srcMod}→${tgtMod}`;
      const prev = edgeMap.get(key);
      edgeMap.set(key, { weight: (prev?.weight || 0) + 1, type: prev?.type || rel.type });
    }
  }
  const edges: GraphEdge[] = [...edgeMap.entries()].map(([key, { weight, type }]) => {
    const [src, tgt] = key.split("→");
    return { source: src, target: tgt, weight, type };
  });

  return { nodes, edges };
}

function buildModuleGraph(model: ArchModel, moduleName: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const mod = model.modules.find((m) => m.name === moduleName);
  if (!mod) return { nodes: [], edges: [] };
  const moduleFiles = new Set<string>();
  for (const uid of mod.symbols) {
    const sym = model.symbols[uid] as Record<string, unknown> | undefined;
    if (sym) moduleFiles.add(sym.filePath as string);
  }
  const nodes: GraphNode[] = [...moduleFiles].map((fp) => ({
    id: fp, label: fp.split("/").pop() || fp, sublabel: fp, group: mod.layer, type: "file",
  }));
  const edgeSet = new Set<string>();
  const edges: GraphEdge[] = [];
  for (const rel of model.relations) {
    if (rel.type !== "imports" && rel.type !== "calls") continue;
    const tgtSym = model.symbols[rel.target] as Record<string, unknown> | undefined;
    if (!tgtSym) continue;
    const srcFile = rel.source;
    const tgtFile = tgtSym.filePath as string;
    if (moduleFiles.has(srcFile) && moduleFiles.has(tgtFile) && srcFile !== tgtFile) {
      const key = `${srcFile}→${tgtFile}`;
      if (!edgeSet.has(key)) { edgeSet.add(key); edges.push({ source: srcFile, target: tgtFile, weight: 1, type: rel.type }); }
    }
  }
  return { nodes, edges };
}

// ─── Main Component ────────────────────────────────────

export function ArchitectureCleanView() {
  const { model } = useStore();
  const navigate = useNavigate();
  const graphRef = useRef<SigmaGraphHandle>(null);

  // Navigation
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([{ level: "system", id: "root", label: "System" }]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [impactMode, setImpactMode] = useState(false);
  const [impactResult, setImpactResult] = useState<ImpactResult | null>(null);
  const [riskOverlay, setRiskOverlay] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  // Data
  const { quality, coupling } = useAllAnalysis();

  const currentLevel = breadcrumbs[breadcrumbs.length - 1];

  // Quality overlay data
  const qualityData = useMemo((): NodeQualityData | null => {
    if (!riskOverlay || !quality?.modules) return null;
    const qd: NodeQualityData = {};
    for (const mod of quality.modules) {
      qd[mod.moduleName] = { score: mod.score, issues: mod.issues.length, critical: mod.issues.filter((i: any) => i.severity === "critical").length, major: mod.issues.filter((i: any) => i.severity === "major").length };
    }
    return qd;
  }, [riskOverlay, quality]);

  // Build graph
  const graphData = useMemo(() => {
    if (!model) return { nodes: [], edges: [] };
    if (currentLevel.level === "system") return buildSystemGraph(model);
    if (currentLevel.level === "module") return buildModuleGraph(model, currentLevel.id);
    return { nodes: [], edges: [] };
  }, [model, currentLevel]);

  // Navigation
  const drillDown = useCallback((id: string, label: string, level: ViewLevel) => {
    setBreadcrumbs((prev) => [...prev, { level, id, label }]);
    setSelectedNode(null);
    setPanelOpen(false);
  }, []);

  const navigateTo = useCallback((index: number) => {
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
    setSelectedNode(null);
    setPanelOpen(false);
  }, []);

  // Click handlers
  const handleNodeClick = useCallback((nodeId: string) => {
    if (!nodeId) { setSelectedNode(null); setPanelOpen(false); return; }
    setSelectedNode(nodeId);
    setPanelOpen(true);
    if (impactMode && graphRef.current) {
      setImpactResult(graphRef.current.highlightImpact(nodeId));
    }
  }, [impactMode]);

  const handleNodeDoubleClick = useCallback((nodeId: string) => {
    if (!model) return;
    if (currentLevel.level === "system") {
      const mod = model.modules.find((m) => m.name === nodeId);
      if (mod) drillDown(nodeId, nodeId, "module");
    } else if (currentLevel.level === "module") {
      drillDown(nodeId, nodeId.split("/").pop() || nodeId, "file");
    }
  }, [model, currentLevel, drillDown]);

  if (!model) return null;

  // Selected module data
  const selectedMod = selectedNode ? model.modules.find((m) => m.name === selectedNode) : null;
  const selectedQuality = selectedNode && quality?.modules ? quality.modules.find((m: any) => m.moduleName === selectedNode) : null;
  const selectedCoupling = selectedNode && coupling?.modules ? coupling.modules.find((m: any) => m.moduleName === selectedNode) : null;

  return (
    <div className="flex flex-col h-full relative">
      {/* ── Toolbar: minimal ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border-subtle)] bg-surface/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          {breadcrumbs.length > 1 && (
            <button onClick={() => navigateTo(breadcrumbs.length - 2)} className="p-1.5 rounded-md hover:bg-elevated text-[var(--color-text-muted)]">
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          {breadcrumbs.map((c, i) => (
            <div key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 text-[var(--color-text-muted)]" />}
              <button onClick={() => navigateTo(i)}
                className={`text-sm font-medium px-2 py-0.5 rounded-md transition-colors ${i === breadcrumbs.length - 1 ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"}`}>
                {c.label}
              </button>
            </div>
          ))}
          <span className="text-xs text-[var(--color-text-muted)] ml-3">{graphData.nodes.length} modules · {graphData.edges.length} deps</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Risk toggle */}
          <button
            onClick={() => setRiskOverlay(!riskOverlay)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${riskOverlay ? "bg-amber-500/15 text-amber-400 border border-amber-500/30" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] border border-transparent hover:border-[var(--color-border-default)]"}`}
          >
            <Flame className="h-3.5 w-3.5" />
            Risk
          </button>

          {/* Impact toggle */}
          <button
            onClick={() => { setImpactMode(!impactMode); if (impactMode) { graphRef.current?.clearHighlight(); setImpactResult(null); } }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${impactMode ? "bg-red-500/15 text-red-400 border border-red-500/30" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] border border-transparent hover:border-[var(--color-border-default)]"}`}
          >
            <Target className="h-3.5 w-3.5" />
            Impact
          </button>
        </div>
      </div>

      {/* ── Graph: full space ── */}
      <div className="flex-1 min-h-0 relative">
        <SigmaGraph
          ref={graphRef}
          nodes={graphData.nodes}
          edges={graphData.edges}
          onNodeClick={handleNodeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          impactMode={impactMode}
          qualityData={qualityData || undefined}
          showQualityAlerts={riskOverlay}
          className="h-full"
        />

        {/* Impact result overlay */}
        {impactMode && impactResult && (
          <div className="absolute top-3 left-3 z-10 rounded-lg bg-surface/90 backdrop-blur border border-red-500/20 p-3 text-xs">
            <div className="text-red-400 font-semibold mb-1">Blast Radius</div>
            <div className="space-y-0.5 text-[var(--color-text-secondary)]">
              <div>🔴 Direct: <span className="text-[var(--color-text-primary)] font-semibold">{impactResult.d1.length}</span></div>
              <div>🟠 Indirect: <span className="text-[var(--color-text-primary)] font-semibold">{impactResult.d2.length}</span></div>
              <div>🟡 Transitive: <span className="text-[var(--color-text-primary)] font-semibold">{impactResult.d3.length}</span></div>
            </div>
          </div>
        )}
      </div>

      {/* ── Detail Panel: slide-in from right ── */}
      <AnimatePresence>
        {panelOpen && selectedNode && selectedMod && (
          <motion.aside
            initial={{ x: 360, opacity: 0.8 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 360, opacity: 0.8 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="absolute top-0 right-0 h-full w-[340px] bg-surface border-l border-[var(--color-border-subtle)] shadow-2xl z-20 overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-subtle)] sticky top-0 bg-surface z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: LAYER_COLORS[selectedMod.layer] || "#6b7280" }} />
                <div>
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{selectedMod.name}</h3>
                  <span className="text-[10px] text-[var(--color-text-muted)] capitalize">{selectedMod.layer} layer</span>
                </div>
              </div>
              <button onClick={() => setPanelOpen(false)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-lg">&times;</button>
            </div>

            <div className="p-5 space-y-5">
              {/* Score */}
              {selectedQuality && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-[var(--color-text-muted)]">Health Score</span>
                    <span className="text-lg font-bold" style={{ color: selectedQuality.score >= 80 ? "#34d399" : selectedQuality.score >= 60 ? "#fbbf24" : "#ef4444" }}>
                      {selectedQuality.score}
                    </span>
                  </div>
                  <ProgressBar value={selectedQuality.score} size="md" />
                </div>
              )}

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Files", value: selectedMod.fileCount },
                  { label: "Symbols", value: selectedMod.symbols.length },
                  { label: "Lines", value: selectedMod.lineCount.toLocaleString() },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <div className="text-lg font-semibold text-[var(--color-text-primary)]">{s.value}</div>
                    <div className="text-[10px] text-[var(--color-text-muted)] uppercase">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Coupling */}
              {selectedCoupling && (
                <div>
                  <div className="text-xs text-[var(--color-text-muted)] mb-2">Coupling</div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--color-text-secondary)]">Instability</span>
                    <span className="font-mono font-semibold" style={{ color: selectedCoupling.instability > 0.7 ? "#ef4444" : selectedCoupling.instability > 0.4 ? "#fbbf24" : "#34d399" }}>
                      {selectedCoupling.instability.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs mt-1">
                    <span className="text-[var(--color-text-secondary)]">In / Out</span>
                    <span className="font-mono text-[var(--color-text-primary)]">{selectedCoupling.afferentCoupling} / {selectedCoupling.efferentCoupling}</span>
                  </div>
                </div>
              )}

              {/* Issues */}
              {selectedQuality && selectedQuality.issues.length > 0 && (
                <div>
                  <div className="text-xs text-[var(--color-text-muted)] mb-2">Issues ({selectedQuality.issues.length})</div>
                  <div className="flex gap-1.5">
                    {(selectedQuality as any).issues.filter((i: any) => i.severity === "critical").length > 0 && (
                      <Badge variant="error">{(selectedQuality as any).issues.filter((i: any) => i.severity === "critical").length} critical</Badge>
                    )}
                    {(selectedQuality as any).issues.filter((i: any) => i.severity === "major").length > 0 && (
                      <Badge variant="warning">{(selectedQuality as any).issues.filter((i: any) => i.severity === "major").length} major</Badge>
                    )}
                  </div>
                </div>
              )}

              {/* Language */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--color-text-muted)]">Language</span>
                <span className="font-mono text-[var(--color-text-secondary)]">{selectedMod.language}</span>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
                <button onClick={() => drillDown(selectedNode, selectedNode, "module")}
                  className="flex-1 text-xs font-medium py-2 rounded-lg bg-archlens-500/10 text-archlens-300 border border-archlens-500/20 hover:bg-archlens-500/20 transition-colors">
                  Explore →
                </button>
                <button onClick={() => navigate("/quality")}
                  className="flex-1 text-xs font-medium py-2 rounded-lg bg-elevated text-[var(--color-text-secondary)] border border-[var(--color-border-default)] hover:text-[var(--color-text-primary)] transition-colors">
                  Fix Issues
                </button>
                <button onClick={() => navigate("/simulator")}
                  className="flex-1 text-xs font-medium py-2 rounded-lg bg-elevated text-[var(--color-text-secondary)] border border-[var(--color-border-default)] hover:text-[var(--color-text-primary)] transition-colors">
                  Simulate
                </button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
