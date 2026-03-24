import Parser from "tree-sitter";
import Swift from "tree-sitter-swift";
import type { Symbol, Relation, ApiEndpoint, DbEntity, ParamInfo } from "../models/index.js";
import { BaseParser, type ParseResult, type ImportInfo, type ParserOptions } from "./base-parser.js";

const swiftParser = new Parser();
swiftParser.setLanguage(Swift as unknown as Parser.Language);

export class SwiftParser extends BaseParser {
  language = "swift" as const;
  extensions = [".swift"];

  parse(filePath: string, content: string, options: ParserOptions): ParseResult {
    const tree = swiftParser.parse(content);
    const symbols: Symbol[] = [];
    const relations: Relation[] = [];
    const apiEndpoints: ApiEndpoint[] = [];
    const dbEntities: DbEntity[] = [];
    const imports: ImportInfo[] = [];

    this.walkNode(tree.rootNode, filePath, symbols, relations, imports);
    return { symbols, relations, apiEndpoints, dbEntities, imports };
  }

  detectFrameworkPatterns(filePath: string, content: string) {
    const patterns: string[] = [];
    let framework: string | undefined;

    if (content.includes("import SwiftUI")) { framework = "swiftui"; patterns.push("swiftui-view"); }
    if (content.includes("import UIKit")) { framework = "uikit"; patterns.push("uikit"); }
    if (content.includes("import SwiftData")) { patterns.push("swiftdata"); }
    if (content.includes("import CoreData")) { patterns.push("coredata"); }
    if (content.includes("import WidgetKit")) { patterns.push("widget"); }
    if (content.includes("import Combine")) { patterns.push("combine"); }
    if (content.includes("@Observable")) { patterns.push("observation"); }
    if (content.includes("import Vapor")) { framework = "vapor"; patterns.push("rest-api"); }

    return { framework, patterns };
  }

  private walkNode(
    node: Parser.SyntaxNode,
    filePath: string,
    symbols: Symbol[],
    relations: Relation[],
    imports: ImportInfo[],
  ): void {
    switch (node.type) {
      case "import_declaration":
        this.extractImport(node, filePath, imports);
        break;

      case "class_declaration":
      case "struct_declaration":
      case "actor_declaration":
        this.extractClassOrStruct(node, filePath, symbols, relations);
        break;

      case "protocol_declaration":
        this.extractProtocol(node, filePath, symbols);
        break;

      case "enum_declaration":
        this.extractEnum(node, filePath, symbols, relations);
        break;

      case "function_declaration":
        // Only top-level functions (not inside class/struct)
        if (!this.isInsideTypeDecl(node)) {
          this.extractFunction(node, filePath, symbols);
        }
        break;

      case "property_declaration":
        // Skip — handled inside class/struct
        break;

      default:
        break;
    }

    for (const child of node.children) {
      this.walkNode(child, filePath, symbols, relations, imports);
    }
  }

  private extractImport(node: Parser.SyntaxNode, filePath: string, imports: ImportInfo[]): void {
    // import SwiftUI, import Foundation, etc.
    const identifiers = node.children.filter((c) =>
      c.type === "identifier" || c.type === "simple_identifier",
    );
    for (const id of identifiers) {
      imports.push({
        sourceFile: filePath,
        modulePath: id.text,
        names: [id.text],
      });
    }
  }

  private extractClassOrStruct(
    node: Parser.SyntaxNode,
    filePath: string,
    symbols: Symbol[],
    relations: Relation[],
  ): void {
    const name = this.findIdentifier(node);
    if (!name) return;

    const kind = node.type === "struct_declaration" ? "class" : "class"; // Both map to "class" in our model
    const uid = this.makeUid(filePath, name, kind);
    const visibility = this.getVisibility(node);
    const extendsList: string[] = [];
    const implementsList: string[] = [];

    // Inheritance clause
    const inheritanceClause = node.children.find((c) => c.type === "inheritance_specifier" || c.type === "type_identifier");
    // Look for all type identifiers after the name (inheritance)
    let foundName = false;
    for (const child of node.children) {
      if (child.text === name) { foundName = true; continue; }
      if (foundName && child.type === "type_identifier") {
        const parentName = child.text;
        // Common SwiftUI/UIKit base types are protocols
        const knownProtocols = ["View", "ObservableObject", "Identifiable", "Codable", "Hashable", "Equatable", "Sendable", "App", "Scene"];
        if (knownProtocols.includes(parentName)) {
          implementsList.push(parentName);
          relations.push({ source: uid, target: parentName, type: "implements" });
        } else {
          extendsList.push(parentName);
          relations.push({ source: uid, target: parentName, type: "extends" });
        }
      }
      if (child.type === "class_body" || child.type === "struct_body" || child.type === "actor_body") break;
    }

    // Check for @Observable, @Model etc.
    const annotations = this.getAnnotations(node);

    symbols.push({
      uid,
      name,
      filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      kind: "class",
      language: "swift",
      visibility,
      extends: extendsList.length > 0 ? extendsList : undefined,
      implements: implementsList.length > 0 ? implementsList : undefined,
      annotations: annotations.length > 0 ? annotations : undefined,
    });

    // Extract methods and properties
    const body = node.children.find((c) =>
      c.type === "class_body" || c.type === "struct_body" || c.type === "actor_body",
    );

    if (body) {
      for (const member of body.children) {
        if (member.type === "function_declaration") {
          this.extractMethod(member, filePath, name, uid, symbols, relations);
        }
        if (member.type === "computed_property" || member.type === "property_declaration") {
          this.extractProperty(member, filePath, name, uid, symbols, relations);
        }
      }
    }
  }

  private extractProtocol(
    node: Parser.SyntaxNode,
    filePath: string,
    symbols: Symbol[],
  ): void {
    const name = this.findIdentifier(node);
    if (!name) return;

    symbols.push({
      uid: this.makeUid(filePath, name, "interface"),
      name,
      filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      kind: "interface",
      language: "swift",
      visibility: this.getVisibility(node),
    });
  }

  private extractEnum(
    node: Parser.SyntaxNode,
    filePath: string,
    symbols: Symbol[],
    relations: Relation[],
  ): void {
    const name = this.findIdentifier(node);
    if (!name) return;

    const uid = this.makeUid(filePath, name, "enum");
    symbols.push({
      uid,
      name,
      filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      kind: "enum",
      language: "swift",
      visibility: this.getVisibility(node),
    });
  }

  private extractFunction(
    node: Parser.SyntaxNode,
    filePath: string,
    symbols: Symbol[],
  ): void {
    const name = this.findIdentifier(node);
    if (!name) return;

    symbols.push({
      uid: this.makeUid(filePath, name, "function"),
      name,
      filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      kind: "function",
      language: "swift",
      visibility: this.getVisibility(node),
      params: this.extractParams(node),
    });
  }

  private extractMethod(
    node: Parser.SyntaxNode,
    filePath: string,
    className: string,
    classUid: string,
    symbols: Symbol[],
    relations: Relation[],
  ): void {
    const name = this.findIdentifier(node);
    if (!name) return;

    const fullName = `${className}.${name}`;
    const uid = this.makeUid(filePath, fullName, "method");

    symbols.push({
      uid,
      name: fullName,
      filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      kind: "method",
      language: "swift",
      visibility: this.getVisibility(node),
      params: this.extractParams(node),
    });

    relations.push({ source: classUid, target: uid, type: "composes" });
  }

  private extractProperty(
    node: Parser.SyntaxNode,
    filePath: string,
    className: string,
    classUid: string,
    symbols: Symbol[],
    relations: Relation[],
  ): void {
    const name = this.findIdentifier(node);
    if (!name || name === "body") return; // Skip SwiftUI body property

    const fullName = `${className}.${name}`;
    const uid = this.makeUid(filePath, fullName, "property");

    symbols.push({
      uid,
      name: fullName,
      filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      kind: "property",
      language: "swift",
      visibility: this.getVisibility(node),
    });

    relations.push({ source: classUid, target: uid, type: "composes" });
  }

  // ─── Helpers ────────────────────────────────────────────────────

  private findIdentifier(node: Parser.SyntaxNode): string | undefined {
    for (const child of node.children) {
      if (child.type === "simple_identifier" || child.type === "identifier") {
        return child.text;
      }
      if (child.type === "type_identifier") {
        return child.text;
      }
    }
    return undefined;
  }

  private extractParams(node: Parser.SyntaxNode): ParamInfo[] {
    const params: ParamInfo[] = [];
    const paramClause = node.children.find((c) => c.type === "function_value_parameters");
    if (!paramClause) return params;

    for (const param of paramClause.children) {
      if (param.type === "parameter" || param.type === "simple_identifier") {
        const name = this.findIdentifier(param);
        const typeNode = param.children.find((c) => c.type === "type_identifier" || c.type === "optional_type" || c.type === "array_type");
        if (name) {
          params.push({ name, type: typeNode?.text });
        }
      }
    }

    return params;
  }

  private getVisibility(node: Parser.SyntaxNode): "public" | "private" | "protected" | "internal" {
    const text = node.text.substring(0, Math.min(100, node.text.length));
    if (text.startsWith("public ") || text.includes(" public ")) return "public";
    if (text.startsWith("private ") || text.includes(" private ")) return "private";
    if (text.startsWith("fileprivate ")) return "private";
    if (text.startsWith("open ")) return "public";
    return "internal"; // Swift default
  }

  private getAnnotations(node: Parser.SyntaxNode): string[] {
    const annotations: string[] = [];
    const text = node.text.substring(0, Math.min(200, node.text.length));
    const matches = text.matchAll(/@(\w+)/g);
    for (const match of matches) {
      annotations.push(`@${match[1]}`);
    }
    return annotations;
  }

  private isInsideTypeDecl(node: Parser.SyntaxNode): boolean {
    let parent = node.parent;
    while (parent) {
      if (["class_body", "struct_body", "enum_body", "actor_body", "protocol_body"].includes(parent.type)) {
        return true;
      }
      parent = parent.parent;
    }
    return false;
  }
}
