/* Every user-initiated sign-out goes through here. Signing out also forgets
   any try-before-sign-up answers on this device, so the next person on a
   shared computer never inherits them (REVIEW-2 M2, REVIEW-3 N2). */
import { clearGuest } from "./guest.js";

export function signOutAndForgetTrial({ auth, storage }) {
  try { clearGuest(storage); } catch { /* storage blocked */ }
  return auth.signOut();
}
