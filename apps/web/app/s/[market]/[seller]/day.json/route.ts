import { capacityEngine, createDb, databaseUrl, marketsRegistry } from '@sycamore/core';

export const dynamic = 'force-dynamic';

const db = createDb(process.env.DATABASE_URL ?? databaseUrl());

const SEVEN_DAYS_MS = 7 * 86_400_000;

/**
 * P36a — the seller's day, as data. This is the ONE document the service
 * worker runtime-caches, so a seller whose signal drops still opens the
 * client and sees today: open orders, the next seven days of capacity,
 * who to call, and what they sell. Cached with a stamp so the client can
 * say honestly how old the picture is instead of pretending it is live.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ market: string; seller: string }> },
): Promise<Response> {
  const { market, seller: sellerId } = await ctx.params;

  // Region lockdown: a dark market's routes 404 (P6.5).
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

  const now = new Date();
  const openOrders = await db
    .selectFrom('orders')
    .innerJoin('users', 'users.id', 'orders.buyer_user_id')
    .where('orders.market_id', '=', market)
    .where('orders.seller_id', '=', sellerId)
    .where('orders.status', 'in', ['held', 'confirmed'])
    .orderBy('orders.created_at', 'asc')
    .select([
      'orders.id',
      'orders.units',
      'orders.status',
      'orders.window_id',
      'users.display_name as buyer_name',
      'users.phone as buyer_phone',
    ])
    .execute();

  const windows = await db
    .selectFrom('capacity_windows')
    .where('market_id', '=', market)
    .where('seller_id', '=', sellerId)
    .where('starts_at', '>=', now)
    .where('starts_at', '<=', new Date(now.getTime() + SEVEN_DAYS_MS))
    .orderBy('starts_at', 'asc')
    .selectAll()
    .execute();
  const engine = capacityEngine(db, market);
  const capacity = await Promise.all(
    windows.map(async (w) => ({
      windowId: w.id,
      startsAt: new Date(w.starts_at).toISOString(),
      endsAt: new Date(w.ends_at).toISOString(),
      totalUnits: w.total_units,
      available: (await engine.availability(w.id)).available,
    })),
  );

  const contacts = await db
    .selectFrom('orders')
    .innerJoin('users', 'users.id', 'orders.buyer_user_id')
    .where('orders.market_id', '=', market)
    .where('orders.seller_id', '=', sellerId)
    .select(['users.id', 'users.display_name as name', 'users.phone'])
    .distinct()
    .execute();

  const catalog = await db
    .selectFrom('catalog_items')
    .where('market_id', '=', market)
    .where('seller_id', '=', sellerId)
    .where('active', '=', true)
    .select(['id', 'name', 'price_minor'])
    .execute();

  return Response.json(
    {
      marketId: market,
      sellerId,
      businessName: seller.business_name,
      capturedAt: now.toISOString(),
      openOrders: openOrders.map((o) => ({
        id: o.id,
        units: o.units,
        status: o.status,
        windowId: o.window_id,
        buyerName: o.buyer_name,
        buyerPhone: o.buyer_phone,
      })),
      capacity,
      contacts: contacts.map((c) => ({ userId: c.id, name: c.name, phone: c.phone })),
      catalog: catalog.map((c) => ({ id: c.id, name: c.name, priceMinor: Number(c.price_minor) })),
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
