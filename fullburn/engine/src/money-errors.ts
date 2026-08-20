/** THE ONE ERROR IDENTITY FOR A REFUSED SPEND.
 *
 * It lived in `spend-meter.ts`, then moved to `spend-ledger.ts` when the
 * arithmetic did (R12-01). Both moves were forced by import direction rather
 * than chosen, and each left a re-export chain behind. It has no dependencies
 * and every money module needs it, so it lives on its own — no cycle to route
 * around, and one class identity for `instanceof` wherever it is caught. */
export class MeterUnavailableError extends Error {}
