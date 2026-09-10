import { describe, expect, it } from 'vitest';
import { MetricsRegistry } from './metrics.js';
import { ErrorBudget } from './alerts.js';

describe('P6 — observability primitives', () => {
  it('renders Prometheus text with labels', () => {
    const registry = new MetricsRegistry();
    registry.counter('webhooks_total', 'Webhook deliveries').inc({ status: '200' });
    registry.counter('webhooks_total', 'Webhook deliveries').inc({ status: '200' });
    registry.counter('webhooks_total', 'Webhook deliveries').inc({ status: '401' });
    registry.gauge('queue_depth', 'Jobs waiting').set(7);

    const text = registry.render();
    expect(text).toContain('# TYPE webhooks_total counter');
    expect(text).toContain('webhooks_total{status="200"} 2');
    expect(text).toContain('webhooks_total{status="401"} 1');
    expect(text).toContain('queue_depth 7');
  });

  it('error budget alerts exactly once when breached', async () => {
    const messages: string[] = [];
    const budget = new ErrorBudget({
      name: 'gateway',
      maxFailures: 2,
      windowMs: 60_000,
      alert: {
        send: (m) => {
          messages.push(m);
          return Promise.resolve();
        },
      },
    });

    expect(await budget.recordFailure('boom 1')).toBe(false);
    expect(await budget.recordFailure('boom 2')).toBe(false);
    expect(await budget.recordFailure('boom 3')).toBe(true); // breach
    expect(await budget.recordFailure('boom 4')).toBe(true); // still breached
    expect(messages).toHaveLength(1); // but only one page
    expect(messages[0]).toContain('error budget breached');
  });
});
