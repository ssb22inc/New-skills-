/* Shared Supabase credential guard for the ops factories.
   ------------------------------------------------------------------
   Generation is the expensive part of any factory run: two model calls per
   item or loop, minutes of wall clock, and real OpenRouter credit. Finding
   out at the INSERT step that the database was never reachable wastes all of
   it, and reads as a content problem rather than a credential one.

   This lives in one place because the question factory and the case factory
   had drifted into two different half-checks of the same credential. A bug
   fixed in one would not have been fixed in the other.
   ------------------------------------------------------------------ */
import { createClient } from "@supabase/supabase-js";

let _sb = null;
export const db = () =>
  (_sb ??= createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY));

/* Key classes that get mistaken for the service-role key. Naming the class
   turns "Invalid API key" into an instruction. Never print the key itself. */
const KEY_CLASSES = [
  ["sb_secret_", "secret (service_role) key — correct for this job"],
  ["sb_publishable_", "PUBLISHABLE key — public, read-only, wrong for this job"],
  ["sbp_", "personal ACCESS TOKEN — for the Management API, not the database"],
  ["eyJ", "JWT — legacy anon or service_role key"],
];

export function keyClass(key) {
  const hit = KEY_CLASSES.find(([p]) => key.startsWith(p));
  return hit ? hit[1] : "unrecognised prefix";
}

/* Two cheap round-trips, neither of which writes anything:

     read  — any select. Fails if the URL is wrong, the key belongs to another
             project, or it is not a Supabase API key at all (a personal access
             token is the classic mix-up: it passes every name check, and
             PostgREST answers "Invalid API key").
     write — auth.admin.listUsers is service-role only. A publishable/anon key
             passes the read probe and fails here, which is the exact shape of
             a row-level-security failure discovered at insert time.

   `table` is the one the caller actually writes to, so a project missing that
   table fails here rather than after generation. */
export async function preflightDb(table = "questions") {
  const url = process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const fail = (what, detail) => {
    throw new Error(
      `Supabase ${what} check failed: ${detail}\n` +
      `  SUPABASE_URL: ${url ? url.replace(/^(https:\/\/[a-z0-9]{6}).*/, "$1…") : "(empty)"}\n` +
      `  SUPABASE_SERVICE_ROLE_KEY: ${key.length} chars, looks like a ${keyClass(key)}\n` +
      `  Fix: Supabase dashboard -> Project Settings -> API Keys -> copy the\n` +
      `  SECRET (service_role) key for THIS project, and paste it with no\n` +
      `  surrounding spaces or newline into the SUPABASE_SERVICE_ROLE_KEY secret.`
    );
  };
  if (!url) fail("URL", "SUPABASE_URL is empty");
  if (!key) fail("key", "SUPABASE_SERVICE_ROLE_KEY is empty");

  const { error: readErr } = await db().from(table).select("id").limit(1);
  if (readErr) fail("read", readErr.message);

  const { error: adminErr } = await db().auth.admin.listUsers({ page: 1, perPage: 1 });
  if (adminErr) fail("service-role", `${adminErr.message} (the key reached the project but is not the service_role key)`);

  console.log("Credentials verified: database readable and key has service-role rights.");
}

/* Live size of a published library. Exam items share the questions table but
   are quarantined by exam_form, so they must never count toward a target. */
export async function publishedCount(table, { excludeExamForm = false } = {}) {
  let q = db().from(table).select("id", { count: "exact", head: true }).eq("approved", true);
  if (excludeExamForm) q = q.is("exam_form", null);
  const { count, error } = await q;
  if (error) throw new Error(`Could not read ${table} count: ${error.message}`);
  return count ?? 0;
}
