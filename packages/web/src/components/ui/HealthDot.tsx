export function HealthDot({ score, size = 8 }: { score: number; size?: number }) {
  const color = score >= 80 ? "#34d399" : score >= 60 ? "#fbbf24" : score >= 40 ? "#f97316" : "#ef4444";
  return (
    <span
      className="inline-block rounded-full flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: color, boxShadow: `0 0 ${size}px ${color}60` }}
    />
  );
}
