import React from "react";
import { createRoot } from "react-dom/client";
import LandingPage from "./landing.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <LandingPage
      onSignIn={() => window.location.assign("/app/sign-in")}
      onStart={() => window.location.assign("/app/sign-up")}
    />
  </React.StrictMode>
);

/* The legacy PWA controlled the entire origin. The public site must stay a
   normal indexable document, so retire only that old root-scoped worker while
   leaving the new /app/ worker untouched. */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const rootScope = `${window.location.origin}/`;
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.filter((registration) => registration.scope === rootScope).map((registration) => registration.unregister())))
      .catch(() => {});
    window.caches?.delete("pulsern-v1").catch(() => {});
  });
}
