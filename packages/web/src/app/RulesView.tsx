import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ScrollText, Plus, Trash2, Play, AlertCircle, CheckCircle2, XCircle,
  Code2, Layers, Network, FileWarning, Lock, AlertTriangle, Save, Eye, EyeOff,
} from "lucide-react";
import { PageLoader } from "../components/PageLoader.js";
import { apiFetch } from "../lib/api.js";

interface CustomRule {
  id: string;
  name: string;
  description: string;
  severity: "error" | "warning" | "info";
  type: string;
  enabled?: boolean;
  condition: any;
}

interface RuleViolation {
  ruleId: string;
  ruleName: string;
  severity: string;
  message: string;
  filePath?: string;
}

interface ValidationReport {
  totalRules: number;
  totalViolations: number;
  violations: RuleViolation[];
  passedRules: string[];
}

const TEMPLATES: CustomRule[] = [
  {
    id: "tpl-no-domain-to-infra",
    name: "Domain must not depend on Infrastructure",
    description: "DDD: Domain layer should be pure, no infrastructure concerns",
    severity: "error", type: "dependency",
    condition: { kind: "no-dependency", from: ".*\\.Domain", to: ".*\\.Infrastructure" },
  },
  {
    id: "tpl-no-presentation-to-infra",
    name: "Presentation must not depend on Infrastructure",
    description: "Clean Architecture: UI must go through API/application layer",
    severity: "warning", type: "dependency",
    condition: { kind: "no-dependency", from: ".*Web$|.*App$", to: ".*\\.Infrastructure" },
  },
  {
    id: "tpl-interface-naming",
    name: "Interfaces must start with I (C#)",
    description: "C# convention: interfaces prefixed with I",
    severity: "warning", type: "naming",
    condition: { kind: "naming-pattern", symbol_kind: "interface", pattern: "^I[A-Z]" },
  },
  {
    id: "tpl-module-size",
    name: "Module symbol limit (300)",
    description: "Modules should not exceed 300 symbols (avoid god modules)",
    severity: "warning", type: "structure",
    condition: { kind: "max-symbols", module_pattern: ".*", max: 300 },
  },
  {
    id: "tpl-controllers-layer",
    name: "Controllers only in API layer",
    description: "Controller classes should live in api layer only",
    severity: "info", type: "structure",
    condition: { kind: "layer-only", module_pattern: ".*Controller.*", allowed_layers: ["api", "presentation"] },
  },
  {
    id: "tpl-no-circular",
    name: "No circular dependencies",
    description: "Detect circular module dependencies",
    severity: "error", type: "dependency",
    condition: { kind: "no-circular", modules: [] },
  },
];

const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  "tpl-no-domain-to-infra": <Layers className="h-5 w-5" />,
  "tpl-no-presentation-to-infra": <Network className="h-5 w-5" />,
  "tpl-interface-naming": <Code2 className="h-5 w-5" />,
  "tpl-module-size": <FileWarning className="h-5 w-5" />,
  "tpl-controllers-layer": <Lock className="h-5 w-5" />,
  "tpl-no-circular": <AlertTriangle className="h-5 w-5" />,
};

const SEV_COLORS: Record<string, string> = { error: "#ef4444", warning: "#f97316", info: "#60a5fa" };

export function RulesView() {
  const navigate = useNavigate();
  const [rules, setRules] = useState<CustomRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [jsonView, setJsonView] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/rules")
      .then((r) => r.ok ? r.json() : { rules: [] })
      .then((d) => {
        setRules(d.rules || []);
        setJsonText(JSON.stringify(d.rules || [], null, 2));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const saveRules = async (next: CustomRule[]) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: next }),
      });
      if (!res.ok) throw new Error("Save failed");
      setRules(next);
      setJsonText(JSON.stringify(next, null, 2));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const addTemplate = (tpl: CustomRule) => {
    if (rules.some((r) => r.id === tpl.id)) return;
    saveRules([...rules, { ...tpl, enabled: true }]);
  };

  const deleteRule = (id: string) => {
    saveRules(rules.filter((r) => r.id !== id));
  };

  const toggleRule = (id: string) => {
    saveRules(rules.map((r) => r.id === id ? { ...r, enabled: r.enabled === false ? true : false } : r));
  };

  const runRules = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/rules/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: rules.filter((r) => r.enabled !== false) }),
      });
      if (!res.ok) throw new Error("Validation failed");
      const data = await res.json();
      setValidation(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  const saveJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed)) throw new Error("Must be an array of rules");
      saveRules(parsed);
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) return <PageLoader message="Loading rules..." />;

  const violationsByRule = new Map<string, RuleViolation[]>();
  if (validation) {
    for (const v of validation.violations) {
      if (!violationsByRule.has(v.ruleId)) violationsByRule.set(v.ruleId, []);
      violationsByRule.get(v.ruleId)!.push(v);
    }
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ScrollText className="h-6 w-6 text-archlens-400" /> Architecture Rules
          </h2>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Define rules to enforce architectural decisions and detect violations automatically.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setJsonView(!jsonView)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-border-subtle)] border border-[var(--color-border-default)] text-[var(--color-text-secondary)] text-xs font-medium hover:text-[var(--color-text-primary)]"
          >
            {jsonView ? <><EyeOff className="h-3.5 w-3.5" /> Visual</> : <><Eye className="h-3.5 w-3.5" /> JSON</>}
          </button>
          <button
            onClick={runRules}
            disabled={running || rules.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-archlens-500/15 border border-archlens-500/30 text-archlens-300 text-sm font-medium hover:bg-archlens-500/25 disabled:opacity-50"
          >
            <Play className="h-4 w-4" /> {running ? "Running..." : "Run All Rules"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-400 mt-0.5" />
          <span className="text-sm text-red-300">{error}</span>
        </div>
      )}

      {/* JSON View */}
      {jsonView && (
        <section>
          <h3 className="text-sm font-semibold mb-2">Rules JSON</h3>
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            className="w-full h-[400px] rounded-xl bg-deep border border-[var(--color-border-default)] p-4 text-xs font-mono text-[var(--color-text-primary)] outline-none focus:border-archlens-500/40"
          />
          <button
            onClick={saveJson}
            className="mt-2 flex items-center gap-2 px-4 py-2 rounded-lg bg-archlens-500 text-white text-sm font-semibold"
          >
            <Save className="h-4 w-4" /> Save JSON
          </button>
        </section>
      )}

      {/* Templates */}
      {!jsonView && (
        <section>
          <h3 className="text-sm font-semibold mb-3">Pre-built Templates</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {TEMPLATES.map((tpl) => {
              const added = rules.some((r) => r.id === tpl.id);
              const sev = SEV_COLORS[tpl.severity];
              return (
                <div
                  key={tpl.id}
                  className="rounded-xl border border-[var(--color-border-default)] bg-elevated p-4 flex flex-col"
                >
                  <div className="flex items-center gap-2 mb-2" style={{ color: sev }}>
                    {TEMPLATE_ICONS[tpl.id]}
                    <span className="text-[10px] uppercase font-semibold">{tpl.severity}</span>
                  </div>
                  <h4 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">{tpl.name}</h4>
                  <p className="text-xs text-[var(--color-text-muted)] flex-1">{tpl.description}</p>
                  <button
                    onClick={() => addTemplate(tpl)}
                    disabled={added}
                    className={`mt-3 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                      added
                        ? "bg-emerald-500/10 text-emerald-400 cursor-default"
                        : "bg-archlens-500/10 text-archlens-300 hover:bg-archlens-500/20"
                    }`}
                  >
                    {added ? <><CheckCircle2 className="h-3.5 w-3.5 inline mr-1" /> Added</> : <><Plus className="h-3.5 w-3.5 inline mr-1" /> Add</>}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* My Rules */}
      {!jsonView && (
        <section>
          <h3 className="text-sm font-semibold mb-3">
            My Rules ({rules.length}) {saving && <span className="text-[10px] text-[var(--color-text-muted)] ml-2">Saving...</span>}
          </h3>
          {rules.length === 0 ? (
            <div className="rounded-xl border border-[var(--color-border-default)] bg-elevated p-6 text-center">
              <ScrollText className="h-10 w-10 text-[var(--color-text-muted)] mx-auto mb-2" />
              <p className="text-sm text-[var(--color-text-muted)]">No rules defined. Add a template above to get started.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rules.map((rule) => {
                const sev = SEV_COLORS[rule.severity];
                const violations = violationsByRule.get(rule.id) || [];
                const enabled = rule.enabled !== false;
                return (
                  <div key={rule.id} className="rounded-xl border border-[var(--color-border-default)] bg-elevated overflow-hidden">
                    <div className="flex items-center gap-3 p-4">
                      <button
                        onClick={() => toggleRule(rule.id)}
                        className={`relative w-10 h-5 rounded-full transition-colors ${enabled ? "bg-archlens-500" : "bg-[var(--color-border-default)]"}`}
                      >
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"}`} />
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-semibold ${enabled ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)]"}`}>{rule.name}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase" style={{ backgroundColor: `${sev}15`, color: sev }}>
                            {rule.severity}
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-border-subtle)] text-[var(--color-text-muted)]">{rule.type}</span>
                        </div>
                        <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{rule.description}</p>
                      </div>
                      {validation && (
                        <span className={`text-[10px] px-2 py-1 rounded-full font-semibold ${
                          violations.length > 0 ? "bg-red-500/15 text-red-400" : "bg-emerald-500/15 text-emerald-400"
                        }`}>
                          {violations.length > 0 ? `${violations.length} violations` : "✓ passing"}
                        </span>
                      )}
                      <button
                        onClick={() => deleteRule(rule.id)}
                        className="p-2 rounded-lg hover:bg-red-500/10 text-[var(--color-text-muted)] hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {violations.length > 0 && (
                      <div className="border-t border-[var(--color-border-default)] bg-deep px-4 py-2 max-h-[200px] overflow-y-auto">
                        {violations.slice(0, 5).map((v, i) => (
                          <div
                            key={i}
                            onClick={() => v.filePath && (sessionStorage.setItem("archlens-goto-file", v.filePath), navigate("/architecture"))}
                            className="flex items-start gap-2 py-1 text-xs cursor-pointer hover:text-[var(--color-text-primary)]"
                          >
                            <XCircle className="h-3 w-3 mt-0.5 text-red-400 flex-shrink-0" />
                            <span className="text-[var(--color-text-secondary)]">{v.message}</span>
                          </div>
                        ))}
                        {violations.length > 5 && (
                          <div className="text-[10px] text-[var(--color-text-muted)] mt-1">+{violations.length - 5} more</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Violations Summary */}
      {validation && (
        <section className="rounded-xl border border-[var(--color-border-default)] bg-elevated p-5">
          <h3 className="text-sm font-semibold mb-3">Validation Report</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-[var(--color-border-subtle)] p-3">
              <div className="text-[10px] uppercase text-[var(--color-text-muted)]">Total Rules</div>
              <div className="text-2xl font-bold text-[var(--color-text-primary)]">{validation.totalRules}</div>
            </div>
            <div className="rounded-lg bg-[var(--color-border-subtle)] p-3">
              <div className="text-[10px] uppercase text-[var(--color-text-muted)]">Passed</div>
              <div className="text-2xl font-bold text-emerald-400">{validation.passedRules.length}</div>
            </div>
            <div className="rounded-lg bg-[var(--color-border-subtle)] p-3">
              <div className="text-[10px] uppercase text-[var(--color-text-muted)]">Violations</div>
              <div className="text-2xl font-bold text-red-400">{validation.totalViolations}</div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
