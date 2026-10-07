/** Encrypted, auto-rotating vault backing (ENGINE_BUILD.md §15 "vault-encrypted,
 * auto-rotated, least-scope, per-client"; DONE.md C1 D-vault-rotation).
 *
 * AT REST: every secret is sealed with AES-256-GCM under a key-encryption key
 * (KEK) the deployment supplies — a Worker secret binding, never a file. Each
 * write uses a fresh random 96-bit IV. The additional authenticated data binds
 * the length-prefixed (clientId, name) pair, the version, the write time and
 * the quarantine flag, so a ciphertext moved to another tenant's slot, a
 * version or timestamp edited in place, or a quarantine flag stripped, fails
 * authentication (Law 3; cross-family finding X5-06 for the timestamp).
 *
 * ROLLBACK: a sealed per-client MANIFEST records each secret's current
 * version. Restoring an old record whole — valid ciphertext, valid AAD — is
 * refused on unlock because its version is below the manifest's (X5-06). The
 * manifest is written after the record, and a record AHEAD of the manifest is
 * accepted, so a crash between the two writes cannot become an outage.
 * LIMITATION, stated: rolling back the record AND the manifest together is not
 * detectable from inside the store; that needs a monotonic counter outside it
 * (the Phase 2 Durable Object).
 *
 * WRITES ARE COMPARE-AND-SWAP (X5-08). Every write names the exact bytes it
 * replaces; a concurrent writer that got there first makes the write retry or
 * stop, so a re-key cannot restore a credential a rotation just replaced and
 * two writers cannot mint the same version. Workers KV has no compare-and-swap,
 * so the production CipherStore must be a Durable Object — stated here so a
 * KV-backed store is not wired in by mistake.
 *
 * IN USE: `VaultBackend.read` is synchronous because the gateway reads it on the
 * money path; WebCrypto is async. A request `unlock`s ONE client, decrypting
 * that client's records into isolate memory; reads before unlock, or of any
 * other client, refuse. Every `lock()` and every new `unlock()` advances a
 * generation, and an unlock installs its plaintext only if the generation is
 * still its own — an explicit lock is never undone by a slower unlock (X5-09).
 *
 * ROTATION: `rotateDue` replaces secrets older than their policy's maxAge via
 * the caller's issuer; a failing or unchanged issue leaves the old secret in
 * service — a broken provider must not become an outage — and reports the
 * NAME only. `revokeAndRotate` is the breach runbook (§15): on any failure the
 * secret is QUARANTINED — sealed as compromised, so no read can return it
 * again — and on success the old value is revoked at the provider; a failed
 * provider revocation is an error naming the secret (X5-07).
 *
 * NOT DONE HERE, stated as a limitation: provisioning the KEK and the Durable
 * Object store (H7), the cron trigger, and issuers/revokers for real providers
 * (they need the provider accounts, H10+). The mechanism is exercised; the live
 * half is not. */
import { VaultError, type SecretRecord, type VaultBackend } from "./vault.ts";

/** The store the vault needs. `compareAndSwap` must be atomic: it writes
 * `next` only if the key currently holds exactly `expected` (null = absent). */
export interface CipherStore {
  get(key: string): Promise<string | null>;
  compareAndSwap(key: string, expected: string | null, next: string): Promise<boolean>;
  list(prefix: string): Promise<string[]>;
}

/** Mints a replacement value. Receives the current value so OAuth refresh can
 * use the refresh token; must never log it. */
export type SecretIssuer = (clientId: string, name: string, current: string) => Promise<string>;

/** Revokes a value at its provider. */
export type SecretRevoker = (clientId: string, name: string, value: string) => Promise<void>;

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
  readonly q: boolean;
  readonly kek: string;
  readonly iv: string;
  readonly ct: string;
}

/** The runtime's WebCrypto key type, read off the global rather than from a DOM
 * lib this project does not load (Workers and Node both provide `crypto`). */
type CryptoKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

const enc = new TextEncoder();
const dec = new TextDecoder();
const CAS_RETRIES = 8;

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

export function manifestKey(clientId: string): string {
  return `vault-manifest:${clientId.length}:${clientId}`;
}

function clientPrefix(clientId: string): string {
  return `vault:${clientId.length}:${clientId}:`;
}

function aad(slot: string, version: number, at: number, quarantined: boolean): Uint8Array {
  return enc.encode(`${slot}#v${version}#at${at}#q${quarantined ? 1 : 0}`);
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

function parseSealed(raw: string, what: string): Sealed {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new VaultError(`${what} is not a sealed record`);
  }
  const s = parsed as Partial<Sealed>;
  if (
    typeof s !== "object" || s === null ||
    !Number.isInteger(s.v) || (s.v as number) < 1 ||
    typeof s.at !== "number" || typeof s.q !== "boolean" || typeof s.kek !== "string" ||
    typeof s.iv !== "string" || typeof s.ct !== "string"
  ) {
    throw new VaultError(`${what} is not a sealed record`);
  }
  return s as Sealed;
}

export class EncryptedVaultBackend implements VaultBackend {
  readonly #store: CipherStore;
  readonly #keks: ReadonlyMap<string, CryptoKey>;
  readonly #current: Kek;
  readonly #now: () => number;
  #unlockedClient: string | null = null;
  #plain = new Map<string, SecretRecord>();
  #generation = 0;

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

  async #seal(slot: string, value: string, version: number, at: number, quarantined: boolean): Promise<Sealed> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: aad(slot, version, at, quarantined) },
      this.#current.key,
      enc.encode(value),
    );
    return { v: version, at, q: quarantined, kek: this.#current.id, iv: b64(iv), ct: b64(new Uint8Array(ct)) };
  }

  async #open(slot: string, what: string, sealed: Sealed): Promise<string> {
    const key = this.#keks.get(sealed.kek);
    if (!key) throw new VaultError(`${what} is sealed under an unknown key`);
    try {
      const pt = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: unb64(sealed.iv), additionalData: aad(slot, sealed.v, sealed.at, sealed.q) },
        key,
        unb64(sealed.ct),
      );
      return dec.decode(pt);
    } catch {
      // Tampered, moved between slots, or edited in place. Never echo the
      // ciphertext or the cause.
      throw new VaultError(`${what} failed authentication — refusing to use it`);
    }
  }

  async #loadRaw(clientId: string, name: string): Promise<{ raw: string; sealed: Sealed } | null> {
    const raw = await this.#store.get(slotKey(clientId, name));
    if (raw === null) return null;
    return { raw, sealed: parseSealed(raw, `secret "${name}"`) };
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

  /** The manifest: name → highest version written. Sealed like a secret. */
  async #loadManifest(clientId: string): Promise<{ raw: string | null; versions: Record<string, number> }> {
    const key = manifestKey(clientId);
    const raw = await this.#store.get(key);
    if (raw === null) return { raw: null, versions: {} };
    const sealed = parseSealed(raw, "the vault manifest");
    const text = await this.#open(key, "the vault manifest", sealed);
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new VaultError("the vault manifest is malformed");
    const versions: Record<string, number> = Object.create(null) as Record<string, number>;
    for (const [n, v] of Object.entries(parsed)) {
      if (!Number.isInteger(v) || (v as number) < 1) throw new VaultError("the vault manifest is malformed");
      versions[n] = v as number;
    }
    return { raw, versions };
  }

  /** Raises the manifest's version for `name` to at least `version`. */
  async #advanceManifest(clientId: string, name: string, version: number): Promise<void> {
    const key = manifestKey(clientId);
    for (let i = 0; i < CAS_RETRIES; i++) {
      const { raw, versions } = await this.#loadManifest(clientId);
      if ((versions[name] ?? 0) >= version) return;
      const next = { ...versions, [name]: version };
      const seq = raw === null ? 1 : parseSealed(raw, "the vault manifest").v + 1;
      const sealed = await this.#seal(key, JSON.stringify(next), seq, this.#now(), false);
      if (await this.#store.compareAndSwap(key, raw, JSON.stringify(sealed))) return;
    }
    throw new VaultError("the vault manifest could not be updated — concurrent writers kept winning");
  }

  /** Writes the next version with compare-and-swap; the version is read from
   * the store, never from the caller, so a caller cannot roll a slot back. */
  async #write(clientId: string, name: string, value: string, quarantined: boolean): Promise<SecretRecord> {
    if (!clientId || !name) throw new VaultError("vault writes require a clientId and a name");
    const slot = slotKey(clientId, name);
    // EVERY WRITE INVALIDATES AN IN-FLIGHT UNLOCK (cross-family finding X6-08):
    // an unlock that read the old value before this write must not install it
    // after. A quarantine also drops the cached plaintext FIRST, before any
    // await, so a later failure cannot leave the compromised value readable.
    this.#generation += 1;
    if (quarantined && this.#unlockedClient === clientId) this.#plain.delete(name);
    for (let i = 0; i < CAS_RETRIES; i++) {
      const prior = await this.#loadRaw(clientId, name);
      const version = (prior?.sealed.v ?? 0) + 1;
      const sealed = await this.#seal(slot, value, version, this.#now(), quarantined);
      if (await this.#store.compareAndSwap(slot, prior?.raw ?? null, JSON.stringify(sealed))) {
        await this.#advanceManifest(clientId, name, version);
        if (this.#unlockedClient === clientId) {
          if (quarantined) this.#plain.delete(name);
          else this.#plain.set(name, Object.freeze({ value, version }));
        }
        return Object.freeze({ value: quarantined ? "" : value, version });
      }
    }
    throw new VaultError(`secret "${name}" could not be written — concurrent writers kept winning`);
  }

  /** One compare-and-swap over exactly `expectedRaw`; false if anything else
   * wrote the slot since it was read. Never retries onto newer state. */
  async #replaceExactly(clientId: string, name: string, expectedRaw: string, priorVersion: number, value: string): Promise<boolean> {
    const slot = slotKey(clientId, name);
    this.#generation += 1;
    const version = priorVersion + 1;
    const sealed = await this.#seal(slot, value, version, this.#now(), false);
    if (!(await this.#store.compareAndSwap(slot, expectedRaw, JSON.stringify(sealed)))) return false;
    await this.#advanceManifest(clientId, name, version);
    if (this.#unlockedClient === clientId) this.#plain.set(name, Object.freeze({ value, version }));
    return true;
  }

  async put(clientId: string, name: string, value: string): Promise<SecretRecord> {
    return this.#write(clientId, name, value, false);
  }

  /** Decrypts ONE client's secrets for synchronous reads. Unlocking another
   * client drops the previous client's plaintext first, and the result is
   * installed only if no lock or newer unlock happened meanwhile. */
  async unlock(clientId: string): Promise<void> {
    if (!clientId) throw new VaultError("vault unlock requires a clientId");
    this.lock();
    const generation = this.#generation;
    const { versions } = await this.#loadManifest(clientId);
    const plain = new Map<string, SecretRecord>();
    for (const name of await this.#names(clientId)) {
      const loaded = await this.#loadRaw(clientId, name);
      if (!loaded) continue;
      const { sealed } = loaded;
      const value = await this.#open(slotKey(clientId, name), `secret "${name}"`, sealed);
      if (sealed.v < (versions[name] ?? 0)) {
        throw new VaultError(`secret "${name}" is older than the vault manifest — a rolled-back record is refused`);
      }
      if (sealed.q) continue; // quarantined: present, never readable
      plain.set(name, Object.freeze({ value, version: sealed.v }));
    }
    if (generation !== this.#generation) {
      throw new VaultError("vault was locked, re-unlocked or written while this unlock was in flight — nothing installed");
    }
    this.#plain = plain;
    this.#unlockedClient = clientId;
  }

  lock(): void {
    this.#generation += 1;
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
   * Secrets with no policy entry, and quarantined secrets, are not rotated. */
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
      try {
        const loaded = await this.#loadRaw(clientId, name);
        if (!loaded || loaded.sealed.q) continue;
        // Opened BEFORE the age is trusted: `at` is authenticated, so an edited
        // timestamp fails here instead of silently skipping rotation (X5-06).
        const current = await this.#open(slotKey(clientId, name), `secret "${name}"`, loaded.sealed);
        if (now - loaded.sealed.at < policy.maxAgeMs) continue;
        const next = await issue(clientId, name, current);
        if (typeof next !== "string" || next.length === 0 || next === current) throw new Error("issuer returned no new value");
        // OVER THE EXACT RECORD THE DECISION WAS MADE ON (X6-07): `put` re-read
        // the slot, so a rotation issued against version 1 could overwrite a
        // quarantine written as version 2 and make the slot readable again.
        if (!(await this.#replaceExactly(clientId, name, loaded.raw, loaded.sealed.v, next))) throw new Error("the slot changed during rotation");
        rotated.push(name);
      } catch {
        // The old secret stays: a failing provider must not become an outage.
        failed.push(name);
      }
    }
    return Object.freeze({ rotated: Object.freeze(rotated), failed: Object.freeze(failed) });
  }

  /** Breach runbook (§15): revoke → rotate. A known-compromised secret never
   * stays readable: if a replacement cannot be issued it is QUARANTINED, and
   * after a successful replacement the old value is revoked at the provider. */
  async revokeAndRotate(clientId: string, name: string, issue: SecretIssuer, revoke: SecretRevoker): Promise<SecretRecord> {
    if (typeof revoke !== "function") throw new VaultError("revokeAndRotate requires a provider revoker");
    const loaded = await this.#loadRaw(clientId, name);
    if (!loaded) throw new VaultError(`secret "${name}" not found for scoped client`);
    if (loaded.sealed.q) throw new VaultError(`secret "${name}" is already quarantined`);
    const current = await this.#open(slotKey(clientId, name), `secret "${name}"`, loaded.sealed);
    // REVOKE FIRST, WHATEVER HAPPENS NEXT (cross-family finding X6-06). The
    // runbook is revoke → rotate; issuing first meant a failed issue never
    // reached the provider, and local quarantine cannot invalidate a stolen
    // token. A revocation failure is remembered and reported, never swallowed.
    let revoked = true;
    try {
      await revoke(clientId, name, current);
    } catch {
      revoked = false;
    }
    let next: unknown;
    try {
      next = await issue(clientId, name, current);
    } catch {
      next = null;
    }
    if (typeof next !== "string" || next.length === 0 || next === current) {
      await this.#write(clientId, name, "", true);
      throw new VaultError(
        `secret "${name}" could not be re-issued — QUARANTINED: it can no longer be read; ${revoked ? "it was revoked at the provider" : "revoking it at the provider ALSO failed — revoke it by hand"}`,
      );
    }
    const rec = await this.put(clientId, name, next);
    if (!revoked) {
      throw new VaultError(`secret "${name}" was replaced, but revoking the old value at the provider failed — it may still be valid there`);
    }
    return rec;
  }

  /** Re-seals every record of `clientId` under the current KEK, so a retired
   * KEK can be dropped from `previous`. A record that changed since it was
   * read is left alone: whoever changed it sealed it under the current KEK. */
  async rekey(clientId: string): Promise<number> {
    let n = 0;
    for (const name of await this.#names(clientId)) {
      const loaded = await this.#loadRaw(clientId, name);
      if (!loaded || loaded.sealed.kek === this.#current.id) continue;
      const slot = slotKey(clientId, name);
      const value = await this.#open(slot, `secret "${name}"`, loaded.sealed);
      const resealed = await this.#seal(slot, value, loaded.sealed.v, loaded.sealed.at, loaded.sealed.q);
      if (await this.#store.compareAndSwap(slot, loaded.raw, JSON.stringify(resealed))) n += 1;
    }
    const mk = manifestKey(clientId);
    const raw = await this.#store.get(mk);
    if (raw !== null) {
      const sealed = parseSealed(raw, "the vault manifest");
      if (sealed.kek !== this.#current.id) {
        const text = await this.#open(mk, "the vault manifest", sealed);
        const resealed = await this.#seal(mk, text, sealed.v, sealed.at, false);
        await this.#store.compareAndSwap(mk, raw, JSON.stringify(resealed));
      }
    }
    return n;
  }
}

/** Test/dev CipherStore. Atomic by construction: single-threaded, and
 * `compareAndSwap` does its check and write with no await between them. */
export class MemoryCipherStore implements CipherStore {
  readonly raw = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.raw.get(key) ?? null;
  }
  async compareAndSwap(key: string, expected: string | null, next: string): Promise<boolean> {
    if ((this.raw.get(key) ?? null) !== expected) return false;
    this.raw.set(key, next);
    return true;
  }
  async list(prefix: string): Promise<string[]> {
    return [...this.raw.keys()].filter((k) => k.startsWith(prefix));
  }
}
