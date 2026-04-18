import { useEffect, useRef, useState } from "react";

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  borderColor?: string;  // kept for API compatibility, not used
  suffix?: string;
  trend?: number;
}

function useAnimatedNumber(target: number, duration = 600): number {
  const [current, setCurrent] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(target * eased));
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return current;
}

/**
 * Minimal stat card — Linear/shadcn style.
 * White background, hairline border, no gradient, no glow.
 * Icon in subtle colored chip. Value in foreground-primary color.
 */
export function StatCard({ label, value, icon, color, suffix, trend }: StatCardProps) {
  const animatedValue = useAnimatedNumber(value);

  return (
    <div className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-elevated)] p-4 transition-colors hover:border-[var(--color-text-muted)]/30">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-[var(--color-text-muted)] tracking-tight">{label}</p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums text-[var(--color-text-primary)] tracking-tight">
            {animatedValue.toLocaleString()}
            {suffix && <span className="text-sm text-[var(--color-text-muted)] ml-1 font-normal">{suffix}</span>}
          </p>
        </div>
        <div
          className="rounded-md p-2 flex-shrink-0"
          style={{ backgroundColor: `${color}12`, color }}
        >
          {icon}
        </div>
      </div>

      {trend !== undefined && (
        <div className="mt-3 flex items-center gap-1 text-xs">
          <span className={trend >= 0 ? "text-emerald-600" : "text-red-600"}>
            {trend >= 0 ? "↑" : "↓"} {Math.abs(trend)}%
          </span>
          <span className="text-[var(--color-text-muted)]">vs last scan</span>
        </div>
      )}
    </div>
  );
}
