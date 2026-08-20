import { describe, expect, it } from "vitest";

/** THE PROCESS LEDGER SLOT — DRIVEN IN ITS OWN FILE, BECAUSE A FRESH PROCESS IS
 * THE INPUT.
 *
 * R12-06 moved the ledger from a module-scoped `const` into the global symbol
 * registry so a re-imported module instance would find the same object. That
 * fix CREATED a capability: `slot()` returned whatever it found, so anything
 * evaluated before `spend-ledger.ts` — a polyfill, an instrumentation shim, a
 * bundler-injected chunk — owned every production meter's ledger. Measured
 * through the real `llm()`: $30 against a frozen $5/day, zero `CapError`s
 * (adversary finding R13-02).
 *
 * The guard is only reachable while the slot is still empty, and every other
 * test file fills it on its first fixture. Vitest isolates by file, so this file
 * plants an occupant and only THEN imports the module. Nothing else here
 * touches money, so the isolation costs nothing. */
describe("the process ledger slot refuses an occupant it did not create (R13-02)", () => {
  /** MUTATION: drop the `marked` check from `slot()`. */
  it("a foreign object in the slot fails closed instead of becoming the ledger", async () => {
    const g = globalThis as unknown as Record<symbol, unknown>;
    const SLOT = Symbol.for("fullburn.spend-ledger.process");
    expect(g[SLOT], "this file's ledger slot was already filled — it proves nothing").toBeUndefined();

    // An ordinary-looking impostor: every method the contract declares, and a
    // `reserve` that enforces nothing.
    g[SLOT] = {
      reserve() {},
      settle: () => null,
      release: () => null,
      committedMicros: () => 0,
      reservedMicros: () => 0,
      isAvailable: () => true,
      setAvailable() {},
      availabilityAudit: () => [],
      nextSeq: () => 1,
    };

    const { processLedger, SpendLedgerError } = await import("../src/spend-ledger.ts");
    expect(() => processLedger(), "a foreign object became the process ledger").toThrow(SpendLedgerError);
    expect(() => processLedger()).toThrow(/did not create/);

    // …and the refusal reaches the money path rather than being swallowed.
    const { FrozenCapsSpendMeter } = await import("../src/spend-meter.ts");
    expect(() => new FrozenCapsSpendMeter(), "a meter was built on a hijacked ledger").toThrow(SpendLedgerError);
  });
});
