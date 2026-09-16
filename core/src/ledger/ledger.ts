import { sql, type Kysely, type Transaction } from 'kysely';
import type { Database } from '../db/types.js';

export const LEDGER_ACCOUNTS = [
  'external',
  'buyer_escrow',
  'seller_payable',
  'platform_fees',
  'referral_credits',
  'processor_fees',
  'make_good_fund',
] as const;
export type LedgerAccount = (typeof LEDGER_ACCOUNTS)[number];

export type EntryDirection = 'debit' | 'credit';

export interface LedgerEntryInput {
  account: LedgerAccount;
  direction: EntryDirection;
  amountMinor: number;
  currency: string;
  /** Seller attribution for payable/referral entries (payout batching). */
  sellerId?: string;
}

export class LedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerError';
  }
}

/**
 * The largest amount whose basis-point split is exact in IEEE doubles:
 * `amountMinor * 10_000` must stay under 2^53. Everything Sycamore
 * actually handles is nine orders of magnitude below it.
 */
export const MAX_EXACT_SPLIT_MINOR = Math.floor(Number.MAX_SAFE_INTEGER / 10_000);

export interface SplitBps {
  sellerBps: number;
  platformBps: number;
  referralBps: number;
  processorBps: number;
}

/**
 * Integer split: parts ALWAYS sum to exactly the amount — the remainder
 * from basis-point rounding goes to the seller (never to the platform).
 */
export function computeSplit(
  amountMinor: number,
  bps: SplitBps,
): { seller: number; platform: number; referral: number; processor: number } {
  // Each share must be a non-negative whole number of basis points
  // BEFORE the sum is checked, because -1000 and 11000 sum to exactly
  // 10000 and look honest. Found by the §5.7 red team, 2026-09-16: that
  // pair paid the platform 110,000 out of a 100,000 capture and charged
  // the seller 10,000. The ledger's own "entry amounts are positive"
  // rule would have caught it one layer later, with an error naming the
  // wrong thing; a split that cannot be expressed as a share of the
  // money should be refused where the share is computed.
  for (const [who, value] of Object.entries(bps)) {
    if (!Number.isInteger(value) || value < 0) {
      throw new LedgerError(`${who} must be a non-negative whole number of bps, got ${value}`);
    }
  }
  const total = bps.sellerBps + bps.platformBps + bps.referralBps + bps.processorBps;
  if (total !== 10_000) {
    throw new LedgerError(`split must sum to exactly 10000 bps, got ${total}`);
  }
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new LedgerError(`amount must be a positive integer, got ${amountMinor}`);
  }
  // Above this, `amountMinor * bps` leaves the range where a double
  // represents integers exactly, and `Math.floor` starts flooring a
  // value that is already wrong: the §5.7 review produced a split whose
  // platform share overshot its own floor by 2 and pushed the seller to
  // −1. No real order is J$90 trillion, so the honest move is to refuse
  // the amount rather than return arithmetic nobody can trust.
  if (amountMinor > MAX_EXACT_SPLIT_MINOR) {
    throw new LedgerError(
      `amount ${amountMinor} exceeds the largest exactly-splittable value ` +
        `${MAX_EXACT_SPLIT_MINOR}`,
    );
  }
  const platform = Math.floor((amountMinor * bps.platformBps) / 10_000);
  const referral = Math.floor((amountMinor * bps.referralBps) / 10_000);
  const processor = Math.floor((amountMinor * bps.processorBps) / 10_000);
  const seller = amountMinor - platform - referral - processor;
  return { seller, platform, referral, processor };
}

export function ledgerService(db: Kysely<Database>, marketId: string) {
  async function postTx(
    trx: Transaction<Database>,
    input: {
      kind: 'capture' | 'refund' | 'release' | 'payout' | 'adjustment';
      reference: string;
      idempotencyKey: string;
      entries: LedgerEntryInput[];
    },
  ): Promise<{ posted: boolean }> {
    if (input.entries.length < 2) {
      throw new LedgerError('a transaction needs at least two entries');
    }
    const currencies = new Set(input.entries.map((e) => e.currency));
    if (currencies.size !== 1) {
      throw new LedgerError('all entries in a transaction share one currency');
    }
    let debits = 0;
    let credits = 0;
    for (const e of input.entries) {
      if (!Number.isInteger(e.amountMinor) || e.amountMinor <= 0) {
        throw new LedgerError(`entry amounts are positive integers, got ${e.amountMinor}`);
      }
      if (e.direction === 'debit') debits += e.amountMinor;
      else credits += e.amountMinor;
    }
    if (debits !== credits) {
      throw new LedgerError(`unbalanced transaction: debits ${debits} ≠ credits ${credits}`);
    }
    const txn = await trx
      .insertInto('ledger_transactions')
      .values({
        market_id: marketId,
        kind: input.kind,
        reference: input.reference,
        idempotency_key: input.idempotencyKey,
      })
      .onConflict((oc) => oc.columns(['market_id', 'idempotency_key']).doNothing())
      .returning('id')
      .executeTakeFirst();
    if (!txn) return { posted: false }; // idempotent replay: exactly one effect
    await trx
      .insertInto('ledger_entries')
      .values(
        input.entries.map((e) => ({
          market_id: marketId,
          transaction_id: txn.id,
          account: e.account,
          direction: e.direction,
          amount_minor: e.amountMinor,
          currency: e.currency,
          seller_id: e.sellerId ?? null,
        })),
      )
      .execute();
    return { posted: true };
  }

  /**
   * Take an exclusive lock on everything already posted against this
   * order, so that reading its sums and acting on them cannot be split
   * by another worker.
   *
   * Without it, `refund` and `release` were a textbook time-of-check to
   * time-of-use race: N callers each read "nothing released yet", each
   * passed, and each posted. Idempotency keys do not help — they stop
   * the SAME key twice, and the callers that collide here carry
   * DIFFERENT keys by design (a hurricane sweep and a dispute
   * resolution; a settlement batch and a lifeline replay). Proved on
   * 2026-09-16: eight concurrent releases of one 900,000 capture paid
   * out 4,500,000, and every posting was internally balanced, so the
   * trial balance still read level.
   *
   * The capture row is what everyone contends on, and it always exists
   * before there is anything to refund or release, so the first caller
   * holds it and the rest queue behind — then re-read sums that include
   * what the winner just did. Capacity, orders and identity have locked
   * like this since P8; the ledger simply never did.
   */
  async function lockOrder(trx: Transaction<Database>, orderRef: string): Promise<void> {
    await trx
      .selectFrom('ledger_transactions')
      .where('market_id', '=', marketId)
      .where('reference', '=', orderRef)
      .select('id')
      .forUpdate()
      .execute();
  }

  /**
   * One lock per market + seller + currency, held to the end of the
   * transaction. `hashtext` collisions only serialise two sellers who
   * would otherwise have run in parallel — slower, never wrong.
   */
  async function lockSellerBalance(
    trx: Transaction<Database>,
    sellerId: string,
    currency: string,
  ): Promise<void> {
    const key = `sycamore:payout:${marketId}:${sellerId}:${currency}`;
    await sql`select pg_advisory_xact_lock(hashtext(${key})::bigint)`.execute(trx);
  }

  async function orderSums(
    trx: Transaction<Database>,
    orderRef: string,
  ): Promise<{ captured: number; refunded: number; released: number; currency?: string }> {
    const rows = await trx
      .selectFrom('ledger_transactions')
      .where('ledger_transactions.market_id', '=', marketId)
      .where('ledger_transactions.reference', '=', orderRef)
      .innerJoin('ledger_entries', 'ledger_entries.transaction_id', 'ledger_transactions.id')
      .select([
        'ledger_transactions.kind',
        'ledger_entries.direction',
        'ledger_entries.amount_minor',
        'ledger_entries.currency',
      ])
      .where('ledger_entries.account', '=', 'buyer_escrow')
      .execute();
    let captured = 0;
    let refunded = 0;
    let released = 0;
    let currency: string | undefined;
    for (const r of rows) {
      const amount = Number(r.amount_minor);
      if (r.kind === 'capture' && r.direction === 'credit') {
        captured += amount;
        // The currency the money actually arrived in. Everything that
        // leaves escrow afterwards has to agree with it, or a JMD
        // capture can be released in USD and the trial balance — which
        // sums minor units across currencies — will still look level.
        currency ??= r.currency;
      }
      if (r.kind === 'refund' && r.direction === 'debit') refunded += amount;
      if (r.kind === 'release' && r.direction === 'debit') released += amount;
    }
    return { captured, refunded, released, ...(currency === undefined ? {} : { currency }) };
  }

  /** Escrow leaves in the currency it arrived in, or it does not leave. */
  function assertCurrencyMatches(
    orderRef: string,
    captured: string | undefined,
    supplied: string,
  ): void {
    if (captured !== undefined && captured !== supplied) {
      throw new LedgerError(
        `order ${orderRef} was captured in ${captured}; cannot settle it in ${supplied}`,
      );
    }
  }

  return {
    /** Buyer's payment lands in escrow. DR external / CR buyer_escrow. */
    async capture(input: {
      orderRef: string;
      amountMinor: number;
      currency: string;
      idempotencyKey: string;
    }): Promise<{ posted: boolean }> {
      return db.transaction().execute((trx) =>
        postTx(trx, {
          kind: 'capture',
          reference: input.orderRef,
          idempotencyKey: input.idempotencyKey,
          entries: [
            {
              account: 'external',
              direction: 'debit',
              amountMinor: input.amountMinor,
              currency: input.currency,
            },
            {
              account: 'buyer_escrow',
              direction: 'credit',
              amountMinor: input.amountMinor,
              currency: input.currency,
            },
          ],
        }),
      );
    },

    /** Refund back out of escrow. Never exceeds capture − released − refunded. */
    async refund(input: {
      orderRef: string;
      amountMinor: number;
      currency: string;
      idempotencyKey: string;
    }): Promise<{ posted: boolean }> {
      return db.transaction().execute(async (trx) => {
        await lockOrder(trx, input.orderRef);
        const sums = await orderSums(trx, input.orderRef);
        assertCurrencyMatches(input.orderRef, sums.currency, input.currency);
        const available = sums.captured - sums.refunded - sums.released;
        if (input.amountMinor > available) {
          throw new LedgerError(
            `refund ${input.amountMinor} exceeds available escrow ${available} ` +
              `for ${input.orderRef}`,
          );
        }
        return postTx(trx, {
          kind: 'refund',
          reference: input.orderRef,
          idempotencyKey: input.idempotencyKey,
          entries: [
            {
              account: 'buyer_escrow',
              direction: 'debit',
              amountMinor: input.amountMinor,
              currency: input.currency,
            },
            {
              account: 'external',
              direction: 'credit',
              amountMinor: input.amountMinor,
              currency: input.currency,
            },
          ],
        });
      });
    },

    /**
     * Completion-triggered release: escrow splits to seller/platform/
     * referral/processor. One release per order — no order settles twice.
     */
    async release(input: {
      orderRef: string;
      currency: string;
      split: SplitBps;
      idempotencyKey: string;
      sellerId?: string;
      referralSellerId?: string;
    }): Promise<{ posted: boolean; amounts?: ReturnType<typeof computeSplit> }> {
      return db.transaction().execute(async (trx) => {
        await lockOrder(trx, input.orderRef);
        const sums = await orderSums(trx, input.orderRef);
        assertCurrencyMatches(input.orderRef, sums.currency, input.currency);
        if (sums.released > 0) {
          throw new LedgerError(`order ${input.orderRef} already settled — no double release`);
        }
        const releasable = sums.captured - sums.refunded;
        if (releasable <= 0) {
          throw new LedgerError(`nothing to release for ${input.orderRef}`);
        }
        const amounts = computeSplit(releasable, input.split);
        if (amounts.seller <= 0) {
          // Caught at the settlement layer rather than deep inside the
          // entry writer, which used to reject this with "entry amounts
          // are positive integers, got 0" — true, and no help at all in
          // finding the split that caused it. Sycamore does not take the
          // whole of an order.
          throw new LedgerError(
            `split pays the seller nothing for ${input.orderRef}; refusing to settle`,
          );
        }
        const entries: LedgerEntryInput[] = [
          {
            account: 'buyer_escrow',
            direction: 'debit',
            amountMinor: releasable,
            currency: input.currency,
          },
          {
            account: 'seller_payable',
            direction: 'credit',
            amountMinor: amounts.seller,
            currency: input.currency,
            ...(input.sellerId && { sellerId: input.sellerId }),
          },
        ];
        if (amounts.platform > 0) {
          entries.push({
            account: 'platform_fees',
            direction: 'credit',
            amountMinor: amounts.platform,
            currency: input.currency,
          });
        }
        if (amounts.referral > 0) {
          entries.push({
            account: 'referral_credits',
            direction: 'credit',
            amountMinor: amounts.referral,
            currency: input.currency,
            ...(input.referralSellerId && { sellerId: input.referralSellerId }),
          });
        }
        if (amounts.processor > 0) {
          entries.push({
            account: 'processor_fees',
            direction: 'credit',
            amountMinor: amounts.processor,
            currency: input.currency,
          });
        }
        const result = await postTx(trx, {
          kind: 'release',
          reference: input.orderRef,
          idempotencyKey: input.idempotencyKey,
          entries,
        });
        return { ...result, amounts };
      });
    },

    /**
     * Balanced internal adjustment (e.g. funding the Make-Good fund from
     * platform fees, or paying a make-good out of it). Same validation and
     * idempotency as every other posting.
     */
    async postAdjustment(input: {
      reference: string;
      idempotencyKey: string;
      entries: LedgerEntryInput[];
    }): Promise<{ posted: boolean }> {
      return db.transaction().execute((trx) =>
        postTx(trx, {
          kind: 'adjustment',
          reference: input.reference,
          idempotencyKey: input.idempotencyKey,
          entries: input.entries,
        }),
      );
    },

    /** What a seller is owed right now: payable + referral credits. */
    /**
     * What a seller is owed IN ONE CURRENCY. The currency is required
     * because the answer is meaningless without it: this fold used to
     * run across every currency a seller held and return the total as a
     * bare number, which is the reporting half of the payout defect the
     * external review of 2026-09-16 found (money rules, CLAUDE.md:
     * integer minor units AND a currency code, never a bare number).
     */
    async sellerBalances(
      sellerId: string,
      currency: string,
    ): Promise<{ payable: number; referral: number; currency: string }> {
      const rows = await db
        .selectFrom('ledger_entries')
        .where('market_id', '=', marketId)
        .where('seller_id', '=', sellerId)
        .where('currency', '=', currency)
        .select(['account', 'direction', 'amount_minor'])
        .execute();
      let payable = 0;
      let referral = 0;
      for (const r of rows) {
        const signed = r.direction === 'credit' ? Number(r.amount_minor) : -Number(r.amount_minor);
        if (r.account === 'seller_payable') payable += signed;
        if (r.account === 'referral_credits') referral += signed;
      }
      return { payable, referral, currency };
    },

    /**
     * P17 payout: everything the seller is owed (payable + referral
     * credits, settled inside the same batch — no inter-seller invoices)
     * leaves in ONE transaction. Idempotent per batch key.
     */
    async payoutSeller(input: {
      sellerId: string;
      currency: string;
      idempotencyKey: string;
    }): Promise<{ posted: boolean; amountMinor: number }> {
      return db.transaction().execute(async (trx) => {
        // SERIALIZE THIS SELLER'S MONEY.
        //
        // The external review of 2026-09-16 found this function reading
        // a balance and posting against it with nothing holding the
        // seller still. The idempotency key stops the SAME key
        // repeating; it does nothing about two batches with different
        // keys, which is precisely what runPayoutBatch builds. Two
        // workers read 900,000, two workers pay 900,000, and every
        // individual transaction still balances — which is why a trial
        // balance never noticed.
        //
        // A transaction-scoped advisory lock, because there is no single
        // row that means "this seller's balance in this currency": the
        // balance is a fold over entries. Every competing writer takes
        // the same lock, and Postgres releases it at commit or rollback
        // whatever happens to the process holding it.
        await lockSellerBalance(trx, input.sellerId, input.currency);
        const rows = await trx
          .selectFrom('ledger_entries')
          .where('market_id', '=', marketId)
          .where('seller_id', '=', input.sellerId)
          // ...AND IN THIS CURRENCY. Without this the fold summed a
          // seller's JMD and DOP entries into one number and paid it out
          // denominated in whichever currency the caller passed. Nothing
          // concurrent about it — the second defect the review found in
          // these same twenty lines.
          .where('currency', '=', input.currency)
          .select(['account', 'direction', 'amount_minor'])
          .execute();
        let payable = 0;
        let referral = 0;
        for (const r of rows) {
          const signed =
            r.direction === 'credit' ? Number(r.amount_minor) : -Number(r.amount_minor);
          if (r.account === 'seller_payable') payable += signed;
          if (r.account === 'referral_credits') referral += signed;
        }
        const total = payable + referral;
        if (total <= 0) return { posted: false, amountMinor: 0 };
        const entries: LedgerEntryInput[] = [
          {
            account: 'external',
            direction: 'credit',
            amountMinor: total,
            currency: input.currency,
          },
        ];
        if (payable > 0) {
          entries.push({
            account: 'seller_payable',
            direction: 'debit',
            amountMinor: payable,
            currency: input.currency,
            sellerId: input.sellerId,
          });
        }
        if (referral > 0) {
          entries.push({
            account: 'referral_credits',
            direction: 'debit',
            amountMinor: referral,
            currency: input.currency,
            sellerId: input.sellerId,
          });
        }
        const res = await postTx(trx, {
          kind: 'payout',
          reference: `payout:${input.sellerId}`,
          idempotencyKey: input.idempotencyKey,
          entries,
        });
        return { posted: res.posted, amountMinor: res.posted ? total : 0 };
      });
    },

    /** Signed balance per account (debit-positive convention). */
    async accountBalance(account: LedgerAccount): Promise<number> {
      const rows = await db
        .selectFrom('ledger_entries')
        .where('market_id', '=', marketId)
        .where('account', '=', account)
        .select(['direction', 'amount_minor'])
        .execute();
      return rows.reduce(
        (sum, r) =>
          sum + (r.direction === 'debit' ? Number(r.amount_minor) : -Number(r.amount_minor)),
        0,
      );
    },

    /** THE invariant: Σdebits = Σcredits across the whole market, always. */
    async trialBalance(): Promise<{ debits: number; credits: number }> {
      const rows = await db
        .selectFrom('ledger_entries')
        .where('market_id', '=', marketId)
        .select(['direction', 'amount_minor'])
        .execute();
      let debits = 0;
      let credits = 0;
      for (const r of rows) {
        if (r.direction === 'debit') debits += Number(r.amount_minor);
        else credits += Number(r.amount_minor);
      }
      return { debits, credits };
    },

    async orderSummary(orderRef: string) {
      return db.transaction().execute((trx) => orderSums(trx, orderRef));
    },
  };
}

export type LedgerService = ReturnType<typeof ledgerService>;
