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
import { initTheme } from "./lib/theme.js";
import "./index.css";

initTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<Dashboard />} />
          <Route path="architecture" element={<ArchitectureView />} />
          <Route path="processes" element={<ProcessView />} />
          <Route path="structure" element={<StructureView />} />
          <Route path="stack" element={<ApiStackView />} />
          <Route path="quality" element={<QualityView />} />
          <Route path="events" element={<EventFlowView />} />
          <Route path="onboard" element={<OnboardView />} />
          <Route path="import" element={<ImportView />} />
          <Route path="settings" element={<SettingsView />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
