import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { createDb, databaseUrl } from '../db/database.js';
import { migrateDownAll, migrateToLatest } from '../db/migrator.js';
import { seedMarkets } from '../db/seed.js';
import { identityService, sellerStateOf } from './identity.js';
import { hasVerifiedSurface, InvalidTransitionError } from './readiness.js';

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
  console.warn('⚠ P7 integration tests SKIPPED: Postgres unreachable.');
}

describe.runIf(reachable)('P7 — identity + readiness (persistence)', () => {
  const db = createDb(databaseUrl());
  const identity = identityService(db, 'jm');

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
  });

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  it('phone-first login is idempotent: same number, same user', async () => {
    const first = await identity.findOrCreateUserByPhone({
      phone: '+18761112222',
      displayName: 'Miss Pat',
      role: 'seller',
    });
    const again = await identity.findOrCreateUserByPhone({
      phone: '+18761112222',
      displayName: 'Different Name Later',
    });
    expect(again.id).toBe(first.id);
    expect(again.display_name).toBe('Miss Pat'); // first write wins; edits are explicit
    expect(again.role).toBe('seller');
  });

  it('walks a seller to Verified through persisted events, then survives suspension', async () => {
    const user = await identity.findOrCreateUserByPhone({
      phone: '+18763334444',
      displayName: 'Chef Andre',
      role: 'seller',
    });
    const seller = await identity.createSeller({
      userId: user.id,
      businessName: "Andre's Kitchen",
    });
    expect(seller.readiness).toBe('profile');

    await identity.applySellerEvent(seller.id, 'profile_completed');
    await identity.applySellerEvent(seller.id, 'catalog_added');
    await identity.applySellerEvent(seller.id, 'capacity_configured');
    await identity.applySellerEvent(seller.id, 'order_completed');
    await identity.applySellerEvent(seller.id, 'order_completed');
    const afterTwo = await identity.getSeller(seller.id);
    expect(afterTwo?.readiness).toBe('first_orders');
    await identity.applySellerEvent(seller.id, 'order_completed');

    let row = await identity.getSeller(seller.id);
    expect(row?.readiness).toBe('verified');
    expect(hasVerifiedSurface(sellerStateOf(row!))).toBe(true);

    // Invalid event changes nothing (atomic guard).
    await expect(identity.applySellerEvent(seller.id, 'profile_completed')).rejects.toThrowError(
      InvalidTransitionError,
    );

    // Suspension: surface off, data intact — persisted, not just in memory.
    await identity.applySellerEvent(seller.id, 'suspended');
    row = await identity.getSeller(seller.id);
    expect(hasVerifiedSurface(sellerStateOf(row!))).toBe(false);
    expect(row?.readiness).toBe('verified');
    expect(row?.completed_orders).toBe(3);
    expect(row?.business_name).toBe("Andre's Kitchen");

    await identity.applySellerEvent(seller.id, 'reinstated');
    row = await identity.getSeller(seller.id);
    expect(hasVerifiedSurface(sellerStateOf(row!))).toBe(true);
  });
});
