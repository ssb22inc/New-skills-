/** Recursively freeze a config object graph. Frozen config + no mutation API is
 * the runtime half of Law 2/18 protection; the commit-time half is the Class-2
 * CI gate (adversary finding R1). */
export function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object") {
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}
