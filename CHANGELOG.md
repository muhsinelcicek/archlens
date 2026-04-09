# Changelog

All notable changes to ArchLens are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Comprehensive test suite: 202 tests across 4 suites
  - 136 core analyzer unit tests
  - 34 simulator engine unit tests (queueing theory, circuit breakers, traffic patterns)
  - 16 CLI API contract tests
  - 16 Playwright E2E tests
- Architecture Simulator v3 with all production-grade features:
  - M/M/c queueing approximation
  - Circuit breakers (closed/open/half-open state machine)
  - Auto-scaling policies with cooldown
  - 6 traffic patterns (constant/burst/ramp/spike/periodic/noise)
  - 5 scenario templates (E-commerce, Microservices, Event-Driven, CDN+Origin, Data Pipeline)
  - 5 load test presets (Baseline, Black Friday, Launch Day, DDoS, Daily Pattern)
  - Cost modeling ($/replica/hour, monthly estimates)
  - AI root cause analysis
  - Chaos engineering (random kills, latency injection)
  - Real-time event log
- Multi-project awareness across all 15 pages and 20+ API endpoints
- File watcher (SSE) with project-aware reconnection
- Re-analyze with registry update
- Framework detector for 15+ frameworks across 8 languages
- ORM detector for Prisma, TypeORM, Sequelize, SQLAlchemy, Django ORM, JPA, GORM, Diesel, Fluent, EF Core
- 5 new dashboard pages: Hotspots, Architecture Diff, Custom Rules, Insights, Simulator
- Save/load scenarios via localStorage + JSON export/import
- Print-to-PDF Executive Report
- Comments system on insights
- Settings page with theme picker, language selector, project info, MCP config, keyboard shortcuts

### Changed
- Architecture View: complete redesign with War Room layout (impact mode, dependency matrix, file viewer)
- Quality View: 4 tabs (quality, coupling, consistency, tech debt) with deep pattern analysis
- ProcessView: interactive system map with vertical timeline view
- Onboarding: guided tour with progress tracking and dynamic insights
- Dashboard: command center with health pulse and action items
- Restructured to 10 logical pages (from 16 fragmented ones)

### Fixed
- Multi-project: all endpoints now respect `?project=` query param
- Dashboard crash on missing API field names (CouplingReport)
- Map serialization in re-analyze that broke other endpoints
- ErrorBoundary on all 15 routes prevents whole-app crashes

## [0.1.0] - 2026-03-29

### Added
- Initial release
- Core analysis engine with 8 language parsers (TypeScript, JavaScript, Python, Go, Java, Swift, Rust, C#)
- 20 analyzers: project scanner, quality, coupling, dead code, security, hotspots, tech debt, etc.
- Web dashboard with React + Vite + Tailwind
- CLI with 9 commands (analyze, serve, add, list, remove, export, review, mcp, setup)
- MCP server with 7 tools for Claude Code, Cursor
- GitHub repo import via web UI
- Multi-language UI (English/Turkish)
- 5 themes (Midnight Purple, Deep Ocean, Emerald Forest, Rose Gold, Light)
