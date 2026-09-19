/**
 * The LLM port: one interface, many providers. Core code only ever sees
 * LlmRouter — never a vendor SDK or endpoint (BUILD §2).
 */

export type TaskType =
  'routine-reply' | 'intent-detection' | 'money-math' | 'compliance' | 'creative';

export interface LlmRequest {
  task: TaskType;
  prompt: string;
  system?: string;
  maxTokens?: number;
  /**
   * REQUIRED, no default: the caller must decide. PII-flagged requests may
   * only reach vendors with a signed DPA — enforced in code, not prompts.
   */
  containsPii: boolean;
}

export interface LlmResponse {
  text: string;
  providerId: string;
  model: string;
}

export interface LlmProvider {
  readonly id: string;
  readonly model: string;
  complete(request: LlmRequest): Promise<LlmResponse>;
}

/** Vendor facts live in config; the provider object never self-certifies. */
export interface VendorConfig {
  provider: LlmProvider;
  dpaSigned: boolean;
}

export interface Route {
  primary: string;
  fallbacks: string[];
}

export type RoutingTable = Record<TaskType, Route>;
