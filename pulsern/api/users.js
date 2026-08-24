/* Owner support tools: look up an account to troubleshoot it.

   This is the most privacy-sensitive endpoint on the site, so the rule it
   follows is: show what is needed to answer a support question, and nothing
   else. Each field below earns its place by answering something a student
   actually writes in:

     "I never got my email"    -> confirmed state, last sign-in, resend
     "I paid and got nothing"  -> subscription rows plus the Stripe session id,
                                  so the payment can be found in Stripe
     "my exams are gone"       -> exam_attempts, which are permanent by design
     "my progress vanished"    -> whether a save exists and how old it is
     "stop texting me"         -> SMS consent flags and opt-out state

   Deliberately NOT returned: the student's answer history (large, and no
   support question needs it), the raw progress JSON, and anything resembling a
   credential. Passwords are hashed by Supabase and are not reachable here.

   Gated on reviewers-table membership, the same gate as /api/health. */
import { createClient } from "@supabase/supabase-js";
import { computeEntitlement } from "../src/pricing.js";

const admin = () =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

const SITE = process.env.SITE_URL || "https://www.pulsern.app";
const PAGE = 200;

/* The admin API has no email search, so pages are scanned and filtered here.
   Bounded at 5 pages so a growing user base can never hang the request, and
   the response reports when a scan was cut short rather than quietly
   pretending it was complete. */
async function findUsers(sb, query) {
  const q = (query || "").trim().toLowerCase();
  const out = [];
  let scanned = 0;
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: PAGE });
    if (error) throw new Error(error.message);
    const users = data?.users ?? [];
    scanned += users.length;
    for (const u of users) {
      if (!q || (u.email || "").toLowerCase().includes(q)) out.push(u);
    }
    if (users.length < PAGE) return { users: out, scanned, truncated: false };
  }
  return { users: out, scanned, truncated: true };
}

const slim = (u) => ({
  id: u.id,
  email: u.email,
  createdAt: u.created_at,
  confirmed: Boolean(u.email_confirmed_at),
  lastSignInAt: u.last_sign_in_at ?? null,
  provider: u.app_metadata?.provider ?? "email",
});

async function detail(sb, userId) {
  const { data: got, error: uErr } = await sb.auth.admin.getUserById(userId);
  if (uErr || !got?.user) throw new Error(uErr?.message || "No such account");
  const u = got.user;

  const [subs, attempts, profile, progress, reports] = await Promise.all([
    sb.from("subscriptions")
      .select("plan, starts_at, expires_at, exams_granted, price_cents, discount_code, stripe_session, created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }),
    sb.from("exam_attempts").select("form, started_at").eq("user_id", userId).order("form"),
    sb.from("profiles")
      .select("full_name, phone, sms_reminders, sms_offers, opted_out, consent_at")
      .eq("user_id", userId).maybeSingle(),
    sb.from("progress").select("key, updated_at, blob").eq("user_id", userId),
    sb.from("question_reports").select("id, message, created_at, resolved_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
  ]);

  const subRows = subs.data ?? [];
  const attemptRows = attempts.data ?? [];
  const ent = computeEntitlement(subRows, attemptRows);

  /* Only a summary is derived from the save blob — never the blob itself and
     never the answer log. This is enough to answer "did my progress save?"
     without reading what the student got right and wrong. */
  let study = null;
  const row = (progress.data ?? [])[0];
  if (row) {
    let b = row.blob;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = null; } }
    study = {
      savedAt: row.updated_at,
      xp: b?.xp ?? 0,
      answered: Array.isArray(b?.log) ? b.log.length : 0,
      cardsScheduled: b?.srsMap ? Object.keys(b.srsMap).length : 0,
      streak: b?.streak?.count ?? 0,
      examDate: b?.examDate ?? null,
    };
  }

  return {
    account: slim(u),
    access: {
      status: ent.status,
      expiresAt: ent.expiresAt,
      examsLeft: ent.examsLeft,
      attempted: ent.attempted,
      hadPaid: ent.hadPaid,
    },
    subscriptions: subRows,
    examAttempts: attemptRows,
    profile: profile.data ?? null,
    study,
    reports: reports.data ?? [],
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { token, action, query, userId, confirmEmail } = req.body || {};
  const sb = admin();

  const { data: me, error: meErr } = await sb.auth.getUser(token);
  if (meErr || !me?.user) return res.status(401).json({ error: "Sign in first" });
  const { data: reviewer } = await sb
    .from("reviewers").select("user_id").eq("user_id", me.user.id).maybeSingle();
  if (!reviewer) return res.status(403).json({ error: "Owner access only" });

  try {
    if (action === "list") {
      const { users, scanned, truncated } = await findUsers(sb, query);
      const rows = users
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .slice(0, 100)
        .map(slim);
      return res.status(200).json({ users: rows, scanned, truncated, shown: rows.length });
    }

    if (action === "get") {
      if (!userId) return res.status(400).json({ error: "userId required" });
      return res.status(200).json(await detail(sb, userId));
    }

    /* Support actions. Both send only to the address already on the account,
       so neither can be pointed at a third party, and neither destroys data. */
    if (action === "resend_confirm" || action === "send_reset") {
      if (!userId) return res.status(400).json({ error: "userId required" });
      const { data: got } = await sb.auth.admin.getUserById(userId);
      const email = got?.user?.email;
      if (!email) return res.status(404).json({ error: "No such account" });

      if (action === "resend_confirm") {
        if (got.user.email_confirmed_at) {
          return res.status(400).json({ error: "That account is already confirmed — no email needed." });
        }
        const { error } = await sb.auth.resend({ type: "signup", email });
        if (error) return res.status(400).json({ error: error.message });
        return res.status(200).json({ ok: true, message: `Confirmation email sent to ${email}.` });
      }

      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: SITE });
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ ok: true, message: `Password reset link sent to ${email}.` });
    }

    /* Destructive and irreversible: every related row cascades away with the
       account. The typed email must match exactly, so a mis-click cannot wipe
       a paying customer, and the owner account is excluded outright. */
    if (action === "delete") {
      if (!userId) return res.status(400).json({ error: "userId required" });
      if (userId === me.user.id) {
        return res.status(400).json({ error: "You cannot delete your own owner account." });
      }
      const { data: got } = await sb.auth.admin.getUserById(userId);
      const email = got?.user?.email;
      if (!email) return res.status(404).json({ error: "No such account" });
      if ((confirmEmail || "").trim().toLowerCase() !== email.toLowerCase()) {
        return res.status(400).json({ error: "Type the account's email exactly to confirm deletion." });
      }

      const { error } = await sb.auth.admin.deleteUser(userId);
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({
        ok: true,
        message: `${email} deleted, along with its progress, subscriptions and exam attempts.`,
      });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
