/* A throwaway Ed25519 key pair for tests: the env a paid job would have,
   its signer and verifier, and a second, unrelated signer for forgeries. */
import { generateKeyPairSync } from "node:crypto";
import { signerFrom, verifierFrom, PRIVATE_ENV, PUBLIC_ENV } from "../../ops/attest.mjs";

export function testKeys() {
  const pair = () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    return { [PRIVATE_ENV]: privateKey.export({ type: "pkcs8", format: "pem" }), [PUBLIC_ENV]: publicKey.export({ type: "spki", format: "pem" }) };
  };
  const env = pair(), otherEnv = pair();
  return { env, signer: signerFrom(env), verifier: verifierFrom(env), other: signerFrom(otherEnv) };
}
