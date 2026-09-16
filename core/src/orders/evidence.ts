import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { sql, type Kysely, type Transaction } from 'kysely';
import type { Database } from '../db/types.js';
import type { CompletionProof } from '@sycamore/packs';

/**
 * COMPLETION EVIDENCE (P9 — completion verification).
 *
 * The rule, in one line: **never substitute valid evidence for invalid
 * input.** Missing, malformed, unsupported, stale, mismatched or reused
 * evidence is refused with a reason, and the order does not move.
 *
 * That line is here because the opposite was shipped. The seller action
 * route parsed a client-supplied proof and, when it did not parse, used
 * the vertical pack's first accepted proof instead — so "complete this
 * order" with no evidence at all was recorded as a scanned QR code. The
 * external review of 2026-09-16 called it what it is: the evidence a
 * dispute is judged on, invented by the system defending itself.
 *
 * Each proof type is verified according to what it MEANS, not according
 * to whether the string is in an allowed list:
 *
 *   qr_scan      A one-use, order-bound, expiring challenge. The code
 *                lives on the buyer's screen; the database holds only
 *                its SHA-256. Consumed atomically with the completion,
 *                so the same code cannot complete two orders or the
 *                same order twice.
 *
 *   buyer_confirm  Must come from the order's OWN buyer, authenticated.
 *                A seller confirming on the buyer's behalf is the fraud
 *                this proof exists to prevent.
 *
 *   geo_checkin  Must be inside the seller's recorded service point, and
 *                fresh. A seller with no recorded point CANNOT complete
 *                this way — an unverifiable claim is refused, not
 *                accepted on trust. (Genesis does not collect the point
 *                yet; that is a product gate, and until it closes this
 *                vertical completes by QR or buyer confirmation.)
 *
 * Every verification writes one row: order, actor, type, what it was
 * checked against, and a SERVER clock. One row per order, enforced by a
 * unique index, so the record cannot be rewritten later to suit a
 * dispute.
 */
export class EvidenceError extends Error {
  readonly reason: EvidenceRefusal;
  constructor(reason: EvidenceRefusal, message: string) {
    super(message);
    this.name = 'EvidenceError';
    this.reason = reason;
  }
}

export type EvidenceRefusal =
  'missing' | 'malformed' | 'unsupported' | 'expired' | 'reused' | 'mismatched' | 'unverifiable';

/** What a caller claims. Anything absent is a refusal, never a default. */
export type CompletionClaim =
  | { type: 'qr_scan'; code: string }
  | { type: 'buyer_confirm'; buyerUserId: string }
  | { type: 'geo_checkin'; lat: number; lng: number; capturedAt: Date | string };

export interface VerifiedEvidence {
  proof: CompletionProof;
  reference: string;
  /** Rows written inside the caller's transaction, never before it. */
  apply(trx: Transaction<Database>): Promise<void>;
}

const CHALLENGE_TTL_MS = 15 * 60_000;
/** A check-in claimed more than this long ago is stale, not evidence. */
const GEO_FRESHNESS_MS = 30 * 60_000;
const DEFAULT_RADIUS_M = 250;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Metres between two points. Earth is a sphere here; at 250m it is. */
function metresBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function completionEvidence(db: Kysely<Database>, marketId: string) {
  return {
    /**
     * Issue the one-use code behind a QR scan. Returned ONCE — what is
     * stored is a hash, so a database read cannot complete an order.
     */
    async issueChallenge(input: {
      orderId: string;
      issuedToUserId?: string;
      ttlMs?: number;
    }): Promise<{ challengeId: string; code: string; expiresAt: Date }> {
      const order = await db
        .selectFrom('orders')
        .where('market_id', '=', marketId)
        .where('id', '=', input.orderId)
        .select(['id', 'status'])
        .executeTakeFirst();
      if (!order) throw new EvidenceError('mismatched', `no order ${input.orderId} in ${marketId}`);
      if (!['confirmed', 'disputed'].includes(order.status)) {
        throw new EvidenceError(
          'mismatched',
          `order ${input.orderId} is ${order.status}; a completion code belongs to a confirmed order`,
        );
      }
      const code = randomBytes(24).toString('base64url');
      const expiresAt = new Date(Date.now() + (input.ttlMs ?? CHALLENGE_TTL_MS));
      const row = await db
        .insertInto('completion_challenges')
        .values({
          market_id: marketId,
          order_id: input.orderId,
          proof_type: 'qr_scan',
          code_hash: sha256(code),
          issued_to_user_id: input.issuedToUserId ?? null,
          expires_at: expiresAt,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return { challengeId: row.id, code, expiresAt };
    },

    /**
     * Verify a claim against the order. Returns something the caller
     * applies INSIDE its own transaction — consuming the challenge and
     * transitioning the order is one step or it is a race.
     */
    async verify(input: {
      orderId: string;
      claim: CompletionClaim | undefined | null;
      actorUserId: string | null;
      actorRole: string;
      allowed: readonly CompletionProof[];
    }): Promise<VerifiedEvidence> {
      const { orderId, claim, actorUserId, actorRole } = input;
      if (!claim || typeof claim !== 'object' || typeof claim.type !== 'string') {
        throw new EvidenceError(
          'missing',
          `order ${orderId}: completion needs evidence, and none was supplied`,
        );
      }
      if (!input.allowed.includes(claim.type as CompletionProof)) {
        throw new EvidenceError(
          'unsupported',
          `order ${orderId}: "${claim.type}" is not accepted here (allowed: ${input.allowed.join(', ')})`,
        );
      }
      const order = await db
        .selectFrom('orders')
        .where('market_id', '=', marketId)
        .where('id', '=', orderId)
        .select(['id', 'seller_id', 'buyer_user_id', 'status'])
        .executeTakeFirst();
      if (!order) throw new EvidenceError('mismatched', `no order ${orderId} in ${marketId}`);

      const record = (proof: CompletionProof, reference: string) => ({
        market_id: marketId,
        order_id: orderId,
        seller_id: order.seller_id,
        proof_type: proof,
        actor_user_id: actorUserId,
        actor_role: actorRole,
        reference,
      });

      if (claim.type === 'qr_scan') {
        if (typeof claim.code !== 'string' || claim.code.length === 0) {
          throw new EvidenceError('malformed', `order ${orderId}: qr_scan needs a code`);
        }
        const hash = sha256(claim.code);
        const challenge = await db
          .selectFrom('completion_challenges')
          .where('market_id', '=', marketId)
          .where('order_id', '=', orderId)
          .where('proof_type', '=', 'qr_scan')
          .selectAll()
          .execute();
        // Constant-time over the candidates: a code for ANOTHER order
        // must not be distinguishable from a wrong code by timing.
        const match = challenge.find((c) => {
          const stored = Buffer.from(c.code_hash);
          const given = Buffer.from(hash);
          return stored.length === given.length && timingSafeEqual(stored, given);
        });
        if (!match) {
          throw new EvidenceError(
            'mismatched',
            `order ${orderId}: that code does not belong to this order`,
          );
        }
        if (match.consumed_at !== null) {
          throw new EvidenceError('reused', `order ${orderId}: that code was already used`);
        }
        if (new Date(match.expires_at).getTime() <= Date.now()) {
          throw new EvidenceError('expired', `order ${orderId}: that code has expired`);
        }
        return {
          proof: 'qr_scan',
          reference: match.id,
          async apply(trx) {
            // Consume by UPDATE … WHERE consumed_at IS NULL: two racing
            // scans of the same code, and only one changes a row.
            const consumed = await trx
              .updateTable('completion_challenges')
              .set({ consumed_at: sql`now()` })
              .where('id', '=', match.id)
              .where('consumed_at', 'is', null)
              .returning('id')
              .executeTakeFirst();
            if (!consumed) {
              throw new EvidenceError('reused', `order ${orderId}: that code was already used`);
            }
            await trx
              .insertInto('completion_evidence')
              .values(record('qr_scan', match.id))
              .execute();
          },
        };
      }

      if (claim.type === 'buyer_confirm') {
        if (typeof claim.buyerUserId !== 'string' || claim.buyerUserId.length === 0) {
          throw new EvidenceError(
            'malformed',
            `order ${orderId}: buyer_confirm needs the confirming buyer`,
          );
        }
        if (claim.buyerUserId !== order.buyer_user_id) {
          // The seller confirming on the buyer's behalf is exactly the
          // fraud this proof exists to prevent.
          throw new EvidenceError(
            'mismatched',
            `order ${orderId}: buyer_confirm must come from the order's own buyer`,
          );
        }
        if (actorUserId !== null && actorUserId !== order.buyer_user_id) {
          throw new EvidenceError(
            'mismatched',
            `order ${orderId}: the authenticated caller is not this order's buyer`,
          );
        }
        const reference = order.buyer_user_id;
        return {
          proof: 'buyer_confirm',
          reference,
          async apply(trx) {
            await trx
              .insertInto('completion_evidence')
              .values(record('buyer_confirm', reference))
              .execute();
          },
        };
      }

      const { lat, lng, capturedAt } = claim;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new EvidenceError('malformed', `order ${orderId}: geo_checkin needs a point`);
      }
      const capturedMs = new Date(capturedAt).getTime();
      if (!Number.isFinite(capturedMs)) {
        throw new EvidenceError('malformed', `order ${orderId}: geo_checkin needs a timestamp`);
      }
      if (Date.now() - capturedMs > GEO_FRESHNESS_MS) {
        throw new EvidenceError(
          'expired',
          `order ${orderId}: that check-in is too old to be evidence`,
        );
      }
      const seller = await db
        .selectFrom('sellers')
        .where('market_id', '=', marketId)
        .where('id', '=', order.seller_id)
        .select(['service_point_lat', 'service_point_lng', 'service_radius_m'])
        .executeTakeFirstOrThrow();
      if (seller.service_point_lat === null || seller.service_point_lng === null) {
        // Refusing is the policy. Accepting a location nobody can check
        // against anything is how "verified" becomes a word.
        throw new EvidenceError(
          'unverifiable',
          `order ${orderId}: this seller has no service point recorded, so a geo check-in ` +
            `cannot be verified — complete with a code or the buyer's confirmation instead`,
        );
      }
      const distance = metresBetween(seller.service_point_lat, seller.service_point_lng, lat, lng);
      const radius = seller.service_radius_m ?? DEFAULT_RADIUS_M;
      if (distance > radius) {
        throw new EvidenceError(
          'mismatched',
          `order ${orderId}: that check-in is ${Math.round(distance)}m away, outside ${radius}m`,
        );
      }
      const reference = `${lat.toFixed(5)},${lng.toFixed(5)}@${Math.round(distance)}m`;
      return {
        proof: 'geo_checkin',
        reference,
        async apply(trx) {
          await trx
            .insertInto('completion_evidence')
            .values(record('geo_checkin', reference))
            .execute();
        },
      };
    },

    /** What was actually verified for an order, for a dispute to read. */
    async forOrder(orderId: string) {
      return db
        .selectFrom('completion_evidence')
        .where('market_id', '=', marketId)
        .where('order_id', '=', orderId)
        .selectAll()
        .executeTakeFirst();
    },
  };
}

export type CompletionEvidenceService = ReturnType<typeof completionEvidence>;
