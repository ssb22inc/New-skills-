import {
  authenticateAnyMarket,
  sessionsService,
  SESSION_COOKIE,
  type Db,
  type Principal,
} from '@sycamore/core';
import { deployDefaults } from './deploy-defaults.js';

/**
 * THE DOOR CHECK (C01 — external review, 2026-09-16).
 *
 * Every private surface asks the same two questions here, so it is not
 * possible for one of them to ask a different way or forget: WHO is
 * this, and do they own the thing they are reaching for?
 *
 * The review's words: "Market status and seller existence checks are not
 * authorization." Both of those checks were all the seller routes had.
 * Seller ids are printed in public trust-page URLs, so the id was never
 * a secret and was never a credential.
 */

/** Only what this app needs: one cookie by name, no parser library. */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

export function sessionCookie(token: string, expiresAt: Date, secure: boolean): string {
  // HttpOnly: script cannot read it, so an XSS cannot post it onward.
  // SameSite=Lax: a top-level tap from WhatsApp still arrives with the
  // cookie, a cross-site POST does not.
  // Secure everywhere but a plain-http localhost, where it would make
  // the cookie unusable.
  return (
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; ` +
    `Expires=${expiresAt.toUTCString()}${secure ? '; Secure' : ''}`
  );
}

export function clearedSessionCookie(secure: boolean): string {
  return (
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` + (secure ? '; Secure' : '')
  );
}

export function isSecureRequest(req: Request): boolean {
  const url = new URL(req.url);
  if (url.protocol === 'https:') return true;
  return req.headers.get('x-forwarded-proto') === 'https';
}

/** Who is asking, if anybody. */
export async function principalOf(
  db: Db,
  marketId: string,
  req: Request,
): Promise<Principal | undefined> {
  return sessionsService(db, marketId).authenticate(readCookie(req, SESSION_COOKIE));
}

/**
 * CSRF. The session cookie is SameSite=Lax, which already refuses a
 * cross-site POST, but a browser that does not honour it — or a
 * same-site subdomain — should not be the only thing standing between a
 * seller's orders and somebody else's page. So a mutating request must
 * also come from an origin this deployment recognises.
 *
 * `Sec-Fetch-Site: same-origin` is accepted on its own because it is set
 * by the browser and cannot be spoofed by page script; a missing Origin
 * with no Sec-Fetch-Site (a non-browser client) is refused.
 */
export function sameOrigin(req: Request): boolean {
  const site = req.headers.get('sec-fetch-site');
  if (site === 'same-origin' || site === 'none') return true;
  if (site !== null) return false; // cross-site or same-site subdomain
  const origin = req.headers.get('origin');
  if (!origin) return false;
  const allowed = new Set([new URL(req.url).origin]);
  const configured = deployDefaults().appOrigin;
  if (configured) allowed.add(new URL(configured).origin);
  try {
    return allowed.has(new URL(origin).origin);
  } catch {
    return false;
  }
}

export const NOT_FOUND = (): Response => new Response('not found', { status: 404 });

/**
 * A refusal a person can act on, in the only two flavours that matter:
 * "sign in" (401) and "not yours" (403). Deliberately plain text — these
 * are reached by a person whose link has expired, not by a designer.
 */
export function needsSignIn(message = 'Ask for a new link in chat.'): Response {
  return new Response(`Sign in first. ${message}`, {
    status: 401,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export function notYours(): Response {
  return new Response('That is not your business to open.', {
    status: 403,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/**
 * The guard every seller route runs: authenticated, and the owner of
 * THIS seller. A stranger gets 401/403 rather than a hint about which
 * seller ids exist.
 */
export async function requireSellerOwner(
  db: Db,
  marketId: string,
  sellerId: string,
  req: Request,
): Promise<{ ok: true; principal: Principal } | { ok: false; response: Response }> {
  const sessions = sessionsService(db, marketId);
  const principal = await principalOf(db, marketId, req);
  if (!principal) return { ok: false, response: needsSignIn() };
  if (!(await sessions.ownsSeller(principal, sellerId))) {
    return { ok: false, response: notYours() };
  }
  return { ok: true, principal };
}

/**
 * The cockpit guard. A founder session, and nothing else — a seller
 * session reaching the cockpit is a privilege escalation, not a typo.
 *
 * MFA is NOT implemented and is not pretended to be. The review asks for
 * it on privileged access and it is written down as an open human gate
 * (DEPLOY.md): a TOTP enrolment flow nobody has enrolled in protects
 * nothing, and claiming it would be worse than the gap.
 */
export async function requireFounder(
  db: Db,
  _marketId: string,
  req: Request,
): Promise<{ ok: true; principal: Principal } | { ok: false; response: Response }> {
  // Market-agnostic ON PURPOSE. A founder opens jm's cockpit and then
  // do's from the same phone; their session lives in whichever market
  // their own user record does. Everything else here stays scoped, and
  // the role — not the scope — is what refuses a seller.
  const principal = await authenticateAnyMarket(db, readCookie(req, SESSION_COOKIE));
  if (!principal) return { ok: false, response: needsSignIn() };
  if (principal.role !== 'founder') return { ok: false, response: notYours() };
  return { ok: true, principal };
}
