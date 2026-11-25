/* Reward effects respect the student: reduced motion (OS or in-app),
   sound off by default, haptics only where supported and allowed. */
import { describe, it, expect, vi } from "vitest";
import { motionAllowed, hapticsAllowed, buzz, playCue, soundAllowed, DEFAULT_PREFS } from "../src/effects.js";

const win = (reduce) => ({ matchMedia: (q) => ({ matches: reduce && /reduce/.test(q) }) });

describe("motion", () => {
  it("is on by default and off when the OS asks for reduced motion", () => {
    expect(motionAllowed(DEFAULT_PREFS, win(false))).toBe(true);
    expect(motionAllowed(DEFAULT_PREFS, win(true))).toBe(false);
  });
  it("is off when the in-app Reduce effects setting is on", () => {
    expect(motionAllowed({ ...DEFAULT_PREFS, reduceFx: true }, win(false))).toBe(false);
  });
});

describe("sound", () => {
  it("is off by default and never plays then", () => {
    expect(soundAllowed(DEFAULT_PREFS)).toBe(false);
    const AudioContext = vi.fn();
    expect(playCue("correct", DEFAULT_PREFS, { AudioContext })).toBe(false);
    expect(AudioContext).not.toHaveBeenCalled();
  });
  it("plays a short synthesized tone when switched on", () => {
    const osc = { type: "", frequency: { value: 0 }, connect: vi.fn(() => ({ connect: vi.fn() })), start: vi.fn(), stop: vi.fn() };
    const gain = { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() };
    function AudioContext() { this.currentTime = 0; this.state = "running"; this.destination = {}; this.createOscillator = () => ({ ...osc }); this.createGain = () => gain; }
    expect(playCue("correct", { ...DEFAULT_PREFS, sound: true }, { AudioContext })).toBe(true);
  });
});

describe("haptics", () => {
  it("vibrates only when supported, enabled, and effects are not reduced", () => {
    const nav = { vibrate: vi.fn(() => true) };
    expect(buzz("correct", DEFAULT_PREFS, nav)).toBe(true);
    expect(nav.vibrate).toHaveBeenCalledWith(12);
    expect(buzz("correct", { ...DEFAULT_PREFS, reduceFx: true }, nav)).toBe(false);
    expect(buzz("correct", { ...DEFAULT_PREFS, haptics: false }, nav)).toBe(false);
    expect(hapticsAllowed(DEFAULT_PREFS, {})).toBe(false);
    expect(nav.vibrate).toHaveBeenCalledTimes(1);
  });
});
