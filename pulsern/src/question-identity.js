/* The one identity for a question the student can answer.
   A key is `builtin:<id>`, `bank:<id>`, or `case:<id>`. Bank 7 and
   builtin 7 are different questions. The numeric id stays on the row
   for the bank API. Pools, review, Today, navigation, and history
   match on the key this module returns.

   A row that was never given a source has no canonical key. Callers
   that still group old unscoped fixtures may fall back to the raw id.
   A catalog is stamped before that lookup, so a loaded question does
   not take the fallback. */
export const QUESTION_SOURCES = Object.freeze(["builtin", "bank", "case"]);

export function canonicalKey(source, id) {
  if (!QUESTION_SOURCES.includes(source) || id == null || id === "") return null;
  return `${source}:${id}`;
}

/* Strict identity. No raw-id fallback: an unscoped 7 is not builtin 7
   and not bank 7. */
export function questionIdentity(row) {
  if (!row || row.unclassified) return null;
  if (typeof row.key === "string" && row.key) return row.key;
  if (QUESTION_SOURCES.includes(row.source)) return canonicalKey(row.source, row.id);
  return null;
}

/* Stamp a catalog row before any pool math. A row that already names
   its source keeps that source. A bundled stem match is builtin.
   Everything else that can be answered from the bank list is bank.
   The numeric id is left as it is. */
export function stampCatalogQuestion(q, bundled = []) {
  if (!q || q.unclassified) return q;
  if (QUESTION_SOURCES.includes(q.source)) {
    const key = q.key ?? canonicalKey(q.source, q.id);
    return key ? { ...q, key } : q;
  }
  if (typeof q.id === "string" && q.id.startsWith("case-")) {
    const key = canonicalKey("case", q.id);
    return key ? { ...q, source: "case", key } : q;
  }
  const builtin = (bundled ?? []).some((item) => item && item.id === q.id && item.stem === q.stem);
  const source = builtin ? "builtin" : "bank";
  const key = canonicalKey(source, q.id);
  return key ? { ...q, source, key } : q;
}
