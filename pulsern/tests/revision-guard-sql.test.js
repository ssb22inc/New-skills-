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

  it("still stores a revision-less save when the row has never been revision-aware", async () => {
    const first = { log: [{ id: 2, attempt: "old" }], xp: 3, theme: "dim" };
    await db.query(`delete from public.progress where user_id = $1`, [userId]);
    await db.query(`delete from public.progress_pending_merge where user_id = $1`, [userId]);
    await db.query(
      `insert into public.progress (user_id, key, blob, revision) values ($1, 'pulsern-v1', '{"log":[]}'::jsonb, 0)`,
      [userId],
    );
    await db.query(
      `update public.progress set blob = $2::jsonb where user_id = $1 and key = 'pulsern-v1'`,
      [userId, JSON.stringify(first)],
    );
    const saved = await row(db);
    expect(saved.revision).toBe(1);
    expect(saved.blob).toEqual(first);
    const pending = await db.query(`select id from public.progress_pending_merge where user_id = $1`, [userId]);
    expect(pending.rows).toEqual([]);
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
    expect(names).toEqual(expect.arrayContaining(["pending_merge_select:r", "pending_merge_delete:d"]));
    const defs = await db.query(`select pg_get_expr(polqual, polrelid) as expr from pg_policy where polrelid = 'public.progress_pending_merge'::regclass`);
    expect(defs.rows.map((policy) => policy.expr).join("\n")).toMatch(/auth\.uid\(\)/);
  });
});
