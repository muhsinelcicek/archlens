#!/usr/bin/env node
/**
 * Benchmark runner — analyze popular OSS repos with archlens-studio,
 * capture timing, stats, and findings into a JSON report plus a
 * human-readable summary at docs/benchmarks.md.
 *
 * Usage:
 *   node scripts/run-benchmarks.mjs           # runs all repos, uses ~/.archlens/bench
 *   node scripts/run-benchmarks.mjs --fresh   # force re-clone
 *   node scripts/run-benchmarks.mjs --cli=/path/to/dist/index.js
 */
import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const REPOS = [
  { name: "eShop",           url: "https://github.com/dotnet/eShop",                 language: "C#"         },
  { name: "spring-petclinic",url: "https://github.com/spring-projects/spring-petclinic", language: "Java"  },
  { name: "fastapi",         url: "https://github.com/tiangolo/fastapi",             language: "Python"     },
  { name: "nestjs-realworld",url: "https://github.com/lujakob/nestjs-realworld-example-app", language: "TypeScript" },
  { name: "gin-examples",    url: "https://github.com/gin-gonic/examples",           language: "Go"         },
  { name: "actix-examples",  url: "https://github.com/actix/examples",               language: "Rust"       },
];

const args = new Set(process.argv.slice(2));
const fresh = args.has("--fresh");
const cliArg = [...args].find((a) => a.startsWith("--cli="));
const CLI = cliArg
  ? cliArg.split("=")[1]
  : path.resolve(new URL(".", import.meta.url).pathname, "../packages/cli/dist/index.js");

const BENCH_HOME = path.join(os.homedir(), ".archlens", "bench");
mkdirSync(BENCH_HOME, { recursive: true });

if (!existsSync(CLI)) {
  console.error(`CLI not found at ${CLI}. Run \`pnpm --filter archlens-studio build\` first.`);
  process.exit(1);
}

console.log(`[bench] CLI: ${CLI}`);
console.log(`[bench] Bench home: ${BENCH_HOME}`);
console.log(`[bench] Repos: ${REPOS.length}`);
console.log("");

const results = [];

for (const repo of REPOS) {
  const repoDir = path.join(BENCH_HOME, repo.name);
  const tStart = Date.now();

  try {
    if (fresh && existsSync(repoDir)) rmSync(repoDir, { recursive: true, force: true });
    if (!existsSync(repoDir)) {
      console.log(`[${repo.name}] cloning (shallow)...`);
      execSync(`git clone --depth 1 "${repo.url}" "${repoDir}"`, { stdio: "pipe", timeout: 180000 });
    } else {
      console.log(`[${repo.name}] using existing clone`);
    }

    const cloneMs = Date.now() - tStart;

    console.log(`[${repo.name}] analyzing...`);
    const analyzeStart = Date.now();
    const analyze = spawnSync("node", [CLI, "analyze", repoDir, "--force"], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 600000,
    });
    const analyzeMs = Date.now() - analyzeStart;

    if (analyze.status !== 0) {
      results.push({
        repo: repo.name,
        language: repo.language,
        status: "failed",
        error: analyze.stderr?.toString().slice(0, 500) ?? "unknown",
        cloneMs,
      });
      console.log(`[${repo.name}] FAILED (status ${analyze.status})`);
      continue;
    }

    const modelPath = path.join(repoDir, ".archlens", "model.json");
    const model = JSON.parse(readFileSync(modelPath, "utf-8"));

    // Try to generate scenario (closes the analyzer→simulator loop — we want
    // to show this works on every benchmark repo).
    console.log(`[${repo.name}] generating scenario...`);
    const simStart = Date.now();
    const sim = spawnSync("node", [CLI, "simulate", repoDir, "--json"], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30000,
    });
    const simMs = Date.now() - simStart;
    let scenario = null;
    if (sim.status === 0) {
      try { scenario = JSON.parse(sim.stdout.toString()); } catch { /* ignore */ }
    }

    const modelBytes = statSync(modelPath).size;

    const langs = model.stats?.languages ?? {};
    const topLangs = Object.entries(langs)
      .filter(([, n]) => (n || 0) > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([l, n]) => `${l} (${n})`);

    results.push({
      repo: repo.name,
      language: repo.language,
      url: repo.url,
      status: "ok",
      timing: {
        cloneMs,
        analyzeMs,
        simulateMs: simMs,
      },
      stats: {
        files: model.stats?.files ?? 0,
        symbols: model.stats?.symbols ?? 0,
        modules: model.stats?.modules ?? 0,
        totalLines: model.stats?.totalLines ?? 0,
        apiEndpoints: (model.apiEndpoints ?? []).length,
        dbEntities: (model.dbEntities ?? []).length,
        businessProcesses: (model.businessProcesses ?? []).length,
        techRadar: (model.techRadar ?? []).length,
        topLanguages: topLangs,
        modelSizeKb: Math.round(modelBytes / 1024),
      },
      scenario: scenario
        ? {
            nodes: scenario.nodes?.length ?? 0,
            edges: scenario.edges?.length ?? 0,
            trafficBaseline: scenario.trafficPattern?.baseRate ?? 0,
            inferences: scenario.inferences ?? [],
          }
        : null,
    });

    console.log(`[${repo.name}] done — ${model.stats?.files} files, ${analyzeMs}ms analyze`);
  } catch (err) {
    console.log(`[${repo.name}] ERROR: ${err instanceof Error ? err.message : err}`);
    results.push({
      repo: repo.name,
      language: repo.language,
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Write JSON
const docsDir = path.resolve(new URL(".", import.meta.url).pathname, "../docs");
mkdirSync(docsDir, { recursive: true });
const jsonOut = path.join(docsDir, "benchmarks.json");
writeFileSync(jsonOut, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
console.log(`\n[bench] JSON → ${jsonOut}`);

// Write markdown
const mdOut = path.join(docsDir, "benchmarks.md");
writeFileSync(mdOut, renderMarkdown(results));
console.log(`[bench] MD   → ${mdOut}`);

function renderMarkdown(results) {
  const ok = results.filter((r) => r.status === "ok");
  const failed = results.filter((r) => r.status !== "ok");
  const lines = [];

  lines.push(`# ArchLens Benchmarks`);
  lines.push("");
  lines.push(`Measured on \`${os.platform()}\` / \`${os.arch()}\` · Node \`${process.version}\` · ${new Date().toISOString().split("T")[0]}.`);
  lines.push("");
  lines.push(`Every repo is cloned (\`--depth 1\`), analyzed with \`archlens-studio analyze\`, and the analyzer→simulator bridge is exercised with \`archlens-studio simulate\`. Timing excludes git clone.`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Repo | Language | Files | Symbols | Modules | Endpoints | Entities | Analyze | Model size | Scenario |");
  lines.push("|------|----------|------:|--------:|--------:|----------:|---------:|--------:|-----------:|---------:|");
  for (const r of ok) {
    lines.push(`| [${r.repo}](${r.url}) | ${r.language} | ${r.stats.files.toLocaleString()} | ${r.stats.symbols.toLocaleString()} | ${r.stats.modules} | ${r.stats.apiEndpoints} | ${r.stats.dbEntities} | ${r.timing.analyzeMs.toLocaleString()}ms | ${r.stats.modelSizeKb.toLocaleString()}KB | ${r.scenario ? `${r.scenario.nodes}n/${r.scenario.edges}e` : "—"} |`);
  }
  lines.push("");
  if (failed.length > 0) {
    lines.push("### Failed");
    lines.push("");
    for (const r of failed) {
      lines.push(`- **${r.repo}** (${r.language}): ${r.error?.split("\n")[0] ?? "unknown"}`);
    }
    lines.push("");
  }

  lines.push("## Per-repo detail");
  lines.push("");
  for (const r of ok) {
    lines.push(`### ${r.repo} (${r.language})`);
    lines.push("");
    lines.push(`**Source:** ${r.url}`);
    lines.push("");
    lines.push(`- ${r.stats.files.toLocaleString()} files, ${r.stats.totalLines.toLocaleString()} lines, ${r.stats.symbols.toLocaleString()} symbols, ${r.stats.modules} modules`);
    lines.push(`- Top languages: ${r.stats.topLanguages.join(", ") || "—"}`);
    lines.push(`- ${r.stats.apiEndpoints} API endpoints · ${r.stats.dbEntities} DB entities · ${r.stats.businessProcesses} processes · ${r.stats.techRadar} tech-radar entries`);
    lines.push(`- Analyzed in **${r.timing.analyzeMs.toLocaleString()}ms** (model ${r.stats.modelSizeKb.toLocaleString()}KB)`);
    if (r.scenario) {
      lines.push(`- Simulator scenario: **${r.scenario.nodes} nodes, ${r.scenario.edges} edges**, ${r.scenario.trafficBaseline} req/s baseline`);
      if (r.scenario.inferences.length > 0) {
        lines.push("  - Inferences:");
        for (const inf of r.scenario.inferences) lines.push(`    - ${inf}`);
      }
    }
    lines.push("");
  }

  lines.push("## Reproducing");
  lines.push("");
  lines.push("```bash");
  lines.push("git clone https://github.com/muhsinelcicek/archlens");
  lines.push("cd archlens && pnpm install && pnpm -r build");
  lines.push("node scripts/run-benchmarks.mjs         # uses prebuilt CLI bundle");
  lines.push("```");
  lines.push("");
  lines.push("Clones land in `~/.archlens/bench/`. Pass `--fresh` to force re-clone.");
  lines.push("");
  return lines.join("\n");
}

console.log(`\n[bench] ${results.filter((r) => r.status === "ok").length}/${results.length} succeeded`);
