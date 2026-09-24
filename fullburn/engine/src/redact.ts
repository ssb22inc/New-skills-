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

/** Does a value carry a secret ANYWHERE — any depth, any key, any error
 * field, binary decoded? `redactValue` stops at MAX_DEPTH with a marker, so
 * comparing two of its serialisations could not see a credential nested below
 * it (cross-family finding X2-06, 2026-09-24). This walk has no depth limit;
 * it has a cycle guard and a size guard, and it errs towards "yes". */
export function containsSecret(value: unknown, secrets: readonly string[], limit = 200_000): boolean {
  const live = secrets.filter((s) => typeof s === "string" && s.length > 0);
  if (live.length === 0) return false;
  const seen = new Set<object>();
  let visited = 0;
  const hit = (text: string): boolean => live.some((s) => text.includes(s));
  const walk = (v: unknown): boolean => {
    if (++visited > limit) return true; // too large to clear: refuse
    if (typeof v === "string") return hit(v);
    if (typeof v === "number" || typeof v === "boolean" || v === null || v === undefined || typeof v === "bigint") return false;
    if (typeof v === "symbol") return hit(String(v.description ?? ""));
    if (typeof v === "function") return hit(String(v));
    if (typeof v !== "object") return true;
    if (seen.has(v)) return false;
    seen.add(v);
    if (v instanceof Uint8Array) return hit(decodeBinary(v));
    if (ArrayBuffer.isView(v)) return hit(decodeBinary(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)));
    if (v instanceof ArrayBuffer) return hit(decodeBinary(new Uint8Array(v)));
    if (v instanceof Error) {
      return hit(String(v.name)) || hit(String(v.message)) || hit(String(v.stack ?? "")) || walk((v as { cause?: unknown }).cause) || Object.getOwnPropertyNames(v).some((k) => walk((v as unknown as Record<string, unknown>)[k]));
    }
    if (v instanceof Map) return [...v.entries()].some(([k, x]) => walk(k) || walk(x));
    if (v instanceof Set) return [...v].some(walk);
    if (v instanceof Date) return false;
    if (Array.isArray(v)) return v.some(walk);
    for (const k of Object.getOwnPropertyNames(v)) {
      if (hit(k)) return true;
      let x: unknown;
      try {
        x = (v as Record<string, unknown>)[k];
      } catch {
        return true; // a throwing getter is not clearable
      }
      if (walk(x)) return true;
    }
    return false;
  };
  return walk(value);
}

/** A money error, REBUILT with its class and a redacted message and nothing
 * else (cross-family finding X2-07): `redactInPlace` returned the thrower's
 * own object, so its name, cause and any custom property crossed unredacted,
 * and a frozen error came back untouched. The class is what a caller
 * discriminates on; it is the only thing carried. */
export function redactMoneyError<E extends Error>(err: E, secrets: readonly string[]): E {
  const Ctor = err.constructor as new (m: string) => E;
  let message = "";
  try {
    message = typeof err.message === "string" ? err.message : "";
  } catch {
    message = UNPRINTABLE;
  }
  let safe: E;
  try {
    safe = new Ctor(redactText(message, secrets));
  } catch {
    safe = new Error(redactText(message, secrets)) as E;
  }
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
      // The name too (X-08): `err.name` is any string the thrower chose.
      return { name: redactText(typeof obj.name === "string" ? obj.name : "Error", secrets), message: redactText(typeof obj.message === "string" ? obj.message : "", secrets) };
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
