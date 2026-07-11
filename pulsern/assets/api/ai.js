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

  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, // server-side only
      },
      body: JSON.stringify({
        model,
        max_tokens: Math.min(maxTokens, 4000),
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await r.json();
    const text = data?.choices?.[0]?.message?.content ?? '';
    if (!text) return res.status(502).json({ error: 'Empty response' });
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(502).json({ error: 'Upstream failed' });
  }
}
