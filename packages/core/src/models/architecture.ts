/**
 * ArchLens Architecture Model
 * All analysis results are normalized into this unified model.
 */

// ─── Core Identifiers ───────────────────────────────────────────────

export interface ArchId {
  /** Unique identifier (file:name or package:module:name) */
  uid: string;
  name: string;
  filePath: string;
  startLine?: number;
  endLine?: number;
}

// ─── Symbol Types ────────────────────────────────────────────────────

export type SymbolKind =
  | "function"
  | "class"
  | "interface"
  | "method"
  | "property"
  | "variable"
  | "module"
  | "enum"
  | "type_alias"
  | "component" // React/Angular/Vue
  | "route" // API endpoint
  | "table" // DB entity
  | "hook" // React hook
  | "decorator"; // Python/TS decorator

export interface Symbol extends ArchId {
  kind: SymbolKind;
  language: Language;
  visibility: "public" | "private" | "protected" | "internal";
  documentation?: string;
  annotations?: string[];
  /** For classes: parent class */
  extends?: string[];
  /** For classes: implemented interfaces */
  implements?: string[];
  /** For functions: parameter types */
  params?: ParamInfo[];
  /** For functions: return type */
  returnType?: string;
}

export interface ParamInfo {
  name: string;
  type?: string;
  optional?: boolean;
  defaultValue?: string;
}

// ─── Relationships ───────────────────────────────────────────────────

export type RelationType =
  | "imports"
  | "calls"
  | "extends"
  | "implements"
  | "uses_type"
  | "composes" // has-a
  | "emits" // event/signal
  | "subscribes" // listens to
  | "reads_from" // DB read
  | "writes_to" // DB write
  | "routes_to" // HTTP routing
  | "depends_on"; // generic dependency

export interface Relation {
  source: string; // uid
  target: string; // uid
  type: RelationType;
  weight?: number;
  metadata?: Record<string, unknown>;
}

// ─── Layers & Modules ────────────────────────────────────────────────

export type LayerType =
  | "presentation" // UI, views, components
  | "api" // REST/GraphQL endpoints
  | "application" // Use cases, services
  | "domain" // Business logic, models
  | "infrastructure" // DB, external services
  | "config" // Configuration
  | "test" // Test files
  | "unknown";

export interface Module {
  name: string;
  path: string;
  layer: LayerType;
  symbols: string[]; // uids
  dependencies: string[]; // module names
  language: Language;
  fileCount: number;
  lineCount: number;
}

// ─── Data Flow ───────────────────────────────────────────────────────

export interface DataFlow {
  id: string;
  name: string;
  description?: string;
  steps: DataFlowStep[];
}

export interface DataFlowStep {
  order: number;
  source: string; // uid or module name
  target: string;
  action: string; // "HTTP GET", "SQL SELECT", "transform", "render"
  dataType?: string;
}

// ─── API Map ─────────────────────────────────────────────────────────

export interface ApiEndpoint {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "WS";
  path: string;
  handler: string; // uid of handler function
  params?: ParamInfo[];
  requestBody?: string;
  responseType?: string;
  middleware?: string[];
  filePath: string;
  line: number;
}

// ─── Database / ER ───────────────────────────────────────────────────

export interface DbEntity {
  name: string;
  tableName?: string;
  filePath: string;
  columns: DbColumn[];
  relations: DbRelation[];
}

export interface DbColumn {
  name: string;
  type: string;
  primary?: boolean;
  nullable?: boolean;
  unique?: boolean;
  defaultValue?: string;
  references?: { table: string; column: string };
}

export interface DbRelation {
  type: "one-to-one" | "one-to-many" | "many-to-many";
  from: string;
  to: string;
  through?: string;
  foreignKey?: string;
}

// ─── Tech Radar ──────────────────────────────────────────────────────

export interface TechEntry {
  name: string;
  version?: string;
  category: "language" | "framework" | "library" | "tool" | "database" | "runtime";
  ring: "adopt" | "trial" | "assess" | "hold";
  source: string; // where detected (package.json, import, Dockerfile, etc.)
}

// ─── Language Support ────────────────────────────────────────────────

export type Language =
  | "typescript"
  | "javascript"
  | "python"
  | "java"
  | "go"
  | "rust"
  | "csharp"
  | "ruby"
  | "php"
  | "swift"
  | "kotlin"
  | "c"
  | "cpp"
  | "unknown";

// ─── The Complete Architecture Model ─────────────────────────────────

export interface ArchitectureModel {
  /** Project metadata */
  project: {
    name: string;
    rootPath: string;
    analyzedAt: string;
    version: string;
  };

  /** Statistics */
  stats: {
    files: number;
    symbols: number;
    relations: number;
    modules: number;
    languages: Record<Language, number>;
    totalLines: number;
  };

  /** All discovered symbols */
  symbols: Map<string, Symbol>;

  /** All relationships */
  relations: Relation[];

  /** Detected modules/packages */
  modules: Module[];

  /** Layer assignment */
  layers: Record<LayerType, string[]>; // module names per layer

  /** Data flows (detected execution paths) */
  dataFlows: DataFlow[];

  /** API endpoints */
  apiEndpoints: ApiEndpoint[];

  /** Database entities */
  dbEntities: DbEntity[];

  /** Technology stack */
  techRadar: TechEntry[];
}
