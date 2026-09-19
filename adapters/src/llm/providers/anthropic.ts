import type { LlmProvider, LlmRequest, LlmResponse } from '../types.js';

export interface AnthropicProviderOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  maxTokensDefault?: number;
}

/**
 * The strong provider (money-math, compliance). Plain fetch — no SDK
 * dependency (Constitution §1.7). Enters real use only when an API key is
 * configured; every test runs on the mock provider.
 */
export function anthropicProvider(options: AnthropicProviderOptions): LlmProvider {
  const baseUrl = options.baseUrl ?? 'https://api.anthropic.com';
  return {
    id: 'anthropic',
    model: options.model,
    async complete(request: LlmRequest): Promise<LlmResponse> {
      const res = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': options.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: options.model,
          max_tokens: request.maxTokens ?? options.maxTokensDefault ?? 1024,
          ...(request.system !== undefined && { system: request.system }),
          messages: [{ role: 'user', content: request.prompt }],
        }),
      });
      if (!res.ok) {
        throw new Error(`anthropic request failed: ${res.status} ${await res.text()}`);
      }
      const body = (await res.json()) as { content: { type: string; text?: string }[] };
      const text = body.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text ?? '')
        .join('');
      return { text, providerId: 'anthropic', model: options.model };
    },
  };
}
