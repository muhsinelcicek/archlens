import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../lib/i18n.js";
import { useStore } from "../lib/store.js";
import { GitBranch, Loader2, CheckCircle2, AlertCircle, Globe, ArrowRight } from "lucide-react";

export function ImportView() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { fetchModel, fetchDiagrams, fetchProjects } = useStore();
  const [url, setUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ name: string; stats: any } | null>(null);

  const handleSubmit = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/projects/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), branch: branch.trim() || "main" }),
      });

      const data = await res.json();
      if (data.success) {
        setSuccess(data);
        // Refresh store
        await fetchProjects();
        await fetchModel();
        await fetchDiagrams();
      } else {
        setError(data.error || "Failed to add project");
      }
    } catch (err: any) {
      setError(err.message || "Connection error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[80vh] p-6">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-archlens-400 to-archlens-700 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-archlens-500/20">
            <GitBranch className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold">Add GitHub Repository</h2>
          <p className="text-[var(--color-text-muted)] text-sm mt-2">
            Paste a GitHub URL to clone, analyze, and explore the architecture
          </p>
        </div>

        {/* Form */}
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-surface p-6 space-y-4">
          {/* URL Input */}
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-1.5 block">GitHub Repository URL</label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-muted)]" />
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                className="w-full rounded-xl border border-[var(--color-border-default)] bg-deep py-3 pl-10 pr-4 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none focus:border-archlens-500/50 focus:ring-1 focus:ring-archlens-500/20 transition-all"
                disabled={loading}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              />
            </div>
          </div>

          {/* Branch */}
          <div>
            <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-1.5 block">Branch (optional)</label>
            <input
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              className="w-full rounded-xl border border-[var(--color-border-default)] bg-deep py-3 px-4 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none focus:border-archlens-500/50 transition-all"
              disabled={loading}
            />
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={loading || !url.trim()}
            className={`w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all ${
              loading
                ? "bg-archlens-500/20 text-archlens-300 cursor-wait"
                : url.trim()
                  ? "bg-gradient-to-r from-archlens-500 to-archlens-700 text-white hover:shadow-lg hover:shadow-archlens-500/25 hover:scale-[1.01]"
                  : "bg-[var(--color-border-subtle)] text-[var(--color-text-muted)] cursor-not-allowed"
            }`}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Cloning & Analyzing...
              </>
            ) : (
              <>
                <ArrowRight className="h-4 w-4" />
                Add & Analyze
              </>
            )}
          </button>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/20 p-3">
              <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-sm font-medium text-red-300">Failed to add project</div>
                <div className="text-xs text-red-400 mt-0.5">{error}</div>
              </div>
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                <span className="font-semibold text-emerald-300">{success.name} added successfully!</span>
              </div>
              <div className="grid grid-cols-4 gap-3 text-center">
                {[
                  { label: "Files", value: success.stats.files },
                  { label: "Symbols", value: success.stats.symbols },
                  { label: "Modules", value: success.stats.modules },
                  { label: "Lines", value: success.stats.lines?.toLocaleString() },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg bg-emerald-500/10 px-2 py-1.5">
                    <div className="text-sm font-bold text-emerald-300">{s.value}</div>
                    <div className="text-[9px] text-emerald-500 uppercase">{s.label}</div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => navigate("/")}
                className="w-full mt-3 flex items-center justify-center gap-2 rounded-lg bg-emerald-500/20 text-emerald-300 py-2 text-sm font-medium hover:bg-emerald-500/30 transition-colors"
              >
                <ArrowRight className="h-3.5 w-3.5" />
                Go to Dashboard
              </button>
            </div>
          )}
        </div>

        {/* Example repos */}
        <div className="mt-6 text-center">
          <p className="text-[9px] uppercase text-[var(--color-text-muted)] font-semibold mb-2">Try with these repos</p>
          <div className="flex flex-wrap justify-center gap-2">
            {[
              "https://github.com/dotnet/eShop",
              "https://github.com/microsoft/TypeScript",
              "https://github.com/pallets/flask",
            ].map((repo) => (
              <button
                key={repo}
                onClick={() => setUrl(repo)}
                className="text-[10px] font-mono px-2 py-1 rounded-lg bg-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-archlens-300 hover:bg-archlens-500/10 transition-colors"
              >
                {repo.split("/").slice(-2).join("/")}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
