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
     DARK — Railway-inspired deep dark with violet accent (DEFAULT)
     ═══════════════════════════════════════════════════════════════ */
  dark: {
    id: "dark",
    name: "Dark",
    isDark: true,
    colors: {
      void: "#0a0a0f",
      deep: "#0f0f17",
      surface: "#16161f",
      elevated: "#1e1e2a",
      hover: "#262636",
      borderSubtle: "rgba(255,255,255,0.04)",
      borderDefault: "rgba(255,255,255,0.08)",
      dim: "#3f3f46",
      textPrimary: "#ededef",
      textSecondary: "#a1a1aa",
      textMuted: "#63636e",
      accent: "#8b5cf6",
      accentDim: "#6d28d9",
      accentGlow: "rgba(139,92,246,0.3)",
    },
    graphBg: "radial-gradient(circle at 50% 50%, rgba(139,92,246,0.04) 0%, transparent 60%), linear-gradient(135deg, #0a0a0f, #0f0f17)",
    graphGrid: "radial-gradient(circle, rgba(255,255,255,0.04) 0.8px, transparent 0.8px)",
  },

  /* ═══════════════════════════════════════════════════════════════
     LIGHT — Clean white with violet accent
     ═══════════════════════════════════════════════════════════════ */
  light: {
    id: "light",
    name: "Light",
    isDark: false,
    colors: {
      void: "#f0f0f5",              // soft gray-blue (not pure white)
      deep: "#e8e8f0",              // canvas/graph area — visible contrast
      surface: "#f5f5fa",           // sidebar, panels
      elevated: "#ffffff",          // cards pop on gray bg
      hover: "#eaeaf2",
      borderSubtle: "#e0e0ea",
      borderDefault: "#d0d0dd",     // stronger borders for visibility
      dim: "#b0b0c0",
      textPrimary: "#1a1a2e",       // deep indigo-black
      textSecondary: "#4a4a60",
      textMuted: "#7a7a90",
      accent: "#7c3aed",
      accentDim: "#6d28d9",
      accentGlow: "rgba(124,58,237,0.15)",
    },
    graphBg: "radial-gradient(circle at 50% 30%, rgba(124,58,237,0.05) 0%, transparent 70%), #e8e8f0",
    graphGrid: "radial-gradient(circle, #d0d0dd 0.6px, transparent 0.6px)",
  },
};

interface ThemeState {
  themeId: string;
  theme: Theme;
  setTheme: (id: string) => void;
}

/**
 * Apply a theme by writing all color values to CSS custom properties.
 */
function applyThemeToRoot(t: Theme): void {
  const root = document.documentElement;
  const c = t.colors;

  root.setAttribute("data-theme", t.id);
  root.setAttribute("data-theme-mode", t.isDark ? "dark" : "light");
  root.classList.toggle("dark", t.isDark);

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

const DEFAULT_THEME_ID = "dark";

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
