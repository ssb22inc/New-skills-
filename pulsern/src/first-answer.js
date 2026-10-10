/* First-answer activation. Pure decisions so the free-pass path can be
   tested without rendering the app.
   A brand-new account is granted pass1 automatically, but nothing used to
   require a practice answer before that 7-day window closed. After expiry the
   paywall hides study, so the miss is permanent. These helpers keep the
   first session on one question and keep the tour off the paywall. */

export function isStudyLocked({ isOwner = false, ent = null } = {}) {
  return !isOwner && !!ent && (ent.status === "expired" || ent.status === "none");
}

/* Wait until entitlement is known. Opening earlier is what put the tour on
   top of "Your access has ended" while Start was already gone. */
export function shouldAutoOpenTour({ loaded = false, tourSeen = false, ent = null, locked = false } = {}) {
  if (!loaded || tourSeen || !ent || locked) return false;
  return true;
}

/* Active free pass, zero answers, study actually reachable. Paid, owner,
   offline, and expired sessions are not forced — offline is also how the
   product-screenshot harness renders Today. */
export function needsFirstAnswer({ locked = false, ent = null, logLength = 0, isOwner = false } = {}) {
  if (isOwner || locked || !ent) return false;
  if (ent.status !== "trial") return false;
  return logLength < 1;
}

/* Skip matches the primary button only while that forced question is still
   owed. Otherwise Skip closes the tour onto Today (not the paywall — the
   tour is not shown when the paywall is up). */
export function tourSkipStartsQuestion(activating) {
  return !!activating;
}

export function showProfilePrompt({ logLength = 0, hasProfile = false, dismissed = false, profileLoading = false } = {}) {
  if (profileLoading || hasProfile || dismissed) return false;
  return logLength >= 1;
}

export function trialTimeLeftLabel(expiresAt, now = Date.now()) {
  if (!expiresAt) return "full study access";
  const ms = new Date(expiresAt).getTime() - now;
  if (!Number.isFinite(ms)) return "full study access";
  if (ms <= 0) return "ending now";
  const hour = 60 * 60 * 1000;
  if (ms < hour) return "less than 1 hour left";
  if (ms >= 48 * hour) {
    const days = Math.round(ms / (24 * hour));
    return days === 1 ? "1 day left" : `${days} days left`;
  }
  const hours = Math.ceil(ms / hour);
  if (hours <= 1) return "1 hour left";
  return `${hours} hours left`;
}

export function trialBannerMessage({ expiresAt = null, answered = false, now = Date.now() } = {}) {
  const left = trialTimeLeftLabel(expiresAt, now);
  const nudge = answered ? "" : " Answer at least one question before it ends.";
  return `${left}.${nudge}`;
}
