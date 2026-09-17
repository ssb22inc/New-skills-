import { createDb, databaseUrl, sessionsService, SESSION_COOKIE } from '@sycamore/core';
import { clearedSessionCookie, isSecureRequest, readCookie, sameOrigin } from '../../src/auth.js';

export const dynamic = 'force-dynamic';

const db = createDb(databaseUrl());

/**
 * SIGN OUT — and mean it (C01).
 *
 * Two halves, and the second is the one that gets forgotten: the server
 * revokes the session row, and the client clears the day it cached.
 * Without the second half, the next person to pick up that phone opens
 * the installed client and reads the previous seller's buyers offline.
 *
 * POST only, and same-origin: a GET would let any page on the internet
 * sign a seller out with an <img> tag.
 */
export async function POST(req: Request): Promise<Response> {
  if (!sameOrigin(req)) return new Response('bad origin', { status: 403 });
  const marketId = new URL(req.url).searchParams.get('market') ?? 'jm';
  const token = readCookie(req, SESSION_COOKIE);
  if (token) await sessionsService(db, marketId).revoke(token);
  return new Response(null, {
    status: 303,
    headers: {
      location: '/',
      'set-cookie': clearedSessionCookie(isSecureRequest(req)),
      'cache-control': 'no-store',
    },
  });
}
