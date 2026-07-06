import type { Kysely } from 'kysely';
import type { ContextPack } from '@sycamore/packs';
import type { Database } from '../db/types.js';
import { flagsRepo } from '../flags/flags.js';

export type MarketStatus = 'live' | 'dark' | 'retired';

/** Route-layer semantics: a dark market simply does not exist. */
export class MarketNotLiveError extends Error {
  readonly httpStatus = 404;
  constructor(marketId: string) {
    super(`market "${marketId}" is not live`);
    this.name = 'MarketNotLiveError';
  }
}

export class FlipBlockedError extends Error {
  constructor(marketId: string, reason: string) {
    super(`flip to live BLOCKED for "${marketId}": ${reason}`);
    this.name = 'FlipBlockedError';
  }
}

export interface FlipRequest {
  marketId: string;
  /** The market's context pack — must carry verified_by_counsel: true. */
  pack: ContextPack;
  /** Result of the market's payment adapter sandbox suite. */
  paymentSandboxPassed: boolean;
  /** Result of the P31 check: /core diff between market sets is empty. */
  coreDiffEmpty: boolean;
}

export function marketsRegistry(db: Kysely<Database>) {
  return {
    async statusOf(marketId: string): Promise<MarketStatus | undefined> {
      const row = await db
        .selectFrom('markets')
        .where('market_id', '=', marketId)
        .select('status')
        .executeTakeFirst();
      return row?.status as MarketStatus | undefined;
    },

    /** The ONLY list buyer-facing surfaces may render from. */
    async listLive(): Promise<string[]> {
      const rows = await db
        .selectFrom('markets')
        .where('status', '=', 'live')
        .select('market_id')
        .execute();
      return rows.map((r) => r.market_id).sort();
    },

    /** Guard for routes: dark or unknown → 404-shaped error. */
    async assertLive(marketId: string): Promise<void> {
      const status = await this.statusOf(marketId);
      if (status !== 'live') throw new MarketNotLiveError(marketId);
    },

    /** Guard for workers, jobs, and Pulse signals: dark markets no-op. */
    async runIfLive<T>(
      marketId: string,
      fn: () => Promise<T>,
    ): Promise<{ ran: boolean; result?: T }> {
      const status = await this.statusOf(marketId);
      if (status !== 'live') return { ran: false };
      return { ran: true, result: await fn() };
    },

    /**
     * The flip ceremony. Every condition or the flip throws:
     * founder flag + counsel-verified pack + payment sandbox green +
     * empty /core diff. There is no partial credit.
     */
    async flipLive(request: FlipRequest): Promise<void> {
      const { marketId, pack } = request;
      if (pack.market_id !== marketId) {
        throw new FlipBlockedError(marketId, `pack is for "${pack.market_id}"`);
      }
      const founderFlag = await flagsRepo(db, marketId).get(`flip:${marketId}`);
      if (!founderFlag?.enabled) {
        throw new FlipBlockedError(marketId, 'founder flip flag is not enabled');
      }
      if (!pack.compliance.verified_by_counsel) {
        throw new FlipBlockedError(marketId, 'pack is not verified by counsel');
      }
      if (!request.paymentSandboxPassed) {
        throw new FlipBlockedError(marketId, 'payment adapter sandbox suite has not passed');
      }
      if (!request.coreDiffEmpty) {
        throw new FlipBlockedError(marketId, '/core diff is not empty (P31 gate)');
      }
      await db
        .updateTable('markets')
        .set({ status: 'live' })
        .where('market_id', '=', marketId)
        .execute();
    },

    async setStatus(marketId: string, status: MarketStatus): Promise<void> {
      await db.updateTable('markets').set({ status }).where('market_id', '=', marketId).execute();
    },
  };
}

export type MarketsRegistry = ReturnType<typeof marketsRegistry>;
