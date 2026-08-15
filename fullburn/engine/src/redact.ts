/** Secret redaction for error paths and trace payloads (F7; R2-14, R2-27).
 *
 * `llm()` hands a bearer token to a transport it does not control. HTTP clients
 * routinely attach request context — including headers — to the errors they
 * throw, so any error crossing back out of the transport may carry the secret
 * into a log. Trace payloads are the same surface: §10.2 names Langfuse traces
 * explicitly as a place a token must never appear.
 *
 * Extraction is hostile-input-safe (R2-27): a thrown value may define a
 * `message` getter or a `toString` that itself throws, or that returns the raw
 * secret only when called a second time. Everything below tolerates that and
 * falls back to a constant rather than letting the original value escape. */

const REDACTED = "[redacted]";
const UNPRINTABLE = "[unprintable error]";

export function redactText(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const s of secrets) {
    if (typeof s === "string" && s.length > 0) out = out.split(s).join(REDACTED);
  }
  return out;
}

/** Best-effort, exception-proof description of an unknown thrown value. */
function describe(err: unknown): string {
  try {
    if (err instanceof Error) {
      const name = typeof err.name === "string" ? err.name : "Error";
      const message = typeof err.message === "string" ? err.message : "";
      return `${name}: ${message}`;
    }
    if (typeof err === "string") return err;
    if (typeof err === "number" || typeof err === "boolean" || err === null || err === undefined) {
      return String(err);
    }
    return JSON.stringify(err) ?? UNPRINTABLE;
  } catch {
    return UNPRINTABLE;
  }
}

/** Returns an Error whose message and stack cannot contain any known secret.
 * The original error is never rethrown as-is: its stack, its `cause` and any
 * custom properties are all leak surfaces, so none of them are carried. */
export function redactError(err: unknown, secrets: readonly string[], ErrorClass: new (m: string) => Error): Error {
  const safe = new ErrorClass(redactText(describe(err), secrets));
  safe.stack = `${safe.name}: ${safe.message}`;
  return safe;
}

/** Deep-redacts a value destined for a trace sink. Structure is preserved so a
 * trace stays useful; any string containing a secret is scrubbed. Cycles,
 * getters that throw, and exotic objects degrade to a constant rather than
 * throwing inside the tracing path. */
export function redactValue(value: unknown, secrets: readonly string[], depth = 0): unknown {
  if (secrets.length === 0 || value === null || value === undefined) return value;
  if (depth > 8) return REDACTED;
  try {
    if (typeof value === "string") return redactText(value, secrets);
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (Array.isArray(value)) return value.map((v) => redactValue(v, secrets, depth + 1));
    if (typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(value as Record<string, unknown>)) {
        out[redactText(key, secrets)] = redactValue((value as Record<string, unknown>)[key], secrets, depth + 1);
      }
      return out;
    }
    // Functions, symbols, bigints: not trace payload material.
    return REDACTED;
  } catch {
    return REDACTED;
  }
}
