/* A read-only door for the marketing agent. Never public, never the owner key.
   ------------------------------------------------------------------
   WHY THIS EXISTS AT ALL

   Owner access on this site is one all-or-nothing gate — membership in the
   reviewers table — and it opens /api/users, which can read every student's
   email, phone number and SMS consent, comp subscriptions, send password
   resets, and permanently delete a paying customer. A marketing agent needs
   none of that to decide where to spend money, so handing it the owner login
   would be trading a real breach risk for convenience.

   This endpoint is the narrow alternative. It is:

     READ-ONLY BY CONSTRUCTION. There is no write path in this file. Not a
     disabled one, not a guarded one — none. An agent that is compromised, or
     simply confused by something it read on the internet, cannot change,
     grant, email or delete anything through here.

     FREE OF PERSONAL DATA BY CONSTRUCTION. It never touches profiles, never
     touches auth.users, never returns a user id. Every figure is a count or a
     rate. The tests assert this on the actual payload, because "we were
     careful" is not a control.

   WHAT IT CARRIES, AND WHY EACH PART

     funnel     — signups through to sales, by step and by first-touch source.
                  The only honest basis for an ad decision.
     catalogue  — how much content is actually live, by category. An agent
                  writing copy must get the number from the database, not from
                  last quarter's landing page.
     pricing    — the live plans. Same reason.
     claims     — where the shipped copy and the live database DISAGREE. This
                  is the part a human would otherwise never notice.
     guardrails — the claims-hygiene rules from CLAUDE.md, delivered with the
                  data rather than left in a repo the agent cannot read.

   AUTH

   One shared secret in MARKETING_API_KEY, sent as `Authorization: Bearer <key>`
   or `x-api-key: <key>`. Compared in constant time. Rotating it is a one-line
   change in Vercel and instantly revokes the agent — which is the other reason
   not to reuse the owner login: you cannot revoke that without locking out the
   owner. */
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { buildFunnelReport, windowFromDays, sinceFor } from "../src/funnel-report.js";
import { readAll, tallyBy, reconcile } from "../src/read-all.js";
import { PLANS, fmtUsd } from "../src/pricing.js";

const admin = () =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

const SITE = (process.env.SITE_URL || "https://www.pulsern.app").replace(/\/$/, "");

/* Short keys are the ones that get guessed, and a key pasted into an agent
   config is never rotated as often as it should be. Refusing a weak one at
   the door is cheaper than discovering it was weak. */
export const MIN_KEY_LENGTH = 32;

/* Constant time, and only after the lengths match — comparing buffers of
   different lengths throws, and the throw itself would leak the length. */
export function keyMatches(presented, secret) {
  if (typeof presented !== "string" || typeof secret !== "string") return false;
  if (!presented || !secret) return false;
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function presentedKey(headers = {}) {
  const auth = headers.authorization || headers.Authorization || "";
  const bearer = /^Bearer\s+(.+)$/i.exec(String(auth))?.[1];
  return (bearer || headers["x-api-key"] || headers["X-Api-Key"] || "").toString().trim();
}

/* Where the shipped copy and the live database disagree.
   ------------------------------------------------------------------
   Plan blurbs carry hard numbers ("3,100+ practice questions"). Content grows;
   the blurbs do not. Both directions are faults worth naming, and they are not
   the same fault:

     OVERSTATED is a claims problem. We would be promising content that is not
     there, which is the one thing the claims-hygiene rule in CLAUDE.md exists
     to prevent.

     UNDERSTATED is a money problem. It is quiet, nobody complains, and it
     sells the product as a third of what it is.

   A "+" changes what the copy promised. "10,000+" with 10,034 live is simply
   true, and flagging it would make this section cry wolf on every read until
   nobody looks at it — which is how the 3,100+ blurbs survived to 10,034 in
   the first place. So a floor claim is only reported when it is actually
   wrong (fewer live than promised) or when it has fallen far enough behind
   that a materially better number is sitting there unused. An exact claim has
   no such latitude: it is either right or it is not. */
export const FLOOR_SLACK = 1.25;

export function checkClaims(plans, counts) {
  const out = [];
  for (const p of plans) {
    for (const m of String(p.blurb ?? "").matchAll(/([\d,]+)\s*(\+?)\s*(practice questions|questions|case studies|flashcards|cards)/gi)) {
      const claimed = Number(m[1].replace(/,/g, ""));
      if (!Number.isFinite(claimed) || claimed === 0) continue;
      const isFloor = m[2] === "+";
      const noun = m[3].toLowerCase();
      const live = /case/.test(noun) ? counts.cases
        : /card|flashcard/.test(noun) ? counts.flashcards
        : counts.questions;
      if (live == null) continue;
      if (isFloor) {
        // Promised "at least N": true whenever live >= N, and worth raising
        // only once the gap is big enough to be worth rewriting copy for.
        if (live >= claimed && live < claimed * FLOOR_SLACK) continue;
      } else if (claimed === live) continue;
      out.push({
        where: `plan "${p.id}" blurb`,
        text: m[0],
        claimed,
        live,
        direction: claimed > live ? "overstated" : "understated",
        severity: claimed > live ? "must fix" : "leaving money on the table",
        note: claimed > live
          ? `Promises ${claimed.toLocaleString()} but only ${live.toLocaleString()} are live. Claims hygiene: never promise content that is not there.`
          : `Says ${claimed.toLocaleString()} when ${live.toLocaleString()} are live — the copy sells ${(live / claimed).toFixed(1)}x less product than exists.`,
      });
    }
  }
  return out;
}

/* Assembled separately from the request so the shape can be tested without a
   database, a key, or a network. The no-personal-data guarantee is only worth
   something if it is checked, and this is the thing the tests check. */
export function buildMarketingPayload({ funnel, counts, byCategory, windowDays }) {
  const claims = checkClaims(PLANS, counts);
  return {
    generatedAt: new Date().toISOString(),
    windowDays,
    scope: {
      access: "read-only",
      personalData: "none — this endpoint never reads profiles, accounts or answer logs",
      note: "Every figure below is a count or a rate. No student can be identified from this response.",
    },
    funnel,
    catalogue: {
      questions: counts.questions,
      caseStudies: counts.cases,
      flashcards: counts.flashcards,
      byCategory,
      note: "Approved and live to students. Exam-form items are excluded: they belong to the locked readiness exams and are not part of the practice bank, so quoting them would overstate what a subscriber can actually study.",
    },
    pricing: PLANS.map((p) => ({
      id: p.id, name: p.name, days: p.days, cents: p.cents, usd: fmtUsd(p.cents),
      exams: p.exams, addon: Boolean(p.addon), blurb: p.blurb,
    })),
    claims,
    pages: {
      home: `${SITE}/`,
      pricing: `${SITE}/pricing`,
      compare: `${SITE}/compare`,
      product: `${SITE}/product`,
      howItWorks: `${SITE}/how-it-works`,
      learn: `${SITE}/learn`,
      freeTest: `${SITE}/free-nclex-practice-test`,
      methodology: `${SITE}/methodology`,
      editorialPolicy: `${SITE}/editorial-policy`,
      llmsTxt: `${SITE}/llms.txt`,
      note: "Public pages — fetch them directly, no credential needed. Read them to audit claims against the catalogue figures above.",
    },
    /* The rules live in CLAUDE.md, which an external agent cannot read. An
       agent that does not know them will break them politely and confidently,
       so they travel with the data. */
    guardrails: [
      "Compare, never equate: 'like the real exam', never 'the same as the real exam'.",
      "Readiness is an estimate and is labelled as one. Never promise a pass, a score, or an outcome.",
      "NCLEX is a registered trademark of NCSBN. PulseRN is not affiliated with, and is not endorsed by, NCSBN. The disclaimer stays visible.",
      "Quote content figures from `catalogue` above, never from an older page. If `claims` is non-empty, the shipped copy is already wrong.",
      "Do not name a competitor's price without checking it is current — a stale rival price is both a legal risk and free advertising for them.",
      "Educational exam preparation only. Never real-world dosing or treatment instructions.",
    ],
  };
}

export default async function handler(req, res) {
  /* GET so an agent can simply fetch it; POST accepted because many agent
     frameworks send everything as POST. Nothing else, because nothing else
     could be a read. */
  if (req.method !== "GET" && req.method !== "POST")
    return res.status(405).json({ error: "GET or POST only" });

  const secret = process.env.MARKETING_API_KEY || "";
  /* An unconfigured key is the owner's problem, not the caller's, and saying
     so plainly beats an hour spent debugging a 401 that was never winnable. */
  if (!secret)
    return res.status(503).json({ error: "Marketing access is not configured. Set MARKETING_API_KEY in Vercel." });
  if (secret.length < MIN_KEY_LENGTH)
    return res.status(503).json({ error: `MARKETING_API_KEY is too short to be safe — use at least ${MIN_KEY_LENGTH} characters.` });

  if (!keyMatches(presentedKey(req.headers || {}), secret))
    return res.status(401).json({ error: "Send Authorization: Bearer <MARKETING_API_KEY>" });

  const windowDays = windowFromDays(req.query?.days ?? req.body?.days);
  const since = sinceFor(windowDays);

  try {
    const sb = admin();

    /* Every row-returning read goes through readAll(). A plain select stops
       at 1,000 rows without a word — which is how this breakdown came to sum
       to exactly 1,000 against a bank of 10,034, and how the funnel would
       have started undercounting the day events passed a thousand. */
    const events = () => {
      let q = sb.from("funnel_events").select("id, event, user_id, occurred_at, props").order("id");
      return since ? q.gte("occurred_at", since) : q;
    };

    /* head:true fetches counts without a single row of content — cheaper, and
       it means no question text or student data crosses this boundary even in
       memory. exam_form must be excluded: those items belong to the locked
       readiness exams, and counting them would overstate the practice bank. */
    const live = (table, build) => {
      let c = sb.from(table).select("id", { count: "exact", head: true }).eq("approved", true);
      return (build ? build(c) : c);
    };
    /* Only the category column, ordered for stable paging. */
    const cats = (table, build) => () => {
      let c = sb.from(table).select("id, cat").eq("approved", true).order("id");
      return build ? build(c) : c;
    };
    const practice = (c) => c.is("exam_form", null);

    const [eventRows, attrRows, questions, cases, cards, qCats, cCats, fCats] = await Promise.all([
      readAll(events, { ordered: true }),
      readAll(() => sb.from("user_attribution").select("user_id, utm_source, utm_medium, utm_campaign, referrer").order("user_id"), { ordered: true }),
      live("questions", practice),
      live("case_studies", practice),
      live("flashcards"),
      readAll(cats("questions", practice), { ordered: true }),
      readAll(cats("case_studies", practice), { ordered: true }),
      readAll(cats("flashcards"), { ordered: true }),
    ]);

    for (const r of [questions, cases, cards]) {
      if (r.error) return res.status(502).json({ error: `Could not count the catalogue: ${r.error.message}` });
    }

    const funnel = buildFunnelReport({ rows: eventRows, attrRows, windowDays });

    const counts = {
      questions: questions.count ?? null,
      cases: cases.count ?? null,
      flashcards: cards.count ?? null,
    };

    const byCategory = {
      questions: tallyBy(qCats, "cat"),
      caseStudies: tallyBy(cCats, "cat"),
      flashcards: tallyBy(fCats, "cat"),
    };
    /* The breakdown must add up to its own headline. If rows landed between
       the count and the read, say so instead of quietly disagreeing. */
    byCategory.reconciled = {
      questions: reconcile(byCategory.questions, counts.questions),
      caseStudies: reconcile(byCategory.caseStudies, counts.cases),
      flashcards: reconcile(byCategory.flashcards, counts.flashcards),
    };

    return res.status(200).json(buildMarketingPayload({ funnel, counts, byCategory, windowDays }));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
