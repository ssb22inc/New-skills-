import React from "react";
import { createRoot } from "react-dom/client";
import AuthGate, { ErrorBoundary } from "./auth.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthGate />
    </ErrorBoundary>
  </React.StrictMode>
);
