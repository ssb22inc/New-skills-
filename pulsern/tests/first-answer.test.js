import { describe, expect, it } from "vitest";
import {
  isStudyLocked,
  needsFirstAnswer,
  shouldAutoOpenTour,
  showProfilePrompt,
  tourSkipStartsQuestion,
  trialBannerMessage,
} from "../src/first-answer.js";

const trial = { status: "trial", expiresAt: "2026-10-08T12:00:00.000Z" };
const NOW = Date.parse("2026-10-07T18:00:00.000Z");

describe("first-answer activation", () => {
  it("locks expired and never-entitled accounts, and leaves the owner unlocked", () => {
    expect(isStudyLocked({ ent: { status: "expired" } })).toBe(true);
    expect(isStudyLocked({ ent: { status: "none" } })).toBe(true);
    expect(isStudyLocked({ ent: trial })).toBe(false);
    expect(isStudyLocked({ ent: { status: "active" } })).toBe(false);
    expect(isStudyLocked({ ent: null })).toBe(false);
    expect(isStudyLocked({ isOwner: true, ent: { status: "expired" } })).toBe(false);
  });

  it("does not open the tour until access is known, and never over the paywall", () => {
    expect(shouldAutoOpenTour({ loaded: true, tourSeen: false, ent: null, locked: false })).toBe(false);
    expect(shouldAutoOpenTour({ loaded: true, tourSeen: false, ent: { status: "expired" }, locked: true })).toBe(false);
    expect(shouldAutoOpenTour({ loaded: true, tourSeen: false, ent: { status: "none" }, locked: true })).toBe(false);
    expect(shouldAutoOpenTour({ loaded: false, tourSeen: false, ent: trial, locked: false })).toBe(false);
    expect(shouldAutoOpenTour({ loaded: true, tourSeen: true, ent: trial, locked: false })).toBe(false);
    expect(shouldAutoOpenTour({ loaded: true, tourSeen: false, ent: trial, locked: false })).toBe(true);
  });

  it("forces one question only for an active free pass with no answers", () => {
    expect(needsFirstAnswer({ locked: false, ent: trial, logLength: 0, isOwner: false })).toBe(true);
    expect(needsFirstAnswer({ locked: false, ent: trial, logLength: 1, isOwner: false })).toBe(false);
    expect(needsFirstAnswer({ locked: true, ent: { status: "expired" }, logLength: 0 })).toBe(false);
    expect(needsFirstAnswer({ locked: false, ent: { status: "active" }, logLength: 0 })).toBe(false);
    expect(needsFirstAnswer({ locked: false, ent: { status: "offline" }, logLength: 0 })).toBe(false);
    expect(needsFirstAnswer({ locked: false, ent: null, logLength: 0 })).toBe(false);
    expect(needsFirstAnswer({ locked: false, ent: trial, logLength: 0, isOwner: true })).toBe(false);
  });

  it("sends tour Skip into the question while that first answer is still owed", () => {
    const activating = needsFirstAnswer({ locked: false, ent: trial, logLength: 0 });
    expect(tourSkipStartsQuestion(activating)).toBe(true);
    expect(tourSkipStartsQuestion(false)).toBe(false);
  });

  it("defers the profile prompt until after an answer, and honors dismiss", () => {
    expect(showProfilePrompt({ logLength: 0, hasProfile: false, dismissed: false })).toBe(false);
    expect(showProfilePrompt({ logLength: 1, hasProfile: false, dismissed: false })).toBe(true);
    expect(showProfilePrompt({ logLength: 4, hasProfile: false, dismissed: true })).toBe(false);
    expect(showProfilePrompt({ logLength: 4, hasProfile: true, dismissed: false })).toBe(false);
    expect(showProfilePrompt({ logLength: 4, hasProfile: false, dismissed: false, profileLoading: true })).toBe(false);
  });

  it("states hours left and tells an unanswered pass to commit one question", () => {
    const in18h = new Date(NOW + 18 * 60 * 60 * 1000).toISOString();
    const in20m = new Date(NOW + 20 * 60 * 1000).toISOString();
    expect(trialBannerMessage({ expiresAt: in18h, answered: false, now: NOW }))
      .toBe("18 hours left. Answer at least one question before it ends.");
    expect(trialBannerMessage({ expiresAt: in18h, answered: true, now: NOW })).toBe("18 hours left.");
    expect(trialBannerMessage({ expiresAt: in20m, answered: false, now: NOW }))
      .toBe("less than 1 hour left. Answer at least one question before it ends.");
    expect(trialBannerMessage({ expiresAt: null, answered: false, now: NOW }))
      .toBe("full study access. Answer at least one question before it ends.");
  });
});
