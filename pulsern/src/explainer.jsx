/* The explainer player: a concept diagram, stepped through with captions
   and (when recorded) narration.
   ------------------------------------------------------------------
   Two ways it appears:
     inline  — the static diagram inside a rationale, with "Watch" to step
               through it. This is where most students will meet it.
     player  — opened straight into the steps.

   Honesty rules (CLAUDE.md): the diagrams, captions and narration scripts
   are drafted by an AI, so every explainer ALWAYS carries the ✨ AI label,
   the verify-against-your-materials note and the educational-use note. An
   owner's RN sign-off is shown as an extra badge, never in place of them
   (Sol, PR #155 diagram review). Narration, when present, is a synthetic
   voice and says so.

   Without audio the player still works: captions advance on a reading-speed
   timer. With prefers-reduced-motion it never advances on its own. */
import React from "react";
import { DIAGRAM_CSS, StepContext, useReducedMotion } from "./diagrams/kit.jsx";

/* ---------- pure helpers (tested without a DOM) ---------- */

/* Reading pace for timed captions: about 2.6 words a second, which is a
   comfortable pace for dense clinical text, with a floor so short captions
   do not flash past. */
export const WORDS_PER_SECOND = 2.6;
export const MIN_STEP_MS = 4000;
export function captionMs(text) {
  const words = String(text ?? "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(MIN_STEP_MS, Math.round((words / WORDS_PER_SECOND) * 1000));
}

/* The caption for a step, including worked-example steps whose text is
   computed from the question's own values. */
export function stepCaption(diagram, i, params) {
  const s = stepsFor(diagram, params)[i];
  if (!s) return "";
  if (s.dynamic) return diagram.dynamicCaption?.(params ?? diagram.example) ?? "";
  return s.caption ?? "";
}

/* The worked-example step reads a patient's values. With none (params ===
   null, concept-only) there is nothing to work through, so it is left out
   rather than shown with the textbook example's numbers. */
export function stepsFor(diagram, params) {
  return params === null ? diagram.steps.filter((s) => !s.dynamic) : diagram.steps;
}

/* Recorded narration is never used for a worked-example step: its caption is
   computed from the question's own values, and a recording made from the
   textbook example would contradict the screen. Those steps read as timed
   captions instead. */
export function clipFor(audio, steps, i) {
  if (!audio || !steps[i] || steps[i].dynamic) return null;
  /* By stable key only. Position would shift when a step is left out, and
     the wrong clip would play over a step. */
  return audio[steps[i].key] ?? null;
}

/* What happens when a step's narration ends. With reduced motion the player
   never moves on by itself — the student goes to the next step when ready
   (Astra, PR #133 review, finding 16: narration bypassed this). Returns
   whether playback continues. */
export function afterClip({ reduce, step, n, go }) {
  if (reduce || step >= n - 1) return false;
  go(step + 1);
  return true;
}

export const AI_NOTE = "✨ AI-drafted · verify against your course materials";
export const EDU_NOTE = "Educational exam prep, not instructions for real-world care.";
export function verificationLabel(rnVerified) {
  return { text: AI_NOTE, edu: EDU_NOTE, rn: !!rnVerified };
}

/* Space plays and pauses only when the player itself has focus: on a
   focused button it must do what the button says (Sol: Space on "Next"
   toggled playback instead). */
export function playerKey(key, target) {
  const interactive = !!target && /^(BUTTON|A|INPUT|SELECT|TEXTAREA|AUDIO|VIDEO)$/.test(target.tagName ?? "");
  if (key === "ArrowRight") return "next";
  if (key === "ArrowLeft") return "prev";
  if (key === " " && !interactive) return "toggle";
  return null;
}

/* ---------- component ---------- */

let cssInjected = false;
function useDiagramCss() {
  React.useEffect(() => {
    if (cssInjected || typeof document === "undefined") return;
    const el = document.createElement("style");
    el.setAttribute("data-pulsern", "diagrams");
    el.textContent = DIAGRAM_CSS;
    document.head.appendChild(el);
    cssInjected = true;
  }, []);
}

export function Explainer({ diagram, params, startInPlayer = false, initialStep = 0, rnVerified = false, audio = null }) {
  useDiagramCss();
  const steps = stepsFor(diagram, params);
  const n = steps.length;
  const [step, setStep] = React.useState(startInPlayer ? Math.max(0, Math.min(n - 1, initialStep)) : -1);   // -1 = static overview
  const [playing, setPlaying] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);
  const audioRef = React.useRef(null);
  const reduce = useReducedMotion();   // followed live: turning it on stops auto-advance at once
  const D = diagram.Diagram;
  const inSteps = step >= 0;
  const caption = inSteps ? stepCaption(diagram, step, params) : null;
  const clipUrl = inSteps ? clipFor(audio, steps, step) : null;
  const duration = caption ? captionMs(caption) : 0;

  const sectionRef = React.useRef(null);
  const go = React.useCallback((i) => { setElapsed(0); setStep(Math.max(0, Math.min(n - 1, i))); }, [n]);
  /* Starting the player from the overview brings it into view, so the first
     step's drawing and caption are on screen together (Sol). */
  const start = () => {
    go(0); setPlaying(!reduce);
    sectionRef.current?.scrollIntoView?.({ block: "start", behavior: reduce ? "auto" : "smooth" });
  };

  /* Timed captions when there is no narration; narration drives itself. */
  React.useEffect(() => {
    if (!playing || !inSteps || clipUrl || reduce) return;
    const t0 = Date.now();
    const id = setInterval(() => {
      const e = Date.now() - t0;
      setElapsed(e);
      if (e >= duration) {
        clearInterval(id);
        if (step < n - 1) go(step + 1); else setPlaying(false);
      }
    }, 100);
    return () => clearInterval(id);
  }, [playing, inSteps, clipUrl, reduce, duration, step, n, go]);

  React.useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (playing && clipUrl) a.play().catch(() => setPlaying(false));
    else a.pause();
  }, [playing, clipUrl, step]);

  const onKey = (e) => {
    if (!inSteps) return;
    const action = playerKey(e.key, e.target);
    if (!action) return;
    e.preventDefault();
    if (action === "next") go(step + 1);
    else if (action === "prev") go(step - 1);
    else setPlaying((p) => !p);
  };

  const badge = verificationLabel(rnVerified);
  return (
    <section ref={sectionRef} className="dg-wrap" aria-label={`Explainer: ${diagram.title}`} onKeyDown={onKey} tabIndex={-1}>
      <div className="dg-head">
        <span className="dg-title">{diagram.title}</span>
        {inSteps ? <span className="dg-badge" aria-hidden="true">{step + 1} / {n}</span> : null}
      </div>
      {/* The step key lets each step play its own motion (a wound deepening,
          water crossing a membrane); without it the diagram is static. */}
      <StepContext.Provider value={{ stepKey: inSteps ? steps[step].key : null, still: !playing }}>
        <D params={params === undefined ? diagram.example : params} focus={inSteps ? steps[step].focus : null} />
      </StepContext.Provider>
      {inSteps ? (
        <>
          <p className="dg-caption" aria-live="polite">{caption}</p>
          {clipUrl ? <audio ref={audioRef} src={clipUrl} preload="auto" onEnded={() => setPlaying(afterClip({ reduce, step, n, go }))} /> : null}
          <div className="dg-controls">
            <button type="button" className="dg-btn ghost" onClick={() => go(step - 1)} disabled={step === 0} aria-label="Previous step">‹</button>
            <button type="button" className="dg-btn" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}>{playing ? "Pause" : "Play"}</button>
            <div className="dg-dots" role="group" aria-label="Steps">
              {steps.map((_, i) => (
                <button key={i} type="button" className={`dg-dot${i === step ? " on" : ""}`} aria-label={`Step ${i + 1}`} aria-current={i === step ? "step" : undefined} onClick={() => go(i)} />
              ))}
            </div>
            <button type="button" className="dg-btn ghost" onClick={() => go(step + 1)} disabled={step === n - 1} aria-label="Next step">›</button>
          </div>
          {!clipUrl && playing && !reduce ? (
            <div className="dg-progress" aria-hidden="true"><i style={{ width: `${Math.min(100, (elapsed / duration) * 100)}%` }} /></div>
          ) : null}
        </>
      ) : (
        <div className="dg-controls" style={{ marginTop: 10 }}>
          <button type="button" className="dg-btn" onClick={start}>▶ Watch the explainer</button>
        </div>
      )}
      {/* The AI note is plain text, because a long pill wraps into a broken
          shape at phone width; an RN sign-off adds a small badge. */}
      <p className="dg-ai">
        {badge.rn ? <><span className="dg-badge rn">RN-verified</span>{" "}</> : null}
        <span>{badge.text}</span>
        {clipUrl ? " · Narration is a synthetic voice." : ""}
        <br /><span>{badge.edu}</span>
      </p>
    </section>
  );
}
