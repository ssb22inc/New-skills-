/**
 * P36d GATE — `seller_install_rate` renders on the founder cockpit, per
 * market. The founder should be able to see, in five minutes on a
 * Monday, how much of a market can still be reached through a door we
 * own. This test renders the real cockpit route against a real database.
 *
 * The number is watched, never chased: nothing here nags a seller, and
 * the two-offer cap (P36b) is what makes that a promise rather than a
 * preference.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  createDb,
  databaseUrl,
  detectDrift,
  GOLDEN_VITALS,
  identityService,
  installOfferService,
  migrateDownAll,
  migrateToLatest,
  seedMarkets,
  watchmanService,
} from '@sycamore/core';
import { loadContextPack } from '@sycamore/packs';
import type { LlmRouter } from '@sycamore/adapters';
import { cockpitPage as cockpit } from '@sycamore/web';

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
if (!reachable) console.warn('⚠ P36d cockpit test SKIPPED: Postgres unreachable.');

const jm = loadContextPack('jm');
const router: LlmRouter = {
  complete: () => Promise.resolve({ text: 'stub', providerId: 'stub', model: 'x' }),
};

describe('P36d — seller_install_rate is a golden vital', () => {
  it('the Watchman watches it like any other vital', () => {
    expect(GOLDEN_VITALS).toContain('seller_install_rate');
    // A falling install rate is a directional signal, not a threshold:
    // the market is drifting back toward somebody else's door.
    expect(detectDrift({ baseline: [0.6, 0.62, 0.61, 0.59, 0.6], recent: [0.4, 0.38, 0.39] })).toBe(
      'down',
    );
    expect(detectDrift({ baseline: [0.6, 0.62, 0.61, 0.59, 0.6], recent: [0.6, 0.61] })).toBe(
      'stable',
    );
  });
});

describe.runIf(reachable)('P36d — the cockpit renders the install rate (gate)', () => {
  const db = createDb(databaseUrl());

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
    const identity = identityService(db, 'jm');
    const installs = installOfferService(
      { db, router, pack: jm, appOrigin: 'https://sycamore.app' },
      'jm',
    );
    // Four active sellers, one of them installed → 25%.
    for (let i = 0; i < 4; i++) {
      const user = await identity.findOrCreateUserByPhone({
        phone: `+187655500${String(i).padStart(2, '0')}`,
        displayName: `Cockpit Seller ${i}`,
        role: 'seller',
      });
      const seller = await identity.createSeller({
        userId: user.id,
        businessName: `Cockpit Yard ${i}`,
      });
      if (i === 0) await installs.recordInstalled(seller.id);
    }
  });

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  it('GATE: the panel shows installed ÷ active sellers for the requested market', async () => {
    const res = await cockpit(new Request('https://cockpit.sycamore.app/cockpit?market=jm'));
    const html = await res.text();
    expect(html).toContain('data-panel="install-rate"');
    expect(html).toContain('data-install-rate="25"');
    expect(html).toContain('1 of 4 active sellers');
    // Plain numbers, not a chart to interpret (Constitution §3).
    expect(html).toContain('<strong>25%</strong>');
  });

  it('the rate is per market: a market with no sellers reads zero, never NaN', async () => {
    // `do` is a real registered market with no sellers of its own; the
    // panel must not leak `jm` rows into it (market scoping is law).
    const res = await cockpit(new Request('https://cockpit.sycamore.app/cockpit?market=do'));
    const html = await res.text();
    expect(html).toContain('data-install-rate="0"');
    expect(html).toContain('0 of 0 active sellers');
    expect(html).not.toContain('NaN');
  });

  it('the Watchman opens an incident when the install rate drifts down', async () => {
    const opened = await watchmanService(db, 'jm').tick({
      seller_install_rate: { baseline: [0.5, 0.52, 0.49, 0.5, 0.51], recent: [0.2, 0.18, 0.21] },
    });
    expect(opened).toEqual([
      expect.objectContaining({ vital: 'seller_install_rate', direction: 'down' }),
    ]);
  });
});
