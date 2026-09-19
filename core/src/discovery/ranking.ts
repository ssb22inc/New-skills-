/**
 * P21 — Discovery: blended ranking + the exposure floor. Pure functions;
 * the cockpit reads the fairness gauge, buyers see badged audition slots.
 * Show-me-why (Constitution §1.4): every score carries its components.
 */

export interface SellerSignals {
  sellerId: string;
  ratingSum: number;
  ratingCount: number;
  /** Median seconds to first reply. */
  responseP50Seconds: number;
  /** 0..1 share of booking requests accepted. */
  acceptanceRate: number;
  /** 0..1 share of confirmed orders the seller cancelled. */
  cancellationRate: number;
  /** 0..1 — how well open capacity fits the query window. */
  availabilityFit: number;
  /** Gated newcomer (passed readiness, < 10 completed orders). */
  newcomer: boolean;
}

export interface RankedSlot {
  sellerId: string;
  score: number;
  /** ALWAYS true for exploration slots — the badge is not optional. */
  audition: boolean;
  explain: {
    bayesianRating: number;
    responseScore: number;
    acceptanceRate: number;
    cancellationScore: number;
    availabilityFit: number;
  };
}

/** Bayesian smoothing: new sellers regress to the market prior. */
export const RATING_PRIOR_MEAN = 3.5;
export const RATING_PRIOR_WEIGHT = 10;

export function bayesianRating(sum: number, count: number): number {
  return (RATING_PRIOR_MEAN * RATING_PRIOR_WEIGHT + sum) / (RATING_PRIOR_WEIGHT + count);
}

/** Replies beyond this are as bad as it gets for the response component. */
export const RESPONSE_CEILING_SECONDS = 4 * 60 * 60;

export const WEIGHTS = {
  rating: 0.4,
  response: 0.15,
  acceptance: 0.15,
  cancellation: 0.15,
  availability: 0.15,
} as const;

export function blendedScore(s: SellerSignals): RankedSlot['explain'] & { score: number } {
  const rating = bayesianRating(s.ratingSum, s.ratingCount);
  const responseScore = Math.max(0, 1 - s.responseP50Seconds / RESPONSE_CEILING_SECONDS);
  const cancellationScore = 1 - Math.min(1, s.cancellationRate);
  const score =
    WEIGHTS.rating * (rating / 5) +
    WEIGHTS.response * responseScore +
    WEIGHTS.acceptance * Math.min(1, s.acceptanceRate) +
    WEIGHTS.cancellation * cancellationScore +
    WEIGHTS.availability * Math.min(1, s.availabilityFit);
  return {
    score,
    bayesianRating: rating,
    responseScore,
    acceptanceRate: s.acceptanceRate,
    cancellationScore,
    availabilityFit: s.availabilityFit,
  };
}

/**
 * The exposure floor: `explorationBps` of result slots are reserved as
 * BADGED audition slots for gated newcomers, interleaved from position 2
 * (never the top slot — earned rank stays earned). Newcomers fill their
 * audition slots in their own blended order; everyone else ranks by score.
 */
export function rank(sellers: SellerSignals[], explorationBps: number): RankedSlot[] {
  const scored = sellers.map((s) => {
    const { score, ...explain } = blendedScore(s);
    return { seller: s, score, explain };
  });
  const incumbents = scored.filter((x) => !x.seller.newcomer).sort((a, b) => b.score - a.score);
  const newcomers = scored.filter((x) => x.seller.newcomer).sort((a, b) => b.score - a.score);

  const total = sellers.length;
  const auditionSlots = Math.min(newcomers.length, Math.floor((total * explorationBps) / 10_000));

  const result: RankedSlot[] = [];
  let nextNewcomer = 0;
  let nextIncumbent = 0;
  const interval = auditionSlots > 0 ? Math.max(2, Math.floor(total / auditionSlots)) : Infinity;
  for (let position = 0; position < total; position++) {
    const auditionHere = nextNewcomer < auditionSlots && position > 0 && position % interval === 1;
    if (auditionHere && nextNewcomer < newcomers.length) {
      const n = newcomers[nextNewcomer++]!;
      result.push({
        sellerId: n.seller.sellerId,
        score: n.score,
        audition: true,
        explain: n.explain,
      });
    } else if (nextIncumbent < incumbents.length) {
      const i = incumbents[nextIncumbent++]!;
      result.push({
        sellerId: i.seller.sellerId,
        score: i.score,
        audition: false,
        explain: i.explain,
      });
    } else if (nextNewcomer < newcomers.length) {
      // Newcomers beyond the audition quota rank on merit, unbadged slots
      // exhausted — they still appear, badged, so the floor never lies.
      const n = newcomers[nextNewcomer++]!;
      result.push({
        sellerId: n.seller.sellerId,
        score: n.score,
        audition: true,
        explain: n.explain,
      });
    }
  }
  return result;
}

export interface BookingRecord {
  buyerId: string;
  sellerId: string;
  sellerIsNewcomer: boolean;
  /** Order of bookings = array order. */
}

/** The cockpit fairness metric: newcomer share of FIRST-TIME bookings. */
export function newcomerShareOfFirstTimeBookings(bookings: BookingRecord[]): number {
  const seen = new Set<string>();
  let firstTime = 0;
  let firstTimeNewcomer = 0;
  for (const b of bookings) {
    if (seen.has(b.buyerId)) continue;
    seen.add(b.buyerId);
    firstTime++;
    if (b.sellerIsNewcomer) firstTimeNewcomer++;
  }
  return firstTime === 0 ? 0 : firstTimeNewcomer / firstTime;
}
