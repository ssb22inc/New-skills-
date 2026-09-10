import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { createDb, databaseUrl } from '../db/database.js';
import { migrateDownAll, migrateToLatest } from '../db/migrator.js';
import { seedMarkets } from '../db/seed.js';
import { detectDrift, watchmanService } from './watchman.js';
import { fixerService, FixerError, type ActionExecutor } from './fixer.js';
import { loadRunbooks, RunbookLoadError, type Runbook } from './runbooks.js';

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
if (!reachable) console.warn('⚠ P27 gate tests SKIPPED: Postgres unreachable.');

const runbooks = loadRunbooks();

describe('P27 — Watchman drift detection (direction, not just thresholds)', () => {
  const flat = Array.from({ length: 14 }, () => 100);

  it('flags a steady climb as up, well before any absolute limit', () => {
    expect(detectDrift({ baseline: flat, recent: [104, 105, 106] })).toBe('up');
  });

  it('flags decay as down', () => {
    const baseline = [0.97, 0.96, 0.98, 0.97, 0.96, 0.98, 0.97];
    expect(detectDrift({ baseline, recent: [0.71, 0.68, 0.7] })).toBe('down');
  });

  it('normal noise stays stable', () => {
    const baseline = [98, 102, 99, 101, 100, 97, 103, 100];
    expect(detectDrift({ baseline, recent: [101, 99, 100] })).toBe('stable');
  });

  it('runbooks load from versioned files and every action is allow-listed', () => {
    expect(runbooks.length).toBeGreaterThanOrEqual(2);
    for (const rb of runbooks) {
      expect(rb.version).toBeGreaterThanOrEqual(1);
      for (const action of rb.actions) {
        expect(['reroute', 'restart', 'retry', 'pause']).toContain(action);
      }
    }
  });

  it('a runbook inventing a new verb refuses to load', () => {
    expect(() =>
      loadRunbooks(new URL('./fixtures/bad-runbooks/', import.meta.url).pathname),
    ).toThrowError(RunbookLoadError);
  });
});

describe.runIf(reachable)('P27 — injected fault drill (gate, §5.9)', () => {
  const db = createDb(databaseUrl());
  const watchman = watchmanService(db, 'jm');
  const fixer = fixerService(db, 'jm', runbooks);

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
  });

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  it('GATE: a known fault self-heals through the runbook, actions on the record', async () => {
    // Inject the fault: webhook lag climbing from a ~200ms baseline.
    const incidents = await watchman.tick({
      webhook_lag_ms: {
        baseline: [190, 210, 205, 195, 200, 202, 198],
        recent: [900, 1400, 2100],
      },
    });
    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toMatchObject({ vital: 'webhook_lag_ms', direction: 'up' });

    const executed: string[] = [];
    const executor: ActionExecutor = (action) => {
      executed.push(action);
      return Promise.resolve();
    };
    const result = await fixer.handle(incidents[0]!.id, executor);
    expect(result.outcome).toBe('healed');
    expect(executed).toEqual(['retry', 'restart']); // exactly the runbook, in order

    const actions = await db
      .selectFrom('agent_actions')
      .where('incident_id', '=', incidents[0]!.id)
      .selectAll()
      .execute();
    expect(actions).toHaveLength(2);
    for (const a of actions) {
      expect(a.runbook_id).toBe('webhook-lag-rising');
      expect(a.runbook_version).toBe(1);
    }
    const healed = await db
      .selectFrom('agent_incidents')
      .where('id', '=', incidents[0]!.id)
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(healed.status).toBe('healed');
  });

  it('GATE: a novel fault escalates and provably never improvises', async () => {
    // order_confirm_rate falling has NO runbook — on purpose.
    const incidents = await watchman.tick({
      order_confirm_rate: {
        baseline: [0.91, 0.9, 0.92, 0.91, 0.9, 0.92, 0.91],
        recent: [0.42, 0.38, 0.4],
      },
    });
    expect(incidents).toHaveLength(1);

    const executed: string[] = [];
    const executor: ActionExecutor = (action) => {
      executed.push(action);
      return Promise.resolve();
    };
    const result = await fixer.handle(incidents[0]!.id, executor);
    expect(result.outcome).toBe('escalated');
    expect(executed).toEqual([]); // ZERO actions — the executor never ran

    const actions = await db
      .selectFrom('agent_actions')
      .where('incident_id', '=', incidents[0]!.id)
      .selectAll()
      .execute();
    expect(actions).toHaveLength(0);

    const pages = await db
      .selectFrom('events_outbox')
      .where('topic', '=', 'agents.page_founder')
      .selectAll()
      .execute();
    expect(pages).toHaveLength(1);
    expect(JSON.stringify(pages[0]!.payload)).toContain('does not improvise');
  });

  it('a tampered runbook object is stopped at the moment of execution', async () => {
    const tampered: Runbook = {
      id: 'evil',
      version: 1,
      title: 'injected',
      trigger: { vital: 'message_throughput', direction: 'down' },
      actions: ['drop_all_tables' as never],
      notes: '',
    };
    const evilFixer = fixerService(db, 'jm', [tampered]);
    const incidents = await watchman.tick({
      message_throughput: {
        baseline: [500, 510, 505, 495, 500, 502, 498],
        recent: [90, 80, 85],
      },
    });
    expect(incidents).toHaveLength(1);
    const executed: string[] = [];
    await expect(
      evilFixer.handle(incidents[0]!.id, (a) => {
        executed.push(a);
        return Promise.resolve();
      }),
    ).rejects.toThrowError(FixerError);
    expect(executed).toEqual([]); // firewall fired BEFORE anything executed
  });

  it('an open incident is not re-opened by the next patrol pass', async () => {
    const again = await watchman.tick({
      message_throughput: {
        baseline: [500, 510, 505, 495, 500, 502, 498],
        recent: [90, 80, 85],
      },
    });
    expect(again).toHaveLength(0);
  });
});
