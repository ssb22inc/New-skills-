/** THE MONEY PATH'S ERROR IDENTITIES, STABLE ACROSS MODULE INSTANCES.
 *
 * `MeterUnavailableError` lived in `spend-meter.ts`, then `spend-ledger.ts`,
 * then here — each move forced by import direction. Its home is settled; what
 * was not settled is its IDENTITY.
 *
 * The process ledger is one object shared by every module instance that reaches
 * for it (`Symbol.for` slot, R12-06). An object shared across module registries
 * throws classes belonging to the registry that CREATED it, so a second
 * instance's `instanceof` is false against the same conceptual error. Under a
 * single-fork pool that turned eight money-path locks red with "expected error
 * to be instance of MeterUnavailableError" when the error WAS one (adversary
 * finding R14-05, R13-08's class one level down). In production the same shape
 * appears if a bundler duplicates this module — and `gateway.ts` classifies
 * refusals with `instanceof CapError`, so a duplicated class is a money-path
 * misclassification, not only a test artifact.
 *
 * WHICH CAPABILITY THIS REMOVES: none — this removes an ACCIDENT. The classes
 * resolve through the process-wide symbol registry, so every module instance
 * gets the same constructor and `instanceof` means what it reads as. Said
 * plainly, per the standing rule: it is a correctness fix, not a fence. */

function registered<T extends new (...a: never[]) => Error>(key: string, make: () => T): T {
  const slot = Symbol.for(`fullburn.money-errors.${key}`);
  const g = globalThis as unknown as Record<symbol, T | undefined>;
  const existing = g[slot];
  if (existing !== undefined) return existing;
  const fresh = make();
  g[slot] = fresh;
  return fresh;
}

export const MeterUnavailableError = registered("MeterUnavailableError", () => class MeterUnavailableError extends Error {});
export type MeterUnavailableError = InstanceType<typeof MeterUnavailableError>;
