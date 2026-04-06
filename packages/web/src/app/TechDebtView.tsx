import { useI18n } from "../lib/i18n.js";
import { useState, useEffect } from "react";
import { DollarSign, Clock, TrendingUp, Zap, ArrowRight, ChevronDown, ChevronRight } from "lucide-react";

interface DebtItem {
  category: string; description: string; estimatedHours: number; estimatedCost: number;
  annualCost: number; effort: string; impact: string; roi: number;
}
interface TechDebtReport {
  totalEstimatedHours: number; totalEstimatedCost: number; totalAnnualCost: number;
  items: DebtItem[]; quickWins: DebtItem[]; costPerDeveloperHour: number;
}

const effortColors: Record<string, string> = { low: "#34d399", medium: "#fbbf24", high: "#ef4444" };
const impactColors: Record<string, string> = { low: "#60a5fa", medium: "#fbbf24", high: "#ef4444" };

export function TechDebtView() {
  const [report, setReport] = useState<TechDebtReport | null>(null);
  const [loading, setLoading] = useState(true);
  const { t } = useI18n();
  useEffect(() => {
    fetch("/api/techdebt").then((r) => r.ok ? r.json() : null).then((d) => { setReport(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64 text-[#5a5a70]">Calculating tech debt...</div>;
  if (!report) return <div className="p-6 text-[#5a5a70]">No data</div>;

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-[1000px]">
      <div>
        <h2 className="text-2xl font-bold">{t("debt.title")}</h2>
        <p className="text-sm text-[#5a5a70] mt-1">Estimated cost at ${report.costPerDeveloperHour}/hour developer rate</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5">
          <div className="flex items-center gap-2 mb-2"><DollarSign className="h-4 w-4 text-red-400" /><span className="text-xs text-[#5a5a70] uppercase">Total Fix Cost</span></div>
          <div className="text-3xl font-bold text-red-400">${(report.totalEstimatedCost / 1000).toFixed(0)}k</div>
          <div className="text-xs text-[#5a5a70] mt-1">{report.totalEstimatedHours} hours of work</div>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
          <div className="flex items-center gap-2 mb-2"><Clock className="h-4 w-4 text-amber-400" /><span className="text-xs text-[#5a5a70] uppercase">Annual Maintenance</span></div>
          <div className="text-3xl font-bold text-amber-400">${(report.totalAnnualCost / 1000).toFixed(0)}k</div>
          <div className="text-xs text-[#5a5a70] mt-1">ongoing cost per year</div>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
          <div className="flex items-center gap-2 mb-2"><TrendingUp className="h-4 w-4 text-emerald-400" /><span className="text-xs text-[#5a5a70] uppercase">Best ROI</span></div>
          <div className="text-3xl font-bold text-emerald-400">{report.quickWins.length}</div>
          <div className="text-xs text-[#5a5a70] mt-1">quick wins available</div>
        </div>
      </div>

      {/* Quick Wins */}
      {report.quickWins.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4"><Zap className="h-5 w-5 text-emerald-400" /><h3 className="text-lg font-semibold">Quick Wins (Do This Week)</h3></div>
          <div className="space-y-2">
            {report.quickWins.map((item, i) => (
              <div key={i} className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-center gap-4">
                <div className="text-2xl font-bold text-emerald-400 w-8">{i + 1}</div>
                <div className="flex-1">
                  <div className="font-semibold text-[#e4e4ed]">{item.category}</div>
                  <div className="text-xs text-[#8888a0] mt-0.5">{item.description}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-emerald-400">Saves ${(item.annualCost / 1000).toFixed(1)}k/yr</div>
                  <div className="text-[10px] text-[#5a5a70]">Fix: {item.estimatedHours}h (${(item.estimatedCost / 1000).toFixed(1)}k)</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* All Debt Items */}
      <section>
        <h3 className="text-lg font-semibold mb-4">All Debt Categories</h3>
        <div className="space-y-2">
          {report.items.map((item, i) => (
            <div key={i} className="rounded-xl border border-[#2a2a3a] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-[#e4e4ed]">{item.category}</div>
                  <div className="text-xs text-[#8888a0] mt-0.5">{item.description}</div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <div className="text-sm font-bold text-[#e4e4ed]">${(item.estimatedCost / 1000).toFixed(1)}k</div>
                    <div className="text-[9px] text-[#5a5a70]">fix cost</div>
                  </div>
                  <ArrowRight className="h-3 w-3 text-[#5a5a70]" />
                  <div className="text-center">
                    <div className="text-sm font-bold text-amber-400">${(item.annualCost / 1000).toFixed(1)}k/yr</div>
                    <div className="text-[9px] text-[#5a5a70]">annual cost</div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${effortColors[item.effort]}15`, color: effortColors[item.effort] }}>effort: {item.effort}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${impactColors[item.impact]}15`, color: impactColors[item.impact] }}>impact: {item.impact}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-archlens-500/10 text-archlens-300">ROI: {item.roi.toFixed(1)}x</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
