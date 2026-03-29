import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { ArchitectureModel } from "../models/index.js";

export interface ArchDiff {
  base: string;
  head: string;
  modulesAdded: string[];
  modulesRemoved: string[];
  modulesChanged: Array<{ name: string; symbolsDelta: number; linesDelta: number }>;
  endpointsAdded: Array<{ method: string; path: string }>;
  endpointsRemoved: Array<{ method: string; path: string }>;
  entitiesAdded: string[];
  entitiesRemoved: string[];
  summary: string;
}

/**
 * DiffAnalyzer — compares two architecture models (e.g., main vs branch).
 */
export class DiffAnalyzer {
  compare(before: ArchitectureModel, after: ArchitectureModel): ArchDiff {
    const beforeModNames = new Set(before.modules.map((m) => m.name));
    const afterModNames = new Set(after.modules.map((m) => m.name));

    const modulesAdded = [...afterModNames].filter((n) => !beforeModNames.has(n));
    const modulesRemoved = [...beforeModNames].filter((n) => !afterModNames.has(n));
    const modulesChanged: ArchDiff["modulesChanged"] = [];

    for (const name of afterModNames) {
      if (!beforeModNames.has(name)) continue;
      const bMod = before.modules.find((m) => m.name === name)!;
      const aMod = after.modules.find((m) => m.name === name)!;
      const symDelta = aMod.symbols.length - bMod.symbols.length;
      const linesDelta = aMod.lineCount - bMod.lineCount;
      if (symDelta !== 0 || linesDelta !== 0) {
        modulesChanged.push({ name, symbolsDelta: symDelta, linesDelta });
      }
    }

    // Endpoints
    const beforeEps = new Set(before.apiEndpoints.map((e) => `${e.method}:${e.path}`));
    const afterEps = new Set(after.apiEndpoints.map((e) => `${e.method}:${e.path}`));
    const endpointsAdded = after.apiEndpoints.filter((e) => !beforeEps.has(`${e.method}:${e.path}`)).map((e) => ({ method: e.method, path: e.path }));
    const endpointsRemoved = before.apiEndpoints.filter((e) => !afterEps.has(`${e.method}:${e.path}`)).map((e) => ({ method: e.method, path: e.path }));

    // Entities
    const beforeEntities = new Set(before.dbEntities.map((e) => e.name));
    const afterEntities = new Set(after.dbEntities.map((e) => e.name));
    const entitiesAdded = [...afterEntities].filter((n) => !beforeEntities.has(n));
    const entitiesRemoved = [...beforeEntities].filter((n) => !afterEntities.has(n));

    const parts: string[] = [];
    if (modulesAdded.length) parts.push(`+${modulesAdded.length} modules`);
    if (modulesRemoved.length) parts.push(`-${modulesRemoved.length} modules`);
    if (modulesChanged.length) parts.push(`~${modulesChanged.length} modules changed`);
    if (endpointsAdded.length) parts.push(`+${endpointsAdded.length} endpoints`);
    if (endpointsRemoved.length) parts.push(`-${endpointsRemoved.length} endpoints`);
    if (entitiesAdded.length) parts.push(`+${entitiesAdded.length} entities`);

    return {
      base: before.project.analyzedAt,
      head: after.project.analyzedAt,
      modulesAdded, modulesRemoved, modulesChanged,
      endpointsAdded, endpointsRemoved,
      entitiesAdded, entitiesRemoved,
      summary: parts.join(", ") || "No architecture changes",
    };
  }
}
