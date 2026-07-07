import { createHash } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { ContextPack } from '@sycamore/packs';
import type { Database } from '../db/types.js';

export class HeraldError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HeraldError';
  }
}

/**
 * P30 — the Herald. Programmatic local presence (per-seller pages +
 * Google Business payloads), GEO structuring of trust pages (JSON-LD),
 * holdout-controlled channel pilots with fraud filtering, and a
 * disclosed-only forum policy — astroturfing is structurally impossible
 * (Constitution §5). LIVE pilots are the P30 HUMAN GATE; everything
 * here runs against seeded events.
 */
export interface PilotEvent {
  userId: string;
  deviceId: string;
  clickedAt: number;
  converted: boolean;
  /** ms between click and conversion; bots convert impossibly fast. */
  conversionMs?: number | undefined;
}

const HOLDOUT_BPS = 2000; // 20% never see the channel — the control group
const FRAUD_MIN_CONVERSION_MS = 3000;
const FRAUD_MAX_CLICKS_PER_DEVICE = 3;

export function heraldService(db: Kysely<Database>, marketId: string, pack: ContextPack) {
  return {
    /** GEO structuring: schema.org LocalBusiness JSON-LD for a trust page. */
    async geoJsonLd(sellerId: string, trustPageBase: string) {
      const seller = await db
        .selectFrom('sellers')
        .where('market_id', '=', marketId)
        .where('id', '=', sellerId)
        .selectAll()
        .executeTakeFirstOrThrow();
      return {
        '@context': 'https://schema.org',
        '@type': 'LocalBusiness',
        name: seller.business_name,
        url: `${trustPageBase}/t/${marketId}/${sellerId}`,
        address: {
          '@type': 'PostalAddress',
          addressRegion: seller.parish ?? '',
          addressCountry: pack.market_id.toUpperCase(),
        },
        currenciesAccepted: pack.currency.code,
      };
    },

    /** Programmatic local-page inventory: one entry per seller × parish. */
    async localPageEntries(trustPageBase: string) {
      const sellers = await db
        .selectFrom('sellers')
        .where('market_id', '=', marketId)
        .where('standing', '=', 'active')
        .where('parish', 'is not', null)
        .select(['id', 'business_name', 'parish'])
        .execute();
      return sellers.map((s) => ({
        sellerId: s.id,
        slug: `${(s.parish as string).toLowerCase().replace(/[^a-z0-9]+/g, '-')}/${s.business_name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')}`,
        canonicalUrl: `${trustPageBase}/t/${marketId}/${s.id}`,
        googleBusiness: {
          title: s.business_name,
          websiteUri: `${trustPageBase}/t/${marketId}/${s.id}`,
          storefrontAddress: { locality: s.parish, regionCode: pack.market_id.toUpperCase() },
        },
      }));
    },

    /** Deterministic holdout assignment — a user never flaps cohorts. */
    holdoutOf(pilotId: string, userId: string): 'exposed' | 'holdout' {
      const h = createHash('sha256').update(`${pilotId}:${userId}`).digest();
      const bps = h.readUInt16BE(0) % 10000;
      return bps < HOLDOUT_BPS ? 'holdout' : 'exposed';
    },

    /**
     * Evaluate a pilot from its event log: fraud filtered FIRST, then
     * lift = exposed conversion − holdout conversion. A pilot that only
     * wins before the fraud filter is a loss, not a win.
     */
    evaluatePilot(pilotId: string, events: PilotEvent[], holdoutConversions: PilotEvent[]) {
      const clicksPerDevice = new Map<string, number>();
      for (const e of events) {
        clicksPerDevice.set(e.deviceId, (clicksPerDevice.get(e.deviceId) ?? 0) + 1);
      }
      const fraud = (e: PilotEvent) =>
        (clicksPerDevice.get(e.deviceId) ?? 0) > FRAUD_MAX_CLICKS_PER_DEVICE ||
        (e.converted && (e.conversionMs ?? Infinity) < FRAUD_MIN_CONVERSION_MS);
      const clean = events.filter((e) => !fraud(e));
      const filteredOut = events.length - clean.length;

      const rate = (xs: PilotEvent[]) =>
        xs.length === 0 ? 0 : xs.filter((e) => e.converted).length / xs.length;
      const exposedRate = rate(clean);
      const holdoutRate = rate(holdoutConversions);
      return {
        pilotId,
        exposedRate,
        holdoutRate,
        lift: exposedRate - holdoutRate,
        filteredOut,
        sample: clean.length,
      };
    },

    /**
     * Disclosed-only forum policy: a post without disclosure NEVER
     * renders. No undisclosed AI voice, no astroturfing — product law.
     */
    forumPost(input: { body: string; disclosed: boolean }): string {
      if (!input.disclosed) {
        throw new HeraldError('undisclosed forum post refused — disclosed-only policy');
      }
      return `${input.body}\n— posted by Sycamore (disclosed)`;
    },
  };
}

export type HeraldService = ReturnType<typeof heraldService>;
