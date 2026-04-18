import { Loader2 } from "lucide-react";

export function PageLoader({ message = "Loading..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-archlens-400" />
      <p className="text-sm text-[var(--color-text-muted)]">{message}</p>
    </div>
  );
}

export function PageEmpty({ message = "No data available", icon }: { message?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-[var(--color-text-muted)]">
      {icon || <div className="h-12 w-12 rounded-xl bg-[var(--color-border-subtle)] flex items-center justify-center"><span className="text-2xl">∅</span></div>}
      <p className="text-sm">{message}</p>
    </div>
  );
}
