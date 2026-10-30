/* Read aloud: what is spoken, when, and by which voice.
   ------------------------------------------------------------------
   - The question's script is the item on screen, in reading order, and
     never depends on the answer (listening must not give it away).
   - The explanation is a separate script, only built after answering.
   - The server voice is signed-in only, cached privately, and paid for once
     per passage; without a key it says so and the app uses the device voice.
   - Readiness exams have no read aloud. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { questionSegments, feedbackSegments, caseIntroSegments, caseStepSegments, cardSegments, speakable, scriptFor, validResult, partOf, PART_MAX, questionFeedbackSegments, caseFeedbackSegments, itemParts, voiceable } from "../src/read-aloud-script.js";
import { ReadAloudBar, ra, RATES, loadPrefs, makeVoiceClient, URL_TTL_MS, shouldAutoRead, planReading, readingMs, NOTES } from "../src/read-aloud.jsx";
import { speak, speechKey, validRequest, canonicalRef, voiceCheck, clinicalUnits, quotaDay, QUOTA_TZ, SPEAK_MAX, QUEUE_ENTRY_MAX, BUCKET, TTS, SIGNED_SECONDS, LIMITS, REJECTION_DAYS, CLAIM_WAIT, CLAIM_LEASE_MS, PASSAGE_WAIT, PASSAGE_LEASE_MS, PASSAGE_WORK_MS, CALL, claimPassage, releasePassage } from "../api/_speak.js";
import { QA_VERSION } from "../ops/narrate-lib.mjs";
import { drainQueue, pruneUsage, prewarmBank, itemPassages, verdictPassages, runJob, MAX_ATTEMPTS, CLAIM_PRUNE } from "../ops/read-aloud-worker.mjs";
import { passagePaths, CHECK_VERSION, checkFailure, readRecord, STORAGE_RETRY } from "../api/_speak.js";

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

  it("says the instruction once, as its own short part when the stem ends with it", () => {
    const segs = questionSegments({ type: "sata", stem: "Which findings need follow-up? Select all that apply.", options: ["Glucose 38 mg/dL", "Temp 36.8 °C"] });
    expect(segs.map((s) => [s.id, s.text])).toEqual([["stem", "Which findings need follow-up?"], ["instruction", "Select all that apply."], ["opt0", "Glucose 38 milligrams per deciliter."], ["opt1", "Temp 36.8 degrees Celsius."]]);
    // an instruction inside the stem is left where it is, and not said twice
    expect(questionSegments({ type: "sata", stem: "Select all that apply: which findings?", options: ["A", "B"] }).map((s) => s.id)).toEqual(["stem", "opt0", "opt1"]);
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
    // the check accepts the same calculation however it is written, and nothing else
    expect(voiceCheck(sc, "Dose = 0.1 mg/kg × 70 kg = 7 mg").pass).toBe(true);
    expect(voiceCheck(sc, "Dose = 0.1 mg/kg x 70 kg = 7 mg").pass).toBe(true);
    expect(voiceCheck(sc, "Dose equals 0.1 mg/kg, 70 kg equals 7 mg").pass).toBe(false); // the multiplication dropped
    expect(voiceCheck(sc, "Dose = 0.1 mg/kg plus 70 kg = 7 mg").pass).toBe(false);
    expect(voiceCheck(sc, "Dose = 0.1 mg/kg x 70 kg = 70 mg").pass).toBe(false);
  });

  it("queues only the parts that can be voiced when a voiceable part is asked for", async () => {
    const row = { ...ROW, id: 8, stem: "What is the dose?", options: ["0.1 mg/kg · 70 kg", "0.2 mg/kg · 70 kg", "0.3 mg/kg · 70 kg"], rationale: "Use the ordered dose." };
    const readItem = async () => row;
    const { storage, files } = fakeStorage();
    const stem = questionSegments(row).find((x) => x.id === "stem");
    const r = await speak({ ...base({ apiKey: "", readItem, ref: { kind: "question", id: 8, part: "question" }, seg: stem.id, text: stem.text }), storage });
    expect(r.status).toBe(202);
    const queued = [...files.keys()].filter((k) => k.startsWith("queue/")).map((k) => JSON.parse(files.get(k).toString()).text);
    expect(queued).toContain(stem.text);
    expect(queued.every((t) => voiceable(t))).toBe(true);
    expect(queued.some((t) => t.includes("·"))).toBe(false);
  });

  it("the voice job drops an unvoiceable queue entry without paying or counting it as a refusal", async () => {
    const { storage, files } = fakeStorage();
    for (const [i, text] of ["0.1 milligrams per kilogram · 70 kg.", "0.2 milligrams per kilogram · 70 kg.", "0.3 milligrams per kilogram · 70 kg."].entries()) {
      files.set(passagePaths(text).queue, Buffer.from(JSON.stringify({ text, voice: "marin", ref: { kind: "question", id: 8, part: "question" }, seg: `opt${i}` })));
    }
    const f = fakeOpenAI();
    const r = await drainQueue({ storage, apiKey: "k", fetchImpl: f, log: () => {} });
    expect(f).not.toHaveBeenCalled();
    expect(r.service).toBeFalsy();
    expect(r.errors).toEqual([]);
    expect(r.skipped).toBe(3);
    expect([...files.keys()].filter((k) => k.startsWith("queue/"))).toEqual([]);
  });

  it("an unsure part is shown, never voiced, queued or paid for", async () => {
    const row = { ...ROW, id: 7, rationale: "Dose: 0.1 mg/kg · 70 kg." };
    const parts = itemParts("question", row);
    expect(parts.length).toBeGreaterThan(0);
    expect(parts.every((x) => voiceable(x.text))).toBe(true);
    expect(parts.some((x) => x.text.includes("·"))).toBe(false); // the explanation is left out
    const fb = questionFeedbackSegments(row, { correct: false, points: 0, max: 1 });
    const rat = fb.find((x) => !voiceable(x.text));
    expect(rat).toBeTruthy();
    const { storage, files } = fakeStorage();
    const f = fakeOpenAI();
    const readItem = async () => row;
    const r = await speak({ ...base({ readItem, ref: { kind: "question", id: 7, part: "feedback", result: { correct: false, points: 0, max: 1 } }, seg: rat.id, text: rat.text }), storage, fetchImpl: f });
    expect(r.status).toBe(422);
    expect(f).not.toHaveBeenCalled();
    expect([...files.keys()].filter((k) => k.startsWith("usage/") || k.startsWith("queue"))).toEqual([]);
  });

  it("accepts a correct reading however the transcriber writes it, and still rejects a changed one (from the voice job's failure log)", () => {
    // [as written, a correct transcript, a wrong transcript]
    const cases = [
      ["Give a dose of heparin 3,500 units.", "Give a dose of heparin 3500 units.", "Give a dose of heparin 35,000 units."],
      ["The nurse must deliver 1,500 drops.", "The nurse must deliver 1500 drops.", "The nurse must deliver 150 drops."],
      ["Check creatinine/eGFR and potassium.", "Check creatinine slash eGFR and potassium.", "Check creatinine eGFR and potassium."],
      ["Use the PHQ-2/PHQ-9 screens.", "Use the PHQ-2/PHQ-9 screens.", "Use the PHQ-2 PHQ-9 screens."],
      ["BMI 85th–94th percentile for age.", "BMI 85th to 94th percentile for age.", "BMI 85th to 95th percentile for age."],
      ["Caring for a postoperative client.", "Caring for a post-operative client.", "Caring for a preoperative client."],
      ["This may result in a sub therapeutic dose.", "This may result in a subtherapeutic dose.", "This may result in a supratherapeutic dose."],
      ["Respirations 12 breaths/min.", "Respirations 12 breaths per minute.", "Respirations 12 breaths per hour."],
      ["Blame and guilt, drop-down 1.", "Blame and guilt, dropdown 1.", "Blame and guilt, drop 1."],
    ];
    for (const [written, right, wrong] of cases) {
      const script = speakable(written);
      expect(voiceCheck(script, right).pass, `${written} / ${right}`).toBe(true);
      expect(voiceCheck(script, wrong).pass, `${written} / ${wrong}`).toBe(false);
    }
    // two numbers with a slash are never reworded: a score, an Apgar pair and a date all stay as written
    for (const t of ["Pain is rated 5/10 and worsening.", "Apgar scores at 1 and 5 minutes: 7/9.", "The client reports abdominal pain since 7/10.",
      "Compare heart rates on 7/10 and 7/11.", "Pain began 7/10/2026."]) {
      expect(speakable(t), t).toBe(t);
      expect(voiceCheck(speakable(t), t).pass, t).toBe(true);
      expect(voiceCheck(speakable(t), t.replace(/(\d+)\/(\d+)/, "$1 out of $2")).pass, t).toBe(false);
    }
    // "per" only after a whole number and a known unit: a lab name with a digit in it is not a rate
    expect(speakable("Check HbA1c/eAG.")).toBe("Check HbA1c slash eAG.");
    expect(voiceCheck(speakable("Check HbA1c/eAG."), "Check HbA1c per eAG.").pass).toBe(false);
    expect(speakable("Infuse 5 units/hr.")).toBe("Infuse 5 units per hour.");
    // a rate matches however it is spelled: units in full or short, the number in words or digits, "/" or "slash"
    for (const [written, heard] of [["Give 5 milligrams/minute.", "Give 5 mg/minute."], ["Give 5 mg/min.", "Give five milligrams per minute."],
      ["Respirations 12 breaths/min.", "Respirations twelve breaths/min."], ["Respirations 12 breaths/min.", "Respirations twelve breaths slash min."]]) {
      expect(voiceCheck(speakable(written), heard).pass, `${written} / ${heard}`).toBe(true);
    }
    // and a changed value, unit or time still fails
    for (const [written, heard] of [["Respirations 12 breaths/min.", "Respirations twenty-one breaths/min."], ["Respirations 12 breaths/min.", "Respirations twelve breaths per hour."], ["Give 5 mg/min.", "Give 5 mcg/min."]]) {
      expect(voiceCheck(speakable(written), heard).pass, `${written} / ${heard}`).toBe(false);
    }
    // only the number before a rate is read from words: the rest of the passage is untouched ("35-45" keeps its range)
    expect(voiceCheck(speakable("Range 35-45 mm Hg."), "Range 35 to 45 millimeters of mercury.").pass).toBe(true);
    // a slash is said in words, so the voice never has to guess at it
    expect(speakable("Check creatinine/eGFR.")).toBe("Check creatinine slash eGFR.");
    expect(speakable("Respirations 12 breaths/min.")).toBe("Respirations 12 breaths per minute.");
    expect(speakable("Take it daily and/or as needed.")).toBe("Take it daily and or as needed.");
    expect(speakable("BMI 85th–94th percentile.")).toBe("BMI 85th to 94th percentile.");
    // only the closed list of compounds folds: "a febrile" is not "afebrile", "re-signed" is not "resigned"
    expect(voiceCheck("The client is afebrile.", "The client is a febrile.").pass).toBe(false);
    expect(voiceCheck("The form was re-signed.", "The form was resigned.").pass).toBe(false);
  });

  it("accepts the second round of spellings from the failure log, and still rejects a changed word", () => {
    const pass = [
      ["UAPs may perform non-clinical routine tasks.", "UAPs may perform nonclinical routine tasks."],
      ["Returned from post anesthesia care.", "Returned from postanesthesia care."],
      ["The most evidence-based non pharmacological intervention.", "The most evidence-based nonpharmacological intervention."],
      ["It can be safely re administered at a slower rate.", "It can be safely readministered at a slower rate."],
      ["Flag for provider co-signature within 24 hours.", "Flag for provider cosignature within 24 hours."],
      ["This is a read-back requirement.", "This is a readback requirement."],
      ["Required for health care workers.", "Required for healthcare workers."],
      ["25,000 units ÷ 500 mL", "25,000 units divided by 500 mL"],
      ["Metoprolol succinate is a beta-1 selective blocker.", "Metoprolol succinate is a beta1 selective blocker."],
      ["Clonidine is an alpha 2 agonist.", "Clonidine is an alpha-2 agonist."],
      ["Read post-operative instructions to the client.", "Read postoperative instructions to the client."], // a rejected pair never uses up the next word
      ["Pre post-operative check.", "Pre postoperative check."],
      ["Which receptor does metoprolol block? Beta-1.", "Which receptor does metoprolol block? Beta1."], // at the end of a sentence
      ["The receptor (beta 1) is blocked.", "The receptor (beta1) is blocked."],
      ["Hyperkalemia causes peaked T-waves.", "Hyperkalemia causes peaked T waves."],
      ["Hyperkalemia causes peaked T waves.", "Hyperkalemia causes peaked T Waves."],
      ["Hyperkalemia causes peaked T-waves.", "Hyperkalemia causes peaked t-Waves."],
      ["Look for a U wave.", "Look for a U-Wave."],
      ["ANC 320 cells/mm³.", "ANC 320 cells per cubic millimeter."],
      ["ANC 320 cells/mm³.", "ANC 320 cells/mm³."],
      ["ANC 320 cells/mm³.", "ANC 320 cells/mm3."],
      ["ANC 320 cells/mm³.", "ANC 320 cells per mm³."],
      ["ANC 320 cells/mm³", "ANC 320 cells/mm³"],
      ["A wound 3–4 cm (1.5 inches) wide.", "A wound 3 to 4 centimeters (1.5 inches) wide."],
      ["Metoprolol 25 mg PO daily.", "Metoprolol 25 mg by mouth daily."],
    ];
    for (const [w, h] of pass) expect(voiceCheck(speakable(w), h).pass, `${w} / ${h}`).toBe(true);
    const fail = [
      ["The form was re-signed.", "The form was resigned."], // only listed compounds join
      ["The nurse reviews the pre-sent medication list.", "The nurse reviews the present medication list."],
      ["The client is afebrile.", "The client is a febrile."],
      ["Metoprolol succinate is a beta-1 selective blocker.", "Metoprolol succinate is a beta2 selective blocker."],
      ["Which receptor does metoprolol block? Beta-1.", "Which receptor does metoprolol block? Beta2."],
      ["Give beta 1.5 units.", "Give beta1.5 units."], // a decimal is not a subtype
      // a sign is never a separator
      ["Potassium delta -1 milliequivalents per liter.", "Potassium delta 1 milliequivalents per liter."],
      ["Change beta -1 from baseline.", "Change beta 1 from baseline."],
      ["Metoprolol 25 mg PO daily.", "Metoprolol 25 mg IV daily."],
      ["Returned from post anesthesia care.", "Returned from preanesthesia care."],
      ["ANC 320 cells/mm³.", "ANC 230 cells per cubic millimeter."],
      ["ANC 320 cells/mm³.", "ANC 320 cells/mm²."],
      // an abbreviation that is also a word must be heard as its letters, never as the word
      ["Move the client to the O.R.", "Move the client to the or."],
      ["Hyperkalemia causes peaked T waves.", "Hyperkalemia causes peaked P waves."],
      ["Time and notation T.O. provider name.", "Time and notation to provider name."],
    ];
    for (const [w, h] of fail) expect(voiceCheck(speakable(w), h).pass, `${w} / ${h}`).toBe(false);
  });

  it("accepts the third round of spellings from the failure log, and still rejects a changed value", () => {
    const pass = [
      ["Heart rate is below 60/min in this client.", "Heart rate is below 60 per minute in this client."],
      ["Respiratory rate of 6/min and shallow.", "Respiratory rate of 6/minute and shallow."],
      ["Digoxin level 0.5–2.0 ng/mL.", "Digoxin level 0.5 to 2.0 nanograms per milliliter."],
      ["Divide by 300 min equals 9000.", "Divide by 300 minutes equals 9000."],
      ["Report a 6 lb weight loss.", "Report a 6 pound weight loss."],
      ["The drop factor is 15 gtt/mL.", "The drop factor is 15 drops per mL."],
      ["pH below 7.35 and CO₂ is high.", "pH below 7.35 and CO2 is high."],
      ["Observe for 30 min after administration.", "Observe for thirty min after administration."],
      ["Report a 6 lb weight loss.", "Report a six lb weight loss."],
      ["The drop factor is 15 gtt/mL.", "The drop factor is fifteen gtt per mL."],
      ["Unless specifically required (e.g., during feeding).", "Unless specifically required (eg, during feeding)."],
      ["Unless specifically required, e.g. during feeding.", "Unless specifically required, for example during feeding."],
      ["Give it with food, i.e. at meals.", "Give it with food, that is at meals."],
      ["Give it with food (i.e., at meals).", "Give it with food (i.e., at meals)."],
      ["Option 0 uses non therapeutic phrases.", "Option 0 uses nontherapeutic phrases."],
      ["Before re checking the level.", "Before rechecking the level."],
      ["The nurse reviews the 0700 hand off report.", "The nurse reviews the 0700 handoff report."],
      ["Late decelerations reflect utero-placental insufficiency.", "Late decelerations reflect uteroplacental insufficiency."],
      ["Take it PO daily.", "Take it orally daily."],
      // the number in words, the unit in full or short
      ["Observe for 30 minutes after administration.", "Observe for thirty minutes after administration."],
      ["Divide by 300 min.", "Divide by three hundred minutes."],
      ["Report a 6 lb weight loss.", "Report a six pound weight loss."],
      ["Report 6 pounds lost.", "Report six pounds lost."],
      ["Give 15 drops.", "Give fifteen drops."],
      ["The drop factor is 15 gtt/mL.", "The drop factor is fifteen drops per mL."],
    ];
    for (const [w, h] of pass) expect(voiceCheck(speakable(w), h).pass, `${w} / ${h}`).toBe(true);
    const fail = [
      ["Heart rate is below 60/min in this client.", "Heart rate is below 16 per minute in this client."],
      ["Heart rate is below 60/min in this client.", "Heart rate is below 60 per hour in this client."],
      ["Report a 6 lb weight loss.", "Report a 6 kg weight loss."],
      ["Observe for 30 minutes after administration.", "Observe for thirteen minutes after administration."],
      ["Give 15 drops.", "Give fifty drops."],
      ["A client with a stage III pressure injury.", "A client with a stage 2 pressure injury."],
      // a Roman numeral is never read as a number: here IV is intravenous
      ["At this stage IV antibiotics are indicated.", "At this stage four antibiotics are indicated."],
      ["Observe for 30 min after administration.", "Observe for thirteen min after administration."],
      ["pH below 7.35 and CO₂ is high.", "pH below 7.35 and CO is high."],
      ["Level of 8/10 and rising.", "Level of 8 out of 10 and rising."], // two numbers with a slash are never reworded
      ["Digoxin level 2.0 ng/mL.", "Digoxin level 2.0 micrograms per milliliter."],
      ["The nurse assesses a client with IE for embolic complications.", "The nurse assesses a client with that is for embolic complications."], // IE is infective endocarditis
      ["A client with IE.", "A client with i.e."],
    ];
    for (const [w, h] of fail) expect(voiceCheck(speakable(w), h).pass, `${w} / ${h}`).toBe(false);
    expect(speakable("Heart rate 118/min.")).toBe("Heart rate 118 per minute.");
  });

  it("voices a long part in shorter pieces, where the voice is less likely to skip words", () => {
    expect(PART_MAX).toBeLessThanOrEqual(450);
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

  it("offers pause and stop while reading, labelled as the AI voice", () => {
    const html = renderToStaticMarkup(<ReadAloudBar reader={reader({ status: "playing" })} />);
    expect(html).toContain("⏸ Pause");
    expect(html).toContain("■ Stop");
    expect(html).toContain("AI voice");
  });

  it("says plainly when the voice is being prepared, unavailable, or a part is on screen only", () => {
    expect(renderToStaticMarkup(<ReadAloudBar reader={reader({ status: "preparing" })} />)).toContain(NOTES.preparing);
    expect(renderToStaticMarkup(<ReadAloudBar reader={reader({ status: "unavailable" })} />)).toContain(NOTES.unavailable.replace("'", "&#x27;"));
    expect(renderToStaticMarkup(<ReadAloudBar reader={reader({ status: "playing", silent: true })} />)).toContain(NOTES.silent);
    expect(renderToStaticMarkup(<ReadAloudBar reader={reader({ status: "playing" })} />)).not.toContain("ra-note");
  });

  it("renders nothing for an item with no voice (not in the bank)", () => {
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

  it("reads only checked AI audio: the whole item, or nothing", () => {
    const segs = [{ id: "stem", text: "S." }, { id: "opt0", text: "A." }, { id: "opt1", text: "B." }];
    expect(planReading(segs, [{ url: "u1" }, { url: "u2" }, { url: "u3" }])).toEqual({ kind: "play", steps: [{ id: "stem", url: "u1" }, { id: "opt0", url: "u2" }, { id: "opt1", url: "u3" }] });
    // one part still being voiced: nothing plays (never half a question)
    expect(planReading(segs, [{ url: "u1" }, { status: 202 }, { url: "u3" }])).toEqual({ kind: "preparing" });
    // a part that failed the check is shown, not voiced, and the rest plays
    expect(planReading(segs, [{ url: "u1" }, { status: 422 }, { url: "u3" }]).steps[1]).toEqual({ id: "opt0", silent: true, text: "A." });
    // signed out, offline, over the limit, or nothing voiceable
    for (const status of [0, 401, 429, 503, 400]) expect(planReading(segs, [{ url: "u1" }, { status }, { url: "u3" }])).toEqual({ kind: "unavailable" });
    // a real failure outranks "being prepared"
    expect(planReading(segs, [{ status: 202 }, { status: 429 }, { status: 202 }])).toEqual({ kind: "unavailable" });
    // every part refused for good: read on screen, part by part, not "try again later"
    expect(planReading(segs, [{ status: 422 }, { status: 422 }, { status: 422 }])).toEqual({ kind: "play", steps: segs.map((s) => ({ id: s.id, silent: true, text: s.text })) });
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

/* A fake private bucket: download/upload/sign, recording calls. */
function fakeStorage({ missingBucket = false, failCounters = false, failDownload = () => false } = {}) {
  const files = new Map();
  let bucketExists = !missingBucket;
  const calls = { upload: [], createBucket: [] };
  const bucket = {
    download: async (path) => (failDownload(path) ? { data: null, error: { message: "Internal server error", statusCode: "500" } } : files.has(path) ? { data: { text: async () => files.get(path).toString() }, error: null } : { data: null, error: { message: "Object not found" } }),
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
// Storage retries wait real seconds in production; here they wait 1 ms.
STORAGE_RETRY.ms = [1, 1];
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
/* Most queue and budget tests use one-part items (a flashcard's front), so
   one request is one passage; whole-item queueing has its own tests. */
/* The queue-mechanics fixtures are one-part items: flashcards with a front
   and no back text (a side with no text has nothing to read). Whole-item
   queueing has its own tests with full items. */
const CARDS = { 4: { id: 4, front: "Potassium 2.9 mEq/L.", back: "" }, 5: { id: 5, front: "Sodium 138 mEq/L.", back: "" }, 6: { id: 6, front: "Which value is the priority?", back: "" } };
const readBank = async (kind, id) => (kind === "question" ? (id === ROW.id ? ROW : null) : kind === "card" ? CARDS[id] ?? (id >= 100 ? { id, front: `Card ${id}.`, back: "" } : null) : null);
const CARD = (id, text) => ({ ref: { kind: "card", id, part: "front" }, seg: "card-front", text });
const Q1 = CARD(4, "Potassium 2.9 milliequivalents per liter.");
const Q2 = CARD(5, "Sodium 138 milliequivalents per liter.");
const Q3 = CARD(6, "Which value is the priority?");
const base = (over = {}) => ({ ...Q1, userId: "u1", readItem: readBank, apiKey: "k", ...over });
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
    expect([...files.keys()].filter((k) => /^queue(-retry)?\//.test(k))).toHaveLength(1);
    expect([...files.keys()].filter((k) => k.startsWith("marin/"))).toEqual([]);
  });

  it("records a passage the provider refuses outright, and never pays for it again", async () => {
    const { storage } = fakeStorage();
    const refuse = vi.fn(async () => ({ ok: false, status: 400 }));
    expect((await speak({ ...base(), storage, fetchImpl: refuse })).status).toBe(422);
    expect((await speak({ ...base(), storage, fetchImpl: refuse })).status).toBe(422);
    expect(refuse).toHaveBeenCalledTimes(1);
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

  it("rejects one changed word anywhere in a long passage: a drug, a diagnosis, a finding, a side", () => {
    const long = "The nurse reviews the plan of care for a client admitted two days ago with community acquired pneumonia who reports mild fatigue, no chest pain and stable breathing at rest, and whose family is at the bedside. ";
    for (const [said, heard] of [
      ["Give the insulin before breakfast.", "Give the heparin before breakfast."],
      ["The findings suggest hypokalemia.", "The findings suggest hyperkalemia."],
      ["Crackles are heard in both bases.", "Wheezes are heard in both bases."],
      ["Elevate the head of the bed.", "Elevate the foot of the bed."],
    ]) {
      const r = voiceCheck(long + said, long + heard);
      expect(r.similarity).toBeGreaterThan(0.92); // the score alone would let it through
      expect(r.pass, heard).toBe(false);
      expect(r.mismatch, heard).not.toBeNull();
    }
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

  it("re-voices a passage whose audio file went missing, instead of saying 'being prepared' forever", async () => {
    const { storage, files } = fakeStorage();
    await speak({ ...base(), storage, fetchImpl: fakeOpenAI() }); // checked and saved
    const mp3 = [...files.keys()].find((k) => k.endsWith(".mp3"));
    files.delete(mp3); // the audio is lost; the passing record remains
    const out = await speak({ ...base({ apiKey: "" }), storage });
    expect(out.status).toBe(202);
    expect([...files.keys()].filter((k) => k.startsWith("queue/"))).toHaveLength(1); // really queued
    expect([...files.keys()].some((k) => /^marin\/.*\.json$/.test(k))).toBe(false); // the stale record is gone
    await drainQueue({ storage, apiKey: "k", fetchImpl: fakeOpenAI(), log: () => {} });
    expect((await speak({ ...base({ apiKey: "" }), storage })).status).toBe(200);
  });

  it("says the voice is unavailable, without queueing, when the link service fails", async () => {
    const { storage, files } = fakeStorage();
    await speak({ ...base(), storage, fetchImpl: fakeOpenAI() });
    const real = storage.from(BUCKET);
    const noLinks = { ...storage, from: () => ({ ...real, createSignedUrl: async () => ({ data: null, error: { message: "Internal server error", statusCode: "500" } }) }) };
    const out = await speak({ ...base({ apiKey: "" }), storage: noLinks });
    expect(out.status).toBe(503);
    expect([...files.keys()].filter((k) => k.startsWith("queue/"))).toEqual([]);
    expect([...files.keys()].some((k) => k.endsWith(".mp3"))).toBe(true); // nothing was dropped
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
    const q = [...files.keys()].filter((k) => /^queue(-retry)?\//.test(k));
    expect(q).toHaveLength(1);
    expect(JSON.parse(files.get(q[0]).toString())).toMatchObject({ text: "Potassium 2.9 milliequivalents per liter.", voice: "marin", ref: Q1.ref, seg: "card-front" });
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
    const limits = { user: 1, admission: 100, spend: 100 };
    await speak({ ...base({ apiKey: "" }), storage, limits });
    const out = await speak({ ...base({ apiKey: "", ...Q2 }), storage, limits });
    expect(out.status).toBe(429);
    expect([...files.keys()].filter((k) => /^queue(-retry)?\//.test(k))).toHaveLength(1);
  });

  it("the voice job voices and checks queued passages, then students get the audio", async () => {
    const { storage, files } = fakeStorage();
    await speak({ ...base({ apiKey: "" }), storage });
    const f = fakeOpenAI();
    const r = await drainQueue({ storage, apiKey: "k", fetchImpl: f, log: () => {} });
    expect(r).toMatchObject({ queued: 1, voiced: 1, failed: 0, errors: [] });
    expect([...files.keys()].filter((k) => /^queue(-retry)?\//.test(k))).toEqual([]);
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
    expect([...files.keys()].filter((k) => /^queue(-retry)?\//.test(k))).toEqual([]);
  });

  it("logs what was expected and what was heard for a passage that fails the check", async () => {
    const { storage, files } = fakeStorage();
    await speak({ ...base({ apiKey: "" }), storage });
    const lines = [];
    await drainQueue({ storage, apiKey: "k", fetchImpl: fakeOpenAI(["Potassium 9.2 mEq/L."]), log: (l) => lines.push(l) });
    expect(lines.join("\n")).toMatch(/failed the check twice: card 4 card-front: expected "2\.9", heard "9\.2"/);
    // and the record keeps both, with the check's version
    const rec = JSON.parse(files.get(passagePaths(Q1.text).rec).toString());
    expect(rec).toMatchObject({ pass: false, check: CHECK_VERSION, transcript: "Potassium 9.2 mEq/L." });
    expect(rec.mismatch).toMatchObject({ expected: "2.9", heard: "9.2" });
  });

  it("voices again a passage that failed an older version of the check, and nothing else", async () => {
    const { storage, files } = fakeStorage();
    const sha = (t) => createHash("sha256").update(t).digest("hex");
    const put = (text, rec) => files.set(passagePaths(text).rec, Buffer.from(JSON.stringify({ qa: QA_VERSION, textSha: sha(text), checkedAt: new Date().toISOString(), ...rec })));
    put("Older failure.", { pass: false, check: CHECK_VERSION - 1 });
    put("Current failure.", { pass: false, check: CHECK_VERSION });
    put("Unversioned failure.", { pass: false }); // written before the field existed: version 1
    put("Passed long ago.", { pass: true, check: CHECK_VERSION - 1 });
    put("Refused by the provider.", { pass: false, reason: "speech 400", check: CHECK_VERSION - 1 });
    expect(await readRecord(storage, "Older failure.")).toBe(null);
    expect(await readRecord(storage, "Current failure.")).toMatchObject({ pass: false });
    expect(await readRecord(storage, "Unversioned failure.") === null).toBe(CHECK_VERSION !== 1);
    expect(await readRecord(storage, "Passed long ago.")).toMatchObject({ pass: true });
    expect(await readRecord(storage, "Refused by the provider.")).toMatchObject({ reason: "speech 400" });
  });

  it("describes a failed take in a line a person can act on", () => {
    expect(checkFailure({ similarity: 0.95, mismatch: { expected: "a", heard: "(nothing)", context: "give a dose" } })).toBe('expected "a", heard "(nothing)" near "give a dose" (similarity 0.950)');
    expect(checkFailure({ similarity: 0.99, mismatch: null, unitMismatch: { expected: "mg", heard: "mcg" } })).toBe('expected "mg", heard "mcg" (similarity 0.990)');
    expect(checkFailure({ similarity: 0.81, mismatch: null })).toBe("similarity 0.810");
  });

  it("keeps a passage queued when the provider fails, and stops the run", async () => {
    const { storage, files } = fakeStorage();
    await speak({ ...base({ apiKey: "" }), storage });
    const r = await drainQueue({ storage, apiKey: "k", fetchImpl: vi.fn(async () => ({ ok: false, status: 500 })), log: () => {} });
    expect(r.errors).toHaveLength(1);
    expect([...files.keys()].filter((k) => /^queue(-retry)?\//.test(k))).toHaveLength(1);
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
    expect([...files.keys()].filter((k) => k.startsWith("usage/")).sort()).toEqual(["usage/2026-10-29/all/00000", "usage/2026-10-29/u-abc/00000"]);
  });

  it("pays for every synthesis from the spending budget, so a transcription outage cannot run past it", async () => {
    const { storage, files } = fakeStorage();
    await speak({ ...base({ apiKey: "" }), storage });
    // speech works, transcription is down: each run pays one synthesis and keeps the entry
    const outage = vi.fn(async (url) => (url.endsWith("/audio/speech") ? { ok: true, arrayBuffer: async () => new Uint8Array([1]).buffer } : { ok: false, status: 500 }));
    const limits = { user: 300, admission: 3, spend: 3 };
    const now = () => Date.UTC(2026, 9, 29, 16);
    for (let run = 0; run < 6; run++) await drainQueue({ storage, apiKey: "k", fetchImpl: outage, limits, now, log: () => {} });
    expect(outage.mock.calls.filter(([u]) => u.endsWith("/audio/speech"))).toHaveLength(3); // never more than the day's spending
    expect([...files.keys()].filter((k) => /\/spend\/\d+$/.test(k))).toHaveLength(3);
    expect([...files.keys()].filter((k) => /^queue(-retry)?\//.test(k))).toHaveLength(1); // still waiting, not marked failed
    expect([...files.keys()].filter((k) => k.startsWith("marin/"))).toEqual([]);
  });

  it("waits, without paying, when today's spending is used up, and voices the passage the next day", async () => {
    const { storage, files } = fakeStorage();
    await speak({ ...base({ apiKey: "" }), storage });
    const limits = { user: 300, admission: 0, spend: 0 };
    const f = fakeOpenAI();
    const today = await drainQueue({ storage, apiKey: "k", fetchImpl: f, limits, now: () => Date.UTC(2026, 9, 29, 16), log: () => {} });
    expect(today).toMatchObject({ budget: true, voiced: 0, errors: [] });
    expect(f).not.toHaveBeenCalled();
    expect([...files.keys()].filter((k) => /^queue(-retry)?\//.test(k))).toHaveLength(1);
    const tomorrow = await drainQueue({ storage, apiKey: "k", fetchImpl: f, limits: { user: 300, admission: 5, spend: 5 }, now: () => Date.UTC(2026, 9, 30, 16), log: () => {} });
    expect(tomorrow).toMatchObject({ voiced: 1 });
    expect([...files.keys()].some((k) => k.startsWith("usage/2026-10-30/spend/"))).toBe(true);
  });

  it("does not record a failure when the retake has no budget, and finishes the passage later", async () => {
    const { storage, files } = fakeStorage();
    await speak({ ...base({ apiKey: "" }), storage });
    const misheard = fakeOpenAI(["Potassium 9.2 milliequivalents per liter.", "Potassium 2.9 milliequivalents per liter."]);
    const r = await drainQueue({ storage, apiKey: "k", fetchImpl: misheard, limits: { user: 300, admission: 1, spend: 1 }, now: () => Date.UTC(2026, 9, 29, 16), log: () => {} });
    expect(r).toMatchObject({ budget: true, failed: 0 });
    expect([...files.keys()].filter((k) => k.startsWith("marin/"))).toEqual([]);
    const next = await drainQueue({ storage, apiKey: "k", fetchImpl: fakeOpenAI(), limits: { user: 300, admission: 5, spend: 5 }, now: () => Date.UTC(2026, 9, 30, 16), log: () => {} });
    expect(next).toMatchObject({ voiced: 1 });
  });

  it("keeps only the known fields of a reference: extra data is never stored", async () => {
    const { storage, files } = fakeStorage();
    const padded = { ...Q1.ref, padding: "x".repeat(2_000_000), nested: { more: [1, 2, 3] } };
    expect((await speak({ ...base({ apiKey: "", ref: padded }), storage })).status).toBe(202);
    const q = [...files.keys()].find((k) => /^queue(-retry)?\//.test(k));
    const stored = files.get(q).toString();
    expect(stored.length).toBeLessThan(QUEUE_ENTRY_MAX);
    expect(JSON.parse(stored).ref).toEqual(Q1.ref);
    expect(canonicalRef({ ...REF, result: { correct: false, points: 0, max: 1, junk: "y" } })).toEqual({ ...REF, result: { correct: false, points: 0, max: 1 } });
    expect(canonicalRef({ ...REF, step: "1" })).toBeNull();
    expect(canonicalRef("nope")).toBeNull();
  });

  it("drops an oversized queue entry unread, and never keeps it in the run", async () => {
    const { storage, files } = fakeStorage();
    const big = JSON.stringify({ text: "Hello.", voice: "marin", ref: { ...REF, padding: "x".repeat(QUEUE_ENTRY_MAX) }, seg: "stem" });
    files.set("queue/marin-big.json", Buffer.from(big));
    const real = storage.from(BUCKET);
    const downloads = [];
    const watched = { ...storage, from: () => ({ ...real, download: (p) => { downloads.push(p); return real.download(p); }, list: async (dir, o) => {
      const r = await real.list(dir, o);
      return { ...r, data: r.data?.map((e) => ({ ...e, metadata: { size: files.get(`${dir}/${e.name}`)?.length } })) };
    } }) };
    const f = fakeOpenAI();
    const r = await drainQueue({ storage: watched, apiKey: "k", fetchImpl: f, log: () => {} });
    expect(r.skipped).toBe(1);
    expect(downloads).not.toContain("queue/marin-big.json");
    expect(files.has("queue/marin-big.json")).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("drops an oversized entry even when the listing gives no size", async () => {
    const { storage, files } = fakeStorage();
    files.set("queue/marin-big.json", Buffer.from(JSON.stringify({ text: "Hello.", voice: "marin", ref: { ...REF, padding: "x".repeat(QUEUE_ENTRY_MAX) }, seg: "stem" })));
    const r = await drainQueue({ storage, apiKey: "k", fetchImpl: fakeOpenAI(), log: () => {} });
    expect(r.skipped).toBe(1);
    expect(files.has("queue/marin-big.json")).toBe(false);
  });

  it("keeps a queue entry it could not read, and reports it", async () => {
    let broken = false;
    const { storage, files } = fakeStorage({ failDownload: (p) => broken && p.startsWith("queue/") });
    await speak({ ...base({ apiKey: "" }), storage });
    broken = true; // the queue becomes unreadable after the entry was written
    const f = fakeOpenAI();
    const r = await drainQueue({ storage, apiKey: "k", fetchImpl: f, log: () => {} });
    expect(r.errors[0]).toMatch(/could not read/);
    expect(r.skipped).toBe(0);
    expect([...files.keys()].filter((k) => /^queue(-retry)?\//.test(k))).toHaveLength(1);
    expect(f).not.toHaveBeenCalled();
  });

  it("records a passage the provider refuses outright and moves on to the next", async () => {
    const { storage, files } = fakeStorage();
    const now = Date.UTC(2026, 9, 29, 16);
    await speak({ ...base({ apiKey: "", now: now - 1000 }), storage });
    await speak({ ...base({ apiKey: "", ...Q2, now }), storage });
    const ok = fakeOpenAI();
    const picky = vi.fn(async (url, init) => (url.endsWith("/audio/speech") && JSON.parse(init.body).input.startsWith("Potassium") ? { ok: false, status: 400 } : ok(url, init)));
    const r = await drainQueue({ storage, apiKey: "k", fetchImpl: picky, now: () => now, log: () => {} });
    expect(r).toMatchObject({ rejected: 1, voiced: 1 });
    expect([...files.keys()].filter((k) => /^queue(-retry)?\//.test(k))).toEqual([]);
    expect((await speak({ ...base({ apiKey: "" }), storage })).status).toBe(422); // never paid for again
  });

  it("retries an outage on later runs, then gives up after the attempt limit", async () => {
    const { storage, files } = fakeStorage();
    await speak({ ...base({ apiKey: "" }), storage });
    const down = vi.fn(async () => ({ ok: false, status: 503 }));
    for (let run = 1; run < MAX_ATTEMPTS; run++) {
      const r = await drainQueue({ storage, apiKey: "k", fetchImpl: down, log: () => {} });
      expect(r.retried).toBe(1);
      const q = [...files.keys()].find((k) => /^queue(-retry)?\//.test(k));
      expect(JSON.parse(files.get(q).toString()).attempts).toBe(run);
    }
    const last = await drainQueue({ storage, apiKey: "k", fetchImpl: down, log: () => {} });
    expect(last.rejected).toBe(1);
    expect([...files.keys()].filter((k) => /^queue(-retry)?\//.test(k))).toEqual([]);
  });

  it("keeps a given-up passage queued until its give-up record is saved, then saves it without paying again", async () => {
    const good = fakeStorage();
    await speak({ ...base({ apiKey: "" }), storage: good.storage });
    const q = [...good.files.keys()].find((k) => /^queue(-retry)?\//.test(k));
    good.files.set(q, Buffer.from(JSON.stringify({ ...JSON.parse(good.files.get(q).toString()), attempts: MAX_ATTEMPTS - 1 })));
    // the last attempt fails, and writing the record fails too
    const real = good.storage.from(BUCKET);
    const noRecords = { ...good.storage, from: () => ({ ...real, upload: (p, b, o) => (/^marin\/.*\.json$/.test(p) ? Promise.resolve({ error: { message: "Internal error" } }) : real.upload(p, b, o)) }) };
    const first = await drainQueue({ storage: noRecords, apiKey: "k", fetchImpl: vi.fn(async () => ({ ok: false, status: 503 })), log: () => {} });
    expect(first.errors.some((e) => /give-up record/.test(e))).toBe(true);
    const kept = q.replace(/^queue\//, "queue-retry/");
    expect(good.files.has(kept)).toBe(true);
    expect(JSON.parse(good.files.get(kept).toString()).giveUp).toMatch(/gave up after 5 attempts/);
    // storage recovers: the record is saved and the entry removed, with no synthesis
    const f = fakeOpenAI();
    const second = await drainQueue({ storage: good.storage, apiKey: "k", fetchImpl: f, log: () => {} });
    expect(second.rejected).toBe(1);
    expect(f).not.toHaveBeenCalled();
    expect([...good.files.keys()].filter((k) => /^queue(-retry)?\//.test(k))).toEqual([]);
    expect((await speak({ ...base({ apiKey: "" }), storage: good.storage })).status).toBe(422);
  });

  it("keeps a queued entry, spends nothing and fails the run when its check record cannot be read", async () => {
    const good = fakeStorage();
    await speak({ ...base({ apiKey: "" }), storage: good.storage });
    const real = good.storage.from(BUCKET);
    const unreadable = { ...good.storage, from: () => ({ ...real, download: (p) => (/^marin\/.*\.json$/.test(p) ? Promise.resolve({ data: null, error: { message: "Internal server error", statusCode: "500" } }) : real.download(p)) }) };
    const f = fakeOpenAI();
    const r = await runJob({ storage: unreadable, db: fakeDb({ questions: [], case_studies: [], flashcards: [] }), apiKey: "k", fetchImpl: f, max: 5, log: () => {} });
    expect(r.failed).toBe(true);
    expect(f).not.toHaveBeenCalled();
    expect([...good.files.keys()].filter((k) => k.startsWith("queue/"))).toHaveLength(1);
  });

  it("keeps the original entry when neither the give-up record nor its replacement can be saved", async () => {
    const good = fakeStorage();
    await speak({ ...base({ apiKey: "" }), storage: good.storage });
    const q = [...good.files.keys()].find((k) => k.startsWith("queue/"));
    good.files.set(q, Buffer.from(JSON.stringify({ ...JSON.parse(good.files.get(q).toString()), attempts: MAX_ATTEMPTS - 1 })));
    const real = good.storage.from(BUCKET);
    // the record and the retry-lane writes fail; deletes (and the budget counters) still work
    const full = { ...good.storage, from: () => ({ ...real, upload: (p, b, o) => (/^marin\/.*\.json$|^queue-retry\//.test(p) ? Promise.resolve({ error: { message: "Storage quota exceeded" } }) : real.upload(p, b, o)) }) };
    const r = await runJob({ storage: full, db: fakeDb({ questions: [], case_studies: [], flashcards: [] }), apiKey: "k", fetchImpl: vi.fn(async () => ({ ok: false, status: 503 })), max: 1, log: () => {} });
    expect(good.files.has(q)).toBe(true); // the work is still there
    expect(JSON.parse(good.files.get(q).toString()).attempts).toBe(MAX_ATTEMPTS - 1);
    expect(r.failed).toBe(true);
    expect(r.lines.join("\n")).toMatch(/entry kept as it was/);
  });

  it("fails the run when finished entries cannot be removed, and still reaches the work behind them", async () => {
    const { storage, files } = fakeStorage();
    // 450 entries already decided (their records exist) that can no longer be removed...
    for (let i = 0; i < 450; i++) {
      const text = `Card ${2000 + i}.`;
      const p = passagePaths(text);
      files.set(p.queue, Buffer.from(JSON.stringify({ text, voice: "marin", ref: { kind: "card", id: 2000 + i, part: "front" }, seg: "card-front" })));
      files.set(p.rec, Buffer.from(JSON.stringify({ qa: QA_VERSION, pass: true, textSha: createHash("sha256").update(text).digest("hex") })));
    }
    // ...then one student's request
    await speak({ ...base({ apiKey: "" }), storage });
    const real = storage.from(BUCKET);
    const noRemove = { ...storage, from: () => ({ ...real, remove: (ps) => (ps.some((p) => p.startsWith("queue/")) ? Promise.resolve({ error: { message: "Internal error" } }) : real.remove(ps)) }) };
    const f = fakeOpenAI();
    const r = await runJob({ storage: noRemove, db: fakeDb({ questions: [], case_studies: [], flashcards: [] }), apiKey: "k", fetchImpl: f, max: 200, log: () => {} });
    expect(r.failed).toBe(true);
    expect(r.lines.join("\n")).toMatch(/could not remove/);
    expect(JSON.parse(f.mock.calls[0][1].body).input).toBe("Potassium 2.9 milliequivalents per liter."); // the request was reached
    expect(r.queue.voiced).toBe(1);
  });

  it("stops the run after three outages in a row, without touching the rest", async () => {
    const { storage, files } = fakeStorage();
    const segs = [["stem", "Which value is the priority?"], ["opt0", "Potassium 2.9 milliequivalents per liter."], ["opt1", "Sodium 138 milliequivalents per liter."]];
    for (const [seg, text] of segs) await speak({ ...base({ apiKey: "", ref: REF, seg, text }), storage });
    const down = vi.fn(async () => ({ ok: false, status: 500 }));
    const r = await drainQueue({ storage, apiKey: "k", fetchImpl: down, log: () => {} });
    expect(r).toMatchObject({ providerDown: true, retried: 3 });
    expect(down.mock.calls.filter(([u]) => u.endsWith("/audio/speech"))).toHaveLength(3); // nothing after the third
  });

  it("a Listen request moves the item's parts out of the retry lane, ahead of other work, keeping their attempts", async () => {
    const { storage, files } = fakeStorage();
    // older retries from the same outage, ahead of ours in the retry lane
    for (let i = 0; i < 3; i++) {
      const t = `Card ${8000 + i}.`;
      files.set(passagePaths(t).retry, Buffer.from(JSON.stringify({ text: t, voice: "marin", ref: { kind: "card", id: 8000 + i, part: "front" }, seg: "card-front", attempts: 1 })));
    }
    // the asked-for passage failed in that outage and waits in the retry lane too
    const text = "Potassium 2.9 milliequivalents per liter.";
    const p = passagePaths(text);
    files.set(p.retry, Buffer.from(JSON.stringify({ text, voice: "marin", ref: { kind: "card", id: 4, part: "front" }, seg: "card-front", attempts: 2 })));
    // and other students' fresh work
    for (let i = 0; i < 3; i++) {
      const t = `Card ${7000 + i}.`;
      files.set(passagePaths(t).queue, Buffer.from(JSON.stringify({ text: t, voice: "marin", ref: { kind: "card", id: 7000 + i, part: "front" }, seg: "card-front" })));
    }
    const r = await speak({ ...base({ apiKey: "" }), storage });
    expect(r.status).toBe(202);
    expect(files.has(p.retry)).toBe(false);
    const moved = JSON.parse(files.get(p.queue).toString());
    expect(moved.attempts).toBe(2); // its history kept
    // a run with room for the fresh lane only reaches it, ahead of every retry
    const f = fakeOpenAI();
    await drainQueue({ storage, apiKey: "k", fetchImpl: f, max: 4, log: () => {} });
    expect(f.mock.calls.filter((c) => c[0].endsWith("/audio/speech")).map((c) => JSON.parse(c[1].body).input)).toContain(text);
  });

  it("reaches fresh work behind more than a page of removable entries, before any retry", async () => {
    const { storage, files } = fakeStorage();
    // 1,100 finished entries (records exist) at the front of the fresh lane
    for (let i = 0; i < 1100; i++) {
      const text = `Card ${3000 + i}.`;
      const p = passagePaths(text);
      files.set(p.queue, Buffer.from(JSON.stringify({ text, voice: "marin", ref: { kind: "card", id: 3000 + i, part: "front" }, seg: "card-front" })));
      files.set(p.rec, Buffer.from(JSON.stringify({ qa: QA_VERSION, pass: true, textSha: createHash("sha256").update(text).digest("hex") })));
    }
    // a retry, and then a student's fresh request
    const retryText = "Card 9999.";
    files.set(passagePaths(retryText).retry, Buffer.from(JSON.stringify({ text: retryText, voice: "marin", ref: { kind: "card", id: 9999, part: "front" }, seg: "card-front", attempts: 1 })));
    await speak({ ...base({ apiKey: "" }), storage });
    const f = fakeOpenAI();
    const r = await drainQueue({ storage, apiKey: "k", fetchImpl: f, max: 1, log: () => {} });
    expect(r.voiced).toBe(1);
    expect(JSON.parse(f.mock.calls[0][1].body).input).toBe("Potassium 2.9 milliequivalents per liter."); // the fresh request, not the retry
  });

  it("serves every fresh request before any retry, however long the queue", async () => {
    const { storage, files } = fakeStorage();
    // 1,200 retried passages left by an outage, then one student's fresh request
    for (let i = 0; i < 1200; i++) {
      const text = `Card ${1000 + i}.`;
      const key = passagePaths(text).retry;
      files.set(key, Buffer.from(JSON.stringify({ text, voice: "marin", ref: { kind: "card", id: 1000 + i, part: "front" }, seg: "card-front", attempts: 1 })));
    }
    await speak({ ...base({ apiKey: "" }), storage });
    const f = fakeOpenAI();
    const r = await drainQueue({ storage, apiKey: "k", fetchImpl: f, max: 1, log: () => {} });
    expect(r.voiced).toBe(1);
    expect(JSON.parse(f.mock.calls[0][1].body).input).toBe("Potassium 2.9 milliequivalents per liter.");
  });

  it("voices at most the run's limit", async () => {
    const { storage } = fakeStorage();
    await speak({ ...base({ apiKey: "" }), storage });
    await speak({ ...base({ apiKey: "", ...Q2 }), storage });
    const r = await drainQueue({ storage, apiKey: "k", fetchImpl: fakeOpenAI(), max: 1, log: () => {} });
    expect(r).toMatchObject({ voiced: 1 });
  });
});

/* A fake bank read with the service role: records the filters applied. */
function fakeDb(tables) {
  const seen = [];
  return {
    seen,
    from(table) {
      const f = { table, eq: [], is: [], gt: null, limit: Infinity };
      seen.push(f);
      const chain = {
        select: () => chain,
        eq: (c, v) => (f.eq.push([c, v]), chain),
        is: (c, v) => (f.is.push([c, v]), chain),
        gt: (c, v) => ((f.gt = v), chain),
        order: () => chain,
        limit: (n) => ((f.limit = n), chain),
        then: (resolve) => resolve({ data: (tables[table] ?? []).filter((r) => r.id > (f.gt ?? 0)).slice(0, f.limit), error: null }),
      };
      return chain;
    },
  };
}

describe("the voice job: voicing the bank ahead of demand", () => {
  const BANK = {
    questions: [ROW, { ...ROW, id: 9, stem: "Which action comes first?", options: ["Call the provider", "Recheck the level"], rationale: "Recheck first." }],
    case_studies: [{ id: 3, title: "Sepsis", intro: "A client.", vitals: [["HR", "118"]], labs: [], note: "Confused.", steps: [{ stem: "Which cue?", options: ["HR", "Temp"], type: "mc", answer: 0, rationale: "HR." }] }],
    flashcards: [{ id: 4, front: "Antidote for heparin?", back: "Protamine sulfate" }],
  };

  it("logs each passage that fails the check while voicing the bank, with the item it belongs to", async () => {
    const { storage } = fakeStorage();
    const lines = [];
    await prewarmBank({ storage, db: fakeDb(BANK), apiKey: "k", fetchImpl: fakeOpenAI(["Something else entirely."]), max: 3, log: (l) => lines.push(l) });
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toMatch(/^failed the check twice: (result line|question \d+|case \d+|card \d+): expected "/);
  });

  it("tries a budget counter again after a brief storage blip, instead of stopping the run", async () => {
    const saved = { ...STORAGE_RETRY };
    STORAGE_RETRY.ms = [1, 1];
    try {
      const { storage } = fakeStorage();
      const bucket = storage.from(BUCKET);
      const upload = bucket.upload;
      let blips = 1;
      bucket.upload = async (path, body, opts) => (path.startsWith("usage/") && blips-- > 0 ? { error: { message: "The connection to the database timed out", statusCode: "544" } } : upload(path, body, opts));
      const r = await prewarmBank({ storage, db: fakeDb(BANK), apiKey: "k", fetchImpl: fakeOpenAI(), max: 2 });
      expect(r.failure).toBe(false);
      expect(r.voiced).toBeGreaterThan(0);
    } finally { Object.assign(STORAGE_RETRY, saved); }
  });

  it("starts the scan again from the top when the voice check changes, so passages it turned away are voiced again", async () => {
    const { storage, files } = fakeStorage();
    // a scan part-way through the cards under an older check
    files.set("prewarm/cursor.json", Buffer.from(JSON.stringify({ kind: "card", afterId: 4, check: CHECK_VERSION - 1 })));
    const r = await prewarmBank({ storage, db: fakeDb(BANK), apiKey: "k", fetchImpl: fakeOpenAI(), max: 1 });
    expect(r.cursor.kind).toBe("verdicts"); // back at the top
    expect(JSON.parse(files.get("prewarm/cursor.json").toString()).check).toBe(CHECK_VERSION);
    // under the current check, a finished scan stays finished until the weekly rescan
    files.set("prewarm/cursor.json", Buffer.from(JSON.stringify({ done: true, doneAt: new Date().toISOString(), check: CHECK_VERSION })));
    const f = fakeOpenAI();
    await prewarmBank({ storage, db: fakeDb(BANK), apiKey: "k", fetchImpl: f, max: 10 });
    expect(f).not.toHaveBeenCalled();
  });

  it("voices the result lines, then every question, case and card, and remembers where it got to", async () => {
    const { storage, files } = fakeStorage();
    const db = fakeDb(BANK);
    const r = await prewarmBank({ storage, db, apiKey: "k", fetchImpl: fakeOpenAI(), max: 1000 });
    expect(r.cursor).toMatchObject({ done: true });
    const records = [...files.keys()].filter((k) => /^marin\/.*\.json$/.test(k)).length;
    const expected = new Set([...verdictPassages(), ...BANK.questions.flatMap((q) => itemPassages("question", q)), ...itemPassages("case", BANK.case_studies[0]), ...itemPassages("card", BANK.flashcards[0])]).size;
    expect(records).toBe(expected);
    // exam items are never read
    for (const t of ["questions", "case_studies"]) expect(db.seen.filter((f) => f.table === t).every((f) => f.is.some(([c, v]) => c === "exam_form" && v === null))).toBe(true);
    expect(db.seen.every((f) => f.eq.some(([c, v]) => c === "approved" && v === true))).toBe(true);
    // a student then hears the AI voice at once
    expect((await speak({ ...base({ apiKey: "" }), storage })).status).toBe(200);
  });

  it("stops at the run's limit and resumes where it stopped", async () => {
    const { storage, files } = fakeStorage();
    const db = fakeDb(BANK);
    const first = await prewarmBank({ storage, db, apiKey: "k", fetchImpl: fakeOpenAI(), max: 5 });
    expect(first.stopped).toBe("max");
    const after = [...files.keys()].filter((k) => /^marin\/.*\.json$/.test(k)).length;
    expect(after).toBe(5);
    const second = await prewarmBank({ storage, db, apiKey: "k", fetchImpl: fakeOpenAI(), max: 1000 });
    expect(second.cursor).toMatchObject({ done: true });
  });

  it("waits a week before scanning the bank again", async () => {
    const { storage } = fakeStorage();
    const db = fakeDb(BANK);
    const t0 = Date.UTC(2026, 9, 29, 16);
    await prewarmBank({ storage, db, apiKey: "k", fetchImpl: fakeOpenAI(), max: 1000, now: () => t0 });
    const f = fakeOpenAI();
    const soon = await prewarmBank({ storage, db: fakeDb({ ...BANK, flashcards: [...BANK.flashcards, { id: 5, front: "New?", back: "Yes" }] }), apiKey: "k", fetchImpl: f, max: 1000, now: () => t0 + 86400000 });
    expect(f).not.toHaveBeenCalled();
    expect(soon.cursor.done).toBe(true);
    const later = await prewarmBank({ storage, db: fakeDb({ ...BANK, flashcards: [...BANK.flashcards, { id: 5, front: "New?", back: "Yes" }] }), apiKey: "k", fetchImpl: f, max: 1000, now: () => t0 + 8 * 86400000 });
    expect(later.voiced).toBe(2); // only the new card's two sides
  });

  it("gives up on a passage that keeps failing after five attempts, then moves on through the bank", async () => {
    const { storage, files } = fakeStorage();
    const db = fakeDb(BANK);
    // the first result line always fails with an outage; everything else works
    const first = verdictPassages()[0];
    const ok = fakeOpenAI();
    const flaky = vi.fn(async (url, init) => (url.endsWith("/audio/speech") && JSON.parse(init.body).input === first ? { ok: false, status: 500 } : ok(url, init)));
    const runs = [];
    for (let run = 0; run < MAX_ATTEMPTS + 1; run++) runs.push(await prewarmBank({ storage, db, apiKey: "k", fetchImpl: flaky, max: 1000 }));
    const paidForFirst = flaky.mock.calls.filter(([u, i]) => u.endsWith("/audio/speech") && JSON.parse(i.body).input === first).length;
    expect(paidForFirst).toBe(MAX_ATTEMPTS); // bounded, never more
    expect(runs.slice(0, MAX_ATTEMPTS - 1).every((r) => r.failure && /^provider:/.test(r.stopped))).toBe(true);
    expect(runs.at(-1).cursor).toMatchObject({ done: true }); // the scan finished
    expect((await speak({ ...base({ apiKey: "" }), storage })).status).toBe(200); // later items were voiced
    const rec = [...files.keys()].find((k) => k === passagePaths(first).rec);
    expect(JSON.parse(files.get(rec).toString()).reason).toMatch(/gave up after 5 attempts/);
  });

  it("leaves a passage waiting in the queue to the queue: never voiced twice, attempts counted once", async () => {
    const { storage, files } = fakeStorage();
    const db = fakeDb({ questions: [], case_studies: [], flashcards: [{ id: 4, front: "Potassium 2.9 mEq/L.", back: "Low." }] });
    await speak({ ...base({ apiKey: "" }), storage }); // card 4's front is queued
    const q = [...files.keys()].find((k) => k.startsWith("queue/"));
    files.set(q.replace(/^queue\//, "queue-retry/"), files.get(q)); files.delete(q); // ...and waiting to retry
    const f = fakeOpenAI();
    await prewarmBank({ storage, db, apiKey: "k", fetchImpl: f, max: 1000 });
    expect(f.mock.calls.some(([u, i]) => u.endsWith("/audio/speech") && JSON.parse(i.body).input === "Potassium 2.9 milliequivalents per liter.")).toBe(false);
  });

  it("does not voice the bank in a run where the queue hit an outage", async () => {
    const { storage } = fakeStorage();
    await speak({ ...base({ apiKey: "" }), storage });
    const ok = fakeOpenAI();
    // transcription fails for the queued passage only
    const f = vi.fn(async (url, init) => (url.endsWith("/audio/transcriptions") ? { ok: false, status: 500 } : ok(url, init)));
    const r = await runJob({ storage, db: fakeDb(BANK), apiKey: "k", fetchImpl: f, max: 50, log: () => {} });
    expect(r.queue.operational).toBe(true);
    expect(r.bank.stopped).toBe("skipped");
    expect(f.mock.calls.filter(([u]) => u.endsWith("/audio/speech"))).toHaveLength(1);
    expect(r.failed).toBe(true);
  });

  it("treats an unreadable check record as storage trouble: no new purchase, the run fails", async () => {
    const { storage, files } = fakeStorage();
    // prewarm once so records exist, then make record reads fail
    await prewarmBank({ storage, db: fakeDb(BANK), apiKey: "k", fetchImpl: fakeOpenAI(), max: 1000 });
    files.delete("prewarm/cursor.json");
    const real = storage.from(BUCKET);
    const unreadable = { ...storage, from: () => ({ ...real, download: (p) => (/^marin\/.*\.json$/.test(p) ? Promise.resolve({ data: null, error: { message: "Internal server error", statusCode: "500" } }) : real.download(p)) }) };
    const f = fakeOpenAI();
    const w = await prewarmBank({ storage: unreadable, db: fakeDb(BANK), apiKey: "k", fetchImpl: f, max: 1000 });
    expect(w.failure).toBe(true);
    expect(w.stopped).toMatch(/^storage:/);
    expect(f).not.toHaveBeenCalled();
    // the route says unavailable, and queues nothing
    expect((await speak({ ...base({ apiKey: "" }), storage: unreadable })).status).toBe(503);
  });

  it("stops without paying when today's spending is used up", async () => {
    const { storage } = fakeStorage();
    const f = fakeOpenAI();
    const r = await prewarmBank({ storage, db: fakeDb(BANK), apiKey: "k", fetchImpl: f, max: 1000, limits: { user: 300, admission: 0, spend: 0 } });
    expect(r).toMatchObject({ budget: true, voiced: 0 });
    expect(f).not.toHaveBeenCalled();
  });
});

describe("account and setup failures, shared spending, and the run's outcome", () => {
  const BANK = { questions: [ROW], case_studies: [], flashcards: [] };
  for (const status of [401, 403, 404]) {
    it(`records nothing when the provider answers ${status}, and voices the passage once the account works`, async () => {
      const { storage, files } = fakeStorage();
      const broken = vi.fn(async () => ({ ok: false, status }));
      expect((await speak({ ...base(), storage, fetchImpl: broken })).status).toBe(503);
      await speak({ ...base({ apiKey: "" }), storage });
      const r = await drainQueue({ storage, apiKey: "k", fetchImpl: broken, log: () => {} });
      expect(r.service).toBeTruthy();
      expect([...files.keys()].filter((k) => k.startsWith("marin/"))).toEqual([]);
      expect([...files.keys()].filter((k) => /^queue(-retry)?\//.test(k))).toHaveLength(1);
      const fixed = await drainQueue({ storage, apiKey: "k", fetchImpl: fakeOpenAI(), log: () => {} });
      expect(fixed.voiced).toBe(1);
    });
  }

  it("reconsiders a provider refusal after a week", async () => {
    const { storage } = fakeStorage();
    const t0 = Date.UTC(2026, 9, 29, 16);
    expect((await speak({ ...base(), storage, fetchImpl: vi.fn(async () => ({ ok: false, status: 400 })), now: t0 })).status).toBe(422);
    expect((await speak({ ...base(), storage, fetchImpl: fakeOpenAI(), now: t0 + 86400000 })).status).toBe(422);
    expect((await speak({ ...base(), storage, fetchImpl: fakeOpenAI(), now: t0 + (REJECTION_DAYS + 1) * 86400000 })).status).toBe(200);
  });

  it("stops after three refusals in a row: that is a setup problem, not three bad passages", async () => {
    const { storage, files } = fakeStorage();
    const segs = [["stem", "Which value is the priority?"], ["opt0", "Potassium 2.9 milliequivalents per liter."], ["opt1", "Sodium 138 milliequivalents per liter."], ["instruction", "Choose one answer."]];
    for (const [seg, text] of segs) await speak({ ...base({ apiKey: "", ref: REF, seg, text }), storage });
    const r = await drainQueue({ storage, apiKey: "k", fetchImpl: vi.fn(async () => ({ ok: false, status: 400 })), log: () => {} });
    expect(r.rejected).toBe(3);
    expect(r.service).toMatch(/3 refusals in a row/);
    expect([...files.keys()].filter((k) => /^queue(-retry)?\//.test(k))).toHaveLength(new Set(itemParts("question", ROW).map((x) => x.text)).size - 3);
  });

  it("counts live and scheduled syntheses against ONE app-wide cap", async () => {
    const { storage, files } = fakeStorage();
    const limits = { user: 100, admission: 100, spend: 2 };
    const now = Date.UTC(2026, 9, 29, 16);
    await speak({ ...base({ apiKey: "", ...Q2 }), storage, limits, now });
    await drainQueue({ storage, apiKey: "k", fetchImpl: fakeOpenAI(), limits, now: () => now, log: () => {} }); // 1 paid
    const f = fakeOpenAI();
    expect((await speak({ ...base(), storage, fetchImpl: f, limits, now })).status).toBe(200); // 1 paid: the cap is reached
    expect((await speak({ ...base({ ...Q3 }), storage, fetchImpl: f, limits, now })).status).toBe(429);
    expect([...files.keys()].filter((k) => /\/spend\/\d+$/.test(k))).toHaveLength(2);
  });

  it("uses the shared LIMITS by default, the same values as the route", async () => {
    const { storage } = fakeStorage();
    const { lines } = await runJob({ storage, db: fakeDb(BANK), apiKey: "k", fetchImpl: fakeOpenAI(), max: 1, log: () => {} });
    expect(lines.join("\n")).toContain(`cap ${LIMITS.spend} a day`);
    expect(Object.isFrozen(LIMITS)).toBe(true);
  });

  it("fails the run when the provider fails while voicing the bank, even with an empty queue", async () => {
    const { storage } = fakeStorage();
    const r = await runJob({ storage, db: fakeDb(BANK), apiKey: "k", fetchImpl: vi.fn(async () => ({ ok: false, status: 503 })), max: 10, log: () => {} });
    expect(r.failed).toBe(true);
    expect(r.bank.stopped).toMatch(/^provider:/);
  });

  it("fails the run on storage trouble while voicing the bank", async () => {
    const { storage, files } = fakeStorage();
    const real = storage.from(BUCKET);
    const flaky = { ...real, upload: async (path, body, opts) => (path === "prewarm/cursor.json" ? { error: { message: "Internal error" } } : real.upload(path, body, opts)) };
    const broken = { ...storage, from: () => flaky };
    const r = await runJob({ storage: broken, db: fakeDb(BANK), apiKey: "k", fetchImpl: fakeOpenAI(), max: 1000, log: () => {} });
    expect(r.failed).toBe(true);
    expect(files.size).toBeGreaterThan(0);
  });

  it("fails the run for a single queued provider failure, even when the bank has nothing left to do", async () => {
    const { storage } = fakeStorage();
    await speak({ ...base({ apiKey: "" }), storage });
    const r = await runJob({ storage, db: fakeDb(BANK), apiKey: "k", fetchImpl: vi.fn(async () => ({ ok: false, status: 503 })), max: 1, log: () => {} });
    expect(r.queue).toMatchObject({ retried: 1, providerDown: false });
    expect(r.bank.stopped).toBe("skipped");
    expect(r.failed).toBe(true);
  });

  it("fails the run, with a storage diagnostic, when the spending counters are broken (not a full budget)", async () => {
    const good = fakeStorage();
    await speak({ ...base({ apiKey: "" }), storage: good.storage }); // queued while counters worked
    const real = good.storage.from(BUCKET);
    const brokenCounters = { ...real, list: async (dir, o) => (dir.includes("/spend") ? { data: null, error: { message: "Internal error" } } : real.list(dir, o)) };
    const storage = { ...good.storage, from: () => brokenCounters };
    const f = fakeOpenAI();
    const r = await runJob({ storage, db: fakeDb(BANK), apiKey: "k", fetchImpl: f, max: 10, log: () => {} });
    expect(r.failed).toBe(true);
    expect(r.lines.join("\n")).toMatch(/storage: budget counters unavailable/);
    expect(r.lines.join("\n")).not.toMatch(/budget is used up/);
    expect(f).not.toHaveBeenCalled(); // still nothing spent
  });

  it("fails the run when the counters break while voicing the bank", async () => {
    const good = fakeStorage();
    const real = good.storage.from(BUCKET);
    const brokenCounters = { ...real, list: async (dir, o) => (dir.includes("/spend") ? { data: null, error: { message: "Internal error" } } : real.list(dir, o)) };
    const r = await runJob({ storage: { ...good.storage, from: () => brokenCounters }, db: fakeDb(BANK), apiKey: "k", fetchImpl: fakeOpenAI(), max: 10, log: () => {} });
    expect(r.failed).toBe(true);
    expect(r.bank.stopped).toMatch(/^storage:/);
  });

  it("fails the run when the usage folder cannot be listed for pruning", async () => {
    const { storage } = fakeStorage();
    const real = storage.from(BUCKET);
    const broken = { ...storage, from: () => ({ ...real, list: (dir, o) => (dir === "usage" ? Promise.resolve({ data: null, error: { message: "Internal error" } }) : real.list(dir, o)) }) };
    const r = await runJob({ storage: broken, db: fakeDb({ questions: [], case_studies: [], flashcards: [] }), apiKey: "k", fetchImpl: fakeOpenAI(), max: 5, log: () => {} });
    expect(r.failed).toBe(true);
    expect(r.lines.join("\n")).toMatch(/pruning: Could not list usage/);
  });

  it("asks for the next run only when it stopped at its own limit with work left", async () => {
    // the bank scan reached the run's limit: carry on
    expect((await runJob({ storage: fakeStorage().storage, db: fakeDb(BANK), apiKey: "k", fetchImpl: fakeOpenAI(), max: 2, log: () => {} })).more).toBe(true);
    // the queue alone used the whole run: carry on
    const busy = fakeStorage();
    await speak({ ...base({ apiKey: "" }), storage: busy.storage });
    expect((await runJob({ storage: busy.storage, db: fakeDb(BANK), apiKey: "k", fetchImpl: fakeOpenAI(), max: 1, log: () => {} })).more).toBe(true);
    // everything done: stop
    expect((await runJob({ storage: fakeStorage().storage, db: fakeDb(BANK), apiKey: "k", fetchImpl: fakeOpenAI(), max: 1000, log: () => {} })).more).toBe(false);
    // today's budget spent: stop until tomorrow
    expect((await runJob({ storage: fakeStorage().storage, db: fakeDb(BANK), apiKey: "k", fetchImpl: fakeOpenAI(), max: 50, limits: { user: 300, admission: 300, spend: 0 }, log: () => {} })).more).toBe(false);
    // a failed run that got nothing done (the provider is down): stop, so an outage never loops
    const down = await runJob({ storage: fakeStorage().storage, db: fakeDb(BANK), apiKey: "k", fetchImpl: vi.fn(async () => ({ ok: false, status: 503 })), max: 50, log: () => {} });
    expect(down.failed).toBe(true);
    expect(down.progress).toBe(false);
    expect(down.more).toBe(false);
    // a failed run that still got work done (a brief blip): carry on, after the workflow's pause
    const ok = fakeOpenAI();
    let calls = 0;
    const flaky = vi.fn(async (url, init) => (++calls > 6 ? { ok: false, status: 503 } : ok(url, init)));
    const blip = await runJob({ storage: fakeStorage().storage, db: fakeDb(BANK), apiKey: "k", fetchImpl: flaky, max: 50, log: () => {} });
    expect(blip.failed).toBe(true);
    expect(blip.progress).toBe(true);
    expect(blip.more).toBe(true);
  });

  it("passes the run when work simply stops at the run's limit or today's budget", async () => {
    const { storage } = fakeStorage();
    expect((await runJob({ storage, db: fakeDb(BANK), apiKey: "k", fetchImpl: fakeOpenAI(), max: 2, log: () => {} })).failed).toBe(false);
    expect((await runJob({ storage, db: fakeDb(BANK), apiKey: "k", fetchImpl: fakeOpenAI(), max: 50, limits: { user: 300, admission: 300, spend: 0 }, log: () => {} })).failed).toBe(false);
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
    // and the server accepts every piece
    for (const x of parts) expect(validRequest({ kind: "question", id: 7, part: "feedback", result: { correct: false, points: 0, max: 1 } }, x.id, x.text)).toBe(true);
  });
});

describe("server voice: daily budgets", () => {
  it("holds a student to the limit when many requests arrive at once", async () => {
    const f = fakeOpenAI(), { storage, files } = fakeStorage();
    const limits = { user: 2, admission: 100, spend: 100 };
    // three different items, each asked for five times, all at once, before any is queued
    const items = [Q1, Q2, Q3];
    const out = await Promise.all(Array.from({ length: 15 }, (_, i) => speak({ ...base({ apiKey: "", ...items[i % 3] }), storage, fetchImpl: f, limits })));
    // exactly two items admitted (two slots), every request for them answered 202; the third item refused in full
    expect([...files.keys()].filter((k) => /\/u-[0-9a-f]+\/\d+$/.test(k))).toHaveLength(2);
    const byItem = items.map((it) => out.filter((_, i) => items[i % 3] === it).map((r) => r.status));
    expect(byItem.filter((st) => st.every((x) => x === 202))).toHaveLength(2);
    expect(byItem.filter((st) => st.every((x) => x === 429))).toHaveLength(1);
    expect([...files.keys()].filter((k) => /^queue(-retry)?\//.test(k))).toHaveLength(2);
    expect(f).not.toHaveBeenCalled();
  });

  it("holds the app-wide limit across many students at once", async () => {
    const { storage, files } = fakeStorage();
    const limits = { user: 10, admission: 4, spend: 4 };
    const out = await Promise.all(Array.from({ length: 12 }, (_, i) => speak({ ...base({ apiKey: "", userId: `u${i}`, ...CARD(100 + i, `Card ${100 + i}.`) }), storage, limits })));
    expect([...files.keys()].filter((k) => /\/all\/\d+$/.test(k))).toHaveLength(4);
    expect(out.filter((r) => r.status === 202)).toHaveLength(4);
    expect(out.filter((r) => r.status === 429)).toHaveLength(8);
  });

  it("queues every part of an item together, under one claim, when its parts are asked for at once", async () => {
    const { storage, files } = fakeStorage();
    const parts = questionSegments(ROW);
    const out = await Promise.all(parts.map((p) => speak({ ...base({ apiKey: "", ref: REF, seg: p.id, text: p.text }), storage })));
    expect(out.map((r) => r.status)).toEqual(parts.map(() => 202));
    // every part of the item: the question AND its explanation, under one claim
    const whole = new Set(itemParts("question", ROW).map((x) => x.text));
    expect([...files.keys()].filter((k) => /^queue(-retry)?\//.test(k))).toHaveLength(whole.size);
    expect(whole.size).toBeGreaterThan(parts.length);
    expect([...files.keys()].filter((k) => /\/u-[0-9a-f]+\/\d+$/.test(k))).toHaveLength(1); // one claim for the whole item
  });

  it("refuses every part of an item, and queues none, when the student has no claim left", async () => {
    const { storage, files } = fakeStorage();
    const limits = { user: 1, admission: 100, spend: 100 };
    await speak({ ...base({ apiKey: "", ...CARD(100, "Card 100.") }), storage, limits }); // the day's one claim, on another item
    const parts = questionSegments(ROW);
    const out = await Promise.all(parts.map((p) => speak({ ...base({ apiKey: "", ref: REF, seg: p.id, text: p.text }), storage, limits })));
    expect(out.map((r) => r.status)).toEqual(parts.map(() => 429));
    expect([...files.keys()].filter((k) => /^queue(-retry)?\//.test(k))).toHaveLength(1); // only the earlier card
  });

  describe("an item claim whose request died part-way", () => {
    const markerOf = (files) => [...files.keys()].find((k) => /\/items\/[0-9a-f]{32}$/.test(k));
    const saved = { ...CLAIM_WAIT };
    beforeEach(() => { CLAIM_WAIT.tries = 3; CLAIM_WAIT.ms = 5; });
    afterEach(() => Object.assign(CLAIM_WAIT, saved));

    async function abandoned(files, storage, t) {
      // a first request claims the item, then its process ends before confirming
      await speak({ ...base({ apiKey: "" }), storage, now: t });
      const m = markerOf(files);
      files.set(m, Buffer.from(`pending:${t}`));
      for (const k of [...files.keys()]) if (/^queue(-retry)?\//.test(k) || /\/(u-[0-9a-f]+|all)\/\d+$/.test(k)) files.delete(k);
      return m;
    }

    it("is taken over after its lease, and the item is queued with a slot claimed", async () => {
      const { storage, files } = fakeStorage();
      const t = Date.UTC(2026, 9, 29, 16);
      const m = await abandoned(files, storage, t);
      const out = await speak({ ...base({ apiKey: "" }), storage, now: t + CLAIM_LEASE_MS + 1000 });
      expect(out.status).toBe(202);
      expect(files.get(m).toString()).toBe("ok");
      expect([...files.keys()].filter((k) => /^queue(-retry)?\//.test(k))).toHaveLength(1);
      expect([...files.keys()].filter((k) => /\/u-[0-9a-f]+\/\d+$/.test(k))).toHaveLength(1); // the caps still count it
    });

    it("is not taken over while its lease runs, and the request says the voice is unavailable for now", async () => {
      const { storage, files } = fakeStorage();
      const t = Date.UTC(2026, 9, 29, 16);
      await abandoned(files, storage, t);
      const out = await speak({ ...base({ apiKey: "" }), storage, now: t + 1000 });
      expect(out.status).toBe(503);
      expect([...files.keys()].filter((k) => /^queue(-retry)?\//.test(k))).toEqual([]);
    });

    it("is taken over by exactly one of many requests, and still respects the caps", async () => {
      const { storage, files } = fakeStorage();
      const t = Date.UTC(2026, 9, 29, 16);
      await abandoned(files, storage, t);
      const later = t + CLAIM_LEASE_MS + 1000;
      const out = await Promise.all(Array.from({ length: 6 }, () => speak({ ...base({ apiKey: "" }), storage, now: later })));
      expect(out.every((r) => r.status === 202)).toBe(true);
      expect([...files.keys()].filter((k) => k.includes(".takeover-"))).toHaveLength(1);
      expect([...files.keys()].filter((k) => /\/u-[0-9a-f]+\/\d+$/.test(k))).toHaveLength(1);
    });

    it("is refused in full when the taker has no slot left", async () => {
      const { storage, files } = fakeStorage();
      const t = Date.UTC(2026, 9, 29, 16);
      const m = await abandoned(files, storage, t);
      const out = await speak({ ...base({ apiKey: "" }), storage, now: t + CLAIM_LEASE_MS + 1000, limits: { user: 0, admission: 100, spend: 100 } });
      expect(out.status).toBe(429);
      expect(files.has(m)).toBe(false);
      expect([...files.keys()].filter((k) => /^queue(-retry)?\//.test(k))).toEqual([]);
    });
  });

  it("queues the whole item from one request: the card's back, the question's explanation, every case step", async () => {
    const { storage, files } = fakeStorage();
    const card = { id: 4, front: "Potassium 2.9 mEq/L.", back: "Low." };
    const CASE = { id: 3, title: "Sepsis", intro: "A client.", vitals: [], labs: [], note: "", steps: [{ stem: "Which cue?", options: ["HR"], type: "mc", answer: 0, rationale: "HR." }, { stem: "Which action?", options: ["Fluids"], type: "mc", answer: 0, rationale: "Fluids." }] };
    const readItem = async (kind, id) => (kind === "card" ? card : kind === "case" ? CASE : readBank(kind, id));
    const queuedTexts = () => [...files.keys()].filter((k) => k.startsWith("queue/")).map((k) => JSON.parse(files.get(k).toString()).text);
    // a card's front only
    await speak({ ...base({ apiKey: "", readItem, ref: { kind: "card", id: 4, part: "front" }, seg: "card-front", text: "Potassium 2.9 milliequivalents per liter." }), storage });
    expect(queuedTexts()).toContain("Answer. Low.");
    // a question's stem only
    await speak({ ...base({ apiKey: "", ref: REF, seg: "stem", text: "Which value is the priority?" }), storage });
    expect(queuedTexts()).toContain("Rationale. Low potassium risks dysrhythmias.");
    // a case's introduction only
    await speak({ ...base({ apiKey: "", readItem, ref: { kind: "case", id: 3, part: "intro" }, seg: "case-title", text: "Sepsis." }), storage });
    expect(queuedTexts()).toEqual(expect.arrayContaining(["Which action?", "Rationale. Fluids."]));
    // and every queued entry carries the reference it is read under
    for (const k of [...files.keys()].filter((x) => x.startsWith("queue/"))) {
      const e = JSON.parse(files.get(k).toString());
      expect(validRequest(e.ref, e.seg, e.text)).toBe(true);
    }
  });

  it("counts one claim per bank item: question and explanation, both card sides, every case step", async () => {
    const { storage, files } = fakeStorage();
    const limits = { user: 1, admission: 100, spend: 100 };
    const ask = (ref, parts) => Promise.all(parts.map((p) => speak({ ...base({ apiKey: "", ref, seg: p.id, text: p.text }), storage, limits })));
    // a question, then its explanation
    const qr = await ask(REF, questionSegments(ROW));
    const result = { correct: false, points: 0, max: 1 };
    const fr = await ask({ ...REF, part: "feedback", result }, questionFeedbackSegments(ROW, result));
    expect([...qr, ...fr].every((r) => r.status === 202)).toBe(true);
    expect([...files.keys()].filter((k) => /\/u-[0-9a-f]+\/\d+$/.test(k))).toHaveLength(1);
  });

  it("lets a card's back and every case step reuse the item's one claim", async () => {
    const { storage, files } = fakeStorage();
    const limits = { user: 2, admission: 100, spend: 100 };
    const CASE = { id: 3, title: "Sepsis", intro: "A client.", vitals: [["HR", "118"]], labs: [], note: "Confused.", steps: [{ stem: "Which cue?", options: ["HR", "Temp"], type: "mc", answer: 0, rationale: "HR." }, { stem: "Which action?", options: ["Fluids", "Wait"], type: "mc", answer: 0, rationale: "Fluids." }] };
    const card = { id: 4, front: "Potassium 2.9 mEq/L.", back: "Low." };
    const readItem = async (kind, id) => (kind === "case" && id === 3 ? CASE : kind === "card" && id === 4 ? card : readBank(kind, id));
    const ask = (ref, parts) => Promise.all(parts.map((p) => speak({ ...base({ apiKey: "", ref, seg: p.id, text: p.text, readItem }), storage, limits })));
    const out = [
      ...(await ask({ kind: "card", id: 4, part: "front" }, cardSegments(card, false))),
      ...(await ask({ kind: "card", id: 4, part: "back" }, cardSegments(card, true))),
      ...(await ask({ kind: "case", id: 3, part: "intro" }, caseIntroSegments(CASE))),
      ...(await ask({ kind: "case", id: 3, part: "step", step: 0 }, caseStepSegments(CASE.steps[0]))),
      ...(await ask({ kind: "case", id: 3, part: "step", step: 1 }, caseStepSegments(CASE.steps[1]))),
    ];
    expect(out.every((r) => r.status === 202)).toBe(true);
    expect([...files.keys()].filter((k) => /\/u-[0-9a-f]+\/\d+$/.test(k))).toHaveLength(2); // the card, the case
  });

  it("says an item will wait for tomorrow when today's voicing budget is spent", async () => {
    const { storage, files } = fakeStorage();
    const now = Date.UTC(2026, 9, 29, 16);
    const limits = { user: 10, admission: 10, spend: 2 };
    files.set("usage/2026-10-29/spend/00000", Buffer.from("1"));
    expect((await speak({ ...base({ apiKey: "" }), storage, limits, now })).body).toEqual({ queued: true });
    files.set("usage/2026-10-29/spend/00001", Buffer.from("1")); // the bank pre-voicing used up today's budget
    expect((await speak({ ...base({ apiKey: "", ...Q2 }), storage, limits, now })).body).toEqual({ queued: true, after: "tomorrow" });
    expect((await speak({ ...base({ apiKey: "" }), storage, limits, now })).body).toEqual({ queued: true, after: "tomorrow" }); // already queued
  });

  describe("one synthesis per passage at a time", () => {
    const saved = { ...PASSAGE_WAIT };
    beforeEach(() => { PASSAGE_WAIT.tries = 40; PASSAGE_WAIT.ms = 5; });
    afterEach(() => Object.assign(PASSAGE_WAIT, saved));

    it("pays once when two students ask for the same passage at the same time, and both hear it", async () => {
      const { storage } = fakeStorage();
      const f = fakeOpenAI();
      const out = await Promise.all([speak({ ...base(), storage, fetchImpl: f }), speak({ ...base({ userId: "u2" }), storage, fetchImpl: f })]);
      expect(out.map((r) => r.status)).toEqual([200, 200]);
      expect(speechCalls(f)).toBe(1);
    });

    it("takes over a claim whose request died, after its lease", async () => {
      const { storage, files } = fakeStorage();
      let t = Date.UTC(2026, 9, 29, 16);
      const dead = await claimPassage(storage, Q1.text, () => t);
      expect(dead.state).toBe("mine"); // and then that request died
      expect((await claimPassage(storage, Q1.text, () => t + 1000)).state).toBe("busy");
      t += PASSAGE_LEASE_MS + 1000;
      const f = fakeOpenAI();
      expect((await speak({ ...base(), storage, fetchImpl: f, now: t })).status).toBe(200);
      expect(speechCalls(f)).toBe(1);
      // the dead claim, and the one that took over from it, marked finished
      const claims = [...files.keys()].filter((k) => k.startsWith("claims/")).sort();
      expect(claims).toHaveLength(3);
      expect(claims[0]).toBe(dead.path);
      expect(claims[2]).toMatch(/\/000000000002\.done$/);
    });

    it("ends all paid work inside the lease, so a holder is never taken over while it is still working", async () => {
      expect(PASSAGE_WORK_MS).toBeLessThan(PASSAGE_LEASE_MS);
      const { storage } = fakeStorage();
      let t = Date.UTC(2026, 9, 29, 16);
      const f = fakeOpenAI(["Potassium 9.2 milliequivalents per liter."]); // every take heard wrong
      // each call takes 50 seconds: the second take would run past the claim's end of work
      const slow = vi.fn(async (url, init) => { t += 50000; return f(url, init); });
      const r = await speak({ ...base(), storage, fetchImpl: slow, clock: () => t });
      expect(r.status).toBe(502); // stopped short, nothing final recorded: tried again later
      expect(slow).toHaveBeenCalledTimes(2); // one take (speech + transcription), and no call started past the deadline
      expect(t - Date.UTC(2026, 9, 29, 16)).toBeLessThan(PASSAGE_LEASE_MS);
    });

    it("aborts a provider call still running at the claim's end of work", async () => {
      const saved = { ...CALL };
      CALL.ms = 30; CALL.min = 1;
      try {
        const { storage } = fakeStorage();
        let signal = null;
        const hang = vi.fn((url, init) => { signal = init.signal; return new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true })); });
        const r = await speak({ ...base(), storage, fetchImpl: hang });
        expect(signal?.aborted).toBe(true);
        expect(r.status).toBe(502);
        expect(hang).toHaveBeenCalledTimes(1);
      } finally { Object.assign(CALL, saved); }
    });

    it("never lets two callers hold a passage, however a release and a takeover interleave", async () => {
      const { storage } = fakeStorage();
      let t = Date.UTC(2026, 9, 29, 16);
      // a storage view whose next claim upload waits until the test lets it go
      const gate = { hold: null };
      const paused = { ...storage, from: (b) => { const bk = storage.from(b); return { ...bk, upload: async (p, body, o) => { if (gate.hold && /^claims\/.*\/\d+$/.test(p)) { const h = gate.hold; gate.hold = null; await h; } return bk.upload(p, body, o); } }; } };
      const a = await claimPassage(storage, Q1.text, () => t);
      expect(a.state).toBe("mine");
      t += PASSAGE_LEASE_MS + 1000;
      // B reads A's lapsed claim, then pauses just before taking the next number
      let go; gate.hold = new Promise((r) => { go = r; });
      const bp = claimPassage(paused, Q1.text, () => t);
      await new Promise((r) => setTimeout(r, 0));
      // A's late release lands, and C takes the passage
      await releasePassage(storage, a);
      const c = await claimPassage(storage, Q1.text, () => t);
      expect(c.state).toBe("mine");
      // B resumes: the number it meant to take is gone
      go();
      expect((await bp).state).toBe("busy");
      // while C holds it, everyone else waits; once C finishes, one caller gets the next number
      expect((await claimPassage(storage, Q1.text, () => t + 1000)).state).toBe("busy");
      await releasePassage(storage, c);
      const [d, e] = await Promise.all([claimPassage(storage, Q1.text, () => t + 2000), claimPassage(storage, Q1.text, () => t + 2000)]);
      expect([d.state, e.state].sort()).toEqual(["busy", "mine"]);
      // and two callers racing to take over a lapsed claim: exactly one wins
      t += 3 * PASSAGE_LEASE_MS;
      const [f, g] = await Promise.all([claimPassage(storage, Q1.text, () => t), claimPassage(storage, Q1.text, () => t)]);
      expect([f.state, g.state].sort()).toEqual(["busy", "mine"]);
    });

    it("the voice job removes old claims a day later, keeping each passage's newest so numbers never restart", async () => {
      const { storage, files } = fakeStorage();
      const t = Date.UTC(2026, 9, 29, 16);
      const old1 = await claimPassage(storage, Q1.text, () => t - 3 * 86400000);
      await releasePassage(storage, old1);
      const old2 = await claimPassage(storage, Q1.text, () => t - 2 * 86400000);
      await releasePassage(storage, old2);
      const live = await claimPassage(storage, "Sodium 138 milliequivalents per liter.", () => t);
      await pruneUsage({ storage, now: t });
      expect(files.has(old1.path)).toBe(false);
      expect(files.has(`${old1.path}.done`)).toBe(false);
      expect(files.has(old2.path)).toBe(true);
      expect(files.has(live.path)).toBe(true);
      const next = await claimPassage(storage, Q1.text, () => t);
      expect(next.path).toMatch(/\/000000000003$/);
    });

    it("bounds claim cleanup per run however large the library, and still reaches every folder", async () => {
      const { storage, files } = fakeStorage();
      const t = Date.UTC(2026, 9, 29, 16);
      // 1,000 voiced passages, each with its one finished claim
      for (let i = 0; i < 1000; i++) {
        files.set(`claims/marin-p${String(i).padStart(4, "0")}/000000000001`, Buffer.from(`${t - 5 * 86400000} x`));
        files.set(`claims/marin-p${String(i).padStart(4, "0")}/000000000001.done`, Buffer.from("1"));
      }
      // and one, near the end, with an older claim to remove
      const deep = "claims/marin-p0950";
      files.set(`${deep}/000000000002`, Buffer.from(`${t - 2 * 86400000} y`));
      // count every storage call a run makes
      let n = 0;
      const counted = { ...storage, from: (b) => { const bk = storage.from(b); return Object.fromEntries(Object.entries(bk).map(([k, f]) => [k, (...a) => { n++; return f(...a); }])); } };
      const perRun = [];
      for (let run = 0; run < 6 && files.has(`${deep}/000000000001`); run++) {
        n = 0;
        await pruneUsage({ storage: counted, now: t });
        perRun.push(n);
      }
      expect(files.has(`${deep}/000000000001`)).toBe(false); // reached, and cleaned
      expect(files.has(`${deep}/000000000001.done`)).toBe(false);
      expect(files.has(`${deep}/000000000002`)).toBe(true); // the newest stays
      expect(files.has("claims/marin-p0000/000000000001")).toBe(true); // a lone newest claim stays
      // a fixed bound per run: cursor, one folder page, one listing per folder, a few reads and removals
      for (const calls of perRun) expect(calls).toBeLessThanOrEqual(CLAIM_PRUNE.folders * 2 + 10);
      expect(Math.max(...perRun)).toBeLessThan(CLAIM_PRUNE.folders + 10); // single-claim folders are never read
    });

    it("the voice job leaves a passage being voiced live for its next run", async () => {
      const { storage, files } = fakeStorage();
      await speak({ ...base({ apiKey: "" }), storage });
      expect((await claimPassage(storage, Q1.text)).state).toBe("mine"); // a live request is voicing it
      const f = fakeOpenAI();
      const r = await drainQueue({ storage, apiKey: "k", fetchImpl: f, log: () => {} });
      expect(f).not.toHaveBeenCalled();
      expect(r.errors).toEqual([]);
      expect([...files.keys()].filter((k) => k.startsWith("queue/"))).toHaveLength(1);
    });
  });

  it("charges a take made after Eastern midnight to the new day", async () => {
    const { storage, files } = fakeStorage();
    let t = Date.UTC(2026, 9, 30, 3, 59, 50); // 11:59:50 p.m. Eastern, Oct 29
    const clock = () => t;
    // take 1 is heard wrong; by take 2 it is past midnight
    const f = fakeOpenAI(["Potassium 9.2 milliequivalents per liter.", "Potassium 2.9 milliequivalents per liter."]);
    const slow = vi.fn(async (url, init) => { const r = await f(url, init); if (url.endsWith("/audio/transcriptions")) t += 20000; return r; });
    expect((await speak({ ...base(), storage, fetchImpl: slow, clock })).status).toBe(200);
    expect([...files.keys()].filter((k) => k.startsWith("usage/2026-10-29/spend/"))).toHaveLength(1);
    expect([...files.keys()].filter((k) => k.startsWith("usage/2026-10-30/spend/"))).toHaveLength(1);
  });

  it("refuses (and spends nothing) when the budget counters cannot be read or written, and says so as an outage, not a full budget", async () => {
    const f = fakeOpenAI(), { storage, files } = fakeStorage({ failCounters: true });
    expect((await speak({ ...base(), storage, fetchImpl: f })).status).toBe(503);
    expect((await speak({ ...base({ apiKey: "" }), storage, fetchImpl: f })).status).toBe(503);
    expect(f).not.toHaveBeenCalled();
    expect([...files.keys()].filter((k) => /^queue(-retry)?\//.test(k))).toEqual([]);
  });

  it("charges a second take to the budget too", async () => {
    const f = fakeOpenAI(["Potassium 9.2 milliequivalents per liter.", "Potassium 2.9 milliequivalents per liter."]), { storage, files } = fakeStorage();
    expect((await speak({ ...base(), storage, fetchImpl: f, limits: { user: 1, admission: 100, spend: 100 } })).status).not.toBe(200);
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
    const limits = { user: 1, admission: 100, spend: 100 };
    expect((await speak({ ...base(), storage, fetchImpl: f, limits })).status).toBe(200);
    calls.upload.length = 0;
    const other = { ...base({ ...Q2 }), storage, fetchImpl: f, limits };
    const out = await speak(other);
    expect(out.status).toBe(429);
    expect(speechCalls(f)).toBe(1);
    expect(calls.upload.filter((p) => !p.startsWith("claims/"))).toEqual([]); // only the passage claim, released again
    // another student still has room, and an already-checked passage is still served
    expect((await speak({ ...other, userId: "u2" })).status).toBe(200);
    expect((await speak({ ...base(), storage, fetchImpl: f, limits })).body.cached).toBe(true);
  });

  it("stops everyone at the app-wide daily limit", async () => {
    const f = fakeOpenAI(), { storage } = fakeStorage();
    const limits = { user: 100, admission: 1, spend: 1 };
    await speak({ ...base(), storage, fetchImpl: f, limits });
    const out = await speak({ ...base({ ...Q2, userId: "u9" }), storage, fetchImpl: f, limits });
    expect(out.status).toBe(429);
    expect(speechCalls(f)).toBe(1);
  });

  it("starts each day's budget fresh", async () => {
    const f = fakeOpenAI(), { storage } = fakeStorage();
    const limits = { user: 1, admission: 100, spend: 100 };
    const day1 = Date.UTC(2026, 9, 29, 16), day2 = Date.UTC(2026, 9, 30, 16);
    await speak({ ...base(), storage, fetchImpl: f, limits, now: day1 });
    const t = { ...base({ ...Q2 }), storage, fetchImpl: f, limits };
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
    expect(wf).toContain("if: github.ref == 'refs/heads/main'");
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
  it("starts the next run itself only while the worker says there is more, on main, with no more than it needs", () => {
    expect(wf).toContain("if: always() && steps.voice.outputs.more == 'true'");
    expect(wf).toMatch(/if \[ "\$AFTER_FAILURE" = "true" \]; then sleep 600; fi/);
    expect(wf).toContain('gh workflow run pulsern-read-aloud.yml --ref main');
    expect(wf).toMatch(/permissions:\s*\n\s*contents: read\s*\n\s*actions: write/);
    expect(wf).not.toMatch(/contents: write|id-token|pull-requests: write/);
  });
});

describe("every part that can be read has something highlighted on screen", () => {
  /* A part refused by the voice check is shown, not voiced ("read this part
     on screen"), so every part id a script can produce must map to a
     highlighted element for its reader in App.jsx. */
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
