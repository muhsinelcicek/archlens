import { create } from "zustand";

export interface ArchModel {
  project: {
    name: string;
    rootPath: string;
    analyzedAt: string;
    version: string;
  };
  stats: {
    files: number;
    symbols: number;
    relations: number;
    modules: number;
    languages: Record<string, number>;
    totalLines: number;
  };
  symbols: Record<string, unknown>;
  relations: Array<{ source: string; target: string; type: string }>;
  modules: Array<{
    name: string;
    path: string;
    layer: string;
    symbols: string[];
    language: string;
    fileCount: number;
    lineCount: number;
  }>;
  layers: Record<string, string[]>;
  dataFlows: Array<{
    id: string;
    name: string;
    description?: string;
    steps: Array<{ order: number; source: string; target: string; action: string; dataType?: string }>;
  }>;
  apiEndpoints: Array<{
    method: string;
    path: string;
    handler: string;
    filePath: string;
    line: number;
  }>;
  dbEntities: Array<{
    name: string;
    tableName?: string;
    columns: Array<{ name: string; type: string; primary?: boolean; nullable?: boolean }>;
  }>;
  techRadar: Array<{
    name: string;
    version?: string;
    category: string;
    source: string;
  }>;
  businessProcesses: Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    dataSources: Array<{ name: string; type: string; format?: string; description: string }>;
    steps: Array<{
      order: number;
      name: string;
      description: string;
      algorithm?: string;
      symbolRef?: string;
      inputData: string;
      outputData: string;
      details?: string[];
    }>;
    outputs: Array<{ name: string; type: string; format?: string; description: string }>;
    relatedSymbols: string[];
  }>;
}

export interface ProjectInfo {
  name: string;
  repoUrl: string;
  analyzedAt: string;
  stats: { files: number; symbols: number; modules: number; lines: number };
}

interface AppState {
  model: ArchModel | null;
  diagrams: Record<string, string>;
  projects: ProjectInfo[];
  activeProject: string | null;
  loading: boolean;
  error: string | null;
  activeView: string;
  setActiveView: (view: string) => void;
  fetchProjects: () => Promise<void>;
  switchProject: (name: string) => Promise<void>;
  fetchModel: () => Promise<void>;
  fetchDiagrams: () => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  model: null,
  diagrams: {},
  projects: [],
  activeProject: null,
  loading: false,
  error: null,
  activeView: "dashboard",

  setActiveView: (view) => set({ activeView: view }),

  fetchProjects: async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const projects = await res.json();
        set({ projects });
      }
    } catch { /* silent */ }
  },

  switchProject: async (name: string) => {
    set({ loading: true, activeProject: name });
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(name)}/model`);
      if (res.ok) {
        const model = await res.json();
        set({ model, loading: false });
        // Also fetch diagrams
        const dRes = await fetch(`/api/projects/${encodeURIComponent(name)}/diagrams`);
        if (dRes.ok) {
          const diagrams = await dRes.json();
          set({ diagrams });
        }
      } else {
        set({ loading: false, error: "Failed to load project" });
      }
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  fetchModel: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/model");
      if (!res.ok) throw new Error("Failed to fetch model");
      const model = await res.json();
      set({ model, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  fetchDiagrams: async () => {
    try {
      const res = await fetch("/api/diagrams");
      if (!res.ok) return;
      const diagrams = await res.json();
      set({ diagrams });
    } catch {
      // Silent fail — diagrams are optional
    }
  },
}));
