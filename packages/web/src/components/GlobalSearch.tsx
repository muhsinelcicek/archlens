import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../lib/store.js";
import { Search, X, Box, FunctionSquare, Braces, Globe, Database, FileCode, Hash } from "lucide-react";

interface SearchResult {
  type: "module" | "symbol" | "endpoint" | "entity" | "file";
  name: string;
  detail: string;
  path?: string;
  icon: React.ReactNode;
  color: string;
  navigateTo: string;
}

const kindIcons: Record<string, { icon: React.ReactNode; color: string }> = {
  class: { icon: <Box className="h-3.5 w-3.5" />, color: "#fbbf24" },
  function: { icon: <FunctionSquare className="h-3.5 w-3.5" />, color: "#34d399" },
  method: { icon: <FunctionSquare className="h-3.5 w-3.5" />, color: "#34d399" },
  interface: { icon: <Braces className="h-3.5 w-3.5" />, color: "#a78bfa" },
  enum: { icon: <Hash className="h-3.5 w-3.5" />, color: "#f59e0b" },
  module: { icon: <Box className="h-3.5 w-3.5" />, color: "#60a5fa" },
  endpoint: { icon: <Globe className="h-3.5 w-3.5" />, color: "#34d399" },
  entity: { icon: <Database className="h-3.5 w-3.5" />, color: "#f87171" },
  file: { icon: <FileCode className="h-3.5 w-3.5" />, color: "#8888a0" },
};

export function GlobalSearch() {
  const { model } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!model) return null;

  // Search logic
  const results: SearchResult[] = [];
  if (query.length >= 2) {
    const q = query.toLowerCase();

    // Modules
    for (const mod of model.modules) {
      if (mod.name.toLowerCase().includes(q)) {
        results.push({
          type: "module", name: mod.name, detail: `${mod.layer} · ${mod.fileCount} files · ${mod.lineCount.toLocaleString()} lines`,
          icon: kindIcons.module.icon, color: kindIcons.module.color, navigateTo: "/architecture",
        });
      }
    }

    // Symbols (limit to 15)
    let symCount = 0;
    for (const [uid, sym] of Object.entries(model.symbols) as Array<[string, Record<string, unknown>]>) {
      if (symCount >= 15) break;
      const name = sym.name as string;
      if (name.toLowerCase().includes(q)) {
        const ki = kindIcons[sym.kind as string] || kindIcons.file;
        results.push({
          type: "symbol", name, detail: `${sym.kind} · ${(sym.filePath as string).split("/").pop()}:${sym.startLine}`,
          path: sym.filePath as string, icon: ki.icon, color: ki.color, navigateTo: "/architecture",
        });
        symCount++;
      }
    }

    // Endpoints
    for (const ep of model.apiEndpoints) {
      if (ep.path.toLowerCase().includes(q) || ep.method.toLowerCase().includes(q)) {
        results.push({
          type: "endpoint", name: `${ep.method} ${ep.path}`, detail: ep.filePath.split("/").pop() || "",
          icon: kindIcons.endpoint.icon, color: kindIcons.endpoint.color, navigateTo: "/endpoints",
        });
      }
    }

    // DB Entities
    for (const entity of model.dbEntities) {
      if (entity.name.toLowerCase().includes(q)) {
        results.push({
          type: "entity", name: entity.name, detail: `${entity.columns.length} columns`,
          icon: kindIcons.entity.icon, color: kindIcons.entity.color, navigateTo: "/diagram/er-diagram",
        });
      }
    }
  }

  const handleSelect = (result: SearchResult) => {
    if (result.path) {
      sessionStorage.setItem("archlens-goto-file", result.path);
    }
    navigate(result.navigateTo);
    setOpen(false);
    setQuery("");
  };

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-elevated border border-[#2a2a3a] text-[11px] text-[#5a5a70] hover:text-[#8888a0] hover:border-archlens-500/30 transition-all w-full"
      >
        <Search className="h-3 w-3" />
        <span className="flex-1 text-left">Search...</span>
        <kbd className="text-[9px] px-1 py-0.5 rounded bg-[#1e1e2a] text-[#5a5a70]">⌘K</kbd>
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" onClick={() => setOpen(false)} />

      {/* Search Modal */}
      <div className="fixed top-[15%] left-1/2 -translate-x-1/2 w-[560px] z-50 animate-slide-up">
        <div className="rounded-xl border border-[#2a2a3a] bg-surface shadow-2xl shadow-black/50 overflow-hidden">
          {/* Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1e1e2a]">
            <Search className="h-4 w-4 text-archlens-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search modules, symbols, endpoints, entities..."
              className="flex-1 bg-transparent text-sm text-[#e4e4ed] placeholder:text-[#5a5a70] outline-none"
              autoFocus
            />
            {query && (
              <button onClick={() => setQuery("")} className="text-[#5a5a70] hover:text-[#8888a0]">
                <X className="h-4 w-4" />
              </button>
            )}
            <kbd className="text-[9px] px-1.5 py-0.5 rounded bg-[#1e1e2a] text-[#5a5a70]">ESC</kbd>
          </div>

          {/* Results */}
          <div className="max-h-[400px] overflow-y-auto">
            {query.length < 2 ? (
              <div className="px-4 py-8 text-center text-[#5a5a70] text-xs">
                Type at least 2 characters to search
              </div>
            ) : results.length === 0 ? (
              <div className="px-4 py-8 text-center text-[#5a5a70] text-xs">
                No results for "{query}"
              </div>
            ) : (
              <div className="py-1">
                {results.slice(0, 20).map((result, i) => (
                  <button
                    key={`${result.type}-${result.name}-${i}`}
                    onClick={() => handleSelect(result)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-hover transition-colors text-left"
                  >
                    <span style={{ color: result.color }}>{result.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-[#e4e4ed] truncate font-mono">{result.name}</div>
                      <div className="text-[10px] text-[#5a5a70] truncate">{result.detail}</div>
                    </div>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#1e1e2a] text-[#5a5a70] flex-shrink-0">{result.type}</span>
                  </button>
                ))}
                {results.length > 20 && (
                  <div className="px-4 py-2 text-center text-[10px] text-[#5a5a70]">+{results.length - 20} more results</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
