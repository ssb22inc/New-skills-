/* The lab drawer's AI lookup ("ask any NCLEX question"). Pulled out of
   App.jsx unchanged so the floating toolkit can share it and tests can pin
   it. Behavior is identical to before:
     - only offered when the typed text matches no built-in range
     - POST /api/ai via askModel(LAB_AI_PROVIDER, prompt, LAB_AI_MAX_TOKENS)
       with the signed-in Supabase access token (Bearer + body token);
       the server returns 401 without a signed-in user
     - one answer per query (lower-cased) cached for this session
     - any failure shows LAB_AI_ERROR; nothing is retried client-side */

export const LAB_AI_PROVIDER = "deepseek";
export const LAB_AI_MAX_TOKENS = 400;
export const LAB_AI_ERROR = "The AI lookup is unavailable right now. Try again in a moment.";
export const LAB_AI_NOTE = "✨ AI answer. Verify it against your course materials before relying on it.";
export const LAB_DISCLAIMER = "Study reference only. Ranges vary slightly by lab and textbook, so verify against your course materials.";

export function labAiPrompt(query) {
  return `You are an NCLEX-review study reference. The student typed: "${query}"

If it names a laboratory test, vital sign, or monitored parameter: reply with the standard adult normal reference range exactly as NCLEX review textbooks teach it, one short line formatted "Name: range (units)", plus one more short line for a commonly tested therapeutic or critical value if relevant.

Otherwise, treat it as an NCLEX study question and answer it: plain, clear language, under 110 words, focused on what the exam tests. Verify silently first and give only the final, correct answer — no thinking out loud, no self-correction, no analogies outside the clinical domain.

Both cases: plain text only (no markdown), educational exam-prep register only — never real-world dosing or treatment instructions.`;
}

/* Same match rule as before: name, value, or group name contains the text. */
export function filterLabGroups(groups, q) {
  const needle = String(q ?? "").trim().toLowerCase();
  return groups
    .map((g) => ({ ...g, rows: g.rows.filter(([n, v]) => !needle || n.toLowerCase().includes(needle) || v.toLowerCase().includes(needle) || g.group.toLowerCase().includes(needle)) }))
    .filter((g) => g.rows.length);
}

/* ask(provider, prompt, maxTokens) is askModel. Resolves to the text to
   show — the answer, or LAB_AI_ERROR. */
export async function runLabLookup(ask, query) {
  try {
    return await ask(LAB_AI_PROVIDER, labAiPrompt(query), LAB_AI_MAX_TOKENS);
  } catch (e) {
    return LAB_AI_ERROR;
  }
}
