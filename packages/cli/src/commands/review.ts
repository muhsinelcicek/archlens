import { Command } from "commander";
import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";
import chalk from "chalk";
import {
  ProjectScanner,
  GitDiffer,
  type DriftReport,
  type ArchitectureModel,
  type BusinessProcessInfo,
} from "@archlens/core";

export interface PRReview {
  summary: {
    score: number;
    verdict: "approved" | "changes_requested" | "comment";
    filesChanged: number;
    symbolsAdded: number;
    symbolsRemoved: number;
    symbolsModified: number;
    violations: number;
    affectedProcesses: number;
  };
  drift: DriftReport;
  affectedModules: Array<{ name: string; layer: string; changeType: string }>;
  affectedProcesses: Array<{ name: string; category: string; reason: string }>;
  architectureNotes: string[];
}

export const reviewCommand = new Command("review")
  .description("Generate a PR architecture review — run in a PR branch")
  .argument("[path]", "Path to the project root", ".")
  .option("--base <ref>", "Base branch to compare against", "main")
  .option("--json", "Output raw JSON")
  .option("--markdown", "Output as Markdown (for GitHub PR comment)")
  .action(async (targetPath: string, options) => {
    const rootDir = path.resolve(targetPath);
    const modelPath = path.join(rootDir, ".archlens", "model.json");

    // Load or create model
    let model: ArchitectureModel;
    if (fs.existsSync(modelPath)) {
      const raw = JSON.parse(fs.readFileSync(modelPath, "utf-8"));
      raw.symbols = new Map(Object.entries(raw.symbols || {}));
      model = raw;
    } else {
      const scanner = new ProjectScanner();
      model = await scanner.scan({ rootDir });
    }

    // Run drift
    const differ = new GitDiffer(rootDir, model);
    const drift = differ.generateReport("all");

    // Find affected modules
    const affectedModules: PRReview["affectedModules"]= [];
    const changedModules = new Set<string>();

    for (const sc of drift.symbolChanges) {
      const filePath = sc.filePath;
      for (const mod of model.modules) {
        for (const uid of mod.symbols) {
          const sym = model.symbols.get(uid);
          if (sym && sym.filePath === filePath) {
            if (!changedModules.has(mod.name)) {
              changedModules.add(mod.name);
              affectedModules.push({ name: mod.name, layer: mod.layer, changeType: sc.type });
            }
            break;
          }
        }
      }
    }

    // Find affected business processes
    const processes = (model.businessProcesses || []) as BusinessProcessInfo[];
    const affectedProcesses: PRReview["affectedProcesses"] = [];

    for (const proc of processes) {
      for (const symRef of proc.relatedSymbols) {
        const sym = model.symbols.get(symRef);
        if (sym) {
          for (const sc of drift.symbolChanges) {
            if (sc.filePath === sym.filePath) {
              affectedProcesses.push({
                name: proc.name,
                category: proc.category,
                reason: `${sc.type} ${sc.name} in ${sc.filePath}`,
              });
              break;
            }
          }
        }
        if (affectedProcesses.some((p) => p.name === proc.name)) break;
      }
    }

    // Architecture notes
    const notes: string[] = [];
    if (drift.layerViolations.length > 0) {
      notes.push(`⛔ ${drift.layerViolations.length} layer violation(s) detected — this PR introduces dependencies that break architecture boundaries.`);
    }
    if (affectedProcesses.length > 0) {
      notes.push(`⚠️ ${affectedProcesses.length} business process(es) affected — ensure integration tests cover: ${affectedProcesses.map((p) => p.name).join(", ")}`);
    }
    if (drift.symbolChanges.filter((s) => s.type === "removed").length > 0) {
      notes.push(`🗑️ ${drift.symbolChanges.filter((s) => s.type === "removed").length} symbol(s) removed — check for breaking changes in dependent modules.`);
    }
    const largeModules = drift.moduleHealth.filter((m) => !m.healthy);
    if (largeModules.length > 0) {
      notes.push(`📏 ${largeModules.length} module(s) exceed size thresholds: ${largeModules.map((m) => m.name).join(", ")}`);
    }
    if (notes.length === 0) {
      notes.push("✅ This PR looks clean from an architecture perspective.");
    }

    // Verdict
    let verdict: PRReview["summary"]["verdict"] = "approved";
    if (drift.layerViolations.length > 0) verdict = "changes_requested";
    else if (affectedProcesses.length > 0 || drift.symbolChanges.filter((s) => s.type === "removed").length > 5) verdict = "comment";

    const review: PRReview = {
      summary: {
        score: drift.summary.score,
        verdict,
        filesChanged: drift.summary.filesChanged,
        symbolsAdded: drift.summary.symbolsAdded,
        symbolsRemoved: drift.summary.symbolsRemoved,
        symbolsModified: drift.summary.symbolsModified,
        violations: drift.summary.violations,
        affectedProcesses: affectedProcesses.length,
      },
      drift,
      affectedModules,
      affectedProcesses,
      architectureNotes: notes,
    };

    if (options.json) {
      console.log(JSON.stringify(review, null, 2));
      return;
    }

    if (options.markdown) {
      console.log(generateMarkdown(review));
      return;
    }

    // Human readable
    printReview(review);
  });

function generateMarkdown(review: PRReview): string {
  const s = review.summary;
  const scoreEmoji = s.score >= 80 ? "🟢" : s.score >= 50 ? "🟡" : "🔴";
  const verdictEmoji = s.verdict === "approved" ? "✅" : s.verdict === "changes_requested" ? "❌" : "💬";

  let md = `## ${scoreEmoji} ArchLens PR Review — Score: ${s.score}/100\n\n`;
  md += `**Verdict:** ${verdictEmoji} ${s.verdict.replace("_", " ").toUpperCase()}\n\n`;

  md += `| Metric | Count |\n|--------|-------|\n`;
  md += `| Files Changed | ${s.filesChanged} |\n`;
  md += `| Symbols Added | ${s.symbolsAdded} |\n`;
  md += `| Symbols Removed | ${s.symbolsRemoved} |\n`;
  md += `| Symbols Modified | ${s.symbolsModified} |\n`;
  md += `| Layer Violations | ${s.violations} |\n`;
  md += `| Affected Processes | ${s.affectedProcesses} |\n\n`;

  // Architecture Notes
  md += `### Architecture Notes\n\n`;
  for (const note of review.architectureNotes) {
    md += `${note}\n\n`;
  }

  // Affected Modules
  if (review.affectedModules.length > 0) {
    md += `### Affected Modules\n\n`;
    for (const m of review.affectedModules) {
      md += `- **${m.name}** (${m.layer}) — ${m.changeType}\n`;
    }
    md += "\n";
  }

  // Affected Business Processes
  if (review.affectedProcesses.length > 0) {
    md += `### ⚠️ Affected Business Processes\n\n`;
    for (const p of review.affectedProcesses) {
      md += `- **${p.name}** (${p.category}) — ${p.reason}\n`;
    }
    md += "\n";
  }

  // Layer Violations
  if (review.drift.layerViolations.length > 0) {
    md += `### ❌ Layer Violations\n\n`;
    for (const v of review.drift.layerViolations) {
      md += `- **${v.sourceModule}** (${v.sourceLayer}) → **${v.targetModule}** (${v.targetLayer})\n`;
    }
    md += "\n";
  }

  // Symbol changes
  if (review.drift.symbolChanges.length > 0) {
    const added = review.drift.symbolChanges.filter((s) => s.type === "added");
    const removed = review.drift.symbolChanges.filter((s) => s.type === "removed");
    if (added.length > 0) {
      md += `<details><summary>➕ ${added.length} symbols added</summary>\n\n`;
      for (const sc of added.slice(0, 20)) {
        md += `- \`${sc.kind}\` **${sc.name}** in \`${sc.filePath}\`\n`;
      }
      md += `</details>\n\n`;
    }
    if (removed.length > 0) {
      md += `<details><summary>➖ ${removed.length} symbols removed</summary>\n\n`;
      for (const sc of removed.slice(0, 20)) {
        md += `- \`${sc.kind}\` **${sc.name}** in \`${sc.filePath}\`\n`;
      }
      md += `</details>\n\n`;
    }
  }

  md += `---\n🔍 *Generated by [ArchLens](https://github.com/muhsinelcicek/archlens) — Code Architecture Intelligence*`;
  return md;
}

function printReview(review: PRReview) {
  const s = review.summary;
  const scoreColor = s.score >= 80 ? chalk.green : s.score >= 50 ? chalk.yellow : chalk.red;

  console.log(chalk.bold("\n  ArchLens PR Architecture Review\n"));
  console.log(`  Score: ${scoreColor(s.score + "/100")}`);
  console.log(`  Verdict: ${s.verdict === "approved" ? chalk.green("APPROVED") : s.verdict === "changes_requested" ? chalk.red("CHANGES REQUESTED") : chalk.yellow("COMMENT")}\n`);

  console.log(`  Files: ${s.filesChanged} changed`);
  console.log(`  Symbols: +${s.symbolsAdded} -${s.symbolsRemoved} ~${s.symbolsModified}`);
  console.log(`  Violations: ${s.violations}`);
  console.log(`  Affected Processes: ${s.affectedProcesses}\n`);

  console.log(chalk.cyan("  Architecture Notes:"));
  for (const note of review.architectureNotes) {
    console.log(`    ${note}`);
  }

  if (review.affectedModules.length > 0) {
    console.log(chalk.cyan(`\n  Affected Modules (${review.affectedModules.length}):`));
    for (const m of review.affectedModules) {
      console.log(`    ${m.name} (${m.layer}) — ${m.changeType}`);
    }
  }

  if (review.affectedProcesses.length > 0) {
    console.log(chalk.yellow(`\n  Affected Business Processes (${review.affectedProcesses.length}):`));
    for (const p of review.affectedProcesses) {
      console.log(`    ${p.name} (${p.category})`);
    }
  }

  console.log("");
}
