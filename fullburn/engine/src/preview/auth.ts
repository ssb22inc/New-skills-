/** WHO MAY OPEN THE PRIVATE PREVIEW. Two modes, chosen by configuration and
 * never by the request:
 *
 *  - ACCESS: Cloudflare Access sits in front of the Worker and signs a JWT
 *    (`Cf-Access-Jwt-Assertion`) after the one-time email code. The Worker
 *    verifies it itself — RS256 signature against the team's published keys,
 *    the application audience, the issuer, expiry, and the one allowed email —
 *    so a request that reaches the Worker without passing Access is refused.
 *  - PASSWORD: until Access is configured, HTTP Basic auth against the
 *    PREVIEW_PASSWORD secret (any username), compared in constant time.
 *
 * Neither configured, or Access half-configured: 503, serve nothing. */

export interface PreviewEnv {
  readonly PREVIEW_PASSWORD?: string;
  readonly ACCESS_TEAM_DOMAIN?: string;
  readonly ACCESS_AUD?: string;
}

export const ALLOWED_EMAIL = "ssb22inc@gmail.com";

/** An RSA public key as published at the Access certs endpoint. */
export type Jwk = { kty?: string; n?: string; e?: string; alg?: string; kid?: string };
export type Jwks = { keys: Jwk[] };
export type CertsFetcher = (url: string) => Promise<Jwks>;

export type AuthResult = { ok: true; mode: "access" | "password"; who: string } | { ok: false; status: number; reason: string; challenge?: string };

const b64urlToBytes = (s: string): Uint8Array => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

/** Constant-time string comparison (length is not secret here). */
export function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function verifyAccessJwt(token: string, team: string, aud: string, nowSec: number, fetchCerts: CertsFetcher): Promise<{ ok: true; email: string } | { ok: false; reason: string }> {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "not a JWT" };
  let header: { alg?: string; kid?: string };
  let claims: { aud?: string | string[]; iss?: string; exp?: number; nbf?: number; email?: string };
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0]!))) as typeof header;
    claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1]!))) as typeof claims;
  } catch {
    return { ok: false, reason: "unreadable JWT" };
  }
  if (header.alg !== "RS256") return { ok: false, reason: "unexpected JWT algorithm" };
  const issuer = `https://${team}.cloudflareaccess.com`;
  const jwks = await fetchCerts(`${issuer}/cdn-cgi/access/certs`);
  const jwk = (jwks.keys ?? []).find((k) => k.kid === header.kid);
  if (!jwk) return { ok: false, reason: "no signing key for this token" };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(parts[2]!), signed);
  if (!valid) return { ok: false, reason: "bad JWT signature" };
  const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!auds.includes(aud)) return { ok: false, reason: "token is for another application" };
  if (claims.iss !== issuer) return { ok: false, reason: "token from another issuer" };
  if (typeof claims.exp !== "number" || claims.exp <= nowSec) return { ok: false, reason: "token expired" };
  if (typeof claims.nbf === "number" && claims.nbf > nowSec + 60) return { ok: false, reason: "token not yet valid" };
  if (typeof claims.email !== "string" || claims.email.toLowerCase() !== ALLOWED_EMAIL) return { ok: false, reason: "this email is not allowed" };
  return { ok: true, email: claims.email };
}

export async function authorize(request: Request, env: PreviewEnv, nowSec: number, fetchCerts: CertsFetcher): Promise<AuthResult> {
  const team = env.ACCESS_TEAM_DOMAIN ?? "";
  const aud = env.ACCESS_AUD ?? "";
  if (Boolean(team) !== Boolean(aud)) return { ok: false, status: 503, reason: "preview misconfigured: Cloudflare Access is half-configured" };
  if (team && aud) {
    const token = request.headers.get("cf-access-jwt-assertion");
    if (!token) return { ok: false, status: 403, reason: "sign in through Cloudflare Access" };
    const v = await verifyAccessJwt(token, team, aud, nowSec, fetchCerts);
    return v.ok ? { ok: true, mode: "access", who: v.email } : { ok: false, status: 403, reason: v.reason };
  }
  const password = env.PREVIEW_PASSWORD ?? "";
  if (password.length < 12) return { ok: false, status: 503, reason: "preview misconfigured: no sign-in is set up, so nothing is served" };
  const challenge = 'Basic realm="Fullburn private preview", charset="UTF-8"';
  const header = request.headers.get("authorization") ?? "";
  const m = /^Basic ([A-Za-z0-9+/=]+)$/.exec(header);
  if (!m) return { ok: false, status: 401, reason: "password required", challenge };
  let decoded = "";
  try {
    decoded = new TextDecoder().decode(Uint8Array.from(atob(m[1]!), (c) => c.charCodeAt(0)));
  } catch {
    return { ok: false, status: 401, reason: "password required", challenge };
  }
  const supplied = decoded.slice(decoded.indexOf(":") + 1);
  if (decoded.indexOf(":") === -1 || !sameSecret(supplied, password)) return { ok: false, status: 401, reason: "wrong password", challenge };
  return { ok: true, mode: "password", who: "password holder" };
}
