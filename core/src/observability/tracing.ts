/**
 * Tracing, as a PORT (BUILD §2 — core never imports a vendor SDK).
 *
 * The audit found `@opentelemetry/api` declared in the gateway and
 * imported nowhere: traces were a claim, not a capability. This is the
 * capability. Core describes spans; an adapter decides whether they
 * become OpenTelemetry, a log line, or nothing at all.
 *
 * A span here is deliberately thin — name, attributes, ok/failed, and a
 * duration. That is what a founder debugging a slow booking at 11pm
 * actually needs, and anything richer is a moving part nobody asked for
 * (Constitution §7).
 */

export type SpanAttributes = Record<string, string | number | boolean>;

export interface Span {
  setAttribute(key: string, value: string | number | boolean): void;
  /** Record a failure on this span; the span still has to be ended. */
  recordError(error: unknown): void;
  end(): void;
}

export interface Tracer {
  startSpan(name: string, attributes?: SpanAttributes): Span;
}

/** Does nothing, costs nothing — the default when no adapter is wired. */
export const NOOP_TRACER: Tracer = {
  startSpan: () => ({
    setAttribute: () => {},
    recordError: () => {},
    end: () => {},
  }),
};

export interface RecordedSpan {
  name: string;
  attributes: SpanAttributes;
  error: string | null;
  ended: boolean;
  durationMs: number;
}

/**
 * An in-memory tracer for tests and for the founder's own eyes in dev:
 * the spans are inspectable rather than shipped somewhere. This is also
 * what makes tracing testable at all without standing up a collector.
 */
export function memoryTracer(now: () => number = () => Date.now()): Tracer & {
  readonly spans: RecordedSpan[];
} {
  const spans: RecordedSpan[] = [];
  return {
    spans,
    startSpan(name, attributes = {}) {
      const startedAt = now();
      const record: RecordedSpan = {
        name,
        attributes: { ...attributes },
        error: null,
        ended: false,
        durationMs: 0,
      };
      spans.push(record);
      return {
        setAttribute(key, value) {
          record.attributes[key] = value;
        },
        recordError(error) {
          record.error = error instanceof Error ? error.message : String(error);
        },
        end() {
          record.ended = true;
          record.durationMs = now() - startedAt;
        },
      };
    },
  };
}

/**
 * Run work inside a span, ending it exactly once whatever happens. The
 * unended span is the classic tracing bug; making this the only
 * ergonomic way to trace is how it stays fixed.
 */
export async function traced<T>(
  tracer: Tracer,
  name: string,
  attributes: SpanAttributes,
  work: (span: Span) => Promise<T>,
): Promise<T> {
  const span = tracer.startSpan(name, attributes);
  try {
    return await work(span);
  } catch (err) {
    span.recordError(err);
    throw err;
  } finally {
    span.end();
  }
}
