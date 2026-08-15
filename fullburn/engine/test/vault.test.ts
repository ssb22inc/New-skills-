import { describe, expect, it } from "vitest";
import { MemoryVaultBackend, VaultError, vaultForClient } from "../src/vault.ts";

describe("vault (§15, Law 3, R11)", () => {
  it("scoping is structural: a vault handle is bound to one client at construction", () => {
    const backend = new MemoryVaultBackend();
    backend.set("a", "k", "va");
    backend.set("b", "k", "vb");
    expect(vaultForClient(backend, "a").get("k").value).toBe("va");
    expect(vaultForClient(backend, "b").get("k").value).toBe("vb");
    expect(() => vaultForClient(backend, "")).toThrow(VaultError);
  });

  it("rotation bumps version; holders see the new value, old value is gone", () => {
    const backend = new MemoryVaultBackend();
    backend.set("a", "k", "old");
    const vault = vaultForClient(backend, "a");
    expect(vault.get("k")).toEqual({ value: "old", version: 1 });
    backend.rotate("a", "k", "new");
    expect(vault.get("k")).toEqual({ value: "new", version: 2 });
  });

  it("missing-secret errors carry the name, never any value", () => {
    const backend = new MemoryVaultBackend();
    backend.set("a", "other-secret", "SENSITIVE-VALUE-123");
    const vault = vaultForClient(backend, "a");
    try {
      vault.get("absent");
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toContain('"absent"');
      expect((e as Error).message).not.toContain("SENSITIVE-VALUE-123");
    }
  });
});
