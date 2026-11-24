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
/* Progress that could not be written before sign-out. The next sign-in
   for the same account applies it and the autosave sends it up. */
export const PENDING_PROGRESS_KEY = "pulsern-pending-progress-v1";

export function pendingProgressKey(userId) {
  return userId ? `${PENDING_PROGRESS_KEY}:${userId}` : PENDING_PROGRESS_KEY;
}

/* `baseRaw` is the server row this snapshot was saved against. A later
   cloud row is left alone. The key is per account, so one person's save
   cannot delete another's recovery copy. */
export function stashPendingProgress(storage, { userId, payload, baseRaw = null }) {
  try {
    storage.setItem(pendingProgressKey(userId), JSON.stringify({ v: 1, userId: userId ?? null, payload, baseRaw }));
    return true;
  } catch { return false; }
}

export function readPendingProgress(storage, userId, serverRaw = null) {
  try {
    const parsed = JSON.parse(storage?.getItem(pendingProgressKey(userId)) ?? "null");
    if (!parsed || parsed.v !== 1 || typeof parsed.payload !== "string") return null;
    if ((parsed.userId ?? null) !== (userId ?? null)) return null;
    if ((parsed.baseRaw ?? null) !== (serverRaw ?? null)) return null;
    return parsed;
  } catch { return null; }
}

export function clearPendingProgress(storage, userId) {
  try { storage?.removeItem(pendingProgressKey(userId)); } catch { /* storage blocked */ }
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
