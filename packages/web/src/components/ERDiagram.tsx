import { useEffect, useRef, useState, useCallback } from "react";
import { useTheme } from "../lib/theme.js";

interface Column {
  name: string;
  type: string;
  primary?: boolean;
  nullable?: boolean;
}

interface Entity {
  name: string;
  tableName?: string;
  columns: Column[];
}

interface ERDiagramProps {
  entities: Entity[];
  className?: string;
}

interface TablePos { x: number; y: number; width: number; height: number }
interface Relationship { from: string; fromCol: string; to: string; type: "1:N" | "1:1" }

const HEADER_H = 44;
const ROW_H = 30;
const TABLE_W = 280;
const GAP_X = 80;
const GAP_Y = 60;

function getTypeColor(type: string): string {
  if (!type) return "#6b7280";
  const t = type.toLowerCase();
  if (t.includes("string") || t.includes("char") || t.includes("text")) return "#34d399";
  if (t.includes("int") || t.includes("long") || t.includes("short")) return "#60a5fa";
  if (t.includes("decimal") || t.includes("float") || t.includes("double") || t.includes("money")) return "#fbbf24";
  if (t.includes("bool")) return "#a78bfa";
  if (t.includes("date") || t.includes("time")) return "#f472b6";
  if (t.includes("guid") || t.includes("uuid")) return "#06b6d4";
  if (t.includes("collection") || t.includes("list") || t.includes("enumerable") || t.includes("readonly")) return "#f97316";
  return "var(--color-text-secondary)";
}

function detectRelationships(entities: Entity[]): Relationship[] {
  const rels: Relationship[] = [];
  const names = new Set(entities.map((e) => e.name));
  const seen = new Set<string>();

  for (const entity of entities) {
    for (const col of entity.columns) {
      if (col.name.endsWith("Id") && col.name !== "Id") {
        const ref = col.name.replace(/Id$/, "");
        if (names.has(ref) && !seen.has(`${entity.name}-${ref}`)) {
          seen.add(`${entity.name}-${ref}`);
          rels.push({ from: entity.name, fromCol: col.name, to: ref, type: "1:N" });
        }
      }
      const clean = col.type.replace(/^I?(ReadOnly)?Collection<|>$|^IEnumerable<|^List</g, "").trim();
      if (names.has(clean) && clean !== entity.name && !seen.has(`${entity.name}-${clean}`)) {
        seen.add(`${entity.name}-${clean}`);
        rels.push({ from: entity.name, fromCol: col.name, to: clean, type: "1:N" });
      }
    }
  }
  return rels;
}

export function ERDiagram({ entities, className = "" }: ERDiagramProps) {
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<Map<string, TablePos>>(new Map());
  const [dragging, setDragging] = useState<{ entity: string; ox: number; oy: number } | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [hovered, setHovered] = useState<string | null>(null);
  const relsRef = useRef<Relationship[]>([]);

  useEffect(() => {
    if (!entities.length) return;
    relsRef.current = detectRelationships(entities);
    const cols = Math.ceil(Math.sqrt(entities.length));
    const sorted = [...entities].sort((a, b) => b.columns.length - a.columns.length);
    const pos = new Map<string, TablePos>();
    sorted.forEach((e, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      pos.set(e.name, { x: 60 + c * (TABLE_W + GAP_X), y: 60 + r * (220 + GAP_Y), width: TABLE_W, height: HEADER_H + Math.max(e.columns.length, 1) * ROW_H + 8 });
    });
    setPositions(pos);
  }, [entities]);

  const render = useCallback(() => {
    const canvas = canvasRef.current, container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`; canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // BG
    ctx.fillStyle = theme.colors.void; ctx.fillRect(0, 0, rect.width, rect.height);
    // Grid
    ctx.fillStyle = theme.colors.borderSubtle;
    const gs = 20 * zoom;
    for (let gx = (pan.x * zoom) % gs; gx < rect.width; gx += gs)
      for (let gy = (pan.y * zoom) % gs; gy < rect.height; gy += gs) { ctx.beginPath(); ctx.arc(gx, gy, 0.5, 0, Math.PI * 2); ctx.fill(); }

    ctx.save(); ctx.translate(pan.x * zoom, pan.y * zoom); ctx.scale(zoom, zoom);

    // Relationships
    for (const rel of relsRef.current) {
      const fp = positions.get(rel.from), tp = positions.get(rel.to);
      if (!fp || !tp) continue;
      const hi = hovered === rel.from || hovered === rel.to;
      const fromE = entities.find((e) => e.name === rel.from);
      const ci = fromE?.columns.findIndex((c) => c.name === rel.fromCol) ?? 0;
      const fy = fp.y + HEADER_H + Math.max(ci, 0) * ROW_H + ROW_H / 2;
      const fx = fp.x + fp.width, tx = tp.x, ty = tp.y + HEADER_H / 2;

      ctx.strokeStyle = hi ? "#7c3aed" : "var(--color-border-default)"; ctx.lineWidth = hi ? 2.5 : 1.5;
      ctx.beginPath(); ctx.moveTo(fx, fy);
      const cx = (fx + tx) / 2;
      ctx.bezierCurveTo(cx + 40, fy, cx - 40, ty, tx, ty); ctx.stroke();

      // Arrow
      ctx.fillStyle = hi ? "#7c3aed" : "var(--color-border-default)";
      ctx.beginPath();
      const a = Math.atan2(ty - fy, tx - fx);
      ctx.moveTo(tx, ty); ctx.lineTo(tx - 8 * Math.cos(a - 0.4), ty - 8 * Math.sin(a - 0.4));
      ctx.lineTo(tx - 8 * Math.cos(a + 0.4), ty - 8 * Math.sin(a + 0.4)); ctx.fill();

      // Labels
      ctx.font = "bold 10px 'JetBrains Mono'"; ctx.fillStyle = hi ? "#a78bfa" : "#3a3a4a";
      ctx.fillText("1", fx + 6, fy - 6); ctx.fillText("*", tx - 14, ty - 6);
    }

    // Tables
    for (const entity of entities) {
      const p = positions.get(entity.name);
      if (!p) continue;
      const hi = hovered === entity.name;

      // Shadow
      ctx.shadowColor = hi ? "rgba(124,58,237,0.25)" : "rgba(0,0,0,0.35)";
      ctx.shadowBlur = hi ? 24 : 14; ctx.shadowOffsetY = hi ? 6 : 3;

      // Card
      rr(ctx, p.x, p.y, p.width, p.height, 10);
      ctx.fillStyle = theme.colors.surface; ctx.fill();
      ctx.strokeStyle = hi ? "#7c3aed" : theme.colors.borderDefault;
      ctx.lineWidth = hi ? 2 : 1; ctx.stroke();
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

      // Header bg
      rrTop(ctx, p.x, p.y, p.width, HEADER_H, 10);
      ctx.fillStyle = hi ? "rgba(124,58,237,0.15)" : "rgba(124,58,237,0.06)"; ctx.fill();

      // Header line
      ctx.strokeStyle = theme.colors.borderSubtle; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(p.x, p.y + HEADER_H); ctx.lineTo(p.x + p.width, p.y + HEADER_H); ctx.stroke();

      // Name
      ctx.fillStyle = "var(--color-text-primary)"; ctx.font = "bold 14px 'Outfit', sans-serif";
      ctx.fillText(entity.name, p.x + 14, p.y + HEADER_H / 2 + 5);

      // Badge
      if (entity.tableName) {
        ctx.font = "10px 'JetBrains Mono'"; ctx.fillStyle = "var(--color-text-muted)";
        const tw = ctx.measureText(entity.tableName).width;
        ctx.fillText(entity.tableName, p.x + p.width - tw - 12, p.y + HEADER_H / 2 + 4);
      }

      // Columns
      entity.columns.forEach((col, i) => {
        const cy = p.y + HEADER_H + i * ROW_H, ty = cy + ROW_H / 2 + 4;

        // Separator
        if (i < entity.columns.length - 1) {
          ctx.strokeStyle = theme.colors.borderSubtle; ctx.lineWidth = 0.5;
          ctx.beginPath(); ctx.moveTo(p.x + 10, cy + ROW_H); ctx.lineTo(p.x + p.width - 10, cy + ROW_H); ctx.stroke();
        }

        // PK
        if (col.primary) {
          ctx.fillStyle = "#fbbf24";
          ctx.shadowColor = "rgba(251,191,36,0.4)"; ctx.shadowBlur = 6;
          ctx.beginPath(); ctx.arc(p.x + 16, cy + ROW_H / 2, 4, 0, Math.PI * 2); ctx.fill();
          ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
        }

        // Name
        ctx.font = `${col.primary ? "600" : "400"} 12px 'JetBrains Mono'`;
        ctx.fillStyle = col.primary ? "#fbbf24" : "var(--color-text-primary)";
        ctx.fillText(col.name, col.primary ? p.x + 28 : p.x + 16, ty);

        // Type pill
        const tc = getTypeColor(col.type);
        const tt = col.type.length > 18 ? col.type.slice(0, 16) + ".." : col.type;
        ctx.font = "11px 'JetBrains Mono'";
        const ttw = ctx.measureText(tt).width;
        rr(ctx, p.x + p.width - ttw - 22, cy + ROW_H / 2 - 9, ttw + 12, 18, 4);
        ctx.fillStyle = tc + "18"; ctx.fill();
        ctx.fillStyle = tc; ctx.fillText(tt, p.x + p.width - ttw - 16, ty);
      });

      if (!entity.columns.length) { ctx.fillStyle = "var(--color-text-muted)"; ctx.font = "italic 11px 'Outfit'"; ctx.fillText("No columns", p.x + 16, p.y + HEADER_H + 20); }
    }

    ctx.restore();
  }, [entities, positions, pan, zoom, hovered, theme]);

  useEffect(() => { render(); }, [render]);
  useEffect(() => { const o = new ResizeObserver(render); if (containerRef.current) o.observe(containerRef.current); return () => o.disconnect(); }, [render]);

  const cp = (e: React.MouseEvent) => { const r = canvasRef.current!.getBoundingClientRect(); return { x: (e.clientX - r.left) / zoom - pan.x, y: (e.clientY - r.top) / zoom - pan.y }; };
  const findAt = (cx: number, cy: number) => { for (const e of entities) { const p = positions.get(e.name); if (p && cx >= p.x && cx <= p.x + p.width && cy >= p.y && cy <= p.y + p.height) return e.name; } return null; };

  if (!entities.length) return <div className={`flex items-center justify-center h-full text-[var(--color-text-muted)] ${className}`}>No database entities detected</div>;

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${className}`}>
      <canvas ref={canvasRef} className="w-full h-full cursor-grab active:cursor-grabbing"
        onMouseDown={(e) => { const p = cp(e), en = findAt(p.x, p.y); if (en) { const ep = positions.get(en)!; setDragging({ entity: en, ox: p.x - ep.x, oy: p.y - ep.y }); } }}
        onMouseMove={(e) => { const p = cp(e); if (dragging) { setPositions((pr) => { const n = new Map(pr), op = n.get(dragging.entity)!; n.set(dragging.entity, { ...op, x: p.x - dragging.ox, y: p.y - dragging.oy }); return n; }); } else { setHovered(findAt(p.x, p.y)); } }}
        onMouseUp={() => setDragging(null)} onMouseLeave={() => setDragging(null)}
        onWheel={(e) => { e.preventDefault(); if (e.ctrlKey || e.metaKey) setZoom((z) => Math.max(0.3, Math.min(3, z - e.deltaY * 0.002))); else setPan((p) => ({ x: p.x - e.deltaX / zoom, y: p.y - e.deltaY / zoom })); }}
      />
      <div className="absolute bottom-4 right-4 flex flex-col gap-1.5">
        <button onClick={() => setZoom((z) => Math.min(3, z * 1.3))} className="w-9 h-9 bg-slate-800/70 hover:bg-slate-700 border border-slate-600/40 rounded-lg flex items-center justify-center text-slate-300 text-sm backdrop-blur-md shadow-lg">+</button>
        <button onClick={() => setZoom((z) => Math.max(0.3, z / 1.3))} className="w-9 h-9 bg-slate-800/70 hover:bg-slate-700 border border-slate-600/40 rounded-lg flex items-center justify-center text-slate-300 text-sm backdrop-blur-md shadow-lg">−</button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="w-9 h-9 bg-slate-800/70 hover:bg-slate-700 border border-slate-600/40 rounded-lg flex items-center justify-center text-slate-300 text-sm backdrop-blur-md shadow-lg">⊡</button>
      </div>
      <div className="absolute top-4 left-4 bg-slate-900/70 backdrop-blur-md border border-slate-700/40 rounded-lg px-3 py-2 text-[10px] text-slate-400">
        {entities.length} tables · {entities.reduce((a, e) => a + e.columns.length, 0)} columns · {relsRef.current.length} relations
      </div>
      <div className="absolute bottom-4 left-4 bg-slate-900/70 backdrop-blur-md border border-slate-700/40 rounded-lg p-2.5 flex gap-3 text-[9px] text-slate-400">
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber-400" /> PK</div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-400" /> string</div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-400" /> int</div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-pink-400" /> date</div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-orange-400" /> collection</div>
      </div>
    </div>
  );
}

function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
}
function rrTop(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h); c.lineTo(x, y + h); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
}
