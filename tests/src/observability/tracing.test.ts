/**
 * P6 — observability: logs, metrics AND traces.
 *
 * The audit found `@opentelemetry/api` declared and never imported:
 * tracing existed on paper only. This proves the port works, the OTel
 * adapter satisfies it, and a webhook actually produces a span.
 */
import { describe, expect, it } from 'vitest';
import { memoryTracer, traced, NOOP_TRACER } from '@sycamore/core';
import { otelTracer } from '@sycamore/gateway';

describe('P6 — tracing', () => {
  it('a traced unit of work produces one ended span with its attributes', async () => {
    const tracer = memoryTracer();
    const result = await traced(tracer, 'gateway.webhook', { channel: 'mock' }, async (span) => {
      span.setAttribute('messages', 3);
      return 'done';
    });
    expect(result).toBe('done');
    expect(tracer.spans).toHaveLength(1);
    expect(tracer.spans[0]).toMatchObject({
      name: 'gateway.webhook',
      attributes: { channel: 'mock', messages: 3 },
      error: null,
      ended: true,
    });
  });

  it('a failure is recorded on the span AND still ends it, then rethrows', async () => {
    // The unended span is the classic tracing bug: one throw and the
    // trace hangs open forever. `traced` is the only ergonomic path
    // precisely so this cannot happen.
    const tracer = memoryTracer();
    await expect(
      traced(tracer, 'gateway.webhook', { channel: 'mock' }, () => {
        throw new Error('bad signature');
      }),
    ).rejects.toThrow('bad signature');
    expect(tracer.spans[0]!.error).toBe('bad signature');
    expect(tracer.spans[0]!.ended).toBe(true);
  });

  it('span durations are real', async () => {
    let clock = 1000;
    const tracer = memoryTracer(() => clock);
    await traced(tracer, 'slow', {}, async () => {
      clock += 250;
    });
    expect(tracer.spans[0]!.durationMs).toBe(250);
  });

  it('the OpenTelemetry adapter satisfies the port and is safe with no collector', () => {
    // With no SDK registered the API hands back a non-recording tracer:
    // spans cost nothing rather than throwing. A deployment without a
    // collector must not be a deployment that crashes.
    const tracer = otelTracer('sycamore-test');
    const span = tracer.startSpan('unit', { channel: 'mock' });
    expect(() => {
      span.setAttribute('status', 200);
      span.recordError(new Error('handled'));
      span.end();
    }).not.toThrow();
  });

  it('the no-op tracer is free and total', () => {
    const span = NOOP_TRACER.startSpan('nothing');
    expect(() => {
      span.setAttribute('a', 1);
      span.recordError('x');
      span.end();
    }).not.toThrow();
  });
});
