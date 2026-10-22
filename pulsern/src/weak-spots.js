/* Weak-spot targeting for the adaptive QBank and the Today round.

   Picks WHICH client-needs category the next question comes from, weighting
   weaker categories more heavily, while keeping the two guarantees the app has
   always made:
     • interleaving — never the same category twice in a row when another is
       available;
     • no starvation — every available category keeps a floor weight, and a
       category absent from the recent answer history is served outright.
   Difficulty targeting WITHIN the chosen category is unchanged: the caller
   still sorts that category's items by distance from pickTargetRating().

   Deterministic plain code (CLAUDE.md rule 6): the only randomness is a
   seeded PRNG, so the same inputs and seed always give the same pick. */

const BASE = 1200;          // ability-engine starting θ
const BORDERLINE = 1300;    // ability-engine pass anchor (θ ≈ borderline)
export const MIN_EVIDENCE = 5;    // answers before a category's θ is trusted (same as overallTheta)
export const FLOOR = 0.15;        // every category keeps at least this weight
export const UNPROVEN = 0.5;      // weakness assumed for a category with too little evidence
export const STARVE_WINDOW = 16;  // a category missing from this many recent answers is served next

/* Weakness in (0,1): the Elo probability of MISSING a borderline item.
   θ 1000 → ~0.76, θ 1300 → 0.5, θ 1600 → ~0.15. Untested is not mastered,
   so a category with fewer than MIN_EVIDENCE answers counts as at least
   borderline. */
export function weakness(entry) {
  const theta = entry?.theta ?? BASE;
  const n = entry?.n ?? 0;
  const miss = 1 - 1 / (1 + Math.pow(10, (BORDERLINE - theta) / 400));
  return n < MIN_EVIDENCE ? Math.max(miss, UNPROVEN) : miss;
}

export const categoryWeight = (ability, cat) => FLOOR + weakness(ability?.[cat]);

/* mulberry32 — tiny seeded PRNG returning floats in [0, 1). */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* String → 32-bit seed (FNV-1a). */
export function seedFrom(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/* Choose the next category.
   available — categories that still have servable items (in any order);
   ability   — the engine's { [cat]: { theta, n } };
   lastCat   — category of the previous question (interleaving);
   recent    — categories of recent answers, oldest first (starvation guard);
   rand      — a number in [0,1) from the seeded PRNG.
   Returns a category from `available`, or null when it is empty. */
export function pickCategory({ available, ability = {}, lastCat = null, recent = [], rand = 0 }) {
  const cats = [...new Set(available)].sort(); // order-independent → deterministic
  if (!cats.length) return null;
  let options = cats.filter((c) => c !== lastCat);
  if (!options.length) options = cats; // only one category left — serve it

  // Starvation guard: once there is enough history, a category that has not
  // appeared in the last STARVE_WINDOW answers is served before anything else
  // (the one absent longest first).
  if (recent.length >= STARVE_WINDOW) {
    const window = recent.slice(-STARVE_WINDOW);
    const starved = options.filter((c) => !window.includes(c));
    if (starved.length) {
      const lastSeen = (c) => recent.lastIndexOf(c); // -1 = never
      return [...starved].sort((a, b) => lastSeen(a) - lastSeen(b) || (a < b ? -1 : 1))[0];
    }
  }

  const weights = options.map((c) => categoryWeight(ability, c));
  const total = weights.reduce((s, w) => s + w, 0);
  let x = Math.min(Math.max(rand, 0), 0.999999999) * total;
  for (let i = 0; i < options.length; i++) {
    x -= weights[i];
    if (x < 0) return options[i];
  }
  return options[options.length - 1];
}
