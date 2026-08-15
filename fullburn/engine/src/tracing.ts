/** Tracing (Law 11): every LLM call and every decision emits a trace; untraced
 * decisions are bugs. FAIL CLOSED (R8): if the trace sink write fails for a
 * successful call, the call fails — the engine never proceeds on an untraced
 * decision. FAILURES ARE TRACED TOO (adversary finding F8): a call that reaches
 * the provider and then errors is exactly the event an operator needs, and it
 * carries a real charge. Langfuse is the production sink (H5); the interface is
 * the contract. */

export type TraceOutcome = "ok" | "error";

export interface TraceEvent {
  readonly traceId: string;
  readonly clientId: string;
  readonly role: string;
  readonly model: string;
  readonly startedAtMs: number;
  readonly input: unknown;
  readonly output: unknown;
  readonly costUsd: number;
  readonly outcome: TraceOutcome;
  /** Redacted failure summary when outcome is "error". */
  readonly errorMessage?: string;
}

export interface TraceSink {
  /** Must throw on delivery failure — fire-and-forget is forbidden. */
  emit(event: TraceEvent): Promise<void>;
}

export class TraceEmitError extends Error {}

export class TraceContext {
  readonly traceId: string;
  readonly clientId: string;

  constructor(traceId: string, clientId: string) {
    if (!traceId || !clientId) throw new TraceEmitError("trace context requires traceId and clientId");
    this.traceId = traceId;
    this.clientId = clientId;
  }
}

/** Emit, converting any sink failure into a hard TraceEmitError. The sink's own
 * error text is never interpolated verbatim — callers pass already-redacted
 * detail, and the sink never sees secrets in the first place. */
export async function emitOrFail(sink: TraceSink, event: TraceEvent): Promise<void> {
  try {
    await sink.emit(event);
  } catch (err) {
    throw new TraceEmitError(
      `trace emission failed — refusing to proceed untraced (Law 11): ${err instanceof Error ? err.name : "unknown sink error"}`,
    );
  }
}

/** Test sink capturing events; can simulate outage. */
export class MemoryTraceSink implements TraceSink {
  events: TraceEvent[] = [];
  #failing = false;

  setFailing(v: boolean): void {
    this.#failing = v;
  }

  async emit(event: TraceEvent): Promise<void> {
    if (this.#failing) throw new Error("sink outage");
    this.events.push(event);
  }
}
