// api/telemetry.js — item response telemetry (PULSERN_BUILD.md §6).
// Updates times_answered / times_correct / elo_rating atomically via the
// record_answer SQL function. Service role stays server-side only.
import { createClient } from '@supabase/supabase-js';

let _db = null;
const db = () => (_db ??= createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY));

// Simple in-memory token bucket: 1 request/sec per IP. Resets on cold start,
// which is acceptable at this scale (per the spec).
const lastHit = new Map();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '?').split(',')[0].trim();
  const now = Date.now();
  if (now - (lastHit.get(ip) ?? 0) < 1000) return res.status(429).json({ error: 'Rate limited' });
  lastHit.set(ip, now);
  if (lastHit.size > 10000) lastHit.clear(); // bound memory

  const { itemId, correct, itemDelta } = req.body || {};
  if (!Number.isInteger(itemId) || itemId < 1) return res.status(400).json({ error: 'Bad itemId' });
  if (typeof correct !== 'boolean') return res.status(400).json({ error: 'Bad correct' });
  if (typeof itemDelta !== 'number' || !Number.isFinite(itemDelta) || Math.abs(itemDelta) > 12)
    return res.status(400).json({ error: 'Bad itemDelta' });

  const { error } = await db().rpc('record_answer', {
    item_id: itemId, was_correct: correct, delta: itemDelta,
  });
  if (error) return res.status(502).json({ error: 'Update failed' });
  return res.status(200).json({ ok: true });
}
