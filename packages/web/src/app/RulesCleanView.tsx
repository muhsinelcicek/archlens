/**
 * RulesCleanView — custom architecture rules with good empty state.
 */

import { useState } from "react";
import { ScrollText, Plus, Trash2, Play, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { useRules as useRulesQuery } from "../services/queries.js";
import { api } from "../services/api-client.js";
import { Card } from "../components/ui/Card.js";
import { Badge } from "../components/ui/Badge.js";
import { PageLoader } from "../components/PageLoader.js";

interface Rule { id: string; name: string; description: string; severity: string; type: string; condition: any; enabled?: boolean; }
interface Violation { ruleId: string; ruleName: string; severity: string; message: string; filePath?: string; }

const TEMPLATES: Rule[] = [
  { id: "tpl-no-domain-infra", name: "Domain → Infrastructure forbidden", description: "DDD: domain layer must not depend on infrastructure", severity: "error", type: "dependency", condition: { kind: "no-dependency", from: ".*Domain", to: ".*Infrastructure" } },
  { id: "tpl-module-size", name: "Module size limit (200 symbols)", description: "Avoid god modules", severity: "warning", type: "structure", condition: { kind: "max-symbols", module_pattern: ".*", max: 200 } },
  { id: "tpl-no-presentation-infra", name: "Presentation → Infrastructure forbidden", description: "UI should go through API/application layer", severity: "warning", type: "dependency", condition: { kind: "no-dependency", from: ".*App$|.*Web$|Client", to: ".*Infrastructure" } },
  { id: "tpl-interface-naming", name: "Interfaces start with I (C#)", description: "C# convention", severity: "info", type: "naming", condition: { kind: "naming-pattern", symbol_kind: "interface", pattern: "^I[A-Z]" } },
];

export function RulesCleanView() {
  const rulesQuery = useRulesQuery();
  const [rules, setRules] = useState<Rule[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [running, setRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [rulesLoaded, setRulesLoaded] = useState(false);

  // Load rules once
  if (!rulesLoaded && rulesQuery.data?.rules) {
    setRules(rulesQuery.data.rules);
    setRulesLoaded(true);
  }

  const saveAndSync = async (next: Rule[]) => {
    setRules(next);
    await api.saveRules(next);
  };

  const addTemplate = (tpl: Rule) => {
    if (rules.some((r) => r.id === tpl.id)) return;
    saveAndSync([...rules, { ...tpl, enabled: true }]);
  };

  const removeRule = (id: string) => saveAndSync(rules.filter((r) => r.id !== id));

  const runValidation = async () => {
    setRunning(true);
    const result = await api.validateRules(rules.filter((r) => r.enabled !== false));
    if (result) setViolations((result as any).violations || []);
    setRunning(false);
    setHasRun(true);
  };

  if (rulesQuery.isLoading) return <PageLoader message="Loading rules..." />;

  return (
    <div className="p-6 max-w-[900px] mx-auto space-y-4">

      {/* No rules empty state */}
      {rules.length === 0 && (
        <Card padding="lg">
          <div className="text-center py-8">
            <ScrollText className="h-12 w-12 mx-auto mb-3" style={{ color: "var(--color-accent)", opacity: 0.4 }} />
            <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-1">No rules defined</h3>
            <p className="text-xs text-[var(--color-text-muted)] mb-4">Add rules to enforce architectural decisions automatically.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {TEMPLATES.map((tpl) => (
                <button key={tpl.id} onClick={() => addTemplate(tpl)}
                  className="text-xs px-3 py-2 rounded-lg border border-[var(--color-border-default)] bg-elevated hover:bg-hover text-[var(--color-text-secondary)] transition-colors">
                  <Plus className="h-3 w-3 inline mr-1" />{tpl.name}
                </button>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Rules list */}
      {rules.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--color-text-muted)]">{rules.length} rules</span>
            <div className="flex gap-2">
              {TEMPLATES.filter((t) => !rules.some((r) => r.id === t.id)).length > 0 && (
                <select onChange={(e) => { const tpl = TEMPLATES.find((t) => t.id === e.target.value); if (tpl) addTemplate(tpl); e.target.value = ""; }}
                  className="text-[10px] rounded-lg bg-elevated border border-[var(--color-border-default)] px-2 py-1.5 text-[var(--color-text-muted)] outline-none">
                  <option value="">+ Add template...</option>
                  {TEMPLATES.filter((t) => !rules.some((r) => r.id === t.id)).map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              )}
              <button onClick={runValidation} disabled={running}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
                style={{ backgroundColor: "rgba(var(--color-accent-rgb, 139,92,246), 0.15)", color: "var(--color-accent)", border: "1px solid rgba(var(--color-accent-rgb, 139,92,246), 0.3)" }}>
                <Play className="h-3.5 w-3.5" /> {running ? "Running..." : "Run All"}
              </button>
            </div>
          </div>

          {rules.map((rule) => {
            const ruleViolations = violations.filter((v) => v.ruleId === rule.id);
            const passed = hasRun && ruleViolations.length === 0;
            return (
              <Card key={rule.id} padding="sm">
                <div className="flex items-center gap-3 p-1">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[var(--color-text-primary)]">{rule.name}</span>
                      <Badge variant={rule.severity === "error" ? "error" : rule.severity === "warning" ? "warning" : "info"} size="xs">{rule.severity}</Badge>
                      {hasRun && (
                        passed
                          ? <Badge variant="success" size="xs"><CheckCircle2 className="h-2.5 w-2.5 inline" /> passed</Badge>
                          : <Badge variant="error" size="xs">{ruleViolations.length} violations</Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{rule.description}</p>
                  </div>
                  <button onClick={() => removeRule(rule.id)} className="p-1.5 rounded-md text-[var(--color-text-muted)] hover:text-red-400 hover:bg-red-500/10">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {ruleViolations.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-[var(--color-border-subtle)] space-y-1">
                    {ruleViolations.slice(0, 5).map((v, i) => (
                      <div key={i} className="flex items-start gap-2 text-[10px]">
                        <XCircle className="h-3 w-3 text-red-400 mt-0.5 flex-shrink-0" />
                        <span className="text-[var(--color-text-secondary)]">{v.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
