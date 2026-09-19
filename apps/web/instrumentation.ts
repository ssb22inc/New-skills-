import { databaseUrlCandidates, deployDefaults } from './src/deploy-defaults.js';

/**
 * Boot-time setup for a deployed instance.
 *
 * Next calls `register()` once per server start — on a serverless host,
 * once per cold start. That makes it the right place to ASK what state
 * the database is in, and, on a long-lived server, the right place to
 * fix it.
 *
 * It is not the right place to fix it on a serverless host, and that
 * distinction was learned the hard way on 2026-09-16. A serverless
 * instance may be frozen the moment it answers the request that woke it,
 * so a migration started here can be cut off mid-transaction. What that
 * looked like: Kysely's two bookkeeping tables created, twenty-two
 * migrations rolled back, not one line logged, and every retry identical.
 * A schema that is behind is a deploy-time problem with a deploy-time
 * fix; the app's job is to say so in one sentence, not to race the
 * platform's freeze and lose silently.
 *
 * So: always probe (one read-only query), apply only where applying is
 * safe (`SYCAMORE_MIGRATE_ON_BOOT=1`, which the Docker image sets), and
 * otherwise report. Everything here is safe to repeat — the probe writes
 * nothing, `seedMarkets` uses onConflict-do-nothing, the demo seed is
 * guarded by an atomic one-row claim so parallel cold starts cannot
 * double-seed, and the ledger is append-only.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { migrateOnBoot, demoSeedOnBoot, appOrigin } = deployDefaults();

  const {
    createDb,
    databaseUrl,
    describeDatabaseUrl,
    migrateToLatest,
    pendingMigrations,
    seedMarkets,
  } = await import('@sycamore/core');
  const configured = databaseUrl();

  // Find a database that answers, using the cheapest question there is.
  // Only Supabase pooler URLs get a second candidate (see
  // databaseUrlCandidates); everything else is tried once.
  let db: ReturnType<typeof createDb> | undefined;
  let pending: string[] | undefined;
  for (const candidate of databaseUrlCandidates(configured)) {
    const attempt = createDb(candidate);
    try {
      pending = await pendingMigrations(attempt);
      db = attempt;
      if (candidate !== configured) {
        process.env.DATABASE_URL = candidate;
        console.warn(`[sycamore] pooler cluster corrected to ${new URL(candidate).host}`);
      }
      break;
    } catch (err) {
      await attempt.destroy();
      if (!/tenant or user not found/i.test(String(err))) {
        // The shape, not the secret — the same line /demo shows, so a
        // log and a phone screen tell the same story.
        console.error(`[sycamore] cannot reach ${describeDatabaseUrl(candidate)}`, err);
        return;
      }
    }
  }
  if (!db || !pending) {
    console.error('[sycamore] no database candidate accepted the connection');
    return;
  }

  try {
    if (pending.length > 0) {
      if (!migrateOnBoot) {
        console.error(
          `[sycamore] the database is behind by ${pending.length} migration(s): ` +
            `${pending.join(', ')}. This instance will not apply them — a serverless ` +
            'process can be frozen mid-transaction and leave the schema half-built. ' +
            'Run `pnpm --filter @sycamore/core migrate latest` against it from somewhere ' +
            'that will still be alive when it finishes, or set SYCAMORE_MIGRATE_ON_BOOT=1 ' +
            'on a long-lived server.',
        );
        return;
      }
      await migrateToLatest(db);
      console.info(`[sycamore] applied ${pending.length} migration(s)`);
    }

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
