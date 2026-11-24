/* Reward effects: motion, sound, and haptics, all optional.
     - Motion follows the OS "reduce motion" setting AND the in-app
       "Reduce effects" switch. Either one turns every reward animation off.
     - Sound is OFF by default. When on, it is a short synthesized monitor
       tone (Web Audio), never a file, never a jingle.
     - Haptics use navigator.vibrate where the device supports it, and stay
       off whenever effects are reduced. */

export const DEFAULT_PREFS = { sound: false, haptics: true, reduceFx: false };

export function systemReducedMotion(win = typeof window !== "undefined" ? window : null) {
  try { return !!win?.matchMedia?.("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

export function motionAllowed(prefs = DEFAULT_PREFS, win) {
  return !prefs?.reduceFx && !systemReducedMotion(win);
}

export function hapticsAllowed(prefs = DEFAULT_PREFS, nav = typeof navigator !== "undefined" ? navigator : null) {
  return !!prefs?.haptics && !prefs?.reduceFx && typeof nav?.vibrate === "function";
}

const PATTERNS = { correct: 12, combo: [10, 40, 10], milestone: [14, 60, 14, 60, 24], recap: 18 };

export function buzz(kind, prefs, nav = typeof navigator !== "undefined" ? navigator : null) {
  if (!hapticsAllowed(prefs, nav)) return false;
  try { return nav.vibrate(PATTERNS[kind] ?? 10) !== false; } catch { return false; }
}

/* Tones: a soft two-beat "monitor" chirp for correct, a rising three-note
   chime for milestones. Quiet (peak gain 0.06) and short (< 0.5 s). */
const TONES = {
  correct: [[880, 0, 0.09], [1320, 0.11, 0.12]],
  combo: [[880, 0, 0.07], [1100, 0.09, 0.07], [1320, 0.18, 0.12]],
  milestone: [[660, 0, 0.12], [880, 0.14, 0.12], [1320, 0.28, 0.22]],
  recap: [[740, 0, 0.1], [988, 0.12, 0.16]],
};

let ctx = null;
export function soundAllowed(prefs = DEFAULT_PREFS) {
  return !!prefs?.sound;
}

export function playCue(kind, prefs, win = typeof window !== "undefined" ? window : null) {
  if (!soundAllowed(prefs)) return false;
  const AC = win?.AudioContext || win?.webkitAudioContext;
  if (!AC) return false;
  try {
    ctx = ctx ?? new AC();
    if (ctx.state === "suspended") ctx.resume?.();
    const t0 = ctx.currentTime + 0.01;
    for (const [freq, at, dur] of TONES[kind] ?? TONES.correct) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(0.06, t0 + at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + dur + 0.02);
    }
    return true;
  } catch { return false; }
}

/* One call for a reward beat: sound + haptic, each gated by its own pref. */
export function rewardBeat(kind, prefs) {
  return { sound: playCue(kind, prefs), haptic: buzz(kind, prefs) };
}
