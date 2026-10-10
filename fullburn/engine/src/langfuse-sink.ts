/** The production trace sink (cross-family finding X5-12, 2026-10-06): only
 * MemoryTraceSink existed, so "every decision traced in Langfuse" (Law 9) had
 * no path to Langfuse at all.
 *
 * It posts each event to Langfuse's public ingestion API
 * (`<host>/api/public/ingestion`, HTTP basic auth with the project's public and
 * secret keys) as a client-namespaced `trace-create` plus one
 * `generation-create` for the decision (X7-11). The TraceSink contract is FAIL CLOSED —
 * fire-and-forget is forbidden — so a network error, a non-2xx, a body that
 * reports any per-event error, or one that does not acknowledge exactly the
 * events sent (X7-10) throws, and `emitOrFail` turns that into a
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
    /** REMOTE IDS ARE NAMESPACED BY CLIENT AND BY DECISION (cross-family
     * finding X7-11, 2026-10-09). `event.traceId` went out as the Langfuse
     * trace id and `trace-create` upserts by id, so two clients' contexts with
     * the same caller-chosen id merged into, or overwrote, one remote trace.
     * The capability removed: one tenant's decision landing in another
     * tenant's trace. The trace id is the client and the trace id, each
     * percent-encoded so the separator cannot be forged; the decision itself
     * is its own `generation-create` with a fresh id, so two decisions under
     * one trace never overwrite each other's input or output. */
    const remoteTraceId = `${encodeURIComponent(event.clientId)}/${encodeURIComponent(event.traceId)}`;
    const batch = [
      {
        id: this.#newId(),
        type: "trace-create",
        timestamp,
        body: { id: remoteTraceId, name: event.role, userId: event.clientId, metadata: { traceId: event.traceId } },
      },
      {
        id: this.#newId(),
        type: "generation-create",
        timestamp,
        body: {
          id: this.#newId(),
          traceId: remoteTraceId,
          name: event.role,
          model: event.model,
          startTime: new Date(event.startedAtMs).toISOString(),
          input: event.input,
          output: event.output,
          level: event.outcome === "error" ? "ERROR" : "DEFAULT",
          statusMessage: event.errorMessage ?? null,
          metadata: { costUsd: event.costUsd, outcome: event.outcome },
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
    /** A POSITIVE ACKNOWLEDGEMENT OF EVERY EVENT SENT (cross-family finding
     * X7-10). Only a 207's `errors` was read, and any other 2xx was accepted
     * unread, so a reply acknowledging nothing satisfied the fail-closed
     * boundary. The ingestion endpoint answers with `successes` and `errors`;
     * the call is traced only when `errors` is empty and `successes` names
     * each submitted event id exactly once and nothing else. */
    let ack: { successes?: unknown; errors?: unknown };
    try {
      ack = JSON.parse(text) as { successes?: unknown; errors?: unknown };
    } catch {
      throw new LangfuseSinkError("Langfuse ingestion returned an unreadable multi-status body");
    }
    const errors = ack?.errors;
    if (!Array.isArray(errors) || errors.length > 0) throw new LangfuseSinkError("Langfuse ingestion rejected the trace event");
    const acked = Array.isArray(ack.successes) ? ack.successes.map((x: unknown) => (x as { id?: unknown } | null)?.id) : [];
    const sent = batch.map((e) => e.id);
    if (acked.length !== sent.length || !sent.every((id) => acked.filter((a) => a === id).length === 1)) {
      throw new LangfuseSinkError("Langfuse ingestion did not acknowledge exactly the events sent");
    }
  }
}
