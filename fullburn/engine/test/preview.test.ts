import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { authorize, sameSecret, verifyAccessJwt, type Jwks } from "../src/preview/auth.ts";
import { escapeHtml, renderPage, type PreviewData } from "../src/preview/page.ts";
import { cachedCerts, makeWorker, SECURITY_HEADERS } from "../src/preview/worker.ts";
// @ts-expect-error — plain .mjs module, typed loosely on purpose
import * as lib from "../scripts/preview-lib.mjs";

/** THE PRIVATE PREVIEW (human request 2026-10-22): a static page on the
 * fullburn-engine Worker, readable only by ssb22inc@gmail.com through
 * Cloudflare Access, or by the holder of PREVIEW_PASSWORD until Access is set
 * up. Every decision here is driven with input that must be refused. */

const TEAM = "fullburn-team";
const AUD = "aud-tag-0123456789";
const NOW = 1_800_000_000;
const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

async function keypair(kid: string) {
  const k = (await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"])) as { privateKey: Parameters<typeof crypto.subtle.sign>[1]; publicKey: Parameters<typeof crypto.subtle.exportKey>[1] };
  const jwk = { ...((await crypto.subtle.exportKey("jwk", k.publicKey)) as object), kid };
  return { priv: k.privateKey, jwks: { keys: [jwk] } as Jwks };
}

async function token(priv: Parameters<typeof crypto.subtle.sign>[1], claims: Record<string, unknown>, header: Record<string, unknown> = { alg: "RS256", kid: "k1" }) {
  const h = enc(header);
  const p = enc({ aud: [AUD], iss: `https://${TEAM}.cloudflareaccess.com`, exp: NOW + 600, email: "ssb22inc@gmail.com", ...claims });
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", priv, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${Buffer.from(sig).toString("base64url")}`;
}

describe("preview sign-in: Cloudflare Access token", async () => {
  const { priv, jwks } = await keypair("k1");
  const other = await keypair("k1");
  const certs = async (url: string) => {
    expect(url).toBe(`https://${TEAM}.cloudflareaccess.com/cdn-cgi/access/certs`);
    return jwks;
  };

  it("accepts a valid token for the one allowed email", async () => {
    expect(await verifyAccessJwt(await token(priv, {}), TEAM, AUD, NOW, certs)).toEqual({ ok: true, email: "ssb22inc@gmail.com" });
  });

  it("refuses a token signed by another key", async () => {
    expect(await verifyAccessJwt(await token(other.priv, {}), TEAM, AUD, NOW, certs)).toEqual({ ok: false, reason: "bad JWT signature" });
  });

  it("refuses another email, another app, another issuer, an expired token, a future token", async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ email: "someone@else.com" }, "this email is not allowed"],
      [{ aud: ["other-app"] }, "token is for another application"],
      [{ iss: "https://evil.cloudflareaccess.com" }, "token from another issuer"],
      [{ exp: NOW }, "token expired"],
      [{ exp: undefined }, "token expired"],
      [{ nbf: NOW + 3600 }, "token not yet valid"],
    ];
    for (const [claims, reason] of cases) {
      expect(await verifyAccessJwt(await token(priv, claims), TEAM, AUD, NOW, certs), reason).toEqual({ ok: false, reason });
    }
  });

  it("refuses a non-RS256 token, an unknown key id and garbage", async () => {
    expect(await verifyAccessJwt(await token(priv, {}, { alg: "none", kid: "k1" }), TEAM, AUD, NOW, certs)).toEqual({ ok: false, reason: "unexpected JWT algorithm" });
    expect(await verifyAccessJwt(await token(priv, {}, { alg: "RS256", kid: "k9" }), TEAM, AUD, NOW, certs)).toEqual({ ok: false, reason: "no signing key for this token" });
    expect(await verifyAccessJwt("a.b", TEAM, AUD, NOW, certs)).toEqual({ ok: false, reason: "not a JWT" });
    expect(await verifyAccessJwt("!!.!!.!!", TEAM, AUD, NOW, certs)).toEqual({ ok: false, reason: "unreadable JWT" });
  });

  it("in Access mode, a request without the token is refused even with the password", async () => {
    const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, PREVIEW_PASSWORD: "correct horse battery" };
    const basic = { authorization: `Basic ${btoa("x:correct horse battery")}` };
    expect(await authorize(new Request("https://p/", { headers: basic }), env, NOW, certs)).toMatchObject({ ok: false, status: 403 });
    const ok = await authorize(new Request("https://p/", { headers: { "cf-access-jwt-assertion": await token(priv, {}) } }), env, NOW, certs);
    expect(ok).toEqual({ ok: true, mode: "access", who: "ssb22inc@gmail.com" });
  });
});

describe("preview sign-in: password and configuration", () => {
  const certs = () => Promise.reject(new Error("no certs in password mode"));
  const env = { PREVIEW_PASSWORD: "correct horse battery" };
  const req = (auth?: string) => new Request("https://p/", auth ? { headers: { authorization: auth } } : {});

  it("challenges, refuses a wrong password, accepts the right one under any username", async () => {
    expect(await authorize(req(), env, NOW, certs)).toMatchObject({ ok: false, status: 401, challenge: expect.stringContaining("Basic") });
    expect(await authorize(req(`Basic ${btoa("x:wrong")}`), env, NOW, certs)).toMatchObject({ ok: false, status: 401, reason: "wrong password" });
    expect(await authorize(req(`Basic ${btoa("correct horse battery")}`), env, NOW, certs)).toMatchObject({ ok: false, status: 401 });
    expect(await authorize(req(`Bearer correct horse battery`), env, NOW, certs)).toMatchObject({ ok: false, status: 401 });
    expect(await authorize(req(`Basic ${btoa("anyone:correct horse battery")}`), env, NOW, certs)).toEqual({ ok: true, mode: "password", who: "password holder" });
  });

  it("serves nothing when no sign-in is set up, a password is short, or Access is half-configured", async () => {
    expect(await authorize(req(), {}, NOW, certs)).toMatchObject({ ok: false, status: 503 });
    expect(await authorize(req(`Basic ${btoa("x:short")}`), { PREVIEW_PASSWORD: "short" }, NOW, certs)).toMatchObject({ ok: false, status: 503 });
    expect(await authorize(req(), { ACCESS_TEAM_DOMAIN: TEAM, PREVIEW_PASSWORD: "correct horse battery" }, NOW, certs)).toMatchObject({ ok: false, status: 503 });
    expect(await authorize(req(), { ACCESS_AUD: AUD }, NOW, certs)).toMatchObject({ ok: false, status: 503 });
  });

  it("compares secrets exactly", () => {
    expect(sameSecret("abc", "abc")).toBe(true);
    expect(sameSecret("abc", "abd")).toBe(false);
    expect(sameSecret("abc", "abcd")).toBe(false);
    expect(sameSecret("", "a")).toBe(false);
  });
});

const DATA: PreviewData = lib.buildPreviewData({
  phase: "0",
  live: { verdict: "PASS", tree: "a".repeat(40), started: "2026-10-22T07:39:59.567Z", file: "reports/LIVE.md", attested: true, rows: [{ id: "clickhouse-query", name: "ClickHouse", status: "PASS", observed: "<script>alert(1)</script>" }] },
  done: null,
  builtAt: "2026-10-22T08:00:00.000Z",
  commit: "7fc3265d71e5aaaa",
});

describe("preview page", () => {
  it("escapes every report value and carries no script, image or outside link", () => {
    const html = renderPage(DATA);
    expect(html).not.toContain("<script>alert(1)");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toMatch(/<script|<img|<iframe|<link|https?:\/\//i);
    expect(escapeHtml(`<a href="x">'&`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
  });

  it("labels the client mock-up as sample data and shows the stage and the live result", () => {
    const html = renderPage(DATA);
    expect(html).toContain("SAMPLE DATA — an invented business");
    expect(html).toContain("We are building <strong>Stage 0</strong>");
    expect(html).toContain("1 of 1 passed");
    expect(html).toContain("signature verified");
    expect(renderPage({ ...DATA, live: { ...DATA.live!, attested: false } })).toContain("signature NOT verified");
    for (const l of lib.LEFT_BEFORE_LAUNCH as { what: string }[]) expect(html).toContain(escapeHtml(l.what));
  });
});

describe("preview worker", () => {
  const worker = makeWorker(DATA, () => Promise.reject(new Error("unused")));
  const env = { PREVIEW_PASSWORD: "correct horse battery" };
  const good = { authorization: `Basic ${btoa("me:correct horse battery")}` };

  it("refuses before serving anything, with the security headers on every answer", async () => {
    const r = await worker.fetch(new Request("https://p/"), env);
    expect(r.status).toBe(401);
    expect(r.headers.get("www-authenticate")).toContain("Basic");
    expect(await r.text()).not.toContain("Fullburn will do");
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) expect(r.headers.get(k), k).toBe(v);
    expect((await worker.fetch(new Request("https://p/"), {})).status).toBe(503);
  });

  it("serves the page to the password holder, 404s every other path, refuses writes", async () => {
    const r = await worker.fetch(new Request("https://p/", { headers: good }), env);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(await r.text()).toContain("What Fullburn will do for a client");
    expect((await worker.fetch(new Request("https://p/x", { headers: good }), env)).status).toBe(404);
    expect((await worker.fetch(new Request("https://p/", { method: "POST", headers: good }), env)).status).toBe(405);
  });

  it("a sign-in check that throws is a refusal, never the page", async () => {
    const r = await worker.fetch(new Request("https://p/", { headers: { "cf-access-jwt-assertion": `${enc({ alg: "RS256", kid: "k1" })}.${enc({})}.sig` } }), { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD });
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain("Fullburn will do");
  });

  it("caches Access signing keys and refuses a failed fetch", async () => {
    let calls = 0;
    let t = 0;
    const certs = cachedCerts(async () => (calls++, new Response(JSON.stringify({ keys: [] }))), 1000, () => t);
    await certs("u");
    await certs("u");
    expect(calls).toBe(1);
    t = 2000;
    await certs("u");
    expect(calls).toBe(2);
    await expect(cachedCerts(async () => new Response("", { status: 500 }))("u")).rejects.toThrow("HTTP 500");
  });
});

describe("preview build decisions (preview-lib)", () => {
  const live = readFileSync(new URL("../../reports/LIVE_CHECK_phase0_08cb64fec6db_20261022T073959Z.md", import.meta.url), "utf8");

  it("parses a live report, keeping only known checks", () => {
    const p = lib.parseLiveReport(live);
    expect(p.verdict).toBe("PASS");
    expect(p.tree).toBe("08cb64fec6dbffb260793f2e356b2a7e788d17f0");
    expect(p.rows.map((r: { id: string }) => r.id)).toEqual(["cloudflare-token", "gateway-hello-world", "langfuse-trace", "clickhouse-query", "airbyte-token"]);
    const injected = lib.parseLiveReport(`${live}\n| evil-row | x | PASS | y |\n`);
    expect(injected.rows).toHaveLength(5);
    expect(lib.parseLiveReport("# something else\nVerdict: PASS")).toBeNull();
  });

  it("picks the newest stamped live report over legacy and older ones", () => {
    const a = "LIVE_CHECK_phase0_aaaaaaaaaaaa_20261021T000000Z.md";
    const b = "LIVE_CHECK_phase0_bbbbbbbbbbbb_20261022T000000Z.md";
    expect(lib.pickLatestLiveReport([b, a, "LIVE_CHECK_phase0_cccccccccccc.md", "notes.md"])).toBe(b);
    expect(lib.pickLatestLiveReport(["LIVE_CHECK_phase0_cccccccccccc.md"])).toBe("LIVE_CHECK_phase0_cccccccccccc.md");
    expect(lib.pickLatestLiveReport(["x.md"])).toBeNull();
  });

  it("parses a done report and picks the newest by its start time", () => {
    const md = (s: string) => `# DONE — Phase 0 — INCOMPLETE\n\n- tree: \`${"f".repeat(40)}\`\n- started: ${s}\n\n| C1 | first | **FAIL** | x | y |\n| ↳ AC1 | sub | **PASS** | x | y |\n| C2 | second | **PASS** | x | y |\n`;
    const p = lib.parseDoneReport(md("2026-10-10T00:00:00.000Z"));
    expect(p).toEqual({ headline: "INCOMPLETE", tree: "f".repeat(40), started: "2026-10-10T00:00:00.000Z", conditions: [{ id: "C1", title: "first", status: "FAIL" }, { id: "C2", title: "second", status: "PASS" }] });
    const older = { file: "a", report: lib.parseDoneReport(md("2026-10-09T00:00:00.000Z")) };
    const newer = { file: "b", report: p };
    expect(lib.pickLatestDone([newer, older]).file).toBe("b");
    expect(lib.pickLatestDone([older, newer]).file).toBe("b");
    expect(lib.parseDoneReport("hello")).toBeNull();
  });

  it("refuses to publish a public preview or a half-configured Access", () => {
    expect(lib.deployRefusal({ password: "", accessTeam: "", accessAud: "" })).toMatch(/would be public/);
    expect(lib.deployRefusal({ password: "short", accessTeam: "", accessAud: "" })).toMatch(/would be public/);
    expect(lib.deployRefusal({ password: "", accessTeam: TEAM, accessAud: "" })).toMatch(/half-configured/);
    expect(lib.deployRefusal({ password: "", accessTeam: "x.cloudflareaccess.com", accessAud: AUD })).toMatch(/team name only/);
    expect(lib.deployRefusal({ password: "correct horse battery", accessTeam: "", accessAud: "" })).toBeNull();
    expect(lib.deployRefusal({ password: "", accessTeam: TEAM, accessAud: AUD })).toBeNull();
  });

  it("refuses a bundle reaching outside the preview, or one without its sign-in", () => {
    const ok = ["engine/<stdin>", "engine/src/preview/worker.ts", "engine/src/preview/auth.ts", "engine/src/preview/page.ts"];
    expect(lib.bundleRefusal(ok, "fine")).toBeNull();
    expect(lib.bundleRefusal([...ok, "engine/src/gateway.ts"], "fine")).toMatch(/outside src\/preview/);
    expect(lib.bundleRefusal(ok.filter((i) => !i.endsWith("auth.ts")), "fine")).toMatch(/sign-in check/);
    expect(lib.bundleRefusal(ok, "x https://gateway.ai.cloudflare.com/v1 y")).toMatch(/must not be able to reach/);
  });

  it("refuses to replace a Worker holding bindings the preview does not own", () => {
    expect(lib.existingBindingsRefusal([{ name: "PREVIEW_PASSWORD", type: "secret_text" }])).toBeNull();
    expect(lib.existingBindingsRefusal([{ name: "VAULT", type: "durable_object_namespace" }])).toMatch(/VAULT \(durable_object_namespace\)/);
  });

  it("shows a live report as signed only when that exact file was verified", () => {
    expect(lib.attestedFor("reports/a.md", "reports/a.md")).toBe(true);
    expect(lib.attestedFor("reports/a.md", "reports/b.md")).toBe(false);
    expect(lib.attestedFor("reports/a.md", null)).toBe(false);
    expect(lib.attestedFor("", "")).toBe(false);
    expect(() => lib.buildPreviewData({ ...DATA, live: { ...DATA.live, attested: undefined } })).toThrow(/attestation/);
  });

  it("uploads only the preview's bindings, the password as a secret", () => {
    const m = lib.workerMetadata({ password: "correct horse battery", accessTeam: TEAM, accessAud: AUD });
    expect(m.main_module).toBe("worker.js");
    expect(m.bindings).toEqual([
      { type: "secret_text", name: "PREVIEW_PASSWORD", text: "correct horse battery" },
      { type: "plain_text", name: "ACCESS_TEAM_DOMAIN", text: TEAM },
      { type: "plain_text", name: "ACCESS_AUD", text: AUD },
    ]);
    expect(lib.workerMetadata({ password: "", accessTeam: "", accessAud: "" }).bindings).toEqual([]);
  });

  it("counts only a refusal to an anonymous visitor as private", () => {
    for (const s of [401, 302, 403]) expect(lib.servedPrivately(s).ok, String(s)).toBe(true);
    for (const s of [200, 404, 500, 0]) expect(lib.servedPrivately(s).ok, String(s)).toBe(false);
    expect(lib.servedPrivately(200).reason).toMatch(/PUBLIC/);
  });
});
