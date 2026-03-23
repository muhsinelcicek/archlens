import { Command } from "commander";
import path from "node:path";
import fs from "node:fs";
import http from "node:http";
import chalk from "chalk";

export const serveCommand = new Command("serve")
  .description("Start interactive web dashboard")
  .option("-p, --port <port>", "Port number", "4848")
  .option("-d, --data <dir>", "ArchLens data directory", ".archlens")
  .action(async (options) => {
    const dataDir = path.resolve(options.data);
    const modelPath = path.join(dataDir, "model.json");

    if (!fs.existsSync(modelPath)) {
      console.error(chalk.red("No analysis data found. Run `archlens analyze` first."));
      process.exit(1);
    }

    const port = parseInt(options.port, 10);
    const model = JSON.parse(fs.readFileSync(modelPath, "utf-8"));

    const server = http.createServer((req, res) => {
      // CORS headers
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url || "/", `http://localhost:${port}`);

      switch (url.pathname) {
        case "/api/model":
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(model));
          break;

        case "/api/diagrams": {
          const diagramDir = path.join(dataDir, "diagrams");
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
          break;
        }

        case "/api/architecture": {
          const archPath = path.join(dataDir, "ARCHITECTURE.md");
          if (fs.existsSync(archPath)) {
            res.writeHead(200, { "Content-Type": "text/markdown" });
            res.end(fs.readFileSync(archPath, "utf-8"));
          } else {
            res.writeHead(404);
            res.end("Not found");
          }
          break;
        }

        default:
          res.writeHead(404);
          res.end("Not found");
      }
    });

    server.listen(port, () => {
      console.log(chalk.cyan(`\n  ArchLens Dashboard API running on http://localhost:${port}`));
      console.log(chalk.dim(`  Data: ${dataDir}\n`));
      console.log(chalk.dim("  Endpoints:"));
      console.log(chalk.dim("  GET /api/model      — Full architecture model"));
      console.log(chalk.dim("  GET /api/diagrams   — Mermaid diagrams"));
      console.log(chalk.dim("  GET /api/architecture — Markdown report\n"));
    });
  });
