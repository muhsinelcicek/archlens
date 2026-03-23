import { useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useStore } from "../lib/store.js";
import mermaid from "mermaid";
import { Download, Copy, Check } from "lucide-react";
import { useState } from "react";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  themeVariables: {
    darkMode: true,
    background: "#09090b",
    primaryColor: "#10b981",
    primaryTextColor: "#fff",
    primaryBorderColor: "#065f46",
    lineColor: "#3f3f46",
    secondaryColor: "#1e1e2e",
    tertiaryColor: "#27272a",
  },
});

const diagramLabels: Record<string, string> = {
  "system-architecture": "System Architecture (C4)",
  "er-diagram": "Entity-Relationship Diagram",
  "data-flow": "Data Flow Diagram",
  "dependency-graph": "Dependency Graph",
  "api-map": "API Endpoint Map",
  "tech-radar": "Technology Radar",
};

export function DiagramView() {
  const { type } = useParams<{ type: string }>();
  const { diagrams } = useStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const diagram = type ? diagrams[type] : undefined;
  const label = type ? diagramLabels[type] || type : "Diagram";

  useEffect(() => {
    if (!diagram || !containerRef.current) return;

    const render = async () => {
      try {
        containerRef.current!.innerHTML = "";
        const { svg } = await mermaid.render(`diagram-${type}`, diagram);
        containerRef.current!.innerHTML = svg;

        // Make SVG responsive
        const svgEl = containerRef.current!.querySelector("svg");
        if (svgEl) {
          svgEl.style.maxWidth = "100%";
          svgEl.style.height = "auto";
        }
      } catch (err) {
        containerRef.current!.innerHTML = `<pre class="text-red-400 text-sm p-4">${(err as Error).message}</pre>`;
      }
    };

    render();
  }, [diagram, type]);

  const handleCopy = () => {
    if (diagram) {
      navigator.clipboard.writeText(diagram);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadSVG = () => {
    const svgEl = containerRef.current?.querySelector("svg");
    if (!svgEl) return;
    const blob = new Blob([svgEl.outerHTML], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${type}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!diagram) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        <p>No diagram data available. Run <code className="bg-zinc-800 px-2 py-1 rounded">archlens analyze</code> first.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{label}</h2>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition-colors"
          >
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied!" : "Copy Mermaid"}
          </button>
          <button
            onClick={handleDownloadSVG}
            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition-colors"
          >
            <Download className="h-4 w-4" />
            Download SVG
          </button>
        </div>
      </div>

      {/* Rendered Diagram */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 overflow-auto">
        <div ref={containerRef} className="flex justify-center" />
      </div>

      {/* Raw Mermaid Source */}
      <details className="bg-zinc-900 border border-zinc-800 rounded-xl">
        <summary className="px-4 py-3 cursor-pointer text-sm text-zinc-400 hover:text-white">
          View Mermaid Source
        </summary>
        <pre className="px-4 pb-4 text-xs text-zinc-500 overflow-auto">
          <code>{diagram}</code>
        </pre>
      </details>
    </div>
  );
}
