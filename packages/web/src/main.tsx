import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { App } from "./app/App.js";
import { Dashboard } from "./app/Dashboard.js";
import { DiagramView } from "./app/DiagramView.js";
import { ModulesView } from "./app/ModulesView.js";
import { ApiMapView } from "./app/ApiMapView.js";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<Dashboard />} />
          <Route path="diagram/:type" element={<DiagramView />} />
          <Route path="modules" element={<ModulesView />} />
          <Route path="api" element={<ApiMapView />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
