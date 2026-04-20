import type { ReactNode } from "react";

type BadgeVariant = "default" | "success" | "warning" | "error" | "info" | "purple";

const COLORS: Record<BadgeVariant, string> = {
  default: "bg-[var(--color-border-subtle)] text-[var(--color-text-secondary)]",
  success: "bg-emerald-500/15 text-emerald-400",
  warning: "bg-amber-500/15 text-amber-400",
  error: "bg-red-500/15 text-red-400",
  info: "bg-blue-500/15 text-blue-400",
  purple: "bg-archlens-500/15 text-archlens-300",
};

export function Badge({ children, variant = "default", size = "sm" }: {
  children: ReactNode;
  variant?: BadgeVariant;
  size?: "xs" | "sm";
}) {
  const sz = size === "xs" ? "text-[9px] px-1.5 py-0.5" : "text-[10px] px-2 py-1";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md font-semibold ${COLORS[variant]} ${sz}`}>
      {children}
    </span>
  );
}
