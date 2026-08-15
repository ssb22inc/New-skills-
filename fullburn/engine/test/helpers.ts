import type { ClientCaps } from "@fullburn/config/caps";
import type { GatewayTransport } from "../src/gateway.ts";
import { MemorySpendMeter } from "../src/spend-meter.ts";
import { MemoryTraceSink } from "../src/tracing.ts";
import { MemoryVaultBackend, vaultForClient } from "../src/vault.ts";

export const TEST_CLIENT = "testco";
export const CANARY_SECRET = "canary-vault-value-do-not-leak-8891";

/** Signed test caps: production caps stay unsigned until H8; tests need a
 * signed table to exercise the paths past the sign-off gate. */
export const SIGNED_TEST_CAPS: Readonly<Record<string, ClientCaps>> = {
  [TEST_CLIENT]: {
    dailyAdSpendUsd: 70,
    totalAdSpendUsd: 2000,
    dailyAiSpendUsd: 1.0,
    humanSignoff: "test-fixture-signoff",
  },
};

/** Tiny cap so breach tests hit the ceiling in a handful of calls. */
export const LOW_CAP_TEST_CAPS: Readonly<Record<string, ClientCaps>> = {
  [TEST_CLIENT]: { ...SIGNED_TEST_CAPS[TEST_CLIENT]!, dailyAiSpendUsd: 0.05 },
};

export class MockGatewayServer implements GatewayTransport {
  requests: { url: string; body: unknown; headers: Record<string, string> }[] = [];
  response: unknown = { greeting: "hello from the mock gateway" };

  async post(url: string, body: unknown, headers: Readonly<Record<string, string>>): Promise<unknown> {
    this.requests.push({ url, body, headers: { ...headers } });
    return this.response;
  }
}

export function makeDeps() {
  const backend = new MemoryVaultBackend();
  backend.set(TEST_CLIENT, "ai-gateway-key", CANARY_SECRET);
  const meter = new MemorySpendMeter();
  const sink = new MemoryTraceSink();
  const transport = new MockGatewayServer();
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
      now: () => 1_755_000_000_000,
      capsTable: SIGNED_TEST_CAPS,
    },
  };
}
