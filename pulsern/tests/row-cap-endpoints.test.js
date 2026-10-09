/* The real handlers against a database that caps silently at 1,000 rows.
   ------------------------------------------------------------------
   Unit tests of readAll() prove the helper; these prove the ENDPOINTS use it.
   The fake enforces PostgREST's cap on any unranged select, so a handler that
   reintroduces a plain select fails here with exactly the symptom the
   competitive report found: a breakdown summing to 1,000. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeSupabase, fakeRes, SERVER_MAX } from "./helpers/fake-supabase.js";

let db;
vi.mock("@supabase/supabase-js", () => ({ createClient: () => db }));

const CATS = ["Pharmacology", "Management of Care", "Safety", "Physiological Adaptation"];
const many = (n, make) => Array.from({ length: n }, (_, i) => make(i));
const now = Date.now();
const iso = (daysAgo) => new Date(now - daysAgo * 86400_000).toISOString();

function seed() {
  return {
    questions: [
      ...many(10_034, (i) => ({ id: i + 1, cat: CATS[i % 4], approved: true, exam_form: null })),
      ...many(850, (i) => ({ id: 20_000 + i, cat: CATS[i % 4], approved: true, exam_form: (i % 10) + 1 })),
    ],
    case_studies: many(505, (i) => ({ id: i + 1, cat: CATS[i % 4], approved: true, exam_form: null })),
    flashcards: many(1_145, (i) => ({ id: i + 1, cat: CATS[i % 4], approved: true })),
    // 1,600 signups in the window: more than the cap.
    funnel_events: many(1_600, (i) => ({ id: i + 1, event: "signup", user_id: `u${i}`, occurred_at: iso(i % 20), props: {} })),
    user_attribution: many(1_600, (i) => ({ user_id: `u${i}`, utm_source: i % 2 ? "google" : null, utm_campaign: null, referrer: null })),
    reviewers: [{ user_id: "owner" }],
  };
}

describe("/api/marketing reads every row", () => {
  beforeEach(() => {
    db = fakeSupabase(seed());
    process.env.MARKETING_API_KEY = "k".repeat(48);
  });

  const call = async () => {
    const { default: handler } = await import("../api/marketing.js");
    const res = fakeRes();
    await handler({ method: "GET", headers: { authorization: `Bearer ${"k".repeat(48)}` }, query: { days: "30" } }, res);
    return res;
  };

  it("the fake really does cap an unranged read, or this test proves nothing", async () => {
    const { data } = await db.from("questions").select("id, cat");
    expect(data).toHaveLength(SERVER_MAX);
  });

  it("returns a category breakdown that adds up to the whole bank, not 1,000", async () => {
    const res = await call();
    expect(res.code).toBe(200);
    const sum = Object.values(res.body.catalogue.byCategory.questions).reduce((a, b) => a + b, 0);
    expect(sum).toBe(10_034);
    expect(res.body.catalogue.byCategory.reconciled.questions).toEqual({ sum: 10_034, expected: 10_034, ok: true });
    expect(res.body.catalogue.byCategory.reconciled.flashcards.ok).toBe(true);
  });

  it("keeps exam-form items out of the practice breakdown", async () => {
    const res = await call();
    expect(res.body.catalogue.questions).toBe(10_034); // not 10,884
  });

  it("counts every signup in the funnel when there are more than 1,000", async () => {
    const res = await call();
    expect(res.body.funnel.steps.find((s) => s.key === "signup").people).toBe(1_600);
  });
});

describe("/api/funnel reads every row", () => {
  beforeEach(() => {
    db = fakeSupabase(seed(), { users: { tok: { id: "owner" } } });
  });

  it("counts every signup when events exceed the cap", async () => {
    const { default: handler } = await import("../api/funnel.js");
    const res = fakeRes();
    await handler({ method: "POST", body: { token: "tok", days: 30 } }, res);
    expect(res.code).toBe(200);
    expect(res.body.steps.find((s) => s.key === "signup").people).toBe(1_600);
    const bySource = res.body.bySource.reduce((n, r) => n + r.signup, 0);
    expect(bySource).toBe(1_600);
  });
});
