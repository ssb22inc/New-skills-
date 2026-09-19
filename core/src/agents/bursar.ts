import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { emitEvent } from '../db/outbox.js';

/**
 * P29 — the Bursar. Watches what every vendor costs, reports monthly in
 * plain numbers, proposes swaps when a cheaper equivalent exists — and
 * the P4 DPA rule governs it absolutely: a vendor without a signed DPA
 * can NEVER be proposed for a PII lane. Blocked before the founder ever
 * sees it; cheapest applies to compute, never to trust.
 */
export class BursarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BursarError';
  }
}

export interface VendorPricing {
  vendorId: string;
  /** Which adapter lane this vendor serves (llm, payments, asr, media…). */
  lane: string;
  monthlyCostMinor: number;
  dpaSigned: boolean;
  /** Whether this lane carries PII in our deployment. */
  laneHandlesPii: boolean;
}

export interface SwapProposal {
  lane: string;
  fromVendorId: string;
  toVendorId: string;
  monthlySavingMinor: number;
}

export function bursarService(current: VendorPricing[]) {
  return {
    /** Plain-number monthly report: what we pay, per lane. */
    monthlyReport() {
      const totalMinor = current.reduce((s, v) => s + v.monthlyCostMinor, 0);
      return {
        totalMinor,
        lines: current.map((v) => ({
          lane: v.lane,
          vendorId: v.vendorId,
          monthlyCostMinor: v.monthlyCostMinor,
        })),
      };
    },

    /**
     * Swap proposals against a market survey. The DPA check runs FIRST:
     * a non-DPA candidate on a PII lane is recorded as blocked and never
     * becomes a proposal, no matter the saving.
     */
    proposeSwaps(candidates: VendorPricing[]): {
      proposals: SwapProposal[];
      blocked: { lane: string; vendorId: string; reason: string }[];
    } {
      const proposals: SwapProposal[] = [];
      const blocked: { lane: string; vendorId: string; reason: string }[] = [];
      for (const candidate of candidates) {
        const incumbent = current.find((v) => v.lane === candidate.lane);
        if (!incumbent) continue;
        const saving = incumbent.monthlyCostMinor - candidate.monthlyCostMinor;
        if (saving <= 0) continue;
        // THE hard rule, before any founder queue (P4, CLAUDE.md data rules).
        if (incumbent.laneHandlesPii && !candidate.dpaSigned) {
          blocked.push({
            lane: candidate.lane,
            vendorId: candidate.vendorId,
            reason: 'no signed DPA on a PII lane — cheaper never beats trust',
          });
          continue;
        }
        proposals.push({
          lane: candidate.lane,
          fromVendorId: incumbent.vendorId,
          toVendorId: candidate.vendorId,
          monthlySavingMinor: saving,
        });
      }
      return { proposals, blocked };
    },

    /** Executing a swap re-checks the rule — belt and braces. */
    executeSwap(proposal: SwapProposal, candidate: VendorPricing): VendorPricing[] {
      const incumbent = current.find((v) => v.lane === proposal.lane);
      if (!incumbent) throw new BursarError(`no incumbent on lane ${proposal.lane}`);
      if (incumbent.laneHandlesPii && !candidate.dpaSigned) {
        throw new BursarError(
          `vendor "${candidate.vendorId}" has no signed DPA and lane "${proposal.lane}" carries PII`,
        );
      }
      return current.map((v) =>
        v.lane === proposal.lane ? { ...candidate, laneHandlesPii: incumbent.laneHandlesPii } : v,
      );
    },
  };
}

export type BursarService = ReturnType<typeof bursarService>;

/**
 * A blocked non-DPA swap is a TRUST event, not a return value that dies
 * with its caller. The Bursar's review goes on the audit record so the
 * founder cockpit can show what was proposed and what the DPA rule
 * stopped — "cheapest applies to compute, never to trust" needs a
 * receipt (Constitution §5).
 */
export async function recordSwapReview(
  db: Kysely<Database>,
  marketId: string,
  review: {
    proposals: SwapProposal[];
    blocked: { lane: string; vendorId: string; reason: string }[];
  },
): Promise<void> {
  await emitEvent(db, {
    marketId,
    topic: 'bursar.review',
    payload: {
      proposed: review.proposals.length,
      blocked: review.blocked.length,
      savingMinor: review.proposals.reduce((s, p) => s + p.monthlySavingMinor, 0),
      blockedLanes: review.blocked.map((b) => b.lane),
    },
  });
}
