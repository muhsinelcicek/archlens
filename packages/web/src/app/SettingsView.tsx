import { useState } from "react";
import { useTheme, themes, type Theme } from "../lib/theme.js";
import { useI18n, type Locale } from "../lib/i18n.js";
import { useStore } from "../lib/store.js";
import {
  Palette, Check, Globe, Keyboard, Info, Download, Database,
  Monitor, ChevronDown, ChevronRight, ExternalLink, Copy, CheckCircle2,
  Trash2, RefreshCw, FileJson, Image, Code2, GitBranch, Cpu, Zap,
  Network, MessageSquare, Shield, Search, BookOpen,
} from "lucide-react";

/* ─── Theme Preview Card ──────────────────────────────────── */

function ThemeCard({ theme, isActive, onSelect }: { theme: Theme; isActive: boolean; onSelect: () => void }) {
  const c = theme.colors;
  return (
    <button
      onClick={onSelect}
      className={`relative group rounded-xl border-2 p-1 transition-all duration-200 hover:scale-[1.02] ${
        isActive ? "shadow-lg" : "border-transparent hover:border-[var(--color-border-default)]"
      }`}
      style={{ borderColor: isActive ? c.accent : undefined }}
    >
      <div className="rounded-lg overflow-hidden w-full aspect-[16/10]" style={{ backgroundColor: c.void }}>
        <div className="flex h-full">
          <div className="w-10 h-full flex flex-col gap-1 p-1.5" style={{ backgroundColor: c.surface, borderRight: `1px solid ${c.borderSubtle}` }}>
            <div className="w-full h-1.5 rounded-full" style={{ backgroundColor: c.accent }} />
            <div className="w-full h-1 rounded-full" style={{ backgroundColor: c.borderDefault }} />
            <div className="w-full h-1 rounded-full" style={{ backgroundColor: c.borderDefault }} />
            <div className="w-full h-1 rounded-full" style={{ backgroundColor: c.borderDefault }} />
          </div>
          <div className="flex-1 p-2 flex flex-col gap-1.5" style={{ backgroundColor: c.deep }}>
            <div className="flex gap-1">
              <div className="w-8 h-4 rounded" style={{ backgroundColor: c.elevated }} />
              <div className="w-8 h-4 rounded" style={{ backgroundColor: c.elevated }} />
              <div className="w-8 h-4 rounded" style={{ backgroundColor: c.elevated }} />
            </div>
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
      <div className="flex items-center justify-between mt-2 px-1">
        <span className="text-sm font-medium" style={{ color: isActive ? c.accent : "var(--color-text-secondary)" }}>{theme.name}</span>
        {isActive && (
          <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: c.accent }}>
            <Check className="h-3 w-3 text-white" />
          </div>
        )}
      </div>
    </button>
  );
}

/* ─── Collapsible Section ─────────────────────────────────── */

function Section({ icon, title, children, defaultOpen = false }: {
  icon: React.ReactNode; title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-xl border border-[var(--color-border-default)] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-hover transition-colors text-left"
      >
        {icon}
        <h3 className="text-base font-semibold text-[var(--color-text-primary)] flex-1">{title}</h3>
        {open ? <ChevronDown className="h-4 w-4 text-[var(--color-text-muted)]" /> : <ChevronRight className="h-4 w-4 text-[var(--color-text-muted)]" />}
      </button>
      {open && <div className="border-t border-[var(--color-border-default)] px-5 py-4">{children}</div>}
    </section>
  );
}

/* ─── Shortcut Row ────────────────────────────────────────── */

function ShortcutRow({ keys, description }: { keys: string[]; description: string }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-[var(--color-text-secondary)]">{description}</span>
      <div className="flex gap-1">
        {keys.map((k, i) => (
          <span key={i}>
            <kbd className="px-2 py-1 rounded-md bg-[var(--color-border-subtle)] border border-[var(--color-border-default)] text-xs font-mono text-[var(--color-text-primary)]">{k}</kbd>
            {i < keys.length - 1 && <span className="text-[var(--color-text-muted)] mx-0.5">+</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Settings View
   ═══════════════════════════════════════════════════════════════ */

export function SettingsView() {
  const { themeId, setTheme } = useTheme();
  const { locale, setLocale, t } = useI18n();
  const { model, projects } = useStore();
  const [copied, setCopied] = useState<string | null>(null);
  const accent = themes[themeId]?.colors.accent || "#7c3aed";

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[900px]">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">{t("nav.settings")}</h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">Customize your ArchLens experience</p>
      </div>

      {/* ── Theme ──────────────────────────────────────────── */}
      <Section icon={<Palette className="h-5 w-5" style={{ color: accent }} />} title="Theme" defaultOpen>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Object.values(themes).map((theme) => (
            <ThemeCard key={theme.id} theme={theme} isActive={themeId === theme.id} onSelect={() => setTheme(theme.id)} />
          ))}
        </div>
      </Section>

      {/* ── Language ───────────────────────────────────────── */}
      <Section icon={<Globe className="h-5 w-5" style={{ color: accent }} />} title={t("settings.language")} defaultOpen>
        <div className="grid grid-cols-2 gap-4">
          {([
            { id: "en" as Locale, label: "English", flag: "🇬🇧", desc: "English interface" },
            { id: "tr" as Locale, label: "Türkçe", flag: "🇹🇷", desc: "Türkçe arayüz" },
          ]).map((lang) => (
            <button
              key={lang.id}
              onClick={() => setLocale(lang.id)}
              className={`rounded-xl border-2 p-4 transition-all duration-200 hover:scale-[1.02] text-left ${
                locale === lang.id ? "shadow-lg" : "border-transparent hover:border-[var(--color-border-default)]"
              }`}
              style={{ borderColor: locale === lang.id ? accent : undefined }}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{lang.flag}</span>
                <div>
                  <div className="font-semibold" style={{ color: locale === lang.id ? accent : "var(--color-text-primary)" }}>{lang.label}</div>
                  <div className="text-xs text-[var(--color-text-muted)]">{lang.desc}</div>
                </div>
                {locale === lang.id && (
                  <div className="ml-auto w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: accent }}>
                    <Check className="h-3 w-3 text-white" />
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </Section>

      {/* ── Project Info ───────────────────────────────────── */}
      {model && (
        <Section icon={<Database className="h-5 w-5" style={{ color: accent }} />} title="Project Information" defaultOpen>
          <div className="space-y-4">
            {/* Project Details */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Project", value: model.project.name },
                { label: "Analyzed", value: new Date(model.project.analyzedAt).toLocaleString() },
                { label: "Root Path", value: model.project.rootPath, mono: true },
                { label: "Version", value: `ArchLens v${model.project.version}` },
              ].map((item) => (
                <div key={item.label} className="rounded-lg bg-[var(--color-border-subtle)] border border-[var(--color-border-default)] p-3">
                  <div className="text-[10px] text-[var(--color-text-muted)] uppercase font-semibold mb-1">{item.label}</div>
                  <div className={`text-sm text-[var(--color-text-primary)] truncate ${item.mono ? "font-mono text-xs" : ""}`}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Files", value: model.stats.files, color: "#34d399" },
                { label: "Symbols", value: model.stats.symbols, color: "#60a5fa" },
                { label: "Relations", value: model.stats.relations, color: "#a78bfa" },
                { label: "Lines", value: model.stats.totalLines.toLocaleString(), color: "#fbbf24" },
                { label: "Modules", value: model.stats.modules, color: "#06b6d4" },
                { label: "Endpoints", value: model.apiEndpoints.length, color: "#34d399" },
                { label: "DB Tables", value: model.dbEntities.length, color: "#f87171" },
                { label: "Tech Stack", value: model.techRadar.length, color: "#fbbf24" },
              ].map((s) => (
                <div key={s.label} className="rounded-lg bg-[var(--color-border-subtle)] p-2 text-center">
                  <div className="text-lg font-bold" style={{ color: s.color }}>{s.value}</div>
                  <div className="text-[9px] text-[var(--color-text-muted)] uppercase">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Languages */}
            <div>
              <div className="text-[10px] text-[var(--color-text-muted)] uppercase font-semibold mb-2">Languages</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(model.stats.languages)
                  .sort(([, a], [, b]) => (b as number) - (a as number))
                  .map(([lang, count]) => (
                    <span key={lang} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--color-border-subtle)] border border-[var(--color-border-default)] text-xs">
                      <span className="text-[var(--color-text-primary)] font-medium capitalize">{lang}</span>
                      <span className="text-[var(--color-text-muted)]">{count as number} symbols</span>
                    </span>
                  ))}
              </div>
            </div>

            {/* Multi-project */}
            {projects.length > 1 && (
              <div>
                <div className="text-[10px] text-[var(--color-text-muted)] uppercase font-semibold mb-2">All Projects ({projects.length})</div>
                <div className="space-y-1.5">
                  {projects.map((p) => (
                    <div key={p.name} className="flex items-center justify-between rounded-lg bg-[var(--color-border-subtle)] border border-[var(--color-border-default)] px-3 py-2">
                      <div>
                        <span className="text-sm font-mono text-[var(--color-text-primary)]">{p.name}</span>
                        <span className="text-[10px] text-[var(--color-text-muted)] ml-2">{p.stats.files}f · {p.stats.symbols}s · {p.stats.lines?.toLocaleString()}L</span>
                      </div>
                      <span className="text-[10px] text-[var(--color-text-muted)]">{new Date(p.analyzedAt).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ── Export ──────────────────────────────────────────── */}
      {model && (
        <Section icon={<Download className="h-5 w-5" style={{ color: accent }} />} title="Export Data">
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                id: "json",
                icon: <FileJson className="h-5 w-5" />,
                label: "Full Model (JSON)",
                desc: `${model.stats.files} files, ${model.stats.symbols} symbols`,
                action: () => {
                  const blob = new Blob([JSON.stringify(model, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${model.project.name}-archlens-model.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                },
              },
              {
                id: "stats",
                icon: <Code2 className="h-5 w-5" />,
                label: "Stats Summary (JSON)",
                desc: "Project stats, modules, layers",
                action: () => {
                  const summary = {
                    project: model.project,
                    stats: model.stats,
                    modules: model.modules.map((m) => ({ name: m.name, layer: m.layer, files: m.fileCount, lines: m.lineCount, language: m.language })),
                    endpoints: model.apiEndpoints.length,
                    entities: model.dbEntities.length,
                    processes: (model.businessProcesses || []).length,
                  };
                  const blob = new Blob([JSON.stringify(summary, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${model.project.name}-archlens-summary.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                },
              },
              {
                id: "endpoints",
                icon: <Globe className="h-5 w-5" />,
                label: "API Endpoints (JSON)",
                desc: `${model.apiEndpoints.length} endpoints`,
                action: () => {
                  const blob = new Blob([JSON.stringify(model.apiEndpoints, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${model.project.name}-endpoints.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                },
              },
              {
                id: "clipboard",
                icon: copied === "clipboard" ? <CheckCircle2 className="h-5 w-5" /> : <Copy className="h-5 w-5" />,
                label: copied === "clipboard" ? "Copied!" : "Copy Stats to Clipboard",
                desc: "Quick share project overview",
                action: () => {
                  const text = [
                    `${model.project.name} — ArchLens Analysis`,
                    `Files: ${model.stats.files} | Symbols: ${model.stats.symbols} | Lines: ${model.stats.totalLines.toLocaleString()}`,
                    `Modules: ${model.stats.modules} | Endpoints: ${model.apiEndpoints.length} | DB Tables: ${model.dbEntities.length}`,
                    `Languages: ${Object.keys(model.stats.languages).join(", ")}`,
                    `Analyzed: ${new Date(model.project.analyzedAt).toLocaleString()}`,
                  ].join("\n");
                  copyToClipboard(text, "clipboard");
                },
              },
            ].map((exp) => (
              <button
                key={exp.id}
                onClick={exp.action}
                className="flex items-center gap-3 rounded-xl border border-[var(--color-border-default)] p-4 text-left hover:bg-hover hover:border-[#3a3a4a] transition-all group"
              >
                <div className="rounded-lg p-2.5 bg-[var(--color-border-subtle)] group-hover:bg-[var(--color-border-default)] transition-colors" style={{ color: accent }}>
                  {exp.icon}
                </div>
                <div>
                  <div className="text-sm font-medium text-[var(--color-text-primary)]">{exp.label}</div>
                  <div className="text-[10px] text-[var(--color-text-muted)]">{exp.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </Section>
      )}

      {/* ── MCP Configuration ──────────────────────────────── */}
      <Section icon={<Cpu className="h-5 w-5" style={{ color: accent }} />} title="MCP Integration">
        <p className="text-sm text-[var(--color-text-secondary)] mb-4">
          Connect ArchLens to AI coding assistants via Model Context Protocol.
        </p>

        {/* Config snippet */}
        <div className="rounded-xl bg-[var(--color-border-subtle)] border border-[var(--color-border-default)] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--color-border-default)]">
            <span className="text-[10px] text-[var(--color-text-muted)] uppercase font-semibold">MCP Config</span>
            <button
              onClick={() => {
                const config = JSON.stringify({
                  mcpServers: {
                    archlens: {
                      command: "npx",
                      args: ["archlens", "mcp"],
                    },
                  },
                }, null, 2);
                copyToClipboard(config, "mcp");
              }}
              className="flex items-center gap-1 text-[10px] font-medium hover:text-[var(--color-text-primary)] transition-colors"
              style={{ color: accent }}
            >
              {copied === "mcp" ? <><CheckCircle2 className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
            </button>
          </div>
          <pre className="p-4 text-xs font-mono text-[var(--color-text-secondary)] overflow-x-auto">
{`{
  "mcpServers": {
    "archlens": {
      "command": "npx",
      "args": ["archlens", "mcp"]
    }
  }
}`}
          </pre>
        </div>

        {/* Available Tools */}
        <div className="mt-4">
          <div className="text-[10px] text-[var(--color-text-muted)] uppercase font-semibold mb-2">Available MCP Tools (7)</div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { name: "architecture", desc: "Codebase structure & modules", icon: <Network className="h-3.5 w-3.5" /> },
              { name: "process", desc: "Business process flows", icon: <Zap className="h-3.5 w-3.5" /> },
              { name: "impact", desc: "Blast radius analysis", icon: <GitBranch className="h-3.5 w-3.5" /> },
              { name: "onboard", desc: "Project overview for new devs", icon: <BookOpen className="h-3.5 w-3.5" /> },
              { name: "drift", desc: "Architecture drift detection", icon: <RefreshCw className="h-3.5 w-3.5" /> },
              { name: "sequence", desc: "Call chain tracing", icon: <MessageSquare className="h-3.5 w-3.5" /> },
              { name: "explain", desc: "Symbol explanation", icon: <Search className="h-3.5 w-3.5" /> },
            ].map((tool) => (
              <div key={tool.name} className="flex items-center gap-2.5 rounded-lg bg-[var(--color-border-subtle)] border border-[var(--color-border-default)] px-3 py-2">
                <span style={{ color: accent }}>{tool.icon}</span>
                <div>
                  <div className="text-xs font-mono text-[var(--color-text-primary)]">{tool.name}</div>
                  <div className="text-[9px] text-[var(--color-text-muted)]">{tool.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Keyboard Shortcuts ─────────────────────────────── */}
      <Section icon={<Keyboard className="h-5 w-5" style={{ color: accent }} />} title="Keyboard Shortcuts">
        <div className="divide-y divide-[var(--color-border-subtle)]">
          <ShortcutRow keys={["⌘", "K"]} description="Global Search" />
          <ShortcutRow keys={["⌘", "/"]} description="Toggle sidebar" />
          <ShortcutRow keys={["Esc"]} description="Close panel / Deselect" />
          <ShortcutRow keys={["+"]} description="Zoom in (graph)" />
          <ShortcutRow keys={["-"]} description="Zoom out (graph)" />
          <ShortcutRow keys={["0"]} description="Fit to view (graph)" />
          <ShortcutRow keys={["I"]} description="Toggle impact mode" />
          <ShortcutRow keys={["Q"]} description="Toggle quality overlay" />
        </div>
      </Section>

      {/* ── CLI Reference ──────────────────────────────────── */}
      <Section icon={<Monitor className="h-5 w-5" style={{ color: accent }} />} title="CLI Commands">
        <div className="space-y-1.5">
          {[
            { cmd: "archlens analyze <path>", desc: "Analyze a project directory" },
            { cmd: "archlens serve", desc: "Start the web dashboard on port 4848" },
            { cmd: "archlens add <github-url>", desc: "Clone & analyze a GitHub repository" },
            { cmd: "archlens list", desc: "List all analyzed projects" },
            { cmd: "archlens remove <name>", desc: "Remove a project from the registry" },
            { cmd: "archlens export <format>", desc: "Export analysis as JSON or SVG" },
            { cmd: "archlens review", desc: "Print architecture review to terminal" },
            { cmd: "archlens mcp", desc: "Start MCP server for AI tools" },
            { cmd: "archlens setup", desc: "Configure MCP for Claude Code / Cursor" },
          ].map((item) => (
            <div key={item.cmd} className="flex items-center justify-between rounded-lg bg-[var(--color-border-subtle)] px-3 py-2 group">
              <code className="text-xs font-mono" style={{ color: accent }}>{item.cmd}</code>
              <span className="text-[10px] text-[var(--color-text-muted)]">{item.desc}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ── About ──────────────────────────────────────────── */}
      <Section icon={<Info className="h-5 w-5" style={{ color: accent }} />} title="About ArchLens">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-archlens-400 to-archlens-700 flex items-center justify-center shadow-lg shadow-archlens-500/20">
              <Network className="h-7 w-7 text-white" />
            </div>
            <div>
              <h4 className="text-lg font-bold">
                <span style={{ color: accent }}>Arch</span><span className="text-[var(--color-text-primary)]">Lens</span>
              </h4>
              <p className="text-sm text-[var(--color-text-muted)]">Code Architecture Intelligence Platform</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              { label: "Version", value: "0.1.0" },
              { label: "License", value: "MIT" },
              { label: "Languages", value: "8 (TS, JS, Python, Go, Java, Swift, Rust, C#)" },
              { label: "MCP Tools", value: "7" },
              { label: "CLI Commands", value: "9" },
              { label: "Analyzers", value: "20" },
            ].map((item) => (
              <div key={item.label} className="flex justify-between">
                <span className="text-[var(--color-text-muted)]">{item.label}</span>
                <span className="text-[var(--color-text-primary)] font-medium">{item.value}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-2 pt-2">
            <a
              href="https://github.com/user/archlens"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--color-border-subtle)] border border-[var(--color-border-default)] text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[#3a3a4a] transition-colors"
            >
              <GitBranch className="h-3.5 w-3.5" /> GitHub
              <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href="https://github.com/user/archlens/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--color-border-subtle)] border border-[var(--color-border-default)] text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[#3a3a4a] transition-colors"
            >
              <Shield className="h-3.5 w-3.5" /> Report Issue
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </Section>
    </div>
  );
}
