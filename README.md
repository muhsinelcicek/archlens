<div align="center">

# ArchLens

Code architecture analysis + distributed system simulation.

Analyze any codebase, visualize the architecture, simulate how it behaves under load.

[![npm](https://img.shields.io/npm/v/archlens-studio.svg?color=6d28d9)](https://www.npmjs.com/package/archlens-studio)
[![Tests](https://img.shields.io/badge/tests-200%20passing-brightgreen)](#testing)
[![Languages](https://img.shields.io/badge/languages-8-6d28d9)](#supported-languages)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

</div>

---

## What it does

1. **Point it at a codebase** (local folder or GitHub URL)
2. **It parses and analyzes** — modules, dependencies, quality, security, dead code, tech debt
3. **You explore interactively** — constellation graph, request flows, insights
4. **You simulate — from your own code.** `archlens-studio simulate` turns the analysis into a queueing-theory scenario (nodes, edges, traffic). Load balancer, database, cache, message broker are inferred automatically.
5. **You run it** — chaos engineering, incident detection, cost modeling. See [benchmarks](docs/benchmarks.md) for sub-second analysis across six popular OSS repos.

## Screenshots

<table>
<tr>
<td width="50%"><img src="docs/img/architecture.png" alt="Architecture" /><br/><sub><strong>Architecture</strong> — ConstellationGraph with glowing nodes and flowing particles</sub></td>
<td width="50%"><img src="docs/img/simulator.png" alt="Simulator" /><br/><sub><strong>Simulator</strong> — drag-drop canvas with live metrics and incident badges</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/img/dashboard.png" alt="Dashboard" /><br/><sub><strong>Dashboard</strong> — health score, pulse bars, action items</sub></td>
<td width="50%"><img src="docs/img/insights.png" alt="Insights" /><br/><sub><strong>Insights</strong> — narrative findings from all analyzers</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/img/quality.png" alt="Quality" /><br/><sub><strong>Quality</strong> — score, patterns, coupling, consistency</sub></td>
<td width="50%"><img src="docs/img/flows.png" alt="Flows" /><br/><sub><strong>Flows</strong> — request chains from endpoint to database</sub></td>
</tr>
</table>

## Quick Start

```bash
npm install -g archlens-studio

cd your-project
archlens-studio analyze .        # parse the codebase
archlens-studio simulate .       # infer a simulator scenario from the analysis
archlens-studio serve            # → http://localhost:4848

# Open /simulator → click "Load analyzed scenario"
```

Or import a GitHub repo:

```bash
archlens-studio add https://github.com/dotnet/eShop
archlens-studio serve
```

## Features

### Analysis
- **8 languages** — TypeScript, JavaScript, Python, Go, Java, Swift, Rust, C#
- **15+ frameworks** — Express, NestJS, Next.js, FastAPI, Flask, Django, Spring Boot, gin, Actix, Vapor, and more
- **10 ORMs** — EF Core, JPA, Prisma, TypeORM, SQLAlchemy, Django ORM, GORM, Diesel, Fluent, Sequelize
- **20 analyzers** — quality, coupling, security, dead code, hotspots, tech debt, patterns, consistency
- Tree-sitter AST parsing, incremental analysis with SHA-256 caching

### Visualization
- **ConstellationGraph** — layered layout with glowing nodes and always-flowing particles
- Request flow tracing — endpoint → handler → dependencies → database
- Impact analysis — blast radius visualization
- Risk/quality overlay toggles

### Simulator
- **Analyzer → simulator bridge** — `archlens-studio simulate` infers a topology from the analysis: layer/framework/ORM keywords map modules to 16 node types, load balancers appear in front of multi-API apps, a shared database node lands when entities exist, cache / queue / broker surface from the tech stack.
- M/M/c queueing theory engine
- 16 node types (Client, LB, API, Service, DB, Cache, Queue, CDN, Lambda, Gateway, Auth, Broker, Storage, DNS, Container, Monitoring)
- Circuit breakers (closed/open/half-open state machine)
- Auto-scaling policies, retry logic
- 6 traffic patterns — constant, burst, ramp, spike, periodic, noise
- 5 scenario templates — E-commerce, Microservices, Event-Driven, CDN+Origin, Data Pipeline
- Chaos engineering — random kills, latency injection, AZ failure
- 15 incident types — SPOF, CASCADE, OVERLOAD, 502 BAD GATEWAY, TOPOLOGY PRESSURE, etc.
- Cost modeling — $/replica/hour, monthly estimates
- FIX buttons — one-click remediation
- Markdown report export

### AI Integration
- MCP server with 7 tools for Claude Code, Cursor, Windsurf
- Tools: `architecture`, `process`, `impact`, `onboard`, `drift`, `sequence`, `explain`

## Architecture

```
packages/
├── core/     Analysis engine (20 analyzers, 8 parsers, framework detector)
├── cli/      CLI + HTTP API server (9 commands)
├── mcp/      Model Context Protocol server (7 tools)
└── web/      React dashboard (Vite + Tailwind + React Query)
```

## Supported Languages

| Language | Endpoints | ORM | Quality Rules |
|----------|-----------|-----|---------------|
| TypeScript | Express, NestJS, Next.js, Fastify | Prisma, TypeORM, Sequelize | 5 |
| JavaScript | Express, Koa, Hono | Sequelize | 3 |
| Python | FastAPI, Flask, Django, DRF | SQLAlchemy, Django ORM | 5 |
| Java | Spring Boot, JAX-RS | JPA | 3 |
| Go | gin, echo, chi, fiber, gorilla/mux | GORM | 3 |
| C# | ASP.NET Core | EF Core | 5 |
| Rust | Actix-web, Axum, Rocket | Diesel | 2 |
| Swift | Vapor | Fluent | 1 |

## CLI Commands

| Command | Description |
|---------|-------------|
| `archlens-studio analyze <path>` | Analyze a project |
| `archlens-studio simulate <path>` | Infer a simulator scenario from the analysis |
| `archlens-studio serve` | Start the web dashboard |
| `archlens-studio add <github-url>` | Clone and analyze a GitHub repo |
| `archlens-studio list` | List analyzed projects |
| `archlens-studio remove <name>` | Remove a project |
| `archlens-studio export <format>` | Export as JSON or SVG |
| `archlens-studio review` | Print architecture review to terminal |
| `archlens-studio drift` | Detect architecture drift against a saved model |
| `archlens-studio mcp` | Start MCP server |
| `archlens-studio setup` | Configure MCP for Claude Code / Cursor |

## MCP Integration

```json
{
  "mcpServers": {
    "archlens": {
      "command": "npx",
      "args": ["archlens-studio", "mcp"]
    }
  }
}
```

## Benchmarks

Cold-run timings across six popular OSS repos (darwin/arm64, Node 22):

| Repo | Language | Files | Analyze | Scenario |
|------|----------|------:|--------:|---------:|
| [eShop](https://github.com/dotnet/eShop) | C# | 502 | 689 ms | 17 n / 24 e |
| [fastapi](https://github.com/tiangolo/fastapi) | Python | 531 | 867 ms | — |
| [spring-petclinic](https://github.com/spring-projects/spring-petclinic) | Java | 30 | 197 ms | 2 n |
| [actix-examples](https://github.com/actix/examples) | Rust | 165 | 477 ms | 3 n / 2 e |
| [gin-examples](https://github.com/gin-gonic/examples) | Go | 59 | 299 ms | 4 n / 3 e |
| [nestjs-realworld](https://github.com/lujakob/nestjs-realworld-example-app) | TypeScript | 35 | 199 ms | 2 n |

Full methodology + per-repo findings: [docs/benchmarks.md](docs/benchmarks.md). Reproduce with `node scripts/run-benchmarks.mjs`.

## Testing

200 tests across 4 suites:

```bash
pnpm test        # 184 unit tests (core + web + cli)
pnpm test:e2e    # 16 Playwright E2E tests
```

## Development

```bash
git clone https://github.com/muhsinelcicek/archlens.git
cd archlens
pnpm install
pnpm build
pnpm test
pnpm dev
```

## Roadmap

- [ ] Target Architecture Editor (authoring, node-based)
- [ ] VS Code extension
- [ ] CI/CD integration (break build on violations)
- [ ] Simulator comparison mode (A vs B)
- [ ] More language-specific quality rules
- [ ] 10K+ file performance benchmarks

## License

[MIT License](LICENSE) — Copyright (c) 2026 Muhsin Elçiçek

Free to use, modify, and distribute.
