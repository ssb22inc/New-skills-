/* The explainer player: a concept diagram, stepped through with captions
   and (when recorded) narration.
   ------------------------------------------------------------------
   Two ways it appears:
     inline  — the static diagram inside a rationale, with "Watch" to step
               through it. This is where most students will meet it.
     player  — opened straight into the steps.

   Honesty rules (CLAUDE.md): the diagrams, captions and narration scripts
   are drafted by an AI, so every explainer carries the ✨ AI label and the
   verify-against-your-materials note until the owner has signed it off as
   RN-verified. Narration, when present, is a synthetic voice and says so.

   Without audio the player still works: captions advance on a reading-speed
   timer. With prefers-reduced-motion it never advances on its own. */
import React from "react";
import { DIAGRAM_CSS } from "./diagrams/kit.jsx";

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

export function verificationLabel(rnVerified) {
  return rnVerified
    ? { text: "RN-verified", rn: true }
    : { text: "✨ AI-drafted · verify against your course materials", rn: false };
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

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function Explainer({ diagram, params, startInPlayer = false, initialStep = 0, rnVerified = false, audio = null }) {
  useDiagramCss();
  const steps = stepsFor(diagram, params);
  const n = steps.length;
  const [step, setStep] = React.useState(startInPlayer ? Math.max(0, Math.min(n - 1, initialStep)) : -1);   // -1 = static overview
  const [playing, setPlaying] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);
  const audioRef = React.useRef(null);
  const reduce = React.useMemo(prefersReducedMotion, []);
  const D = diagram.Diagram;
  const inSteps = step >= 0;
  const caption = inSteps ? stepCaption(diagram, step, params) : null;
  const clipUrl = inSteps ? clipFor(audio, steps, step) : null;
  const duration = caption ? captionMs(caption) : 0;

  const go = React.useCallback((i) => { setElapsed(0); setStep(Math.max(0, Math.min(n - 1, i))); }, [n]);

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
    if (e.key === "ArrowRight") { e.preventDefault(); go(step + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(step - 1); }
    else if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); }
  };

  const badge = verificationLabel(rnVerified);
  return (
    <section className="dg-wrap" aria-label={`Explainer: ${diagram.title}`} onKeyDown={onKey}>
      <div className="dg-head">
        <span className="dg-title">{diagram.title}</span>
        {inSteps ? <span className="dg-badge" aria-hidden="true">{step + 1} / {n}</span> : null}
      </div>
      <D params={params === undefined ? diagram.example : params} focus={inSteps ? steps[step].focus : null} />
      {inSteps ? (
        <>
          <p className="dg-caption" aria-live="polite">{caption}</p>
          {clipUrl ? <audio ref={audioRef} src={clipUrl} preload="auto" onEnded={() => (step < n - 1 ? go(step + 1) : setPlaying(false))} /> : null}
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
          <button type="button" className="dg-btn" onClick={() => { go(0); setPlaying(!reduce); }}>▶ Watch the explainer</button>
        </div>
      )}
      {/* The RN badge is a pill; the AI note is plain text, because a long
          pill wraps into a broken shape at phone width. */}
      <p className="dg-ai">
        {badge.rn ? <span className="dg-badge rn">{badge.text}</span> : <span>{badge.text}</span>}
        {clipUrl ? " · Narration is a synthetic voice." : ""}
      </p>
    </section>
  );
}
