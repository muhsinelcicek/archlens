/**
 * API Client — tek bir yerden tüm backend çağrıları.
 *
 * Kurallar:
 * - Tüm fetch'ler buradan geçer
 * - Aktif proje otomatik eklenir
 * - Error handling merkezi
 * - Response type'ları tanımlı
 */

import { useStore } from "../lib/store.js";

const BASE = "/api";

function buildUrl(path: string): string {
  const project = useStore.getState().activeProject;
  const url = `${BASE}${path}`;
  if (!project) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}project=${encodeURIComponent(project)}`;
}

async function request<T>(path: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(buildUrl(path), options);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function post<T>(path: string, body: unknown): Promise<T | null> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ─── Typed API methods ──────────────────────────────────

export const api = {
  // Model
  getModel: () => request<any>("/model"),
  getProjects: () => request<any[]>("/projects"),

  // Analysis
  getQuality: () => request<QualityReport>("/quality"),
  getCoupling: () => request<CouplingReport>("/coupling"),
  getSecurity: () => request<SecurityReport>("/security"),
  getDeadCode: () => request<DeadCodeReport>("/deadcode"),
  getHotspots: () => request<HotspotReport>("/hotspots"),
  getTechDebt: () => request<TechDebtReport>("/techdebt"),
  getEventFlow: () => request<any>("/eventflow"),
  getPatterns: () => request<any>("/patterns"),
  getConsistency: () => request<any>("/consistency"),

  // File
  getFile: (path: string) => request<string>(`/file?path=${encodeURIComponent(path)}`),

  // Snapshots
  getSnapshots: () => request<SnapshotInfo[]>("/snapshots"),
  saveSnapshot: (name: string) => post<{ success: boolean }>("/snapshots", { name }),
  deleteSnapshot: (name: string) => request<any>(`/snapshots/${encodeURIComponent(name)}`, { method: "DELETE" }),
  diff: (base: string, head?: string) => post<DiffResult>("/diff", { baseSnapshot: base, headSnapshot: head || "current" }),

  // Rules
  getRules: () => request<{ rules: any[] }>("/rules"),
  saveRules: (rules: any[]) => post<{ success: boolean }>("/rules", { rules }),
  validateRules: (rules?: any[]) => post<any>("/rules/validate", rules ? { rules } : {}),

  // Comments
  getComments: (target?: string) => request<any[]>(`/comments${target ? `?target=${target}` : ""}`),
  addComment: (target: string, text: string, author = "You") => post<any>("/comments", { target, text, author }),
  deleteComment: (id: string) => request<any>(`/comments?id=${id}`, { method: "DELETE" }),

  // Reanalyze
  reanalyze: () => post<{ success: boolean; stats: any }>("/reanalyze", {}),
};

// ─── Response types ─────────────────────────────────────

export interface QualityReport {
  projectScore: number;
  totalIssues: number;
  bySeverity: Record<string, number>;
  modules: Array<{
    moduleName: string;
    score: number;
    issues: Array<{ id: string; rule: string; severity: string; message: string; filePath: string; line?: number }>;
    metrics: { totalSymbols: number; avgComplexity: number; maxMethodLines: number; godClasses: number };
  }>;
  architecturePatterns: any[];
  topIssues: any[];
}

export interface CouplingReport {
  overallHealth: { avgInstability: number; avgAbstractness: number; avgDistance: number; circularCount: number; concreteRatio: number };
  circularDependencies: Array<{ cycle: string[]; level: string }>;
  modules: Array<{ moduleName: string; afferentCoupling: number; efferentCoupling: number; instability: number }>;
}

export interface SecurityReport {
  totalIssues: number;
  score: number;
  bySeverity: Record<string, number>;
  issues: Array<{ id: string; severity: string; title: string; filePath: string; line: number }>;
}

export interface DeadCodeReport {
  totalDead: number;
  totalSymbols: number;
  deadPercentage: number;
  estimatedCleanupLines: number;
  items: any[];
  byModule: Array<{ module: string; count: number }>;
}

export interface HotspotReport {
  hotspots: Array<{ filePath: string; changeFrequency: number; complexity: number; riskScore: number; module: string; authors: string[] }>;
  totalFiles: number;
  riskiestModule: string;
  topRiskFiles: Array<{ filePath: string; changeFrequency: number; complexity: number; riskScore: number; module: string; authors: string[] }>;
  error?: string;
}

export interface TechDebtReport {
  totalEstimatedHours: number;
  totalEstimatedCost: number;
  totalAnnualCost: number;
  items: any[];
  quickWins: any[];
}

export interface SnapshotInfo {
  name: string;
  savedAt: string;
  stats: { files: number; symbols: number; modules: number };
}

export interface DiffResult {
  base: string;
  head: string;
  modulesAdded: string[];
  modulesRemoved: string[];
  modulesChanged: Array<{ name: string; symbolsDelta: number; linesDelta: number }>;
  endpointsAdded: any[];
  endpointsRemoved: any[];
  entitiesAdded: string[];
  entitiesRemoved: string[];
  summary: string;
}
