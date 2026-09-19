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
import { requireSellerOwner, sameOrigin } from '../../../../../src/auth.js';

export const dynamic = 'force-dynamic';

const db = createDb(databaseUrl());

/** The installed client may queue exactly these — nothing money-shaped. */
const ALLOWED_KINDS = new Set(['complete_order', 'client_installed', 'install_declined']);

/** One phone's queue, bounded (C01 — "bound batch sizes"). */
const MAX_ACTIONS_PER_BATCH = 200;

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

  // This route COMPLETES ORDERS. Until the external review of
  // 2026-09-16 it took anyone who knew a seller id (C01).
  const guard = await requireSellerOwner(db, market, sellerId, req);
  if (!guard.ok) return guard.response;
  // Belt as well as braces on a mutating request: the session cookie is
  // SameSite=Lax, and the request must also come from here.
  if (!sameOrigin(req)) return new Response('bad origin', { status: 403 });

  const seller = await db
    .selectFrom('sellers')
    .where('market_id', '=', market)
    .where('id', '=', sellerId)
    .selectAll()
    .executeTakeFirst();
  if (!seller) return new Response('not found', { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { actions?: OfflineAction[] };
  const actions = Array.isArray(body.actions) ? body.actions : [];
  // A queue is a phone's worth of taps, not a payload. An unbounded
  // batch is a way to hold a connection open doing work for free.
  if (actions.length > MAX_ACTIONS_PER_BATCH) {
    return Response.json(
      { error: `too many actions: ${actions.length} > ${MAX_ACTIONS_PER_BATCH}` },
      { status: 413 },
    );
  }
  for (const action of actions) {
    if (
      typeof action?.idempotencyKey !== 'string' ||
      action.idempotencyKey.length === 0 ||
      action.idempotencyKey.length > 200 ||
      !ALLOWED_KINDS.has(action.kind)
    ) {
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
        userId: guard.principal.userId,
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
