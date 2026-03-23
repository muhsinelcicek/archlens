import type { ArchitectureModel, LayerType, DbEntity, DataFlow, ApiEndpoint, TechEntry } from "../models/index.js";

/**
 * Generates Mermaid diagram markup from an ArchitectureModel.
 * Supports: C4 Architecture, ER, Data Flow, Dependency, API Map, Sequence.
 */
export class MermaidGenerator {
  constructor(private model: ArchitectureModel) {}

  // ─── C4 System Architecture ──────────────────────────────────────

  generateC4Architecture(): string {
    const lines: string[] = ["graph TB"];

    const layerLabels: Record<LayerType, string> = {
      presentation: "Presentation Layer",
      api: "API Layer",
      application: "Application Layer",
      domain: "Domain Layer",
      infrastructure: "Infrastructure Layer",
      config: "Configuration",
      test: "Tests",
      unknown: "Other",
    };

    const layerStyles: Record<LayerType, string> = {
      presentation: "fill:#4CAF50,stroke:#2E7D32,color:#fff",
      api: "fill:#2196F3,stroke:#1565C0,color:#fff",
      application: "fill:#FF9800,stroke:#E65100,color:#fff",
      domain: "fill:#9C27B0,stroke:#6A1B9A,color:#fff",
      infrastructure: "fill:#F44336,stroke:#C62828,color:#fff",
      config: "fill:#607D8B,stroke:#37474F,color:#fff",
      test: "fill:#795548,stroke:#4E342E,color:#fff",
      unknown: "fill:#9E9E9E,stroke:#616161,color:#fff",
    };

    // Create subgraphs for each layer
    for (const [layer, moduleNames] of Object.entries(this.model.layers)) {
      if (moduleNames.length === 0) continue;

      const layerType = layer as LayerType;
      lines.push("");
      lines.push(`  subgraph ${layer}["${layerLabels[layerType]}"]`);

      for (const modName of moduleNames) {
        const mod = this.model.modules.find((m) => m.name === modName);
        if (!mod) continue;

        const nodeId = this.sanitizeId(modName);
        const label = `${modName}\\n${mod.fileCount} files | ${mod.lineCount} lines`;
        lines.push(`    ${nodeId}["${label}"]`);
      }

      lines.push("  end");
    }

    // Add inter-module dependencies
    lines.push("");
    const addedEdges = new Set<string>();

    for (const relation of this.model.relations) {
      if (relation.type === "imports") {
        const sourceModule = this.findModuleForFile(relation.source);
        const targetSymbol = this.model.symbols.get(relation.target);
        const targetModule = targetSymbol
          ? this.findModuleForPath(targetSymbol.filePath)
          : undefined;

        if (sourceModule && targetModule && sourceModule !== targetModule) {
          const edgeKey = `${sourceModule}-->${targetModule}`;
          if (!addedEdges.has(edgeKey)) {
            addedEdges.add(edgeKey);
            lines.push(`  ${this.sanitizeId(sourceModule)} --> ${this.sanitizeId(targetModule)}`);
          }
        }
      }
    }

    // Add styles
    lines.push("");
    for (const [layer, moduleNames] of Object.entries(this.model.layers)) {
      const style = layerStyles[layer as LayerType];
      for (const modName of moduleNames) {
        lines.push(`  style ${this.sanitizeId(modName)} ${style}`);
      }
    }

    return lines.join("\n");
  }

  // ─── ER Diagram ────────────────────────────────────────────────

  generateERDiagram(): string {
    if (this.model.dbEntities.length === 0) {
      return "erDiagram\n  NO_ENTITIES[\"No database entities detected\"]";
    }

    const lines: string[] = ["erDiagram"];

    for (const entity of this.model.dbEntities) {
      lines.push(`  ${entity.name} {`);
      for (const col of entity.columns) {
        const pk = col.primary ? "PK" : "";
        const nullable = col.nullable ? "" : "NOT NULL";
        lines.push(`    ${col.type} ${col.name} ${pk} ${nullable}`.trimEnd());
      }
      lines.push("  }");

      // Add relations
      for (const rel of entity.relations) {
        const cardinality =
          rel.type === "one-to-one" ? "||--||"
          : rel.type === "one-to-many" ? "||--o{"
          : "}o--o{";
        lines.push(`  ${rel.from} ${cardinality} ${rel.to} : "${rel.foreignKey || "relates"}"`);
      }
    }

    return lines.join("\n");
  }

  // ─── Data Flow Diagram ─────────────────────────────────────────

  generateDataFlow(flowId?: string): string {
    const flows = flowId
      ? this.model.dataFlows.filter((f) => f.id === flowId)
      : this.model.dataFlows;

    if (flows.length === 0) {
      return "graph LR\n  NO_FLOWS[\"No data flows detected\"]";
    }

    const lines: string[] = ["graph LR"];

    for (const flow of flows) {
      lines.push(`  %% ${flow.name}: ${flow.description || ""}`);

      for (const step of flow.steps) {
        const sourceId = this.sanitizeId(step.source);
        const targetId = this.sanitizeId(step.target);
        const label = step.dataType ? `${step.action}\\n[${step.dataType}]` : step.action;
        lines.push(`  ${sourceId} -->|"${label}"| ${targetId}`);
      }
    }

    return lines.join("\n");
  }

  // ─── Dependency Graph ──────────────────────────────────────────

  generateDependencyGraph(): string {
    const lines: string[] = ["graph TD"];

    // Module-level dependencies
    const edgeSet = new Set<string>();

    for (const mod of this.model.modules) {
      const nodeId = this.sanitizeId(mod.name);
      const langEmoji = this.langEmoji(mod.language);
      lines.push(`  ${nodeId}["${langEmoji} ${mod.name}\\n${mod.fileCount} files"]`);
    }

    for (const relation of this.model.relations) {
      if (relation.type !== "imports") continue;

      const srcMod = this.findModuleForFile(relation.source);
      const tgtSym = this.model.symbols.get(relation.target);
      const tgtMod = tgtSym ? this.findModuleForPath(tgtSym.filePath) : undefined;

      if (srcMod && tgtMod && srcMod !== tgtMod) {
        const key = `${srcMod}->${tgtMod}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          lines.push(`  ${this.sanitizeId(srcMod)} --> ${this.sanitizeId(tgtMod)}`);
        }
      }
    }

    return lines.join("\n");
  }

  // ─── API Map ───────────────────────────────────────────────────

  generateAPIMap(): string {
    if (this.model.apiEndpoints.length === 0) {
      return "graph LR\n  NO_API[\"No API endpoints detected\"]";
    }

    const lines: string[] = ["graph LR"];
    lines.push('  Client(("Client"))');

    // Group endpoints by path prefix
    const groups = new Map<string, ApiEndpoint[]>();
    for (const ep of this.model.apiEndpoints) {
      const prefix = ep.path.split("/").slice(0, 3).join("/") || "/";
      if (!groups.has(prefix)) groups.set(prefix, []);
      groups.get(prefix)!.push(ep);
    }

    for (const [prefix, endpoints] of groups) {
      const groupId = this.sanitizeId(prefix);
      lines.push(`  subgraph ${groupId}["${prefix}"]`);

      for (const ep of endpoints) {
        const epId = this.sanitizeId(`${ep.method}_${ep.path}`);
        const methodColor =
          ep.method === "GET" ? ":::get"
          : ep.method === "POST" ? ":::post"
          : ep.method === "PUT" ? ":::put"
          : ":::delete";
        lines.push(`    ${epId}["${ep.method} ${ep.path}"]${methodColor}`);
        lines.push(`    Client --> ${epId}`);
      }

      lines.push("  end");
    }

    // Styles
    lines.push("  classDef get fill:#61affe,stroke:#49699e,color:#fff");
    lines.push("  classDef post fill:#49cc90,stroke:#3b9b6e,color:#fff");
    lines.push("  classDef put fill:#fca130,stroke:#c47f17,color:#fff");
    lines.push("  classDef delete fill:#f93e3e,stroke:#c42e2e,color:#fff");

    return lines.join("\n");
  }

  // ─── Tech Radar ────────────────────────────────────────────────

  generateTechRadar(): string {
    const lines: string[] = ["mindmap", `  root(("${this.model.project.name}\\nTech Stack"))`];

    const byCategory = new Map<string, TechEntry[]>();
    for (const entry of this.model.techRadar) {
      const cat = entry.category;
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(entry);
    }

    const categoryEmojis: Record<string, string> = {
      framework: "Frameworks",
      library: "Libraries",
      tool: "Tools",
      database: "Databases",
      language: "Languages",
      runtime: "Runtime",
    };

    for (const [category, entries] of byCategory) {
      const label = categoryEmojis[category] || category;
      lines.push(`    ${label}`);
      for (const entry of entries.slice(0, 15)) {
        const ver = entry.version ? ` v${entry.version}` : "";
        lines.push(`      ${entry.name}${ver}`);
      }
    }

    return lines.join("\n");
  }

  // ─── Full Report (All Diagrams) ────────────────────────────────

  generateFullReport(): Record<string, string> {
    return {
      "system-architecture": this.generateC4Architecture(),
      "er-diagram": this.generateERDiagram(),
      "data-flow": this.generateDataFlow(),
      "dependency-graph": this.generateDependencyGraph(),
      "api-map": this.generateAPIMap(),
      "tech-radar": this.generateTechRadar(),
    };
  }

  // ─── Helpers ───────────────────────────────────────────────────

  private sanitizeId(input: string): string {
    return input.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^_+|_+$/g, "");
  }

  private findModuleForFile(filePath: string): string | undefined {
    const parts = filePath.split("/");
    const moduleName = parts.length > 1 ? parts[0] : "root";
    return this.model.modules.find((m) => m.name === moduleName)?.name;
  }

  private findModuleForPath(filePath: string): string | undefined {
    return this.findModuleForFile(filePath);
  }

  private langEmoji(lang: string): string {
    const emojis: Record<string, string> = {
      typescript: "TS",
      javascript: "JS",
      python: "PY",
      java: "JV",
      go: "GO",
      rust: "RS",
    };
    return emojis[lang] || lang.toUpperCase().slice(0, 2);
  }
}
