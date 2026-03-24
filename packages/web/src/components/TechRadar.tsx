import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

interface TechEntry {
  name: string;
  version?: string;
  category: string;
  source: string;
}

interface TechRadarProps {
  entries: TechEntry[];
  className?: string;
}

const categoryConfig: Record<string, { color: string; angle: number }> = {
  framework: { color: "#3b82f6", angle: 0 },
  library: { color: "#10b981", angle: 90 },
  tool: { color: "#f59e0b", angle: 180 },
  database: { color: "#ef4444", angle: 270 },
  language: { color: "#8b5cf6", angle: 45 },
  runtime: { color: "#06b6d4", angle: 135 },
};

export function TechRadar({ entries, className = "" }: TechRadarProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [tooltipData, setTooltipData] = useState<TechEntry | null>(null);

  useEffect(() => {
    if (!svgRef.current || entries.length === 0) return;

    const width = 700;
    const height = 700;
    const cx = width / 2;
    const cy = height / 2;
    const maxRadius = Math.min(cx, cy) - 60;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const g = svg.append("g").attr("transform", `translate(${cx}, ${cy})`);

    // Rings
    const rings = [
      { label: "Adopt", radius: maxRadius * 0.3 },
      { label: "Trial", radius: maxRadius * 0.55 },
      { label: "Assess", radius: maxRadius * 0.78 },
      { label: "Hold", radius: maxRadius },
    ];

    // Draw ring backgrounds
    for (let i = rings.length - 1; i >= 0; i--) {
      g.append("circle")
        .attr("r", rings[i].radius)
        .attr("fill", i % 2 === 0 ? "#0f0f12" : "#131318")
        .attr("stroke", "#1f1f28")
        .attr("stroke-width", 1);
    }

    // Ring labels
    for (const ring of rings) {
      g.append("text")
        .attr("x", 4)
        .attr("y", -ring.radius + 16)
        .attr("fill", "#3f3f46")
        .attr("font-size", "11px")
        .attr("font-weight", "600")
        .attr("font-family", "'Inter', sans-serif")
        .text(ring.label);
    }

    // Cross lines
    g.append("line").attr("x1", -maxRadius).attr("y1", 0).attr("x2", maxRadius).attr("y2", 0).attr("stroke", "#1f1f28");
    g.append("line").attr("x1", 0).attr("y1", -maxRadius).attr("x2", 0).attr("y2", maxRadius).attr("stroke", "#1f1f28");

    // Category labels at quadrant edges
    const categories = [...new Set(entries.map((e) => e.category))];
    categories.forEach((cat, i) => {
      const angle = (i / categories.length) * Math.PI * 2 - Math.PI / 2;
      const labelR = maxRadius + 30;
      g.append("text")
        .attr("x", Math.cos(angle) * labelR)
        .attr("y", Math.sin(angle) * labelR)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .attr("fill", categoryConfig[cat]?.color || "#71717a")
        .attr("font-size", "12px")
        .attr("font-weight", "bold")
        .attr("text-transform", "uppercase")
        .text(cat);
    });

    // Place dots — spread within their category quadrant
    const categoryEntries = new Map<string, TechEntry[]>();
    for (const entry of entries) {
      if (!categoryEntries.has(entry.category)) categoryEntries.set(entry.category, []);
      categoryEntries.get(entry.category)!.push(entry);
    }

    let dotIndex = 0;
    for (const [cat, catEntries] of categoryEntries) {
      const catIndex = categories.indexOf(cat);
      const baseAngle = (catIndex / categories.length) * Math.PI * 2 - Math.PI / 2;
      const spread = (1 / categories.length) * Math.PI * 2;

      catEntries.forEach((entry, i) => {
        // Spread within quadrant
        const angle = baseAngle + (i / (catEntries.length + 1)) * spread - spread * 0.4;
        // All entries go in "Adopt" ring for now (could be categorized by age/popularity)
        const radius = rings[0].radius * 0.4 + Math.random() * (rings[1].radius - rings[0].radius * 0.4);

        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        const color = categoryConfig[cat]?.color || "#71717a";

        const dot = g.append("g")
          .attr("transform", `translate(${x}, ${y})`)
          .style("cursor", "pointer");

        dot.append("circle")
          .attr("r", 6)
          .attr("fill", color)
          .attr("opacity", hovered === entry.name ? 1 : 0.8)
          .attr("stroke", hovered === entry.name ? "#fff" : "transparent")
          .attr("stroke-width", 2);

        // Label (only show for first few per category to avoid clutter)
        if (i < 5 || hovered === entry.name) {
          dot.append("text")
            .attr("x", 10)
            .attr("y", 4)
            .attr("fill", "#a1a1aa")
            .attr("font-size", "9px")
            .attr("font-family", "'JetBrains Mono', monospace")
            .text(entry.name);
        }

        dot
          .on("mouseenter", (event) => {
            setHovered(entry.name);
            setTooltipData(entry);
            setTooltipPos({ x: event.offsetX, y: event.offsetY });
          })
          .on("mouseleave", () => {
            setHovered(null);
            setTooltipData(null);
          });

        dotIndex++;
      });
    }
  }, [entries, hovered]);

  return (
    <div className={`relative ${className}`}>
      <svg ref={svgRef} className="w-full h-full" />

      {/* Tooltip */}
      {tooltipData && (
        <div
          className="absolute pointer-events-none bg-surface border border-zinc-700 rounded-lg px-3 py-2 shadow-xl z-50"
          style={{ left: tooltipPos.x + 16, top: tooltipPos.y - 10 }}
        >
          <div className="font-mono text-sm text-white font-semibold">{tooltipData.name}</div>
          {tooltipData.version && (
            <div className="text-xs text-[#8888a0]">v{tooltipData.version}</div>
          )}
          <div className="text-xs text-[#5a5a70] mt-1">
            {tooltipData.category} / {tooltipData.source}
          </div>
        </div>
      )}

      {/* Category Legend */}
      <div className="absolute bottom-4 left-4 bg-surface/90 backdrop-blur-sm border border-[#2a2a3a] rounded-lg p-3 flex flex-wrap gap-3">
        {Object.entries(categoryConfig).map(([cat, config]) => (
          <div key={cat} className="flex items-center gap-1.5 text-xs">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: config.color }} />
            <span className="text-[#8888a0] capitalize">{cat}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
