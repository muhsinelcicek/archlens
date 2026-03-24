import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

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

const CARD_WIDTH = 260;
const HEADER_HEIGHT = 40;
const ROW_HEIGHT = 28;
const CARD_GAP_X = 60;
const CARD_GAP_Y = 40;
const PADDING = 40;

const typeColors: Record<string, string> = {
  String: "#10b981",
  Integer: "#3b82f6",
  Numeric: "#f59e0b",
  Float: "#f59e0b",
  Boolean: "#8b5cf6",
  DateTime: "#ec4899",
  Date: "#ec4899",
  Enum: "#06b6d4",
  Text: "#10b981",
};

export function ERDiagram({ entities, className = "" }: ERDiagramProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredEntity, setHoveredEntity] = useState<string | null>(null);

  useEffect(() => {
    if (!svgRef.current || entities.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Calculate layout — grid
    const cols = Math.ceil(Math.sqrt(entities.length));
    const positions = entities.map((entity, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cardHeight = HEADER_HEIGHT + entity.columns.length * ROW_HEIGHT + 8;
      return {
        entity,
        x: PADDING + col * (CARD_WIDTH + CARD_GAP_X),
        y: PADDING + row * (Math.max(...entities.map((e) => HEADER_HEIGHT + e.columns.length * ROW_HEIGHT + 8)) + CARD_GAP_Y),
        width: CARD_WIDTH,
        height: cardHeight,
      };
    });

    const totalWidth = PADDING * 2 + cols * (CARD_WIDTH + CARD_GAP_X);
    const maxRow = Math.ceil(entities.length / cols);
    const maxCardHeight = Math.max(...entities.map((e) => HEADER_HEIGHT + e.columns.length * ROW_HEIGHT + 8));
    const totalHeight = PADDING * 2 + maxRow * (maxCardHeight + CARD_GAP_Y);

    svg.attr("viewBox", `0 0 ${totalWidth} ${totalHeight}`);

    // Defs — shadows and gradients
    const defs = svg.append("defs");

    // Drop shadow
    const filter = defs.append("filter").attr("id", "card-shadow").attr("x", "-10%").attr("y", "-10%").attr("width", "130%").attr("height", "130%");
    filter.append("feDropShadow").attr("dx", 0).attr("dy", 4).attr("stdDeviation", 8).attr("flood-color", "#000").attr("flood-opacity", 0.4);

    // Glow for PK
    const glow = defs.append("filter").attr("id", "pk-glow");
    glow.append("feGaussianBlur").attr("stdDeviation", 2).attr("result", "coloredBlur");
    const merge = glow.append("feMerge");
    merge.append("feMergeNode").attr("in", "coloredBlur");
    merge.append("feMergeNode").attr("in", "SourceGraphic");

    // Main group with zoom/pan
    const g = svg.append("g");

    // Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom);

    // Draw entity cards
    for (const pos of positions) {
      const { entity, x, y, width, height } = pos;

      const card = g.append("g")
        .attr("class", "entity-card")
        .attr("transform", `translate(${x}, ${y})`)
        .style("cursor", "pointer");

      // Card background
      card.append("rect")
        .attr("width", width)
        .attr("height", height)
        .attr("rx", 12)
        .attr("fill", "#18181b")
        .attr("stroke", hoveredEntity === entity.name ? "#10b981" : "#27272a")
        .attr("stroke-width", hoveredEntity === entity.name ? 2 : 1)
        .attr("filter", "url(#card-shadow)")
        .on("mouseenter", () => setHoveredEntity(entity.name))
        .on("mouseleave", () => setHoveredEntity(null));

      // Header background
      card.append("rect")
        .attr("width", width)
        .attr("height", HEADER_HEIGHT)
        .attr("rx", 12)
        .attr("fill", "#10b981")
        .attr("opacity", 0.15);

      // Fix bottom corners of header
      card.append("rect")
        .attr("y", HEADER_HEIGHT - 12)
        .attr("width", width)
        .attr("height", 12)
        .attr("fill", "#10b981")
        .attr("opacity", 0.15);

      // Entity name
      card.append("text")
        .attr("x", 16)
        .attr("y", HEADER_HEIGHT / 2 + 1)
        .attr("dominant-baseline", "middle")
        .attr("fill", "#10b981")
        .attr("font-size", "14px")
        .attr("font-weight", "bold")
        .attr("font-family", "'JetBrains Mono', 'SF Mono', monospace")
        .text(entity.name);

      // Table name badge
      if (entity.tableName) {
        card.append("text")
          .attr("x", width - 16)
          .attr("y", HEADER_HEIGHT / 2 + 1)
          .attr("dominant-baseline", "middle")
          .attr("text-anchor", "end")
          .attr("fill", "#52525b")
          .attr("font-size", "10px")
          .attr("font-family", "'JetBrains Mono', monospace")
          .text(entity.tableName);
      }

      // Separator line
      card.append("line")
        .attr("x1", 0).attr("y1", HEADER_HEIGHT)
        .attr("x2", width).attr("y2", HEADER_HEIGHT)
        .attr("stroke", "#27272a");

      // Columns
      entity.columns.forEach((col, i) => {
        const rowY = HEADER_HEIGHT + i * ROW_HEIGHT + ROW_HEIGHT / 2 + 4;
        const typeColor = typeColors[col.type] || "#71717a";

        // PK indicator
        if (col.primary) {
          card.append("circle")
            .attr("cx", 16)
            .attr("cy", rowY)
            .attr("r", 4)
            .attr("fill", "#fbbf24")
            .attr("filter", "url(#pk-glow)");
        }

        // Column name
        card.append("text")
          .attr("x", col.primary ? 28 : 16)
          .attr("y", rowY)
          .attr("dominant-baseline", "middle")
          .attr("fill", col.primary ? "#fbbf24" : "#d4d4d8")
          .attr("font-size", "12px")
          .attr("font-family", "'JetBrains Mono', monospace")
          .attr("font-weight", col.primary ? "600" : "400")
          .text(col.name);

        // Type badge
        const typeText = card.append("text")
          .attr("x", width - 16)
          .attr("y", rowY)
          .attr("dominant-baseline", "middle")
          .attr("text-anchor", "end")
          .attr("font-size", "10px")
          .attr("font-family", "'JetBrains Mono', monospace");

        typeText.append("tspan")
          .attr("fill", typeColor)
          .text(col.type);

        if (!col.nullable && !col.primary) {
          typeText.append("tspan")
            .attr("fill", "#ef4444")
            .attr("font-size", "8px")
            .text(" !");
        }

        // Row separator
        if (i < entity.columns.length - 1) {
          card.append("line")
            .attr("x1", 12).attr("y1", rowY + ROW_HEIGHT / 2)
            .attr("x2", width - 12).attr("y2", rowY + ROW_HEIGHT / 2)
            .attr("stroke", "#1f1f23")
            .attr("stroke-dasharray", "2,4");
        }
      });

      // Column count badge
      card.append("text")
        .attr("x", width / 2)
        .attr("y", height - 4)
        .attr("text-anchor", "middle")
        .attr("fill", "#3f3f46")
        .attr("font-size", "9px")
        .text(`${entity.columns.length} columns`);
    }

    // Auto-fit
    svg.call(zoom.transform, d3.zoomIdentity);
  }, [entities, hoveredEntity]);

  if (entities.length === 0) {
    return (
      <div className={`flex items-center justify-center h-full text-[#707070] ${className}`}>
        No database entities detected
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  );
}
