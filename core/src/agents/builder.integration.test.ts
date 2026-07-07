import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { createDb, databaseUrl } from '../db/database.js';
import { migrateDownAll, migrateToLatest } from '../db/migrator.js';
import { seedMarkets } from '../db/seed.js';
import { flagsRepo } from '../flags/flags.js';
import type { AlertSink } from '../observability/alerts.js';
import { builderPipeline, type AgentChange } from './builder.js';
import { bursarService, BursarError, type VendorPricing } from './bursar.js';

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
if (!reachable) console.warn('⚠ P29 gate tests SKIPPED: Postgres unreachable.');

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

const ok = () => Promise.resolve(true);
const bad = () => Promise.resolve(false);

describe.runIf(reachable)('P29 — Builder + Bursar quarterly drill (gate)', () => {
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

  function pipeline(overrides?: { founder?: (s: string) => Promise<boolean>; now?: () => Date }) {
    const alert = alertSpy();
    const flags = flagsRepo(db, 'jm');
    const builder = builderPipeline({
      db,
      marketId: 'jm',
      flags,
      alert,
      founderApproves: overrides?.founder ?? ok,
      ...(overrides?.now ? { now: overrides.now } : {}),
    });
    return { builder, flags, alert };
  }

  function change(id: string, parts: Partial<AgentChange>): AgentChange {
    return {
      id,
      title: `drill change ${id}`,
      summary: `One sentence: ship ${id}?`,
      flagKey: `builder.${id}`,
      sandboxTests: ok,
      simulate: ok,
      healthCheck: ok,
      ...parts,
    };
  }

  it('GATE: a deliberately bad change is caught at EACH stage', async () => {
    const { builder, flags } = pipeline();

    // Stage 1 — fails sandbox: nothing else runs, no flag ever set.
    const s1 = await builder.run(change('bad-sandbox', { sandboxTests: bad }));
    expect(s1).toMatchObject({ outcome: 'stopped', stoppedAt: 'sandbox' });
    expect(await flags.get('builder.bad-sandbox')).toBeUndefined();

    // Stage 2 — fails simulation: canary never starts.
    const s2 = await builder.run(change('bad-sim', { simulate: bad }));
    expect(s2).toMatchObject({ outcome: 'stopped', stoppedAt: 'simulation' });
    expect(await flags.get('builder.bad-sim')).toBeUndefined();

    // Stage 3 — fails canary health: auto-rollback, founder never asked.
    let founderAsked = false;
    const {
      builder: b3,
      flags: f3,
      alert: a3,
    } = pipeline({
      founder: () => {
        founderAsked = true;
        return Promise.resolve(true);
      },
    });
    const s3 = await b3.run(change('bad-canary', { healthCheck: bad }));
    expect(s3).toMatchObject({ outcome: 'stopped', stoppedAt: 'canary' });
    expect(founderAsked).toBe(false);
    const canaryFlag = await f3.get('builder.bad-canary');
    expect(canaryFlag?.enabled).toBe(false); // rolled back to off
    expect(a3.messages.some((m) => m.includes('Rolled back'))).toBe(true);

    // Stage 4 — founder declines: fully rolled back, not shipped.
    const { builder: b4, flags: f4 } = pipeline({ founder: () => Promise.resolve(false) });
    const s4 = await b4.run(change('declined', {}));
    expect(s4).toMatchObject({ outcome: 'stopped', stoppedAt: 'founder_tap' });
    const declinedFlag = await f4.get('builder.declined');
    expect(declinedFlag?.enabled).toBe(false);

    // Every stage decision is on the audit record.
    const events = await db
      .selectFrom('events_outbox')
      .where('topic', '=', 'builder.stage')
      .selectAll()
      .execute();
    expect(events.length).toBeGreaterThanOrEqual(7);
  });

  it('GATE: a good change ships with founder tap, then the 72h watch rolls it back on decay', async () => {
    let clock = new Date('2026-07-07T12:00:00Z').getTime();
    const { builder, flags, alert } = pipeline({ now: () => new Date(clock) });

    let healthy = true;
    const good = change('good', { healthCheck: () => Promise.resolve(healthy) });
    const run = await builder.run(good);
    expect(run.outcome).toBe('shipped');
    expect(run.rollbackArmedUntil).toEqual(new Date(clock + 72 * 3_600_000));
    expect((await flags.get('builder.good'))?.rolloutBps).toBe(10000);

    // 24h later the change decays — the armed watch rolls it back.
    clock += 24 * 3_600_000;
    healthy = false;
    expect(await builder.rollbackWatch(good, run)).toBe('rolled_back');
    expect((await flags.get('builder.good'))?.enabled).toBe(false);
    expect(alert.messages.some((m) => m.includes('Auto-rollback'))).toBe(true);
  });

  it('after the 72h window the watch stands down', async () => {
    let clock = new Date('2026-07-08T12:00:00Z').getTime();
    const { builder } = pipeline({ now: () => new Date(clock) });
    const stale = change('stale', { healthCheck: bad });
    const run = await builder.run(change('stale', {}));
    expect(run.outcome).toBe('shipped');
    clock += 73 * 3_600_000; // past the window
    expect(await builder.rollbackWatch(stale, run)).toBe('held');
  });

  it('GATE: a cheaper non-DPA vendor swap is blocked before reaching the founder', () => {
    const current: VendorPricing[] = [
      {
        vendorId: 'anthropic',
        lane: 'llm',
        monthlyCostMinor: 40_000,
        dpaSigned: true,
        laneHandlesPii: true,
      },
      {
        vendorId: 'lynk',
        lane: 'payments',
        monthlyCostMinor: 25_000,
        dpaSigned: true,
        laneHandlesPii: true,
      },
      {
        vendorId: 'bunny-cdn',
        lane: 'media_storage',
        monthlyCostMinor: 8_000,
        dpaSigned: false,
        laneHandlesPii: false,
      },
    ];
    const bursar = bursarService(current);

    const report = bursar.monthlyReport();
    expect(report.totalMinor).toBe(73_000);
    expect(report.lines).toHaveLength(3);

    const { proposals, blocked } = bursar.proposeSwaps([
      // 60% cheaper LLM, no DPA — must be blocked, never proposed.
      {
        vendorId: 'cheapo-llm',
        lane: 'llm',
        monthlyCostMinor: 16_000,
        dpaSigned: false,
        laneHandlesPii: true,
      },
      // Cheaper media storage, no PII on the lane — a fine proposal.
      {
        vendorId: 'cheap-store',
        lane: 'media_storage',
        monthlyCostMinor: 5_000,
        dpaSigned: false,
        laneHandlesPii: false,
      },
    ]);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      lane: 'media_storage',
      toVendorId: 'cheap-store',
      monthlySavingMinor: 3_000,
    });
    expect(blocked).toHaveLength(1);
    expect(blocked[0]!.vendorId).toBe('cheapo-llm');
    expect(blocked[0]!.reason).toContain('DPA');

    // Belt and braces: even a forged proposal cannot execute a PII swap.
    expect(() =>
      bursar.executeSwap(
        {
          lane: 'llm',
          fromVendorId: 'anthropic',
          toVendorId: 'cheapo-llm',
          monthlySavingMinor: 24_000,
        },
        {
          vendorId: 'cheapo-llm',
          lane: 'llm',
          monthlyCostMinor: 16_000,
          dpaSigned: false,
          laneHandlesPii: true,
        },
      ),
    ).toThrowError(BursarError);
  });
});
