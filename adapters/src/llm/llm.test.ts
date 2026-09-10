import { describe, expect, it } from 'vitest';
import { createLlmRouter, LlmRouterError } from './router.js';
import { assertPiiRoutingAllowed, PiiRoutingViolation } from './policy.js';
import { mockProvider } from './providers/mock.js';
import type { LlmRequest, RoutingTable } from './types.js';

function request(overrides: Partial<LlmRequest> = {}): LlmRequest {
  return { task: 'routine-reply', prompt: 'hello', containsPii: false, ...overrides };
}

/** cheap: no DPA; strong: DPA signed — mirrors the real vendor landscape. */
function fixture() {
  const cheap = mockProvider({ id: 'cheap' });
  const strong = mockProvider({ id: 'strong' });
  const routes: RoutingTable = {
    'routine-reply': { primary: 'cheap', fallbacks: ['strong'] },
    'intent-detection': { primary: 'cheap', fallbacks: ['strong'] },
    'money-math': { primary: 'strong', fallbacks: [] },
    compliance: { primary: 'strong', fallbacks: [] },
    creative: { primary: 'cheap', fallbacks: [] },
  };
  const vendors = (c = cheap, s = strong) => [
    { provider: c, dpaSigned: false },
    { provider: s, dpaSigned: true },
  ];
  return { cheap, strong, routes, vendors };
}

describe('P4 — LLM router (gate)', () => {
  describe('PII policy is a hard-coded check, not a prompt', () => {
    it('GATE: a PII-flagged call to a non-DPA provider throws', () => {
      const { cheap } = fixture();
      expect(() =>
        assertPiiRoutingAllowed(request({ containsPii: true }), {
          provider: cheap,
          dpaSigned: false,
        }),
      ).toThrowError(PiiRoutingViolation);
    });

    it('a PII request on a route with no DPA-signed provider dies, never falls through', async () => {
      const { cheap } = fixture();
      const cheapOnly = { primary: 'cheap', fallbacks: [] };
      const router = createLlmRouter([{ provider: cheap, dpaSigned: false }], {
        'routine-reply': cheapOnly,
        'intent-detection': cheapOnly,
        'money-math': cheapOnly,
        compliance: cheapOnly,
        creative: cheapOnly,
      });
      await expect(
        router.complete(request({ task: 'creative', containsPii: true })),
      ).rejects.toThrowError(PiiRoutingViolation);
      expect(cheap.calls).toHaveLength(0); // the vendor was never contacted
    });

    it('a PII request routes past the non-DPA primary to the DPA-signed provider', async () => {
      const { cheap, strong, routes, vendors } = fixture();
      const router = createLlmRouter(vendors(), routes);
      const res = await router.complete(request({ containsPii: true }));
      expect(res.providerId).toBe('strong');
      expect(cheap.calls).toHaveLength(0); // never even attempted
      expect(strong.calls[0]?.containsPii).toBe(true);
    });

    it('a non-PII request may use the non-DPA cheap provider', async () => {
      const { routes, vendors } = fixture();
      const router = createLlmRouter(vendors(), routes);
      const res = await router.complete(request());
      expect(res.providerId).toBe('cheap');
    });
  });

  describe('routing table by task type', () => {
    it('routine work goes cheap; money-math and compliance go strong', async () => {
      const { routes, vendors } = fixture();
      const router = createLlmRouter(vendors(), routes);
      expect((await router.complete(request({ task: 'routine-reply' }))).providerId).toBe('cheap');
      expect((await router.complete(request({ task: 'money-math' }))).providerId).toBe('strong');
      expect((await router.complete(request({ task: 'compliance' }))).providerId).toBe('strong');
    });

    it('a routing table naming an unknown provider is rejected at construction', () => {
      const { routes, vendors } = fixture();
      expect(() =>
        createLlmRouter(vendors(), {
          ...routes,
          creative: { primary: 'nonexistent', fallbacks: [] },
        }),
      ).toThrowError(/unknown provider "nonexistent"/);
    });
  });

  describe('failover', () => {
    it('GATE: when the primary errors, the fallback answers', async () => {
      const { strong, routes } = fixture();
      const flaky = mockProvider({ id: 'cheap', alwaysFail: true });
      const router = createLlmRouter(
        [
          { provider: flaky, dpaSigned: false },
          { provider: strong, dpaSigned: true },
        ],
        routes,
      );
      const res = await router.complete(request());
      expect(res.providerId).toBe('strong');
      expect(flaky.calls).toHaveLength(1); // primary was attempted first
    });

    it('recovers when the primary only fails transiently', async () => {
      const { strong, routes } = fixture();
      const flaky = mockProvider({ id: 'cheap', failFirst: 1 });
      const router = createLlmRouter(
        [
          { provider: flaky, dpaSigned: false },
          { provider: strong, dpaSigned: true },
        ],
        routes,
      );
      expect((await router.complete(request())).providerId).toBe('strong');
      expect((await router.complete(request())).providerId).toBe('cheap');
    });

    it('when every provider fails, the error names each attempt', async () => {
      const { routes } = fixture();
      const badCheap = mockProvider({ id: 'cheap', alwaysFail: true });
      const badStrong = mockProvider({ id: 'strong', alwaysFail: true });
      const router = createLlmRouter(
        [
          { provider: badCheap, dpaSigned: false },
          { provider: badStrong, dpaSigned: true },
        ],
        routes,
      );
      const failure = await router.complete(request()).catch((e: unknown) => e);
      expect(failure).toBeInstanceOf(LlmRouterError);
      expect((failure as LlmRouterError).message).toContain('cheap');
      expect((failure as LlmRouterError).message).toContain('strong');
      expect((failure as LlmRouterError).causes).toHaveLength(2);
    });
  });
});
