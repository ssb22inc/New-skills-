/* A stand-in for the browser's speech engine, installed before the app's
   code loads (imported first by read-aloud-harness.jsx). It records every
   utterance (words, rate, voice) and the test ends each one by hand. With
   strict = true it behaves like Safari/iOS: speech is refused until the
   first utterance made during a user gesture. "?nospeech" leaves the page
   with no speech engine at all. */
export const env = { gesture: false, strict: false, refuse: false, unlocked: false, spoken: [], current: null, failNext: false };
export const VOICES = [
  { name: "Zarvox", lang: "en-US", default: false },
  { name: "Microsoft David - English (United States)", lang: "en-US", default: true },
  { name: "Google US English", lang: "en-US", default: false },
  { name: "Google français", lang: "fr-FR", default: false },
];

class FakeUtterance {
  constructor(text) { this.text = text; this.rate = 1; this.voice = null; this.lang = ""; }
}
const fake = {
  get speaking() { return !!env.current; },
  pending: false,
  getVoices: () => VOICES,
  addEventListener() {},
  speak(u) {
    const refuse = env.strict && (env.refuse || (!env.unlocked && !env.gesture));
    if (refuse) { setTimeout(() => u.onerror?.({ error: "not-allowed" }), 0); return; }
    env.unlocked = true;
    if (env.failNext) { env.failNext = false; setTimeout(() => u.onerror?.({ error: "synthesis-failed" }), 0); return; }
    env.current = u;
    env.spoken.push({ text: u.text, rate: u.rate, voice: u.voice?.name ?? null, lang: u.lang });
  },
  cancel() {
    const u = env.current;
    env.current = null;
    if (u) u.onerror?.({ error: "interrupted" });
  },
  /* The test: the current utterance has been spoken to the end. */
  finish() {
    const u = env.current;
    env.current = null;
    u?.onend?.({});
  },
};

if (new URLSearchParams(location.search).has("nospeech")) {
  Object.defineProperty(window, "speechSynthesis", { value: undefined, configurable: true });
} else {
  Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true });
  Object.defineProperty(window, "SpeechSynthesisUtterance", { value: FakeUtterance, configurable: true });
}
export const speech = fake;
