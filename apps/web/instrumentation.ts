import { databaseUrlCandidates, deployDefaults } from './src/deploy-defaults.js';

/**
 * Boot-time setup for a deployed instance.
 *
 * Next calls `register()` once per server start — on a serverless host,
 * once per cold start. That makes it the right place to bring the schema
 * up to date and, on a brand-new database, to seed the demo market: the
 * first person to open the link should see a working product, not an
 * empty one.
 *
 * Every step is safe to repeat. The migrator skips what has run,
 * `seedMarkets` uses onConflict-do-nothing, the demo seed is guarded by
 * an atomic one-row claim so parallel cold starts cannot double-seed,
 * and the ledger is append-only so nothing here can rewrite history.
 *
 * Which steps run is decided in deploy-defaults.ts: ON by default on
 * Vercel, OFF elsewhere unless the environment says `1`.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { migrateOnBoot, demoSeedOnBoot, appOrigin } = deployDefaults();
  if (!migrateOnBoot) return;

  const { createDb, databaseUrl, migrateToLatest, seedMarkets } = await import('@sycamore/core');
  const configured = databaseUrl();

  // Find a database that answers. Only Supabase pooler URLs get a second
  // candidate (see databaseUrlCandidates); everything else is tried once.
  let db: ReturnType<typeof createDb> | undefined;
  for (const candidate of databaseUrlCandidates(configured)) {
    const attempt = createDb(candidate);
    try {
      await migrateToLatest(attempt);
      db = attempt;
      if (candidate !== configured) {
        process.env.DATABASE_URL = candidate;
        console.warn(`[sycamore] pooler cluster corrected to ${new URL(candidate).host}`);
      }
      break;
    } catch (err) {
      await attempt.destroy();
      if (!/tenant or user not found/i.test(String(err))) {
        console.error('[sycamore] boot migration failed', err);
        return;
      }
    }
  }
  if (!db) {
    console.error('[sycamore] no database candidate accepted the connection');
    return;
  }

  try {
    await seedMarkets(db);
    console.info('[sycamore] schema up to date, markets seeded');

    if (demoSeedOnBoot) {
      const { claimDemoSeed, releaseDemoSeed, seedDemoMarket } = await import('./src/demo-seed.js');
      if (await claimDemoSeed(db)) {
        try {
          const summary = await seedDemoMarket(db, { appOrigin });
          console.info(
            `[sycamore] demo market seeded: ${summary.sellers.length} sellers, ` +
              `${summary.buyers} buyers, ledger ${summary.ledgerDebits} = ${summary.ledgerCredits}`,
          );
        } catch (err) {
          await releaseDemoSeed(db);
          throw err;
        }
      }
    }
  } catch (err) {
    // Fail loudly in the logs but let the server come up: the health
    // endpoint and the honest 500 are more useful than a crash loop
    // nobody can read.
    console.error('[sycamore] boot setup failed', err);
  } finally {
    await db.destroy();
  }
}
