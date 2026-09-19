import { describe, expect, it } from 'vitest';
import { loadContextPack } from '@sycamore/packs';
import {
  allocateBudget,
  pulseTick,
  CTR_FLOOR,
  SCALE_CTR,
  type CampaignState,
} from './campaigns.js';

const jm = loadContextPack('jm');

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

function campaign(id: string, overrides: Partial<CampaignState> = {}): CampaignState {
  return {
    id,
    sellerId: 'seller-1',
    verticalId: 'tours',
    templateDna: `${id}-dna-g0`,
    active: true,
    spendMinor: 100_000,
    recentCtrs: [0.01, 0.01, 0.01],
    frequency: 1,
    ...overrides,
  };
}

/** The crafted state that must reproduce all four behaviors in one tick. */
function fourBehaviorState(): CampaignState[] {
  return [
    // SCALE: strong CTR, low fatigue.
    campaign('winner', { recentCtrs: [0.03, 0.035, 0.04], frequency: 1 }),
    // KILL: CTR under the floor after real spend.
    campaign('loser', { recentCtrs: [0.002, 0.001, 0.001], spendMinor: 80_000 }),
    // REFRESH: decaying CTR + high frequency = fatigue.
    campaign('tired', { recentCtrs: [0.03, 0.02, 0.011], frequency: 4 }),
    // (cross-pollination target: 'food' has no strong performer)
    campaign('foodling', { verticalId: 'food', recentCtrs: [0.008, 0.009, 0.008] }),
  ];
}

describe('P24 — campaign engine (gate: four behaviors, deterministic)', () => {
  it('GATE: one tick reproduces scale, kill+reallocate, refresh, cross-pollinate', () => {
    const decisions = pulseTick({
      pack: jm,
      campaigns: fourBehaviorState(),
      totalBudgetMinor: 1_000_000,
      humanCapMinor: 600_000,
      verticals: ['tours', 'food'],
      rng: mulberry32(24),
    });
    const byAction = new Map(decisions.map((d) => [d.action, d]));

    const scale = byAction.get('scale')!;
    expect(scale.campaignId).toBe('winner');
    expect(scale.allocatedMinor).toBeGreaterThan(0);
    expect(scale.allocatedMinor).toBeLessThanOrEqual(600_000); // human cap holds

    const kill = byAction.get('kill_reallocate')!;
    expect(kill.campaignId).toBe('loser');
    expect(kill.allocatedMinor).toBe(0);

    const refresh = byAction.get('refresh')!;
    expect(refresh.campaignId).toBe('tired');
    expect(refresh.newTemplateDna).toBeDefined();
    expect(refresh.newTemplateDna).not.toBe('tired-dna-g0');
    expect(refresh.newTemplateDna).toMatch(/-g1$/); // generation bumped

    const cross = byAction.get('cross_pollinate')!;
    expect(cross.campaignId).toBe('winner');
    expect(cross.spawnedCampaign?.verticalId).toBe('food');
    expect(cross.spawnedCampaign?.templateDna).toContain('winner');
    expect(cross.spawnedCampaign?.templateDna).toContain('for-food'); // custom copy hook

    // Every decision narrates itself in plain language (no jargon).
    for (const d of decisions) {
      expect(d.narration.length).toBeGreaterThan(20);
      expect(d.narration).not.toMatch(/CTR|bps|bandit|algorithm/i);
    }
    // Money is plain numbers in pack currency.
    expect(scale.narration).toMatch(/J\$[\d,]+\.\d{2}/);
  });

  it('GATE: the tick is DETERMINISTIC under seeded randomness', () => {
    const run = () =>
      pulseTick({
        pack: jm,
        campaigns: fourBehaviorState(),
        totalBudgetMinor: 1_000_000,
        humanCapMinor: 600_000,
        verticals: ['tours', 'food'],
        rng: mulberry32(24),
      });
    const a = run();
    const b = run();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b)); // bit-for-bit identical
  });

  it('budget allocation: integer, cap-respecting, fully spent', () => {
    const alloc = allocateBudget(
      [
        { id: 'a', meanCtr: 0.04, active: true },
        { id: 'b', meanCtr: 0.01, active: true },
        { id: 'dead', meanCtr: 0.09, active: false },
      ],
      1_000_003,
      700_000,
    );
    expect(alloc.has('dead')).toBe(false); // paused campaigns get nothing
    const total = [...alloc.values()].reduce((s, v) => s + v, 0);
    expect(total).toBe(1_000_003); // every cent placed
    for (const v of alloc.values()) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeLessThanOrEqual(700_000); // human cap is absolute
    }
    expect(alloc.get('a')!).toBeGreaterThan(alloc.get('b')!); // performance wins
  });

  it('kill waits for minimum spend; young campaigns get their chance', () => {
    const young = campaign('young', {
      recentCtrs: [0.001, 0.001, 0.001], // terrible…
      spendMinor: 10_000, // …but it has barely spent
    });
    const decisions = pulseTick({
      pack: jm,
      campaigns: [young],
      totalBudgetMinor: 100_000,
      humanCapMinor: 100_000,
      verticals: ['tours'],
      rng: mulberry32(1),
    });
    expect(decisions.find((d) => d.campaignId === 'young')?.action).toBe('hold');
    expect(young.recentCtrs.every((c) => c < CTR_FLOOR)).toBe(true);
    expect(SCALE_CTR).toBeGreaterThan(CTR_FLOOR);
  });
});
