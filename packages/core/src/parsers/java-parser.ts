import Parser from "tree-sitter";
import Java from "tree-sitter-java";
import type { Symbol, Relation, ApiEndpoint, DbEntity, ParamInfo } from "../models/index.js";
import { BaseParser, type ParseResult, type ImportInfo, type ParserOptions } from "./base-parser.js";

const javaParser = new Parser();
javaParser.setLanguage(Java as unknown as Parser.Language);

export class JavaParser extends BaseParser {
  language = "java" as const;
  extensions = [".java"];

  parse(filePath: string, content: string, options: ParserOptions): ParseResult {
    const tree = javaParser.parse(content);
    const symbols: Symbol[] = [];
    const relations: Relation[] = [];
    const apiEndpoints: ApiEndpoint[] = [];
    const dbEntities: DbEntity[] = [];
    const imports: ImportInfo[] = [];

    // Extract class-level request mapping prefix
    const classMapping = this.extractClassMapping(tree.rootNode);

    this.walkNode(tree.rootNode, filePath, symbols, relations, imports, apiEndpoints, dbEntities, classMapping);
    return { symbols, relations, apiEndpoints, dbEntities, imports };
  }

  detectFrameworkPatterns(filePath: string, content: string) {
    const patterns: string[] = [];
    let framework: string | undefined;

    if (content.includes("@SpringBootApplication") || content.includes("@RestController")) {
      framework = "spring-boot";
      if (content.includes("@RestController")) patterns.push("rest-api");
      if (content.includes("@Service")) patterns.push("service");
      if (content.includes("@Repository")) patterns.push("repository");
    }
    if (content.includes("@Entity")) patterns.push("jpa-entity");
    if (content.includes("@Controller") && !content.includes("@RestController")) {
      framework = framework || "spring-mvc";
      patterns.push("mvc-controller");
    }
    if (content.includes("import javax.ws.rs")) {
      framework = "jax-rs";
      patterns.push("rest-api");
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
    classMapping: string,
  ): void {
    switch (node.type) {
      case "import_declaration":
        this.extractImport(node, filePath, imports);
        break;

      case "class_declaration":
        this.extractClass(node, filePath, symbols, relations, apiEndpoints, dbEntities, classMapping);
        break;

      case "interface_declaration":
        this.extractInterface(node, filePath, symbols, relations);
        break;

      case "enum_declaration":
        this.extractEnum(node, filePath, symbols);
        break;

      default:
        break;
    }

    for (const child of node.children) {
      this.walkNode(child, filePath, symbols, relations, imports, apiEndpoints, dbEntities, classMapping);
    }
  }

  private extractImport(node: Parser.SyntaxNode, filePath: string, imports: ImportInfo[]): void {
    const scopedId = node.children.find((c) => c.type === "scoped_identifier");
    if (!scopedId) return;

    const fullPath = scopedId.text;
    const name = fullPath.split(".").pop() || fullPath;
    imports.push({ sourceFile: filePath, modulePath: fullPath, names: [name] });
  }

  private extractClass(
    node: Parser.SyntaxNode,
    filePath: string,
    symbols: Symbol[],
    relations: Relation[],
    apiEndpoints: ApiEndpoint[],
    dbEntities: DbEntity[],
    classMapping: string,
  ): void {
    const name = node.children.find((c) => c.type === "identifier")?.text;
    if (!name) return;

    const uid = this.makeUid(filePath, name, "class");
    const visibility = this.getVisibility(node);
    const annotations = this.getAnnotations(node);
    const extendsList: string[] = [];
    const implementsList: string[] = [];

    // Superclass
    const superclass = node.children.find((c) => c.type === "superclass");
    if (superclass) {
      const parentName = superclass.children.find((c) => c.type === "type_identifier")?.text;
      if (parentName) {
        extendsList.push(parentName);
        relations.push({ source: uid, target: parentName, type: "extends" });
      }
    }

    // Interfaces
    const superInterfaces = node.children.find((c) => c.type === "super_interfaces");
    if (superInterfaces) {
      for (const child of superInterfaces.children) {
        if (child.type === "type_identifier") {
          implementsList.push(child.text);
          relations.push({ source: uid, target: child.text, type: "implements" });
        }
      }
    }

    // Detect JPA Entity
    const isEntity = annotations.some((a) => a.includes("@Entity"));
    if (isEntity) {
      this.extractJpaEntity(node, filePath, name, annotations, dbEntities);
    }

    // Get class-level @RequestMapping
    const classMappingAnnotation = annotations.find((a) => a.includes("@RequestMapping"));
    const mappingPath = classMapping || this.extractMappingPath(classMappingAnnotation || "");

    symbols.push({
      uid,
      name,
      filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      kind: "class",
      language: "java",
      visibility,
      extends: extendsList.length > 0 ? extendsList : undefined,
      implements: implementsList.length > 0 ? implementsList : undefined,
      annotations: annotations.length > 0 ? annotations : undefined,
    });

    // Extract methods
    const body = node.children.find((c) => c.type === "class_body");
    if (body) {
      for (const member of body.children) {
        if (member.type === "method_declaration") {
          this.extractMethod(member, filePath, name, uid, symbols, relations, apiEndpoints, mappingPath);
        }
      }
    }
  }

  private extractInterface(
    node: Parser.SyntaxNode,
    filePath: string,
    symbols: Symbol[],
    relations: Relation[],
  ): void {
    const name = node.children.find((c) => c.type === "identifier")?.text;
    if (!name) return;

    const uid = this.makeUid(filePath, name, "interface");
    symbols.push({
      uid,
      name,
      filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      kind: "interface",
      language: "java",
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
      language: "java",
      visibility: this.getVisibility(node),
    });
  }

  private extractMethod(
    node: Parser.SyntaxNode,
    filePath: string,
    className: string,
    classUid: string,
    symbols: Symbol[],
    relations: Relation[],
    apiEndpoints: ApiEndpoint[],
    classMapping: string,
  ): void {
    const name = node.children.find((c) => c.type === "identifier")?.text;
    if (!name) return;

    const fullName = `${className}.${name}`;
    const uid = this.makeUid(filePath, fullName, "method");
    const params = this.extractParams(node);
    const returnType = node.children.find((c) =>
      c.type === "type_identifier" || c.type === "void_type" || c.type === "generic_type",
    )?.text;
    const annotations = this.getAnnotations(node);

    symbols.push({
      uid,
      name: fullName,
      filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      kind: "method",
      language: "java",
      visibility: this.getVisibility(node),
      params,
      returnType,
      annotations: annotations.length > 0 ? annotations : undefined,
    });

    relations.push({ source: classUid, target: uid, type: "composes" });

    // Detect Spring API endpoints
    const httpMethods: Record<string, string> = {
      "@GetMapping": "GET",
      "@PostMapping": "POST",
      "@PutMapping": "PUT",
      "@DeleteMapping": "DELETE",
      "@PatchMapping": "PATCH",
      "@RequestMapping": "GET", // default
    };

    for (const annotation of annotations) {
      for (const [annotName, httpMethod] of Object.entries(httpMethods)) {
        if (annotation.includes(annotName)) {
          const methodPath = this.extractMappingPath(annotation);
          const fullPath = (classMapping + methodPath).replace(/\/+/g, "/") || "/";

          let method = httpMethod;
          if (annotName === "@RequestMapping") {
            if (annotation.includes("POST")) method = "POST";
            else if (annotation.includes("PUT")) method = "PUT";
            else if (annotation.includes("DELETE")) method = "DELETE";
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

  private extractJpaEntity(
    node: Parser.SyntaxNode,
    filePath: string,
    className: string,
    annotations: string[],
    dbEntities: DbEntity[],
  ): void {
    const columns: DbEntity["columns"] = [];
    let tableName = className.toLowerCase() + "s";

    // Check @Table annotation
    const tableAnnotation = annotations.find((a) => a.includes("@Table"));
    if (tableAnnotation) {
      const nameMatch = tableAnnotation.match(/name\s*=\s*"([^"]+)"/);
      if (nameMatch) tableName = nameMatch[1];
    }

    const body = node.children.find((c) => c.type === "class_body");
    if (!body) return;

    for (const member of body.children) {
      if (member.type === "field_declaration") {
        const fieldAnnotations = this.getAnnotations(member);
        const fieldName = member.children.find((c) => c.type === "variable_declarator")
          ?.children.find((c) => c.type === "identifier")?.text;
        const fieldType = member.children.find((c) =>
          c.type === "type_identifier" || c.type === "generic_type",
        )?.text;

        if (fieldName && fieldType) {
          const isPrimary = fieldAnnotations.some((a) => a.includes("@Id"));
          const isNullable = !fieldAnnotations.some((a) => a.includes("nullable = false") || a.includes("nullable=false"));

          columns.push({
            name: fieldName,
            type: fieldType,
            primary: isPrimary,
            nullable: isNullable,
          });
        }
      }
    }

    if (columns.length > 0) {
      dbEntities.push({ name: className, tableName, filePath, columns, relations: [] });
    }
  }

  private extractParams(node: Parser.SyntaxNode): ParamInfo[] {
    const params: ParamInfo[] = [];
    const formalParams = node.children.find((c) => c.type === "formal_parameters");
    if (!formalParams) return params;

    for (const param of formalParams.children) {
      if (param.type === "formal_parameter") {
        const name = param.children.find((c) => c.type === "identifier")?.text;
        const type = param.children.find((c) =>
          c.type === "type_identifier" || c.type === "generic_type" ||
          c.type === "array_type" || c.type === "integral_type" ||
          c.type === "floating_point_type" || c.type === "boolean_type",
        )?.text;
        if (name) params.push({ name, type });
      }
    }

    return params;
  }

  private getVisibility(node: Parser.SyntaxNode): "public" | "private" | "protected" | "internal" {
    const modifiers = node.children.find((c) => c.type === "modifiers");
    if (!modifiers) return "internal"; // Java default: package-private

    const text = modifiers.text;
    if (text.includes("public")) return "public";
    if (text.includes("private")) return "private";
    if (text.includes("protected")) return "protected";
    return "internal";
  }

  private getAnnotations(node: Parser.SyntaxNode): string[] {
    const annotations: string[] = [];
    const modifiers = node.children.find((c) => c.type === "modifiers");
    if (modifiers) {
      for (const child of modifiers.children) {
        if (child.type === "annotation" || child.type === "marker_annotation") {
          annotations.push(child.text);
        }
      }
    }
    return annotations;
  }

  private extractClassMapping(rootNode: Parser.SyntaxNode): string {
    // Find @RequestMapping on the class level
    for (const child of rootNode.children) {
      if (child.type === "class_declaration") {
        const annotations = this.getAnnotations(child);
        const mapping = annotations.find((a) => a.includes("@RequestMapping"));
        if (mapping) return this.extractMappingPath(mapping);
      }
    }
    return "";
  }

  private extractMappingPath(annotation: string): string {
    // @GetMapping("/users") or @RequestMapping(value = "/users", method = ...)
    const pathMatch = annotation.match(/\(\s*"([^"]+)"/) || annotation.match(/value\s*=\s*"([^"]+)"/);
    return pathMatch ? pathMatch[1] : "";
  }
}
