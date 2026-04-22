import { Command } from "commander";
import path from "node:path";
import fs from "node:fs";
import chalk from "chalk";
import { generateScenario, type ArchitectureModel } from "@archlens/core";

export const simulateCommand = new Command("simulate")
  .description("Generate a simulator scenario from a project's analysis — closes the loop from analyze to simulate")
  .argument("[path]", "Path to the project root (must have been analyzed)", ".")
  .option("-o, --output <file>", "Output file path", ".archlens/scenario.json")
  .option("--json", "Print scenario to stdout instead of writing a file")
  .action(async (targetPath: string, options) => {
    const rootDir = path.resolve(targetPath);
    const modelPath = path.join(rootDir, ".archlens", "model.json");

    if (!fs.existsSync(modelPath)) {
      console.error(chalk.red(`No ArchLens index found at ${modelPath}`));
      console.error(chalk.dim(`Run \`archlens-studio analyze\` first.`));
      process.exit(1);
    }

    const raw = JSON.parse(fs.readFileSync(modelPath, "utf-8"));
    raw.symbols = new Map(Object.entries(raw.symbols || {}));
    const model = raw as ArchitectureModel;

    const scenario = generateScenario(model);

    if (options.json) {
      console.log(JSON.stringify(scenario, null, 2));
      return;
    }

    const outputPath = path.resolve(rootDir, options.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(scenario, null, 2));

    console.log("");
    console.log(chalk.bold("  Scenario generated"));
    console.log("");
    console.log(`  ${chalk.cyan("Project:")}   ${scenario.source.projectName}`);
    console.log(`  ${chalk.cyan("Nodes:")}     ${scenario.nodes.length}`);
    console.log(`  ${chalk.cyan("Edges:")}     ${scenario.edges.length}`);
    console.log(`  ${chalk.cyan("Traffic:")}   ${scenario.trafficPattern.baseRate} req/s (${scenario.trafficPattern.type})`);
    console.log("");
    console.log(chalk.dim("  Inferences:"));
    for (const line of scenario.inferences) {
      console.log(chalk.dim(`    • ${line}`));
    }
    console.log("");
    console.log(chalk.dim(`  Written to ${outputPath}`));
    console.log("");
    console.log(chalk.cyan(`  Next: `) + `${chalk.white("archlens-studio serve")} → open ${chalk.white("/simulator")} → click "Load analyzed scenario"`);
    console.log("");
  });
