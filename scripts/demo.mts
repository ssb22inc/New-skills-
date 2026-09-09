/**
 * THE DEMO SEEDER — see Sycamore working, with zero human gates.
 *
 *   pnpm demo
 *
 * Rebuilds the schema (the ledger is append-only, so a DELETE sweep is
 * refused by design — the honest reset is migrate down and up), seeds
 * the demo market from apps/web/src/demo-seed.ts, and prints the URLs.
 * A deployed instance runs the same seeder once at boot by itself.
 */
import {
  createDb,
  databaseUrl,
  migrateDownAll,
  migrateToLatest,
  seedMarkets,
} from '@sycamore/core';
import { seedDemoMarket } from '@sycamore/web';

const db = createDb(databaseUrl());
const origin = process.env.SYCAMORE_APP_ORIGIN ?? 'http://localhost:3000';

await migrateDownAll(db);
await migrateToLatest(db);
await seedMarkets(db);
console.info('seeding a Jamaican market you can click through…\n');

const s = await seedDemoMarket(db, { appOrigin: origin });
const by = (role: string) => s.sellers.find((x) => x.role === role)!.id;

console.info(
  `  ${s.sellers.length} sellers · ${s.buyers} buyers · ${s.completed} completed · ${s.openNow} still open`,
);
console.info(
  `  ${s.payouts} seller payout(s) · ledger balanced: ${s.ledgerDebits} = ${s.ledgerCredits}\n`,
);
console.info('OPEN THESE:\n');
console.info(`  Demo index         ${origin}/demo   (needs SYCAMORE_DEMO_INDEX=1)`);
console.info(`  Founder cockpit    ${origin}/cockpit?market=jm`);
console.info(`  Trust page (buyer) ${origin}/t/jm/${by('installed')}`);
console.info(`  …the newcomer      ${origin}/t/jm/${by('newcomer')}`);
console.info(`  Show-me-why        ${origin}/why/jm/${by('newcomer')}`);
console.info(`  Sovereign door     ${origin}/c/jm/${by('installed')}`);
console.info(`  Seller's day       ${origin}/s/jm/${by('open-orders')}`);
console.info(`  …with the install offer (earned, seller-only):`);
console.info(`                     ${origin}/s/jm/${by('open-orders')}?offer=1`);
console.info(`\n  A dark market 404s, as it should:  ${origin}/t/do/${by('installed')}`);
console.info(`\n  Chat without WhatsApp:  pnpm demo:chat "how much for saturday?"`);

await db.destroy();
