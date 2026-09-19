import { identityService, sessionsService, SESSION_COOKIE, type Db } from '@sycamore/core';

/**
 * Sign a test in, the way a person signs in (C01).
 *
 * Every private surface needs a session now, so tests that render one
 * have to hold a real cookie — minted by the real link flow, not by
 * writing a row and hoping it matches. If the sign-in path breaks, the
 * tests that depend on it break with it, which is the point.
 */
export async function signedInAs(
  db: Db,
  marketId: string,
  input: { phone: string; displayName: string; role: 'seller' | 'founder' },
): Promise<{ userId: string; cookie: string }> {
  const identity = identityService(db, marketId);
  const user = await identity.findOrCreateUserByPhone({
    phone: input.phone,
    displayName: input.displayName,
    role: input.role,
  });
  const sessions = sessionsService(db, marketId);
  const { token } = await sessions.issueSignInLink({ userId: user.id, purpose: input.role });
  const { sessionToken } = await sessions.redeemSignInLink(token);
  return { userId: user.id, cookie: `${SESSION_COOKIE}=${sessionToken}` };
}

/** A GET carrying that cookie. */
export function as(url: string, cookie: string, init: RequestInit = {}): Request {
  return new Request(url, {
    ...init,
    headers: { ...(init.headers as Record<string, string>), cookie },
  });
}
