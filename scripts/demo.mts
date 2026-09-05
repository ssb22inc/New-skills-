/**
 * THE DEMO SEEDER — see Sycamore working, with zero human gates.
 *
 *   pnpm demo
 *
 * None of the outstanding human gates (payment credentials, ad accounts,
 * WhatsApp verification) are needed to watch the product work. Every
 * external thing is behind an adapter, and the mock adapters are real
 * implementations of those ports — so this seeds a believable Jamaican
 * market and hands you URLs to click.
 *
 * What is REAL here: the capacity engine, the double-entry ledger, the
 * ranking maths, the fairness meter, the agent report cards, the region
 * lockdown, every page you open. What is mocked: the payment partner,
 * the ad platforms, and the messaging carrier — the three things that
 * need somebody to sign something.
 *
 * Safe to re-run: it drops and rebuilds the demo market from scratch.
 */
import {
  createDb,
  databaseUrl,
  migrateDownAll,
  capacityEngine,
  identityService,
  installOfferService,
  ledgerService,
  migrateToLatest,
  ordersService,
  recordMentorMessage,
  recordPilot,
  recordSwapReview,
  reviewsService,
  scoutService,
  seedMarkets,
  settlementService,
  listenerService,
  watchmanService,
} from '@sycamore/core';
import { loadContextPack, loadVerticalPack } from '@sycamore/packs';

const MARKET = 'jm';
const jm = loadContextPack(MARKET);
const tours = loadVerticalPack('tours');
const food = loadVerticalPack('food');

const db = createDb(databaseUrl());
const identity = identityService(db, MARKET);
const capacity = capacityEngine(db, MARKET);
const orders = ordersService(db, MARKET);
const ledger = ledgerService(db, MARKET);
const reviews = reviewsService(db, MARKET);
const settlement = settlementService(db, MARKET, jm);

/** Copy is never rendered on the demo path; the router is unused. */
const router = { complete: () => Promise.reject(new Error('demo does not call the model')) };
const installs = installOfferService(
  { db, router, pack: jm, appOrigin: process.env.SYCAMORE_APP_ORIGIN ?? 'http://localhost:3000' },
  MARKET,
);

function daysFromNow(days: number, hour: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

async function resetDemoData(): Promise<void> {
  // NOT a DELETE sweep: the ledger is append-only and a Postgres trigger
  // refuses to delete from it — correctly, since "no order settles twice"
  // depends on history that cannot be rewritten. The honest way to get a
  // clean demo is to rebuild the schema.
  await migrateDownAll(db);
  await migrateToLatest(db);
  await seedMarkets(db);
}

async function makeSeller(input: {
  phone: string;
  owner: string;
  business: string;
  vertical: 'tours' | 'food';
  completedOrders: number;
  parish: string;
  items: { name: string; priceMinor: number }[];
}) {
  const user = await identity.findOrCreateUserByPhone({
    phone: input.phone,
    displayName: input.owner,
    role: 'seller',
  });
  const seller = await identity.createSeller({ userId: user.id, businessName: input.business });
  await db
    .updateTable('sellers')
    .set({
      completed_orders: input.completedOrders,
      parish: input.parish,
      readiness: input.completedOrders >= 3 ? 'verified' : 'first_orders',
    })
    .where('id', '=', seller.id)
    .execute();

  for (const item of input.items) {
    await db
      .insertInto('catalog_items')
      .values({
        market_id: MARKET,
        seller_id: seller.id,
        name: item.name,
        photo_ref: `demo-photo:${item.name.toLowerCase().replace(/\W+/g, '-')}`,
        price_minor: item.priceMinor,
      })
      .execute();
  }

  const pack = input.vertical === 'tours' ? tours : food;
  const windows = [];
  for (const day of [1, 2, 4, 6]) {
    windows.push(
      await capacity.createWindow(pack, {
        sellerId: seller.id,
        startsAt: daysFromNow(day, 14),
        endsAt: daysFromNow(day, 16),
        totalUnits: input.vertical === 'tours' ? 12 : 40,
        unitPriceMinor: input.items[0]!.priceMinor,
      }),
    );
  }
  return { user, seller, windows, vertical: input.vertical };
}

async function main(): Promise<void> {
  await resetDemoData();

  console.info('seeding a Jamaican market you can click through…\n');

  // ── Three sellers: an incumbent, a mid-sized one, and a newcomer ──
  const seaBreeze = await makeSeller({
    phone: '+18765550101',
    owner: 'Miss Pat',
    business: 'Sea Breeze Boat Tours',
    vertical: 'tours',
    completedOrders: 47,
    parish: 'St Ann',
    items: [
      { name: 'Half-day snorkel trip', priceMinor: 900_000 },
      { name: 'Sunset cruise (per seat)', priceMinor: 650_000 },
      { name: 'Private charter, 3 hours', priceMinor: 4_500_000 },
    ],
  });
  const mamaJ = await makeSeller({
    phone: '+18765550102',
    owner: 'Delroy',
    business: "Mama J's Kitchen",
    vertical: 'food',
    completedOrders: 12,
    parish: 'Kingston',
    items: [
      { name: 'Curry goat plate', priceMinor: 150_000 },
      { name: 'Escovitch fish plate', priceMinor: 180_000 },
      { name: 'Ital stew (vegan)', priceMinor: 120_000 },
    ],
  });
  const blueHole = await makeSeller({
    phone: '+18765550103',
    owner: 'Shanice',
    business: 'Blue Hole Adventures',
    vertical: 'tours',
    completedOrders: 2, // still a newcomer — the exposure floor applies
    parish: 'St Ann',
    items: [
      { name: 'Blue Hole guided swim', priceMinor: 500_000 },
      { name: 'River tubing, 2 hours', priceMinor: 400_000 },
    ],
  });

  // ── Buyers, bookings and real money on the ledger ─────────────────
  const buyers = [];
  for (let i = 0; i < 14; i++) {
    buyers.push(
      await identity.findOrCreateUserByPhone({
        phone: `+1876555${String(2000 + i).padStart(4, '0')}`,
        displayName:
          ['Andre', 'Kemar', 'Tanya', 'Simone', 'Rohan', 'Nadine', 'Devon'][i % 7] + ` ${i}`,
      }),
    );
  }

  let completed = 0;
  let openNow = 0;
  const plan: { host: typeof seaBreeze; buyer: (typeof buyers)[number]; finish: boolean }[] = [];
  // Most first-time buyers go to the incumbent; some to the newcomer —
  // this is what makes the fairness meter say something real.
  for (const [i, buyer] of buyers.entries()) {
    const host = i % 4 === 0 ? blueHole : i % 3 === 0 ? mamaJ : seaBreeze;
    // Leave a couple of bookings open on every seller, so the seller's
    // day has work waiting on it and the cockpit has money in escrow.
    const finish = !(i % 5 === 0 || i === 3 || i === 9);
    plan.push({ host, buyer, finish });
  }

  for (const [i, { host, buyer, finish }] of plan.entries()) {
    const window = host.windows[i % host.windows.length]!;
    const draft = await orders.createDraft({
      sellerId: host.seller.id,
      buyerUserId: buyer.id,
      windowId: window.id,
      verticalId: host.vertical,
      units: 1 + (i % 2),
    });
    await orders.placeHold(draft.id);
    await orders.confirm(draft.id);

    const amount = Number(window.unit_price_minor) * (1 + (i % 2));
    await ledger.capture({
      orderRef: draft.id,
      amountMinor: amount,
      currency: jm.currency.code,
      idempotencyKey: `demo-capture:${draft.id}`,
    });

    if (finish) {
      const pack = host.vertical === 'tours' ? tours : food;
      await orders.complete(draft.id, pack.booking.completion_proof[0]!, pack);
      await settlement.releaseForOrder(draft.id);
      completed++;
      // A few of them leave a verified review — only completed, paid
      // bookings can, which is the whole point of P20.
      if (i % 3 === 0) {
        await reviews.submitReview({
          orderId: draft.id,
          buyerUserId: buyer.id,
          rating: i % 9 === 0 ? 3 : 5,
          body:
            i % 9 === 0
              ? 'Good trip but we started late.'
              : 'Perfect day out — captain knew every spot.',
          deviceId: `demo-device-${i}`,
        });
      }
    } else {
      openNow++;
    }
  }

  // One payout batch, so the money panel has an outgoing side.
  const payouts = await settlement.runPayoutBatch('demo-batch-1');

  // ── The installed client: one seller in, one offered, one untouched ─
  await installs.recordInstalled(seaBreeze.seller.id);

  // ── The agent crew's audit record, so the cockpit is not empty ─────
  // These are the REAL services doing their real jobs on demo data —
  // the Watchman genuinely detects the drift below, it is not a row
  // inserted to make a panel look populated.
  await watchmanService(db, MARKET).tick({
    webhook_lag_ms: { baseline: [120, 118, 125, 119, 121], recent: [340, 380, 410] },
    channel_quality_rating: { baseline: [0.94, 0.93, 0.95, 0.94], recent: [0.71, 0.68] },
  });

  const listener = listenerService(db, MARKET);
  const monthKey = new Date().toISOString().slice(0, 7);
  for (const [i, buyer] of buyers.slice(0, 8).entries()) {
    await listener.sendMonthlySurvey(buyer.id, monthKey);
    await listener.recordResponse({
      userId: buyer.id,
      thumbsUp: i % 4 !== 0,
      ...(i % 4 === 0 ? { comment: 'the payment link was slow to load' } : {}),
    });
  }

  const scout = scoutService(db, MARKET);
  await scout.propose({
    lane: 'barber shops — walk-in queue',
    painScore: 82,
    marketScore: 71,
    laneClearance: true,
    revenueEstimateMinor: 4_200_000,
    source: 'listener patterns + founder interviews',
  });
  await scout.propose({
    lane: 'wedding photographers',
    painScore: 41,
    marketScore: 63,
    laneClearance: true,
    revenueEstimateMinor: 900_000,
    source: 'inbound requests',
  });
  await recordSwapReview(db, MARKET, {
    proposals: [
      {
        lane: 'asr',
        fromVendorId: 'premium-asr',
        toVendorId: 'value-asr',
        monthlySavingMinor: 380_000,
      },
    ],
    blocked: [
      { lane: 'llm', vendorId: 'cheapest-llm', reason: 'no signed DPA and this lane carries PII' },
    ],
  });
  await recordPilot(db, MARKET, {
    pilotId: 'irie-fm-morning',
    lift: 0.09,
    filteredOut: 12,
    sample: 340,
  });
  await recordMentorMessage(db, MARKET, mamaJ.seller.id, {
    suggestions: [
      {
        signal: 'photo_freshness',
        text: 'demo',
        source: { kind: 'catalog', evidence: 'photos older than 60 days' },
      },
    ],
    strength: null,
    message: 'demo',
  });

  const balance = await ledger.trialBalance();
  const origin = process.env.SYCAMORE_APP_ORIGIN ?? 'http://localhost:3000';

  console.info(
    `  3 sellers · ${buyers.length} buyers · ${completed} completed · ${openNow} still open`,
  );
  console.info(
    `  ${payouts.length} seller payout(s) · ledger balanced: ${balance.debits} = ${balance.credits}\n`,
  );
  console.info('OPEN THESE:\n');
  console.info(`  Founder cockpit    ${origin}/cockpit?market=jm`);
  console.info(`  Trust page (buyer) ${origin}/t/jm/${seaBreeze.seller.id}`);
  console.info(`  …the newcomer      ${origin}/t/jm/${blueHole.seller.id}`);
  console.info(`  Show-me-why        ${origin}/why/jm/${blueHole.seller.id}`);
  console.info(`  Sovereign door     ${origin}/c/jm/${seaBreeze.seller.id}`);
  console.info(`  Seller's day       ${origin}/s/jm/${mamaJ.seller.id}`);
  console.info(`  …with the install offer (earned, seller-only):`);
  console.info(`                     ${origin}/s/jm/${mamaJ.seller.id}?offer=1`);
  console.info(`\n  A dark market 404s, as it should:  ${origin}/t/do/${seaBreeze.seller.id}`);
  console.info(`\n  Chat without WhatsApp:  pnpm demo:chat "how much for saturday?"`);
}

await main();
await db.destroy();
