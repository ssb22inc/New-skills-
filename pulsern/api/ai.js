// api/ai.js — Vercel serverless function (Node runtime)
// The ONLY place AI vendor keys exist. The app sends { provider, prompt },
// never a secret. Swap vendors by editing MODELS — nothing else changes.

const MODELS = {
  claude:   'anthropic/claude-sonnet-4.6',
  gpt:      'openai/gpt-4.1',
  deepseek: 'deepseek/deepseek-chat',   // cheapest tier — route the tutor here
  qwen:     'qwen/qwen-2.5-72b-instruct',
  kimi:     'moonshotai/kimi-k2',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

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
