import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: "sm" | "md" | "lg";
  hover?: boolean;
  onClick?: () => void;
}

export function Card({ children, className = "", padding = "md", hover, onClick }: CardProps) {
  const pad = { sm: "p-3", md: "p-4", lg: "p-6" }[padding];
  return (
    <div
      className={`rounded-xl border border-[var(--color-border-default)] bg-elevated ${pad} ${hover ? "hover:border-archlens-500/30 hover:bg-hover cursor-pointer transition-all" : ""} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
