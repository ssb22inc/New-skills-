import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { sql } from 'kysely';
import { createDb, databaseUrl } from './database.js';
import { migrateDownAll, migrateToLatest } from './migrator.js';
import { seedMarkets } from './seed.js';
import { usersRepo } from './repositories/users.js';
import { emitEvent } from './outbox.js';

async function postgresReachable(): Promise<boolean> {
  const client = new pg.Client({ connectionString: databaseUrl(), connectionTimeoutMillis: 1500 });
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

const reachable = await postgresReachable();
if (!reachable) {
  console.warn(
    '⚠ P2 gate tests SKIPPED: Postgres unreachable. Run `docker compose up -d` and re-run.',
  );
}

describe.runIf(reachable)('P2 — database core (gate)', () => {
  const db = createDb(databaseUrl());

  beforeAll(async () => {
    // Start from a clean slate regardless of what a previous run left behind.
    await migrateDownAll(db);
  });

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  it('migrates up and down cleanly, twice', async () => {
    for (let cycle = 0; cycle < 2; cycle++) {
      const up = await migrateToLatest(db);
      expect(up.error).toBeUndefined();
      expect(up.results?.every((r) => r.status === 'Success')).toBe(true);

      const tables = await sql<{ table_name: string }>`
        select table_name from information_schema.tables where table_schema = 'public'
      `.execute(db);
      const names = tables.rows.map((r) => r.table_name);
      for (const t of ['markets', 'users', 'sellers', 'events_outbox']) {
        expect(names).toContain(t);
      }

      const down = await migrateDownAll(db);
      expect(down.error).toBeUndefined();

      const after = await sql<{ table_name: string }>`
        select table_name from information_schema.tables
        where table_schema = 'public' and table_name != 'kysely_migration'
          and table_name != 'kysely_migration_lock'
      `.execute(db);
      expect(after.rows).toHaveLength(0);
    }
  });

  it('seeds market jm idempotently', async () => {
    await migrateToLatest(db);
    await seedMarkets(db);
    await seedMarkets(db); // second run must be a no-op, not an error
    const markets = await db.selectFrom('markets').selectAll().execute();
    expect(markets).toHaveLength(1);
    expect(markets[0]?.market_id).toBe('jm');
    expect(markets[0]?.currency_code).toBe('JMD');
  });

  it('cross-market isolation: a jm query can never return a do row', async () => {
    await db
      .insertInto('markets')
      .values({
        market_id: 'do',
        name: 'República Dominicana',
        currency_code: 'DOP',
        timezone: 'America/Santo_Domingo',
      })
      .onConflict((oc) => oc.column('market_id').doNothing())
      .execute();

    const jm = usersRepo(db, 'jm');
    const dom = usersRepo(db, 'do');

    await jm.create({ phone: '+18761234567', displayName: 'Kingston Cook' });
    await dom.create({ phone: '+18095551234', displayName: 'Santo Domingo Guide' });
    // Same phone in both markets is legal — uniqueness is per market.
    await dom.create({ phone: '+18761234567', displayName: 'DO user with JM-looking phone' });

    const jmUsers = await jm.list();
    expect(jmUsers).toHaveLength(1);
    expect(jmUsers.every((u) => u.market_id === 'jm')).toBe(true);

    // A do-market phone looked up through the jm scope must not resolve.
    expect(await jm.findByPhone('+18095551234')).toBeUndefined();
    // The shared phone resolves to the jm row only, never the do row.
    const shared = await jm.findByPhone('+18761234567');
    expect(shared?.market_id).toBe('jm');
    expect(shared?.display_name).toBe('Kingston Cook');
  });

  it('outbox event commits atomically with the mutation it describes', async () => {
    await db.transaction().execute(async (trx) => {
      const user = await trx
        .insertInto('users')
        .values({ market_id: 'jm', phone: '+18760000001', display_name: 'Outbox Test' })
        .returningAll()
        .executeTakeFirstOrThrow();
      await emitEvent(trx, {
        marketId: 'jm',
        topic: 'user.created',
        payload: { userId: user.id },
      });
    });

    const events = await db
      .selectFrom('events_outbox')
      .where('market_id', '=', 'jm')
      .where('topic', '=', 'user.created')
      .selectAll()
      .execute();
    expect(events).toHaveLength(1);
    expect(events[0]?.published_at).toBeNull();
  });
});
