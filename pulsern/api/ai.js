// api/ai.js — Vercel serverless function (Node runtime)
// The ONLY place AI vendor keys exist. The app sends { provider, prompt }
// plus the signed-in user's Supabase access token, never a vendor secret.
// Swap vendors by editing MODELS — nothing else changes.
// { action: "speak", ref, seg, text } is the read-aloud voice instead
// (api/_speak.js): same sign-in door. With PULSERN_POLLY_ACCESS_KEY_ID and
// PULSERN_POLLY_SECRET_ACCESS_KEY set (a key that may only call Polly's
// SynthesizeSpeech), a passage with no clip yet is spoken right away with
// Amazon Polly Neural and saved for everyone; without them, or when Polly is
// down, it is queued for the voice job as before. Either way the daily
// dollar cap (READ_ALOUD_DAILY_USD, default $40) is shared with the job.
// (Vercel reserves the AWS_* names, hence the PULSERN_POLLY_* ones.)
import { createClient } from '@supabase/supabase-js';
import { PollyClient } from '@aws-sdk/client-polly';
import { tokenFromRequest, userFromRequest } from './_require-user.js';
import { speak, bankReader, readAloudLimits } from './_speak.js';

let pollyClient = null;
export function livePolly(env = process.env) {
  const accessKeyId = env.PULSERN_POLLY_ACCESS_KEY_ID, secretAccessKey = env.PULSERN_POLLY_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) return null;
  /* One HTTP attempt per send: a retry would spend again without a new
     budget reservation (the same rule as the voice job). */
  pollyClient ??= new PollyClient({ region: env.PULSERN_POLLY_REGION || 'us-east-1', credentials: { accessKeyId, secretAccessKey }, maxAttempts: 1 });
  return pollyClient;
}

const MODELS = {
  claude:   'anthropic/claude-sonnet-4.6',
  gpt:      'openai/gpt-4.1',
  deepseek: 'deepseek/deepseek-chat',   // cheapest tier — route the tutor here
  qwen:     'qwen/qwen-2.5-72b-instruct',
  kimi:     'moonshotai/kimi-k2',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Before any provider call. A missing session, a bad token, or an inability
  // to check one all stop here. Signed-in free-pass and trial users pass.
  const user = await userFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Sign in first' });

  if (req.body?.action === 'speak') {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    const storage = url && key ? createClient(url, key, { auth: { persistSession: false } }).storage : null;
    // The item is read as the student, so the database's own access rules apply.
    const readItem = url && anonKey ? bankReader(createClient(url, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${tokenFromRequest(req)}` } },
    })) : null;
    const { ref, seg, text } = req.body;
    // Daily caps come from LIMITS in api/_speak.js and the dollar cap from
    // READ_ALOUD_DAILY_USD, both shared with the voice job.
    const polly = livePolly();
    const out = await speak({ ref, seg, text, userId: user.id, readItem, storage, polly, limits: readAloudLimits(process.env) });
    return res.status(out.status).json(out.body);
  }

  const { provider, prompt, maxTokens = 1000 } = req.body || {};
  const model = MODELS[provider] || MODELS.claude;
  if (!prompt || typeof prompt !== 'string' || prompt.length > 20000)
    return res.status(400).json({ error: 'Bad prompt' });

  // Resilience: the content factory shares this OpenRouter key, so a
  // student's request can lose a rate-limit race. Retry the chosen model
  // once, then fall back to a different model before giving up — a slower
  // answer beats an apology.
  const attempts = [model, model, MODELS.deepseek !== model ? MODELS.deepseek : MODELS.claude];
  for (let i = 0; i < attempts.length; i++) {
    try {
      if (i > 0) await new Promise((r2) => setTimeout(r2, 1200));
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, // server-side only
        },
        body: JSON.stringify({
          model: attempts[i],
          max_tokens: Math.min(maxTokens, 4000),
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await r.json();
      const text = data?.choices?.[0]?.message?.content ?? '';
      if (text) return res.status(200).json({ text });
    } catch (e) { /* retry / fall back */ }
  }
  return res.status(502).json({ error: 'Upstream failed' });
}
