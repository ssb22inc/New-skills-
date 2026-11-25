/* A save that does not send a revision is accepted. After a newer
   client has written the row, that save is kept beside it for the app
   to merge. The stored progress row is not rewritten in SQL. */
import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(new URL("../supabase/migrations/022_progress_revision_guard.sql", import.meta.url), "utf8");
const userId = "00000000-0000-0000-0000-000000000001";

function asObject(value) {
  if (value && typeof value === "object") return value;
  return JSON.parse(value);
}

async function load(db) {
  await db.exec(`
    create schema if not exists auth;
    create table if not exists auth.users (id uuid primary key);
    create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    insert into auth.users (id) values ('${userId}') on conflict do nothing;
    create table public.progress (
      user_id uuid not null,
      key text not null,
      blob jsonb not null,
      updated_at timestamptz not null default now(),
      revision bigint not null default 0,
      primary key (user_id, key)
    );
  `);
  await db.exec(migration);
}

async function row(db) {
  const result = await db.query(`select blob, revision from public.progress where user_id = $1 and key = 'pulsern-v1'`, [userId]);
  return { blob: asObject(result.rows[0].blob), revision: Number(result.rows[0].revision) };
}

describe("revision-less saves wait for the client merge", () => {
  let db;

  beforeAll(async () => {
    db = new PGlite();
    await load(db);
  });

  it("leaves a newer row untouched and stores the old snapshot for the app", async () => {
    const stored = { log: [{ id: 1, attempt: "new-client" }], xp: 50, theme: "dim" };
    const incoming = { log: [{ id: 1, attempt: "new-client" }, { id: 2, attempt: "old-tab" }], xp: 70, theme: "light" };
    await db.query(
      `insert into public.progress (user_id, key, blob, revision) values ($1, 'pulsern-v1', $2::jsonb, 4)`,
      [userId, JSON.stringify(stored)],
    );
    await db.query(
      `update public.progress set blob = $2::jsonb where user_id = $1 and key = 'pulsern-v1'`,
      [userId, JSON.stringify(incoming)],
    );
    const saved = await row(db);
    expect(saved.revision).toBe(4);
    expect(saved.blob).toEqual(stored);
    const pending = await db.query(
      `select snapshot from public.progress_pending_merge where user_id = $1 and key = 'pulsern-v1' order by id`,
      [userId],
    );
    expect(pending.rows).toHaveLength(1);
    expect(asObject(pending.rows[0].snapshot)).toEqual(incoming);
    const guarded = await db.query(`select proname from pg_proc where proname like 'progress_merge%' or proname like 'progress_ability%' or proname = 'progress_review_stamp' or proname = 'progress_apply_answer'`);
    expect(guarded.rows).toEqual([]);
  });

  /* Astra, PR #184 review, finding 4: migration 020 labels the stored log
     and migration 021 leaves it at revision 0. An old tab that still holds
     the pre-migration history must not write it back over those labels. */
  it("parks a revision-0 old-app snapshot instead of replacing migration 020's labels", async () => {
    const labelled = { log: [{ id: 42, key: "bank:42", source: "bank", cat: "Pharmacology", correct: false }], xp: 3, theme: "dim" };
    const preMigration = { log: [{ id: 42, cat: "Pharmacology", correct: false }], xp: 3, theme: "light" };
    await db.query(`delete from public.progress where user_id = $1`, [userId]);
    await db.query(`delete from public.progress_pending_merge where user_id = $1`, [userId]);
    await db.query(
      `insert into public.progress (user_id, key, blob, revision) values ($1, 'pulsern-v1', $2::jsonb, 0)`,
      [userId, JSON.stringify(labelled)],
    );
    await db.query(
      `update public.progress set blob = $2::jsonb where user_id = $1 and key = 'pulsern-v1'`,
      [userId, JSON.stringify(preMigration)],
    );
    const saved = await row(db);
    expect(saved.revision).toBe(0);
    expect(saved.blob).toEqual(labelled);
    const pending = await db.query(`select snapshot from public.progress_pending_merge where user_id = $1`, [userId]);
    expect(pending.rows).toHaveLength(1);
    expect(asObject(pending.rows[0].snapshot)).toEqual(preMigration);
    /* The first revision-aware save still lands on the same row. */
    await db.query(
      `update public.progress set blob = $2::jsonb, revision = 1 where user_id = $1 and key = 'pulsern-v1' and revision = 0`,
      [userId, JSON.stringify({ ...labelled, xp: 9 })],
    );
    expect((await row(db)).revision).toBe(1);
    await db.query(`delete from public.progress_pending_merge where user_id = $1`, [userId]);
  });

  it("does not park an older snapshot after progress was reset", async () => {
    await db.query(`delete from public.progress_pending_merge where user_id = $1`, [userId]);
    await db.query(
      `update public.progress set blob = '{"log":[]}'::jsonb, revision = 8, legacy_hold = true where user_id = $1 and key = 'pulsern-v1'`,
      [userId],
    );
    await db.query(
      `update public.progress set blob = '{"log":[{"id":9,"cat":"Pharmacology","diff":1,"correct":true}]}'::jsonb where user_id = $1 and key = 'pulsern-v1'`,
      [userId],
    );
    const saved = await row(db);
    expect(saved.blob).toEqual({ log: [] });
    const pending = await db.query(`select id from public.progress_pending_merge where user_id = $1`, [userId]);
    expect(pending.rows).toEqual([]);
  });

  /* Astra, PR #184 review, finding 1: a reset used to delete the row, and the
     next save re-created it at revision 1 — the number a second device still
     held, so its stale save matched and wrote the erased history back. A reset
     now advances the row's revision; the stale device matches nothing. */
  it("a stale device cannot write erased history back after a reset", async () => {
    const history = { log: [{ id: 1, attempt: "old-device" }], xp: 50 };
    await db.query(`delete from public.progress where user_id = $1`, [userId]);
    await db.query(`delete from public.progress_pending_merge where user_id = $1`, [userId]);
    await db.query(`insert into public.progress (user_id, key, blob, revision) values ($1, 'pulsern-v1', $2::jsonb, 1)`, [userId, JSON.stringify(history)]);
    /* Device B resets: keep the row, advance the revision, hold legacy saves. */
    await db.query(
      `update public.progress set blob = '{"resetGeneration":1}'::jsonb, revision = 2, legacy_hold = true where user_id = $1 and key = 'pulsern-v1' and revision = 1`,
      [userId],
    );
    /* Device B's first new save lands on the reset revision. */
    await db.query(
      `update public.progress set blob = '{"resetGeneration":1,"log":[]}'::jsonb, revision = 3, legacy_hold = false where user_id = $1 and key = 'pulsern-v1' and revision = 2`,
      [userId],
    );
    /* Device A still holds revision 1 and tries to save its old history. */
    const stale = await db.query(
      `update public.progress set blob = $2::jsonb, revision = 2 where user_id = $1 and key = 'pulsern-v1' and revision = 1 returning revision`,
      [userId, JSON.stringify({ ...history, theme: "light" })],
    );
    expect(stale.rows).toEqual([]);
    const saved = await row(db);
    expect(saved.revision).toBe(3);
    expect(saved.blob).toEqual({ resetGeneration: 1, log: [] });
  });

  it("rejects a client that sends an older revision", async () => {
    await db.query(`delete from public.progress where user_id = $1`, [userId]);
    await db.query(
      `insert into public.progress (user_id, key, blob, revision) values ($1, 'pulsern-v1', '{"log":[]}'::jsonb, 6)`,
      [userId],
    );
    await expect(db.query(
      `update public.progress set blob = '{"log":[{"id":3}]}'::jsonb, revision = 4 where user_id = $1`,
      [userId],
    )).rejects.toThrow(/revision conflict/);
  });

  it("lets only the owning account read or delete a parked snapshot", async () => {
    const policies = await db.query(`
      select polname, polcmd from pg_policy
      where polrelid = 'public.progress_pending_merge'::regclass
      order by polname
    `);
    const locked = await db.query(`select relrowsecurity from pg_class where oid = 'public.progress_pending_merge'::regclass`);
    expect(locked.rows[0].relrowsecurity).toBe(true);
    const names = policies.rows.map((policy) => `${policy.polname}:${policy.polcmd}`).sort();
    expect(names).toEqual(expect.arrayContaining(["pending_merge_select:r", "pending_merge_delete:d", "pending_merge_insert:a"]));
    const defs = await db.query(`select pg_get_expr(polqual, polrelid) as expr from pg_policy where polrelid = 'public.progress_pending_merge'::regclass`);
    expect(defs.rows.map((policy) => policy.expr).join("\n")).toMatch(/auth\.uid\(\)/);
  });
});
