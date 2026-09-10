import type { LlmProvider, LlmRequest, LlmResponse } from '../types.js';

export interface OpenAiCompatProviderOptions {
  id: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  maxTokensDefault?: number;
}

/**
 * The cheap-provider shape: one adapter covers every OpenAI-compatible
 * vendor (DeepSeek, Qwen, ...) — swapping vendors is config, not code.
 */
export function openAiCompatProvider(options: OpenAiCompatProviderOptions): LlmProvider {
  return {
    id: options.id,
    model: options.model,
    async complete(request: LlmRequest): Promise<LlmResponse> {
      const res = await fetch(`${options.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({
          model: options.model,
          max_tokens: request.maxTokens ?? options.maxTokensDefault ?? 1024,
          messages: [
            ...(request.system !== undefined ? [{ role: 'system', content: request.system }] : []),
            { role: 'user', content: request.prompt },
          ],
        }),
      });
      if (!res.ok) {
        throw new Error(`${options.id} request failed: ${res.status} ${await res.text()}`);
      }
      const body = (await res.json()) as {
        choices: { message: { content: string | null } }[];
      };
      return {
        text: body.choices[0]?.message.content ?? '',
        providerId: options.id,
        model: options.model,
      };
    },
  };
}
