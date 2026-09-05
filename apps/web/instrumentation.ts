/**
 * Boot-time setup for a deployed instance.
 *
 * Next calls `register()` once, before the first request is served. That
 * makes it the right place to bring the schema up to date: a fresh
 * deploy has an empty database, and a page that 500s because nobody ran
 * migrations is a bad first impression of a product whose whole promise
 * is that the money is right.
 *
 * Both steps are idempotent — the migrator skips what has run, and
 * `seedMarkets` uses onConflict-do-nothing so a restart never clobbers a
 * status set by a flip ceremony. The ledger is append-only, so nothing
 * here can rewrite history.
 *
 * Off by default: a developer running `next start` against their own
 * database decides when migrations happen. The deployed image sets
 * `SYCAMORE_MIGRATE_ON_BOOT=1`.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.SYCAMORE_MIGRATE_ON_BOOT !== '1') return;

  const { createDb, databaseUrl, migrateToLatest, seedMarkets } = await import('@sycamore/core');
  const db = createDb(process.env.DATABASE_URL ?? databaseUrl());
  try {
    await migrateToLatest(db);
    await seedMarkets(db);
    console.info('[sycamore] schema up to date, markets seeded');
  } catch (err) {
    // Fail loudly in the logs but let the server come up: the health
    // endpoint and the honest 500 are more useful than a crash loop
    // nobody can read.
    console.error('[sycamore] boot migration failed', err);
  } finally {
    await db.destroy();
  }
}
