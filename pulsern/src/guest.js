/* Try before sign-up. A visitor answers a few real built-in questions,
   gets full rationales and the lab toolkit, then saves the work into a new
   account. Everything here is plain code and LOCAL dates.

   Content boundary: the guest pool is the built-in practice set that
   already ships inside the app bundle as the offline fallback. Shared-bank
   items (RLS: signed-in with access, migration 018), AI items, readiness
   exam items, and case studies are never used here.

   Handoff: the guest's answers live in localStorage on this device. A
   brand-new account imports them through the live answer function. An
   account that already has answer history does not take the trial.
   Each trial answer is stored as builtin:<id>. A shared-bank question
   with the same number is bank:<id> and is a different question. */
import { answerXp, answerCountsForRun, emptyRewards, MAX_COVERS, advanceStreak, streakDayCounted, bumpDay } from "./rewards.js";
import { applyAnswer, stampedQuestion } from "./answer-apply.js";
import { emptyAbility, ABILITY_CATS, undoAbility, updateAbility } from "./ability-engine.js";
import { canonicalKey } from "./question-key.js";

export const GUEST_KEY = "pulsern-guest-v1";
export const GUEST_HOLD_KEY = "pulsern-guest-hold-v1";
export const GUEST_LIMIT = 5;
export const GUEST_TTL_DAYS = 7;
export const GUEST_TYPES = ["mc", "sata"];

export function guestPool(questions = []) {
  return questions.filter((q) =>
    q && GUEST_TYPES.includes(q.type) && !q.ai && q.exam_form == null && !q.premium &&
    typeof q.stem === "string" && Array.isArray(q.options) && typeof q.rationale === "string");
}

export function emptyGuest(now = Date.now(), today) {
  return { v: 1, startedAt: now, day: today, log: [], xp: 0, run: 0, bestRun: 0, ability: null, missSchedule: {}, savedPrompt: false };
}

export function loadGuest(storage) {
  try {
    const raw = storage?.getItem(GUEST_KEY);
    if (!raw) return null;
    const g = JSON.parse(raw);
    if (!g || g.v !== 1 || !Array.isArray(g.log)) return null;
    return g;
  } catch { return null; }
}

export function saveGuest(storage, guest) {
  if (!storage || typeof storage.setItem !== "function") return false;
  try { storage.setItem(GUEST_KEY, JSON.stringify(guest)); return true; } catch { return false; }
}

export function clearGuest(storage) {
  try { storage?.removeItem(GUEST_KEY); } catch { /* private mode */ }
}

/* The sign-up screen unmounts the trial. If the device copy could not be
   written, this hold is the copy that still exists: in memory for this tab,
   and in the passed store (sessionStorage) when that write works. It is
   released only after the account write is confirmed, or when the student
   discards the trial. */
let heldTrial = null;

export function holdGuestTrial(guest, storage) {
  heldTrial = guest && Array.isArray(guest.log) ? guest : null;
  if (!heldTrial) return false;
  if (!storage || typeof storage.setItem !== "function") return false;
  try { storage.setItem(GUEST_HOLD_KEY, JSON.stringify(heldTrial)); return true; }
  catch { return false; }
}

export function clearHeldMemory() {
  heldTrial = null;
}

export function peekHeldGuest(storage) {
  if (heldTrial && Array.isArray(heldTrial.log) && heldTrial.log.length) return heldTrial;
  try {
    const raw = storage?.getItem(GUEST_HOLD_KEY);
    if (!raw) return null;
    const g = JSON.parse(raw);
    if (!g || g.v !== 1 || !Array.isArray(g.log)) return null;
    heldTrial = g;
    return g;
  } catch { return null; }
}

export function releaseHeldGuest(...stores) {
  heldTrial = null;
  for (const storage of stores) {
    try { storage?.removeItem(GUEST_HOLD_KEY); } catch { /* blocked */ }
  }
}

/* One copy. A longer or later hold wins over a short device copy, so the
   answers that could not be stored are not thrown away. The two copies are
   never concatenated. */
export function readGuestForHandoff(storage, holdStorage) {
  const saved = loadGuest(storage);
  const held = peekHeldGuest(holdStorage);
  const stamp = (g) => Number(g?.lastAt ?? g?.startedAt ?? 0);
  const n = (g) => g?.log?.length ?? 0;
  if (!n(saved)) return n(held) ? held : null;
  if (!n(held)) return saved;
  if (stamp(held) !== stamp(saved)) return stamp(held) > stamp(saved) ? held : saved;
  return n(held) > n(saved) ? held : saved;
}

/* The device copy is removed only by the save that was already carrying
   the merged answers when it started. A save that began earlier must not
   delete the copy if Add flips the mark while that save is still in flight. */
export function guestClearOnSave(pendingAtStart) {
  return pendingAtStart === true;
}

/* Saved confirmation is shown only after the write that carries the trial
   answers succeeds. A rejected write stays an error until a later try. */
export function handoffAfterSave({ ok, pending }) {
  if (!pending) return "none";
  return ok ? "saved" : "error";
}

/* A missing session is not a successful write. Callers must keep the device
   copy and must not tell the student the answers are in the account. */
/* A whole-blob write lands only when the stored revision is still the
   one this snapshot was based on. A late older write does not replace
   a newer one. */
export function applyProgressWrite(rows, { userId, key, blob, expectedRevision }) {
  const list = rows ?? [];
  const row = list.find((item) => item.userId === userId && item.key === key);
  const expected = Number(expectedRevision) || 0;
  if (!row) {
    if (expected !== 0) return { conflict: true };
    const created = { userId, key, blob, revision: 1 };
    list.push(created);
    return { revision: 1, rows: list };
  }
  if (Number(row.revision) !== expected) return { conflict: true, rows: list };
  row.blob = blob;
  row.revision = expected + 1;
  return { revision: row.revision, rows: list };
}

function sameLegacyOccurrence(serverRow, localRow) {
  if (!serverRow || !localRow || serverRow.attempt || localRow.attempt) return false;
  return serverRow.id === localRow.id
    && serverRow.correct === localRow.correct
    && (serverRow.day ?? "") === (localRow.day ?? "")
    && (serverRow.at ?? "") === (localRow.at ?? "")
    && (serverRow.ms ?? "") === (localRow.ms ?? "");
}

function logMatch(row, list, used) {
  if (!row) return -1;
  if (row.attempt != null && row.attempt !== "") {
    return (list ?? []).findIndex((item, index) => !used.has(index) && item?.attempt === row.attempt);
  }
  return (list ?? []).findIndex((item, index) => !used.has(index) && sameLegacyOccurrence(row, item));
}

function mergeLogs(serverLog, localLog, baselineLog = null) {
  const used = new Set();
  const baseUsed = new Set();
  const out = [];
  for (const row of serverLog ?? []) {
    if (!row) continue;
    const match = logMatch(row, localLog, used);
    if (match >= 0) {
      used.add(match);
      const localRow = localLog[match];
      const baseAt = baselineLog ? logMatch(row, baselineLog, baseUsed) : -1;
      if (baseAt >= 0) baseUsed.add(baseAt);
      const baseRow = baseAt >= 0 ? baselineLog[baseAt] : undefined;
      out.push(baseRow && sameJson(localRow, baseRow) ? row : localRow);
    } else out.push(row);
  }
  (localLog ?? []).forEach((row, index) => {
    if (row && !used.has(index)) out.push(row);
  });
  return orderAnswers(out);
}

/* Rows that remember when they were taken trade places by that time.
   Rows that do not stay where the merge left them, so an old history
   is not reshuffled just because a new answer carries a clock. */
function answerSeq(row, index) {
  const seq = Number(row?.seq);
  return Number.isFinite(seq) ? seq : index;
}

/* Time first, then the device's own sequence, then the row's place in
   the log. A shared millisecond does not make two answers simultaneous. */
function compareAnswerTime(a, aIndex, b, bIndex) {
  const at = Number(a?.at);
  const bt = Number(b?.at);
  if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at - bt;
  const seq = answerSeq(a, aIndex) - answerSeq(b, bIndex);
  if (seq) return seq;
  return aIndex - bIndex;
}

function appliedBefore(item, row) {
  return compareAnswerTime(item, item._i ?? 0, row, row._i ?? 0) < 0;
}

function orderAnswers(rows) {
  const timed = [];
  rows.forEach((row, index) => {
    const at = Number(row?.at);
    if (Number.isFinite(at)) timed.push({ index, at });
  });
  if (timed.length < 2) return rows;
  const slots = timed.map((item) => item.index);
  const ordered = [...timed].sort((a, b) => compareAnswerTime(rows[a.index], a.index, rows[b.index], b.index));
  const out = rows.slice();
  slots.forEach((slot, i) => { out[slot] = rows[ordered[i].index]; });
  return out;
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/* Local kept a field: the server's copy is the one that changed.
   The server kept it: this device's edit stands. Both changed a
   single value: this save is the edit being written. */
function choose(base, server, local) {
  if (sameJson(local, base)) return server === undefined ? local : server;
  if (sameJson(server, base)) return local;
  return local;
}

function addNum(base, server, local) {
  const b = Number(base) || 0;
  const s = server == null ? b : (Number(server) || 0);
  const l = local == null ? b : (Number(local) || 0);
  return b + (s - b) + (l - b);
}

function mergeIdSet(base, server, local) {
  const b = new Set(base ?? []);
  const s = new Set(server ?? []);
  const l = new Set(local ?? []);
  const out = [];
  const push = (id) => { if (!out.includes(id)) out.push(id); };
  for (const id of b) if (s.has(id) && l.has(id)) push(id);
  for (const id of s) if (!b.has(id)) push(id);
  for (const id of l) if (!b.has(id)) push(id);
  return out;
}

function mergeList(base, server, local) {
  if (base == null && server == null && local == null) return undefined;
  if (sameJson(local, base)) return server === undefined ? local : server;
  if (sameJson(server, base)) return local;
  return mergeIdSet(base ?? [], server ?? [], local ?? []);
}

function mergeById(base, server, local) {
  if (base == null && server == null && local == null) return undefined;
  if (sameJson(local, base)) return server === undefined ? local : server;
  if (sameJson(server, base)) return local;
  const idOf = (item, index) => (item && item.id != null ? `id:${item.id}` : `at:${index}`);
  const baseIds = new Map((base ?? []).map((item, index) => [idOf(item, index), item]));
  const serverIds = new Map((server ?? []).map((item, index) => [idOf(item, index), item]));
  const localIds = new Map((local ?? []).map((item, index) => [idOf(item, index), item]));
  const ids = new Set([...baseIds.keys(), ...serverIds.keys(), ...localIds.keys()]);
  const out = [];
  for (const id of ids) {
    const value = choose(baseIds.get(id), serverIds.get(id), localIds.get(id));
    if (value !== undefined) out.push(value);
  }
  return out;
}

function mergeExamResults(base, server, local) {
  if (base == null && server == null && local == null) return undefined;
  if (sameJson(local, base)) return server === undefined ? local : server;
  if (sameJson(server, base)) return local;
  const keys = new Set([...Object.keys(base ?? {}), ...Object.keys(server ?? {}), ...Object.keys(local ?? {})]);
  const out = {};
  for (const key of keys) {
    const value = choose(base?.[key], server?.[key], local?.[key]);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function mergeFcNew(base, server, local) {
  if (base == null && server == null && local == null) return undefined;
  if (sameJson(local, base)) return server === undefined ? local : server;
  if (sameJson(server, base)) return local;
  const b = base ?? { day: null, count: 0 };
  const s = server ?? { day: null, count: 0 };
  const l = local ?? { day: null, count: 0 };
  if (s.day !== l.day) {
    const day = [s.day, l.day].filter((item) => typeof item === "string").sort().pop() ?? null;
    return l.day === day ? l : s;
  }
  const listed = (value) => (Array.isArray(value) ? value.filter((id) => id != null) : null);
  const baseIds = listed(b.ids) ?? [];
  const serverIds = listed(s.ids);
  const localIds = listed(l.ids);
  const anonymous = Math.max(0, (Number(b.count) || 0) - baseIds.length);
  const added = [];
  const pushNew = (id) => {
    if (!baseIds.includes(id) && !added.includes(id)) added.push(id);
  };
  for (const id of serverIds ?? []) pushNew(id);
  for (const id of localIds ?? []) pushNew(id);
  const removed = new Set();
  if (serverIds) for (const id of baseIds) if (!serverIds.includes(id)) removed.add(id);
  if (localIds) for (const id of baseIds) if (!localIds.includes(id)) removed.add(id);
  const ids = [...baseIds.filter((id) => !removed.has(id)), ...added];
  const count = Math.max(anonymous + ids.length, Number(s.count) || 0, Number(l.count) || 0);
  return { day: s.day ?? null, count, ...(ids.length ? { ids } : {}) };
}

function dayNum(rewards, day, key) {
  return Number(rewards?.days?.[day]?.[key]) || 0;
}

function changedEntries(baseMap, sideMap) {
  const out = {};
  const keys = new Set([...Object.keys(baseMap ?? {}), ...Object.keys(sideMap ?? {})]);
  for (const key of keys) if (!sameJson(baseMap?.[key], sideMap?.[key])) out[key] = sideMap?.[key] ?? null;
  return out;
}

function opSum(ops, day, key) {
  return (ops ?? []).filter((op) => op?.day === day).reduce((total, op) => total + (Number(op?.[key]) || 0), 0);
}

/* A card grade carries an id. The same id on both devices is one grade.
   Removing an id that the baseline had is an undo. */
function mergeCardOps(base, server, local) {
  const present = [base, server, local].some((blob) => Array.isArray(blob?.rewards?.cardOps));
  if (!present) return null;
  const lists = [base, server, local].map((blob) => new Map((blob?.rewards?.cardOps ?? []).filter((op) => op?.id != null).map((op) => [op.id, op])));
  const seen = new Set();
  const out = [];
  for (const [id] of [...lists[0], ...lists[1], ...lists[2]]) {
    if (seen.has(id)) continue;
    seen.add(id);
    const inBase = lists[0].has(id);
    const inServer = lists[1].has(id);
    const inLocal = lists[2].has(id);
    if (inBase && (!inServer || !inLocal)) continue;
    const op = lists[2].get(id) ?? lists[1].get(id);
    if (op) out.push(op);
  }
  return out;
}

function mergeRewards(base, server, local, replayed, localReplay, serverReplay, hasBaseline, unseen, sameCards = false, mergedOps = null) {
  const b = base?.rewards;
  const s = server?.rewards;
  const l = local?.rewards;
  if (b == null && s == null && l == null) return undefined;
  if (!hasBaseline) {
    if (unseen && !l) return replayed.rewards;
    return l === undefined ? s : l;
  }
  if (sameJson(l, b) && !unseen) return s === undefined ? l : s;
  if (sameJson(s, b) && !unseen) return l;
  const replayRewards = replayed.rewards ?? b ?? emptyRewards();
  const duplicate = sameCards || (sameJson(l, s) && sameJson(local.srsMap, server.srsMap));
  const days = {};
  const dayKeys = new Set([
    ...Object.keys(b?.days ?? {}),
    ...Object.keys(s?.days ?? {}),
    ...Object.keys(l?.days ?? {}),
    ...Object.keys(replayRewards.days ?? {}),
  ]);
  for (const day of dayKeys) {
    const baseOps = Array.isArray(b?.cardOps) ? b.cardOps : [];
    const localCardXp = mergedOps ? opSum(mergedOps, day, "xp") - opSum(baseOps, day, "xp") : dayNum(l, day, "xp") - dayNum(localReplay?.rewards, day, "xp");
    const serverCardXp = mergedOps ? 0 : dayNum(s, day, "xp") - dayNum(serverReplay?.rewards, day, "xp");
    const cards = mergedOps
      ? dayNum(b, day, "cards") + opSum(mergedOps, day, "cards") - opSum(baseOps, day, "cards")
      : addNum(dayNum(b, day, "cards"), dayNum(s, day, "cards"), dayNum(l, day, "cards"));
    const cardCards = !mergedOps && duplicate ? dayNum(l, day, "cards") : cards;
    const xp = dayNum(replayRewards, day, "xp") + localCardXp + (duplicate && !mergedOps ? 0 : serverCardXp);
    const q = dayNum(replayRewards, day, "q");
    const ok = dayNum(replayRewards, day, "ok");
    const fixes = dayNum(replayRewards, day, "fixes");
    const ms = duplicate ? dayNum(l, day, "ms") : addNum(dayNum(b, day, "ms"), dayNum(s, day, "ms"), dayNum(l, day, "ms"));
    if (q || ok || xp || cardCards || fixes || ms) days[day] = { q, ok, xp, cards: cardCards, fixes, ms };
  }
  const best = {};
  for (const key of ["run", "sessionAcc", "sessionN", "dayQ", "streak"]) {
    best[key] = Math.max(Number(b?.best?.[key]) || 0, Number(s?.best?.[key]) || 0, Number(l?.best?.[key]) || 0, Number(replayRewards.best?.[key]) || 0);
  }
  const prefKeys = new Set([...Object.keys(b?.prefs ?? {}), ...Object.keys(s?.prefs ?? {}), ...Object.keys(l?.prefs ?? {})]);
  const prefs = {};
  for (const key of prefKeys) prefs[key] = choose(b?.prefs?.[key], s?.prefs?.[key], l?.prefs?.[key]);
  const badgeKeys = new Set([...Object.keys(b?.badgesSeen ?? {}), ...Object.keys(s?.badgesSeen ?? {}), ...Object.keys(l?.badgesSeen ?? {})]);
  const badgesSeen = {};
  for (const key of badgeKeys) {
    badgesSeen[key] = Math.max(Number(b?.badgesSeen?.[key]) || 0, Number(s?.badgesSeen?.[key]) || 0, Number(l?.badgesSeen?.[key]) || 0);
  }
  const ranks = [b?.rankHigh, s?.rankHigh, l?.rankHigh].filter((rank) => Number.isInteger(rank));
  const baseWeeks = new Set(b?.coverWeeks ?? []);
  const coverWeeks = [...new Set([...(b?.coverWeeks ?? []), ...(s?.coverWeeks ?? []), ...(l?.coverWeeks ?? [])])];
  const grants = (side) => (side?.coverWeeks ?? []).filter((week) => !baseWeeks.has(week)).length;
  const consumed = (side) => Math.max(0, grants(side) - ((Number(side?.covers) || 0) - (Number(b?.covers) || 0)));
  const serverUsed = consumed(s);
  const localUsed = consumed(l);
  const used = serverUsed === localUsed && sameJson(s?.coverDays, l?.coverDays) ? serverUsed : serverUsed + localUsed;
  const covers = Math.max(0, Math.min(MAX_COVERS, (Number(b?.covers) || 0) + coverWeeks.filter((week) => !baseWeeks.has(week)).length - used));
  return {
    ...(l ?? s ?? b),
    days,
    covers,
    coverWeeks,
    coverDays: [...new Set([...(b?.coverDays ?? []), ...(s?.coverDays ?? []), ...(l?.coverDays ?? [])])],
    best,
    milestones: [...new Set([...(b?.milestones ?? []), ...(s?.milestones ?? []), ...(l?.milestones ?? [])])].filter(Number.isFinite),
    rankHigh: ranks.length ? Math.max(...ranks) : (l?.rankHigh ?? s?.rankHigh ?? b?.rankHigh ?? null),
    badgesSeen,
    prefs,
    ...(mergedOps ? { cardOps: mergedOps } : {}),
  };
}

/* A save that is no longer the newest snapshot must not become the
   baseline. The next save still has to see what the other device wrote. */
/* Same rule as migration 022. A missing or unchanged revision is an
   older client: keep the write and advance the counter. A client that
   sends a revision must send a greater one. */
export function progressRevisionOnUpdate(oldRevision, incoming) {
  const oldRev = Number(oldRevision) || 0;
  if (incoming == null || Number(incoming) === oldRev) return { revision: oldRev + 1, legacy: true };
  const next = Number(incoming);
  if (!Number.isFinite(next) || next < oldRev) throw new Error("progress revision conflict");
  return { revision: next, legacy: false };
}

export function bindCommittedProgress(state, commit) {
  if (!commit?.current || commit.seenEpoch !== commit.epoch) return state;
  return { accepted: commit.blob, baseline: commit.blob, revision: Number(commit.revision) || 0 };
}

function addDelta(base, server, local, key) {
  const b = Number(base?.[key]) || 0;
  return b + ((Number(server?.[key]) || 0) - b) + ((Number(local?.[key]) || 0) - b);
}

function mergeMap(base, server, local) {
  const out = { ...(base ?? {}) };
  const keys = new Set([...Object.keys(base ?? {}), ...Object.keys(server ?? {}), ...Object.keys(local ?? {})]);
  for (const key of keys) {
    const b = base?.[key];
    const s = server?.[key];
    const l = local?.[key];
    if (JSON.stringify(l) !== JSON.stringify(b)) out[key] = l;
    else if (JSON.stringify(s) !== JSON.stringify(b)) out[key] = s;
    else if (s !== undefined) out[key] = s;
    else delete out[key];
  }
  return out;
}

function legacySignature(row) {
  return JSON.stringify([row?.id ?? "", row?.correct ?? "", row?.day ?? "", row?.at ?? "", row?.ms ?? "", row?.key ?? "", row?.cat ?? ""]);
}

function replayUnseen(base, rows) {
  const seen = new Set((base.log ?? []).map((row) => row?.attempt).filter((id) => id != null && id !== "").map(String));
  const knownLegacy = new Set((base.log ?? []).filter((row) => row && (row.attempt == null || row.attempt === "")).map(legacySignature));
  let state = {
    log: Array.isArray(base.log) ? [...base.log] : [],
    xp: Number(base.xp) || 0,
    ability: { ...emptyAbility(ABILITY_CATS), ...(base.ability ?? {}) },
    streak: base.streak,
    rewards: base.rewards ?? emptyRewards(),
    daily: base.daily,
    missSchedule: { ...(base.missSchedule ?? {}) },
    run: base.run ?? 0,
    bestRun: base.bestRun ?? 0,
  };
  for (const row of rows ?? []) {
    if (!row) continue;
    if (row.attempt != null && row.attempt !== "") {
      if (seen.has(String(row.attempt))) continue;
      seen.add(String(row.attempt));
    } else {
      const sig = legacySignature(row);
      if (knownLegacy.has(sig)) continue;
      knownLegacy.add(sig);
      if (!row.source && !row.key && row.cat) {
        state = { ...state, ability: updateAbility(state.ability, { id: row.id, cat: row.cat, diff: row.diff }, !!row.correct).ability };
        continue;
      }
    }
    const words = Number(row.words);
    const stem = Number.isFinite(words) && words > 0 ? Array.from({ length: words }, () => "w").join(" ") : (row.stem || "");
    const rating = Number(row.rating);
    const applied = applyAnswer(state, {
      q: { id: row.id, key: row.key, source: row.source, cat: row.cat, diff: row.diff, stem, population: row.pop },
      correct: !!row.correct,
      ms: Number.isFinite(row.ms) ? row.ms : Infinity,
      today: row.day,
      attempt: row.attempt,
      at: Number.isFinite(Number(row.at)) ? Number(row.at) : undefined,
      words: Number.isFinite(words) ? words : undefined,
      rating: Number.isFinite(rating) ? rating : undefined,
      calibration: Number.isFinite(rating) ? { [row.id]: { rating } } : {},
      schedule: row.schedule !== false,
    });
    if (!applied.duplicate) state = applied.state;
  }
  return state;
}

function undoReviewStep(schedule, key, correct) {
  const entry = schedule?.[key];
  if (!entry) return schedule ?? {};
  const interval = Number(entry.interval) || 0;
  if (!correct) {
    if (interval !== 1) return schedule;
    const next = { ...schedule };
    delete next[key];
    return next;
  }
  if (interval === 3) return { ...schedule, [key]: { ...entry, interval: 1 } };
  const prev = (interval - 1) / 2;
  if (Number.isInteger(prev) && prev >= 1) return { ...schedule, [key]: { ...entry, interval: prev } };
  return schedule;
}

function questionXp(logBefore, row) {
  const words = Number(row?.words);
  const stem = Number.isFinite(words) && words > 0 ? Array.from({ length: words }, () => "w").join(" ") : (row?.stem || "");
  const rating = Number(row?.rating);
  return answerXp({
    q: { id: row.id, key: row.key, source: row.source, cat: row.cat, diff: row.diff, stem },
    correct: !!row.correct,
    ms: Number.isFinite(row.ms) ? row.ms : Infinity,
    log: logBefore,
    calibration: Number.isFinite(rating) ? { [row.id]: { rating } } : {},
  }).xp || 0;
}

function blankScore(base) {
  return {
    log: [],
    xp: Number(base?.xp) || 0,
    ability: { ...emptyAbility(ABILITY_CATS), ...(base?.ability ?? {}) },
    rewards: base?.rewards ?? emptyRewards(),
    daily: base?.daily ?? null,
    missSchedule: { ...(base?.missSchedule ?? {}) },
    streak: base?.streak ?? null,
    run: base?.run ?? 0,
    bestRun: Number(base?.bestRun) || 0,
  };
}

/* An incoming answer can be older than one this device already saved.
   Scoring it on top of that newer answer reverses ability and the review
   ladder. Replay the tail from the point before the older answer. */
function replayOrdered(base, mergedLog) {
  const attemptId = (row) => (row?.attempt != null && row.attempt !== "" ? String(row.attempt) : "");
  const baseAttempts = new Set((base.log ?? []).map(attemptId).filter(Boolean));
  const incoming = (mergedLog ?? []).filter((row) => attemptId(row) && !baseAttempts.has(attemptId(row)));
  const times = incoming.map((row) => Number(row.at)).filter(Number.isFinite);
  if (!incoming.length || times.length !== incoming.length) return { state: replayUnseen(base, mergedLog), fromZero: false, redo: false };
  const earliest = Math.min(...times);
  const redo = new Set();
  for (const row of base.log ?? []) {
    const at = Number(row?.at);
    if (attemptId(row) && Number.isFinite(at) && at >= earliest) redo.add(attemptId(row));
  }
  if (!redo.size) return { state: replayUnseen(base, mergedLog), fromZero: false, redo: false };
  const prefixRows = (base.log ?? []).filter((row) => !redo.has(attemptId(row)));
  const start = { ...blankScore(base), log: prefixRows.map((row) => ({ ...row })) };
  const redoRows = (base.log ?? [])
    .map((row, index) => ({ ...row, _i: index }))
    .filter((row) => redo.has(attemptId(row)))
    .sort((a, b) => compareAnswerTime(b, b._i, a, a._i));
  for (const row of redoRows) {
    const before = prefixRows.concat(redoRows.filter((item) => appliedBefore(item, row)));
    const gained = questionXp(before, row);
    const scored = answerXp({
      q: { id: row.id, key: row.key, source: row.source, cat: row.cat, diff: row.diff, stem: Number(row.words) > 0 ? Array.from({ length: Number(row.words) }, () => "w").join(" ") : "" },
      correct: !!row.correct,
      ms: Number.isFinite(row.ms) ? row.ms : Infinity,
      log: before,
    });
    start.xp = Math.max(0, (Number(start.xp) || 0) - gained);
    const rating = Number(row.rating);
    start.ability = undoAbility(start.ability, {
      id: row.id, key: row.key, source: row.source, cat: row.cat, diff: row.diff,
    }, !!row.correct, Number.isFinite(rating) ? { [row.id]: { rating } } : {});
    if (row.day && start.rewards) {
      start.rewards = bumpDay(start.rewards, row.day, {
        q: -1, ok: row.correct ? -1 : 0, xp: -gained, fixes: scored.reason === "fix" ? -1 : 0,
      });
    }
    if (start.daily?.day === row.day) start.daily = { ...start.daily, answered: Math.max(0, (start.daily.answered ?? 0) - 1) };
    if (row.key && before.some((item) => item?.key === row.key && item.correct === false)) {
      start.missSchedule = undoReviewStep(start.missSchedule, row.key, !!row.correct);
    }
  }
  const suffix = (mergedLog ?? []).filter((row) => {
    const id = attemptId(row);
    return id && (redo.has(id) || !baseAttempts.has(id));
  });
  return { state: replayUnseen(start, suffix), fromZero: false, redo: true };
}

function studyDays(log, blobs) {
  const days = new Set();
  for (const row of log ?? []) if (typeof row?.day === "string") days.add(row.day);
  for (const blob of blobs ?? []) for (const op of blob?.rewards?.cardOps ?? []) if (typeof op?.day === "string") days.add(op.day);
  return [...days].sort();
}

/* The saved streak already counts a later day. An older day cannot be
   added on top of it. Rebuild only when the log itself explains the
   streak, so a long streak is not cut down to the rows still on hand. */
function streakBeforeInsertedDay(base, log, blobs) {
  const days = studyDays(log, blobs);
  const last = base.streak?.lastDay;
  if (!last || !days.some((day) => day < last)) return null;
  const explained = new Set();
  for (const row of base.log ?? []) if (typeof row?.day === "string") explained.add(row.day);
  for (const op of base.rewards?.cardOps ?? []) if (typeof op?.day === "string") explained.add(op.day);
  if ((Number(base.streak?.count) || 0) > explained.size) return null;
  let streak = null;
  let rewards = emptyRewards();
  for (const day of days) {
    if (streakDayCounted(streak, null, day)) continue;
    const adv = advanceStreak(streak, rewards, day);
    streak = adv.streak;
    rewards = adv.rewards;
  }
  return streak;
}

function streakFrom(base, days) {
  let streak = base.streak;
  let rewards = base.rewards ?? emptyRewards();
  for (const day of days) {
    if (streakDayCounted(streak, null, day)) continue;
    const adv = advanceStreak(streak, rewards, day);
    streak = adv.streak;
    rewards = adv.rewards;
  }
  return streak;
}

function activityDays(base, log, blobs) {
  const seen = new Set((base.log ?? []).map((row) => (row?.attempt != null && row.attempt !== "" ? String(row.attempt) : "")).filter(Boolean));
  const knownOps = new Set((base.rewards?.cardOps ?? []).map((op) => op?.id).filter((id) => id != null));
  const days = new Set();
  for (const row of log ?? []) if (row?.day && row?.attempt && !seen.has(String(row.attempt))) days.add(row.day);
  for (const blob of blobs) {
    for (const op of blob?.rewards?.cardOps ?? []) if (op?.day && !knownOps.has(op.id)) days.add(op.day);
  }
  return [...days].sort();
}

function put(merged, key, value) {
  if (value === undefined) {
    if (merged[key] !== undefined) delete merged[key];
    return;
  }
  if (!sameJson(merged[key], value)) merged[key] = value;
}

/* Rows already stored stay rows. A legacy identity correction updates the
   matching row. New live attempts are scored once from the shared baseline,
   so a lost acknowledgement cannot add their XP a second time. Card XP is
   not in that replay: it is the part of the total the questions do not
   explain, kept once when both copies are the same grade. */
export function reconcileProgress(serverBlob, localBlob, baselineBlob = null) {
  const server = serverBlob && typeof serverBlob === "object" && !Array.isArray(serverBlob) ? serverBlob : {};
  const local = localBlob && typeof localBlob === "object" && !Array.isArray(localBlob) ? localBlob : {};
  /* A missing baseline is an empty account, not "the server is the baseline".
     Otherwise a late empty save treats the other device's answer as already
     scored and writes its XP back to zero. */
  const hasBaseline = baselineBlob == null || (typeof baselineBlob === "object" && !Array.isArray(baselineBlob));
  const base = baselineBlob != null && typeof baselineBlob === "object" && !Array.isArray(baselineBlob) ? baselineBlob : {};
  const log = mergeLogs(server.log, local.log, hasBaseline ? (base.log ?? []) : null);
  const ordered = replayOrdered(base, log);
  const replayed = ordered.state;
  const unseen = log.some((row) => row?.attempt && !(base.log ?? []).some((item) => item?.attempt === row.attempt));
  const localReplay = hasBaseline ? replayUnseen(base, local.log) : null;
  const serverReplay = hasBaseline ? replayUnseen(base, server.log) : null;
  const merged = { ...local };
  put(merged, "log", log);
  let nextXp;
  if (!hasBaseline) nextXp = unseen ? replayed.xp : (Number(local.xp) || 0);
  else {
    const extra = (blob, replay) => (Number(blob?.xp) || 0) - (Number(replay?.xp) || 0);
    const localExtra = extra(local, localReplay);
    const serverExtra = extra(server, serverReplay);
    const mergedOps = mergeCardOps(base, server, local);
    const sameCards = localExtra === serverExtra && sameJson(changedEntries(base.srsMap, local.srsMap), changedEntries(base.srsMap, server.srsMap));
    const sumOps = (ops) => (ops ?? []).reduce((total, op) => total + (Number(op?.xp) || 0), 0);
    const cardXp = mergedOps ? sumOps(mergedOps) - sumOps(base.rewards?.cardOps) : 0;
    if (ordered.redo) nextXp = (Number(replayed.xp) || 0) + cardXp;
    else if (mergedOps) nextXp = (Number(replayed.xp) || 0) + cardXp;
    else nextXp = (Number(replayed.xp) || 0) + localExtra + (sameCards ? 0 : serverExtra);
  }
  put(merged, "xp", nextXp);
  if (base.bestRun != null || server.bestRun != null || local.bestRun != null || unseen) {
    put(merged, "bestRun", Math.max(Number(base.bestRun) || 0, Number(server.bestRun) || 0, Number(local.bestRun) || 0, Number(replayed.bestRun) || 0));
  }
  const days = activityDays(base, log, [server, local]);
  const cardDays = days.filter((day) => [server, local].some((blob) => (blob?.rewards?.cardOps ?? []).some((op) => op?.day === day && !(base.rewards?.cardOps ?? []).some((item) => item?.id === op.id))));
  if (unseen) {
    put(merged, "ability", replayed.ability);
    let daily = replayed.daily;
    if (daily?.day && cardDays.includes(daily.day)) {
      const known = new Set((base.rewards?.cardOps ?? []).map((op) => op?.id));
      const uniqueExtra = new Set([server, local].flatMap((blob) => (blob?.rewards?.cardOps ?? []).filter((op) => op?.day === daily.day && !known.has(op?.id)).map((op) => op.id)));
      const counted = [...uniqueExtra].reduce((sum, id) => {
        const op = [local, server].flatMap((blob) => blob?.rewards?.cardOps ?? []).find((item) => item?.id === id);
        return sum + (Number(op?.cards) || 0);
      }, 0);
      if (counted) daily = { ...daily, answered: (daily.answered ?? 0) + counted };
    }
    put(merged, "daily", daily);
    const rebuilt = streakBeforeInsertedDay(base, log, [server, local]);
    put(merged, "streak", rebuilt ?? (ordered.redo && sameJson(local.streak, base.streak) && server.streak ? server.streak : (cardDays.length ? streakFrom(base, days) : replayed.streak)));
  } else if (cardDays.length) {
    if (base.ability || server.ability || local.ability) put(merged, "ability", mergeMap(base.ability, server.ability, local.ability));
    if (base.daily != null || server.daily != null || local.daily != null) put(merged, "daily", choose(base.daily, server.daily, local.daily));
    put(merged, "streak", streakFrom(base, days));
  } else {
    if (base.ability || server.ability || local.ability) put(merged, "ability", mergeMap(base.ability, server.ability, local.ability));
    if (base.daily != null || server.daily != null || local.daily != null) put(merged, "daily", choose(base.daily, server.daily, local.daily));
    if (base.streak != null || server.streak != null || local.streak != null) put(merged, "streak", choose(base.streak, server.streak, local.streak));
  }
  if (base.missSchedule || server.missSchedule || local.missSchedule) {
    put(merged, "missSchedule", mergeMap(base.missSchedule, server.missSchedule, unseen ? replayed.missSchedule : local.missSchedule));
  }
  if (base.srsMap || server.srsMap || local.srsMap) put(merged, "srsMap", mergeMap(base.srsMap, server.srsMap, local.srsMap));
  put(merged, "rewards", mergeRewards(base, server, local, replayed, localReplay, serverReplay, hasBaseline, unseen, hasBaseline && sameJson(changedEntries(base.srsMap, local.srsMap), changedEntries(base.srsMap, server.srsMap)) && ((Number(local.xp) || 0) - (Number(localReplay?.xp) || 0)) === ((Number(server.xp) || 0) - (Number(serverReplay?.xp) || 0)), mergeCardOps(base, server, local)));
  if (merged.rewards && (Number(merged.streak?.count) || 0) > (Number(merged.rewards.best?.streak) || 0)) {
    merged.rewards = { ...merged.rewards, best: { ...merged.rewards.best, streak: merged.streak.count } };
  }
  put(merged, "examResults", mergeExamResults(base.examResults, server.examResults, local.examResults));
  put(merged, "fcNew", mergeFcNew(base.fcNew, server.fcNew, local.fcNew));
  put(merged, "flagged", mergeList(base.flagged, server.flagged, local.flagged));
  put(merged, "flaggedCases", mergeList(base.flaggedCases, server.flaggedCases, local.flaggedCases));
  put(merged, "customQs", mergeById(base.customQs, server.customQs, local.customQs));
  if (base.fcFlips != null || server.fcFlips != null || local.fcFlips != null) {
    const flips = sameJson(local.fcFlips, base.fcFlips) || sameJson(server.fcFlips, base.fcFlips)
      ? choose(base.fcFlips, server.fcFlips, local.fcFlips)
      : addNum(base.fcFlips, server.fcFlips, local.fcFlips);
    put(merged, "fcFlips", flips);
  }
  const handled = new Set(["log", "xp", "bestRun", "ability", "daily", "streak", "missSchedule", "srsMap", "rewards", "examResults", "fcNew", "flagged", "flaggedCases", "customQs", "fcFlips"]);
  for (const key of new Set([...Object.keys(base), ...Object.keys(server), ...Object.keys(local)])) {
    if (handled.has(key)) continue;
    put(merged, key, choose(base[key], server[key], local[key]));
  }
  return merged;
}

export function blobForSave(accepted, local, baseline = null) {
  if (!accepted || !local) return local;
  const merged = reconcileProgress(accepted, local, baseline ?? accepted);
  if (JSON.stringify(merged) === JSON.stringify(local)) return local;
  return merged;
}

/* A late read for account A must not replace account B's loaded progress. */
export function noteAccountRead(state, read) {
  const epoch = Number(read?.epoch) || 0;
  if (Number(state?.epoch) > epoch) return state;
  if (state?.user && read?.user && state.user !== read.user && Number(state?.epoch) === epoch) return state;
  return { user: read?.user ?? null, blob: read?.blob ?? null, revision: Number(read?.revision) || 0, epoch };
}

/* knownRevision matches: this device still owns the row, so its blob lands.
   It does not: keep the server row and fold in only this device's new answers. */
export function recoverProgressWrite(row, localBlob, knownRevision) {
  const expected = Number(knownRevision) || 0;
  if (Number(row?.revision) === expected) {
    row.blob = localBlob;
    row.revision = expected + 1;
    return { revision: row.revision, blob: row.blob };
  }
  const merged = reconcileProgress(row?.blob, localBlob);
  row.blob = merged;
  row.revision = (Number(row?.revision) || 0) + 1;
  return { revision: row.revision, blob: merged, reconciled: true };
}

/* A reset starts a new epoch. A save that began in the old epoch must
   not put its revision back. */
export function createProgressEpoch() {
  let revision = 0;
  let epoch = 0;
  return {
    epoch: () => epoch,
    revision: () => revision,
    note(next, seen) {
      if (seen !== epoch) return false;
      revision = Number(next) || 0;
      return true;
    },
    abandon() {
      epoch += 1;
      revision = 0;
    },
  };
}

/* window.localStorage itself can throw. Callers get null and keep going. */
export function storageOrNull(read) {
  try {
    const storage = typeof read === "function" ? read() : read;
    return storage ?? null;
  } catch {
    return null;
  }
}

export function persistDecision(session, expectedUserId) {
  if (!session?.user?.id) return "signed-out";
  if (expectedUserId && session.user.id !== expectedUserId) return "account-changed";
  return "write";
}

/* One account, one write at a time, newest payload wins. A save that was
   scheduled earlier never runs once a later one exists, so it cannot land
   after the merged trial and erase those answers. */
export const SIGN_OUT_FLUSH_MS = 3000;

/* Sign-out waits for the newest save, but only briefly. A write that
   never settles must not trap the student on a shared device. */
export function waitForFlush(flush, ms = SIGN_OUT_FLUSH_MS) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, timedOut: true });
    }, ms);
    Promise.resolve()
      .then(flush)
      .then((result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result?.ok === false ? { ...result, timedOut: false } : { ok: true, ...(result ?? {}), timedOut: false });
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ ok: false, timedOut: false });
      });
  });
}

export const SAVE_ATTEMPT_MS = 8000;

/* One account, one write at a time, newest payload wins. A save that
   does not finish is aborted so a later snapshot can be written. An
   older request is not allowed to land after that. */
export function createSaveQueue({ attemptMs = SAVE_ATTEMPT_MS } = {}) {
  let chain = Promise.resolve();
  let latest = 0;
  let settled = 0;
  let active = null;
  return {
    next() { latest += 1; return latest; },
    pending() { return settled !== latest; },
    invalidate() {
      latest += 1;
      settled = latest;
      active?.abort();
    },
    enqueue(seq, task) {
      const run = chain.catch(() => {}).then(async () => {
        if (seq !== latest) return { stale: true };
        const ctrl = new AbortController();
        active = ctrl;
        const isCurrent = () => seq === latest && !ctrl.signal.aborted;
        let timer;
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => {
            ctrl.abort();
            reject(Object.assign(new Error("save-timeout"), { code: "save-timeout" }));
          }, attemptMs);
        });
        try {
          const result = await Promise.race([
            Promise.resolve().then(() => task({ signal: ctrl.signal, isCurrent })),
            timeout,
          ]);
          const extra = result && typeof result === "object" ? result : {};
          if (!isCurrent()) return { stale: true, ...extra };
          if (seq === latest) settled = seq;
          return { ok: true, ...extra };
        } catch (error) {
          if (seq !== latest) return { stale: true };
          return { ok: false, error };
        } finally {
          clearTimeout(timer);
          if (active === ctrl) active = null;
        }
      });
      chain = run;
      return run;
    },
    /* Wait until the newest payload has finished. Sign-out uses this so a
       save that is only queued cannot be dropped on the floor. */
    async flush() {
      let result = { ok: true };
      let seen = null;
      while (chain !== seen) {
        seen = chain;
        result = await seen;
      }
      if (!result || result.ok) return { ok: true };
      return { ok: false, ...result };
    },
  };
}

/* A merged trial stores guest-<built-in id>. That alias belongs only to the
   bundled question with the same stem, never to a shared-bank item that
   happens to use the same number. */
export function linkBuiltInGuest(q, registry = []) {
  if (!q) return q;
  const bundled = registry.find((item) => item && item.id === q.id && item.stem === q.stem);
  if (!bundled) return q;
  const alias = `guest-${bundled.id}`;
  if ((q.aliases ?? []).map(String).includes(alias)) return q;
  return { ...q, aliases: [...(q.aliases ?? []), alias] };
}

/* Kept for GUEST_TTL_DAYS after the LAST answer (the save screen says so),
   so answers the student just gave are never the ones that expire. */
export function guestFresh(guest, now = Date.now()) {
  if (!guest || !Array.isArray(guest.log) || guest.log.length === 0) return false;
  const last = Number(guest.lastAt ?? guest.startedAt ?? 0);
  return now - last <= GUEST_TTL_DAYS * 86400000;
}

export const guestRemaining = (guest) => Math.max(0, GUEST_LIMIT - (guest?.log?.length ?? 0));

/* One scored guest answer. Same XP rules as an account (rewards.js). */
export function guestAnswer(guest, q, correct, { ms = Infinity, today } = {}) {
  if (guestRemaining(guest) === 0) return { guest, res: { xp: 0, reason: "limit" }, accepted: false };
  const item = stampedQuestion({ ...q, source: "builtin" });
  const res = answerXp({ q: item, correct, ms, log: guest.log });
  const run = answerCountsForRun({ correct, q: item, ms }) ? guest.run + 1 : 0;
  const words = String(q?.stem ?? "").trim().split(/\s+/).filter(Boolean).length;
  const studyDay = today ?? guest.day;
  /* Stable for this trial, unique per answer. A later trial has a new
     startedAt, so the same question is a new attempt. A retried merge of
     this trial repeats these ids and adds nothing. */
  const attempt = `${guest.startedAt}:${guest.log.length}`;
  const at = Date.now();
  const entry = {
    id: q.id, key: item.key, source: "builtin", cat: q.cat, diff: q.diff, correct, attempt, at,
    ...(studyDay ? { day: studyDay } : {}),
    ...(Number.isFinite(ms) ? { ms } : {}),
    ...(words ? { words } : {}),
    ...(q.population ? { pop: q.population } : {}),
  };
  /* The trial clock starts at the FIRST answer, not when the page was
     opened. Each answer keeps its own local day so a trial that crosses
     midnight is credited to the days it was actually taken. */
  const first = guest.log.length === 0;
  return {
    guest: { ...guest, ...(first ? { startedAt: Date.now(), day: today ?? guest.day } : {}), lastAt: Date.now(), day: first ? (today ?? guest.day) : (guest.day ?? today), log: [...guest.log, entry], xp: guest.xp + res.xp, run, bestRun: Math.max(guest.bestRun, run) },
    res: { ...res, run },
    accepted: true,
  };
}

function guestStreak(guest) {
  const days = [...new Set((guest?.log ?? []).map((row) => row?.day).filter((day) => typeof day === "string"))].sort();
  let count = 0;
  let prev = null;
  for (const day of days) {
    if (!prev) { count = 1; prev = day; continue; }
    const [y, m, d] = prev.split("-").map(Number);
    const next = new Date(y, (m || 1) - 1, d || 1);
    next.setDate(next.getDate() + 1);
    const expected = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
    count = day === expected ? count + 1 : 1;
    prev = day;
  }
  return count;
}

export function guestSummary(guest) {
  const n = guest?.log?.length ?? 0;
  const ok = (guest?.log ?? []).filter((l) => l.correct).length;
  return { n, ok, acc: n ? Math.round((ok / n) * 100) : 0, xp: guest?.xp ?? 0, bestRun: guest?.bestRun ?? 0, streak: guestStreak(guest), cats: [...new Set((guest?.log ?? []).map((l) => l.cat))] };
}

/* Fold a guest's work into a migrated account blob. `s` is the output of
   migrateBlob. Returns the new blob and a summary (null when nothing was
   merged). Idempotent: a merged entry is never added twice. */
/* The trial only serves built-in questions, and it records that source
   on the row. A row that already names bank or case keeps that source.
   A missing source is builtin, because this log cannot contain anything else. */
export function guestImportIdentity(entry) {
  const source = entry?.source === "bank" || entry?.source === "case" ? entry.source : "builtin";
  const id = entry?.id;
  return stampedQuestion({ ...entry, id, source, key: entry?.key ?? canonicalKey(source, id) });
}

/* A stored trial row counts only when it is one of the built-in questions.
   Category, difficulty, and identity come from that question, not the row. */
function builtinTrialQuestion(entry, catalog) {
  if (!entry || entry.source === "bank" || entry.source === "case") return null;
  const found = (catalog ?? []).find((q) => q && String(q.id) === String(entry.id));
  if (!found || found.ai || found.exam_form != null || found.premium) return null;
  return {
    id: found.id,
    cat: found.cat,
    diff: found.diff ?? 1,
    correct: entry.correct,
    attempt: entry.attempt,
    ...(found.population ? { pop: found.population } : {}),
    ...(Number.isFinite(entry.ms) ? { ms: entry.ms } : {}),
    ...(Number.isFinite(Number(entry.at)) ? { at: Number(entry.at) } : {}),
    day: entry.day,
    source: "builtin",
    key: canonicalKey("builtin", found.id),
    stem: typeof found.stem === "string" ? found.stem : "",
  };
}

function trialEntries(s, guest, today, catalog) {
  const have = new Set();
  for (const row of s.log ?? []) if (row?.attempt != null) have.add(String(row.attempt));
  return guest.log
    .filter((l) => l && (typeof l.id === "number" || typeof l.id === "string") && typeof l.correct === "boolean")
    .slice(0, GUEST_LIMIT)
    .map((l, index) => builtinTrialQuestion({
      ...l,
      attempt: l.attempt != null ? String(l.attempt) : `${guest.startedAt}:${index}`,
      day: typeof l.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(l.day) ? l.day : (guest.day ?? today),
    }, catalog))
    .filter((l) => l && !have.has(String(l.attempt)));
}

export function accountHasAnswers(log) {
  return (log ?? []).some((row) => row && typeof row.correct === "boolean");
}

/* A brand-new account has nothing to merge with, so the trial is scored
   by the live answer function, in the order it was taken. An account that
   already has answer history is left untouched: no XP, no reviews, no markers. */
export function mergeGuestIntoBlob(s, guest, { today, now = Date.now(), calibration = {}, catalog = [] } = {}) {
  if (!guestFresh(guest, now)) return { blob: s, summary: null };
  if (accountHasAnswers(s.log)) return { blob: s, summary: null };
  const entries = trialEntries(s, guest, today, catalog);
  if (!entries.length) return { blob: s, summary: null };
  return importTrialLive(s, entries, { today, calibration });
}

function importTrialLive(s, entries, { today, calibration }) {
  let state = {
    log: s.log ?? [], xp: s.xp ?? 0, ability: s.ability, streak: s.streak, rewards: s.rewards,
    daily: s.daily, missSchedule: s.missSchedule, run: s.run ?? 0, bestRun: s.bestRun ?? 0,
  };
  const beforeDay = s.streak?.lastDay ?? null;
  let xpGain = 0;
  let accepted = 0;
  let correct = 0;
  for (const e of entries) {
    const stem = e.stem || (e.words ? Array.from({ length: e.words }, () => "w").join(" ") : "");
    const words = stem.trim() ? stem.trim().split(/\s+/).filter(Boolean).length : e.words;
    const applied = applyAnswer(state, {
      q: { id: e.id, key: e.key, source: e.source, cat: e.cat, diff: e.diff, stem, population: e.pop },
      correct: e.correct,
      ms: Number.isFinite(e.ms) ? e.ms : Infinity,
      today: e.day ?? today,
      attempt: e.attempt,
      at: e.at,
      words: Number.isFinite(words) ? words : undefined,
      calibration,
    });
    if (applied.duplicate) continue;
    xpGain += applied.result?.xp ?? 0;
    accepted += 1;
    if (e.correct) correct += 1;
    state = applied.state;
  }
  if (!accepted) return { blob: s, summary: null };
  return {
    blob: { ...s, log: state.log, xp: state.xp, bestRun: state.bestRun, ability: state.ability, streak: state.streak, rewards: state.rewards, daily: state.daily, missSchedule: state.missSchedule, run: state.run },
    summary: { answers: accepted, correct, xp: xpGain, streak: state.streak?.count ?? 0, streakStarted: state.streak?.lastDay !== beforeDay, recorded: true },
  };
}
