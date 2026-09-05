import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import type { ComplaintPattern } from './listener.js';

/**
 * P28 — the Scout. A Radar item only clears when pain × market × lane
 * ALL clear AND it carries a revenue estimate; everything else parks
 * with the numbers on record. No cleared item, no founder attention.
 */
export const CLEARANCE = { pain: 50, market: 50 } as const;

export interface RadarProposal {
  lane: string;
  painScore: number;
  marketScore: number;
  laneClearance: boolean;
  revenueEstimateMinor?: number | undefined;
  source: string;
}

export function scoutService(db: Kysely<Database>, marketId: string) {
  return {
    async propose(item: RadarProposal) {
      const cleared =
        item.painScore >= CLEARANCE.pain &&
        item.marketScore >= CLEARANCE.market &&
        item.laneClearance &&
        (item.revenueEstimateMinor ?? 0) > 0;
      return db
        .insertInto('radar_items')
        .values({
          market_id: marketId,
          lane: item.lane,
          pain_score: item.painScore,
          market_score: item.marketScore,
          lane_clearance: item.laneClearance,
          revenue_estimate_minor: item.revenueEstimateMinor ?? null,
          status: cleared ? 'cleared' : 'parked',
          source: item.source,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    /**
     * Close the Listener→Scout loop: mined complaint patterns become
     * proposals; the assessor supplies market fit, lane clearance and
     * the revenue estimate (founder or model — never invented here).
     */
    async fromPatterns(
      patterns: ComplaintPattern[],
      assess: (pattern: ComplaintPattern) => {
        marketScore: number;
        laneClearance: boolean;
        revenueEstimateMinor?: number;
      },
    ) {
      const results = [];
      for (const pattern of patterns) {
        const assessment = assess(pattern);
        results.push(
          await this.propose({
            lane: pattern.lane,
            painScore: Math.min(100, pattern.count * 20),
            marketScore: assessment.marketScore,
            laneClearance: assessment.laneClearance,
            revenueEstimateMinor: assessment.revenueEstimateMinor,
            source: `listener-survey (${pattern.count} complaints)`,
          }),
        );
      }
      return results;
    },

    /** What the founder sees: cleared items only, biggest pain first. */
    async radar() {
      return db
        .selectFrom('radar_items')
        .where('market_id', '=', marketId)
        .where('status', '=', 'cleared')
        .orderBy('pain_score', 'desc')
        .selectAll()
        .execute();
    },
  };
}

export type ScoutService = ReturnType<typeof scoutService>;
