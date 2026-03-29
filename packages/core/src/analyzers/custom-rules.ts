import type { ArchitectureModel, Symbol, Module } from "../models/index.js";

export interface CustomRule {
  id: string;
  name: string;
  description: string;
  severity: "error" | "warning" | "info";
  type: "dependency" | "naming" | "structure" | "layer";
  condition: RuleCondition;
}

export type RuleCondition =
  | { kind: "no-dependency"; from: string; to: string }
  | { kind: "must-implement"; class_pattern: string; interface_name: string }
  | { kind: "naming-pattern"; symbol_kind: string; pattern: string }
  | { kind: "max-symbols"; module_pattern: string; max: number }
  | { kind: "layer-only"; module_pattern: string; allowed_layers: string[] }
  | { kind: "no-circular"; modules: string[] };

export interface RuleViolation {
  ruleId: string;
  ruleName: string;
  severity: string;
  message: string;
  filePath?: string;
  symbolRef?: string;
}

export interface CustomRulesReport {
  totalRules: number;
  totalViolations: number;
  violations: RuleViolation[];
  passedRules: string[];
}

/**
 * CustomRuleEngine — evaluates user-defined architecture rules.
 * Rules can be defined in YAML/JSON and checked in CI.
 */
export class CustomRuleEngine {
  constructor(
    private model: ArchitectureModel,
    private rules: CustomRule[],
  ) {}

  evaluate(): CustomRulesReport {
    const violations: RuleViolation[] = [];
    const passedRules: string[] = [];

    for (const rule of this.rules) {
      const ruleViolations = this.evaluateRule(rule);
      if (ruleViolations.length === 0) {
        passedRules.push(rule.id);
      } else {
        violations.push(...ruleViolations);
      }
    }

    return {
      totalRules: this.rules.length,
      totalViolations: violations.length,
      violations,
      passedRules,
    };
  }

  private evaluateRule(rule: CustomRule): RuleViolation[] {
    const { condition } = rule;

    switch (condition.kind) {
      case "no-dependency":
        return this.checkNoDependency(rule, condition.from, condition.to);
      case "naming-pattern":
        return this.checkNaming(rule, condition.symbol_kind, condition.pattern);
      case "max-symbols":
        return this.checkMaxSymbols(rule, condition.module_pattern, condition.max);
      case "layer-only":
        return this.checkLayerOnly(rule, condition.module_pattern, condition.allowed_layers);
      default:
        return [];
    }
  }

  private checkNoDependency(rule: CustomRule, fromPattern: string, toPattern: string): RuleViolation[] {
    const violations: RuleViolation[] = [];
    const fromMods = this.model.modules.filter((m) => m.name.match(new RegExp(fromPattern, "i")));
    const toMods = this.model.modules.filter((m) => m.name.match(new RegExp(toPattern, "i")));

    for (const rel of this.model.relations) {
      if (rel.type === "composes") continue;
      for (const fm of fromMods) {
        if (!fm.symbols.includes(rel.source)) continue;
        const tgtSym = this.model.symbols.get(rel.target);
        if (!tgtSym) continue;
        for (const tm of toMods) {
          if (tm.symbols.some((uid) => this.model.symbols.get(uid)?.filePath === tgtSym.filePath)) {
            violations.push({
              ruleId: rule.id, ruleName: rule.name, severity: rule.severity,
              message: `${fm.name} depends on ${tm.name} — forbidden by rule "${rule.name}"`,
              filePath: rel.source,
            });
          }
        }
      }
    }
    return violations;
  }

  private checkNaming(rule: CustomRule, symbolKind: string, pattern: string): RuleViolation[] {
    const violations: RuleViolation[] = [];
    const regex = new RegExp(pattern);

    for (const [uid, sym] of this.model.symbols) {
      if (sym.kind !== symbolKind) continue;
      const name = sym.name.split(".").pop() || sym.name;
      if (!regex.test(name)) {
        violations.push({
          ruleId: rule.id, ruleName: rule.name, severity: rule.severity,
          message: `${sym.kind} "${name}" doesn't match pattern /${pattern}/`,
          filePath: sym.filePath, symbolRef: uid,
        });
      }
    }
    return violations;
  }

  private checkMaxSymbols(rule: CustomRule, modulePattern: string, max: number): RuleViolation[] {
    const violations: RuleViolation[] = [];
    const regex = new RegExp(modulePattern, "i");

    for (const mod of this.model.modules) {
      if (!regex.test(mod.name)) continue;
      if (mod.symbols.length > max) {
        violations.push({
          ruleId: rule.id, ruleName: rule.name, severity: rule.severity,
          message: `Module "${mod.name}" has ${mod.symbols.length} symbols (max: ${max})`,
        });
      }
    }
    return violations;
  }

  private checkLayerOnly(rule: CustomRule, modulePattern: string, allowedLayers: string[]): RuleViolation[] {
    const violations: RuleViolation[] = [];
    const regex = new RegExp(modulePattern, "i");

    for (const mod of this.model.modules) {
      if (!regex.test(mod.name)) continue;
      if (!allowedLayers.includes(mod.layer)) {
        violations.push({
          ruleId: rule.id, ruleName: rule.name, severity: rule.severity,
          message: `Module "${mod.name}" is in "${mod.layer}" layer but should be in: ${allowedLayers.join(", ")}`,
        });
      }
    }
    return violations;
  }

  // ── Default Rules ──

  static getDefaultRules(): CustomRule[] {
    return [
      {
        id: "no-domain-to-infra",
        name: "Domain must not depend on Infrastructure",
        description: "Domain layer should be independent of infrastructure concerns",
        severity: "error",
        type: "dependency",
        condition: { kind: "no-dependency", from: ".*\\.Domain", to: ".*\\.Infrastructure" },
      },
      {
        id: "no-presentation-to-infra",
        name: "Presentation must not depend on Infrastructure directly",
        description: "UI should go through application/API layer",
        severity: "warning",
        type: "dependency",
        condition: { kind: "no-dependency", from: ".*App$|.*Web$|Client", to: ".*\\.Infrastructure" },
      },
      {
        id: "interface-naming",
        name: "Interfaces must start with I (C#)",
        description: "C# convention: interfaces prefixed with I",
        severity: "warning",
        type: "naming",
        condition: { kind: "naming-pattern", symbol_kind: "interface", pattern: "^I[A-Z]" },
      },
      {
        id: "module-size-limit",
        name: "Module symbol limit",
        description: "Modules should not exceed 300 symbols",
        severity: "warning",
        type: "structure",
        condition: { kind: "max-symbols", module_pattern: ".*", max: 300 },
      },
    ];
  }
}
