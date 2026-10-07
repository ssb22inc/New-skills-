import { describe, expect, it } from "vitest";
import { VaultError, vaultForClient } from "../src/vault.ts";
import { EncryptedVaultBackend, MemoryCipherStore, importKek, manifestKey, slotKey, type CipherStore } from "../src/vault-crypto.ts";

const rawKey = (fill: number) => new Uint8Array(32).fill(fill);
const DAY = 86_400_000;

async function setup(now = { t: 1_000_000 }) {
  const store = new MemoryCipherStore();
  const kek = await importKek("k1", rawKey(7));
  const backend = new EncryptedVaultBackend(store, kek, { now: () => now.t });
  return { store, kek, backend, now };
}

describe("encrypted vault backing (§15 crown jewels, DONE C1 D-vault-rotation)", () => {
  /** MUTATION: store the plaintext, or drop the cipher. */
  it("secrets are sealed at rest — the store never holds the plaintext", async () => {
    const { store, backend } = await setup();
    await backend.put("a", "ai-gateway-key", "PLAINTEXT-SECRET-4411");
    const raw = store.raw.get(slotKey("a", "ai-gateway-key"))!;
    expect(raw).not.toContain("PLAINTEXT-SECRET-4411");
    expect(JSON.parse(raw)).toMatchObject({ v: 1, kek: "k1" });
    await backend.unlock("a");
    expect(vaultForClient(backend, "a").get("ai-gateway-key")).toEqual({ value: "PLAINTEXT-SECRET-4411", version: 1 });
  });

  it("each write uses a fresh IV — the same value twice seals differently", async () => {
    const { store, backend } = await setup();
    await backend.put("a", "k", "same");
    const first = JSON.parse(store.raw.get(slotKey("a", "k"))!);
    await backend.put("a", "k", "same");
    const second = JSON.parse(store.raw.get(slotKey("a", "k"))!);
    expect(second.iv).not.toBe(first.iv);
    expect(second.v).toBe(2);
  });

  /** MUTATION: drop the additional authenticated data. */
  it("a ciphertext moved into another tenant's slot fails authentication (Law 3)", async () => {
    const { store, backend } = await setup();
    await backend.put("a", "k", "tenant-a-secret");
    await backend.put("b", "k", "tenant-b-secret");
    store.raw.set(slotKey("b", "k"), store.raw.get(slotKey("a", "k"))!);
    await expect(backend.unlock("b")).rejects.toThrow(/failed authentication/);
  });

  it("a ciphertext replayed at another version fails authentication", async () => {
    const { store, backend } = await setup();
    await backend.put("a", "k", "v1");
    const old = JSON.parse(store.raw.get(slotKey("a", "k"))!);
    await backend.put("a", "k", "v2");
    store.raw.set(slotKey("a", "k"), JSON.stringify({ ...old, v: 2 }));
    await expect(backend.unlock("a")).rejects.toThrow(/failed authentication/);
  });

  it("a tampered or malformed record is refused, and the error carries no ciphertext", async () => {
    const { store, backend } = await setup();
    await backend.put("a", "k", "x");
    const rec = JSON.parse(store.raw.get(slotKey("a", "k"))!);
    const flipped = rec.ct.slice(0, -2) + (rec.ct.slice(-2) === "AA" ? "BB" : "AA");
    store.raw.set(slotKey("a", "k"), JSON.stringify({ ...rec, ct: flipped }));
    const err = (await backend.unlock("a").then(() => null, (e: unknown) => e)) as Error;
    expect(err).toBeInstanceOf(VaultError);
    expect(err.message).not.toContain(flipped);
    store.raw.set(slotKey("a", "k"), "not json");
    await expect(backend.unlock("a")).rejects.toThrow(/not a sealed record/);
  });

  /** MUTATION: let read() serve without an unlock, or keep the previous client's plaintext. */
  it("reads refuse until unlocked, and only the unlocked client's plaintext is held", async () => {
    const { backend } = await setup();
    await backend.put("a", "k", "va");
    await backend.put("b", "k", "vb");
    expect(() => backend.read("a", "k")).toThrow(/locked/);
    await backend.unlock("a");
    expect(backend.read("a", "k")?.value).toBe("va");
    expect(() => backend.read("b", "k"), "another tenant's secret was readable while a was unlocked").toThrow(/locked/);
    await backend.unlock("b");
    expect(() => backend.read("a", "k"), "a's plaintext survived switching to b").toThrow(/locked/);
    backend.lock();
    expect(() => backend.read("b", "k")).toThrow(/locked/);
  });

  /** MUTATION: drop the lock() at the top of unlock(). */
  it("a failed unlock of another client drops the previous client's plaintext", async () => {
    const { store, backend } = await setup();
    await backend.put("a", "k", "va");
    await backend.put("b", "k", "vb");
    await backend.unlock("a");
    store.raw.set(slotKey("b", "k"), "corrupt");
    await expect(backend.unlock("b")).rejects.toThrow();
    expect(() => backend.read("a", "k"), "a's plaintext survived a failed switch").toThrow(/locked/);
  });

  it("the KEK must be exactly 32 bytes and named", async () => {
    await expect(importKek("k", new Uint8Array(16))).rejects.toThrow(/32 bytes/);
    await expect(importKek("", rawKey(1))).rejects.toThrow(/id/);
  });
});

describe("vault auto-rotation (§15 'auto-rotated', breach runbook)", () => {
  /** MUTATION: rotate regardless of age, or never. */
  it("rotateDue replaces exactly the secrets older than their policy's maxAge", async () => {
    const { backend, now } = await setup();
    await backend.put("a", "old-key", "old-1");
    now.t += 31 * DAY;
    await backend.put("a", "fresh-key", "fresh-1");
    await backend.put("a", "unmanaged", "u-1");
    const issued: string[] = [];
    const report = await backend.rotateDue(
      "a",
      { "old-key": { maxAgeMs: 30 * DAY }, "fresh-key": { maxAgeMs: 30 * DAY } },
      async (_c, name, current) => {
        issued.push(name);
        return `${current}-next`;
      },
    );
    expect(report.rotated).toEqual(["old-key"]);
    expect(report.failed).toEqual([]);
    expect(issued).toEqual(["old-key"]);
    await backend.unlock("a");
    expect(backend.read("a", "old-key")).toEqual({ value: "old-1-next", version: 2 });
    expect(backend.read("a", "fresh-key")?.version).toBe(1);
    expect(backend.read("a", "unmanaged")?.version).toBe(1);
  });

  /** MUTATION: write the failed issuer's result, or drop the old secret. */
  it("a failing issuer leaves the old secret in service and is reported by name only", async () => {
    const { backend, now } = await setup();
    await backend.put("a", "k", "still-good");
    now.t += 40 * DAY;
    const report = await backend.rotateDue("a", { k: { maxAgeMs: DAY } }, async () => {
      throw new Error("provider down, token=still-good");
    });
    expect(report.rotated).toEqual([]);
    expect(report.failed).toEqual(["k"]);
    expect(JSON.stringify(report)).not.toContain("still-good");
    await backend.unlock("a");
    expect(backend.read("a", "k")).toEqual({ value: "still-good", version: 1 });
  });

  it("an issuer that returns the same value, or nothing, is a failed rotation", async () => {
    const { backend, now } = await setup();
    await backend.put("a", "k", "v");
    now.t += 2 * DAY;
    expect((await backend.rotateDue("a", { k: { maxAgeMs: DAY } }, async (_c, _n, cur) => cur)).failed).toEqual(["k"]);
    expect((await backend.rotateDue("a", { k: { maxAgeMs: DAY } }, async () => "")).failed).toEqual(["k"]);
  });

  it("a non-positive or non-finite maxAge is a failure, never 'rotate constantly' or 'never'", async () => {
    const { backend } = await setup();
    await backend.put("a", "k", "v");
    for (const maxAgeMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect((await backend.rotateDue("a", { k: { maxAgeMs } }, async () => "n")).failed).toEqual(["k"]);
    }
  });

  it("rotation of one tenant never touches another", async () => {
    const { backend, now } = await setup();
    await backend.put("a", "k", "a1");
    await backend.put("b", "k", "b1");
    now.t += 10 * DAY;
    await backend.rotateDue("a", { k: { maxAgeMs: DAY } }, async () => "a2");
    await backend.unlock("b");
    expect(backend.read("b", "k")).toEqual({ value: "b1", version: 1 });
  });

  /** MUTATION: let a failed re-issue leave the secret readable (X5-07). */
  it("revokeAndRotate replaces and revokes; a failed re-issue QUARANTINES the secret", async () => {
    const { backend } = await setup();
    const revoked: string[] = [];
    const revoke = async (_c: string, _n: string, v: string) => { revoked.push(v); };
    await backend.put("a", "k", "leaked");
    await backend.unlock("a");
    const rec = await backend.revokeAndRotate("a", "k", async () => "replacement", revoke);
    expect(rec).toEqual({ value: "replacement", version: 2 });
    expect(revoked, "the old value was never revoked at the provider").toEqual(["leaked"]);
    expect(backend.read("a", "k")?.value).toBe("replacement");

    await backend.put("a", "k2", "leaked-2");
    await backend.unlock("a");
    await expect(backend.revokeAndRotate("a", "k2", async () => { throw new Error("x"); }, revoke)).rejects.toThrow(/QUARANTINED/);
    expect(backend.read("a", "k2"), "a compromised secret stayed readable in the unlocked session").toBeNull();
    await backend.unlock("a");
    expect(backend.read("a", "k2"), "a compromised secret came back on the next unlock").toBeNull();
    await expect(backend.revokeAndRotate("a", "k2", async () => "n", revoke)).rejects.toThrow(/already quarantined/);

    await backend.put("a", "k3", "same");
    await expect(backend.revokeAndRotate("a", "k3", async (_c, _n, cur) => cur, revoke)).rejects.toThrow(/QUARANTINED/);
    await expect(backend.revokeAndRotate("a", "absent", async () => "n", revoke)).rejects.toThrow(/not found/);
  });

  it("a provider revocation failure is an error naming the secret, with the replacement in place", async () => {
    const { backend } = await setup();
    await backend.put("a", "k", "old");
    await expect(backend.revokeAndRotate("a", "k", async () => "new", async () => { throw new Error("provider down"); })).rejects.toThrow(/revoking the old value at the provider failed/);
    await backend.unlock("a");
    expect(backend.read("a", "k")?.value).toBe("new");
  });

  /** MUTATION: drop the timestamp from the AAD (X5-06). */
  it("an edited write time fails authentication instead of skipping rotation", async () => {
    const { store, backend, now } = await setup();
    await backend.put("a", "k", "v");
    const rec = JSON.parse(store.raw.get(slotKey("a", "k"))!);
    store.raw.set(slotKey("a", "k"), JSON.stringify({ ...rec, at: rec.at + 365 * DAY }));
    now.t += 40 * DAY;
    const report = await backend.rotateDue("a", { k: { maxAgeMs: DAY } }, async () => "n");
    expect(report.failed, "an edited timestamp silently skipped rotation").toEqual(["k"]);
    await expect(backend.unlock("a")).rejects.toThrow(/failed authentication/);
  });

  /** MUTATION: skip the manifest comparison on unlock (X5-06). */
  it("a whole old record restored over a newer one is refused as a rollback", async () => {
    const { store, backend } = await setup();
    await backend.put("a", "k", "v1");
    const old = store.raw.get(slotKey("a", "k"))!;
    await backend.put("a", "k", "v2");
    store.raw.set(slotKey("a", "k"), old);
    await expect(backend.unlock("a")).rejects.toThrow(/rolled-back record/);
  });

  it("a record ahead of the manifest (a crash between the two writes) still unlocks", async () => {
    const { store, backend } = await setup();
    await backend.put("a", "k", "v1");
    const manifestV1 = store.raw.get(manifestKey("a"))!;
    await backend.put("a", "k", "v2");
    store.raw.set(manifestKey("a"), manifestV1);
    await backend.unlock("a");
    expect(backend.read("a", "k")).toEqual({ value: "v2", version: 2 });
  });

  /** MUTATION: let rekey skip records or keep the old KEK id. */
  it("a KEK rotation re-seals under the new key and the old key can then be retired", async () => {
    const store = new MemoryCipherStore();
    const k1 = await importKek("k1", rawKey(1));
    const k2 = await importKek("k2", rawKey(2));
    const before = new EncryptedVaultBackend(store, k1);
    await before.put("a", "k", "survives-rekey");
    const during = new EncryptedVaultBackend(store, k2, { previous: [k1] });
    expect(await during.rekey("a")).toBe(1);
    expect(JSON.parse(store.raw.get(slotKey("a", "k"))!).kek).toBe("k2");
    const after = new EncryptedVaultBackend(store, k2);
    await after.unlock("a");
    expect(after.read("a", "k")).toEqual({ value: "survives-rekey", version: 1 });
    // Without the old key, an un-rekeyed record is refused, not silently empty.
    const elsewhere = new MemoryCipherStore();
    await new EncryptedVaultBackend(elsewhere, k1).put("a", "k1only", "x");
    store.raw.set(slotKey("a", "k1only"), elsewhere.raw.get(slotKey("a", "k1only"))!);
    await expect(after.unlock("a")).rejects.toThrow(/unknown key/);
  });
});

/** A store whose reads can be paused, to interleave async operations
 * deterministically. */
class PausableStore implements CipherStore {
  readonly inner = new MemoryCipherStore();
  gate: { key: string; release: Promise<void>; hit: () => void } | null = null;
  async get(key: string): Promise<string | null> {
    const v = await this.inner.get(key);
    const g = this.gate;
    if (g && key === g.key) {
      this.gate = null;
      g.hit();
      await g.release;
    }
    return v;
  }
  compareAndSwap(key: string, expected: string | null, next: string): Promise<boolean> {
    return this.inner.compareAndSwap(key, expected, next);
  }
  list(prefix: string): Promise<string[]> {
    return this.inner.list(prefix);
  }
  pauseNextGet(key: string): { reached: Promise<void>; release: () => void } {
    let release!: () => void;
    let hit!: () => void;
    const releaseP = new Promise<void>((r) => (release = r));
    const reached = new Promise<void>((r) => (hit = r));
    this.gate = { key, release: releaseP, hit };
    return { reached, release };
  }
}

describe("vault concurrency (X5-08, X5-09)", () => {
  /** MUTATION: write the re-key unconditionally. */
  it("a re-key racing a rotation cannot restore the old credential", async () => {
    const store = new PausableStore();
    const k1 = await importKek("k1", rawKey(1));
    const k2 = await importKek("k2", rawKey(2));
    await new EncryptedVaultBackend(store, k1).put("a", "k", "old");
    const rekeyer = new EncryptedVaultBackend(store, k2, { previous: [k1] });
    const writer = new EncryptedVaultBackend(store, k2, { previous: [k1] });
    const p = store.pauseNextGet(slotKey("a", "k"));
    const rekeying = rekeyer.rekey("a");
    await p.reached; // the re-key has read version 1
    await writer.put("a", "k", "rotated");
    p.release();
    await rekeying;
    const fresh = new EncryptedVaultBackend(store, k2);
    await fresh.unlock("a");
    expect(fresh.read("a", "k"), "the re-key restored the rotated-away credential").toEqual({ value: "rotated", version: 2 });
  });

  /** MUTATION: replace compare-and-swap with an unconditional write. */
  it("two concurrent writers never mint the same version", async () => {
    const store = new PausableStore();
    const k = await importKek("k1", rawKey(1));
    const a = new EncryptedVaultBackend(store, k);
    const b = new EncryptedVaultBackend(store, k);
    await a.put("c", "s", "v0");
    const p = store.pauseNextGet(slotKey("c", "s"));
    const first = a.put("c", "s", "from-a");
    await p.reached; // a has read version 1
    const second = await b.put("c", "s", "from-b");
    p.release();
    const firstRec = await first;
    expect(new Set([firstRec.version, second.version]).size, "two writers minted the same version").toBe(2);
    const fresh = new EncryptedVaultBackend(store, k);
    await fresh.unlock("c");
    expect(fresh.read("c", "s")?.version).toBe(3);
  });

  /** MUTATION: drop the generation check from unlock(). */
  it("a lock during an in-flight unlock is not undone when the unlock completes", async () => {
    const store = new PausableStore();
    const k = await importKek("k1", rawKey(1));
    const backend = new EncryptedVaultBackend(store, k);
    await backend.put("a", "s", "secret");
    const p = store.pauseNextGet(slotKey("a", "s"));
    const unlocking = backend.unlock("a");
    await p.reached;
    backend.lock();
    p.release();
    await expect(unlocking).rejects.toThrow(/while this unlock was in flight/);
    expect(() => backend.read("a", "s"), "an explicit lock was undone by a slower unlock").toThrow(/locked/);
  });
});

describe("x6 vault findings (GPT-6 Astra, 2026-10-06)", () => {
  /** X6-06: a failed re-issue never reached the provider. MUTATION: X6-06. */
  it("a breach rotation revokes at the provider even when re-issue fails", async () => {
    const { backend } = await setup();
    await backend.put("a", "k", "stolen");
    const revoked: string[] = [];
    await expect(backend.revokeAndRotate("a", "k", async () => { throw new Error("issuer down"); }, async (_c, _n, v) => { revoked.push(v); })).rejects.toThrow(/QUARANTINED.*revoked at the provider/);
    expect(revoked, "a compromised credential was never sent for revocation").toEqual(["stolen"]);
    await backend.put("a", "k2", "stolen-2");
    await expect(backend.revokeAndRotate("a", "k2", async () => { throw new Error("x"); }, async () => { throw new Error("provider down"); })).rejects.toThrow(/ALSO failed/);
  });

  /** X6-07: a stale scheduled rotation un-quarantined a slot. MUTATION: X6-07. */
  it("a scheduled rotation decided on an old record cannot overwrite a newer quarantine", async () => {
    const store = new PausableStore();
    const now = { t: 1_000_000 };
    const k = await importKek("k1", rawKey(1));
    const backend = new EncryptedVaultBackend(store, k, { now: () => now.t });
    await backend.put("a", "s", "v1");
    now.t += 10 * DAY;
    let release!: () => void;
    let reached!: () => void;
    const atIssuer = new Promise<void>((r) => (reached = r));
    const gate = new Promise<void>((r) => (release = r));
    const rotating = backend.rotateDue("a", { s: { maxAgeMs: DAY } }, async () => { reached(); await gate; return "rotated"; });
    await atIssuer; // the rotation has read version 1
    await expect(backend.revokeAndRotate("a", "s", async () => { throw new Error("x"); }, async () => {})).rejects.toThrow(/QUARANTINED/);
    release();
    const report = await rotating;
    expect(report.failed, "the stale rotation was reported as a success").toEqual(["s"]);
    const fresh = new EncryptedVaultBackend(store, k);
    await fresh.unlock("a");
    expect(fresh.read("a", "s"), "a stale rotation made a quarantined slot readable again").toBeNull();
  });

  /** X6-08: an unlock that read before a quarantine installed after it. MUTATION: X6-08. */
  it("an unlock in flight across a quarantine installs nothing", async () => {
    const store = new PausableStore();
    const k = await importKek("k1", rawKey(1));
    const backend = new EncryptedVaultBackend(store, k);
    await backend.put("a", "s", "compromised");
    const p = store.pauseNextGet(slotKey("a", "s"));
    const unlocking = backend.unlock("a").then(() => null, (e: unknown) => e as Error);
    await p.reached; // the unlock has read the old record
    const quarantine = backend.revokeAndRotate("a", "s", async () => { throw new Error("x"); }, async () => {}).catch(() => undefined);
    p.release();
    await quarantine;
    expect((await unlocking)?.message, "an unlock across a quarantine completed").toMatch(/while this unlock was in flight/);
    expect(() => backend.read("a", "s"), "quarantined plaintext was installed by a slower unlock").toThrow(/locked/);
  });
});
