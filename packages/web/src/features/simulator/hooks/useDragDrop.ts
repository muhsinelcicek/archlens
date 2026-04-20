/**
 * useDragDrop — encapsulates node dragging, selection, clipboard.
 */

import { useState, useCallback, useEffect } from "react";
import { type SimNode, createNodeMetrics, createCircuitBreaker } from "../../../lib/simulator-engine.js";
import { useCanvasTransform } from "../../../lib/use-canvas-transform.js";

export function useDragDrop(
  nodes: SimNode[],
  setNodes: React.Dispatch<React.SetStateAction<SimNode[]>>,
  deleteNodes: (ids: Set<string>) => void,
) {
  const canvas = useCanvasTransform({ minScale: 0.25, maxScale: 4, gridSize: 20 });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [clipboard, setClipboard] = useState<SimNode | null>(null);

  const selectedId = selectedIds.size === 1 ? [...selectedIds][0] : null;

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === "c" && selectedId) {
        e.preventDefault();
        const node = nodes.find((n) => n.id === selectedId);
        if (node) setClipboard(node);
      }
      if (meta && e.key === "v" && clipboard) {
        e.preventDefault();
        const id = `n-${Date.now()}`;
        setNodes((prev) => [...prev, { ...clipboard, id, x: clipboard.x + 40, y: clipboard.y + 40, metrics: createNodeMetrics(), circuitBreaker: createCircuitBreaker() }]);
        setSelectedIds(new Set([id]));
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.size > 0) {
        e.preventDefault();
        deleteNodes(selectedIds);
        setSelectedIds(new Set());
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId, selectedIds, clipboard, nodes, setNodes, deleteNodes]);

  const onNodeMouseDown = useCallback((e: React.MouseEvent, id: string, canvasEl: HTMLDivElement | null) => {
    e.stopPropagation();
    const node = nodes.find((n) => n.id === id);
    if (!node || !canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    setDraggingId(id);
    const canvasPos = canvas.screenToCanvas(e.clientX, e.clientY, rect);
    setDragOffset({ x: canvasPos.x - node.x, y: canvasPos.y - node.y });
    if (e.shiftKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    } else {
      setSelectedIds(new Set([id]));
    }
  }, [nodes, canvas]);

  const onCanvasMouseMove = useCallback((e: React.MouseEvent, canvasEl: HTMLDivElement | null) => {
    canvas.onPanMove(e as React.MouseEvent<HTMLDivElement>);
    if (!draggingId || !canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const canvasPos = canvas.screenToCanvas(e.clientX, e.clientY, rect);
    const snapped = canvas.snapToGrid(canvasPos.x - dragOffset.x, canvasPos.y - dragOffset.y);
    setNodes((prev) => prev.map((n) => (n.id === draggingId ? { ...n, x: snapped.x, y: snapped.y } : n)));
  }, [draggingId, dragOffset, canvas, setNodes]);

  const onCanvasMouseUp = useCallback(() => {
    setDraggingId(null);
    canvas.onPanEnd();
  }, [canvas]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setConnectFrom(null);
  }, []);

  const selectNode = useCallback((id: string) => {
    setSelectedIds(new Set([id]));
  }, []);

  return {
    canvas,
    selectedIds, selectedId,
    connectFrom, setConnectFrom,
    draggingId,
    clipboard,
    onNodeMouseDown, onCanvasMouseMove, onCanvasMouseUp,
    clearSelection, selectNode,
  };
}
