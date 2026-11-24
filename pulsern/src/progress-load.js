/* Loading a student's saved progress, and deciding what happens to a
   try-before-sign-up trial on this device. Plain code, unit tested.

   Data-safety rules:
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
