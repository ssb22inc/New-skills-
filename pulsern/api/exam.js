// api/exam.js — readiness exams, served and graded on the server.
//
// Readiness-exam items (exam_form 1..10) are not readable from the browser
// at all (migration 018). This endpoint is the only way a student sees one:
//
//   status  -> how complete each form's bank is (counts only, no content)
//   start   -> checks the plan and remaining exam credits HERE (the same
//              computeEntitlement() the app shows), refuses a form the
//              account has already started (never-repeat), writes the
//              permanent exam_attempts row with the service role, and returns
//              the exam WITHOUT answers or rationales
//   submit  -> takes the attempt id and the student's responses, checks the
//              attempt is theirs and not already scored, grades with the
//              shared deterministic scorers, stores the result, and only then
//              returns each item's answer and rationale for the review screen
//
// The owner (reviewers-table member) keeps the old dev exception: every form
// is open, nothing is written to exam_attempts, retakes are allowed.
// The service role key lives only in Vercel env vars (CLAUDE.md rule 2).
import { createClient } from "@supabase/supabase-js";
import { userFromRequest } from "./require-user.js";
import { computeEntitlement } from "../src/pricing.js";
import { readAll } from "../src/read-all.js";
import {
  EXAM_FORMS, EXAM_MINUTES, FULL_STANDALONE, FULL_CASES,
  buildSequence, itemsByKey, publicEntry, gradeResponses,
} from "../src/exam-core.js";

const admin = () =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

const ITEM_COLS = "id, cat, diff, type, stem, options, extra, answer, rationale";
const CASE_COLS = "id, cat, title, intro, vitals, labs, note, steps";
const MAX_RESPONSES = 200;

async function isReviewer(sb, uid) {
  const { data } = await sb.from("reviewers").select("user_id").eq("user_id", uid).maybeSingle();
  return !!data;
}

async function loadEntitlementRows(sb, uid) {
  const [{ data: subs, error: e1 }, { data: attempts, error: e2 }] = await Promise.all([
    sb.from("subscriptions").select("plan, starts_at, expires_at, exams_granted").eq("user_id", uid),
    sb.from("exam_attempts").select("form").eq("user_id", uid),
  ]);
  if (e1 || e2) throw new Error("entitlement read failed");
  return { subs: subs ?? [], attempts: attempts ?? [] };
}

async function loadForm(sb, form) {
  const [{ data: items, error: e1 }, { data: cases, error: e2 }] = await Promise.all([
    sb.from("questions").select(ITEM_COLS)
      .eq("approved", true).is("rejected_at", null).eq("exam_form", form).order("id"),
    sb.from("case_studies").select(CASE_COLS)
      .eq("approved", true).is("rejected_at", null).eq("exam_form", form).order("id"),
  ]);
  if (e1 || e2) throw new Error("exam read failed");
  return { items: items ?? [], cases: cases ?? [] };
}

const validForm = (f) => Number.isInteger(f) && EXAM_FORMS.includes(f);

async function status(sb, res, owner) {
  const [qs, cs] = await Promise.all([
    readAll(() => sb.from("questions").select("id, exam_form")
      .eq("approved", true).is("rejected_at", null).not("exam_form", "is", null).order("id"), { ordered: true }),
    readAll(() => sb.from("case_studies").select("id, exam_form")
      .eq("approved", true).is("rejected_at", null).not("exam_form", "is", null).order("id"), { ordered: true }),
  ]);
  const availability = {};
  for (const f of EXAM_FORMS) availability[f] = { items: 0, cases: 0 };
  for (const r of qs) if (availability[r.exam_form]) availability[r.exam_form].items++;
  for (const r of cs) if (availability[r.exam_form]) availability[r.exam_form].cases++;
  return res.status(200).json({ availability, owner });
}

async function start(sb, res, user, owner, body) {
  const form = Number(body.form);
  if (!validForm(form)) return res.status(400).json({ error: "Pick an exam form from 1 to 10" });

  let rows = null;
  if (!owner) {
    rows = await loadEntitlementRows(sb, user.id);
    const ent = computeEntitlement(rows.subs, rows.attempts);
    if (ent.status !== "active") {
      return res.status(403).json({ error: "Readiness exams come with a subscription", code: "no-subscription" });
    }
    if (ent.attempted.includes(form)) {
      return res.status(409).json({ error: "You have already taken this exam. Exams are never repeated.", code: "already-taken" });
    }
    if (ent.examsLeft <= 0) {
      return res.status(403).json({ error: "No self-assessments remaining on your plan", code: "no-credits" });
    }
  }

  // Check the form is complete BEFORE spending the attempt: a short form
  // must never burn a student's one permanent try at it.
  const { items, cases } = await loadForm(sb, form);
  if (items.length < FULL_STANDALONE || cases.length < FULL_CASES) {
    return res.status(409).json({ error: "This exam is still being built. Check back soon.", code: "not-ready" });
  }

  const sequence = buildSequence(items, cases);
  const keys = sequence.map((e) => e.key);

  let attemptId = null;
  if (!owner) {
    const { data: inserted, error } = await sb.from("exam_attempts")
      .insert({ user_id: user.id, form, items: keys })
      .select("id").single();
    if (error?.code === "23505") {
      // The (user_id, form) primary key is the never-repeat guarantee; a
      // second start of the same form lands here.
      return res.status(409).json({ error: "You have already taken this exam. Exams are never repeated.", code: "already-taken" });
    }
    // Anything else (e.g. migration 018's columns not applied yet) fails
    // closed: no attempt was written, so nothing is burned.
    if (error || !inserted) throw new Error("attempt insert failed");
    attemptId = inserted.id;
    // Two starts at once (two tabs) could both pass the credit check above.
    // Re-count with this attempt included; if the account is now over its
    // grant, withdraw this attempt before a single item has been shown.
    const after = await loadEntitlementRows(sb, user.id);
    const granted = after.subs.reduce((a, r) => a + (r.exams_granted || 0), 0);
    if (after.attempts.length > granted) {
      await sb.from("exam_attempts").delete().eq("id", attemptId).eq("user_id", user.id);
      return res.status(403).json({ error: "No self-assessments remaining on your plan", code: "no-credits" });
    }
  }

  return res.status(200).json({
    attemptId, form, minutes: EXAM_MINUTES,
    sequence: sequence.map(publicEntry),
  });
}

async function submit(sb, res, user, owner, body) {
  const responses = Array.isArray(body.responses) ? body.responses.slice(0, MAX_RESPONSES) : null;
  if (!responses) return res.status(400).json({ error: "Responses are required" });
  const timedOut = body.timedOut === true;

  // Owner dev runs have no attempt row: grade against the form directly.
  if (owner && !body.attemptId) {
    const form = Number(body.form);
    if (!validForm(form)) return res.status(400).json({ error: "Pick an exam form from 1 to 10" });
    const { items, cases } = await loadForm(sb, form);
    const byKey = itemsByKey(items, cases);
    const served = (Array.isArray(body.keys) ? body.keys : responses.map((r) => r?.key))
      .filter((k) => typeof k === "string" && byKey.has(k)).slice(0, MAX_RESPONSES);
    const g = gradeResponses(served, byKey, responses);
    return res.status(200).json({ attemptId: null, form, ...g, timedOut });
  }

  const attemptId = typeof body.attemptId === "string" ? body.attemptId : "";
  if (!attemptId) return res.status(400).json({ error: "Missing attempt" });
  const { data: attempt, error } = await sb.from("exam_attempts")
    .select("id, user_id, form, items, started_at, submitted_at").eq("id", attemptId).maybeSingle();
  if (error) throw new Error("attempt read failed");
  if (!attempt) return res.status(404).json({ error: "Exam attempt not found" });
  if (attempt.user_id !== user.id) return res.status(403).json({ error: "This exam attempt belongs to another account" });
  if (attempt.submitted_at) return res.status(409).json({ error: "This exam has already been scored", code: "already-submitted" });
  if (!Array.isArray(attempt.items) || !attempt.items.length) {
    return res.status(409).json({ error: "This exam was started before server scoring and cannot be scored here", code: "legacy-attempt" });
  }

  const { items, cases } = await loadForm(sb, attempt.form);
  const g = gradeResponses(attempt.items, itemsByKey(items, cases), responses);
  const startedMs = new Date(attempt.started_at).getTime();
  const minutes = Number.isFinite(startedMs)
    ? Math.max(0, Math.round((Date.now() - startedMs) / 60000)) : null;

  // Claim the attempt atomically: the update only matches while
  // submitted_at is still null, so a double submit scores once.
  const { data: claimed, error: upErr } = await sb.from("exam_attempts")
    .update({
      submitted_at: new Date().toISOString(),
      correct: g.correct,
      total: g.total,
      result: {
        pct: g.pct, verdict: g.verdict, byCat: g.byCat, incomplete: g.incomplete,
        timedOut: timedOut || (minutes != null && minutes >= EXAM_MINUTES), minutes,
        responses: g.graded.map((x) => ({ key: x.key, ok: x.ok })),
      },
    })
    .eq("id", attempt.id).eq("user_id", user.id).is("submitted_at", null)
    .select("id");
  if (upErr) throw new Error("attempt update failed");
  if (!claimed || !claimed.length) {
    return res.status(409).json({ error: "This exam has already been scored", code: "already-submitted" });
  }

  return res.status(200).json({ attemptId: attempt.id, form: attempt.form, ...g, timedOut });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const body = req.body || {};
  const user = await userFromRequest(req);
  if (!user) return res.status(401).json({ error: "Sign in first" });
  const sb = admin();
  try {
    const owner = await isReviewer(sb, user.id);
    if (body.action === "status") return await status(sb, res, owner);
    if (body.action === "start") return await start(sb, res, user, owner, body);
    if (body.action === "submit") return await submit(sb, res, user, owner, body);
    return res.status(400).json({ error: "Unknown action" });
  } catch {
    return res.status(503).json({ error: "The exam service is unavailable. Please try again." });
  }
}
