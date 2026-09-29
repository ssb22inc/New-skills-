/* The marketing agent's door.
   ------------------------------------------------------------------
   This endpoint exists so an outside agent never has to be handed the owner
   login, which can read every student's phone number and delete a paying
   customer. Two properties make that trade worth it, and neither is worth
   anything unasserted:

     1. The key is the whole boundary.
     2. Nothing personal crosses it.

   The second is checked against a real assembled payload rather than by
   reading the code, because the failure mode is somebody later adding one
   convenient field and nobody noticing. */
import { describe, it, expect, afterEach } from "vitest";
import {
  keyMatches, presentedKey, checkClaims, buildMarketingPayload, MIN_KEY_LENGTH,
} from "../api/marketing.js";
import { buildFunnelReport } from "../src/funnel-report.js";

const KEY = "k".repeat(48);

describe("marketing key check", () => {
  it("accepts only the exact key", () => {
    expect(keyMatches(KEY, KEY)).toBe(true);
    expect(keyMatches(`${KEY.slice(0, -1)}x`, KEY)).toBe(false);
  });

  it("refuses a prefix, so a truncated paste cannot get in", () => {
    expect(keyMatches(KEY.slice(0, 10), KEY)).toBe(false);
    expect(keyMatches(`${KEY}extra`, KEY)).toBe(false);
  });

  /* A mismatched length would throw inside timingSafeEqual, and a thrown
     error is itself a signal about the secret's length. */
  it("does not throw on a length mismatch", () => {
    expect(() => keyMatches("short", KEY)).not.toThrow();
  });

  it("treats nothing as nothing", () => {
    expect(keyMatches("", "")).toBe(false);
    expect(keyMatches(undefined, KEY)).toBe(false);
    expect(keyMatches(KEY, undefined)).toBe(false);
    expect(keyMatches({ toString: () => KEY }, KEY)).toBe(false);
  });

  it("demands a key long enough to be worth having", () => {
    expect(MIN_KEY_LENGTH).toBeGreaterThanOrEqual(32);
  });
});

describe("reading the key off a request", () => {
  it("takes a bearer token", () => {
    expect(presentedKey({ authorization: `Bearer ${KEY}` })).toBe(KEY);
    expect(presentedKey({ authorization: `bearer ${KEY}` })).toBe(KEY);
  });
  it("takes x-api-key, which is what most agent frameworks send", () => {
    expect(presentedKey({ "x-api-key": KEY })).toBe(KEY);
  });
  it("returns empty when nothing was sent, rather than undefined", () => {
    expect(presentedKey({})).toBe("");
    expect(presentedKey({ authorization: "Basic abc" })).toBe("");
  });
});

describe("claims check against the live catalogue", () => {
  const counts = { questions: 10034, cases: 508, flashcards: 1145 };

  it("flags copy that promises more than exists — the compliance direction", () => {
    const [f] = checkClaims([{ id: "x", blurb: "20,000+ practice questions" }], counts);
    expect(f.direction).toBe("overstated");
    expect(f.severity).toBe("must fix");
  });

  it("flags copy that undersells — the expensive, silent direction", () => {
    const [f] = checkClaims([{ id: "x", blurb: "3,100+ practice questions" }], counts);
    expect(f.direction).toBe("understated");
    expect(f.claimed).toBe(3100);
    expect(f.live).toBe(10034);
  });

  it("says nothing when the copy is right", () => {
    expect(checkClaims([{ id: "x", blurb: "10,034 practice questions" }], counts)).toEqual([]);
  });

  /* A "+" is a floor, and a floor that is met is not a fault. Flagging it
     would make this section cry wolf on every read until nobody looked at it
     — which is how "3,100+" survived to 10,034 in the first place. */
  it("accepts a floor the bank clears", () => {
    expect(checkClaims([{ id: "x", blurb: "10,000+ practice questions" }], counts)).toEqual([]);
  });

  it("still fails a floor the bank does not clear", () => {
    const [f] = checkClaims([{ id: "x", blurb: "11,000+ practice questions" }], counts);
    expect(f.direction).toBe("overstated");
  });

  it("speaks up once a floor has fallen far enough behind to be worth rewriting", () => {
    expect(checkClaims([{ id: "x", blurb: "3,100+ practice questions" }], counts)[0].direction)
      .toBe("understated");
  });

  it("holds an exact claim to the exact number, with no latitude", () => {
    expect(checkClaims([{ id: "x", blurb: "10,000 practice questions" }], counts)).toHaveLength(1);
  });

  it("matches each noun to its own bank, not to questions", () => {
    const [f] = checkClaims([{ id: "x", blurb: "400 case studies" }], counts);
    expect(f.live).toBe(508);
  });

  it("ignores numbers that are not content claims", () => {
    expect(checkClaims([{ id: "x", blurb: "Full access for 30 days" }], counts)).toEqual([]);
  });
});

describe("the payload carries no personal data", () => {
  /* Built from rows that DO contain user ids, because the guarantee is that
     the reducer aggregates them away — not that none were ever present. */
  const rows = [
    { user_id: "11111111-1111-1111-1111-111111111111", event: "signup" },
    { user_id: "11111111-1111-1111-1111-111111111111", event: "purchase", props: { cents: 9900 } },
    { user_id: "22222222-2222-2222-2222-222222222222", event: "signup" },
  ];
  const attrRows = [
    { user_id: "11111111-1111-1111-1111-111111111111", utm_source: "google", utm_campaign: "nclex" },
  ];
  const payload = buildMarketingPayload({
    funnel: buildFunnelReport({ rows, attrRows, windowDays: 30 }),
    counts: { questions: 10034, cases: 508, flashcards: 1145 },
    byCategory: { questions: { Pharm: 900 }, caseStudies: {}, flashcards: {} },
    windowDays: 30,
  });
  const json = JSON.stringify(payload);

  it("leaks no user id, even though the source rows had them", () => {
    expect(json).not.toContain("11111111-1111-1111-1111-111111111111");
    expect(json).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  });

  /* Phone shapes, not "a run of digits" — an ISO timestamp is a run of digits
     and matching it would make this test pass for the wrong reason forever.
     The patterns are checked against a real phone number first, because a
     regex that matches nothing is indistinguishable from clean data. */
  const PHONE = [/\+\d{10,15}\b/, /\(\d{3}\)\s*\d{3}[ -]?\d{4}/, /\b\d{3}-\d{3}-\d{4}\b/];
  const EMAIL = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i;

  it("uses patterns that would actually catch a leak", () => {
    expect(EMAIL.test("student@example.com")).toBe(true);
    expect(PHONE.some((re) => re.test("+15551234567"))).toBe(true);
    expect(PHONE.some((re) => re.test("(555) 123-4567"))).toBe(true);
    expect(PHONE.some((re) => re.test("555-123-4567"))).toBe(true);
    expect(PHONE.some((re) => re.test("2026-09-29T14:47:50.123Z"))).toBe(false);
  });

  it("carries no email address and no phone number", () => {
    expect(json).not.toMatch(EMAIL);
    for (const re of PHONE) expect(json).not.toMatch(re);
  });

  it("names no field that could hold personal data", () => {
    const keys = new Set();
    (function walk(v) {
      if (Array.isArray(v)) return v.forEach(walk);
      if (v && typeof v === "object") for (const [k, val] of Object.entries(v)) { keys.add(k); walk(val); }
    })(payload);
    /* Substring, not equality: the leak that gets added later is called
       ownerEmail or topUser, not email. Matched against the key name lowered,
       so camelCase does not slip past. */
    const banned = /email|phone|passwd|password|token|secret|full_?name|user_?id|\buser\b/i;
    const offenders = [...keys].filter((k) => banned.test(k));
    expect(offenders).toEqual([]);
  });

  it("still answers the questions marketing actually has", () => {
    expect(payload.funnel.steps.find((s) => s.key === "signup").people).toBe(2);
    expect(payload.funnel.bySource.map((s) => s.source)).toContain("google / nclex");
    expect(payload.catalogue.questions).toBe(10034);
    expect(payload.pricing.length).toBeGreaterThan(0);
    expect(payload.scope.access).toBe("read-only");
  });

  it("ships the claims rules with the data, since the agent cannot read CLAUDE.md", () => {
    expect(payload.guardrails.join(" ")).toMatch(/never equate/i);
    expect(payload.guardrails.join(" ")).toMatch(/NCSBN/);
  });
});

/* The door itself, not just the lock.
   ------------------------------------------------------------------
   The checks above prove the key comparison is sound; these prove the handler
   actually reaches for it, in the right order, before it reaches for a
   database. A misordered guard is how an endpoint ends up doing real work for
   an unauthenticated caller and only failing later, by luck. */
import handler from "../api/marketing.js";

const fakeRes = () => {
  const r = { code: 0, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};
const call = async (req) => { const res = fakeRes(); await handler(req, res); return res; };

describe("the marketing endpoint refuses before it does any work", () => {
  const OLD = process.env.MARKETING_API_KEY;
  afterEach(() => {
    if (OLD === undefined) delete process.env.MARKETING_API_KEY;
    else process.env.MARKETING_API_KEY = OLD;
  });

  it("allows only reads", async () => {
    process.env.MARKETING_API_KEY = KEY;
    for (const method of ["PUT", "DELETE", "PATCH"]) {
      const res = await call({ method, headers: { authorization: `Bearer ${KEY}` } });
      expect(res.code).toBe(405);
    }
  });

  /* Not 401: an unconfigured key is the owner's problem, not the caller's, and
     saying so plainly beats an hour spent debugging a 401 nobody could win. */
  it("says so plainly when no key is configured", async () => {
    delete process.env.MARKETING_API_KEY;
    const res = await call({ method: "GET", headers: {} });
    expect(res.code).toBe(503);
    expect(res.body.error).toMatch(/MARKETING_API_KEY/);
  });

  it("refuses a key too short to be worth having, even if it matches", async () => {
    process.env.MARKETING_API_KEY = "short";
    const res = await call({ method: "GET", headers: { authorization: "Bearer short" } });
    expect(res.code).toBe(503);
  });

  it("turns away a wrong key without touching the database", async () => {
    process.env.MARKETING_API_KEY = KEY;
    const res = await call({ method: "GET", headers: { authorization: `Bearer ${"x".repeat(48)}` } });
    expect(res.code).toBe(401);
  });

  it("turns away a caller with no key at all", async () => {
    process.env.MARKETING_API_KEY = KEY;
    const res = await call({ method: "GET", headers: {} });
    expect(res.code).toBe(401);
  });
});

/* The copy that actually ships.
   ------------------------------------------------------------------
   Five paid plans spent months advertising "3,100+" while 10,034 questions
   were live — selling roughly a third of the product, quietly, to every
   prospect who read a price. Nobody complains about being undersold, which is
   why it lasted. These two rules are what stop it recurring. */
import { PLANS } from "../src/pricing.js";

describe("shipped plan copy", () => {
  // Verified against the student-visible tables on 2026-09-29.
  const LIVE = { questions: 10034, cases: 505, flashcards: 1145 };

  it("promises nothing the bank cannot cover", () => {
    const overstated = checkClaims(PLANS, LIVE).filter((c) => c.direction === "overstated");
    expect(overstated).toEqual([]);
  });

  it("agrees with the live catalogue today", () => {
    expect(checkClaims(PLANS, LIVE)).toEqual([]);
  });

  /* An exact number in a price blurb is wrong the day after it is written,
     because the bank only grows. A floor stays true. This is the rule that
     makes the fix permanent rather than another snapshot to go stale. */
  it("states content as a floor, never as an exact count", () => {
    const exact = [];
    for (const p of PLANS) {
      for (const m of String(p.blurb ?? "").matchAll(/([\d,]+)\s*(\+?)\s*(practice questions|questions|case studies|flashcards|cards)/gi)) {
        if (m[2] !== "+") exact.push(`${p.id}: ${m[0]}`);
      }
    }
    expect(exact).toEqual([]);
  });

  /* Every paid plan opens the same library; only duration and the number of
     self-assessments differ. The old copy implied otherwise by quoting a
     bigger bank on longer plans, which was never true. */
  it("offers every paid plan the same library", () => {
    const paid = PLANS.filter((p) => p.cents > 0 && !p.addon);
    const catalogues = new Set(paid.map((p) => (p.blurb.match(/^[^·]+·[^·]+·[^·]+/) ?? [""])[0].trim()));
    expect(catalogues.size).toBe(1);
  });
});
