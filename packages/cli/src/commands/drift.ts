import { Command } from "commander";
import path from "node:path";
import fs from "node:fs";
import chalk from "chalk";
import { GitDiffer, type DriftReport } from "@archlens/core";

export const driftCommand = new Command("drift")
  .description("Detect architecture drift — compare git changes against saved model")
  .argument("[path]", "Path to the project root", ".")
  .option("-s, --scope <scope>", "Git scope: staged, unstaged, all", "all")
  .option("--json", "Output raw JSON (for CI/CD)")
  .action(async (targetPath: string, options) => {
    const rootDir = path.resolve(targetPath);
    const modelPath = path.join(rootDir, ".archlens", "model.json");

    if (!fs.existsSync(modelPath)) {
      console.error(chalk.red("No ArchLens index found. Run `archlens analyze` first."));
      process.exit(1);
    }

    const rawModel = JSON.parse(fs.readFileSync(modelPath, "utf-8"));
    rawModel.symbols = new Map(Object.entries(rawModel.symbols || {}));

    const differ = new GitDiffer(rootDir, rawModel);
    const report = differ.generateReport(options.scope);

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    // Human-readable output
    printReport(report);
  });

function printReport(report: DriftReport) {
  const { summary } = report;

  console.log("");
  console.log(chalk.bold("  Architecture Drift Report"));
  console.log(chalk.dim(`  ${report.timestamp}`));
  console.log("");

  // Score
  const scoreColor = summary.score >= 80 ? chalk.green : summary.score >= 50 ? chalk.yellow : chalk.red;
  console.log(`  Score: ${scoreColor(summary.score + "/100")}`);
  console.log(`  Index age: ${report.indexAge < 24 ? chalk.green(report.indexAge + "h") : chalk.yellow(report.indexAge + "h (stale)")}`);
  console.log("");

  // Changed files
  if (report.changedFiles.length > 0) {
    console.log(chalk.cyan(`  Changed Files (${report.changedFiles.length}):`));
    for (const file of report.changedFiles.slice(0, 20)) {
      const statusIcon = file.status === "added" ? chalk.green("+") : file.status === "deleted" ? chalk.red("-") : chalk.yellow("~");
      console.log(`    ${statusIcon} ${file.path}`);
    }
    if (report.changedFiles.length > 20) {
      console.log(chalk.dim(`    ... and ${report.changedFiles.length - 20} more`));
    }
    console.log("");
  } else {
    console.log(chalk.dim("  No changed files detected.\n"));
  }

  // Symbol changes
  if (report.symbolChanges.length > 0) {
    console.log(chalk.cyan(`  Symbol Changes (${report.symbolChanges.length}):`));
    const grouped = { added: 0, removed: 0, modified: 0 };
    for (const sc of report.symbolChanges) {
      grouped[sc.type]++;
    }
    if (grouped.added) console.log(chalk.green(`    + ${grouped.added} added`));
    if (grouped.removed) console.log(chalk.red(`    - ${grouped.removed} removed`));
    if (grouped.modified) console.log(chalk.yellow(`    ~ ${grouped.modified} modified`));

    // Show details for first 10
    for (const sc of report.symbolChanges.slice(0, 10)) {
      const icon = sc.type === "added" ? chalk.green("+") : sc.type === "removed" ? chalk.red("-") : chalk.yellow("~");
      console.log(chalk.dim(`    ${icon} ${sc.kind}: ${sc.name} (${sc.filePath})`));
    }
    console.log("");
  }

  // Dependency changes
  if (report.dependencyChanges.length > 0) {
    console.log(chalk.cyan(`  New Dependencies (${report.dependencyChanges.length}):`));
    for (const dc of report.dependencyChanges.slice(0, 10)) {
      const icon = dc.type === "added" ? chalk.green("+") : chalk.red("-");
      console.log(`    ${icon} ${dc.source} → ${dc.target}`);
    }
    console.log("");
  }

  // Layer violations
  if (report.layerViolations.length > 0) {
    console.log(chalk.red(`  ❌ Layer Violations (${report.layerViolations.length}):`));
    for (const v of report.layerViolations) {
      console.log(chalk.red(`    ${v.sourceModule} (${v.sourceLayer}) → ${v.targetModule} (${v.targetLayer})`));
    }
    console.log("");
  } else {
    console.log(chalk.green("  ✅ No layer violations\n"));
  }

  // Module health
  console.log(chalk.cyan("  Module Health:"));
  for (const mod of report.moduleHealth) {
    const icon = mod.healthy ? chalk.green("✅") : chalk.yellow("⚠️");
    const detail = mod.healthy ? "" : chalk.dim(` — ${mod.issues.join(", ")}`);
    console.log(`    ${icon} ${mod.name}/ (${mod.layer}) ${mod.files} files, ${mod.lines.toLocaleString()} lines${detail}`);
  }
  console.log("");

  // Exit code hint
  if (summary.violations > 0) {
    console.log(chalk.red("  FAILED — architecture violations detected"));
    process.exitCode = 1;
  } else {
    console.log(chalk.green("  PASSED — no violations"));
  }
  console.log("");
}
