import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import AuthGate, { ErrorBoundary } from "./auth.jsx";
import { enforceOneTimeAppRelogin } from "./app-routing.js";
import { supabase } from "./supabase.js";

function AppEntry() {
  const [state, setState] = useState("checking");

  useEffect(() => {
    let active = true;
    enforceOneTimeAppRelogin({ auth: supabase.auth, storage: window.localStorage, href: window.location.href })
      .then(() => { if (active) setState("ready"); })
      .catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, []);

  if (state === "checking") return <main className="app-entry"><h1>PulseRN</h1><p>Preparing your secure study session…</p></main>;
  if (state === "error") return <main className="app-entry"><h1>PulseRN</h1><p>Your previous session could not be cleared safely.</p><button type="button" onClick={() => window.location.reload()}>Try again</button></main>;
  return <AuthGate />;
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppEntry />
    </ErrorBoundary>
  </React.StrictMode>
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/app-sw.js", { scope: "/app/" }).catch(() => {
      /* Installation is optional; the study interface remains fully usable. */
    });
  });
}
