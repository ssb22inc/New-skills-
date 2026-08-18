import { effectiveAiCapsUsd } from "@fullburn/config/caps";
import type { GatewayTransport } from "../src/gateway.ts";
import { FrozenCapsSpendMeter, MemorySpendMeter } from "../src/spend-meter.ts";
import { MemoryTraceSink } from "../src/tracing.ts";
import { MemoryVaultBackend, vaultForClient } from "../src/vault.ts";

/** `fixture-testco` is a fixture CLIENT in the real frozen caps table (config/caps.ts),
 * not an injected table: llm() reads its ceiling from config and a caller can
 * only narrow it, never widen it (adversary finding R2-03). Its real ceiling is
 * $5.00/day AI spend. */
export const TEST_CLIENT = "fixture-testco";
export const CANARY_SECRET = "canary-vault-value-do-not-leak-8891";

/** Narrowing override used by breach tests: lowers testco's ceiling to $0.05.
 * It cannot raise a cap, invent a client, or supply a sign-off. */
export const LOW_CAP_NARROWING: Readonly<Record<string, { readonly dailyAiSpendUsd: number }>> = {
  [TEST_CLIENT]: { dailyAiSpendUsd: 0.05 },
};

export class MockGatewayServer implements GatewayTransport {
  requests: { url: string; body: unknown; headers: Record<string, string> }[] = [];
  response: unknown = { greeting: "hello from the mock gateway" };

  async post(url: string, body: unknown, headers: Readonly<Record<string, string>>): Promise<unknown> {
    this.requests.push({ url, body, headers: { ...headers } });
    return this.response;
  }
}

/** One clock for the whole harness. The meter used to be constructed with the
 * epoch default while `llm()` was handed Aug 2025 — two clocks on one money
 * path, which is how N-01's frozen day key stayed invisible. */
export const TEST_NOW_MS = 1_755_000_000_000;
export const testClock = () => TEST_NOW_MS;

/** A caps resolver for meters built directly in a test. Fixed ceilings and a
 * fixed accounting zone, so a test says what it means rather than inheriting
 * the frozen table. Use `capsFrom` when the real table is the point. */
export const fixedCaps = () => ({ dailyUsd: 200, monthlyUsd: 200, timeZone: "UTC" });

/** A REAL production meter whose `settle()` throws, for the storage-failure
 * paths (M-01, M-04, N-07).
 *
 * `llm()` refuses a hand-built meter object now (R8-01), so fault injection
 * patches the instance rather than faking the type. It patches `settle` and
 * `release` and NEVER `reserve`: `reserve` is the method the frozen-caps brand
 * pins, because it is the only one that reads a ceiling. A settle that throws
 * cannot mint headroom — the reservation stays open and keeps counting — which
 * is exactly why it is safe to leave unpinned and exactly what these tests are
 * about. */
export function meterWithFailingSettle(now: () => number = testClock) {
  const meter = new FrozenCapsSpendMeter();
  let released = 0;
  const realRelease = meter.release.bind(meter);
  Object.defineProperty(meter, "settle", {
    value: () => {
      throw new Error("storage put failed");
    },
  });
  Object.defineProperty(meter, "release", {
    value: (r: Parameters<typeof realRelease>[0]) => {
      released += 1;
      realRelease(r);
    },
  });
  return { meter, releases: () => released };
}

/** A resolver with ceilings a test chooses explicitly. */
export const capsOf = (dailyUsd: number, monthlyUsd: number, timeZone = "UTC") => () => ({
  dailyUsd,
  monthlyUsd,
  timeZone,
});

/** The real, frozen ceilings for a client, in that client's accounting zone. */
export const capsFrom = (clientId: string) => () => effectiveAiCapsUsd(clientId);

/** `now` and `transport` are overridable so a test can drive a clock across a
 * day boundary, or hand `llm()` a transport that fails in a specific way. The
 * meter and `llm()` always share ONE clock — two clocks on one money path is
 * how N-01's frozen day key hid in plain sight. */
export function makeDeps(overrides: { now?: () => number; transport?: unknown; capsTable?: Readonly<Record<string, { readonly dailyAiSpendUsd?: number; readonly monthlyAiSpendUsd?: number }>> } = {}) {
  const now = overrides.now ?? testClock;
  const backend = new MemoryVaultBackend();
  backend.set(TEST_CLIENT, "ai-gateway-key", CANARY_SECRET);
  // THE PRODUCTION METER, not a test double with an injected resolver. `llm()`
  // refuses any other kind, so a test that built a wide meter would fail
  // closed here rather than quietly proving the cap works against a ceiling
  // the test itself chose (adversary finding R8-01). The narrowing table is
  // the only thing a caller may supply, and it cannot widen.
  const meter = new FrozenCapsSpendMeter(overrides.capsTable);
  const sink = new MemoryTraceSink();
  const transport = (overrides.transport ?? new MockGatewayServer()) as MockGatewayServer;
  return {
    backend,
    meter,
    sink,
    transport,
    deps: {
      transport,
      vault: vaultForClient(backend, TEST_CLIENT),
      meter,
      sink,
      gatewayBaseUrl: "https://gateway.ai.cloudflare.com/v1/test-account/fullburn/",
      now,
    },
  };
}
