/* Narration: clip identity, and the check that audio says what the script says. */
import { describe, it, expect } from "vitest";
import { clipId, textFp, wordsToNumbers, normaliseSpeech, speechSimilarity, passesQa, audioCheck, criticalTerms, speechTokens, signsAndRanges, isCurrentClip, QA_VERSION, narratedSteps, TTS, QA_THRESHOLD, recordAll, isDuplicateUpload } from "../ops/narrate-lib.mjs";
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
  /* How a transcriber writes speech: digits, and spelled-out letters as
     the abbreviation ("D-five-W" → "D5W", "P-A-C-O-2" → "PaCO2"). */
  const asTranscribed = (t) => {
    let x = t;
    for (let prev = null; prev !== x;) {
      prev = x;
      x = x.replace(/\b([A-Za-z])-(?=[A-Za-z0-9])/g, "$1§").replace(/(?<=[A-Za-z0-9§])-([A-Za-z])\b/g, "§$1");
    }
    return wordsToNumbers(x).replace(/§/g, "").replace(/\s+/g, " ");
  };
  /* Every corruption test first proves its UNcorrupted transcript passes,
     so it can only pass by catching the corruption — not because the
     baseline already failed (Astra, PR #134 review, round 5: the dextrose
     baseline failed before any mutation, so its tests proved nothing). */
  const caughtOnly = (script, baseline, corrupted) => {
    expect(corrupted, "the corruption must change the transcript").not.toBe(baseline);
    expect(audioCheck(script, baseline), "uncorrupted baseline").toMatchObject({ pass: true });
    expect(audioCheck(script, corrupted).pass, "corrupted").toBe(false);
  };

  it.each(scripts)("%s passes against its own words and its transcribed form", (_, script) => {
    expect(audioCheck(script, script).pass).toBe(true);
    expect(audioCheck(script, asTranscribed(script)).pass).toBe(true);
  });

  const NEG = /\b(not|never|no|without)\b/i;
  it.each(scripts.filter(([, t]) => NEG.test(t)))("%s fails when a negation is dropped", (_, script) => {
    caughtOnly(script, script, script.replace(NEG, "").replace(/\s{2,}/g, " "));
  });

  it.each(scripts.filter(([, t]) => /\d/.test(asTranscribed(t))))("%s fails when a number is changed", (_, script) => {
    const heard = asTranscribed(script);
    caughtOnly(script, heard, heard.replace(/\d+(?:\.\d+)?/, (n) => String(Number(n) + 1)));
  });

  const SWAP = [["above", "below"], ["below", "above"], ["into", "out of"], ["out of", "into"], ["high", "low"], ["low", "high"], ["first", "last"]];
  it.each(scripts.filter(([, t]) => SWAP.some(([w]) => new RegExp(`\\b${w}\\b`, "i").test(t))))(
    "%s fails when a direction is reversed", (_, script) => {
      const [w, r] = SWAP.find(([x]) => new RegExp(`\\b${x}\\b`, "i").test(script));
      caughtOnly(script, script, script.replace(new RegExp(`\\b${w}\\b`, "i"), r));
    });

  /* PR #134 review, finding 4: a recording that swapped the diagnosis
     passed, because only a keyword list was compared exactly. */
  const SWAPS = [["acidosis", "alkalosis"], ["alkalosis", "acidosis"], ["hypotonic", "hypertonic"], ["hypertonic", "hypotonic"],
    ["hypokalemia", "hyperkalemia"], ["airborne", "droplet"], ["droplet", "airborne"], ["contact", "droplet"], ["calcium", "potassium"], ["swell", "shrink"]];
  it("fails Astra's case: the ABG pH step with acidosis heard as alkalosis", () => {
    const ph = DIAGRAMS.abg.steps.find((s) => s.key === "ph").narration;
    caughtOnly(ph, ph, ph.replace("acidosis", "alkalosis"));
  });
  it.each(scripts.filter(([, t]) => SWAPS.some(([w]) => new RegExp(`\\b${w}\\b`, "i").test(t))))(
    "%s fails when a clinical term is swapped", (_, script) => {
      const [w, r] = SWAPS.find(([x]) => new RegExp(`\\b${x}\\b`, "i").test(script));
      const heard = asTranscribed(script);
      caughtOnly(script, heard, heard.replace(new RegExp(`\\b${w}\\b`, "i"), r));
    });
  /* Not just a list of known swaps: change ANY word that carries meaning. */
  it.each(scripts)("%s fails when its longest word is replaced", (_, script) => {
    const longest = script.split(/[^A-Za-z]+/).sort((a, b) => b.length - a.length)[0];
    caughtOnly(script, script, script.replace(longest, "something"));
  });
  /* Round 7: "%" was dropped as punctuation, so "45%" matched "45". */
  it("never lets a percent sign or another unit symbol appear or disappear", () => {
    const lungs = LITERAL["abg/lungs"];
    const script = scriptOf("abg/lungs");
    caughtOnly(script, lungs, lungs.replace("above 45", "above 45%"));
    caughtOnly(script, lungs, lungs.replace("above 45", "above 45°"));
    caughtOnly(script, lungs, lungs.replace("above 45", "above >45"));
    expect(audioCheck("a level of forty-five percent", "a level of 45%").pass).toBe(true);
    expect(audioCheck("thirty degrees or lower", "30° or lower").pass).toBe(true);
    expect(audioCheck("thirty degrees or lower", "30 or lower").pass).toBe(false);
  });

  /* Round 5: ".45" lost its decimal point and matched "45". */
  it("never lets a leading decimal point vanish", () => {
    const lungs = DIAGRAMS.abg.steps.find((s) => s.key === "lungs").narration;
    const heard = asTranscribed(lungs);
    caughtOnly(lungs, heard, heard.replace("above 45", "above .45"));
    expect(audioCheck("a level of zero point four five", "a level of .45").pass).toBe(true);
    expect(audioCheck("a level of zero point four five", "a level of 45").pass).toBe(false);
  });
  /* Hand-written transcripts — how a transcriber actually writes these
     clips — NOT generated by the code under test (Astra, PR #134 review:
     a generated "expected" transcript shared the normaliser's own bug). */
  const LITERAL = {
    "tonicity/dextrose": "The body uses up dextrose quickly, and then the fluid acts like whatever is left. D5W and D10W become free water, which is hypotonic. D5 half-normal saline becomes half-normal saline. And D5 normal saline and D5 lactated Ringer's become isotonic.",
    "abg/lungs": "Now look at the lungs. Carbon dioxide behaves like an acid, so a PaCO2 above 45 pushes the blood toward acid. Notice that its acid end is on the right, the opposite way round from the pH line.",
    "isolation/airborne": "Airborne precautions are for tiny particles that hang in the air: tuberculosis, measles, and chickenpox. Wear a fit-tested N95 respirator, and keep the client in a negative pressure room with the door closed. Chickenpox also needs contact precautions, so add a gown and gloves.",
    "potassium/hyper-care": "In an emergency, the order matters. Give calcium gluconate first to protect the heart. Remember, it doesn't lower the potassium. Then insulin with dextrose to shift potassium into the cells. Then remove it from the body with binders, diuretics, or dialysis.",
  };
  const scriptOf = (id) => { const [d, k] = id.split("/"); return DIAGRAMS[d].steps.find((s) => s.key === k).narration; };
  it.each(Object.keys(LITERAL))("%s passes a real, hand-written transcript", (id) => {
    expect(audioCheck(scriptOf(id), LITERAL[id])).toMatchObject({ pass: true, mismatch: null });
  });
  it("fails the dextrose clip when a concentration is misheard", () => {
    const script = scriptOf("tonicity/dextrose");
    expect(audioCheck(script, LITERAL["tonicity/dextrose"].replace("D10W", "D50W")).pass).toBe(false);
    expect(audioCheck(script, LITERAL["tonicity/dextrose"].replace("D5W and", "D5NS and")).pass).toBe(false);
  });

  /* Round 4: a minus sign vanished into the hyphen handling, so "-7.35"
     passed for "seven point three five". Real ABG script, both directions. */
  it("never lets a sign appear or disappear", () => {
    const ph = scriptOf("abg/ph");
    const faithful = "Start with the pH. Anything below 7.35 is acidosis. Anything above 7.45 is alkalosis. The pH tells you what the problem is, not yet where it came from.";
    expect(audioCheck(ph, faithful).pass).toBe(true);
    expect(audioCheck(ph, faithful.replace("below 7.35", "below -7.35")).pass).toBe(false);
    expect(audioCheck(ph, faithful.replace("below 7.35", "below minus seven point three five")).pass).toBe(false);
    expect(audioCheck(ph, faithful.replace("below 7.35", "below negative 7.35")).pass).toBe(false);
    expect(audioCheck("a value of minus five", "a value of -5").pass).toBe(true);
    expect(audioCheck("a value of minus five", "a value of 5").pass).toBe(false);
  });
  it("reads a numeric range written with a hyphen as 'to'", () => {
    expect(signsAndRanges("3-5 h")).toBe("3 to 5 h");
    expect(audioCheck("It lasts three to five hours.", "It lasts 3-5 hours.").pass).toBe(true);
    expect(audioCheck("It lasts three to five hours.", "It lasts 3-6 hours.").pass).toBe(false);
  });

  it("tolerates only spelling differences and filler words", () => {
    expect(speechTokens("The P-A-C-O-2 of forty-five, and it doesn't")).toEqual(speechTokens("PaCO2 of 45 and it does not"));
    expect(speechTokens("N-ninety-five")).toEqual(speechTokens("N95"));
    expect(speechTokens("D-five-W and D-ten-W")).toEqual(speechTokens("D5W and D10W"));
    expect(speechTokens("the fit-tested mask")).toEqual(["fit", "tested", "mask"]);
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

/* Astra, PR #134 review, round 10: every "a" was discarded as an article,
   so "hepatitis A" heard as "hepatitis" passed and generalised hepatitis A's
   route to all hepatitis. A letter that names something must be heard. */
describe("letters that name things are not fillers", () => {
  const astra = "Hepatitis A spreads by the fecal oral route. Teach careful hand hygiene to reduce transmission.";
  it("fails Astra's case: 'hepatitis A' heard as 'hepatitis'", () => {
    expect(audioCheck(astra, astra.replace("Hepatitis A", "Hepatitis")).pass).toBe(false);
  });
  it.each([
    ["Hepatitis A spreads by the fecal oral route.", "Hepatitis spreads by the fecal oral route."],
    ["Night blindness is a sign of low vitamin A.", "Night blindness is a sign of low vitamin."],
    ["A client with blood group A can receive group O cells.", "A client with blood group can receive group O cells."],
    ["Group A strep can follow a sore throat.", "Group strep can follow a sore throat."],
    // round 11, Astra's case: a blood group at the start of a sentence
    ["A positive packed red cells are ABO-compatible with an A positive recipient.", "Positive packed red cells are ABO-compatible with an A positive recipient."],
    ["A negative donors can give to A positive and A negative recipients.", "Negative donors can give to A positive and A negative recipients."],
    ["A, B, AB and O are the four ABO blood groups taught for transfusion safety checks.", "B, AB and O are the four ABO blood groups taught for transfusion safety checks."],
    ["Send the client to the ER now and report the potassium result to the provider right away.", "Send the client to the now and report the potassium result to the provider right away."],
  ])("fails when the letter is dropped: %s", (script, heard) => {
    expect(audioCheck(script, heard).pass).toBe(false);
    expect(audioCheck(script, script).pass).toBe(true);
  });
  it("matches however the transcript spells the letter", () => {
    expect(speechTokens("hepatitis a")).toEqual(speechTokens("Hepatitis A"));
    expect(speechTokens("Vitamin A")).toEqual(speechTokens("vitamin a"));
    expect(speechTokens("the E.R.")).toEqual(speechTokens("the ER"));
  });
  /* Round 12: the Rh sign itself must be heard. */
  describe("blood-group signs", () => {
    const MINUS = String.fromCodePoint(0x2212);
    const script = `Group A${MINUS} red cells lack the Rh D antigen. Check compatibility before transfusion.`;
    it("fails Astra's case: 'A−' heard as 'A'", () => {
      expect(audioCheck(script, "Group A red cells lack the Rh D antigen. Check compatibility before transfusion.").pass).toBe(false);
    });
    it("passes a faithful reading of the sign", () => {
      expect(audioCheck(script, "Group A negative red cells lack the Rh D antigen. Check compatibility before transfusion.").pass).toBe(true);
      expect(speechTokens("O+ donors")).toEqual(speechTokens("O positive donors"));
      expect(speechTokens("AB- plasma")).toEqual(speechTokens("AB negative plasma"));
      expect(speechTokens("Rh- mother")).toEqual(speechTokens("Rh negative mother"));
    });
    it("fails when the sign is changed or added", () => {
      expect(audioCheck(script, "Group A positive red cells lack the Rh D antigen. Check compatibility before transfusion.").pass).toBe(false);
      expect(audioCheck("Group O red cells are the universal donor for emergency transfusion in most protocols.", "Group O negative red cells are the universal donor for emergency transfusion in most protocols.").pass).toBe(false);
    });
    it("leaves hyphenated words and spaced dashes alone", () => {
      expect(speechTokens("vitamin B-12")).toEqual(speechTokens("vitamin B12"));
      expect(speechTokens("O-ring")).not.toContain("negative");
    });
  });
  it("keeps a sign-written blood group too", () => {
    expect(speechTokens("A+ blood")).toEqual(["a", "positive", "blood"]);
    expect(speechTokens("Give A\u2212 cells")).toEqual(["give", "a", "minus", "cell"]);
  });
  it("treats 'an' and 'the' as droppable, but never 'a'", () => {
    expect(speechTokens("Give the client an apple")).toEqual(speechTokens("Give client apple"));
    expect(speechTokens("A client needs a dose")).not.toEqual(speechTokens("client needs dose"));
  });
  /* Round 15: "A plasma" at the start of a sentence matched none of the
     protected contexts and was dropped as an article. */
  it.each([
    ["A plasma contains anti-B antibodies.", "Plasma contains anti-B antibodies."],
    ["A plasma contains anti-B antibodies.", "plasma contains anti-B antibodies."],
    ["A cells carry the A antigen on their surface.", "Cells carry the A antigen on their surface."],
  ])("fails when a leading A is dropped: %s", (script, heard) => {
    expect(audioCheck(script, heard).pass).toBe(false);
    expect(audioCheck(script, script).pass).toBe(true);
    expect(audioCheck(script, script.toLowerCase()).pass).toBe(true);
  });
  it("re-checks clips approved under the weaker rule", () => {
    expect(QA_VERSION).toBeGreaterThanOrEqual(12);
  });
});

/* Astra, PR #134 review, round 13: the micro sign was deleted as
   punctuation, so "5 μg" heard as "5 g" passed. */
describe("units keep their prefix", () => {
  const MU = String.fromCodePoint(0x3bc), MICRO = String.fromCodePoint(0xb5);
  const script = (u) => `The label reads 5 ${u}. Verify units against your course materials.`;
  it.each([MU + "g", MICRO + "g", "mcg"])("fails when %s is heard as grams or milligrams", (u) => {
    expect(audioCheck(script(u), script("g")).pass).toBe(false);
    expect(audioCheck(script(u), script("mg")).pass).toBe(false);
    expect(audioCheck(script(u), "The label reads 5 grams. Verify units against your course materials.").pass).toBe(false);
  });
  it.each([MU + "g", MICRO + "g", "mcg"])("passes a faithful reading of %s", (u) => {
    expect(audioCheck(script(u), "The label reads 5 micrograms. Verify units against your course materials.").pass).toBe(true);
    expect(audioCheck(script(u), script("mcg")).pass).toBe(true);
    expect(audioCheck(script(u), script(MU + "g")).pass).toBe(true);
  });
  it("keeps any other unhandled symbol as a token that must match", () => {
    const arrow = String.fromCodePoint(0x2192), dagger = String.fromCodePoint(0x2020);
    expect(speechTokens(`K ${arrow} cells`)).toContain("sym2192");
    expect(audioCheck(`Give the dose ${dagger} only after the potassium result is reviewed by the provider.`, "Give the dose only after the potassium result is reviewed by the provider.").pass).toBe(false);
  });
  it("still treats ordinary punctuation as neutral", () => {
    expect(speechTokens("Check the pulse, then — calmly — reassess.")).toEqual(speechTokens("Check the pulse then calmly reassess"));
  });
});

/* Astra, PR #134 review, round 14: affirmative contractions were promised
   as spelling differences but did not match their words. */
describe("contractions", () => {
  it.each([
    ["It is given with a meal.", "It's given with a meal."],
    ["They are at risk of falls.", "They're at risk of falls."],
    ["We have checked the site.", "We've checked the site."],
    ["You will feel a pinch.", "You'll feel a pinch."],
    ["I am going to check your pulse.", "I'm going to check your pulse."],
    ["That is the priority.", "That's the priority."],
    ["Let us review the steps.", "Let's review the steps."],
  ])("'%s' matches '%s'", (script, heard) => {
    expect(speechTokens(script)).toEqual(speechTokens(heard));
    expect(audioCheck(script, heard).pass).toBe(true);
  });
  it("still catches a negation hidden in a contraction", () => {
    expect(audioCheck("It is given with a meal, as the label directs for this rapid insulin.", "It isn't given with a meal, as the label directs for this rapid insulin.").pass).toBe(false);
    expect(audioCheck("They are at risk of falls when they get up quickly at night.", "They aren't at risk of falls when they get up quickly at night.").pass).toBe(false);
  });
  it("keeps a possessive a possessive", () => {
    expect(speechTokens("the client's pulse")).toEqual(speechTokens("the clients pulse"));
    expect(speechTokens("It's dose")).not.toEqual(speechTokens("Its dose"));
  });
  it("the real rapid-insulin narration passes a contracted transcript", async () => {
    const { DIAGRAMS } = await import("../src/diagrams/index.js");
    const step = DIAGRAMS.insulin.steps.find((s) => /\bit is\b/i.test(s.narration ?? ""));
    if (!step) return;   // nothing contractible in the current script
    const contracted = step.narration.replace(/\bIt is\b/, "It's").replace(/\bit is\b/, "it's");
    expect(audioCheck(step.narration, contracted).pass).toBe(true);
  });
});

/* Astra, PR #134 review, round 16: number words were summed, so "nine one
   one" read 11 and matched "eleven". */
describe("spoken numbers", () => {
  it("reads a digit string as digits, never as a sum", () => {
    expect(wordsToNumbers("nine one one")).toBe("911");
    expect(audioCheck("The emergency number is nine one one.", "The emergency number is eleven.").pass).toBe(false);
    expect(audioCheck("The emergency number is nine one one.", "The emergency number is 911.").pass).toBe(true);
    expect(audioCheck("Call extension two four six now.", "Call extension twelve now.").pass).toBe(false);
  });
  it("still reads cardinals and decimals", () => {
    expect(wordsToNumbers("twenty-one")).toBe("21");
    expect(wordsToNumbers("one hundred five")).toBe("105");
    expect(wordsToNumbers("nine hundred ninety nine")).toBe("999");
    expect(wordsToNumbers("seven point three five")).toBe("7.35");
    expect(wordsToNumbers("forty five")).toBe("45");
  });
  it("never adds words that cannot form one number", () => {
    expect(wordsToNumbers("one twenty")).toBe("1 20");
    expect(wordsToNumbers("twenty thirty")).toBe("20 30");
    expect(wordsToNumbers("eleven five")).toBe("11 5");
  });
});

/* Astra, PR #134 review, round 16: CLAUDE.md rule 8 — a verification that
   fails twice stops the run. The loop used to go on to the next clip. */
describe("recording stops at a clip that fails twice", () => {
  const work = ["one", "two", "three"].map((k) => ({ d: { id: "abg" }, s: { key: k, narration: `Step ${k} says the pH is low.` }, id: k }));
  const setup = (heardFor) => {
    const calls = [], stored = [], report = { characters: 0, failedQa: [], errors: [], recorded: [] };
    return { calls, stored, report, deps: {
      synthesise: async (text) => { calls.push(text); return Buffer.from(text); },
      transcribe: async (mp3) => heardFor(mp3.toString()),
      store: async (item) => { stored.push(item.s.key); },
      save: () => {}, report, log: () => {},
    } };
  };
  it("makes no further paid call after the second failed check", async () => {
    const { calls, stored, report, deps } = setup((t) => (t.includes("two") ? "Something else entirely." : t));
    const code = await recordAll(work, deps);
    expect(code).toBe(1);
    expect(stored).toEqual(["one"]);                       // what passed before the stop is kept
    expect(calls.filter((t) => t.includes("two"))).toHaveLength(2);
    expect(calls.some((t) => t.includes("three"))).toBe(false);   // nothing after the failure
    expect(report.stopped).toMatch(/abg\/two failed the audio check on both takes/);
  });
  it("records every clip when each passes", async () => {
    const { stored, deps } = setup((t) => t);
    expect(await recordAll(work, deps)).toBe(0);
    expect(stored).toEqual(["one", "two", "three"]);
  });
});

/* Astra, PR #134 review, round 17: any error mentioning "exist" was taken
   for a duplicate, so "bucket does not exist" shipped a dead URL. */
describe("an upload counts as done only when it really is", () => {
  it("accepts only the provider's explicit already-exists conflict", () => {
    expect(isDuplicateUpload({ statusCode: "409", error: "Duplicate", message: "The resource already exists" })).toBe(true);
    expect(isDuplicateUpload({ status: 409, message: "x" })).toBe(true);
    expect(isDuplicateUpload({ statusCode: "404", error: "Bucket not found", message: "The specified bucket does not exist" })).toBe(false);
    expect(isDuplicateUpload({ statusCode: "400", message: "Object does not exist" })).toBe(false);
    expect(isDuplicateUpload({ message: "duplicate key value violates unique constraint" })).toBe(false);
    expect(isDuplicateUpload(null)).toBe(false);
  });
  it("records no clip when storing it fails", async () => {
    const report = { characters: 0, failedQa: [], errors: [], recorded: [] };
    const manifest = {};
    const work = [{ d: { id: "abg" }, s: { key: "ph", narration: "The pH is low." }, id: "ph" }];
    const code = await recordAll(work, {
      synthesise: async (t) => Buffer.from(t), transcribe: async (m) => m.toString(), save: () => {}, report, log: () => {},
      store: async () => {
        const error = { statusCode: "404", message: "The specified bucket does not exist" };
        if (error && !isDuplicateUpload(error)) throw new Error(`upload: ${error.message}`);
        manifest.ph = "written";
      },
    });
    expect(code).toBe(1);
    expect(manifest).toEqual({});
    expect(report.errors[0].error).toMatch(/does not exist/);
  });
});
