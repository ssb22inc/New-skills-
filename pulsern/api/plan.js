// api/plan.js — weekly study planner (§5.7). One LLM call (deepseek tier),
// strict JSON out, validated server-side. The client caches the plan in the
// saved blob until the ISO week changes, so this runs at most once a week
// per student.
const CATS = [
  'Management of Care', 'Safety & Infection Control', 'Health Promotion & Maintenance',
  'Psychosocial Integrity', 'Basic Care & Comfort', 'Pharmacology',
  'Reduction of Risk', 'Physiological Adaptation',
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validDays(days) {
  if (!Array.isArray(days) || days.length < 5 || days.length > 14) return null;
  const out = [];
  for (const d of days.slice(0, 7)) {
    if (!d || typeof d.day !== 'string' || !DATE_RE.test(d.day)) return null;
    if (!CATS.includes(d.focusCat)) return null;
    const items = Math.round(Number(d.items));
    if (!Number.isFinite(items) || items < 1 || items > 100) return null;
    if (typeof d.note !== 'string' || !d.note.trim()) return null;
    out.push({ day: d.day, focusCat: d.focusCat, items, note: d.note.trim().slice(0, 300) });
  }
  return out;
}

async function callModel(prompt) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, // server-side only
    },
    body: JSON.stringify({
      model: 'deepseek/deepseek-chat', max_tokens: 1500, temperature: 0.4,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await r.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { examDate, ability = {}, dueCount = 0, answeredTotal = 0, today } = req.body || {};
  if (typeof examDate !== 'string' || !DATE_RE.test(examDate))
    return res.status(400).json({ error: 'Bad examDate' });
  if (new Date(`${examDate}T23:59:59`) <= new Date())
    return res.status(400).json({ error: 'examDate must be in the future' });
  if (typeof ability !== 'object' || Array.isArray(ability))
    return res.status(400).json({ error: 'Bad ability' });
  // The client sends ITS local date so plan days line up with the student's
  // calendar (dates are local — CLAUDE.md rule 4); fall back to server UTC.
  const day1 = (typeof today === 'string' && DATE_RE.test(today))
    ? today : new Date().toISOString().slice(0, 10);
  if (examDate <= day1) return res.status(400).json({ error: 'examDate must be after today' });

  const abilityLines = CATS.map((c) => {
    const a = ability[c] ?? {};
    return `${c}: theta=${Math.round(a.theta ?? 1200)}, answered=${a.n ?? 0}`;
  }).join('\n');

  const prompt = `You are an expert NCLEX-RN study coach. Build a 7-day study plan starting today.

Student data:
- Exam date: ${examDate}
- Flashcards currently due: ${dueCount}
- Total questions answered so far: ${answeredTotal}
- Ability per category (Elo theta, 1200 = starting, higher = stronger):
${abilityLines}

Rules:
- Prioritize the weakest categories (lowest theta, or fewest answered) early in the week.
- Keep daily volume realistic: 8-30 questions per day, lighter the day before heavy days.
- Educational exam-prep guidance only; never real-world dosing or treatment instructions.
- Respond ONLY with raw JSON, no code fences, no commentary, exactly this shape:
{"days":[{"day":"YYYY-MM-DD","focusCat":"<one of: ${CATS.join(' | ')}>","items":<integer>,"note":"<one short coaching sentence>"}]}
- Exactly 7 entries, consecutive days starting with day 1 = ${day1}.`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callModel(prompt);
      const parsed = JSON.parse(raw.replace(/```json|```/gi, '').trim());
      const days = validDays(parsed?.days);
      if (days) return res.status(200).json({ days });
    } catch { /* fall through to retry */ }
  }
  return res.status(502).json({ error: 'Planner failed to produce a valid plan' });
}
