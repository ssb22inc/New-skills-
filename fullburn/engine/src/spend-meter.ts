/** Per-client AI spend metering (adversary finding R3): llm() checks caps
 * locally and deterministically BEFORE every call — never delegated to Gateway
 * config. Fail-closed: an unavailable meter refuses spend rather than allowing
 * it. Production backing is the client's Durable Object (Phase 2+). */

export interface SpendMeter {
  /** Today's recorded AI spend for the client, USD. Throws if unavailable. */
  todayUsd(clientId: string): number;
  /** Record spend after a permitted call. */
  record(clientId: string, usd: number): void;
}

export class MeterUnavailableError extends Error {}

export class MemorySpendMeter implements SpendMeter {
  #totals = new Map<string, number>();
  #available = true;

  setAvailable(v: boolean): void {
    this.#available = v;
  }

  todayUsd(clientId: string): number {
    if (!this.#available) throw new MeterUnavailableError("spend meter unavailable — refusing spend (fail closed)");
    return this.#totals.get(clientId) ?? 0;
  }

  record(clientId: string, usd: number): void {
    if (!this.#available) throw new MeterUnavailableError("spend meter unavailable — refusing spend (fail closed)");
    this.#totals.set(clientId, (this.#totals.get(clientId) ?? 0) + usd);
  }
}
