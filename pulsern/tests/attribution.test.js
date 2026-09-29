/* First-touch attribution.
   ------------------------------------------------------------------
   The first real purchase was attributed to "checkout.stripe.com", because
   returning from checkout sets document.referrer to Stripe. Our own payment
   redirect is not a traffic source, and the bug lands hardest exactly where it
   costs most: on users who CONVERT, since they are the ones who pass through a
   checkout. Left alone it would have credited Stripe for every sale an ad
   produced. */
import { describe, it, expect } from "vitest";
import { readAttribution } from "../src/attribution.js";

const SITE = "https://www.pulsern.app";

describe("first-touch attribution", () => {
  it("records utm tags from an ad link", () => {
    const a = readAttribution(`${SITE}/?utm_source=facebook&utm_medium=cpc&utm_campaign=nclex-jan`);
    expect(a.utm_source).toBe("facebook");
    expect(a.utm_medium).toBe("cpc");
    expect(a.utm_campaign).toBe("nclex-jan");
  });

  it("reads a bare click id when the utm tags were forgotten", () => {
    expect(readAttribution(`${SITE}/?gclid=abc123`).utm_source).toBe("google");
    expect(readAttribution(`${SITE}/?fbclid=xyz`).utm_source).toBe("facebook");
  });

  it("never treats our own checkout as a traffic source", () => {
    // The exact case that mis-attributed the first paying customer.
    expect(readAttribution(`${SITE}/app/`, "https://checkout.stripe.com/")).toBeNull();
    for (const own of [
      "https://checkout.stripe.com/c/pay/cs_live_abc",
      "https://xlfdywudgamrnzjwtrtd.supabase.co/auth/v1/callback",
      "https://accounts.google.com/o/oauth2/auth",
      "https://www.pulsern.app/pricing/",
      "https://pulsern-xyz.vercel.app/",
    ]) {
      expect(readAttribution(`${SITE}/app/`, own)).toBeNull();
    }
  });

  it("still keeps a genuine external referrer", () => {
    const a = readAttribution(`${SITE}/`, "https://allnurses.com/forum/thread");
    expect(a.referrer).toBe("https://allnurses.com/forum/thread");
  });

  it("keeps ad tags even when the visit arrives via our own checkout", () => {
    // Tags win over the referrer rule: the campaign is still the true origin.
    const a = readAttribution(`${SITE}/app/?utm_source=tiktok`, "https://checkout.stripe.com/");
    expect(a.utm_source).toBe("tiktok");
    expect(a.referrer).toBeNull();
  });

  it("returns nothing for an untagged direct visit, rather than empty values", () => {
    // An empty record must never overwrite a real first touch.
    expect(readAttribution(`${SITE}/`, "")).toBeNull();
    expect(readAttribution(`${SITE}/app/`, `${SITE}/pricing/`)).toBeNull();
  });

  it("never throws on malformed input", () => {
    for (const junk of ["", "not a url", null, undefined]) {
      expect(() => readAttribution(junk, "also not a url")).not.toThrow();
    }
  });
});
