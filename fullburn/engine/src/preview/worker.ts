/** THE PRIVATE PREVIEW WORKER (fullburn-engine.<account>.workers.dev). Every
 * request is authorized first (auth.ts); only then is the static page served.
 * Its only outbound request is fetching Cloudflare Access's public signing
 * keys when Access is configured — it imports nothing from the engine, so it
 * cannot make an AI call (asserted on the bundle by preview-lib's
 * `bundleRefusal` before any upload). */
import { authorize, type CertsFetcher, type Jwks, type PreviewEnv } from "./auth.ts";
import { renderPage, type PreviewData } from "./page.ts";

export const SECURITY_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "cache-control": "private, no-store",
  "x-robots-tag": "noindex, nofollow",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "strict-transport-security": "max-age=31536000",
});

/** Access signing keys, cached per isolate for ten minutes. */
export function cachedCerts(fetchImpl: (url: string) => Promise<Response>, ttlMs = 600_000, now: () => number = Date.now): CertsFetcher {
  const cache = new Map<string, { at: number; jwks: Jwks }>();
  return async (url) => {
    const hit = cache.get(url);
    if (hit && now() - hit.at < ttlMs) return hit.jwks;
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`Access signing keys unavailable: HTTP ${res.status}`);
    const jwks = (await res.json()) as Jwks;
    cache.set(url, { at: now(), jwks });
    return jwks;
  };
}

export function makeWorker(data: PreviewData, fetchCerts: CertsFetcher = cachedCerts((u) => fetch(u))) {
  const html = renderPage(data);
  return {
    async fetch(request: Request, env: PreviewEnv): Promise<Response> {
      const respond = (body: string | null, status: number, extra: Record<string, string> = {}) =>
        new Response(request.method === "HEAD" ? null : body, { status, headers: { ...SECURITY_HEADERS, "content-type": "text/html; charset=utf-8", ...extra } });
      if (request.method !== "GET" && request.method !== "HEAD") return respond("method not allowed", 405, { allow: "GET, HEAD" });
      let auth;
      try {
        auth = await authorize(request, env, Math.floor(Date.now() / 1000), fetchCerts);
      } catch {
        auth = { ok: false as const, status: 503, reason: "sign-in could not be checked right now — try again in a minute" };
      }
      if (!auth.ok) {
        return respond(`<!doctype html><meta charset="utf-8"><title>Fullburn Private Preview</title><p>${auth.reason.replace(/[&<>"']/g, "")}</p>`, auth.status, auth.challenge ? { "www-authenticate": auth.challenge } : {});
      }
      const path = new URL(request.url).pathname;
      if (path !== "/") return respond("not found", 404);
      return respond(html, 200);
    },
  };
}
