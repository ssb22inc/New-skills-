import { sql, type Kysely } from 'kysely';
import type { LlmRouter } from '@sycamore/adapters';
import { translator, type ContextPack } from '@sycamore/packs';
import type { Database } from '../db/types.js';
import { emitEvent } from '../db/outbox.js';

/**
 * P36b — the earned-install offer.
 *
 * ASYMMETRIC CLIENTS is the whole rule of this file:
 *   • SELLERS may be offered an install — they use Sycamore daily with
 *     money at stake, and the installed client is their offline mode.
 *   • BUYERS ARE NEVER PROMPTED. There is no buyer code path here, and
 *     `assertSellerIdentity` makes an accidental one throw rather than
 *     ship. A buyer arrives from a link, books, pays, and leaves.
 *   • The install is always OPTIONAL. Constitution §1 (one door) still
 *     holds — a seller who never installs loses nothing but offline mode.
 *
 * The offer is EARNED, never solicited: not during Genesis (a seller in
 * onboarding has nothing to protect yet), only once the business is real
 * — first payout settled, or five completed orders in a rolling week.
 * At most two offers in a lifetime; two declines means never again.
 */

export type InstallPromptState = 'none' | 'offered' | 'declined' | 'installed';

/** Hard cap, enforced here AND by a check constraint on `sellers`. */
export const MAX_INSTALL_OFFERS = 2;
/** Trigger (b): five completed orders inside a rolling seven days. */
export const INSTALL_TRIGGER_ORDERS = 5;
export const INSTALL_TRIGGER_WINDOW_DAYS = 7;

export class InstallOfferError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InstallOfferError';
  }
}

/** Why an offer was withheld — every refusal is explainable (Constitution §4). */
export type InstallOfferDecision =
  | { offer: false; reason: 'genesis_in_progress' }
  | { offer: false; reason: 'not_earned_yet' }
  | { offer: false; reason: 'offer_cap_reached' }
  | { offer: false; reason: 'already_installed' }
  | { offer: false; reason: 'offer_outstanding' }
  | { offer: true; trigger: 'first_payout_settled' | 'orders_in_rolling_week' };

export interface InstallOfferDeps {
  db: Kysely<Database>;
  router: LlmRouter;
  pack: ContextPack;
  /** Base URL of the seller's own door; the offer links to it. */
  appOrigin: string;
}

/**
 * The buyer guard. A user id that is not this seller's owner can never
 * reach the offer path — a violation throws instead of messaging.
 */
export async function assertSellerIdentity(
  db: Kysely<Database>,
  marketId: string,
  sellerId: string,
  userId: string,
): Promise<void> {
  const seller = await db
    .selectFrom('sellers')
    .where('market_id', '=', marketId)
    .where('id', '=', sellerId)
    .select(['user_id'])
    .executeTakeFirst();
  if (!seller) throw new InstallOfferError(`unknown seller "${sellerId}"`);
  if (seller.user_id !== userId) {
    throw new InstallOfferError('install offers are for sellers only — never a buyer identity');
  }
}

export function installOfferService(deps: InstallOfferDeps, marketId: string) {
  const { db } = deps;

  async function sellerRow(sellerId: string) {
    const row = await db
      .selectFrom('sellers')
      .where('market_id', '=', marketId)
      .where('id', '=', sellerId)
      .selectAll()
      .executeTakeFirst();
    if (!row) throw new InstallOfferError(`unknown seller "${sellerId}"`);
    return row;
  }

  return {
    async stateOf(sellerId: string): Promise<InstallPromptState> {
      return (await sellerRow(sellerId)).install_prompt_state as InstallPromptState;
    },

    /** Completed orders inside the rolling window ending at `now`. */
    async completedOrdersInWindow(sellerId: string, now = new Date()): Promise<number> {
      const since = new Date(now.getTime() - INSTALL_TRIGGER_WINDOW_DAYS * 86_400_000);
      const row = await db
        .selectFrom('orders')
        .where('market_id', '=', marketId)
        .where('seller_id', '=', sellerId)
        .where('status', '=', 'completed')
        .where('completed_at', '>=', since)
        .where('completed_at', '<=', now)
        .select((eb) => eb.fn.countAll<string>().as('n'))
        .executeTakeFirstOrThrow();
      return Number(row.n);
    },

    /** Trigger (a): the seller's money has actually reached them once. */
    async firstPayoutSettled(sellerId: string): Promise<boolean> {
      const row = await db
        .selectFrom('ledger_entries')
        .innerJoin('ledger_transactions', 'ledger_transactions.id', 'ledger_entries.transaction_id')
        .where('ledger_entries.market_id', '=', marketId)
        .where('ledger_entries.seller_id', '=', sellerId)
        .where('ledger_transactions.kind', '=', 'payout')
        .select('ledger_entries.id')
        .executeTakeFirst();
      return row !== undefined;
    },

    /**
     * Should this seller be offered the install right now? Genesis is
     * checked FIRST and unconditionally: a seller still being onboarded
     * is never interrupted with our infrastructure, no matter what their
     * numbers say.
     */
    async evaluate(
      sellerId: string,
      ctx: { duringGenesis: boolean; now?: Date },
    ): Promise<InstallOfferDecision> {
      if (ctx.duringGenesis) return { offer: false, reason: 'genesis_in_progress' };

      const seller = await sellerRow(sellerId);
      if (seller.install_prompt_state === 'installed') {
        return { offer: false, reason: 'already_installed' };
      }
      if (seller.install_prompt_state === 'offered') {
        return { offer: false, reason: 'offer_outstanding' };
      }
      if (seller.install_offers_sent >= MAX_INSTALL_OFFERS) {
        return { offer: false, reason: 'offer_cap_reached' };
      }

      const now = ctx.now ?? new Date();
      if (await this.firstPayoutSettled(sellerId)) {
        return { offer: true, trigger: 'first_payout_settled' };
      }
      if ((await this.completedOrdersInWindow(sellerId, now)) >= INSTALL_TRIGGER_ORDERS) {
        return { offer: true, trigger: 'orders_in_rolling_week' };
      }
      return { offer: false, reason: 'not_earned_yet' };
    },

    /**
     * Render and emit ONE chat message. Copy is localized by the market's
     * pack directives (no hardcoded user-facing strings) and framed as
     * the seller's benefit — speed and working when the internet drops —
     * never as our channel-dependency problem. It leaves via the outbox,
     * so whichever door the seller is on delivers it.
     */
    async offer(input: {
      sellerId: string;
      /** The seller's own user id — the buyer guard checks it. */
      userId: string;
      trigger: 'first_payout_settled' | 'orders_in_rolling_week';
    }): Promise<{ text: string; link: string; offersSent: number }> {
      await assertSellerIdentity(db, marketId, input.sellerId, input.userId);
      const seller = await sellerRow(input.sellerId);
      if (seller.install_offers_sent >= MAX_INSTALL_OFFERS) {
        throw new InstallOfferError('install offer cap reached — two declines means never again');
      }
      if (seller.install_prompt_state === 'installed') {
        throw new InstallOfferError('seller already installed — no further offers');
      }

      const link = `${deps.appOrigin}/s/${marketId}/${input.sellerId}?offer=1`;
      const say = translator(deps.pack);
      const res = await deps.router.complete({
        task: 'creative',
        system:
          `Write ONE short chat message to a small business owner whose business is growing. ` +
          `Offer to put Sycamore on their phone's home screen. Frame it entirely as THEIR ` +
          `benefit: it opens faster and it keeps working when the internet drops. ` +
          `Never mention our infrastructure, platforms, or apps stores. Never pressure. ` +
          `End with the link.\n` +
          `Follow these market directives strictly:\n` +
          deps.pack.language.copy_directives.map((d) => `- ${d}`).join('\n'),
        prompt: `business: ${seller.business_name}; link: ${link}`,
        containsPii: false,
      });
      // The model writes the line in the market's voice; if it returns
      // nothing usable the catalogue supplies the sentence. Even the
      // fallback is pack data — code owns no copy (CLAUDE.md data rules).
      const text = res.text.trim() || say('install.offer_fallback', { link });

      const offersSent = seller.install_offers_sent + 1;
      await db
        .updateTable('sellers')
        .set({
          install_prompt_state: 'offered',
          install_offers_sent: offersSent,
          updated_at: sql`now()`,
        })
        .where('market_id', '=', marketId)
        .where('id', '=', input.sellerId)
        .execute();

      await emitEvent(db, {
        marketId,
        topic: 'install.offered',
        payload: {
          sellerId: input.sellerId,
          userId: input.userId,
          trigger: input.trigger,
          text,
          link,
          offersSent,
        },
      });
      return { text, link, offersSent };
    },

    /** No is an answer. Two of them end the conversation permanently. */
    async recordDecline(
      sellerId: string,
    ): Promise<{ offersSent: number; silencedForever: boolean }> {
      const seller = await sellerRow(sellerId);
      await db
        .updateTable('sellers')
        .set({ install_prompt_state: 'declined', updated_at: sql`now()` })
        .where('market_id', '=', marketId)
        .where('id', '=', sellerId)
        .execute();
      return {
        offersSent: seller.install_offers_sent,
        silencedForever: seller.install_offers_sent >= MAX_INSTALL_OFFERS,
      };
    },

    /** The client reports itself installed; the seller is never asked again. */
    async recordInstalled(sellerId: string, now = new Date()): Promise<void> {
      await db
        .updateTable('sellers')
        .set({ install_prompt_state: 'installed', installed_at: now, updated_at: sql`now()` })
        .where('market_id', '=', marketId)
        .where('id', '=', sellerId)
        .execute();
      await emitEvent(db, {
        marketId,
        topic: 'install.completed',
        payload: { sellerId },
      });
    },
  };
}

export type InstallOfferService = ReturnType<typeof installOfferService>;

/**
 * P36d — `seller_install_rate`: installed sellers ÷ active sellers, per
 * market. A falling rate raises BOTH storm risk (fewer offline-capable
 * sellers) and channel-dependency risk (more sellers reachable only
 * through somebody else's door). It is a vital to WATCH, never a reason
 * to nag: the two-offer cap is absolute.
 */
export async function sellerInstallRate(
  db: Kysely<Database>,
  marketId: string,
): Promise<{ installed: number; active: number; rate: number }> {
  const row = await db
    .selectFrom('sellers')
    .where('market_id', '=', marketId)
    .where('standing', '=', 'active')
    .select((eb) => [
      eb.fn.countAll<string>().as('active'),
      eb.fn
        .count<string>(
          eb.case().when('install_prompt_state', '=', 'installed').then(1).else(null).end(),
        )
        .as('installed'),
    ])
    .executeTakeFirstOrThrow();
  const active = Number(row.active);
  const installed = Number(row.installed);
  return { installed, active, rate: active === 0 ? 0 : installed / active };
}
