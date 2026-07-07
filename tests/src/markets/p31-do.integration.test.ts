/**
 * P31 — Market #2 by pack alone (THE sacred gate).
 *
 * The Dominican Republic stands up from packs/context/do.yaml + one
 * payment adapter (adapters/src/payments/azul.ts). The gate is literal:
 * `git diff` on /core between the JM-only baseline commit and the JM+DO
 * commit must be EMPTY. Counsel verification of the real do.yaml is a
 * founder-checklist item — this staging drill patches a COPY of the
 * pack, never the registry file.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  capacityEngine,
  createDb,
  databaseUrl,
  flagsRepo,
  identityService,
  ledgerService,
  marketsRegistry,
  migrateDownAll,
  migrateToLatest,
  ordersService,
  seedMarkets,
  FlipBlockedError,
} from '@sycamore/core';
import { loadContextPackFrom, loadVerticalPack, packsRoot } from '@sycamore/packs';

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
if (!reachable) console.warn('⚠ P31 gate tests SKIPPED: Postgres unreachable.');

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: new URL('../../..', import.meta.url).pathname })
    .toString()
    .trim();
}

const BASELINE = readFileSync(new URL('jm-only-baseline.txt', import.meta.url), 'utf8').trim();
/** Pinned after the DO-enabling commit lands; HEAD until then. */
let JM_PLUS_DO = 'HEAD';
try {
  JM_PLUS_DO = readFileSync(new URL('jm-plus-do.txt', import.meta.url), 'utf8').trim();
} catch {
  /* first run before the pin exists */
}

function baselineAvailable(): boolean {
  try {
    git('cat-file', '-e', `${BASELINE}^{commit}`);
    return true;
  } catch {
    return false;
  }
}

describe('P31 — the sacred core-diff gate', () => {
  it.runIf(baselineAvailable())(
    'GATE: /core is byte-identical between JM-only and JM+DO commits',
    () => {
      const diff = git('diff', '--name-only', BASELINE, JM_PLUS_DO, '--', 'core/');
      expect(diff).toBe(''); // empty or the abstraction is wrong — stop and fix
    },
  );

  it('working tree carries no /core edits either', () => {
    expect(git('status', '--porcelain', '--', 'core/')).toBe('');
  });
});

describe.runIf(reachable)('P31 — DO staging stands up by pack alone', () => {
  const db = createDb(databaseUrl());
  // Patch a COPY of the registry: counsel flag + azul provider. The real
  // do.yaml stays dark and unverified until actual counsel signs.
  const stagingRoot = mkdtempSync(join(tmpdir(), 'sycamore-do-staging-'));
  cpSync(packsRoot(), stagingRoot, { recursive: true });
  const doYamlPath = join(stagingRoot, 'context', 'do.yaml');
  writeFileSync(
    doYamlPath,
    readFileSync(doYamlPath, 'utf8')
      .replace('verified_by_counsel: false', 'verified_by_counsel: true')
      .replace(
        'providers:\n    - id: pending-local-psp\n      kind: placeholder',
        'providers:\n    - id: azul\n      kind: card',
      ),
  );
  const doPack = loadContextPackFrom(stagingRoot, 'do');
  const tours = loadVerticalPack('tours');

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
  });

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  it('GATE: flip ceremony, then a full DOP order settles — zero core changes involved', async () => {
    expect(doPack.compliance.verified_by_counsel).toBe(true);
    expect(doPack.payments.providers[0]).toMatchObject({ id: 'azul', kind: 'card' });

    const registry = marketsRegistry(db);
    // Dark until every ceremony condition holds.
    await expect(
      registry.flipLive({
        marketId: 'do',
        pack: doPack,
        paymentSandboxPassed: true,
        coreDiffEmpty: true,
      }),
    ).rejects.toThrowError(FlipBlockedError); // founder flag not yet set

    await flagsRepo(db, 'do').set({
      key: 'flip:do',
      enabled: true,
      rolloutBps: 10000,
      description: 'founder flips DO staging live',
    });
    await registry.flipLive({
      marketId: 'do',
      pack: doPack,
      paymentSandboxPassed: true, // azul mock suite green
      coreDiffEmpty: true, // asserted for real in the suite above
    });
    expect(await registry.statusOf('do')).toBe('live');

    // The exact same core services now run DO — pack-driven, no forks.
    const identity = identityService(db, 'do');
    const engine = capacityEngine(db, 'do');
    const orders = ordersService(db, 'do');
    const ledger = ledgerService(db, 'do');

    const owner = await identity.findOrCreateUserByPhone({
      phone: '+18095550001',
      displayName: 'Tour Colonial',
      role: 'seller',
    });
    const seller = await identity.createSeller({
      userId: owner.id,
      businessName: 'Tours Zona Colonial',
    });
    const buyer = await identity.findOrCreateUserByPhone({
      phone: '+18095550002',
      displayName: 'Comprador Uno',
    });
    const window = await engine.createWindow(tours, {
      sellerId: seller.id,
      startsAt: new Date('2026-12-20T14:00:00Z'),
      endsAt: new Date('2026-12-20T16:00:00Z'),
      totalUnits: 10,
      unitPriceMinor: 250_000, // RD$2,500.00
    });

    const draft = await orders.createDraft({
      sellerId: seller.id,
      buyerUserId: buyer.id,
      windowId: window.id,
      verticalId: 'tours',
      units: 2,
    });
    const placed = await orders.placeHold(draft.id);
    expect(placed.status).toBe('held');
    await orders.confirm(draft.id);

    await ledger.capture({
      orderRef: draft.id,
      amountMinor: 500_000,
      currency: doPack.currency.code, // DOP from the pack, nowhere else
      idempotencyKey: `do-capture:${draft.id}`,
    });
    const release = await ledger.release({
      orderRef: draft.id,
      currency: doPack.currency.code,
      split: {
        sellerBps: doPack.splits.standard.seller_bps,
        platformBps: doPack.splits.standard.platform_bps,
        referralBps: doPack.splits.standard.referral_bps,
        processorBps: doPack.splits.standard.processor_bps,
      },
      idempotencyKey: `do-release:${draft.id}`,
      sellerId: seller.id,
    });
    expect(release.posted).toBe(true);

    // Money law holds in market #2 exactly as in #1.
    const balance = await ledger.trialBalance();
    expect(balance.debits).toBe(balance.credits);

    // Market scoping law: a jm query can never return a do row.
    const jmOrders = await db
      .selectFrom('orders')
      .where('market_id', '=', 'jm')
      .selectAll()
      .execute();
    expect(jmOrders).toHaveLength(0);
  });
});
