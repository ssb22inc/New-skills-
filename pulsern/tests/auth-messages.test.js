/* What a student is told when auth goes sideways.
   ------------------------------------------------------------------
   These strings are the last thing a prospect reads before deciding whether
   to keep going. One of them — a throttle rendered in red after a SUCCESSFUL
   signup — already cost a live prospect mid-purchase. So the invariants are
   tested, not just the wording. */
import { describe, it, expect } from "vitest";
import { explainAuthError } from "../src/auth-messages.js";

const THROTTLE = "For security purposes, you can only request this after 48 seconds.";

describe("auth messages", () => {
  it("treats the post-signup throttle as good news, not an error", () => {
    // The exact message a real prospect saw in red on 2026-09-29.
    const m = explainAuthError(THROTTLE, "signup");
    expect(m.tone).toBe("notice");
    expect(m.text).toMatch(/account is set up/i);
    expect(m.text).toMatch(/48 seconds/);
    // It must not read as a refusal.
    expect(m.text).not.toMatch(/security purposes|cannot|denied|failed/i);
  });

  it("does not claim an account was created when signing in", () => {
    const m = explainAuthError(THROTTLE, "signin");
    expect(m.tone).toBe("notice");
    expect(m.text).not.toMatch(/account is set up/i);
  });

  it("sends an existing account to sign in rather than reporting a failure", () => {
    const m = explainAuthError("User already registered", "signup");
    expect(m.tone).toBe("notice");
    expect(m.linkHint).toBe(true);
  });

  it("routes an unconfirmed account straight to the link that bypasses it", () => {
    const m = explainAuthError("Email not confirmed", "signin");
    expect(m.tone).toBe("notice");
    expect(m.text).toMatch(/sign-in link/i);
    expect(m.linkHint).toBe(true);
  });

  it("offers the passwordless route when a password is wrong", () => {
    const m = explainAuthError("Invalid login credentials", "signin");
    expect(m.tone).toBe("error"); // this one the student really must fix
    expect(m.text).toMatch(/sign-in link/i);
  });

  it("never leaves a student without a next step", () => {
    const cases = [
      THROTTLE, "User already registered", "Email not confirmed",
      "Invalid login credentials", "Password should be at least 6 characters",
      "Unable to validate email address: invalid format",
      "Request rate limit reached", "some unmapped backend failure", "",
    ];
    for (const raw of cases) {
      for (const mode of ["signin", "signup"]) {
        const m = explainAuthError(raw, mode);
        expect(m.text.length).toBeGreaterThan(0);
        // Either it tells them what to do, or it points at the link button.
        const actionable = /try again|sign in|check your inbox|wait|pick a password|check it|link/i.test(m.text);
        expect(actionable || m.linkHint).toBe(true);
      }
    }
  });

  it("only spends red on things the student can actually fix", () => {
    // Anything meaning "this already worked" must never be an error.
    for (const raw of [THROTTLE, "User already registered", "Email not confirmed", "Request rate limit reached"]) {
      expect(explainAuthError(raw, "signup").tone).toBe("notice");
    }
  });

  it("survives whatever the backend hands it", () => {
    for (const junk of [null, undefined, 42, {}, []]) {
      expect(() => explainAuthError(junk, "signin")).not.toThrow();
      expect(explainAuthError(junk, "signin").text.length).toBeGreaterThan(0);
    }
  });

  it("keeps the wait time the server gave, in the server's own units", () => {
    expect(explainAuthError("you can only request this after 1 second", "signin").text).toMatch(/1 second\b/);
    expect(explainAuthError("you can only request this after 2 minutes", "signin").text).toMatch(/2 minutes\b/);
  });
});
