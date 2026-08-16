/** Secret redaction for error paths and trace payloads (F7; R2-14, R2-27; and
 * adversary findings A1, A2, C2).
 *
 * `llm()` hands a bearer token to a transport it does not control. HTTP clients
 * routinely attach request context — including headers — to the errors they
 * throw, so any error crossing back out may carry the secret into a log. Trace
 * payloads are the same surface: §10.2 names Langfuse traces explicitly as a
 * place a token must never appear.
 *
 * Two lessons are encoded here from things that got through:
 *  - A STRING SCAN IS NOT ENOUGH (A2). A `Uint8Array` response body serialises
 *    to `{"0":123,"1":34,…}`, which contains no secret substring but decodes
 *    byte-for-byte back to the authorization header. Binary is decoded and
 *    checked, never passed through as a number map.
 *  - STRUCTURE MUST SURVIVE (C2). Map, Set, Date and Error all serialised to
 *    `{}`, silently destroying the payload an operator needs, and an own
 *    `__proto__` key was dropped from the trace while being installed as the
 *    result's prototype. Each shape now has an explicit representation. */

const REDACTED = "[redacted]";
const UNPRINTABLE = "[unprintable error]";
const MAX_DEPTH = 8;

export function redactText(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const s of secrets) {
    if (typeof s === "string" && s.length > 0) out = out.split(s).join(REDACTED);
  }
  return out;
}

/** Best-effort, exception-proof description of an unknown thrown value. A
 * hostile value may define a `message` getter or `toString` that throws, or
 * that returns the secret only on a second call. */
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
 * The original is never rethrown as-is: its stack, `cause` and custom
 * properties are all leak surfaces, so none of them are carried. */
export function redactError(err: unknown, secrets: readonly string[], ErrorClass: new (m: string) => Error): Error {
  const safe = new ErrorClass(redactText(describe(err), secrets));
  safe.stack = `${safe.name}: ${safe.message}`;
  return safe;
}

/** Rewrites an error's message in place-safe fashion, preserving its class.
 * Used for errors the caller must still be able to discriminate — a CapError
 * has to stay a CapError — whose message nonetheless came from a collaborator
 * we do not control (adversary finding A1: a meter's own error text was written
 * verbatim into the trace and thrown to the caller unredacted). */
export function redactInPlace<E extends Error>(err: E, secrets: readonly string[]): E {
  try {
    const message = redactText(typeof err.message === "string" ? err.message : "", secrets);
    Object.defineProperty(err, "message", { value: message, enumerable: false, writable: true, configurable: true });
    err.stack = `${err.name}: ${message}`;
  } catch {
    // A frozen or hostile error object: fall through with what we have rather
    // than throwing from the redaction path itself.
  }
  return err;
}

function decodeBinary(view: Uint8Array): string {
  let s = "";
  for (const b of view) s += String.fromCharCode(b);
  return s;
}

/** Deep-redacts a value destined for a trace sink. Structure is preserved so a
 * trace stays useful; anything that could carry a secret is scrubbed. Cycles,
 * throwing getters and exotic objects degrade to a marker rather than throwing
 * inside the tracing path. */
export function redactValue(value: unknown, secrets: readonly string[], depth = 0, seen?: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;
  if (depth > MAX_DEPTH) return "[depth limit]";
  const visited = seen ?? new WeakSet<object>();

  try {
    if (typeof value === "string") return redactText(value, secrets);
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "bigint") return `${value}n`;
    if (typeof value === "function" || typeof value === "symbol") return `[${typeof value}]`;

    const obj = value as object;
    if (visited.has(obj)) return "[circular]";
    visited.add(obj);

    // Binary: decode and check, never emit a raw byte map (A2).
    if (ArrayBuffer.isView(obj) || obj instanceof ArrayBuffer) {
      const view = obj instanceof ArrayBuffer ? new Uint8Array(obj) : new Uint8Array((obj as ArrayBufferView).buffer);
      const decoded = decodeBinary(view);
      const scrubbed = redactText(decoded, secrets);
      return scrubbed === decoded ? `[binary ${view.byteLength} bytes]` : `[redacted binary ${view.byteLength} bytes]`;
    }

    if (obj instanceof Date) return Number.isNaN(obj.getTime()) ? "[invalid date]" : obj.toISOString();
    if (obj instanceof Error) {
      return { name: obj.name, message: redactText(typeof obj.message === "string" ? obj.message : "", secrets) };
    }
    if (obj instanceof Map) {
      return {
        __type: "Map",
        entries: [...obj.entries()].map(([k, v]) => [
          redactValue(k, secrets, depth + 1, visited),
          redactValue(v, secrets, depth + 1, visited),
        ]),
      };
    }
    if (obj instanceof Set) {
      return { __type: "Set", values: [...obj.values()].map((v) => redactValue(v, secrets, depth + 1, visited)) };
    }
    if (Array.isArray(obj)) return obj.map((v) => redactValue(v, secrets, depth + 1, visited));

    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      // defineProperty, not assignment: an own "__proto__" key would otherwise
      // be swallowed — dropped from the trace while silently reparenting the
      // result object (C2).
      Object.defineProperty(out, redactText(key, secrets), {
        value: redactValue((obj as Record<string, unknown>)[key], secrets, depth + 1, visited),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return out;
  } catch {
    return REDACTED;
  }
}
