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
export function fingerprint(q) {
  const s = `${q?.stem ?? ""}\u0000${q?.rationale ?? ""}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
