#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import type { ArchitectureModel, BusinessProcessInfo } from "@archlens/core";
import { GitDiffer, SequenceTracer } from "@archlens/core";

// ─── Load Model ──────────────────────────────────────────────────────

function findAndLoadModel(): { model: ArchitectureModel; modelPath: string } | null {
  // Search upward from cwd for .archlens/model.json
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    const modelPath = path.join(dir, ".archlens", "model.json");
    if (fs.existsSync(modelPath)) {
      const raw = JSON.parse(fs.readFileSync(modelPath, "utf-8"));
      // Convert symbols object back to Map
      raw.symbols = new Map(Object.entries(raw.symbols || {}));
      return { model: raw as ArchitectureModel, modelPath };
    }
    dir = path.dirname(dir);
  }
  return null;
}

// ─── MCP Server ──────────────────────────────────────────────────────

const server = new McpServer({
  name: "archlens",
  version: "0.1.0",
});

// ─── Tool: archlens_architecture ─────────────────────────────────────

server.tool(
  "archlens_architecture",
  "Get the full system architecture overview: modules, layers, statistics, tech stack. Use this to understand how the codebase is structured.",
  { detail_level: z.enum(["summary", "full"]).default("summary").describe("summary = stats + layers, full = includes module details") },
  async ({ detail_level }) => {
    const result = findAndLoadModel();
    if (!result) return { content: [{ type: "text" as const, text: "No ArchLens index found. Run `archlens analyze` first." }] };
    const { model } = result;

    const lines: string[] = [];
    lines.push(`# ${model.project.name} — Architecture Overview`);
    lines.push(`Analyzed: ${model.project.analyzedAt}`);
    lines.push("");
    lines.push("## Statistics");
    lines.push(`- Files: ${model.stats.files}`);
    lines.push(`- Symbols: ${model.stats.symbols}`);
    lines.push(`- Relations: ${model.stats.relations}`);
    lines.push(`- Lines of Code: ${model.stats.totalLines.toLocaleString()}`);
    lines.push(`- Modules: ${model.stats.modules}`);
    lines.push(`- API Endpoints: ${model.apiEndpoints.length}`);
    lines.push(`- DB Entities: ${model.dbEntities.length}`);
    lines.push(`- Business Processes: ${(model.businessProcesses || []).length}`);
    lines.push("");

    lines.push("## Languages");
    for (const [lang, count] of Object.entries(model.stats.languages)) {
      const pct = ((count / model.stats.symbols) * 100).toFixed(1);
      lines.push(`- ${lang}: ${count} symbols (${pct}%)`);
    }
    lines.push("");

    lines.push("## Architecture Layers");
    for (const [layer, modules] of Object.entries(model.layers)) {
      if (modules.length === 0) continue;
      lines.push(`### ${layer}`);
      for (const modName of modules) {
        const mod = model.modules.find((m) => m.name === modName);
        if (mod) {
          lines.push(`- **${mod.name}/** — ${mod.language}, ${mod.fileCount} files, ${mod.lineCount.toLocaleString()} lines, ${mod.symbols.length} symbols`);
        }
      }
      lines.push("");
    }

    if (detail_level === "full") {
      lines.push("## API Endpoints");
      for (const ep of model.apiEndpoints) {
        lines.push(`- \`${ep.method} ${ep.path}\` → ${ep.filePath}:${ep.line}`);
      }
      lines.push("");

      lines.push("## Database Entities");
      for (const entity of model.dbEntities) {
        lines.push(`### ${entity.name} (${entity.tableName || "?"})`);
        for (const col of entity.columns) {
          const pk = col.primary ? " **PK**" : "";
          lines.push(`- ${col.name}: ${col.type}${pk}`);
        }
        lines.push("");
      }

      lines.push("## Tech Stack");
      for (const tech of model.techRadar) {
        lines.push(`- ${tech.name} ${tech.version || ""} (${tech.category})`);
      }
    }

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  },
);

// ─── Tool: archlens_process ──────────────────────────────────────────

server.tool(
  "archlens_process",
  "Get detailed business process information: how the system works, algorithms, data sources, processing pipeline. Use this to understand WHAT the code does, not just HOW it's structured.",
  {
    process_name: z.string().optional().describe("Name or ID of specific process. Omit to list all."),
    show_algorithms: z.boolean().default(true).describe("Include algorithm details in each step"),
  },
  async ({ process_name, show_algorithms }) => {
    const result = findAndLoadModel();
    if (!result) return { content: [{ type: "text" as const, text: "No ArchLens index found. Run `archlens analyze` first." }] };
    const { model } = result;

    const processes = (model.businessProcesses || []) as BusinessProcessInfo[];
    if (processes.length === 0) {
      return { content: [{ type: "text" as const, text: "No business processes detected." }] };
    }

    const lines: string[] = [];

    // Filter or list all
    const targets = process_name
      ? processes.filter((p) => p.name.toLowerCase().includes(process_name.toLowerCase()) || p.id === process_name)
      : processes;

    if (targets.length === 0) {
      lines.push("No matching process found. Available processes:");
      for (const p of processes) {
        lines.push(`- **${p.name}** (${p.category}) — ${p.steps.length} steps`);
      }
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }

    for (const proc of targets) {
      lines.push(`# ${proc.name}`);
      lines.push(`**Category:** ${proc.category}`);
      lines.push(`**Description:** ${proc.description}`);
      lines.push("");

      // Data Sources
      if (proc.dataSources.length > 0) {
        lines.push("## Data Sources");
        for (const ds of proc.dataSources) {
          lines.push(`- **${ds.name}** (${ds.type}${ds.format ? `, ${ds.format}` : ""}): ${ds.description}`);
        }
        lines.push("");
      }

      // Processing Pipeline
      lines.push(`## Processing Pipeline (${proc.steps.length} steps)`);
      for (const step of proc.steps) {
        lines.push(`### Step ${step.order}: ${step.name}`);
        lines.push(step.description);
        lines.push(`- **Input:** ${step.inputData}`);
        lines.push(`- **Output:** ${step.outputData}`);

        if (show_algorithms && step.algorithm) {
          lines.push(`- **Algorithm:** ${step.algorithm}`);
        }

        if (step.details && step.details.length > 0) {
          lines.push("- **Details:**");
          for (const d of step.details) {
            lines.push(`  - ${d}`);
          }
        }

        if (step.symbolRef) {
          lines.push(`- **Code ref:** \`${step.symbolRef}\``);
        }
        lines.push("");
      }

      // Outputs
      if (proc.outputs.length > 0) {
        lines.push("## Outputs");
        for (const out of proc.outputs) {
          lines.push(`- **${out.name}** (${out.type}${out.format ? `, ${out.format}` : ""}): ${out.description}`);
        }
        lines.push("");
      }

      lines.push("---\n");
    }

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  },
);

// ─── Tool: archlens_impact ───────────────────────────────────────────

server.tool(
  "archlens_impact",
  "Analyze the impact of changing a symbol, file, or module. Shows what depends on it and what might break. Use BEFORE making changes.",
  {
    target: z.string().describe("Symbol name, file path, or module name to analyze"),
    direction: z.enum(["upstream", "downstream", "both"]).default("upstream").describe("upstream = who calls me, downstream = what I call"),
  },
  async ({ target, direction }) => {
    const result = findAndLoadModel();
    if (!result) return { content: [{ type: "text" as const, text: "No ArchLens index found." }] };
    const { model } = result;

    const lines: string[] = [];
    lines.push(`# Impact Analysis: ${target}`);
    lines.push(`Direction: ${direction}\n`);

    // Find matching symbols
    const matches: Array<{ uid: string; name: string; filePath: string }> = [];
    for (const [uid, sym] of model.symbols) {
      if (sym.name === target || sym.name.includes(target) || sym.filePath === target || sym.filePath.includes(target)) {
        matches.push({ uid, name: sym.name, filePath: sym.filePath });
      }
    }

    if (matches.length === 0) {
      // Try module match
      const mod = model.modules.find((m) => m.name === target);
      if (mod) {
        lines.push(`## Module: ${mod.name} (${mod.layer} layer)`);
        lines.push(`- ${mod.fileCount} files, ${mod.symbols.length} symbols, ${mod.lineCount} lines`);
        lines.push("");

        // Find what depends on this module
        const dependents = new Set<string>();
        const dependencies = new Set<string>();
        for (const rel of model.relations) {
          if (rel.type !== "imports") continue;
          const srcMod = rel.source.split("/")[0];
          const tgtSym = model.symbols.get(rel.target);
          const tgtMod = tgtSym?.filePath?.split("/")[0];
          if (tgtMod === mod.name && srcMod !== mod.name) dependents.add(srcMod);
          if (srcMod === mod.name && tgtMod && tgtMod !== mod.name) dependencies.add(tgtMod);
        }

        if (direction === "upstream" || direction === "both") {
          lines.push(`## Upstream (${dependents.size} modules depend on ${target})`);
          lines.push(dependents.size === 0 ? "No upstream dependents." : "");
          for (const dep of dependents) {
            const depMod = model.modules.find((m) => m.name === dep);
            lines.push(`- **${dep}** (${depMod?.layer || "?"}) — changes to ${target} may break this module`);
          }
          lines.push("");
        }

        if (direction === "downstream" || direction === "both") {
          lines.push(`## Downstream (${target} depends on ${dependencies.size} modules)`);
          for (const dep of dependencies) {
            lines.push(`- **${dep}**`);
          }
        }

        // Risk assessment
        const risk = dependents.size === 0 ? "LOW" : dependents.size <= 2 ? "MEDIUM" : "HIGH";
        lines.push(`\n## Risk: **${risk}**`);
        lines.push(`Changing \`${target}\` affects ${dependents.size} dependent module(s).`);
      } else {
        lines.push("No matching symbol, file, or module found.");
        lines.push("\nAvailable modules: " + model.modules.map((m) => m.name).join(", "));
      }
    } else {
      lines.push(`Found ${matches.length} matching symbol(s):\n`);

      for (const match of matches.slice(0, 10)) {
        lines.push(`## ${match.name}`);
        lines.push(`File: ${match.filePath}`);

        const incoming = model.relations.filter((r) => r.target === match.uid);
        const outgoing = model.relations.filter((r) => r.source === match.uid);

        if (direction === "upstream" || direction === "both") {
          lines.push(`\n### Upstream (${incoming.length} callers/importers)`);
          for (const rel of incoming.slice(0, 20)) {
            const src = model.symbols.get(rel.source);
            lines.push(`- [${rel.type}] ${src?.name || rel.source} (${src?.filePath || "?"})`);
          }
        }

        if (direction === "downstream" || direction === "both") {
          lines.push(`\n### Downstream (${outgoing.length} dependencies)`);
          for (const rel of outgoing.slice(0, 20)) {
            const tgt = model.symbols.get(rel.target);
            lines.push(`- [${rel.type}] ${tgt?.name || rel.target} (${tgt?.filePath || "?"})`);
          }
        }

        const risk = incoming.length === 0 ? "LOW" : incoming.length <= 5 ? "MEDIUM" : "HIGH";
        lines.push(`\n**Risk:** ${risk} — ${incoming.length} direct dependents`);
        lines.push("");
      }
    }

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  },
);

// ─── Tool: archlens_onboard ──────────────────────────────────────────

server.tool(
  "archlens_onboard",
  "Generate a comprehensive onboarding guide for new developers. Explains the project architecture, key business processes, tech stack, and how to navigate the codebase.",
  {
    focus: z.enum(["full", "architecture", "processes", "api", "database"]).default("full").describe("What aspect to focus on"),
  },
  async ({ focus }) => {
    const result = findAndLoadModel();
    if (!result) return { content: [{ type: "text" as const, text: "No ArchLens index found." }] };
    const { model } = result;

    const lines: string[] = [];
    const processes = (model.businessProcesses || []) as BusinessProcessInfo[];

    lines.push(`# Welcome to ${model.project.name}`);
    lines.push(`> Onboarding guide generated by ArchLens\n`);

    if (focus === "full" || focus === "architecture") {
      lines.push("## What is this project?");
      lines.push(`This is a ${Object.keys(model.stats.languages).join("/")} project with ${model.stats.files} files and ${model.stats.totalLines.toLocaleString()} lines of code.`);
      lines.push("");

      // Describe each layer
      lines.push("## How is it structured?");
      lines.push("The codebase follows a layered architecture:\n");

      const layerDescriptions: Record<string, string> = {
        presentation: "User interface — what the end user sees and interacts with",
        api: "API layer — HTTP endpoints that receive requests and return responses",
        application: "Application logic — orchestrates business operations",
        domain: "Domain/business logic — core algorithms and data models",
        infrastructure: "Infrastructure — database access, external services, file I/O",
        config: "Configuration — settings, environment variables, constants",
      };

      for (const [layer, moduleNames] of Object.entries(model.layers)) {
        if (moduleNames.length === 0) continue;
        const desc = layerDescriptions[layer] || "";
        lines.push(`### ${layer.charAt(0).toUpperCase() + layer.slice(1)} Layer`);
        if (desc) lines.push(`> ${desc}\n`);
        for (const modName of moduleNames) {
          const mod = model.modules.find((m) => m.name === modName);
          if (mod) {
            lines.push(`- **\`${mod.name}/\`** — ${mod.language}, ${mod.fileCount} files`);
          }
        }
        lines.push("");
      }

      // Module dependencies
      lines.push("## How do modules connect?");
      const depMap = new Map<string, Set<string>>();
      for (const rel of model.relations) {
        if (rel.type !== "imports") continue;
        const srcMod = rel.source.split("/")[0];
        const tgtSym = model.symbols.get(rel.target);
        const tgtMod = tgtSym?.filePath?.split("/")[0];
        if (srcMod && tgtMod && srcMod !== tgtMod) {
          if (!depMap.has(srcMod)) depMap.set(srcMod, new Set());
          depMap.get(srcMod)!.add(tgtMod);
        }
      }
      for (const [src, deps] of depMap) {
        lines.push(`- **${src}** depends on: ${[...deps].join(", ")}`);
      }
      lines.push("");
    }

    if (focus === "full" || focus === "processes") {
      lines.push("## What does it DO? (Business Processes)");
      lines.push(`The system implements ${processes.length} core processes:\n`);

      for (const proc of processes) {
        lines.push(`### ${proc.name}`);
        lines.push(proc.description);
        lines.push(`- **Data sources:** ${proc.dataSources.map((d) => d.name).join(", ")}`);
        lines.push(`- **Pipeline:** ${proc.steps.map((s) => s.name).join(" → ")}`);
        lines.push(`- **Outputs:** ${proc.outputs.map((o) => o.name).join(", ")}`);
        lines.push("");
      }
    }

    if (focus === "full" || focus === "api") {
      lines.push("## API Endpoints");
      // Group by resource
      const groups = new Map<string, typeof model.apiEndpoints>();
      for (const ep of model.apiEndpoints) {
        const parts = ep.path.split("/").filter(Boolean);
        const resource = parts.length >= 2 ? `/${parts[0]}/${parts[1]}` : `/${parts[0]}`;
        if (!groups.has(resource)) groups.set(resource, []);
        groups.get(resource)!.push(ep);
      }
      for (const [resource, endpoints] of groups) {
        lines.push(`\n### ${resource}`);
        for (const ep of endpoints) {
          lines.push(`- \`${ep.method} ${ep.path}\``);
        }
      }
      lines.push("");
    }

    if (focus === "full" || focus === "database") {
      lines.push("## Database Schema");
      for (const entity of model.dbEntities) {
        lines.push(`\n### ${entity.name}`);
        const cols = entity.columns.map((c) => {
          const pk = c.primary ? " (PK)" : "";
          return `${c.name}: ${c.type}${pk}`;
        });
        lines.push(`Columns: ${cols.join(", ")}`);
      }
      lines.push("");
    }

    lines.push("## Tech Stack");
    const byCat = new Map<string, string[]>();
    for (const t of model.techRadar) {
      if (!byCat.has(t.category)) byCat.set(t.category, []);
      byCat.get(t.category)!.push(`${t.name}${t.version ? ` v${t.version}` : ""}`);
    }
    for (const [cat, items] of byCat) {
      lines.push(`- **${cat}:** ${items.join(", ")}`);
    }

    lines.push("\n---");
    lines.push("*Use `archlens_process` to dive deeper into any business process.*");
    lines.push("*Use `archlens_impact` before making changes to understand blast radius.*");

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  },
);

// ─── Tool: archlens_drift ────────────────────────────────────────────

server.tool(
  "archlens_drift",
  "Detect architecture drift: compare current git changes against the saved architecture model. Reports changed symbols, new dependencies, layer violations, and module health. Uses real git diff.",
  {
    scope: z.enum(["staged", "unstaged", "all"]).default("all").describe("Which git changes to analyze"),
  },
  async ({ scope }) => {
    const result = findAndLoadModel();
    if (!result) return { content: [{ type: "text" as const, text: "No ArchLens index found." }] };
    const { model, modelPath } = result;

    const rootDir = path.dirname(path.dirname(modelPath));
    const differ = new GitDiffer(rootDir, model);
    const report = differ.generateReport(scope);

    const lines: string[] = [];
    lines.push(`# Architecture Drift Report`);
    lines.push(`**Score: ${report.summary.score}/100** | Index age: ${report.indexAge}h\n`);

    // Changed files
    if (report.changedFiles.length > 0) {
      lines.push(`## Changed Files (${report.changedFiles.length})`);
      for (const f of report.changedFiles.slice(0, 20)) {
        const icon = f.status === "added" ? "+" : f.status === "deleted" ? "-" : "~";
        lines.push(`- \`${icon}\` ${f.path}`);
      }
      lines.push("");
    }

    // Symbol changes
    if (report.symbolChanges.length > 0) {
      const added = report.symbolChanges.filter((s) => s.type === "added").length;
      const removed = report.symbolChanges.filter((s) => s.type === "removed").length;
      const modified = report.symbolChanges.filter((s) => s.type === "modified").length;
      lines.push(`## Symbol Changes`);
      lines.push(`Added: ${added} | Removed: ${removed} | Modified: ${modified}\n`);
      for (const sc of report.symbolChanges.slice(0, 15)) {
        const icon = sc.type === "added" ? "+" : sc.type === "removed" ? "-" : "~";
        lines.push(`- \`${icon}\` **${sc.name}** (${sc.kind}) in ${sc.filePath}`);
      }
      lines.push("");
    }

    // Layer violations
    if (report.layerViolations.length > 0) {
      lines.push(`## ❌ Layer Violations (${report.layerViolations.length})`);
      for (const v of report.layerViolations) {
        lines.push(`- **${v.sourceModule}** (${v.sourceLayer}) → **${v.targetModule}** (${v.targetLayer})`);
      }
      lines.push("");
    } else {
      lines.push("## ✅ No layer violations\n");
    }

    // Module health
    lines.push("## Module Health");
    for (const mod of report.moduleHealth) {
      const icon = mod.healthy ? "✅" : "⚠️";
      lines.push(`${icon} **${mod.name}/** — ${mod.files} files, ${mod.lines.toLocaleString()} lines${!mod.healthy ? ` — ${mod.issues.join(", ")}` : ""}`);
    }

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  },
);

// ─── Tool: archlens_sequence ──────────────────────────────────────────

server.tool(
  "archlens_sequence",
  "Generate a sequence diagram for an API endpoint or function. Shows the full call chain: who calls whom, in what order, across which modules. Use to understand execution flow.",
  {
    target: z.string().describe("API endpoint path (e.g., '/api/sales/monthly') or function/class name"),
    method: z.string().optional().describe("HTTP method for endpoint matching (GET, POST, etc.)"),
  },
  async ({ target, method }) => {
    const result = findAndLoadModel();
    if (!result) return { content: [{ type: "text" as const, text: "No ArchLens index found." }] };
    const { model } = result;

    const tracer = new SequenceTracer(model);
    const lines: string[] = [];

    // Try matching as API endpoint
    const endpoint = model.apiEndpoints.find((ep) =>
      ep.path.includes(target) && (!method || ep.method === method.toUpperCase()),
    );

    let diagram;
    if (endpoint) {
      diagram = tracer.traceEndpoint(endpoint);
    } else {
      // Try matching as symbol
      let matchedUid: string | undefined;
      for (const [uid, sym] of model.symbols) {
        if (sym.name === target || sym.name.includes(target)) {
          matchedUid = uid;
          break;
        }
      }
      if (matchedUid) {
        diagram = tracer.traceSymbol(matchedUid);
      }
    }

    if (!diagram || diagram.steps.length === 0) {
      lines.push(`No sequence found for "${target}".`);
      lines.push("\nAvailable API endpoints:");
      for (const ep of model.apiEndpoints.slice(0, 15)) {
        lines.push(`  ${ep.method} ${ep.path}`);
      }
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }

    lines.push(`# Sequence Diagram: ${diagram.title}\n`);

    // Participants
    lines.push("## Participants");
    for (const p of diagram.participants) {
      lines.push(`- **${p.name}** (${p.module}) [${p.kind}]`);
    }
    lines.push("");

    // Steps as sequence
    lines.push("## Call Sequence");
    for (const step of diagram.steps) {
      const indent = "  ".repeat(step.depth);
      const arrow = step.from === "Client" ? "→" : step.to === "Client" ? "←" : "→";
      const moduleInfo = step.fromModule !== step.toModule ? ` [${step.fromModule} → ${step.toModule}]` : "";
      lines.push(`${indent}${step.from} ${arrow} ${step.to}: \`${step.action}\`${moduleInfo}`);
      if (step.returnType) {
        lines.push(`${indent}  returns: ${step.returnType}`);
      }
    }

    // Mermaid format
    lines.push("\n## Mermaid Sequence Diagram");
    lines.push("```mermaid");
    lines.push("sequenceDiagram");
    for (const p of diagram.participants) {
      lines.push(`  participant ${p.name.replace(/[^a-zA-Z0-9_]/g, "_")}`);
    }
    for (const step of diagram.steps) {
      const from = step.from.replace(/[^a-zA-Z0-9_]/g, "_");
      const to = step.to.replace(/[^a-zA-Z0-9_]/g, "_");
      const arrow = step.to === "Client" ? "-->>" : "->>";
      lines.push(`  ${from}${arrow}${to}: ${step.action}`);
    }
    lines.push("```");

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  },
);

// ─── Tool: archlens_explain ──────────────────────────────────────────

server.tool(
  "archlens_explain",
  "Generate a comprehensive explanation of a module, class, or function. Describes what it does, its dependencies, its role in the architecture, and related business processes. Use to understand unfamiliar code.",
  {
    target: z.string().describe("Module name, class name, or file path to explain"),
  },
  async ({ target }) => {
    const result = findAndLoadModel();
    if (!result) return { content: [{ type: "text" as const, text: "No ArchLens index found." }] };
    const { model } = result;

    const lines: string[] = [];
    const processes = (model.businessProcesses || []) as BusinessProcessInfo[];

    // Try as module
    const mod = model.modules.find((m) => m.name.toLowerCase() === target.toLowerCase() || m.name.toLowerCase().includes(target.toLowerCase()));
    if (mod) {
      lines.push(`# ${mod.name}\n`);
      lines.push(`**Layer:** ${mod.layer}`);
      lines.push(`**Language:** ${mod.language}`);
      lines.push(`**Size:** ${mod.fileCount} files, ${mod.lineCount.toLocaleString()} lines, ${mod.symbols.length} symbols\n`);

      // What it does
      lines.push("## What does this module do?\n");

      // Find symbols in this module
      const moduleSymbols: Array<{ uid: string; sym: any }> = [];
      for (const uid of mod.symbols) {
        const sym = model.symbols.get(uid);
        if (sym) moduleSymbols.push({ uid, sym });
      }

      const classes = moduleSymbols.filter((s) => s.sym.kind === "class");
      const functions = moduleSymbols.filter((s) => s.sym.kind === "function");
      const interfaces = moduleSymbols.filter((s) => s.sym.kind === "interface");
      const methods = moduleSymbols.filter((s) => s.sym.kind === "method");

      if (classes.length > 0) {
        lines.push(`This module defines **${classes.length} classes**:`);
        for (const c of classes.slice(0, 10)) {
          const classMethods = methods.filter((m) => m.sym.name.startsWith(c.sym.name + "."));
          const inherited = c.sym.extends?.join(", ");
          const implemented = c.sym.implements?.join(", ");
          lines.push(`- **${c.sym.name}**${inherited ? ` extends ${inherited}` : ""}${implemented ? ` implements ${implemented}` : ""} — ${classMethods.length} methods`);
        }
        lines.push("");
      }

      if (interfaces.length > 0) {
        lines.push(`Defines **${interfaces.length} interfaces**: ${interfaces.map((i) => i.sym.name).join(", ")}\n`);
      }

      // API endpoints in this module
      const moduleFiles = new Set(moduleSymbols.map((s) => s.sym.filePath));
      const endpoints = model.apiEndpoints.filter((ep) => moduleFiles.has(ep.filePath));
      if (endpoints.length > 0) {
        lines.push(`## API Endpoints (${endpoints.length})\n`);
        for (const ep of endpoints) {
          lines.push(`- \`${ep.method} ${ep.path}\``);
        }
        lines.push("");
      }

      // DB entities
      const entities = model.dbEntities.filter((e) => moduleFiles.has((e as any).filePath));
      if (entities.length > 0) {
        lines.push(`## Database Entities (${entities.length})\n`);
        for (const e of entities) {
          lines.push(`- **${e.name}** — ${e.columns.length} columns`);
        }
        lines.push("");
      }

      // Dependencies
      const dependsOn = new Set<string>();
      const dependedBy = new Set<string>();
      for (const rel of model.relations) {
        if (rel.type === "composes") continue;
        const srcMod = findModuleForUid(model, rel.source);
        const tgtSym = model.symbols.get(rel.target);
        const tgtMod = tgtSym ? findModuleForUid(model, rel.target) : undefined;
        if (srcMod === mod.name && tgtMod && tgtMod !== mod.name) dependsOn.add(tgtMod);
        if (tgtMod === mod.name && srcMod && srcMod !== mod.name) dependedBy.add(srcMod);
      }

      lines.push(`## Dependencies\n`);
      lines.push(`**Depends on (${dependsOn.size}):** ${[...dependsOn].join(", ") || "none (leaf module)"}`);
      lines.push(`**Depended by (${dependedBy.size}):** ${[...dependedBy].join(", ") || "none (no dependents)"}\n`);

      // Related business processes
      const relatedProcesses = processes.filter((p) =>
        p.relatedSymbols.some((uid) => mod.symbols.includes(uid)) ||
        p.name.toLowerCase().includes(mod.name.toLowerCase()),
      );
      if (relatedProcesses.length > 0) {
        lines.push(`## Related Business Processes\n`);
        for (const p of relatedProcesses) {
          lines.push(`### ${p.name}`);
          lines.push(p.description);
          lines.push(`Pipeline: ${p.steps.map((s) => s.name).join(" → ")}\n`);
        }
      }

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }

    // Try as symbol
    let matchedSym: any = null;
    let matchedUid = "";
    for (const [uid, sym] of model.symbols) {
      if (sym.name === target || sym.name.includes(target)) {
        matchedSym = sym;
        matchedUid = uid;
        break;
      }
    }

    if (matchedSym) {
      lines.push(`# ${matchedSym.name}\n`);
      lines.push(`**Kind:** ${matchedSym.kind}`);
      lines.push(`**File:** ${matchedSym.filePath}:${matchedSym.startLine}-${matchedSym.endLine}`);
      lines.push(`**Visibility:** ${matchedSym.visibility}`);
      if (matchedSym.extends?.length) lines.push(`**Extends:** ${matchedSym.extends.join(", ")}`);
      if (matchedSym.implements?.length) lines.push(`**Implements:** ${matchedSym.implements.join(", ")}`);
      if (matchedSym.params?.length) {
        lines.push(`\n**Parameters:**`);
        for (const p of matchedSym.params) {
          lines.push(`- ${p.name}${p.type ? `: ${p.type}` : ""}${p.optional ? " (optional)" : ""}`);
        }
      }
      if (matchedSym.returnType) lines.push(`**Returns:** ${matchedSym.returnType}`);

      // Callers and callees
      const callers = model.relations.filter((r) => r.target === matchedUid && r.type !== "composes");
      const callees = model.relations.filter((r) => r.source === matchedUid && r.type !== "composes");

      if (callers.length > 0) {
        lines.push(`\n## Called by (${callers.length})`);
        for (const r of callers.slice(0, 10)) {
          const src = model.symbols.get(r.source);
          lines.push(`- [${r.type}] ${src?.name || r.source}`);
        }
      }

      if (callees.length > 0) {
        lines.push(`\n## Calls (${callees.length})`);
        for (const r of callees.slice(0, 10)) {
          const tgt = model.symbols.get(r.target);
          lines.push(`- [${r.type}] ${tgt?.name || r.target}`);
        }
      }

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }

    lines.push(`No module or symbol found matching "${target}".`);
    lines.push("\nAvailable modules: " + model.modules.map((m) => m.name).join(", "));

    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  },
);

// Helper for explain tool
function findModuleForUid(model: ArchitectureModel, uid: string): string | undefined {
  for (const mod of model.modules) {
    if (mod.symbols.includes(uid)) return mod.name;
  }
  // Try via file path
  const sym = model.symbols.get(uid);
  if (sym) {
    for (const mod of model.modules) {
      for (const mUid of mod.symbols) {
        const mSym = model.symbols.get(mUid);
        if (mSym && mSym.filePath === sym.filePath) return mod.name;
      }
    }
  }
  return undefined;
}

// ─── Resources ───────────────────────────────────────────────────────

server.resource(
  "archlens://architecture",
  "Full architecture model as JSON",
  async (uri) => {
    const result = findAndLoadModel();
    if (!result) return { contents: [{ uri: uri.href, mimeType: "text/plain", text: "No index found." }] };
    const { model } = result;

    // Convert Map to object for serialization
    const serializable = {
      ...model,
      symbols: Object.fromEntries(model.symbols),
    };

    return {
      contents: [{
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(serializable, null, 2),
      }],
    };
  },
);

// ─── Start ───────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
