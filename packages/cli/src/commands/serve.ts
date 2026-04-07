import { Command } from "commander";
import path from "node:path";
import fs from "node:fs";
import http from "node:http";
import chalk from "chalk";
import { QualityAnalyzer, DeadCodeDetector, SecurityScanner, TechDebtCalculator, EventFlowDetector, PatternDeepAnalyzer, CouplingAnalyzer, ConsistencyChecker, HotspotAnalyzer, DiffAnalyzer, CustomRuleEngine } from "@archlens/core";

const ARCHLENS_HOME = path.join(process.env.HOME || "~", ".archlens");
const REGISTRY_PATH = path.join(ARCHLENS_HOME, "registry.json");

interface ProjectEntry {
  name: string;
  repoUrl: string;
  localPath: string;
  analyzedAt: string;
  stats: { files: number; symbols: number; modules: number; lines: number };
}

function loadRegistry(): ProjectEntry[] {
  if (!fs.existsSync(REGISTRY_PATH)) return [];
  try { return JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf-8")); } catch { return []; }
}

export const serveCommand = new Command("serve")
  .description("Start interactive web dashboard (multi-project)")
  .option("-p, --port <port>", "Port number", "4848")
  .option("-d, --data <dir>", "Single project data directory (optional)")
  .action(async (options) => {
    const port = parseInt(options.port, 10);

    // Load all projects from registry
    const registry = loadRegistry();

    // Also check for --data flag (single project mode)
    let singleModel: unknown = null;
    let singleDiagrams: Record<string, string> = {};
    if (options.data) {
      const modelPath = path.join(options.data, "model.json");
      if (fs.existsSync(modelPath)) {
        singleModel = JSON.parse(fs.readFileSync(modelPath, "utf-8"));
        const diagramDir = path.join(options.data, "diagrams");
        if (fs.existsSync(diagramDir)) {
          for (const file of fs.readdirSync(diagramDir)) {
            if (file.endsWith(".mmd")) {
              singleDiagrams[file.replace(".mmd", "")] = fs.readFileSync(path.join(diagramDir, file), "utf-8");
            }
          }
        }
      }
    }

    const server = http.createServer(async (req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

      const url = new URL(req.url || "/", `http://localhost:${port}`);

      // ─── Multi-project endpoints ───────────────────────────

      // List all projects
      if (url.pathname === "/api/projects") {
        const projects = registry.map((p) => ({
          name: p.name,
          repoUrl: p.repoUrl,
          analyzedAt: p.analyzedAt,
          stats: p.stats,
        }));

        // If single-mode, add that too (but skip if already in registry)
        if (singleModel) {
          const m = singleModel as { project?: { name?: string }; stats?: Record<string, unknown> };
          const singleName = m.project?.name || "local";
          if (!projects.some((p) => p.name === singleName)) {
          projects.unshift({
            name: singleName,
            repoUrl: "local",
            analyzedAt: new Date().toISOString(),
            stats: (m.stats || {}) as ProjectEntry["stats"],
          });
          }
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(projects));
        return;
      }

      // Get specific project model
      const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/model$/);
      if (projectMatch) {
        const projectName = decodeURIComponent(projectMatch[1]);
        const project = registry.find((p) => p.name === projectName);

        if (project) {
          const modelPath = path.join(project.localPath, ".archlens", "model.json");
          if (fs.existsSync(modelPath)) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(fs.readFileSync(modelPath, "utf-8"));
            return;
          }
        }
        res.writeHead(404); res.end("Project not found"); return;
      }

      // Get specific project diagrams
      const diagramMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/diagrams$/);
      if (diagramMatch) {
        const projectName = decodeURIComponent(diagramMatch[1]);
        const project = registry.find((p) => p.name === projectName);

        if (project) {
          const diagramDir = path.join(project.localPath, ".archlens", "diagrams");
          const diagrams: Record<string, string> = {};
          if (fs.existsSync(diagramDir)) {
            for (const file of fs.readdirSync(diagramDir)) {
              if (file.endsWith(".mmd")) {
                diagrams[file.replace(".mmd", "")] = fs.readFileSync(path.join(diagramDir, file), "utf-8");
              }
            }
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(diagrams));
          return;
        }
        res.writeHead(404); res.end("Project not found"); return;
      }

      // ─── Legacy single-project endpoints ───────────────────

      if (url.pathname === "/api/model") {
        if (singleModel) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(singleModel));
        } else if (registry.length > 0) {
          // Serve first project by default
          const first = registry[0];
          const modelPath = path.join(first.localPath, ".archlens", "model.json");
          if (fs.existsSync(modelPath)) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(fs.readFileSync(modelPath, "utf-8"));
          } else {
            res.writeHead(404); res.end("No model found");
          }
        } else {
          res.writeHead(404); res.end("No projects");
        }
        return;
      }

      if (url.pathname === "/api/diagrams") {
        if (Object.keys(singleDiagrams).length > 0) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(singleDiagrams));
        } else if (registry.length > 0) {
          const first = registry[0];
          const diagramDir = path.join(first.localPath, ".archlens", "diagrams");
          const diagrams: Record<string, string> = {};
          if (fs.existsSync(diagramDir)) {
            for (const file of fs.readdirSync(diagramDir)) {
              if (file.endsWith(".mmd")) {
                diagrams[file.replace(".mmd", "")] = fs.readFileSync(path.join(diagramDir, file), "utf-8");
              }
            }
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(diagrams));
        } else {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end("{}");
        }
        return;
      }

      // ─── Quality report endpoint ─────────────────────────────

      if (url.pathname === "/api/quality") {
        let modelData: any = singleModel ? JSON.parse(JSON.stringify(singleModel)) : null;
        if (!modelData && registry.length > 0) {
          const first = registry[0];
          const mp = path.join(first.localPath, ".archlens", "model.json");
          if (fs.existsSync(mp)) modelData = JSON.parse(fs.readFileSync(mp, "utf-8"));
        }
        if (modelData) {
          // Convert symbols to Map for analyzer
          if (!(modelData.symbols instanceof Map)) {
            modelData.symbols = new Map(Object.entries(modelData.symbols || {}));
          }
          const analyzer = new QualityAnalyzer(modelData);
          const report = analyzer.analyze();
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(report));
        } else {
          res.writeHead(404); res.end("No model");
        }
        return;
      }

      // ─── Dead code endpoint ──────────────────────────────────

      if (url.pathname === "/api/deadcode") {
        let modelData: any = singleModel ? JSON.parse(JSON.stringify(singleModel)) : null;
        if (!modelData && registry.length > 0) {
          const mp = path.join(registry[0].localPath, ".archlens", "model.json");
          if (fs.existsSync(mp)) modelData = JSON.parse(fs.readFileSync(mp, "utf-8"));
        }
        if (modelData) {
          if (!(modelData.symbols instanceof Map)) modelData.symbols = new Map(Object.entries(modelData.symbols || {}));
          const detector = new DeadCodeDetector(modelData);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(detector.detect()));
        } else { res.writeHead(404); res.end("No model"); }
        return;
      }

      // ─── Security scan endpoint ───────────────────────────────

      if (url.pathname === "/api/security") {
        let modelData: any = singleModel ? JSON.parse(JSON.stringify(singleModel)) : null;
        let projectRoot = "";
        if (options.data) {
          projectRoot = path.dirname(options.data);
          if (!modelData) { const mp = path.join(options.data, "model.json"); if (fs.existsSync(mp)) modelData = JSON.parse(fs.readFileSync(mp, "utf-8")); }
        } else if (registry.length > 0) {
          projectRoot = registry[0].localPath;
          const mp = path.join(projectRoot, ".archlens", "model.json");
          if (fs.existsSync(mp)) modelData = JSON.parse(fs.readFileSync(mp, "utf-8"));
        }
        if (modelData && projectRoot) {
          if (!(modelData.symbols instanceof Map)) modelData.symbols = new Map(Object.entries(modelData.symbols || {}));
          const scanner = new SecurityScanner(modelData, projectRoot);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(scanner.scan()));
        } else { res.writeHead(404); res.end("No model"); }
        return;
      }

      // ─── Add project endpoint (POST) ─────────────────────────

      if (url.pathname === "/api/projects/add" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        req.on("end", async () => {
          try {
            const { url: repoUrl, branch } = JSON.parse(body);
            if (!repoUrl) { res.writeHead(400); res.end(JSON.stringify({ error: "Missing url" })); return; }

            const repoName = repoUrl.replace(/\.git$/, "").split("/").pop() || "unknown";
            const localPath = path.join(process.env.HOME || "~", ".archlens", "projects", repoName);

            // Clone or update
            const { execSync } = await import("node:child_process");
            const PROJECTS_DIR = path.join(process.env.HOME || "~", ".archlens", "projects");
            fs.mkdirSync(PROJECTS_DIR, { recursive: true });

            if (fs.existsSync(localPath)) {
              try { execSync(`git -C "${localPath}" pull --ff-only`, { stdio: "pipe", timeout: 30000 }); } catch {}
            } else {
              execSync(`git clone --depth 1 ${branch ? `--branch ${branch}` : ""} "${repoUrl}" "${localPath}"`, { stdio: "pipe", timeout: 120000 });
            }

            // Analyze
            const { ProjectScanner, JsonExporter, MermaidGenerator, MarkdownGenerator } = await import("@archlens/core");
            const scanner = new ProjectScanner();
            const model = await scanner.scan({ rootDir: localPath });

            const outputDir = path.join(localPath, ".archlens");
            fs.mkdirSync(outputDir, { recursive: true });
            const exporter = new JsonExporter(model);
            fs.writeFileSync(path.join(outputDir, "model.json"), exporter.toString());

            const mermaid = new MermaidGenerator(model);
            const diagrams = mermaid.generateFullReport();
            const diagramDir = path.join(outputDir, "diagrams");
            fs.mkdirSync(diagramDir, { recursive: true });
            for (const [name, content] of Object.entries(diagrams)) {
              fs.writeFileSync(path.join(diagramDir, `${name}.mmd`), content);
            }

            const md = new MarkdownGenerator(model);
            fs.writeFileSync(path.join(outputDir, "ARCHITECTURE.md"), md.generate());

            // Register
            const REGISTRY_PATH = path.join(process.env.HOME || "~", ".archlens", "registry.json");
            let reg: any[] = [];
            try { if (fs.existsSync(REGISTRY_PATH)) reg = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf-8")); } catch {}
            const entry = {
              name: repoName, repoUrl, localPath,
              analyzedAt: new Date().toISOString(),
              stats: { files: model.stats.files, symbols: model.stats.symbols, modules: model.stats.modules, lines: model.stats.totalLines },
            };
            const idx = reg.findIndex((p: any) => p.name === repoName);
            if (idx >= 0) reg[idx] = entry; else reg.push(entry);
            fs.writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2));

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true, name: repoName, stats: entry.stats }));
          } catch (err: any) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message || "Failed to add project" }));
          }
        });
        return;
      }

      // ─── Deep pattern analysis endpoint ──────────────────────

      if (url.pathname === "/api/patterns") {
        let modelData: any = singleModel ? JSON.parse(JSON.stringify(singleModel)) : null;
        if (!modelData && registry.length > 0) {
          const mp = path.join(registry[0].localPath, ".archlens", "model.json");
          if (fs.existsSync(mp)) modelData = JSON.parse(fs.readFileSync(mp, "utf-8"));
        }
        if (modelData) {
          if (!(modelData.symbols instanceof Map)) modelData.symbols = new Map(Object.entries(modelData.symbols || {}));
          const analyzer = new PatternDeepAnalyzer(modelData);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(analyzer.analyze()));
        } else { res.writeHead(404); res.end("No model"); }
        return;
      }

      // ─── Tech debt endpoint ─────────────────────────────────

      if (url.pathname === "/api/techdebt") {
        let modelData: any = singleModel ? JSON.parse(JSON.stringify(singleModel)) : null;
        if (!modelData && registry.length > 0) {
          const mp = path.join(registry[0].localPath, ".archlens", "model.json");
          if (fs.existsSync(mp)) modelData = JSON.parse(fs.readFileSync(mp, "utf-8"));
        }
        if (modelData) {
          if (!(modelData.symbols instanceof Map)) modelData.symbols = new Map(Object.entries(modelData.symbols || {}));
          const calc = new TechDebtCalculator(modelData);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(calc.calculate()));
        } else { res.writeHead(404); res.end("No model"); }
        return;
      }

      // ─── Event flow endpoint ──────────────────────────────────

      if (url.pathname === "/api/eventflow") {
        let modelData: any = singleModel ? JSON.parse(JSON.stringify(singleModel)) : null;
        if (!modelData && registry.length > 0) {
          const mp = path.join(registry[0].localPath, ".archlens", "model.json");
          if (fs.existsSync(mp)) modelData = JSON.parse(fs.readFileSync(mp, "utf-8"));
        }
        if (modelData) {
          if (!(modelData.symbols instanceof Map)) modelData.symbols = new Map(Object.entries(modelData.symbols || {}));
          const detector = new EventFlowDetector(modelData);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(detector.detect()));
        } else { res.writeHead(404); res.end("No model"); }
        return;
      }

      // ─── Coupling analysis endpoint ──────────────────────────

      if (url.pathname === "/api/coupling") {
        let modelData: any = singleModel ? JSON.parse(JSON.stringify(singleModel)) : null;
        if (!modelData && registry.length > 0) {
          const mp = path.join(registry[0].localPath, ".archlens", "model.json");
          if (fs.existsSync(mp)) modelData = JSON.parse(fs.readFileSync(mp, "utf-8"));
        }
        if (modelData) {
          if (!(modelData.symbols instanceof Map)) modelData.symbols = new Map(Object.entries(modelData.symbols || {}));
          const analyzer = new CouplingAnalyzer(modelData);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(analyzer.analyze()));
        } else { res.writeHead(404); res.end("No model"); }
        return;
      }

      // ─── Consistency check endpoint ───────────────────────────

      if (url.pathname === "/api/consistency") {
        let modelData: any = singleModel ? JSON.parse(JSON.stringify(singleModel)) : null;
        let projectRoot = "";
        if (options.data) {
          projectRoot = path.dirname(options.data);
          if (!modelData) { const mp = path.join(options.data, "model.json"); if (fs.existsSync(mp)) modelData = JSON.parse(fs.readFileSync(mp, "utf-8")); }
        } else if (registry.length > 0) {
          projectRoot = registry[0].localPath;
          const mp = path.join(projectRoot, ".archlens", "model.json");
          if (!modelData && fs.existsSync(mp)) modelData = JSON.parse(fs.readFileSync(mp, "utf-8"));
        }
        if (modelData && projectRoot) {
          if (!(modelData.symbols instanceof Map)) modelData.symbols = new Map(Object.entries(modelData.symbols || {}));
          const checker = new ConsistencyChecker(modelData, projectRoot);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(checker.check()));
        } else { res.writeHead(404); res.end("No model"); }
        return;
      }

      // ─── SSE: file change watcher ───────────────────────────

      if (url.pathname === "/api/watch") {
        let projectRoot = "";
        if (options.data) projectRoot = path.dirname(options.data);
        else if (registry.length > 0) projectRoot = registry[0].localPath;
        if (!projectRoot) { res.writeHead(404); res.end("No project"); return; }

        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        });
        res.write(": connected\n\n");

        let lastEvent = 0;
        const watcher = fs.watch(projectRoot, { recursive: true }, (_event, filename) => {
          if (!filename) return;
          // Filter noise
          const f = String(filename);
          if (f.includes("node_modules") || f.includes(".git/") || f.includes(".archlens/") || f.includes("dist/")) return;
          if (!/\.(ts|tsx|js|jsx|py|go|java|cs|swift|rs)$/.test(f)) return;

          // Debounce: 1 event per second max
          const now = Date.now();
          if (now - lastEvent < 1000) return;
          lastEvent = now;

          res.write(`event: change\ndata: ${JSON.stringify({ file: f, timestamp: now })}\n\n`);
        });

        // Heartbeat every 30s
        const heartbeat = setInterval(() => {
          try { res.write(": heartbeat\n\n"); } catch { /* closed */ }
        }, 30000);

        req.on("close", () => {
          watcher.close();
          clearInterval(heartbeat);
        });
        return;
      }

      // ─── Re-analyze trigger ─────────────────────────────────

      if (url.pathname === "/api/reanalyze" && req.method === "POST") {
        let projectRoot = "";
        if (options.data) projectRoot = path.dirname(options.data);
        else if (registry.length > 0) projectRoot = registry[0].localPath;
        if (!projectRoot) { res.writeHead(404); res.end("No project"); return; }

        try {
          const { ProjectScanner, JsonExporter } = await import("@archlens/core");
          const scanner = new ProjectScanner();
          const newModel = await scanner.scan({ rootDir: projectRoot });
          const exporter = new JsonExporter(newModel);
          const dataDir = path.join(projectRoot, ".archlens");
          if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
          fs.writeFileSync(path.join(dataDir, "model.json"), exporter.toString());
          // Convert Map to plain object for in-memory storage (so JSON.stringify works in other endpoints)
          singleModel = { ...newModel, symbols: Object.fromEntries(newModel.symbols) };
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, stats: newModel.stats }));
        } catch (err: any) {
          res.writeHead(500); res.end(err.message);
        }
        return;
      }

      // ─── Hotspots endpoint (git history × complexity) ──────

      if (url.pathname === "/api/hotspots") {
        let modelData: any = singleModel ? JSON.parse(JSON.stringify(singleModel)) : null;
        let projectRoot = "";
        if (options.data) {
          projectRoot = path.dirname(options.data);
          if (!modelData) { const mp = path.join(options.data, "model.json"); if (fs.existsSync(mp)) modelData = JSON.parse(fs.readFileSync(mp, "utf-8")); }
        } else if (registry.length > 0) {
          projectRoot = registry[0].localPath;
          const mp = path.join(projectRoot, ".archlens", "model.json");
          if (fs.existsSync(mp)) modelData = JSON.parse(fs.readFileSync(mp, "utf-8"));
        }
        if (modelData && projectRoot) {
          if (!(modelData.symbols instanceof Map)) modelData.symbols = new Map(Object.entries(modelData.symbols || {}));
          try {
            const analyzer = new HotspotAnalyzer(modelData, projectRoot);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(analyzer.analyze()));
          } catch (err: any) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ hotspots: [], totalFiles: 0, riskiestModule: "", topRiskFiles: [], error: err.message }));
          }
        } else { res.writeHead(404); res.end("No model"); }
        return;
      }

      // ─── Snapshots endpoints ────────────────────────────────

      const snapshotMatch = url.pathname.match(/^\/api\/snapshots(?:\/(.+))?$/);
      if (snapshotMatch) {
        let projectRoot = "";
        if (options.data) projectRoot = path.dirname(options.data);
        else if (registry.length > 0) projectRoot = registry[0].localPath;
        if (!projectRoot) { res.writeHead(404); res.end("No project"); return; }

        const snapDir = path.join(projectRoot, ".archlens", "snapshots");
        if (!fs.existsSync(snapDir)) fs.mkdirSync(snapDir, { recursive: true });
        const snapName = snapshotMatch[1];

        // POST /api/snapshots - save
        if (req.method === "POST" && !snapName) {
          let body = "";
          req.on("data", (c: Buffer) => { body += c.toString(); });
          req.on("end", () => {
            try {
              const { name } = JSON.parse(body);
              if (!name) { res.writeHead(400); res.end("Missing name"); return; }
              let modelData: any = singleModel ? JSON.parse(JSON.stringify(singleModel)) : null;
              if (!modelData) {
                const mp = path.join(projectRoot, ".archlens", "model.json");
                if (fs.existsSync(mp)) modelData = JSON.parse(fs.readFileSync(mp, "utf-8"));
              }
              if (!modelData) { res.writeHead(404); res.end("No model"); return; }
              const safeName = name.replace(/[^a-zA-Z0-9-_]/g, "_");
              const snapPath = path.join(snapDir, `${safeName}.json`);
              const savedAt = new Date().toISOString();
              fs.writeFileSync(snapPath, JSON.stringify({ ...modelData, _savedAt: savedAt }));
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: true, name: safeName, savedAt }));
            } catch (err: any) {
              res.writeHead(500); res.end(err.message);
            }
          });
          return;
        }

        // DELETE /api/snapshots/:name
        if (req.method === "DELETE" && snapName) {
          const safeName = snapName.replace(/[^a-zA-Z0-9-_]/g, "_");
          const snapPath = path.join(snapDir, `${safeName}.json`);
          if (fs.existsSync(snapPath)) fs.unlinkSync(snapPath);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
          return;
        }

        // GET /api/snapshots/:name - get specific
        if (snapName) {
          const safeName = snapName.replace(/[^a-zA-Z0-9-_]/g, "_");
          const snapPath = path.join(snapDir, `${safeName}.json`);
          if (!fs.existsSync(snapPath)) { res.writeHead(404); res.end("Not found"); return; }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(fs.readFileSync(snapPath, "utf-8"));
          return;
        }

        // GET /api/snapshots - list
        const files = fs.readdirSync(snapDir).filter((f) => f.endsWith(".json"));
        const snapshots = files.map((f) => {
          try {
            const data = JSON.parse(fs.readFileSync(path.join(snapDir, f), "utf-8"));
            return {
              name: f.replace(/\.json$/, ""),
              savedAt: data._savedAt || "",
              stats: { files: data.stats?.files || 0, symbols: data.stats?.symbols || 0, modules: data.stats?.modules || 0 },
            };
          } catch { return null; }
        }).filter(Boolean);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(snapshots));
        return;
      }

      // ─── Diff endpoint ──────────────────────────────────────

      if (url.pathname === "/api/diff" && req.method === "POST") {
        let projectRoot = "";
        if (options.data) projectRoot = path.dirname(options.data);
        else if (registry.length > 0) projectRoot = registry[0].localPath;
        if (!projectRoot) { res.writeHead(404); res.end("No project"); return; }

        let body = "";
        req.on("data", (c: Buffer) => { body += c.toString(); });
        req.on("end", () => {
          try {
            const { baseSnapshot, headSnapshot } = JSON.parse(body);
            const snapDir = path.join(projectRoot, ".archlens", "snapshots");
            const safeBase = String(baseSnapshot).replace(/[^a-zA-Z0-9-_]/g, "_");
            const basePath = path.join(snapDir, `${safeBase}.json`);
            if (!fs.existsSync(basePath)) { res.writeHead(404); res.end("Base snapshot not found"); return; }
            const baseModel = JSON.parse(fs.readFileSync(basePath, "utf-8"));

            let headModel: any;
            if (headSnapshot && headSnapshot !== "current") {
              const safeHead = String(headSnapshot).replace(/[^a-zA-Z0-9-_]/g, "_");
              const headPath = path.join(snapDir, `${safeHead}.json`);
              if (!fs.existsSync(headPath)) { res.writeHead(404); res.end("Head snapshot not found"); return; }
              headModel = JSON.parse(fs.readFileSync(headPath, "utf-8"));
            } else {
              headModel = singleModel ? JSON.parse(JSON.stringify(singleModel)) : JSON.parse(fs.readFileSync(path.join(projectRoot, ".archlens", "model.json"), "utf-8"));
            }

            const analyzer = new DiffAnalyzer();
            const diff = analyzer.compare(baseModel, headModel);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(diff));
          } catch (err: any) {
            res.writeHead(500); res.end(err.message);
          }
        });
        return;
      }

      // ─── Comments endpoints ─────────────────────────────────

      if (url.pathname === "/api/comments") {
        let projectRoot = "";
        if (options.data) projectRoot = path.dirname(options.data);
        else if (registry.length > 0) projectRoot = registry[0].localPath;
        if (!projectRoot) { res.writeHead(404); res.end("No project"); return; }

        const commentsPath = path.join(projectRoot, ".archlens", "comments.json");

        if (req.method === "POST") {
          let body = "";
          req.on("data", (c: Buffer) => { body += c.toString(); });
          req.on("end", () => {
            try {
              const newComment = JSON.parse(body);
              const existing = fs.existsSync(commentsPath)
                ? JSON.parse(fs.readFileSync(commentsPath, "utf-8"))
                : [];
              const comment = {
                id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                target: newComment.target || "",
                text: newComment.text || "",
                author: newComment.author || "Anonymous",
                createdAt: new Date().toISOString(),
              };
              existing.push(comment);
              fs.writeFileSync(commentsPath, JSON.stringify(existing, null, 2));
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify(comment));
            } catch (err: any) { res.writeHead(500); res.end(err.message); }
          });
          return;
        }

        if (req.method === "DELETE") {
          const id = url.searchParams.get("id");
          if (!id) { res.writeHead(400); res.end("Missing id"); return; }
          const existing = fs.existsSync(commentsPath)
            ? JSON.parse(fs.readFileSync(commentsPath, "utf-8"))
            : [];
          const filtered = existing.filter((c: any) => c.id !== id);
          fs.writeFileSync(commentsPath, JSON.stringify(filtered, null, 2));
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
          return;
        }

        // GET
        const target = url.searchParams.get("target");
        const all = fs.existsSync(commentsPath)
          ? JSON.parse(fs.readFileSync(commentsPath, "utf-8"))
          : [];
        const result = target ? all.filter((c: any) => c.target === target) : all;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
        return;
      }

      // ─── Custom Rules endpoints ─────────────────────────────

      if (url.pathname === "/api/rules") {
        let projectRoot = "";
        if (options.data) projectRoot = path.dirname(options.data);
        else if (registry.length > 0) projectRoot = registry[0].localPath;
        if (!projectRoot) { res.writeHead(404); res.end("No project"); return; }

        const rulesPath = path.join(projectRoot, ".archlens", "rules.json");

        if (req.method === "POST") {
          let body = "";
          req.on("data", (c: Buffer) => { body += c.toString(); });
          req.on("end", () => {
            try {
              const { rules } = JSON.parse(body);
              fs.writeFileSync(rulesPath, JSON.stringify({ rules }, null, 2));
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: true, count: rules.length }));
            } catch (err: any) { res.writeHead(500); res.end(err.message); }
          });
          return;
        }

        // GET
        const rules = fs.existsSync(rulesPath)
          ? JSON.parse(fs.readFileSync(rulesPath, "utf-8")).rules || []
          : [];
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ rules }));
        return;
      }

      if (url.pathname === "/api/rules/validate" && req.method === "POST") {
        let projectRoot = "";
        if (options.data) projectRoot = path.dirname(options.data);
        else if (registry.length > 0) projectRoot = registry[0].localPath;
        if (!projectRoot) { res.writeHead(404); res.end("No project"); return; }

        let body = "";
        req.on("data", (c: Buffer) => { body += c.toString(); });
        req.on("end", () => {
          try {
            let rules: any[] = [];
            if (body) {
              const parsed = JSON.parse(body);
              rules = parsed.rules || [];
            }
            if (rules.length === 0) {
              const rulesPath = path.join(projectRoot, ".archlens", "rules.json");
              if (fs.existsSync(rulesPath)) rules = JSON.parse(fs.readFileSync(rulesPath, "utf-8")).rules || [];
            }
            let modelData: any = singleModel ? JSON.parse(JSON.stringify(singleModel)) : null;
            if (!modelData) {
              const mp = path.join(projectRoot, ".archlens", "model.json");
              if (fs.existsSync(mp)) modelData = JSON.parse(fs.readFileSync(mp, "utf-8"));
            }
            if (!modelData) { res.writeHead(404); res.end("No model"); return; }
            if (!(modelData.symbols instanceof Map)) modelData.symbols = new Map(Object.entries(modelData.symbols || {}));
            const engine = new CustomRuleEngine(modelData, rules);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(engine.evaluate()));
          } catch (err: any) { res.writeHead(500); res.end(err.message); }
        });
        return;
      }

      // ─── File content endpoint ─────────────────────────────

      if (url.pathname === "/api/file") {
        const filePath = url.searchParams.get("path");
        if (!filePath) { res.writeHead(400); res.end("Missing path param"); return; }

        // Determine project root
        let projectRoot = "";
        if (options.data) {
          projectRoot = path.dirname(options.data);
        } else if (registry.length > 0) {
          // Check if path belongs to a specific project
          const projectName = url.searchParams.get("project");
          const project = projectName
            ? registry.find((p) => p.name === projectName)
            : registry[0];
          if (project) projectRoot = project.localPath;
        }

        if (!projectRoot) { res.writeHead(404); res.end("No project"); return; }

        const absPath = path.resolve(projectRoot, filePath);
        // Security: ensure path is within project
        if (!absPath.startsWith(path.resolve(projectRoot))) {
          res.writeHead(403); res.end("Forbidden"); return;
        }

        if (fs.existsSync(absPath)) {
          const content = fs.readFileSync(absPath, "utf-8");
          const ext = path.extname(absPath).slice(1);
          res.writeHead(200, {
            "Content-Type": "text/plain; charset=utf-8",
            "X-File-Language": ext,
            "X-File-Lines": String(content.split("\n").length),
          });
          res.end(content);
        } else {
          res.writeHead(404); res.end("File not found");
        }
        return;
      }

      res.writeHead(404); res.end("Not found");
    });

    server.listen(port, () => {
      console.log(chalk.cyan(`\n  ArchLens Dashboard API running on http://localhost:${port}`));
      if (options.data) {
        console.log(chalk.dim(`  Single project: ${options.data}`));
      }
      if (registry.length > 0) {
        console.log(chalk.dim(`  Registered projects: ${registry.length}`));
        for (const p of registry) {
          console.log(chalk.dim(`    • ${p.name} (${p.stats.files} files)`));
        }
      }
      console.log(chalk.dim("\n  Endpoints:"));
      console.log(chalk.dim("  GET /api/projects           — List all projects"));
      console.log(chalk.dim("  GET /api/projects/:name/model — Project model"));
      console.log(chalk.dim("  GET /api/model              — Default project model\n"));
    });
  });
