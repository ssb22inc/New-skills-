import React from "react";

const FEATURES = [
  ["Adaptive practice", "Questions adjust to your demonstrated level across the eight NCSBN client-needs categories."],
  ["Next Gen item types", "Practice bow-tie, matrix, cloze, highlight, drag-and-drop, multiple-response, and calculation items."],
  ["Spaced repetition", "Recall-first flashcards return on real calendar dates so review follows what you are most likely to forget."],
  ["Readiness self-assessments", "Standardized 85-question forms are timed and never repeated. Results are estimates, not outcome predictions."],
  ["Unfolding case studies", "Work through changing clinical records using the NCSBN Clinical Judgment Measurement Model."],
  ["Explanations and tutoring", "Review rationales after answering and ask the AI tutor for a clearer explanation when you need one."],
];

const FAQ = [
  ["Who created PulseRN?", "PulseRN was created by Sheldon Bennett, RN. The product combines nursing experience with a deliberately conservative approach to readiness reporting."],
  ["Does PulseRN use real NCLEX questions?", "No. PulseRN does not claim to reproduce live exam content. It provides original educational practice designed around published NCSBN formats and categories."],
  ["Can PulseRN tell me whether I will pass?", "No. Readiness is an estimate based on your work inside PulseRN. It cannot predict or guarantee an NCLEX result."],
  ["Is there a free option?", "Yes. New learners can use a 1-day free pass for study content. Readiness self-assessments are included with paid plans."],
];

const SAMPLES = [
  ["Pharmacology", "Five questions on high-alert medications, reversal agents, monitoring, and label-based safety.", "/learn/nclex-pharmacology-practice-questions/"],
  ["Prioritization", "Five questions on emergency recognition, change from baseline, assessment, action, and evaluation.", "/learn/nclex-prioritization-practice-questions/"],
  ["Dosage calculations", "Five worked questions covering tablets, liquids, pump rates, gravity tubing, and weight-based math.", "/learn/nclex-dosage-calculation-practice-questions/"],
  ["NGN bow-tie", "Five text-based bow-tie examples connecting a condition, two actions, and two parameters.", "/learn/ngn-bow-tie-practice-questions/"],
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
        .land-product { position: relative; background: #0d302b; border-radius: 26px; padding: 18px;
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
          .land-proof-grid, .land-grid, .land-sample-grid, .land-faq { grid-template-columns:1fr; }
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
            <a href="/pricing/">Pricing</a>
            <a href="/learn/">RN-reviewed guides</a>
            <button className="land-button secondary keep" type="button" onClick={onSignIn}>Sign in</button>
          </div>
        </nav>
      </header>

      <main>
        <section className="land-container land-hero">
          <div>
            <div className="land-eyebrow">Created by a licensed RN — for future RNs</div>
            <h1>NCLEX-RN practice that adapts to <span>how you learn.</span></h1>
            <p className="land-lead">Build clinical judgment with adaptive questions, every Next Gen item type, spaced-repetition review, and honest readiness estimates.</p>
            <div className="land-actions">
              <button className="land-button" type="button" onClick={onStart}>Start the 1-day free pass</button>
              <a className="land-button secondary" href="/how-it-works/">See how it works</a>
            </div>
            <p className="land-note">No credit card for the free pass. Educational exam preparation only.</p>
            <p className="land-note" style={{ marginTop: 12 }}><a href="/app/">Open the study app</a> to install PulseRN from your browser.</p>
          </div>
          <div className="land-product" aria-label="Illustration of a PulseRN practice question">
            <div className="land-product-top"><span className="land-dot" /> Adaptive practice · Adult Health · Question 18</div>
            <div className="land-question">
              <div className="land-kicker">Clinical judgment</div>
              <h2>Which finding should the nurse address first?</h2>
              <div className="land-option">A. Reassess the client in 30 minutes</div>
              <div className="land-option selected">B. Apply the priority framework</div>
              <div className="land-option">C. Document the expected finding</div>
              <div className="land-option">D. Continue the current plan</div>
            </div>
          </div>
        </section>

        <section className="land-proof" aria-label="PulseRN facts">
          <div className="land-container land-proof-grid">
            <div className="land-proof-cell"><b>Built for focused practice</b><span>Clear tools, conservative claims, and no false guarantees.</span></div>
            <div className="land-proof-cell"><b>8 categories</b><span>NCSBN client-needs coverage</span></div>
            <div className="land-proof-cell"><b>7 NGN formats</b><span>Plus standard multiple choice</span></div>
            <div className="land-proof-cell"><b>85 questions</b><span>Per readiness self-assessment</span></div>
          </div>
        </section>

        <section className="land-section white" id="features">
          <div className="land-container">
            <div className="land-section-head">
              <div className="land-eyebrow">One study system</div>
              <h2>Practice, review, and understand what comes next.</h2>
              <p>PulseRN connects question practice to targeted review so your next session is guided by the work you have already done.</p>
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
              <h2>Try the reasoning before creating an account.</h2>
              <p>Each public set includes five original questions, visible rationales, authoritative sources, and explicit RN-review status.</p>
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

        <section className="land-section">
          <div className="land-container land-how">
            <div className="land-section-head">
              <div className="land-eyebrow">How it works</div>
              <h2>A study loop you can explain.</h2>
              <p>Your activity drives future practice and review. PulseRN shows estimates as estimates and keeps the learner—not an opaque score—in control.</p>
              <div className="land-author" id="author">
                <div className="land-avatar" aria-hidden="true">RN</div>
                <div><strong>Sheldon Bennett, RN</strong><p>Creator and clinical content owner. <a href="/about/#sheldon-bennett-rn">Read the author and review standards.</a></p></div>
              </div>
            </div>
            <div className="land-steps">
              {[
                ["01", "Choose a focus", "Study broadly or select a client-needs category."],
                ["02", "Answer before reviewing", "Commit to an answer, then read the rationale and feedback."],
                ["03", "Revisit weak knowledge", "Adaptive practice and scheduled flashcards bring back what needs attention."],
                ["04", "Check progress carefully", "Use readiness estimates as one study signal—not as a promise of an exam result."],
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
            <h2>Start with one focused study session.</h2>
            <p>Create an account for a 1-day free pass to the study content. No credit card is required for the free pass.</p>
            <button className="land-button" type="button" onClick={onStart}>Create your free account</button>
          </div>
        </section>
      </main>

      <footer className="land-footer">
        <div className="land-container">
          <div className="land-footer-row"><strong>PulseRN</strong><div className="land-footer-links"><a href="/pricing/">Pricing</a><a href="/learn/">Guides</a><a href="/methodology/">Methodology</a><a href="/editorial-policy/">Editorial policy</a><a href="/about/">About</a><a href="/legal/">Terms · Privacy · Disclaimer</a></div></div>
          <p className="land-disclaimer">Educational exam preparation only — not medical advice or a clinical reference. NCLEX® is a registered trademark of the National Council of State Boards of Nursing, Inc. (NCSBN), which is not affiliated with and does not endorse PulseRN.</p>
        </div>
      </footer>
    </div>
  );
}
