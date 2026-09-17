import { PaymentAmbiguous, PaymentRefused } from './types.js';

/**
 * ONE PLACE THAT DECIDES WHAT A FAILURE MEANT (C05).
 *
 * Both provider skeletons used to do `if (!res.ok) throw new Error(...)`,
 * which flattens three different worlds into one:
 *
 *   the provider said no          → nothing moved, release the money
 *   the provider never answered   → something may have moved, ASK
 *   the provider answered fine    → it is accepted, wait for the webhook
 *
 * The external review of 2026-09-16 found the consequence one layer up:
 * any exception rerouted the transfer to a second provider, which is how
 * a timeout after acceptance becomes two payments. The reroute is gone;
 * this is the other half — telling the caller which world it is in.
 *
 * The rule: a 4xx is an answer (refused). A 5xx, a timeout, an aborted
 * connection or a DNS failure is NOT an answer (ambiguous). 408 and 429
 * are 4xx that mean "no answer yet", so they count as ambiguous too.
 */
export async function providerPost(
  provider: string,
  url: string,
  init: RequestInit,
  timeoutMs = 20_000,
): Promise<unknown> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: abort.signal });
  } catch (cause) {
    // Never arrived, or arrived and the answer did not come back. From
    // here those are indistinguishable, and only the provider knows.
    throw new PaymentAmbiguous(
      provider,
      `${provider} did not answer ${url} — the outcome is unknown and must be reconciled, ` +
        'never retried blind',
      { cause },
    );
  } finally {
    clearTimeout(timer);
  }
  if (res.ok) return res.json().catch(() => ({}));
  const body = await res.text().catch(() => '');
  if (res.status === 408 || res.status === 429 || res.status >= 500) {
    throw new PaymentAmbiguous(
      provider,
      `${provider} answered ${res.status} for ${url} — no decision was reached: ${body.slice(0, 200)}`,
    );
  }
  throw new PaymentRefused(
    provider,
    `${provider} refused ${url} with ${res.status}: ${body.slice(0, 200)}`,
    String(res.status),
  );
}

/**
 * Credentials and endpoints fail CLOSED in production (C05: "Make
 * credentials and provider configuration fail closed in production").
 *
 * Both skeletons default to `.example` hosts that do not exist. In
 * development that is the point; in production it is a live payment
 * adapter pointed at nothing, and the failure it produces looks like a
 * provider outage rather than a configuration mistake.
 */
export function assertUsableInProduction(provider: string, baseUrl: string, key: string): void {
  if (process.env.NODE_ENV !== 'production') return;
  if (baseUrl.includes('.example')) {
    throw new Error(
      `${provider} is configured with the placeholder host ${baseUrl} in production — ` +
        'set its real sandbox or live base URL, or do not register this adapter',
    );
  }
  if (!key || key.length < 8 || /^(test|demo|changeme|placeholder)/i.test(key)) {
    throw new Error(`${provider} has no usable credential in production`);
  }
}
