import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ThemeColors {
  void: string;           // deepest background (app canvas)
  deep: string;           // main content background
  surface: string;        // sidebar / toolbar surfaces
  elevated: string;       // cards / raised surfaces
  hover: string;          // hover state on rows/buttons
  borderSubtle: string;   // hairline / chip backgrounds
  borderDefault: string;  // normal borders
  dim: string;            // dead / disabled state
  textPrimary: string;    // headings, main text
  textSecondary: string;  // body text
  textMuted: string;      // labels, captions
  accent: string;
  accentDim: string;
  accentGlow: string;
}

export interface Theme {
  id: string;
  name: string;
  isDark: boolean;
  colors: ThemeColors;
  graphBg: string;
  graphGrid: string;
}

export const themes: Record<string, Theme> = {
  /* ═══════════════════════════════════════════════════════════════
     PAPER — polished light theme (default)
     A clean, Notion/Linear-inspired palette with soft grays and a
     refined purple accent. High contrast for readability.
     ═══════════════════════════════════════════════════════════════ */
  paper: {
    id: "paper",
    name: "Paper",
    isDark: false,
    colors: {
      void: "#ffffff",             // pure white canvas
      deep: "#fafafa",             // subtle off-white main area
      surface: "#f5f5f7",          // sidebar (Apple-ish gray)
      elevated: "#ffffff",         // cards pop as pure white
      hover: "#f0f0f3",            // gentle hover
      borderSubtle: "#ececf0",     // very subtle border
      borderDefault: "#d4d4d8",    // standard border (zinc-300)
      dim: "#e4e4e7",              // disabled/dead (zinc-200)
      textPrimary: "#18181b",      // near-black text (zinc-900)
      textSecondary: "#52525b",    // body text (zinc-600)
      textMuted: "#a1a1aa",        // captions (zinc-400)
      accent: "#7c3aed",           // purple (brand)
      accentDim: "#6d28d9",
      accentGlow: "rgba(124,58,237,0.15)",
    },
    graphBg: "radial-gradient(circle at 50% 30%, rgba(124,58,237,0.04) 0%, transparent 60%), #fafafa",
    graphGrid: "radial-gradient(circle, #e4e4e7 0.6px, transparent 0.6px)",
  },

  /* ═══════════════════════════════════════════════════════════════
     MIDNIGHT PURPLE — original dark theme
     ═══════════════════════════════════════════════════════════════ */
  midnight: {
    id: "midnight",
    name: "Midnight Purple",
    isDark: true,
    colors: {
      void: "#06060a", deep: "#0a0a10", surface: "#101018", elevated: "#16161f", hover: "#1c1c28",
      borderSubtle: "#1e1e2a", borderDefault: "#2a2a3a", dim: "#3f3f46",
      textPrimary: "#e4e4ed", textSecondary: "#8888a0", textMuted: "#5a5a70",
      accent: "#7c3aed", accentDim: "#5b21b6", accentGlow: "rgba(124,58,237,0.3)",
    },
    graphBg: "radial-gradient(circle at 50% 50%, rgba(124,58,237,0.04) 0%, transparent 60%), linear-gradient(to bottom, #06060a, #0a0a10)",
    graphGrid: "radial-gradient(circle, #1a1a2e 0.8px, transparent 0.8px)",
  },

  ocean: {
    id: "ocean",
    name: "Deep Ocean",
    isDark: true,
    colors: {
      void: "#020617", deep: "#0f172a", surface: "#1e293b", elevated: "#334155", hover: "#475569",
      borderSubtle: "#1e293b", borderDefault: "#334155", dim: "#475569",
      textPrimary: "#f1f5f9", textSecondary: "#94a3b8", textMuted: "#64748b",
      accent: "#0ea5e9", accentDim: "#0284c7", accentGlow: "rgba(14,165,233,0.3)",
    },
    graphBg: "radial-gradient(circle at 50% 50%, rgba(14,165,233,0.04) 0%, transparent 60%), linear-gradient(to bottom, #020617, #0f172a)",
    graphGrid: "radial-gradient(circle, #1e293b 0.8px, transparent 0.8px)",
  },

  emerald: {
    id: "emerald",
    name: "Emerald Forest",
    isDark: true,
    colors: {
      void: "#022c22", deep: "#064e3b", surface: "#065f46", elevated: "#047857", hover: "#059669",
      borderSubtle: "#065f46", borderDefault: "#047857", dim: "#059669",
      textPrimary: "#ecfdf5", textSecondary: "#a7f3d0", textMuted: "#6ee7b7",
      accent: "#10b981", accentDim: "#059669", accentGlow: "rgba(16,185,129,0.3)",
    },
    graphBg: "radial-gradient(circle at 50% 50%, rgba(16,185,129,0.04) 0%, transparent 60%), linear-gradient(to bottom, #022c22, #064e3b)",
    graphGrid: "radial-gradient(circle, #065f46 0.8px, transparent 0.8px)",
  },

  rose: {
    id: "rose",
    name: "Rose Gold",
    isDark: true,
    colors: {
      void: "#0c0a09", deep: "#1c1917", surface: "#292524", elevated: "#44403c", hover: "#57534e",
      borderSubtle: "#292524", borderDefault: "#44403c", dim: "#57534e",
      textPrimary: "#fafaf9", textSecondary: "#a8a29e", textMuted: "#78716c",
      accent: "#f43f5e", accentDim: "#e11d48", accentGlow: "rgba(244,63,94,0.3)",
    },
    graphBg: "radial-gradient(circle at 50% 50%, rgba(244,63,94,0.04) 0%, transparent 60%), linear-gradient(to bottom, #0c0a09, #1c1917)",
    graphGrid: "radial-gradient(circle, #292524 0.8px, transparent 0.8px)",
  },

  light: {
    id: "light",
    name: "Light Mode",
    isDark: false,
    colors: {
      void: "#ffffff", deep: "#f8fafc", surface: "#f1f5f9", elevated: "#e2e8f0", hover: "#cbd5e1",
      borderSubtle: "#e2e8f0", borderDefault: "#cbd5e1", dim: "#cbd5e1",
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

/**
 * Apply a theme by writing all color values to CSS custom properties on
 * document.documentElement. Components reference these via `var(--color-*)`
 * strings, so theme changes propagate without re-rendering React state.
 */
function applyThemeToRoot(t: Theme): void {
  const root = document.documentElement;
  const c = t.colors;

  root.setAttribute("data-theme", t.id);
  root.setAttribute("data-theme-mode", t.isDark ? "dark" : "light");

  root.style.setProperty("--color-void", c.void);
  root.style.setProperty("--color-deep", c.deep);
  root.style.setProperty("--color-surface", c.surface);
  root.style.setProperty("--color-elevated", c.elevated);
  root.style.setProperty("--color-hover", c.hover);
  root.style.setProperty("--color-border-subtle", c.borderSubtle);
  root.style.setProperty("--color-border-default", c.borderDefault);
  root.style.setProperty("--color-dim", c.dim);
  root.style.setProperty("--color-text-primary", c.textPrimary);
  root.style.setProperty("--color-text-secondary", c.textSecondary);
  root.style.setProperty("--color-text-muted", c.textMuted);
  root.style.setProperty("--color-accent", c.accent);
  root.style.setProperty("--color-accent-dim", c.accentDim);
  root.style.setProperty("--color-accent-glow", c.accentGlow);

  document.body.style.backgroundColor = c.void;
  document.body.style.color = c.textPrimary;
}

const DEFAULT_THEME_ID = "paper";

export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      themeId: DEFAULT_THEME_ID,
      theme: themes[DEFAULT_THEME_ID],
      setTheme: (id: string) => {
        const t = themes[id] || themes[DEFAULT_THEME_ID];
        applyThemeToRoot(t);
        set({ themeId: id, theme: t });
      },
    }),
    { name: "archlens-theme" },
  ),
);

/**
 * Apply the persisted theme (or the default) on page load, BEFORE React renders.
 * Call this once from main.tsx.
 */
export function initTheme(): void {
  let id = DEFAULT_THEME_ID;
  try {
    const saved = localStorage.getItem("archlens-theme");
    if (saved) {
      const parsed = JSON.parse(saved);
      const candidate = parsed?.state?.themeId;
      if (candidate && themes[candidate]) id = candidate;
    }
  } catch { /* use default */ }

  const t = themes[id];
  applyThemeToRoot(t);
  useTheme.setState({ themeId: id, theme: t });
}
