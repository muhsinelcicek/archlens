import { useState } from "react";

interface LanguageBarProps {
  languages: Record<string, number>;
  totalSymbols: number;
}

const langConfig: Record<string, { color: string; label: string }> = {
  typescript: { color: "#3178c6", label: "TypeScript" },
  javascript: { color: "#f0db4f", label: "JavaScript" },
  python: { color: "#3572A5", label: "Python" },
  java: { color: "#b07219", label: "Java" },
  go: { color: "#00ADD8", label: "Go" },
  rust: { color: "#dea584", label: "Rust" },
  csharp: { color: "#178600", label: "C#" },
  ruby: { color: "#CC342D", label: "Ruby" },
  php: { color: "#4F5D95", label: "PHP" },
  kotlin: { color: "#A97BFF", label: "Kotlin" },
  swift: { color: "#F05138", label: "Swift" },
  unknown: { color: "#6b7280", label: "Other" },
};

export function LanguageBar({ languages, totalSymbols }: LanguageBarProps) {
  const [hoveredLang, setHoveredLang] = useState<string | null>(null);

  const sorted = Object.entries(languages).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-3">
      {/* Bar */}
      <div className="flex h-3 overflow-hidden rounded-full bg-elevated">
        {sorted.map(([lang, count]) => {
          const pct = (count / totalSymbols) * 100;
          const config = langConfig[lang] || langConfig.unknown;
          return (
            <div
              key={lang}
              className="relative transition-all duration-300"
              style={{
                width: `${pct}%`,
                backgroundColor: config.color,
                opacity: hoveredLang && hoveredLang !== lang ? 0.3 : 1,
              }}
              onMouseEnter={() => setHoveredLang(lang)}
              onMouseLeave={() => setHoveredLang(null)}
            >
              {/* Tooltip */}
              {hoveredLang === lang && (
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-elevated px-2 py-1 text-xs shadow-lg border border-zinc-700 z-50">
                  <span className="font-semibold" style={{ color: config.color }}>{config.label}</span>
                  <span className="text-[var(--color-text-secondary)] ml-1.5">{count} symbols ({pct.toFixed(1)}%)</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Labels */}
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {sorted.map(([lang, count]) => {
          const config = langConfig[lang] || langConfig.unknown;
          const pct = ((count / totalSymbols) * 100).toFixed(1);
          return (
            <div
              key={lang}
              className="flex items-center gap-2 text-sm cursor-default transition-opacity"
              style={{ opacity: hoveredLang && hoveredLang !== lang ? 0.4 : 1 }}
              onMouseEnter={() => setHoveredLang(lang)}
              onMouseLeave={() => setHoveredLang(null)}
            >
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: config.color }} />
              <span className="text-[var(--color-text-secondary)] font-medium">{config.label}</span>
              <span className="text-[var(--color-text-muted)] text-xs">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
