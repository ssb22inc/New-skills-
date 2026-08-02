/* Add-to-home-screen support.

   Two very different worlds have to be handled here:

   - Chrome, Edge, Samsung Internet and Android browsers fire
     `beforeinstallprompt`, which we capture and replay later. This gives a real
     one-tap install.
   - iOS Safari has no install API at all. Apple never shipped one, so the only
     honest thing a web app can do there is tell the user where the button is.
     Every "install" library that claims otherwise is drawing instructions too.

   Anything already running installed reports display-mode: standalone (or
   navigator.standalone on older iOS), and gets nothing — prompting someone to
   install an app they are already inside is the classic version of this bug. */
import React, { useEffect, useState } from "react";

export function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function platform() {
  const ua = navigator.userAgent || "";
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS/.test(ua) ? "ios-other" : "ios-safari";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

/* One listener for the whole app, installed before React mounts so a prompt
   fired during boot is not lost. */
let deferred = null;
const waiting = new Set();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // stop Chrome's own mini-infobar; we choose the moment
    deferred = e;
    waiting.forEach((fn) => fn(true));
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    waiting.forEach((fn) => fn(false));
  });
}

/* Dismissal is scoped per placement on purpose. Someone who waved this away
   while creating an account has just paid by the time they see it again, which
   is a different enough moment to be worth asking once more. */
const dismissKey = (scope) => `pulsern.install.dismissed.${scope}`;

export default function InstallCard({ tone = "signup", scope = "signup" }) {
  const [canPrompt, setCanPrompt] = useState(Boolean(deferred));
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(dismissKey(scope)) === "1"; } catch { return false; }
  });
  const [done, setDone] = useState(false);
  const plat = platform();

  useEffect(() => {
    waiting.add(setCanPrompt);
    return () => { waiting.delete(setCanPrompt); };
  }, []);

  if (dismissed || done || isStandalone()) return null;

  // Nothing useful to say on desktop unless the browser actually offers it.
  if (plat === "desktop" && !canPrompt) return null;

  const close = () => {
    setDismissed(true);
    try { localStorage.setItem(dismissKey(scope), "1"); } catch { /* private mode */ }
  };

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    setCanPrompt(false);
    if (outcome === "accepted") setDone(true);
  };

  return (
    <div className="install-card">
      {/* Styles travel with the component because it renders in two places that
          do not share a stylesheet: the auth screen and the app shell. The app
          defines these custom properties per theme; the fallbacks after each
          comma are what the auth screen uses, where they are not defined. */}
      <style>{`
        .install-card { margin-top: 16px; padding: 14px; border-radius: 12px;
          background: var(--ok-bg, #f2faf7); border: 1px solid var(--ok-line, #cfe6df); }
        .install-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px;
          color: var(--accent-ink, #0e6e5c); }
        .install-head strong { font-size: 14px; flex: 1; }
        .install-icon { display: flex; color: var(--accent-ink, #0e7c6b); }
        .install-x { background: none; border: 0; color: var(--muted, #6d8a83); font-size: 20px;
          line-height: 1; cursor: pointer; padding: 0 2px; }
        .install-card .small { font-size: 13px; color: var(--muted, #46605a); margin: 0 0 10px; line-height: 1.5; }
        .install-card .install-steps { margin-bottom: 0; }
        .install-btn { display: block; width: 100%; padding: 10px 12px; border-radius: 10px; border: 0;
          background: var(--teal, #0e7c6b); color: var(--btn-ink, #fff); font-size: 14px;
          font-weight: 600; cursor: pointer; }
        @media (prefers-reduced-motion: no-preference) {
          .install-card { animation: install-in .25s ease-out; }
        }
        @keyframes install-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
      `}</style>
      <div className="install-head">
        <span className="install-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="6" y="2" width="12" height="20" rx="2" />
            <path d="M12 6v8M9 11l3 3 3-3" />
          </svg>
        </span>
        <strong>Put PulseRN on your home screen</strong>
        <button className="install-x" type="button" onClick={close} aria-label="Dismiss">×</button>
      </div>

      <p className="small">
        {tone === "paid"
          ? "You've got full access — keep it one tap away. Opens full screen with no address bar."
          : tone === "signup"
          ? "Opens full screen with no address bar, and your streak stays one tap away."
          : "Opens full screen with no address bar — one tap from your home screen."}
      </p>

      {canPrompt ? (
        <button className="btn install-btn" type="button" onClick={install}>Add to home screen</button>
      ) : plat === "ios-safari" ? (
        <p className="small install-steps">
          Tap <strong>Share</strong>{" "}
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "-2px" }} aria-hidden="true">
            <path d="M12 16V4M8 8l4-4 4 4" /><path d="M20 14v6H4v-6" />
          </svg>{" "}
          at the bottom of Safari, then <strong>Add to Home Screen</strong>.
        </p>
      ) : plat === "ios-other" ? (
        <p className="small install-steps">
          On iPhone and iPad only Safari can add apps to the home screen. Open{" "}
          <strong>pulsern.app</strong> in Safari, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
        </p>
      ) : (
        <p className="small install-steps">
          Open your browser's <strong>menu</strong> (⋮) and choose <strong>Add to Home screen</strong> or{" "}
          <strong>Install app</strong>.
        </p>
      )}
    </div>
  );
}
