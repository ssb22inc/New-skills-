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
  /** draft | held | confirmed | completed | cancelled | disputed */
  status: Generated<string>;
  completion_proof: string | null;
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
}
