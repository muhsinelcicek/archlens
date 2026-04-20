import type { ReactNode } from "react";

export function Section({ title, children, defaultOpen = true, count }: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  count?: number;
}) {
  return (
    <details open={defaultOpen}>
      <summary className="flex items-center justify-between py-2 cursor-pointer select-none text-[10px] uppercase font-semibold text-[var(--color-text-muted)] tracking-wider hover:text-[var(--color-text-secondary)]">
        <span>{title}</span>
        {count !== undefined && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--color-border-subtle)]">{count}</span>
        )}
      </summary>
      <div className="pb-3">{children}</div>
    </details>
  );
}
