/**
 * The four load profiles (BUILD §5.5), runnable HERE.
 *
 * `k6-profiles.js` describes them for k6, which is the right tool for
 * distributed load from outside the box — and which the audit found is
 * not installed and not in CI, so "runnable" was a claim nobody could
 * check. This runs the same four shapes against the real HTTP server and
 * the real Redis queue using the harness we already have, so the
 * profiles are executable on any machine that can run the tests, and CI
 * runs the smoke floor on every push.
 *
 *   pnpm --filter @sycamore/tests load:smoke      # CI floor, ~5s
 *   pnpm --filter @sycamore/tests load:profiles   # all four, scaled
 *   LOAD_FULL=1 pnpm --filter @sycamore/tests load:profiles   # full durations
 *
 * k6 remains the tool for true multi-machine load; this is the floor
 * that runs whether or not anybody remembers to install it.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export interface LoadProfile {
  name: string;
  /** Messages per second. */
  rate: number;
  /** Seconds at that rate in a full run. */
  seconds: number;
  why: string;
}

export const PROFILES: LoadProfile[] = [
  { name: 'normal_day', rate: 5, seconds: 300, why: 'the baseline Tuesday' },
  { name: 'friday_spike', rate: 100, seconds: 180, why: '20× messaging — Friday broadcast' },
  { name: 'cruise_surge', rate: 50, seconds: 180, why: '10× bookings into one parish' },
  { name: 'viral_seller', rate: 500, seconds: 120, why: 'one seller goes 100×' },
];

/** Scaled runs keep CI honest without keeping it waiting. */
const SCALE_SECONDS = Number(process.env.LOAD_PROFILE_SECONDS ?? 5);

function runProfile(profile: LoadProfile, seconds: number): boolean {
  const harness = fileURLToPath(new URL('./gateway-load.ts', import.meta.url));
  console.info(`\n▶ ${profile.name}: ${profile.rate} msg/s for ${seconds}s — ${profile.why}`);
  const result = spawnSync('pnpm', ['exec', 'tsx', harness], {
    stdio: 'inherit',
    env: {
      ...process.env,
      LOAD_RATE: String(profile.rate),
      LOAD_SECONDS: String(seconds),
    },
  });
  return result.status === 0;
}

const only = process.argv[2];
const full = process.env.LOAD_FULL === '1';
const selected = only ? PROFILES.filter((p) => p.name === only) : PROFILES;
if (selected.length === 0) {
  console.error(`unknown profile "${only}" — known: ${PROFILES.map((p) => p.name).join(', ')}`);
  process.exit(1);
}

let failed = 0;
for (const profile of selected) {
  if (!runProfile(profile, full ? profile.seconds : SCALE_SECONDS)) failed++;
}
console.info(
  `\n${selected.length - failed}/${selected.length} profiles passed ` +
    `(${full ? 'full durations' : `scaled to ${SCALE_SECONDS}s each`})`,
);
process.exit(failed === 0 ? 0 : 1);
