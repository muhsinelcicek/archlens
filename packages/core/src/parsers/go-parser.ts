import Parser from "tree-sitter";
import GoLang from "tree-sitter-go";
import type { Symbol, Relation, ApiEndpoint, DbEntity, ParamInfo } from "../models/index.js";
import { BaseParser, type ParseResult, type ImportInfo, type ParserOptions } from "./base-parser.js";

const goParser = new Parser();
goParser.setLanguage(GoLang as unknown as Parser.Language);

export class GoParser extends BaseParser {
  language = "go" as const;
  extensions = [".go"];

  parse(filePath: string, content: string, options: ParserOptions): ParseResult {
    const tree = goParser.parse(content);
    const symbols: Symbol[] = [];
    const relations: Relation[] = [];
    const apiEndpoints: ApiEndpoint[] = [];
    const dbEntities: DbEntity[] = [];
    const imports: ImportInfo[] = [];

    this.walkNode(tree.rootNode, filePath, symbols, relations, imports, apiEndpoints);
    return { symbols, relations, apiEndpoints, dbEntities, imports };
  }

  detectFrameworkPatterns(filePath: string, content: string) {
    const patterns: string[] = [];
    let framework: string | undefined;

    if (content.includes('"net/http"')) { framework = "net/http"; patterns.push("http-handler"); }
    if (content.includes('"github.com/gin-gonic/gin"')) { framework = "gin"; patterns.push("rest-api"); }
    if (content.includes('"github.com/labstack/echo"')) { framework = "echo"; patterns.push("rest-api"); }
    if (content.includes('"github.com/gofiber/fiber"')) { framework = "fiber"; patterns.push("rest-api"); }
    if (content.includes('"gorm.io/gorm"')) { patterns.push("orm-model"); }
    if (content.includes('"database/sql"')) { patterns.push("database"); }

    return { framework, patterns };
  }

  private walkNode(
    node: Parser.SyntaxNode,
    filePath: string,
    symbols: Symbol[],
    relations: Relation[],
    imports: ImportInfo[],
    apiEndpoints: ApiEndpoint[],
  ): void {
    switch (node.type) {
      case "import_declaration":
        this.extractImports(node, filePath, imports);
        break;

      case "function_declaration":
        this.extractFunction(node, filePath, symbols, apiEndpoints);
        break;

      case "method_declaration":
        this.extractMethod(node, filePath, symbols, relations);
        break;

      case "type_declaration":
        this.extractTypeDecl(node, filePath, symbols, relations);
        break;

      default:
        break;
    }

    for (const child of node.children) {
      this.walkNode(child, filePath, symbols, relations, imports, apiEndpoints);
    }
  }

  private extractImports(node: Parser.SyntaxNode, filePath: string, imports: ImportInfo[]): void {
    for (const child of node.children) {
      if (child.type === "import_spec") {
        const pathNode = child.children.find((c) => c.type === "interpreted_string_literal");
        if (!pathNode) continue;
        const modulePath = pathNode.text.replace(/"/g, "");
        const nameNode = child.children.find((c) => c.type === "package_identifier");
        const name = nameNode?.text || modulePath.split("/").pop() || modulePath;
        imports.push({ sourceFile: filePath, modulePath, names: [name] });
      }
      if (child.type === "import_spec_list") {
        for (const spec of child.children) {
          if (spec.type === "import_spec") {
            const pathNode = spec.children.find((c) => c.type === "interpreted_string_literal");
            if (!pathNode) continue;
            const modulePath = pathNode.text.replace(/"/g, "");
            const nameNode = spec.children.find((c) => c.type === "package_identifier");
            const name = nameNode?.text || modulePath.split("/").pop() || modulePath;
            imports.push({ sourceFile: filePath, modulePath, names: [name] });
          }
        }
      }
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
    const isExported = name[0] === name[0].toUpperCase() && /^[A-Z]/.test(name);

    symbols.push({
      uid: this.makeUid(filePath, name, "function"),
      name,
      filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      kind: "function",
      language: "go",
      visibility: isExported ? "public" : "private",
      params,
    });

    // Detect HTTP handler patterns: func(w http.ResponseWriter, r *http.Request)
    if (params.some((p) => p.type?.includes("ResponseWriter") || p.type?.includes("Context"))) {
      // This is likely an HTTP handler — framework detection will catch specific routes
    }
  }

  private extractMethod(
    node: Parser.SyntaxNode,
    filePath: string,
    symbols: Symbol[],
    relations: Relation[],
  ): void {
    const name = node.children.find((c) => c.type === "field_identifier")?.text;
    if (!name) return;

    // Get receiver type
    const paramList = node.children.find((c) => c.type === "parameter_list");
    let receiverType = "";
    if (paramList) {
      const firstParam = paramList.children.find((c) => c.type === "parameter_declaration");
      if (firstParam) {
        const typeNode = firstParam.children.find((c) =>
          c.type === "type_identifier" || c.type === "pointer_type",
        );
        if (typeNode) {
          receiverType = typeNode.text.replace(/^\*/, "");
        }
      }
    }

    const fullName = receiverType ? `${receiverType}.${name}` : name;
    const isExported = name[0] === name[0].toUpperCase();
    const uid = this.makeUid(filePath, fullName, "method");

    symbols.push({
      uid,
      name: fullName,
      filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      kind: "method",
      language: "go",
      visibility: isExported ? "public" : "private",
      params: this.extractParams(node),
    });

    // Link method to receiver type
    if (receiverType) {
      const structUid = this.makeUid(filePath, receiverType, "class");
      relations.push({ source: structUid, target: uid, type: "composes" });
    }
  }

  private extractTypeDecl(
    node: Parser.SyntaxNode,
    filePath: string,
    symbols: Symbol[],
    relations: Relation[],
  ): void {
    for (const child of node.children) {
      if (child.type !== "type_spec") continue;

      const name = child.children.find((c) => c.type === "type_identifier")?.text;
      if (!name) continue;

      const typeBody = child.children.find((c) =>
        c.type === "struct_type" || c.type === "interface_type",
      );

      const isExported = name[0] === name[0].toUpperCase();
      const kind = typeBody?.type === "interface_type" ? "interface" : "class";
      const uid = this.makeUid(filePath, name, kind);

      symbols.push({
        uid,
        name,
        filePath,
        startLine: child.startPosition.row + 1,
        endLine: child.endPosition.row + 1,
        kind: kind === "interface" ? "interface" : "class",
        language: "go",
        visibility: isExported ? "public" : "private",
      });

      // Extract struct fields and embedded types
      if (typeBody?.type === "struct_type") {
        const fieldList = typeBody.children.find((c) => c.type === "field_declaration_list");
        if (fieldList) {
          for (const field of fieldList.children) {
            if (field.type === "field_declaration") {
              // Check for embedded type (no field name, just type)
              const fieldName = field.children.find((c) => c.type === "field_identifier")?.text;
              const fieldType = field.children.find((c) => c.type === "type_identifier")?.text;

              if (!fieldName && fieldType) {
                // Embedded type — Go's composition
                relations.push({ source: uid, target: fieldType, type: "extends" });
              }
            }
          }
        }
      }
    }
  }

  private extractParams(node: Parser.SyntaxNode): ParamInfo[] {
    const params: ParamInfo[] = [];
    const paramLists = node.children.filter((c) => c.type === "parameter_list");
    const funcParams = paramLists.length > 1 ? paramLists[1] : paramLists[0];
    if (!funcParams) return params;

    for (const param of funcParams.children) {
      if (param.type === "parameter_declaration") {
        const name = param.children.find((c) => c.type === "identifier")?.text;
        const type = param.children.find((c) =>
          c.type === "type_identifier" || c.type === "pointer_type" ||
          c.type === "qualified_type" || c.type === "slice_type" ||
          c.type === "map_type" || c.type === "interface_type",
        )?.text;
        if (name) params.push({ name, type });
      }
    }

    return params;
  }
}
