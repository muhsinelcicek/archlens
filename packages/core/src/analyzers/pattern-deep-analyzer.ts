import type { ArchitectureModel, Symbol, Module } from "../models/index.js";

export interface PatternEvidence {
  type: "aggregate" | "value-object" | "domain-event" | "entity" | "repository" | "command" | "query" | "handler" | "service" | "controller" | "event" | "interface";
  name: string;
  filePath: string;
  module: string;
  details?: string;
}

export interface LayerDependency {
  from: string;
  fromLayer: string;
  to: string;
  toLayer: string;
  count: number;
  isViolation: boolean;
}

export interface DeepPatternAnalysis {
  id: string;
  pattern: string;
  detected: boolean;
  compliance: number;
  status: "excellent" | "good" | "partial" | "poor" | "not-detected";
  summary: string;
  evidence: PatternEvidence[];
  violations: Array<{ message: string; fix: string; file?: string }>;
  recommendations: string[];
  layerMap?: LayerDependency[];
  relatedPatterns?: string[];
}

/**
 * Deep pattern analyzer — provides evidence-based architecture pattern analysis.
 */
export class PatternDeepAnalyzer {
  constructor(private model: ArchitectureModel) {}

  analyze(): DeepPatternAnalysis[] {
    return [
      this.analyzeDDD(),
      this.analyzeCleanArchitecture(),
      this.analyzeRepositoryPattern(),
      this.analyzeCQRS(),
      this.analyzeEventDriven(),
      this.analyzeMicroservice(),
    ];
  }

  private analyzeDDD(): DeepPatternAnalysis {
    const evidence: PatternEvidence[] = [];
    const violations: DeepPatternAnalysis["violations"] = [];
    const recommendations: string[] = [];

    // Find Aggregate Roots
    for (const [uid, sym] of this.model.symbols) {
      if (sym.kind !== "class") continue;
      const extendsAgg = sym.extends?.some((e) => ["Entity", "AggregateRoot", "IAggregateRoot", "BaseEntity"].includes(e));
      if (extendsAgg) {
        const mod = this.findModule(uid);
        const methods = this.model.relations.filter((r) => r.source === uid && r.type === "composes").length;
        evidence.push({ type: "aggregate", name: sym.name, filePath: sym.filePath, module: mod, details: `${methods} methods, extends ${sym.extends?.join(", ")}` });
      }
    }

    // Find Value Objects
    for (const [uid, sym] of this.model.symbols) {
      if (sym.kind !== "class") continue;
      if (sym.extends?.some((e) => ["ValueObject"].includes(e)) || (sym.name === "Address" && sym.filePath.toLowerCase().includes("domain"))) {
        evidence.push({ type: "value-object", name: sym.name, filePath: sym.filePath, module: this.findModule(uid), details: `${sym.params?.length || 0} fields` });
      }
    }

    // Find Domain Events
    for (const [uid, sym] of this.model.symbols) {
      if (sym.kind !== "class") continue;
      if (sym.name.endsWith("DomainEvent") || sym.name.endsWith("IntegrationEvent")) {
        evidence.push({ type: "domain-event", name: sym.name, filePath: sym.filePath, module: this.findModule(uid) });
      }
    }

    // Check domain layer isolation
    const domainModules = this.model.modules.filter((m) => m.layer === "domain");
    let domainViolations = 0;
    for (const dm of domainModules) {
      for (const rel of this.model.relations) {
        if (rel.type === "composes") continue;
        if (!dm.symbols.includes(rel.source)) continue;
        const tgtSym = this.model.symbols.get(rel.target);
        if (!tgtSym) continue;
        for (const im of this.model.modules.filter((m) => m.layer === "infrastructure")) {
          if (im.symbols.some((u) => this.model.symbols.get(u)?.filePath === tgtSym.filePath)) {
            domainViolations++;
            violations.push({ message: `${dm.name} depends on ${im.name}`, fix: "Use interfaces in domain, implementations in infrastructure" });
          }
        }
      }
    }

    // Bounded contexts
    const contexts = new Set<string>();
    for (const mod of this.model.modules) {
      const prefix = mod.name.split(".")[0];
      if (prefix.length > 2) contexts.add(prefix);
    }

    const hasDomain = domainModules.length > 0;
    const hasAggregates = evidence.filter((e) => e.type === "aggregate").length > 0;
    const hasEvents = evidence.filter((e) => e.type === "domain-event").length > 0;

    if (!hasDomain) recommendations.push("Create a dedicated Domain layer for business entities");
    if (hasDomain && !hasAggregates) recommendations.push("Define Aggregate Roots with clear boundaries");
    if (hasDomain && !hasEvents) recommendations.push("Consider domain events for decoupling aggregates");

    // More realistic scoring: require minimum evidence counts
    const aggregateCount = evidence.filter((e) => e.type === "aggregate").length;
    const voCount = evidence.filter((e) => e.type === "value-object").length;
    const eventCount = evidence.filter((e) => e.type === "domain-event").length;
    const baseScore = (hasDomain ? 20 : 0) + (hasAggregates ? 15 : 0) + (hasEvents ? 15 : 0) + (domainViolations === 0 ? 15 : 0);
    // Depth bonus: more evidence = higher compliance, but diminishing returns
    const depthBonus = Math.min(35, (aggregateCount * 3) + (voCount * 2) + (eventCount * 2));
    // Violation penalty
    const violationPenalty = violations.length * 5;
    const score = Math.max(0, Math.min(100, baseScore + depthBonus - violationPenalty));
    const detected = hasDomain || hasAggregates;

    return {
      id: "ddd", pattern: "Domain-Driven Design", detected, compliance: score,
      status: score >= 80 ? "excellent" : score >= 60 ? "good" : score > 0 ? "partial" : "not-detected",
      summary: detected
        ? `${evidence.filter((e) => e.type === "aggregate").length} aggregates, ${evidence.filter((e) => e.type === "value-object").length} value objects, ${evidence.filter((e) => e.type === "domain-event").length} domain events, ${contexts.size} bounded contexts`
        : "No DDD patterns detected",
      evidence, violations, recommendations, relatedPatterns: ["Clean Architecture", "CQRS", "Event-Driven"],
    };
  }

  private analyzeCleanArchitecture(): DeepPatternAnalysis {
    const evidence: PatternEvidence[] = [];
    const violations: DeepPatternAnalysis["violations"] = [];
    const layerMap: LayerDependency[] = [];
    const layerOrder = ["presentation", "api", "application", "domain", "infrastructure"];

    // Build layer dependency map
    const depMap = new Map<string, number>();
    for (const rel of this.model.relations) {
      if (rel.type === "composes") continue;
      const srcMod = this.findModuleObj(rel.source);
      const tgtSym = this.model.symbols.get(rel.target);
      const tgtMod = tgtSym ? this.findModuleObjByFile(tgtSym.filePath) : undefined;
      if (!srcMod || !tgtMod || srcMod.name === tgtMod.name) continue;
      const key = `${srcMod.name}→${tgtMod.name}`;
      depMap.set(key, (depMap.get(key) || 0) + 1);
    }

    let violationCount = 0;
    for (const [key, count] of depMap) {
      const [src, tgt] = key.split("→");
      const srcMod = this.model.modules.find((m) => m.name === src);
      const tgtMod = this.model.modules.find((m) => m.name === tgt);
      if (!srcMod || !tgtMod) continue;
      const srcIdx = layerOrder.indexOf(srcMod.layer);
      const tgtIdx = layerOrder.indexOf(tgtMod.layer);
      const isViolation = srcIdx > tgtIdx && srcIdx !== -1 && tgtIdx !== -1;
      if (isViolation) {
        violationCount++;
        violations.push({ message: `${src} (${srcMod.layer}) → ${tgt} (${tgtMod.layer})`, fix: "Introduce interface in domain layer, implement in infrastructure" });
      }
      layerMap.push({ from: src, fromLayer: srcMod.layer, to: tgt, toLayer: tgtMod.layer, count, isViolation });
    }

    // Module per layer evidence
    for (const layer of layerOrder) {
      const mods = this.model.modules.filter((m) => m.layer === layer);
      for (const mod of mods) {
        evidence.push({ type: "service", name: mod.name, filePath: "", module: mod.name, details: `${layer} layer, ${mod.fileCount} files` });
      }
    }

    const hasLayers = new Set(this.model.modules.map((m) => m.layer).filter((l) => layerOrder.includes(l))).size >= 2;
    const score = hasLayers ? Math.max(0, 100 - violationCount * 15) : 30;

    return {
      id: "clean-architecture", pattern: "Clean Architecture", detected: hasLayers, compliance: Math.min(100, score),
      status: score >= 80 ? "excellent" : score >= 60 ? "good" : score > 0 ? "partial" : "not-detected",
      summary: `${new Set(this.model.modules.map((m) => m.layer)).size} layers, ${violationCount} violations, ${depMap.size} cross-module deps`,
      evidence, violations, recommendations: violationCount > 0 ? ["Fix dependency rule violations using dependency injection"] : [], layerMap, relatedPatterns: ["DDD"],
    };
  }

  private analyzeRepositoryPattern(): DeepPatternAnalysis {
    const evidence: PatternEvidence[] = [];
    const violations: DeepPatternAnalysis["violations"] = [];

    for (const [uid, sym] of this.model.symbols) {
      if (sym.kind !== "class" && sym.kind !== "interface") continue;
      const name = sym.name.toLowerCase();
      if (!name.includes("repository") && !name.includes("repo")) continue;

      const mod = this.findModuleObj(uid);
      const isInterface = sym.kind === "interface";
      evidence.push({
        type: isInterface ? "interface" : "repository",
        name: sym.name, filePath: sym.filePath, module: mod?.name || "?",
        details: `${sym.kind} in ${mod?.layer || "?"} layer`,
      });

      // Check correct layer
      if (isInterface && mod && mod.layer !== "domain" && mod.layer !== "application") {
        violations.push({ message: `Interface ${sym.name} is in ${mod.layer} — should be in domain`, fix: `Move ${sym.name} to domain layer`, file: sym.filePath });
      }
      if (!isInterface && mod && mod.layer !== "infrastructure" && mod.layer !== "unknown") {
        violations.push({ message: `Implementation ${sym.name} is in ${mod.layer} — should be in infrastructure`, fix: `Move ${sym.name} to infrastructure layer`, file: sym.filePath });
      }
    }

    const interfaces = evidence.filter((e) => e.type === "interface").length;
    const impls = evidence.filter((e) => e.type === "repository").length;
    const detected = evidence.length > 0;
    const score = detected ? Math.max(0, 100 - violations.length * 25) : 0;

    return {
      id: "repository", pattern: "Repository Pattern", detected, compliance: Math.max(0, score),
      status: score >= 80 ? "excellent" : score >= 50 ? "good" : score > 0 ? "partial" : "not-detected",
      summary: detected ? `${interfaces} interfaces, ${impls} implementations, ${violations.length} misplacements` : "No repositories found",
      evidence, violations,
      recommendations: impls > 0 && interfaces === 0 ? ["Define IRepository interfaces in domain layer"] : [],
      relatedPatterns: ["DDD", "Clean Architecture"],
    };
  }

  private analyzeCQRS(): DeepPatternAnalysis {
    const evidence: PatternEvidence[] = [];
    const violations: DeepPatternAnalysis["violations"] = [];

    for (const [uid, sym] of this.model.symbols) {
      if (sym.kind !== "class") continue;
      const name = sym.name;
      if (name.endsWith("Command") && !name.endsWith("CommandHandler")) {
        evidence.push({ type: "command", name, filePath: sym.filePath, module: this.findModule(uid) });
      }
      if (name.endsWith("Query") && !name.endsWith("QueryHandler")) {
        evidence.push({ type: "query", name, filePath: sym.filePath, module: this.findModule(uid) });
      }
      if (name.endsWith("CommandHandler") || name.endsWith("QueryHandler")) {
        evidence.push({ type: "handler", name, filePath: sym.filePath, module: this.findModule(uid), details: name.includes("Command") ? "command handler" : "query handler" });
      }
    }

    // Also check for IOrderQueries-style query interfaces
    for (const [uid, sym] of this.model.symbols) {
      if (sym.kind !== "interface") continue;
      if (sym.name.includes("Queries") || sym.name.includes("Query")) {
        evidence.push({ type: "query", name: sym.name, filePath: sym.filePath, module: this.findModule(uid), details: "query interface" });
      }
    }

    const commands = evidence.filter((e) => e.type === "command");
    const queries = evidence.filter((e) => e.type === "query");
    const handlers = evidence.filter((e) => e.type === "handler");

    if (commands.length > 0 && queries.length === 0) violations.push({ message: "Commands found but no Query objects", fix: "Create query classes for read operations" });
    if (commands.length === 0 && queries.length > 0) violations.push({ message: "Queries found but no Command objects", fix: "Create command classes for write operations" });

    const detected = commands.length > 0 || queries.length > 0;
    const score = detected ? (commands.length > 0 ? 30 : 0) + (queries.length > 0 ? 30 : 0) + (handlers.length > 0 ? 40 : 0) - violations.length * 20 : 0;

    return {
      id: "cqrs", pattern: "CQRS (Command Query Responsibility Segregation)", detected, compliance: Math.max(0, Math.min(100, score)),
      status: score >= 80 ? "excellent" : score >= 50 ? "good" : score > 0 ? "partial" : "not-detected",
      summary: `${commands.length} commands, ${queries.length} queries, ${handlers.length} handlers`,
      evidence, violations,
      recommendations: detected && handlers.length === 0 ? ["Implement command/query handlers (or use MediatR)"] : [],
      relatedPatterns: ["DDD", "Event-Driven"],
    };
  }

  private analyzeEventDriven(): DeepPatternAnalysis {
    const evidence: PatternEvidence[] = [];

    // Events
    for (const [uid, sym] of this.model.symbols) {
      if (sym.kind !== "class") continue;
      if (sym.name.endsWith("Event") || sym.name.endsWith("IntegrationEvent")) {
        evidence.push({ type: "event", name: sym.name, filePath: sym.filePath, module: this.findModule(uid), details: sym.name.includes("Integration") ? "integration" : "domain" });
      }
      if (sym.name.includes("Handler") && (sym.name.includes("Event") || sym.filePath.includes("EventHandling"))) {
        evidence.push({ type: "handler", name: sym.name, filePath: sym.filePath, module: this.findModule(uid), details: "event handler" });
      }
    }

    const hasEventBus = this.model.modules.some((m) => m.name.toLowerCase().includes("eventbus") || m.name.toLowerCase().includes("rabbitmq") || m.name.toLowerCase().includes("kafka"));
    if (hasEventBus) evidence.push({ type: "service", name: "Event Bus", filePath: "", module: "EventBus", details: "message broker infrastructure" });

    const events = evidence.filter((e) => e.type === "event").length;
    const handlers = evidence.filter((e) => e.type === "handler").length;
    const detected = events > 0 || hasEventBus;
    const score = (events > 0 ? 40 : 0) + (handlers > 0 ? 30 : 0) + (hasEventBus ? 30 : 0);

    return {
      id: "event-driven", pattern: "Event-Driven Architecture", detected, compliance: Math.min(100, score),
      status: score >= 80 ? "excellent" : score >= 50 ? "good" : score > 0 ? "partial" : "not-detected",
      summary: `${events} events, ${handlers} handlers${hasEventBus ? ", event bus detected" : ""}`,
      evidence, violations: [], recommendations: [],
      relatedPatterns: ["CQRS", "Microservice"],
    };
  }

  private analyzeMicroservice(): DeepPatternAnalysis {
    const evidence: PatternEvidence[] = [];
    const apiModules = this.model.modules.filter((m) => m.layer === "api");
    const hasMultipleApis = apiModules.length >= 2;
    const hasGrpc = [...this.model.symbols.values()].some((s) => s.filePath.includes("Grpc") || s.filePath.includes("grpc"));
    const hasEventBus = this.model.modules.some((m) => m.name.toLowerCase().includes("eventbus"));

    for (const mod of apiModules) {
      evidence.push({ type: "service", name: mod.name, filePath: "", module: mod.name, details: `API service, ${mod.fileCount} files` });
    }
    if (hasGrpc) evidence.push({ type: "service", name: "gRPC", filePath: "", module: "", details: "inter-service communication" });
    if (hasEventBus) evidence.push({ type: "service", name: "Event Bus", filePath: "", module: "", details: "async messaging" });

    const detected = hasMultipleApis;
    const score = (hasMultipleApis ? 40 : 0) + (hasGrpc ? 20 : 0) + (hasEventBus ? 20 : 0) + (this.model.apiEndpoints.length > 5 ? 20 : 0);

    return {
      id: "microservice", pattern: "Microservice Architecture", detected, compliance: Math.min(100, score),
      status: score >= 80 ? "excellent" : score >= 50 ? "good" : score > 0 ? "partial" : "not-detected",
      summary: `${apiModules.length} API services, ${this.model.apiEndpoints.length} endpoints${hasGrpc ? ", gRPC" : ""}${hasEventBus ? ", event bus" : ""}`,
      evidence, violations: [], recommendations: [],
      relatedPatterns: ["Event-Driven", "DDD"],
    };
  }

  // Helpers
  private findModule(uid: string): string {
    for (const mod of this.model.modules) { if (mod.symbols.includes(uid)) return mod.name; } return "unknown";
  }
  private findModuleObj(uid: string): Module | undefined {
    return this.model.modules.find((m) => m.symbols.includes(uid));
  }
  private findModuleObjByFile(filePath: string): Module | undefined {
    for (const mod of this.model.modules) {
      for (const u of mod.symbols) { const s = this.model.symbols.get(u); if (s && s.filePath === filePath) return mod; }
    }
    return undefined;
  }
}
