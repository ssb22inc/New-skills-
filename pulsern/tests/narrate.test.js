/* Narration: clip identity, and the check that audio says what the script says. */
import { describe, it, expect } from "vitest";
import { clipId, textFp, wordsToNumbers, normaliseSpeech, speechSimilarity, passesQa, audioCheck, criticalTerms, narratedSteps, TTS, QA_THRESHOLD } from "../ops/narrate-lib.mjs";
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
  const asTranscribed = (t) => wordsToNumbers(t).replace(/\s+/g, " ");

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

  it("reads contractions as negations", () => {
    expect(criticalTerms("it doesn't lower it")).toEqual(criticalTerms("it does not lower it"));
    expect(criticalTerms("you can't push it")).toContain("not");
  });
});
