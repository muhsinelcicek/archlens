import { useState, useMemo } from "react";
import type { ArchModel } from "../lib/store.js";

interface DependencyMatrixProps {
  model: ArchModel;
  onCellClick?: (source: string, target: string) => void;
  className?: string;
}

interface CellData {
  count: number;
  types: Record<string, number>;
  isViolation: boolean;
  isCircular: boolean;
}

const layerOrder = ["presentation", "api", "application", "domain", "infrastructure", "config", "unknown"];

export function DependencyMatrix({ model, onCellClick, className = "" }: DependencyMatrixProps) {
  const [hoveredCell, setHoveredCell] = useState<{ row: string; col: string } | null>(null);

  const { matrix, moduleNames, metrics } = useMemo(() => {
    const names = model.modules.map((m) => m.name).sort((a, b) => {
      const aLayer = layerOrder.indexOf(model.modules.find((m) => m.name === a)?.layer || "unknown");
      const bLayer = layerOrder.indexOf(model.modules.find((m) => m.name === b)?.layer || "unknown");
      return aLayer - bLayer;
    });

    // Build matrix
    const mat = new Map<string, CellData>();
    for (const rel of model.relations) {
      if (rel.type !== "imports" && rel.type !== "calls") continue;
      const srcMod = rel.source.split("/")[0];
      const tgtSym = model.symbols[rel.target] as Record<string, unknown> | undefined;
      if (!tgtSym) continue;
      const tgtMod = (tgtSym.filePath as string)?.split("/")[0];
      if (!srcMod || !tgtMod || srcMod === tgtMod) continue;

      const key = `${srcMod}→${tgtMod}`;
      if (!mat.has(key)) mat.set(key, { count: 0, types: {}, isViolation: false, isCircular: false });
      const cell = mat.get(key)!;
      cell.count++;
      cell.types[rel.type] = (cell.types[rel.type] || 0) + 1;
    }

    // Check violations + circular
    for (const [key, cell] of mat) {
      const [src, tgt] = key.split("→");
      const srcMod = model.modules.find((m) => m.name === src);
      const tgtMod = model.modules.find((m) => m.name === tgt);
      if (srcMod && tgtMod) {
        const srcIdx = layerOrder.indexOf(srcMod.layer);
        const tgtIdx = layerOrder.indexOf(tgtMod.layer);
        if (srcIdx > tgtIdx && srcIdx !== -1 && tgtIdx !== -1) cell.isViolation = true;
      }
      // Circular
      const reverseKey = `${tgt}→${src}`;
      if (mat.has(reverseKey)) cell.isCircular = true;
    }

    // Coupling metrics per module
    const metricsMap = new Map<string, { ca: number; ce: number; instability: number }>();
    for (const name of names) {
      let ca = 0; // Afferent: who depends on me
      let ce = 0; // Efferent: what I depend on
      for (const [key, cell] of mat) {
        const [src, tgt] = key.split("→");
        if (tgt === name) ca += cell.count;
        if (src === name) ce += cell.count;
      }
      const instability = ca + ce > 0 ? ce / (ca + ce) : 0;
      metricsMap.set(name, { ca, ce, instability: Math.round(instability * 100) / 100 });
    }

    return { matrix: mat, moduleNames: names, metrics: metricsMap };
  }, [model]);

  const maxCount = Math.max(1, ...Array.from(matrix.values()).map((c) => c.count));

  const getCellColor = (cell: CellData | undefined): string => {
    if (!cell || cell.count === 0) return "transparent";
    if (cell.isViolation) return `rgba(239, 68, 68, ${0.3 + (cell.count / maxCount) * 0.7})`;
    if (cell.isCircular) return `rgba(249, 115, 22, ${0.3 + (cell.count / maxCount) * 0.7})`;
    const intensity = 0.15 + (cell.count / maxCount) * 0.85;
    return `rgba(99, 102, 241, ${intensity})`;
  };

  const getLayerColor = (modName: string): string => {
    const mod = model.modules.find((m) => m.name === modName);
    const colors: Record<string, string> = {
      presentation: "#10b981", api: "#3b82f6", application: "#f59e0b",
      domain: "#8b5cf6", infrastructure: "#ef4444", config: "#6b7280",
    };
    return colors[mod?.layer || ""] || "#52525b";
  };

  return (
    <div className={`${className}`}>
      <div className="overflow-auto">
        <table className="border-collapse text-[10px]">
          <thead>
            <tr>
              <th className="p-1 text-[#5a5a70] text-right w-24">from \ to</th>
              {moduleNames.map((name) => (
                <th key={name} className="p-1 w-20">
                  <div className="flex flex-col items-center gap-0.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getLayerColor(name) }} />
                    <span className="text-[#8888a0] font-mono truncate max-w-[70px]" title={name}>{name}</span>
                    <span className="text-[#5a5a70]">Ca:{metrics.get(name)?.ca || 0}</span>
                  </div>
                </th>
              ))}
              <th className="p-1 text-[#5a5a70] w-12">I</th>
            </tr>
          </thead>
          <tbody>
            {moduleNames.map((row) => {
              const mod = model.modules.find((m) => m.name === row);
              const metric = metrics.get(row);
              return (
                <tr key={row}>
                  <td className="p-1 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-[#8888a0] font-mono truncate max-w-[70px]" title={row}>{row}</span>
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: getLayerColor(row) }} />
                    </div>
                  </td>
                  {moduleNames.map((col) => {
                    const key = `${row}→${col}`;
                    const cell = matrix.get(key);
                    const isHovered = hoveredCell?.row === row && hoveredCell?.col === col;
                    const isSelf = row === col;

                    return (
                      <td
                        key={col}
                        className={`p-0 w-20 h-10 text-center relative cursor-pointer transition-all ${isSelf ? "bg-surface" : ""}`}
                        style={{
                          backgroundColor: isSelf ? "#18181b" : getCellColor(cell),
                          outline: isHovered ? "2px solid #fff" : cell?.isViolation ? "1px solid rgba(239,68,68,0.5)" : "1px solid rgba(63,63,70,0.3)",
                          zIndex: isHovered ? 10 : 1,
                        }}
                        onMouseEnter={() => setHoveredCell({ row, col })}
                        onMouseLeave={() => setHoveredCell(null)}
                        onClick={() => cell && cell.count > 0 && onCellClick?.(row, col)}
                      >
                        {!isSelf && cell && cell.count > 0 && (
                          <span className="text-white font-bold text-xs">{cell.count}</span>
                        )}
                        {isSelf && <span className="text-[#5a5a70]">-</span>}

                        {/* Tooltip */}
                        {isHovered && cell && cell.count > 0 && (
                          <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 bg-surface border border-zinc-700 rounded-lg px-3 py-2 shadow-xl whitespace-nowrap text-left">
                            <div className="text-xs font-bold text-[#e4e4ed]">{row} → {col}</div>
                            <div className="text-[10px] text-[#8888a0] mt-1">{cell.count} dependencies</div>
                            {Object.entries(cell.types).map(([type, count]) => (
                              <div key={type} className="text-[10px] text-[#5a5a70]">{type}: {count}</div>
                            ))}
                            {cell.isViolation && <div className="text-[10px] text-red-400 mt-1">Layer violation!</div>}
                            {cell.isCircular && <div className="text-[10px] text-orange-400">Circular dependency!</div>}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="p-1 text-center">
                    <span className={`font-mono font-bold ${(metric?.instability || 0) > 0.7 ? "text-red-400" : (metric?.instability || 0) > 0.4 ? "text-yellow-400" : "text-green-400"}`}>
                      {metric?.instability.toFixed(2) || "0"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 text-[10px] text-[#5a5a70]">
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-indigo-500/50" /> Normal</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-red-500/50" /> Layer violation</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-orange-500/50" /> Circular</div>
        <div className="ml-auto">I = Instability (Ce/(Ca+Ce)) — lower = more stable</div>
      </div>
    </div>
  );
}
