/** Encrypted, auto-rotating vault backing (ENGINE_BUILD.md §15 "vault-encrypted,
 * auto-rotated, least-scope, per-client"; DONE.md C1 D-vault-rotation, open
 * since F10 because no rotation existed to exercise).
 *
 * AT REST: every secret is sealed with AES-256-GCM under a key-encryption key
 * (KEK) the deployment supplies — a Worker secret binding, never a file. Each
 * write uses a fresh random 96-bit IV. The additional authenticated data is the
 * length-prefixed (clientId, name) pair plus the version, so a ciphertext copied
 * from one tenant's slot into another's, or replayed at an older version, fails
 * authentication instead of decrypting into the wrong place (Law 3).
 *
 * IN USE: `VaultBackend.read` is synchronous because the gateway reads it on the
 * money path. WebCrypto is async. So the backend is UNLOCKED once per request
 * (`await unlock(clientId)`), which decrypts that one client's records into
 * isolate memory; reads before an unlock refuse. Only the unlocked client's
 * plaintext is ever held — another tenant's secrets stay sealed.
 *
 * ROTATION: `rotateDue` replaces every secret older than its policy's maxAge
 * with a value minted by the caller's `SecretIssuer` (an OAuth refresh, a
 * provider key roll). A failed issue leaves the old secret in place — a broken
 * provider must not become an outage — and reports the failure by name only.
 * `revokeAndRotate` is the breach runbook's first two steps (§15): the old
 * value is gone the moment the new one is sealed.
 *
 * NOT DONE HERE, stated as a limitation: provisioning the KEK and the KV
 * namespace (H7), and the issuers for real providers (they need the provider
 * accounts, H10+). The mechanism is exercised; the live half is not. */
import { VaultError, type SecretRecord, type VaultBackend } from "./vault.ts";

/** The shape of a Workers KV namespace, narrowed to what the vault needs. */
export interface CipherStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

/** Mints a replacement value. Receives the current value so OAuth refresh can
 * use the refresh token; must never log it. */
export type SecretIssuer = (clientId: string, name: string, current: string) => Promise<string>;

export interface RotationPolicy {
  readonly maxAgeMs: number;
}

export interface RotationReport {
  readonly rotated: readonly string[];
  /** Names only. A rotation error message is never included — it may echo a value. */
  readonly failed: readonly string[];
}

interface Sealed {
  readonly v: number;
  readonly at: number;
  readonly kek: string;
  readonly iv: string;
  readonly ct: string;
}

/** The runtime's WebCrypto key type, read off the global rather than from a DOM
 * lib this project does not load (Workers and Node both provide `crypto`). */
type CryptoKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Length-prefixed, as in MemoryVaultBackend (R2-30): no delimiter inside a
 * clientId can make two (clientId, name) pairs share a slot. */
export function slotKey(clientId: string, name: string): string {
  return `vault:${clientId.length}:${clientId}:${name.length}:${name}`;
}

function clientPrefix(clientId: string): string {
  return `vault:${clientId.length}:${clientId}:`;
}

function aad(clientId: string, name: string, version: number): Uint8Array {
  return enc.encode(`${slotKey(clientId, name)}#v${version}`);
}

export interface Kek {
  readonly id: string;
  readonly key: CryptoKey;
}

/** Imports a 32-byte raw key. Anything else is refused: a short key is a
 * configuration error, not something to pad. */
export async function importKek(id: string, raw: Uint8Array): Promise<Kek> {
  if (!id) throw new VaultError("KEK requires an id");
  if (raw.byteLength !== 32) throw new VaultError("KEK must be exactly 32 bytes (AES-256)");
  const key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  return Object.freeze({ id, key });
}

export class EncryptedVaultBackend implements VaultBackend {
  readonly #store: CipherStore;
  readonly #keks: ReadonlyMap<string, CryptoKey>;
  readonly #current: Kek;
  readonly #now: () => number;
  #unlockedClient: string | null = null;
  #plain = new Map<string, SecretRecord>();

  /** `current` seals new writes; `previous` KEKs may only open old records, so
   * a KEK rotation never strands a secret sealed under the last key. */
  constructor(store: CipherStore, current: Kek, opts: { previous?: readonly Kek[]; now?: () => number } = {}) {
    this.#store = store;
    this.#current = current;
    const keks = new Map<string, CryptoKey>();
    for (const k of opts.previous ?? []) keks.set(k.id, k.key);
    keks.set(current.id, current.key);
    this.#keks = keks;
    this.#now = opts.now ?? (() => Date.now());
  }

  async #seal(clientId: string, name: string, value: string, version: number): Promise<Sealed> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: aad(clientId, name, version) },
      this.#current.key,
      enc.encode(value),
    );
    return { v: version, at: this.#now(), kek: this.#current.id, iv: b64(iv), ct: b64(new Uint8Array(ct)) };
  }

  async #open(clientId: string, name: string, sealed: Sealed): Promise<string> {
    const key = this.#keks.get(sealed.kek);
    if (!key) throw new VaultError(`secret "${name}" is sealed under an unknown key`);
    try {
      const pt = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: unb64(sealed.iv), additionalData: aad(clientId, name, sealed.v) },
        key,
        unb64(sealed.ct),
      );
      return dec.decode(pt);
    } catch {
      // Tampered, moved between slots, or replayed at another version. Never
      // echo the ciphertext or the cause.
      throw new VaultError(`secret "${name}" failed authentication — refusing to use it`);
    }
  }

  async #load(clientId: string, name: string): Promise<Sealed | null> {
    const raw = await this.#store.get(slotKey(clientId, name));
    if (raw === null) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new VaultError(`secret "${name}" is not a sealed record`);
    }
    const s = parsed as Partial<Sealed>;
    if (
      typeof s !== "object" || s === null ||
      !Number.isInteger(s.v) || (s.v as number) < 1 ||
      typeof s.at !== "number" || typeof s.kek !== "string" ||
      typeof s.iv !== "string" || typeof s.ct !== "string"
    ) {
      throw new VaultError(`secret "${name}" is not a sealed record`);
    }
    return s as Sealed;
  }

  async #names(clientId: string): Promise<string[]> {
    const prefix = clientPrefix(clientId);
    const out: string[] = [];
    for (const key of await this.#store.list(prefix)) {
      const m = /^(\d+):(.*)$/s.exec(key.slice(prefix.length));
      if (m && m[2]!.length === Number(m[1])) out.push(m[2]!);
    }
    return out;
  }

  /** Writes a new version. The version is the stored one plus one, read from
   * the store — never from the caller — so a caller cannot roll a slot back. */
  async put(clientId: string, name: string, value: string): Promise<SecretRecord> {
    if (!clientId || !name) throw new VaultError("vault writes require a clientId and a name");
    const prior = await this.#load(clientId, name);
    const version = (prior?.v ?? 0) + 1;
    const sealed = await this.#seal(clientId, name, value, version);
    await this.#store.put(slotKey(clientId, name), JSON.stringify(sealed));
    const rec = Object.freeze({ value, version });
    if (this.#unlockedClient === clientId) this.#plain.set(name, rec);
    return rec;
  }

  /** Decrypts ONE client's secrets for synchronous reads. Unlocking another
   * client drops the previous client's plaintext first. */
  async unlock(clientId: string): Promise<void> {
    if (!clientId) throw new VaultError("vault unlock requires a clientId");
    this.lock();
    const plain = new Map<string, SecretRecord>();
    for (const name of await this.#names(clientId)) {
      const sealed = await this.#load(clientId, name);
      if (sealed) plain.set(name, Object.freeze({ value: await this.#open(clientId, name, sealed), version: sealed.v }));
    }
    this.#plain = plain;
    this.#unlockedClient = clientId;
  }

  lock(): void {
    this.#plain = new Map();
    this.#unlockedClient = null;
  }

  read(clientId: string, name: string): SecretRecord | null {
    if (this.#unlockedClient !== clientId) {
      throw new VaultError("vault is locked for this client — unlock it before reading (no cross-client plaintext)");
    }
    return this.#plain.get(name) ?? null;
  }

  /** Replaces every secret of `clientId` older than its policy's maxAge.
   * Secrets with no policy entry are not rotated by schedule. */
  async rotateDue(
    clientId: string,
    policies: Readonly<Record<string, RotationPolicy>>,
    issue: SecretIssuer,
  ): Promise<RotationReport> {
    const rotated: string[] = [];
    const failed: string[] = [];
    const now = this.#now();
    for (const name of await this.#names(clientId)) {
      const policy = Object.hasOwn(policies, name) ? policies[name] : undefined;
      if (!policy) continue;
      if (!(Number.isFinite(policy.maxAgeMs) && policy.maxAgeMs > 0)) {
        failed.push(name);
        continue;
      }
      const sealed = await this.#load(clientId, name);
      if (!sealed || now - sealed.at < policy.maxAgeMs) continue;
      try {
        const current = await this.#open(clientId, name, sealed);
        const next = await issue(clientId, name, current);
        if (typeof next !== "string" || next.length === 0 || next === current) throw new Error("issuer returned no new value");
        await this.put(clientId, name, next);
        rotated.push(name);
      } catch {
        // The old secret stays: a failing provider must not become an outage.
        failed.push(name);
      }
    }
    return Object.freeze({ rotated: Object.freeze(rotated), failed: Object.freeze(failed) });
  }

  /** Breach runbook steps 1–2 (§15): revoke the old value, seal its
   * replacement. Unlike scheduled rotation, a failed issue is an ERROR — a
   * known-compromised secret must not quietly stay in service. */
  async revokeAndRotate(clientId: string, name: string, issue: SecretIssuer): Promise<SecretRecord> {
    const sealed = await this.#load(clientId, name);
    if (!sealed) throw new VaultError(`secret "${name}" not found for scoped client`);
    const current = await this.#open(clientId, name, sealed);
    let next: string;
    try {
      next = await issue(clientId, name, current);
    } catch {
      throw new VaultError(`secret "${name}" could not be re-issued — it is compromised and still in the store; revoke it at the provider`);
    }
    if (typeof next !== "string" || next.length === 0 || next === current) {
      throw new VaultError(`secret "${name}" was re-issued unchanged — it is compromised and still in the store`);
    }
    return this.put(clientId, name, next);
  }

  /** Re-seals every record of `clientId` under the current KEK, so a retired
   * KEK can be dropped from `previous`. */
  async rekey(clientId: string): Promise<number> {
    let n = 0;
    for (const name of await this.#names(clientId)) {
      const sealed = await this.#load(clientId, name);
      if (!sealed || sealed.kek === this.#current.id) continue;
      const value = await this.#open(clientId, name, sealed);
      const resealed = await this.#seal(clientId, name, value, sealed.v);
      await this.#store.put(slotKey(clientId, name), JSON.stringify({ ...resealed, at: sealed.at }));
      n += 1;
    }
    return n;
  }
}

/** Test/dev CipherStore with the KV shape. */
export class MemoryCipherStore implements CipherStore {
  readonly raw = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.raw.get(key) ?? null;
  }
  async put(key: string, value: string): Promise<void> {
    this.raw.set(key, value);
  }
  async list(prefix: string): Promise<string[]> {
    return [...this.raw.keys()].filter((k) => k.startsWith(prefix));
  }
}
