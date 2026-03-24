import { useTheme, themes, type Theme } from "../lib/theme.js";
import { Palette, Check, Monitor, Moon, Sun } from "lucide-react";

function ThemeCard({ theme, isActive, onSelect }: { theme: Theme; isActive: boolean; onSelect: () => void }) {
  const c = theme.colors;

  return (
    <button
      onClick={onSelect}
      className={`relative group rounded-xl border-2 p-1 transition-all duration-200 hover:scale-[1.02] ${
        isActive ? "border-archlens-400 shadow-lg" : "border-transparent hover:border-[#2a2a3a]"
      }`}
      style={{ borderColor: isActive ? c.accent : undefined }}
    >
      {/* Mini preview */}
      <div className="rounded-lg overflow-hidden w-full aspect-[16/10]" style={{ backgroundColor: c.void }}>
        {/* Mini sidebar */}
        <div className="flex h-full">
          <div className="w-10 h-full flex flex-col gap-1 p-1.5" style={{ backgroundColor: c.surface, borderRight: `1px solid ${c.borderSubtle}` }}>
            <div className="w-full h-1.5 rounded-full" style={{ backgroundColor: c.accent }} />
            <div className="w-full h-1 rounded-full" style={{ backgroundColor: c.borderDefault }} />
            <div className="w-full h-1 rounded-full" style={{ backgroundColor: c.borderDefault }} />
            <div className="w-full h-1 rounded-full" style={{ backgroundColor: c.borderDefault }} />
          </div>
          {/* Mini content */}
          <div className="flex-1 p-2 flex flex-col gap-1.5" style={{ backgroundColor: c.deep }}>
            <div className="flex gap-1">
              <div className="w-8 h-4 rounded" style={{ backgroundColor: c.elevated }} />
              <div className="w-8 h-4 rounded" style={{ backgroundColor: c.elevated }} />
              <div className="w-8 h-4 rounded" style={{ backgroundColor: c.elevated }} />
            </div>
            {/* Mini graph area */}
            <div className="flex-1 rounded-lg flex items-center justify-center" style={{ backgroundColor: c.void }}>
              <div className="flex items-center gap-2">
                <div className="w-6 h-3 rounded" style={{ backgroundColor: c.accent, opacity: 0.6 }} />
                <div className="w-4 h-0.5" style={{ backgroundColor: c.borderDefault }} />
                <div className="w-6 h-3 rounded" style={{ backgroundColor: c.elevated, border: `1px solid ${c.borderDefault}` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Label */}
      <div className="flex items-center justify-between mt-2 px-1">
        <span className="text-sm font-medium" style={{ color: isActive ? c.accent : "#8888a0" }}>{theme.name}</span>
        {isActive && (
          <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: c.accent }}>
            <Check className="h-3 w-3 text-white" />
          </div>
        )}
      </div>
    </button>
  );
}

export function SettingsView() {
  const { themeId, setTheme } = useTheme();

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-[900px]">
      <div>
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary, #8888a0)" }}>
          Customize your ArchLens experience
        </p>
      </div>

      {/* Theme Section */}
      <section>
        <div className="flex items-center gap-2 mb-5">
          <Palette className="h-5 w-5" style={{ color: themes[themeId]?.colors.accent }} />
          <h3 className="text-lg font-semibold">Theme</h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Object.values(themes).map((theme) => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              isActive={themeId === theme.id}
              onSelect={() => setTheme(theme.id)}
            />
          ))}
        </div>
      </section>

      {/* About Section */}
      <section className="rounded-xl border p-6" style={{ borderColor: themes[themeId]?.colors.borderDefault, backgroundColor: themes[themeId]?.colors.surface }}>
        <h3 className="text-lg font-semibold mb-3">About ArchLens</h3>
        <div className="space-y-2 text-sm" style={{ color: "#8888a0" }}>
          <p><strong style={{ color: "#e4e4ed" }}>Version:</strong> 0.1.0</p>
          <p><strong style={{ color: "#e4e4ed" }}>Languages:</strong> TypeScript, JavaScript, Python, Go, Java, Swift, Rust, C#</p>
          <p><strong style={{ color: "#e4e4ed" }}>MCP Tools:</strong> 7 (architecture, process, impact, onboard, drift, sequence, explain)</p>
          <p><strong style={{ color: "#e4e4ed" }}>CLI Commands:</strong> 9 (analyze, serve, export, setup, drift, add, list, remove, review)</p>
        </div>
      </section>
    </div>
  );
}
