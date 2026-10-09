/* Who may say a paid check happened — and how anyone can check that.
   ------------------------------------------------------------------
   Diagram-review verdicts, pairing decisions, the published pairing map
   and narration clip records all live in the branch, so a branch could
   write any of them by hand: every field in them is public or computable
   (Astra, PR #134 review, rounds 25–26). Each is therefore signed by the
   paid job that produced it, with an Ed25519 private key that exists only
   in the protected `pulsern-paid` environment. Anyone — the paid jobs
   when reusing a record, and CI before a merge — checks the signature
   with the matching PUBLIC key, which is a repository variable: a branch
   can change neither.

   Keys are PEM text (a literal "\n" is accepted for a newline, so a key
   pasted on one line still works):
     PULSERN_ATTEST_PRIVATE_KEY  secret, pulsern-paid environment only
     PULSERN_ATTEST_PUBLIC_KEY   repository variable, read by CI and the
                                 paid jobs */
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

export const PRIVATE_ENV = "PULSERN_ATTEST_PRIVATE_KEY";
export const PUBLIC_ENV = "PULSERN_ATTEST_PUBLIC_KEY";
const pem = (s) => String(s).replace(/\\n/g, "\n").trim() + "\n";
/* What is signed: a fixed label, the kind of record, then its fields in a
   fixed order — so a signature on one kind of record, or for one diagram
   or question, can never be replayed as another. */
const message = (kind, fields) => Buffer.from(JSON.stringify(["pulsern-attest-v1", kind, ...fields]));
const SIG = /^[A-Za-z0-9+/]{86}==$/;

function publicKeyFrom(env) {
  const raw = env[PUBLIC_ENV];
  if (!raw) throw new Error(`${PUBLIC_ENV} is not set — signed records cannot be checked without it (HUMAN_TASKS H20)`);
  let key;
  try { key = createPublicKey(pem(raw)); } catch (e) { throw new Error(`${PUBLIC_ENV} is not a readable public key (${e.message})`); }
  if (key.asymmetricKeyType !== "ed25519") throw new Error(`${PUBLIC_ENV} must be an Ed25519 key, not ${key.asymmetricKeyType}`);
  return key;
}

/* Checks signatures. Needs only the public key. */
export function verifierFrom(env = process.env) {
  const key = publicKeyFrom(env);
  return {
    verify(kind, fields, sig) {
      if (typeof sig !== "string" || !SIG.test(sig)) return false;
      try { return verify(null, message(kind, fields), key, Buffer.from(sig, "base64")); } catch { return false; }
    },
  };
}

/* Signs and checks. Refuses a private key that does not belong to the
   pinned public key, so nothing is signed that CI would then reject. */
export function signerFrom(env = process.env) {
  const raw = env[PRIVATE_ENV];
  if (!raw) throw new Error(`${PRIVATE_ENV} is not set — results cannot be signed without it (HUMAN_TASKS H20)`);
  let key;
  try { key = createPrivateKey(pem(raw)); } catch (e) { throw new Error(`${PRIVATE_ENV} is not a readable private key (${e.message})`); }
  if (key.asymmetricKeyType !== "ed25519") throw new Error(`${PRIVATE_ENV} must be an Ed25519 key, not ${key.asymmetricKeyType}`);
  const pinned = publicKeyFrom(env).export({ type: "spki", format: "der" });
  if (!createPublicKey(key).export({ type: "spki", format: "der" }).equals(pinned)) throw new Error(`${PRIVATE_ENV} does not match ${PUBLIC_ENV}`);
  const { verify: check } = verifierFrom(env);
  return {
    sign: (kind, fields) => sign(null, message(kind, fields), key).toString("base64"),
    verify: check,
  };
}
