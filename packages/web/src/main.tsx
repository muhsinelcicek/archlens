import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./app/App.js";
import { Dashboard } from "./app/DashboardClean.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { PageLoader } from "./components/PageLoader.js";
import { initTheme } from "./lib/theme.js";
import "./index.css";

// Lazy loaded merged views
const ArchitectureMergedView = lazy(() => import("./app/ArchitectureMergedView.js").then((m) => ({ default: m.ArchitectureMergedView })));
const FlowsView = lazy(() => import("./app/FlowsCleanView.js").then((m) => ({ default: m.FlowsCleanView })));
const InsightsView = lazy(() => import("./app/InsightsCleanView.js").then((m) => ({ default: m.InsightsCleanView })));
const QualityMergedView = lazy(() => import("./app/QualityMergedView.js").then((m) => ({ default: m.QualityMergedView })));
const SimulatorView = lazy(() => import("./features/simulator/SimulatorPage.js").then((m) => ({ default: m.SimulatorPage })));
const SettingsMergedView = lazy(() => import("./app/SettingsMergedView.js").then((m) => ({ default: m.SettingsMergedView })));

initTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

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
    <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
          <Route path="architecture" element={withBoundary(ArchitectureMergedView)} />
          <Route path="flows" element={withBoundary(FlowsView)} />
          <Route path="insights" element={withBoundary(InsightsView)} />
          <Route path="quality" element={withBoundary(QualityMergedView)} />
          <Route path="simulator" element={withBoundary(SimulatorView)} />
          <Route path="settings" element={withBoundary(SettingsMergedView)} />
        </Route>
      </Routes>
    </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
