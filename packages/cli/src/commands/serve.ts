import { Command } from "commander";
import path from "node:path";
import fs from "node:fs";
import http from "node:http";
import chalk from "chalk";
import { QualityAnalyzer } from "@archlens/core";

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

    const server = http.createServer((req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
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

        // If single-mode, add that too
        if (singleModel) {
          const m = singleModel as { project?: { name?: string }; stats?: Record<string, unknown> };
          projects.unshift({
            name: m.project?.name || "local",
            repoUrl: "local",
            analyzedAt: new Date().toISOString(),
            stats: (m.stats || {}) as ProjectEntry["stats"],
          });
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
        let modelData: any = singleModel;
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
