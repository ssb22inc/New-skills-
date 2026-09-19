import type { ContextPack } from '@sycamore/packs';
import { formatAmount, translator } from '@sycamore/packs';

/**
 * P24 — Pulse core: bandit budgets under HUMAN caps, fatigue refresh,
 * kill+reallocate, and cross-pollination. Every decision narrates itself
 * to the seller's ledger feed in plain language (Constitution §1.3/§1.4).
 * Deterministic under a seeded RNG — the gate replays it exactly.
 */

export interface CampaignState {
  id: string;
  sellerId: string;
  verticalId: string;
  templateDna: string;
  active: boolean;
  spendMinor: number;
  /** CTRs per recent tick, newest last. */
  recentCtrs: number[];
  /** Average impressions per audience member in the window. */
  frequency: number;
}

export interface PulseDecision {
  campaignId: string;
  action: 'scale' | 'kill_reallocate' | 'refresh' | 'cross_pollinate' | 'hold';
  allocatedMinor: number;
  narration: string;
  newTemplateDna?: string;
  spawnedCampaign?: CampaignState;
}

export const CTR_FLOOR = 0.005;
export const MIN_SPEND_BEFORE_KILL_MINOR = 50_000;
export const FATIGUE_FREQUENCY = 3;
export const SCALE_CTR = 0.02;

function avg(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
}

function ctrDecaying(ctrs: number[]): boolean {
  if (ctrs.length < 3) return false;
  const [a, b, c] = ctrs.slice(-3);
  return a! > b! && b! > c!;
}

/** Deterministic DNA mutation — the localization engine re-renders copy. */
export function mutateDna(dna: string, rng: () => number): string {
  const generation = Number(/g(\d+)$/.exec(dna)?.[1] ?? 0) + 1;
  const base = dna.replace(/-g\d+$/, '');
  return `${base}-v${Math.floor(rng() * 1000)}-g${generation}`;
}

/**
 * Bandit budget allocation: performance-proportional with smoothing,
 * hard-capped per campaign by the HUMAN cap, integer minor units summing
 * to exactly the spendable total.
 */
export function allocateBudget(
  campaigns: { id: string; meanCtr: number; active: boolean }[],
  totalBudgetMinor: number,
  humanCapMinor: number,
): Map<string, number> {
  const live = campaigns.filter((c) => c.active);
  const weights = live.map((c) => ({ id: c.id, w: c.meanCtr + 0.001 })); // smoothing: everyone explores a little
  const totalW = weights.reduce((s, x) => s + x.w, 0);
  const out = new Map<string, number>();
  let remaining = totalBudgetMinor;
  for (const { id, w } of weights) {
    const raw = Math.min(humanCapMinor, Math.floor((totalBudgetMinor * w) / totalW));
    out.set(id, raw);
    remaining -= raw;
  }
  // Leftover from caps/rounding goes to the best performer under its cap.
  const sorted = [...weights].sort((a, b) => b.w - a.w);
  for (const { id } of sorted) {
    if (remaining <= 0) break;
    const current = out.get(id)!;
    const headroom = humanCapMinor - current;
    const add = Math.min(headroom, remaining);
    out.set(id, current + add);
    remaining -= add;
  }
  return out;
}

export function pulseTick(input: {
  pack: ContextPack;
  campaigns: CampaignState[];
  totalBudgetMinor: number;
  humanCapMinor: number;
  /** Verticals that exist in this market (for cross-pollination targets). */
  verticals: string[];
  rng: () => number;
}): PulseDecision[] {
  const { pack, campaigns, rng } = input;
  const f = (n: number) => formatAmount(pack, n);
  const say = translator(pack);
  const decisions: PulseDecision[] = [];

  // 1. Kill underperformers first — their budget reallocates this tick.
  for (const c of campaigns) {
    if (!c.active) continue;
    if (avg(c.recentCtrs) < CTR_FLOOR && c.spendMinor >= MIN_SPEND_BEFORE_KILL_MINOR) {
      c.active = false;
      decisions.push({
        campaignId: c.id,
        action: 'kill_reallocate',
        allocatedMinor: 0,
        narration: say('pulse.kill', { spend: f(c.spendMinor) }),
      });
    }
  }

  // 2. Allocate the budget across what remains (bandit + human caps).
  const allocations = allocateBudget(
    campaigns.map((c) => ({ id: c.id, meanCtr: avg(c.recentCtrs), active: c.active })),
    input.totalBudgetMinor,
    input.humanCapMinor,
  );

  // 3. Per-campaign behaviors.
  for (const c of campaigns) {
    if (!c.active) continue;
    const allocated = allocations.get(c.id) ?? 0;
    const meanCtr = avg(c.recentCtrs);

    if (ctrDecaying(c.recentCtrs) && c.frequency >= FATIGUE_FREQUENCY) {
      const newDna = mutateDna(c.templateDna, rng);
      decisions.push({
        campaignId: c.id,
        action: 'refresh',
        allocatedMinor: allocated,
        newTemplateDna: newDna,
        narration: say('pulse.refresh'),
      });
      continue;
    }

    if (meanCtr >= SCALE_CTR) {
      decisions.push({
        campaignId: c.id,
        action: 'scale',
        allocatedMinor: allocated,
        narration: say('pulse.scale', {
          allocated: f(allocated),
          cap: f(input.humanCapMinor),
        }),
      });
      continue;
    }

    decisions.push({
      campaignId: c.id,
      action: 'hold',
      allocatedMinor: allocated,
      narration: say('pulse.hold', { allocated: f(allocated) }),
    });
  }

  // 4. Cross-pollination: the market's best template jumps to a vertical
  //    that has no strong performer, with custom copy for that vertical.
  const winners = campaigns
    .filter((c) => c.active && avg(c.recentCtrs) >= SCALE_CTR)
    .sort((a, b) => avg(b.recentCtrs) - avg(a.recentCtrs));
  if (winners.length > 0) {
    const winner = winners[0]!;
    const coveredVerticals = new Set(
      campaigns.filter((c) => c.active && avg(c.recentCtrs) >= SCALE_CTR).map((c) => c.verticalId),
    );
    const target = input.verticals.find((v) => !coveredVerticals.has(v));
    if (target) {
      const spawned: CampaignState = {
        id: `${winner.id}-x-${target}`,
        sellerId: winner.sellerId,
        verticalId: target,
        templateDna: `${winner.templateDna}-for-${target}`,
        active: true,
        spendMinor: 0,
        recentCtrs: [],
        frequency: 0,
      };
      decisions.push({
        campaignId: winner.id,
        action: 'cross_pollinate',
        allocatedMinor: 0,
        spawnedCampaign: spawned,
        narration: say('pulse.cross_pollinate', { vertical: target }),
      });
    }
  }

  return decisions;
}
