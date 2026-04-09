<div align="center">

# ArchLens

### **See your codebase. Test your architecture. Before production.**

Code Architecture Intelligence Platform that analyzes your real codebase, simulates how it behaves under load, and tells you what's wrong before users do.

[![Tests](https://img.shields.io/badge/tests-202%20passing-brightgreen)](#testing)
[![Languages](https://img.shields.io/badge/languages-8-blue)](#supported-languages--frameworks)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)

[**Quick Start**](#quick-start) · [**Features**](#features) · [**Screenshots**](#screenshots) · [**Pricing**](#pricing) · [**MCP**](#mcp-integration) · [**Docs**](#documentation)

</div>

---

## Why ArchLens?

Most code analysis tools tell you about syntax. ArchLens tells you about **architecture, behavior, and risk** — using the same codebase you ship.

| Question | Other tools | **ArchLens** |
|----------|-------------|--------------|
| "What does this codebase do?" | Show files | **Auto-detected business processes & data flows** |
| "What breaks if I change this?" | Find references | **Real impact analysis with blast radius** |
| "Will this scale to Black Friday?" | ❌ | **Simulate it before production** |
| "Where's the technical debt?" | Lint issues | **Hours + dollar cost estimates** |
| "Can I trust this open-source repo?" | README | **Quality score, hotspots, security in 60 seconds** |

ArchLens is the first tool that combines **brownfield code analysis** with **distributed-system simulation**. You don't just see your architecture — you stress-test it.

---

## Features

### 🔍 Code Intelligence
- **8 languages**: TypeScript, JavaScript, Python, Go, Java, Swift, Rust, C#
- **15+ frameworks** auto-detected: Express, NestJS, Next.js, FastAPI, Flask, Django, Spring Boot, gin, echo, Actix, Vapor, and more
- **10 ORMs**: EF Core, JPA, Prisma, TypeORM, Sequelize, SQLAlchemy, Django ORM, GORM, Diesel, Fluent
- **Tree-sitter** AST parsing for accuracy
- **Incremental analysis** with SHA-256 caching (262× faster reruns)

### 📊 Architecture Analysis
- **Layer detection** (presentation, API, application, domain, infrastructure)
- **Coupling metrics**: Afferent (Ca), Efferent (Ce), Instability (I), Abstractness (A), Distance (D)
- **Circular dependency** detection at module + symbol level
- **Pattern analysis**: DDD, CQRS, Clean Architecture, Repository, Event-Driven, Microservice
- **Module quality scores** with language-aware rules
- **Hotspot analysis**: git history × complexity (Tornhill methodology)

### 🎮 Architecture Simulator (unique to ArchLens)
- **Drag-and-drop canvas** that starts from your real codebase
- **Queueing theory engine** (M/M/c approximation, Little's Law)
- **Time-series metrics**: throughput, P50/P95/P99 latency, error rate, queue depth
- **Circuit breakers** with closed/open/half-open state machine
- **Auto-scaling** policies with cooldown
- **Chaos engineering**: random kills, latency injection, network partitions
- **5 traffic patterns**: constant, burst, ramp, spike, periodic, noise
- **5 scenario templates**: E-commerce, Microservices, Event-Driven, CDN+Origin, Data Pipeline
- **5 load test presets**: Baseline, Black Friday, Launch Day, DDoS, Daily Pattern
- **Cost modeling**: $/replica/hour, monthly estimates
- **AI root cause analysis** of detected bottlenecks

### 🛡️ Quality, Security & Tech Debt
- **20 analyzers** including: quality, coupling, consistency, security, dead code, hotspots, tech debt, vulnerabilities
- **Cyclomatic & cognitive complexity** per language
- **Pattern detection with evidence** (DDD aggregates, CQRS commands, etc.)
- **Tech debt in dollars** ($150/hr default, configurable)
- **Cross-cutting concern consistency** (error handling, logging)
- **Custom rules engine** with 6 prebuilt templates

### 🤖 AI Integration
- **MCP server** with 7 tools for Claude Code, Cursor, Windsurf, Zed
- Tools: `architecture`, `process`, `impact`, `onboard`, `drift`, `sequence`, `explain`
- AI assistants get instant codebase context without manually loading files

### 🎨 Web Dashboard (15 pages)
- **War Room** (Architecture) — IDE-style with impact mode, dependency matrix, file viewer
- **Smart Insights** — AI-style narrative findings with severity ranking
- **Architecture Diff** — snapshot comparison over time
- **Custom Rules** — visual rule editor with violation tracking
- **Executive Report** — print-to-PDF for stakeholders
- **Multi-project** dropdown with live SSE file watcher
- **5 themes**, English/Turkish i18n

---

## Quick Start

### Install

```bash
npm install -g archlens
```

### Analyze your project

```bash
cd your-project
archlens analyze .
```

### Open the dashboard

```bash
archlens serve
# → http://localhost:4848
```

### Or import a GitHub repo

```bash
archlens add https://github.com/dotnet/eShop
archlens serve
```

---

## Screenshots

| Architecture View | Simulator | Insights |
|-------------------|-----------|----------|
| ![Architecture](docs/img/architecture.png) | ![Simulator](docs/img/simulator.png) | ![Insights](docs/img/insights.png) |

> 💡 **Try the live demo:** Add any GitHub repo and explore — no signup, runs locally on your machine.

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `archlens analyze <path>` | Analyze a project directory |
| `archlens serve` | Start the web dashboard on port 4848 |
| `archlens add <github-url>` | Clone & analyze a GitHub repository |
| `archlens list` | List all analyzed projects |
| `archlens remove <name>` | Remove a project from the registry |
| `archlens export <format>` | Export analysis as JSON or SVG |
| `archlens review` | Print architecture review to terminal |
| `archlens mcp` | Start MCP server for AI tools |
| `archlens setup` | Configure MCP for Claude Code / Cursor |

---

## MCP Integration

Add ArchLens to your AI coding assistant for instant codebase context:

### Claude Code / Cursor

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

### Available MCP Tools

| Tool | Use Case |
|------|----------|
| `architecture` | "Show me the structure of this codebase" |
| `process` | "What business processes does this app implement?" |
| `impact` | "What breaks if I change `validateUser`?" |
| `onboard` | "I'm new — give me an overview" |
| `drift` | "What changed in this branch?" |
| `sequence` | "Trace the call chain from `/api/orders`" |
| `explain` | "What does this function do and where is it used?" |

---

## Supported Languages & Frameworks

| Language | Parser | Endpoints | ORM | Quality Rules | Patterns |
|----------|--------|-----------|-----|---------------|----------|
| **C# / .NET** | ✅ | ASP.NET Core | EF Core | 5 | DDD, Clean Arch |
| **TypeScript** | ✅ | Express, NestJS, Next.js, Fastify | Prisma, TypeORM, Sequelize | 5 | Hexagonal |
| **JavaScript** | ✅ | Express, Koa, Hono | Sequelize | 3 | — |
| **Python** | ✅ | FastAPI, Flask, Django, DRF | SQLAlchemy, Django ORM | 5 | — |
| **Java** | ✅ | Spring Boot, JAX-RS | JPA | 3 | DDD |
| **Go** | ✅ | gin, echo, chi, fiber, gorilla/mux | GORM | 3 | — |
| **Rust** | ✅ | Actix-web, Axum, Rocket | Diesel | 2 | — |
| **Swift** | ✅ | Vapor | Fluent | 1 | — |

**Tested with:** dotnet/eShop, tiangolo/fastapi, spring-petclinic, gin-gonic/examples

---

## Architecture

```
packages/
├── core/     — Analysis engine (20 analyzers, 8 parsers, framework detector)
├── cli/      — Command-line interface (9 commands, HTTP API)
├── mcp/      — Model Context Protocol server (7 tools)
└── web/      — React dashboard (Vite + Tailwind, 15 pages)
```

---

## Pricing

ArchLens has two editions:

### 🎁 Community Edition (Free, MIT)

Perfect for individual developers and open source projects.

- All 8 languages and 15+ frameworks
- 15 analyzer pages (Dashboard, Architecture, Quality, Hotspots, Diff, Rules, etc.)
- Architecture Simulator with all features
- MCP integration for AI tools
- Self-hosted, runs locally
- Community support via GitHub issues

### 💼 Pro / Enterprise Edition (Coming Soon)

For teams and organizations that need more.

- **Team Collaboration** — shared snapshots, comments, review workflows
- **CI/CD Integration** — break builds on architecture violations
- **SSO / SAML** — Okta, Azure AD, Google Workspace
- **Audit Logs** — for compliance (SOC 2, ISO 27001)
- **Custom Rules at Scale** — central rule library across repos
- **Slack / Teams Notifications** — when architecture drifts
- **Hosted Cloud Option** — we run it for you
- **Priority Support** — SLA-backed
- **Custom Integrations** — ServiceNow, Jira, GitHub Enterprise

> 📧 **Interested in Enterprise?** Contact us at archlens@example.com

---

## Documentation

- 📖 [Getting Started](docs/getting-started.md)
- 🎯 [Architecture View Guide](docs/architecture-view.md)
- 🎮 [Simulator Tutorial](docs/simulator.md)
- 🔌 [MCP Integration](docs/mcp.md)
- 🛠️ [Contributing](CONTRIBUTING.md)
- 🔒 [Security Policy](SECURITY.md)
- 📋 [Changelog](CHANGELOG.md)

---

## Testing

ArchLens has **202 tests** across 4 suites:

```bash
pnpm test           # 186 unit tests (core: 136, web: 34, cli: 16)
pnpm test:e2e       # 16 Playwright E2E tests
```

| Suite | Count | Coverage |
|-------|-------|----------|
| Core analyzers | 136 | parsers, quality, coupling, security, dead code, hotspots, framework detector |
| Simulator engine | 34 | queueing theory, circuit breakers, traffic patterns, root cause |
| API contract | 16 | endpoint response shapes |
| E2E (Playwright) | 16 | all 15 pages, navigation, simulator flows |

---

## Development

```bash
git clone https://github.com/your-org/archlens.git
cd archlens
pnpm install
pnpm build
pnpm test
pnpm dev      # web dashboard at localhost:4849
```

### Project structure

```
.
├── packages/
│   ├── core/           # Analysis engine
│   ├── cli/            # CLI + HTTP server
│   ├── mcp/            # MCP server
│   └── web/            # React dashboard
├── e2e/                # Playwright tests
├── docs/               # Documentation
└── .github/workflows/  # CI/CD
```

---

## Roadmap

**v0.2 (next)**
- [ ] Multi-region simulation topology
- [ ] Distributed trace view in simulator
- [ ] Comparison mode (A vs B architectures)
- [ ] More frameworks: Phoenix (Elixir), Echo (Go), Laravel (PHP)
- [ ] Performance benchmarks for 10k+ file projects

**v0.3**
- [ ] Browser extension to analyze any GitHub repo with one click
- [ ] VS Code extension
- [ ] CI integration (GitHub Actions, GitLab CI)
- [ ] Cloud-hosted demo

**Contributions welcome!** See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Comparisons

| | ArchLens | SonarQube | CodeScene | Structurizr | Paperdraw |
|---|----------|-----------|-----------|-------------|-----------|
| **Multi-language** | ✅ 8 | ✅ | ✅ | — | — |
| **Architecture-aware quality** | ✅ | ⚠️ | ✅ | — | — |
| **Auto-detected layers/patterns** | ✅ | — | ⚠️ | — | — |
| **Hotspot analysis** | ✅ | — | ✅ | — | — |
| **Architecture simulator** | ✅ | — | — | — | ✅ |
| **Real-code-based simulation** | ✅ | — | — | — | — |
| **MCP/AI integration** | ✅ | — | — | — | — |
| **Self-hosted** | ✅ | ✅ | ✅ | ✅ | — |
| **Open source** | ✅ MIT | LGPL | proprietary | MIT | proprietary |

---

## License

ArchLens Community Edition is licensed under the [MIT License](LICENSE).

Pro / Enterprise features are subject to a [commercial license](LICENSE.commercial).

---

## Credits

Built with ❤️ using TypeScript, React, Tree-sitter, Sigma.js, and Vitest.

Inspired by SonarQube, CodeScene, Structurizr, and Paperdraw — but combining the best parts of each.

<div align="center">

**[⭐ Star on GitHub](https://github.com/your-org/archlens)** · **[📖 Read the Docs](docs/)** · **[🎮 Try the Simulator](#features)**

</div>
