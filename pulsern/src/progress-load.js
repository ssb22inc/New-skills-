/* Loading a student's saved progress, and deciding what happens to a
   try-before-sign-up trial on this device. Plain code, unit tested.

   Data-safety rules:
     - A saved row the app cannot open (null, not an object, bad JSON, or a
       migration that throws) is NOT a connection problem and NOT a new
       account. It is kept untouched on the server (the student can download
       a copy), and the app runs without saving until it can be read.
     - A failed read is NOT a new account. The app shows a retry, and
       autosave and the trial merge stay blocked until a read succeeds, so
       defaults can never be written over a real progress row.
     - Trial answers fold in automatically only for a brand-new account
       created after the trial started (no saved progress yet). Any other
       account is asked first, and nothing merges unless the student says so. */
import { guestFresh } from "./guest.js";
import { applyAnswer } from "./answer-apply.js";

/* A session lookup that errors, or returns no user, is not "no saved row".
   Only a confirmed signed-in user with an empty SELECT is a new account. */
export function sessionReadDecision(result) {
  if (!result || typeof result !== "object" || result.error) return "auth-error";
  const session = result.data?.session ?? result.session ?? null;
  if (!session?.user?.id) return "signed-out";
  return "read";
}

/* getRaw resolves to the saved JSON string, or null when the account has
   no saved row yet, and throws on any read error. */
export async function readProgress(getRaw) {
  try {
    const raw = await getRaw();
    return raw == null ? { status: "new", raw: null } : { status: "ok", raw };
  } catch (error) {
    return { status: "error", raw: null, error };
  }
}

/* "new" (no row), "ok" (blob), or "corrupt" (a row the app cannot open). */
export function parseProgress(raw, migrate) {
  if (raw == null) return { status: "new", blob: null };
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return { status: "corrupt", reason: "unreadable" }; }
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) return { status: "corrupt", reason: parsed == null ? "empty" : "wrong-shape" };
  try {
    const blob = migrate(parsed);
    if (!blob || typeof blob !== "object") return { status: "corrupt", reason: "wrong-shape" };
    return { status: "ok", blob };
  } catch {
    return { status: "corrupt", reason: "migrate-failed" };
  }
}

/* Earlier builds of this branch copied an unreadable row to localStorage.
   That copy held study history on a possibly shared device and was never
   cleared (REVIEW-4 R4-2). It is no longer written: the server row stays
   untouched and "Download a copy" uses the in-memory copy. Any old copy is
   removed on load and on sign-out. */
export const LEGACY_PROGRESS_BACKUP_KEY = "pulsern-progress-backup-v1";
/* Answers that could not be written before sign-out. Only those answers
   are stored, under a hash of the account, and only until they expire.
   The next sign-in replays them onto whatever the server has now. */
export const PENDING_PROGRESS_KEY = "pulsern-pending-progress-v1";
export const PENDING_PROGRESS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function accountTag(userId) {
  const bytes = new TextEncoder().encode(String(userId ?? ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function pendingProgressKey(tag) {
  return tag ? `${PENDING_PROGRESS_KEY}:${tag}` : PENDING_PROGRESS_KEY;
}

/* An answer already in the confirmed log is not unsaved. Attempts match
   first. A row that gained a key during classification still matches the
   copy that was saved without one. */
export function unsavedAnswers(confirmed, current) {
  const pool = [...(confirmed ?? [])];
  const extra = [];
  for (const row of current ?? []) {
    if (!row || typeof row.correct !== "boolean") continue;
    const i = pool.findIndex((kept) => sameSavedAnswer(kept, row));
    if (i >= 0) pool.splice(i, 1);
    else extra.push(pendingAnswer(row));
  }
  return extra;
}

function sameSavedAnswer(a, b) {
  if (a?.attempt != null && b?.attempt != null) return String(a.attempt) === String(b.attempt);
  if (a?.key && b?.key && a.key !== b.key) return false;
  return String(a?.id) === String(b?.id) && !!a.correct === !!b.correct && (a?.day ?? null) === (b?.day ?? null);
}

function pendingAnswer(row) {
  return {
    id: row.id,
    ...(row.key ? { key: row.key } : {}),
    ...(row.source ? { source: row.source } : {}),
    ...(row.cat ? { cat: row.cat } : {}),
    ...(row.diff != null ? { diff: row.diff } : {}),
    correct: !!row.correct,
    ...(row.attempt != null ? { attempt: String(row.attempt) } : {}),
    ...(row.day ? { day: row.day } : {}),
    ...(Number.isFinite(row.ms) ? { ms: row.ms } : {}),
    ...(Number.isFinite(row.words) ? { words: row.words } : {}),
    ...(Number.isFinite(row.rating) ? { rating: row.rating } : {}),
    ...(row.schedule === false ? { schedule: false } : {}),
    ...(row.pop ? { pop: row.pop } : {}),
  };
}

/* Replay only the unsaved answers onto the current server blob. An
   attempt the server already has is left as it is, so a save that
   landed after the timeout does not get scored twice. */
export function applyUnsavedAnswers(blob, answers, { today, calibration = {} } = {}) {
  let state = blob ?? {};
  for (const row of answers ?? []) {
    const stem = Number.isFinite(row.words) && row.words > 0 ? Array.from({ length: row.words }, () => "w").join(" ") : "";
    const ownCalibration = Number.isFinite(row.rating) ? { [row.id]: { rating: row.rating } } : {};
    const applied = applyAnswer(state, {
      q: { id: row.id, key: row.key, source: row.source, cat: row.cat, diff: row.diff, stem, population: row.pop },
      correct: !!row.correct,
      ms: Number.isFinite(row.ms) ? row.ms : Infinity,
      today: row.day ?? today,
      attempt: row.attempt,
      schedule: row.schedule !== false,
      words: row.words,
      rating: row.rating,
      calibration: { ...calibration, ...ownCalibration },
    });
    if (!applied.duplicate) state = applied.state;
  }
  return state;
}

export async function stashPendingProgress(storage, { userId, answers, now = Date.now() } = {}) {
  const rows = unsavedAnswers([], answers ?? []);
  if (!rows.length || !userId) return false;
  const tag = await accountTag(userId);
  try {
    storage.setItem(pendingProgressKey(tag), JSON.stringify({
      v: 2, accountTag: tag, expiresAt: now + PENDING_PROGRESS_TTL_MS, answers: rows,
    }));
    return true;
  } catch { return false; }
}

export async function readPendingProgress(storage, userId, now = Date.now()) {
  if (!userId) return null;
  const tag = await accountTag(userId);
  const key = pendingProgressKey(tag);
  try {
    const parsed = JSON.parse(storage?.getItem(key) ?? "null");
    if (!parsed || parsed.v !== 2 || parsed.accountTag !== tag || !Array.isArray(parsed.answers)) return null;
    if (!Number.isFinite(parsed.expiresAt) || parsed.expiresAt <= now) {
      storage.removeItem(key);
      return null;
    }
    return parsed;
  } catch { return null; }
}

export async function clearPendingProgress(storage, userId) {
  if (!userId) return;
  try { storage?.removeItem(pendingProgressKey(await accountTag(userId))); } catch { /* storage blocked */ }
}

/* The previous recovery key held the whole account blob and named the
   account in the key. Drop that copy when this account signs in or out. */
/* Drop journals whose week is up, whoever is using the device. A
   journal is only read for its own account, so this is what actually
   removes an abandoned one. */
export function sweepExpiredPending(storage, now = Date.now()) {
  if (!storage || typeof storage.length !== "number" || typeof storage.key !== "function") return;
  const keys = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (typeof key === "string" && key.startsWith(PENDING_PROGRESS_KEY)) keys.push(key);
  }
  for (const key of keys) {
    try {
      const parsed = JSON.parse(storage.getItem(key) ?? "null");
      if (!parsed || parsed.v !== 2 || !Number.isFinite(parsed.expiresAt) || parsed.expiresAt <= now) storage.removeItem(key);
    } catch { storage.removeItem(key); }
  }
}

export function clearPlainPending(storage, userId) {
  try {
    storage?.removeItem(PENDING_PROGRESS_KEY);
    if (userId) storage?.removeItem(`${PENDING_PROGRESS_KEY}:${userId}`);
  } catch { /* storage blocked */ }
}

export function clearLegacyProgressBackup(storage) {
  try { storage.removeItem(LEGACY_PROGRESS_BACKUP_KEY); } catch { /* storage blocked */ }
}

/* Slack for clock skew between this device and the auth server. */
export const NEW_ACCOUNT_SKEW_MS = 5 * 60 * 1000;

/* "none" | "expired" | "merge" | "ask" */
export function guestHandoff({ guest, accountCreatedAt = null, hasSavedProgress = false, now = Date.now() }) {
  if (!guest || !Array.isArray(guest.log) || guest.log.length === 0) return "none";
  if (!guestFresh(guest, now)) return "expired";
  const created = accountCreatedAt ? Date.parse(accountCreatedAt) : NaN;
  const startedAt = Number(guest.startedAt);
  const brandNew = !hasSavedProgress && Number.isFinite(created) && Number.isFinite(startedAt)
    && created >= startedAt - NEW_ACCOUNT_SKEW_MS;
  return brandNew ? "merge" : "ask";
}
