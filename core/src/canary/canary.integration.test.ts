import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { createDb, databaseUrl } from '../db/database.js';
import { migrateDownAll, migrateToLatest } from '../db/migrator.js';
import { seedMarkets } from '../db/seed.js';
import { flagsRepo, isEnabledFor } from '../flags/flags.js';
import { canaryRelease } from './canary.js';
import type { AlertSink } from '../observability/alerts.js';

async function postgresReachable(): Promise<boolean> {
  const client = new pg.Client({ connectionString: databaseUrl(), connectionTimeoutMillis: 1500 });
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

const reachable = await postgresReachable();
if (!reachable) {
  console.warn('⚠ P6 gate tests SKIPPED: Postgres unreachable. Run `docker compose up -d`.');
}

/** The founder's WhatsApp, played by an array. */
function alertSpy(): AlertSink & { messages: string[] } {
  const messages: string[] = [];
  return {
    messages,
    send(message: string) {
      messages.push(message);
      return Promise.resolve();
    },
  };
}

describe.runIf(reachable)('P6 — flags + canary + observability (gate)', () => {
  const db = createDb(databaseUrl());

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
  });

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  describe('typed flag accessor', () => {
    it('upserts and reads back a flag, market-scoped', async () => {
      const flags = flagsRepo(db, 'jm');
      await flags.set({
        key: 'new-receipt-copy',
        enabled: true,
        rolloutBps: 500,
        description: 'friendlier receipt wording',
      });
      const flag = await flags.get('new-receipt-copy');
      expect(flag?.enabled).toBe(true);
      expect(flag?.rolloutBps).toBe(500);
      expect(await flags.get('missing')).toBeUndefined();
    });

    it('a 5% rollout exposes ~5% of subjects, deterministically', async () => {
      const flags = flagsRepo(db, 'jm');
      await flags.set({
        key: 'canary-cohort',
        enabled: true,
        rolloutBps: 500,
        description: 'cohort test',
      });
      const flag = await flags.get('canary-cohort');
      const subjects = Array.from({ length: 10_000 }, (_, i) => `user-${i}`);
      const inCohort = subjects.filter((s) => isEnabledFor(flag, s));
      expect(inCohort.length).toBeGreaterThan(300); // ~5% ± noise
      expect(inCohort.length).toBeLessThan(700);
      // Stability: the same subject gets the same answer every time.
      for (const s of subjects.slice(0, 100)) {
        expect(isEnabledFor(flag, s)).toBe(inCohort.includes(s));
      }
      // Disabled or 0 bps means nobody, regardless of hash.
      expect(isEnabledFor(undefined, 'user-1')).toBe(false);
    });
  });

  describe('GATE: ship → canary → forced failure → automatic rollback → alert', () => {
    it('rolls back a bad change automatically and alerts the founder', async () => {
      const flags = flagsRepo(db, 'jm');
      const founderPhone = alertSpy();

      // The trivial change: new greeting copy behind a flag. Its health
      // check is FORCED to fail — this deploy is bad by construction.
      const result = await canaryRelease({
        flags,
        alert: founderPhone,
        flagKey: 'greeting-v2',
        version: 'v2.0.1',
        description: 'new greeting copy',
        healthCheck: () => Promise.resolve(false),
        failureBudget: 2,
      });

      expect(result.promoted).toBe(false);
      expect(result.failures).toBe(2);

      // The flag was turned OFF automatically — full rollback, no human.
      const flag = await flags.get('greeting-v2');
      expect(flag?.enabled).toBe(false);
      expect(flag?.rolloutBps).toBe(0);

      // The founder got exactly one plain-language alert.
      expect(founderPhone.messages).toHaveLength(1);
      expect(founderPhone.messages[0]).toContain('Rolled back v2.0.1');
      expect(founderPhone.messages[0]).toContain('canary');
    });

    it('promotes a healthy change to 100% and says so', async () => {
      const flags = flagsRepo(db, 'jm');
      const founderPhone = alertSpy();

      const result = await canaryRelease({
        flags,
        alert: founderPhone,
        flagKey: 'greeting-v2',
        version: 'v2.0.2',
        description: 'new greeting copy, fixed',
        healthCheck: () => Promise.resolve(true),
        requiredHealthyChecks: 5,
      });

      expect(result.promoted).toBe(true);
      const flag = await flags.get('greeting-v2');
      expect(flag?.enabled).toBe(true);
      expect(flag?.rolloutBps).toBe(10000);
      expect(founderPhone.messages[0]).toContain('Promoted v2.0.2');
    });

    it('a flaky canary that recovers within budget still needs consecutive greens', async () => {
      const flags = flagsRepo(db, 'jm');
      const founderPhone = alertSpy();
      let call = 0;
      const result = await canaryRelease({
        flags,
        alert: founderPhone,
        flagKey: 'flaky-change',
        version: 'v2.1.0',
        description: 'flaky but survivable',
        // Fails once early, then stays healthy.
        healthCheck: () => Promise.resolve(++call !== 2),
        requiredHealthyChecks: 3,
        failureBudget: 2,
      });
      expect(result.promoted).toBe(true);
      expect(result.failures).toBe(1);
      expect(result.checksRun).toBeGreaterThanOrEqual(5); // reset after the failure
    });
  });
});
