import type { ArchitectureModel } from "../models/index.js";
import { QualityAnalyzer } from "./quality-analyzer.js";
import { DeadCodeDetector } from "./dead-code-detector.js";

export interface DebtItem {
  category: string;
  description: string;
  estimatedHours: number;
  estimatedCost: number;
  annualCost: number; // ongoing maintenance cost per year
  effort: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
  roi: number; // annualCost / estimatedCost — higher = better ROI
}

export interface TechDebtReport {
  totalEstimatedHours: number;
  totalEstimatedCost: number;
  totalAnnualCost: number;
  items: DebtItem[];
  quickWins: DebtItem[]; // high ROI + low effort
  costPerDeveloperHour: number;
}

/**
 * Calculates technical debt in hours and dollars.
 */
export class TechDebtCalculator {
  private hourlyRate: number;

  constructor(
    private model: ArchitectureModel,
    hourlyRate = 150,
  ) {
    this.hourlyRate = hourlyRate;
  }

  calculate(): TechDebtReport {
    const items: DebtItem[] = [];

    // Dead code
    const deadDetector = new DeadCodeDetector(this.model);
    const deadReport = deadDetector.detect();
    if (deadReport.totalDead > 0) {
      const hours = deadReport.estimatedCleanupLines * 0.01; // ~1 min per line to review+remove
      const annualMaintenance = deadReport.estimatedCleanupLines * 1.5; // $1.5/line/year
      items.push({
        category: "Dead Code",
        description: `${deadReport.totalDead} unused symbols (~${deadReport.estimatedCleanupLines.toLocaleString()} lines)`,
        estimatedHours: Math.round(hours),
        estimatedCost: Math.round(hours * this.hourlyRate),
        annualCost: Math.round(annualMaintenance),
        effort: hours < 20 ? "low" : hours < 80 ? "medium" : "high",
        impact: "medium",
        roi: annualMaintenance / Math.max(hours * this.hourlyRate, 1),
      });
    }

    // God classes
    const quality = new QualityAnalyzer(this.model);
    const qualityReport = quality.analyze();
    const godClasses = qualityReport.modules.flatMap((m) => m.issues.filter((i) => i.rule === "code-smell/god-class"));
    if (godClasses.length > 0) {
      const hours = godClasses.length * 16; // ~2 days per god class
      items.push({
        category: "God Classes",
        description: `${godClasses.length} classes with too many responsibilities`,
        estimatedHours: hours,
        estimatedCost: hours * this.hourlyRate,
        annualCost: godClasses.length * 2400, // $2.4k/year cognitive load
        effort: "high",
        impact: "high",
        roi: (godClasses.length * 2400) / (hours * this.hourlyRate),
      });
    }

    // Long methods
    const longMethods = qualityReport.modules.flatMap((m) => m.issues.filter((i) => i.rule === "complexity/long-method"));
    if (longMethods.length > 0) {
      const hours = longMethods.length * 4;
      items.push({
        category: "Long Methods",
        description: `${longMethods.length} methods exceeding recommended length`,
        estimatedHours: hours,
        estimatedCost: hours * this.hourlyRate,
        annualCost: longMethods.length * 800,
        effort: "medium",
        impact: "medium",
        roi: (longMethods.length * 800) / (hours * this.hourlyRate),
      });
    }

    // Missing interfaces (DI violations)
    const patternViolations = qualityReport.architecturePatterns.flatMap((p) => p.violations);
    if (patternViolations.length > 0) {
      const hours = patternViolations.length * 8;
      items.push({
        category: "Architecture Violations",
        description: `${patternViolations.length} pattern/layer violations`,
        estimatedHours: hours,
        estimatedCost: hours * this.hourlyRate,
        annualCost: patternViolations.length * 1500,
        effort: "medium",
        impact: "high",
        roi: (patternViolations.length * 1500) / (hours * this.hourlyRate),
      });
    }

    // Naming violations
    const namingIssues = qualityReport.totalIssues - godClasses.length - longMethods.length;
    if (namingIssues > 20) {
      const hours = namingIssues * 0.25;
      items.push({
        category: "Code Style",
        description: `${namingIssues} naming/style violations`,
        estimatedHours: Math.round(hours),
        estimatedCost: Math.round(hours * this.hourlyRate),
        annualCost: Math.round(namingIssues * 50),
        effort: "low",
        impact: "low",
        roi: (namingIssues * 50) / Math.max(hours * this.hourlyRate, 1),
      });
    }

    items.sort((a, b) => b.roi - a.roi);

    return {
      totalEstimatedHours: items.reduce((a, i) => a + i.estimatedHours, 0),
      totalEstimatedCost: items.reduce((a, i) => a + i.estimatedCost, 0),
      totalAnnualCost: items.reduce((a, i) => a + i.annualCost, 0),
      items,
      quickWins: items.filter((i) => i.effort === "low" || (i.effort === "medium" && i.roi > 1)).slice(0, 5),
      costPerDeveloperHour: this.hourlyRate,
    };
  }
}
