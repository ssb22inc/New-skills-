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
import { answerXp, answerCountsForRun, emptyRewards } from "./rewards.js";
import { applyAnswer, stampedQuestion } from "./answer-apply.js";
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

function mergeLogs(serverLog, localLog) {
  const used = new Set();
  const out = [];
  for (const row of serverLog ?? []) {
    if (!row) continue;
    let match = -1;
    if (row.attempt != null && row.attempt !== "") {
      match = (localLog ?? []).findIndex((item, index) => !used.has(index) && item?.attempt === row.attempt);
    } else {
      match = (localLog ?? []).findIndex((item, index) => !used.has(index) && sameLegacyOccurrence(row, item));
    }
    if (match >= 0) {
      used.add(match);
      out.push(localLog[match]);
    } else out.push(row);
  }
  (localLog ?? []).forEach((row, index) => {
    if (row && !used.has(index)) out.push(row);
  });
  return out;
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

function replayUnseen(base, rows) {
  const seen = new Set((base.log ?? []).map((row) => row?.attempt).filter((id) => id != null && id !== ""));
  let state = {
    log: Array.isArray(base.log) ? [...base.log] : [],
    xp: Number(base.xp) || 0,
    ability: base.ability ?? {},
    streak: base.streak,
    rewards: base.rewards ?? emptyRewards(),
    daily: base.daily,
    missSchedule: { ...(base.missSchedule ?? {}) },
    run: base.run ?? 0,
    bestRun: base.bestRun ?? 0,
  };
  for (const row of rows ?? []) {
    if (!row?.attempt || seen.has(row.attempt)) continue;
    seen.add(row.attempt);
    const words = Number(row.words);
    const stem = Number.isFinite(words) && words > 0 ? Array.from({ length: words }, () => "w").join(" ") : (row.stem || "");
    const rating = Number(row.rating);
    const applied = applyAnswer(state, {
      q: { id: row.id, key: row.key, source: row.source, cat: row.cat, diff: row.diff, stem, population: row.pop },
      correct: !!row.correct,
      ms: Number.isFinite(row.ms) ? row.ms : Infinity,
      today: row.day,
      attempt: row.attempt,
      words: Number.isFinite(words) ? words : undefined,
      rating: Number.isFinite(rating) ? rating : undefined,
      calibration: Number.isFinite(rating) ? { [row.id]: { rating } } : {},
      schedule: row.schedule !== false,
    });
    if (!applied.duplicate) state = applied.state;
  }
  return state;
}

/* Rows already stored stay rows. A legacy identity correction updates the
   matching row. New live attempts are scored once from the shared baseline,
   so a lost acknowledgement cannot add their XP a second time. */
export function reconcileProgress(serverBlob, localBlob, baselineBlob = null) {
  const server = serverBlob && typeof serverBlob === "object" && !Array.isArray(serverBlob) ? serverBlob : {};
  const local = localBlob && typeof localBlob === "object" && !Array.isArray(localBlob) ? localBlob : {};
  const base = baselineBlob && typeof baselineBlob === "object" && !Array.isArray(baselineBlob) ? baselineBlob : server;
  const log = mergeLogs(server.log, local.log);
  const replayed = replayUnseen(base, log);
  const unseen = log.some((row) => row?.attempt && !(base.log ?? []).some((item) => item?.attempt === row.attempt));
  const merged = { ...local, log };
  const nextXp = unseen ? replayed.xp : Math.max(Number(server.xp) || 0, Number(local.xp) || 0);
  if (nextXp !== (Number(local.xp) || 0)) merged.xp = nextXp;
  if (unseen) {
    merged.ability = replayed.ability;
    merged.daily = replayed.daily;
    merged.rewards = replayed.rewards;
    merged.streak = replayed.streak;
  }
  if (base.bestRun != null || server.bestRun != null || local.bestRun != null || unseen) {
    const nextBest = Math.max(Number(base.bestRun) || 0, Number(server.bestRun) || 0, Number(local.bestRun) || 0, Number(replayed.bestRun) || 0);
    if (nextBest !== (Number(local.bestRun) || 0)) merged.bestRun = nextBest;
  }
  if (base.missSchedule || server.missSchedule || local.missSchedule) merged.missSchedule = mergeMap(base.missSchedule, server.missSchedule, unseen ? replayed.missSchedule : local.missSchedule);
  if (base.srsMap || server.srsMap || local.srsMap) merged.srsMap = mergeMap(base.srsMap, server.srsMap, local.srsMap);
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
    const applied = applyAnswer(state, {
      q: { id: e.id, key: e.key, source: e.source, cat: e.cat, diff: e.diff, stem, population: e.pop },
      correct: e.correct,
      ms: Number.isFinite(e.ms) ? e.ms : Infinity,
      today: e.day ?? today,
      attempt: e.attempt,
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
