import { useEffect, useState } from "react";
import { GitCompare, Plus, Minus, ArrowRight, Camera, Trash2, AlertCircle, CheckCircle2 } from "lucide-react";
import { PageLoader } from "../components/PageLoader.js";
import { apiFetch } from "../lib/api.js";

interface SnapshotInfo {
  name: string;
  savedAt: string;
  stats: { files: number; symbols: number; modules: number };
}

interface DiffResult {
  base: string;
  head: string;
  modulesAdded: string[];
  modulesRemoved: string[];
  modulesChanged: Array<{ name: string; symbolsDelta: number; linesDelta: number }>;
  endpointsAdded: Array<{ method: string; path: string }>;
  endpointsRemoved: Array<{ method: string; path: string }>;
  entitiesAdded: string[];
  entitiesRemoved: string[];
  summary: string;
}

export function DiffView() {
  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [base, setBase] = useState<string>("");
  const [head, setHead] = useState<string>("current");
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [comparing, setComparing] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [snapName, setSnapName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSnapshots = () => {
    apiFetch("/api/snapshots")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => {
        setSnapshots(data);
        setLoading(false);
        if (data.length > 0 && !base) setBase(data[0].name);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadSnapshots(); }, []);

  const saveSnapshot = async () => {
    if (!snapName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: snapName.trim() }),
      });
      if (!res.ok) throw new Error("Failed to save snapshot");
      setShowSaveModal(false);
      setSnapName("");
      loadSnapshots();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteSnapshot = async (name: string) => {
    if (!confirm(`Delete snapshot "${name}"?`)) return;
    await apiFetch(`/api/snapshots/${encodeURIComponent(name)}`, { method: "DELETE" });
    loadSnapshots();
    if (base === name) setBase("");
  };

  const runDiff = async () => {
    if (!base) return;
    setComparing(true);
    setError(null);
    try {
      const res = await fetch("/api/diff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseSnapshot: base, headSnapshot: head }),
      });
      if (!res.ok) throw new Error("Comparison failed");
      const data = await res.json();
      setDiff(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setComparing(false);
    }
  };

  if (loading) return <PageLoader message="Loading snapshots..." />;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <GitCompare className="h-6 w-6 text-archlens-400" /> Architecture Diff
          </h2>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Compare architecture snapshots over time. Track how the system evolved.
          </p>
        </div>
        <button
          onClick={() => setShowSaveModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-archlens-500/15 border border-archlens-500/30 text-archlens-300 text-sm font-medium hover:bg-archlens-500/25 transition-colors"
        >
          <Camera className="h-4 w-4" /> Save Snapshot
        </button>
      </div>

      {/* Compare Bar */}
      {snapshots.length > 0 ? (
        <div className="rounded-xl border border-[var(--color-border-default)] bg-elevated p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="text-[10px] uppercase font-semibold text-[var(--color-text-muted)] mb-1 block">Base</label>
              <select
                value={base}
                onChange={(e) => setBase(e.target.value)}
                className="w-full rounded-lg bg-deep border border-[var(--color-border-default)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-archlens-500/40"
              >
                {snapshots.map((s) => (
                  <option key={s.name} value={s.name}>{s.name} ({new Date(s.savedAt).toLocaleDateString()})</option>
                ))}
              </select>
            </div>
            <ArrowRight className="h-5 w-5 text-[var(--color-text-muted)] mt-5" />
            <div className="flex-1 min-w-[200px]">
              <label className="text-[10px] uppercase font-semibold text-[var(--color-text-muted)] mb-1 block">Head</label>
              <select
                value={head}
                onChange={(e) => setHead(e.target.value)}
                className="w-full rounded-lg bg-deep border border-[var(--color-border-default)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-archlens-500/40"
              >
                <option value="current">Current (live)</option>
                {snapshots.map((s) => (
                  <option key={s.name} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
            <button
              onClick={runDiff}
              disabled={!base || comparing}
              className="mt-5 px-5 py-2 rounded-lg bg-archlens-500 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-archlens-600 transition-colors"
            >
              {comparing ? "Comparing..." : "Compare"}
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--color-border-default)] bg-elevated p-8 text-center">
          <Camera className="h-12 w-12 text-[var(--color-text-muted)] mx-auto mb-3" />
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">No snapshots yet</h3>
          <p className="text-sm text-[var(--color-text-muted)] mt-1 mb-4">
            Save your first snapshot to start tracking architecture evolution.
          </p>
          <button
            onClick={() => setShowSaveModal(true)}
            className="px-4 py-2 rounded-lg bg-archlens-500/15 border border-archlens-500/30 text-archlens-300 text-sm font-medium"
          >
            <Camera className="h-4 w-4 inline mr-2" /> Create First Snapshot
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-400 mt-0.5" />
          <span className="text-sm text-red-300">{error}</span>
        </div>
      )}

      {/* Diff Results */}
      {diff && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="rounded-xl border border-archlens-500/20 bg-archlens-500/5 p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-archlens-400" />
              <span className="text-xs uppercase font-semibold text-[var(--color-text-muted)]">Summary</span>
            </div>
            <p className="text-sm text-[var(--color-text-primary)]">{diff.summary}</p>
          </div>

          {/* Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Modules", added: diff.modulesAdded.length, removed: diff.modulesRemoved.length, changed: diff.modulesChanged.length },
              { label: "Endpoints", added: diff.endpointsAdded.length, removed: diff.endpointsRemoved.length, changed: 0 },
              { label: "Entities", added: diff.entitiesAdded.length, removed: diff.entitiesRemoved.length, changed: 0 },
              { label: "Total Changes", added: diff.modulesAdded.length + diff.endpointsAdded.length + diff.entitiesAdded.length, removed: diff.modulesRemoved.length + diff.endpointsRemoved.length + diff.entitiesRemoved.length, changed: diff.modulesChanged.length },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-[var(--color-border-default)] bg-elevated p-4">
                <div className="text-[10px] uppercase font-semibold text-[var(--color-text-muted)] mb-2">{s.label}</div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-emerald-400 font-bold">+{s.added}</span>
                  <span className="text-red-400 font-bold">−{s.removed}</span>
                  {s.changed > 0 && <span className="text-amber-400 font-bold">~{s.changed}</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Modules: 3-column */}
          <section>
            <h3 className="text-sm font-semibold mb-3">Module Changes</h3>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {/* Added */}
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Plus className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs font-semibold text-emerald-300 uppercase">Added ({diff.modulesAdded.length})</span>
                </div>
                <div className="space-y-1">
                  {diff.modulesAdded.length === 0 && <span className="text-xs text-[var(--color-text-muted)]">None</span>}
                  {diff.modulesAdded.map((m) => (
                    <div key={m} className="text-xs font-mono text-emerald-300 truncate">{m}</div>
                  ))}
                </div>
              </div>
              {/* Removed */}
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Minus className="h-4 w-4 text-red-400" />
                  <span className="text-xs font-semibold text-red-300 uppercase">Removed ({diff.modulesRemoved.length})</span>
                </div>
                <div className="space-y-1">
                  {diff.modulesRemoved.length === 0 && <span className="text-xs text-[var(--color-text-muted)]">None</span>}
                  {diff.modulesRemoved.map((m) => (
                    <div key={m} className="text-xs font-mono text-red-300 truncate">{m}</div>
                  ))}
                </div>
              </div>
              {/* Changed */}
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <GitCompare className="h-4 w-4 text-amber-400" />
                  <span className="text-xs font-semibold text-amber-300 uppercase">Changed ({diff.modulesChanged.length})</span>
                </div>
                <div className="space-y-1 max-h-[300px] overflow-y-auto">
                  {diff.modulesChanged.length === 0 && <span className="text-xs text-[var(--color-text-muted)]">None</span>}
                  {diff.modulesChanged.map((m) => (
                    <div key={m.name} className="text-xs font-mono text-amber-300">
                      {m.name}
                      <span className="text-[10px] text-[var(--color-text-muted)] ml-2">
                        {m.symbolsDelta > 0 ? "+" : ""}{m.symbolsDelta}s {m.linesDelta > 0 ? "+" : ""}{m.linesDelta}L
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Endpoints */}
          {(diff.endpointsAdded.length > 0 || diff.endpointsRemoved.length > 0) && (
            <section>
              <h3 className="text-sm font-semibold mb-3">API Changes</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <div className="text-xs font-semibold text-emerald-300 uppercase mb-2">+ {diff.endpointsAdded.length} endpoints</div>
                  <div className="space-y-1 max-h-[200px] overflow-y-auto">
                    {diff.endpointsAdded.map((e, i) => (
                      <div key={i} className="text-xs font-mono">
                        <span className="text-emerald-400 font-bold mr-2">{e.method}</span>
                        <span className="text-[var(--color-text-secondary)]">{e.path}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                  <div className="text-xs font-semibold text-red-300 uppercase mb-2">− {diff.endpointsRemoved.length} endpoints</div>
                  <div className="space-y-1 max-h-[200px] overflow-y-auto">
                    {diff.endpointsRemoved.map((e, i) => (
                      <div key={i} className="text-xs font-mono">
                        <span className="text-red-400 font-bold mr-2">{e.method}</span>
                        <span className="text-[var(--color-text-secondary)]">{e.path}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Entities */}
          {(diff.entitiesAdded.length > 0 || diff.entitiesRemoved.length > 0) && (
            <section>
              <h3 className="text-sm font-semibold mb-3">Database Changes</h3>
              <div className="flex gap-2 flex-wrap">
                {diff.entitiesAdded.map((e) => (
                  <span key={e} className="px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-xs font-mono text-emerald-300">+ {e}</span>
                ))}
                {diff.entitiesRemoved.map((e) => (
                  <span key={e} className="px-2.5 py-1 rounded-md bg-red-500/10 border border-red-500/20 text-xs font-mono text-red-300">− {e}</span>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Saved Snapshots */}
      {snapshots.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold mb-3">Saved Snapshots ({snapshots.length})</h3>
          <div className="rounded-xl border border-[var(--color-border-default)] overflow-hidden">
            {snapshots.map((s) => (
              <div key={s.name} className="flex items-center justify-between border-t border-[var(--color-border-subtle)] first:border-t-0 px-4 py-3 hover:bg-hover transition-colors">
                <div>
                  <div className="text-sm font-mono text-[var(--color-text-primary)]">{s.name}</div>
                  <div className="text-[10px] text-[var(--color-text-muted)]">
                    {new Date(s.savedAt).toLocaleString()} · {s.stats.files} files · {s.stats.symbols} symbols · {s.stats.modules} modules
                  </div>
                </div>
                <button
                  onClick={() => deleteSnapshot(s.name)}
                  className="p-2 rounded-lg hover:bg-red-500/10 text-[var(--color-text-muted)] hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Save Snapshot Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowSaveModal(false)}>
          <div className="bg-elevated border border-[var(--color-border-default)] rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">Save Current Architecture as Snapshot</h3>
            <input
              type="text"
              value={snapName}
              onChange={(e) => setSnapName(e.target.value)}
              placeholder="e.g., before-refactor, v1.0, sprint-23"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && saveSnapshot()}
              className="w-full rounded-lg bg-deep border border-[var(--color-border-default)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-archlens-500/40 mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 rounded-lg text-sm text-[var(--color-text-secondary)] hover:bg-hover"
              >
                Cancel
              </button>
              <button
                onClick={saveSnapshot}
                disabled={!snapName.trim() || saving}
                className="px-4 py-2 rounded-lg bg-archlens-500 text-white text-sm font-semibold disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
