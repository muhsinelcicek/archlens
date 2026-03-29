import Parser from "tree-sitter";
import CSharp from "tree-sitter-c-sharp";
import type { Symbol, Relation, ApiEndpoint, DbEntity, ParamInfo } from "../models/index.js";
import { BaseParser, type ParseResult, type ImportInfo, type ParserOptions } from "./base-parser.js";

const csParser = new Parser();
csParser.setLanguage(CSharp as unknown as Parser.Language);

export class CSharpParser extends BaseParser {
  language = "csharp" as const;
  extensions = [".cs"];

  parse(filePath: string, content: string, options: ParserOptions): ParseResult {
    const tree = csParser.parse(content);
    const symbols: Symbol[] = [];
    const relations: Relation[] = [];
    const apiEndpoints: ApiEndpoint[] = [];
    const dbEntities: DbEntity[] = [];
    const imports: ImportInfo[] = [];

    this.walkNode(tree.rootNode, filePath, symbols, relations, imports, apiEndpoints, dbEntities);

    // Post-process: find entity classes by inheritance or attributes
    // (DbSet only captures names — we need columns from the actual class)
    for (const sym of symbols) {
      if (sym.kind !== "class") continue;
      const isEntity = sym.extends?.some((e) => ["Entity", "BaseEntity", "AggregateRoot", "IAggregateRoot", "ValueObject"].includes(e))
        || sym.annotations?.some((a) => a.includes("Table") || a.includes("Entity"));
      const isDbSetEntity = dbEntities.some((e) => e.name === sym.name);

      if (isEntity || isDbSetEntity) {
        // Extract properties as columns
        const columns: DbEntity["columns"] = [];
        for (const propSym of symbols) {
          if (propSym.kind !== "property") continue;
          if (!propSym.name.startsWith(sym.name + ".")) continue;
          const propName = propSym.name.split(".").pop() || "";
          // Skip navigation properties (collections, complex types)
          if (propName.startsWith("_")) continue;
          const isPk = propName === "Id" || propName === sym.name + "Id" || propSym.annotations?.some((a) => a.includes("Key"));
          columns.push({
            name: propName,
            type: propSym.returnType || "unknown",
            primary: isPk,
            nullable: true,
          });
        }

        // Update existing or add new entity
        const existing = dbEntities.find((e) => e.name === sym.name);
        if (existing) {
          existing.columns = columns;
          existing.filePath = filePath;
        } else if (columns.length > 0) {
          dbEntities.push({
            name: sym.name,
            tableName: sym.name.toLowerCase() + "s",
            filePath,
            columns,
            relations: [],
          });
        }
      }
    }

    return { symbols, relations, apiEndpoints, dbEntities, imports };
  }

  detectFrameworkPatterns(filePath: string, content: string) {
    const patterns: string[] = [];
    let framework: string | undefined;

    if (content.includes("[ApiController]") || content.includes("[HttpGet]")) {
      framework = "aspnet-core"; patterns.push("rest-api");
    }
    if (content.includes("DbContext") || content.includes("DbSet<")) {
      patterns.push("ef-core");
    }
    if (content.includes("IHostedService") || content.includes("BackgroundService")) {
      patterns.push("background-service");
    }
    if (content.includes("MediatR") || content.includes("IRequest")) {
      patterns.push("cqrs");
    }
    if (content.includes("[Authorize]")) { patterns.push("auth"); }

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
      case "using_directive":
        this.extractUsing(node, filePath, imports);
        break;
      case "class_declaration":
        this.extractClass(node, filePath, symbols, relations, apiEndpoints, dbEntities);
        break;
      case "interface_declaration":
        this.extractInterface(node, filePath, symbols);
        break;
      case "enum_declaration":
        this.extractEnum(node, filePath, symbols);
        break;
      case "record_declaration":
        this.extractRecord(node, filePath, symbols);
        break;
      default:
        break;
    }

    for (const child of node.children) {
      this.walkNode(child, filePath, symbols, relations, imports, apiEndpoints, dbEntities);
    }
  }

  private extractUsing(node: Parser.SyntaxNode, filePath: string, imports: ImportInfo[]): void {
    const nameNode = node.children.find((c) => c.type === "qualified_name" || c.type === "identifier");
    if (!nameNode) return;
    const modulePath = nameNode.text;
    const name = modulePath.split(".").pop() || modulePath;
    imports.push({ sourceFile: filePath, modulePath, names: [name] });
  }

  private extractClass(
    node: Parser.SyntaxNode,
    filePath: string,
    symbols: Symbol[],
    relations: Relation[],
    apiEndpoints: ApiEndpoint[],
    dbEntities: DbEntity[],
  ): void {
    const name = node.children.find((c) => c.type === "identifier")?.text;
    if (!name) return;

    const uid = this.makeUid(filePath, name, "class");
    const visibility = this.getVisibility(node);
    const attributes = this.getAttributes(node);
    const extendsList: string[] = [];
    const implementsList: string[] = [];

    // Base list (inheritance)
    const baseList = node.children.find((c) => c.type === "base_list");
    if (baseList) {
      for (const child of baseList.children) {
        if (child.type === "identifier" || child.type === "generic_name") {
          const baseName = child.text;
          if (baseName.startsWith("I") && baseName[1] === baseName[1]?.toUpperCase()) {
            implementsList.push(baseName);
            relations.push({ source: uid, target: baseName, type: "implements" });
          } else {
            extendsList.push(baseName);
            relations.push({ source: uid, target: baseName, type: "extends" });
          }
        }
      }
    }

    // Detect EF Core DbContext
    const isDbContext = extendsList.includes("DbContext");
    if (isDbContext) {
      this.extractEfDbContext(node, filePath, name, dbEntities);
    }

    // Class-level route
    const routeAttr = attributes.find((a) => a.includes("[Route(") || a.includes("[ApiController]"));
    const classRoute = this.extractRouteFromAttribute(attributes, name);

    symbols.push({
      uid,
      name,
      filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      kind: "class",
      language: "csharp",
      visibility,
      extends: extendsList.length > 0 ? extendsList : undefined,
      implements: implementsList.length > 0 ? implementsList : undefined,
      annotations: attributes.length > 0 ? attributes : undefined,
    });

    // Extract methods
    const body = node.children.find((c) => c.type === "declaration_list");
    if (body) {
      for (const member of body.children) {
        if (member.type === "method_declaration") {
          this.extractMethod(member, filePath, name, uid, classRoute, symbols, relations, apiEndpoints);
        }
        if (member.type === "property_declaration") {
          this.extractProperty(member, filePath, name, uid, symbols, relations);
        }
      }
    }
  }

  private extractInterface(node: Parser.SyntaxNode, filePath: string, symbols: Symbol[]): void {
    const name = node.children.find((c) => c.type === "identifier")?.text;
    if (!name) return;

    symbols.push({
      uid: this.makeUid(filePath, name, "interface"),
      name,
      filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      kind: "interface",
      language: "csharp",
      visibility: this.getVisibility(node),
    });
  }

  private extractEnum(node: Parser.SyntaxNode, filePath: string, symbols: Symbol[]): void {
    const name = node.children.find((c) => c.type === "identifier")?.text;
    if (!name) return;

    symbols.push({
      uid: this.makeUid(filePath, name, "enum"),
      name,
      filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      kind: "enum",
      language: "csharp",
      visibility: this.getVisibility(node),
    });
  }

  private extractRecord(node: Parser.SyntaxNode, filePath: string, symbols: Symbol[]): void {
    const name = node.children.find((c) => c.type === "identifier")?.text;
    if (!name) return;

    symbols.push({
      uid: this.makeUid(filePath, name, "class"),
      name,
      filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      kind: "class",
      language: "csharp",
      visibility: this.getVisibility(node),
    });
  }

  private extractMethod(
    node: Parser.SyntaxNode,
    filePath: string,
    className: string,
    classUid: string,
    classRoute: string,
    symbols: Symbol[],
    relations: Relation[],
    apiEndpoints: ApiEndpoint[],
  ): void {
    const name = node.children.find((c) => c.type === "identifier")?.text;
    if (!name) return;

    const fullName = `${className}.${name}`;
    const uid = this.makeUid(filePath, fullName, "method");
    const params = this.extractParams(node);
    const returnType = node.children.find((c) =>
      c.type === "predefined_type" || c.type === "identifier" || c.type === "generic_name",
    )?.text;
    const attributes = this.getAttributes(node);

    symbols.push({
      uid,
      name: fullName,
      filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      kind: "method",
      language: "csharp",
      visibility: this.getVisibility(node),
      params,
      returnType,
      annotations: attributes.length > 0 ? attributes : undefined,
    });

    relations.push({ source: classUid, target: uid, type: "composes" });

    // ASP.NET Core endpoint detection
    const httpMethods: Record<string, string> = {
      "[HttpGet": "GET", "[HttpPost": "POST", "[HttpPut": "PUT",
      "[HttpDelete": "DELETE", "[HttpPatch": "PATCH",
    };

    for (const attr of attributes) {
      for (const [prefix, method] of Object.entries(httpMethods)) {
        if (attr.startsWith(prefix)) {
          const pathMatch = attr.match(/\("([^"]+)"\)/);
          const methodPath = pathMatch ? pathMatch[1] : "";
          let fullPath = (classRoute + "/" + methodPath).replace(/\/+/g, "/").replace(/\/$/, "");
          // Resolve {action} placeholder
          fullPath = fullPath.replace("{action}", name?.toLowerCase() || "");
          // Fallback: if path is empty, derive from controller+method name
          if (!fullPath || fullPath === "/") {
            const controllerPart = className.replace(/Controller$/, "").toLowerCase();
            const methodPart = name?.toLowerCase() || "index";
            fullPath = `/${controllerPart}/${methodPart}`;
          }

          apiEndpoints.push({
            method: method as ApiEndpoint["method"],
            path: fullPath,
            handler: uid,
            params,
            filePath,
            line: node.startPosition.row + 1,
          });
          break;
        }
      }
    }
  }

  private extractProperty(
    node: Parser.SyntaxNode,
    filePath: string,
    className: string,
    classUid: string,
    symbols: Symbol[],
    relations: Relation[],
  ): void {
    const name = node.children.find((c) => c.type === "identifier")?.text;
    if (!name) return;

    const fullName = `${className}.${name}`;
    const uid = this.makeUid(filePath, fullName, "property");
    const propType = node.children.find((c) =>
      c.type === "predefined_type" || c.type === "nullable_type" || c.type === "generic_name" ||
      (c.type === "identifier" && c.text !== name && c.text !== "get" && c.text !== "set"),
    )?.text;
    const attributes = this.getAttributes(node);

    symbols.push({
      uid,
      name: fullName,
      filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      kind: "property",
      language: "csharp",
      visibility: this.getVisibility(node),
      returnType: propType,
      annotations: attributes.length > 0 ? attributes : undefined,
    });

    relations.push({ source: classUid, target: uid, type: "composes" });
  }

  private extractEfDbContext(
    node: Parser.SyntaxNode,
    filePath: string,
    className: string,
    dbEntities: DbEntity[],
  ): void {
    const body = node.children.find((c) => c.type === "declaration_list");
    if (!body) return;

    for (const member of body.children) {
      if (member.type === "property_declaration") {
        const propType = member.text;
        const dbSetMatch = propType.match(/DbSet<(\w+)>/);
        if (dbSetMatch) {
          const entityName = dbSetMatch[1];
          dbEntities.push({
            name: entityName,
            tableName: entityName.toLowerCase() + "s",
            filePath,
            columns: [],
            relations: [],
          });
        }
      }
    }
  }

  private extractParams(node: Parser.SyntaxNode): ParamInfo[] {
    const params: ParamInfo[] = [];
    const paramList = node.children.find((c) => c.type === "parameter_list");
    if (!paramList) return params;

    for (const param of paramList.children) {
      if (param.type === "parameter") {
        const name = param.children.find((c) => c.type === "identifier")?.text;
        const type = param.children.find((c) =>
          c.type === "predefined_type" || c.type === "identifier" || c.type === "generic_name" || c.type === "nullable_type",
        )?.text;
        if (name) params.push({ name, type });
      }
    }
    return params;
  }

  private getVisibility(node: Parser.SyntaxNode): "public" | "private" | "protected" | "internal" {
    for (const child of node.children) {
      if (child.type === "modifier") {
        if (child.text === "public") return "public";
        if (child.text === "private") return "private";
        if (child.text === "protected") return "protected";
        if (child.text === "internal") return "internal";
      }
    }
    return "internal";
  }

  private getAttributes(node: Parser.SyntaxNode): string[] {
    const attrs: string[] = [];
    for (const child of node.children) {
      if (child.type === "attribute_list") {
        for (const attr of child.children) {
          if (attr.type === "attribute") {
            attrs.push(`[${attr.text}]`);
          }
        }
      }
    }
    return attrs;
  }

  private extractRouteFromAttribute(attrs: string[], className?: string): string {
    for (const attr of attrs) {
      const routeMatch = attr.match(/\[Route\("([^"]+)"\)/);
      if (routeMatch) {
        let route = routeMatch[1];
        // Resolve ASP.NET convention placeholders
        const controllerName = (className || "").replace(/Controller$/, "");
        route = route.replace("[controller]", controllerName.toLowerCase());
        route = route.replace("[action]", "{action}");
        return route;
      }
    }
    // Check for [ApiController] + class name convention
    if (attrs.some((a) => a.includes("ApiController")) && className) {
      const controllerName = className.replace(/Controller$/, "");
      return `/api/${controllerName.toLowerCase()}`;
    }
    return "";
  }
}
