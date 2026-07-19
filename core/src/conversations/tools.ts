import { z } from 'zod';
import type { Intent } from './intents.js';

/**
 * The allow-list (P10, BUILD §5.7): tool calls are permitted PER INTENT
 * with hard caps. This registry is the entire attack surface — a tool
 * that is not listed here does not exist, no matter what any model,
 * message, or "admin" claims. Refunds, payouts, and admin actions are
 * deliberately absent: the conversation layer cannot reach them at all.
 */

export const TOOL_ARG_SCHEMAS = {
  check_availability: z.object({ windowId: z.string().uuid() }).strict(),
  place_hold: z
    .object({ windowId: z.string().uuid(), units: z.number().int().min(1).max(20) })
    .strict(),
  cancel_order: z.object({ orderId: z.string().uuid() }).strict(),
  reschedule_order: z
    .object({ orderId: z.string().uuid(), targetWindowId: z.string().uuid() })
    .strict(),
  quote_price: z.object({ windowId: z.string().uuid(), units: z.number().int().min(1) }).strict(),
  create_payment_link: z.object({ orderId: z.string().uuid() }).strict(),
} as const;

export type ToolName = keyof typeof TOOL_ARG_SCHEMAS;

export interface ToolPolicy {
  tool: ToolName;
  maxCalls: number;
}

export const INTENT_ALLOW_LIST: Record<Intent, ToolPolicy[]> = {
  book: [
    { tool: 'check_availability', maxCalls: 3 },
    { tool: 'place_hold', maxCalls: 1 },
    { tool: 'create_payment_link', maxCalls: 1 },
  ],
  cancel: [{ tool: 'cancel_order', maxCalls: 1 }],
  reschedule: [
    { tool: 'check_availability', maxCalls: 3 },
    { tool: 'reschedule_order', maxCalls: 1 },
  ],
  stock: [{ tool: 'check_availability', maxCalls: 3 }],
  price: [{ tool: 'quote_price', maxCalls: 3 }],
  complaint: [], // ZERO tools and zero bot reply — humans handle complaints
  other: [],
};

export interface ToolCallRequest {
  tool: string;
  args: unknown;
}

export type ToolCallDecision =
  | { allowed: true; tool: ToolName; args: unknown }
  | { allowed: false; tool: string; reason: string };

/**
 * Gatekeeper: filters a batch of requested tool calls against the intent's
 * allow-list, argument schemas, and per-tool caps. Pure and total — it
 * never throws on hostile input, it just refuses.
 */
export function authorizeToolCalls(
  intent: Intent,
  requests: ToolCallRequest[],
): ToolCallDecision[] {
  const policies = new Map(INTENT_ALLOW_LIST[intent].map((p) => [p.tool, p]));
  const used = new Map<ToolName, number>();
  return requests.map((request) => {
    const policy = policies.get(request.tool as ToolName);
    if (!policy) {
      return {
        allowed: false,
        tool: request.tool,
        reason: `tool "${request.tool}" is not allow-listed for intent "${intent}"`,
      };
    }
    const count = used.get(policy.tool) ?? 0;
    if (count >= policy.maxCalls) {
      return {
        allowed: false,
        tool: request.tool,
        reason: `hard cap reached: "${policy.tool}" allows ${policy.maxCalls} call(s) per message`,
      };
    }
    const parsed = TOOL_ARG_SCHEMAS[policy.tool].safeParse(request.args);
    if (!parsed.success) {
      return {
        allowed: false,
        tool: request.tool,
        reason: `arguments failed validation for "${policy.tool}"`,
      };
    }
    used.set(policy.tool, count + 1);
    return { allowed: true, tool: policy.tool, args: parsed.data };
  });
}
