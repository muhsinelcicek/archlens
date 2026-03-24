import { useEffect, useRef, useState } from "react";

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  borderColor: string;
  suffix?: string;
  trend?: number;
}

function useAnimatedNumber(target: number, duration = 800): number {
  const [current, setCurrent] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const start = performance.now();
    const from = 0;

    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(from + (target - from) * eased));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return current;
}

export function StatCard({ label, value, icon, color, borderColor, suffix, trend }: StatCardProps) {
  const animatedValue = useAnimatedNumber(value);

  return (
    <div
      className="relative overflow-hidden rounded-xl border bg-[#333333] p-5 backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-black/20"
      style={{ borderColor }}
    >
      {/* Glow effect */}
      <div
        className="absolute -top-12 -right-12 h-32 w-32 rounded-full opacity-10 blur-2xl"
        style={{ backgroundColor: color }}
      />

      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-[#707070]">{label}</p>
          <p className="mt-2 text-3xl font-bold tabular-nums" style={{ color }}>
            {animatedValue.toLocaleString()}
            {suffix && <span className="text-lg text-[#707070] ml-1">{suffix}</span>}
          </p>
        </div>
        <div className="rounded-lg p-2.5" style={{ backgroundColor: `${color}15` }}>
          {icon}
        </div>
      </div>

      {trend !== undefined && (
        <div className="mt-3 flex items-center gap-1 text-xs">
          <span className={trend >= 0 ? "text-emerald-400" : "text-red-400"}>
            {trend >= 0 ? "+" : ""}{trend}%
          </span>
          <span className="text-[#606060]">vs last scan</span>
        </div>
      )}
    </div>
  );
}
