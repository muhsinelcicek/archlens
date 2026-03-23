export { BaseParser } from "./base-parser.js";
export type { ParseResult, ImportInfo, ParserOptions } from "./base-parser.js";
export { TypeScriptParser } from "./typescript-parser.js";
export { PythonParser } from "./python-parser.js";

import type { Language } from "../models/index.js";
import { BaseParser } from "./base-parser.js";
import { TypeScriptParser } from "./typescript-parser.js";
import { PythonParser } from "./python-parser.js";

const parsers: BaseParser[] = [new TypeScriptParser(), new PythonParser()];

export function getParserForFile(filePath: string): BaseParser | undefined {
  return parsers.find((p) => p.canParse(filePath));
}

export function getParserForLanguage(lang: Language): BaseParser | undefined {
  return parsers.find((p) => p.language === lang);
}

export function getSupportedExtensions(): string[] {
  return parsers.flatMap((p) => p.extensions);
}
