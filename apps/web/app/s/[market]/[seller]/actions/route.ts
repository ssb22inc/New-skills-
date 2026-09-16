import {
  type CompletionClaim,
  createDb,
  databaseUrl,
  installOfferService,
  marketsRegistry,
  ordersService,
  replayOfflineQueue,
  type OfflineAction,
} from '@sycamore/core';
import { loadContextPack, loadVerticalPack } from '@sycamore/packs';

export const dynamic = 'force-dynamic';

const db = createDb(databaseUrl());

/** The installed client may queue exactly these — nothing money-shaped. */
const ALLOWED_KINDS = new Set(['complete_order', 'client_installed', 'install_declined']);

/**
 * P36a — the offline queue's landing pad.
 *
 * The installed client queues actions locally while the signal is gone
 * and POSTs the whole queue on reconnect, keys and all. Replay is P34's
 * `replayOfflineQueue` VERBATIM — no new money logic exists here, and
 * the dedupe row is what makes a phone that crashed mid-sync and resent
 * everything completely harmless.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ market: string; seller: string }> },
): Promise<Response> {
  const { market, seller: sellerId } = await ctx.params;

  if ((await marketsRegistry(db).statusOf(market)) !== 'live') {
    return new Response('not found', { status: 404 });
  }
  const seller = await db
    .selectFrom('sellers')
    .where('market_id', '=', market)
    .where('id', '=', sellerId)
    .selectAll()
    .executeTakeFirst();
  if (!seller) return new Response('not found', { status: 404 });

  const body = (await req.json()) as { actions?: OfflineAction[] };
  const actions = body.actions ?? [];
  for (const action of actions) {
    if (!action.idempotencyKey || !ALLOWED_KINDS.has(action.kind)) {
      return Response.json({ error: 'unsupported action' }, { status: 400 });
    }
  }

  const orders = ordersService(db, market);
  const installs = installOfferService(
    {
      db,
      // Copy is never rendered on this path; the router is unused here.
      router: { complete: () => Promise.reject(new Error('not used on the replay path')) },
      pack: loadContextPack(market),
      appOrigin: process.env.SYCAMORE_APP_ORIGIN ?? '',
    },
    market,
  );

  const result = await replayOfflineQueue(db, market, actions, {
    complete_order: async (payload) => {
      const { orderId, evidence } = payload as {
        orderId: string;
        evidence?: CompletionClaim;
      };
      const order = await db
        .selectFrom('orders')
        .where('market_id', '=', market)
        .where('seller_id', '=', sellerId)
        .where('id', '=', orderId)
        .select('vertical_id')
        .executeTakeFirstOrThrow();
      const pack = loadVerticalPack(order.vertical_id);
      // NO FALLBACK. This line used to read "an unparseable client value
      // falls back to the pack's first accepted proof rather than being
      // trusted through", which meant a completion claim carrying no
      // evidence at all was recorded as a scanned QR code — the exact
      // record a dispute is later judged on. The evidence service now
      // refuses missing, malformed, unsupported, stale, reused and
      // mismatched claims, and the order does not move.
      await orders.complete(orderId, evidence as CompletionClaim, pack, {
        userId: null,
        role: 'seller_client',
      });
    },
    client_installed: async () => {
      await installs.recordInstalled(sellerId);
    },
    install_declined: async () => {
      await installs.recordDecline(sellerId);
    },
  });

  return Response.json(result);
}
