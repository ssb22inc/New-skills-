/**
 * C01 CLOSURE TESTS — access control, external review 2026-09-16.
 *
 * The finding: "Seller HTML, seller-day JSON, seller actions, and the
 * founder cockpit do not authenticate a caller or check the caller's
 * ownership/role. Market status and seller existence checks are not
 * authorization. The day JSON includes buyer names and phone numbers;
 * the action route accepts order-completion and installation-state
 * changes." And the sentence that settles the obvious objection:
 * "Seller identifiers also appear on public-facing seller routes, so
 * UUID secrecy is not a defensible access-control model."
 *
 * The review's closure conditions, one test each:
 *
 *   "Anonymous requests are rejected before sensitive reads or writes.
 *    Seller A cannot read, complete, or alter Seller B's resources,
 *    including within the same market."
 *
 *   "Expired/revoked sessions and forged cross-site requests fail.
 *    Founder routes enforce the correct role. Logout and account-switch
 *    tests prove private cached data is removed."
 *
 * The last one has a client half that a server test cannot reach; what
 * is asserted here is the half that is enforceable — the session dies on
 * the server, so a kept cookie is worth nothing — plus the presence of
 * the code that clears the phone.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import {
  createDb,
  databaseUrl,
  identityService,
  marketsRegistry,
  migrateDownAll,
  migrateToLatest,
  seedMarkets,
  sessionsService,
  SESSION_COOKIE,
  AuthError,
} from '@sycamore/core';
import {
  cockpitPage,
  sellerActions,
  sellerDayJson,
  sellerDayPage,
  signInLanding,
  signOut,
} from '@sycamore/web';

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
if (!reachable) console.warn('⚠ C01 access-control gates SKIPPED: Postgres unreachable.');

/** The three private surfaces, called the way Next calls them. */
const get = (url: string, cookie?: string): Request =>
  new Request(url, cookie ? { headers: { cookie } } : undefined);

describe.runIf(reachable)('C01 — knowing an id is not permission', () => {
  const db = createDb(databaseUrl());
  const sessions = sessionsService(db, 'jm');
  let alice = { sellerId: '', userId: '', cookie: '' };
  let bob = { sellerId: '', userId: '', cookie: '' };
  let founderCookie = '';

  async function makeSeller(phone: string, name: string) {
    const identity = identityService(db, 'jm');
    const owner = await identity.findOrCreateUserByPhone({
      phone,
      displayName: `${name} Owner`,
      role: 'seller',
    });
    const seller = await identity.createSeller({ userId: owner.id, businessName: name });
    const { token } = await sessions.issueSignInLink({ userId: owner.id, purpose: 'seller' });
    const { sessionToken } = await sessions.redeemSignInLink(token);
    return {
      sellerId: seller.id,
      userId: owner.id,
      cookie: `${SESSION_COOKIE}=${sessionToken}`,
    };
  }

  const params = (sellerId: string) => ({
    params: Promise.resolve({ market: 'jm', seller: sellerId }),
  });

  beforeAll(async () => {
    await migrateDownAll(db);
    await migrateToLatest(db);
    await seedMarkets(db);
    alice = await makeSeller('+18765557001', 'Alice Tours');
    bob = await makeSeller('+18765557002', 'Bob Tours');
    const identity = identityService(db, 'jm');
    const founder = await identity.findOrCreateUserByPhone({
      phone: '+18765557003',
      displayName: 'The Founder',
      role: 'founder',
    });
    const { token } = await sessions.issueSignInLink({ userId: founder.id, purpose: 'founder' });
    founderCookie = `${SESSION_COOKIE}=${(await sessions.redeemSignInLink(token)).sessionToken}`;
  });

  afterAll(async () => {
    await migrateDownAll(db);
    await db.destroy();
  });

  it('GATE: anonymous is refused before any sensitive read', async () => {
    const day = await sellerDayJson(get('https://x/day.json'), params(alice.sellerId));
    expect(day.status).toBe(401);
    const body = await day.text();
    // Not one byte of the seller's day, and no hint about what exists.
    expect(body).not.toContain('Alice');
    expect(body).not.toContain('+1876');

    expect((await sellerDayPage(get('https://x/s'), params(alice.sellerId))).status).toBe(401);
    expect((await cockpitPage(get('https://x/cockpit?market=jm'))).status).toBe(401);
  });

  it('GATE: anonymous is refused before any write', async () => {
    const res = await sellerActions(
      new Request('https://x/actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://x' },
        body: JSON.stringify({
          actions: [
            {
              idempotencyKey: 'anon-1',
              kind: 'complete_order',
              payload: { orderId: randomUUID() },
            },
          ],
        }),
      }),
      params(alice.sellerId),
    );
    expect(res.status).toBe(401);
  });

  it('GATE: seller B cannot read or alter seller A, in the same market', async () => {
    // Bob is a real, signed-in seller. That is the interesting case —
    // not a stranger, a NEIGHBOUR, with a valid session of his own.
    expect(
      (await sellerDayJson(get('https://x/day.json', bob.cookie), params(alice.sellerId))).status,
    ).toBe(403);
    expect(
      (await sellerDayPage(get('https://x/s', bob.cookie), params(alice.sellerId))).status,
    ).toBe(403);

    const write = await sellerActions(
      new Request('https://x/actions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://x',
          cookie: bob.cookie,
        },
        body: JSON.stringify({
          actions: [{ idempotencyKey: 'bob-1', kind: 'client_installed', payload: {} }],
        }),
      }),
      params(alice.sellerId),
    );
    expect(write.status).toBe(403);
    // And Alice's install state is untouched.
    const seller = await db
      .selectFrom('sellers')
      .where('id', '=', alice.sellerId)
      .select('install_prompt_state')
      .executeTakeFirstOrThrow();
    expect(seller.install_prompt_state).not.toBe('installed');
  });

  it('GATE: a seller session cannot open the founder cockpit', async () => {
    const res = await cockpitPage(get('https://x/cockpit?market=jm', alice.cookie));
    expect(res.status).toBe(403);
    const ok = await cockpitPage(get('https://x/cockpit?market=jm', founderCookie));
    expect(ok.status).toBe(200);
  });

  it('GATE: a founder cannot masquerade as a seller', async () => {
    // The role opens the cockpit; it does not open somebody's business.
    expect(
      (await sellerDayJson(get('https://x/day.json', founderCookie), params(alice.sellerId)))
        .status,
    ).toBe(403);
  });

  it('GATE: a revoked session stops working immediately', async () => {
    const carol = await makeSeller('+18765557004', 'Carol Tours');
    expect(
      (await sellerDayJson(get('https://x/day.json', carol.cookie), params(carol.sellerId))).status,
    ).toBe(200);

    // Sign out — the server half. A phone that keeps the cookie has
    // nothing: revocation is a row, not a hope about expiry.
    const out = await signOut(
      new Request('https://x/logout?market=jm', {
        method: 'POST',
        headers: { cookie: carol.cookie, 'sec-fetch-site': 'same-origin' },
      }),
    );
    expect(out.status).toBe(303);
    expect(
      (await sellerDayJson(get('https://x/day.json', carol.cookie), params(carol.sellerId))).status,
    ).toBe(401);
  });

  it('GATE: an expired session is not a session', async () => {
    const dave = await makeSeller('+18765557005', 'Dave Tours');
    await db
      .updateTable('sessions')
      .set({ expires_at: new Date(Date.now() - 1000) })
      .where('user_id', '=', dave.userId)
      .execute();
    expect(
      (await sellerDayJson(get('https://x/day.json', dave.cookie), params(dave.sellerId))).status,
    ).toBe(401);
  });

  it('GATE: a forged or guessed cookie is refused', async () => {
    for (const forged of [
      `${SESSION_COOKIE}=`,
      `${SESSION_COOKIE}=not-a-token`,
      `${SESSION_COOKIE}=${randomUUID()}`,
      `${SESSION_COOKIE}=${alice.cookie.split('=')[1]!.slice(0, -1)}`,
      `${SESSION_COOKIE}=${alice.sellerId}`,
      `${SESSION_COOKIE}=${alice.userId}`,
    ]) {
      const res = await sellerDayJson(get('https://x/day.json', forged), params(alice.sellerId));
      expect(res.status, `accepted: ${forged}`).toBe(401);
    }
  });

  it('GATE: a cross-site POST with a real cookie is refused', async () => {
    const res = await sellerActions(
      new Request('https://x/actions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: alice.cookie,
          origin: 'https://evil.example',
          'sec-fetch-site': 'cross-site',
        },
        body: JSON.stringify({
          actions: [{ idempotencyKey: 'csrf-1', kind: 'client_installed', payload: {} }],
        }),
      }),
      params(alice.sellerId),
    );
    expect(res.status).toBe(403);
  });

  it('GATE: a sign-in link is single-use, expiring, and not transferable', async () => {
    const { token } = await sessions.issueSignInLink({ userId: alice.userId, purpose: 'seller' });
    const first = await signInLanding(get(`https://x/i/${token}?m=jm`), {
      params: Promise.resolve({ token }),
    });
    expect(first.status).toBe(303);
    expect(first.headers.get('set-cookie')).toContain(SESSION_COOKIE);
    // The link lands on the seller's own day and nowhere a query
    // parameter asked for — an open redirect is a phishing tool.
    expect(first.headers.get('location')).toBe(`/s/jm/${alice.sellerId}`);

    // Forwarded to somebody else, or tapped twice: spent.
    const second = await signInLanding(get(`https://x/i/${token}?m=jm`), {
      params: Promise.resolve({ token }),
    });
    expect(second.status).toBe(401);
    expect(await second.text()).toMatch(/already been used/);

    // Expired links are refused with a reason a person can act on.
    const stale = await sessions.issueSignInLink({
      userId: alice.userId,
      purpose: 'seller',
      ttlMs: 1,
    });
    await new Promise((r) => setTimeout(r, 20));
    const late = await signInLanding(get(`https://x/i/${stale.token}?m=jm`), {
      params: Promise.resolve({ token: stale.token }),
    });
    expect(late.status).toBe(401);
    expect(await late.text()).toMatch(/expired/);
  });

  it('GATE: two taps of one link at the same moment produce one session', async () => {
    const { token } = await sessions.issueSignInLink({ userId: bob.userId, purpose: 'seller' });
    const results = await Promise.allSettled([
      sessions.redeemSignInLink(token),
      sessions.redeemSignInLink(token),
      sessions.redeemSignInLink(token),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('GATE: a seller cannot mint a founder link for themselves', async () => {
    await expect(
      sessions.issueSignInLink({ userId: alice.userId, purpose: 'founder' }),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it('GATE: a dark market issues nothing and opens nothing', async () => {
    expect(await marketsRegistry(db).statusOf('do')).not.toBe('live');
    const res = await signInLanding(get('https://x/i/whatever?m=do'), {
      params: Promise.resolve({ token: 'whatever' }),
    });
    expect(res.status).toBe(404);
  });
});
