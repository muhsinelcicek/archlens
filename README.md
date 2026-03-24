# ArchLens

**See the forest, not just the trees.**

Code Architecture Intelligence Platform — automatically analyzes your codebase and generates architecture documentation, business process maps, and drift detection.

## What it does

- **System Architecture** — Auto-generates C4-style layered architecture diagrams
- **Business Process Detection** — Discovers ETL pipelines, analysis algorithms, API flows, and alert systems
- **ER Diagrams** — Extracts database schemas from ORM models (SQLAlchemy, JPA, TypeORM)
- **API Mapping** — Auto-discovers REST endpoints from route decorators
- **Architecture Drift** — Detects layer violations, circular dependencies, and breaking changes
- **MCP Integration** — Works with Claude Code, Cursor, and other AI coding tools
- **Interactive Dashboard** — Web-based exploration with drill-down navigation

## Quick Start

```bash
# Analyze your project
npx @archlens/cli analyze .

# Start the dashboard
npx @archlens/cli serve

# Open http://localhost:4848
```

## MCP Setup (Claude Code / Cursor)

```bash
npx @archlens/cli setup
# Restart your AI tool — ArchLens tools are now available
```

### MCP Tools

| Tool | What it does |
|------|-------------|
| `archlens_architecture` | System overview: modules, layers, stats |
| `archlens_process` | Business process details with algorithms |
| `archlens_impact` | Change blast radius analysis |
| `archlens_onboard` | New developer onboarding guide |
| `archlens_drift` | Architecture drift detection (git-based) |

## CLI Commands

```bash
archlens analyze [path]     # Analyze a project
archlens serve              # Start dashboard API
archlens export [path]      # Export diagrams (mermaid, markdown, json)
archlens drift [path]       # Architecture drift check
archlens setup              # Configure MCP for AI tools
```

## Supported Languages

| Language | Parsing | API Detection | DB Schema | Framework Detection |
|----------|---------|---------------|-----------|-------------------|
| TypeScript/JavaScript | Full | Express, NestJS, Next.js | TypeORM, Prisma | React, Angular, Vue |
| Python | Full | FastAPI, Flask, Django | SQLAlchemy | Pydantic |
| Go | Full | gin, echo, fiber | gorm | net/http |
| Java | Full | Spring Boot (@GetMapping) | JPA (@Entity) | Spring MVC |

## Dashboard Pages

- **Dashboard** — Stats, language distribution, architecture layers
- **Architecture** — Interactive drill-down graph (System → Module → File → Symbol)
- **Business Processes** — Algorithm details, data sources, processing pipelines
- **Dependencies** — Module dependency graph
- **ER Diagram** — Database entity visualization
- **API Map** — Endpoint explorer with search
- **Tech Radar** — Technology stack overview
- **Onboarding** — New developer guide
- **Health Check** — Architecture score, violations, module health

## CI/CD Integration

Add to your GitHub Actions workflow:

```yaml
- name: Architecture Check
  run: |
    npx @archlens/cli analyze .
    npx @archlens/cli drift . --json > report.json
```

See `.github/workflows/archlens-check.yml` for a full example with PR comments.

## Architecture

```
archlens/
├── packages/
│   ├── core/     # Parser engine + analyzers + generators
│   ├── cli/      # Command-line interface
│   ├── mcp/      # MCP server for AI tools
│   └── web/      # React dashboard
```

## License

MIT
