import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { App } from "./app/App.js";
import { Dashboard } from "./app/Dashboard.js";
import { ArchitectureView } from "./app/ArchitectureView.js";
import { ProcessView } from "./app/ProcessView.js";
import { StructureView } from "./app/StructureView.js";
import { ApiStackView } from "./app/ApiStackView.js";
import { QualityView } from "./app/QualityView.js";
import { EventFlowView } from "./app/EventFlowView.js";
import { OnboardView } from "./app/OnboardView.js";
import { ImportView } from "./app/ImportView.js";
import { SettingsView } from "./app/SettingsView.js";
import { HotspotsView } from "./app/HotspotsView.js";
import { DiffView } from "./app/DiffView.js";
import { RulesView } from "./app/RulesView.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { initTheme } from "./lib/theme.js";
import "./index.css";

initTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
          <Route path="architecture" element={<ErrorBoundary><ArchitectureView /></ErrorBoundary>} />
          <Route path="processes" element={<ErrorBoundary><ProcessView /></ErrorBoundary>} />
          <Route path="structure" element={<ErrorBoundary><StructureView /></ErrorBoundary>} />
          <Route path="stack" element={<ErrorBoundary><ApiStackView /></ErrorBoundary>} />
          <Route path="quality" element={<ErrorBoundary><QualityView /></ErrorBoundary>} />
          <Route path="events" element={<ErrorBoundary><EventFlowView /></ErrorBoundary>} />
          <Route path="onboard" element={<ErrorBoundary><OnboardView /></ErrorBoundary>} />
          <Route path="import" element={<ErrorBoundary><ImportView /></ErrorBoundary>} />
          <Route path="settings" element={<ErrorBoundary><SettingsView /></ErrorBoundary>} />
          <Route path="hotspots" element={<ErrorBoundary><HotspotsView /></ErrorBoundary>} />
          <Route path="diff" element={<ErrorBoundary><DiffView /></ErrorBoundary>} />
          <Route path="rules" element={<ErrorBoundary><RulesView /></ErrorBoundary>} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
