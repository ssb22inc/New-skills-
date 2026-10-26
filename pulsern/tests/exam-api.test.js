/* /api/exam against an in-memory database: the server, not the browser,
   decides who may sit an exam, never shows a form twice, never sends an
   answer before the exam is scored, and scores each attempt once. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { fakeSupabase, fakeRes } from "./helpers/fake-supabase.js";
import { buildSequence, publicItem, gradeResponses, itemsByKey, FULL_STANDALONE, FULL_CASES } from "../src/exam-core.js";

let db;
vi.mock("@supabase/supabase-js", () => ({ createClient: () => db }));

const future = new Date(Date.now() + 30 * 86400_000).toISOString();
const past = new Date(Date.now() - 86400_000).toISOString();
const CATS = ["Pharmacology", "Safety"];

function formRows(form, nItems, nCases, idBase) {
  const questions = Array.from({ length: nItems }, (_, i) => {
    const id = idBase + i;
    return {
      id, cat: CATS[i % 2], diff: 2, type: "mc", stem: `Exam ${form} item ${id} stem text`,
      options: ["a", "b", "c", "d"], extra: null, answer: id % 4, rationale: `Because ${id}`,
      approved: true, rejected_at: null, exam_form: form,
    };
  });
  const cases = Array.from({ length: nCases }, (_, i) => ({
    id: idBase + i, cat: "Safety", title: `Case ${form}-${i}`, intro: "intro", vitals: [["HR", "90"]], labs: [], note: "note",
    steps: Array.from({ length: 6 }, (_, s) => ({ phase: `P${s}`, type: "mc", stem: `Case step ${s}`, options: ["w", "x", "y", "z"], answer: 1, rationale: `Step ${s} rationale` })),
    approved: true, rejected_at: null, exam_form: form,
  }));
  return { questions, cases };
}

function seed() {
  const f1 = formRows(1, 67, 5, 1000), f2 = formRows(2, 67, 5, 2000), f3 = formRows(3, 10, 1, 3000);
  const practice = { id: 1, cat: "Safety", diff: 1, type: "mc", stem: "practice", options: ["a", "b", "c"], answer: 0, rationale: "r", approved: true, rejected_at: null, exam_form: null };
  return {
    questions: [practice, ...f1.questions, ...f2.questions, ...f3.questions],
    case_studies: [...f1.cases, ...f2.cases, ...f3.cases],
    reviewers: [{ user_id: "u-owner" }],
    subscriptions: [
      { user_id: "u-paid", plan: "sub60", starts_at: past, expires_at: future, exams_granted: 2 },
      { user_id: "u-one", plan: "sub30", starts_at: past, expires_at: future, exams_granted: 1 },
      { user_id: "u-trial", plan: "pass1", starts_at: past, expires_at: future, exams_granted: 0 },
      { user_id: "u-expired", plan: "sub30", starts_at: past, expires_at: past, exams_granted: 1 },
      { user_id: "u-spent", plan: "sub30", starts_at: past, expires_at: future, exams_granted: 1 },
      { user_id: "u-other", plan: "sub60", starts_at: past, expires_at: future, exams_granted: 2 },
    ],
    exam_attempts: [{ id: randomUUID(), user_id: "u-spent", form: 7, started_at: past, items: null }],
  };
}

const USERS = Object.fromEntries(["paid", "one", "trial", "expired", "spent", "other", "none", "owner"].map((n) => [`t-${n}`, { id: `u-${n}` }]));

beforeEach(() => {
  process.env.SUPABASE_URL = "http://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-for-tests";
  db = fakeSupabase(seed(), {
    users: USERS,
    unique: { exam_attempts: [["user_id", "form"]] },
    defaults: { exam_attempts: () => ({ id: randomUUID(), started_at: new Date().toISOString(), submitted_at: null }) },
  });
});

const call = async (token, body, method = "POST") => {
  const { default: handler } = await import("../api/exam.js");
  const res = fakeRes();
  await handler({ method, headers: token ? { authorization: `Bearer ${token}` } : {}, body }, res);
  return res;
};
const attemptsOf = (uid) => db.from("exam_attempts").eq("user_id", uid).then((r) => r.data);

/* the right answer for every served key, from the seed's rule */
const rightAnswers = (sequence) => sequence.map((e) => ({ key: e.key, sel: [e.key.startsWith("q:") ? Number(e.key.slice(2)) % 4 : 1], order: [] }));
const wrong = (r) => ({ ...r, sel: [(r.sel[0] + 1) % 4] });

describe("authentication", () => {
  it("refuses a request with no token", async () => {
    const res = await call(null, { action: "start", form: 1 });
    expect(res.code).toBe(401);
  });
  it("refuses a token Supabase does not recognize", async () => {
    const res = await call("forged", { action: "start", form: 1 });
    expect(res.code).toBe(401);
    expect(await attemptsOf("u-paid")).toHaveLength(0);
  });
  it("is POST only", async () => {
    expect((await call("t-paid", {}, "GET")).code).toBe(405);
  });
});

describe("start: entitlement and credits are checked on the server", () => {
  it("refuses an account with no subscription", async () => {
    const res = await call("t-none", { action: "start", form: 1 });
    expect(res.code).toBe(403);
    expect(await attemptsOf("u-none")).toHaveLength(0);
  });
  it("refuses the free pass (study content only, no exams)", async () => {
    const res = await call("t-trial", { action: "start", form: 1 });
    expect(res.code).toBe(403);
    expect(res.body.code).toBe("no-subscription");
    expect(await attemptsOf("u-trial")).toHaveLength(0);
  });
  it("refuses an expired subscription", async () => {
    expect((await call("t-expired", { action: "start", form: 1 })).code).toBe(403);
  });
  it("refuses an account whose credits are all spent", async () => {
    const res = await call("t-spent", { action: "start", form: 1 });
    expect(res.code).toBe(403);
    expect(res.body.code).toBe("no-credits");
    expect(await attemptsOf("u-spent")).toHaveLength(1);
  });
  it("spends exactly one credit per form", async () => {
    expect((await call("t-one", { action: "start", form: 1 })).code).toBe(200);
    const res = await call("t-one", { action: "start", form: 2 });
    expect(res.code).toBe(403);
    expect(res.body.code).toBe("no-credits");
    expect((await attemptsOf("u-one")).map((a) => a.form)).toEqual([1]);
  });
  it("rejects a form number outside 1-10", async () => {
    expect((await call("t-paid", { action: "start", form: 11 })).code).toBe(400);
    expect((await call("t-paid", { action: "start", form: "x" })).code).toBe(400);
  });
  it("never burns an attempt on a form that is not complete", async () => {
    const res = await call("t-paid", { action: "start", form: 3 });
    expect(res.code).toBe(409);
    expect(res.body.code).toBe("not-ready");
    expect(await attemptsOf("u-paid")).toHaveLength(0);
  });
});

describe("start: what the student receives", () => {
  it("returns a full 85-item exam with no answer or rationale anywhere", async () => {
    const res = await call("t-paid", { action: "start", form: 1 });
    expect(res.code).toBe(200);
    expect(res.body.sequence).toHaveLength(FULL_STANDALONE + FULL_CASES * 6);
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/"answer"/);
    expect(text).not.toMatch(/"rationale"/);
    expect(text).not.toMatch(/Because \d+|Step \d rationale/);
    expect(res.body.sequence.filter((e) => e.caseInfo)).toHaveLength(30);
    expect(res.body.attemptId).toEqual(expect.any(String));
  });
  it("records the attempt server-side, with the served keys in order", async () => {
    const res = await call("t-paid", { action: "start", form: 1 });
    const [att] = await attemptsOf("u-paid");
    expect(att.form).toBe(1);
    expect(att.id).toBe(res.body.attemptId);
    expect(att.items).toEqual(res.body.sequence.map((e) => e.key));
  });
  it("never shows the same form twice (never-repeat)", async () => {
    expect((await call("t-paid", { action: "start", form: 1 })).code).toBe(200);
    const again = await call("t-paid", { action: "start", form: 1 });
    expect(again.code).toBe(409);
    expect(again.body.code).toBe("already-taken");
    expect(again.body.sequence).toBeUndefined();
    expect(await attemptsOf("u-paid")).toHaveLength(1);
  });
  it("fails closed, without sending items, when the attempt cannot be written for another reason", async () => {
    const realFrom = db.from;
    db.from = (t) => {
      const b = realFrom(t);
      if (t === "exam_attempts") b.insert = () => ({ select: () => ({ single: async () => ({ data: null, error: { code: "42703", message: "column items does not exist" } }) }) });
      return b;
    };
    const res = await call("t-paid", { action: "start", form: 1 });
    db.from = realFrom;
    expect(res.code).toBe(503);
    expect(res.body.sequence).toBeUndefined();
    expect(await attemptsOf("u-paid")).toHaveLength(0);
  });
  it("the database key alone also blocks a repeat that slipped past the check", async () => {
    await call("t-paid", { action: "start", form: 1 });
    const { error } = await db.from("exam_attempts").insert({ user_id: "u-paid", form: 1 });
    expect(error.code).toBe("23505");
  });
});

describe("submit: graded on the server, once, by the owner of the attempt", () => {
  const startPaid = async () => (await call("t-paid", { action: "start", form: 1 })).body;

  it("grades every answer correct as 100% and only now reveals answers and rationales", async () => {
    const exam = await startPaid();
    const res = await call("t-paid", { action: "submit", attemptId: exam.attemptId, responses: rightAnswers(exam.sequence) });
    expect(res.code).toBe(200);
    expect(res.body).toMatchObject({ correct: 85, total: 85, pct: 100, verdict: "HIGH", incomplete: false });
    expect(res.body.graded).toHaveLength(85);
    expect(res.body.graded.every((g) => g.ok && g.q.answer !== undefined && typeof g.q.rationale === "string")).toBe(true);
    const [att] = await attemptsOf("u-paid");
    expect(att.submitted_at).toEqual(expect.any(String));
    expect(att.correct).toBe(85);
    expect(att.total).toBe(85);
    expect(att.result.pct).toBe(100);
  });

  it("grades a mix exactly, and an early end scores only what was answered", async () => {
    const exam = await startPaid();
    const answers = rightAnswers(exam.sequence).slice(0, 40).map((r, i) => (i % 4 === 0 ? wrong(r) : r));
    const res = await call("t-paid", { action: "submit", attemptId: exam.attemptId, responses: answers });
    expect(res.body).toMatchObject({ correct: 30, total: 40, pct: 75, incomplete: true });
    expect(res.body.graded.filter((g) => !g.ok)).toHaveLength(10);
  });

  it("ignores keys that were never served and counts a repeated key once", async () => {
    const exam = await startPaid();
    const first = rightAnswers(exam.sequence)[0];
    const res = await call("t-paid", { action: "submit", attemptId: exam.attemptId, responses: [first, wrong(first), { key: "q:1", sel: [0] }, { key: "q:2000", sel: [0] }] });
    expect(res.body).toMatchObject({ correct: 1, total: 1 });
  });

  it("refuses a second submit of the same attempt", async () => {
    const exam = await startPaid();
    expect((await call("t-paid", { action: "submit", attemptId: exam.attemptId, responses: rightAnswers(exam.sequence) })).code).toBe(200);
    const again = await call("t-paid", { action: "submit", attemptId: exam.attemptId, responses: [] });
    expect(again.code).toBe(409);
    expect(again.body.code).toBe("already-submitted");
    expect(again.body.graded).toBeUndefined();
    expect((await attemptsOf("u-paid"))[0].correct).toBe(85);
  });

  it("refuses someone else's attempt and leaves it untouched", async () => {
    const exam = await startPaid();
    const res = await call("t-other", { action: "submit", attemptId: exam.attemptId, responses: rightAnswers(exam.sequence) });
    expect(res.code).toBe(403);
    expect(res.body.graded).toBeUndefined();
    expect((await attemptsOf("u-paid"))[0].submitted_at).toBeNull();
  });

  it("refuses an unknown attempt id and a missing one", async () => {
    expect((await call("t-paid", { action: "submit", attemptId: randomUUID(), responses: [] })).code).toBe(404);
    expect((await call("t-paid", { action: "submit", responses: [] })).code).toBe(400);
  });

  it("refuses an attempt started before server scoring", async () => {
    const [legacy] = await attemptsOf("u-spent");
    const res = await call("t-spent", { action: "submit", attemptId: legacy.id, responses: [] });
    expect(res.code).toBe(409);
    expect(res.body.code).toBe("legacy-attempt");
  });
});

describe("owner dev access", () => {
  it("opens any complete form with no subscription, burns nothing, and grades directly", async () => {
    const start = await call("t-owner", { action: "start", form: 2 });
    expect(start.code).toBe(200);
    expect(start.body.attemptId).toBeNull();
    expect(JSON.stringify(start.body)).not.toMatch(/"answer"/);
    expect(await attemptsOf("u-owner")).toHaveLength(0);
    const again = await call("t-owner", { action: "start", form: 2 });
    expect(again.code).toBe(200);
    const keys = start.body.sequence.map((e) => e.key);
    const res = await call("t-owner", { action: "submit", form: 2, keys, responses: rightAnswers(start.body.sequence) });
    expect(res.body).toMatchObject({ correct: 85, total: 85, pct: 100 });
  });
  it("a student cannot use the owner's attempt-less grading path", async () => {
    const res = await call("t-paid", { action: "submit", form: 1, keys: ["q:1000"], responses: [{ key: "q:1000", sel: [0] }] });
    expect(res.code).toBe(400);
    expect(res.body.graded).toBeUndefined();
  });
});

describe("status", () => {
  it("returns per-form counts only", async () => {
    const res = await call("t-trial", { action: "status" });
    expect(res.code).toBe(200);
    expect(res.body.availability[1]).toEqual({ items: 67, cases: 5 });
    expect(res.body.availability[3]).toEqual({ items: 10, cases: 1 });
    expect(res.body.availability[4]).toEqual({ items: 0, cases: 0 });
    expect(JSON.stringify(res.body)).not.toMatch(/stem|answer|rationale/);
  });
  it("needs a signed-in user", async () => {
    expect((await call(null, { action: "status" })).code).toBe(401);
  });
});

describe("exam-core", () => {
  it("strips answers from the NGN payload too", () => {
    const q = { id: 1, type: "calc", stem: "s", answer: 5, rationale: "r", extra: { unit: "mL", tolerance: 0, answer: 5, rationale: "r" } };
    expect(publicItem(q)).toEqual({ id: 1, type: "calc", stem: "s", extra: { unit: "mL", tolerance: 0 } });
    expect(q.answer).toBe(5); // the original is not mutated
  });
  it("builds the same layout as before: 55 standalone with 5 six-step cases spliced in", () => {
    const { questions, cases } = formRows(1, 67, 5, 1000);
    let n = 0;
    const seq = buildSequence(questions, cases, () => ((n = (n * 9301 + 49297) % 233280) / 233280));
    expect(seq).toHaveLength(85);
    expect(new Set(seq.map((e) => e.key)).size).toBe(85);
    const steps = seq.map((e, i) => (e.caseInfo ? i : -1)).filter((i) => i >= 0);
    expect(steps).toHaveLength(30);
    expect(seq[steps[0]].caseInfo.step).toBe(1);
  });
  it("grades by served key with the shared scorers", () => {
    const { questions, cases } = formRows(1, 67, 5, 1000);
    const byKey = itemsByKey(questions, cases);
    const g = gradeResponses(["q:1000", "c:1000:0"], byKey, [{ key: "q:1000", sel: [0] }, { key: "c:1000:0", sel: [2] }]);
    expect(g).toMatchObject({ correct: 1, total: 2, pct: 50, verdict: "BELOW" });
  });
});
