import type {
  ArchitectureModel,
  Symbol,
  Relation,
  ApiEndpoint,
  DbEntity,
} from "../models/index.js";

/**
 * Business Process — a human-readable description of what the system does,
 * not just how code is connected.
 */
export interface BusinessProcess {
  id: string;
  name: string;
  description: string;
  category: "data-ingestion" | "analysis" | "api-service" | "presentation" | "alert" | "export";
  dataSources: DataSource[];
  steps: ProcessStep[];
  outputs: ProcessOutput[];
  relatedSymbols: string[]; // uids
}

export interface DataSource {
  name: string;
  type: "file" | "database" | "api" | "user-input" | "config";
  format?: string;
  description: string;
}

export interface ProcessStep {
  order: number;
  name: string;
  description: string;
  algorithm?: string;
  symbolRef?: string; // uid of the function/class
  inputData: string;
  outputData: string;
  details?: string[];
}

export interface ProcessOutput {
  name: string;
  type: "dashboard" | "report" | "api-response" | "database" | "file" | "alert" | "notification";
  format?: string;
  description: string;
}

/**
 * ProcessDetector — analyzes the ArchitectureModel to extract
 * business-level processes, algorithms, and data flows.
 */
export class ProcessDetector {
  detect(model: ArchitectureModel): BusinessProcess[] {
    const processes: BusinessProcess[] = [];

    // 1. Detect data ingestion processes (ETL pipelines)
    processes.push(...this.detectETLProcesses(model));

    // 2. Detect analysis/algorithm processes
    processes.push(...this.detectAnalysisProcesses(model));

    // 3. Detect API service processes
    processes.push(...this.detectAPIProcesses(model));

    // 4. Detect alert/notification processes
    processes.push(...this.detectAlertProcesses(model));

    // 5. Detect presentation processes
    processes.push(...this.detectPresentationProcesses(model));

    return processes;
  }

  private detectETLProcesses(model: ArchitectureModel): BusinessProcess[] {
    const processes: BusinessProcess[] = [];

    // Find adapter/importer classes
    const adapterSymbols = this.findSymbolsByPattern(model, [
      "adapter", "importer", "loader", "reader", "parser", "etl", "ingest",
      "extractor", "transformer", "connector", "source",
    ]);

    if (adapterSymbols.length > 0) {
      const dataSources: DataSource[] = [];
      const steps: ProcessStep[] = [];
      const relatedSymbols: string[] = [];
      let stepOrder = 1;

      // Detect file-based sources
      const csvAdapters = adapterSymbols.filter((s) =>
        s.name.toLowerCase().includes("csv") || s.name.toLowerCase().includes("excel"),
      );
      if (csvAdapters.length > 0) {
        dataSources.push({
          name: "CSV/Excel Files",
          type: "file",
          format: "CSV, XLSX",
          description: "Structured data files exported from POS or pharmacy management systems",
        });
        relatedSymbols.push(...csvAdapters.map((s) => s.uid));

        // Detect methods on the adapter
        const methods = this.getMethodsOf(model, csvAdapters[0]);
        for (const method of methods) {
          const methodName = method.name.split(".").pop() || method.name;
          if (["extract", "read", "load_file", "parse", "read_csv", "read_excel"].some((m) => methodName.includes(m))) {
            steps.push({
              order: stepOrder++,
              name: "Data Extraction",
              description: `Read raw data from source files`,
              algorithm: "File parsing with column mapping",
              symbolRef: method.uid,
              inputData: "Raw CSV/Excel file",
              outputData: "Raw DataFrame",
              details: ["Auto-detect file encoding", "Map column name variations", "Handle multiple sheet formats"],
            });
          }
          if (["transform", "clean", "normalize", "map", "convert"].some((m) => methodName.includes(m))) {
            steps.push({
              order: stepOrder++,
              name: "Data Transformation",
              description: `Clean, normalize, and transform raw data into standard schema`,
              algorithm: "Column mapping + type casting + normalization",
              symbolRef: method.uid,
              inputData: "Raw DataFrame",
              outputData: "Normalized DataFrame",
              details: ["Map 80+ column name variations", "Type casting and validation", "Remove duplicates", "Handle null values"],
            });
          }
          if (["validate", "check", "verify"].some((m) => methodName.includes(m))) {
            steps.push({
              order: stepOrder++,
              name: "Data Validation",
              description: `Validate data integrity and business rules`,
              symbolRef: method.uid,
              inputData: "Normalized DataFrame",
              outputData: "Validated DataFrame",
              details: ["Null checks on required fields", "Duplicate detection", "Range validation", "Referential integrity"],
            });
          }
          if (["load", "save", "insert", "upsert", "persist", "store"].some((m) => methodName.includes(m))) {
            steps.push({
              order: stepOrder++,
              name: "Data Loading",
              description: `Persist validated data to database`,
              symbolRef: method.uid,
              inputData: "Validated DataFrame",
              outputData: "Database records",
              details: ["Upsert logic (insert or update)", "Batch processing", "Transaction management"],
            });
          }
        }
      }

      // Detect database sources
      const dbAdapters = adapterSymbols.filter((s) =>
        s.name.toLowerCase().includes("db") || s.name.toLowerCase().includes("tebeos") ||
        s.name.toLowerCase().includes("sql") || s.name.toLowerCase().includes("database"),
      );
      if (dbAdapters.length > 0) {
        dataSources.push({
          name: "POS Database",
          type: "database",
          format: "MSSQL/Firebird",
          description: "Direct connection to pharmacy POS system database",
        });
        relatedSymbols.push(...dbAdapters.map((s) => s.uid));
      }

      if (steps.length === 0) {
        // Generic ETL steps
        steps.push(
          { order: 1, name: "Extract", description: "Read data from source", inputData: "Source data", outputData: "Raw data", details: [] },
          { order: 2, name: "Transform", description: "Clean and normalize data", inputData: "Raw data", outputData: "Clean data", details: [] },
          { order: 3, name: "Load", description: "Store in database", inputData: "Clean data", outputData: "DB records", details: [] },
        );
      }

      processes.push({
        id: "etl-pipeline",
        name: "Data Ingestion Pipeline",
        description: "ETL process that extracts data from various sources, transforms it into a standard schema, validates it, and loads it into the database.",
        category: "data-ingestion",
        dataSources,
        steps,
        outputs: [
          { name: "Database Records", type: "database", description: "Normalized data stored in relational database tables" },
        ],
        relatedSymbols,
      });
    }

    return processes;
  }

  private detectAnalysisProcesses(model: ArchitectureModel): BusinessProcess[] {
    const processes: BusinessProcess[] = [];

    // Find analyzer classes
    const analyzerSymbols = this.findSymbolsByPattern(model, [
      "analyzer", "analysis", "analytics", "calculator", "engine",
      "processor", "scorer", "classifier", "predictor",
    ]);

    for (const analyzer of analyzerSymbols) {
      if (analyzer.kind !== "class") continue;

      const methods = this.getMethodsOf(model, analyzer);
      const className = analyzer.name;
      const steps: ProcessStep[] = [];
      let stepOrder = 1;

      // Detect specific analysis types
      if (className.toLowerCase().includes("sale") || className.toLowerCase().includes("revenue")) {
        const analysisSteps = this.detectSalesAnalysisSteps(methods, stepOrder);
        steps.push(...analysisSteps);

        processes.push({
          id: `analysis-${className.toLowerCase()}`,
          name: "Sales Analysis Engine",
          description: "Comprehensive sales analytics: revenue trends, top products, temporal patterns, payment breakdown, and cross-sell opportunities.",
          category: "analysis",
          dataSources: [{ name: "Sales Transactions", type: "database", description: "Historical sales records with product, customer, time, and payment data" }],
          steps,
          outputs: [
            { name: "Sales Dashboard", type: "dashboard", description: "Interactive charts showing revenue trends, top products, hourly/daily patterns" },
            { name: "Sales Report", type: "report", format: "PDF/Excel", description: "Periodic sales summary with KPIs and comparisons" },
            { name: "Sales API", type: "api-response", description: "REST endpoints serving sales analytics data" },
          ],
          relatedSymbols: [analyzer.uid, ...methods.map((m) => m.uid)],
        });
      }

      if (className.toLowerCase().includes("stock") || className.toLowerCase().includes("inventory")) {
        const analysisSteps = this.detectStockAnalysisSteps(methods, stepOrder);
        steps.push(...analysisSteps);

        processes.push({
          id: `analysis-${className.toLowerCase()}`,
          name: "Stock & Inventory Analysis Engine",
          description: "Multi-dimensional inventory analysis: ABC/XYZ classification, dead stock detection, expiry tracking, and reorder point calculation.",
          category: "analysis",
          dataSources: [
            { name: "Inventory Records", type: "database", description: "Current stock levels, batch numbers, expiry dates" },
            { name: "Sales History", type: "database", description: "Historical sales for demand calculation" },
          ],
          steps,
          outputs: [
            { name: "Stock Dashboard", type: "dashboard", description: "ABC matrix, stock health, expiry warnings" },
            { name: "Expiry Alerts", type: "alert", description: "Notifications for products approaching expiry date" },
            { name: "Reorder Suggestions", type: "report", description: "Automated purchase order recommendations" },
          ],
          relatedSymbols: [analyzer.uid, ...methods.map((m) => m.uid)],
        });
      }

      if (className.toLowerCase().includes("customer") || className.toLowerCase().includes("rfm") || className.toLowerCase().includes("segment")) {
        const analysisSteps = this.detectCustomerAnalysisSteps(methods, stepOrder);
        steps.push(...analysisSteps);

        processes.push({
          id: `analysis-${className.toLowerCase()}`,
          name: "Customer Intelligence Engine",
          description: "Customer segmentation using RFM analysis, lifetime value estimation, churn prediction, and personalized strategy recommendations.",
          category: "analysis",
          dataSources: [
            { name: "Customer Records", type: "database", description: "Customer profiles, visit history, spending data" },
            { name: "Sales Transactions", type: "database", description: "Purchase history linked to customers" },
          ],
          steps,
          outputs: [
            { name: "Customer Segments", type: "dashboard", description: "RFM segmentation matrix with 9 customer groups" },
            { name: "Churn Alerts", type: "alert", description: "Early warning for at-risk customers" },
            { name: "Retention Strategies", type: "report", description: "Segment-specific action recommendations" },
          ],
          relatedSymbols: [analyzer.uid, ...methods.map((m) => m.uid)],
        });
      }
    }

    return processes;
  }

  private detectSalesAnalysisSteps(methods: Symbol[], startOrder: number): ProcessStep[] {
    const steps: ProcessStep[] = [];
    let order = startOrder;

    const methodMap = new Map(methods.map((m) => [m.name.split(".").pop()?.toLowerCase() || "", m]));

    if (methodMap.has("summary") || methodMap.has("calculate_summary")) {
      steps.push({
        order: order++, name: "Calculate KPIs",
        description: "Compute key performance indicators: total revenue, quantity sold, average basket size, profit margins",
        algorithm: "Aggregation (SUM, AVG, COUNT) on sales transactions grouped by time period",
        symbolRef: (methodMap.get("summary") || methodMap.get("calculate_summary"))?.uid,
        inputData: "Sales transactions", outputData: "KPI metrics",
        details: ["Total revenue = SUM(quantity * unit_price)", "Avg basket = total_revenue / unique_receipts", "Profit margin = (revenue - cost) / revenue * 100"],
      });
    }
    if (methodMap.has("monthly_trend") || methodMap.has("trend")) {
      steps.push({
        order: order++, name: "Trend Analysis",
        description: "Calculate monthly/weekly sales trends with period-over-period growth rates",
        algorithm: "Time-series grouping with growth rate calculation: (current - previous) / previous * 100",
        symbolRef: (methodMap.get("monthly_trend") || methodMap.get("trend"))?.uid,
        inputData: "Sales with timestamps", outputData: "Trend data with growth %",
        details: ["Group by month/week", "Calculate period totals", "Compute growth rate vs previous period", "Detect seasonality patterns"],
      });
    }
    if (methodMap.has("top_products")) {
      steps.push({
        order: order++, name: "Pareto Analysis (Top Products)",
        description: "Rank products by revenue and identify the vital few (80/20 rule)",
        algorithm: "Sort by revenue DESC, calculate cumulative percentage, classify by Pareto threshold",
        symbolRef: methodMap.get("top_products")?.uid,
        inputData: "Sales by product", outputData: "Ranked product list with cumulative %",
        details: ["Group sales by product", "Sort by total revenue descending", "Calculate cumulative % of total", "Mark 80% threshold (vital few vs trivial many)"],
      });
    }
    if (methodMap.has("hourly_distribution") || methodMap.has("day_of_week_distribution")) {
      steps.push({
        order: order++, name: "Temporal Pattern Analysis",
        description: "Discover sales patterns by hour of day and day of week for staffing optimization",
        algorithm: "Distribution analysis: group by time dimension, calculate frequency and revenue per slot",
        symbolRef: (methodMap.get("hourly_distribution") || methodMap.get("day_of_week_distribution"))?.uid,
        inputData: "Sales with timestamps", outputData: "Hourly/daily distribution",
        details: ["Extract hour/weekday from timestamp", "Count transactions per slot", "Calculate revenue per slot", "Identify peak hours/days"],
      });
    }
    if (methodMap.has("payment_type_breakdown")) {
      steps.push({
        order: order++, name: "Payment Analysis",
        description: "Break down sales by payment method to understand customer payment preferences",
        algorithm: "Group by payment_type, aggregate count and total amount",
        symbolRef: methodMap.get("payment_type_breakdown")?.uid,
        inputData: "Sales with payment type", outputData: "Payment breakdown",
      });
    }
    if (methodMap.has("cross_sell_analysis")) {
      steps.push({
        order: order++, name: "Cross-Sell Analysis",
        description: "Find products frequently purchased together to optimize shelf placement and promotions",
        algorithm: "Market basket analysis: find co-occurrence patterns in same-receipt purchases",
        symbolRef: methodMap.get("cross_sell_analysis")?.uid,
        inputData: "Sales grouped by receipt", outputData: "Product pair frequencies",
        details: ["Group products by receipt_no", "Generate product pairs within each receipt", "Count pair frequencies", "Rank by co-occurrence"],
      });
    }

    return steps;
  }

  private detectStockAnalysisSteps(methods: Symbol[], startOrder: number): ProcessStep[] {
    const steps: ProcessStep[] = [];
    let order = startOrder;
    const methodMap = new Map(methods.map((m) => [m.name.split(".").pop()?.toLowerCase() || "", m]));

    if (methodMap.has("abc_analysis") || methodMap.has("classify")) {
      steps.push({
        order: order++, name: "ABC Classification",
        description: "Classify inventory by value contribution using Pareto principle",
        algorithm: "Sort items by annual consumption value (unit_cost * annual_demand). A = top 20% (80% value), B = next 30% (15% value), C = remaining 50% (5% value)",
        symbolRef: (methodMap.get("abc_analysis") || methodMap.get("classify"))?.uid,
        inputData: "Product costs + sales volumes", outputData: "ABC categories per product",
        details: ["Calculate annual consumption value per product", "Sort descending by value", "Cumulative % calculation", "A: 0-80%, B: 80-95%, C: 95-100%"],
      });
    }
    if (methodMap.has("xyz_analysis") || methodMap.has("classify_xyz")) {
      steps.push({
        order: order++, name: "XYZ Demand Variability Analysis",
        description: "Classify items by demand predictability using coefficient of variation",
        algorithm: "CV = standard_deviation / mean. X: CV < 0.5 (stable), Y: 0.5 < CV < 1.0 (variable), Z: CV > 1.0 (unpredictable)",
        symbolRef: (methodMap.get("xyz_analysis") || methodMap.get("classify_xyz"))?.uid,
        inputData: "Monthly sales quantities per product", outputData: "XYZ categories per product",
        details: ["Calculate monthly demand per product", "Compute mean and std deviation", "Calculate coefficient of variation", "Classify: X (stable), Y (variable), Z (erratic)"],
      });
    }
    if (methodMap.has("abc_xyz_matrix")) {
      steps.push({
        order: order++, name: "ABC-XYZ Matrix",
        description: "Cross-reference ABC (value) and XYZ (variability) to create 9-cell inventory strategy matrix",
        algorithm: "Combine ABC and XYZ classifications: AX (high value, stable) → tight control, CZ (low value, erratic) → minimal control",
        symbolRef: methodMap.get("abc_xyz_matrix")?.uid,
        inputData: "ABC + XYZ classifications", outputData: "9-cell strategy matrix",
        details: ["AX: JIT ordering, tight safety stock", "AY: Regular review, moderate buffer", "AZ: Safety stock + demand sensing", "BX-CZ: Decreasing control intensity"],
      });
    }
    if (methodMap.has("expiry_alerts") || methodMap.has("severity")) {
      steps.push({
        order: order++, name: "Expiry Date Tracking (SKT)",
        description: "Monitor product expiry dates and generate severity-based alerts",
        algorithm: "days_remaining = expiry_date - today. Critical: <30 days, Warning: 30-90 days, Info: 90-180 days",
        symbolRef: (methodMap.get("expiry_alerts") || methodMap.get("severity"))?.uid,
        inputData: "Inventory with expiry dates", outputData: "Prioritized expiry alerts",
        details: ["Calculate days to expiry for each batch", "Classify severity", "Calculate potential loss value", "Sort by urgency"],
      });
    }
    if (methodMap.has("dead_stock")) {
      steps.push({
        order: order++, name: "Dead Stock Detection",
        description: "Identify products with no sales in specified period",
        algorithm: "Filter products where last_sale_date < (today - threshold_days) AND quantity > 0",
        symbolRef: methodMap.get("dead_stock")?.uid,
        inputData: "Inventory + sales history", outputData: "Dead stock list with tied-up capital",
        details: ["Default threshold: 90 days no sales", "Calculate capital tied up", "Suggest liquidation actions"],
      });
    }
    if (methodMap.has("reorder_point")) {
      steps.push({
        order: order++, name: "Reorder Point & EOQ Calculation",
        description: "Calculate optimal reorder point and economic order quantity",
        algorithm: "ROP = (avg_daily_demand * lead_time) + safety_stock. EOQ = sqrt(2 * annual_demand * order_cost / holding_cost)",
        symbolRef: methodMap.get("reorder_point")?.uid,
        inputData: "Demand data + supplier lead times", outputData: "ROP and EOQ per product",
        details: ["Average daily demand from last 90 days", "Safety stock = z_score * std_dev * sqrt(lead_time)", "EOQ Wilson formula", "Service level 95% (z=1.65)"],
      });
    }

    return steps;
  }

  private detectCustomerAnalysisSteps(methods: Symbol[], startOrder: number): ProcessStep[] {
    const steps: ProcessStep[] = [];
    let order = startOrder;
    const methodMap = new Map(methods.map((m) => [m.name.split(".").pop()?.toLowerCase() || "", m]));

    if (methodMap.has("rfm_analysis") || methodMap.has("calculate_rfm") || methodMap.has("rfm_scores")) {
      steps.push({
        order: order++, name: "RFM Scoring",
        description: "Score each customer on Recency, Frequency, and Monetary dimensions",
        algorithm: "R = days since last purchase (lower is better). F = total purchase count. M = total spending. Each scored 1-5 using quintiles.",
        symbolRef: (methodMap.get("rfm_analysis") || methodMap.get("calculate_rfm") || methodMap.get("rfm_scores"))?.uid,
        inputData: "Customer purchase history", outputData: "RFM scores (1-5 each dimension)",
        details: ["Recency: days since last visit, scored 5 (recent) to 1 (old)", "Frequency: total visits, quintile scoring", "Monetary: total spend, quintile scoring", "Composite score: R*100 + F*10 + M"],
      });
    }
    if (methodMap.has("segment") || methodMap.has("segment_customers") || methodMap.has("rfm_segments")) {
      steps.push({
        order: order++, name: "Customer Segmentation",
        description: "Map RFM scores to 9 actionable customer segments with tailored strategies",
        algorithm: "Rule-based mapping: Champions (R>=4,F>=4,M>=4), At Risk (R<=2,F>=3), Lost (R=1,F=1), etc.",
        symbolRef: (methodMap.get("segment") || methodMap.get("segment_customers"))?.uid,
        inputData: "RFM scores per customer", outputData: "9 customer segments",
        details: [
          "Champions: High R, F, M → Reward program, early access",
          "Loyal: High F → Upsell, loyalty program",
          "Potential Loyalists: Recent, moderate F → Nurture to loyal",
          "New Customers: Very recent, low F → Onboarding flow",
          "Promising: Recent, low F/M → Engage with offers",
          "Need Attention: Medium all → Re-engage campaign",
          "At Risk: Low R, high F/M → Win-back urgently",
          "Hibernating: Low R, low F → Reactivation attempt",
          "Lost: Lowest all → Accept or deep discount"
        ],
      });
    }
    if (methodMap.has("clv") || methodMap.has("lifetime_value") || methodMap.has("customer_value")) {
      steps.push({
        order: order++, name: "Customer Lifetime Value (CLV)",
        description: "Estimate future revenue potential of each customer",
        algorithm: "CLV = avg_purchase_value * purchase_frequency * customer_lifespan. Adjusted for churn probability.",
        symbolRef: (methodMap.get("clv") || methodMap.get("lifetime_value"))?.uid,
        inputData: "Purchase history + customer tenure", outputData: "CLV estimate per customer",
        details: ["Avg purchase value = total_spend / purchase_count", "Purchase frequency = purchases / active_months", "Lifespan estimate from retention rate", "Discount rate applied for NPV"],
      });
    }
    if (methodMap.has("churn") || methodMap.has("churn_risk") || methodMap.has("at_risk")) {
      steps.push({
        order: order++, name: "Churn Risk Scoring",
        description: "Identify customers likely to stop purchasing",
        algorithm: "Score based on: days since last visit (weight 0.4), declining frequency trend (0.3), declining basket size (0.3)",
        symbolRef: (methodMap.get("churn") || methodMap.get("churn_risk"))?.uid,
        inputData: "Customer visit patterns + spending trends", outputData: "Churn risk score 0-100",
        details: ["Recency decay: exponential weight on days since last visit", "Frequency trend: compare last 3 months vs previous 3", "Value trend: declining basket size", "Combined weighted score"],
      });
    }

    return steps;
  }

  private detectAPIProcesses(model: ArchitectureModel): BusinessProcess[] {
    if (model.apiEndpoints.length === 0) return [];

    // Group endpoints by resource
    const groups = new Map<string, ApiEndpoint[]>();
    for (const ep of model.apiEndpoints) {
      const parts = ep.path.split("/").filter(Boolean);
      const resource = parts.length >= 2 ? parts[1] : parts[0] || "root";
      if (!groups.has(resource)) groups.set(resource, []);
      groups.get(resource)!.push(ep);
    }

    return [{
      id: "api-services",
      name: "API Service Layer",
      description: `REST API serving ${model.apiEndpoints.length} endpoints across ${groups.size} resource groups. Connects frontend dashboard to backend analytics engine.`,
      category: "api-service",
      dataSources: [
        { name: "Analytics Engine", type: "api", description: "Backend analysis results from Sales, Stock, and Customer analyzers" },
        { name: "Database", type: "database", description: "Direct database queries for real-time data" },
      ],
      steps: [...groups.entries()].map(([resource, endpoints], i) => ({
        order: i + 1,
        name: `/${resource} Resource`,
        description: `${endpoints.length} endpoints: ${endpoints.map((e) => e.method).join(", ")}`,
        inputData: "HTTP Request",
        outputData: "JSON Response",
        details: endpoints.map((e) => `${e.method} ${e.path}`),
      })),
      outputs: [
        { name: "JSON API Responses", type: "api-response", format: "JSON", description: "Structured data for frontend consumption" },
      ],
      relatedSymbols: model.apiEndpoints.map((e) => e.handler),
    }];
  }

  private detectAlertProcesses(model: ArchitectureModel): BusinessProcess[] {
    const alertSymbols = this.findSymbolsByPattern(model, [
      "alert", "notification", "warning", "expiry", "threshold",
    ]);

    if (alertSymbols.length === 0) return [];

    return [{
      id: "alert-system",
      name: "Alert & Notification System",
      description: "Monitors inventory and business metrics to generate actionable alerts: expiry warnings, stock-outs, unusual patterns.",
      category: "alert",
      dataSources: [
        { name: "Inventory Data", type: "database", description: "Real-time stock levels and expiry dates" },
        { name: "Sales Velocity", type: "database", description: "Recent sales rates for demand projection" },
      ],
      steps: [
        { order: 1, name: "Threshold Check", description: "Compare current values against configured thresholds", inputData: "Current metrics", outputData: "Threshold violations", details: ["Expiry < 30 days", "Stock below reorder point", "Dead stock > 90 days"] },
        { order: 2, name: "Severity Classification", description: "Assign urgency level to each alert", inputData: "Violations", outputData: "Classified alerts", algorithm: "Rule-based: Critical (immediate action), Warning (plan action), Info (monitor)", details: ["Critical: expired or out-of-stock", "Warning: expiring within 30 days", "Info: approaching thresholds"] },
        { order: 3, name: "Alert Generation", description: "Format and deliver alerts to dashboard and reports", inputData: "Classified alerts", outputData: "User notifications" },
      ],
      outputs: [
        { name: "Dashboard Alerts", type: "alert", description: "Real-time alert badges on dashboard" },
        { name: "Alert Report", type: "report", format: "PDF", description: "Daily/weekly alert summary report" },
      ],
      relatedSymbols: alertSymbols.map((s) => s.uid),
    }];
  }

  private detectPresentationProcesses(model: ArchitectureModel): BusinessProcess[] {
    const uiSymbols = this.findSymbolsByPattern(model, [
      "dashboard", "page", "component", "view", "chart", "table",
    ]);

    if (uiSymbols.length === 0) return [];

    const pages = uiSymbols.filter((s) =>
      s.name.toLowerCase().includes("page") || s.filePath.includes("/app/"),
    );

    return [{
      id: "presentation-layer",
      name: "Interactive Dashboard",
      description: `Web-based analytics dashboard with ${pages.length} pages providing real-time visibility into pharmacy operations.`,
      category: "presentation",
      dataSources: [
        { name: "REST API", type: "api", description: "Backend API endpoints providing analytics data" },
      ],
      steps: pages.map((page, i) => ({
        order: i + 1,
        name: page.name.replace("Page", "").replace("page", ""),
        description: `Interactive view: ${page.filePath}`,
        symbolRef: page.uid,
        inputData: "API responses (JSON)",
        outputData: "Rendered UI",
        details: [],
      })),
      outputs: [
        { name: "Web Dashboard", type: "dashboard", description: "Interactive charts, tables, and KPI cards" },
      ],
      relatedSymbols: uiSymbols.map((s) => s.uid),
    }];
  }

  // ─── Helpers ───────────────────────────────────────────────────

  private findSymbolsByPattern(model: ArchitectureModel, patterns: string[]): Symbol[] {
    const results: Symbol[] = [];
    for (const [, sym] of model.symbols) {
      const nameLower = sym.name.toLowerCase();
      if (patterns.some((p) => nameLower.includes(p))) {
        results.push(sym);
      }
    }
    return results;
  }

  private getMethodsOf(model: ArchitectureModel, classSymbol: Symbol): Symbol[] {
    const methods: Symbol[] = [];
    for (const rel of model.relations) {
      if (rel.source === classSymbol.uid && rel.type === "composes") {
        const method = model.symbols.get(rel.target);
        if (method && method.kind === "method") {
          methods.push(method);
        }
      }
    }
    return methods;
  }
}
