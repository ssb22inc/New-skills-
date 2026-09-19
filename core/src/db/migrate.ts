/**
 * Migration CLI. Usage (from repo root):
 *   pnpm --filter @sycamore/core migrate latest   # apply all pending
 *   pnpm --filter @sycamore/core migrate down     # roll back one
 *   pnpm --filter @sycamore/core migrate reset    # roll back everything
 *   pnpm --filter @sycamore/core seed             # insert market rows
 */
import { createDb, databaseUrl } from './database.js';
import { migrateDownAll, migrateDownOne, migrateToLatest } from './migrator.js';
import { seedMarkets } from './seed.js';
import type { MigrationResultSet } from 'kysely/migration';

function report(results: MigrationResultSet): void {
  for (const r of results.results ?? []) {
    console.log(`${r.direction === 'Up' ? '↑' : '↓'} ${r.migrationName}: ${r.status}`);
  }
  if ((results.results ?? []).length === 0) console.log('nothing to do');
}

const command = process.argv[2] ?? 'latest';
const db = createDb(databaseUrl());

try {
  switch (command) {
    case 'latest':
      report(await migrateToLatest(db));
      break;
    case 'down':
      report(await migrateDownOne(db));
      break;
    case 'reset':
      report(await migrateDownAll(db));
      break;
    case 'seed':
      await seedMarkets(db);
      console.log('seeded markets');
      break;
    default:
      console.error(`unknown command: ${command} (expected latest | down | reset | seed)`);
      process.exitCode = 1;
  }
} finally {
  await db.destroy();
}
