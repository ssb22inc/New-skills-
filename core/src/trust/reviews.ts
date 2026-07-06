import { sql, type Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { ledgerService } from '../ledger/ledger.js';

export class ReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReviewError';
  }
}

/** Burst detection: this many reviews on one seller inside the window → hold. */
export const BURST_THRESHOLD = 4;
export const BURST_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Early-Days display until this many completed paid bookings. */
export const EARLY_DAYS_UNTIL = 10;

export type ReviewDisplay =
  | { mode: 'early_days'; completedOrders: number }
  | {
      mode: 'reviews';
      reviews: {
        rating: number;
        body: string;
        madeItRight: boolean;
        history: { rating: number; body: string }[];
      }[];
    };

/**
 * P20 — verified reviews + fraud signals. A review exists ONLY behind a
 * completed, PAID booking on that number. Fraud signals hold, never
 * fabricate: burst rings and competitor hits go to 'held' (invisible,
 * auditable); no-booking attempts are refused outright. Second-Chance
 * keeps the history visible — trust is never traded (Constitution §1.5).
 */
export function reviewsService(db: Kysely<Database>, marketId: string) {
  const ledger = ledgerService(db, marketId);

  return {
    ledger,

    async submitReview(input: {
      orderId: string;
      buyerUserId: string;
      rating: number;
      body: string;
      now?: Date;
    }) {
      const now = input.now ?? new Date();
      const order = await db
        .selectFrom('orders')
        .where('market_id', '=', marketId)
        .where('id', '=', input.orderId)
        .selectAll()
        .executeTakeFirst();
      // The gate: only a completed booking, from the buyer's own number.
      if (!order || order.buyer_user_id !== input.buyerUserId) {
        throw new ReviewError('reviews come only from your own completed booking');
      }
      if (order.status !== 'completed') {
        throw new ReviewError('reviews open after the booking completes');
      }
      // ...and only a PAID one.
      const money = await ledger.orderSummary(input.orderId);
      if (money.captured <= 0) {
        throw new ReviewError('reviews come only from paid bookings');
      }

      // Fraud signal 1 — burst/cluster: too many reviews on one seller in
      // the window. This one and subsequent ones hold for verification.
      const recent = await db
        .selectFrom('reviews')
        .where('market_id', '=', marketId)
        .where('seller_id', '=', order.seller_id)
        .where('created_at', '>', new Date(now.getTime() - BURST_WINDOW_MS))
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .executeTakeFirstOrThrow();
      let status: 'published' | 'held' = 'published';
      let holdReason: string | undefined;
      if (Number(recent.n) >= BURST_THRESHOLD) {
        status = 'held';
        holdReason = 'burst pattern on this seller — held for verification';
      }

      // Fraud signal 2 — competitor hit: the reviewer runs a business in
      // the same market and vertical and is dropping a 1–2★.
      if (status === 'published' && input.rating <= 2) {
        const reviewerSeller = await db
          .selectFrom('sellers')
          .innerJoin('capacity_windows', 'capacity_windows.seller_id', 'sellers.id')
          .where('sellers.market_id', '=', marketId)
          .where('sellers.user_id', '=', input.buyerUserId)
          .where('capacity_windows.vertical_id', '=', order.vertical_id)
          .select('sellers.id')
          .executeTakeFirst();
        if (reviewerSeller) {
          status = 'held';
          holdReason = 'low rating from a same-vertical competitor — held for verification';
        }
      }

      const review = await db
        .insertInto('reviews')
        .values({
          market_id: marketId,
          order_id: input.orderId,
          seller_id: order.seller_id,
          buyer_user_id: input.buyerUserId,
          rating: input.rating,
          body: input.body,
          status,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return { review, holdReason };
    },

    /** Seller asks for a chance to make it right (rating ≤3). */
    async openSecondChance(reviewId: string, sellerId: string): Promise<void> {
      const review = await db
        .selectFrom('reviews')
        .where('market_id', '=', marketId)
        .where('id', '=', reviewId)
        .selectAll()
        .executeTakeFirstOrThrow();
      if (review.seller_id !== sellerId) throw new ReviewError('not your review to resolve');
      if (review.rating > 3) throw new ReviewError('second chance is for tough reviews');
      await db
        .updateTable('reviews')
        .set({ resolution_opened_at: sql`now()`, updated_at: sql`now()` })
        .where('id', '=', reviewId)
        .execute();
    },

    /** Buyer updates after resolution; history stays VISIBLE forever. */
    async updateAfterResolution(input: {
      reviewId: string;
      buyerUserId: string;
      rating: number;
      body: string;
    }) {
      const review = await db
        .selectFrom('reviews')
        .where('market_id', '=', marketId)
        .where('id', '=', input.reviewId)
        .selectAll()
        .executeTakeFirstOrThrow();
      if (review.buyer_user_id !== input.buyerUserId) {
        throw new ReviewError('only the reviewer can update their review');
      }
      if (!review.resolution_opened_at) {
        throw new ReviewError('no resolution window is open for this review');
      }
      await db
        .insertInto('review_revisions')
        .values({
          market_id: marketId,
          review_id: review.id,
          rating: review.rating,
          body: review.body,
        })
        .execute();
      await db
        .updateTable('reviews')
        .set({
          rating: input.rating,
          body: input.body,
          made_it_right: input.rating > review.rating,
          updated_at: sql`now()`,
        })
        .where('id', '=', review.id)
        .execute();
    },

    /** What the trust page renders: Early Days or honest reviews. */
    async displayFor(sellerId: string): Promise<ReviewDisplay> {
      const seller = await db
        .selectFrom('sellers')
        .where('market_id', '=', marketId)
        .where('id', '=', sellerId)
        .selectAll()
        .executeTakeFirstOrThrow();
      if (seller.completed_orders < EARLY_DAYS_UNTIL) {
        return { mode: 'early_days', completedOrders: seller.completed_orders };
      }
      const rows = await db
        .selectFrom('reviews')
        .where('market_id', '=', marketId)
        .where('seller_id', '=', sellerId)
        .where('status', '=', 'published')
        .orderBy('created_at', 'desc')
        .selectAll()
        .execute();
      const reviews = [];
      for (const r of rows) {
        const history = await db
          .selectFrom('review_revisions')
          .where('review_id', '=', r.id)
          .orderBy('id', 'asc')
          .select(['rating', 'body'])
          .execute();
        reviews.push({
          rating: r.rating,
          body: r.body,
          madeItRight: r.made_it_right,
          history,
        });
      }
      return { mode: 'reviews', reviews };
    },

    /** Make-Good fund: financed from platform fees, paid out to buyers. */
    async fundMakeGood(amountMinor: number, currency: string, key: string) {
      return ledger.postAdjustment({
        reference: 'make-good-fund',
        idempotencyKey: key,
        entries: [
          { account: 'platform_fees', direction: 'debit', amountMinor, currency },
          { account: 'make_good_fund', direction: 'credit', amountMinor, currency },
        ],
      });
    },

    async payMakeGood(orderRef: string, amountMinor: number, currency: string, key: string) {
      const fund = await ledger.accountBalance('make_good_fund');
      if (-fund < amountMinor) {
        throw new ReviewError('make-good fund is short — top it up first');
      }
      return ledger.postAdjustment({
        reference: `make-good:${orderRef}`,
        idempotencyKey: key,
        entries: [
          { account: 'make_good_fund', direction: 'debit', amountMinor, currency },
          { account: 'external', direction: 'credit', amountMinor, currency },
        ],
      });
    },
  };
}

export type ReviewsService = ReturnType<typeof reviewsService>;
