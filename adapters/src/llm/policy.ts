import type { LlmRequest, VendorConfig } from './types.js';

/**
 * THE hard-coded policy check (CLAUDE.md data rules, BUILD §5.9):
 * a request flagged contains_pii=true may only route to a vendor with
 * dpa_signed=true. This is code, not a prompt — violation throws, always.
 */
export class PiiRoutingViolation extends Error {
  constructor(providerId: string) {
    super(
      `PII routing violation: request flagged contains_pii=true may not route to ` +
        `provider "${providerId}" (dpa_signed=false). This is a hard policy, not a preference.`,
    );
    this.name = 'PiiRoutingViolation';
  }
}

export function assertPiiRoutingAllowed(request: LlmRequest, vendor: VendorConfig): void {
  if (request.containsPii && !vendor.dpaSigned) {
    throw new PiiRoutingViolation(vendor.provider.id);
  }
}
