/**
 * What a deployment does unless told otherwise.
 *
 * On Vercel there is no image and no entrypoint script to carry
 * settings, and the founder should not need to type environment
 * variables to see the product work. So on Vercel the one-time demo seed
 * defaults ON and can be switched off with an explicit `0`. Anywhere
 * else it defaults OFF and is switched on with `1` — the Docker image
 * does exactly that.
 *
 * The scaffolding SURFACES are the exception and are never defaulted on,
 * anywhere: see `demoIndex` below.
 *
 * Every real deployment sets SYCAMORE_DEMO_SEED=0 and never sets
 * SYCAMORE_DEMO_INDEX: Sycamore has no directory page by design, and a
 * real market is never seeded with Sea Breeze Boat Tours.
 */
export function deployDefaults(): {
  onVercel: boolean;
  migrateOnBoot: boolean;
  demoSeedOnBoot: boolean;
  demoIndex: boolean;
  appOrigin: string;
} {
  const onVercel = process.env.VERCEL === '1';
  const flag = (name: string, vercelDefault: boolean): boolean => {
    const value = process.env[name];
    if (value === '1') return true;
    if (value === '0') return false;
    return onVercel && vercelDefault;
  };
  const host = process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL;
  return {
    onVercel,
    // NOT on by default on Vercel, and the exception to the pattern
    // above. A serverless instance may be frozen the moment it answers
    // the request that woke it, so a migration started at boot can be
    // cut off mid-transaction — which is exactly what happened on
    // 2026-09-16: two bookkeeping tables created, twenty-two migrations
    // rolled back, nothing logged, and every retry identical. A
    // long-lived server has no such problem, so the Docker image sets
    // this to 1 explicitly and keeps the old behaviour. Serverless
    // instead REPORTS a schema that is behind and leaves applying it to
    // something that will still be alive at the end.
    migrateOnBoot: flag('SYCAMORE_MIGRATE_ON_BOOT', false),
    demoSeedOnBoot: flag('SYCAMORE_DEMO_SEED', true),
    // Explicit opt-in ONLY, on every host including Vercel — the one
    // exception to the pattern above, and the one that matters most.
    // `/demo` and `/dev` list sellers and link to a seller's day; the
    // external review of 2026-09-16 was right that a scaffolding surface
    // carrying buyer names and phone numbers must not be ON because
    // nobody typed a variable. A demo deployment says so out loud with
    // SYCAMORE_DEMO_INDEX=1. See demo-guard.ts for the second layer.
    demoIndex: process.env.SYCAMORE_DEMO_INDEX === '1',
    appOrigin:
      process.env.SYCAMORE_APP_ORIGIN ?? (host ? `https://${host}` : 'http://localhost:3000'),
  };
}

/**
 * Supabase's shared pooler lives on numbered clusters — `aws-0-<region>`
 * or `aws-1-<region>` — and the project dashboard is the only place that
 * says which one a project landed on. A wrong guess fails with "Tenant
 * or user not found". Rather than make the founder chase that error, boot
 * tries the configured host and then its sibling; the winner is what the
 * process uses from then on. Any other database URL passes through
 * untouched.
 */
export function databaseUrlCandidates(url: string): string[] {
  const match = /@aws-(\d)-([a-z0-9-]+)\.pooler\.supabase\.com/.exec(url);
  if (!match) return [url];
  const [whole, cluster, region] = match;
  const sibling = `@aws-${cluster === '0' ? '1' : '0'}-${region}.pooler.supabase.com`;
  return [url, url.replace(whole, sibling)];
}
