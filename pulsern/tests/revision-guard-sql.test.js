/* The revision guard runs in Postgres. A save that does not send a
   revision is accepted. After a revision-aware write, that save is
   merged into the stored row instead of replacing it. */
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

describe("revision-less saves merge into a newer row", () => {
  let db;

  beforeAll(async () => {
    db = new PGlite();
    await load(db);
  });

  it("keeps an old tab's later card grade and scores its new answer", async () => {
    const stored = {
      log: [{ id: 1, cat: "Management of Care", diff: 1, correct: true, attempt: "new-client", day: "2026-11-24", source: "bank", rating: 1300 }],
      ability: { "Management of Care": { theta: 1200, n: 0 }, Pharmacology: { theta: 1200, n: 0 } },
      xp: 10,
      bestRun: 1,
      theme: "dim",
      srsMap: { "card-old": { interval: 3, due: "2026-11-27", seen: "2026-11-24" } },
      rewards: { covers: 1, coverWeeks: ["2026-11-23"], coverDays: [], days: {}, best: { streak: 1 } },
      streak: { count: 1, lastDay: "2026-11-24", shield: true },
    };
    const incoming = {
      log: [{ id: 9, cat: "Pharmacology", diff: 2, correct: true, day: "2026-11-25" }],
      ability: { Pharmacology: { theta: 9999, n: 1 } },
      xp: 40,
      bestRun: 4,
      theme: "light",
      srsMap: {
        "card-old": { interval: 1, due: "2026-11-21", seen: "2026-11-20" },
        "card-new": { interval: 7, due: "2026-12-02", seen: "2026-11-25" },
      },
      rewards: { covers: 0, coverWeeks: ["2026-11-16"], days: { "2026-11-25": { q: 1, ok: 1, xp: 8, cards: 1, fixes: 0, ms: 9000 } }, best: { streak: 3 } },
      streak: { count: 2, lastDay: "2026-11-25", shield: false },
    };
    await db.query(
      `insert into public.progress (user_id, key, blob, revision) values ($1, 'pulsern-v1', $2::jsonb, 4)`,
      [userId, JSON.stringify(stored)],
    );
    await db.query(
      `update public.progress set blob = $2::jsonb where user_id = $1 and key = 'pulsern-v1'`,
      [userId, JSON.stringify(incoming)],
    );
    const saved = await row(db);
    expect(saved.revision).toBe(5);
    expect(saved.blob.log.map((entry) => entry.id)).toEqual([1, 9]);
    expect(saved.blob.srsMap["card-old"]).toMatchObject({ interval: 3, seen: "2026-11-24" });
    expect(saved.blob.srsMap["card-new"]).toMatchObject({ interval: 7, seen: "2026-11-25" });
    expect(saved.blob.ability.Pharmacology.n).toBe(1);
    expect(saved.blob.ability.Pharmacology.theta).toBeGreaterThan(1200);
    expect(saved.blob.ability["Management of Care"].n).toBe(1);
    expect(saved.blob.ability.Pharmacology.theta).not.toBe(9999);
    expect(saved.blob.xp).toBe(40);
    expect(saved.blob.bestRun).toBe(4);
    expect(saved.blob.rewards.covers).toBe(1);
    expect(saved.blob.rewards.coverWeeks.sort()).toEqual(["2026-11-16", "2026-11-23"]);
    expect(saved.blob.rewards.days["2026-11-25"].cards).toBe(1);
    expect(saved.blob.rewards.best.streak).toBe(3);
    expect(saved.blob.streak).toMatchObject({ count: 2, lastDay: "2026-11-25" });
    expect(saved.blob.theme).toBe("light");
  });

  it("replaces a card when the old tab reviewed it later", async () => {
    await db.query(`delete from public.progress where user_id = $1`, [userId]);
    await db.query(
      `insert into public.progress (user_id, key, blob, revision) values ($1, 'pulsern-v1', $2::jsonb, 2)`,
      [userId, JSON.stringify({
        log: [],
        srsMap: { "card-a": { interval: 1, due: "2026-11-21", seen: "2026-11-20" } },
        xp: 5,
      })],
    );
    await db.query(
      `update public.progress set blob = $2::jsonb where user_id = $1 and key = 'pulsern-v1'`,
      [userId, JSON.stringify({
        log: [],
        srsMap: { "card-a": { interval: 7, due: "2026-12-02", seen: "2026-11-25" } },
        xp: 8,
      })],
    );
    const saved = await row(db);
    expect(saved.blob.srsMap["card-a"]).toMatchObject({ interval: 7, seen: "2026-11-25" });
    expect(saved.blob.xp).toBe(8);
    expect(saved.revision).toBe(3);
  });

  it("still accepts a revision-less save when nothing newer has been stored", async () => {
    const first = { log: [{ id: 2, cat: "Pharmacology", diff: 1, correct: false }], xp: 3, theme: "dim" };
    await db.query(`delete from public.progress where user_id = $1`, [userId]);
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
    expect(saved.blob.xp).toBe(3);
    expect(saved.blob.log).toHaveLength(1);
    expect(saved.blob.theme).toBe("dim");
  });

  it("rejects a client that sends an older revision", async () => {
    await db.query(`update public.progress set revision = 6, blob = '{"log":[]}'::jsonb where user_id = $1`, [userId]);
    await expect(db.query(
      `update public.progress set blob = '{"log":[{"id":3}]}'::jsonb, revision = 4 where user_id = $1`,
      [userId],
    )).rejects.toThrow(/revision conflict/);
  });
});
