/** Sweep entries for the production collaborators (cross-family finding X6-16,
 * GPT-6 Astra, 2026-10-06): the AI Gateway HTTP transport, the Langfuse sink
 * and the encrypted vault sit on the production call path but were reached
 * only through interfaces, so the import-graph population never saw their
 * guards. They are roots now; each guard below is driven by an input written
 * to make IT fire, and matched one-to-one on (file, message). */
import { PreDispatchError } from "../src/gateway.ts";
import { AiGatewayHttpTransport, GatewayHttpError, type FetchLike } from "../src/gateway-http.ts";
import { LangfuseTraceSink, LangfuseSinkError } from "../src/langfuse-sink.ts";
import { EncryptedVaultBackend, MemoryCipherStore, importKek, manifestKey, slotKey, type CipherStore } from "../src/vault-crypto.ts";
import { VaultError } from "../src/vault.ts";

export type ProductionGuard = {
  name: string;
  file: string;
  fire: () => unknown;
  type: new (...a: never[]) => Error;
  expect: RegExp;
};

const BASE = "https://gateway.ai.cloudflare.com/v1/acct/gw/";
const reply = (status: number, body: string): FetchLike => async () => ({ status, text: async () => body });
const transport = (f: FetchLike) => new AiGatewayHttpTransport({ gatewayBaseUrl: BASE, fetchImpl: f });
const ok = { authorization: "Bearer k" };
const lf = (f: FetchLike) => new LangfuseTraceSink({ host: "https://lf.example.invalid", publicKey: "pk", secretKey: "sk", fetchImpl: f });
const event = { traceId: "t", clientId: "c", role: "r", model: "m", startedAtMs: 0, input: {}, output: {}, costUsd: 0, outcome: "ok" as const };

/** Runs `fn` with the runtime's fetch removed, so "no fetch" can fire. */
async function withoutFetch(fn: () => unknown): Promise<void> {
  const g = globalThis as { fetch?: unknown };
  const saved = g.fetch;
  g.fetch = undefined;
  try {
    await fn();
  } finally {
    g.fetch = saved;
  }
}

const RAW = new Uint8Array(32).fill(9);
async function vault(store: CipherStore = new MemoryCipherStore()) {
  return new EncryptedVaultBackend(store, await importKek("k1", RAW));
}

/** Seals `text` exactly as the vault does, so a structurally valid record with
 * hostile CONTENT can be planted (the manifest guards read decrypted content). */
async function sealLike(slot: string, text: string, v: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", RAW, { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(`${slot}#v${v}#at0#q0`) }, key, new TextEncoder().encode(text)));
  const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
  return JSON.stringify({ v, at: 0, q: false, kek: "k1", iv: b64(iv), ct: b64(ct) });
}

/** A store whose compare-and-swap always loses on keys matching `loses`. */
class LosingStore extends MemoryCipherStore {
  constructor(private readonly loses: (k: string) => boolean) {
    super();
  }
  override async compareAndSwap(key: string, expected: string | null, next: string): Promise<boolean> {
    return this.loses(key) ? false : super.compareAndSwap(key, expected, next);
  }
}

export function productionGuardEntries(): ProductionGuard[] {
  const GH = "engine/src/gateway-http.ts";
  const LF = "engine/src/langfuse-sink.ts";
  const VC = "engine/src/vault-crypto.ts";
  return [
    // ---- engine/src/gateway-http.ts ----
    { name: "http: a base that is not a URL", file: GH, type: GatewayHttpError, expect: /gatewayBaseUrl is not a URL/, fire: () => new AiGatewayHttpTransport({ gatewayBaseUrl: "nope" }) },
    { name: "http: https only", file: GH, type: GatewayHttpError, expect: /reached over https only/, fire: () => new AiGatewayHttpTransport({ gatewayBaseUrl: "http://gateway.ai.cloudflare.com/v1/a/b/" }) },
    { name: "http: base must end with a slash", file: GH, type: GatewayHttpError, expect: /must end with '\/'/, fire: () => new AiGatewayHttpTransport({ gatewayBaseUrl: "https://gateway.ai.cloudflare.com/v1/a/b" }) },
    { name: "http: no fetch on the runtime", file: GH, type: GatewayHttpError, expect: /no fetch implementation/, fire: () => withoutFetch(() => new AiGatewayHttpTransport({ gatewayBaseUrl: BASE })) },
    { name: "http: an unparseable URL", file: GH, type: PreDispatchError, expect: /a URL that does not parse/, fire: () => transport(reply(200, "")).post("not a url", { role: "r" }, ok) },
    { name: "http: a URL outside the gateway", file: GH, type: PreDispatchError, expect: /outside its AI Gateway/, fire: () => transport(reply(200, "")).post("https://x.invalid/v1/acct/gw/openai/gpt-5", { role: "r" }, ok) },
    { name: "http: no model route", file: GH, type: PreDispatchError, expect: /could not read a model route/, fire: () => transport(reply(200, "")).post(`${BASE}nomodel`, { role: "r" }, ok) },
    { name: "http: no gateway credential", file: GH, type: PreDispatchError, expect: /has no gateway credential/, fire: () => transport(reply(200, "")).post(`${BASE}openai/gpt-5`, { role: "r" }, {}) },
    { name: "http: no role in the body", file: GH, type: PreDispatchError, expect: /body has no role/, fire: () => transport(reply(200, "")).post(`${BASE}openai/gpt-5`, {}, ok) },
    { name: "http: a network failure after dispatch", file: GH, type: GatewayHttpError, expect: /failed after dispatch/, fire: () => transport(async () => { throw new Error("down"); }).post(`${BASE}openai/gpt-5`, { role: "r" }, ok) },
    { name: "http: a non-2xx reply", file: GH, type: GatewayHttpError, expect: /AI Gateway returned HTTP/, fire: () => transport(reply(500, "")).post(`${BASE}openai/gpt-5`, { role: "r" }, ok) },
    { name: "http: a reply that is not JSON", file: GH, type: GatewayHttpError, expect: /AI Gateway reply is not JSON/, fire: () => transport(reply(200, "x")).post(`${BASE}openai/gpt-5`, { role: "r" }, ok) },
    { name: "http: a reply with no message content", file: GH, type: GatewayHttpError, expect: /has no message content/, fire: () => transport(reply(200, "{}")).post(`${BASE}openai/gpt-5`, { role: "r" }, ok) },
    { name: "http: model content that is not JSON", file: GH, type: GatewayHttpError, expect: /model reply is not JSON$/, fire: () => transport(reply(200, JSON.stringify({ choices: [{ message: { content: "x" } }] }))).post(`${BASE}openai/gpt-5`, { role: "r" }, ok) },
    { name: "http: model content that is not an object", file: GH, type: GatewayHttpError, expect: /model reply is not a JSON object/, fire: () => transport(reply(200, JSON.stringify({ choices: [{ message: { content: "[1]" } }] }))).post(`${BASE}openai/gpt-5`, { role: "r" }, ok) },
    // ---- engine/src/langfuse-sink.ts ----
    { name: "langfuse: a host that is not a URL", file: LF, type: LangfuseSinkError, expect: /host is not a URL/, fire: () => new LangfuseTraceSink({ host: "nope", publicKey: "a", secretKey: "b" }) },
    { name: "langfuse: https only", file: LF, type: LangfuseSinkError, expect: /reached over https only/, fire: () => new LangfuseTraceSink({ host: "http://x.invalid", publicKey: "a", secretKey: "b" }) },
    { name: "langfuse: both keys required", file: LF, type: LangfuseSinkError, expect: /requires a public and a secret key/, fire: () => new LangfuseTraceSink({ host: "https://x.invalid", publicKey: "", secretKey: "b" }) },
    { name: "langfuse: no fetch on the runtime", file: LF, type: LangfuseSinkError, expect: /no fetch implementation/, fire: () => withoutFetch(() => new LangfuseTraceSink({ host: "https://x.invalid", publicKey: "a", secretKey: "b" })) },
    { name: "langfuse: a network failure", file: LF, type: LangfuseSinkError, expect: /request failed \(network\)/, fire: () => lf(async () => { throw new Error("down"); }).emit(event) },
    { name: "langfuse: a non-2xx reply", file: LF, type: LangfuseSinkError, expect: /ingestion returned HTTP/, fire: () => lf(reply(401, "")).emit(event) },
    { name: "langfuse: an unreadable 207", file: LF, type: LangfuseSinkError, expect: /unreadable multi-status/, fire: () => lf(reply(207, "x")).emit(event) },
    { name: "langfuse: a rejected event", file: LF, type: LangfuseSinkError, expect: /rejected the trace event/, fire: () => lf(reply(207, JSON.stringify({ errors: [{ id: "e" }] }))).emit(event) },
    // ---- engine/src/vault-crypto.ts ----
    { name: "vault: a KEK needs an id", file: VC, type: VaultError, expect: /KEK requires an id/, fire: () => importKek("", RAW) },
    { name: "vault: a KEK is 256 bits", file: VC, type: VaultError, expect: /exactly 32 bytes/, fire: () => importKek("k", new Uint8Array(16)) },
    { name: "vault: a record that is not JSON", file: VC, type: VaultError, expect: /is not JSON — not a sealed record/, fire: async () => { const s = new MemoryCipherStore(); const b = await vault(s); await b.put("a", "k", "v"); s.raw.set(slotKey("a", "k"), "x"); await b.unlock("a"); } },
    { name: "vault: a record missing its fields", file: VC, type: VaultError, expect: /missing sealed-record fields/, fire: async () => { const s = new MemoryCipherStore(); const b = await vault(s); await b.put("a", "k", "v"); s.raw.set(slotKey("a", "k"), "{}"); await b.unlock("a"); } },
    { name: "vault: a record under an unknown key", file: VC, type: VaultError, expect: /sealed under an unknown key/, fire: async () => { const s = new MemoryCipherStore(); const b = await vault(s); await b.put("a", "k", "v"); const r = JSON.parse(s.raw.get(slotKey("a", "k"))!); s.raw.set(slotKey("a", "k"), JSON.stringify({ ...r, kek: "gone" })); await b.unlock("a"); } },
    { name: "vault: a tampered record", file: VC, type: VaultError, expect: /failed authentication/, fire: async () => { const s = new MemoryCipherStore(); const b = await vault(s); await b.put("a", "k", "v"); const r = JSON.parse(s.raw.get(slotKey("a", "k"))!); s.raw.set(slotKey("a", "k"), JSON.stringify({ ...r, at: r.at + 1 })); await b.unlock("a"); } },
    { name: "vault: a manifest that is not an object", file: VC, type: VaultError, expect: /manifest is not an object/, fire: async () => { const s = new MemoryCipherStore(); s.raw.set(manifestKey("a"), await sealLike(manifestKey("a"), "[1]", 1)); await (await vault(s)).unlock("a"); } },
    { name: "vault: a manifest with an invalid version", file: VC, type: VaultError, expect: /manifest holds an invalid version/, fire: async () => { const s = new MemoryCipherStore(); s.raw.set(manifestKey("a"), await sealLike(manifestKey("a"), JSON.stringify({ k: 0 }), 1)); await (await vault(s)).unlock("a"); } },
    { name: "vault: a manifest that cannot be updated", file: VC, type: VaultError, expect: /manifest could not be updated/, fire: async () => (await vault(new LosingStore((k) => k.startsWith("vault-manifest:")))).put("a", "k", "v") },
    { name: "vault: a write without scope", file: VC, type: VaultError, expect: /writes require a clientId and a name/, fire: async () => (await vault()).put("", "k", "v") },
    { name: "vault: a write that keeps losing", file: VC, type: VaultError, expect: /could not be written — concurrent writers/, fire: async () => (await vault(new LosingStore((k) => k.startsWith("vault:")))).put("a", "k", "v") },
    { name: "vault: an unlock without scope", file: VC, type: VaultError, expect: /unlock requires a clientId/, fire: async () => (await vault()).unlock("") },
    { name: "vault: a rolled-back record", file: VC, type: VaultError, expect: /rolled-back record is refused/, fire: async () => { const s = new MemoryCipherStore(); const b = await vault(s); await b.put("a", "k", "v1"); const old = s.raw.get(slotKey("a", "k"))!; await b.put("a", "k", "v2"); s.raw.set(slotKey("a", "k"), old); await b.unlock("a"); } },
    { name: "vault: an unlock overtaken by a lock", file: VC, type: VaultError, expect: /while this unlock was in flight/, fire: async () => { const s = new MemoryCipherStore(); const b = await vault(s); await b.put("a", "k", "v"); const get = s.get.bind(s); s.get = async (key: string) => { b.lock(); return get(key); }; await b.unlock("a"); } },
    { name: "vault: a read while locked", file: VC, type: VaultError, expect: /vault is locked for this client/, fire: async () => (await vault()).read("a", "k") },
    { name: "vault: a breach rotation needs a revoker", file: VC, type: VaultError, expect: /requires a provider revoker/, fire: async () => { const b = await vault(); await b.put("a", "k", "v"); await b.revokeAndRotate("a", "k", async () => "n", undefined as never); } },
    { name: "vault: a breach rotation of a missing secret", file: VC, type: VaultError, expect: /not found for scoped client/, fire: async () => (await vault()).revokeAndRotate("a", "absent", async () => "n", async () => {}) },
    { name: "vault: a breach rotation of a quarantined secret", file: VC, type: VaultError, expect: /is already quarantined/, fire: async () => { const b = await vault(); await b.put("a", "k", "v"); await b.revokeAndRotate("a", "k", async () => { throw new Error("x"); }, async () => {}).catch(() => undefined); await b.revokeAndRotate("a", "k", async () => "n", async () => {}); } },
    { name: "vault: a breach rotation whose slot moved before its quarantine", file: VC, type: VaultError, expect: /changed while its breach rotation began/, fire: async () => { const store = new MemoryCipherStore(); const b = await vault(store); await b.put("a", "k", "v"); const cas = store.compareAndSwap.bind(store); store.compareAndSwap = async () => false; try { await b.revokeAndRotate("a", "k", async () => "n", async () => {}); } finally { store.compareAndSwap = cas; } } },
    { name: "vault: a breach rotation superseded by a newer write", file: VC, type: VaultError, expect: /written by something else during its breach rotation/, fire: async () => { const b = await vault(); await b.put("a", "k", "v"); await b.revokeAndRotate("a", "k", async () => { await b.put("a", "k", "operator"); return "n"; }, async () => {}); } },
    { name: "vault: a failed re-issue quarantines", file: VC, type: VaultError, expect: /could not be re-issued — QUARANTINED/, fire: async () => { const b = await vault(); await b.put("a", "k", "v"); await b.revokeAndRotate("a", "k", async () => { throw new Error("x"); }, async () => {}); } },
    { name: "vault: a failed provider revocation", file: VC, type: VaultError, expect: /revoking the old value at the provider failed/, fire: async () => { const b = await vault(); await b.put("a", "k", "v"); await b.revokeAndRotate("a", "k", async () => "n", async () => { throw new Error("x"); }); } },
  ];
}
