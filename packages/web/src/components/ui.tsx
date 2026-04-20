/**
 * ArchLens UI Design System
 *
 * Shared components with consistent styling.
 * All spacing, typography, and colors are standardized here.
 *
 * Spacing scale: 4, 8, 12, 16, 24, 32, 48
 * Typography: 10px (meta), 12px (body-sm), 13px (body), 14px (title-sm), 18px (title), 24px (heading)
 * Radius: 6 (badge), 8 (card), 12 (panel), 16 (modal)
 */

import type { ReactNode } from "react";

/* ─── Page Header ─────────────────────────────────────── */

export function PageHeader({ title, description, actions }: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-subtle)]">
      <div>
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">{title}</h1>
        {description && <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ─── Card ────────────────────────────────────────────── */

export function Card({ children, className = "", padding = "md", hover, onClick }: {
  children: ReactNode;
  className?: string;
  padding?: "sm" | "md" | "lg";
  hover?: boolean;
  onClick?: () => void;
}) {
  const pad = padding === "sm" ? "p-3" : padding === "lg" ? "p-6" : "p-4";
  return (
    <div
      className={`rounded-xl border border-[var(--color-border-default)] bg-elevated ${pad} ${hover ? "hover:border-archlens-500/30 hover:bg-hover cursor-pointer transition-all" : ""} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

/* ─── Badge ───────────────────────────────────────────── */

export function Badge({ children, variant = "default", size = "sm" }: {
  children: ReactNode;
  variant?: "default" | "success" | "warning" | "error" | "info" | "purple";
  size?: "xs" | "sm";
}) {
  const colors = {
    default: "bg-[var(--color-border-subtle)] text-[var(--color-text-secondary)]",
    success: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20",
    warning: "bg-amber-500/15 text-amber-400 border border-amber-500/20",
    error: "bg-red-500/15 text-red-400 border border-red-500/20",
    info: "bg-blue-500/15 text-blue-400 border border-blue-500/20",
    purple: "bg-archlens-500/15 text-archlens-300 border border-archlens-500/20",
  };
  const sz = size === "xs" ? "text-[9px] px-1.5 py-0.5" : "text-[10px] px-2 py-0.5";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md font-semibold uppercase ${colors[variant]} ${sz}`}>
      {children}
    </span>
  );
}

/* ─── Health Dot ──────────────────────────────────────── */

export function HealthDot({ score, size = 8 }: { score: number; size?: number }) {
  const color = score >= 80 ? "#34d399" : score >= 60 ? "#fbbf24" : score >= 40 ? "#f97316" : "#ef4444";
  return (
    <span
      className="inline-block rounded-full flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: color, boxShadow: `0 0 ${size}px ${color}60` }}
    />
  );
}

/* ─── Progress Bar ────────────────────────────────────── */

export function ProgressBar({ value, max = 100, color, label, showValue, size = "sm" }: {
  value: number;
  max?: number;
  color?: string;
  label?: string;
  showValue?: boolean;
  size?: "xs" | "sm" | "md";
}) {
  const pct = Math.min(100, (value / max) * 100);
  const barColor = color || (pct >= 80 ? "#34d399" : pct >= 50 ? "#fbbf24" : "#ef4444");
  const h = size === "xs" ? "h-1" : size === "md" ? "h-3" : "h-1.5";

  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-[10px] text-[var(--color-text-muted)] w-16 truncate">{label}</span>}
      <div className={`flex-1 ${h} rounded-full bg-[var(--color-border-subtle)] overflow-hidden`}>
        <div className={`${h} rounded-full transition-all duration-500`} style={{ width: `${pct}%`, backgroundColor: barColor }} />
      </div>
      {showValue && <span className="text-[10px] font-mono" style={{ color: barColor }}>{Math.round(value)}</span>}
    </div>
  );
}

/* ─── Metric ──────────────────────────────────────────── */

export function Metric({ label, value, unit, color, small }: {
  label: string;
  value: string | number;
  unit?: string;
  color?: string;
  small?: boolean;
}) {
  return (
    <div className={small ? "" : "text-center"}>
      <div className={`font-bold ${small ? "text-sm" : "text-lg"}`} style={{ color: color || "var(--color-text-primary)" }}>
        {value}{unit && <span className="text-[9px] text-[var(--color-text-muted)] ml-0.5">{unit}</span>}
      </div>
      <div className="text-[9px] text-[var(--color-text-muted)] uppercase">{label}</div>
    </div>
  );
}

/* ─── Section (collapsible) ───────────────────────────── */

export function Section({ title, children, defaultOpen = true, count }: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  count?: number;
}) {
  return (
    <details open={defaultOpen} className="group">
      <summary className="flex items-center justify-between py-2 cursor-pointer select-none text-[10px] uppercase font-semibold text-[var(--color-text-muted)] tracking-wider hover:text-[var(--color-text-secondary)]">
        <span>{title}</span>
        {count !== undefined && <Badge size="xs">{count}</Badge>}
      </summary>
      <div className="pb-2">{children}</div>
    </details>
  );
}

/* ─── Slide Panel ─────────────────────────────────────── */

export function SlidePanel({ open, onClose, title, children, width = 360 }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: number;
}) {
  return (
    <div
      className={`absolute top-0 right-0 h-full bg-surface border-l border-[var(--color-border-default)] shadow-2xl z-30 transition-all duration-300 overflow-y-auto ${open ? "translate-x-0" : "translate-x-full"}`}
      style={{ width }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-subtle)] sticky top-0 bg-surface z-10">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h2>
        <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-lg leading-none">&times;</button>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

/* ─── Action Button ───────────────────────────────────── */

export function ActionButton({ children, onClick, variant = "default", size = "sm", disabled }: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "danger";
  size?: "xs" | "sm";
  disabled?: boolean;
}) {
  const base = "inline-flex items-center gap-1.5 rounded-lg font-medium transition-all disabled:opacity-50";
  const sz = size === "xs" ? "text-[10px] px-2 py-1" : "text-xs px-3 py-1.5";
  const v = {
    default: "bg-elevated border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-hover",
    primary: "bg-archlens-500/15 border border-archlens-500/30 text-archlens-300 hover:bg-archlens-500/25",
    danger: "bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25",
  };
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${sz} ${v[variant]}`}>
      {children}
    </button>
  );
}
