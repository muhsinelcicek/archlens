/**
 * DiffCleanView — architecture snapshot comparison.
 * Better empty state: guides user to save first snapshot.
 */

import { useEffect, useState } from "react";
import { GitCompare, Camera, Trash2, Plus, Minus, AlertCircle } from "lucide-react";
import { api, type SnapshotInfo, type DiffResult } from "../services/api-client.js";
import { Card } from "../components/ui/Card.js";
import { Badge } from "../components/ui/Badge.js";
import { PageLoader } from "../components/PageLoader.js";

export function DiffCleanView() {
  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [base, setBase] = useState("");
  const [head, setHead] = useState("current");
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [comparing, setComparing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const data = await api.getSnapshots();
    setSnapshots(data || []);
    setLoading(false);
    if (data && data.length > 0 && !base) setBase(data[0].name);
  };

  useEffect(() => { load(); }, []);

  const saveSnapshot = async () => {
    const name = prompt("Snapshot name (e.g., before-refactor, v1.0):");
    if (!name) return;
    setSaving(true);
    await api.saveSnapshot(name.trim());
    await load();
    setSaving(false);
  };

  const deleteSnapshot = async (name: string) => {
    await api.deleteSnapshot(name);
    await load();
    if (base === name) setBase("");
  };

  const compare = async () => {
    if (!base) return;
    setComparing(true);
    const result = await api.diff(base, head);
    setDiff(result);
    setComparing(false);
  };

  if (loading) return <PageLoader message="Loading snapshots..." />;

  return (
    <div className="p-6 max-w-[900px] mx-auto space-y-4">

      {/* Save button */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--color-text-muted)]">{snapshots.length} snapshots</span>
        <button onClick={saveSnapshot} disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--color-accent)] text-white disabled:opacity-50">
          <Camera className="h-3.5 w-3.5" /> {saving ? "Saving..." : "Save Current"}
        </button>
      </div>

      {/* Empty state */}
      {snapshots.length === 0 && (
        <Card padding="lg">
          <div className="text-center py-8">
            <GitCompare className="h-12 w-12 mx-auto mb-3" style={{ color: "var(--color-accent)", opacity: 0.4 }} />
            <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-1">No snapshots yet</h3>
            <p className="text-xs text-[var(--color-text-muted)] mb-4">
              Save your first architecture snapshot, make changes, save another, then compare.
            </p>
            <button onClick={saveSnapshot}
              className="text-xs px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white font-medium">
              <Camera className="h-3.5 w-3.5 inline mr-1.5" /> Create First Snapshot
            </button>
          </div>
        </Card>
      )}

      {/* Compare controls */}
      {snapshots.length > 0 && (
        <Card padding="md">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="text-[10px] text-[var(--color-text-muted)] uppercase mb-1 block">Base</label>
              <select value={base} onChange={(e) => setBase(e.target.value)}
                className="w-full rounded-lg bg-[var(--color-deep)] border border-[var(--color-border-default)] px-3 py-2 text-xs text-[var(--color-text-primary)] outline-none">
                {snapshots.map((s) => <option key={s.name} value={s.name}>{s.name} ({new Date(s.savedAt).toLocaleDateString()})</option>)}
              </select>
            </div>
            <span className="text-xs text-[var(--color-text-muted)] py-2">vs</span>
            <div className="flex-1">
              <label className="text-[10px] text-[var(--color-text-muted)] uppercase mb-1 block">Head</label>
              <select value={head} onChange={(e) => setHead(e.target.value)}
                className="w-full rounded-lg bg-[var(--color-deep)] border border-[var(--color-border-default)] px-3 py-2 text-xs text-[var(--color-text-primary)] outline-none">
                <option value="current">Current (live)</option>
                {snapshots.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
            </div>
            <button onClick={compare} disabled={!base || comparing}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--color-accent)] text-white disabled:opacity-50">
              {comparing ? "..." : "Compare"}
            </button>
          </div>
        </Card>
      )}

      {/* Diff results */}
      {diff && (
        <div className="space-y-4">
          <Card padding="md">
            <div className="text-xs text-[var(--color-text-secondary)]">{diff.summary || "No architecture changes"}</div>
          </Card>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Modules", added: diff.modulesAdded.length, removed: diff.modulesRemoved.length, changed: diff.modulesChanged.length },
              { label: "Endpoints", added: diff.endpointsAdded.length, removed: diff.endpointsRemoved.length, changed: 0 },
              { label: "Entities", added: diff.entitiesAdded.length, removed: diff.entitiesRemoved.length, changed: 0 },
            ].map((s) => (
              <Card key={s.label} padding="sm">
                <div className="text-[10px] text-[var(--color-text-muted)] uppercase mb-1">{s.label}</div>
                <div className="flex gap-2 text-sm font-bold">
                  <span className="text-emerald-400">+{s.added}</span>
                  <span className="text-red-400">-{s.removed}</span>
                  {s.changed > 0 && <span className="text-amber-400">~{s.changed}</span>}
                </div>
              </Card>
            ))}
          </div>

          {diff.modulesChanged.length > 0 && (
            <Card padding="md">
              <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-2">Changed Modules</h3>
              {diff.modulesChanged.map((m) => (
                <div key={m.name} className="flex items-center justify-between text-xs py-1">
                  <span className="font-mono text-[var(--color-text-primary)]">{m.name}</span>
                  <span className="text-[var(--color-text-muted)]">
                    {m.symbolsDelta > 0 ? "+" : ""}{m.symbolsDelta}s {m.linesDelta > 0 ? "+" : ""}{m.linesDelta}L
                  </span>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {/* Snapshot list */}
      {snapshots.length > 0 && (
        <Card padding="sm">
          <div className="text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-2 px-2">Saved Snapshots</div>
          {snapshots.map((s) => (
            <div key={s.name} className="flex items-center justify-between px-2 py-2 hover:bg-hover rounded-lg group">
              <div>
                <span className="text-xs font-mono text-[var(--color-text-primary)]">{s.name}</span>
                <span className="text-[10px] text-[var(--color-text-muted)] ml-2">{new Date(s.savedAt).toLocaleString()} · {s.stats.files}f · {s.stats.symbols}s</span>
              </div>
              <button onClick={() => deleteSnapshot(s.name)} className="opacity-0 group-hover:opacity-100 p-1 text-[var(--color-text-muted)] hover:text-red-400">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
