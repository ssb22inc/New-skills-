/** The production trace sink (cross-family finding X5-12, 2026-10-06): only
 * MemoryTraceSink existed, so "every decision traced in Langfuse" (Law 9) had
 * no path to Langfuse at all.
 *
 * It posts each event to Langfuse's public ingestion API
 * (`<host>/api/public/ingestion`, HTTP basic auth with the project's public and
 * secret keys) as one `trace-create`. The TraceSink contract is FAIL CLOSED —
 * fire-and-forget is forbidden — so a network error, a non-2xx, or a 207 whose
 * body reports any per-event error throws, and `emitOrFail` turns that into a
 * TraceEmitError: the call is not a success until its trace landed.
 *
 * Events arrive already redacted by `llm()`; this sink adds nothing secret but
 * its own credentials, which travel only in the Authorization header and never
 * in an error message.
 *
 * NOT VERIFIED HERE, stated: delivery into a real Langfuse project (AC1-live,
 * H5); these tests drive it against a stubbed fetch. */
import type { TraceEvent, TraceSink } from "./tracing.ts";
import type { FetchLike } from "./gateway-http.ts";

export class LangfuseSinkError extends Error {}

export interface LangfuseSinkOptions {
  readonly host: string;
  readonly publicKey: string;
  readonly secretKey: string;
  readonly fetchImpl?: FetchLike;
  readonly now?: () => number;
  readonly newId?: () => string;
}

export class LangfuseTraceSink implements TraceSink {
  readonly #endpoint: string;
  readonly #auth: string;
  readonly #fetch: FetchLike;
  readonly #now: () => number;
  readonly #newId: () => string;

  constructor(opts: LangfuseSinkOptions) {
    let host: URL;
    try {
      host = new URL(opts.host);
    } catch {
      throw new LangfuseSinkError("Langfuse host is not a URL");
    }
    if (host.protocol !== "https:") throw new LangfuseSinkError("Langfuse is reached over https only");
    if (!opts.publicKey || !opts.secretKey) throw new LangfuseSinkError("Langfuse sink requires a public and a secret key");
    const f = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike | undefined);
    if (typeof f !== "function") throw new LangfuseSinkError("no fetch implementation on this runtime");
    this.#endpoint = new URL("api/public/ingestion", host.href.endsWith("/") ? host.href : `${host.href}/`).toString();
    this.#auth = `Basic ${btoa(`${opts.publicKey}:${opts.secretKey}`)}`;
    this.#fetch = f;
    this.#now = opts.now ?? (() => Date.now());
    this.#newId = opts.newId ?? (() => crypto.randomUUID());
    Object.freeze(this);
  }

  async emit(event: TraceEvent): Promise<void> {
    const timestamp = new Date(this.#now()).toISOString();
    const batch = [
      {
        id: this.#newId(),
        type: "trace-create",
        timestamp,
        body: {
          id: event.traceId,
          name: event.role,
          userId: event.clientId,
          timestamp: new Date(event.startedAtMs).toISOString(),
          input: event.input,
          output: event.output,
          metadata: { model: event.model, costUsd: event.costUsd, outcome: event.outcome, errorMessage: event.errorMessage ?? null },
          tags: [event.outcome],
        },
      },
    ];
    let status: number;
    let text: string;
    try {
      const res = await this.#fetch(this.#endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: this.#auth },
        body: JSON.stringify({ batch }),
      });
      status = res.status;
      text = await res.text();
    } catch {
      throw new LangfuseSinkError("Langfuse ingestion request failed (network)");
    }
    if (status < 200 || status > 299) throw new LangfuseSinkError(`Langfuse ingestion returned HTTP ${status}`);
    if (status === 207) {
      let errors: unknown = null;
      try {
        errors = (JSON.parse(text) as { errors?: unknown }).errors;
      } catch {
        throw new LangfuseSinkError("Langfuse ingestion returned an unreadable multi-status body");
      }
      if (!Array.isArray(errors) || errors.length > 0) throw new LangfuseSinkError("Langfuse ingestion rejected the trace event");
    }
  }
}
