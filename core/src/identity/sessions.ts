import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import type { Database } from '../db/types.js';

/**
 * SESSIONS (C01 — external review, 2026-09-16).
 *
 * A seller asks in chat, gets a link, taps it, and their phone holds a
 * session. No password, no form, no app — Constitution §1 says every
 * user action can start as a WhatsApp message, and sign-in is a user
 * action like any other.
 *
 * What the design refuses to do:
 *
 *   * Treat a UUID as a secret. Seller ids appear in public trust-page
 *     URLs. "Knowing the id" was the old access-control model and it was
 *     never one.
 *   * Store anything replayable. Links and sessions are SHA-256 hashes;
 *     the token exists in the message and in the cookie, nowhere else.
 *     Comparison is constant-time.
 *   * Make revocation a guess. A stolen phone means a row goes away, not
 *     "wait for the token to expire".
 *   * Let a link be reusable. Redemption is one atomic UPDATE with a
 *     WHERE on consumed_at IS NULL, so a forwarded link is spent by the
 *     first tap — including when both taps arrive at once.
 */
export class AuthError extends Error {
  readonly reason: AuthRefusal;
  constructor(reason: AuthRefusal, message: string) {
    super(message);
    this.name = 'AuthError';
    this.reason = reason;
  }
}

export type AuthRefusal = 'unknown' | 'expired' | 'consumed' | 'revoked' | 'wrong_purpose';

export type Principal = {
  userId: string;
  marketId: string;
  role: 'seller' | 'founder';
  sessionId: string;
};

/** A link is for the next few minutes, not the rest of the day. */
export const SIGN_IN_LINK_TTL_MS = 15 * 60_000;
/** A session is for a working month on one phone. */
export const SESSION_TTL_MS = 30 * 86_400_000;
export const SESSION_COOKIE = 'sycamore_session';

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Authenticate WITHOUT a market, for the founder cockpit alone.
 *
 * Everything else in this build is market-scoped on purpose — a `jm`
 * query can never return a `do` row, because market_id is the future
 * sharding key. A founder is the one principal that is not market data:
 * they open one market's cockpit and then another's, from one phone.
 *
 * Session tokens are globally unique (a unique index on the hash), so
 * this looks the session up by token and then checks the ROLE. A seller
 * session that reaches here is refused by role, not found by scope —
 * which is why this returns the role rather than a bare yes.
 */
export async function authenticateAnyMarket(
  db: Kysely<Database>,
  sessionToken: string | undefined | null,
): Promise<Principal | undefined> {
  if (typeof sessionToken !== 'string' || sessionToken.length === 0) return undefined;
  const row = await db
    .selectFrom('sessions')
    .where('token_hash', '=', hash(sessionToken))
    .selectAll()
    .executeTakeFirst();
  if (!row || !sameHash(row.token_hash, hash(sessionToken))) return undefined;
  if (row.revoked_at !== null) return undefined;
  if (new Date(row.expires_at).getTime() <= Date.now()) return undefined;
  return {
    userId: row.user_id,
    marketId: row.market_id,
    role: row.role as 'seller' | 'founder',
    sessionId: row.id,
  };
}

export function sessionsService(db: Kysely<Database>, marketId: string) {
  return {
    /**
     * Mint a single-use sign-in link for a user. The token comes back
     * ONCE, to be sent down the user's own channel; what is stored is
     * its hash.
     */
    async issueSignInLink(input: {
      userId: string;
      purpose: 'seller' | 'founder';
      ttlMs?: number;
    }): Promise<{ token: string; expiresAt: Date }> {
      const user = await db
        .selectFrom('users')
        .where('market_id', '=', marketId)
        .where('id', '=', input.userId)
        .select(['id', 'role'])
        .executeTakeFirst();
      if (!user) throw new AuthError('unknown', `no user ${input.userId} in ${marketId}`);
      if (input.purpose === 'founder' && user.role !== 'founder') {
        // A founder link for somebody who is not a founder would be a
        // privilege escalation with a friendly name.
        throw new AuthError(
          'wrong_purpose',
          `user ${input.userId} is ${user.role}; a founder link needs the founder role`,
        );
      }
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + (input.ttlMs ?? SIGN_IN_LINK_TTL_MS));
      await db
        .insertInto('sign_in_links')
        .values({
          market_id: marketId,
          user_id: input.userId,
          token_hash: hash(token),
          purpose: input.purpose,
          expires_at: expiresAt,
        })
        .execute();
      return { token, expiresAt };
    },

    /**
     * Exchange a link for a session. One atomic consume: two taps of the
     * same link, at the same moment, and exactly one becomes a session.
     */
    async redeemSignInLink(
      token: string,
      options: { ttlMs?: number } = {},
    ): Promise<{ sessionToken: string; principal: Principal; expiresAt: Date }> {
      if (typeof token !== 'string' || token.length === 0) {
        throw new AuthError('unknown', 'no sign-in token supplied');
      }
      const row = await db
        .selectFrom('sign_in_links')
        .where('market_id', '=', marketId)
        .where('token_hash', '=', hash(token))
        .selectAll()
        .executeTakeFirst();
      if (!row || !sameHash(row.token_hash, hash(token))) {
        throw new AuthError('unknown', 'that sign-in link is not one of ours');
      }
      if (row.consumed_at !== null) {
        throw new AuthError('consumed', 'that sign-in link has already been used');
      }
      if (new Date(row.expires_at).getTime() <= Date.now()) {
        throw new AuthError('expired', 'that sign-in link has expired');
      }
      const consumed = await db
        .updateTable('sign_in_links')
        .set({ consumed_at: sql`now()` })
        .where('id', '=', row.id)
        .where('consumed_at', 'is', null)
        .returning('id')
        .executeTakeFirst();
      if (!consumed) {
        throw new AuthError('consumed', 'that sign-in link has already been used');
      }
      const sessionToken = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + (options.ttlMs ?? SESSION_TTL_MS));
      const session = await db
        .insertInto('sessions')
        .values({
          market_id: marketId,
          user_id: row.user_id,
          token_hash: hash(sessionToken),
          role: row.purpose,
          expires_at: expiresAt,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return {
        sessionToken,
        expiresAt,
        principal: {
          userId: row.user_id,
          marketId,
          role: row.purpose as 'seller' | 'founder',
          sessionId: session.id,
        },
      };
    },

    /**
     * The whole sign-in step for a chat reply: mint a link for whoever
     * this user is, and hand back the URL to send them. The purpose
     * follows the user's ROLE — a seller gets a seller link, a founder a
     * founder link, and a buyer gets nothing to sign into.
     */
    async signInUrlFor(input: {
      userId: string;
      appOrigin: string;
      ttlMs?: number;
    }): Promise<{ url: string; expiresAt: Date }> {
      const user = await db
        .selectFrom('users')
        .where('market_id', '=', marketId)
        .where('id', '=', input.userId)
        .select('role')
        .executeTakeFirst();
      if (!user) throw new AuthError('unknown', `no user ${input.userId} in ${marketId}`);
      if (user.role !== 'seller' && user.role !== 'founder') {
        throw new AuthError(
          'wrong_purpose',
          'buyers have nothing to sign in to — a booking link arrives in chat',
        );
      }
      const { token, expiresAt } = await this.issueSignInLink({
        userId: input.userId,
        purpose: user.role,
        ...(input.ttlMs !== undefined && { ttlMs: input.ttlMs }),
      });
      const origin = input.appOrigin.replace(/\/$/, '');
      return {
        url: `${origin}/i/${token}?m=${encodeURIComponent(marketId)}`,
        expiresAt,
      };
    },

    /** Who this cookie belongs to, or undefined. Never throws on a guess. */
    async authenticate(sessionToken: string | undefined | null): Promise<Principal | undefined> {
      if (typeof sessionToken !== 'string' || sessionToken.length === 0) return undefined;
      const row = await db
        .selectFrom('sessions')
        .where('market_id', '=', marketId)
        .where('token_hash', '=', hash(sessionToken))
        .selectAll()
        .executeTakeFirst();
      if (!row || !sameHash(row.token_hash, hash(sessionToken))) return undefined;
      if (row.revoked_at !== null) return undefined;
      if (new Date(row.expires_at).getTime() <= Date.now()) return undefined;
      // Last seen is for the seller's own "signed in on 2 phones" list
      // and for expiring what nobody uses. Best effort: a failed write
      // here must never fail a request.
      await db
        .updateTable('sessions')
        .set({ last_seen_at: sql`now()` })
        .where('id', '=', row.id)
        .execute()
        .catch(() => undefined);
      return {
        userId: row.user_id,
        marketId,
        role: row.role as 'seller' | 'founder',
        sessionId: row.id,
      };
    },

    /** Sign out this phone. */
    async revoke(sessionToken: string): Promise<void> {
      await db
        .updateTable('sessions')
        .set({ revoked_at: sql`now()` })
        .where('market_id', '=', marketId)
        .where('token_hash', '=', hash(sessionToken))
        .where('revoked_at', 'is', null)
        .execute();
    },

    /** Sign out every phone — the lost-phone answer. */
    async revokeAllFor(userId: string): Promise<number> {
      const rows = await db
        .updateTable('sessions')
        .set({ revoked_at: sql`now()` })
        .where('market_id', '=', marketId)
        .where('user_id', '=', userId)
        .where('revoked_at', 'is', null)
        .returning('id')
        .execute();
      return rows.length;
    },

    /**
     * Does this principal own this seller? The question every seller
     * route has to ask, in one place so it is asked the same way.
     */
    async ownsSeller(principal: Principal | undefined, sellerId: string): Promise<boolean> {
      if (!principal) return false;
      if (principal.role === 'founder') return false; // a founder is not a seller
      const seller = await db
        .selectFrom('sellers')
        .where('market_id', '=', principal.marketId)
        .where('id', '=', sellerId)
        .select('user_id')
        .executeTakeFirst();
      return seller?.user_id === principal.userId;
    },
  };
}

export type SessionsService = ReturnType<typeof sessionsService>;
