/** WHICH TRANSPORTS NEVER LEAVE THE PROCESS (cross-family finding X2-09).
 *
 * An eval candidate's binding map is servable only through recorded outputs,
 * so the gateway must be able to tell a genuine `RecordedTransport` from any
 * object with a `post()`. The registrar is handed out ONCE — the eval harness
 * claims it at module load, and a second claim gets `null` — so no other
 * module can brand a live transport as recorded. This module has no throws: it
 * sits on the money path, and a refusal belongs to the caller.
 *
 * `[LIMITATION]` a module that imports this before the eval harness can claim
 * the registrar first; the eval harness then refuses to load (fail closed,
 * loud), which is the same bound the process ledger slot has (L31). */
const RECORDED = new WeakSet<object>();
let claimed = false;

export function claimRecordedRegistrar(): ((t: object) => void) | null {
  if (claimed) return null;
  claimed = true;
  return (t: object) => {
    RECORDED.add(t);
  };
}

export function isRecordedTransport(t: unknown): boolean {
  return typeof t === "object" && t !== null && RECORDED.has(t);
}
