import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { AdPlatformAdapter, CarouselCard } from '@sycamore/adapters';
import type { ContextPack } from '@sycamore/packs';
import type { Database } from '../db/types.js';
import { ledgerService } from '../ledger/ledger.js';
import { EARLY_DAYS_UNTIL } from '../trust/reviews.js';

export class CoopError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoopError';
  }
}

/**
 * P26 — co-op pooled campaigns through platform ad accounts (agency of
 * record). Pools form by category × parish; every member gets their own
 * landing (their trust page); newcomers ride badged audition cards;
 * spend attributes back per seller and reconciles against the ad-account
 * charge to the cent. HUMAN GATE: real Meta/TikTok credentials + a live
 * co-op with ≥20 sellers — everything below runs on the mock adapter.
 */
export function coopService(db: Kysely<Database>, marketId: string, pack: ContextPack) {
  const ledger = ledgerService(db, marketId);

  return {
    ledger,

    /** Pool membership: sellers of a vertical in a parish with a photo. */
    async buildPool(input: { verticalId: string; parish: string; trustPageBase: string }) {
      const members = await db
        .selectFrom('sellers')
        .innerJoin('catalog_items', 'catalog_items.seller_id', 'sellers.id')
        .where('sellers.market_id', '=', marketId)
        .where('sellers.parish', '=', input.parish)
        .where('catalog_items.active', '=', true)
        .select([
          'sellers.id',
          'sellers.completed_orders',
          (eb) => eb.fn.min('catalog_items.photo_ref').as('photo_ref'),
        ])
        .groupBy(['sellers.id', 'sellers.completed_orders'])
        .execute();
      const cards: CarouselCard[] = members.map((m) => ({
        sellerId: m.id,
        landingUrl: `${input.trustPageBase}/t/${marketId}/${m.id}`, // per-seller routing
        imageRef: m.photo_ref as string,
        audition: m.completed_orders < EARLY_DAYS_UNTIL, // Discovery audition, badged
      }));
      return { verticalId: input.verticalId, parish: input.parish, cards };
    },

    async launch(
      adapter: AdPlatformAdapter,
      pool: { verticalId: string; parish: string; cards: CarouselCard[] },
      budgetMinor: number,
    ) {
      if (pool.cards.length === 0) throw new CoopError('a co-op needs members');
      const handle = await adapter.createCampaign({
        poolId: `${pool.verticalId}:${pool.parish}`,
        budgetMinor,
        currency: pack.currency.code,
        cards: pool.cards,
      });
      const campaign = await db
        .insertInto('coop_campaigns')
        .values({
          market_id: marketId,
          vertical_id: pool.verticalId,
          parish: pool.parish,
          external_id: handle.externalId,
          budget_minor: budgetMinor,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return campaign;
    },

    /**
     * Reconciliation: the platform's charge attributes per seller by
     * impression share, integer allocation summing EXACTLY to the account
     * spend (remainder to the highest-impression seller). One balanced
     * ledger transaction covers the campaign.
     */
    async reconcile(adapter: AdPlatformAdapter, campaignId: string) {
      const campaign = await db
        .selectFrom('coop_campaigns')
        .where('market_id', '=', marketId)
        .where('id', '=', campaignId)
        .selectAll()
        .executeTakeFirstOrThrow();
      if (campaign.reconciled) throw new CoopError('campaign already reconciled');
      const report = await adapter.spendReport(campaign.external_id);
      const totalImpressions = Object.values(report.impressionsBySeller).reduce((s, v) => s + v, 0);
      if (totalImpressions === 0) throw new CoopError('no impressions to attribute');

      const entries = Object.entries(report.impressionsBySeller).sort((a, b) => b[1] - a[1]);
      let allocated = 0;
      const attributions: { sellerId: string; spendMinor: number; impressions: number }[] = [];
      for (const [sellerId, impressions] of entries) {
        const share = Math.floor((report.totalSpendMinor * impressions) / totalImpressions);
        attributions.push({ sellerId, spendMinor: share, impressions });
        allocated += share;
      }
      attributions[0]!.spendMinor += report.totalSpendMinor - allocated; // remainder → top

      for (const a of attributions) {
        await db
          .insertInto('coop_attributions')
          .values({
            market_id: marketId,
            campaign_id: campaignId,
            seller_id: a.sellerId,
            spend_minor: a.spendMinor,
            impressions: a.impressions,
          })
          .execute();
      }
      // The agency-of-record charge, balanced on the ledger.
      await ledger.postAdjustment({
        reference: `coop:${campaignId}`,
        idempotencyKey: `coop-spend:${campaignId}`,
        entries: [
          {
            account: 'platform_fees',
            direction: 'debit',
            amountMinor: report.totalSpendMinor,
            currency: pack.currency.code,
          },
          {
            account: 'external',
            direction: 'credit',
            amountMinor: report.totalSpendMinor,
            currency: pack.currency.code,
          },
        ],
      });
      await db
        .updateTable('coop_campaigns')
        .set({ reconciled: true, updated_at: sql`now()` })
        .where('id', '=', campaignId)
        .execute();

      const auditionImpressions = attributions
        .filter((a) => report.impressionsBySeller[a.sellerId] !== undefined)
        .filter((a) => a.impressions > 0);
      return {
        attributions,
        totalSpendMinor: report.totalSpendMinor,
        /** Impression-share fairness: audition (newcomer) share of eyes. */
        fairnessShare(newcomerIds: Set<string>): number {
          const newcomerEyes = auditionImpressions
            .filter((a) => newcomerIds.has(a.sellerId))
            .reduce((s, a) => s + a.impressions, 0);
          return newcomerEyes / totalImpressions;
        },
      };
    },
  };
}

export type CoopService = ReturnType<typeof coopService>;
