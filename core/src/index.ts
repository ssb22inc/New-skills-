export const WORKSPACE = '@sycamore/core';

export { createDb, databaseUrl } from './db/database.js';
export type { Database } from './db/types.js';
export { migrateToLatest, migrateDownAll, migrateDownOne, createMigrator } from './db/migrator.js';
export { seedMarkets } from './db/seed.js';
export { emitEvent, type OutboxEvent } from './db/outbox.js';
export { usersRepo, type User, type UsersRepo } from './db/repositories/users.js';
export { flagsRepo, isEnabledFor, type FeatureFlag, type FlagsRepo } from './flags/flags.js';
export { createLogger } from './observability/logger.js';
export { MetricsRegistry } from './observability/metrics.js';
export { ErrorBudget, type AlertSink, type ErrorBudgetOptions } from './observability/alerts.js';
export { canaryRelease, type CanaryOptions, type CanaryResult } from './canary/canary.js';
