import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { loadContextPack, loadVerticalPack } from '@sycamore/packs';
import { createLlmRouter, mockProvider } from '@sycamore/adapters';
import { createDb, databaseUrl } from '../db/database.js';
import { migrateDownAll, migrateToLatest } from '../db/migrator.js';
import { seedMarkets } from '../db/seed.js';
import { genesisEngine, GenesisError } from './genesis.js';
import { sellerStateOf } from '../identity/identity.js';

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
if (!reachable) console.warn('⚠ P13 gate tests SKIPPED: Postgres unreachable.');

const jm = loadContextPack('jm');
const tours = loadVerticalPack('tours');
const food = loadVerticalPack('food');

function creativeRouter() {
  const provider = mockProvider({
    id: 'creative',
    reply: (req) =>
      req.prompt.includes('vertical: tours') && req.system?.includes('business names')
        ? 'Reef Runner Tours\nBlue Water Rides\nIsland Hop Charters'
        : 'Wi launch tomorrow! First 12 seats — come sail wid wi. Book now!',
  });
  return createLlmRouter([{ provider, dpaSigned: true }], {
    'routine-reply': { primary: 'creative', fallbacks: [] },
    'intent-detection': { primary: 'creative', fallbacks: [] },
    'money-math': { primary: 'creative', fallbacks: [] },
    compliance: { primary: 'creative', fallbacks: [] },
    creative: { primary: 'creative', fallbacks: [] },
  });
}

describe.runIf(reachable)('P13 — Genesis flow (synthetic gate: one session, chat only)', () => {
  const db = createDb(databaseUrl());
  const verticalPacks = new Map([
    ['tours', tours],
    ['food', food],
  ]);

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
  });

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  it('GATE: a synthetic seller goes from first message to approved broadcast in ONE session', async () => {
    const genesis = genesisEngine(
      { db, router: creativeRouter(), contextPack: jm, verticalPacks },
      'jm',
    );
    const phone = '+18760005000';
    let exchanges = 0;
    const send = async (inbound: Parameters<typeof genesis.handle>[1]) => {
      exchanges++;
      return genesis.handle(phone, inbound);
    };

    // 1. First contact (a voice note saying they want to start a business).
    const p1 = await send({ kind: 'voice', text: 'mi want fi start a likkle tour business' });
    expect(p1).toEqual({ ask: 'vertical', options: ['tours', 'food'] });

    // 2. Picks tours (tap).
    const p2 = await send({ kind: 'tap', tapPayload: 'tours' });
    expect(p2.ask).toBe('pick_name');
    if (p2.ask !== 'pick_name') throw new Error('unreachable');
    expect(p2.options).toHaveLength(3);
    expect(p2.options[0]).toBe('Reef Runner Tours');

    // 3. Picks a name (tap of option text).
    const p3 = await send({ kind: 'tap', tapPayload: 'Reef Runner Tours' });
    expect(p3).toEqual({ ask: 'first_photo' });

    // 4. Sends a photo of the boat (catalog build via chat).
    const p4 = await send({ kind: 'image', mediaRef: 'media-boat-1' });
    expect(p4.ask).toBe('item_name');
    if (p4.ask !== 'item_name') throw new Error('unreachable');
    expect(p4.suggestedPriceMinor).toBe(900_000); // pricing FROM PACK BENCHMARK

    // 5. Names the offering (voice).
    const p5 = await send({ kind: 'voice', text: 'Sunset Reef Cruise' });
    expect(p5).toEqual({ ask: 'capacity_units', unitPlural: 'seats' }); // unit from pack

    // 6. Capacity by voice: "twelve" as digits after ASR normalization.
    const p6 = await send({ kind: 'voice', text: '12' });
    expect(p6.ask).toBe('approve_broadcast');
    if (p6.ask !== 'approve_broadcast') throw new Error('unreachable');
    expect(p6.draft).toContain('Book now');

    // 7. 👍 approval tap.
    const p7 = await send({ kind: 'tap', tapPayload: 'approve' });
    expect(p7).toEqual({ ask: 'nothing', done: true });

    // ONE session: seven exchanges, no human help, no dashboard.
    expect(exchanges).toBe(7);

    // The world Genesis built, verified from the database:
    const seller = await db
      .selectFrom('sellers')
      .where('business_name', '=', 'Reef Runner Tours')
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(sellerStateOf(seller).readiness).toBe('first_orders'); // profile+catalog+capacity done

    const items = await db
      .selectFrom('catalog_items')
      .where('seller_id', '=', seller.id)
      .selectAll()
      .execute();
    expect(items).toHaveLength(1);
    expect(items[0]?.name).toBe('Sunset Reef Cruise');
    expect(items[0]?.photo_ref).toBe('media-boat-1'); // the REAL photo, nothing generated
    expect(Number(items[0]?.price_minor)).toBe(900_000);

    const windows = await db
      .selectFrom('capacity_windows')
      .where('seller_id', '=', seller.id)
      .selectAll()
      .execute();
    expect(windows).toHaveLength(1);
    expect(windows[0]?.total_units).toBe(12);
    expect(Number(windows[0]?.unit_price_minor)).toBe(900_000);

    const topics = (await db.selectFrom('events_outbox').select('topic').execute()).map(
      (e) => e.topic,
    );
    expect(topics).toContain('trust_page.requested'); // P14 pickup point
    expect(topics).toContain('broadcast.approved');
  });

  it('re-prompts instead of advancing on wrong-kind replies (voice-first resilience)', async () => {
    const genesis = genesisEngine(
      { db, router: creativeRouter(), contextPack: jm, verticalPacks },
      'jm',
    );
    const phone = '+18760005001';
    await genesis.handle(phone, { kind: 'text', text: 'hello' });
    // Answers something that is not a vertical → asked again, not crashed.
    const again = await genesis.handle(phone, { kind: 'text', text: 'mi nuh know' });
    expect(again.ask).toBe('vertical');
    await genesis.handle(phone, { kind: 'text', text: 'food' });
    // Sends text where a photo is needed after name pick.
    await genesis.handle(phone, { kind: 'text', text: 'Likkle Kitchen' });
    const needPhoto = await genesis.handle(phone, { kind: 'text', text: 'mi soon send it' });
    expect(needPhoto.ask).toBe('first_photo');
    // Food benchmark drives food pricing.
    const photo = await genesis.handle(phone, { kind: 'image', mediaRef: 'media-pot-1' });
    if (photo.ask !== 'item_name') throw new Error('unreachable');
    expect(photo.suggestedPriceMinor).toBe(150_000);
  });

  it('a vertical without a benchmark refuses onboarding loudly', async () => {
    const noBenchmarkPack = { ...jm, benchmarks: {} };
    const genesis = genesisEngine(
      { db, router: creativeRouter(), contextPack: noBenchmarkPack, verticalPacks },
      'jm',
    );
    const phone = '+18760005002';
    await genesis.handle(phone, { kind: 'text', text: 'start' });
    await genesis.handle(phone, { kind: 'text', text: 'tours' });
    await genesis.handle(phone, { kind: 'text', text: 'No Benchmark Tours' });
    await expect(
      genesis.handle(phone, { kind: 'image', mediaRef: 'media-x' }),
    ).rejects.toThrowError(GenesisError);
  });
});
