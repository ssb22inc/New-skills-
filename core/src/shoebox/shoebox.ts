import { sql, type Kysely } from 'kysely';
import type { ContextPack } from '@sycamore/packs';
import { formatAmount } from '@sycamore/packs';
import type { Database } from '../db/types.js';
import { textPdf } from './pdf.js';

export interface ShoeboxTotals {
  salesMinor: number; // gross captured on the seller's orders
  refundsMinor: number;
  feesMinor: number; // platform + processor shares on released orders
  payoutsMinor: number; // what actually left to the seller
}

export interface ShoeboxPack {
  totals: ShoeboxTotals;
  message: string;
  csv: string;
  pdf: Buffer;
  thresholdStatus: 'nothing_to_do' | 'approaching' | 'over';
}

/** The mandatory line — records, never advice. */
export const TAX_DISCLAIMER =
  'These are your records, not tax advice — carry them to your accountant or TAJ.';

/**
 * P19 — The Shoebox: a formatting job on the ledger. One plain-language
 * message a month + a one-tap record pack (CSV + PDF) + the GCT
 * registration threshold watch from the context pack.
 */
export function shoeboxService(db: Kysely<Database>, marketId: string, pack: ContextPack) {
  async function sellerMonthRows(sellerId: string, from: Date, to: Date) {
    return db
      .selectFrom('ledger_transactions')
      .innerJoin('ledger_entries', 'ledger_entries.transaction_id', 'ledger_transactions.id')
      .innerJoin('orders', (join) =>
        join.on(sql`orders.id::text`, '=', sql`ledger_transactions.reference`),
      )
      .where('ledger_transactions.market_id', '=', marketId)
      .where('orders.seller_id', '=', sellerId)
      .where('ledger_transactions.created_at', '>=', from)
      .where('ledger_transactions.created_at', '<', to)
      .select([
        'ledger_transactions.kind',
        'ledger_transactions.reference',
        'ledger_transactions.created_at',
        'ledger_entries.account',
        'ledger_entries.direction',
        'ledger_entries.amount_minor',
      ])
      .orderBy('ledger_transactions.id', 'asc')
      .execute();
  }

  async function totalsFor(sellerId: string, from: Date, to: Date): Promise<ShoeboxTotals> {
    const rows = await sellerMonthRows(sellerId, from, to);
    let sales = 0;
    let refunds = 0;
    let fees = 0;
    for (const r of rows) {
      const amount = Number(r.amount_minor);
      if (r.kind === 'capture' && r.account === 'buyer_escrow' && r.direction === 'credit') {
        sales += amount;
      }
      if (r.kind === 'refund' && r.account === 'buyer_escrow' && r.direction === 'debit') {
        refunds += amount;
      }
      if (
        r.kind === 'release' &&
        (r.account === 'platform_fees' || r.account === 'processor_fees') &&
        r.direction === 'credit'
      ) {
        fees += amount;
      }
    }
    // Payouts reference `payout:<sellerId>`, not an order — query directly.
    const payoutRows = await db
      .selectFrom('ledger_transactions')
      .innerJoin('ledger_entries', 'ledger_entries.transaction_id', 'ledger_transactions.id')
      .where('ledger_transactions.market_id', '=', marketId)
      .where('ledger_transactions.kind', '=', 'payout')
      .where('ledger_transactions.reference', '=', `payout:${sellerId}`)
      .where('ledger_transactions.created_at', '>=', from)
      .where('ledger_transactions.created_at', '<', to)
      .where('ledger_entries.account', '=', 'external')
      .where('ledger_entries.direction', '=', 'credit')
      .select('ledger_entries.amount_minor')
      .execute();
    const payouts = payoutRows.reduce((s, r) => s + Number(r.amount_minor), 0);
    return { salesMinor: sales, refundsMinor: refunds, feesMinor: fees, payoutsMinor: payouts };
  }

  return {
    totalsFor,

    async monthlyPack(sellerId: string, year: number, month: number): Promise<ShoeboxPack> {
      const from = new Date(Date.UTC(year, month - 1, 1));
      const to = new Date(Date.UTC(year, month, 1));
      const totals = await totalsFor(sellerId, from, to);

      // Threshold watch: rolling 12 months of gross sales vs the pack's
      // GCT registration threshold.
      const yearAgo = new Date(Date.UTC(year - 1, month - 1, 1));
      const rolling = await totalsFor(sellerId, yearAgo, to);
      const threshold = pack.tax.gct_registration_threshold.amount_minor;
      const thresholdStatus =
        rolling.salesMinor >= threshold
          ? 'over'
          : rolling.salesMinor >= threshold * 0.8
            ? 'approaching'
            : 'nothing_to_do';

      const monthLabel = `${year}-${String(month).padStart(2, '0')}`;
      const f = (n: number) => formatAmount(pack, n);
      const thresholdLine =
        thresholdStatus === 'over'
          ? `Heads up: your last 12 months of sales (${f(rolling.salesMinor)}) crossed the GCT registration threshold. Time to talk to your accountant.`
          : thresholdStatus === 'approaching'
            ? `Heads up: your last 12 months of sales (${f(rolling.salesMinor)}) are getting close to the GCT registration threshold. Nothing due yet — just know it's coming.`
            : 'GCT: nothing to do this month.';
      const message = [
        `Your ${monthLabel} money, plain and simple:`,
        `You sold ${f(totals.salesMinor)}.`,
        `Refunds gave back ${f(totals.refundsMinor)}.`,
        `Fees took ${f(totals.feesMinor)}.`,
        `${f(totals.payoutsMinor)} was paid out to you.`,
        thresholdLine,
        TAX_DISCLAIMER,
      ].join('\n');

      const rows = await sellerMonthRows(sellerId, from, to);
      const csv = [
        'date,kind,reference,account,direction,amount_minor,currency',
        ...rows.map(
          (r) =>
            `${new Date(r.created_at).toISOString()},${r.kind},${r.reference},${r.account},` +
            `${r.direction},${Number(r.amount_minor)},${pack.currency.code}`,
        ),
      ].join('\n');

      const pdf = textPdf(`Sycamore record pack — ${monthLabel}`, [
        `Sales: ${f(totals.salesMinor)}`,
        `Refunds: ${f(totals.refundsMinor)}`,
        `Fees: ${f(totals.feesMinor)}`,
        `Paid out: ${f(totals.payoutsMinor)}`,
        '',
        TAX_DISCLAIMER,
      ]);

      return { totals, message, csv, pdf, thresholdStatus };
    },
  };
}

export type ShoeboxService = ReturnType<typeof shoeboxService>;
