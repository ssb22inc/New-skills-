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

export async function migrateToLatest(db: Kysely<Database>): Promise<MigrationResultSet> {
  return throwOnError(await createMigrator(db).migrateToLatest());
}

export async function migrateDownAll(db: Kysely<Database>): Promise<MigrationResultSet> {
  return throwOnError(await createMigrator(db).migrateTo(NO_MIGRATIONS));
}

export async function migrateDownOne(db: Kysely<Database>): Promise<MigrationResultSet> {
  return throwOnError(await createMigrator(db).migrateDown());
}
