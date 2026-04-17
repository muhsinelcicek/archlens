import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { App } from "./app/App.js";
import { Dashboard } from "./app/Dashboard.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { PageLoader } from "./components/PageLoader.js";
import { initTheme } from "./lib/theme.js";
import "./index.css";

// Eagerly loaded: Dashboard (landing page)
// Lazy loaded: everything else — each becomes its own chunk
const ArchitectureView = lazy(() => import("./app/ArchitectureView.js").then((m) => ({ default: m.ArchitectureView })));
const ProcessView = lazy(() => import("./app/ProcessView.js").then((m) => ({ default: m.ProcessView })));
const StructureView = lazy(() => import("./app/StructureView.js").then((m) => ({ default: m.StructureView })));
const ApiStackView = lazy(() => import("./app/ApiStackView.js").then((m) => ({ default: m.ApiStackView })));
const QualityView = lazy(() => import("./app/QualityView.js").then((m) => ({ default: m.QualityView })));
const EventFlowView = lazy(() => import("./app/EventFlowView.js").then((m) => ({ default: m.EventFlowView })));
const OnboardView = lazy(() => import("./app/OnboardView.js").then((m) => ({ default: m.OnboardView })));
const ImportView = lazy(() => import("./app/ImportView.js").then((m) => ({ default: m.ImportView })));
const SettingsView = lazy(() => import("./app/SettingsView.js").then((m) => ({ default: m.SettingsView })));
const HotspotsView = lazy(() => import("./app/HotspotsView.js").then((m) => ({ default: m.HotspotsView })));
const DiffView = lazy(() => import("./app/DiffView.js").then((m) => ({ default: m.DiffView })));
const RulesView = lazy(() => import("./app/RulesView.js").then((m) => ({ default: m.RulesView })));
const ReportView = lazy(() => import("./app/ReportView.js").then((m) => ({ default: m.ReportView })));
const InsightsView = lazy(() => import("./app/InsightsView.js").then((m) => ({ default: m.InsightsView })));
const SimulatorView = lazy(() => import("./app/SimulatorView.js").then((m) => ({ default: m.SimulatorView })));

initTheme();

function withBoundary(Component: React.ComponentType) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader message="Loading..." />}>
        <Component />
      </Suspense>
    </ErrorBoundary>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
          <Route path="architecture" element={withBoundary(ArchitectureView)} />
          <Route path="processes" element={withBoundary(ProcessView)} />
          <Route path="structure" element={withBoundary(StructureView)} />
          <Route path="stack" element={withBoundary(ApiStackView)} />
          <Route path="quality" element={withBoundary(QualityView)} />
          <Route path="events" element={withBoundary(EventFlowView)} />
          <Route path="onboard" element={withBoundary(OnboardView)} />
          <Route path="import" element={withBoundary(ImportView)} />
          <Route path="settings" element={withBoundary(SettingsView)} />
          <Route path="hotspots" element={withBoundary(HotspotsView)} />
          <Route path="diff" element={withBoundary(DiffView)} />
          <Route path="rules" element={withBoundary(RulesView)} />
          <Route path="report" element={withBoundary(ReportView)} />
          <Route path="insights" element={withBoundary(InsightsView)} />
          <Route path="simulator" element={withBoundary(SimulatorView)} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
