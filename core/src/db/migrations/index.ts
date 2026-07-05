import type { Migration, MigrationProvider } from 'kysely/migration';
import * as base from './0001_base.js';

/**
 * Static provider: migrations are imported code, not files discovered at
 * runtime, so they survive bundling and need no fs/path configuration.
 * Add new migrations here in order; never edit a shipped one.
 */
export const migrations: Record<string, Migration> = {
  '0001_base': base,
};

export const migrationProvider: MigrationProvider = {
  getMigrations: () => Promise.resolve(migrations),
};
