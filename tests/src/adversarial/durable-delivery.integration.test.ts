/**
 * C03 CLOSURE TESTS — reliable delivery, external review 2026-09-16.
 *
 * The finding, in one sentence: both deduplication points wrote
 * "processed" BEFORE the work ran, so a crash in between turned the
 * retry into a discarded duplicate and the accepted work was lost.
 *
 *   "A job is marked processed, then the process crashes before its
 *    order mutation. The next delivery is classified as a duplicate.
 *    Acknowledged input can be lost even though duplicate-prevention
 *    tests pass."
 *
 * That last clause is the uncomfortable part and the reason these tests
 * exist: the old behaviour passed every duplicate test in this
 * repository, because suppressing that retry is precisely what the code
 * was written to do. A test that only fires the same message twice can
 * never tell the two apart. These inject the crash.
 *
 * The review's closure conditions:
 *
 *   "Inject crashes before mutation, after mutation/before
 *    acknowledgement, and during an external call. Recover all accepted
 *    work without duplicate order, refund, payout or notification
 *    effects."
 *
 *   "Run concurrent duplicate submissions, different-payload key reuse,
 *    lease expiry, process restart, and multi-tab offline replay tests.
 *    Verify new queued actions survive earlier batch acknowledgements."
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  claimInbound,
  confirmInbound,
  createDb,
  databaseUrl,
  identityService,
  migrateDownAll,
  migrateToLatest,
  releaseInbound,
  replayOfflineQueue,
  seedMarkets,
  stalledInbound,
} from '@sycamore/core';

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
if (!reachable) console.warn('⚠ C03 durable-delivery gates SKIPPED: Postgres unreachable.');

describe.runIf(reachable)('C03 — accepted work survives a crash', () => {
  const db = createDb(databaseUrl());

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
    const identity = identityService(db, 'jm');
    await identity.findOrCreateUserByPhone({
      phone: '+18765559601',
      displayName: 'Delivery Owner',
      role: 'seller',
    });
  });

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  it('GATE: a crash before the effect leaves the work retryable, not lost', async () => {
    const effects: string[] = [];
    const action = { idempotencyKey: 'crash-before', kind: 'record', payload: { n: 1 } };

    // Attempt one dies inside the handler — the crash the review asks to
    // be injected. On the old code the dedupe row was already committed
    // and this work was gone for good.
    const first = await replayOfflineQueue(db, 'jm', [action], {
      record: () => Promise.reject(new Error('worker died mid-handler')),
    });
    expect(first.applied).toBe(0);
    expect(first.results[0]).toMatchObject({ outcome: 'failed' });
    expect(effects).toEqual([]);

    // The phone sends its queue again, as it will.
    const second = await replayOfflineQueue(db, 'jm', [action], {
      record: (p) => {
        effects.push(JSON.stringify(p));
        return Promise.resolve();
      },
    });
    expect(second.applied).toBe(1);
    expect(effects).toEqual(['{"n":1}']);

    // And a third delivery is a duplicate — exactly one effect, total.
    const third = await replayOfflineQueue(db, 'jm', [action], {
      record: (p) => {
        effects.push(JSON.stringify(p));
        return Promise.resolve();
      },
    });
    expect(third.duplicates).toBe(1);
    expect(effects).toHaveLength(1);
  });

  it('GATE: a claim abandoned mid-flight is taken over once its lease expires', async () => {
    // A worker that died AFTER the effect but BEFORE acknowledging it
    // leaves a claim nobody will ever confirm. Until the lease expires
    // the work is somebody else's; after it, it must not be stuck.
    const action = { idempotencyKey: 'abandoned', kind: 'record', payload: { n: 2 } };
    await db
      .insertInto('offline_replays')
      .values({
        market_id: 'jm',
        idempotency_key: action.idempotencyKey,
        kind: action.kind,
        status: 'in_flight',
        claimed_at: new Date(Date.now() - 10 * 60_000),
        completed_at: null,
      })
      .execute();

    // Inside the lease: hands off, and NOT acknowledged to the client.
    const held = await replayOfflineQueue(
      db,
      'jm',
      [action],
      { record: () => Promise.resolve() },
      {
        leaseMs: 30 * 60_000,
      },
    );
    expect(held.results[0]).toMatchObject({ outcome: 'in_flight' });
    expect(held.applied).toBe(0);

    // Past it: taken over and run.
    const ran = await replayOfflineQueue(
      db,
      'jm',
      [action],
      { record: () => Promise.resolve() },
      {
        leaseMs: 60_000,
      },
    );
    expect(ran.applied).toBe(1);
  });

  it('GATE: new actions queued during a flush are not thrown away by its answer', async () => {
    // The browser used to clear the whole queue on any 200, discarding
    // anything added while the request was in flight. The server side of
    // that contract is this: the answer names what it settled, and says
    // nothing about keys it never saw.
    const inFlight = [
      { idempotencyKey: 'batch-a', kind: 'record', payload: { n: 'a' } },
      { idempotencyKey: 'batch-b', kind: 'record', payload: { n: 'b' } },
    ];
    const result = await replayOfflineQueue(db, 'jm', inFlight, {
      record: () => Promise.resolve(),
    });
    const settled = result.results.map((r) => r.idempotencyKey);
    expect(settled).toEqual(['batch-a', 'batch-b']);
    // 'batch-c' was tapped while the request was open. It is not in the
    // answer, so the client keeps it — and it still applies afterwards.
    expect(settled).not.toContain('batch-c');
    const later = await replayOfflineQueue(
      db,
      'jm',
      [{ idempotencyKey: 'batch-c', kind: 'record', payload: { n: 'c' } }],
      { record: () => Promise.resolve() },
    );
    expect(later.applied).toBe(1);
  });

  it('GATE: two tabs replaying the same queue produce one effect each', async () => {
    let effects = 0;
    const actions = Array.from({ length: 8 }, (_, i) => ({
      idempotencyKey: `multi-tab-${i}`,
      kind: 'record',
      payload: { i },
    }));
    const handler = {
      record: async () => {
        await new Promise((r) => setTimeout(r, 5));
        effects++;
      },
    };
    // Same queue, two tabs, at the same moment.
    const [a, b] = await Promise.all([
      replayOfflineQueue(db, 'jm', actions, handler),
      replayOfflineQueue(db, 'jm', actions, handler),
    ]);
    expect(effects).toBe(actions.length);
    // Between them every action is settled exactly once as 'applied';
    // the loser sees duplicates or in-flight, never a second effect.
    expect(a.applied + b.applied).toBe(actions.length);
  });

  it('GATE: the durable inbox claims, confirms, and only then calls it a duplicate', async () => {
    const message = { channel: 'whatsapp', messageId: 'wamid.ABC' };

    const first = await claimInbound(db, message);
    expect(first.outcome).toBe('claimed');
    // A second delivery WHILE the first is in flight is skipped, but it
    // is not spent — nothing has happened yet.
    expect((await claimInbound(db, message)).outcome).toBe('in_flight');

    // The worker dies. Its claim is handed back (or times out), and the
    // redelivery must do the work rather than skip it.
    if (first.outcome === 'claimed') await releaseInbound(db, first.id);
    const retry = await claimInbound(db, message);
    expect(retry.outcome).toBe('claimed');

    // This time it finishes.
    if (retry.outcome === 'claimed') await confirmInbound(db, retry.id);
    expect((await claimInbound(db, message)).outcome).toBe('duplicate');
    expect((await claimInbound(db, message)).outcome).toBe('duplicate');
  });

  it('GATE: a stuck claim is visible to an operator, not silent', async () => {
    await claimInbound(db, { channel: 'whatsapp', messageId: 'wamid.STUCK' });
    await db
      .updateTable('inbound_inbox')
      .set({ claimed_at: new Date(Date.now() - 3_600_000) })
      .where('message_id', '=', 'wamid.STUCK')
      .execute();
    const stalled = await stalledInbound(db);
    expect(stalled.map((s) => s.messageId)).toContain('wamid.STUCK');
    // A queue quietly losing work looks exactly like a healthy one until
    // somebody counts these.
    expect(stalled[0]!.attempts).toBeGreaterThanOrEqual(1);
  });

  it('GATE: concurrent duplicate deliveries of one message claim it once', async () => {
    const message = { channel: 'whatsapp', messageId: 'wamid.RACE' };
    const claims = await Promise.all(
      Array.from({ length: 20 }, () =>
        claimInbound(db, message).catch(() => ({ outcome: 'error' })),
      ),
    );
    expect(claims.filter((c) => c.outcome === 'claimed')).toHaveLength(1);
  });
});
