import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { App } from "./app/App.js";
import { Dashboard } from "./app/Dashboard.js";
import { ArchitectureView } from "./app/ArchitectureView.js";
import { DiagramView } from "./app/DiagramView.js";
import { ModulesView } from "./app/ModulesView.js";
import { ApiMapView } from "./app/ApiMapView.js";
import { ProcessView } from "./app/ProcessView.js";
import { SequenceView } from "./app/SequenceView.js";
import { OnboardView } from "./app/OnboardView.js";
import { DriftView } from "./app/DriftView.js";
import { SettingsView } from "./app/SettingsView.js";
import { QualityView } from "./app/QualityView.js";
import { initTheme } from "./lib/theme.js";
import "./index.css";

// Apply saved theme
initTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<Dashboard />} />
          <Route path="architecture" element={<ArchitectureView />} />
          <Route path="diagram/:type" element={<DiagramView />} />
          <Route path="processes" element={<ProcessView />} />
          <Route path="sequence" element={<SequenceView />} />
          <Route path="onboard" element={<OnboardView />} />
          <Route path="drift" element={<DriftView />} />
          <Route path="modules" element={<ModulesView />} />
          <Route path="quality" element={<QualityView />} />
          <Route path="settings" element={<SettingsView />} />
          <Route path="endpoints" element={<ApiMapView />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
