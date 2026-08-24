/* Owner diagnostics. Never public.

   Three layers, in order of how much you can trust them:
     1. Engine self-test  — deterministic assertions over the shipped modules.
                            A definite yes/no about whether the code students
                            are running behaves correctly.
     2. Data integrity    — SQL invariants over live content. Also definite.
     3. Wiring            — whether each service is configured. Reports only
                            WHETHER a secret is present, never its value.

   Gated on reviewers-table membership, the same gate the review console uses.
   The earlier launch diagnostic was removed for leaking webhook detail to any
   signed-in student; this one refuses anyone who is not the owner. */
import { createClient } from "@supabase/supabase-js";
import { runSelfTest } from "../src/selftest.js";

const admin = () =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

/* Each entry returns { ok, label, detail, why, fix }. `why` explains the
   student-facing consequence; `fix` is the exact remedy, in plain words. */
async function dataChecks(sb) {
  const out = [];
  const count = async (table, build) => {
    let q = sb.from(table).select("*", { count: "exact", head: true });
    if (build) q = build(q);
    const { count: n, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    return n ?? 0;
  };

  try {
    const approved = await count("questions", (q) => q.eq("approved", true));
    out.push({
      ok: approved > 0,
      label: "Practice questions are live",
      detail: `${approved.toLocaleString()} approved questions in the bank`,
      why: "With none approved, students open Practice and find nothing to answer.",
      fix: "Run the content factory to refill the bank, then approve in the review console.",
    });
  } catch (e) {
    out.push({ ok: false, label: "Practice questions are live", detail: e.message, why: "The question bank could not be read at all.", fix: "Check the database is reachable and the questions table exists." });
  }

  try {
    const cards = await count("flashcards", (q) => q.eq("approved", true));
    out.push({
      ok: cards > 0,
      label: "Flashcards are live",
      detail: `${cards.toLocaleString()} approved cards`,
      why: "With none approved, the Cards tab is empty and daily reviews stop.",
      fix: "Run the card factory to generate more cards.",
    });
  } catch (e) {
    out.push({ ok: false, label: "Flashcards are live", detail: e.message, why: "The flashcard table could not be read.", fix: "Check the database is reachable." });
  }

  try {
    const cases = await count("case_studies", (q) => q.eq("approved", true));
    out.push({
      ok: cases > 0,
      label: "Case studies are live",
      detail: `${cases.toLocaleString()} approved cases`,
      why: "With none approved, the Case Study tab has nothing to open.",
      fix: "Run the case factory to generate more cases.",
    });
  } catch (e) {
    out.push({ ok: false, label: "Case studies are live", detail: e.message, why: "The case table could not be read.", fix: "Check the database is reachable." });
  }

  /* Every readiness exam form should carry a full complement of items. A short
     form is worse than a missing one: the student sits it, burns their single
     permanent attempt, and gets a score built on fewer questions. */
  try {
    const { data, error } = await sb.from("questions").select("exam_form").eq("approved", true).not("exam_form", "is", null);
    if (error) throw new Error(error.message);
    const per = {};
    for (const r of data ?? []) per[r.exam_form] = (per[r.exam_form] ?? 0) + 1;
    const forms = Object.keys(per).map(Number).sort((a, b) => a - b);
    const short = forms.filter((f) => per[f] < 67);
    out.push({
      ok: forms.length === 10 && short.length === 0,
      label: "All ten readiness exams are complete",
      detail: forms.length === 10 && short.length === 0
        ? "10 forms, each with a full item set"
        : `${forms.length} of 10 forms present${short.length ? `; short forms: ${short.map((f) => `#${f} (${per[f]})`).join(", ")}` : ""}`,
      why: "A short exam form still burns the student's one permanent attempt at it.",
      fix: "Run ops/exam-factory.mjs to refill the missing forms before anyone sits them.",
    });
  } catch (e) {
    out.push({ ok: false, label: "All ten readiness exams are complete", detail: e.message, why: "Exam coverage could not be checked.", fix: "Check the database is reachable." });
  }

  /* Unresolved student reports are the one queue with a human on the end. */
  try {
    const open = await count("question_reports", (q) => q.is("resolved_at", null));
    out.push({
      ok: open < 25,
      label: "Student problem reports are being cleared",
      detail: open === 0 ? "no open reports" : `${open} open report${open === 1 ? "" : "s"} waiting`,
      why: "Open reports are students telling you an item is wrong. They do not clear themselves.",
      fix: "Open the review console Reports tab and work through the queue.",
    });
  } catch (e) {
    out.push({ ok: false, label: "Student problem reports are being cleared", detail: e.message, why: "The reports queue could not be read.", fix: "Confirm migration 012 has been applied." });
  }

  return out;
}

function wiringChecks() {
  const k = process.env.STRIPE_SECRET_KEY ?? "";
  const keyKind = !k ? "absent" : /^(sk|rk)_live_/.test(k) ? "live" : /^(sk|rk)_test_/.test(k) ? "test" : "unrecognised";
  return [
    {
      ok: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      label: "Database connection configured",
      detail: process.env.SUPABASE_URL ? "URL and service key present" : "missing",
      why: "Without this nothing loads: no questions, no progress, no sign-in.",
      fix: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the Vercel project settings.",
    },
    {
      ok: keyKind === "live",
      label: "Payments are in live mode",
      detail: `Stripe key: ${keyKind}`,
      why: "A test key means real customers cannot actually pay you.",
      fix: "Replace STRIPE_SECRET_KEY in Vercel with the live-mode key, then redeploy.",
    },
    {
      ok: /^whsec_/.test(process.env.STRIPE_WEBHOOK_SECRET ?? ""),
      label: "Payment confirmations can be verified",
      detail: process.env.STRIPE_WEBHOOK_SECRET ? "signing secret present" : "missing",
      why: "Without it a completed payment never grants access, and the student pays for nothing.",
      fix: "Copy the signing secret from the Stripe webhook endpoint into STRIPE_WEBHOOK_SECRET.",
    },
    {
      ok: Boolean(process.env.OPENROUTER_API_KEY),
      label: "AI tutor is configured",
      detail: process.env.OPENROUTER_API_KEY ? "key present" : "missing",
      why: "Without it the tutor button returns an error instead of an explanation.",
      fix: "Set OPENROUTER_API_KEY in the Vercel project settings.",
    },
  ];
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { token } = req.body || {};
  const sb = admin();

  const { data: userData, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userData?.user) return res.status(401).json({ error: "Sign in first" });

  const { data: reviewer } = await sb
    .from("reviewers").select("user_id").eq("user_id", userData.user.id).maybeSingle();
  if (!reviewer) return res.status(403).json({ error: "Owner access only" });

  const engine = runSelfTest();

  let data = [];
  try {
    data = await dataChecks(sb);
  } catch (e) {
    data = [{ ok: false, label: "Content checks", detail: e.message, why: "The content checks could not run.", fix: "Check the database is reachable." }];
  }
  const wiring = wiringChecks();

  const groups = [
    { group: "Engines", ok: engine.ok, items: engine.areas.flatMap((a) => a.checks.map((c) => ({ ok: c.pass, label: c.name, detail: c.detail, why: c.why, fix: "Report this to your developer — an engine check failing means shipped code is misbehaving.", area: a.area }))) },
    { group: "Content", ok: data.every((d) => d.ok), items: data },
    { group: "Wiring", ok: wiring.every((w) => w.ok), items: wiring },
  ];

  const failing = groups.flatMap((g) => g.items.filter((i) => !i.ok));
  return res.status(200).json({
    ok: failing.length === 0,
    checkedAt: new Date().toISOString(),
    summary: { total: groups.reduce((n, g) => n + g.items.length, 0), failing: failing.length },
    groups,
  });
}
