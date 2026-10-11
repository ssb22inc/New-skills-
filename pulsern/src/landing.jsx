import React from "react";
import { planById } from "./pricing.js";

const freePassLabel = planById("pass1").name.toLowerCase();

const FEATURES = [
  ["Retrieval practice", "You learn by pulling the answer out of memory. Every session starts with a question, not a lecture."],
  ["Spaced repetition", "What you miss comes back on a real calendar date, right before you would forget it, so it is there on exam day."],
  ["Adaptive practice", "PulseRN finds your weak spots across the eight NCSBN client-needs categories and works them until they are strengths."],
  ["A plan for each day", "A focused Today round, and a weekly plan built around your exam date, so you always know what to do next."],
  ["Visual study cards", "ABGs, potassium and ECG changes, IV fluids, insulin, isolation, and pressure injuries, drawn so the concept clicks."],
  ["The study library", "10,000+ practice questions, 500+ case studies, 1,100+ flashcards, dosage calculation, and an AI tutor when you want another explanation."],
];

const FAQ = [
  ["Who created PulseRN?", "Sheldon Bennett, a working hospital RN. He built PulseRN from how people actually learn and remember under pressure, then engineered the study loop around that."],
  ["Does PulseRN use real NCLEX questions?", "No. Practice is original and built around NCSBN's published test plan and item formats. PulseRN is not affiliated with NCSBN, and NCLEX is a registered trademark of NCSBN."],
  ["Can PulseRN tell me whether I will pass?", "No. Readiness is an estimate of your work inside PulseRN. It shows you what to practice next. It does not predict or guarantee an NCLEX result."],
  ["How is the content checked?", "Practice questions, case studies, flashcards, and readiness items are built around the published test plan and pass automated quality checks before they go live. That is not a per-question sign-off by a human. Public study guides are source-cited and approved by Sheldon Bennett, RN."],
  ["Is there a free option?", `Yes. A ${freePassLabel}, no card needed, covers study content. Readiness self-assessments are included with paid plans.`],
];

const SAMPLES = [
  ["Pharmacology", "Five questions on high-alert medications, reversal agents, monitoring, and label-based safety.", "/learn/nclex-pharmacology-practice-questions/"],
  ["Prioritization", "Five questions on emergency recognition, change from baseline, assessment, action, and evaluation.", "/learn/nclex-prioritization-practice-questions/"],
  ["Dosage calculations", "Five worked questions covering tablets, liquids, pump rates, gravity tubing, and weight-based math.", "/learn/nclex-dosage-calculation-practice-questions/"],
  ["NGN bow-tie", "Five text-based bow-tie examples connecting a condition, two actions, and two parameters.", "/learn/ngn-bow-tie-practice-questions/"],
];

const COMPARISONS = [
  ["PulseRN vs UWorld", "Compare AI study help, question-bank scale, lab access, media depth, RN accountability, and current public pricing.", "/compare/pulsern-vs-uworld/"],
  ["PulseRN vs Archer Review", "Compare an app built by a working hospital RN with high-volume readiness, CAT, video, and live-support packages.", "/compare/pulsern-vs-archer/"],
  ["PulseRN vs Kaplan", "Compare a focused self-directed app with Kaplan’s strategy instruction, CAT practice, classes, and tutoring tiers.", "/compare/pulsern-vs-kaplan/"],
];

export default function LandingPage({ onSignIn, onStart }) {
  return (
    <div className="landing-shell">
      <style>{`
        :root { color-scheme: light; }
        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; }
        body { margin: 0; }
        .landing-shell { min-height: 100vh; background: #f4f8f6; color: #102f2a;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; line-height: 1.55; }
        .landing-shell a { color: #096d5d; text-underline-offset: 3px; }
        .landing-shell a:focus-visible, .landing-shell button:focus-visible { outline: 3px solid #f4b942; outline-offset: 3px; }
        .land-container { width: min(1120px, calc(100% - 36px)); margin: 0 auto; }
        .land-nav { min-height: 72px; display: flex; align-items: center; gap: 24px; }
        .land-brand { color: #0c5f52; font-size: 22px; font-weight: 850; letter-spacing: -.035em; text-decoration: none; }
        .land-links { display: flex; align-items: center; gap: 22px; margin-left: auto; }
        .land-links a { color: #36534d; font-size: 14px; font-weight: 650; text-decoration: none; }
        .land-button { border: 0; border-radius: 11px; background: #0e7c6b; color: white; cursor: pointer;
          font: inherit; font-weight: 750; padding: 11px 17px; box-shadow: 0 8px 20px rgba(14,124,107,.15); }
        .land-button.secondary { background: white; color: #0e6e5c; border: 1px solid #b9d2ca; box-shadow: none; }
        .land-hero { display: grid; grid-template-columns: 1.05fr .95fr; align-items: center; gap: 68px; padding: 72px 0 80px; }
        .land-eyebrow { color: #0e6e5c; font-size: 13px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
        .land-hero h1 { max-width: 700px; font-size: clamp(42px, 6vw, 70px); line-height: 1.02; letter-spacing: -.052em; margin: 14px 0 20px; }
        .land-hero h1 span { color: #0e7c6b; }
        .land-lead { color: #36534d; font-size: clamp(18px, 2vw, 21px); max-width: 650px; margin: 0; }
        .land-actions { display: flex; flex-wrap: wrap; gap: 11px; margin: 28px 0 17px; }
        .land-note { color: #4d665f; font-size: 13px; margin: 0; }
        .land-product { position: relative; margin:0; background: #0d302b; border-radius: 26px; padding: 14px;
          box-shadow: 0 30px 70px rgba(15,46,41,.22); transform: rotate(1deg); }
        .land-product:before { content: ""; position: absolute; inset: -20px 32px auto -22px; height: 130px;
          background: #8fd7c4; opacity: .32; filter: blur(45px); z-index: -1; }
        .land-product-top { display:flex; align-items:center; gap:7px; color:#b8d9d1; font-size:12px; padding:2px 3px 14px; }
        .land-dot { width:8px; height:8px; border-radius:50%; background:#72ccb5; }
        .land-question { background:white; color:#173b34; border-radius:17px; padding:24px; transform: rotate(-1deg); }
        .land-kicker { color:#0e7c6b; font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; }
        .land-question h2 { font-size:19px; line-height:1.35; margin:8px 0 18px; }
        .land-option { border:1px solid #d6e3df; border-radius:9px; padding:10px 12px; margin-top:8px; font-size:13px; color:#415d56; }
        .land-option.selected { border-color:#0e7c6b; background:#e9f5f1; color:#0b5b4e; font-weight:700; }
        .land-product-image { display:block; width:100%; height:auto; border-radius:17px; background:#f4f8f6; }
        .land-product-caption { color:#d7ebe6; font-size:12px; padding:11px 5px 1px; }
        .land-proof { background: #0e7c6b; color: white; }
        .land-proof-grid { display:grid; grid-template-columns: 1.25fr repeat(3, 1fr); gap:1px; }
        .land-proof-cell { padding:25px 28px; background:rgba(0,0,0,.04); min-height:120px; display:flex; flex-direction:column; justify-content:center; }
        .land-proof-cell b { font-size:20px; letter-spacing:-.02em; }
        .land-proof-cell span { color:#fff; font-size:13px; margin-top:4px; }
        .land-section { padding: 82px 0; }
        .land-section.white { background: white; }
        .land-section-head { max-width:740px; margin-bottom:36px; }
        .land-section h2 { font-size:clamp(30px, 4vw, 46px); line-height:1.08; letter-spacing:-.035em; margin:10px 0 12px; }
        .land-section-head p { color:#506b64; font-size:17px; margin:0; }
        .land-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:16px; }
        .land-sample-grid { display:grid; grid-template-columns:repeat(2, 1fr); gap:16px; }
        .land-card { background:#f7faf8; border:1px solid #dbe7e3; border-radius:16px; padding:23px; }
        .land-card-link { display:block; color:inherit !important; text-decoration:none; }
        .land-card-link:hover { border-color:#72b9a8; box-shadow:0 10px 30px rgba(14,124,107,.09); }
        .land-card-num { width:34px; height:34px; display:grid; place-items:center; border-radius:10px; background:#dff1eb; color:#0e6e5c; font-weight:850; }
        .land-card h3 { font-size:18px; margin:18px 0 8px; }
        .land-card p { color:#4b665f; font-size:14px; margin:0; }
        .land-screen-grid { display:grid; grid-template-columns:1.35fr .65fr; gap:22px; align-items:start; }
        .land-screen { margin:0; background:#0d302b; border:1px solid #1a4e45; border-radius:20px; padding:10px; box-shadow:0 18px 42px rgba(15,46,41,.14); }
        .land-screen img { display:block; width:100%; height:auto; border-radius:13px; background:#f4f8f6; }
        .land-screen figcaption { color:#d7ebe6; padding:13px 8px 6px; font-size:14px; }
        .land-screen figcaption strong { color:white; display:block; font-size:16px; margin-bottom:3px; }
        .land-screen-note { color:#506b64; font-size:13px; margin:18px 0 0; }
        .land-how { display:grid; grid-template-columns:.9fr 1.1fr; gap:64px; align-items:start; }
        .land-steps { display:grid; gap:13px; }
        .land-step { background:white; border:1px solid #dbe7e3; border-radius:14px; padding:20px; display:grid; grid-template-columns:auto 1fr; gap:16px; }
        .land-step b { color:#0e7c6b; font-size:14px; }
        .land-step h3 { margin:0 0 4px; font-size:17px; }
        .land-step p { margin:0; color:#4c665f; font-size:14px; }
        .land-author { display:grid; grid-template-columns:auto 1fr; gap:22px; align-items:center; background:#e8f4f0; border-radius:18px; padding:26px; margin-top:34px; }
        .land-avatar { width:64px; height:64px; border-radius:18px; display:grid; place-items:center; background:#0e7c6b; color:white; font-weight:850; font-size:19px; }
        .land-author p { margin:3px 0 0; color:#425e57; }
        .land-faq { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
        .land-faq details { background:white; border:1px solid #dbe7e3; border-radius:13px; padding:18px 20px; }
        .land-faq summary { cursor:pointer; font-weight:760; }
        .land-faq p { color:#48635c; font-size:14px; margin:12px 0 0; }
        .land-final { padding:72px 0; background:#0d302b; color:white; text-align:center; }
        .land-final h2 { font-size:clamp(30px, 4vw, 46px); margin:0 0 12px; letter-spacing:-.035em; }
        .land-final p { color:#c5e1da; margin:0 auto 24px; max-width:620px; }
        .land-footer { background:#09241f; color:#b5ccc6; padding:34px 0; font-size:13px; }
        .land-footer-row { display:flex; justify-content:space-between; gap:30px; align-items:start; }
        .land-footer-links { display:flex; flex-wrap:wrap; gap:15px; }
        .land-footer a { color:#d1e6e0; }
        .land-disclaimer { max-width:740px; margin:18px 0 0; color:#91ada5; font-size:11.5px; }
        @media (max-width: 820px) {
          .land-links a:not(.keep) { display:none; }
          .land-hero, .land-how { grid-template-columns:1fr; gap:42px; }
          .land-hero { padding-top:48px; }
          .land-product { max-width:540px; }
          .land-screen-grid { grid-template-columns:1fr 1fr; }
          .land-proof-grid { grid-template-columns:1fr 1fr; }
          .land-grid { grid-template-columns:1fr 1fr; }
        }
        @media (max-width: 560px) {
          .land-container { width:min(100% - 26px, 1120px); }
          .land-nav { min-height:64px; }
          .land-links { gap:9px; }
          .land-links .land-button { padding:9px 11px; font-size:13px; }
          .land-hero { padding:42px 0 58px; }
          .land-hero h1 { font-size:43px; }
          .land-proof-grid, .land-grid, .land-sample-grid, .land-faq, .land-screen-grid { grid-template-columns:1fr; }
          .land-proof-cell { min-height:auto; padding:20px; }
          .land-section { padding:58px 0; }
          .land-author { grid-template-columns:1fr; }
          .land-footer-row { display:block; }
          .land-footer-links { margin-top:18px; }
        }
        @media (prefers-reduced-motion: reduce) { html { scroll-behavior:auto; } .land-product { transform:none; } .land-question { transform:none; } }
      `}</style>

      <header className="land-container">
        <nav className="land-nav" aria-label="Primary navigation">
          <a className="land-brand" href="/" aria-label="PulseRN home">PulseRN</a>
          <div className="land-links">
            <a href="#features">Features</a>
            <a href="#product-tour">App preview</a>
            <a href="/compare/">Compare</a>
            <a href="/pricing/">Pricing</a>
            <a href="/learn/">RN-reviewed guides</a>
            <button className="land-button secondary keep" type="button" onClick={onSignIn}>Sign in</button>
          </div>
        </nav>
      </header>

      <main data-pulsern-landing="rendered-react">
        <section className="land-container land-hero">
          <div>
            <div className="land-eyebrow">Built by a working hospital RN</div>
            <h1>NCLEX-RN prep engineered around <span>how you learn.</span></h1>
            <p className="land-lead">Every session starts with a question, not a lecture. What you miss comes back right before you would forget it. Built to get you ready to walk into the NCLEX confident.</p>
            <div className="land-actions">
              <button className="land-button" type="button" onClick={onStart}>Start the {freePassLabel}</button>
              <a className="land-button secondary" href="/how-it-works/">See how it works</a>
            </div>
            <p className="land-note">No card needed for the free pass. Educational exam preparation only.</p>
            <p className="land-note" style={{ marginTop: 12 }}><a href="/app/">Open the study app</a> to install PulseRN from your browser.</p>
          </div>
          <figure className="land-product">
            <img className="land-product-image" src="/product/pulsern-adaptive-practice.png" width="720" height="620" fetchpriority="high" alt="PulseRN adaptive NCLEX practice screen with a pharmacology question and four answer choices" />
            <figcaption className="land-product-caption">Authentic adaptive NCLEX practice with answer-first review. Built-in demonstration content; no learner data.</figcaption>
          </figure>
        </section>

        <section className="land-proof" aria-label="PulseRN facts">
          <div className="land-container land-proof-grid">
            <div className="land-proof-cell"><b>Built for how you remember</b><span>Retrieval, spacing, and adaptive practice.</span></div>
            <div className="land-proof-cell"><b>10,000+ questions</b><span>The same library on every paid plan</span></div>
            <div className="land-proof-cell"><b>500+ case studies</b><span>Unfolding clinical judgment</span></div>
            <div className="land-proof-cell"><b>1,100+ flashcards</b><span>Spaced on real calendar dates</span></div>
          </div>
        </section>

        <section className="land-section" id="product-tour">
          <div className="land-container">
            <div className="land-section-head">
              <div className="land-eyebrow">Inside the app</div>
              <h2>A Today round, then the question that fits you.</h2>
              <p>The day starts with what is due. Adaptive practice follows. The lab reference opens over the question, so the lookup stays on the item.</p>
            </div>
            <div className="land-screen-grid">
              <figure className="land-screen">
                <img src="/product/pulsern-today-dashboard.png" width="720" height="1000" loading="lazy" alt="PulseRN Today dashboard showing the daily round, candidate monitor, study goal, and progress cards" />
                <figcaption><strong>A daily plan without guesswork</strong> See due flashcards, adaptive questions, study progress, and the next focused action in one place.</figcaption>
              </figure>
              <figure className="land-screen">
                <img src="/product/pulsern-lab-reference.png" width="430" height="932" loading="lazy" alt="PulseRN mobile lab-reference drawer open over an adaptive practice question" />
                <figcaption><strong>Lab reference at your fingertips</strong> Open searchable educational reference ranges while you study, then return to the question where you left off.</figcaption>
              </figure>
            </div>
            <p className="land-screen-note">Screens captured from PulseRN’s real interface using built-in demonstration content. Reference ranges vary by source and clinical context; this study tool is not medical advice.</p>
          </div>
        </section>

        <section className="land-section white" id="features">
          <div className="land-container">
            <div className="land-section-head">
              <div className="land-eyebrow">One study system</div>
              <h2>Engineered around how you learn and remember.</h2>
              <p>PulseRN was researched and engineered around how people actually learn and remember under pressure. The loop is the product.</p>
            </div>
            <div className="land-grid">
              {FEATURES.map(([title, text], index) => (
                <article className="land-card" key={title}>
                  <div className="land-card-num">{index + 1}</div>
                  <h3>{title}</h3><p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="land-section">
          <div className="land-container">
            <div className="land-section-head">
              <div className="land-eyebrow">Free sample questions</div>
              <h2>Start with a question. No account needed.</h2>
              <p>Four public sets, five original questions each. The answer, the rationale, and the sources are on the page.</p>
            </div>
            <div className="land-sample-grid">
              {SAMPLES.map(([title, text, href]) => (
                <a className="land-card land-card-link" href={href} key={href}>
                  <div className="land-card-num" aria-hidden="true">5</div>
                  <h3>{title}</h3><p>{text}</p>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="land-section white">
          <div className="land-container">
            <div className="land-section-head">
              <div className="land-eyebrow">Sourced comparisons</div>
              <h2>See the fit before you choose a bank.</h2>
              <p>Dated comparisons with UWorld, Archer Review, and Kaplan. Facts come from provider pages. No paid ranking, and no pass promise.</p>
            </div>
            <div className="land-grid">
              {COMPARISONS.map(([title, text, href]) => (
                <a className="land-card land-card-link" href={href} key={href}>
                  <div className="land-card-num" aria-hidden="true">↔</div>
                  <h3>{title}</h3><p>{text}</p>
                </a>
              ))}
            </div>
            <p className="land-note" style={{ marginTop: 18 }}><a href="/compare/">See every NCLEX-prep comparison and the methodology →</a></p>
          </div>
        </section>

        <section className="land-section">
          <div className="land-container land-how">
            <div className="land-section-head">
              <div className="land-eyebrow">How it works</div>
              <h2>A study loop you can explain.</h2>
              <p>You answer first. Missed items come back. Weak spots get the work. A Today round and a weekly plan are built around your exam date. Readiness is an estimate of your work in PulseRN.</p>
              <div className="land-author" id="author">
                <div className="land-avatar" aria-hidden="true">RN</div>
                <div><strong>Sheldon Bennett, RN</strong><p>A working hospital RN who built PulseRN around how people learn and remember under pressure. <a href="/about/#sheldon-bennett-rn">Read how the content is built.</a></p></div>
              </div>
            </div>
            <div className="land-steps">
              {[
                ["01", "Answer before you review", "Every session starts with a question, not a lecture. Then read the rationale."],
                ["02", "Miss it, and it returns", "Spaced repetition brings the item back on a calendar date, right before it would fade."],
                ["03", "Work the weak spot", "Adaptive practice stays with a category until it is no longer the weak one."],
                ["04", "Know what today is for", "A Today round, and a weekly plan once your exam date is set. Readiness is an estimate, not an exam result."],
              ].map(([n, title, text]) => <article className="land-step" key={n}><b>{n}</b><div><h3>{title}</h3><p>{text}</p></div></article>)}
            </div>
          </div>
        </section>

        <section className="land-section white">
          <div className="land-container">
            <div className="land-section-head"><div className="land-eyebrow">Straight answers</div><h2>Before you start.</h2></div>
            <div className="land-faq">
              {FAQ.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}
            </div>
          </div>
        </section>

        <section className="land-final">
          <div className="land-container">
            <h2>Built to get you ready to walk into the NCLEX confident.</h2>
            <p>A {freePassLabel} to the study content. No card needed.</p>
            <button className="land-button" type="button" onClick={onStart}>Create your free account</button>
          </div>
        </section>
      </main>

      <footer className="land-footer">
        <div className="land-container">
          <div className="land-footer-row"><strong>PulseRN</strong><div className="land-footer-links"><a href="/pricing/">Pricing</a><a href="/learn/">Guides</a><a href="/compare/">Compare</a><a href="/methodology/">Methodology</a><a href="/editorial-policy/">Editorial policy</a><a href="/about/">About</a><a href="/legal/">Terms · Privacy · Disclaimer</a></div></div>
          <p className="land-disclaimer">Educational exam preparation only — not medical advice or a clinical reference. NCLEX® is a registered trademark of the National Council of State Boards of Nursing, Inc. (NCSBN), which is not affiliated with and does not endorse PulseRN.</p>
        </div>
      </footer>
    </div>
  );
}
