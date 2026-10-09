/* A fingerprint of the question text a diagram pairing was confirmed for.
   ------------------------------------------------------------------
   The app shows a diagram only when the question on screen has the same
   fingerprint as the one the adversarial reviewer approved. That makes the
   pairing exact rather than "same id":
     - built-in sample questions reuse ids 1, 2, 3… that bank questions also
       use, so an id alone could pin a bank question's diagram onto an
       unrelated sample;
     - a question edited after review stops showing its diagram until the
       pairing is re-confirmed, instead of keeping one that may no longer fit.

   FNV-1a, 32-bit: deterministic, dependency-free, identical in Node and the
   browser. It guards against mismatches, not tampering — the map is a
   reviewed file in the repository, not user input. */
export function fnv1a(text) {
  const s = String(text ?? "");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/* Key-order-independent JSON, so the app and the pairing job (which read
   the same row through different code) always fingerprint it identically. */
export function canonical(v) {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
}

/* Everything the pairing review read and the values were extracted from:
   stem, rationale, options and the keyed answer. An edit to ANY of them —
   an option corrected from NPH to regular, a changed answer — retires the
   pairing until it is re-confirmed (Astra, PR #134 review, round 6: options
   and answer were left out, so a corrected item kept its old diagram). */
export const fingerprint = (q) =>
  fnv1a([q?.stem ?? "", q?.rationale ?? "", canonical(q?.options ?? null), canonical(q?.answer ?? null)].join("\u0000"));

/* A fingerprint of a diagram's clinical content — its claims, captions and
   narration. Every shipped pairing carries the fingerprint of the content
   its pairing review approved, and the app shows a pairing only while the
   diagram still has that content: change what a diagram teaches and its
   old pairings stop showing until they are re-confirmed (Astra, PR #134
   review). Same input as the pairing cache's diagramHash. */
export const diagramFp = (d) =>
  fnv1a(JSON.stringify([d?.id, d?.title, d?.facts, (d?.steps ?? []).map((s) => [s.key, s.caption, s.narration])]));
