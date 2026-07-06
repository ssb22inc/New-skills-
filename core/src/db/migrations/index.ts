import type { Migration, MigrationProvider } from 'kysely/migration';
import * as base from './0001_base.js';
import * as featureFlags from './0002_feature_flags.js';
import * as marketStatus from './0003_market_status.js';
import * as identity from './0004_identity.js';
import * as capacity from './0005_capacity.js';
import * as orders from './0006_orders.js';
import * as conversations from './0007_conversations.js';
import * as windowPrice from './0008_window_price.js';
import * as asrGlossary from './0009_asr_glossary.js';
import * as catalog from './0010_catalog.js';
import * as ledger from './0011_ledger.js';

/**
 * Static provider: migrations are imported code, not files discovered at
 * runtime, so they survive bundling and need no fs/path configuration.
 * Add new migrations here in order; never edit a shipped one.
 */
export const migrations: Record<string, Migration> = {
  '0001_base': base,
  '0002_feature_flags': featureFlags,
  '0003_market_status': marketStatus,
  '0004_identity': identity,
  '0005_capacity': capacity,
  '0006_orders': orders,
  '0007_conversations': conversations,
  '0008_window_price': windowPrice,
  '0009_asr_glossary': asrGlossary,
  '0010_catalog': catalog,
  '0011_ledger': ledger,
};

export const migrationProvider: MigrationProvider = {
  getMigrations: () => Promise.resolve(migrations),
};
