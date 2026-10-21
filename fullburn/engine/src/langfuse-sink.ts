/** The production trace sink (cross-family finding X5-12, 2026-10-06): only
 * MemoryTraceSink existed, so "every decision traced in Langfuse" (Law 9) had
 * no path to Langfuse at all.
 *
 * OPENTELEMETRY, NOT THE LEGACY INGESTION API (2026-10-21). Langfuse Cloud
 * sunsets `/api/public/ingestion` on 2026-11-16, and data sent there was not
 * readable through the v2 observations API during the live check (L72). Each
 * event is now one OTLP/HTTP JSON span posted to `<host>/api/public/otel/v1/
 * traces` with HTTP basic auth (public key, secret key) and
 * `x-langfuse-ingestion-version: 4`, which Langfuse documents as the real-time
 * path. The span is a ROOT `generation` observation: Langfuse requires a root
 * span, and each decision is its own span with a fresh span id, so two
 * decisions under one trace never overwrite each other (X7-11).
 *
 * The TraceSink contract is FAIL CLOSED — fire-and-forget is forbidden — so a
 * network error, a non-2xx, an unreadable body, or a reply that reports any
 * rejected span throws, and `emitOrFail` turns that into a TraceEmitError.
 * NARROWING, stated: OTLP acknowledges a request, not each span by id, so the
 * X7-10 per-event acknowledgement is now "no rejected spans in a 2xx"; the
 * live check reads the trace back to prove delivery.
 *
 * Events arrive already redacted by `llm()`; this sink adds nothing secret but
 * its own credentials, which travel only in the Authorization header and never
 * in an error message. */
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
    this.#endpoint = new URL("api/public/otel/v1/traces", host.href.endsWith("/") ? host.href : `${host.href}/`).toString();
    this.#auth = `Basic ${btoa(`${opts.publicKey}:${opts.secretKey}`)}`;
    this.#fetch = f;
    this.#now = opts.now ?? (() => Date.now());
    this.#newId = opts.newId ?? randomSpanId;
    Object.freeze(this);
  }

  async emit(event: TraceEvent): Promise<void> {
    /** REMOTE IDS ARE NAMESPACED BY CLIENT AND BY DECISION (cross-family
     * finding X7-11, 2026-10-09). Two clients' contexts with the same
     * caller-chosen trace id must never meet in one remote trace. The OTel
     * trace id is derived from the client AND the trace id (`otelTraceId`), and
     * each decision is its own span with a fresh span id. */
    const traceIdHex = await otelTraceId(event.clientId, event.traceId);
    const spanId = this.#newId();
    if (!/^[0-9a-f]{16}$/.test(spanId)) throw new LangfuseSinkError("span id must be 16 lowercase hex characters");
    const startNs = `${BigInt(Math.floor(event.startedAtMs)) * 1_000_000n}`;
    const endNs = `${BigInt(Math.floor(this.#now())) * 1_000_000n}`;
    const str = (key: string, value: string) => ({ key, value: { stringValue: value } });
    const attributes = [
      str("langfuse.trace.name", event.role),
      str("langfuse.user.id", event.clientId),
      str("user.id", event.clientId),
      str("langfuse.trace.metadata.traceId", event.traceId),
      str("langfuse.observation.type", "generation"),
      str("langfuse.observation.model.name", event.model),
      str("langfuse.observation.input", JSON.stringify(event.input ?? null)),
      str("langfuse.observation.output", JSON.stringify(event.output ?? null)),
      str("langfuse.observation.level", event.outcome === "error" ? "ERROR" : "DEFAULT"),
      str("langfuse.observation.metadata.outcome", event.outcome),
      str("langfuse.observation.metadata.costUsd", String(event.costUsd)),
    ];
    if (event.errorMessage) attributes.push(str("langfuse.observation.status_message", event.errorMessage));
    const body = {
      resourceSpans: [
        {
          resource: { attributes: [str("service.name", "fullburn-engine")] },
          scopeSpans: [
            {
              scope: { name: "fullburn" },
              spans: [
                {
                  traceId: traceIdHex,
                  spanId,
                  name: event.role,
                  kind: 1,
                  startTimeUnixNano: startNs,
                  endTimeUnixNano: endNs,
                  attributes,
                  status: event.outcome === "error" ? { code: 2, message: event.errorMessage ?? "error" } : { code: 1 },
                },
              ],
            },
          ],
        },
      ],
    };
    let status: number;
    let text: string;
    try {
      const res = await this.#fetch(this.#endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: this.#auth, "x-langfuse-ingestion-version": "4" },
        body: JSON.stringify(body),
      });
      status = res.status;
      text = await res.text();
    } catch {
      throw new LangfuseSinkError("Langfuse ingestion request failed (network)");
    }
    if (status < 200 || status > 299) throw new LangfuseSinkError(`Langfuse ingestion returned HTTP ${status}`);
    /** NO REJECTED SPAN (X7-10, as OTLP allows). An empty body is a valid
     * OTLP success; anything else must be a JSON object, and a
     * `partialSuccess` reporting rejected spans fails the trace. */
    if (text.trim() === "") return;
    let ack: { partialSuccess?: { rejectedSpans?: unknown } };
    try {
      ack = JSON.parse(text) as { partialSuccess?: { rejectedSpans?: unknown } };
    } catch {
      throw new LangfuseSinkError("Langfuse ingestion returned an unreadable body");
    }
    if (typeof ack !== "object" || ack === null || Array.isArray(ack)) throw new LangfuseSinkError("Langfuse ingestion returned a body that is not a JSON object");
    const rejected = Number(ack.partialSuccess?.rejectedSpans ?? 0);
    if (!Number.isFinite(rejected) || rejected !== 0) throw new LangfuseSinkError("Langfuse ingestion rejected the trace span");
  }
}

/** The remote trace id: client and trace, each percent-encoded, joined by ":".
 * encodeURIComponent always encodes ":", so the join is injective, and the id
 * travels in a URL path with no encoded slash. */
export function langfuseTraceId(clientId: string, traceId: string): string {
  return `${encodeURIComponent(clientId)}:${encodeURIComponent(traceId)}`;
}

/** The OTel trace id (32 hex) for a client's trace: the first 16 bytes of
 * SHA-256 over `langfuseTraceId(client, trace)`. Deterministic, so every
 * decision under one TraceContext shares a trace; namespaced by client, so two
 * clients' identical caller-chosen ids never share one (X7-11). */
export async function otelTraceId(clientId: string, traceId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(langfuseTraceId(clientId, traceId)));
  return [...new Uint8Array(digest).slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomSpanId(): string {
  return [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
