import { Command } from "commander";
import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";
import chalk from "chalk";
import ora from "ora";
import { ProjectScanner, JsonExporter, MermaidGenerator, MarkdownGenerator } from "@archlens/core";

const ARCHLENS_HOME = path.join(process.env.HOME || "~", ".archlens");
const PROJECTS_DIR = path.join(ARCHLENS_HOME, "projects");
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

function saveRegistry(entries: ProjectEntry[]) {
  fs.mkdirSync(ARCHLENS_HOME, { recursive: true });
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(entries, null, 2));
}

export const addCommand = new Command("add")
  .description("Add a project from GitHub URL — clones, analyzes, and registers it")
  .argument("<url>", "GitHub repository URL (e.g., https://github.com/user/repo)")
  .option("--branch <branch>", "Branch to clone", "main")
  .option("--depth <n>", "Clone depth", "1")
  .action(async (url: string, options) => {
    // Parse repo name from URL
    const repoName = url.replace(/\.git$/, "").split("/").pop() || "unknown";

    const spinner = ora(`Cloning ${repoName}...`).start();

    try {
      // Ensure projects directory exists
      fs.mkdirSync(PROJECTS_DIR, { recursive: true });

      const localPath = path.join(PROJECTS_DIR, repoName);

      // Clone if not already exists
      if (fs.existsSync(localPath)) {
        spinner.text = `Updating ${repoName}...`;
        try {
          execSync(`git -C "${localPath}" pull --ff-only`, { stdio: "pipe", timeout: 30000 });
        } catch {
          // Pull failed, that's okay — use existing
        }
      } else {
        execSync(`git clone --depth ${options.depth} --branch ${options.branch} "${url}" "${localPath}"`, {
          stdio: "pipe",
          timeout: 120000,
        });
      }

      spinner.text = `Analyzing ${repoName}...`;

      // Analyze
      const scanner = new ProjectScanner();
      const startTime = Date.now();
      const model = await scanner.scan({ rootDir: localPath });
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      // Save analysis output
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

      const markdown = new MarkdownGenerator(model);
      fs.writeFileSync(path.join(outputDir, "ARCHITECTURE.md"), markdown.generate());

      // Register project
      const registry = loadRegistry();
      const existing = registry.findIndex((p) => p.name === repoName);
      const entry: ProjectEntry = {
        name: repoName,
        repoUrl: url,
        localPath,
        analyzedAt: new Date().toISOString(),
        stats: {
          files: model.stats.files,
          symbols: model.stats.symbols,
          modules: model.stats.modules,
          lines: model.stats.totalLines,
        },
      };

      if (existing >= 0) {
        registry[existing] = entry;
      } else {
        registry.push(entry);
      }
      saveRegistry(registry);

      spinner.succeed(chalk.green(`${repoName} added (${duration}s)`));

      console.log(chalk.cyan(`\n  ${model.stats.files} files | ${model.stats.symbols} symbols | ${model.stats.modules} modules | ${model.stats.totalLines.toLocaleString()} lines`));
      console.log(chalk.dim(`  ${localPath}`));
      console.log(chalk.dim(`\n  Run ${chalk.white("archlens serve")} to view all projects in dashboard\n`));

    } catch (error) {
      spinner.fail(chalk.red(`Failed to add ${repoName}`));
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

export const listCommand = new Command("list")
  .description("List all registered projects")
  .option("--json", "Output as JSON")
  .action((options) => {
    const registry = loadRegistry();

    if (options.json) {
      console.log(JSON.stringify(registry, null, 2));
      return;
    }

    if (registry.length === 0) {
      console.log(chalk.dim("\n  No projects registered. Run:"));
      console.log(chalk.white("  archlens add https://github.com/user/repo\n"));
      return;
    }

    console.log(chalk.bold(`\n  ArchLens Projects (${registry.length})\n`));
    for (const project of registry) {
      const age = Math.round((Date.now() - new Date(project.analyzedAt).getTime()) / (1000 * 60 * 60));
      console.log(`  ${chalk.cyan(project.name)}`);
      console.log(chalk.dim(`    ${project.stats.files} files | ${project.stats.symbols} symbols | ${project.stats.lines.toLocaleString()} lines`));
      console.log(chalk.dim(`    ${project.repoUrl}`));
      console.log(chalk.dim(`    Analyzed ${age}h ago\n`));
    }
  });

export const removeCommand = new Command("remove")
  .description("Remove a project from registry")
  .argument("<name>", "Project name")
  .option("--delete", "Also delete cloned files", false)
  .action((name: string, options) => {
    const registry = loadRegistry();
    const idx = registry.findIndex((p) => p.name === name);

    if (idx < 0) {
      console.error(chalk.red(`Project "${name}" not found`));
      process.exit(1);
    }

    const project = registry[idx];

    if (options.delete && fs.existsSync(project.localPath)) {
      fs.rmSync(project.localPath, { recursive: true, force: true });
      console.log(chalk.dim(`  Deleted ${project.localPath}`));
    }

    registry.splice(idx, 1);
    saveRegistry(registry);
    console.log(chalk.green(`  Removed ${name}`));
  });
