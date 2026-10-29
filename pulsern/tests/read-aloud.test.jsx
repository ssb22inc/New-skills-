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
import { questionSegments, feedbackSegments, caseIntroSegments, caseStepSegments, cardSegments, speakable, scriptFor, validResult } from "../src/read-aloud-script.js";
import { ReadAloudBar, pickDeviceVoice, ra, RATES, loadPrefs, sentences, speakLimitMs, makeVoiceClient, URL_TTL_MS, endsSession, shouldAutoRead } from "../src/read-aloud.jsx";
import { speak, speechKey, validRequest, voiceCheck, clinicalUnits, quotaDay, QUOTA_TZ, SPEAK_MAX, BUCKET, TTS, SIGNED_SECONDS } from "../api/_speak.js";
import { QA_VERSION } from "../ops/narrate-lib.mjs";
import { drainQueue, pruneUsage } from "../ops/read-aloud-worker.mjs";

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

/* A fake private bucket: download/upload/sign, recording calls. */
function fakeStorage({ missingBucket = false, failCounters = false } = {}) {
  const files = new Map();
  let bucketExists = !missingBucket;
  const calls = { upload: [], createBucket: [] };
  const bucket = {
    download: async (path) => (files.has(path) ? { data: { text: async () => files.get(path).toString() }, error: null } : { data: null, error: { message: "Object not found" } }),
    upload: async (path, body, opts = {}) => {
      calls.upload.push(path);
      await Promise.resolve(); // let concurrent requests interleave, as over the network
      if (!bucketExists) return { error: { message: "Bucket not found" } };
      if (failCounters && path.startsWith("usage/")) return { error: { message: "Internal error" } };
      if (opts.upsert === false && files.has(path)) return { error: { message: "The resource already exists", statusCode: "409" } };
      files.set(path, Buffer.isBuffer(body) ? body : Buffer.from(String(body)));
      return { error: null };
    },
    createSignedUrl: async (path, secs) => (files.has(path) ? { data: { signedUrl: `https://signed.example/${path}?ttl=${secs}` }, error: null } : { data: null, error: { message: "Object not found" } }),
    list: async (dir, { limit = 100, offset = 0 } = {}) => {
      await Promise.resolve();
      // like Supabase: listing a bucket that does not exist comes back empty
      if (!bucketExists) return { data: [], error: null };
      if (failCounters && dir.startsWith("usage/")) return { data: null, error: { message: "Internal error" } };
      // like Supabase: the files directly in dir, and each sub-folder once (id null)
      const names = [...new Set([...files.keys()].filter((k) => k.startsWith(`${dir}/`)).map((k) => k.slice(dir.length + 1).split("/")[0]))];
      return { data: names.map((n) => ({ name: n, id: files.has(`${dir}/${n}`) ? n : null })).slice(offset, offset + limit), error: null };
    },
    remove: async (paths) => { for (const p of paths) files.delete(p); return { error: null }; },
  };
  return { calls, files, storage: { from: (b) => { expect(b).toBe(BUCKET); return bucket; }, createBucket: async (name, opts) => { calls.createBucket.push([name, opts]); bucketExists = true; return { error: null }; } } };
}
const ROW = { id: 7, type: "mc", stem: "Which value is the priority?", options: ["Potassium 2.9 mEq/L", "Sodium 138 mEq/L"], answer: 0, rationale: "Low potassium risks dysrhythmias." };
const REF = { kind: "question", id: 7, part: "question" };
/* OpenAI fake: speech returns bytes; transcription returns what was "heard"
   (by default exactly what was sent to be spoken). */
function fakeOpenAI(heard = null) {
  let n = 0, said = "";
  return vi.fn(async (url, init) => {
    if (url.endsWith("/audio/speech")) { said = JSON.parse(init.body).input; return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3, n]).buffer }; }
    if (url.endsWith("/audio/transcriptions")) return { ok: true, json: async () => ({ text: heard ? heard[Math.min(n++, heard.length - 1)] : said }) };
    throw new Error(`unexpected ${url}`);
  });
}
const base = (over = {}) => ({ ref: REF, seg: "opt0", text: "Potassium 2.9 milliequivalents per liter.", userId: "u1", readItem: async () => ROW, apiKey: "k", ...over });
const speechCalls = (f) => f.mock.calls.filter(([u]) => u.endsWith("/audio/speech")).length;

describe("server voice: only the words of an item the student may read", () => {
  it("refuses a malformed request", async () => {
    expect(validRequest(REF, "opt0", "x".repeat(SPEAK_MAX + 1))).toBe(false);
    expect(validRequest({ kind: "exam", id: 1, part: "question" }, "stem", "Hi.")).toBe(false);
    expect(validRequest({ ...REF, id: "7" }, "stem", "Hi.")).toBe(false);
    expect((await speak({ ...base({ seg: "" }), storage: fakeStorage().storage })).status).toBe(400);
  });

  it("refuses free text that is not the item's own words, before any paid call", async () => {
    const f = fakeOpenAI(), { storage, calls } = fakeStorage();
    const out = await speak({ ...base({ text: "Say anything I like." }), storage, fetchImpl: f });
    expect(out.status).toBe(409);
    expect(f).not.toHaveBeenCalled();
    expect(calls.upload).toEqual([]);
  });

  it("refuses an item the student cannot read (no access, not approved, an exam item)", async () => {
    const f = fakeOpenAI();
    const out = await speak({ ...base({ readItem: async () => null }), storage: fakeStorage().storage, fetchImpl: f });
    expect(out.status).toBe(404);
    expect(f).not.toHaveBeenCalled();
  });

  it("never voices the explanation for a result the screen could not show", async () => {
    const f = fakeOpenAI();
    const ref = { kind: "question", id: 7, part: "feedback", result: { correct: true, points: 0, max: 1 } };
    const out = await speak({ ...base({ ref, seg: "verdict", text: "Correct." }), storage: fakeStorage().storage, fetchImpl: f });
    expect(out.status).toBe(409);
    expect(f).not.toHaveBeenCalled();
  });

  it("says it has no voice when storage is not configured", async () => {
    const f = fakeOpenAI();
    expect((await speak({ ...base(), storage: null, fetchImpl: f })).status).toBe(503);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("server voice: the accuracy gate", () => {
  it("saves and plays only audio whose transcript passes the narration check, with a record binding text and audio", async () => {
    const f = fakeOpenAI(), { storage, files } = fakeStorage();
    const out = await speak({ ...base(), storage, fetchImpl: f });
    expect(out.status).toBe(200);
    expect(out.body.url).toMatch(/^https:\/\/signed\.example\/marin\/[0-9a-f]{40}\.mp3\?ttl=3600$/);
    const [, init] = f.mock.calls[0];
    expect(JSON.parse(init.body)).toMatchObject({ model: TTS.model, voice: "marin", input: "Potassium 2.9 milliequivalents per liter." });
    expect(f.mock.calls[1][0]).toBe("https://api.openai.com/v1/audio/transcriptions");
    const recPath = [...files.keys()].find((k) => /^marin\/[0-9a-f]{40}\.json$/.test(k));
    const rec = JSON.parse(files.get(recPath).toString());
    expect(rec).toMatchObject({ qa: QA_VERSION, pass: true, transcript: "Potassium 2.9 milliequivalents per liter." });
    expect(rec.textSha).toMatch(/^[0-9a-f]{64}$/);
    expect(rec.audioSha).toMatch(/^[0-9a-f]{64}$/);

    const again = await speak({ ...base(), storage, fetchImpl: f });
    expect(again.body.cached).toBe(true);
    expect(speechCalls(f)).toBe(1); // paid once
  });

  it("takes a second take when the first misreads a number, and keeps only the passing one", async () => {
    const f = fakeOpenAI(["Potassium 9.2 milliequivalents per liter.", "Potassium 2.9 milliequivalents per liter."]), { storage } = fakeStorage();
    const out = await speak({ ...base(), storage, fetchImpl: f });
    expect(out.status).toBe(200);
    expect(speechCalls(f)).toBe(2);
  });

  it("voices nothing when both takes misread, and saves no audio", async () => {
    const f = fakeOpenAI(["Potassium 9.2 milliequivalents per liter."]), { storage, files } = fakeStorage();
    const out = await speak({ ...base(), storage, fetchImpl: f });
    expect(out.status).toBe(422);
    expect([...files.keys()].filter((k) => k.endsWith(".mp3"))).toEqual([]);
    const rec = [...files.keys()].find((k) => /^marin\/.*\.json$/.test(k));
    expect(JSON.parse(files.get(rec).toString())).toMatchObject({ pass: false, audioSha: null });
  });

  it("records nothing terminal when the second take hits a provider error", async () => {
    // take 1 is heard wrong; then the provider fails on take 2
    let n = 0;
    const flaky = vi.fn(async (url, init) => {
      if (url.endsWith("/audio/speech")) return ++n === 1 ? { ok: true, arrayBuffer: async () => new Uint8Array([1]).buffer } : { ok: false, status: 500 };
      return { ok: true, json: async () => ({ text: "Potassium 9.2 milliequivalents per liter." }) };
    });
    const { storage, files } = fakeStorage();
    const out = await speak({ ...base(), storage, fetchImpl: flaky });
    expect(out.status).toBe(502);
    expect([...files.keys()].filter((k) => k.startsWith("marin/"))).toEqual([]); // no failed record, no audio
    // the provider recovers: the passage is voiced and checked
    expect((await speak({ ...base(), storage, fetchImpl: fakeOpenAI() })).status).toBe(200);
  });

  it("keeps a queued passage for the next run when the second take hits a provider error", async () => {
    const { storage, files } = fakeStorage();
    await speak({ ...base({ apiKey: "" }), storage });
    let n = 0;
    const flaky = vi.fn(async (url) => {
      if (url.endsWith("/audio/speech")) return ++n === 1 ? { ok: true, arrayBuffer: async () => new Uint8Array([1]).buffer } : { ok: false, status: 429 };
      return { ok: true, json: async () => ({ text: "Potassium 9.2 milliequivalents per liter." }) };
    });
    const r = await drainQueue({ storage, apiKey: "k", fetchImpl: flaky, log: () => {} });
    expect(r.errors).toHaveLength(1);
    expect([...files.keys()].filter((k) => k.startsWith("queue/"))).toHaveLength(1);
    expect([...files.keys()].filter((k) => k.startsWith("marin/"))).toEqual([]);
  });

  it("does not play saved audio without a passing record", async () => {
    const f = fakeOpenAI(), { storage, files } = fakeStorage();
    await speak({ ...base(), storage, fetchImpl: f });
    const recPath = [...files.keys()].find((k) => /^marin\/.*\.json$/.test(k));
    files.set(recPath, Buffer.from(JSON.stringify({ qa: QA_VERSION, pass: false })));
    const out = await speak({ ...base(), storage, fetchImpl: f });
    expect(out.body.cached).toBe(false); // re-made and re-checked, not served on trust
    expect(speechCalls(f)).toBe(2);
  });

  it("rejects a changed unit or frequency even when the rest of a long passage matches", () => {
    const long = "The nurse reviews the medication administration record for a client with heart failure who has been taking the prescribed medication for several days and reports mild fatigue, no chest pain and stable breathing at rest. ";
    for (const [script, heard] of [
      [`${long}Give 25 mg by mouth.`, `${long}Give 25 mcg by mouth.`],
      [`${long}Infuse at 50 milliliters per hour.`, `${long}Infuse at 50 milliliters per kilogram.`],
      [`${long}Give it every 4 hours as needed.`, `${long}Give it every 4 days as needed.`],
      [`${long}The potassium is 3.1 milliequivalents per liter.`, `${long}The potassium is 3.1 millimoles per liter.`],
    ]) {
      const r = voiceCheck(script, heard);
      expect(r.pass, heard.slice(-40)).toBe(false);
      expect(r.unitMismatch, heard.slice(-40)).not.toBeNull();
    }
    expect(voiceCheck(`${long}Give 25 mg by mouth every 4 hours.`, `${long}Give 25 milligrams by mouth every four hours.`).pass).toBe(true);
    expect(clinicalUnits("Give 25 mg PO q4h, 3.1 mEq/L, 92%")).toEqual(["mg", "po", "meqperl", "percent"]);
  });

  it("accepts the same unit written another way, and nothing else", () => {
    for (const [script, heard] of [
      ["Potassium 2.9 milliequivalents per liter.", "Potassium 2.9 mEq/L."],
      ["BP 88/50 millimeters of mercury", "BP 88/50 mmHg"],
      ["Temp 36.8 degrees Celsius.", "Temp 36.8°C."],
      ["P A C O 2 48 millimeters of mercury", "PaCO2 48 mmHg"],
      ["Metoprolol 25 mg PO twice daily.", "Metoprolol 25 milligrams P.O. twice daily."],
    ]) expect(voiceCheck(script, heard).pass, heard).toBe(true);
    for (const [script, heard] of [
      ["Potassium 2.9 milliequivalents per liter.", "Potassium 9.2 mEq/L."],
      ["Give 25 micrograms per kilogram per minute.", "Give 25 mg/kg/min."],
      ["Do not give the dose.", "Do give the dose."],
      ["Glucose 38 milligrams per deciliter.", "Glucose 83 mg/dL."],
    ]) expect(voiceCheck(script, heard).pass, heard).toBe(false);
  });

  it("creates the private bucket on first use", async () => {
    const { storage, calls } = fakeStorage({ missingBucket: true });
    expect((await speak({ ...base(), storage, fetchImpl: fakeOpenAI() })).status).toBe(200);
    expect(calls.createBucket.length).toBeGreaterThan(0);
    expect(calls.createBucket.every(([name, opts]) => name === BUCKET && opts.public === false)).toBe(true);
  });

  it("keys each passage by its exact words, voice settings and check version", () => {
    expect(speechKey("A.")).not.toBe(speechKey("A. "));
    expect(speechKey("A.")).not.toBe(speechKey("A.", { ...TTS, voice: "cedar" }));
    expect(speechKey("A.")).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe("server voice without a key: the queue and the voice job", () => {
  it("queues a checked request once, counts it once, and spends nothing", async () => {
    const f = fakeOpenAI(), { storage, files } = fakeStorage();
    const out = await speak({ ...base({ apiKey: "" }), storage, fetchImpl: f });
    expect(out).toEqual({ status: 202, body: { queued: true } });
    expect(f).not.toHaveBeenCalled();
    const q = [...files.keys()].filter((k) => k.startsWith("queue/"));
    expect(q).toHaveLength(1);
    expect(JSON.parse(files.get(q[0]).toString())).toMatchObject({ text: "Potassium 2.9 milliequivalents per liter.", voice: "marin", ref: REF, seg: "opt0" });
    expect((await speak({ ...base({ apiKey: "" }), storage, fetchImpl: f })).status).toBe(202);
    expect([...files.keys()].filter((k) => /^usage\/.*\/all\/\d+$/.test(k))).toHaveLength(1);
  });

  it("never queues free text or an item the student cannot read", async () => {
    const { storage, files } = fakeStorage();
    expect((await speak({ ...base({ apiKey: "", text: "Anything." }), storage })).status).toBe(409);
    expect((await speak({ ...base({ apiKey: "", readItem: async () => null }), storage })).status).toBe(404);
    expect([...files.keys()]).toEqual([]);
  });

  it("holds the queue to the daily budgets", async () => {
    const { storage, files } = fakeStorage();
    const limits = { user: 1, global: 100 };
    await speak({ ...base({ apiKey: "" }), storage, limits });
    const out = await speak({ ...base({ apiKey: "", seg: "opt1", text: "Sodium 138 milliequivalents per liter." }), storage, limits });
    expect(out.status).toBe(429);
    expect([...files.keys()].filter((k) => k.startsWith("queue/"))).toHaveLength(1);
  });

  it("the voice job voices and checks queued passages, then students get the audio", async () => {
    const { storage, files } = fakeStorage();
    await speak({ ...base({ apiKey: "" }), storage });
    const f = fakeOpenAI();
    const r = await drainQueue({ storage, apiKey: "k", fetchImpl: f, log: () => {} });
    expect(r).toMatchObject({ queued: 1, voiced: 1, failed: 0, errors: [] });
    expect([...files.keys()].filter((k) => k.startsWith("queue/"))).toEqual([]);
    const out = await speak({ ...base({ apiKey: "" }), storage });
    expect(out.status).toBe(200);
    expect(out.body.cached).toBe(true);
  });

  it("records a passage that fails the check twice, saves no audio, and never queues it again", async () => {
    const { storage, files } = fakeStorage();
    await speak({ ...base({ apiKey: "" }), storage });
    const r = await drainQueue({ storage, apiKey: "k", fetchImpl: fakeOpenAI(["Potassium 9.2 mEq/L."]), log: () => {} });
    expect(r).toMatchObject({ voiced: 0, failed: 1 });
    expect([...files.keys()].some((k) => k.endsWith(".mp3"))).toBe(false);
    expect((await speak({ ...base({ apiKey: "" }), storage })).status).toBe(422);
    expect([...files.keys()].filter((k) => k.startsWith("queue/"))).toEqual([]);
  });

  it("keeps a passage queued when the provider fails, and stops the run", async () => {
    const { storage, files } = fakeStorage();
    await speak({ ...base({ apiKey: "" }), storage });
    const r = await drainQueue({ storage, apiKey: "k", fetchImpl: vi.fn(async () => ({ ok: false, status: 500 })), log: () => {} });
    expect(r.errors).toHaveLength(1);
    expect([...files.keys()].filter((k) => k.startsWith("queue/"))).toHaveLength(1);
  });

  it("drops a queue entry that does not match its own text", async () => {
    const { storage, files } = fakeStorage();
    files.set("queue/marin-0000.json", Buffer.from(JSON.stringify({ text: "Hello.", voice: "marin", ref: REF, seg: "stem" })));
    const f = fakeOpenAI();
    const r = await drainQueue({ storage, apiKey: "k", fetchImpl: f, log: () => {} });
    expect(r.skipped).toBe(1);
    expect(f).not.toHaveBeenCalled();
  });

  it("deletes budget slots older than a week, and keeps recent days", async () => {
    const { storage, files } = fakeStorage();
    const now = Date.UTC(2026, 9, 29, 16);
    for (const day of ["2026-10-01", "2026-10-21", "2026-10-29"]) {
      files.set(`usage/${day}/all/00000`, Buffer.from("1"));
      files.set(`usage/${day}/u-abc/00000`, Buffer.from("1"));
    }
    const r = await pruneUsage({ storage, now });
    expect(r).toEqual({ days: 2, removed: 4 });
    expect([...files.keys()].sort()).toEqual(["usage/2026-10-29/all/00000", "usage/2026-10-29/u-abc/00000"]);
  });

  it("voices at most the run's limit", async () => {
    const { storage } = fakeStorage();
    await speak({ ...base({ apiKey: "" }), storage });
    await speak({ ...base({ apiKey: "", seg: "opt1", text: "Sodium 138 milliequivalents per liter." }), storage });
    const r = await drainQueue({ storage, apiKey: "k", fetchImpl: fakeOpenAI(), max: 1, log: () => {} });
    expect(r).toMatchObject({ queued: 2, voiced: 1 });
  });
});

describe("server voice: daily budgets", () => {
  it("holds a student to the limit when many requests arrive at once", async () => {
    const f = fakeOpenAI(), { storage, files } = fakeStorage();
    const limits = { user: 3, global: 100 };
    const texts = ["Which value is the priority?", "Potassium 2.9 milliequivalents per liter.", "Sodium 138 milliequivalents per liter."];
    const segs = ["stem", "opt0", "opt1"];
    // the same three passages asked for five times each, all at once, before any is saved
    const reqs = Array.from({ length: 15 }, (_, i) => speak({ ...base({ apiKey: "", seg: segs[i % 3], text: texts[i % 3] }), storage, fetchImpl: f, limits }));
    const out = await Promise.all(reqs);
    // exactly three slots exist, and exactly three requests got through; every other one was refused
    expect([...files.keys()].filter((k) => /\/u-[0-9a-f]+\/\d+$/.test(k))).toHaveLength(3);
    expect(out.filter((r) => r.status === 202)).toHaveLength(3);
    expect(out.filter((r) => r.status === 429)).toHaveLength(12);
    expect(f).not.toHaveBeenCalled();
  });

  it("holds the app-wide limit across many students at once", async () => {
    const { storage, files } = fakeStorage();
    const limits = { user: 10, global: 4 };
    const out = await Promise.all(Array.from({ length: 12 }, (_, i) => speak({ ...base({ apiKey: "", userId: `u${i}` }), storage, limits, fetchImpl: fakeOpenAI() })
      .then(() => speak({ ...base({ apiKey: "", userId: `u${i}`, seg: "opt1", text: "Sodium 138 milliequivalents per liter." }), storage, limits }))));
    expect([...files.keys()].filter((k) => /\/all\/\d+$/.test(k)).length).toBeLessThanOrEqual(4);
    expect(out.some((r) => r.status === 429)).toBe(true);
  });

  it("refuses (and spends nothing) when the budget counters cannot be read or written", async () => {
    const f = fakeOpenAI(), { storage, files } = fakeStorage({ failCounters: true });
    expect((await speak({ ...base(), storage, fetchImpl: f })).status).toBe(429);
    expect((await speak({ ...base({ apiKey: "" }), storage, fetchImpl: f })).status).toBe(429);
    expect(f).not.toHaveBeenCalled();
    expect([...files.keys()].filter((k) => k.startsWith("queue/"))).toEqual([]);
  });

  it("charges a second take to the budget too", async () => {
    const f = fakeOpenAI(["Potassium 9.2 milliequivalents per liter.", "Potassium 2.9 milliequivalents per liter."]), { storage, files } = fakeStorage();
    expect((await speak({ ...base(), storage, fetchImpl: f, limits: { user: 1, global: 100 } })).status).not.toBe(200);
    expect(speechCalls(f)).toBe(1); // no slot left for the retake
    expect([...files.keys()].some((k) => k.endsWith(".mp3"))).toBe(false);
  });

  it("counts a local calendar day in one fixed zone, never the UTC date", () => {
    // 11 p.m. Eastern on Oct 29 is already Oct 30 in UTC
    expect(quotaDay(Date.UTC(2026, 9, 30, 3, 0))).toBe("2026-10-29");
    expect(quotaDay(Date.UTC(2026, 9, 30, 5, 0))).toBe("2026-10-30");
    expect(QUOTA_TZ).toBe("America/New_York");
    expect(readFileSync(new URL("../api/_speak.js", import.meta.url), "utf8")).not.toMatch(/toISOString\(\)\.slice\(0, ?10\)/);
  });

  it("stops a student at their daily limit with no synthesis and no upload", async () => {
    const f = fakeOpenAI(), { storage, calls } = fakeStorage();
    const limits = { user: 1, global: 100 };
    expect((await speak({ ...base(), storage, fetchImpl: f, limits })).status).toBe(200);
    calls.upload.length = 0;
    const other = { ...base({ seg: "opt1", text: "Sodium 138 milliequivalents per liter." }), storage, fetchImpl: f, limits };
    const out = await speak(other);
    expect(out.status).toBe(429);
    expect(speechCalls(f)).toBe(1);
    expect(calls.upload).toEqual([]);
    // another student still has room, and an already-checked passage is still served
    expect((await speak({ ...other, userId: "u2" })).status).toBe(200);
    expect((await speak({ ...base(), storage, fetchImpl: f, limits })).body.cached).toBe(true);
  });

  it("stops everyone at the app-wide daily limit", async () => {
    const f = fakeOpenAI(), { storage } = fakeStorage();
    const limits = { user: 100, global: 1 };
    await speak({ ...base(), storage, fetchImpl: f, limits });
    const out = await speak({ ...base({ seg: "opt1", text: "Sodium 138 milliequivalents per liter.", userId: "u9" }), storage, fetchImpl: f, limits });
    expect(out.status).toBe(429);
    expect(speechCalls(f)).toBe(1);
  });

  it("starts each day's budget fresh", async () => {
    const f = fakeOpenAI(), { storage } = fakeStorage();
    const limits = { user: 1, global: 100 };
    const day1 = Date.UTC(2026, 9, 29, 16), day2 = Date.UTC(2026, 9, 30, 16);
    await speak({ ...base(), storage, fetchImpl: f, limits, now: day1 });
    const t = { ...base({ seg: "opt1", text: "Sodium 138 milliequivalents per liter." }), storage, fetchImpl: f, limits };
    expect((await speak({ ...t, now: day1 })).status).toBe(429);
    expect((await speak({ ...t, now: day2 })).status).toBe(200);
  });
});

describe("the app's voice client", () => {
  const okUrl = (n = { i: 0 }) => vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ url: `https://signed.example/${++n.i}` }) }));

  it("reuses a link while it is fresh and asks again before it expires", async () => {
    let clock = 0;
    const fetchImpl = okUrl();
    const v = makeVoiceClient({ fetchImpl, now: () => clock, token: async () => "t" });
    const a = await v.url(REF, "opt0", "x");
    expect(await v.url(REF, "opt0", "x")).toBe(a);
    clock = URL_TTL_MS + 1; // the page stayed open past the link's life
    const b = await v.url(REF, "opt0", "x");
    expect(b).not.toBe(a);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(URL_TTL_MS).toBeLessThan(SIGNED_SECONDS * 1000);
  });

  it("can force a fresh link (after a playback error)", async () => {
    const fetchImpl = okUrl();
    const v = makeVoiceClient({ fetchImpl, now: () => 0, token: async () => "t" });
    const a = await v.url(REF, "opt0", "x");
    expect(await v.url(REF, "opt0", "x", { fresh: true })).not.toBe(a);
  });

  it("sends the item reference, part and words, never anything else", async () => {
    const fetchImpl = okUrl();
    await makeVoiceClient({ fetchImpl, now: () => 0, token: async () => "t" }).url(REF, "opt0", "x");
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ action: "speak", ref: REF, seg: "opt0", text: "x", token: "t" });
  });

  it("ends the AI voice for the session only for session-wide failures", () => {
    for (const s of [0, undefined, 401, 429, 503]) expect(endsSession(s)).toBe(true);
    for (const s of [404, 409, 422, 502]) expect(endsSession(s)).toBe(false);
  });

  it("never auto-starts a reader that has been switched off", () => {
    expect(shouldAutoRead("case:12", true, 4)).toBe(true);
    expect(shouldAutoRead("off", true, 4)).toBe(false); // e.g. the case introduction after "Begin case"
    expect(shouldAutoRead("case:12", false, 4)).toBe(false);
    expect(shouldAutoRead("case:12", true, 0)).toBe(false);
  });
});

describe("one script for the screen and the server", () => {
  it("builds the same words from a bank row as the screen shows", () => {
    expect(scriptFor(REF, ROW)).toEqual(questionSegments(ROW));
    const result = { correct: false, points: 0, max: 1 };
    expect(scriptFor({ kind: "question", id: 7, part: "feedback", result }, ROW).map((x) => x.text)).toEqual(["Incorrect.", "Rationale. Low potassium risks dysrhythmias."]);
    const cs = { title: "T", intro: "I.", vitals: [], labs: [], note: "", steps: [{ stem: "S?", options: ["a", "b"], type: "mc", answer: 0, rationale: "R." }] };
    expect(scriptFor({ kind: "case", id: 1, part: "step", step: 0 }, cs).map((x) => x.id)).toEqual(["stem", "instruction", "opt0", "opt1"]);
    expect(scriptFor({ kind: "card", id: 1, part: "back" }, { front: "F", back: "B" })).toEqual([{ id: "card-back", text: "Answer. B" }]);
  });

  it("accepts only results the screen can show", () => {
    expect(validResult({ correct: true, points: 1, max: 1 })).toBe(true);
    expect(validResult({ correct: false, points: 2, max: 4 })).toBe(true);
    expect(validResult({ correct: true, points: 0, max: 1 })).toBe(false);
    expect(validResult({ correct: false, points: 5, max: 4 })).toBe(false);
    expect(validResult({ correct: false, points: 0, max: 99 })).toBe(false);
  });
});

describe("the voice job workflow", () => {
  const wf = readFileSync(new URL("../../.github/workflows/pulsern-read-aloud.yml", import.meta.url), "utf8");
  it("runs only the default branch's code, in the paid environment, never on pull requests", () => {
    expect(wf).toContain("if: github.ref == format('refs/heads/{0}', github.event.repository.default_branch)");
    expect(wf).toContain("environment: pulsern-paid");
    expect(wf).not.toMatch(/pull_request/);
    expect(wf).toContain("persist-credentials: false");
    expect(wf).toMatch(/permissions:\s*\n\s*contents: read/);
  });
  it("runs the worker with a per-run limit, never cancelling a paid run midway", () => {
    expect(wf).toContain("node ops/read-aloud-worker.mjs");
    expect(wf).toContain("READ_ALOUD_MAX");
    expect(wf).toContain("cancel-in-progress: false");
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
