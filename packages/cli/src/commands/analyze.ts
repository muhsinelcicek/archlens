import { Command } from "commander";
import path from "node:path";
import fs from "node:fs";
import chalk from "chalk";
import ora from "ora";
import boxen from "boxen";
import { ProjectScanner, JsonExporter } from "@archlens/core";

export const analyzeCommand = new Command("analyze")
  .description("Analyze a project and build architecture model")
  .argument("[path]", "Path to the project root", ".")
  .option("--include-tests", "Include test files in analysis", false)
  .option("--output <dir>", "Output directory for results", ".archlens")
  .option("--force", "Force full re-scan (skip incremental cache)", false)
  .option("--json", "Output raw JSON to stdout")
  .action(async (targetPath: string, options) => {
    const rootDir = path.resolve(targetPath);

    if (!fs.existsSync(rootDir)) {
      console.error(chalk.red(`Directory not found: ${rootDir}`));
      process.exit(1);
    }

    const spinner = ora({
      text: "Scanning project...",
      color: "cyan",
    }).start();

    try {
      const scanner = new ProjectScanner();
      const startTime = Date.now();

      spinner.text = "Discovering files...";
      const model = await scanner.scan({
        rootDir,
        includeTests: options.includeTests,
        force: options.force,
      });

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      const scanStats = scanner.lastScanStats;
      const incrementalInfo = scanStats && scanStats.cached > 0
        ? ` — ${scanStats.parsed} parsed, ${scanStats.cached} cached`
        : "";
      spinner.succeed(chalk.green(`Analysis complete (${duration}s)${incrementalInfo}`));

      // Output JSON to stdout if requested
      if (options.json) {
        const exporter = new JsonExporter(model);
        console.log(exporter.toString());
        return;
      }

      // Save results
      const outputDir = path.resolve(rootDir, options.output);
      fs.mkdirSync(outputDir, { recursive: true });

      // Save model JSON
      const exporter = new JsonExporter(model);
      fs.writeFileSync(
        path.join(outputDir, "model.json"),
        exporter.toString(),
      );

      // Save Mermaid diagrams
      const { MermaidGenerator } = await import("@archlens/core");
      const mermaid = new MermaidGenerator(model);
      const diagrams = mermaid.generateFullReport();

      const diagramDir = path.join(outputDir, "diagrams");
      fs.mkdirSync(diagramDir, { recursive: true });

      for (const [name, content] of Object.entries(diagrams)) {
        fs.writeFileSync(path.join(diagramDir, `${name}.mmd`), content);
      }

      // Save Markdown report
      const { MarkdownGenerator } = await import("@archlens/core");
      const markdown = new MarkdownGenerator(model);
      fs.writeFileSync(path.join(outputDir, "ARCHITECTURE.md"), markdown.generate());

      // Print summary
      const langSummary = Object.entries(model.stats.languages)
        .sort((a, b) => b[1] - a[1])
        .map(([lang, count]) => `${lang}: ${count}`)
        .join(" | ");

      const summary = [
        "",
        chalk.bold("  ArchLens Analysis"),
        "",
        `  ${chalk.cyan("Project:")}     ${model.project.name}`,
        `  ${chalk.cyan("Files:")}       ${model.stats.files}`,
        `  ${chalk.cyan("Symbols:")}     ${model.stats.symbols}`,
        `  ${chalk.cyan("Relations:")}   ${model.stats.relations}`,
        `  ${chalk.cyan("Modules:")}     ${model.stats.modules}`,
        `  ${chalk.cyan("Lines:")}       ${model.stats.totalLines.toLocaleString()}`,
        `  ${chalk.cyan("Languages:")}   ${langSummary}`,
        "",
        `  ${chalk.cyan("API Endpoints:")}  ${model.apiEndpoints.length}`,
        `  ${chalk.cyan("DB Entities:")}    ${model.dbEntities.length}`,
        `  ${chalk.cyan("Data Flows:")}     ${model.dataFlows.length}`,
        `  ${chalk.cyan("Tech Stack:")}     ${model.techRadar.length} entries`,
        "",
        `  ${chalk.dim("Output:")} ${outputDir}`,
        `  ${chalk.dim("Diagrams:")} ${Object.keys(diagrams).length} generated`,
        "",
      ].join("\n");

      console.log(
        boxen(summary, {
          padding: 0,
          margin: { top: 1, bottom: 0, left: 0, right: 0 },
          borderStyle: "round",
          borderColor: "cyan",
        }),
      );

      // List generated files
      console.log(chalk.dim("\n  Generated files:"));
      console.log(chalk.dim(`  ├── ${options.output}/model.json`));
      console.log(chalk.dim(`  ├── ${options.output}/ARCHITECTURE.md`));
      for (const name of Object.keys(diagrams)) {
        console.log(chalk.dim(`  ├── ${options.output}/diagrams/${name}.mmd`));
      }
      console.log("");

    } catch (error) {
      spinner.fail(chalk.red("Analysis failed"));
      console.error(error);
      process.exit(1);
    }
  });
