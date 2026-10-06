import { describe, expect, it } from "vitest";
import { VaultError, vaultForClient } from "../src/vault.ts";
import { EncryptedVaultBackend, MemoryCipherStore, importKek, slotKey } from "../src/vault-crypto.ts";

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

  /** MUTATION: swallow the issuer failure in revokeAndRotate. */
  it("revokeAndRotate replaces a compromised secret, and a failed re-issue is an error", async () => {
    const { backend } = await setup();
    await backend.put("a", "k", "leaked");
    const rec = await backend.revokeAndRotate("a", "k", async () => "replacement");
    expect(rec).toEqual({ value: "replacement", version: 2 });
    await expect(backend.revokeAndRotate("a", "k", async () => { throw new Error("x"); })).rejects.toThrow(/compromised/);
    await expect(backend.revokeAndRotate("a", "k", async (_c, _n, cur) => cur)).rejects.toThrow(/compromised/);
    await expect(backend.revokeAndRotate("a", "absent", async () => "n")).rejects.toThrow(/not found/);
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
    await before.put("a", "k2only", "x");
    await expect(after.unlock("a")).rejects.toThrow(/unknown key/);
  });
});
