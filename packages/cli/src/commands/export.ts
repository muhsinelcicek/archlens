import { Command } from "commander";
import path from "node:path";
import fs from "node:fs";
import chalk from "chalk";
import ora from "ora";
import { ProjectScanner, MermaidGenerator, MarkdownGenerator, JsonExporter } from "@archlens/core";

export const exportCommand = new Command("export")
  .description("Export architecture diagrams in various formats")
  .argument("[path]", "Path to the project root", ".")
  .option("-f, --format <format>", "Export format: mermaid, markdown, json, all", "all")
  .option("-o, --output <dir>", "Output directory", ".archlens/export")
  .action(async (targetPath: string, options) => {
    const rootDir = path.resolve(targetPath);
    const outputDir = path.resolve(rootDir, options.output);
    const format = options.format.toLowerCase();

    const spinner = ora("Analyzing project...").start();

    try {
      const scanner = new ProjectScanner();
      const model = await scanner.scan({ rootDir });

      fs.mkdirSync(outputDir, { recursive: true });

      const generated: string[] = [];

      // JSON
      if (format === "json" || format === "all") {
        const exporter = new JsonExporter(model);
        const outPath = path.join(outputDir, "architecture.json");
        fs.writeFileSync(outPath, exporter.toString());
        generated.push(outPath);
      }

      // Mermaid
      if (format === "mermaid" || format === "all") {
        const mermaid = new MermaidGenerator(model);
        const diagrams = mermaid.generateFullReport();
        for (const [name, content] of Object.entries(diagrams)) {
          const outPath = path.join(outputDir, `${name}.mmd`);
          fs.writeFileSync(outPath, content);
          generated.push(outPath);
        }
      }

      // Markdown
      if (format === "markdown" || format === "all") {
        const md = new MarkdownGenerator(model);
        const outPath = path.join(outputDir, "ARCHITECTURE.md");
        fs.writeFileSync(outPath, md.generate());
        generated.push(outPath);
      }

      spinner.succeed(chalk.green(`Exported ${generated.length} files`));

      console.log(chalk.dim("\n  Files:"));
      for (const f of generated) {
        console.log(chalk.dim(`  └── ${path.relative(rootDir, f)}`));
      }
      console.log("");

    } catch (error) {
      spinner.fail(chalk.red("Export failed"));
      console.error(error);
      process.exit(1);
    }
  });
