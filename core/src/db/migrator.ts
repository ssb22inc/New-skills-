import type { Kysely } from 'kysely';
import { Migrator, NO_MIGRATIONS, type MigrationResultSet } from 'kysely/migration';
import type { Database } from './types.js';
import { migrationProvider } from './migrations/index.js';

export function createMigrator(db: Kysely<Database>): Migrator {
  return new Migrator({ db: db as Kysely<unknown>, provider: migrationProvider });
}

function throwOnError(results: MigrationResultSet): MigrationResultSet {
  if (results.error) throw results.error;
  return results;
}

/**
 * Which migrations have not run yet, cheapest question first.
 *
 * Asking is not the same as applying, and the difference matters on a
 * host that can freeze a process mid-transaction: a serverless boot
 * should find out whether the schema is behind and say so, not start a
 * twenty-two step migration it may not be alive to finish. One query,
 * no lock, no writes.
 */
export async function pendingMigrations(db: Kysely<Database>): Promise<string[]> {
  const infos = await createMigrator(db).getMigrations();
  return infos.filter((info) => !info.executedAt).map((info) => info.name);
}

export async function migrateToLatest(db: Kysely<Database>): Promise<MigrationResultSet> {
  return throwOnError(await createMigrator(db).migrateToLatest());
}

export async function migrateDownAll(db: Kysely<Database>): Promise<MigrationResultSet> {
  return throwOnError(await createMigrator(db).migrateTo(NO_MIGRATIONS));
}

export async function migrateDownOne(db: Kysely<Database>): Promise<MigrationResultSet> {
  return throwOnError(await createMigrator(db).migrateDown());
}
