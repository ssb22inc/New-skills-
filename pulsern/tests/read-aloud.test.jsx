/* Read aloud: what is spoken, when, and by which voice.
   ------------------------------------------------------------------
   - The question's script is the item on screen, in reading order, and
     never depends on the answer (listening must not give it away).
   - The explanation is a separate script, only built after answering.
   - The server voice is signed-in only, cached privately, and paid for once
     per passage; without a key it says so and the app uses the device voice.
   - Readiness exams have no read aloud. */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { questionSegments, feedbackSegments, caseIntroSegments, caseStepSegments, cardSegments, speakable } from "../src/read-aloud-script.js";
import { ReadAloudBar, pickDeviceVoice, ra, RATES, loadPrefs, sentences, speakLimitMs } from "../src/read-aloud.jsx";
import { speak, speechKey, validSpeechText, SPEAK_MAX, BUCKET, TTS } from "../api/_speak.js";

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
    expect(speakable("Newborn Screening · First Visit")).toBe("Newborn Screening, First Visit");
    const quoted = questionSegments({ type: "mc", stem: "Which response is best?", options: ["\"Tell me more.\"", "(Stay with the client.)", "Call the provider"] });
    expect(quoted.slice(2).map((s) => s.text)).toEqual(["\"Tell me more.\"", "(Stay with the client.)", "Call the provider."]);
  });

  it("reads exhibits after the stem", () => {
    const segs = questionSegments({ ...MC, extra: { exhibit: [{ label: "Vital signs", content: "BP 88/50 mm Hg" }] } }, { ...MC, exhibit: [{ label: "Vital signs", content: "BP 88/50 mm Hg" }] });
    expect(segs[1]).toEqual({ id: "exhibit0", text: "Vital signs. BP 88/50 millimeters of mercury" });
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
  const reader = (over = {}) => ({ available: true, status: "idle", source: "ai", prefs: { rate: 1, auto: false }, setPrefs() {}, play() {}, pause() {}, resume() {}, stop() {}, isOn: () => false, ...over });

  it("shows a clear Listen button, speed and auto-read before anything plays", () => {
    const html = renderToStaticMarkup(<ReadAloudBar reader={reader()} label="Listen to the question" />);
    expect(html).toContain("🔊 Listen to the question");
    expect(html).toContain("1×");
    expect(html).toContain("Read each new one");
    expect(html).not.toContain("Stop");
  });

  it("offers pause and stop while reading, and says which voice is speaking", () => {
    const html = renderToStaticMarkup(<ReadAloudBar reader={reader({ status: "playing", source: "device" })} />);
    expect(html).toContain("⏸ Pause");
    expect(html).toContain("■ Stop");
    expect(html).toContain("Your device&#x27;s voice");
    expect(renderToStaticMarkup(<ReadAloudBar reader={reader({ status: "playing" })} />)).toContain("AI voice");
  });

  it("renders nothing when no voice is available", () => {
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

  it("gives the device voice one sentence at a time, never splitting a number", () => {
    expect(sentences("Potassium is 2.9 mEq/L. Which action is first? Give it now")).toEqual(["Potassium is 2.9 mEq/L.", "Which action is first?", "Give it now"]);
    expect(speakLimitMs("one two three")).toBe(4000);
    expect(speakLimitMs(Array(50).fill("w").join(" "), 1)).toBe(50000);
    expect(speakLimitMs(Array(50).fill("w").join(" "), 1.25)).toBe(40000);
  });

  it("prefers a natural English voice on the device", () => {
    const v = (name, lang, localService = true) => ({ name, lang, localService });
    expect(pickDeviceVoice([v("Fred", "en-US"), v("Microsoft Aria Online (Natural)", "en-US", false), v("Thomas", "fr-FR")]).name).toMatch(/Aria/);
    expect(pickDeviceVoice([v("Fred", "en-US")]).name).toBe("Fred");
    expect(pickDeviceVoice([v("Thomas", "fr-FR")])).toBeNull();
  });
});

/* A fake private bucket: list/upload/sign, recording calls. */
function fakeStorage({ existing = [], missingBucket = false } = {}) {
  const files = new Set(existing);
  let bucketExists = !missingBucket;
  const calls = { upload: 0, createBucket: [] };
  const bucket = {
    list: async (dir, { search }) => ({ data: [...files].filter((f) => f === `${dir}/${search}`).map((f) => ({ name: f.split("/").pop() })), error: null }),
    upload: async (path, body, opts) => {
      calls.upload++;
      if (!bucketExists) return { error: { message: "Bucket not found" } };
      expect(opts.contentType).toBe("audio/mpeg");
      files.add(path);
      return { error: null };
    },
    createSignedUrl: async (path, secs) => (files.has(path) ? { data: { signedUrl: `https://signed.example/${path}?ttl=${secs}` }, error: null } : { data: null, error: { message: "Object not found" } }),
  };
  return { calls, files, storage: { from: (b) => { expect(b).toBe(BUCKET); return bucket; }, createBucket: async (name, opts) => { calls.createBucket.push([name, opts]); bucketExists = true; return { error: null }; } } };
}
const okAudio = () => vi.fn(async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }));

describe("server voice", () => {
  it("refuses empty or overlong text", async () => {
    expect(validSpeechText("")).toBe(false);
    expect(validSpeechText("x".repeat(SPEAK_MAX + 1))).toBe(false);
    expect((await speak({ text: "", apiKey: "k", storage: fakeStorage().storage })).status).toBe(400);
  });

  it("says it has no voice when the key is not set, so the app uses the device voice", async () => {
    const fetchImpl = vi.fn();
    expect(await speak({ text: "Hello.", apiKey: "", storage: fakeStorage().storage, fetchImpl })).toEqual({ status: 503, body: { error: "Voice unavailable" } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("makes a passage once, saves it privately and returns a short-lived link", async () => {
    const { storage, calls, files } = fakeStorage();
    const fetchImpl = okAudio();
    const out = await speak({ text: "Which value is the priority?", apiKey: "k", storage, fetchImpl });
    expect(out.status).toBe(200);
    expect(out.body.cached).toBe(false);
    expect(out.body.url).toMatch(/^https:\/\/signed\.example\/marin\/[0-9a-f]{40}\.mp3\?ttl=3600$/);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/audio/speech");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: TTS.model, voice: "marin", input: "Which value is the priority?", response_format: "mp3" });
    expect(body.instructions).toMatch(/never hint which choice is right/i);
    expect(init.headers.Authorization).toBe("Bearer k");
    expect(calls.upload).toBe(1);
    expect(files.size).toBe(1);

    const again = await speak({ text: "Which value is the priority?", apiKey: "k", storage, fetchImpl });
    expect(again.body.cached).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // paid once
  });

  it("creates the private bucket on first use", async () => {
    const { storage, calls } = fakeStorage({ missingBucket: true });
    const out = await speak({ text: "Hello.", apiKey: "k", storage, fetchImpl: okAudio() });
    expect(out.status).toBe(200);
    expect(calls.createBucket).toEqual([[BUCKET, { public: false }]]);
  });

  it("reports a provider failure without saving anything", async () => {
    const { storage, calls } = fakeStorage();
    const out = await speak({ text: "Hello.", apiKey: "k", storage, fetchImpl: vi.fn(async () => ({ ok: false, status: 500 })) });
    expect(out.status).toBe(502);
    expect(calls.upload).toBe(0);
  });

  it("keys each passage by its exact words and voice settings", () => {
    expect(speechKey("A.")).not.toBe(speechKey("A. "));
    expect(speechKey("A.")).not.toBe(speechKey("A.", { ...TTS, voice: "cedar" }));
    expect(speechKey("A.")).toMatch(/^[0-9a-f]{40}$/);
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
