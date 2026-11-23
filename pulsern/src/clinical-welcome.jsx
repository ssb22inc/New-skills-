/* Shown once, after the clinical perk lands, and never inside the installed app. */
import React from "react";
import InstallCard, { isStandalone } from "./install.jsx";
import { CLINICAL_COPY } from "./clinical.js";

export function ClinicalPerk() {
  return (
    <section className="auth-perk" aria-label="Clinical student perk">
      <p className="auth-perk-kicker">{CLINICAL_COPY.perkEyebrow}</p>
      <p className="auth-perk-title">{CLINICAL_COPY.perkTitle}</p>
      <p className="auth-perk-body">{CLINICAL_COPY.perkBody}</p>
    </section>
  );
}

export default function ClinicalWelcome({ onStart }) {
  if (isStandalone()) return null;
  return (
    <main className="auth-wrap clinical-welcome">
      <style>{`
        .auth-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center;
          background: #f6f7f9; font-family: 'Archivo', system-ui, -apple-system, sans-serif; padding: 16px; }
        .auth-card { background: #fff; border: 1px solid #e3e6ea; border-radius: 16px; padding: 32px;
          width: 100%; max-width: 400px; box-shadow: 0 4px 24px rgba(20,30,50,.06); }
        .auth-logo { font-size: 22px; font-weight: 800; letter-spacing: -0.02em; color: #0e6e5c; margin: 0 0 2px; }
        .auth-motto { font-size: 13px; font-style: italic; color: #0e6e5c; font-weight: 600; margin: 0 0 10px; }
        .clinical-welcome h2 { font-size: 22px; line-height: 1.25; margin: 0 0 8px; color: #102f2a; }
        .clinical-welcome .welcome-body { font-size: 14px; line-height: 1.5; color: #1c2430; margin: 0 0 4px; }
        .auth-btn { display: block; width: 100%; margin-top: 16px; padding: 11px 12px; border-radius: 10px; border: 0;
          background: #0e7c6b; color: #fff; font-size: 15px; font-weight: 700; cursor: pointer; min-height: 46px; font-family: inherit; }
        .auth-btn:focus-visible { outline: 2px solid #0e7c6b; outline-offset: 2px; }
      `}</style>
      <div className="auth-card">
        <h1 className="auth-logo">PulseRN</h1>
        <p className="auth-motto">Built by a working hospital RN, for future RNs.</p>
        <h2>{CLINICAL_COPY.welcomeTitle}</h2>
        <p className="welcome-body">{CLINICAL_COPY.welcomeBody}</p>
        <InstallCard
          scope="clinical"
          headline="Add PulseRN to your home screen"
          message="It opens full screen, one tap away, with the study tools you just unlocked."
        />
        <button className="auth-btn" type="button" onClick={onStart}>{CLINICAL_COPY.startLabel}</button>
      </div>
    </main>
  );
}
