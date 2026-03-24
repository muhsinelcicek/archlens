import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export interface FileHashMap {
  version: string;
  generatedAt: string;
  configHash: string; // hash of tsconfig.json etc — invalidates all if changed
  files: Record<string, string>; // relativePath → sha256
}

export interface IncrementalResult {
  unchanged: string[];
  modified: string[];
  added: string[];
  deleted: string[];
  configChanged: boolean;
}

/**
 * IncrementalCache — tracks file hashes to enable partial re-analysis.
 * Only changed/added files need re-parsing; unchanged files reuse cached model.
 */
export class IncrementalCache {
  private hashesPath: string;
  private cached: FileHashMap | null = null;

  constructor(private rootDir: string, private outputDir: string) {
    this.hashesPath = path.join(outputDir, "file-hashes.json");
    this.load();
  }

  /**
   * Check if cache exists and is valid
   */
  get isAvailable(): boolean {
    return this.cached !== null;
  }

  /**
   * Compare current files against cached hashes
   */
  diff(currentFiles: string[]): IncrementalResult {
    if (!this.cached) {
      return {
        unchanged: [],
        modified: [],
        added: currentFiles,
        deleted: [],
        configChanged: false,
      };
    }

    // Check config hash (tsconfig.json, pyproject.toml, etc.)
    const currentConfigHash = this.computeConfigHash();
    const configChanged = currentConfigHash !== this.cached.configHash;

    if (configChanged) {
      // Config changed — everything needs re-parsing
      return {
        unchanged: [],
        modified: [],
        added: currentFiles,
        deleted: Object.keys(this.cached.files),
        configChanged: true,
      };
    }

    const unchanged: string[] = [];
    const modified: string[] = [];
    const added: string[] = [];

    const cachedPaths = new Set(Object.keys(this.cached.files));

    for (const file of currentFiles) {
      const relPath = path.relative(this.rootDir, file);
      const currentHash = this.hashFile(file);
      const cachedHash = this.cached.files[relPath];

      if (!cachedHash) {
        added.push(file);
      } else if (cachedHash !== currentHash) {
        modified.push(file);
      } else {
        unchanged.push(file);
      }
      cachedPaths.delete(relPath);
    }

    // Remaining cached paths are deleted files
    const deleted = [...cachedPaths];

    return { unchanged, modified, added, deleted, configChanged: false };
  }

  /**
   * Save current file hashes
   */
  save(files: string[]): void {
    const hashes: Record<string, string> = {};
    for (const file of files) {
      const relPath = path.relative(this.rootDir, file);
      hashes[relPath] = this.hashFile(file);
    }

    const data: FileHashMap = {
      version: "1.0",
      generatedAt: new Date().toISOString(),
      configHash: this.computeConfigHash(),
      files: hashes,
    };

    fs.mkdirSync(this.outputDir, { recursive: true });
    fs.writeFileSync(this.hashesPath, JSON.stringify(data));
  }

  /**
   * Get stats for display
   */
  getStats(result: IncrementalResult): string {
    const total = result.unchanged.length + result.modified.length + result.added.length;
    const parsed = result.modified.length + result.added.length;
    return `${parsed} files to parse (${result.unchanged.length} unchanged, ${result.modified.length} modified, ${result.added.length} added, ${result.deleted.length} deleted)`;
  }

  private load(): void {
    try {
      if (fs.existsSync(this.hashesPath)) {
        this.cached = JSON.parse(fs.readFileSync(this.hashesPath, "utf-8"));
      }
    } catch {
      this.cached = null;
    }
  }

  private hashFile(absPath: string): string {
    try {
      const content = fs.readFileSync(absPath);
      return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
    } catch {
      return "error";
    }
  }

  private computeConfigHash(): string {
    const configFiles = [
      "tsconfig.json",
      "pyproject.toml",
      "go.mod",
      "pom.xml",
      "Package.swift",
      ".archlensrc",
    ];

    const hash = crypto.createHash("sha256");
    for (const cf of configFiles) {
      const cfPath = path.join(this.rootDir, cf);
      if (fs.existsSync(cfPath)) {
        hash.update(fs.readFileSync(cfPath));
      }
    }
    return hash.digest("hex").slice(0, 16);
  }
}
