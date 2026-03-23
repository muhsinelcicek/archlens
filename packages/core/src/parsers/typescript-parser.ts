import Parser from "tree-sitter";
import TypeScript from "tree-sitter-typescript";
import type { Symbol, Relation, ApiEndpoint, DbEntity, ParamInfo } from "../models/index.js";
import { BaseParser, type ParseResult, type ImportInfo, type ParserOptions } from "./base-parser.js";

const tsParser = new Parser();
tsParser.setLanguage(TypeScript.typescript as unknown as Parser.Language);

const tsxParser = new Parser();
tsxParser.setLanguage(TypeScript.tsx as unknown as Parser.Language);

export class TypeScriptParser extends BaseParser {
  language = "typescript" as const;
  extensions = [".ts", ".tsx", ".js", ".jsx"];

  parse(filePath: string, content: string, options: ParserOptions): ParseResult {
    const isTsx = filePath.endsWith(".tsx") || filePath.endsWith(".jsx");
    const parser = isTsx ? tsxParser : tsParser;
    const tree = parser.parse(content);

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

    // React detection
    if (content.includes("from 'react'") || content.includes('from "react"')) {
      framework = "react";
      if (/function\s+\w+.*\(.*\).*{[\s\S]*?return\s*\(?\s*</.test(content)) {
        patterns.push("functional-component");
      }
      if (/use[A-Z]\w+/.test(content)) patterns.push("hooks");
    }

    // Next.js detection
    if (filePath.includes("/app/") && filePath.endsWith("page.tsx")) {
      framework = "nextjs";
      patterns.push("app-router");
    }
    if (content.includes("getServerSideProps") || content.includes("getStaticProps")) {
      framework = "nextjs";
      patterns.push("pages-router");
    }

    // Express/Fastify detection
    if (/app\.(get|post|put|delete|patch|use)\s*\(/.test(content)) {
      framework = framework || "express";
      patterns.push("rest-api");
    }

    // NestJS detection
    if (content.includes("@Controller") || content.includes("@Injectable")) {
      framework = "nestjs";
      patterns.push("decorator-pattern");
    }

    // Angular detection
    if (content.includes("@Component") || content.includes("@NgModule")) {
      framework = "angular";
      patterns.push("component");
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
  ): void {
    switch (node.type) {
      case "import_statement":
        this.extractImport(node, filePath, imports);
        break;

      case "function_declaration":
      case "arrow_function":
      case "function":
        this.extractFunction(node, filePath, symbols);
        break;

      case "class_declaration":
        this.extractClass(node, filePath, symbols, relations);
        break;

      case "interface_declaration":
      case "type_alias_declaration":
        this.extractTypeDeclaration(node, filePath, symbols);
        break;

      case "enum_declaration":
        this.extractEnum(node, filePath, symbols);
        break;

      case "call_expression":
        this.extractCall(node, filePath, relations);
        break;

      case "export_statement":
        // Recurse into the exported declaration
        for (const child of node.children) {
          this.walkNode(child, filePath, symbols, relations, imports, apiEndpoints);
        }
        return; // Already handled children

      default:
        break;
    }

    // Recurse into children
    for (const child of node.children) {
      this.walkNode(child, filePath, symbols, relations, imports, apiEndpoints);
    }
  }

  private extractImport(node: Parser.SyntaxNode, filePath: string, imports: ImportInfo[]): void {
    const source = node.children.find((c) => c.type === "string")?.text?.replace(/['"]/g, "");
    if (!source) return;

    const names: string[] = [];
    const importClause = node.children.find(
      (c) => c.type === "import_clause" || c.type === "named_imports",
    );

    if (importClause) {
      const namedImports = this.findDescendant(importClause, "named_imports");
      if (namedImports) {
        for (const spec of namedImports.children) {
          if (spec.type === "import_specifier") {
            const name = spec.children.find((c) => c.type === "identifier")?.text;
            if (name) names.push(name);
          }
        }
      }
      // Default import
      const defaultImport = importClause.children.find((c) => c.type === "identifier");
      if (defaultImport) names.push(defaultImport.text);
    }

    imports.push({ sourceFile: filePath, modulePath: source, names });
  }

  private extractFunction(
    node: Parser.SyntaxNode,
    filePath: string,
    symbols: Symbol[],
  ): void {
    let name: string | undefined;

    if (node.type === "function_declaration") {
      name = node.children.find((c) => c.type === "identifier")?.text;
    } else if (node.parent?.type === "variable_declarator") {
      name = node.parent.children.find((c) => c.type === "identifier")?.text;
    }

    if (!name) return;

    const params = this.extractParams(node);
    const returnType = this.findDescendant(node, "type_annotation")?.text?.replace(/^:\s*/, "");

    symbols.push({
      uid: this.makeUid(filePath, name, "function"),
      name,
      filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      kind: "function",
      language: "typescript",
      visibility: this.getVisibility(node),
      params,
      returnType,
    });
  }

  private extractClass(
    node: Parser.SyntaxNode,
    filePath: string,
    symbols: Symbol[],
    relations: Relation[],
  ): void {
    const name = node.children.find((c) => c.type === "type_identifier" || c.type === "identifier")?.text;
    if (!name) return;

    const uid = this.makeUid(filePath, name, "class");
    const extendsClause = this.findDescendant(node, "extends_clause");
    const implementsClause = this.findDescendant(node, "implements_clause");

    const extendsList: string[] = [];
    const implementsList: string[] = [];

    if (extendsClause) {
      const parentName = extendsClause.children.find((c) => c.type === "identifier" || c.type === "type_identifier")?.text;
      if (parentName) {
        extendsList.push(parentName);
        relations.push({ source: uid, target: parentName, type: "extends" });
      }
    }

    if (implementsClause) {
      for (const child of implementsClause.children) {
        if (child.type === "type_identifier" || child.type === "identifier") {
          implementsList.push(child.text);
          relations.push({ source: uid, target: child.text, type: "implements" });
        }
      }
    }

    symbols.push({
      uid,
      name,
      filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      kind: "class",
      language: "typescript",
      visibility: this.getVisibility(node),
      extends: extendsList.length > 0 ? extendsList : undefined,
      implements: implementsList.length > 0 ? implementsList : undefined,
    });

    // Extract methods
    const body = node.children.find((c) => c.type === "class_body");
    if (body) {
      for (const member of body.children) {
        if (member.type === "method_definition" || member.type === "public_field_definition") {
          const methodName = member.children.find((c) => c.type === "property_identifier" || c.type === "identifier")?.text;
          if (methodName) {
            const methodUid = this.makeUid(filePath, `${name}.${methodName}`, "method");
            symbols.push({
              uid: methodUid,
              name: `${name}.${methodName}`,
              filePath,
              startLine: member.startPosition.row + 1,
              endLine: member.endPosition.row + 1,
              kind: "method",
              language: "typescript",
              visibility: this.getVisibility(member),
              params: this.extractParams(member),
            });
            relations.push({ source: uid, target: methodUid, type: "composes" });
          }
        }
      }
    }
  }

  private extractTypeDeclaration(
    node: Parser.SyntaxNode,
    filePath: string,
    symbols: Symbol[],
  ): void {
    const name = node.children.find((c) => c.type === "type_identifier" || c.type === "identifier")?.text;
    if (!name) return;

    symbols.push({
      uid: this.makeUid(filePath, name, node.type === "interface_declaration" ? "interface" : "type"),
      name,
      filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      kind: node.type === "interface_declaration" ? "interface" : "type_alias",
      language: "typescript",
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
      language: "typescript",
      visibility: this.getVisibility(node),
    });
  }

  private extractCall(
    node: Parser.SyntaxNode,
    filePath: string,
    relations: Relation[],
  ): void {
    const callee = node.children[0];
    if (!callee) return;

    let calledName: string | undefined;

    if (callee.type === "identifier") {
      calledName = callee.text;
    } else if (callee.type === "member_expression") {
      calledName = callee.text;
    }

    if (calledName) {
      // We'll resolve the actual UIDs in the linker phase
      relations.push({
        source: filePath,
        target: calledName,
        type: "calls",
      });
    }
  }

  private extractParams(node: Parser.SyntaxNode): ParamInfo[] {
    const params: ParamInfo[] = [];
    const formalParams = this.findDescendant(node, "formal_parameters");
    if (!formalParams) return params;

    for (const param of formalParams.children) {
      if (param.type === "required_parameter" || param.type === "optional_parameter") {
        const name = param.children.find((c) => c.type === "identifier")?.text;
        const typeAnnotation = this.findDescendant(param, "type_annotation")?.text?.replace(/^:\s*/, "");
        if (name) {
          params.push({
            name,
            type: typeAnnotation,
            optional: param.type === "optional_parameter",
          });
        }
      }
    }

    return params;
  }

  private getVisibility(node: Parser.SyntaxNode): "public" | "private" | "protected" | "internal" {
    const text = node.text;
    if (text.startsWith("private ") || text.includes(" private ")) return "private";
    if (text.startsWith("protected ") || text.includes(" protected ")) return "protected";
    return "public";
  }

  private findDescendant(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode | undefined {
    for (const child of node.children) {
      if (child.type === type) return child;
      const found = this.findDescendant(child, type);
      if (found) return found;
    }
    return undefined;
  }
}
