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
export {
  transition,
  initialSellerState,
  hasVerifiedSurface,
  InvalidTransitionError,
  READINESS_STEPS,
  ORDERS_REQUIRED_FOR_VERIFIED,
  type Readiness,
  type Standing,
  type ReadinessEvent,
  type SellerState,
} from './identity/readiness.js';
export {
  identityService,
  sellerStateOf,
  type IdentityService,
  type Seller,
} from './identity/identity.js';
export {
  capacityEngine,
  CapacityError,
  type CapacityEngine,
  type HoldOutcome,
} from './capacity/engine.js';
export {
  ordersService,
  OrderError,
  type Order,
  type OrderStatus,
  type OrdersService,
} from './orders/orders.js';
export { detectIntent, buildIntentPrompt, INTENTS, type Intent } from './conversations/intents.js';
export {
  authorizeToolCalls,
  INTENT_ALLOW_LIST,
  TOOL_ARG_SCHEMAS,
  type ToolName,
  type ToolPolicy,
  type ToolCallRequest,
  type ToolCallDecision,
} from './conversations/tools.js';
export {
  conversationEngine,
  type ConversationAction,
  type ConversationDeps,
  type ConversationEngine,
} from './conversations/engine.js';
export {
  autopilot,
  type Autopilot,
  type AutopilotDeps,
  type AutopilotResult,
  type ToolExecution,
} from './autopilot/autopilot.js';
export {
  marketsRegistry,
  MarketNotLiveError,
  FlipBlockedError,
  type MarketStatus,
  type MarketsRegistry,
  type FlipRequest,
} from './markets/registry.js';
