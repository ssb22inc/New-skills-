/**
 * P14 performance gate — a PERMANENT check (BUILD §3, §5.3-1):
 * trust page <100KB transferred first load, interactive <2s on a
 * throttled-3G / 4x-CPU mid-Android profile.
 *
 * Run: docker compose up -d && pnpm --filter @sycamore/web build
 *      && pnpm --filter @sycamore/tests perf:trust
 */
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import {
  capacityEngine,
  createDb,
  databaseUrl,
  identityService,
  migrateToLatest,
  seedMarkets,
} from '@sycamore/core';
import { loadVerticalPack } from '@sycamore/packs';

const PORT = 3105;
const BUDGET_BYTES = 100_000;
const BUDGET_INTERACTIVE_MS = 2_000;

async function seedDemoSeller(): Promise<string> {
  const db = createDb(databaseUrl());
  await migrateToLatest(db);
  await seedMarkets(db);
  const identity = identityService(db, 'jm');
  const engine = capacityEngine(db, 'jm');
  const owner = await identity.findOrCreateUserByPhone({
    phone: '+18760006000',
    displayName: 'Perf Boss',
    role: 'seller',
  });
  const existing = await db
    .selectFrom('sellers')
    .where('user_id', '=', owner.id)
    .selectAll()
    .executeTakeFirst();
  const seller =
    existing ??
    (await identity.createSeller({ userId: owner.id, businessName: 'Perf Reef Tours' }));
  const items = await db
    .selectFrom('catalog_items')
    .where('seller_id', '=', seller.id)
    .selectAll()
    .execute();
  if (items.length === 0) {
    await db
      .insertInto('catalog_items')
      .values({
        market_id: 'jm',
        seller_id: seller.id,
        name: 'Sunset Reef Cruise',
        photo_ref: 'media-demo',
        price_minor: 900_000,
      })
      .execute();
    const startsAt = new Date();
    startsAt.setUTCDate(startsAt.getUTCDate() + 2);
    startsAt.setUTCHours(14, 0, 0, 0);
    await engine.createWindow(loadVerticalPack('tours'), {
      sellerId: seller.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 2 * 60 * 60_000),
      totalUnits: 12,
      unitPriceMinor: 900_000,
    });
  }
  await db.destroy();
  return seller.id;
}

async function main(): Promise<void> {
  const sellerId = await seedDemoSeller();

  const server = spawn('pnpm', ['exec', 'next', 'start', '-p', String(PORT)], {
    cwd: new URL('../../../apps/web', import.meta.url).pathname,
    stdio: 'pipe',
    env: {
      ...process.env,
      SYCAMORE_PACKS_DIR: new URL('../../../packs', import.meta.url).pathname,
    },
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('next start timeout')), 30_000);
    server.stdout.on('data', (d: Buffer) => {
      if (d.toString().includes('Ready')) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.on('exit', (code) => reject(new Error(`next start exited ${code}`)));
  });

  // Preinstalled Chromium; env may pin a different playwright build id.
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : { executablePath: '/opt/pw-browsers/chromium' }),
  });
  try {
    const page = await browser.newPage();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    // Throttled 3G on a mid-Android: 400ms RTT, 400kbps down, 4x CPU slow.
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 400,
      downloadThroughput: (400 * 1024) / 8,
      uploadThroughput: (200 * 1024) / 8,
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    let transferred = 0;
    cdp.on('Network.loadingFinished', (e: { encodedDataLength: number }) => {
      transferred += e.encodedDataLength;
    });

    const url = `http://127.0.0.1:${PORT}/t/jm/${sellerId}`;
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
    const timing = await page.evaluate(() => {
      // Browser context — the tests tsconfig has no DOM lib, so type loosely.
      const nav = performance.getEntriesByType('navigation' as never)[0] as unknown as {
        domInteractive: number;
        loadEventEnd: number;
      };
      return { interactive: nav.domInteractive, load: nav.loadEventEnd };
    });
    const badge = await page.getAttribute('[data-cta="whatsapp"]', 'href');

    console.log(`transferred=${transferred}B interactive=${Math.round(timing.interactive)}ms`);
    console.log(`load=${Math.round(timing.load)}ms cta=${badge}`);

    const pass =
      transferred > 0 &&
      transferred < BUDGET_BYTES &&
      timing.interactive < BUDGET_INTERACTIVE_MS &&
      (badge?.startsWith('https://wa.me/') ?? false);
    console.log(
      pass
        ? `✅ GATE PASSED: <${BUDGET_BYTES / 1000}KB and interactive <${BUDGET_INTERACTIVE_MS}ms on throttled 3G`
        : '❌ GATE FAILED',
    );
    process.exitCode = pass ? 0 : 1;
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
