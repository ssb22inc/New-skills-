import { describe, expect, it } from 'vitest';
import {
  bayesianRating,
  blendedScore,
  newcomerShareOfFirstTimeBookings,
  rank,
  RATING_PRIOR_MEAN,
  WEIGHTS,
  type BookingRecord,
  type SellerSignals,
} from './ranking.js';

function seller(id: string, overrides: Partial<SellerSignals> = {}): SellerSignals {
  return {
    sellerId: id,
    ratingSum: 45,
    ratingCount: 10,
    responseP50Seconds: 600,
    acceptanceRate: 0.9,
    cancellationRate: 0.05,
    availabilityFit: 0.8,
    newcomer: false,
    ...overrides,
  };
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('P21 — discovery ranking + exposure floor (gate)', () => {
  it('GATE: ranking math matches the spec, hand-computed', () => {
    // Bayesian smoothing: zero data regresses exactly to the prior.
    expect(bayesianRating(0, 0)).toBe(RATING_PRIOR_MEAN);
    // 10 ratings of 4.5 avg with prior 3.5×10 → (35+45)/20 = 4.0
    expect(bayesianRating(45, 10)).toBe(4.0);

    const s = blendedScore(seller('x'));
    // Hand-computed: rating 4.0/5 ×0.4 + response (1-600/14400)=0.9583×0.15
    // + acceptance 0.9×0.15 + cancellation 0.95×0.15 + availability 0.8×0.15
    const expected =
      0.4 * (4.0 / 5) +
      WEIGHTS.response * (1 - 600 / 14_400) +
      WEIGHTS.acceptance * 0.9 +
      WEIGHTS.cancellation * 0.95 +
      WEIGHTS.availability * 0.8;
    expect(s.score).toBeCloseTo(expected, 10);
    expect(s.bayesianRating).toBe(4.0);

    // A slow, cancel-happy seller scores strictly lower.
    const bad = blendedScore(
      seller('y', { responseP50Seconds: 14_400, cancellationRate: 0.5, acceptanceRate: 0.4 }),
    );
    expect(bad.score).toBeLessThan(s.score);
    // Every score explains itself (show-me-why).
    expect(Object.keys(s)).toEqual(
      expect.arrayContaining(['bayesianRating', 'responseScore', 'cancellationScore']),
    );
  });

  it('GATE: audition slots are ALWAYS badged and never take the top slot', () => {
    const sellers = [
      ...Array.from({ length: 8 }, (_, i) =>
        seller(`inc-${i}`, { ratingSum: 48 - i, ratingCount: 10 }),
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        seller(`new-${i}`, { ratingCount: 0, ratingSum: 0, newcomer: true }),
      ),
    ];
    const ranked = rank(sellers, 2_500); // 25% exploration
    expect(ranked).toHaveLength(12);
    expect(ranked[0]!.audition).toBe(false); // earned top slot stays earned
    for (const slot of ranked) {
      const isNewcomer = slot.sellerId.startsWith('new-');
      expect(slot.audition).toBe(isNewcomer); // badge ⟺ newcomer, no exceptions
    }
    expect(ranked.filter((s) => s.audition).length).toBeGreaterThan(0);
    // Dial at zero: no early audition slots; newcomers sink to the tail.
    const closed = rank(sellers, 0);
    const firstNewcomerPos = closed.findIndex((s) => s.audition);
    expect(firstNewcomerPos).toBeGreaterThanOrEqual(8); // after all incumbents
  });

  it('GATE: the fairness metric is visible and MOVES when the dial moves', () => {
    const rand = mulberry32(21);
    const sellers = [
      ...Array.from({ length: 12 }, (_, i) =>
        seller(`inc-${i}`, { ratingSum: 47, ratingCount: 10 }),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        seller(`new-${i}`, { ratingCount: 0, ratingSum: 0, newcomer: true, availabilityFit: 0.9 }),
      ),
    ];

    function simulate(explorationBps: number): number {
      const ranked = rank(sellers, explorationBps);
      const bookings: BookingRecord[] = [];
      for (let buyer = 0; buyer < 2_000; buyer++) {
        // Position bias: buyers overwhelmingly pick from the top of the list.
        let pos = 0;
        while (pos < ranked.length - 1 && rand() > 0.45) pos++;
        const pick = ranked[pos]!;
        bookings.push({
          buyerId: `b-${buyer}`,
          sellerId: pick.sellerId,
          sellerIsNewcomer: pick.audition,
        });
      }
      return newcomerShareOfFirstTimeBookings(bookings);
    }

    const shareClosed = simulate(0);
    const shareOpen = simulate(2_500);
    expect(shareOpen).toBeGreaterThan(shareClosed); // the dial does something
    expect(shareOpen).toBeGreaterThan(0.05); // and it is material
    expect(shareClosed).toBeLessThan(shareOpen); // monotone in this sim
  });

  it('fairness metric counts only FIRST-time bookings per buyer', () => {
    const share = newcomerShareOfFirstTimeBookings([
      { buyerId: 'a', sellerId: 's1', sellerIsNewcomer: true },
      { buyerId: 'a', sellerId: 's2', sellerIsNewcomer: false }, // repeat buyer — ignored
      { buyerId: 'b', sellerId: 's2', sellerIsNewcomer: false },
    ]);
    expect(share).toBe(0.5); // 1 of 2 first-timers went to a newcomer
    expect(newcomerShareOfFirstTimeBookings([])).toBe(0);
  });
});
