/* Read aloud: what is spoken, when, and by which voice.
   ------------------------------------------------------------------
   - The question's script is the item on screen, in reading order, and
     never depends on the answer (listening must not give it away).
   - The explanation is a separate script, only built after answering.
   - The voice is the device's own; the best English voice it offers is
     chosen, and long parts are spoken in short sentences.
   - Readiness exams have no read aloud. */
import { describe, it, expect } from "vitest";
import React from "react";
import { readFileSync, existsSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { questionSegments, feedbackSegments, caseIntroSegments, caseStepSegments, cardSegments, speakable, validResult, partOf, PART_MAX, questionFeedbackSegments, caseFeedbackSegments, voiceable } from "../src/read-aloud-script.js";
import { ReadAloudBar, ra, RATES, loadPrefs, shouldAutoRead, readingMs, NOTES, pickVoice, voiceScore, speechChunks } from "../src/read-aloud.jsx";

const ROW = { id: 7, type: "mc", stem: "Which value is the priority?", options: ["Potassium 2.9 mEq/L", "Sodium 138 mEq/L"], answer: 0, rationale: "Low potassium risks dysrhythmias." };
const MC = { id: 1, type: "mc", stem: "A client on furosemide reports leg cramps. Which value is the priority?", options: ["Sodium 138 mEq/L", "Potassium 2.9 mEq/L", "Glucose 110 mg/dL", "Calcium 9.2 mg/dL"], answer: 1, rationale: "Hypokalemia is the priority." };

describe("question script", () => {
  it("reads the stem, how to answer, then each choice as the screen shows it", () => {
    const segs = questionSegments(MC);
    expect(segs.map((s) => s.id)).toEqual(["stem", "instruction", "opt0", "opt1", "opt2", "opt3"]);
    expect(segs[1].text).toBe("Choose one answer.");
    expect(segs[3].text).toBe("Potassium 2.9 milliequivalents per liter.");
  });

  it("never depends on the answer or reads the rationale", () => {
    const a = questionSegments(MC), b = questionSegments({ ...MC, answer: 3, rationale: "Something else entirely." });
    expect(b).toEqual(a);
    expect(JSON.stringify(a)).not.toMatch(/Hypokalemia is the priority|rationale|correct/i);
  });

  it("says each item type the way it is answered", () => {
    expect(questionSegments({ ...MC, type: "sata", answer: [1] })[1].text).toBe("Select all that apply.");
    expect(questionSegments({ ...MC, type: "order", answer: [0, 1, 2, 3] })[1].text).toBe("Put these in the correct order.");
    const matrix = questionSegments({ type: "matrix", stem: "Classify each finding.", extra: { rows: ["Crackles", "Clear lungs"], columns: ["Expected", "Unexpected"] } }, { rows: ["Crackles", "Clear lungs"], columns: ["Expected", "Unexpected"] });
    expect(matrix.map((s) => s.id)).toEqual(["stem", "instruction", "row0", "row1"]);
    expect(matrix[1].text).toBe("For each row, choose: Expected, or Unexpected.");
    const cloze = questionSegments({ type: "cloze", stem: "The client is at risk for {0} due to {1}." }, { dropdowns: [["bleeding", "clotting"], ["warfarin", "insulin"]] });
    expect(cloze[0].text).toBe("The client is at risk for blank 1 due to blank 2 .");
    expect(cloze[1]).toEqual({ id: "gap0", text: "Blank 1: bleeding, or clotting." });
    const bow = questionSegments({ type: "bowtie", stem: "Complete the diagram." }, { actions: ["Give oxygen", "Raise the head"], conditions: ["Pneumonia"], parameters: ["SpO2"] });
    expect(bow.map((s) => s.id)).toEqual(["stem", "bt-actions", "bt-condition", "bt-parameters"]);
    expect(bow[3].text).toBe("Parameters to monitor. Pick two. S P O 2.");
    const calc = questionSegments({ type: "calc", stem: "Calculate the rate." }, { unit: "mL/hr" });
    expect(calc[1].text).toBe("Enter a number. Answer in milliliters per hour.");
    const hl = questionSegments({ type: "highlight", stem: "Highlight the risks." }, { tokens: ["Gave away belongings", "Sleeps 8 hours"] });
    expect(hl.map((s) => s.id)).toEqual(["stem", "instruction", "tok0", "tok1"]);
  });

  it("says the instruction once when the stem already gives it", () => {
    const segs = questionSegments({ type: "sata", stem: "Which findings need follow-up? Select all that apply.", options: ["Glucose 38 mg/dL", "Temp 36.8 °C"] });
    expect(segs.map((s) => s.id)).toEqual(["stem", "opt0", "opt1"]);
    expect(segs[2].text).toBe("Temp 36.8 degrees Celsius.");
    expect(voiceable(speakable("Newborn Screening · First Visit"))).toBe(false); // a middle dot is never guessed at
    const quoted = questionSegments({ type: "mc", stem: "Which response is best?", options: ["\"Tell me more.\"", "(Stay with the client.)", "Call the provider"] });
    expect(quoted.slice(2).map((s) => s.text)).toEqual(["\"Tell me more.\"", "(Stay with the client.)", "Call the provider."]);
  });

  it("reads exhibits after the stem", () => {
    const segs = questionSegments({ ...MC, extra: { exhibit: [{ label: "Vital signs", content: "BP 88/50 mm Hg" }] } }, { ...MC, exhibit: [{ label: "Vital signs", content: "BP 88/50 mm Hg" }] });
    expect(segs[1]).toEqual({ id: "exhibit0", text: "Vital signs. BP 88/50 millimeters of mercury" });
  });

  it("speaks only the signs with one meaning, and never guesses at the rest", () => {
    // one meaning: said in words
    const sc = speakable("Dose = 0.1 mg/kg × 70 kg = 7 mg");
    expect(sc).toBe("Dose equals 0.1 milligrams per kilogram times 70 kg equals 7 mg");
    expect(voiceable(sc)).toBe(true);
    expect(speakable("5 * 2 = 10")).toBe("5 times 2 equals 10");
    expect(speakable("A 3 × 4 cm wound")).toBe("A 3 times 4 cm wound");
    // a middle dot, or an x between numbers, could be multiplication: never voiced, never turned into a pause
    for (const t of ["Calculate 0.1 mg/kg · 70 kg.", "Dose = 0.1 mg/kg · 70 kg = 7 mg", "Temperature example: 36.8 °C · 98.2 °F",
      "Dose = 2 mg/mL · volume in mL", "Dose = 2 mg/mL · Volume", "2 mg/mL · Volume in mL", "Give 2 mg/mL · volume",
      "Calculate MAP using (SBP + 2 · DBP) / 3.", "0.5 – 2.0 ng/mL · hold dose if pulse < 60/min",
      "HR 110 · RR 24, MAP = 65", "Newborn Screening · First Visit", "pH 7.35–7.45 · PaCO₂ 35–45", "A 3 x 4 cm wound", "2x3"]) {
      expect(speakable(t)).toContain(/x/i.test(t) && !/[·]/.test(t) ? "x" : "·"); // the sign is kept as written
      expect(voiceable(speakable(t)), t).toBe(false);
    }
    expect(voiceable(speakable("Take 2x daily"))).toBe(true);
  });

  it("spells out units and dosing shorthand, and nothing else", () => {
    expect(speakable("Give 20 mEq/L q4h PRN; PaCO2 48 mm Hg; K⁺ 6.1 → recheck")).toBe("Give 20 milliequivalents per liter every 4 hours as needed; P A C O 2 48 millimeters of mercury; potassium 6.1, then recheck");
    expect(speakable("Metoprolol 25 mg PO")).toBe("Metoprolol 25 mg PO");
  });
});

describe("explanation, case and card scripts", () => {
  it("reads the result, any correction, then the rationale", () => {
    expect(feedbackSegments({ verdict: "Incorrect", correctOrder: "Rescue, then Alarm", rationale: "RACE." })).toEqual([
      { id: "verdict", text: "Incorrect." }, { id: "correction", text: "The correct order is: Rescue, then Alarm." }, { id: "rationale", text: "Rationale. RACE." },
    ]);
  });

  it("reads a case's chart once and each step without its answer", () => {
    const cs = { title: "Sepsis", intro: "A 70-year-old client.", vitals: [["HR", "118"]], labs: [["Lactate", "4.1 mmol/L"]], note: "Confused." };
    expect(caseIntroSegments(cs).map((s) => s.text)).toEqual(["Sepsis.", "A 70-year-old client.", "Chart: HR 118; Lactate 4.1 millimoles per liter.", "Nurse's note: Confused."]);
    const step = { stem: "Which cue matters most?", options: ["HR", "Lactate"], type: "mc", answer: 1, rationale: "Lactate shows perfusion." };
    expect(JSON.stringify(caseStepSegments(step))).not.toMatch(/perfusion/);
  });

  it("reads a card's answer only after the flip", () => {
    const card = { front: "Antidote for heparin?", back: "Protamine sulfate" };
    expect(cardSegments(card, false)).toEqual([{ id: "card-front", text: "Antidote for heparin?" }]);
    expect(cardSegments(card, true)).toEqual([{ id: "card-back", text: "Answer. Protamine sulfate" }]);
  });
});

describe("the controls", () => {
  const reader = (over = {}) => ({ available: true, status: "idle", prefs: { rate: 1, auto: false }, setPrefs() {}, play() {}, pause() {}, resume() {}, stop() {}, isOn: () => false, ...over });

  it("shows a clear Listen button, speed and auto-read before anything plays", () => {
    const html = renderToStaticMarkup(<ReadAloudBar reader={reader()} label="Listen to the question" />);
    expect(html).toContain("🔊 Listen to the question");
    expect(html).toContain("1×");
    expect(html).toContain("Read each new one");
    expect(html).not.toContain("Stop");
  });

  it("offers pause and stop while reading, labelled as the device's voice", () => {
    const html = renderToStaticMarkup(<ReadAloudBar reader={reader({ status: "playing" })} />);
    expect(html).toContain("⏸ Pause");
    expect(html).toContain("■ Stop");
    expect(html).toContain("Your device&#x27;s voice");
    expect(html).not.toMatch(/AI voice/);
  });

  it("says plainly when the browser held the sound back, the voice failed, or a part is on screen only", () => {
    const esc = (t) => t.replace(/'/g, "&#x27;");
    expect(renderToStaticMarkup(<ReadAloudBar reader={reader({ status: "blocked" })} />)).toContain(esc(NOTES.blocked));
    expect(renderToStaticMarkup(<ReadAloudBar reader={reader({ status: "error" })} />)).toContain(esc(NOTES.error));
    expect(renderToStaticMarkup(<ReadAloudBar reader={reader({ status: "playing", silent: true })} />)).toContain(NOTES.silent);
    expect(renderToStaticMarkup(<ReadAloudBar reader={reader({ status: "playing" })} />)).not.toContain("ra-note");
    expect(Object.values(NOTES).join(" ")).not.toMatch(/prepar|queued|limit/i); // nothing is ever waited for
  });

  it("renders nothing on a browser with no speech voice", () => {
    expect(renderToStaticMarkup(<ReadAloudBar reader={reader({ available: false })} />)).toBe("");
  });

  it("highlights only the part being read", () => {
    const r = reader({ isOn: (id) => id === "opt1" });
    expect(ra(r, "opt1", "opt")).toBe("opt ra-now");
    expect(ra(r, "opt0", "opt")).toBe("opt");
  });

  it("defaults to normal speed and no auto-read without stored preferences", () => {
    expect(loadPrefs()).toEqual({ rate: 1, auto: false });
    expect(RATES).toEqual([0.8, 1, 1.25]);
  });

  it("gives a part shown on screen time to be read", () => {
    expect(readingMs("one two")).toBe(2000);
    expect(readingMs(Array(30).fill("w").join(" "))).toBe(10000);
    expect(readingMs(Array(30).fill("w").join(" "), 1.25)).toBe(8000);
  });

  it("keeps the same element highlighted across the pieces of a long part", () => {
    const r = { isOn: (id) => partOf("rationale~2") === id };
    expect(ra(r, "rationale", "rationale")).toBe("rationale ra-now");
  });
});

describe("long parts", () => {
  it("splits a long rationale at sentence ends into pieces that share the part's id", () => {
    const sentenceText = "The client needs careful reassessment of potassium after each replacement dose. ";
    const long = { ...ROW, rationale: sentenceText.repeat(30).trim() };
    const fb = questionFeedbackSegments(long, { correct: false, points: 0, max: 1 });
    const parts = fb.filter((x) => partOf(x.id) === "rationale");
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.map((x) => x.id)).toEqual(parts.map((_, i) => (i ? `rationale~${i + 1}` : "rationale")));
    for (const x of parts) { expect(x.text.length).toBeLessThanOrEqual(PART_MAX); expect(x.text).toMatch(/\.$/); }
    expect(parts.map((x) => x.text).join(" ")).toBe(`Rationale. ${long.rationale}`);
  });
});

describe("auto-read", () => {
  it("never auto-starts a reader that has been switched off", () => {
    expect(shouldAutoRead("case:12", true, 4)).toBe(true);
    expect(shouldAutoRead("off", true, 4)).toBe(false); // e.g. the case introduction after "Begin case"
    expect(shouldAutoRead("case:12", false, 4)).toBe(false);
    expect(shouldAutoRead("case:12", true, 0)).toBe(false);
  });
});

describe("the explanation's result line", () => {
  it("reads the result the screen shows, and nothing for a result it cannot show", () => {
    expect(questionFeedbackSegments(ROW, { correct: false, points: 0, max: 1 }).map((x) => x.text)).toEqual(["Incorrect.", "Rationale. Low potassium risks dysrhythmias."]);
    expect(questionFeedbackSegments(ROW, { correct: true, points: 0, max: 1 })).toEqual([]);
  });

  it("accepts only results the screen can show", () => {
    expect(validResult({ correct: true, points: 1, max: 1 })).toBe(true);
    expect(validResult({ correct: false, points: 2, max: 4 })).toBe(true);
    expect(validResult({ correct: true, points: 0, max: 1 })).toBe(false);
    expect(validResult({ correct: false, points: 5, max: 4 })).toBe(false);
    expect(validResult({ correct: false, points: 0, max: 99 })).toBe(false);
  });
});

describe("every part that can be read has something highlighted on screen", () => {
  /* A part whose signs could be read two ways is shown, not voiced ("read
     this part on screen"), so every part id a script can produce must map
     to a highlighted element for its reader in App.jsx. */
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const exhibits = readFileSync(new URL("../src/exhibit-tabs.jsx", import.meta.url), "utf8");
  const family = (id) => partOf(id).replace(/\d+$/, "#");
  const target = (reader, fam) => {
    const lit = fam.includes("#") ? `ra(${reader}, \`${fam.replace("#", "${")}` : `ra(${reader}, "${fam}"`;
    if (fam === "exhibit#") return reader === "qReader" && app.includes("<ExhibitTabs tabs={ext.exhibit} reader={qReader} />") && exhibits.includes("ra(reader, `exhibit${i}`");
    return app.includes(lit) || (fam.startsWith("bt-") && app.includes(`ra(${reader}, \`bt-\${col.slot}\``)) || (fam.startsWith("card-") && app.includes(`ra(${reader}, show ? "card-back" : "card-front"`));
  };
  const types = [
    { ...ROW, type: "mc" }, { ...ROW, type: "sata", answer: [0] }, { ...ROW, type: "order", answer: [1, 0] },
    { type: "matrix", stem: "S.", extra: { rows: ["a"], columns: ["x", "y"] }, answer: [0] },
    { type: "cloze", stem: "S {0}.", extra: { dropdowns: [["a", "b"]] }, answer: [1] },
    { type: "bowtie", stem: "S.", extra: { actions: ["a"], conditions: ["c"], parameters: ["p"] }, answer: { actions: [0], condition: 0, parameters: [0] } },
    { type: "calc", stem: "S.", extra: { unit: "mL" }, answer: 1 },
    { type: "highlight", stem: "S.", extra: { tokens: ["t"] }, answer: [0] },
    { ...ROW, extra: { exhibit: [{ label: "Vitals", content: "BP 90/60" }] } },
  ];
  const WRONG = { correct: false, points: 0, max: 1 };
  it("the question reader and the explanation reader", () => {
    const q = new Set(types.flatMap((t) => questionSegments(t, { ...t, ...(t.extra ?? {}) }).map((x) => family(x.id))));
    const fb = new Set(types.flatMap((t) => questionFeedbackSegments(t, WRONG).map((x) => family(x.id))));
    expect([...q].filter((f) => !target("qReader", f))).toEqual([]);
    expect([...fb].filter((f) => !target("fbReader", f))).toEqual([]);
    expect(fb.has("correction")).toBe(true);
  });
  it("the case and flashcard readers", () => {
    const cs = { title: "T", intro: "I.", vitals: [["HR", "1"]], labs: [], note: "N.", steps: [{ stem: "S?", options: ["a"], type: "sata", answer: [0], rationale: "R." }] };
    expect(caseIntroSegments(cs).map((x) => family(x.id)).filter((f) => !target("introReader", f))).toEqual([]);
    expect(caseStepSegments(cs.steps[0]).map((x) => family(x.id)).filter((f) => !target("stepReader", f))).toEqual([]);
    expect(caseFeedbackSegments(cs.steps[0], WRONG).map((x) => family(x.id)).filter((f) => !target("caseFbReader", f))).toEqual([]);
    expect([...cardSegments({ front: "F", back: "B" }, false), ...cardSegments({ front: "F", back: "B" }, true)].map((x) => family(x.id)).filter((f) => !target("cardReader", f))).toEqual([]);
  });
});

describe("where read aloud appears", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  it("is on practice questions, explanations, case studies and flashcards", () => {
    for (const label of ["Listen to the question", "Listen to the explanation", "Listen to the case", "Listen to this step", "Listen to the card", "Listen to the answer"]) expect(app).toContain(label);
  });
  it("is not in readiness exams", () => {
    const exam = readFileSync(new URL("../src/exam.jsx", import.meta.url), "utf8");
    expect(exam).not.toMatch(/read-aloud|useReadAloud|ReadAloudBar|speechSynthesis/);
  });
});

describe("the device's voice", () => {
  const v = (name, lang = "en-US", extra = {}) => ({ name, lang, default: false, ...extra });
  it("chooses the most natural English voice the device offers", () => {
    expect(pickVoice([v("Microsoft David - English (United States)"), v("Microsoft Aria Online (Natural) - English (United States)")]).name).toMatch(/Aria/);
    expect(pickVoice([v("Samantha"), v("Ava (Premium)")]).name).toBe("Ava (Premium)");
    expect(pickVoice([v("Google UK English Female", "en-GB"), v("Google US English")]).name).toBe("Google US English");
    expect(pickVoice([v("Thomas", "fr-FR"), v("Daniel", "en-GB")]).name).toBe("Daniel");
  });
  it("never chooses a novelty voice or a voice for another language", () => {
    expect(pickVoice([v("Zarvox"), v("Bad News"), v("Whisper")])).toBe(null);
    expect(pickVoice([v("Amélie", "fr-CA")])).toBe(null);
    expect(voiceScore(v("Fred"))).toBeLessThan(0);
    expect(pickVoice([])).toBe(null); // the browser then uses its default English voice
  });
  it("speaks a long part in short sentences, never splitting a number", () => {
    const text = "Rationale. Potassium 2.9 mEq/L is low. Hypokalemia risks dysrhythmias; replace it as ordered.";
    expect(speechChunks(text)).toEqual(["Rationale.", "Potassium 2.9 mEq/L is low.", "Hypokalemia risks dysrhythmias;", "replace it as ordered."]);
    const long = Array(80).fill("word").join(" ");
    const pieces = speechChunks(long);
    expect(pieces.every((p) => p.length <= 200)).toBe(true);
    expect(pieces.join(" ")).toBe(long);
  });
  it("is the browser's own speech: no server voice, key or audio download", () => {
    const src = readFileSync(new URL("../src/read-aloud.jsx", import.meta.url), "utf8");
    expect(src).toContain("speechSynthesis");
    expect(src).not.toMatch(/fetch\(|\/api\/ai|new Audio\(/);
    expect(existsSync(new URL("../api/_speak.js", import.meta.url))).toBe(false);
    expect(existsSync(new URL("../../.github/workflows/pulsern-read-aloud.yml", import.meta.url))).toBe(false);
  });
});
