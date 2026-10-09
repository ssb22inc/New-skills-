/* The explainer player and the diagram registry.
   ------------------------------------------------------------------
   Pure timing and labelling logic is tested directly; the component is
   rendered to static markup (the suite runs without a DOM), which is enough
   to prove what a student sees before they press anything. */
import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Explainer, captionMs, stepCaption, stepsFor, clipFor, verificationLabel, afterClip, MIN_STEP_MS, WORDS_PER_SECOND } from "../src/explainer.jsx";
import { DIAGRAMS } from "../src/diagrams/index.js";

describe("caption timing", () => {
  it("gives a long caption time to be read", () => {
    const words = Array(52).fill("word").join(" ");
    expect(captionMs(words)).toBe(Math.round((52 / WORDS_PER_SECOND) * 1000));
  });
  it("never flashes a short caption past", () => {
    expect(captionMs("Start here.")).toBe(MIN_STEP_MS);
    expect(captionMs("")).toBe(MIN_STEP_MS);
  });
});

describe("labelling (CLAUDE.md: AI content stays labelled)", () => {
  it("labels an unverified explainer as AI-drafted with the verify note", () => {
    expect(verificationLabel(false)).toEqual({ text: "✨ AI-drafted · verify against your course materials", rn: false });
  });
  it("shows RN-verified only when signed off", () => {
    expect(verificationLabel(true)).toEqual({ text: "RN-verified", rn: true });
  });
  it("renders the AI label by default — no RN claim without sign-off", () => {
    const html = renderToStaticMarkup(<Explainer diagram={DIAGRAMS.abg} />);
    expect(html).toContain("✨ AI-drafted");
    expect(html).not.toContain("RN-verified");
  });
  it("discloses a synthetic voice whenever narration is attached", () => {
    const audio = Object.fromEntries(DIAGRAMS.abg.steps.filter((s) => s.key).map((s) => [s.key, `/a/${s.key}.mp3`]));
    const html = renderToStaticMarkup(<Explainer diagram={DIAGRAMS.abg} startInPlayer audio={audio} />);
    expect(html).toContain("Narration is a synthetic voice.");
  });
});

describe("what a student sees first", () => {
  it("inline: the full diagram with a Watch button, no steps yet", () => {
    const html = renderToStaticMarkup(<Explainer diagram={DIAGRAMS.abg} />);
    expect(html).toContain("<svg");
    expect(html).toContain("Watch the explainer");
    expect(html).not.toContain("dg-caption");
  });
  it("player: step 1 with its caption, live region, and controls", () => {
    const html = renderToStaticMarkup(<Explainer diagram={DIAGRAMS.abg} startInPlayer />);
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain(DIAGRAMS.abg.steps[0].caption);
    expect(html).toContain('aria-label="Previous step"');
    expect(html).toMatch(/aria-current="step"/);
  });
  it("shows the question's own values, not the textbook example", () => {
    const html = renderToStaticMarkup(<Explainer diagram={DIAGRAMS.abg} params={{ ph: 7.52, paco2: 42, hco3: 34 }} />);
    expect(html).toContain("7.52");
    expect(html).toContain("Metabolic alkalosis");
  });
});

describe("concept-only mode (no confirmed patient values)", () => {
  /* A question about ABGs whose values could not be confirmed must not be
     shown the textbook example's numbers as though they were its own. */
  it("shows no patient values and no verdict", () => {
    const html = renderToStaticMarkup(<Explainer diagram={DIAGRAMS.abg} params={null} />);
    expect(html).not.toContain("7.30");
    // the legend legitimately teaches the word "uncompensated"; what must be
    // absent is a verdict about a patient
    expect(html).not.toMatch(/(Respiratory|Metabolic|Combined)[a-z ]* (acidosis|alkalosis)|Normal ABG/);
    expect(html).toContain("Read pH → PaCO₂ → HCO₃⁻ → match");
  });
  it("drops the worked-example step, which would need values", () => {
    expect(stepsFor(DIAGRAMS.abg, null).some((s) => s.dynamic)).toBe(false);
    expect(stepsFor(DIAGRAMS.abg, undefined).some((s) => s.dynamic)).toBe(true);
  });
  it("draws potassium without a marker or a matched strip", () => {
    const html = renderToStaticMarkup(<DIAGRAMS.potassium.Diagram params={null} />);
    expect(html).not.toContain("6.2");
    expect(html).not.toContain('stroke-dasharray="5 4"');
  });
});

describe("narration follows stable keys, never positions", () => {
  const steps = DIAGRAMS.abg.steps;
  const audio = Object.fromEntries(steps.filter((s) => s.key && !s.dynamic).map((s) => [s.key, `/a/${s.key}.mp3`]));

  /* Its caption is computed from the question's values; a recording made
     from the textbook example would contradict the screen. */
  it("never plays a recording over a worked-example step", () => {
    const i = steps.findIndex((s) => s.dynamic);
    expect(clipFor({ ...audio, [steps[i].key]: "/a/worked.mp3" }, steps, i)).toBeNull();
  });
  it("plays the right clip after a step has been left out", () => {
    const filtered = stepsFor(DIAGRAMS.abg, null);
    filtered.forEach((s, i) => expect(clipFor(audio, filtered, i)).toBe(`/a/${s.key}.mp3`));
  });
  it("plays nothing rather than a neighbour's clip when one is missing", () => {
    const { rome, ...partial } = audio;
    const i = steps.findIndex((s) => s.key === "rome");
    expect(clipFor(partial, steps, i)).toBeNull();
  });
});

/* Every diagram in the registry must meet the same bar, so a new one cannot
   be added half-finished. */
describe("every registered diagram", () => {
  for (const d of Object.values(DIAGRAMS)) {
    describe(d.id, () => {
      it("renders an accessible SVG with a title and description", () => {
        const html = renderToStaticMarkup(<d.Diagram params={d.example} />);
        expect(html).toMatch(/<svg[^>]*role="img"/);
        expect(html).toMatch(/<title[^>]*>[^<]{5,}<\/title>/);
        expect(html).toMatch(/<desc[^>]*>[^<]{20,}<\/desc>/);
      });
      it("states its clinical claims for the reviewer", () => {
        expect(d.facts.length).toBeGreaterThan(2);
        for (const f of d.facts) expect(f.length).toBeGreaterThan(20);
      });
      it("gives every step a unique, stable key", () => {
        const keys = d.steps.map((s) => s.key);
        for (const k of keys) expect(k, "step without a key").toMatch(/^[a-z][a-z0-9-]*$/);
        expect(new Set(keys).size).toBe(keys.length);
      });
      it("has a caption and a narration script for every step", () => {
        d.steps.forEach((s, i) => {
          const cap = stepCaption(d, i);
          expect(cap.length, `step ${i} caption`).toBeGreaterThan(20);
          if (!s.dynamic) expect((s.narration ?? "").length, `step ${i} narration`).toBeGreaterThan(20);
        });
      });
      it("only focuses on groups that exist in the drawing", () => {
        const html = renderToStaticMarkup(<d.Diagram params={d.example} />);
        const groups = new Set([...html.matchAll(/data-g="([^"]+)"/g)].map((m) => m[1]));
        for (const s of d.steps) for (const g of s.focus ?? []) expect(groups, `focus "${g}"`).toContain(g);
      });
      it("keeps every text inside the 360-wide canvas", () => {
        const html = renderToStaticMarkup(<d.Diagram params={d.example} />);
        for (const m of html.matchAll(/<text x="([\d.]+)"[^>]*text-anchor="(start|middle|end)"/g)) {
          const x = Number(m[1]);
          expect(x, `text at x=${x}`).toBeGreaterThanOrEqual(0);
          expect(x, `text at x=${x}`).toBeLessThanOrEqual(360);
        }
      });
    });
  }
});

/* PR #133 review, finding 16. The mounted-player version of this is
   ops/check-player.mjs, run in CI with a real browser. */
describe("when a clip ends", () => {
  it("never moves on by itself under reduced motion", () => {
    let went = null;
    expect(afterClip({ reduce: true, step: 1, n: 5, go: (i) => { went = i; } })).toBe(false);
    expect(went).toBeNull();
  });
  it("moves to the next step otherwise, and stops after the last", () => {
    let went = null;
    expect(afterClip({ reduce: false, step: 1, n: 5, go: (i) => { went = i; } })).toBe(true);
    expect(went).toBe(2);
    expect(afterClip({ reduce: false, step: 4, n: 5, go: () => { throw new Error("no step 5"); } })).toBe(false);
  });
});
