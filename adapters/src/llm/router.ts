import { assertPiiRoutingAllowed, PiiRoutingViolation } from './policy.js';
import type { LlmRequest, LlmResponse, RoutingTable, VendorConfig } from './types.js';

export class LlmRouterError extends Error {
  constructor(
    message: string,
    readonly causes: Error[],
  ) {
    super(message);
    this.name = 'LlmRouterError';
  }
}

export interface LlmRouter {
  complete(request: LlmRequest): Promise<LlmResponse>;
}

/**
 * Routes by task type (routine work → cheap provider; money-math and
 * compliance → strong provider) with in-order failover. The PII/DPA policy
 * is applied twice on purpose: candidates without a DPA are excluded up
 * front for PII requests, and assertPiiRoutingAllowed guards immediately
 * before every provider call as defense in depth.
 */
export function createLlmRouter(vendors: VendorConfig[], routes: RoutingTable): LlmRouter {
  const byId = new Map(vendors.map((v) => [v.provider.id, v]));
  for (const [task, route] of Object.entries(routes)) {
    for (const id of [route.primary, ...route.fallbacks]) {
      if (!byId.has(id)) {
        throw new Error(`routing table for "${task}" references unknown provider "${id}"`);
      }
    }
  }

  return {
    async complete(request: LlmRequest): Promise<LlmResponse> {
      const route = routes[request.task];
      const chain = [route.primary, ...route.fallbacks].map((id) => {
        const vendor = byId.get(id);
        if (!vendor) throw new Error(`unknown provider "${id}"`); // unreachable; validated above
        return vendor;
      });

      const eligible = request.containsPii ? chain.filter((v) => v.dpaSigned) : chain;
      if (eligible.length === 0) {
        // Every provider on this route lacks a DPA — the call must die here,
        // never silently fall through to an unvetted vendor.
        throw new PiiRoutingViolation(chain.map((v) => v.provider.id).join(', '));
      }

      const failures: Error[] = [];
      for (const vendor of eligible) {
        assertPiiRoutingAllowed(request, vendor);
        try {
          return await vendor.provider.complete(request);
        } catch (err) {
          failures.push(err as Error);
        }
      }
      throw new LlmRouterError(
        `all providers failed for task "${request.task}" ` +
          `(tried: ${eligible.map((v) => v.provider.id).join(', ')})`,
        failures,
      );
    },
  };
}
