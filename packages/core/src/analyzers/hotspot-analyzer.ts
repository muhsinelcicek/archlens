import { execSync } from "node:child_process";
import type { ArchitectureModel } from "../models/index.js";

export interface Hotspot {
  filePath: string;
  changeFrequency: number; // commits touching this file
  complexity: number; // lines or symbol count
  riskScore: number; // frequency × complexity normalized 0-100
  authors: string[];
  lastChanged: string;
  module: string;
}

export interface HotspotReport {
  hotspots: Hotspot[];
  totalFiles: number;
  riskiestModule: string;
  topRiskFiles: Hotspot[];
  isShallowClone?: boolean;
  shallowCloneWarning?: string;
}

/**
 * HotspotAnalyzer — combines git change frequency with code complexity
 * to identify high-risk areas (files changed often AND complex).
 * Based on Adam Tornhill's "Your Code as a Crime Scene" methodology.
 */
export class HotspotAnalyzer {
  constructor(
    private model: ArchitectureModel,
    private rootDir: string,
  ) {}

  analyze(since = "6 months ago"): HotspotReport {
    // Get git log: file change frequency
    const changeFreq = this.getChangeFrequency(since);
    const authorMap = this.getFileAuthors(since);

    // Build hotspots
    const hotspots: Hotspot[] = [];
    const filePaths = new Set<string>();
    for (const [, sym] of this.model.symbols) {
      filePaths.add(sym.filePath);
    }

    // Calculate complexity per file
    const fileComplexity = new Map<string, number>();
    for (const fp of filePaths) {
      let complexity = 0;
      for (const [, sym] of this.model.symbols) {
        if (sym.filePath === fp) {
          const lines = (sym.endLine || 0) - (sym.startLine || 0);
          complexity += lines;
          if (sym.kind === "class") complexity += 10; // Classes add base complexity
          if (sym.kind === "method" || sym.kind === "function") complexity += 5;
        }
      }
      fileComplexity.set(fp, complexity);
    }

    const maxFreq = Math.max(...changeFreq.values(), 1);
    const maxComplexity = Math.max(...fileComplexity.values(), 1);

    for (const fp of filePaths) {
      const freq = changeFreq.get(fp) || 0;
      const comp = fileComplexity.get(fp) || 0;
      const normFreq = freq / maxFreq;
      const normComp = comp / maxComplexity;
      const riskScore = Math.round(normFreq * normComp * 100);

      // Find module
      let moduleName = "unknown";
      for (const mod of this.model.modules) {
        if (mod.symbols.some((uid) => this.model.symbols.get(uid)?.filePath === fp)) {
          moduleName = mod.name;
          break;
        }
      }

      hotspots.push({
        filePath: fp,
        changeFrequency: freq,
        complexity: comp,
        riskScore,
        authors: authorMap.get(fp) || [],
        lastChanged: "",
        module: moduleName,
      });
    }

    hotspots.sort((a, b) => b.riskScore - a.riskScore);

    // Find riskiest module
    const moduleRisk = new Map<string, number>();
    for (const h of hotspots) {
      moduleRisk.set(h.module, (moduleRisk.get(h.module) || 0) + h.riskScore);
    }
    const riskiestModule = [...moduleRisk.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "unknown";

    // Detect shallow clone: if all files have same changeFrequency (usually 1)
    const freqValues = new Set(hotspots.map((h) => h.changeFrequency));
    const isShallowClone = freqValues.size === 1 && hotspots.length > 10;

    return {
      hotspots,
      totalFiles: filePaths.size,
      riskiestModule,
      topRiskFiles: hotspots.slice(0, 20),
      isShallowClone,
      shallowCloneWarning: isShallowClone
        ? "Git history is limited (shallow clone). Hotspot analysis requires full git history for accurate results. Run 'git fetch --unshallow' for better accuracy."
        : undefined,
    };
  }

  private getChangeFrequency(since: string): Map<string, number> {
    const freq = new Map<string, number>();
    try {
      const output = execSync(
        `git log --since="${since}" --name-only --pretty=format: --no-merges`,
        { cwd: this.rootDir, encoding: "utf-8", timeout: 15000 },
      );
      for (const line of output.split("\n")) {
        const trimmed = line.trim();
        if (trimmed) freq.set(trimmed, (freq.get(trimmed) || 0) + 1);
      }
    } catch { /* not a git repo or shallow clone */ }
    return freq;
  }

  private getFileAuthors(since: string): Map<string, string[]> {
    const authors = new Map<string, string[]>();
    try {
      const output = execSync(
        `git log --since="${since}" --name-only --pretty=format:"%an" --no-merges`,
        { cwd: this.rootDir, encoding: "utf-8", timeout: 15000 },
      );
      let currentAuthor = "";
      for (const line of output.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
          currentAuthor = trimmed.replace(/"/g, "");
        } else if (trimmed && currentAuthor) {
          if (!authors.has(trimmed)) authors.set(trimmed, []);
          const arr = authors.get(trimmed)!;
          if (!arr.includes(currentAuthor)) arr.push(currentAuthor);
        }
      }
    } catch { /* not a git repo */ }
    return authors;
  }
}
