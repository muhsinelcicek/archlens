/**
 * ConstellationGraph — Railway × Constellation × Block Diagram hybrid
 *
 * - Grouped by architectural layer (Block Diagram)
 * - Card-based nodes with health dot (Railway)
 * - Glowing edges on dark background (Constellation)
 * - Pure HTML/CSS + SVG (no Sigma.js, no WebGL)
 * - Dagre-inspired layered auto-layout
 */

import { useMemo, useState } from "react";
import { motion } from "framer-motion";

export interface ConstellationNode {
  id: string;
  label: string;
  layer: string;
  fileCount: number;
  symbolCount: number;
  score?: number;     // 0-100 health
  language?: string;
}

export interface ConstellationEdge {
  source: string;
  target: string;
  weight: number;
}

interface Props {
  nodes: ConstellationNode[];
  edges: ConstellationEdge[];
  selectedId: string | null;
  onNodeClick: (id: string) => void;
  onNodeDoubleClick: (id: string) => void;
  showRisk?: boolean;
}

const LAYER_ORDER = ["presentation", "api", "application", "domain", "infrastructure", "config", "unknown"];
const LAYER_LABELS: Record<string, string> = {
  presentation: "Presentation", api: "API", application: "Application",
  domain: "Domain", infrastructure: "Infrastructure", config: "Config", unknown: "Other",
};
const LAYER_COLORS: Record<string, string> = {
  presentation: "#34d399", api: "#60a5fa", application: "#fbbf24",
  domain: "#a78bfa", infrastructure: "#f87171", config: "#94a3b8", unknown: "#6b7280",
};

function scoreColor(score: number): string {
  if (score >= 80) return "#34d399";
  if (score >= 60) return "#fbbf24";
  if (score >= 40) return "#f97316";
  return "#ef4444";
}

// Simple layered layout
function layoutNodes(nodes: ConstellationNode[]): Map<string, { x: number; y: number; layerIdx: number }> {
  const positions = new Map<string, { x: number; y: number; layerIdx: number }>();

  // Group by layer
  const byLayer = new Map<string, ConstellationNode[]>();
  for (const n of nodes) {
    const layer = n.layer || "unknown";
    if (!byLayer.has(layer)) byLayer.set(layer, []);
    byLayer.get(layer)!.push(n);
  }

  const NODE_W = 180;
  const NODE_H = 72;
  const GAP_X = 40;
  const GAP_Y = 100;
  const LAYER_PAD = 50;

  let globalY = 40;

  for (let li = 0; li < LAYER_ORDER.length; li++) {
    const layer = LAYER_ORDER[li];
    const layerNodes = byLayer.get(layer);
    if (!layerNodes || layerNodes.length === 0) continue;

    const totalWidth = layerNodes.length * NODE_W + (layerNodes.length - 1) * GAP_X;
    const startX = Math.max(40, (900 - totalWidth) / 2); // center

    for (let ni = 0; ni < layerNodes.length; ni++) {
      positions.set(layerNodes[ni].id, {
        x: startX + ni * (NODE_W + GAP_X),
        y: globalY + LAYER_PAD,
        layerIdx: li,
      });
    }

    globalY += NODE_H + GAP_Y;
  }

  return positions;
}

export function ConstellationGraph({ nodes, edges, selectedId, onNodeClick, onNodeDoubleClick, showRisk }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const positions = useMemo(() => layoutNodes(nodes), [nodes]);

  // Layer groups for block diagram outlines
  const layerGroups = useMemo(() => {
    const groups: Array<{ layer: string; color: string; label: string; x: number; y: number; w: number; h: number }> = [];
    const byLayer = new Map<string, Array<{ x: number; y: number }>>();
    for (const [id, pos] of positions) {
      const node = nodes.find((n) => n.id === id);
      const layer = node?.layer || "unknown";
      if (!byLayer.has(layer)) byLayer.set(layer, []);
      byLayer.get(layer)!.push(pos);
    }
    for (const [layer, posArr] of byLayer) {
      const minX = Math.min(...posArr.map((p) => p.x)) - 24;
      const maxX = Math.max(...posArr.map((p) => p.x)) + 180 + 24;
      const minY = Math.min(...posArr.map((p) => p.y)) - 28;
      const maxY = Math.max(...posArr.map((p) => p.y)) + 72 + 20;
      groups.push({
        layer,
        color: LAYER_COLORS[layer] || "#6b7280",
        label: LAYER_LABELS[layer] || layer,
        x: minX, y: minY,
        w: maxX - minX, h: maxY - minY,
      });
    }
    return groups;
  }, [positions, nodes]);

  // SVG dimensions
  const maxX = Math.max(...[...positions.values()].map((p) => p.x), 800) + 240;
  const maxY = Math.max(...[...positions.values()].map((p) => p.y), 400) + 120;

  return (
    <div className="w-full h-full overflow-auto" style={{ backgroundColor: "var(--color-void)" }}>
      <div className="relative" style={{ minWidth: maxX, minHeight: maxY }}>

        {/* SVG: layer outlines + edges */}
        <svg className="absolute inset-0" width={maxX} height={maxY} style={{ pointerEvents: "none" }}>
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-strong">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Layer group outlines (Block Diagram) */}
          {layerGroups.map((g) => (
            <g key={g.layer}>
              <rect
                x={g.x} y={g.y} width={g.w} height={g.h}
                rx={12}
                fill="none"
                stroke={g.color}
                strokeWidth={1}
                strokeDasharray="6 4"
                opacity={0.15}
              />
              <text x={g.x + 12} y={g.y + 14} fontSize={10} fill={g.color} opacity={0.4} fontWeight={600} fontFamily="var(--font-sans)">
                {g.label.toUpperCase()}
              </text>
            </g>
          ))}

          {/* Edges (Constellation glow lines) */}
          {edges.map((edge, i) => {
            const from = positions.get(edge.source);
            const to = positions.get(edge.target);
            if (!from || !to) return null;

            const x1 = from.x + 90;
            const y1 = from.y + 72;
            const x2 = to.x + 90;
            const y2 = to.y;

            const isHighlighted = hoveredId === edge.source || hoveredId === edge.target || selectedId === edge.source || selectedId === edge.target;
            const midY = (y1 + y2) / 2;
            const path = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

            return (
              <g key={i}>
                {/* Glow layer — always glowing, brighter on highlight */}
                <path
                  d={path}
                  fill="none"
                  stroke={isHighlighted ? "#a78bfa" : "#6366f1"}
                  strokeWidth={isHighlighted ? 3 : 1.5}
                  opacity={isHighlighted ? 0.8 : 0.35}
                  filter="url(#glow)"
                />
                {/* Animated dot */}
                {isHighlighted && (
                  <circle r="3" fill="#c4b5fd" filter="url(#glow)">
                    <animateMotion dur="2s" repeatCount="indefinite" path={path} />
                  </circle>
                )}
              </g>
            );
          })}
        </svg>

        {/* Nodes (Railway-style cards with Constellation glow) */}
        {nodes.map((node) => {
          const pos = positions.get(node.id);
          if (!pos) return null;

          const isSelected = selectedId === node.id;
          const isHovered = hoveredId === node.id;
          const color = LAYER_COLORS[node.layer] || "#6b7280";
          const healthColor = node.score !== undefined ? scoreColor(node.score) : color;
          // Always glow — idle=6, hover=14, selected=22, risk-low=10
          const baseGlow = 6;
          const riskGlow = (showRisk && node.score !== undefined && node.score < 60) ? 10 : baseGlow;
          const glowIntensity = isSelected ? 22 : isHovered ? 14 : riskGlow;

          return (
            <motion.div
              key={node.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: pos.layerIdx * 0.05, duration: 0.3 }}
              className="absolute cursor-pointer select-none"
              style={{
                left: pos.x,
                top: pos.y,
                width: 180,
              }}
              onClick={() => onNodeClick(node.id)}
              onDoubleClick={() => onNodeDoubleClick(node.id)}
              onMouseEnter={() => setHoveredId(node.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <div
                className="rounded-xl p-3 transition-all duration-200"
                style={{
                  backgroundColor: "var(--color-surface)",
                  border: `1px solid ${isSelected ? color : "rgba(255,255,255,0.06)"}`,
                  boxShadow: `0 0 ${glowIntensity}px ${isSelected ? color : healthColor}40, inset 0 1px 0 rgba(255,255,255,0.04)`,
                  transform: isHovered ? "translateY(-2px)" : "none",
                }}
              >
                {/* Header: dot + name */}
                <div className="flex items-center gap-2 mb-1.5">
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: showRisk ? healthColor : color,
                      boxShadow: `0 0 8px ${showRisk ? healthColor : color}80, 0 0 16px ${showRisk ? healthColor : color}30`,
                    }}
                  />
                  <span className="text-[13px] font-semibold text-[var(--color-text-primary)] truncate">
                    {node.label}
                  </span>
                </div>

                {/* Info line */}
                <div className="flex items-center justify-between text-[10px] text-[var(--color-text-muted)]">
                  <span>{node.layer} · {node.fileCount}f</span>
                  {showRisk && node.score !== undefined && (
                    <span className="font-semibold" style={{ color: healthColor }}>{node.score}</span>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
