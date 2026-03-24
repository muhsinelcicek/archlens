import Parser from "tree-sitter";
import Rust from "tree-sitter-rust";
import type { Symbol, Relation, ApiEndpoint, DbEntity, ParamInfo } from "../models/index.js";
import { BaseParser, type ParseResult, type ImportInfo, type ParserOptions } from "./base-parser.js";

const rustParser = new Parser();
rustParser.setLanguage(Rust as unknown as Parser.Language);

export class RustParser extends BaseParser {
  language = "rust" as const;
  extensions = [".rs"];

  parse(filePath: string, content: string, options: ParserOptions): ParseResult {
    const tree = rustParser.parse(content);
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

    if (content.includes("actix_web") || content.includes("actix-web")) { framework = "actix-web"; patterns.push("rest-api"); }
    if (content.includes("axum::")) { framework = "axum"; patterns.push("rest-api"); }
    if (content.includes("rocket::")) { framework = "rocket"; patterns.push("rest-api"); }
    if (content.includes("diesel::")) { patterns.push("orm-model"); }
    if (content.includes("sqlx::")) { patterns.push("database"); }
    if (content.includes("sea_orm")) { patterns.push("orm-model"); }
    if (content.includes("tokio::")) { patterns.push("async-runtime"); }
    if (content.includes("serde::")) { patterns.push("serialization"); }

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
      case "use_declaration":
        this.extractUse(node, filePath, imports);
        break;
      case "function_item":
        this.extractFunction(node, filePath, symbols, apiEndpoints);
        break;
      case "struct_item":
        this.extractStruct(node, filePath, symbols, relations);
        break;
      case "enum_item":
        this.extractEnum(node, filePath, symbols);
        break;
      case "trait_item":
        this.extractTrait(node, filePath, symbols);
        break;
      case "impl_item":
        this.extractImpl(node, filePath, symbols, relations);
        break;
      case "mod_item":
        this.extractMod(node, filePath, symbols);
        break;
      default:
        break;
    }

    for (const child of node.children) {
      this.walkNode(child, filePath, symbols, relations, imports, apiEndpoints);
    }
  }

  private extractUse(node: Parser.SyntaxNode, filePath: string, imports: ImportInfo[]): void {
    // use std::collections::HashMap;
    // use crate::models::{User, Post};
    const usePath = this.findDescendant(node, "scoped_identifier") || this.findDescendant(node, "identifier");
    if (!usePath) return;

    const fullPath = usePath.text;
    const names: string[] = [];

    // Check for use list: use foo::{Bar, Baz}
    const useList = this.findDescendant(node, "use_list");
    if (useList) {
      for (const child of useList.children) {
        if (child.type === "identifier" || child.type === "scoped_identifier") {
          names.push(child.text.split("::").pop() || child.text);
        }
      }
    } else {
      names.push(fullPath.split("::").pop() || fullPath);
    }

    imports.push({ sourceFile: filePath, modulePath: fullPath, names });
  }

  private extractFunction(
    node: Parser.SyntaxNode,
    filePath: string,
    symbols: Symbol[],
    apiEndpoints: ApiEndpoint[],
  ): void {
    const name = node.children.find((c) => c.type === "identifier")?.text;
    if (!name) return;

    const visibility = node.children.some((c) => c.type === "visibility_modifier") ? "public" : "private";
    const params = this.extractParams(node);
    const returnType = this.findDescendant(node, "type_identifier")?.text;

    // Check for web framework route attributes
    const attrs = this.getAttributes(node);
    const routeAttr = attrs.find((a) => /^#\[(?:get|post|put|delete|patch)\(/.test(a));
    if (routeAttr) {
      const methodMatch = routeAttr.match(/#\[(get|post|put|delete|patch)\("([^"]+)"/);
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
      language: "rust",
      visibility,
      params,
      returnType,
      annotations: attrs.length > 0 ? attrs : undefined,
    });
  }

  private extractStruct(
    node: Parser.SyntaxNode,
    filePath: string,
    symbols: Symbol[],
    relations: Relation[],
  ): void {
    const name = node.children.find((c) => c.type === "type_identifier")?.text;
    if (!name) return;

    const visibility = node.children.some((c) => c.type === "visibility_modifier") ? "public" : "private";
    const attrs = this.getAttributes(node);
    const uid = this.makeUid(filePath, name, "class");

    symbols.push({
      uid,
      name,
      filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      kind: "class",
      language: "rust",
      visibility,
      annotations: attrs.length > 0 ? attrs : undefined,
    });
  }

  private extractEnum(node: Parser.SyntaxNode, filePath: string, symbols: Symbol[]): void {
    const name = node.children.find((c) => c.type === "type_identifier")?.text;
    if (!name) return;

    symbols.push({
      uid: this.makeUid(filePath, name, "enum"),
      name,
      filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      kind: "enum",
      language: "rust",
      visibility: node.children.some((c) => c.type === "visibility_modifier") ? "public" : "private",
    });
  }

  private extractTrait(node: Parser.SyntaxNode, filePath: string, symbols: Symbol[]): void {
    const name = node.children.find((c) => c.type === "type_identifier")?.text;
    if (!name) return;

    symbols.push({
      uid: this.makeUid(filePath, name, "interface"),
      name,
      filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      kind: "interface",
      language: "rust",
      visibility: node.children.some((c) => c.type === "visibility_modifier") ? "public" : "private",
    });
  }

  private extractImpl(
    node: Parser.SyntaxNode,
    filePath: string,
    symbols: Symbol[],
    relations: Relation[],
  ): void {
    // impl Trait for Struct or impl Struct
    const typeNodes = node.children.filter((c) => c.type === "type_identifier" || c.type === "generic_type");
    if (typeNodes.length === 0) return;

    const hasTrait = node.children.some((c) => c.text === "for");
    let structName: string;
    let traitName: string | undefined;

    if (hasTrait && typeNodes.length >= 2) {
      traitName = typeNodes[0].text;
      structName = typeNodes[typeNodes.length - 1].text;
      relations.push({
        source: this.makeUid(filePath, structName, "class"),
        target: traitName,
        type: "implements",
      });
    } else {
      structName = typeNodes[0].text;
    }

    // Extract methods from impl block
    const body = node.children.find((c) => c.type === "declaration_list");
    if (body) {
      for (const member of body.children) {
        if (member.type === "function_item") {
          const methodName = member.children.find((c) => c.type === "identifier")?.text;
          if (methodName) {
            const fullName = `${structName}.${methodName}`;
            const uid = this.makeUid(filePath, fullName, "method");
            const visibility = member.children.some((c) => c.type === "visibility_modifier") ? "public" : "private";

            symbols.push({
              uid,
              name: fullName,
              filePath,
              startLine: member.startPosition.row + 1,
              endLine: member.endPosition.row + 1,
              kind: "method",
              language: "rust",
              visibility,
              params: this.extractParams(member),
            });

            relations.push({
              source: this.makeUid(filePath, structName, "class"),
              target: uid,
              type: "composes",
            });
          }
        }
      }
    }
  }

  private extractMod(node: Parser.SyntaxNode, filePath: string, symbols: Symbol[]): void {
    const name = node.children.find((c) => c.type === "identifier")?.text;
    if (!name) return;
    // Only track mod declarations without body (mod foo; — file reference)
    if (node.children.some((c) => c.type === "declaration_list")) return;

    symbols.push({
      uid: this.makeUid(filePath, name, "module"),
      name,
      filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      kind: "module",
      language: "rust",
      visibility: "public",
    });
  }

  private extractParams(node: Parser.SyntaxNode): ParamInfo[] {
    const params: ParamInfo[] = [];
    const paramList = node.children.find((c) => c.type === "parameters");
    if (!paramList) return params;

    for (const param of paramList.children) {
      if (param.type === "parameter") {
        const name = param.children.find((c) => c.type === "identifier")?.text;
        const type = param.children.find((c) => c.type === "type_identifier" || c.type === "reference_type" || c.type === "generic_type")?.text;
        if (name && name !== "self") params.push({ name, type });
      }
      if (param.type === "self_parameter") continue;
    }
    return params;
  }

  private getAttributes(node: Parser.SyntaxNode): string[] {
    const attrs: string[] = [];
    const parent = node.parent;
    if (parent) {
      for (const sibling of parent.children) {
        if (sibling.type === "attribute_item" && sibling.endPosition.row < node.startPosition.row) {
          attrs.push(sibling.text);
        }
      }
    }
    return attrs;
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
