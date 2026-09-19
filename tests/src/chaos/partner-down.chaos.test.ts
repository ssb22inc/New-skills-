/**
 * Chaos drill (BUILD §5.6, monthly): payment partner down 30 minutes →
 * checkout reroutes, ZERO lost orders.
 * Run alone: `pnpm --filter @sycamore/tests chaos:partner-down`
 */
import { describe, expect, it } from 'vitest';
import {
  failoverPayments,
  mockPay,
  PaymentFailoverRefused,
  type PaymentAdapter,
} from '@sycamore/adapters';

function downAdapter(until: () => boolean): PaymentAdapter {
  const down = () => {
    if (until()) throw new Error('partner 503: service unavailable');
  };
  return {
    id: 'primary-psp',
    createLink(input) {
      down();
      return Promise.resolve({ id: `p-${input.orderRef}`, url: `https://p.example/x`, ...input });
    },
    verifyAndParseWebhook() {
      throw new Error('signature unknown');
    },
    requestRefund() {
      down();
      return Promise.resolve({
        state: 'submitted' as const,
        providerRef: 'primary-ref',
        provider: 'primary-psp',
      });
    },
    requestPayout() {
      down();
      return Promise.resolve({
        state: 'submitted' as const,
        providerRef: 'primary-ref',
        provider: 'primary-psp',
      });
    },
    getTransferStatus() {
      return Promise.resolve({
        state: 'unknown' as const,
        providerRef: null,
        provider: 'primary-psp',
      });
    },
  };
}

describe('chaos drill — payment partner down 30 minutes', () => {
  it('every checkout during the outage reroutes; zero lost orders', async () => {
    let minute = 0;
    const outage = () => minute < 30; // partner dead for the first 30 min
    const failover = failoverPayments(downAdapter(outage), mockPay());

    const links = [];
    for (minute = 0; minute < 45; minute++) {
      // One checkout per minute straight through the outage window.
      links.push(
        await failover.createLink({
          orderRef: `order-${minute}`,
          amountMinor: 150_000,
          currency: 'JMD',
        }),
      );
    }
    expect(links).toHaveLength(45); // ZERO lost orders
    expect(failover.reroutes).toBe(30); // outage minutes rerouted
    // After recovery the primary carries traffic again.
    expect(links[44]!.id.startsWith('p-')).toBe(true);
    expect(links[10]!.id.startsWith('p-')).toBe(false);
  });

  /**
   * The other half of the drill, added after the external review of
   * 2026-09-16. Rerouting a CHECKOUT during an outage saves an order.
   * Rerouting a REFUND or a PAYOUT risks paying twice: the primary may
   * have accepted the request and then timed out, and a refund belongs
   * to the provider holding the original capture in any case.
   */
  it('GATE: a refund is never rerouted to the other provider', async () => {
    const other = mockPay();
    const failover = failoverPayments(
      downAdapter(() => true),
      other,
    );
    await expect(
      failover.requestRefund({
        orderRef: 'order-1',
        amountMinor: 150_000,
        currency: 'JMD',
        idempotencyKey: 'refund-1',
      }),
    ).rejects.toBeInstanceOf(PaymentFailoverRefused);
    expect(other.refunded).toHaveLength(0);
    expect(failover.reroutes).toBe(0);
  });

  it('GATE: a payout is never rerouted to the other provider', async () => {
    const other = mockPay();
    const failover = failoverPayments(
      downAdapter(() => true),
      other,
    );
    await expect(
      failover.requestPayout({
        sellerRef: 'seller-1',
        amountMinor: 900_000,
        currency: 'JMD',
        idempotencyKey: 'payout-1',
      }),
    ).rejects.toBeInstanceOf(PaymentFailoverRefused);
    expect(other.paidOut).toHaveLength(0);
    expect(failover.reroutes).toBe(0);
  });
});
