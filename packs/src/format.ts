import type { ContextPack } from './context.js';
import type { VerticalPack } from './vertical.js';

/**
 * Pack-driven rendering helpers. Nothing here knows about any market or
 * vertical: the symbol, exponent, and unit names come from the pack or the
 * call fails to compile. This is the "zero hardcoded fallbacks" mechanism.
 */

export function formatAmount(pack: ContextPack, amountMinor: number): string {
  if (!Number.isInteger(amountMinor)) {
    throw new TypeError(`money must be integer minor units, got ${amountMinor}`);
  }
  const { symbol, exponent } = pack.currency;
  const major = amountMinor / 10 ** exponent;
  const rendered = major.toLocaleString('en-US', {
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  });
  return `${symbol}${rendered}`;
}

export function unitLabel(pack: VerticalPack, count: number): string {
  const unit = count === 1 ? pack.capacity.unit_singular : pack.capacity.unit_plural;
  return `${count} ${unit}`;
}
