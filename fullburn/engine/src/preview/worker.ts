/** THE PRIVATE PREVIEW WORKER (fullburn-engine.<account>.workers.dev). Every
 * request is authorized first (auth.ts); only then is the static page served.
 * Its outbound requests are Cloudflare Access's public signing keys (when
 * Access is configured) and, in the demo, ONE GET of the public home page the
 * signed-in user typed in, read as data. It imports nothing from the engine,
 * so it cannot make an AI call (asserted on the bundle by preview-lib's
 * `bundleRefusal` before any upload).
 *
 * The clickable demo (/demo) is a simulated engine: the browser keeps the
 * state, POSTs it with each click to /demo/act, and the Worker runs the rules
 * (demo-engine.ts) and returns the new state and screen. Nothing is stored
 * server-side. */
import { authorize, type CertsFetcher, type Jwks, type PreviewEnv } from "./auth.ts";
import { businessName, normalizeState, reduce, siteFacts, type DemoAction, type DemoState, type SiteFacts } from "./demo-engine.ts";
import { DEMO_SCRIPT, renderApp, renderDemoShell } from "./demo-view.ts";
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

const DEMO_CSP = (scriptHash: string) =>
  `default-src 'none'; style-src 'unsafe-inline'; script-src '${scriptHash}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;

/** A click from the browser → a demo action. Anything unrecognised is null. */
export function parseAction(action: unknown, arg: unknown): DemoAction | Omit<Extract<DemoAction, { type: "intake" }>, "facts"> | null {
  const a = typeof arg === "string" ? arg.slice(0, 300) : "";
  switch (action) {
    case "tab":
      return ["connect", "today", "chat", "report"].includes(a) ? { type: "tab", tab: a as DemoState["tab"] } : null;
    case "intake":
      return { type: "intake", url: a };
    case "connect":
      return ["meta", "shop", "analytics", "email"].includes(a) ? { type: "connect", service: a as keyof DemoState["connections"] } : null;
    case "advance":
      return { type: "advance", days: Number.parseInt(a, 10) || 1 };
    case "ask":
      return { type: "ask", q: a };
    case "confirmBrief":
    case "testPurchase":
    case "launch":
    case "approve":
    case "veto":
    case "halt":
    case "resume":
    case "trustUp":
    case "raiseCap":
    case "reset":
      return { type: action };
    default:
      return null;
  }
}

export type SiteReader = (url: string) => Promise<SiteFacts | null>;

/** Reads the public home page of the site the user typed: https only, a real
 * hostname (no IP literal, no localhost), 6 seconds, HTML only. Any failure is
 * null and the brief says it used sample details. */
export function siteReader(fetchImpl: (url: string, init: RequestInit) => Promise<Response>): SiteReader {
  return async (raw) => {
    if (!businessName(raw)) return null;
    const host = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`).hostname;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 6000);
    try {
      const res = await fetchImpl(`https://${host}/`, { signal: ctl.signal, redirect: "follow", headers: { "user-agent": "FullburnPreview/1.0 (reads one public page)", accept: "text/html" } });
      if (!res.ok || !/text\/html/i.test(res.headers.get("content-type") ?? "")) return null;
      return siteFacts((await res.text()).slice(0, 500_000));
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
}

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

export function makeWorker(data: PreviewData, fetchCerts: CertsFetcher = cachedCerts((u) => fetch(u)), readSite: SiteReader = siteReader((u, i) => fetch(u, i))) {
  const html = renderPage(data);
  let scriptHash: Promise<string> | null = null;
  const hash = () =>
    (scriptHash ??= crypto.subtle.digest("SHA-256", new TextEncoder().encode(DEMO_SCRIPT)).then((d) => `sha256-${btoa(String.fromCharCode(...new Uint8Array(d)))}`));
  const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { ...SECURITY_HEADERS, "content-type": "application/json" } });
  /** One demo click. Same-origin JSON only: a cross-site form cannot post
   * here without the browser's preflight, and a foreign Origin is refused. */
  async function act(request: Request, url: URL): Promise<Response> {
    const origin = request.headers.get("origin");
    if (origin !== null && origin !== url.origin) return json({ error: "cross-site request refused" }, 403);
    if (!/^application\/json\b/i.test(request.headers.get("content-type") ?? "")) return json({ error: "JSON only" }, 415);
    const text = await request.text();
    if (text.length > 400_000) return json({ error: "too large" }, 413);
    let body: { state?: unknown; action?: unknown; arg?: unknown };
    try {
      body = JSON.parse(text) as typeof body;
    } catch {
      return json({ error: "not JSON" }, 400);
    }
    const state = normalizeState(body?.state ?? null);
    const parsed = parseAction(body?.action, body?.arg);
    if (!parsed) return json({ state, html: renderApp(state, "") }, 200);
    const action: DemoAction = parsed.type === "intake" ? { type: "intake", url: parsed.url, facts: businessName(parsed.url) ? await readSite(parsed.url) : null } : (parsed as DemoAction);
    const out = reduce(state, action);
    return json({ state: out.state, html: renderApp(out.state, out.notice) }, 200);
  }
  return {
    async fetch(request: Request, env: PreviewEnv): Promise<Response> {
      const respond = (body: string | null, status: number, extra: Record<string, string> = {}) =>
        new Response(request.method === "HEAD" ? null : body, { status, headers: { ...SECURITY_HEADERS, "content-type": "text/html; charset=utf-8", ...extra } });
      const url = new URL(request.url);
      const isAct = url.pathname === "/demo/act";
      if (isAct ? request.method !== "POST" : request.method !== "GET" && request.method !== "HEAD") return respond("method not allowed", 405, { allow: isAct ? "POST" : "GET, HEAD" });
      let auth;
      try {
        auth = await authorize(request, env, Math.floor(Date.now() / 1000), fetchCerts);
      } catch {
        auth = { ok: false as const, status: 503, reason: "sign-in could not be checked right now — try again in a minute" };
      }
      if (!auth.ok) {
        return respond(`<!doctype html><meta charset="utf-8"><title>Fullburn Private Preview</title><p>${auth.reason.replace(/[&<>"']/g, "")}</p>`, auth.status, auth.challenge ? { "www-authenticate": auth.challenge } : {});
      }
      const path = url.pathname;
      if (path === "/demo") return respond(renderDemoShell(normalizeState(null)), 200, { "content-security-policy": DEMO_CSP(await hash()) });
      if (isAct) return act(request, url);
      if (path !== "/") return respond("not found", 404);
      return respond(html, 200);
    },
  };
}
