import type { Kysely, Transaction } from 'kysely';
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
  const total = bps.sellerBps + bps.platformBps + bps.referralBps + bps.processorBps;
  if (total !== 10_000) {
    throw new LedgerError(`split must sum to exactly 10000 bps, got ${total}`);
  }
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new LedgerError(`amount must be a positive integer, got ${amountMinor}`);
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

  async function orderSums(
    trx: Transaction<Database>,
    orderRef: string,
  ): Promise<{ captured: number; refunded: number; released: number }> {
    const rows = await trx
      .selectFrom('ledger_transactions')
      .where('ledger_transactions.market_id', '=', marketId)
      .where('ledger_transactions.reference', '=', orderRef)
      .innerJoin('ledger_entries', 'ledger_entries.transaction_id', 'ledger_transactions.id')
      .select([
        'ledger_transactions.kind',
        'ledger_entries.direction',
        'ledger_entries.amount_minor',
      ])
      .where('ledger_entries.account', '=', 'buyer_escrow')
      .execute();
    let captured = 0;
    let refunded = 0;
    let released = 0;
    for (const r of rows) {
      const amount = Number(r.amount_minor);
      if (r.kind === 'capture' && r.direction === 'credit') captured += amount;
      if (r.kind === 'refund' && r.direction === 'debit') refunded += amount;
      if (r.kind === 'release' && r.direction === 'debit') released += amount;
    }
    return { captured, refunded, released };
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
        const sums = await orderSums(trx, input.orderRef);
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
        const sums = await orderSums(trx, input.orderRef);
        if (sums.released > 0) {
          throw new LedgerError(`order ${input.orderRef} already settled — no double release`);
        }
        const releasable = sums.captured - sums.refunded;
        if (releasable <= 0) {
          throw new LedgerError(`nothing to release for ${input.orderRef}`);
        }
        const amounts = computeSplit(releasable, input.split);
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

    /** What a seller is owed right now: payable + referral credits. */
    async sellerBalances(sellerId: string): Promise<{ payable: number; referral: number }> {
      const rows = await db
        .selectFrom('ledger_entries')
        .where('market_id', '=', marketId)
        .where('seller_id', '=', sellerId)
        .select(['account', 'direction', 'amount_minor'])
        .execute();
      let payable = 0;
      let referral = 0;
      for (const r of rows) {
        const signed = r.direction === 'credit' ? Number(r.amount_minor) : -Number(r.amount_minor);
        if (r.account === 'seller_payable') payable += signed;
        if (r.account === 'referral_credits') referral += signed;
      }
      return { payable, referral };
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
        const rows = await trx
          .selectFrom('ledger_entries')
          .where('market_id', '=', marketId)
          .where('seller_id', '=', input.sellerId)
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
