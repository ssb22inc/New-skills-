import { sql, type Kysely } from 'kysely';
import type { LlmRouter } from '@sycamore/adapters';
import type { ContextPack, VerticalPack } from '@sycamore/packs';
import type { Database } from '../db/types.js';
import { identityService } from '../identity/identity.js';
import { capacityEngine } from '../capacity/engine.js';
import { emitEvent } from '../db/outbox.js';

/**
 * P13 — Genesis: the conversational onboarding. Interview → name options
 * → catalog (photos via chat) → pricing from pack benchmarks → capacity
 * → first-broadcast draft → 👍. Entirely inside chat: the engine consumes
 * normalized inbound messages and answers with STRUCTURED prompts (the
 * localization layer renders copy from pack directives).
 *
 * HUMAN-GATE (tracked in BUILD_STATUS.md): 10 real sellers, voice-note
 * only, zero human help. This module carries the synthetic gate.
 */

export type GenesisStep =
  | 'start'
  | 'vertical'
  | 'name'
  | 'catalog_photo'
  | 'catalog_details'
  | 'capacity'
  | 'broadcast'
  | 'done';

export interface GenesisState {
  step: GenesisStep;
  verticalId?: string;
  nameOptions?: string[];
  businessName?: string;
  sellerId?: string;
  userId?: string;
  pendingPhotoRef?: string;
  suggestedPriceMinor?: number;
  itemCount: number;
  broadcastDraft?: string;
}

export interface GenesisInbound {
  kind: 'text' | 'voice' | 'image' | 'tap';
  /** For voice, the pipeline's corrected transcript arrives here. */
  text?: string;
  mediaRef?: string;
  tapPayload?: string;
}

export type GenesisPrompt =
  | { ask: 'vertical'; options: string[] }
  | { ask: 'pick_name'; options: string[] }
  | { ask: 'first_photo' }
  | { ask: 'item_name'; suggestedPriceMinor: number }
  | { ask: 'capacity_units'; unitPlural: string }
  | { ask: 'approve_broadcast'; draft: string }
  | { ask: 'nothing'; done: true };

export class GenesisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GenesisError';
  }
}

export interface GenesisDeps {
  db: Kysely<Database>;
  router: LlmRouter;
  contextPack: ContextPack;
  verticalPacks: Map<string, VerticalPack>;
}

export function genesisEngine(deps: GenesisDeps, marketId: string) {
  const identity = identityService(deps.db, marketId);
  const capacity = capacityEngine(deps.db, marketId);

  async function loadState(phone: string): Promise<GenesisState> {
    const user = await deps.db
      .selectFrom('users')
      .where('market_id', '=', marketId)
      .where('phone', '=', phone)
      .selectAll()
      .executeTakeFirst();
    if (!user) return { step: 'start', itemCount: 0 };
    const session = await deps.db
      .selectFrom('conversation_sessions')
      .where('market_id', '=', marketId)
      .where('user_id', '=', user.id)
      .selectAll()
      .executeTakeFirst();
    const genesis = (session?.state as { genesis?: GenesisState } | undefined)?.genesis;
    return genesis ?? { step: 'start', itemCount: 0 };
  }

  async function saveState(userId: string, state: GenesisState): Promise<void> {
    await deps.db
      .insertInto('conversation_sessions')
      .values({ market_id: marketId, user_id: userId, state: { genesis: state } })
      .onConflict((oc) =>
        oc.columns(['market_id', 'user_id']).doUpdateSet({
          state: sql`conversation_sessions.state || ${JSON.stringify({ genesis: state })}::jsonb`,
          updated_at: sql`now()`,
        }),
      )
      .execute();
  }

  function benchmarkFor(verticalId: string): number {
    const benchmark = deps.contextPack.benchmarks[verticalId];
    if (!benchmark) {
      throw new GenesisError(
        `no pricing benchmark for vertical "${verticalId}" in market "${marketId}" — ` +
          `add it to the context pack before onboarding this vertical`,
      );
    }
    return benchmark.unit_price_typical_minor;
  }

  return {
    /**
     * One inbound message in, one structured prompt out. The whole flow is
     * drivable by voice notes: voice arrives as corrected transcript text.
     */
    async handle(phone: string, inbound: GenesisInbound): Promise<GenesisPrompt> {
      const state = await loadState(phone);
      const text = (inbound.text ?? inbound.tapPayload ?? '').trim();

      switch (state.step) {
        case 'start': {
          const options = [...deps.verticalPacks.keys()];
          // Create the user NOW so state can persist (phone-first identity).
          const user = await identity.findOrCreateUserByPhone({
            phone,
            displayName: phone,
            role: 'seller',
          });
          await saveState(user.id, { step: 'vertical', itemCount: 0, userId: user.id });
          return { ask: 'vertical', options };
        }

        case 'vertical': {
          const verticalId = text.toLowerCase();
          if (!deps.verticalPacks.has(verticalId)) {
            return { ask: 'vertical', options: [...deps.verticalPacks.keys()] };
          }
          const res = await deps.router.complete({
            task: 'creative',
            system:
              `Suggest 3 short business names, one per line, no numbering. ` +
              `Language: ${deps.contextPack.language.primary} ` +
              `(${deps.contextPack.language.dialect}).`,
            prompt: `vertical: ${verticalId}`,
            containsPii: false,
          });
          const nameOptions = res.text
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
            .slice(0, 3);
          await saveState(state.userId!, { ...state, step: 'name', verticalId, nameOptions });
          return { ask: 'pick_name', options: nameOptions };
        }

        case 'name': {
          const businessName = text;
          if (!businessName) return { ask: 'pick_name', options: state.nameOptions ?? [] };
          const seller = await identity.createSeller({
            userId: state.userId!,
            businessName,
          });
          await identity.applySellerEvent(seller.id, 'profile_completed');
          await saveState(state.userId!, {
            ...state,
            step: 'catalog_photo',
            businessName,
            sellerId: seller.id,
          });
          return { ask: 'first_photo' };
        }

        case 'catalog_photo': {
          if (inbound.kind !== 'image' || !inbound.mediaRef) {
            return { ask: 'first_photo' };
          }
          const suggestedPriceMinor = benchmarkFor(state.verticalId!);
          await saveState(state.userId!, {
            ...state,
            step: 'catalog_details',
            pendingPhotoRef: inbound.mediaRef,
            suggestedPriceMinor,
          });
          return { ask: 'item_name', suggestedPriceMinor };
        }

        case 'catalog_details': {
          if (!text) {
            return { ask: 'item_name', suggestedPriceMinor: state.suggestedPriceMinor! };
          }
          await deps.db
            .insertInto('catalog_items')
            .values({
              market_id: marketId,
              seller_id: state.sellerId!,
              name: text,
              photo_ref: state.pendingPhotoRef!,
              price_minor: state.suggestedPriceMinor!,
            })
            .execute();
          await identity.applySellerEvent(state.sellerId!, 'catalog_added');
          const pack = deps.verticalPacks.get(state.verticalId!)!;
          await saveState(state.userId!, {
            ...state,
            step: 'capacity',
            itemCount: state.itemCount + 1,
          });
          return { ask: 'capacity_units', unitPlural: pack.capacity.unit_plural };
        }

        case 'capacity': {
          const units = Number.parseInt(text, 10);
          const pack = deps.verticalPacks.get(state.verticalId!)!;
          if (!Number.isInteger(units) || units <= 0) {
            return { ask: 'capacity_units', unitPlural: pack.capacity.unit_plural };
          }
          const startsAt = new Date();
          startsAt.setUTCDate(startsAt.getUTCDate() + 1);
          startsAt.setUTCHours(14, 0, 0, 0);
          const endsAt = new Date(
            startsAt.getTime() + pack.capacity.time_granularity_minutes * 2 * 60_000,
          );
          await capacity.createWindow(pack, {
            sellerId: state.sellerId!,
            startsAt,
            endsAt,
            totalUnits: units,
            unitPriceMinor: state.suggestedPriceMinor!,
          });
          await identity.applySellerEvent(state.sellerId!, 'capacity_configured');
          // Trust page generation is requested here; P14 renders it.
          await emitEvent(deps.db, {
            marketId,
            topic: 'trust_page.requested',
            payload: { sellerId: state.sellerId! },
          });
          const res = await deps.router.complete({
            task: 'creative',
            system:
              `Draft ONE short launch broadcast for a new business. ` +
              `Follow these market directives strictly:\n` +
              deps.contextPack.language.copy_directives.map((d) => `- ${d}`).join('\n'),
            prompt: `business: ${state.businessName}; vertical: ${state.verticalId}`,
            containsPii: false,
          });
          await saveState(state.userId!, {
            ...state,
            step: 'broadcast',
            broadcastDraft: res.text.trim(),
          });
          return { ask: 'approve_broadcast', draft: res.text.trim() };
        }

        case 'broadcast': {
          if (inbound.kind === 'tap' && inbound.tapPayload === 'approve') {
            await emitEvent(deps.db, {
              marketId,
              topic: 'broadcast.approved',
              payload: { sellerId: state.sellerId!, draft: state.broadcastDraft! },
            });
            await saveState(state.userId!, { ...state, step: 'done' });
            return { ask: 'nothing', done: true };
          }
          return { ask: 'approve_broadcast', draft: state.broadcastDraft ?? '' };
        }

        case 'done':
          return { ask: 'nothing', done: true };
      }
    },
  };
}

export type GenesisEngine = ReturnType<typeof genesisEngine>;
