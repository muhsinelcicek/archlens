import Parser from "tree-sitter";
import Python from "tree-sitter-python";
import type { Symbol, Relation, ApiEndpoint, DbEntity, ParamInfo } from "../models/index.js";
import { BaseParser, type ParseResult, type ImportInfo, type ParserOptions } from "./base-parser.js";

const pyParser = new Parser();
pyParser.setLanguage(Python as unknown as Parser.Language);

export class PythonParser extends BaseParser {
  language = "python" as const;
  extensions = [".py"];

  parse(filePath: string, content: string, options: ParserOptions): ParseResult {
    const tree = pyParser.parse(content);

    const symbols: Symbol[] = [];
    const relations: Relation[] = [];
    const apiEndpoints: ApiEndpoint[] = [];
    const dbEntities: DbEntity[] = [];
    const imports: ImportInfo[] = [];

    this.walkNode(tree.rootNode, filePath, symbols, relations, imports, apiEndpoints, dbEntities);

    return { symbols, relations, apiEndpoints, dbEntities, imports };
  }

  detectFrameworkPatterns(filePath: string, content: string) {
    const patterns: string[] = [];
    let framework: string | undefined;

    // FastAPI
    if (content.includes("from fastapi") || content.includes("import fastapi")) {
      framework = "fastapi";
      if (/@app\.(get|post|put|delete|patch)/.test(content)) patterns.push("rest-api");
      if (content.includes("APIRouter")) patterns.push("router");
    }

    // Django
    if (content.includes("from django") || content.includes("import django")) {
      framework = "django";
      if (content.includes("class Meta:")) patterns.push("model");
      if (content.includes("def get(") || content.includes("def post(")) patterns.push("view");
    }

    // Flask
    if (content.includes("from flask") || content.includes("import flask")) {
      framework = "flask";
      if (/@app\.route/.test(content)) patterns.push("rest-api");
    }

    // SQLAlchemy
    if (content.includes("from sqlalchemy") || content.includes("Column(")) {
      patterns.push("orm-model");
    }

    // Pydantic
    if (content.includes("BaseModel") && content.includes("from pydantic")) {
      patterns.push("pydantic-model");
    }

    return { framework, patterns };
  }

  private walkNode(
    node: Parser.SyntaxNode,
    filePath: string,
    symbols: Symbol[],
    relations: Relation[],
    imports: ImportInfo[],
    apiEndpoints: ApiEndpoint[],
    dbEntities: DbEntity[],
  ): void {
    switch (node.type) {
      case "import_statement":
      case "import_from_statement":
        this.extractImport(node, filePath, imports);
        break;

      case "function_definition":
        this.extractFunction(node, filePath, symbols, apiEndpoints);
        break;

      case "class_definition":
        this.extractClass(node, filePath, symbols, relations, dbEntities);
        break;

      case "decorated_definition":
        // Handle decorated functions/classes
        for (const child of node.children) {
          this.walkNode(child, filePath, symbols, relations, imports, apiEndpoints, dbEntities);
        }
        return;

      default:
        break;
    }

    for (const child of node.children) {
      this.walkNode(child, filePath, symbols, relations, imports, apiEndpoints, dbEntities);
    }
  }

  private extractImport(node: Parser.SyntaxNode, filePath: string, imports: ImportInfo[]): void {
    if (node.type === "import_statement") {
      // import foo, import foo.bar
      const moduleName = node.children
        .filter((c) => c.type === "dotted_name")
        .map((c) => c.text);
      for (const mod of moduleName) {
        imports.push({ sourceFile: filePath, modulePath: mod, names: [mod.split(".").pop()!] });
      }
    } else if (node.type === "import_from_statement") {
      // from foo import bar, baz
      const module = node.children.find((c) => c.type === "dotted_name" || c.type === "relative_import")?.text;
      if (!module) return;

      const names: string[] = [];
      for (const child of node.children) {
        if (child.type === "dotted_name" && child !== node.children.find((c) => c.type === "dotted_name")) {
          names.push(child.text);
        }
        if (child.type === "import_prefix") continue;
        if (child.type === "identifier") names.push(child.text);
      }

      // Named imports from import list
      const importList = node.children.find((c) => c.type === "import_list");
      if (importList) {
        for (const spec of importList.children) {
          if (spec.type === "dotted_name" || spec.type === "identifier") {
            names.push(spec.text);
          }
        }
      }

      imports.push({ sourceFile: filePath, modulePath: module, names });
    }
  }

  private extractFunction(
    node: Parser.SyntaxNode,
    filePath: string,
    symbols: Symbol[],
    apiEndpoints: ApiEndpoint[],
  ): void {
    const name = node.children.find((c) => c.type === "identifier")?.text;
    if (!name) return;

    const params = this.extractParams(node);
    const returnType = node.children.find((c) => c.type === "type")?.text;

    // Check for decorators (FastAPI routes, etc.)
    const decorators = this.getDecorators(node);
    const routeDecorator = decorators.find((d) =>
      /^@(app|router)\.(get|post|put|delete|patch)/.test(d),
    );

    if (routeDecorator) {
      const methodMatch = routeDecorator.match(/\.(get|post|put|delete|patch)\s*\(\s*["']([^"']+)/);
      if (methodMatch) {
        apiEndpoints.push({
          method: methodMatch[1].toUpperCase() as ApiEndpoint["method"],
          path: methodMatch[2],
          handler: this.makeUid(filePath, name, "function"),
          params,
          filePath,
          line: node.startPosition.row + 1,
        });
      }
    }

    symbols.push({
      uid: this.makeUid(filePath, name, "function"),
      name,
      filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      kind: "function",
      language: "python",
      visibility: name.startsWith("_") ? (name.startsWith("__") ? "private" : "protected") : "public",
      params,
      returnType,
      annotations: decorators.length > 0 ? decorators : undefined,
    });
  }

  private extractClass(
    node: Parser.SyntaxNode,
    filePath: string,
    symbols: Symbol[],
    relations: Relation[],
    dbEntities: DbEntity[],
  ): void {
    const name = node.children.find((c) => c.type === "identifier")?.text;
    if (!name) return;

    const uid = this.makeUid(filePath, name, "class");
    const extendsList: string[] = [];

    // Extract base classes
    const argList = node.children.find((c) => c.type === "argument_list");
    if (argList) {
      for (const arg of argList.children) {
        if (arg.type === "identifier" || arg.type === "attribute") {
          extendsList.push(arg.text);
          relations.push({ source: uid, target: arg.text, type: "extends" });
        }
      }
    }

    // Detect SQLAlchemy model
    const isSqlAlchemyModel = extendsList.some((base) =>
      ["Base", "Model", "DeclarativeBase"].includes(base),
    );

    if (isSqlAlchemyModel) {
      this.extractDbEntity(node, filePath, name, dbEntities);
    }

    const decorators = this.getDecorators(node);

    symbols.push({
      uid,
      name,
      filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      kind: "class",
      language: "python",
      visibility: name.startsWith("_") ? "private" : "public",
      extends: extendsList.length > 0 ? extendsList : undefined,
      annotations: decorators.length > 0 ? decorators : undefined,
    });

    // Extract methods
    const body = node.children.find((c) => c.type === "block");
    if (body) {
      for (const child of body.children) {
        const funcNode = child.type === "decorated_definition"
          ? child.children.find((c) => c.type === "function_definition")
          : child.type === "function_definition"
            ? child
            : undefined;

        if (funcNode) {
          const methodName = funcNode.children.find((c) => c.type === "identifier")?.text;
          if (methodName) {
            const methodUid = this.makeUid(filePath, `${name}.${methodName}`, "method");
            symbols.push({
              uid: methodUid,
              name: `${name}.${methodName}`,
              filePath,
              startLine: funcNode.startPosition.row + 1,
              endLine: funcNode.endPosition.row + 1,
              kind: "method",
              language: "python",
              visibility: methodName.startsWith("_") ? "private" : "public",
              params: this.extractParams(funcNode),
            });
            relations.push({ source: uid, target: methodUid, type: "composes" });
          }
        }
      }
    }
  }

  private extractDbEntity(
    node: Parser.SyntaxNode,
    filePath: string,
    className: string,
    dbEntities: DbEntity[],
  ): void {
    const columns: DbEntity["columns"] = [];
    const body = node.children.find((c) => c.type === "block");
    if (!body) return;

    let tableName = className.toLowerCase() + "s";

    for (const stmt of body.children) {
      if (stmt.type === "expression_statement") {
        const assignment = stmt.children.find((c) => c.type === "assignment");
        if (!assignment) continue;

        const left = assignment.children[0]?.text;
        const right = assignment.children.find((c) => c.type === "call" || c.type === "string")?.text;

        if (left === "__tablename__" && right) {
          tableName = right.replace(/['"]/g, "");
          continue;
        }

        // Column(...) detection
        if (right?.includes("Column(") || right?.includes("mapped_column(")) {
          columns.push({
            name: left ?? "unknown",
            type: this.extractColumnType(right),
            primary: right.includes("primary_key=True") || right.includes("primary_key: true"),
            nullable: !right.includes("nullable=False"),
          });
        }
      }
    }

    if (columns.length > 0) {
      dbEntities.push({ name: className, tableName, filePath, columns, relations: [] });
    }
  }

  private extractColumnType(text: string): string {
    const match = text.match(/Column\s*\(\s*(\w+)/);
    if (match) return match[1];
    const mappedMatch = text.match(/mapped_column\s*\(\s*(\w+)/);
    if (mappedMatch) return mappedMatch[1];
    return "unknown";
  }

  private extractParams(node: Parser.SyntaxNode): ParamInfo[] {
    const params: ParamInfo[] = [];
    const paramList = node.children.find((c) => c.type === "parameters");
    if (!paramList) return params;

    for (const param of paramList.children) {
      if (param.type === "identifier" && param.text !== "self" && param.text !== "cls") {
        params.push({ name: param.text });
      }
      if (param.type === "typed_parameter") {
        const name = param.children.find((c) => c.type === "identifier")?.text;
        const type = param.children.find((c) => c.type === "type")?.text;
        if (name && name !== "self" && name !== "cls") {
          params.push({ name, type });
        }
      }
      if (param.type === "default_parameter" || param.type === "typed_default_parameter") {
        const name = param.children.find((c) => c.type === "identifier")?.text;
        if (name && name !== "self" && name !== "cls") {
          params.push({ name, optional: true });
        }
      }
    }

    return params;
  }

  private getDecorators(node: Parser.SyntaxNode): string[] {
    const decorators: string[] = [];
    const parent = node.parent;
    if (parent?.type === "decorated_definition") {
      for (const child of parent.children) {
        if (child.type === "decorator") {
          decorators.push(child.text);
        }
      }
    }
    return decorators;
  }
}
