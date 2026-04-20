/**
 * ArchLens Design Tokens — Railway.com inspired
 *
 * Deep purple-black base, cyan/violet gradient accents,
 * Geist font, smooth Framer Motion animations.
 *
 * Usage: import { tokens } from "@/styles/design-tokens"
 */

export const tokens = {
  // ─── Color Palette ───────────────────────────────────
  colors: {
    // Backgrounds (darkest → lightest)
    bg: {
      void:      "#0a0a0f",    // page background
      deep:      "#0f0f17",    // content area
      surface:   "#16161f",    // cards, panels
      elevated:  "#1e1e2a",    // hover states, nested
      hover:     "#262636",    // interactive hover
    },

    // Borders
    border: {
      subtle:    "rgba(255, 255, 255, 0.04)",  // barely visible
      default:   "rgba(255, 255, 255, 0.08)",  // standard
      strong:    "rgba(255, 255, 255, 0.15)",   // emphasis
    },

    // Text
    text: {
      primary:   "#ededef",    // headings, values
      secondary: "#a1a1aa",    // body text
      muted:     "#63636e",    // labels, metadata
      inverse:   "#0a0a0f",    // on light/accent backgrounds
    },

    // Accent — purple/violet (brand)
    accent: {
      primary:   "#8b5cf6",
      dim:       "#6d28d9",
      glow:      "rgba(139, 92, 246, 0.3)",
      bg:        "rgba(139, 92, 246, 0.08)",
      border:    "rgba(139, 92, 246, 0.2)",
    },

    // Gradient — Railway signature
    gradient: {
      brand:     "linear-gradient(135deg, #7c3aed 0%, #2563eb 50%, #06b6d4 100%)",  // violet → blue → cyan
      subtle:    "linear-gradient(135deg, rgba(124,58,237,0.15) 0%, rgba(6,182,212,0.08) 100%)",
      card:      "linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.00) 100%)",
    },

    // Semantic
    success:     "#22c55e",
    warning:     "#eab308",
    error:       "#ef4444",
    info:        "#3b82f6",
  },

  // ─── Typography ──────────────────────────────────────
  font: {
    sans:        "'Geist', -apple-system, system-ui, sans-serif",
    mono:        "'Geist Mono', 'JetBrains Mono', monospace",
  },

  fontSize: {
    xs:          "10px",
    sm:          "12px",
    base:        "13px",
    md:          "14px",
    lg:          "16px",
    xl:          "20px",
    "2xl":       "28px",
    "3xl":       "36px",
  },

  fontWeight: {
    normal:      "400",
    medium:      "500",
    semibold:    "600",
    bold:        "700",
  },

  // ─── Spacing ─────────────────────────────────────────
  space: {
    1:  "4px",
    2:  "8px",
    3:  "12px",
    4:  "16px",
    5:  "20px",
    6:  "24px",
    8:  "32px",
    10: "40px",
    12: "48px",
  },

  // ─── Border Radius ───────────────────────────────────
  radius: {
    sm:    "6px",
    md:    "8px",
    lg:    "12px",
    xl:    "16px",
    full:  "9999px",
  },

  // ─── Shadows ─────────────────────────────────────────
  shadow: {
    sm:     "0 1px 3px rgba(0, 0, 0, 0.3)",
    md:     "0 4px 12px rgba(0, 0, 0, 0.4)",
    lg:     "0 8px 24px rgba(0, 0, 0, 0.5)",
    glow:   "0 0 20px rgba(139, 92, 246, 0.15)",
    card:   "0 1px 2px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.04)",
  },

  // ─── Animations ──────────────────────────────────────
  motion: {
    spring: { type: "spring" as const, damping: 25, stiffness: 300 },
    fade:   { duration: 0.15 },
    slide:  { type: "spring" as const, damping: 30, stiffness: 400 },
  },

  // ─── Z-Index Scale ───────────────────────────────────
  z: {
    base:     0,
    dropdown: 10,
    sticky:   20,
    overlay:  30,
    modal:    40,
    toast:    50,
  },
} as const;

/**
 * Score → color mapping (used for health dots, progress bars, etc.)
 */
export function scoreColor(score: number): string {
  if (score >= 80) return tokens.colors.success;
  if (score >= 60) return tokens.colors.warning;
  if (score >= 40) return "#f97316"; // orange
  return tokens.colors.error;
}

/**
 * Score → label mapping
 */
export function scoreLabel(score: number): string {
  if (score >= 80) return "Healthy";
  if (score >= 60) return "Attention";
  if (score >= 40) return "Warning";
  return "Critical";
}
