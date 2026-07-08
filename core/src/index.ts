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
  glossaryStore,
  applyGlossary,
  type GlossaryEntry,
  type GlossaryStore,
} from './voice/glossary.js';
export { voicePipeline, type VoicePipeline, type VoiceIntentResult } from './voice/pipeline.js';
export {
  genesisEngine,
  GenesisError,
  type GenesisEngine,
  type GenesisDeps,
  type GenesisInbound,
  type GenesisPrompt,
  type GenesisState,
  type GenesisStep,
} from './genesis/genesis.js';
export {
  ledgerService,
  computeSplit,
  LedgerError,
  LEDGER_ACCOUNTS,
  type LedgerService,
  type LedgerAccount,
  type LedgerEntryInput,
  type SplitBps,
} from './ledger/ledger.js';
export { settlementService, type SettlementService } from './settlement/settlement.js';
export {
  shoeboxService,
  TAX_DISCLAIMER,
  type ShoeboxService,
  type ShoeboxPack,
  type ShoeboxTotals,
} from './shoebox/shoebox.js';
export { textPdf } from './shoebox/pdf.js';
export {
  rank,
  blendedScore,
  bayesianRating,
  newcomerShareOfFirstTimeBookings,
  RATING_PRIOR_MEAN,
  RATING_PRIOR_WEIGHT,
  WEIGHTS,
  type SellerSignals,
  type RankedSlot,
  type BookingRecord,
} from './discovery/ranking.js';
export {
  pulseTick,
  allocateBudget,
  mutateDna,
  CTR_FLOOR,
  SCALE_CTR,
  FATIGUE_FREQUENCY,
  type CampaignState,
  type PulseDecision,
} from './pulse/campaigns.js';
export {
  studioPipeline,
  complianceCheck,
  StudioError,
  BANNED_CLAIMS,
  type StudioPipeline,
  type AdOption,
  type ComplianceResult,
} from './studio/studio.js';
export {
  signalsService,
  SignalError,
  LEAD_MIN_DAYS,
  LEAD_MAX_DAYS,
  type SignalsService,
} from './pulse/signals.js';
export {
  overflowService,
  bundleService,
  type OverflowService,
  type BundleService,
  type OverflowAlternative,
  type BundleOffer,
} from './discovery/overflow.js';
export {
  reviewsService,
  ReviewError,
  BURST_THRESHOLD,
  EARLY_DAYS_UNTIL,
  type ReviewsService,
  type ReviewDisplay,
} from './trust/reviews.js';
export {
  disputeService,
  DISPUTE_WINDOW_MS,
  type DisputeService,
  type DisputeOutcome,
  type EvidenceFile,
} from './trust/disputes.js';
export {
  handlePaymentEvent,
  handlePaymentWebhook,
  type PaymentEventOutcome,
} from './payments/handler.js';
export {
  marketsRegistry,
  MarketNotLiveError,
  FlipBlockedError,
  type MarketStatus,
  type MarketsRegistry,
  type FlipRequest,
} from './markets/registry.js';
export { coopService, CoopError, type CoopService } from './pulse/coop.js';
export {
  watchmanService,
  detectDrift,
  GOLDEN_VITALS,
  type GoldenVital,
  type VitalSeries,
  type DriftDirection,
  type WatchmanService,
} from './agents/watchman.js';
export {
  fixerService,
  FixerError,
  type FixerService,
  type ActionExecutor,
} from './agents/fixer.js';
export {
  loadRunbooks,
  runbooksRoot,
  RunbookLoadError,
  RunbookSchema,
  RUNBOOK_ACTIONS,
  type Runbook,
  type RunbookAction,
} from './agents/runbooks.js';
export {
  listenerService,
  COMPLAINT_LANES,
  type ListenerService,
  type ComplaintPattern,
} from './agents/listener.js';
export { scoutService, CLEARANCE, type ScoutService, type RadarProposal } from './agents/scout.js';
export {
  mentorService,
  type MentorService,
  type MentorMessage,
  type MentorFinding,
} from './agents/mentor.js';
export {
  builderPipeline,
  type BuilderPipeline,
  type BuilderRun,
  type BuilderStage,
  type AgentChange,
} from './agents/builder.js';
export {
  bursarService,
  BursarError,
  type BursarService,
  type VendorPricing,
  type SwapProposal,
} from './agents/bursar.js';
export {
  heraldService,
  HeraldError,
  type HeraldService,
  type PilotEvent,
} from './agents/herald.js';
export {
  chairmanService,
  ChairmanError,
  type ChairmanService,
  type MemoItem,
  type WakeInput,
} from './agents/chairman.js';
export { hurricaneMode, HurricaneError, type HurricaneMode } from './hurricane/hurricane.js';
export {
  HURRICANE_RUNBOOK,
  scoreRehearsal,
  type RunbookStep,
  type RehearsalScore,
} from './hurricane/runbook.js';
export {
  passportService,
  verifyPassport,
  canonicalJson,
  generatePassportKeys,
  type PassportService,
  type CreditPassport,
  type PassportPayload,
} from './passport/passport.js';
export {
  liteModeService,
  blackoutMode,
  replayOfflineQueue,
  LifelineError,
  LITE_FLIP,
  type LiteModeService,
  type BlackoutMode,
  type OfflineAction,
} from './lifeline/lifeline.js';
