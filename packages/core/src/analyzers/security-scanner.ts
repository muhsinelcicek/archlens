import fs from "node:fs";
import path from "node:path";
import type { ArchitectureModel } from "../models/index.js";

export type SecuritySeverity = "critical" | "high" | "medium" | "low";

export interface SecurityIssue {
  id: string;
  rule: string;
  severity: SecuritySeverity;
  title: string;
  description: string;
  filePath: string;
  line: number;
  code: string;
  recommendation: string;
  cwe?: string;
}

export interface SecurityReport {
  totalIssues: number;
  bySeverity: Record<SecuritySeverity, number>;
  issues: SecurityIssue[];
  score: number; // 0-100, higher is more secure
}

interface ScanPattern {
  rule: string;
  severity: SecuritySeverity;
  title: string;
  pattern: RegExp;
  description: string;
  recommendation: string;
  cwe?: string;
  languages?: string[]; // restrict to specific file extensions
}

const PATTERNS: ScanPattern[] = [
  // ── Hardcoded Secrets ──
  {
    rule: "security/hardcoded-password",
    severity: "critical",
    title: "Hardcoded Password",
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*["'][^"']{4,}["']/gi,
    description: "Password is hardcoded in source code",
    recommendation: "Use environment variables or a secrets manager",
    cwe: "CWE-798",
  },
  {
    rule: "security/hardcoded-api-key",
    severity: "critical",
    title: "Hardcoded API Key",
    pattern: /(?:api[_-]?key|apikey|secret[_-]?key)\s*[:=]\s*["'][A-Za-z0-9+/=]{16,}["']/gi,
    description: "API key or secret is hardcoded in source code",
    recommendation: "Use environment variables or a secrets vault",
    cwe: "CWE-798",
  },
  {
    rule: "security/hardcoded-token",
    severity: "high",
    title: "Hardcoded Token",
    pattern: /(?:token|bearer|jwt)\s*[:=]\s*["'][A-Za-z0-9._-]{20,}["']/gi,
    description: "Authentication token hardcoded in source",
    recommendation: "Use runtime configuration for tokens",
    cwe: "CWE-798",
  },
  {
    rule: "security/connection-string",
    severity: "high",
    title: "Hardcoded Connection String",
    pattern: /(?:connection[_-]?string|conn[_-]?str|database[_-]?url)\s*[:=]\s*["'][^"']{10,}["']/gi,
    description: "Database connection string hardcoded",
    recommendation: "Use environment variables for connection strings",
    cwe: "CWE-798",
  },

  // ── SQL Injection ──
  {
    rule: "security/sql-injection",
    severity: "critical",
    title: "Potential SQL Injection",
    pattern: /(?:execute|query|raw)\s*\(\s*[`"'].*\$\{|(?:execute|query|raw)\s*\(\s*.*\+\s*(?:req|request|params|query|body)\./gi,
    description: "User input may be concatenated into SQL query",
    recommendation: "Use parameterized queries or ORM methods",
    cwe: "CWE-89",
    languages: ["ts", "js", "py", "java"],
  },
  {
    rule: "security/sql-string-format",
    severity: "high",
    title: "SQL String Formatting",
    pattern: /f["'](?:SELECT|INSERT|UPDATE|DELETE|DROP)\s.*\{/gi,
    description: "SQL query uses string formatting with variables",
    recommendation: "Use parameterized queries instead of string formatting",
    cwe: "CWE-89",
    languages: ["py"],
  },

  // ── XSS ──
  {
    rule: "security/dangerouslySetInnerHTML",
    severity: "high",
    title: "Dangerous HTML Injection",
    pattern: /dangerouslySetInnerHTML/g,
    description: "dangerouslySetInnerHTML can lead to XSS attacks",
    recommendation: "Sanitize HTML content before rendering, or use a safe alternative",
    cwe: "CWE-79",
    languages: ["tsx", "jsx"],
  },
  {
    rule: "security/eval-usage",
    severity: "critical",
    title: "eval() Usage",
    pattern: /\beval\s*\(/g,
    description: "eval() executes arbitrary code and is a security risk",
    recommendation: "Avoid eval(). Use JSON.parse() for data, or safer alternatives",
    cwe: "CWE-95",
    languages: ["ts", "js", "py"],
  },

  // ── Insecure Patterns ──
  {
    rule: "security/http-not-https",
    severity: "medium",
    title: "HTTP Instead of HTTPS",
    pattern: /["']http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)/g,
    description: "Non-localhost HTTP URL found — should use HTTPS",
    recommendation: "Use HTTPS for all external URLs",
    cwe: "CWE-319",
  },
  {
    rule: "security/cors-allow-all",
    severity: "medium",
    title: "CORS Allow All Origins",
    pattern: /(?:Access-Control-Allow-Origin|AllowAnyOrigin|cors\s*\(\s*\)|allow_origins\s*=\s*\[?\s*["']\*["'])/gi,
    description: "CORS configured to allow all origins",
    recommendation: "Restrict CORS to specific trusted origins",
    cwe: "CWE-942",
  },
  {
    rule: "security/no-auth-check",
    severity: "medium",
    title: "Missing Authentication Check",
    pattern: /\[AllowAnonymous\]|@allow_anonymous|skip_auth|no_auth/gi,
    description: "Endpoint explicitly skips authentication",
    recommendation: "Ensure anonymous access is intentional and documented",
    cwe: "CWE-306",
  },

  // ── Crypto ──
  {
    rule: "security/weak-hash",
    severity: "high",
    title: "Weak Hash Algorithm",
    pattern: /\b(?:MD5|SHA1|sha1)\b/g,
    description: "Weak hash algorithm detected — MD5/SHA1 are broken",
    recommendation: "Use SHA-256 or SHA-3 for hashing",
    cwe: "CWE-328",
  },
  {
    rule: "security/hardcoded-iv",
    severity: "medium",
    title: "Hardcoded Initialization Vector",
    pattern: /(?:iv|nonce)\s*[:=]\s*["'][A-Za-z0-9+/=]{8,}["']/gi,
    description: "Cryptographic IV/nonce is hardcoded",
    recommendation: "Generate random IV for each encryption operation",
    cwe: "CWE-329",
  },

  // ── Logging Sensitive Data ──
  {
    rule: "security/log-sensitive",
    severity: "medium",
    title: "Logging Sensitive Data",
    pattern: /(?:console\.log|logger?\.\w+|print)\s*\(.*(?:password|secret|token|key|credential)/gi,
    description: "Sensitive data may be logged",
    recommendation: "Never log passwords, tokens, or secrets",
    cwe: "CWE-532",
  },
];

/**
 * SecurityScanner — scans source files for common security vulnerabilities.
 */
export class SecurityScanner {
  constructor(
    private model: ArchitectureModel,
    private rootDir: string,
  ) {}

  scan(): SecurityReport {
    const issues: SecurityIssue[] = [];
    let issueId = 0;

    // Get all unique file paths from symbols
    const filePaths = new Set<string>();
    for (const [, sym] of this.model.symbols) {
      filePaths.add(sym.filePath);
    }

    for (const relPath of filePaths) {
      const absPath = path.join(this.rootDir, relPath);
      if (!fs.existsSync(absPath)) continue;

      let content: string;
      try {
        content = fs.readFileSync(absPath, "utf-8");
      } catch {
        continue;
      }

      const ext = relPath.split(".").pop() || "";
      const lines = content.split("\n");

      for (const pattern of PATTERNS) {
        // Filter by language if specified
        if (pattern.languages && !pattern.languages.includes(ext)) continue;

        // Test each line
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          pattern.pattern.lastIndex = 0; // Reset regex state
          if (pattern.pattern.test(line)) {
            // Skip comments
            const trimmed = line.trim();
            if (trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("*") || trimmed.startsWith("<!--")) continue;

            issues.push({
              id: `sec-${issueId++}`,
              rule: pattern.rule,
              severity: pattern.severity,
              title: pattern.title,
              description: pattern.description,
              filePath: relPath,
              line: i + 1,
              code: line.trim().substring(0, 120),
              recommendation: pattern.recommendation,
              cwe: pattern.cwe,
            });
          }
        }
      }
    }

    const bySeverity: Record<SecuritySeverity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const issue of issues) bySeverity[issue.severity]++;

    const score = Math.max(0, 100 - bySeverity.critical * 20 - bySeverity.high * 10 - bySeverity.medium * 3 - bySeverity.low * 1);

    return {
      totalIssues: issues.length,
      bySeverity,
      issues: issues.sort((a, b) => sevWeight(b.severity) - sevWeight(a.severity)),
      score: Math.min(100, score),
    };
  }
}

function sevWeight(s: SecuritySeverity): number {
  return s === "critical" ? 4 : s === "high" ? 3 : s === "medium" ? 2 : 1;
}
