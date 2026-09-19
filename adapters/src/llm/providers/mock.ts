import type { LlmProvider, LlmRequest, LlmResponse } from '../types.js';

export interface MockProviderOptions {
  id: string;
  model?: string;
  /** Fail the first N calls before succeeding (failover testing). */
  failFirst?: number;
  /** Fail every call. */
  alwaysFail?: boolean;
  reply?: (request: LlmRequest) => string;
}

/** In-memory provider used by all tests; records every request it serves. */
export function mockProvider(options: MockProviderOptions): LlmProvider & {
  calls: LlmRequest[];
} {
  let remainingFailures = options.failFirst ?? 0;
  const calls: LlmRequest[] = [];
  return {
    id: options.id,
    model: options.model ?? 'mock-model',
    calls,
    complete(request: LlmRequest): Promise<LlmResponse> {
      calls.push(request);
      if (options.alwaysFail || remainingFailures > 0) {
        remainingFailures--;
        return Promise.reject(new Error(`mock provider "${options.id}" simulated failure`));
      }
      return Promise.resolve({
        text: options.reply ? options.reply(request) : `mock:${options.id}:${request.task}`,
        providerId: options.id,
        model: options.model ?? 'mock-model',
      });
    },
  };
}
