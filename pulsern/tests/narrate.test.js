/* Narration: clip identity, and the check that audio says what the script says. */
import { describe, it, expect } from "vitest";
import { clipId, textFp, wordsToNumbers, normaliseSpeech, speechSimilarity, passesQa, audioCheck, criticalTerms, speechTokens, isCurrentClip, QA_VERSION, narratedSteps, TTS, QA_THRESHOLD } from "../ops/narrate-lib.mjs";
import { DIAGRAMS } from "../src/diagrams/index.js";

describe("clip identity", () => {
  const base = { text: "Start with the pH.", voice: "marin" };
  it("is stable for the same inputs", () => { expect(clipId(base)).toBe(clipId({ ...base })); });
  it("changes with the words, the voice, the delivery, the model or the speed", () => {
    const id = clipId(base);
    expect(clipId({ ...base, text: "Start with pH." })).not.toBe(id);
    expect(clipId({ ...base, voice: "cedar" })).not.toBe(id);
    expect(clipId({ ...base, instructions: "faster" })).not.toBe(id);
    expect(clipId({ ...base, model: "tts-1" })).not.toBe(id);
    expect(clipId({ ...base, speed: 1.1 })).not.toBe(id);
  });
  it("gives the app a fingerprint of the words to detect stale audio", () => {
    expect(textFp("Start with the pH.")).not.toBe(textFp("Start with the pH"));
  });
});

describe("reading numbers the way they are spoken", () => {
  it.each([
    ["seven point three five", "7.35"],
    ["forty-five", "45"],
    ["twenty-two", "22"],
    ["three point five", "3.5"],
    ["five point oh", "5.0"],
    ["one hundred fifty", "150"],
  ])("%s → %s", (spoken, digits) => {
    expect(wordsToNumbers(spoken)).toBe(digits);
  });
  it("leaves ordinary words alone", () => {
    expect(wordsToNumbers("the point is the pH")).toBe("the point is the ph");
  });
});

describe("does the audio say what the script says?", () => {
  const script = "Anything below seven point three five is acidosis. A P-A-C-O-2 above forty-five pushes the blood toward acid.";
  it("passes a faithful transcript despite digits and abbreviations", () => {
    const heard = "Anything below 7.35 is acidosis. A PaCO2 above 45 pushes the blood toward acid.";
    expect(speechSimilarity(script, heard)).toBeGreaterThanOrEqual(QA_THRESHOLD);
    expect(passesQa(script, heard)).toBe(true);
  });
  /* The failures that matter: a skipped clause, a wrong number. */
  it("fails a transcript that skipped a clause", () => {
    expect(passesQa(script, "Anything below 7.35 is acidosis.")).toBe(false);
  });
  /* PR #133 review, finding 4: this test once "passed" only because the
     trailing "oh." was never read as a number — the correct transcript
     would have failed too. Both halves are now checked. */
  it("passes the right number and fails a wrong one", () => {
    const script = "Normal potassium is three point five to five point oh.";
    expect(wordsToNumbers(script)).toContain("5.0");
    expect(passesQa(script, "Normal potassium is 3.5 to 5.0.")).toBe(true);
    expect(passesQa(script, "Normal potassium is 3.5 to 15.0.")).toBe(false);
    expect(passesQa(script, "Normal potassium is 3.5 to 5.5.")).toBe(false);
  });
  it("normalises spelling, case and punctuation away", () => {
    expect(normaliseSpeech("P-A-C-O-2, I-V!")).toBe(normaliseSpeech("PaCO2 IV"));
  });
});

describe("which steps are recorded", () => {
  it("never records a worked-example step", () => {
    for (const d of Object.values(DIAGRAMS)) for (const s of narratedSteps(d)) expect(s.dynamic).toBeFalsy();
  });
  it("records every other step that has narration", () => {
    for (const d of Object.values(DIAGRAMS)) {
      expect(narratedSteps(d).length).toBe(d.steps.filter((s) => !s.dynamic).length);
    }
  });
  it("keeps every script under the API's 4,096-character input limit", () => {
    for (const d of Object.values(DIAGRAMS)) for (const s of narratedSteps(d)) expect(s.narration.length).toBeLessThan(4096);
  });
  it("tells the voice to read hyphenated letters as letters", () => {
    expect(TTS.instructions).toMatch(/hyphens as individual letters/);
  });
});

/* Every narration script actually shipped, checked against a faithful
   transcript and against minimally corrupted ones. Overall similarity alone
   passed "it does lower the potassium" for "it does not" (0.976). */
describe("the audio check on the real scripts", () => {
  const scripts = Object.values(DIAGRAMS).flatMap((d) => narratedSteps(d).map((st) => [`${d.id}/${st.key}`, st.narration]));
  /* How a transcriber writes speech: digits, not number words. */
  const asTranscribed = (t) => {
    // how a transcriber writes speech: digits, and abbreviations not spelled out
    let x = t;
    while (/\b([A-Za-z])-(?=[A-Za-z0-9])/.test(x)) x = x.replace(/\b([A-Za-z])-(?=[A-Za-z0-9])/g, "$1§");
    return wordsToNumbers(x).replace(/§/g, "").replace(/\s+/g, " ");
  };

  it.each(scripts)("%s passes its own faithful transcript", (_, script) => {
    expect(audioCheck(script, script).pass).toBe(true);
    expect(audioCheck(script, asTranscribed(script)).pass).toBe(true);
  });

  const NEG = /\b(not|never|no|without)\b/i;
  it.each(scripts.filter(([, t]) => NEG.test(t)))("%s fails when a negation is dropped", (_, script) => {
    const corrupted = script.replace(NEG, "").replace(/\s{2,}/g, " ");
    expect(audioCheck(script, corrupted).pass).toBe(false);
  });

  it.each(scripts.filter(([, t]) => /\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty)\b/i.test(wordsToNumbers(t))))(
    "%s fails when a number is changed", (_, script) => {
      const heard = asTranscribed(script);
      const corrupted = heard.replace(/\d+(?:\.\d+)?/, (n) => String(Number(n) + 1));
      expect(audioCheck(script, corrupted).pass).toBe(false);
    });

  const SWAP = [["above", "below"], ["below", "above"], ["into", "out of"], ["out of", "into"], ["high", "low"], ["low", "high"], ["first", "last"]];
  it.each(scripts.filter(([, t]) => SWAP.some(([w]) => new RegExp(`\\b${w}\\b`, "i").test(t))))(
    "%s fails when a direction is reversed", (_, script) => {
      const [w, r] = SWAP.find(([x]) => new RegExp(`\\b${x}\\b`, "i").test(script));
      expect(audioCheck(script, script.replace(new RegExp(`\\b${w}\\b`, "i"), r)).pass).toBe(false);
    });

  /* PR #134 review, finding 4: a recording that swapped the diagnosis
     passed, because only a keyword list was compared exactly. */
  const SWAPS = [["acidosis", "alkalosis"], ["alkalosis", "acidosis"], ["hypotonic", "hypertonic"], ["hypertonic", "hypotonic"],
    ["hypokalemia", "hyperkalemia"], ["airborne", "droplet"], ["droplet", "airborne"], ["contact", "droplet"], ["calcium", "potassium"], ["swell", "shrink"]];
  it("fails Astra's case: the ABG pH step with acidosis heard as alkalosis", () => {
    const ph = DIAGRAMS.abg.steps.find((s) => s.key === "ph").narration;
    expect(audioCheck(ph, ph.replace("acidosis", "alkalosis")).pass).toBe(false);
  });
  it.each(scripts.filter(([, t]) => SWAPS.some(([w]) => new RegExp(`\\b${w}\\b`, "i").test(t))))(
    "%s fails when a clinical term is swapped", (_, script) => {
      const [w, r] = SWAPS.find(([x]) => new RegExp(`\\b${x}\\b`, "i").test(script));
      expect(audioCheck(script, asTranscribed(script).replace(new RegExp(`\\b${w}\\b`, "i"), r)).pass).toBe(false);
    });
  /* Not just a list of known swaps: change ANY word that carries meaning. */
  it.each(scripts)("%s fails when its longest word is replaced", (_, script) => {
    const longest = script.split(/[^A-Za-z]+/).sort((a, b) => b.length - a.length)[0];
    expect(audioCheck(script, script.replace(longest, "something")).pass).toBe(false);
  });
  it("tolerates only spelling differences and filler words", () => {
    expect(speechTokens("A P-A-C-O-2 of forty-five, and it doesn't")).toEqual(speechTokens("the PaCO2 of 45 and it does not"));
    expect(speechTokens("N-ninety-five")).toEqual(speechTokens("N95"));
  });

  it("reads contractions as negations", () => {
    expect(criticalTerms("it doesn't lower it")).toEqual(criticalTerms("it does not lower it"));
    expect(criticalTerms("you can't push it")).toContain("not");
  });
});

/* PR #134 review, finding 7: clips approved by the old similarity-only
   check, or stored under input-derived names, were skipped and kept. */
describe("which recorded clips a re-run may keep", () => {
  const audio = "a".repeat(32);
  const good = { id: "abc", qa: QA_VERSION, audio, url: `https://x/storage/v1/object/public/explainers/abg/${audio}.mp3` };
  it("keeps a clip approved by the current check and stored by its bytes", () => {
    expect(isCurrentClip(good, "abc")).toBe(true);
  });
  it("re-records a clip from an older check, old storage, or other words", () => {
    expect(isCurrentClip({ ...good, qa: undefined }, "abc")).toBe(false);
    expect(isCurrentClip({ ...good, qa: QA_VERSION - 1 }, "abc")).toBe(false);
    expect(isCurrentClip({ ...good, audio: undefined, url: "https://x/abg/ph-abc.mp3" }, "abc")).toBe(false);
    expect(isCurrentClip({ ...good, url: "https://x/abg/ph-abc.mp3" }, "abc")).toBe(false);
    expect(isCurrentClip(good, "different-words")).toBe(false);
    expect(isCurrentClip(undefined, "abc")).toBe(false);
  });
  it("has no legacy clips in the shipped manifest", async () => {
    const { readFileSync } = await import("node:fs");
    const m = JSON.parse(readFileSync("src/diagrams/narration.json", "utf8"));
    for (const [d, steps] of Object.entries(m.clips)) for (const [k, e] of Object.entries(steps)) {
      expect(e.qa, `${d}/${k}`).toBe(QA_VERSION);
    }
  });
});
