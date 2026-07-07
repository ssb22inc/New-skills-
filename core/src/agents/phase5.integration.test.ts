import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { loadContextPack } from '@sycamore/packs';
import { createDb, databaseUrl } from '../db/database.js';
import { migrateDownAll, migrateToLatest } from '../db/migrator.js';
import { seedMarkets } from '../db/seed.js';
import { identityService } from '../identity/identity.js';
import { flagsRepo } from '../flags/flags.js';
import type { AlertSink } from '../observability/alerts.js';
import { builderPipeline } from './builder.js';
import { watchmanService } from './watchman.js';
import { fixerService } from './fixer.js';
import { loadRunbooks } from './runbooks.js';
import { heraldService, HeraldError, type PilotEvent } from './herald.js';
import { chairmanService, ChairmanError } from './chairman.js';

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
if (!reachable) console.warn('⚠ P30 gate tests SKIPPED: Postgres unreachable.');

const jm = loadContextPack('jm');
/** Lag at which buyers actually feel it — the fault must be caught below this. */
const USER_IMPACT_LAG_MS = 5000;

describe.runIf(reachable)('P30 — Herald + Chairman + Cockpit (Phase 5 exit gate)', () => {
  const db = createDb(databaseUrl());
  const chairman = chairmanService(db, 'jm');
  const herald = heraldService(db, 'jm', jm);
  let sellerId: string;

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
    const identity = identityService(db, 'jm');
    const owner = await identity.findOrCreateUserByPhone({
      phone: '+18765300000',
      displayName: 'Herald Seller',
      role: 'seller',
    });
    sellerId = (await identity.createSeller({ userId: owner.id, businessName: "Nadia's Nails" }))
      .id;
    await db
      .updateTable('sellers')
      .set({ parish: 'St. Catherine' })
      .where('id', '=', sellerId)
      .execute();
  });

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  it('GATE: one agent-proposed change ships through the FULL chain with a founder tap', async () => {
    const alerts: string[] = [];
    const alert: AlertSink = {
      send: (m) => {
        alerts.push(m);
        return Promise.resolve();
      },
    };
    let tapped = 0;
    const builder = builderPipeline({
      db,
      marketId: 'jm',
      flags: flagsRepo(db, 'jm'),
      alert,
      founderApproves: () => {
        tapped++;
        return Promise.resolve(true);
      },
    });
    const run = await builder.run({
      id: 'phase5-proof',
      title: 'ranking freshness tweak',
      summary: 'Give newer photos a small ranking nudge — tests green, canary healthy. Ship it?',
      flagKey: 'builder.phase5-proof',
      sandboxTests: () => Promise.resolve(true),
      simulate: () => Promise.resolve(true),
      healthCheck: () => Promise.resolve(true),
    });
    expect(run.outcome).toBe('shipped');
    expect(tapped).toBe(1); // the founder tap happened, exactly once

    const cards = await chairman.reportCards();
    expect(cards.builder.shipped).toBe(1);
  });

  it('GATE: one injected fault caught and healed BEFORE user impact', async () => {
    // Lag drifting up but still well under what a buyer would feel.
    const recent = [900, 1200, 1500];
    expect(Math.max(...recent)).toBeLessThan(USER_IMPACT_LAG_MS);

    const watchman = watchmanService(db, 'jm');
    const incidents = await watchman.tick({
      webhook_lag_ms: { baseline: [200, 210, 195, 205, 198, 202, 200], recent },
    });
    expect(incidents).toHaveLength(1);

    const fixer = fixerService(db, 'jm', loadRunbooks());
    const executed: string[] = [];
    const result = await fixer.handle(incidents[0]!.id, (a) => {
      executed.push(a);
      return Promise.resolve();
    });
    expect(result.outcome).toBe('healed'); // caught, healed, founder asleep
    expect(executed.length).toBeGreaterThan(0);

    const cards = await chairman.reportCards();
    expect(cards.fixer.healed).toBe(1);
    expect(cards.fixer.escalated).toBe(0);
  });

  it('Chairman: tested-items-only memo, probe cap, wake triggers, ZERO spend authority', async () => {
    const before = await db
      .selectFrom('ledger_transactions')
      .select((eb) => eb.fn.countAll().as('n'))
      .executeTakeFirst();

    const memo = chairman.weeklyMemo([
      {
        statement: 'Capacity held under the 500-booking storm',
        kind: 'tested',
        evidence: 'oversell-storm CI suite',
      },
      { statement: 'Try a J$2,000 boost on Portmore food pool for one weekend', kind: 'probe' },
    ]);
    expect(memo).toContain('oversell-storm CI suite');

    // No evidence, no memo line — the rule throws, not warns.
    expect(() =>
      chairman.weeklyMemo([{ statement: 'rankings feel better', kind: 'tested' }]),
    ).toThrowError(ChairmanError);
    // Probe asks are capped.
    expect(() =>
      chairman.weeklyMemo([
        { statement: 'p1', kind: 'probe' },
        { statement: 'p2', kind: 'probe' },
        { statement: 'p3', kind: 'probe' },
      ]),
    ).toThrowError(ChairmanError);

    // Wake triggers: money drift and escalations wake; green does not.
    expect(
      chairman.wakeCheck({ escalatedIncidents: 0, paymentSuccessRate: 0.97, ledgerDriftMinor: 0 })
        .wake,
    ).toBe(false);
    expect(
      chairman.wakeCheck({ escalatedIncidents: 1, paymentSuccessRate: 0.97, ledgerDriftMinor: 0 })
        .wake,
    ).toBe(true);
    expect(
      chairman.wakeCheck({ escalatedIncidents: 0, paymentSuccessRate: 0.97, ledgerDriftMinor: 1 })
        .wake,
    ).toBe(true);

    // Zero spend authority: after everything the Chairman did, the
    // ledger has exactly as many transactions as before — none.
    const after = await db
      .selectFrom('ledger_transactions')
      .select((eb) => eb.fn.countAll().as('n'))
      .executeTakeFirst();
    expect(Number(after?.n)).toBe(Number(before?.n));
  });

  it('Herald: GEO JSON-LD + programmatic local pages per seller', async () => {
    const jsonLd = await herald.geoJsonLd(sellerId, 'https://sycamore.example');
    expect(jsonLd).toMatchObject({
      '@type': 'LocalBusiness',
      name: "Nadia's Nails",
      address: { addressRegion: 'St. Catherine', addressCountry: 'JM' },
    });

    const entries = await herald.localPageEntries('https://sycamore.example');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.slug).toBe('st-catherine/nadia-s-nails');
    expect(entries[0]!.googleBusiness.title).toBe("Nadia's Nails");
  });

  it('Herald: holdout-controlled pilot with fraud filtering (mock events; live pilots = HUMAN GATE)', () => {
    // Deterministic cohorts: same user, same answer, every time.
    for (const u of ['u1', 'u2', 'u3']) {
      expect(herald.holdoutOf('pilot-1', u)).toBe(herald.holdoutOf('pilot-1', u));
    }

    const exposed: PilotEvent[] = [
      // 10 legit clicks, 4 convert like humans.
      ...Array.from({ length: 10 }, (_, i) => ({
        userId: `u${i}`,
        deviceId: `d${i}`,
        clickedAt: i * 10_000,
        converted: i < 4,
        conversionMs: 45_000,
      })),
      // A click farm: one device hammering, converting in 300ms.
      ...Array.from({ length: 8 }, (_, i) => ({
        userId: `bot${i}`,
        deviceId: 'farm-device',
        clickedAt: i * 100,
        converted: true,
        conversionMs: 300,
      })),
    ];
    const holdout: PilotEvent[] = Array.from({ length: 10 }, (_, i) => ({
      userId: `h${i}`,
      deviceId: `hd${i}`,
      clickedAt: i * 10_000,
      converted: i < 1, // 10% baseline
    }));

    const evaluated = herald.evaluatePilot('pilot-1', exposed, holdout);
    expect(evaluated.filteredOut).toBe(8); // the whole farm is gone
    expect(evaluated.exposedRate).toBeCloseTo(0.4);
    expect(evaluated.holdoutRate).toBeCloseTo(0.1);
    expect(evaluated.lift).toBeCloseTo(0.3); // real lift, fraud excluded
  });

  it('Herald: undisclosed forum post is refused — no astroturfing, ever', () => {
    expect(() => herald.forumPost({ body: 'Sycamore is great', disclosed: false })).toThrowError(
      HeraldError,
    );
    expect(herald.forumPost({ body: 'New feature: co-op ads', disclosed: true })).toContain(
      '(disclosed)',
    );
  });
});
