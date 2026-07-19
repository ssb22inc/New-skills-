import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { ContextPack } from '@sycamore/packs';
import type { Database } from '../db/types.js';
import { textPdf } from '../shoebox/pdf.js';

/**
 * P33 — Credit Passport v1. The seller OWNS their record: a signed JSON
 * document (Ed25519) any bank, lender, embassy or rival platform can
 * verify with nothing but the public key — plus the same facts as a
 * human-readable PDF. Portability is the point (the paradoxical
 * lock-in): the exit door being real is why nobody needs to use it.
 */
export interface PassportPayload {
  version: 'sycamore-credit-passport/1';
  issuedAt: string;
  marketId: string;
  currency: string;
  seller: {
    id: string;
    businessName: string;
    sellingSince: string;
    completedOrders: number;
  };
  money: {
    grossCapturedMinor: number;
    refundedMinor: number;
    paidOutMinor: number;
    payableBalanceMinor: number;
  };
  trust: {
    publishedReviews: number;
    averageRating: number | null;
    disputes: number;
    disputesMadeGood: number;
  };
}

export interface CreditPassport {
  payload: PassportPayload;
  algorithm: 'ed25519';
  /** Base64 signature over the canonical JSON of `payload`. */
  signature: string;
  /** PEM public key — everything a third party needs. */
  publicKey: string;
}

/** Canonical form: stable key order via recursive sort. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * THIRD-PARTY verification: pure function, no database, no Sycamore.
 * Anyone holding the passport can run these twenty lines.
 */
export function verifyPassport(passport: CreditPassport): boolean {
  try {
    const key = createPublicKey(passport.publicKey);
    return verify(
      null,
      Buffer.from(canonicalJson(passport.payload)),
      key,
      Buffer.from(passport.signature, 'base64'),
    );
  } catch {
    return false;
  }
}

export function generatePassportKeys(): { privateKeyPem: string; publicKeyPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

export function passportService(
  db: Kysely<Database>,
  marketId: string,
  pack: ContextPack,
  keys: { privateKeyPem: string; publicKeyPem: string },
) {
  return {
    async exportFor(sellerId: string): Promise<{ passport: CreditPassport; pdf: Buffer }> {
      const seller = await db
        .selectFrom('sellers')
        .where('market_id', '=', marketId)
        .where('id', '=', sellerId)
        .selectAll()
        .executeTakeFirstOrThrow();

      // Money, straight off the seller's ledger entries.
      const entries = await db
        .selectFrom('ledger_entries')
        .innerJoin('ledger_transactions', 'ledger_transactions.id', 'ledger_entries.transaction_id')
        .where('ledger_entries.market_id', '=', marketId)
        .where('ledger_entries.seller_id', '=', sellerId)
        .select([
          'ledger_transactions.kind',
          'ledger_entries.account',
          'ledger_entries.direction',
          'ledger_entries.amount_minor',
        ])
        .execute();
      let grossCapturedMinor = 0;
      let refundedMinor = 0;
      let paidOutMinor = 0;
      let payableBalanceMinor = 0;
      for (const e of entries) {
        const amount = Number(e.amount_minor);
        if (e.account === 'seller_payable') {
          payableBalanceMinor += e.direction === 'credit' ? amount : -amount;
          if (e.kind === 'release') grossCapturedMinor += e.direction === 'credit' ? amount : 0;
          if (e.kind === 'payout') paidOutMinor += e.direction === 'debit' ? amount : 0;
        }
        if (e.kind === 'refund' && e.account === 'buyer_escrow' && e.direction === 'debit') {
          refundedMinor += amount;
        }
      }

      // Completed orders straight from the orders table — the passport
      // cites source-of-truth records, not derived counters.
      const completed = await db
        .selectFrom('orders')
        .where('market_id', '=', marketId)
        .where('seller_id', '=', sellerId)
        .where('status', '=', 'completed')
        .select((eb) => eb.fn.countAll().as('n'))
        .executeTakeFirst();

      const reviews = await db
        .selectFrom('reviews')
        .where('market_id', '=', marketId)
        .where('seller_id', '=', sellerId)
        .where('status', '=', 'published')
        .select(['rating'])
        .execute();
      const disputes = await db
        .selectFrom('disputes')
        .innerJoin('orders', 'orders.id', 'disputes.order_id')
        .where('disputes.market_id', '=', marketId)
        .where('orders.seller_id', '=', sellerId)
        .select(['disputes.status'])
        .execute();

      const payload: PassportPayload = {
        version: 'sycamore-credit-passport/1',
        issuedAt: new Date().toISOString(),
        marketId,
        currency: pack.currency.code,
        seller: {
          id: sellerId,
          businessName: seller.business_name,
          sellingSince: new Date(seller.created_at).toISOString().slice(0, 10),
          completedOrders: Number(completed?.n ?? 0),
        },
        money: { grossCapturedMinor, refundedMinor, paidOutMinor, payableBalanceMinor },
        trust: {
          publishedReviews: reviews.length,
          averageRating:
            reviews.length === 0
              ? null
              : Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 100) /
                100,
          disputes: disputes.length,
          disputesMadeGood: disputes.filter((d) => ['auto_refunded', 'resolved'].includes(d.status))
            .length,
        },
      };

      const signature = sign(
        null,
        Buffer.from(canonicalJson(payload)),
        createPrivateKey(keys.privateKeyPem),
      ).toString('base64');

      const passport: CreditPassport = {
        payload,
        algorithm: 'ed25519',
        signature,
        publicKey: keys.publicKeyPem,
      };

      const pdf = textPdf(`Credit Passport — ${seller.business_name}`, [
        `Issued ${payload.issuedAt.slice(0, 10)} · market ${marketId.toUpperCase()} · ${pack.currency.code}`,
        `Selling since ${payload.seller.sellingSince} · ${payload.seller.completedOrders} completed orders`,
        '',
        `Gross sales released: ${grossCapturedMinor}`,
        `Refunded: ${refundedMinor}`,
        `Paid out: ${paidOutMinor}`,
        `Current balance: ${payableBalanceMinor}`,
        '',
        `Published reviews: ${payload.trust.publishedReviews}` +
          (payload.trust.averageRating !== null ? ` · average ${payload.trust.averageRating}` : ''),
        `Disputes: ${payload.trust.disputes} (${payload.trust.disputesMadeGood} made good)`,
        '',
        'Verify: ed25519 signature over the canonical JSON, public key attached.',
        'This record belongs to the seller. Records, not tax advice.',
      ]);

      return { passport, pdf };
    },
  };
}

export type PassportService = ReturnType<typeof passportService>;
