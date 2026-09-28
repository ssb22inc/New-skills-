/* First-touch marketing attribution.
   ------------------------------------------------------------------
   Without this, a sale cannot be traced back to the ad that produced it, so
   every pound of ad spend gets judged against a total that mixes paid traffic
   with organic. That is the difference between "ads work" and "we cannot tell".

   FIRST TOUCH, NOT LAST. The tags are captured the first time someone lands,
   kept in localStorage, and written to the database once — at their first
   sign-in, which may be days later. A student who arrives from an ad, leaves,
   and comes back by typing the address would otherwise be recorded as organic,
   crediting the channel that did no work and starving the one that did.

   The capture runs on the marketing site and the app both, because either can
   be the page an ad points at. It must never throw: a blocked localStorage in
   a private window is a reporting inconvenience, not a reason to fail to load
   the product. */

const KEY = "pulsern.attribution.first";
const FIELDS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

/* Ad platforms append their own click ids. Treating a bare gclid or fbclid as
   a source means a click still gets attributed when someone forgets the utm
   tags, which they will. */
const CLICK_IDS = { gclid: "google", fbclid: "facebook", ttclid: "tiktok", msclkid: "bing" };

const clip = (s, n = 200) => (typeof s === "string" ? s.slice(0, n) : null);

/* Reads the tags from a URL without deciding anything about storage, so it can
   be unit-tested without a browser. Returns null when there is nothing worth
   recording — an untagged organic visit should not overwrite a real first
   touch with empty values. */
export function readAttribution(href, referrer = "") {
  try {
    const url = new URL(href);
    const out = {};
    for (const f of FIELDS) {
      const v = url.searchParams.get(f);
      if (v) out[f] = clip(v);
    }
    if (!out.utm_source) {
      for (const [param, source] of Object.entries(CLICK_IDS)) {
        if (url.searchParams.get(param)) {
          out.utm_source = source;
          out.utm_medium = out.utm_medium ?? "cpc";
          break;
        }
      }
    }
    /* An external referrer is worth keeping even with no tags: it is how an
       untagged link from a nursing forum or a search result still shows up as
       something other than "direct". Same-origin referrers are navigation
       within our own site and say nothing about acquisition. */
    let ref = null;
    if (referrer) {
      try { if (new URL(referrer).host !== url.host) ref = clip(referrer); } catch { /* malformed */ }
    }
    if (!Object.keys(out).length && !ref) return null;
    return { ...out, referrer: ref, landing_path: clip(url.pathname, 300) };
  } catch {
    return null;
  }
}

/* Records the first touch if none is stored yet. Later visits never overwrite
   it — that is the whole point of first touch. */
export function captureAttribution(href = window.location.href, referrer = document.referrer) {
  try {
    if (localStorage.getItem(KEY)) return;
    const a = readAttribution(href, referrer);
    if (!a) return;
    localStorage.setItem(KEY, JSON.stringify({ ...a, first_seen_at: new Date().toISOString() }));
  } catch { /* private mode, storage disabled — reporting only */ }
}

export function storedAttribution() {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch { return null; }
}

/* Writes the stored first touch to the user's row, once. The primary key makes
   a second write a no-op, so this is safe to call on every sign-in and does not
   need to track whether it has already run. A duplicate is the expected case
   for a returning student and is not an error worth surfacing. */
export async function flushAttribution(supabase, userId) {
  const a = storedAttribution();
  if (!a || !userId) return;
  try {
    const { error } = await supabase.from("user_attribution").insert({
      user_id: userId,
      utm_source: a.utm_source ?? null,
      utm_medium: a.utm_medium ?? null,
      utm_campaign: a.utm_campaign ?? null,
      utm_content: a.utm_content ?? null,
      utm_term: a.utm_term ?? null,
      referrer: a.referrer ?? null,
      landing_path: a.landing_path ?? null,
      first_seen_at: a.first_seen_at ?? new Date().toISOString(),
    });
    if (error && !/duplicate|unique|23505/i.test(error.message)) {
      console.warn("attribution not recorded:", error.message);
    }
  } catch (e) {
    console.warn("attribution not recorded:", e?.message ?? e);
  }
}
