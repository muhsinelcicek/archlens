# Contributing to ArchLens

Thanks for your interest in contributing! ArchLens is an open-source project and we welcome all contributions: bug reports, feature requests, documentation improvements, and code.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code.

## Ways to contribute

| Type | How |
|------|-----|
| 🐛 **Bug reports** | [Open an issue](https://github.com/your-org/archlens/issues/new?template=bug_report.md) |
| ✨ **Feature requests** | [Open an issue](https://github.com/your-org/archlens/issues/new?template=feature_request.md) |
| 📝 **Documentation** | Edit files in `docs/` and submit a PR |
| 🧪 **Tests** | We always welcome more test coverage |
| 🌐 **Translations** | Edit `packages/web/src/lib/i18n.ts` |
| 🔌 **New language/framework parsers** | See [Adding a Parser](#adding-a-parser-or-framework) |
| 💻 **Code** | Pick a [good first issue](https://github.com/your-org/archlens/labels/good%20first%20issue) |

## Development setup

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- Git

### Setup

```bash
git clone https://github.com/your-org/archlens.git
cd archlens
pnpm install
pnpm build
pnpm test
```

### Running locally

```bash
# Terminal 1 — API server
cd /path/to/some/project
node /path/to/archlens/packages/cli/dist/index.js analyze .
node /path/to/archlens/packages/cli/dist/index.js serve

# Terminal 2 — Web dashboard
cd /path/to/archlens
pnpm --filter @archlens/web dev
# → http://localhost:4849
```

### Running tests

```bash
pnpm test            # all unit tests (186)
pnpm test:e2e        # Playwright E2E (16)
pnpm test:e2e:ui     # Playwright UI mode for debugging
pnpm typecheck       # TypeScript across all packages
```

## Project structure

```
.
├── packages/
│   ├── core/                # Analysis engine
│   │   ├── src/
│   │   │   ├── parsers/     # Language parsers (tree-sitter)
│   │   │   ├── analyzers/   # 20 analyzers
│   │   │   ├── models/      # Type definitions
│   │   │   └── generators/  # Mermaid, Markdown output
│   │   └── __tests__/
│   ├── cli/                 # CLI + HTTP API server
│   │   └── src/commands/
│   ├── mcp/                 # Model Context Protocol server
│   └── web/                 # React dashboard
│       └── src/
│           ├── app/         # Page components
│           ├── components/  # Reusable UI
│           └── lib/         # Store, theme, i18n, utilities
├── e2e/                     # Playwright tests
├── docs/                    # Documentation
└── .github/                 # CI/CD workflows
```

## Pull Request Process

1. **Fork** the repo and create a branch: `git checkout -b feature/my-thing`
2. **Make your changes** with clear commits (follow [Conventional Commits](https://www.conventionalcommits.org/))
3. **Add tests** for new functionality
4. **Run the test suite**: `pnpm test && pnpm typecheck && pnpm test:e2e`
5. **Update documentation** if needed (README, CHANGELOG, docs/)
6. **Submit a PR** with a clear description of what and why

### PR checklist

- [ ] Tests pass (`pnpm test`)
- [ ] TypeScript compiles (`pnpm typecheck`)
- [ ] Code follows existing style (no linter, but match the patterns)
- [ ] CHANGELOG.md updated under `[Unreleased]`
- [ ] New features have at least 1 test
- [ ] PR description explains the **why**, not just the **what**

## Adding a parser or framework

ArchLens uses tree-sitter for AST parsing and a `FrameworkDetector` for regex-based framework recognition.

### To add a new language parser:

1. Add tree-sitter dependency: `pnpm add tree-sitter-yourlang -F @archlens/core`
2. Create `packages/core/src/parsers/yourlang-parser.ts` extending `BaseParser`
3. Implement `parse(content, filePath)` returning symbols, relations, imports, endpoints, entities
4. Register in `packages/core/src/parsers/index.ts`
5. Add to `inferLanguage()` in `packages/core/src/analyzers/project-scanner.ts`
6. Add quality rules in `packages/core/src/analyzers/language-rules.ts`
7. Write tests in `packages/core/src/__tests__/parsers.test.ts`

### To add a new framework detector:

1. Open `packages/core/src/analyzers/framework-detector.ts`
2. Add a `detectYourFramework(filePath, content)` method
3. Use regex to extract endpoints (`addEndpoint`) or entities (`this.entities.push`)
4. Wire it up in the `switch (ext)` block
5. Add tests in `packages/core/src/__tests__/framework-detector.test.ts`

Real-world testing: pick a representative repo, clone it, run `archlens analyze .`, verify endpoint count is reasonable.

## Code style

- TypeScript strict mode
- React functional components with hooks
- Tailwind for styling (no CSS-in-JS)
- Prefer composition over abstraction
- Comments only when the *why* isn't obvious from code
- Error handling at boundaries, not deep inside helpers

## Reporting bugs

When reporting a bug, please include:

1. **What you tried** (commands, steps to reproduce)
2. **What happened** (error message, screenshot)
3. **What you expected**
4. **Environment**: OS, Node version, pnpm version, ArchLens version
5. **Project being analyzed** (language, size, public repo URL if possible)

## Questions?

- 💬 [GitHub Discussions](https://github.com/your-org/archlens/discussions)
- 🐛 [Issues](https://github.com/your-org/archlens/issues)
- 📧 archlens@example.com

Thanks for making ArchLens better! 💜
