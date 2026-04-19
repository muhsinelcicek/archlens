import { useState, useCallback, useRef, type WheelEvent, type MouseEvent } from "react";

export interface CanvasTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function useCanvasTransform(options?: { minScale?: number; maxScale?: number; gridSize?: number }) {
  const minScale = options?.minScale ?? 0.25;
  const maxScale = options?.maxScale ?? 4;
  const gridSize = options?.gridSize ?? 20;

  const [transform, setTransform] = useState<CanvasTransform>({ scale: 1, offsetX: 0, offsetY: 0 });
  const [snapEnabled, setSnapEnabled] = useState(true);
  const isPanning = useRef(false);
  const lastPan = useRef({ x: 0, y: 0 });

  // Zoom: center on mouse position
  const onWheel = useCallback((e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform(prev => {
      const newScale = Math.min(maxScale, Math.max(minScale, prev.scale * delta));
      // Zoom toward mouse position
      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const scaleRatio = newScale / prev.scale;
      return {
        scale: newScale,
        offsetX: mx - (mx - prev.offsetX) * scaleRatio,
        offsetY: my - (my - prev.offsetY) * scaleRatio,
      };
    });
  }, [minScale, maxScale]);

  // Pan: middle mouse button or space+drag
  const onPanStart = useCallback((e: MouseEvent<HTMLDivElement>) => {
    if (e.button === 1) { // middle click
      e.preventDefault();
      isPanning.current = true;
      lastPan.current = { x: e.clientX, y: e.clientY };
    }
  }, []);

  const onPanMove = useCallback((e: MouseEvent<HTMLDivElement>) => {
    if (!isPanning.current) return;
    const dx = e.clientX - lastPan.current.x;
    const dy = e.clientY - lastPan.current.y;
    lastPan.current = { x: e.clientX, y: e.clientY };
    setTransform(prev => ({
      ...prev,
      offsetX: prev.offsetX + dx,
      offsetY: prev.offsetY + dy,
    }));
  }, []);

  const onPanEnd = useCallback(() => {
    isPanning.current = false;
  }, []);

  // Fit to view: calculate bounding box of all nodes and set transform to show them all
  const fitToView = useCallback((nodes: Array<{ x: number; y: number }>, containerWidth: number, containerHeight: number) => {
    if (nodes.length === 0) return;
    const padding = 80;
    const nodeWidth = 150;
    const nodeHeight = 80;
    const minX = Math.min(...nodes.map(n => n.x)) - padding;
    const minY = Math.min(...nodes.map(n => n.y)) - padding;
    const maxX = Math.max(...nodes.map(n => n.x + nodeWidth)) + padding;
    const maxY = Math.max(...nodes.map(n => n.y + nodeHeight)) + padding;
    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const scaleX = containerWidth / contentW;
    const scaleY = containerHeight / contentH;
    const newScale = Math.min(Math.max(Math.min(scaleX, scaleY), minScale), maxScale);
    setTransform({
      scale: newScale,
      offsetX: (containerWidth - contentW * newScale) / 2 - minX * newScale,
      offsetY: (containerHeight - contentH * newScale) / 2 - minY * newScale,
    });
  }, [minScale, maxScale]);

  const zoomIn = useCallback(() => {
    setTransform(prev => ({ ...prev, scale: Math.min(maxScale, prev.scale * 1.2) }));
  }, [maxScale]);

  const zoomOut = useCallback(() => {
    setTransform(prev => ({ ...prev, scale: Math.max(minScale, prev.scale * 0.8) }));
  }, [minScale]);

  const resetZoom = useCallback(() => {
    setTransform({ scale: 1, offsetX: 0, offsetY: 0 });
  }, []);

  // Snap to grid utility
  const snapToGrid = useCallback((x: number, y: number): { x: number; y: number } => {
    if (!snapEnabled) return { x, y };
    return {
      x: Math.round(x / gridSize) * gridSize,
      y: Math.round(y / gridSize) * gridSize,
    };
  }, [snapEnabled, gridSize]);

  // Convert screen coordinates to canvas coordinates
  const screenToCanvas = useCallback((screenX: number, screenY: number, containerRect: DOMRect): { x: number; y: number } => {
    const x = (screenX - containerRect.left - transform.offsetX) / transform.scale;
    const y = (screenY - containerRect.top - transform.offsetY) / transform.scale;
    return { x, y };
  }, [transform]);

  return {
    transform,
    setTransform,
    snapEnabled,
    setSnapEnabled,
    snapToGrid,
    screenToCanvas,
    onWheel,
    onPanStart,
    onPanMove,
    onPanEnd,
    fitToView,
    zoomIn,
    zoomOut,
    resetZoom,
    isPanning: isPanning.current,
  };
}
