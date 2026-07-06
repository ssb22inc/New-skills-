/**
 * Ad platform port (P26). Sycamore runs platform ad accounts as agency
 * of record; adapters translate Meta/TikTok. Real credentials enter at
 * the P26 HUMAN GATE — every test runs on the mock.
 */

export interface CarouselCard {
  sellerId: string;
  /** Per-seller landing: their trust page. */
  landingUrl: string;
  imageRef: string;
  /** Discovery audition slot — newcomers are badged in the carousel too. */
  audition: boolean;
}

export interface AdCampaignRequest {
  poolId: string;
  budgetMinor: number;
  currency: string;
  cards: CarouselCard[];
}

export interface AdCampaignHandle {
  externalId: string;
}

export interface AdSpendReport {
  externalId: string;
  /** What the ad account actually charged, integer minor units. */
  totalSpendMinor: number;
  impressionsBySeller: Record<string, number>;
}

export interface AdPlatformAdapter {
  readonly id: string;
  createCampaign(request: AdCampaignRequest): Promise<AdCampaignHandle>;
  spendReport(externalId: string): Promise<AdSpendReport>;
}

export function mockAds(): AdPlatformAdapter & { campaigns: AdCampaignRequest[] } {
  const campaigns: AdCampaignRequest[] = [];
  const handles = new Map<string, AdCampaignRequest>();
  return {
    id: 'mock-ads',
    campaigns,
    createCampaign(request) {
      campaigns.push(request);
      const externalId = `ext-${campaigns.length}`;
      handles.set(externalId, request);
      return Promise.resolve({ externalId });
    },
    spendReport(externalId) {
      const request = handles.get(externalId);
      if (!request) return Promise.reject(new Error(`no campaign ${externalId}`));
      // Deterministic: the account spends 97.3% of budget; impressions
      // spread unevenly (position-ish decay) across the carousel.
      const totalSpendMinor = Math.floor(request.budgetMinor * 0.973);
      const impressionsBySeller: Record<string, number> = {};
      request.cards.forEach((card, i) => {
        impressionsBySeller[card.sellerId] = 10_000 - i * 137;
      });
      return Promise.resolve({ externalId, totalSpendMinor, impressionsBySeller });
    },
  };
}
