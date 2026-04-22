# Changelog

All notable changes to ArchLens are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-04-22

Closes the product's core loop: users can go from *analyze my code* to *simulate how it behaves under load* without hand-building the simulator scenario.

### Added
- **`archlens-studio simulate` CLI command** — reads `.archlens/model.json` and writes `.archlens/scenario.json` with an inferred topology (16 node types supported, keyword + layer + entity heuristics).
- **Scenario generator** in `@archlens/core` (`generateScenario()`): pure function, deterministic, 11 unit tests. Keyword matching for cache/queue/broker/storage/auth/CDN/gateway/monitoring/lambda, layer-based fallback for presentation/api/application/domain/infrastructure, automatic load balancer when 2+ API-facing modules, database node when entities exist.
- **Web dashboard**: `GET /api/scenario` endpoint + simulator banner "Load analyzed scenario" that auto-loads the generated topology into the canvas.
- **Benchmark report**: `docs/benchmarks.md` + `docs/benchmarks.json` with a reproducible runner (`scripts/run-benchmarks.mjs`) that analyzes six popular OSS repos (eShop, FastAPI, Spring PetClinic, nestjs-realworld, gin-examples, actix-examples).

### Measured
- Every benchmark repo analyzed in under 900 ms (30–531 files, 103–1,647 symbols).
- eShop produces a 17-node / 24-edge scenario with load balancer, database, cache and message broker wired up end-to-end.

### Tests
- 200 green (**+11 scenario-generator unit tests**): 147 core + 37 web + 16 CLI.

## [0.1.0] - 2026-04-22

First public release. Published to npm as `archlens-studio`.

### Analysis engine
- 8 language parsers via tree-sitter: TypeScript, JavaScript, Python, Go, Java, Swift, Rust, C#
- 20 analyzers: project scanner, quality, coupling, security, dead code, hotspots, tech debt, patterns, consistency, drift, and more
- Framework detector for 15+ frameworks (Express, NestJS, Next.js, Fastify, FastAPI, Flask, Django, Spring Boot, gin, Actix, Vapor, ASP.NET Core, …)
- ORM detector for 10 ORMs (Prisma, TypeORM, Sequelize, SQLAlchemy, Django ORM, JPA, GORM, Diesel, Fluent, EF Core)
- Incremental cache with SHA-256 hashing
- Shallow-clone detection for hotspot analysis

### Visualization
- ConstellationGraph — custom HTML/SVG graph with layered layout, glowing nodes, always-flowing particles (replaces Sigma.js)
- Request flow tracer: endpoint → handler → dependencies → database
- Impact / blast-radius analysis with interactive overlays
- Risk / quality overlay toggles
- 8 architecture overlay modes with topology badges

### Simulator
- M/M/c queueing-theory engine
- 16 node types (Client, LB, API, Service, DB, Cache, Queue, CDN, Lambda, Gateway, Auth, Broker, Storage, DNS, Container, Monitoring)
- Circuit breakers with closed/open/half-open state machine
- Auto-scaling policies with cooldown + retry logic
- 6 traffic patterns (constant, burst, ramp, spike, periodic, noise)
- 5 scenario templates (E-commerce, Microservices, Event-Driven, CDN+Origin, Data Pipeline)
- 5 load-test presets (Baseline, Black Friday, Launch Day, DDoS, Daily Pattern)
- Chaos engineering: random kills, latency injection, AZ failure
- 15 incident types (SPOF, CASCADE, OVERLOAD, 502, TOPOLOGY PRESSURE, …)
- Cost modeling ($/replica/hour, monthly estimates)
- One-click FIX buttons + Markdown report export
- Save/load scenarios via localStorage + JSON export/import

### Web dashboard
- React 19 + Vite + Tailwind + React Query v5
- 7 routes: Dashboard, Architecture, Simulator, Insights, Quality, Flows, Settings
- 2 themes (Dark + Light) — fully CSS-variable driven
- Railway-inspired design system with light mode `#f0f0f5` soft gray-blue
- Route-based code splitting: main bundle 1.4 MB → 51 KB
- Print-to-PDF Executive Report
- Error boundary on every route
- File watcher via SSE with project-aware reconnection
- GitHub repo import from the UI
- Multi-project registry: every endpoint respects `?project=`
- Keyboard shortcuts, comments on insights

### CLI
- 9 commands: `analyze`, `serve`, `add`, `list`, `remove`, `export`, `review`, `mcp`, `setup`
- Distributed as `archlens-studio` on npm
- Binary name: `archlens-studio`

### MCP server
- 7 tools for Claude Code / Cursor / Windsurf: `architecture`, `process`, `impact`, `onboard`, `drift`, `sequence`, `explain`

### Testing
- 205 tests across 4 suites:
  - 136 core analyzer unit tests
  - 34 simulator engine unit tests (queueing theory, circuit breakers, traffic patterns)
  - 19 CLI / API contract tests
  - 16 Playwright E2E tests
- Green on CI (GitHub Actions, Linux Tailwind v4 oxide-binding workaround included)

### Business logic tuning
- Quality default score: 100 → 85 (reflects the fact that test coverage and documentation cannot be measured statically)
- Dead code detector: 12+ DI patterns added (Builder, Factory, HostedService, Subscriber, Consumer, Worker, Validator, Middleware, Handler, Mapper, Profile, Seeder); interface implementations, migrations, test files, event handlers, gRPC services excluded
- Hotspot analyzer: warns when `git log --depth < 50` (shallow clone)
