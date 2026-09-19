/**
 * Constitution §4 GATE — show-me-why has a SURFACE, not just data.
 *
 * "Every automated decision (ranking, budget move, pause, route) can
 *  explain itself in one tap. No black boxes facing users."
 *
 * The audit found the ranking explain-components existing in core and
 * reaching no user anywhere: a law satisfied on paper. One tap from the
 * trust page now lands on the real explanation, in the market's own
 * language, with the same numbers the ranker used.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  blendedScore,
  capacityEngine,
  createDb,
  databaseUrl,
  identityService,
  migrateDownAll,
  migrateToLatest,
  seedMarkets,
} from '@sycamore/core';
import { loadVerticalPack } from '@sycamore/packs';
import { trustPage, whyPage } from '@sycamore/web';

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
if (!reachable) console.warn('⚠ show-me-why tests SKIPPED: Postgres unreachable.');

const tours = loadVerticalPack('tours');

describe.runIf(reachable)('Constitution §4 — show-me-why, in one tap', () => {
  const db = createDb(databaseUrl());
  let sellerId = '';

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
    const identity = identityService(db, 'jm');
    const owner = await identity.findOrCreateUserByPhone({
      phone: '+18765920000',
      displayName: 'Why Owner',
      role: 'seller',
    });
    const seller = await identity.createSeller({ userId: owner.id, businessName: 'Why Tours' });
    sellerId = seller.id;
    await capacityEngine(db, 'jm').createWindow(tours, {
      sellerId,
      startsAt: new Date('2026-11-25T14:00:00Z'),
      endsAt: new Date('2026-11-25T16:00:00Z'),
      totalUnits: 10,
      unitPriceMinor: 100_000,
    });
  });

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  it('GATE: the trust page carries the tap', async () => {
    const res = await trustPage(new Request('https://x/'), {
      params: Promise.resolve({ market: 'jm', seller: sellerId }),
    });
    const html = await res.text();
    expect(html).toContain('data-why');
    expect(html).toContain(`/why/jm/${sellerId}`);
  });

  it('GATE: the explanation names every component of the decision', async () => {
    const res = await whyPage(new Request('https://x/'), {
      params: Promise.resolve({ market: 'jm', seller: sellerId }),
    });
    const html = await res.text();
    for (const line of ['rating', 'response', 'acceptance', 'cancellation', 'availability']) {
      expect(html, `the "${line}" component is not explained`).toContain(`data-why-line="${line}"`);
    }
    // A newcomer is told plainly that the slot is an audition.
    expect(html).toContain('data-why-line="newcomer"');
    expect(html).toContain('data-why-score=');
  });

  it('the number shown IS the number the ranker used — not a display figure', async () => {
    const res = await whyPage(new Request('https://x/'), {
      params: Promise.resolve({ market: 'jm', seller: sellerId }),
    });
    const html = await res.text();
    const shown = Number(/data-why-score="([\d.]+)"/.exec(html)?.[1]);
    // Same inputs, same pure function, straight from core.
    const expected = blendedScore({
      sellerId,
      ratingSum: 0,
      ratingCount: 0,
      responseP50Seconds: 15 * 60,
      acceptanceRate: 0,
      cancellationRate: 0,
      availabilityFit: 1,
      newcomer: true,
    }).score;
    expect(shown).toBeCloseTo(expected, 4);
  });

  it('a dark market explains nothing — region lockdown holds here too', async () => {
    const res = await whyPage(new Request('https://x/'), {
      params: Promise.resolve({ market: 'do', seller: sellerId }),
    });
    expect(res.status).toBe(404);
  });
});
