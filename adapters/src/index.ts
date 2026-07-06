export const WORKSPACE = '@sycamore/adapters';

export type {
  TaskType,
  LlmRequest,
  LlmResponse,
  LlmProvider,
  VendorConfig,
  Route,
  RoutingTable,
} from './llm/types.js';
export { assertPiiRoutingAllowed, PiiRoutingViolation } from './llm/policy.js';
export { createLlmRouter, LlmRouterError, type LlmRouter } from './llm/router.js';
export { mockProvider, type MockProviderOptions } from './llm/providers/mock.js';
export { anthropicProvider, type AnthropicProviderOptions } from './llm/providers/anthropic.js';
export {
  openAiCompatProvider,
  type OpenAiCompatProviderOptions,
} from './llm/providers/openai-compat.js';
export type {
  PaymentAdapter,
  PaymentLink,
  PaymentWebhookEvent,
  PaymentEventType,
} from './payments/types.js';
export { mockPay, MOCK_PAY_SECRET, type WebhookDelivery } from './payments/mock-pay.js';
export { lynkPayments, type LynkOptions } from './payments/lynk.js';
export type { AsrAdapter, AsrResult } from './media/asr/types.js';
export { mockAsr } from './media/asr/mock.js';
export { whisperAsr, type WhisperOptions } from './media/asr/whisper.js';
