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
  /** A sign-in link, minted for this user and sent down their own channel. */
  | { type: 'sign_in_link'; userId: string; url: string; expiresAt: Date }
  | { type: 'sign_in_refused'; userId: string; reason: string }
  | { type: 'silent' }; // autopilot off: say nothing, do nothing

export interface ConversationDeps {
  db: Kysely<Database>;
  router: LlmRouter;
  pack: ContextPack;
  /** Given the detected intent + user text, propose tool calls (LLM-driven later). */
  proposeToolCalls?: (intent: Intent, userText: string) => Promise<ToolCallRequest[]>;
  /**
   * Mint a single-use sign-in link for this user (C01). Absent means
   * this deployment has no sign-in door, and the command says so rather
   * than pretending.
   */
  signIn?: (userId: string) => Promise<{ url: string; expiresAt: Date }>;
}

const STOP_WORDS = new Set(['stop', 'stap']);
const RESUME_WORDS = new Set(['resume', 'start back']);

/**
 * SIGN-IN IS A COMMAND, NOT AN INTENT (C01).
 *
 * It sits here with STOP and RESUME, matched on the exact words rather
 * than classified by a model, for a reason worth stating: this mints a
 * CREDENTIAL. Conversation-layer safety says user text is data and never
 * instructions, so a model's opinion about what a message meant must
 * never be what decides to hand somebody a way into an account. Patois
 * is first-class here as everywhere — "mi need fi log in" reaches the
 * same door as "sign in".
 */
const SIGN_IN_WORDS = new Set([
  'sign in',
  'signin',
  'log in',
  'login',
  'my day',
  'open my day',
  'mi need fi log in',
  'let mi in',
  'send mi di link',
  'send me the link',
]);

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

      // Sign-in outranks a stopped session too: a seller who silenced
      // Autopilot still has to be able to open their own day, and a
      // deliberate request for a link is not Autopilot talking.
      if (SIGN_IN_WORDS.has(normalized)) {
        if (!deps.signIn) {
          return {
            type: 'sign_in_refused',
            userId: input.userId,
            reason: 'this deployment has no sign-in door configured',
          };
        }
        try {
          const link = await deps.signIn(input.userId);
          return {
            type: 'sign_in_link',
            userId: input.userId,
            url: link.url,
            expiresAt: link.expiresAt,
          };
        } catch (err) {
          // A buyer asking to "log in" is not an error worth a stack
          // trace at them — they have nothing to sign into.
          return {
            type: 'sign_in_refused',
            userId: input.userId,
            reason: err instanceof Error ? err.message : String(err),
          };
        }
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
