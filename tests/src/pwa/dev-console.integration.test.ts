/**
 * The developer console is scaffolding, so it gets the treatment
 * scaffolding usually does not: a gate test. Two things matter about a
 * page whose whole job is to tell a developer the truth — it must be
 * OFF unless the demo flag says otherwise, and it must not lie about
 * money.
 *
 * The second one is not theoretical. `accountBalance` returns
 * debits − credits, so every credit-side account reads negative when it
 * is holding money; the first draft of this page printed that straight
 * and made "platform earned 975,000" look like a loss of the same size.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  capacityEngine,
  createDb,
  databaseUrl,
  identityService,
  ledgerService,
  migrateDownAll,
  migrateToLatest,
  seedMarkets,
} from '@sycamore/core';
import { loadVerticalPack } from '@sycamore/packs';
import { devConsole } from '@sycamore/web';

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
if (!reachable) console.warn('⚠ dev console gate SKIPPED: Postgres unreachable.');

describe.runIf(reachable)('the developer console', () => {
  const db = createDb(databaseUrl());
  const saved = process.env.SYCAMORE_DEMO_INDEX;

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db); // seeds jm as live
    const identity = identityService(db, 'jm');
    const owner = await identity.findOrCreateUserByPhone({
      phone: '+18765557100',
      displayName: 'Console Owner',
      role: 'seller',
    });
    const seller = await identity.createSeller({ userId: owner.id, businessName: 'Console Tours' });
    // This deployment is a DEMO deployment, and says so the way the
    // seeder does. Without the claim the guard treats Console Tours as
    // somebody's real business and closes the console — which is the
    // point of the gate two tests below.
    await db
      .insertInto('feature_flags')
      .values({
        market_id: 'jm',
        key: 'demo_seeded',
        enabled: true,
        description: 'fixture: this market is demo data',
      })
      .execute();
    const startsAt = new Date(Date.now() + 86_400_000);
    await capacityEngine(db, 'jm').createWindow(loadVerticalPack('tours'), {
      sellerId: seller.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 7_200_000),
      totalUnits: 12,
      unitPriceMinor: 900_000,
    });
    const ledger = ledgerService(db, 'jm');
    await ledger.capture({
      orderRef: 'console-1',
      amountMinor: 900_000,
      currency: 'JMD',
      idempotencyKey: 'cap:console-1',
    });
    await ledger.release({
      orderRef: 'console-1',
      currency: 'JMD',
      split: { sellerBps: 8800, platformBps: 1000, referralBps: 0, processorBps: 200 },
      idempotencyKey: 'rel:console-1',
    });
  });

  afterAll(async () => {
    if (saved === undefined) delete process.env.SYCAMORE_DEMO_INDEX;
    else process.env.SYCAMORE_DEMO_INDEX = saved;
    await migrateDownAll(db);
    await db.destroy();
  });

  it('GATE: it 404s unless the demo flag is on', async () => {
    process.env.SYCAMORE_DEMO_INDEX = '0';
    expect((await devConsole(new Request('https://x/dev'))).status).toBe(404);
    // Unset is the same answer as off. The flag defaults ON nowhere —
    // the external review of 2026-09-16 found this surface open on a
    // Vercel deployment because nobody had typed a variable.
    delete process.env.SYCAMORE_DEMO_INDEX;
    expect((await devConsole(new Request('https://x/dev'))).status).toBe(404);
  });

  it('GATE: the console closes when the deployment holds a real seller', async () => {
    process.env.SYCAMORE_DEMO_INDEX = '1';
    expect((await devConsole(new Request('https://x/dev'))).status).toBe(200);
    // A market with sellers and no demo claim is somebody's live
    // business. One is enough to close the scaffolding for everyone,
    // flag or no flag — a developer's convenience does not outrank a
    // buyer's phone number.
    await seedMarkets(db);
    await db.updateTable('markets').set({ status: 'live' }).where('market_id', '=', 'do').execute();
    const identity = identityService(db, 'do');
    const owner = await identity.findOrCreateUserByPhone({
      phone: '+18095557100',
      displayName: 'Real Owner',
      role: 'seller',
    });
    await identity.createSeller({ userId: owner.id, businessName: 'Una Empresa Real' });
    expect((await devConsole(new Request('https://x/dev'))).status).toBe(404);
    // Removing the real seller reopens it — the check is about what the
    // database holds right now, not a latch somebody has to reset.
    await db.deleteFrom('sellers').where('market_id', '=', 'do').execute();
    expect((await devConsole(new Request('https://x/dev'))).status).toBe(200);
  });

  it('GATE: money is shown as a natural balance, never as debits minus credits', async () => {
    process.env.SYCAMORE_DEMO_INDEX = '1';
    const html = await (await devConsole(new Request('https://x/dev'))).text();
    // The platform earned 90,000 of the 900,000 release. It must appear
    // as a positive number, not as -90000.
    expect(html).toContain('>90000<');
    expect(html).not.toContain('>-90000<');
    expect(html).toContain('platform earned');
  });

  it('reports the schema, the markets, the event bus and every surface', async () => {
    process.env.SYCAMORE_DEMO_INDEX = '1';
    const res = await devConsole(new Request('https://x/dev'));
    const html = await res.text();
    expect(res.status).toBe(200); // no problems found
    expect(html).toContain('up to date'); // schema
    expect(html).toContain('trial balance');
    expect(html).toContain('Event bus');
    expect(html).toContain('/cockpit?market=jm');
    expect(html).toContain('/manifest.webmanifest');
    expect(html).toContain('Console Tours'); // the seeded seller's surfaces
  });

  it('says so loudly when the schema is behind', async () => {
    process.env.SYCAMORE_DEMO_INDEX = '1';
    await migrateDownAll(db);
    const res = await devConsole(new Request('https://x/dev'));
    const html = await res.text();
    expect(res.status).toBe(503);
    expect(html).toContain('schema is behind');
    await migrateToLatest(db);
    await seedMarkets(db);
  });
});
