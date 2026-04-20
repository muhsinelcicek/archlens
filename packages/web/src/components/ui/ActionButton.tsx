import type { ReactNode } from "react";

type Variant = "default" | "primary" | "danger" | "success";

const STYLES: Record<Variant, string> = {
  default: "bg-elevated border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-hover",
  primary: "bg-archlens-500/15 border-archlens-500/30 text-archlens-300 hover:bg-archlens-500/25",
  danger: "bg-red-500/15 border-red-500/30 text-red-400 hover:bg-red-500/25",
  success: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25",
};

export function ActionButton({ children, onClick, variant = "default", size = "sm", disabled, className = "" }: {
  children: ReactNode;
  onClick?: () => void;
  variant?: Variant;
  size?: "xs" | "sm" | "md";
  disabled?: boolean;
  className?: string;
}) {
  const sz = { xs: "text-[10px] px-2 py-1", sm: "text-xs px-3 py-1.5", md: "text-sm px-4 py-2" }[size];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-lg font-medium border transition-all disabled:opacity-50 ${sz} ${STYLES[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
