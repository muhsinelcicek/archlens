export function Metric({ label, value, unit, color }: {
  label: string;
  value: string | number;
  unit?: string;
  color?: string;
}) {
  return (
    <div>
      <div className="text-lg font-bold" style={{ color: color || "var(--color-text-primary)" }}>
        {value}{unit && <span className="text-[9px] text-[var(--color-text-muted)] ml-0.5">{unit}</span>}
      </div>
      <div className="text-[9px] text-[var(--color-text-muted)] uppercase">{label}</div>
    </div>
  );
}
