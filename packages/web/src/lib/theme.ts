import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ThemeColors {
  void: string;
  deep: string;
  surface: string;
  elevated: string;
  hover: string;
  borderSubtle: string;
  borderDefault: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentDim: string;
  accentGlow: string;
}

export interface Theme {
  id: string;
  name: string;
  colors: ThemeColors;
  graphBg: string;
  graphGrid: string;
}

export const themes: Record<string, Theme> = {
  midnight: {
    id: "midnight",
    name: "Midnight Purple",
    colors: {
      void: "#06060a", deep: "#0a0a10", surface: "#101018", elevated: "#16161f", hover: "#1c1c28",
      borderSubtle: "#1e1e2a", borderDefault: "#2a2a3a",
      textPrimary: "#e4e4ed", textSecondary: "#8888a0", textMuted: "#5a5a70",
      accent: "#7c3aed", accentDim: "#5b21b6", accentGlow: "rgba(124,58,237,0.3)",
    },
    graphBg: "radial-gradient(circle at 50% 50%, rgba(124,58,237,0.04) 0%, transparent 60%), linear-gradient(to bottom, #06060a, #0a0a10)",
    graphGrid: "radial-gradient(circle, #1a1a2e 0.8px, transparent 0.8px)",
  },
  ocean: {
    id: "ocean",
    name: "Deep Ocean",
    colors: {
      void: "#020617", deep: "#0f172a", surface: "#1e293b", elevated: "#334155", hover: "#475569",
      borderSubtle: "#1e293b", borderDefault: "#334155",
      textPrimary: "#f1f5f9", textSecondary: "#94a3b8", textMuted: "#64748b",
      accent: "#0ea5e9", accentDim: "#0284c7", accentGlow: "rgba(14,165,233,0.3)",
    },
    graphBg: "radial-gradient(circle at 50% 50%, rgba(14,165,233,0.04) 0%, transparent 60%), linear-gradient(to bottom, #020617, #0f172a)",
    graphGrid: "radial-gradient(circle, #1e293b 0.8px, transparent 0.8px)",
  },
  emerald: {
    id: "emerald",
    name: "Emerald Forest",
    colors: {
      void: "#022c22", deep: "#064e3b", surface: "#065f46", elevated: "#047857", hover: "#059669",
      borderSubtle: "#065f46", borderDefault: "#047857",
      textPrimary: "#ecfdf5", textSecondary: "#a7f3d0", textMuted: "#6ee7b7",
      accent: "#10b981", accentDim: "#059669", accentGlow: "rgba(16,185,129,0.3)",
    },
    graphBg: "radial-gradient(circle at 50% 50%, rgba(16,185,129,0.04) 0%, transparent 60%), linear-gradient(to bottom, #022c22, #064e3b)",
    graphGrid: "radial-gradient(circle, #065f46 0.8px, transparent 0.8px)",
  },
  rose: {
    id: "rose",
    name: "Rose Gold",
    colors: {
      void: "#0c0a09", deep: "#1c1917", surface: "#292524", elevated: "#44403c", hover: "#57534e",
      borderSubtle: "#292524", borderDefault: "#44403c",
      textPrimary: "#fafaf9", textSecondary: "#a8a29e", textMuted: "#78716c",
      accent: "#f43f5e", accentDim: "#e11d48", accentGlow: "rgba(244,63,94,0.3)",
    },
    graphBg: "radial-gradient(circle at 50% 50%, rgba(244,63,94,0.04) 0%, transparent 60%), linear-gradient(to bottom, #0c0a09, #1c1917)",
    graphGrid: "radial-gradient(circle, #292524 0.8px, transparent 0.8px)",
  },
  light: {
    id: "light",
    name: "Light Mode",
    colors: {
      void: "#ffffff", deep: "#f8fafc", surface: "#f1f5f9", elevated: "#e2e8f0", hover: "#cbd5e1",
      borderSubtle: "#e2e8f0", borderDefault: "#cbd5e1",
      textPrimary: "#0f172a", textSecondary: "#475569", textMuted: "#94a3b8",
      accent: "#7c3aed", accentDim: "#6d28d9", accentGlow: "rgba(124,58,237,0.15)",
    },
    graphBg: "radial-gradient(circle at 50% 50%, rgba(124,58,237,0.03) 0%, transparent 60%), #f8fafc",
    graphGrid: "radial-gradient(circle, #e2e8f0 0.8px, transparent 0.8px)",
  },
};

interface ThemeState {
  themeId: string;
  theme: Theme;
  setTheme: (id: string) => void;
}

export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      themeId: "midnight",
      theme: themes.midnight,
      setTheme: (id: string) => {
        const t = themes[id] || themes.midnight;
        // Apply CSS variables to root
        const root = document.documentElement;
        root.style.setProperty("--color-void", t.colors.void);
        root.style.setProperty("--color-deep", t.colors.deep);
        root.style.setProperty("--color-surface", t.colors.surface);
        root.style.setProperty("--color-elevated", t.colors.elevated);
        root.style.setProperty("--color-hover", t.colors.hover);
        document.body.style.backgroundColor = t.colors.void;
        document.body.style.color = t.colors.textPrimary;
        set({ themeId: id, theme: t });
      },
    }),
    { name: "archlens-theme" },
  ),
);

// Apply saved theme on load
export function initTheme() {
  const saved = localStorage.getItem("archlens-theme");
  if (saved) {
    try {
      const { state } = JSON.parse(saved);
      if (state?.themeId && themes[state.themeId]) {
        useTheme.getState().setTheme(state.themeId);
      }
    } catch { /* use default */ }
  }
}
