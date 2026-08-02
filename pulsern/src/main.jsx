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

/* Service worker: registered after load so it never competes with first paint.
   Its main job is installability — without a registered worker Chrome refuses
   to offer "Add to Home screen" no matter how complete the manifest is — with
   offline shell caching as the secondary benefit. Registration failing is not
   fatal: the app runs identically, it just cannot be installed. */
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* unsupported, blocked by policy, or private mode — app still works */
    });
  });
}
