/* Every user-initiated sign-out goes through here. Signing out also forgets
   any try-before-sign-up answers on this device, so the next person on a
   shared computer never inherits them (REVIEW-2 M2, REVIEW-3 N2). */
import { clearGuest, releaseHeldGuest, GUEST_KEY } from "./guest.js";
import { clearLegacyProgressBackup, sweepPendingProgress } from "./progress-load.js";

export function signOutAndForgetTrial({ auth, storage, holdStorage }) {
  try { clearGuest(storage); releaseHeldGuest(storage, holdStorage); } catch { /* storage blocked */ }
  clearLegacyProgressBackup(storage);
  sweepPendingProgress(storage);
  return auth.signOut();
}

/* Another tab's sign-out does not touch this tab's sessionStorage or the
   in-memory hold. The auth event and the localStorage change are the
   signals that do. Both forget the trial here, in this tab. */
export function forgetTrialOnRemoteSignOut(event, { storage, holdStorage } = {}) {
  if (event !== "SIGNED_OUT") return false;
  try { clearGuest(storage); releaseHeldGuest(storage, holdStorage); } catch { /* storage blocked */ }
  return true;
}

export function remoteSignOutStorageEvent(event) {
  if (!event || event.newValue != null) return false;
  if (event.key === GUEST_KEY) return true;
  return typeof event.key === "string" && event.key.endsWith("-auth-token");
}
