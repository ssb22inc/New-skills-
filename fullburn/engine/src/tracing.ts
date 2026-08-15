/** Tracing (Law 11): every LLM call and every decision emits a trace; untraced
 * decisions are bugs. FAIL CLOSED (adversary finding R8): if the trace sink
 * write fails for a decision-class call, the call fails — the engine never
 * proceeds silently untraced. Langfuse is the production sink (H5); the
 * interface is the contract. */

export interface TraceEvent {
  readonly traceId: string;
  readonly clientId: string;
  readonly role: string;
  readonly model: string;
  readonly startedAtMs: number;
  readonly input: unknown;
  readonly output: unknown;
  readonly costUsd: number;
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

/** Emit, converting any sink failure into a hard TraceEmitError. */
export async function emitOrFail(sink: TraceSink, event: TraceEvent): Promise<void> {
  try {
    await sink.emit(event);
  } catch (err) {
    throw new TraceEmitError(
      `trace emission failed — refusing to proceed untraced (Law 11): ${err instanceof Error ? err.message : "unknown sink error"}`,
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
