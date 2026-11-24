/* One identity for every question the rewards path can score.
   A key is `builtin:<id>`, `bank:<id>`, or `case:<id>`. Bank 7 and
   builtin 7 are different questions. A row with no single catalog
   home is unclassified: it stays in the log, and it is left out of
   repeat and XP decisions.

   Legacy numbers are resolved only by lookup. Bundled case steps are
   the ids the pre-change app wrote while CASE_STUDIES was listed
   first: 100–102 sepsis, 110–115 dka, 120–125 preeclampsia-magnesium.
   A database case step was `50000 + caseId * 10 + step`. That formula
   only chooses which row to read. The row counts when that case is in
   the case catalog and has that step. An id found in two catalogs, or
   in none, stays unclassified. */
import { CASE_STUDIES } from "./case-studies.js";
import { caseStepIds, legacyCaseAllowlist } from "./rewards.js";
import { QUESTION_SOURCES, canonicalKey } from "./question-identity.js";

export { QUESTION_SOURCES, canonicalKey, questionIdentity, stampCatalogQuestion } from "./question-identity.js";

export function keyOf(row) {
  if (!row || row.unclassified) return null;
  if (typeof row.key === "string" && row.key) return row.key;
  return canonicalKey(row.source, row.id);
}

function asSet(ids) {
  if (!ids) return new Set();
  if (ids instanceof Set) return new Set([...ids].map(String));
  return new Set([...ids].map(String));
}

/* The historical number picks a case and a step. The catalog decides
   whether that step exists. */
export function dbCaseForLegacyId(id, dbCases = []) {
  const n = Number(id);
  if (!Number.isInteger(n) || n < 50000) return null;
  const offset = n - 50000;
  const step = offset % 10;
  const dbId = (offset - step) / 10;
  const found = (dbCases ?? []).find((c) => Number(c?.id) === dbId || Number(c?.dbId) === dbId);
  if (!found || !Array.isArray(found.steps) || step >= found.steps.length) return null;
  const caseId = caseStepIds({ dbId, step }).id;
  return { id: caseId, cat: found.cat, key: canonicalKey("case", caseId) };
}

/* One catalog hit, or null when the id is shared or unknown.
   `bankKnown` must be true: until the bank and case queries have
   returned, a number might still belong to more than one catalog. */
export function resolveLegacyRow(row, catalogs = {}) {
  if (!row || row.id == null || catalogs.bankKnown !== true) return null;
  const id = String(row.id);
  const hits = [];
  if (asSet(catalogs.builtinIds).has(id)) hits.push({ source: "builtin", key: canonicalKey("builtin", row.id) });
  if (asSet(catalogs.bankIds).has(id)) hits.push({ source: "bank", key: canonicalKey("bank", row.id) });
  const bundled = (catalogs.bundledCases ?? legacyCaseAllowlist()).get(id);
  if (bundled && (row.cat == null || bundled.cat === row.cat)) hits.push({ source: "case", key: canonicalKey("case", bundled.caseId) });
  const db = dbCaseForLegacyId(row.id, catalogs.dbCases);
  if (db && (row.cat == null || db.cat === row.cat)) hits.push({ source: "case", key: db.key });
  const unique = [...new Map(hits.map((hit) => [hit.key, hit])).values()];
  return unique.length === 1 ? unique[0] : null;
}

export function classifyLog(log, catalogs = {}) {
  return (log ?? []).map((row) => {
    if (!row || typeof row !== "object") return row;
    if (row.origin === "recorded" && row.key) return row;
    if (QUESTION_SOURCES.includes(row.source)) {
      const key = row.key ?? canonicalKey(row.source, row.id);
      return key ? { ...row, key, unclassified: false } : { ...row, key: null, unclassified: true };
    }
    const resolved = resolveLegacyRow(row, catalogs);
    if (!resolved) return { ...row, key: null, unclassified: true };
    return { ...row, source: resolved.source, key: resolved.key, unclassified: false };
  });
}

/* Copy a review date that was stored under the old number onto the
   key the catalogs just assigned. */
export function rekeySchedule(schedule, before, after) {
  const map = schedule && typeof schedule === "object" && !Array.isArray(schedule) ? { ...schedule } : {};
  (before ?? []).forEach((row, i) => {
    const next = after?.[i];
    if (!next?.key || row?.key === next.key) return;
    const prev = map[row?.id];
    if (prev && map[next.key] == null) map[next.key] = prev;
  });
  return map;
}

export const bundledCaseCatalog = () => legacyCaseAllowlist(CASE_STUDIES);
