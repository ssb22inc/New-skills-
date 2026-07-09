/* PulseRN Ability Engine — Elo/Rasch hybrid
   ------------------------------------------------------------------
   Replaces accuracy-weighted readiness with a real ability estimate.

   How it works (deterministic math — no AI, per the "agents for
   judgment, plain code for arithmetic" rule):

   • Every student has an ability rating θ per category (starts 1200).
   • Every item has a difficulty rating R, seeded from its diff tier
     (1→1100, 2→1300, 3→1500) and then CALIBRATED from real responses:
     when many students beat an item, its rating falls; when it beats
     students, its rating rises. Your bank self-calibrates for free.
   • Expected P(correct) follows the Elo logistic:
       E = 1 / (1 + 10^((R − θ) / 400))
   • After each answer: θ += K·(actual − E). K shrinks as the student
     answers more items in that category, so estimates stabilize.
   • Readiness = P(pass) mapped from coverage-weighted overall θ,
     anchored so θ=1300 ≈ borderline. Reported with a confidence
     band that narrows with sample size — the honesty rule survives.

   Drop-in usage inside App.portable.jsx:
     import { emptyAbility, updateAbility, itemRating, readinessFrom,
              pickTargetRating } from './ability-engine';
     • persist `ability` in the saved state blob (one more key)
     • call updateAbility(ability, q, correct) inside record()
     • replace the readiness useMemo with readinessFrom(ability, log)
     • in pickFrom(), prefer items whose rating is near
       pickTargetRating(ability, cat) instead of the diff ladder
   ------------------------------------------------------------------ */

const BASE = 1200;              // starting student ability
const SEED = { 1: 1100, 2: 1300, 3: 1500 }; // item seeds by diff tier
const PASS_ANCHOR = 1300;       // θ at which P(pass) ≈ 0.5 (borderline)
const PASS_SCALE = 140;         // logistic width for the pass mapping

export const emptyAbility = (cats) =>
  Object.fromEntries(cats.map((c) => [c, { theta: BASE, n: 0 }]));

/* Item rating: calibrated value if we have one, else the diff seed. */
export const itemRating = (q, calibration = {}) =>
  calibration[q.id]?.rating ?? SEED[q.diff] ?? 1300;

const expected = (theta, rating) =>
  1 / (1 + Math.pow(10, (rating - theta) / 400));

/* K decays with experience: fast learning early, stable later. */
const kFor = (n) => (n < 10 ? 40 : n < 30 ? 24 : 12);

/* Update after one answer. Returns a NEW ability object (immutable,
   safe for React state) plus the item-calibration delta so the shared
   bank can learn item difficulty from aggregate responses. */
export function updateAbility(ability, q, correct, calibration = {}) {
  const cat = ability[q.cat] ?? { theta: BASE, n: 0 };
  const R = itemRating(q, calibration);
  const E = expected(cat.theta, R);
  const actual = correct ? 1 : 0;
  const theta = cat.theta + kFor(cat.n) * (actual - E);
  const next = { ...ability, [q.cat]: { theta, n: cat.n + 1 } };
  // Item moves the opposite direction, slower (K=8): calibration signal.
  const itemDelta = 8 * (E - actual);
  return { ability: next, itemDelta };
}

/* Coverage-weighted overall θ. Categories the student hasn't touched
   drag the estimate toward BASE — untested ≠ mastered. */
export function overallTheta(ability) {
  const cats = Object.values(ability);
  if (!cats.length) return BASE;
  const MIN_N = 5; // full weight only after 5 answers in a category
  let sum = 0;
  for (const c of cats) {
    const w = Math.min(c.n / MIN_N, 1);
    sum += w * c.theta + (1 - w) * BASE;
  }
  return sum / cats.length;
}

/* Readiness: P(pass) as a percentage, with an honest confidence band.
   Returns null below the evidence floor — same refusal as before. */
export function readinessFrom(ability, log) {
  const n = log.length;
  if (n < 12) return null;
  const theta = overallTheta(ability);
  const p = 1 / (1 + Math.exp(-(theta - PASS_ANCHOR) / PASS_SCALE));
  const pct = Math.round(p * 100);
  // Band narrows with evidence: ±18 at n=12 → ±5 at n≥150.
  const band = Math.round(Math.max(5, 18 - 13 * Math.min((n - 12) / 138, 1)));
  const weakest = Object.entries(ability)
    .filter(([, v]) => v.n >= 3)
    .sort((a, b) => a[1].theta - b[1].theta)[0]?.[0] ?? null;
  return { pct, low: Math.max(0, pct - band), high: Math.min(100, pct + band), theta: Math.round(theta), weakest };
}

/* Adaptive targeting: serve items the student answers correctly
   ~70% of the time — the desirable-difficulty sweet spot. Solving
   the Elo logistic for P=0.7 gives rating ≈ θ − 147. */
export const pickTargetRating = (ability, cat) =>
  (ability[cat]?.theta ?? BASE) - 147;

/* Item health check for the review console: given aggregate stats,
   flag items that are broken. */
export function itemHealth({ timesAnswered, timesCorrect, rating }) {
  if (timesAnswered < 20) return { status: "collecting", flag: false };
  const p = timesCorrect / timesAnswered;
  if (p > 0.95) return { status: "too easy — no signal", flag: true };
  if (p < 0.15) return { status: "too hard or miskeyed — audit the key", flag: true };
  if (rating < 900 || rating > 1750) return { status: "rating drifted — re-review", flag: true };
  return { status: "healthy", flag: false };
}
