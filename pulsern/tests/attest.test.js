/* Signed records (ops/attest.mjs): Astra, PR #134 review, rounds 25–26. */
import { describe, it, expect } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { signerFrom, verifierFrom, PRIVATE_ENV, PUBLIC_ENV } from "../ops/attest.mjs";
import { testKeys } from "./helpers/attest-keys.js";

describe("signing and checking records", () => {
  const k = testKeys();
  it("verifies its own signature, and only for the same kind and fields", () => {
    const sig = k.signer.sign("diagram-review", ["abg", "PASS"]);
    expect(k.verifier.verify("diagram-review", ["abg", "PASS"], sig)).toBe(true);
    expect(k.verifier.verify("diagram-review", ["abg", "FAIL"], sig)).toBe(false);
    expect(k.verifier.verify("pairing-decision", ["abg", "PASS"], sig), "a signature cannot be replayed as another kind").toBe(false);
    expect(k.verifier.verify("diagram-review", ["abg", "PASS"], k.other.sign("diagram-review", ["abg", "PASS"]))).toBe(false);
    for (const bad of [undefined, null, "", "0".repeat(64), "A".repeat(86) + "==", sig.slice(0, -4) + "AA=="]) expect(k.verifier.verify("diagram-review", ["abg", "PASS"], bad)).toBe(false);
  });
  it("accepts a key pasted on one line with \\n escapes", () => {
    const env = Object.fromEntries(Object.entries(k.env).map(([n, v]) => [n, v.replace(/\n/g, "\\n")]));
    expect(signerFrom(env).verify("x", [1], k.signer.sign("x", [1]))).toBe(true);
  });
  it("refuses missing, mismatched or non-Ed25519 keys", () => {
    expect(() => verifierFrom({})).toThrow(/PULSERN_ATTEST_PUBLIC_KEY is not set/);
    expect(() => signerFrom({ [PUBLIC_ENV]: k.env[PUBLIC_ENV] })).toThrow(/PULSERN_ATTEST_PRIVATE_KEY is not set/);
    const other = testKeys().env;
    expect(() => signerFrom({ [PRIVATE_ENV]: other[PRIVATE_ENV], [PUBLIC_ENV]: k.env[PUBLIC_ENV] })).toThrow(/does not match/);
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
    expect(() => verifierFrom({ [PUBLIC_ENV]: rsa.publicKey.export({ type: "spki", format: "pem" }) })).toThrow(/Ed25519/);
    expect(() => verifierFrom({ [PUBLIC_ENV]: "not a key" })).toThrow(/not a readable public key/);
  });
});
