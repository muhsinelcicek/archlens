import type { ArchitectureModel, Symbol } from "../models/index.js";

export interface EventFlow {
  eventName: string;
  publisher: { module: string; symbol: string; filePath: string };
  subscribers: Array<{ module: string; symbol: string; filePath: string }>;
  eventType: "integration" | "domain" | "notification";
}

export interface BoundedContext {
  name: string;
  modules: string[];
  entities: string[];
  events: string[];
  isClean: boolean; // minimal cross-context coupling
}

export interface EventFlowReport {
  events: EventFlow[];
  boundedContexts: BoundedContext[];
  communicationPatterns: Array<{ type: string; description: string; modules: string[] }>;
}

/**
 * Detects event-driven patterns, bounded contexts, and communication flows.
 */
export class EventFlowDetector {
  constructor(private model: ArchitectureModel) {}

  detect(): EventFlowReport {
    const events = this.detectEvents();
    const boundedContexts = this.detectBoundedContexts();
    const communicationPatterns = this.detectCommunicationPatterns();

    return { events, boundedContexts, communicationPatterns };
  }

  private detectEvents(): EventFlow[] {
    const events: EventFlow[] = [];
    const eventClasses = new Map<string, { sym: Symbol; module: string }>();

    // Find event classes (names ending in Event, IntegrationEvent, etc.)
    for (const [uid, sym] of this.model.symbols) {
      if (sym.kind !== "class") continue;
      const name = sym.name;
      if (name.endsWith("Event") || name.endsWith("IntegrationEvent") || name.endsWith("DomainEvent") || name.endsWith("Notification")) {
        const module = this.findModule(uid);
        eventClasses.set(name, { sym, module });
      }
    }

    // Find publishers (classes that create/publish events)
    // Find subscribers (handlers — classes ending in Handler/Consumer)
    for (const [eventName, eventInfo] of eventClasses) {
      const subscribers: EventFlow["subscribers"] = [];

      // Find handlers for this event
      for (const [uid, sym] of this.model.symbols) {
        if (sym.kind !== "class") continue;
        const name = sym.name;
        // Handler naming patterns
        if (name.includes(eventName.replace("IntegrationEvent", "").replace("Event", "")) && (name.includes("Handler") || name.includes("Consumer") || name.includes("Subscriber"))) {
          subscribers.push({ module: this.findModule(uid), symbol: name, filePath: sym.filePath });
        }
      }

      const eventType: EventFlow["eventType"] = eventName.includes("Integration") ? "integration" : eventName.includes("Domain") ? "domain" : "notification";

      events.push({
        eventName,
        publisher: { module: eventInfo.module, symbol: eventName, filePath: eventInfo.sym.filePath },
        subscribers,
        eventType,
      });
    }

    return events.filter((e) => e.subscribers.length > 0 || e.eventType === "integration");
  }

  private detectBoundedContexts(): BoundedContext[] {
    const contexts: BoundedContext[] = [];

    // Group modules by domain prefix (e.g., Ordering.API + Ordering.Domain + Ordering.Infrastructure = Ordering context)
    const prefixMap = new Map<string, string[]>();
    for (const mod of this.model.modules) {
      const prefix = mod.name.split(".")[0].replace(/API$|Domain$|Infrastructure$|Service$/, "").trim();
      if (!prefixMap.has(prefix)) prefixMap.set(prefix, []);
      prefixMap.get(prefix)!.push(mod.name);
    }

    for (const [prefix, modules] of prefixMap) {
      if (modules.length < 1) continue;

      // Find entities in these modules
      const entities: string[] = [];
      for (const entity of this.model.dbEntities) {
        for (const mod of this.model.modules) {
          if (!modules.includes(mod.name)) continue;
          const hasEntity = mod.symbols.some((uid) => {
            const sym = this.model.symbols.get(uid);
            return sym && sym.name === entity.name;
          });
          if (hasEntity) { entities.push(entity.name); break; }
        }
      }

      // Find events from these modules
      const events: string[] = [];
      for (const mod of this.model.modules) {
        if (!modules.includes(mod.name)) continue;
        for (const uid of mod.symbols) {
          const sym = this.model.symbols.get(uid);
          if (sym && sym.kind === "class" && (sym.name.endsWith("Event") || sym.name.endsWith("IntegrationEvent"))) {
            events.push(sym.name);
          }
        }
      }

      // Check cross-context coupling
      let crossContextDeps = 0;
      for (const rel of this.model.relations) {
        if (rel.type === "composes") continue;
        const srcMod = this.findModuleForSymbol(rel.source);
        const tgtSym = this.model.symbols.get(rel.target);
        const tgtMod = tgtSym ? this.findModuleForSymbol(rel.target) : undefined;
        if (srcMod && tgtMod && modules.includes(srcMod) && !modules.includes(tgtMod)) {
          crossContextDeps++;
        }
      }

      contexts.push({
        name: prefix,
        modules,
        entities,
        events,
        isClean: crossContextDeps < 5,
      });
    }

    return contexts.filter((c) => c.modules.length > 0).sort((a, b) => b.entities.length - a.entities.length);
  }

  private detectCommunicationPatterns(): EventFlowReport["communicationPatterns"] {
    const patterns: EventFlowReport["communicationPatterns"] = [];

    // Check for event bus
    const hasEventBus = this.model.modules.some((m) => m.name.toLowerCase().includes("eventbus") || m.name.toLowerCase().includes("messagebus"));
    if (hasEventBus) {
      patterns.push({ type: "Event Bus", description: "Asynchronous event-driven communication via message bus", modules: this.model.modules.filter((m) => m.name.toLowerCase().includes("eventbus") || m.name.toLowerCase().includes("rabbitmq") || m.name.toLowerCase().includes("kafka")).map((m) => m.name) });
    }

    // Check for gRPC
    const hasGrpc = [...this.model.symbols.values()].some((s) => s.filePath.toLowerCase().includes("grpc") || s.name.toLowerCase().includes("grpc"));
    if (hasGrpc) {
      patterns.push({ type: "gRPC", description: "Synchronous high-performance RPC communication", modules: this.model.modules.filter((m) => m.symbols.some((uid) => { const s = this.model.symbols.get(uid); return s && (s.filePath.includes("Grpc") || s.filePath.includes("grpc")); })).map((m) => m.name) });
    }

    // Check for REST API
    if (this.model.apiEndpoints.length > 0) {
      patterns.push({ type: "REST API", description: `${this.model.apiEndpoints.length} HTTP endpoints for synchronous communication`, modules: [...new Set(this.model.apiEndpoints.map((ep) => { for (const mod of this.model.modules) { if (mod.symbols.some((uid) => this.model.symbols.get(uid)?.filePath === ep.filePath)) return mod.name; } return "unknown"; }))] });
    }

    // Check for background processors
    const processors = this.model.modules.filter((m) => m.name.toLowerCase().includes("processor") || m.name.toLowerCase().includes("worker") || m.name.toLowerCase().includes("job"));
    if (processors.length > 0) {
      patterns.push({ type: "Background Processing", description: "Asynchronous background job processing", modules: processors.map((m) => m.name) });
    }

    return patterns;
  }

  private findModule(uid: string): string {
    for (const mod of this.model.modules) {
      if (mod.symbols.includes(uid)) return mod.name;
    }
    return "unknown";
  }

  private findModuleForSymbol(uidOrPath: string): string | undefined {
    for (const mod of this.model.modules) {
      if (mod.symbols.includes(uidOrPath)) return mod.name;
      const sym = this.model.symbols.get(uidOrPath);
      if (sym) {
        for (const mUid of mod.symbols) {
          const mSym = this.model.symbols.get(mUid);
          if (mSym && mSym.filePath === sym.filePath) return mod.name;
        }
      }
    }
    return undefined;
  }
}
