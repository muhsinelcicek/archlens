import type { Language, Symbol } from "../models/index.js";

/**
 * Language-specific analysis rules.
 * Each language has its own idioms, conventions, and anti-patterns.
 */

export interface ComplexityResult {
  cyclomatic: number;
  cognitive: number;
  nesting: number;
  details: string[];
}

export interface LanguageIssue {
  rule: string;
  severity: "critical" | "major" | "minor" | "info";
  message: string;
  suggestion: string;
  category: string;
}

// ─── Cyclomatic Complexity from source code ─────────────────────

export function calculateComplexity(code: string, language: Language): ComplexityResult {
  let cyclomatic = 1; // Base complexity
  let cognitive = 0;
  let maxNesting = 0;
  let currentNesting = 0;
  const details: string[] = [];

  const lines = code.split("\n");

  // Language-specific branch keywords
  const branchKeywords: Record<string, RegExp[]> = {
    csharp: [/\bif\s*\(/, /\belse\s+if\b/, /\bswitch\s*\(/, /\bcase\s+/, /\bfor\s*\(/, /\bforeach\s*\(/, /\bwhile\s*\(/, /\bcatch\s*\(/, /\?\?/, /\?\./,  /&&/, /\|\|/],
    typescript: [/\bif\s*\(/, /\belse\s+if\b/, /\bswitch\s*\(/, /\bcase\s+/, /\bfor\s*\(/, /\bfor\s+.*\bof\b/, /\bwhile\s*\(/, /\bcatch\s*\(/, /\?\?/, /\?\./,  /&&/, /\|\|/, /\?\s*.*\s*:/],
    javascript: [/\bif\s*\(/, /\belse\s+if\b/, /\bswitch\s*\(/, /\bcase\s+/, /\bfor\s*\(/, /\bfor\s+.*\bof\b/, /\bwhile\s*\(/, /\bcatch\s*\(/, /\?\?/, /&&/, /\|\|/],
    python: [/\bif\s+/, /\belif\s+/, /\bfor\s+/, /\bwhile\s+/, /\bexcept\s*/, /\band\b/, /\bor\b/, /\bif\s+.*\belse\b/],
    go: [/\bif\s+/, /\bswitch\s*/, /\bcase\s+/, /\bfor\s+/, /\bselect\s*\{/, /&&/, /\|\|/],
    java: [/\bif\s*\(/, /\belse\s+if\b/, /\bswitch\s*\(/, /\bcase\s+/, /\bfor\s*\(/, /\bwhile\s*\(/, /\bcatch\s*\(/, /\?\?/, /&&/, /\|\|/],
    swift: [/\bif\s+/, /\belse\s+if\b/, /\bswitch\s+/, /\bcase\s+/, /\bfor\s+/, /\bwhile\s+/, /\bguard\s+/, /\bcatch\s*/, /&&/, /\|\|/],
    rust: [/\bif\s+/, /\belse\s+if\b/, /\bmatch\s+/, /\bfor\s+/, /\bwhile\s+/, /\bloop\s*\{/, /&&/, /\|\|/, /\?\s*;/],
  };

  const patterns = branchKeywords[language] || branchKeywords.typescript;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comments
    if (trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;

    // Track nesting
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    currentNesting += opens - closes;
    if (currentNesting > maxNesting) maxNesting = currentNesting;

    // Count branches
    for (const pattern of patterns) {
      if (pattern.test(trimmed)) {
        cyclomatic++;
        cognitive += 1 + Math.max(0, currentNesting - 1); // Cognitive adds nesting penalty
      }
    }
  }

  if (cyclomatic > 10) details.push(`High cyclomatic complexity: ${cyclomatic} (recommended <10)`);
  if (cognitive > 15) details.push(`High cognitive complexity: ${cognitive} (hard to understand)`);
  if (maxNesting > 4) details.push(`Deep nesting: ${maxNesting} levels (recommended <4)`);

  return { cyclomatic, cognitive, nesting: maxNesting, details };
}

// ─── Language-specific rules ────────────────────────────────────

export function getLanguageRules(sym: Symbol, code: string, language: Language): LanguageIssue[] {
  switch (language) {
    case "csharp": return getCSharpRules(sym, code);
    case "typescript": case "javascript": return getTypeScriptRules(sym, code);
    case "python": return getPythonRules(sym, code);
    case "go": return getGoRules(sym, code);
    case "java": return getJavaRules(sym, code);
    case "swift": return getSwiftRules(sym, code);
    case "rust": return getRustRules(sym, code);
    default: return [];
  }
}

// ─── C# Rules ───────────────────────────────────────────────────

function getCSharpRules(sym: Symbol, code: string): LanguageIssue[] {
  const issues: LanguageIssue[] = [];

  // async without await
  if (code.includes("async ") && !code.includes("await ")) {
    issues.push({ rule: "csharp/async-without-await", severity: "major", message: `async method "${sym.name}" never uses await`, suggestion: "Remove async keyword or add await calls", category: "best-practice" });
  }

  // String concatenation in loops (potential performance)
  if (/for.*\{[\s\S]*?\+\s*=\s*"/.test(code) || /foreach.*\{[\s\S]*?\+\s*=\s*"/.test(code)) {
    issues.push({ rule: "csharp/string-concat-loop", severity: "minor", message: "String concatenation in loop — use StringBuilder", suggestion: "Replace += with StringBuilder.Append() for better performance", category: "performance" });
  }

  // Dispose pattern — IDisposable without using
  if (code.includes("new ") && (code.includes("SqlConnection") || code.includes("HttpClient") || code.includes("StreamReader")) && !code.includes("using ")) {
    issues.push({ rule: "csharp/missing-using-dispose", severity: "major", message: "Disposable object created without using statement", suggestion: "Wrap in 'using' block to ensure proper disposal", category: "resource-management" });
  }

  // Empty catch
  if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(code)) {
    issues.push({ rule: "csharp/empty-catch", severity: "major", message: "Empty catch block — silently swallowing exceptions", suggestion: "Log the exception or rethrow", category: "error-handling" });
  }

  // Magic numbers
  const magicNumbers = code.match(/[^0-9a-zA-Z_"']\d{2,}[^0-9a-zA-Z_"']/g);
  if (magicNumbers && magicNumbers.length > 3) {
    issues.push({ rule: "csharp/magic-numbers", severity: "info", message: `${magicNumbers.length} magic numbers found`, suggestion: "Extract to named constants", category: "readability" });
  }

  return issues;
}

// ─── TypeScript Rules ───────────────────────────────────────────

function getTypeScriptRules(sym: Symbol, code: string): LanguageIssue[] {
  const issues: LanguageIssue[] = [];

  // any type usage
  const anyCount = (code.match(/:\s*any\b/g) || []).length;
  if (anyCount > 0) {
    issues.push({ rule: "typescript/no-any", severity: "minor", message: `${anyCount} 'any' type usage(s) — defeats type safety`, suggestion: "Use specific types, generics, or 'unknown'", category: "type-safety" });
  }

  // Non-null assertion (!)
  const bangCount = (code.match(/!\./g) || []).length;
  if (bangCount > 3) {
    issues.push({ rule: "typescript/excessive-non-null", severity: "minor", message: `${bangCount} non-null assertions (!) — may hide null errors`, suggestion: "Use optional chaining (?.) or proper null checks", category: "type-safety" });
  }

  // console.log in production code
  if (code.includes("console.log") && !sym.filePath.includes("test") && !sym.filePath.includes("spec")) {
    issues.push({ rule: "typescript/no-console", severity: "info", message: "console.log found in production code", suggestion: "Use a proper logger", category: "best-practice" });
  }

  // Callback hell (nested callbacks)
  const callbackDepth = (code.match(/=>\s*\{[\s\S]*?=>\s*\{[\s\S]*?=>\s*\{/g) || []).length;
  if (callbackDepth > 0) {
    issues.push({ rule: "typescript/callback-hell", severity: "minor", message: "Deeply nested callbacks detected", suggestion: "Refactor to async/await or extract functions", category: "readability" });
  }

  return issues;
}

// ─── Python Rules ───────────────────────────────────────────────

function getPythonRules(sym: Symbol, code: string): LanguageIssue[] {
  const issues: LanguageIssue[] = [];

  // Bare except
  if (/except\s*:/.test(code)) {
    issues.push({ rule: "python/bare-except", severity: "major", message: "Bare 'except:' catches all exceptions including SystemExit", suggestion: "Use 'except Exception:' or specific exception types", category: "error-handling" });
  }

  // Mutable default argument
  if (/def\s+\w+\([^)]*=\s*(\[\]|\{\}|set\(\))/.test(code)) {
    issues.push({ rule: "python/mutable-default", severity: "major", message: "Mutable default argument — shared across calls", suggestion: "Use None as default and create inside function", category: "bug-risk" });
  }

  // Global variable usage
  if (/\bglobal\s+\w+/.test(code)) {
    issues.push({ rule: "python/global-variable", severity: "minor", message: "Global variable usage", suggestion: "Pass as parameter or use class attribute", category: "best-practice" });
  }

  // Star import
  if (/from\s+\S+\s+import\s+\*/.test(code)) {
    issues.push({ rule: "python/star-import", severity: "minor", message: "Star import pollutes namespace", suggestion: "Import specific names", category: "best-practice" });
  }

  return issues;
}

// ─── Go Rules ───────────────────────────────────────────────────

function getGoRules(sym: Symbol, code: string): LanguageIssue[] {
  const issues: LanguageIssue[] = [];

  // Error not checked
  if (/,\s*_\s*:?=\s*\w+\(/.test(code) || /,\s*err\s*:?=[\s\S]*?[^{]*\n\s*[^if]/.test(code)) {
    issues.push({ rule: "go/unchecked-error", severity: "major", message: "Error return value not checked", suggestion: "Always check error returns in Go", category: "error-handling" });
  }

  // Goroutine leak risk
  if (code.includes("go func") && !code.includes("context") && !code.includes("done")) {
    issues.push({ rule: "go/goroutine-leak", severity: "minor", message: "Goroutine without context/cancellation — potential leak", suggestion: "Pass context.Context for cancellation support", category: "resource-management" });
  }

  // Init function
  if (/func\s+init\s*\(\)/.test(code)) {
    issues.push({ rule: "go/init-function", severity: "info", message: "init() function — implicit initialization", suggestion: "Consider explicit initialization for better testability", category: "best-practice" });
  }

  return issues;
}

// ─── Java Rules ─────────────────────────────────────────────────

function getJavaRules(sym: Symbol, code: string): LanguageIssue[] {
  const issues: LanguageIssue[] = [];

  // Catching generic Exception
  if (/catch\s*\(\s*Exception\s+/.test(code)) {
    issues.push({ rule: "java/catch-generic", severity: "minor", message: "Catching generic Exception — too broad", suggestion: "Catch specific exception types", category: "error-handling" });
  }

  // System.out.println
  if (code.includes("System.out.print")) {
    issues.push({ rule: "java/system-out", severity: "info", message: "System.out.println in production code", suggestion: "Use SLF4J/Log4j logger", category: "best-practice" });
  }

  // Raw types (generics without type parameter)
  if (/\bList\s+\w+\s*=/.test(code) || /\bMap\s+\w+\s*=/.test(code)) {
    issues.push({ rule: "java/raw-type", severity: "minor", message: "Raw type usage — missing generic parameter", suggestion: "Use List<Type> instead of raw List", category: "type-safety" });
  }

  return issues;
}

// ─── Swift Rules ────────────────────────────────────────────────

function getSwiftRules(sym: Symbol, code: string): LanguageIssue[] {
  const issues: LanguageIssue[] = [];

  // Force unwrap
  const forceUnwraps = (code.match(/\w+!/g) || []).filter((m) => !m.startsWith("//")).length;
  if (forceUnwraps > 3) {
    issues.push({ rule: "swift/force-unwrap", severity: "minor", message: `${forceUnwraps} force unwraps (!) — crash risk`, suggestion: "Use if let, guard let, or nil coalescing (??)", category: "safety" });
  }

  // Retain cycle risk
  if (code.includes("self.") && code.includes("closure") && !code.includes("[weak self]") && !code.includes("[unowned self]")) {
    issues.push({ rule: "swift/retain-cycle", severity: "major", message: "Closure captures self without [weak self] — retain cycle risk", suggestion: "Add [weak self] or [unowned self] in closure capture list", category: "memory" });
  }

  return issues;
}

// ─── Rust Rules ─────────────────────────────────────────────────

function getRustRules(sym: Symbol, code: string): LanguageIssue[] {
  const issues: LanguageIssue[] = [];

  // unwrap() usage
  const unwrapCount = (code.match(/\.unwrap\(\)/g) || []).length;
  if (unwrapCount > 2) {
    issues.push({ rule: "rust/excessive-unwrap", severity: "minor", message: `${unwrapCount} .unwrap() calls — panic risk`, suggestion: "Use ? operator, match, or unwrap_or_else", category: "safety" });
  }

  // clone() overuse
  const cloneCount = (code.match(/\.clone\(\)/g) || []).length;
  if (cloneCount > 3) {
    issues.push({ rule: "rust/excessive-clone", severity: "info", message: `${cloneCount} .clone() calls — potential performance issue`, suggestion: "Consider borrowing or using references", category: "performance" });
  }

  return issues;
}
