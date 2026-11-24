/* Try before sign-up: GUEST_LIMIT real built-in questions with full
   rationales, the floating lab toolkit (ranges only; the AI lookup and the
   AI tutor need an account), then a "save your progress" moment that
   carries the work into the new account (src/guest.js handoff). */
import React, { useEffect, useMemo, useState } from "react";
import { QBank, QUESTIONS, CATS, Style, Toolkit } from "./App.jsx";
import { LabFab } from "./lab-fab.jsx";
import { OPEN_LABS_EVENT } from "./question-nav.jsx";
import { emptyAbility, updateAbility } from "./ability-engine.js";
import { updateMissSchedule } from "./question-review.js";
import { todayStr } from "./dates.js";
import { comboFor, CAREER } from "./rewards.js";
import { rewardBeat, motionAllowed, GUEST_PREFS } from "./effects.js";
import { RewardsStyle, EcgBeat, Ripple, StreakGlyph, useAnnouncer, comboSpeech } from "./rewards-ui.jsx";
import { freePassPlan } from "./free-pass.js";
import {
  GUEST_LIMIT, guestPool, emptyGuest, loadGuest, saveGuest, guestAnswer, guestRemaining, guestSummary, guestFresh, clearGuest, holdGuestTrial,
} from "./guest.js";

function initialGuest() {
  const g = loadGuest(window.localStorage);
  if (g && (guestFresh(g) || g.log.length === 0)) return g;
  if (g) clearGuest(window.localStorage);
  return emptyGuest(Date.now(), todayStr());
}

export default function GuestTrial({ onSignUp, onSignIn }) {
  const [guest, setGuest] = useState(initialGuest);
  const [deviceSaved, setDeviceSaved] = useState(true);
  const [stage, setStage] = useState(() => (guestRemaining(guest) === 0 ? "save" : "quiz"));
  const [limit] = useState(() => guestRemaining(guest));
  const [labOpen, setLabOpen] = useState(false);
  const [section, setSection] = useState("labs");
  const pool = useMemo(() => guestPool(QUESTIONS), []);
  const ability = guest.ability ?? emptyAbility(CATS);
  const motion = motionAllowed(GUEST_PREFS);
  const [liveRegion, announce] = useAnnouncer();

  useEffect(() => { setDeviceSaved(saveGuest(window.localStorage, guest)); }, [guest]);
  useEffect(() => {
    const open = () => { setSection("labs"); setLabOpen(true); };
    window.addEventListener(OPEN_LABS_EVENT, open);
    return () => window.removeEventListener(OPEN_LABS_EVENT, open);
  }, []);

  /* One answer per render, so the guest in this closure is the state
     before this answer. Same XP rules as an account (src/rewards.js). */
  const record = (q, correct, opts = {}) => {
    const r = guestAnswer(guest, q, correct, { ms: opts.ms ?? Infinity, today: todayStr() });
    if (!r.accepted) return r.res;
    const newBest = r.res.run >= 3 && r.res.run > guest.bestRun;
    const out = { ...r.res, combo: r.res.run > (guest.run || 0) ? comboFor(r.res.run) : null, newBest };
    setGuest({
      ...r.guest,
      ability: updateAbility(guest.ability ?? emptyAbility(CATS), q, correct, {}).ability,
      missSchedule: updateMissSchedule(guest.missSchedule ?? {}, q.id, correct),
    });
    if (out.xp > 0) rewardBeat(out.combo ? "combo" : "correct", GUEST_PREFS);
    announce(comboSpeech(out.combo, newBest));
    return out;
  };

  const leaveForAuth = (go) => {
    holdGuestTrial(guest, window.sessionStorage);
    go?.();
  };
  const answered = guest.log.length;

  return (
    <div className={"app guest tab-qbank" + (stage === "quiz" ? " in-session" : "") + (motion ? "" : " fx-reduced")} data-theme="light">
      <Style />
      <RewardsStyle />
      <GuestStyle />
      {liveRegion}
      <header className="top">
        <a className="brand brand-btn" href="/" aria-label="PulseRN home">
          <span className="pulse-dot" aria-hidden="true" />
          <span className="brand-name">PULSE<em>RN</em></span>
        </a>
        <div className="top-stats">
          <button type="button" className="theme-btn guest-signin" onClick={() => leaveForAuth(onSignIn)}>Sign in</button>
        </div>
      </header>
      <main className="body">
        {stage === "quiz" ? (
          <div className="stack">
            <div className="guest-progress" role="group" aria-label={`${answered} of ${GUEST_LIMIT} trial questions answered`}>
              <p className="guest-kicker mono"><span>Free trial · no account</span><span>{answered} of {GUEST_LIMIT} done</span></p>
              <div className="guest-steps" aria-hidden="true">
                {Array.from({ length: GUEST_LIMIT }, (_, i) => (
                  <span key={i} className={i < answered ? (guest.log[i]?.correct ? "done ok" : "done") : i === answered ? "now" : ""} />
                ))}
              </div>
            </div>
            <QBank record={record} log={guest.log} questions={pool} ability={ability} calibration={{}} missSchedule={guest.missSchedule ?? {}}
              auto autoLimit={limit} onDone={() => setStage("save")} guest onGuestSignIn={() => leaveForAuth(onSignUp)} />
          </div>
        ) : (
          <SaveProgress guest={guest} onSignUp={() => leaveForAuth(onSignUp)} onSignIn={() => leaveForAuth(onSignIn)} motion={motion} deviceSaved={deviceSaved} />
        )}
      </main>
      <footer className="guest-legal">
        <p className="small tip">NCLEX® is a registered trademark of the National Council of State Boards of Nursing, Inc. (NCSBN), which is not affiliated with and does not endorse this product. Educational exam preparation only.</p>
        <p className="small tip"><a href="/legal/">Terms, Privacy, and Disclaimer</a></p>
      </footer>
      <LabFab hidden={labOpen} open={labOpen} settleKey={stage} onOpen={() => { setSection("labs"); setLabOpen(true); }} />
      <Toolkit open={labOpen} section={section} onSection={setSection} onClose={() => setLabOpen(false)} provider="deepseek" guest onGuestSignIn={() => leaveForAuth(onSignUp)} />
    </div>
  );
}

export function SaveProgress({ guest, onSignUp, onSignIn, motion = true, deviceSaved = true }) {
  const sum = guestSummary(guest);
  const next = CAREER[1];
  const days = (() => { try { return freePassPlan().days; } catch { return 7; } })();
  const r = 30, c = 2 * Math.PI * r;
  const toReadiness = Math.max(0, 12 - sum.n);
  return (
    <div className="stack guest-save">
      <section className="card rw-recap" aria-labelledby="guest-save-title">
        <div className="rw-recap-hero">
          {motion && <Ripple />}
          <p className="rw-recap-eyebrow mono">Trial complete</p>
          <div className="rw-recap-main">
            <svg className="rw-ring" width="84" height="84" viewBox="0 0 72 72" role="img" aria-label={`${sum.ok} of ${sum.n} correct`}>
              <circle cx="36" cy="36" r={r} className="rw-ring-track" />
              <circle cx="36" cy="36" r={r} className="rw-ring-fill" strokeDasharray={`${(c * sum.acc) / 100} ${c}`} transform="rotate(-90 36 36)" />
              <text x="36" y="40" textAnchor="middle" className="rw-ring-txt">{sum.ok}/{sum.n}</text>
            </svg>
            <dl className="rw-recap-stats">
              <div><dt>XP</dt><dd className="mono">+{sum.xp}</dd></div>
              <div><dt>Streak</dt><dd className="mono">Day 1</dd></div>
              <div><dt>Best run</dt><dd className="mono">{sum.bestRun}</dd></div>
              <div><dt>Categories</dt><dd className="mono">{sum.cats.length}</dd></div>
            </dl>
          </div>
          <EcgBeat className="hero" />
        </div>
        <h2 id="guest-save-title" className="h2">Save your progress</h2>
        <p className="small">Create your free account and everything from this trial moves in with you. Your {days}-day free pass starts then: the full question bank, case studies, and flashcards.</p>
        <ul className="guest-carry">
          <li><span className="guest-tick" aria-hidden="true" /><span><strong>{sum.n} answers</strong> across {sum.cats.length} client-needs categor{sum.cats.length === 1 ? "y" : "ies"}</span></li>
          <li><span className="guest-tick" aria-hidden="true" /><span>{sum.xp >= next.xp
            ? <><strong>{sum.xp} XP</strong> banked. {next.name} unlocks at {next.answers} answers</>
            : <><strong>{sum.xp} of {next.xp} XP</strong> toward {next.name}</>}</span></li>
          <li><span className="guest-tick" aria-hidden="true" /><span><strong><StreakGlyph /> Day 1</strong> of your study streak</span></li>
          <li><span className="guest-tick" aria-hidden="true" /><span><strong>{toReadiness} more answers</strong> to your first readiness estimate</span></li>
        </ul>
        <div className="row guest-ctas">
          <button type="button" className="btn" onClick={onSignUp}>Create free account</button>
          <button type="button" className="btn ghost" onClick={onSignIn}>I have an account</button>
        </div>
        <p className="small tip">{deviceSaved ? "Saved on this device for 7 days after your last answer. Create your account on this browser to keep it." : "This browser could not store the trial. Create your account before you leave this tab, or the answers are gone."}</p>
      </section>
    </div>
  );
}

function GuestStyle() {
  return (
    <style>{`
      .app.guest .top{justify-content:space-between}
      .app.guest .brand-btn{text-decoration:none;color:var(--ink);min-height:44px;display:flex;align-items:center}
      .guest-signin{min-height:44px;min-width:44px;padding:8px 16px;font-size:13px}
      .guest-progress{display:flex;flex-direction:column;gap:8px}
      .guest-kicker{display:flex;justify-content:space-between;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent-ink);margin:0;font-weight:600}
      .guest-steps{display:grid;grid-template-columns:repeat(${GUEST_LIMIT},1fr);gap:6px}
      .guest-steps span{height:6px;border-radius:99px;background:var(--bar-bg)}
      .guest-steps span.done{background:var(--muted);opacity:.45}
      .guest-steps span.done.ok{background:var(--teal);opacity:1}
      .guest-steps span.now{background:var(--teal);opacity:.45}
      .guest-carry{list-style:none;padding:0;margin:4px 18px 12px;display:flex;flex-direction:column;gap:8px}
      .guest-carry li{display:flex;gap:10px;align-items:center;font-size:14px;color:var(--ink)}
      .guest-tick{width:20px;height:20px;border-radius:50%;background:var(--teal);flex:0 0 auto;position:relative}
      .guest-tick::after{content:"";position:absolute;left:7px;top:4px;width:5px;height:9px;border:solid var(--btn-ink);border-width:0 2px 2px 0;transform:rotate(45deg)}
      .guest-ctas .btn{min-height:48px}
      .app.guest .body{padding-bottom:40px}
    `}</style>
  );
}
