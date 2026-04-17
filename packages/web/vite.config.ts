import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 4849,
    proxy: {
      "/api": "http://localhost:4848",
    },
  },
  worker: {
    format: "es",
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Only split EAGER node_modules deps. Do NOT catch dynamic imports
          // (shiki grammars, etc.) — they should stay as their own chunks.

          // React + routing (eager)
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom") ||
            id.includes("node_modules/react-router") ||
            id.includes("node_modules/scheduler")
          ) return "vendor-react";

          // Heavy graph libraries (eager in ArchitectureView but lazy-loaded route)
          if (id.includes("node_modules/cytoscape")) return "vendor-cytoscape";
          if (id.includes("node_modules/sigma") || id.includes("node_modules/graphology")) return "vendor-sigma";
          if (id.includes("node_modules/d3")) return "vendor-d3";

          // Icons
          if (id.includes("node_modules/lucide-react")) return "vendor-icons";

          // Zustand + small deps
          if (id.includes("node_modules/zustand") || id.includes("node_modules/immer")) return "vendor-state";

          // Everything else (including shiki grammars) — let Rollup decide naturally
        },
      },
    },
  },
});
