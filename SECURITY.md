# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in ArchLens, please report it responsibly.

### Where to report

📧 **Email:** security@archlens.dev (or archlens@example.com if not yet set up)

**Please do NOT** open a public GitHub issue for security vulnerabilities.

### What to include

1. **Description** of the vulnerability
2. **Steps to reproduce** (proof of concept if possible)
3. **Impact assessment** (what an attacker could do)
4. **Affected versions**
5. **Suggested fix** if you have one

### Response timeline

- **Acknowledgment**: within 48 hours
- **Initial assessment**: within 7 days
- **Fix + disclosure**: within 30 days for critical, 90 days for others

We follow [coordinated disclosure](https://en.wikipedia.org/wiki/Coordinated_disclosure) practices.

## Security considerations for users

ArchLens runs **locally** on your machine and **does not** send your code anywhere. However, please be aware:

### File access

- The CLI reads files in directories you point it at
- The web dashboard `/api/file` endpoint can read files within registered project paths
- Path traversal is prevented via `path.resolve()` checks

### Network exposure

- `archlens serve` binds to `localhost:4848` by default — **do not expose to the internet without authentication**
- The web dashboard runs on `localhost:4849`
- For team deployments, use a reverse proxy with authentication (nginx, Caddy, Cloudflare Access)

### MCP integration

- MCP server runs locally and communicates via stdio
- Your AI assistant (Claude Code, Cursor) can read codebase analysis but **cannot modify files**
- Verify your MCP client configuration before granting access

### Dependencies

We monitor dependencies for known vulnerabilities. To check your installation:

```bash
pnpm audit
```

### Sandboxed analysis

When analyzing untrusted code:

- Use a containerized environment (Docker, devcontainer)
- Don't run `archlens analyze` on code you wouldn't `git clone` first
- Review the code's `package.json` / `requirements.txt` etc. before installing dependencies

## Security features in ArchLens

ArchLens includes a **security scanner** that detects common vulnerabilities in analyzed code:

- Hardcoded secrets (API keys, passwords)
- SQL injection patterns
- XSS vulnerabilities
- Path traversal
- Insecure deserialization
- Weak cryptography
- 15+ regex-based patterns with CWE references

Run security scan:

```bash
archlens analyze .
# Then visit http://localhost:4849/quality → Security tab
```

## Acknowledgments

We thank the security researchers who help make ArchLens more secure. Researchers who report valid vulnerabilities will be credited (with permission) in our [Hall of Fame](docs/security-hall-of-fame.md).
