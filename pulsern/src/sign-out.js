/* Every user-initiated sign-out goes through here. Signing out also forgets
   any try-before-sign-up answers on this device, so the next person on a
   shared computer never inherits them (REVIEW-2 M2, REVIEW-3 N2). */
import { clearGuest, releaseHeldGuest } from "./guest.js";
import { clearLegacyProgressBackup } from "./progress-load.js";

export function signOutAndForgetTrial({ auth, storage, holdStorage }) {
  try { clearGuest(storage); releaseHeldGuest(storage, holdStorage); } catch { /* storage blocked */ }
  clearLegacyProgressBackup(storage);
  return auth.signOut();
}
