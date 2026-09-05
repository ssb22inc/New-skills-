import { sql, type Kysely } from 'kysely';
import type { LlmRouter } from '@sycamore/adapters';
import type { ContextPack } from '@sycamore/packs';
import type { Database } from '../db/types.js';
import { detectIntent, type Intent } from './intents.js';
import { authorizeToolCalls, type ToolCallDecision, type ToolCallRequest } from './tools.js';

/**
 * What the conversation engine DECIDES. Rendering the actual reply text
 * happens elsewhere (localization via pack directives) — the engine's
 * contract is structured actions, so tests pin behavior, not copy.
 */
export type ConversationAction =
  | { type: 'reply'; intent: Intent; toolResults: ToolCallDecision[] }
  | { type: 'escalate_to_owner'; userText: string; userId: string } // complaint: zero bot reply
  | { type: 'stopped_ack' } // one confirmation, then silence
  | { type: 'resumed_ack' }
  | { type: 'silent' }; // autopilot off: say nothing, do nothing

export interface ConversationDeps {
  db: Kysely<Database>;
  router: LlmRouter;
  pack: ContextPack;
  /** Given the detected intent + user text, propose tool calls (LLM-driven later). */
  proposeToolCalls?: (intent: Intent, userText: string) => Promise<ToolCallRequest[]>;
}

const STOP_WORDS = new Set(['stop', 'stap']);
const RESUME_WORDS = new Set(['resume', 'start back']);

export function conversationEngine(deps: ConversationDeps, marketId: string) {
  async function getSession(userId: string) {
    return deps.db
      .selectFrom('conversation_sessions')
      .where('market_id', '=', marketId)
      .where('user_id', '=', userId)
      .selectAll()
      .executeTakeFirst();
  }

  async function setAutopilot(userId: string, autopilot: boolean): Promise<void> {
    await deps.db
      .insertInto('conversation_sessions')
      .values({ market_id: marketId, user_id: userId, autopilot })
      .onConflict((oc) =>
        oc.columns(['market_id', 'user_id']).doUpdateSet({ autopilot, updated_at: sql`now()` }),
      )
      .execute();
  }

  return {
    getSession,
    setAutopilot,

    async handleMessage(input: { userId: string; text: string }): Promise<ConversationAction> {
      const normalized = input.text.trim().toLowerCase();

      // The kill switch outranks EVERYTHING, including a stopped session.
      if (STOP_WORDS.has(normalized)) {
        await setAutopilot(input.userId, false);
        return { type: 'stopped_ack' };
      }
      if (RESUME_WORDS.has(normalized)) {
        await setAutopilot(input.userId, true);
        return { type: 'resumed_ack' };
      }

      const session = await getSession(input.userId);
      if (session && !session.autopilot) {
        return { type: 'silent' }; // stopped means STOPPED
      }

      const intent = await detectIntent(deps.router, deps.pack, input.text);

      // Complaints get a human, never a bot (Constitution: trust).
      if (intent === 'complaint') {
        return { type: 'escalate_to_owner', userText: input.text, userId: input.userId };
      }

      const proposed = deps.proposeToolCalls ? await deps.proposeToolCalls(intent, input.text) : [];
      const toolResults = authorizeToolCalls(intent, proposed);
      return { type: 'reply', intent, toolResults };
    },
  };
}

export type ConversationEngine = ReturnType<typeof conversationEngine>;
