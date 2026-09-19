import { type Db } from '@sycamore/core';
import { deployDefaults } from './deploy-defaults.js';

/**
 * WHO MAY SEE THE SCAFFOLDING.
 *
 * `/demo` and `/dev` are developer scaffolding, not product (Constitution
 * §1 — the door is a chat message, not a dashboard). Until now the only
 * thing standing between them and the public was an environment
 * variable, and the external review of 2026-09-16 was right to call that
 * out: `SYCAMORE_DEMO_INDEX` defaults ON for a Vercel deployment, which
 * is exactly the deployment a founder is most likely to point at real
 * sellers first and configure afterwards.
 *
 * The flag is now an explicit opt-in on every host (deploy-defaults.ts).
 * This is the second layer, and it asks the data rather than the human:
 * a market holding sellers with no `demo_seeded` claim is somebody's
 * real business — real buyers, real names, real phone numbers — and the
 * scaffolding closes for the whole deployment while one exists. Pointing
 * a demo build at a real database is the realistic accident, and this
 * catches it with no redeploy and nobody remembering.
 *
 * What it is NOT: authorization. A seller onboarded into a market that
 * was demo-seeded earlier still carries the claim, so this check cannot
 * see them. Only C01 — a session and a per-resource ownership check —
 * closes that, and these two surfaces sit behind it as well once it
 * lands. Containment first, authorization after; neither one alone.
 *
 * It fails CLOSED. If the check itself cannot run, the answer is no.
 */
const CLAIM_KEY = 'demo_seeded';

export type DemoSurfaceVerdict =
  { open: true } | { open: false; why: 'flag_off' | 'real_data' | 'unreachable' };

export async function demoSurfaces(db: Db): Promise<DemoSurfaceVerdict> {
  if (!deployDefaults().demoIndex) return { open: false, why: 'flag_off' };
  try {
    // Markets carrying sellers, and the demo claim per market. A market
    // with no sellers is nobody's business yet and proves nothing either
    // way.
    const populated = await db.selectFrom('sellers').select('market_id').distinct().execute();
    if (populated.length === 0) return { open: true };
    const claimed = await db
      .selectFrom('feature_flags')
      .where('key', '=', CLAIM_KEY)
      .select('market_id')
      .execute();
    const seeded = new Set(claimed.map((row) => row.market_id));
    const real = populated.filter((row) => !seeded.has(row.market_id));
    return real.length === 0 ? { open: true } : { open: false, why: 'real_data' };
  } catch {
    return { open: false, why: 'unreachable' };
  }
}
