/* Loading a student's saved progress, and deciding what happens to a
   try-before-sign-up trial on this device. Plain code, unit tested.

   Data-safety rules:
     - A saved row the app cannot open (null, not an object, bad JSON, or a
       migration that throws) is NOT a connection problem and NOT a new
       account. It is kept untouched on the server, copied to this device as
       a backup, and the app runs without saving until it can be read.
     - A failed read is NOT a new account. The app shows a retry, and
       autosave and the trial merge stay blocked until a read succeeds, so
       defaults can never be written over a real progress row.
     - Trial answers fold in automatically only for a brand-new account
       created after the trial started (no saved progress yet). Any other
       account is asked first, and nothing merges unless the student says so. */
import { guestFresh } from "./guest.js";

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

/* Device backups of saved rows the app could not open (newest first, 3 kept). */
export const PROGRESS_BACKUP_KEY = "pulsern-progress-backup-v1";
export function backupUnreadableProgress(storage, { userId = null, raw, at = Date.now() }) {
  try {
    let list = [];
    try { list = JSON.parse(storage.getItem(PROGRESS_BACKUP_KEY) || "[]"); } catch { list = []; }
    if (!Array.isArray(list)) list = [];
    if (!list.some((b) => b && b.raw === raw && b.userId === userId)) list.unshift({ userId, at, raw });
    storage.setItem(PROGRESS_BACKUP_KEY, JSON.stringify(list.slice(0, 3)));
    return true;
  } catch {
    return false;
  }
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
