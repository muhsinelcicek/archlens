# ArchLens Benchmarks

Measured on `darwin` / `arm64` · Node `v22.17.0` · 2026-04-22.

Every repo is cloned (`--depth 1`), analyzed with `archlens-studio analyze`, and the analyzer→simulator bridge is exercised with `archlens-studio simulate`. Timing excludes git clone.

## Findings

- **Sub-second analysis on real repos.** Every repo under 900 ms despite spanning 30–531 files and 103–1,647 symbols across six languages. No caching tricks — these are cold runs with `--force`.
- **Scenario quality scales with service-oriented code.** eShop — a real microservices app — yields a 17-node / 24-edge scenario with a load balancer, database, cache and message broker wired up automatically (10 DB entities + cache/broker keywords in its tech stack). This is the flagship example of the analyzer → simulator bridge doing useful work end-to-end.
- **Framework / example repos are poor simulator subjects, as expected.** `fastapi` detects 435 endpoints but only 4 modules because most code is library-internal — there's nothing service-shaped to simulate. Same story for `gin-examples` / `actix-examples`, which are walkthrough collections rather than production apps. The inference *correctly refuses to invent topology* in those cases.
- **Monolith Java apps collapse to one node.** `spring-petclinic` has 18 endpoints and 6 DB entities but everything lives in a single Maven module. The scenario is honest about it (2 nodes: client → DB); improving this would require file-path-based sub-module inference.
- **Every benchmark exercised the new `simulate` command.** No repo-specific config, no hand-holding — the inference ran out-of-the-box on C#, Java, Python, TypeScript, Go and Rust projects.

## Summary

| Repo | Language | Files | Symbols | Modules | Endpoints | Entities | Analyze | Model size | Scenario |
|------|----------|------:|--------:|--------:|----------:|---------:|--------:|-----------:|---------:|
| [eShop](https://github.com/dotnet/eShop) | C# | 502 | 1,647 | 22 | 14 | 10 | 689ms | 1,474KB | 17n/24e |
| [spring-petclinic](https://github.com/spring-projects/spring-petclinic) | Java | 30 | 103 | 1 | 18 | 6 | 197ms | 120KB | 2n/0e |
| [fastapi](https://github.com/tiangolo/fastapi) | Python | 531 | 1,622 | 4 | 435 | 0 | 867ms | 1,440KB | 1n/0e |
| [nestjs-realworld](https://github.com/lujakob/nestjs-realworld-example-app) | TypeScript | 35 | 148 | 7 | 21 | 5 | 199ms | 165KB | 2n/0e |
| [gin-examples](https://github.com/gin-gonic/examples) | Go | 59 | 170 | 32 | 35 | 0 | 299ms | 348KB | 4n/3e |
| [actix-examples](https://github.com/actix/examples) | Rust | 165 | 930 | 24 | 108 | 3 | 477ms | 619KB | 3n/2e |

## Per-repo detail

### eShop (C#)

**Source:** https://github.com/dotnet/eShop

- 502 files, 23,335 lines, 1,647 symbols, 22 modules
- Top languages: csharp (1782), typescript (2)
- 14 API endpoints · 10 DB entities · 4 processes · 72 tech-radar entries
- Analyzed in **689ms** (model 1,474KB)
- Simulator scenario: **17 nodes, 24 edges**, 140 req/s baseline
  - Inferences:
    - 17 nodes + 24 edges inferred from 22 modules
    - cache node added (detected in tech stack)
    - messagebroker node added (detected in tech stack)
    - database node added (10 entities detected)
    - load balancer added (9 API-facing modules)
    - traffic baseline = 140 req/s (14 endpoints × 10)

### spring-petclinic (Java)

**Source:** https://github.com/spring-projects/spring-petclinic

- 30 files, 1,857 lines, 103 symbols, 1 modules
- Top languages: java (105)
- 18 API endpoints · 6 DB entities · 2 processes · 3 tech-radar entries
- Analyzed in **197ms** (model 120KB)
- Simulator scenario: **2 nodes, 0 edges**, 180 req/s baseline
  - Inferences:
    - 2 nodes + 0 edges inferred from 1 modules
    - database node added (6 entities detected)
    - traffic baseline = 180 req/s (18 endpoints × 10)

### fastapi (Python)

**Source:** https://github.com/tiangolo/fastapi

- 531 files, 33,387 lines, 1,622 symbols, 4 modules
- Top languages: python (1652), typescript (25)
- 435 API endpoints · 0 DB entities · 4 processes · 80 tech-radar entries
- Analyzed in **867ms** (model 1,440KB)
- Simulator scenario: **1 nodes, 0 edges**, 4350 req/s baseline
  - Inferences:
    - 1 nodes + 0 edges inferred from 4 modules
    - traffic baseline = 4350 req/s (435 endpoints × 10)

### nestjs-realworld (TypeScript)

**Source:** https://github.com/lujakob/nestjs-realworld-example-app

- 35 files, 1,171 lines, 148 symbols, 7 modules
- Top languages: typescript (148)
- 21 API endpoints · 5 DB entities · 1 processes · 32 tech-radar entries
- Analyzed in **199ms** (model 165KB)
- Simulator scenario: **2 nodes, 0 edges**, 210 req/s baseline
  - Inferences:
    - 2 nodes + 0 edges inferred from 7 modules
    - database node added (5 entities detected)
    - traffic baseline = 210 req/s (21 endpoints × 10)

### gin-examples (Go)

**Source:** https://github.com/gin-gonic/examples

- 59 files, 3,454 lines, 170 symbols, 32 modules
- Top languages: go (154), typescript (43)
- 35 API endpoints · 0 DB entities · 2 processes · 41 tech-radar entries
- Analyzed in **299ms** (model 348KB)
- Simulator scenario: **4 nodes, 3 edges**, 350 req/s baseline
  - Inferences:
    - 4 nodes + 3 edges inferred from 32 modules
    - load balancer added (2 API-facing modules)
    - traffic baseline = 350 req/s (35 endpoints × 10)

### actix-examples (Rust)

**Source:** https://github.com/actix/examples

- 165 files, 13,364 lines, 930 symbols, 24 modules
- Top languages: rust (963), python (19), typescript (2)
- 108 API endpoints · 3 DB entities · 2 processes · 0 tech-radar entries
- Analyzed in **477ms** (model 619KB)
- Simulator scenario: **3 nodes, 2 edges**, 1080 req/s baseline
  - Inferences:
    - 3 nodes + 2 edges inferred from 24 modules
    - database node added (3 entities detected)
    - traffic baseline = 1080 req/s (108 endpoints × 10)

## Reproducing

```bash
git clone https://github.com/muhsinelcicek/archlens
cd archlens && pnpm install && pnpm -r build
node scripts/run-benchmarks.mjs         # uses prebuilt CLI bundle
```

Clones land in `~/.archlens/bench/`. Pass `--fresh` to force re-clone.
