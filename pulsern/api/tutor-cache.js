// api/tutor-cache.js — write-through for tutor explanations (§5.6).
// The client reads tutor_cache directly (RLS: authenticated read), but only
// this route may write, using the service role. Pay once per explanation, ever.
import { createClient } from '@supabase/supabase-js';

let _db = null;
const db = () => (_db ??= createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY));

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { itemId, wasCorrect, text } = req.body || {};
  if (!Number.isInteger(itemId) || itemId < 1) return res.status(400).json({ error: 'Bad itemId' });
  if (typeof wasCorrect !== 'boolean') return res.status(400).json({ error: 'Bad wasCorrect' });
  if (typeof text !== 'string' || !text.trim() || text.length > 2000)
    return res.status(400).json({ error: 'Bad text' });

  const { error } = await db().from('tutor_cache').upsert({
    item_id: itemId, was_correct: wasCorrect, text: text.trim(),
  });
  if (error) return res.status(502).json({ error: 'Cache write failed' });
  return res.status(200).json({ ok: true });
}
