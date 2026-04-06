# ArchLens

> Code Architecture Intelligence Platform — understand any codebase in minutes.

ArchLens analyzes your codebase and provides interactive architecture visualization, quality analysis, business process detection, and AI-powered insights via MCP integration.

## Features

- **8 Language Support** — TypeScript, JavaScript, Python, Go, Java, Swift, Rust, C#
- **Interactive Web Dashboard** — Sigma.js graph visualization, drill-down from system to file level
- **Architecture Analysis** — Layer detection, dependency mapping, coupling metrics (Ca/Ce/I/A/D)
- **Quality Analysis** — Cyclomatic/cognitive complexity, language-specific rules, pattern detection
- **Business Process Detection** — Auto-discovers data flows and processing pipelines
- **Impact Analysis** — Blast radius visualization before making changes
- **Event Flow Mapping** — Bounded contexts, communication patterns, event tracing
- **MCP Integration** — 7 tools for Claude Code, Cursor, and other AI coding assistants
- **Tech Debt Calculator** — Estimates fix cost in hours and dollars

## Quick Start

```bash
# Install
npm install -g archlens

# Analyze your project
cd your-project
archlens analyze .

# Open the dashboard
archlens serve
# → http://localhost:4848
```

## Screenshots

[TODO: Add screenshots]

## CLI Commands

| Command | Description |
|---------|-------------|
| `archlens analyze <path>` | Analyze a project |
| `archlens serve` | Start the web dashboard |
| `archlens add <github-url>` | Add a GitHub repository |
| `archlens list` | List analyzed projects |
| `archlens export <format>` | Export analysis (json, svg) |
| `archlens review` | Architecture review summary |

## MCP Integration

Add to your Claude Code or Cursor configuration:

```json
{
  "mcpServers": {
    "archlens": {
      "command": "npx",
      "args": ["archlens", "mcp"]
    }
  }
}
```

Available MCP tools: `architecture`, `process`, `impact`, `onboard`, `drift`, `sequence`, `explain`

## Architecture

```
packages/
├── core/     — Analysis engine (parsers, analyzers, models)
├── cli/      — Command-line interface
├── mcp/      — Model Context Protocol server
└── web/      — React dashboard (Vite + Tailwind)
```

## Supported Languages

| Language | Parser | Imports | Quality Rules | Patterns |
|----------|--------|---------|---------------|----------|
| TypeScript | tree-sitter | Yes | 5 rules | Yes |
| JavaScript | tree-sitter | Yes | 3 rules | Yes |
| Python | tree-sitter | Yes | 4 rules | Yes |
| Go | tree-sitter | Yes | 3 rules | Yes |
| Java | tree-sitter | Yes | 2 rules | Yes |
| C# | tree-sitter | Yes | 3 rules | Yes |
| Swift | tree-sitter | Yes | 1 rule | Yes |
| Rust | tree-sitter | Yes | 2 rules | Yes |

## Development

```bash
git clone https://github.com/user/archlens.git
cd archlens
pnpm install
pnpm build
pnpm test
```

## License

MIT
