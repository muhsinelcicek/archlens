import type { ArchitectureModel, Symbol, ApiEndpoint } from "../models/index.js";

export interface SequenceStep {
  from: string; // symbol name or "Client"
  to: string;   // symbol name
  action: string; // method call, HTTP request, DB query
  returnType?: string;
  fromModule?: string;
  toModule?: string;
  depth: number;
}

export interface SequenceDiagram {
  id: string;
  title: string;
  trigger: string; // what starts this sequence
  participants: Array<{ name: string; module: string; kind: string }>;
  steps: SequenceStep[];
}

/**
 * SequenceTracer — traces call chains from an entry point
 * to generate sequence diagrams.
 */
export class SequenceTracer {
  private symbolMap: Map<string, Symbol>;
  private callGraph: Map<string, string[]>; // uid → [called uids]
  private uidToModule: Map<string, string>;

  constructor(private model: ArchitectureModel) {
    this.symbolMap = model.symbols;
    this.callGraph = new Map();
    this.uidToModule = new Map();

    // Build call graph
    for (const rel of model.relations) {
      if (rel.type === "calls" || rel.type === "imports") {
        if (!this.callGraph.has(rel.source)) this.callGraph.set(rel.source, []);
        this.callGraph.get(rel.source)!.push(rel.target);
      }
    }

    // Build uid→module map
    for (const mod of model.modules) {
      for (const uid of mod.symbols) {
        this.uidToModule.set(uid, mod.name);
      }
    }
  }

  /**
   * Trace from an API endpoint
   */
  traceEndpoint(endpoint: ApiEndpoint): SequenceDiagram {
    const handlerSym = this.symbolMap.get(endpoint.handler);
    const handlerName = handlerSym?.name || endpoint.handler;
    const handlerModule = this.uidToModule.get(endpoint.handler) || "?";

    const steps: SequenceStep[] = [];
    const participants = new Map<string, { name: string; module: string; kind: string }>();

    // Client → Handler
    participants.set("Client", { name: "Client", module: "external", kind: "actor" });
    participants.set(endpoint.handler, { name: handlerName, module: handlerModule, kind: handlerSym?.kind || "function" });

    steps.push({
      from: "Client",
      to: handlerName,
      action: `${endpoint.method} ${endpoint.path}`,
      fromModule: "external",
      toModule: handlerModule,
      depth: 0,
    });

    // Trace calls from handler
    this.traceCallsFrom(endpoint.handler, steps, participants, 1, new Set());

    // Handler → Client (response)
    steps.push({
      from: handlerName,
      to: "Client",
      action: "Response",
      returnType: endpoint.responseType,
      fromModule: handlerModule,
      toModule: "external",
      depth: 0,
    });

    return {
      id: `seq-${endpoint.method}-${endpoint.path.replace(/\//g, "-")}`,
      title: `${endpoint.method} ${endpoint.path}`,
      trigger: `${endpoint.method} ${endpoint.path}`,
      participants: [...participants.values()],
      steps,
    };
  }

  /**
   * Trace from any symbol
   */
  traceSymbol(uid: string): SequenceDiagram {
    const sym = this.symbolMap.get(uid);
    if (!sym) return { id: "empty", title: "Unknown", trigger: uid, participants: [], steps: [] };

    const steps: SequenceStep[] = [];
    const participants = new Map<string, { name: string; module: string; kind: string }>();
    const module = this.uidToModule.get(uid) || "?";

    participants.set(uid, { name: sym.name, module, kind: sym.kind });
    this.traceCallsFrom(uid, steps, participants, 0, new Set());

    return {
      id: `seq-${sym.name}`,
      title: sym.name,
      trigger: sym.name,
      participants: [...participants.values()],
      steps,
    };
  }

  /**
   * Generate sequence diagrams for all API endpoints
   */
  traceAllEndpoints(): SequenceDiagram[] {
    return this.model.apiEndpoints.map((ep) => this.traceEndpoint(ep));
  }

  private traceCallsFrom(
    uid: string,
    steps: SequenceStep[],
    participants: Map<string, { name: string; module: string; kind: string }>,
    depth: number,
    visited: Set<string>,
  ): void {
    if (depth > 5) return; // Max depth
    if (visited.has(uid)) return; // Prevent cycles
    visited.add(uid);

    const calledUids = this.callGraph.get(uid) || [];
    const callerSym = this.symbolMap.get(uid);
    const callerName = callerSym?.name || uid;
    const callerModule = this.uidToModule.get(uid) || "?";

    for (const targetUid of calledUids) {
      const targetSym = this.symbolMap.get(targetUid);
      if (!targetSym) continue;

      const targetModule = this.uidToModule.get(targetUid) || "?";

      // Skip self-calls within same symbol
      if (targetUid === uid) continue;

      // Register participant
      if (!participants.has(targetUid)) {
        participants.set(targetUid, { name: targetSym.name, module: targetModule, kind: targetSym.kind });
      }

      // Determine action description
      let action = targetSym.name.split(".").pop() || targetSym.name;
      if (targetSym.kind === "method") {
        action = `${action}()`;
      }

      steps.push({
        from: callerName,
        to: targetSym.name,
        action,
        returnType: targetSym.returnType,
        fromModule: callerModule,
        toModule: targetModule,
        depth,
      });

      // Recursively trace
      this.traceCallsFrom(targetUid, steps, participants, depth + 1, visited);
    }
  }
}
