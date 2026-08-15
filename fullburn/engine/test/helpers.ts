import type { GatewayTransport } from "../src/gateway.ts";
import { MemorySpendMeter } from "../src/spend-meter.ts";
import { MemoryTraceSink } from "../src/tracing.ts";
import { MemoryVaultBackend, vaultForClient } from "../src/vault.ts";

/** `testco` is a fixture CLIENT in the real frozen caps table (config/caps.ts),
 * not an injected table: llm() reads its ceiling from config and a caller can
 * only narrow it, never widen it (adversary finding R2-03). Its real ceiling is
 * $5.00/day AI spend. */
export const TEST_CLIENT = "testco";
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
    },
  };
}
