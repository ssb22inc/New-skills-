/**
 * BUILD §5.7 — ADVERSARIAL / FRAUD RED TEAM: OWASP top-10 and auth fuzzing.
 *
 * §5.7's last bullet reads "OWASP top-10 + auth fuzzing; annual external
 * pen test from Phase 2 onward." The external pen test is a purchase
 * order, not code, and stays a human gate. The rest is code, and until
 * now none of it had been written — the injection corpus covered the
 * CONVERSATION layer (a compromised model being told to refund
 * everything) and nothing covered the ordinary web surface underneath it.
 *
 * Four classes, chosen because each one has actually taken down a
 * marketplace somewhere:
 *
 *   BROKEN AUTHENTICATION — the webhook signature is the only thing
 *   standing between a stranger and "this order is paid". Fuzzed with
 *   the mistakes that make HMAC checks fall open: missing header, wrong
 *   secret, right secret wrong body, truncated digest, case-swapped hex,
 *   and a digest with something appended.
 *
 *   INJECTION — a seller's business name is attacker-controlled text
 *   that reaches SQL and then HTML. Both are probed with the payloads
 *   that work when nobody parameterised or escaped.
 *
 *   BROKEN ACCESS CONTROL — every table carries `market_id` and every
 *   query is market-scoped. A `jm` identifier handed to a `do` service
 *   must return nothing, or the sharding key is decoration.
 *
 *   PATH TRAVERSAL — pack ids name files on disk. An id containing `..`
 *   must not read them.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { hmacSha256Hex, verifyHmacSignature } from '@sycamore/gateway';
import { loadContextPack } from '@sycamore/packs';
import { trustPage } from '@sycamore/web';
import {
  createDb,
  databaseUrl,
  identityService,
  migrateDownAll,
  migrateToLatest,
  seedMarkets,
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
if (!reachable) console.warn('⚠ §5.7 OWASP red team SKIPPED: Postgres unreachable.');

const SECRET = 'a-webhook-secret-nobody-should-guess';
const BODY = Buffer.from(JSON.stringify({ event: 'payment.captured', amount_minor: 900_000 }));

describe('§5.7 red team — auth fuzzing on the webhook signature', () => {
  const good = `sha256=${hmacSha256Hex(SECRET, BODY)}`;

  it('the honest signature is accepted, so the test can fail for the right reason', () => {
    expect(verifyHmacSignature(SECRET, BODY, good)).toBe(true);
  });

  it('GATE: every malformed or forged signature is rejected', () => {
    const forgeries: [string, string | undefined][] = [
      ['no header at all', undefined],
      ['empty header', ''],
      ['just the prefix', 'sha256='],
      ['prefix missing', hmacSha256Hex(SECRET, BODY)],
      ['wrong algorithm label', `sha1=${hmacSha256Hex(SECRET, BODY)}`],
      ['digest truncated by one character', good.slice(0, -1)],
      ['digest with a character appended', `${good}0`],
      ['hex case flipped', good.toUpperCase()],
      [
        'first hex digit changed',
        good.replace(/=(.)/, (_m, c: string) => `=${c === '0' ? '1' : '0'}`),
      ],
      ['signed with a different secret', `sha256=${hmacSha256Hex(`${SECRET}x`, BODY)}`],
      ['signed over a different body', `sha256=${hmacSha256Hex(SECRET, Buffer.from('{}'))}`],
      ['a plausible-looking all-zero digest', `sha256=${'0'.repeat(64)}`],
      ['whitespace padding', ` ${good} `],
      ['null byte appended', `${good}${String.fromCharCode(0)}`],
    ];
    for (const [name, header] of forgeries) {
      expect(verifyHmacSignature(SECRET, BODY, header), `accepted: ${name}`).toBe(false);
    }
  });

  it('GATE: one flipped byte anywhere in the body invalidates the signature', () => {
    // Signature over the RAW bytes, not the parsed object — otherwise a
    // re-serialisation changes the meaning and keeps the digest.
    for (let i = 0; i < BODY.length; i += 7) {
      const tampered = Buffer.from(BODY);
      tampered[i] = (tampered[i] ?? 0) ^ 0x01;
      expect(verifyHmacSignature(SECRET, tampered, good), `byte ${i} went unnoticed`).toBe(false);
    }
  });
});

describe('§5.7 red team — path traversal through pack ids', () => {
  it('GATE: a pack id cannot escape the packs directory', () => {
    for (const id of [
      '../../../etc/passwd',
      '..%2f..%2fetc%2fpasswd',
      '/etc/passwd',
      'jm/../../../etc/passwd',
      '....//....//etc/passwd',
    ]) {
      // Either refused outright or simply not found — never a file read
      // from outside the pack directory.
      let leaked: string;
      try {
        leaked = JSON.stringify(loadContextPack(id));
      } catch {
        leaked = '';
      }
      expect(leaked, `pack id "${id}" read something`).not.toContain('root:');
      expect(leaked).toBe('');
    }
  });
});

describe.runIf(reachable)('§5.7 red team — injection and access control', () => {
  const db = createDb(databaseUrl());
  // Classics. If any of these change the query instead of being stored
  // as text, the payload is the answer and the test says so.
  const SQLI = "Rasta'); DROP TABLE sellers; --";
  const XSS = '<script>alert(document.cookie)</script>';
  let sqliSellerId = '';
  let xssSellerId = '';

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
    const identity = identityService(db, 'jm');
    const owner = await identity.findOrCreateUserByPhone({
      phone: '+18765559001',
      displayName: SQLI,
      role: 'seller',
    });
    sqliSellerId = (await identity.createSeller({ userId: owner.id, businessName: SQLI })).id;
    const owner2 = await identity.findOrCreateUserByPhone({
      phone: '+18765559002',
      displayName: 'Honest Owner',
      role: 'seller',
    });
    xssSellerId = (await identity.createSeller({ userId: owner2.id, businessName: XSS })).id;
  });

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  it('GATE: SQL in a business name is stored as text and executes nothing', async () => {
    // The table still exists, which is the whole assertion: a dropped
    // table would make this query throw instead of returning a row.
    const row = await db
      .selectFrom('sellers')
      .where('market_id', '=', 'jm')
      .where('id', '=', sqliSellerId)
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(row.business_name).toBe(SQLI);
    const all = await db.selectFrom('sellers').where('market_id', '=', 'jm').selectAll().execute();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it('GATE: a script tag in a business name is escaped before it reaches a buyer', async () => {
    const res = await trustPage(new Request('https://x/'), {
      params: Promise.resolve({ market: 'jm', seller: xssSellerId }),
    });
    const html = await res.text();
    expect(res.status).toBe(200);
    // The name is shown — escaped — and never as a live tag.
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert(');
  });

  it('GATE: a jm identifier is invisible to a do-scoped service', async () => {
    // Law: every table carries market_id and every query is scoped by
    // it. The seller exists; asking for it as another market must not
    // find it, or the future sharding key means nothing today.
    const asOtherMarket = identityService(db, 'do');
    expect(await asOtherMarket.getSeller(sqliSellerId)).toBeUndefined();
    const rows = await db
      .selectFrom('sellers')
      .where('market_id', '=', 'do')
      .where('id', '=', sqliSellerId)
      .selectAll()
      .execute();
    expect(rows).toEqual([]);
  });

  it('a trust page for the wrong market 404s rather than leaking the seller', async () => {
    const res = await trustPage(new Request('https://x/'), {
      params: Promise.resolve({ market: 'do', seller: xssSellerId }),
    });
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain(XSS);
  });

  it('an unknown seller id 404s and reveals nothing about what exists', async () => {
    const res = await trustPage(new Request('https://x/'), {
      params: Promise.resolve({ market: 'jm', seller: randomUUID() }),
    });
    expect(res.status).toBe(404);
  });
});
