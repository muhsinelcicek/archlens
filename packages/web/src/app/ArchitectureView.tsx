import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useStore, type ArchModel } from "../lib/store.js";
import { apiFetch } from "../lib/api.js";
import { SigmaGraph, type SigmaGraphHandle, type GraphNode, type GraphEdge, type ImpactResult, type NodeQualityData } from "../components/SigmaGraph.js";
import { DependencyMatrix } from "../components/DependencyMatrix.js";
import { FeatureTracer } from "../components/FeatureTracer.js";
import { ArchHealthBand } from "../components/ArchHealthBand.js";
import { SmartInsights } from "../components/SmartInsights.js";
import {
  ChevronRight, ChevronDown, ArrowLeft, Search, Code2, GitBranch,
  Box, Braces, FunctionSquare, FileCode, Eye, Layers, Zap,
  Target, AlertTriangle, CheckCircle2, Globe, Database, Cpu,
  Filter, Grid3x3, File, Hash, ArrowUpRight,
} from "lucide-react";

type ViewLevel = "system" | "module" | "file";
interface Breadcrumb { level: ViewLevel; id: string; label: string }

const layerMeta: Record<string, { color: string; label: string }> = {
  presentation: { color: "#34d399", label: "Presentation" },
  api: { color: "#60a5fa", label: "API" },
  application: { color: "#fbbf24", label: "Application" },
  domain: { color: "#a78bfa", label: "Domain" },
  infrastructure: { color: "#f87171", label: "Infrastructure" },
  config: { color: "#94a3b8", label: "Config" },
  unknown: { color: "#6b7280", label: "Other" },
};

// ─── Build graphs ────────────────────────────────────────────────────

function buildSystemGraph(model: ArchModel): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  for (const mod of model.modules) {
    nodes.push({
      id: mod.name,
      label: mod.name,
      sublabel: `${mod.fileCount}f · ${mod.lineCount.toLocaleString()}L`,
      group: mod.layer,
      type: "module",
    });
  }

  // Build file→module lookup
  const f2m = new Map<string, string>();
  const u2m = new Map<string, string>();
  for (const mod of model.modules) {
    for (const uid of mod.symbols) {
      u2m.set(uid, mod.name);
      const sym = model.symbols[uid] as Record<string, unknown> | undefined;
      if (sym) f2m.set(sym.filePath as string, mod.name);
    }
  }

  const edgeMap = new Map<string, { count: number; types: Record<string, number> }>();
  for (const rel of model.relations) {
    if (rel.type === "composes") continue;
    const srcMod = f2m.get(rel.source) || u2m.get(rel.source);
    const tgtSym = model.symbols[rel.target] as Record<string, unknown> | undefined;
    let tgtMod = tgtSym ? f2m.get(tgtSym.filePath as string) : undefined;
    if (!tgtMod) tgtMod = u2m.get(rel.target);
    if (!tgtMod && typeof rel.target === "string") {
      for (const [uid, sym] of Object.entries(model.symbols) as Array<[string, Record<string, unknown>]>) {
        if (sym.name === rel.target) { tgtMod = f2m.get(sym.filePath as string); if (tgtMod) break; }
      }
    }
    if (!srcMod || !tgtMod || srcMod === tgtMod) continue;
    const key = `${srcMod}→${tgtMod}`;
    if (!edgeMap.has(key)) edgeMap.set(key, { count: 0, types: {} });
    const e = edgeMap.get(key)!;
    e.count++;
    e.types[rel.type] = (e.types[rel.type] || 0) + 1;
  }

  for (const [key, data] of edgeMap) {
    const [src, tgt] = key.split("→");
    const mainType = Object.entries(data.types).sort((a, b) => b[1] - a[1])[0]?.[0] || "imports";
    edges.push({ source: src, target: tgt, type: mainType, weight: data.count });
  }

  return { nodes, edges };
}

function buildModuleGraph(model: ArchModel, moduleName: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const mod = model.modules.find((m) => m.name === moduleName);
  if (!mod) return { nodes, edges };

  const files = new Map<string, number>();
  for (const uid of mod.symbols) {
    const sym = model.symbols[uid] as Record<string, unknown> | undefined;
    if (sym) {
      const fp = sym.filePath as string;
      files.set(fp, (files.get(fp) || 0) + 1);
    }
  }

  for (const [fp, count] of files) {
    nodes.push({ id: fp, label: fp.split("/").pop() || fp, sublabel: `${count} symbols`, group: "default", type: "file" });
  }

  const edgeSet = new Set<string>();
  for (const rel of model.relations) {
    if (rel.type !== "imports" && rel.type !== "calls") continue;
    const tgtSym = model.symbols[rel.target] as Record<string, unknown> | undefined;
    if (!tgtSym) continue;
    if (files.has(rel.source) && files.has(tgtSym.filePath as string) && rel.source !== tgtSym.filePath) {
      const key = `${rel.source}→${tgtSym.filePath}`;
      if (!edgeSet.has(key)) { edgeSet.add(key); edges.push({ source: rel.source, target: tgtSym.filePath as string, type: rel.type }); }
    }
  }

  return { nodes, edges };
}

// ─── Code Panel ──────────────────────────────────────────────────────

/**
 * RiskOverview — mini risk dashboard inside the detail panel.
 * Fetches data from the parent component's analysisData (via context-free fetch).
 */
function RiskOverview({ moduleName }: { moduleName: string }) {
  const [data, setData] = useState<Record<string, number> | null>(null);
  const navigate = useNavigate();
  const { simulatorSnapshot } = useStore();

  useEffect(() => {
    Promise.all([
      apiFetch("/api/quality").then((r) => r.ok ? r.json() : null).catch(() => null),
      apiFetch("/api/coupling").then((r) => r.ok ? r.json() : null).catch(() => null),
      apiFetch("/api/hotspots").then((r) => r.ok ? r.json() : null).catch(() => null),
      apiFetch("/api/security").then((r) => r.ok ? r.json() : null).catch(() => null),
      apiFetch("/api/deadcode").then((r) => r.ok ? r.json() : null).catch(() => null),
    ]).then(([q, c, h, s, d]) => {
      const qScore = q?.modules?.find((m: any) => m.moduleName === moduleName)?.score ?? 80;
      const inst = c?.modules?.find((m: any) => m.moduleName === moduleName)?.instability ?? 0.5;
      const hotspot = h?.hotspots?.filter((x: any) => x.module === moduleName).reduce((a: number, x: any) => Math.max(a, x.riskScore), 0) ?? 0;
      const secCount = s?.issues?.filter((i: any) => i.filePath?.includes(moduleName)).length ?? 0;
      const deadCount = d?.byModule?.find((m: any) => m.module === moduleName)?.count ?? 0;
      const simInc = simulatorSnapshot?.topIncidents?.filter((i) => i.nodeLabel.includes(moduleName)).length ?? 0;
      setData({
        quality: qScore,
        coupling: Math.round((1 - inst) * 100),
        hotspot: 100 - hotspot,
        security: Math.max(0, 100 - secCount * 20),
        deadcode: Math.max(0, 100 - deadCount * 3),
        simulator: Math.max(0, 100 - simInc * 25),
      });
    });
  }, [moduleName, simulatorSnapshot]);

  if (!data) return null;

  const overall = Math.round(Object.values(data).reduce((a, b) => a + b, 0) / Object.keys(data).length);
  const riskColor = overall >= 80 ? "#34d399" : overall >= 60 ? "#fbbf24" : overall >= 40 ? "#f97316" : "#ef4444";
  const riskLabel = overall >= 80 ? "Healthy" : overall >= 60 ? "Attention" : overall >= 40 ? "Warning" : "Critical";

  const bars: Array<{ label: string; value: number; color: string }> = [
    { label: "Quality", value: data.quality, color: data.quality >= 70 ? "#34d399" : "#f97316" },
    { label: "Coupling", value: data.coupling, color: data.coupling >= 60 ? "#34d399" : "#f97316" },
    { label: "Hotspot", value: data.hotspot, color: data.hotspot >= 60 ? "#34d399" : "#f97316" },
    { label: "Security", value: data.security, color: data.security >= 80 ? "#34d399" : "#ef4444" },
    { label: "Dead Code", value: data.deadcode, color: data.deadcode >= 80 ? "#34d399" : "#fbbf24" },
    { label: "Simulator", value: data.simulator, color: data.simulator >= 80 ? "#34d399" : "#f97316" },
  ];

  return (
    <div className="px-4 py-3 border-b border-[var(--color-border-subtle)]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] uppercase font-semibold text-[var(--color-text-muted)]">Risk Overview</span>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${riskColor}20`, color: riskColor }}>{overall}/100 {riskLabel}</span>
      </div>
      <div className="space-y-1">
        {bars.map((b) => (
          <div key={b.label} className="flex items-center gap-2 text-[9px]">
            <span className="w-14 text-[var(--color-text-muted)] truncate">{b.label}</span>
            <div className="flex-1 h-1.5 rounded-full bg-elevated overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${b.value}%`, backgroundColor: b.color }} />
            </div>
            <span className="w-6 text-right font-mono" style={{ color: b.color }}>{b.value}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mt-2">
        <button onClick={() => navigate("/simulator")} className="text-[9px] px-2 py-1 rounded bg-archlens-500/10 text-archlens-300 border border-archlens-500/20 hover:bg-archlens-500/20">Simulate</button>
        <button onClick={() => navigate("/quality")} className="text-[9px] px-2 py-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20">Fix Issues</button>
      </div>
    </div>
  );
}

function CodePanel({ model, selectedId, level }: { model: ArchModel; selectedId: string; level: ViewLevel }) {
  // Check if selectedId is a file path (has extension) — show code viewer regardless of level
  const isFilePath = selectedId.includes("/") && /\.\w+$/.test(selectedId);
  if (isFilePath) {
    return <FileCodeViewer filePath={selectedId} model={model} />;
  }

  if (level === "system") {
    const mod = model.modules.find((m) => m.name === selectedId);
    if (!mod) return null;
    const color = layerMeta[mod.layer]?.color || "#6b7280";

    // Find files and symbols
    const fileSymbols = new Map<string, Array<{ uid: string; name: string; kind: string; line: number }>>();
    for (const uid of mod.symbols) {
      const sym = model.symbols[uid] as Record<string, unknown> | undefined;
      if (!sym) continue;
      const fp = sym.filePath as string;
      if (!fileSymbols.has(fp)) fileSymbols.set(fp, []);
      fileSymbols.get(fp)!.push({
        uid,
        name: sym.name as string,
        kind: sym.kind as string,
        line: (sym.startLine as number) || 0,
      });
    }

    // Dependencies
    const f2m = new Map<string, string>();
    const u2m = new Map<string, string>();
    for (const m of model.modules) {
      for (const uid of m.symbols) {
        u2m.set(uid, m.name);
        const s = model.symbols[uid] as Record<string, unknown> | undefined;
        if (s) f2m.set(s.filePath as string, m.name);
      }
    }

    let ca = 0, ce = 0;
    const dependsOn = new Map<string, number>();
    const dependedBy = new Map<string, number>();
    for (const rel of model.relations) {
      if (rel.type === "composes") continue;
      const srcMod = f2m.get(rel.source) || u2m.get(rel.source);
      const tgtSym = model.symbols[rel.target] as Record<string, unknown> | undefined;
      let tgtMod = tgtSym ? f2m.get(tgtSym.filePath as string) : u2m.get(rel.target);
      if (!srcMod || !tgtMod || srcMod === tgtMod) continue;
      if (tgtMod === mod.name) { ca++; dependedBy.set(srcMod, (dependedBy.get(srcMod) || 0) + 1); }
      if (srcMod === mod.name) { ce++; dependsOn.set(tgtMod, (dependsOn.get(tgtMod) || 0) + 1); }
    }
    const instability = ca + ce > 0 ? (ce / (ca + ce)).toFixed(2) : "0";

    // API endpoints
    const moduleFiles = new Set<string>();
    for (const uid of mod.symbols) {
      const s = model.symbols[uid] as Record<string, unknown> | undefined;
      if (s) moduleFiles.add(s.filePath as string);
    }
    const endpoints = model.apiEndpoints.filter((ep) => moduleFiles.has(ep.filePath));

    return (
      <div className="h-full flex flex-col">
        {/* Module Header */}
        <div className="p-4 border-b border-[var(--color-border-subtle)]">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}60` }} />
            <h3 className="font-mono font-bold text-lg" style={{ color }}>{mod.name}/</h3>
          </div>
          <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${color}20`, color }}>{layerMeta[mod.layer]?.label}</span>

          {/* Metrics row */}
          <div className="grid grid-cols-4 gap-2 mt-3">
            {[
              { v: mod.fileCount, l: "files" },
              { v: mod.symbols.length, l: "symbols" },
              { v: mod.lineCount.toLocaleString(), l: "lines" },
              { v: instability, l: "instab.", c: Number(instability) > 0.7 ? "#f87171" : Number(instability) > 0.4 ? "#fbbf24" : "#34d399" },
            ].map((m) => (
              <div key={m.l} className="bg-elevated rounded-lg p-2 text-center">
                <div className="text-sm font-bold" style={{ color: m.c || "var(--color-text-primary)" }}>{m.v}</div>
                <div className="text-[8px] text-[var(--color-text-muted)] uppercase">{m.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Risk Overview */}
        <RiskOverview moduleName={mod.name} />

        {/* Dependencies */}
        <div className="px-4 py-3 border-b border-[var(--color-border-subtle)]">
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="text-[9px] uppercase font-semibold text-[var(--color-text-muted)] mb-1 flex items-center gap-1"><ArrowUpRight className="h-3 w-3" /> Depends On ({dependsOn.size})</div>
              {dependsOn.size === 0 ? <span className="text-[10px] text-[var(--color-text-muted)]">none</span> :
                [...dependsOn.entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => (
                  <div key={n} className="text-[10px] font-mono text-[var(--color-text-secondary)]">→ {n} <span className="text-[var(--color-text-muted)]">×{c}</span></div>
                ))}
            </div>
            <div className="flex-1">
              <div className="text-[9px] uppercase font-semibold text-[var(--color-text-muted)] mb-1">Depended By ({dependedBy.size})</div>
              {dependedBy.size === 0 ? <span className="text-[10px] text-[var(--color-text-muted)]">none</span> :
                [...dependedBy.entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => (
                  <div key={n} className="text-[10px] font-mono text-[var(--color-text-secondary)]">← {n} <span className="text-[var(--color-text-muted)]">×{c}</span></div>
                ))}
            </div>
          </div>
        </div>

        {/* API Endpoints */}
        {endpoints.length > 0 && (
          <div className="px-4 py-2 border-b border-[var(--color-border-subtle)]">
            <div className="text-[9px] uppercase font-semibold text-[var(--color-text-muted)] mb-1">API Endpoints ({endpoints.length})</div>
            {endpoints.slice(0, 8).map((ep, i) => {
              const mc: Record<string, string> = { GET: "#60a5fa", POST: "#34d399", PUT: "#fbbf24", DELETE: "#f87171" };
              return <div key={i} className="text-[10px] font-mono"><span style={{ color: mc[ep.method] || "var(--color-text-secondary)" }}>{ep.method}</span> <span className="text-[var(--color-text-secondary)]">{ep.path}</span></div>;
            })}
          </div>
        )}

        {/* Files & Code Structure */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          <div className="text-[9px] uppercase font-semibold text-[var(--color-text-muted)] px-2 mb-2">Code Structure ({fileSymbols.size} files)</div>
          {[...fileSymbols.entries()].slice(0, 20).map(([fp, symbols]) => (
            <div key={fp} className="mb-2">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-elevated/50">
                <File className="h-3 w-3 text-[var(--color-text-muted)]" />
                <span className="text-[10px] font-mono text-[var(--color-text-secondary)] truncate">{fp.split("/").pop()}</span>
                <span className="ml-auto text-[9px] text-[var(--color-text-muted)]">{symbols.length}</span>
              </div>
              <div className="ml-4 mt-0.5 space-y-0">
                {symbols.sort((a, b) => a.line - b.line).slice(0, 15).map((sym) => {
                  const kindColors: Record<string, string> = {
                    class: "#fbbf24", function: "#34d399", method: "#34d399",
                    interface: "#a78bfa", enum: "#f59e0b", property: "#64748b",
                  };
                  const kindIcons: Record<string, React.ReactNode> = {
                    class: <Box className="h-2.5 w-2.5" />, function: <FunctionSquare className="h-2.5 w-2.5" />,
                    method: <FunctionSquare className="h-2.5 w-2.5" />, interface: <Braces className="h-2.5 w-2.5" />,
                    enum: <Hash className="h-2.5 w-2.5" />, property: <Code2 className="h-2.5 w-2.5" />,
                  };
                  return (
                    <div key={sym.uid} className="flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-hover text-[10px] font-mono group">
                      <span style={{ color: kindColors[sym.kind] || "var(--color-text-muted)" }}>{kindIcons[sym.kind] || <Code2 className="h-2.5 w-2.5" />}</span>
                      <span className="text-[var(--color-text-secondary)] group-hover:text-[var(--color-text-primary)] truncate">{sym.name}</span>
                      <span className="ml-auto text-[8px] text-[var(--color-text-muted)]">L{sym.line}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // File selected — show code
  if (selectedId.includes("/") && selectedId.includes(".")) {
    return <FileCodeViewer filePath={selectedId} model={model} />;
  }

  return (
    <div className="p-4 text-[var(--color-text-muted)] text-xs">
      <h3 className="font-mono font-bold text-sm text-[var(--color-text-primary)] mb-2">{selectedId.split("/").pop()}</h3>
      <p className="font-mono text-[10px]">{selectedId}</p>
    </div>
  );
}

// ─── File Code Viewer ────────────────────────────────────────────────

function FileCodeViewer({ filePath, model }: { filePath: string; model: ArchModel }) {
  const [code, setCode] = useState<string | null>(null);
  const [highlightedHtml, setHighlightedHtml] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fileExt = filePath.split(".").pop() || "";
  const shikiLangMap: Record<string, string> = {
    cs: "csharp", ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
    py: "python", go: "go", java: "java", swift: "swift", rs: "rust",
    json: "json", yaml: "yaml", yml: "yaml", md: "markdown", xml: "xml",
    html: "html", css: "css", scss: "scss",
  };

  useEffect(() => {
    setLoading(true);
    setError(null);
    setHighlightedHtml(null);
    fetch(`/api/file?path=${encodeURIComponent(filePath)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.text();
      })
      .then(async (text) => {
        setCode(text);
        // Try syntax highlighting with Shiki
        try {
          const { codeToTokens } = await import("shiki");
          const lang = shikiLangMap[fileExt] || "text";
          const { tokens } = await codeToTokens(text, { lang: lang as any, theme: "github-dark" });
          // Convert tokens to HTML lines
          const lines = tokens.map((lineTokens) => {
            return lineTokens.map((token) => {
              const color = token.color || "var(--color-text-secondary)";
              const escaped = token.content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
              return `<span style="color:${color}">${escaped}</span>`;
            }).join("");
          });
          setHighlightedHtml(lines);
        } catch {
          // Shiki failed — fallback to plain text
        }
        setLoading(false);
      })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, [filePath, fileExt]);

  // Find symbols in this file for annotations
  const fileSymbols = Object.entries(model.symbols)
    .filter(([, s]) => (s as Record<string, unknown>).filePath === filePath)
    .map(([uid, s]) => {
      const sym = s as Record<string, unknown>;
      return { uid, name: sym.name as string, kind: sym.kind as string, startLine: (sym.startLine as number) || 0 };
    })
    .sort((a, b) => a.startLine - b.startLine);

  const ext = filePath.split(".").pop() || "";
  const langNames: Record<string, string> = { cs: "C#", ts: "TypeScript", tsx: "TSX", py: "Python", go: "Go", java: "Java", swift: "Swift", rs: "Rust", js: "JavaScript" };
  const langColors: Record<string, string> = { cs: "#178600", ts: "#3178c6", tsx: "#3178c6", py: "#3572A5", go: "#00ADD8", java: "#b07219", swift: "#F05138", rs: "#dea584", js: "#f0db4f" };

  // Build line→symbol map for annotations
  const lineSymbols = new Map<number, { name: string; kind: string }>();
  for (const sym of fileSymbols) {
    const line = sym.startLine as number;
    if (line) lineSymbols.set(line, { name: sym.name as string, kind: sym.kind as string });
  }

  const kindColors: Record<string, string> = {
    class: "#fbbf24", function: "#34d399", method: "#34d399", interface: "#a78bfa", enum: "#f59e0b", property: "#64748b",
  };

  return (
    <div className="h-full flex flex-col">
      {/* File Header */}
      <div className="px-4 py-3 border-b border-[var(--color-border-subtle)] flex items-center justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileCode className="h-4 w-4 flex-shrink-0" style={{ color: langColors[ext] || "var(--color-text-muted)" }} />
            <h3 className="font-mono font-bold text-sm text-[var(--color-text-primary)] truncate">{filePath.split("/").pop()}</h3>
          </div>
          <p className="font-mono text-[9px] text-[var(--color-text-muted)] mt-0.5 truncate">{filePath}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: `${langColors[ext] || "var(--color-text-muted)"}20`, color: langColors[ext] || "var(--color-text-muted)" }}>
            {langNames[ext] || ext}
          </span>
          {code && <span className="text-[9px] text-[var(--color-text-muted)]">{code.split("\n").length}L</span>}
        </div>
      </div>

      {/* Symbols bar */}
      {fileSymbols.length > 0 && (
        <div className="px-3 py-2 border-b border-[var(--color-border-subtle)] flex flex-wrap gap-1">
          {fileSymbols.slice(0, 12).map((sym) => (
            <span key={sym.uid} className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: `${kindColors[sym.kind] || "var(--color-text-muted)"}15`, color: kindColors[sym.kind] || "var(--color-text-muted)" }}>
              {sym.name.split(".").pop()}
            </span>
          ))}
          {fileSymbols.length > 12 && <span className="text-[9px] text-[var(--color-text-muted)]">+{fileSymbols.length - 12}</span>}
        </div>
      )}

      {/* Code */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center h-32 text-[var(--color-text-muted)] text-xs">Loading...</div>
        )}
        {error && (
          <div className="p-4 text-[var(--color-text-muted)] text-xs">
            <p>Could not load file content</p>
            <p className="text-[9px] mt-1">Make sure the server has access to the source files</p>
          </div>
        )}
        {code && (
          <div className="font-mono text-[11px] leading-[18px]">
            {code.split("\n").map((line, i) => {
              const lineNum = i + 1;
              const sym = lineSymbols.get(lineNum);
              const hasSymbol = !!sym;

              return (
                <div
                  key={i}
                  className={`flex hover:bg-hover/30 ${hasSymbol ? "bg-archlens-500/5" : ""}`}
                >
                  {/* Line number */}
                  <div className="w-10 flex-shrink-0 text-right pr-3 select-none text-[var(--color-text-muted)] text-[10px]" style={{ lineHeight: "18px" }}>
                    {lineNum}
                  </div>
                  {/* Symbol marker */}
                  <div className="w-2 flex-shrink-0 flex items-center">
                    {hasSymbol && (
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: kindColors[sym!.kind] || "var(--color-text-muted)" }} title={`${sym!.kind}: ${sym!.name}`} />
                    )}
                  </div>
                  {/* Code line */}
                  {highlightedHtml && highlightedHtml[i] ? (
                    <pre className="flex-1 overflow-x-auto whitespace-pre" style={{ lineHeight: "18px", tabSize: 4 }} dangerouslySetInnerHTML={{ __html: highlightedHtml[i] || " " }} />
                  ) : (
                    <pre className="flex-1 text-[var(--color-text-secondary)] overflow-x-auto whitespace-pre" style={{ lineHeight: "18px", tabSize: 4 }}>
                      {line || " "}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────

export function ArchitectureView() {
  const { model } = useStore();
  const graphRef = useRef<SigmaGraphHandle>(null);

  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([{ level: "system", id: "root", label: "System" }]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [impactMode, setImpactMode] = useState(false);
  const [impactResult, setImpactResult] = useState<ImpactResult | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [bottomTab, setBottomTab] = useState<"trace" | "matrix">("trace");
  const [leftTab, setLeftTab] = useState<"insights" | "files">("insights");
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const navigate = useNavigate();
  const [qualityData, setQualityData] = useState<NodeQualityData | null>(null);

  // Overlay modes
  type OverlayMode = "default" | "risk" | "quality" | "hotspots" | "security" | "coupling" | "deadcode" | "debt" | "simulator";
  const [overlayMode, setOverlayMode] = useState<OverlayMode>("default");
  const showQualityAlerts = overlayMode === "quality";

  // All analysis data (fetched once on mount)
  const [analysisData, setAnalysisData] = useState<{
    quality: any; hotspots: any; security: any; coupling: any; deadcode: any; techdebt: any;
  }>({ quality: null, hotspots: null, security: null, coupling: null, deadcode: null, techdebt: null });

  const { simulatorSnapshot } = useStore();

  // Fetch ALL analysis data on mount
  useEffect(() => {
    Promise.all([
      apiFetch("/api/quality").then((r) => r.ok ? r.json() : null).catch(() => null),
      apiFetch("/api/hotspots").then((r) => r.ok ? r.json() : null).catch(() => null),
      apiFetch("/api/security").then((r) => r.ok ? r.json() : null).catch(() => null),
      apiFetch("/api/coupling").then((r) => r.ok ? r.json() : null).catch(() => null),
      apiFetch("/api/deadcode").then((r) => r.ok ? r.json() : null).catch(() => null),
      apiFetch("/api/techdebt").then((r) => r.ok ? r.json() : null).catch(() => null),
    ]).then(([q, h, s, c, d, td]) => {
      setAnalysisData({ quality: q, hotspots: h, security: s, coupling: c, deadcode: d, techdebt: td });
      // Build quality overlay data (backward compat)
      if (q) {
        const qd: NodeQualityData = {};
        for (const mod of q.modules) {
          const criticals = mod.issues.filter((i: any) => i.severity === "critical").length;
          const majors = mod.issues.filter((i: any) => i.severity === "major").length;
          qd[mod.moduleName] = { score: mod.score, issues: mod.issues.length, critical: criticals, major: majors };
        }
        setQualityData(qd);
      }
    });
  }, []);

  // Build overlay data based on selected mode
  const overlayNodeData = useMemo((): NodeQualityData | null => {
    if (overlayMode === "default") return null;
    if (overlayMode === "quality") return qualityData;
    if (!model) return null;

    const data: NodeQualityData = {};
    for (const mod of model.modules) {
      switch (overlayMode) {
        case "risk": {
          // Weighted risk from all sources
          const qScore = analysisData.quality?.modules?.find((m: any) => m.moduleName === mod.name)?.score ?? 80;
          const inst = analysisData.coupling?.modules?.find((m: any) => m.moduleName === mod.name)?.instability ?? 0.5;
          const hSpot = analysisData.hotspots?.hotspots?.filter((h: any) => h.module === mod.name).reduce((a: number, h: any) => Math.max(a, h.riskScore), 0) ?? 0;
          const risk = Math.round(100 - (qScore * 0.3 + (1 - inst) * 100 * 0.2 + (100 - hSpot) * 0.2 + 80 * 0.3));
          data[mod.name] = { score: 100 - risk, issues: risk, critical: risk > 70 ? 1 : 0, major: risk > 50 ? 1 : 0 };
          break;
        }
        case "hotspots": {
          const maxRisk = analysisData.hotspots?.hotspots?.filter((h: any) => h.module === mod.name).reduce((a: number, h: any) => Math.max(a, h.riskScore), 0) ?? 0;
          data[mod.name] = { score: 100 - maxRisk, issues: maxRisk, critical: maxRisk > 70 ? 1 : 0, major: maxRisk > 40 ? 1 : 0 };
          break;
        }
        case "security": {
          const issues = analysisData.security?.issues?.filter((i: any) => i.filePath?.startsWith(mod.path || mod.name)) || [];
          const score = issues.length === 0 ? 100 : Math.max(0, 100 - issues.length * 15);
          data[mod.name] = { score, issues: issues.length, critical: issues.filter((i: any) => i.severity === "critical").length, major: issues.filter((i: any) => i.severity === "high").length };
          break;
        }
        case "coupling": {
          const modData = analysisData.coupling?.modules?.find((m: any) => m.moduleName === mod.name);
          const inst = modData?.instability ?? 0.5;
          const score = Math.round((1 - inst) * 100);
          data[mod.name] = { score, issues: Math.round(inst * 100), critical: inst > 0.8 ? 1 : 0, major: inst > 0.6 ? 1 : 0 };
          break;
        }
        case "deadcode": {
          const modDead = analysisData.deadcode?.byModule?.find((m: any) => m.module === mod.name);
          const count = modDead?.count ?? 0;
          const score = Math.max(0, 100 - count * 2);
          data[mod.name] = { score, issues: count, critical: count > 30 ? 1 : 0, major: count > 10 ? 1 : 0 };
          break;
        }
        case "debt": {
          const items = analysisData.techdebt?.items || [];
          const score = items.length > 0 ? Math.max(0, 100 - items.length * 10) : 100;
          data[mod.name] = { score, issues: items.length, critical: 0, major: items.length > 3 ? 1 : 0 };
          break;
        }
        case "simulator": {
          const inc = simulatorSnapshot?.topIncidents?.filter((i) => i.nodeLabel.includes(mod.name)) || [];
          const score = inc.length === 0 ? 100 : Math.max(0, 100 - inc.length * 20);
          data[mod.name] = { score, issues: inc.length, critical: inc.filter((i) => i.severity >= 80).length, major: inc.filter((i) => i.severity >= 60).length };
          break;
        }
      }
    }
    return data;
  }, [overlayMode, model, qualityData, analysisData, simulatorSnapshot]);

  const currentLevel = breadcrumbs[breadcrumbs.length - 1];

  const drillDown = useCallback((id: string, label: string, level: ViewLevel) => {
    setBreadcrumbs((prev) => [...prev, { level, id, label }]);
    setSelectedNode(null);
    setImpactResult(null);
    setImpactMode(false);
  }, []);

  const navigateTo = useCallback((index: number) => {
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
    setSelectedNode(null);
    setImpactResult(null);
  }, []);

  const handleNodeClick = useCallback((nodeId: string) => {
    if (!nodeId) { setSelectedNode(null); setImpactResult(null); setRightPanelOpen(false); return; }
    setSelectedNode(nodeId);
    setRightPanelOpen(true); // auto-open detail panel
    if (impactMode && graphRef.current) {
      const result = graphRef.current.highlightImpact(nodeId);
      setImpactResult(result);
    }
  }, [impactMode]);

  const handleNodeDoubleClick = useCallback((nodeId: string) => {
    if (!model) return;
    if (nodeId.startsWith("layer-")) return;
    if (currentLevel.level === "system") {
      const mod = model.modules.find((m) => m.name === nodeId);
      if (mod) drillDown(nodeId, nodeId, "module");
    } else if (currentLevel.level === "module") {
      drillDown(nodeId, nodeId.split("/").pop() || nodeId, "file");
    }
  }, [model, currentLevel.level, drillDown]);

  const graphData = useMemo(() => {
    if (!model) return { nodes: [], edges: [] };
    if (currentLevel.level === "system") return buildSystemGraph(model);
    if (currentLevel.level === "module") return buildModuleGraph(model, currentLevel.id);
    return { nodes: [], edges: [] };
  }, [model, currentLevel]);

  if (!model) return null;

  // Build file tree from symbol paths
  const fileTree = useMemo(() => {
    if (!model) return new Map<string, Set<string>>();
    const tree = new Map<string, Set<string>>(); // module → set of relative paths
    for (const mod of model.modules) {
      const paths = new Set<string>();
      for (const uid of mod.symbols) {
        const sym = model.symbols[uid] as Record<string, unknown> | undefined;
        if (sym) paths.add(sym.filePath as string);
      }
      tree.set(mod.name, paths);
    }
    return tree;
  }, [model]);

  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const toggleDir = (dir: string) => setExpandedDirs((prev) => { const n = new Set(prev); if (n.has(dir)) n.delete(dir); else n.add(dir); return n; });

  const filteredModules = searchQuery
    ? model.modules.filter((m) => m.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : model.modules;

  // Build nested directory structure for a module
  // Simple recursive tree renderer
  function renderFileTree(paths: Set<string>, parentPath: string, depth: number): React.ReactNode[] {
    // Get unique direct children at this level
    const children = new Map<string, { isDir: boolean; fullPath: string }>();

    for (const fp of paths) {
      if (!fp.startsWith(parentPath)) continue;
      const rest = fp.slice(parentPath.length);
      const parts = rest.split("/").filter(Boolean);
      if (parts.length === 0) continue;

      const childName = parts[0];
      const childPath = parentPath + childName + (parts.length > 1 ? "/" : "");
      const isDir = parts.length > 1;

      if (!children.has(childName)) {
        children.set(childName, { isDir, fullPath: isDir ? childPath : fp });
      } else if (isDir) {
        children.set(childName, { isDir: true, fullPath: childPath });
      }
    }

    // Sort: dirs first, then files
    const sorted = [...children.entries()].sort((a, b) => {
      if (a[1].isDir !== b[1].isDir) return a[1].isDir ? -1 : 1;
      return a[0].localeCompare(b[0]);
    });

    return sorted.map(([name, info]) => {
      if (info.isDir) {
        const dirKey = info.fullPath;
        const isDirExpanded = expandedDirs.has(dirKey);
        const fileCount = [...paths].filter((p) => p.startsWith(dirKey)).length;

        return (
          <div key={dirKey}>
            <button
              onClick={() => toggleDir(dirKey)}
              className="w-full flex items-center gap-1 py-0.5 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-hover/50 rounded"
              style={{ paddingLeft: `${depth * 14 + 4}px` }}
            >
              {isDirExpanded ? <ChevronDown className="h-2.5 w-2.5 flex-shrink-0" /> : <ChevronRight className="h-2.5 w-2.5 flex-shrink-0" />}
              <span className="font-mono truncate">{name}</span>
              <span className="ml-auto text-[8px] text-[var(--color-text-muted)] pr-1">{fileCount}</span>
            </button>
            {isDirExpanded && renderFileTree(paths, dirKey, depth + 1)}
          </div>
        );
      } else {
        const ext = name.split(".").pop() || "";
        const extColors: Record<string, string> = { cs: "#178600", ts: "#3178c6", tsx: "#3178c6", py: "#3572A5", go: "#00ADD8", java: "#b07219", swift: "#F05138", rs: "#dea584", js: "#f0db4f" };
        const isFileSelected = selectedNode === info.fullPath;

        return (
          <button
            key={info.fullPath}
            onClick={() => setSelectedNode(info.fullPath)}
            className={`w-full flex items-center gap-1 py-0.5 text-[10px] rounded ${isFileSelected ? "bg-amber-500/10 text-amber-300" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-hover/50"}`}
            style={{ paddingLeft: `${depth * 14 + 4}px` }}
          >
            <FileCode className="h-2.5 w-2.5 flex-shrink-0" style={{ color: extColors[ext] || "var(--color-text-muted)" }} />
            <span className="font-mono truncate">{name}</span>
          </button>
        );
      }
    });
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── TOP: Health Band ── */}
      <ArchHealthBand model={model} />

      <div className="flex flex-1 min-h-0 relative">
      {/* ── LEFT: Smart Insights + File Tree (collapsible) ── */}
      <aside className={`border-r border-[var(--color-border-subtle)] bg-surface flex flex-col overflow-hidden transition-all duration-200 ${leftPanelOpen ? "w-64" : "w-0"}`}>
        {/* Tab switcher */}
        <div className="flex border-b border-[var(--color-border-subtle)]">
          <button onClick={() => setLeftTab("insights")} className={`flex-1 px-3 py-2 text-[10px] font-semibold uppercase ${leftTab === "insights" ? "text-archlens-300 border-b-2 border-archlens-400" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"}`}>
            <Zap className="h-3 w-3 inline mr-1" />Insights
          </button>
          <button onClick={() => setLeftTab("files")} className={`flex-1 px-3 py-2 text-[10px] font-semibold uppercase ${leftTab === "files" ? "text-archlens-300 border-b-2 border-archlens-400" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"}`}>
            <FileCode className="h-3 w-3 inline mr-1" />Files
          </button>
        </div>

        {leftTab === "insights" ? (
          <SmartInsights model={model} onModuleSelect={(name) => { setSelectedNode(name); graphRef.current?.selectNode(name); }} />
        ) : (
        <>
        <div className="p-2 border-b border-[var(--color-border-subtle)]">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--color-text-muted)]" />
            <input
              type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files..."
              className="w-full rounded-md border border-[var(--color-border-default)] bg-deep py-1.5 pl-7 pr-2 text-[11px] text-[var(--color-text-secondary)] placeholder:text-[var(--color-text-muted)] outline-none focus:border-archlens-500/30"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {filteredModules.map((mod) => {
            const color = layerMeta[mod.layer]?.color || "#6b7280";
            const isModSelected = selectedNode === mod.name;
            const isModExpanded = expandedDirs.has(mod.name);
            const modPaths = fileTree.get(mod.name) || new Set();

            return (
              <div key={mod.name}>
                {/* Module root */}
                <button
                  onClick={() => {
                    setSelectedNode(mod.name);
                    graphRef.current?.selectNode(mod.name);
                    // Toggle module + auto-expand common prefix dirs
                    setExpandedDirs((prev) => {
                      const next = new Set(prev);
                      if (next.has(mod.name)) {
                        next.delete(mod.name);
                      } else {
                        next.add(mod.name);
                        // Auto-expand top-level dirs that contain all module files
                        for (const fp of modPaths) {
                          const parts = fp.split("/");
                          for (let i = 1; i < Math.min(parts.length, 4); i++) {
                            next.add(parts.slice(0, i).join("/") + "/");
                          }
                        }
                      }
                      return next;
                    });
                  }}
                  onDoubleClick={() => drillDown(mod.name, mod.name, "module")}
                  className={`w-full flex items-center gap-1 px-2 py-1 text-[11px] transition-all ${isModSelected ? "bg-amber-500/10 text-amber-300" : "text-[var(--color-text-secondary)] hover:bg-hover"}`}
                  style={isModSelected ? { borderLeft: `2px solid ${color}` } : { paddingLeft: "10px" }}
                >
                  {isModExpanded
                    ? <ChevronDown className="h-3 w-3 flex-shrink-0 text-[var(--color-text-muted)]" />
                    : <ChevronRight className="h-3 w-3 flex-shrink-0 text-[var(--color-text-muted)]" />}
                  <Box className="h-3 w-3 flex-shrink-0" style={{ color }} />
                  <span className="font-mono font-medium truncate">{mod.name}</span>
                  <span className="ml-auto text-[9px] text-[var(--color-text-muted)]">{mod.fileCount}</span>
                </button>

                {/* Expanded file tree — recursive */}
                {isModExpanded && (
                  <div className="ml-1">
                    {renderFileTree(modPaths, "", 1)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Stats footer */}
        <div className="px-3 py-2 border-t border-[var(--color-border-subtle)] text-[9px] text-[var(--color-text-muted)]">
          {model.modules.length} modules · {model.stats.files} files
        </div>
        </>
        )}
      </aside>

      {/* ── CENTER ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="px-3 py-2 border-b border-[var(--color-border-subtle)] flex items-center justify-between bg-surface/50">
          <div className="flex items-center gap-2">
            {/* Panel toggle */}
            <button onClick={() => setLeftPanelOpen(!leftPanelOpen)} className={`p-1.5 rounded-md transition-colors ${leftPanelOpen ? "bg-archlens-500/15 text-archlens-300" : "text-[var(--color-text-muted)] hover:bg-elevated"}`} title="Toggle explorer">
              <Layers className="h-3.5 w-3.5" />
            </button>
            <div className="w-px h-4 bg-[var(--color-border-subtle)]" />
            {breadcrumbs.length > 1 && (
              <button onClick={() => navigateTo(breadcrumbs.length - 2)} className="p-1 rounded hover:bg-elevated text-[var(--color-text-muted)]"><ArrowLeft className="h-3.5 w-3.5" /></button>
            )}
            {breadcrumbs.map((c, i) => (
              <div key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3 text-[var(--color-text-muted)]" />}
                <button onClick={() => navigateTo(i)} className={`text-[11px] font-mono px-1.5 py-0.5 rounded ${i === breadcrumbs.length - 1 ? "bg-archlens-500/12 text-archlens-300" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"}`}>
                  {c.label}
                </button>
              </div>
            ))}
            <span className="text-[10px] text-[var(--color-text-muted)] ml-2">{graphData.nodes.length}n · {graphData.edges.length}e</span>
          </div>

          <div className="flex items-center gap-2">
          <button
            onClick={() => { setImpactMode(!impactMode); if (impactMode) { graphRef.current?.clearHighlight(); setImpactResult(null); } }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${impactMode ? "bg-red-500/20 text-red-400 border border-red-500/30 animate-glow-pulse" : "bg-elevated text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] border border-[var(--color-border-default)]"}`}
          >
            <Target className="h-3.5 w-3.5" />
            Impact
          </button>
          <select
            value={overlayMode}
            onChange={(e) => setOverlayMode(e.target.value as OverlayMode)}
            className="rounded-lg bg-elevated border border-[var(--color-border-default)] px-2 py-1.5 text-[11px] text-[var(--color-text-primary)] outline-none cursor-pointer hover:border-archlens-500/40"
          >
            <option value="default">🎨 Default</option>
            <option value="risk">🔥 Risk Heatmap</option>
            <option value="quality">📊 Quality</option>
            <option value="hotspots">🔴 Hotspots</option>
            <option value="security">🛡️ Security</option>
            <option value="coupling">🔗 Coupling</option>
            <option value="deadcode">💀 Dead Code</option>
            <option value="debt">💰 Tech Debt</option>
            <option value="simulator">🎮 Simulator</option>
          </select>
          </div>
        </div>

        {/* Graph — Full height + topology badges */}
        <div className="flex-1 min-h-0 relative">
          <SigmaGraph
            ref={graphRef}
            nodes={graphData.nodes}
            edges={graphData.edges}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={handleNodeDoubleClick}
            impactMode={impactMode}
            qualityData={overlayNodeData || qualityData || undefined}
            showQualityAlerts={overlayMode !== "default"}
            className="h-full"
          />

          {/* Topology warning badges overlay */}
          {currentLevel.level === "system" && (
            <div className="absolute top-3 right-3 z-10 flex flex-col gap-1 pointer-events-none">
              {(() => {
                const warnings: Array<{ label: string; color: string; count: number }> = [];
                // SPOF: modules with only 1 file (fragile)
                const tinyModules = model.modules.filter((m) => m.fileCount <= 1 && m.symbols.length > 0);
                if (tinyModules.length > 0) warnings.push({ label: "SPOF", color: "#ef4444", count: tinyModules.length });
                // God modules: 300+ symbols
                const godModules = model.modules.filter((m) => m.symbols.length > 300);
                if (godModules.length > 0) warnings.push({ label: "GOD MODULE", color: "#f97316", count: godModules.length });
                // Circular deps
                const circularCount = analysisData.coupling?.circularDependencies?.length || 0;
                if (circularCount > 0) warnings.push({ label: "CIRCULAR", color: "#fbbf24", count: circularCount });
                // Security issues
                const secCount = analysisData.security?.totalIssues || 0;
                if (secCount > 0) warnings.push({ label: "VULNERABILITIES", color: "#ef4444", count: secCount });
                // Simulator incidents
                const simInc = simulatorSnapshot?.incidentCount || 0;
                if (simInc > 0) warnings.push({ label: "SIM INCIDENTS", color: "#a78bfa", count: simInc });

                if (warnings.length === 0) return null;
                return warnings.map((w, i) => (
                  <div key={i} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[9px] font-bold uppercase pointer-events-auto"
                    style={{ backgroundColor: `${w.color}20`, color: w.color, border: `1px solid ${w.color}40` }}>
                    <span className="w-4 h-4 rounded-full flex items-center justify-center text-[8px]" style={{ backgroundColor: `${w.color}30` }}>{w.count}</span>
                    {w.label}
                  </div>
                ));
              })()}
            </div>
          )}
        </div>

        {/* Bottom Panel */}
        {currentLevel.level === "system" && (
          <div className="border-t border-[var(--color-border-subtle)] bg-surface">
            <div className="flex items-center gap-0.5 px-4 pt-1">
              <button onClick={() => setBottomTab("trace")} className={`px-3 py-1 rounded-t text-[10px] font-medium ${bottomTab === "trace" ? "bg-elevated text-archlens-300" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"}`}>
                <Zap className="h-3 w-3 inline mr-1" />Feature Tracing
              </button>
              <button onClick={() => setBottomTab("matrix")} className={`px-3 py-1 rounded-t text-[10px] font-medium ${bottomTab === "matrix" ? "bg-elevated text-archlens-300" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"}`}>
                <Grid3x3 className="h-3 w-3 inline mr-1" />Dependency Matrix
              </button>
            </div>
            <div className="px-4 pb-3 pt-2 max-h-[220px] overflow-auto">
              {bottomTab === "trace" ? <FeatureTracer model={model} graphRef={graphRef as any} /> : <DependencyMatrix model={model} />}
            </div>
          </div>
        )}
      </div>

      {/* ── RIGHT: Code Panel ── */}
      <aside className={`border-l border-[var(--color-border-subtle)] bg-surface overflow-hidden flex flex-col transition-all duration-200 absolute right-0 top-0 h-full z-20 shadow-2xl ${rightPanelOpen && selectedNode ? "w-80" : "w-0"}`}>
        {/* Close button */}
        {rightPanelOpen && (
          <button onClick={() => setRightPanelOpen(false)} className="absolute top-2 right-2 z-30 p-1 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-elevated" title="Close">✕</button>
        )}
        {selectedNode ? (
          <CodePanel model={model} selectedId={selectedNode} level={currentLevel.level} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-elevated flex items-center justify-center mb-4">
              <Layers className="h-8 w-8 text-[var(--color-border-default)]" />
            </div>
            <p className="text-sm font-medium text-[var(--color-text-muted)]">Select a module</p>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-1">Click to inspect · Double-click to drill down</p>
            {impactMode && <p className="text-[11px] text-red-400 mt-2">Impact mode active</p>}

            {/* Impact Result */}
            {impactResult && impactResult.total > 0 && (
              <div className="mt-4 w-full text-left bg-elevated rounded-xl p-3 space-y-1.5">
                <div className="text-[10px] uppercase font-semibold text-[var(--color-text-muted)]">Blast Radius</div>
                <div className="flex items-center gap-2 text-xs"><div className="w-2.5 h-2.5 rounded-full bg-red-500" /> <span className="text-red-400">WILL BREAK: {impactResult.d1.length}</span></div>
                <div className="flex items-center gap-2 text-xs"><div className="w-2.5 h-2.5 rounded-full bg-orange-500" /> <span className="text-orange-400">LIKELY AFFECTED: {impactResult.d2.length}</span></div>
                <div className="flex items-center gap-2 text-xs"><div className="w-2.5 h-2.5 rounded-full bg-yellow-500" /> <span className="text-yellow-400">MAY NEED TEST: {impactResult.d3.length}</span></div>
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
    </div>
  );
}
