import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { cpSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadAllContextPacks,
  loadContextPack,
  loadContextPackFrom,
  listContextPackIds,
  packsRoot,
  PackLoadError,
} from '@sycamore/packs';
import { createDb, databaseUrl } from '../db/database.js';
import { migrateDownAll, migrateToLatest } from '../db/migrator.js';
import { seedMarkets } from '../db/seed.js';
import { usersRepo } from '../db/repositories/users.js';
import { flagsRepo } from '../flags/flags.js';
import { emitEvent } from '../db/outbox.js';
import { FlipBlockedError, MarketNotLiveError, marketsRegistry } from './registry.js';

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
  console.warn('⚠ P6.5 gate tests SKIPPED: Postgres unreachable. Run `docker compose up -d`.');
}

const DARK_IDS = ['tt', 'bb', 'bs', 'gy', 'bz', 'lc', 'gd', 'vc', 'ag', 'kn', 'dm', 'do', 'mx'];

describe.runIf(reachable)('P6.5 — market registry & region lockdown (gate)', () => {
  const db = createDb(databaseUrl());
  const registry = marketsRegistry(db);

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
  });

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  describe('registry state', () => {
    it('every Anglo-Caribbean pack + wave-2 loads validly and is registered', () => {
      const ids = listContextPackIds();
      for (const id of ['jm', ...DARK_IDS]) expect(ids).toContain(id);
      const packs = loadAllContextPacks();
      expect(packs.length).toBeGreaterThanOrEqual(14);
      for (const pack of packs) {
        if (pack.market_id === 'jm') continue;
        expect(pack.compliance.verified_by_counsel).toBe(false);
        expect(pack.payments.providers[0]?.kind).toBe('placeholder');
      }
    });

    it('exactly one market is live at v1.0: jm', async () => {
      expect(await registry.listLive()).toEqual(['jm']);
      expect(await registry.statusOf('jm')).toBe('live');
      for (const id of DARK_IDS) expect(await registry.statusOf(id)).toBe('dark');
    });
  });

  describe('lockdown semantics', () => {
    it('a dark market route-asserts as 404', async () => {
      await expect(registry.assertLive('tt')).rejects.toThrowError(MarketNotLiveError);
      const err = await registry.assertLive('tt').catch((e: unknown) => e);
      expect((err as MarketNotLiveError).httpStatus).toBe(404);
      // Unknown market: same 404 — dark and nonexistent are indistinguishable.
      await expect(registry.assertLive('zz')).rejects.toThrowError(MarketNotLiveError);
      await expect(registry.assertLive('jm')).resolves.toBeUndefined();
    });

    it('workers/jobs/signals no-op for dark markets', async () => {
      let ran = 0;
      const dark = await registry.runIfLive('bb', () => {
        ran++;
        return Promise.resolve('x');
      });
      expect(dark.ran).toBe(false);
      expect(ran).toBe(0);
      const live = await registry.runIfLive('jm', () => {
        ran++;
        return Promise.resolve('x');
      });
      expect(live.ran).toBe(true);
      expect(ran).toBe(1);
    });

    it('GATE: dark-market domain data cannot be written by ANY code path', async () => {
      // Repository path
      await expect(
        usersRepo(db, 'tt').create({ phone: '+18685550000', displayName: 'Blocked' }),
      ).rejects.toThrowError(/not live — region lockdown/);
      // Raw insert path (bypassing every application layer)
      await expect(
        db
          .insertInto('sellers')
          .values({
            market_id: 'gd',
            user_id: '00000000-0000-0000-0000-000000000000',
            business_name: 'Blocked Ltd',
          })
          .execute(),
      ).rejects.toThrowError(/not live — region lockdown/);
      // Outbox path
      await expect(emitEvent(db, { marketId: 'bz', topic: 'x', payload: {} })).rejects.toThrowError(
        /not live — region lockdown/,
      );
      // And the live market still writes fine.
      const user = await usersRepo(db, 'jm').create({
        phone: '+18765550001',
        displayName: 'Live JM',
      });
      expect(user.market_id).toBe('jm');
    });

    it('cross-market isolation holds under fuzzing, with lockdown active', async () => {
      const jm = usersRepo(db, 'jm');
      for (let i = 0; i < 200; i++) {
        await jm.create({ phone: `+1876600${String(i).padStart(4, '0')}`, displayName: `f${i}` });
      }
      const listed = await jm.list();
      expect(listed.every((u) => u.market_id === 'jm')).toBe(true);
      // Every dark market write attempt in the same storm fails.
      const attempts = await Promise.allSettled(
        DARK_IDS.map((id) =>
          usersRepo(db, id).create({ phone: '+10000000000', displayName: 'nope' }),
        ),
      );
      expect(attempts.every((a) => a.status === 'rejected')).toBe(true);
    });
  });

  describe('flip ceremony', () => {
    it('every missing precondition blocks the flip with a named reason', async () => {
      const tt = loadContextPack('tt');
      const base = { marketId: 'tt', pack: tt, paymentSandboxPassed: true, coreDiffEmpty: true };

      // No founder flag yet.
      await expect(registry.flipLive(base)).rejects.toThrowError(/founder flip flag/);

      await flagsRepo(db, 'tt').set({
        key: 'flip:tt',
        enabled: true,
        rolloutBps: 10000,
        description: 'founder approval to launch Trinidad & Tobago',
      });
      // Counsel has not verified the pack (verified_by_counsel: false).
      await expect(registry.flipLive(base)).rejects.toThrowError(/not verified by counsel/);

      const counselVerified = {
        ...tt,
        compliance: { ...tt.compliance, verified_by_counsel: true },
      };
      await expect(
        registry.flipLive({ ...base, pack: counselVerified, paymentSandboxPassed: false }),
      ).rejects.toThrowError(/payment adapter sandbox/);
      await expect(
        registry.flipLive({ ...base, pack: counselVerified, coreDiffEmpty: false }),
      ).rejects.toThrowError(/core diff is not empty/);
      // Wrong pack entirely.
      await expect(
        registry.flipLive({ ...base, pack: loadContextPack('bb') }),
      ).rejects.toThrowError(FlipBlockedError);

      // All conditions met → tt goes live and its writes unlock.
      await registry.flipLive({ ...base, pack: counselVerified });
      expect(await registry.statusOf('tt')).toBe('live');
      const user = await usersRepo(db, 'tt').create({
        phone: '+18685550001',
        displayName: 'First Trini User',
      });
      expect(user.market_id).toBe('tt');

      // Return tt to dark: lockdown re-engages instantly.
      await registry.setStatus('tt', 'dark');
      await expect(
        usersRepo(db, 'tt').create({ phone: '+18685550002', displayName: 'Blocked Again' }),
      ).rejects.toThrowError(/region lockdown/);
    });
  });

  describe('GATE: chaos — corrupt every dark pack; jm is entirely unaffected', () => {
    it('jm loads and operates with all 13 dark packs corrupted', async () => {
      const chaosRoot = mkdtempSync(join(tmpdir(), 'sycamore-chaos-'));
      cpSync(packsRoot(), chaosRoot, { recursive: true });
      for (const file of readdirSync(join(chaosRoot, 'context'))) {
        if (file === 'jm.yaml') continue;
        writeFileSync(join(chaosRoot, 'context', file), '{{{ totally: [corrupt yaml', 'utf8');
      }

      // Dark packs are provably broken...
      for (const id of DARK_IDS) {
        expect(() => loadContextPackFrom(chaosRoot, id)).toThrowError(PackLoadError);
      }
      // ...and jm operations run with ZERO errors, same code paths.
      let errors = 0;
      try {
        const jmPack = loadContextPackFrom(chaosRoot, 'jm');
        expect(jmPack.currency.symbol).toBe('J$');
        await registry.assertLive('jm');
        await usersRepo(db, 'jm').create({ phone: '+18767770001', displayName: 'Chaos Proof' });
        await emitEvent(db, { marketId: 'jm', topic: 'chaos.proof', payload: {} });
        expect(await registry.listLive()).toEqual(['jm']);
      } catch {
        errors++;
      }
      expect(errors).toBe(0);
    });
  });
});
