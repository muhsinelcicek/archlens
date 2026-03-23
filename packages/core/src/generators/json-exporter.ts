import type { ArchitectureModel } from "../models/index.js";

/**
 * Exports ArchitectureModel to JSON/YAML-friendly plain objects.
 * Converts Maps to objects for serialization.
 */
export class JsonExporter {
  constructor(private model: ArchitectureModel) {}

  toJSON(): object {
    return {
      project: this.model.project,
      stats: this.model.stats,
      symbols: Object.fromEntries(this.model.symbols),
      relations: this.model.relations,
      modules: this.model.modules,
      layers: this.model.layers,
      dataFlows: this.model.dataFlows,
      apiEndpoints: this.model.apiEndpoints,
      dbEntities: this.model.dbEntities,
      techRadar: this.model.techRadar,
    };
  }

  toString(pretty = true): string {
    return JSON.stringify(this.toJSON(), null, pretty ? 2 : undefined);
  }
}
