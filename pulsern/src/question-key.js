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
  if (asSet(catalogs.builtinIds).has(id)) hits.push({ source: "builtin", key: canonicalKey("builtin", row.id), cat: catalogs.builtinCats?.[id] ?? null });
  if (asSet(catalogs.bankIds).has(id)) hits.push({ source: "bank", key: canonicalKey("bank", row.id), cat: catalogs.bankCats?.[id] ?? null });
  const bundled = (catalogs.bundledCases ?? legacyCaseAllowlist()).get(id);
  if (bundled && (row.cat == null || bundled.cat === row.cat)) hits.push({ source: "case", key: canonicalKey("case", bundled.caseId), cat: bundled.cat ?? null });
  const db = dbCaseForLegacyId(row.id, catalogs.dbCases);
  if (db && (row.cat == null || db.cat === row.cat)) hits.push({ source: "case", key: db.key, cat: db.cat ?? null });
  const unique = [...new Map(hits.map((hit) => [hit.key, hit])).values()];
  if (unique.length === 1) return unique[0];
  /* A recorded category is provenance. It names the row only when exactly
     one catalog hit has that category. A missing category never eliminates
     a hit, so two unknown homes stay unresolved. */
  if (row.cat && unique.length > 1 && unique.every((hit) => hit.cat != null)) {
    const matched = unique.filter((hit) => hit.cat === row.cat);
    if (matched.length === 1) return matched[0];
  }
  return null;
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

/* A numeric review date belongs to the latest answer that can own a
   review: a classified built-in or bank row. A later case step, or a
   row that still has no single home, leaves the number where it is. */
function ownsReview(row) {
  if (!row || row.unclassified || row.schedule === false || !row.key) return false;
  return row.source === "builtin" || row.source === "bank";
}

export function rekeySchedule(schedule, before, after) {
  const map = schedule && typeof schedule === "object" && !Array.isArray(schedule) ? { ...schedule } : {};
  const groups = new Map();
  (after ?? []).forEach((row, i) => {
    const id = before?.[i]?.id ?? row?.id;
    if (id == null) return;
    const raw = map[id] ?? map[String(id)];
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || typeof raw.due !== "string") return;
    const key = String(id);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  });
  for (const [id, indexes] of groups) {
    const latest = after[indexes[indexes.length - 1]];
    if (!ownsReview(latest)) continue;
    const raw = map[id] ?? map[Number(id)];
    if (map[latest.key] != null && map[latest.key] !== raw) continue;
    if (map[latest.key] == null) map[latest.key] = raw;
    delete map[id];
    delete map[Number(id)];
  }
  return map;
}

export const bundledCaseCatalog = () => legacyCaseAllowlist(CASE_STUDIES);
