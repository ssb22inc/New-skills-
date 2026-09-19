import type { AlertSink } from '../observability/alerts.js';
import type { FlagsRepo } from '../flags/flags.js';

export interface CanaryOptions {
  flags: FlagsRepo;
  alert: AlertSink;
  /** The flag that exposes the change being shipped. */
  flagKey: string;
  version: string;
  description: string;
  /** Health probe for the canaried change; false or throw = unhealthy. */
  healthCheck: () => Promise<boolean>;
  /** Consecutive checks that must pass before promotion. */
  requiredHealthyChecks?: number;
  /** Failures tolerated before automatic rollback. */
  failureBudget?: number;
  canaryBps?: number;
}

export interface CanaryResult {
  promoted: boolean;
  version: string;
  checksRun: number;
  failures: number;
}

/**
 * The deploy pipeline's decision stage: expose at 5%, watch the health
 * probe, promote on sustained green, roll back AUTOMATICALLY on budget
 * breach — and tell the founder either way in one plain sentence.
 */
export async function canaryRelease(options: CanaryOptions): Promise<CanaryResult> {
  const required = options.requiredHealthyChecks ?? 5;
  const budget = options.failureBudget ?? 2;
  const canaryBps = options.canaryBps ?? 500;

  await options.flags.set({
    key: options.flagKey,
    enabled: true,
    rolloutBps: canaryBps,
    description: `${options.description} (canary ${options.version})`,
  });

  let healthy = 0;
  let failures = 0;
  let checksRun = 0;

  while (healthy < required) {
    checksRun++;
    let ok: boolean;
    try {
      ok = await options.healthCheck();
    } catch {
      ok = false;
    }
    if (ok) {
      healthy++;
      continue;
    }
    failures++;
    healthy = 0; // promotion requires CONSECUTIVE green checks
    if (failures >= budget) {
      await options.flags.set({
        key: options.flagKey,
        enabled: false,
        rolloutBps: 0,
        description: `${options.description} (rolled back ${options.version})`,
      });
      await options.alert.send(
        `🔴 Rolled back ${options.version} automatically: ${failures} failed health checks ` +
          `on "${options.flagKey}". Nobody outside the 5% canary ever saw it.`,
      );
      return { promoted: false, version: options.version, checksRun, failures };
    }
  }

  await options.flags.set({
    key: options.flagKey,
    enabled: true,
    rolloutBps: 10000,
    description: `${options.description} (${options.version})`,
  });
  await options.alert.send(
    `🟢 Promoted ${options.version}: "${options.flagKey}" passed ${healthy} straight health ` +
      `checks on the 5% canary and is now live for everyone.`,
  );
  return { promoted: true, version: options.version, checksRun, failures };
}
