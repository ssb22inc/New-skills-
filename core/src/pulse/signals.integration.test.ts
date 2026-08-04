import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { loadContextPack } from '@sycamore/packs';
import { createDb, databaseUrl } from '../db/database.js';
import { migrateDownAll, migrateToLatest } from '../db/migrator.js';
import { seedMarkets } from '../db/seed.js';
import { signalsService, SignalError } from './signals.js';

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
if (!reachable) console.warn('⚠ P23 gate tests SKIPPED: Postgres unreachable.');

const jm = loadContextPack('jm');
const DAY = 24 * 60 * 60 * 1000;

describe.runIf(reachable)('P23 — signal ingestion (gate)', () => {
  const db = createDb(databaseUrl());
  const signals = signalsService(db, 'jm', jm);
  const now = new Date('2027-02-01T09:00:00Z');

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
  });

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  it('GATE: a seeded schedule produces correct boost events at 1–3 day lead', async () => {
    await signals.ingestCruiseSchedule([
      // In the window: boosts fire.
      { portId: 'ocho-rios', occursAt: new Date(now.getTime() + 2 * DAY), passengers: 4200 },
      // Too far out: no boost yet.
      { portId: 'falmouth', occursAt: new Date(now.getTime() + 5 * DAY), passengers: 3600 },
      // Already happened: never boosts.
      { portId: 'montego-bay', occursAt: new Date(now.getTime() - 1 * DAY), passengers: 5000 },
    ]);

    const emitted = await signals.matchBoosts(['tours', 'food'], now);
    expect(emitted).toBe(2); // ocho-rios × {tours, food} only

    const boosts = await db.selectFrom('pulse_boosts').selectAll().execute();
    expect(boosts).toHaveLength(2);
    for (const boost of boosts) {
      expect(boost.parish).toBe('St Ann'); // port → parish from the PACK
      expect(boost.lead_days).toBe(2);
    }
    expect(new Set(boosts.map((b) => b.vertical_id))).toEqual(new Set(['tours', 'food']));

    const events = await db
      .selectFrom('events_outbox')
      .where('topic', '=', 'pulse.boost')
      .selectAll()
      .execute();
    expect(events).toHaveLength(2);
    const payload = events[0]!.payload as unknown as { parish: string; magnitude: number };
    expect(payload.parish).toBe('St Ann');
    expect(payload.magnitude).toBe(4200);
  });

  it('re-running the matcher never doubles a boost; time moving brings the next arrival in', async () => {
    // Same moment again: nothing new.
    expect(await signals.matchBoosts(['tours', 'food'], now)).toBe(0);

    // Two days later the falmouth arrival is 3 days out → it boosts now.
    const later = new Date(now.getTime() + 2 * DAY);
    const emitted = await signals.matchBoosts(['tours', 'food'], later);
    expect(emitted).toBe(2);
    const falmouthBoosts = await db
      .selectFrom('pulse_boosts')
      .where('parish', '=', 'Trelawny')
      .selectAll()
      .execute();
    expect(falmouthBoosts).toHaveLength(2);
    expect(falmouthBoosts[0]!.lead_days).toBe(3);
  });

  it('ingestion is idempotent and unknown ports refuse loudly', async () => {
    const again = await signals.ingestCruiseSchedule([
      { portId: 'ocho-rios', occursAt: new Date(now.getTime() + 2 * DAY), passengers: 4200 },
    ]);
    expect(again).toBe(0); // duplicate schedule row ignored
    await expect(
      signals.ingestCruiseSchedule([
        { portId: 'narnia-port', occursAt: new Date(), passengers: 10 },
      ]),
    ).rejects.toThrowError(SignalError);
  });
});
