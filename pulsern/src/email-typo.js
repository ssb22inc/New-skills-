/* Email typo detection for the sign-in and sign-up fields.
   ------------------------------------------------------------------
   One real signup was lost to a single missing letter: someone typed
   dasheli@yaoo.com, never received a confirmation email, and signed up again
   days later with the correct address. Nothing in the product could have told
   them — the address is valid, it simply does not exist. At the scale PulseRN
   is at, that is one of fourteen signups, and it cost nothing to acquire.

   The check is deliberately narrow. It only fires on a domain that is ONE
   edit away from a provider that almost every candidate uses, so it cannot
   nag someone with a legitimate university or workplace address. It suggests
   and never corrects: a student whose domain genuinely is unusual must be
   able to ignore it and continue.

   Deliberately not a blocklist of "disposable" domains and not an API call.
   Both punish real people to catch a problem this does not have. */

/* The domains a nursing candidate in the US actually uses, by a wide margin.
   Adding more increases the chance of a false suggestion, so this list earns
   its entries rather than aiming for completeness. */
const COMMON_DOMAINS = [
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com",
  "aol.com", "comcast.net", "live.com", "msn.com", "me.com",
];

/* Levenshtein, bounded: we only care whether the distance is 1 or 2, so stop
   as soon as it cannot be. */
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1; // no future row can recover
    prev = cur;
  }
  return prev[b.length];
}

/* Returns a corrected address to suggest, or null when there is nothing
   confident to say. Never throws: a typo checker that breaks the sign-in form
   is far worse than one that misses a typo. */
export function suggestEmail(raw) {
  try {
    const value = String(raw ?? "").trim().toLowerCase();
    const at = value.lastIndexOf("@");
    if (at < 1 || at === value.length - 1) return null; // not a complete address yet
    const local = value.slice(0, at);
    const domain = value.slice(at + 1);
    if (!local || domain.includes(" ")) return null;
    if (COMMON_DOMAINS.includes(domain)) return null; // already right

    for (const candidate of COMMON_DOMAINS) {
      /* Distance 1 catches yaoo.com -> yahoo.com and gmial.com -> gmail.com.
         Distance 2 is allowed only on longer domains, where two edits are
         still overwhelmingly likely to be a slip rather than a different
         company; on a short domain two edits can change its meaning
         entirely, so the wrong suggestion becomes plausible. */
      const allowed = candidate.length >= 9 ? 2 : 1;
      if (editDistance(domain, candidate, allowed) <= allowed) {
        return `${local}@${candidate}`;
      }
    }
    return null;
  } catch {
    return null;
  }
}
