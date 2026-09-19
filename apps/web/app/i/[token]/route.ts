import { createDb, databaseUrl, marketsRegistry, sessionsService, AuthError } from '@sycamore/core';
import { clearedSessionCookie, isSecureRequest, sessionCookie } from '../../../src/auth.js';

export const dynamic = 'force-dynamic';

const db = createDb(databaseUrl());

/**
 * THE DOOR (C01). A seller asks in chat, gets a link, taps it here, and
 * their phone holds a session from then on.
 *
 * `/i/<token>?m=<market>` — `i` for "it's me", short because it is typed
 * into a phone keyboard by nobody and read in a chat bubble by everyone.
 *
 * The link is single-use and short-lived, so a forwarded chat thread
 * cannot be signed into twice, and it is spent the moment the first tap
 * lands — including when two taps arrive at once.
 *
 * It answers with a REDIRECT, never with the seller's day: the token is
 * in the URL, and a page rendered at that URL would put it in the
 * browser history, the referrer, and any screenshot of the address bar.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await ctx.params;
  const url = new URL(req.url);
  const marketId = url.searchParams.get('m') ?? 'jm';

  if ((await marketsRegistry(db).statusOf(marketId)) !== 'live') {
    return new Response('not found', { status: 404 });
  }

  try {
    const { sessionToken, principal, expiresAt } = await sessionsService(
      db,
      marketId,
    ).redeemSignInLink(token);

    // Where the link was meant to land: a seller's own day, a founder's
    // cockpit. Never an open redirect — the destination is derived here,
    // not taken from a query parameter.
    let destination = `/cockpit?market=${encodeURIComponent(marketId)}`;
    if (principal.role === 'seller') {
      const seller = await db
        .selectFrom('sellers')
        .where('market_id', '=', marketId)
        .where('user_id', '=', principal.userId)
        .select('id')
        .executeTakeFirst();
      destination = seller ? `/s/${marketId}/${seller.id}` : '/';
    }
    return new Response(null, {
      status: 303,
      headers: {
        location: destination,
        'set-cookie': sessionCookie(sessionToken, expiresAt, isSecureRequest(req)),
        'cache-control': 'no-store',
        // A used link must never sit in a shared cache or a referrer.
        'referrer-policy': 'no-referrer',
      },
    });
  } catch (err) {
    const reason = err instanceof AuthError ? err.reason : 'unknown';
    const say =
      reason === 'expired'
        ? 'That link has expired. Ask for a new one in chat.'
        : reason === 'consumed'
          ? 'That link has already been used. Ask for a new one in chat.'
          : 'That link is not one of ours. Ask for a new one in chat.';
    return new Response(say, {
      status: 401,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        // A bad link should not leave a stale cookie behind either.
        'set-cookie': clearedSessionCookie(isSecureRequest(req)),
      },
    });
  }
}
