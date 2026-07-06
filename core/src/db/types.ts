import type { Generated, JSONColumnType } from 'kysely';

/**
 * Every table carries `market_id` (CLAUDE.md data rules). On `markets` itself
 * the primary key IS the market id, so the column is named `market_id` there too.
 */

export interface MarketsTable {
  market_id: string;
  name: string;
  currency_code: string;
  timezone: string;
  /** 'live' | 'dark' | 'retired' — defaults DARK; only a flip ceremony goes live. */
  status: Generated<string>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface UsersTable {
  id: Generated<string>;
  market_id: string;
  /** E.164 phone number — WhatsApp number is the login (Constitution §1). */
  phone: string;
  display_name: string;
  role: Generated<string>;
  /** standard | restricted — refund-abuse downgrades privileges (P18). */
  trust_level: Generated<string>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SellersTable {
  id: Generated<string>;
  market_id: string;
  user_id: string;
  business_name: string;
  /** P7 readiness gate: profile → catalog → capacity → first_orders → verified. */
  readiness: Generated<string>;
  /** active | suspended — orthogonal to readiness progress. */
  standing: Generated<string>;
  completed_orders: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface EventsOutboxTable {
  id: Generated<string>;
  market_id: string;
  topic: string;
  payload: JSONColumnType<Record<string, unknown>>;
  /** NULL until the outbox dispatcher publishes the event. */
  published_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface FeatureFlagsTable {
  market_id: string;
  key: string;
  enabled: boolean;
  /** 0–10000 basis points; 500 = 5% canary. */
  rollout_bps: Generated<number>;
  description: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CapacityWindowsTable {
  id: Generated<string>;
  market_id: string;
  seller_id: string;
  vertical_id: string;
  starts_at: Date | string;
  ends_at: Date | string;
  total_units: number;
  /** Integer minor units; currency comes from the market's context pack. */
  unit_price_minor: string | number | bigint;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CapacityHoldsTable {
  id: Generated<string>;
  market_id: string;
  window_id: string;
  user_id: string;
  units: number;
  /** held | confirmed | released | expired */
  status: Generated<string>;
  expires_at: Date | string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CapacityWaitlistTable {
  id: Generated<string>;
  market_id: string;
  window_id: string;
  user_id: string;
  units: number;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OrdersTable {
  id: Generated<string>;
  market_id: string;
  seller_id: string;
  buyer_user_id: string;
  window_id: string;
  hold_id: string | null;
  vertical_id: string;
  units: number;
  /** Overflow routing (P22) stamps the incumbent who referred the buyer. */
  referred_by_seller_id: string | null;
  completed_at: Date | string | null;
  /** draft | held | confirmed | completed | cancelled | disputed */
  status: Generated<string>;
  completion_proof: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ConversationSessionsTable {
  market_id: string;
  user_id: string;
  /** STOP flips this false in one UPDATE; RESUME restores. */
  autopilot: Generated<boolean>;
  state: Generated<Record<string, unknown>>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AsrGlossaryTable {
  id: Generated<string>;
  market_id: string;
  /** What the ASR heard (lowercased). */
  heard: string;
  /** What the speaker meant. */
  meant: string;
  /** Only founder-approved entries are applied pre-intent. */
  approved: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CatalogItemsTable {
  id: Generated<string>;
  market_id: string;
  seller_id: string;
  name: string;
  /** Channel-native media reference of the seller's real photo. */
  photo_ref: string;
  price_minor: string | number | bigint;
  active: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface LedgerTransactionsTable {
  id: Generated<string>;
  market_id: string;
  /** capture | refund | release | payout | adjustment */
  kind: string;
  /** What this money movement is about (e.g. an order id). */
  reference: string;
  /** One transaction per (market, key) — webhooks WILL double-fire. */
  idempotency_key: string;
  created_at: Generated<Date>;
}

export interface LedgerEntriesTable {
  id: Generated<string>;
  market_id: string;
  transaction_id: string | number | bigint;
  account: string;
  direction: string;
  amount_minor: string | number | bigint;
  currency: string;
  /** Stamped on seller_payable / referral_credits entries for payouts. */
  seller_id: string | null;
  created_at: Generated<Date>;
}

export interface DisputesTable {
  id: Generated<string>;
  market_id: string;
  order_id: string;
  opened_by_user_id: string;
  reason: string;
  /** open | auto_refunded | under_review | resolved */
  status: Generated<string>;
  evidence: JSONColumnType<Record<string, unknown>>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ReviewsTable {
  id: Generated<string>;
  market_id: string;
  order_id: string;
  seller_id: string;
  buyer_user_id: string;
  rating: number;
  body: string;
  /** published | held */
  status: Generated<string>;
  made_it_right: Generated<boolean>;
  resolution_opened_at: Date | string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ReviewRevisionsTable {
  id: Generated<string>;
  market_id: string;
  review_id: string;
  rating: number;
  body: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SignalsTable {
  id: Generated<string>;
  market_id: string;
  /** cruise_arrival | platform_event */
  kind: string;
  port_id: string | null;
  parish: string;
  occurs_at: Date | string;
  magnitude: number;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PulseBoostsTable {
  id: Generated<string>;
  market_id: string;
  signal_id: string | number | bigint;
  vertical_id: string;
  parish: string;
  lead_days: number;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Database {
  markets: MarketsTable;
  users: UsersTable;
  sellers: SellersTable;
  events_outbox: EventsOutboxTable;
  feature_flags: FeatureFlagsTable;
  capacity_windows: CapacityWindowsTable;
  capacity_holds: CapacityHoldsTable;
  capacity_waitlist: CapacityWaitlistTable;
  orders: OrdersTable;
  conversation_sessions: ConversationSessionsTable;
  asr_glossary: AsrGlossaryTable;
  catalog_items: CatalogItemsTable;
  ledger_transactions: LedgerTransactionsTable;
  ledger_entries: LedgerEntriesTable;
  disputes: DisputesTable;
  reviews: ReviewsTable;
  review_revisions: ReviewRevisionsTable;
  signals: SignalsTable;
  pulse_boosts: PulseBoostsTable;
}
