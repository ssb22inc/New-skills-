import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { loadContextPack } from '@sycamore/packs';
import { mockAds } from '@sycamore/adapters';
import { createDb, databaseUrl } from '../db/database.js';
import { migrateDownAll, migrateToLatest } from '../db/migrator.js';
import { seedMarkets } from '../db/seed.js';
import { EARLY_DAYS_UNTIL } from '../trust/reviews.js';
import { coopService, CoopError } from './coop.js';

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
if (!reachable) console.warn('⚠ P26 gate tests SKIPPED: Postgres unreachable.');

const jm = loadContextPack('jm');
const POOL_SIZE = 24; // gate: a co-op of ≥20 sellers
const NEWCOMERS = 6; // sellers still inside the Discovery audition window

describe.runIf(reachable)('P26 — Ad publishing + co-op pools (gate, mock)', () => {
  const db = createDb(databaseUrl());
  const coop = coopService(db, 'jm', jm);
  const sellerIds: string[] = [];
  const newcomerIds = new Set<string>();

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
    for (let i = 0; i < POOL_SIZE; i++) {
      const user = await db
        .insertInto('users')
        .values({
          market_id: 'jm',
          phone: `+1876555${String(i).padStart(4, '0')}`,
          display_name: `Seller ${i}`,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      const isNewcomer = i < NEWCOMERS;
      const seller = await db
        .insertInto('sellers')
        .values({
          market_id: 'jm',
          user_id: user.id,
          business_name: `Jerk Stop ${i}`,
          parish: 'St. Andrew',
          completed_orders: isNewcomer ? i : EARLY_DAYS_UNTIL + i,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      sellerIds.push(seller.id);
      if (isNewcomer) newcomerIds.add(seller.id);
      await db
        .insertInto('catalog_items')
        .values({
          market_id: 'jm',
          seller_id: seller.id,
          name: `Jerk plate ${i}`,
          photo_ref: `photo-${i}`,
          price_minor: 150_000,
        })
        .execute();
    }
  });

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  it('GATE: ≥20-seller co-op — per-seller landings, badged auditions, spend reconciles to the cent', async () => {
    const pool = await coop.buildPool({
      verticalId: 'food',
      parish: 'St. Andrew',
      trustPageBase: 'https://sycamore.example',
    });
    expect(pool.cards.length).toBe(POOL_SIZE);
    expect(pool.cards.length).toBeGreaterThanOrEqual(20);

    // Every member gets their own landing: their trust page.
    for (const card of pool.cards) {
      expect(card.landingUrl).toBe(`https://sycamore.example/t/jm/${card.sellerId}`);
      expect(card.imageRef).toMatch(/^photo-/);
    }
    // Newcomers ride badged audition cards; veterans do not.
    const auditions = pool.cards.filter((c) => c.audition);
    expect(new Set(auditions.map((c) => c.sellerId))).toEqual(newcomerIds);

    const ads = mockAds();
    const budgetMinor = 500_000; // J$5,000.00 pooled
    const campaign = await coop.launch(ads, pool, budgetMinor);
    expect(ads.campaigns).toHaveLength(1);
    expect(ads.campaigns[0]!.currency).toBe('JMD');
    expect(ads.campaigns[0]!.cards).toHaveLength(POOL_SIZE);

    const result = await coop.reconcile(ads, campaign.id);
    // The ad account charged less than budget; attribution must sum EXACTLY
    // to what was charged — integer minor units, remainder to the top seller.
    expect(result.totalSpendMinor).toBe(Math.floor(budgetMinor * 0.973));
    const attributed = result.attributions.reduce((s, a) => s + a.spendMinor, 0);
    expect(attributed).toBe(result.totalSpendMinor);
    expect(result.attributions).toHaveLength(POOL_SIZE);
    for (const a of result.attributions) expect(Number.isInteger(a.spendMinor)).toBe(true);

    // Attributions persisted, one per seller per campaign.
    const rows = await db
      .selectFrom('coop_attributions')
      .where('campaign_id', '=', campaign.id)
      .selectAll()
      .execute();
    expect(rows).toHaveLength(POOL_SIZE);
    const dbSum = rows.reduce((s, r) => s + Number(r.spend_minor), 0);
    expect(dbSum).toBe(result.totalSpendMinor);

    // The agency-of-record charge landed as one balanced ledger transaction.
    const balance = await coop.ledger.trialBalance();
    expect(balance.debits).toBe(balance.credits);
    expect(balance.debits).toBe(result.totalSpendMinor);

    // Fairness is measurable: audition share of impressions is a number the
    // Chairman can read off, not a vibe.
    const share = result.fairnessShare(newcomerIds);
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThan(1);

    // Reconciliation is once-only — a double webhook cannot double-charge.
    await expect(coop.reconcile(ads, campaign.id)).rejects.toThrowError(/already reconciled/);
  });

  it('an empty pool refuses to launch', async () => {
    const pool = await coop.buildPool({
      verticalId: 'food',
      parish: 'Portland',
      trustPageBase: 'https://sycamore.example',
    });
    expect(pool.cards).toHaveLength(0);
    await expect(coop.launch(mockAds(), pool, 100_000)).rejects.toThrowError(CoopError);
  });
});
