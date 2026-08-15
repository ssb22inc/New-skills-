/** Secret redaction for error paths (adversary finding F7).
 *
 * `llm()` hands a bearer token to a transport it does not control. HTTP clients
 * routinely attach request context — including headers — to the errors they
 * throw, so any error crossing back out of the transport may carry the secret
 * into a log. Every error leaving the gateway is passed through here first.
 * §10.2: a token appearing in code, logs, or traces is a critical defect. */

const REDACTED = "[redacted]";

export function redactText(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const s of secrets) {
    if (typeof s === "string" && s.length > 0) out = out.split(s).join(REDACTED);
  }
  return out;
}

/** Returns an Error whose message and stack cannot contain any known secret.
 * The original error is never rethrown as-is: its stack is a leak surface too. */
export function redactError(err: unknown, secrets: readonly string[], ErrorClass: new (m: string) => Error): Error {
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  const safe = new ErrorClass(redactText(raw, secrets));
  // Drop the original stack entirely rather than redact it line by line — the
  // stack can embed argument values in some runtimes.
  safe.stack = `${safe.name}: ${safe.message}`;
  return safe;
}
