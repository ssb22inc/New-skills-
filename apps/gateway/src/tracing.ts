import { SpanStatusCode, trace } from '@opentelemetry/api';
import type { Span, SpanAttributes, Tracer } from '@sycamore/core';

/**
 * The OpenTelemetry ADAPTER for core's tracing port.
 *
 * Core describes spans in its own vocabulary; this is the only file in
 * the repo that knows OpenTelemetry exists. Swapping vendors — or
 * dropping tracing entirely — is deleting this file and passing a
 * different Tracer, which is the whole reason for the port.
 *
 * With no OTel SDK registered in the process, `@opentelemetry/api`
 * hands back a non-recording tracer: spans become free no-ops rather
 * than errors, so a deployment without a collector simply costs nothing.
 */
export function otelTracer(serviceName = 'sycamore-gateway'): Tracer {
  const tracer = trace.getTracer(serviceName);
  return {
    startSpan(name: string, attributes: SpanAttributes = {}): Span {
      const span = tracer.startSpan(name, { attributes });
      return {
        setAttribute(key, value) {
          span.setAttribute(key, value);
        },
        recordError(error: unknown) {
          const err = error instanceof Error ? error : new Error(String(error));
          span.recordException(err);
          span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        },
        end() {
          span.end();
        },
      };
    },
  };
}
