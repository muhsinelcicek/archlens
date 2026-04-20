interface ProgressBarProps {
  value: number;
  max?: number;
  color?: string;
  label?: string;
  showValue?: boolean;
  size?: "xs" | "sm" | "md";
}

export function ProgressBar({ value, max = 100, color, label, showValue, size = "sm" }: ProgressBarProps) {
  const pct = Math.min(100, (value / max) * 100);
  const barColor = color || (pct >= 80 ? "#34d399" : pct >= 50 ? "#fbbf24" : "#ef4444");
  const h = { xs: "h-1", sm: "h-1.5", md: "h-2.5" }[size];

  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-[10px] text-[var(--color-text-muted)] w-16 truncate">{label}</span>}
      <div className={`flex-1 ${h} rounded-full bg-[var(--color-border-subtle)] overflow-hidden`}>
        <div className={`${h} rounded-full transition-all duration-500`} style={{ width: `${pct}%`, backgroundColor: barColor }} />
      </div>
      {showValue && <span className="text-[10px] font-mono w-8 text-right" style={{ color: barColor }}>{Math.round(value)}</span>}
    </div>
  );
}
