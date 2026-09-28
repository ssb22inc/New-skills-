#!/usr/bin/env node
/* PulseRN keepalive — stop the Supabase project going to sleep, and say so
   loudly the moment it has.
   ------------------------------------------------------------------
   On 2026-09-28 students hit "Failed to fetch" on the sign-in screen. Nothing
   was broken: Supabase pauses a free-tier project after roughly a week with no
   database activity, the project had been idle since 2026-09-08, and the whole
   backend — database and auth — was simply switched off. The only reason
   anyone found out was the owner trying to sign in.

   Two jobs, in this order:

     1. KEEP IT AWAKE. The pause timer is driven by database activity, so a
        real query on a real table resets it. One cheap read a day is enough.

     2. SAY SO IF IT IS ALREADY DOWN. A keepalive that fails quietly is worse
        than none, because it looks like cover. Any failure exits non-zero so
        the workflow goes red and opens an incident.

   Both surfaces a student touches are checked, because they fail separately:
   PostgREST serves study content, GoTrue serves sign-in. A paused project
   takes down both, but a broken key or a bad RLS change can take down one
   alone, and the message should say which.

   Usage:
     node ops/keepalive.mjs

   Env (server-side only): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
   ------------------------------------------------------------------ */

import { db } from "./supabase-guard.mjs";

const URL_ = process.env.SUPABASE_URL ?? "";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/* A paused project does not answer politely — it refuses the connection, or
   the gateway returns 5xx. Telling that apart from an ordinary error is the
   difference between "go un-pause it" and "go fix your query". */
const looksPaused = (detail) =>
  /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|5[0-9]{2}/i.test(detail);

/* The project ref is the first label of the Supabase hostname. If the URL is
   malformed the link must degrade to the dashboard root rather than printing a
   broken one — an outage message is the worst place to send someone nowhere. */
function dashboardUrl() {
  const ref = /^https:\/\/([a-z0-9-]+)\.supabase\.(co|in)$/i.exec(URL_.trim().replace(/\/+$/, ""))?.[1];
  return ref ? `https://supabase.com/dashboard/project/${ref}` : "https://supabase.com/dashboard";
}

function report(what, detail) {
  const paused = looksPaused(detail);
  console.error(`\n✗ ${what} unreachable: ${detail}`);
  if (paused) {
    console.error(`
The project looks PAUSED or unreachable, not misconfigured.

Supabase pauses a free-tier project after about a week without database
activity. While it is paused every student sees "Failed to fetch" on the
sign-in screen, because the browser's request never reaches a server.

  Fix: open the project in the Supabase dashboard and restore it.
       ${dashboardUrl()}
       It takes a few minutes to come back up.

This workflow exists to keep that from happening. If it has been failing for
days, check that the schedule is still running at all — GitHub disables
scheduled workflows in a repository with no activity for 60 days, which would
silently disarm this guard.`);
  }
  process.exit(1);
}

async function main() {
  if (!URL_) report("SUPABASE_URL", "not set");
  if (!KEY) report("SUPABASE_SERVICE_ROLE_KEY", "not set");

  /* 1. Study content. This read is also the activity that resets the timer. */
  try {
    const { error } = await db().from("questions").select("id").limit(1);
    if (error) report("Database (PostgREST)", error.message);
  } catch (e) {
    report("Database (PostgREST)", e.message);
  }
  console.log("✓ Database reachable — pause timer reset.");

  /* 2. Sign-in. GoTrue runs separately from PostgREST, so check it separately:
        this is the exact surface that produced "Failed to fetch". */
  try {
    const r = await fetch(`${URL_}/auth/v1/health`, { headers: { apikey: KEY } });
    if (!r.ok) report("Auth (GoTrue)", `HTTP ${r.status}`);
  } catch (e) {
    report("Auth (GoTrue)", e.message);
  }
  console.log("✓ Auth reachable — students can sign in.");

  /* Size is not the point of this job, but it is free once connected and it
     makes the daily log a record of the library rather than a bare tick. */
  const { count } = await db().from("questions")
    .select("id", { count: "exact", head: true })
    .eq("approved", true).is("exam_form", null);
  console.log(`\nPulseRN is up. Practice bank: ${count ?? "unknown"} approved questions.`);
}

main().catch((e) => report("Keepalive", e.message));
