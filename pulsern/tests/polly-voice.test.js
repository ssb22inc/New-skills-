import { describe, it, expect } from "vitest";
import { TTS, MARIN_TTS, speechKey, pollyInput, readAloudLimits, POLLY_BILLED_MAX, DEFAULT_DAILY_USD, makeChecked, CALL } from "../api/_speak.js";
import { awsReady, createPolly } from "../ops/read-aloud-worker.mjs";

describe("Polly read-aloud", () => {
  it("uses Joanna neural mp3, and does not reuse a marin clip key", () => {
    expect(TTS).toMatchObject({ model: "polly-neural", voice: "Joanna", engine: "neural", format: "mp3", language: "en-US" });
    expect(speechKey("Give 5 mg.")).not.toBe(speechKey("Give 5 mg.", MARIN_TTS));
  });

  it("wraps normalised text in SSML with a sentence break, and stays inside Polly's limits", () => {
    const out = pollyInput("Give 5 mg. Then stop.");
    expect(out.textType).toBe("ssml");
    expect(out.text).toBe('<speak>Give 5 mg.<break time="300ms"/> Then stop.</speak>');
    expect(out.billed).toBe("Give 5 mg. Then stop.".length);
    expect(out.billed).toBeLessThanOrEqual(POLLY_BILLED_MAX);
    expect(pollyInput("A & B < C").text).toContain("A &amp; B &lt; C");
  });

  it("refuses a passage over Polly's billed character limit", () => {
    expect(pollyInput("a".repeat(POLLY_BILLED_MAX + 1))).toEqual({ error: "too long" });
  });

  it("caps a day by the dollar env, defaulting to $40", () => {
    expect(readAloudLimits({}).usd).toBe(DEFAULT_DAILY_USD);
    expect(readAloudLimits({}).chars).toBe(Math.floor((40 * 1_000_000) / 16));
    expect(readAloudLimits({ READ_ALOUD_DAILY_USD: "8" })).toMatchObject({ usd: 8, chars: 500_000 });
    expect(readAloudLimits({ READ_ALOUD_DAILY_USD: "nope" }).usd).toBe(40);
  });

  it("treats Polly throttling that arrives as HTTP 400 as a retry, not a bad passage", async () => {
    const err = new Error("Rate exceeded");
    err.name = "ThrottlingException";
    err.$metadata = { httpStatusCode: 400 };
    const r = await makeChecked({ text: "Give 5 mg.", polly: { send: async () => { throw err; } }, beforeTake: async () => "ok" });
    expect(r.errorKind).toBe("transient");
    expect(r.final).toBe(false);
  });

  it("does not let the SDK retry a synthesis on its own", async () => {
    const client = createPolly({ AWS_ACCESS_KEY_ID: "AKIA", AWS_SECRET_ACCESS_KEY: "secret", AWS_REGION: "us-east-1" });
    expect(await client.config.maxAttempts()).toBe(1);
  });

  it("treats a credential error that arrives as HTTP 400 as an account problem, not a bad passage", async () => {
    const err = new Error("The security token included in the request is invalid.");
    err.name = "UnrecognizedClientException";
    err.$metadata = { httpStatusCode: 400 };
    const r = await makeChecked({ text: "Give 5 mg.", polly: { send: async () => { throw err; } }, beforeTake: async () => "ok" });
    expect(r.errorKind).toBe("service");
    expect(r.final).toBe(false);
  });

  it("still records a passage Polly itself refuses", async () => {
    const err = new Error("invalid ssml");
    err.name = "InvalidSsmlException";
    err.$metadata = { httpStatusCode: 400 };
    const r = await makeChecked({ text: "Give 5 mg.", polly: { send: async () => { throw err; } }, beforeTake: async () => "ok" });
    expect(r.errorKind).toBe("permanent");
  });

  it("aborts a Polly request and a stalled audio stream at the passage deadline", async () => {
    const saved = { ...CALL };
    CALL.ms = 40;
    CALL.min = 1;
    try {
      let signal;
      const hung = makeChecked({
        text: "Give 5 mg.",
        polly: {
          send: (_cmd, opts) => {
            signal = opts.abortSignal;
            return Promise.resolve({ AudioStream: { transformToByteArray: () => new Promise(() => {}) } });
          },
        },
        beforeTake: async () => "ok",
      });
      const r = await hung;
      expect(signal?.aborted).toBe(true);
      expect(r).toMatchObject({ final: false, errorKind: "transient" });
    } finally { Object.assign(CALL, saved); }
  });

  it("treats missing AWS keys as not ready, without reading the secret values into the result", () => {
    expect(awsReady({})).toBe(false);
    expect(awsReady({ AWS_ACCESS_KEY_ID: "AKIA" })).toBe(false);
    expect(awsReady({ AWS_ACCESS_KEY_ID: "AKIA", AWS_SECRET_ACCESS_KEY: "secret" })).toBe(true);
  });
});
