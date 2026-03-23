import type { Language, Symbol, Relation, ApiEndpoint, DbEntity } from "../models/index.js";

/**
 * Base parser interface — every language parser implements this.
 * Tree-sitter does the heavy lifting; parsers extract semantic meaning.
 */
export interface ParseResult {
  symbols: Symbol[];
  relations: Relation[];
  apiEndpoints: ApiEndpoint[];
  dbEntities: DbEntity[];
  imports: ImportInfo[];
}

export interface ImportInfo {
  /** The file doing the importing */
  sourceFile: string;
  /** What is imported (module path or package) */
  modulePath: string;
  /** Named imports */
  names: string[];
  /** Is it a re-export? */
  isReExport?: boolean;
}

export interface ParserOptions {
  /** Project root for resolving relative imports */
  rootDir: string;
  /** Include test files */
  includeTests?: boolean;
}

export abstract class BaseParser {
  abstract language: Language;
  abstract extensions: string[];

  /**
   * Check if this parser can handle the given file
   */
  canParse(filePath: string): boolean {
    return this.extensions.some((ext) => filePath.endsWith(ext));
  }

  /**
   * Parse a single file and extract architectural information
   */
  abstract parse(filePath: string, content: string, options: ParserOptions): ParseResult;

  /**
   * Detect framework-specific patterns (e.g., React components, FastAPI routes)
   */
  abstract detectFrameworkPatterns(
    filePath: string,
    content: string,
  ): {
    framework?: string;
    patterns: string[];
  };

  /**
   * Helper: generate a unique ID for a symbol
   */
  protected makeUid(filePath: string, name: string, kind?: string): string {
    const prefix = kind ? `${kind}:` : "";
    return `${prefix}${filePath}:${name}`;
  }
}
