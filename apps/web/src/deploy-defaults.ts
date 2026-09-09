/**
 * What a deployment does unless told otherwise.
 *
 * On Vercel there is no image and no entrypoint script to carry
 * settings, and the founder should not need to type environment
 * variables to see the product work. So on Vercel the boot migration,
 * the one-time demo seed and the /demo index default ON, and any of them
 * can be switched off with an explicit `0`. Anywhere else they default
 * OFF and are switched on with `1` — the Docker image does exactly that.
 *
 * Every real deployment sets SYCAMORE_DEMO_INDEX=0 and
 * SYCAMORE_DEMO_SEED=0: Sycamore has no directory page by design, and
 * a real market is never seeded with Sea Breeze Boat Tours.
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
    migrateOnBoot: flag('SYCAMORE_MIGRATE_ON_BOOT', true),
    demoSeedOnBoot: flag('SYCAMORE_DEMO_SEED', true),
    demoIndex: flag('SYCAMORE_DEMO_INDEX', true),
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
