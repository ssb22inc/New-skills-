import type { Kysely } from 'kysely';
import type { LlmRouter } from '@sycamore/adapters';
import type { ContextPack, VerticalPack } from '@sycamore/packs';
import { formatAmount } from '@sycamore/packs';
import type { Database } from '../db/types.js';
import { capacityEngine } from '../capacity/engine.js';
import { ordersService } from '../orders/orders.js';
import { conversationEngine, type ConversationAction } from '../conversations/engine.js';
import type { Intent } from '../conversations/intents.js';
import type { ToolCallRequest, ToolName } from '../conversations/tools.js';

export interface ToolExecution {
  tool: ToolName;
  result:
    | { kind: 'availability'; total: number; available: number }
    | { kind: 'booked'; orderId: string }
    | { kind: 'waitlisted' }
    | { kind: 'cancelled'; orderId: string }
    | { kind: 'rescheduled'; orderId: string }
    | { kind: 'quote'; amountMinor: number; rendered: string }
    | { kind: 'refused'; reason: string };
}

export interface AutopilotResult {
  action: ConversationAction;
  executions: ToolExecution[];
}

export interface AutopilotDeps {
  db: Kysely<Database>;
  router: LlmRouter;
  contextPack: ContextPack;
  verticalPacks: Map<string, VerticalPack>;
  proposeToolCalls?: (intent: Intent, text: string) => Promise<ToolCallRequest[]>;
}

/**
 * P11 — Autopilot end-to-end: conversations decide, the allow-list
 * authorizes, and THIS module executes against live capacity and orders.
 * The bot can never promise capacity that doesn't exist because every
 * answer here is computed from the same rows the booking path locks.
 */
export function autopilot(deps: AutopilotDeps, marketId: string) {
  const engine = capacityEngine(deps.db, marketId);
  const orders = ordersService(deps.db, marketId);
  const conversations = conversationEngine(
    {
      db: deps.db,
      router: deps.router,
      pack: deps.contextPack,
      ...(deps.proposeToolCalls && { proposeToolCalls: deps.proposeToolCalls }),
    },
    marketId,
  );

  async function execute(
    userId: string,
    tool: ToolName,
    args: unknown,
  ): Promise<ToolExecution['result']> {
    switch (tool) {
      case 'check_availability': {
        const { windowId } = args as { windowId: string };
        const a = await engine.availability(windowId);
        return { kind: 'availability', ...a };
      }
      case 'place_hold': {
        const { windowId, units } = args as { windowId: string; units: number };
        const window = await deps.db
          .selectFrom('capacity_windows')
          .where('market_id', '=', marketId)
          .where('id', '=', windowId)
          .selectAll()
          .executeTakeFirst();
        if (!window) return { kind: 'refused', reason: 'window not found' };
        const order = await orders.createDraft({
          sellerId: window.seller_id,
          buyerUserId: userId,
          windowId,
          verticalId: window.vertical_id,
          units,
        });
        const outcome = await orders.placeHold(order.id);
        return outcome.status === 'held'
          ? { kind: 'booked', orderId: order.id }
          : { kind: 'waitlisted' };
      }
      case 'cancel_order': {
        const { orderId } = args as { orderId: string };
        const order = await orders.get(orderId);
        if (!order || order.buyer_user_id !== userId) {
          return { kind: 'refused', reason: 'order not found for this customer' };
        }
        await orders.cancel(orderId);
        return { kind: 'cancelled', orderId };
      }
      case 'reschedule_order': {
        const { orderId, targetWindowId } = args as { orderId: string; targetWindowId: string };
        const order = await orders.get(orderId);
        if (!order || order.buyer_user_id !== userId) {
          return { kind: 'refused', reason: 'order not found for this customer' };
        }
        await orders.reschedule(orderId, targetWindowId);
        return { kind: 'rescheduled', orderId };
      }
      case 'quote_price': {
        const { windowId, units } = args as { windowId: string; units: number };
        const window = await deps.db
          .selectFrom('capacity_windows')
          .where('market_id', '=', marketId)
          .where('id', '=', windowId)
          .selectAll()
          .executeTakeFirst();
        if (!window) return { kind: 'refused', reason: 'window not found' };
        const amountMinor = Number(window.unit_price_minor) * units;
        return {
          kind: 'quote',
          amountMinor,
          rendered: formatAmount(deps.contextPack, amountMinor),
        };
      }
    }
  }

  return {
    conversations,

    async handleInbound(input: { userId: string; text: string }): Promise<AutopilotResult> {
      const action = await conversations.handleMessage(input);
      const executions: ToolExecution[] = [];
      if (action.type === 'reply') {
        for (const decision of action.toolResults) {
          if (!decision.allowed) continue;
          try {
            executions.push({
              tool: decision.tool,
              result: await execute(input.userId, decision.tool, decision.args),
            });
          } catch (err) {
            executions.push({
              tool: decision.tool,
              result: { kind: 'refused', reason: (err as Error).message },
            });
          }
        }
      }
      return { action, executions };
    },
  };
}

export type Autopilot = ReturnType<typeof autopilot>;
