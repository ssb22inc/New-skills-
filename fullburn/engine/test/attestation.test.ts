import { execFileSync } from "node:child_process";
import { createHash, createSign } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs module, typed loosely on purpose
import { attestationsFromApi, attestationsFromGhVerify, dssePae } from "../scripts/attestation.mjs";
// @ts-expect-error — plain .mjs module, typed loosely on purpose
import { REVIEW_SIGNER_WORKFLOW, checkAdversaryReport, checkReportProvenance } from "../scripts/gate-lib.mjs";

/** X5-02 (GPT-6 Astra, 2026-10-06): a PASS opens the adversary gate only if its
 * exact bytes carry an attestation signed by this repository's review
 * workflow. These drive the decision and both readers. */

const REPO = "o/r";
const SIGNER = `https://github.com/${REPO}/${REVIEW_SIGNER_WORKFLOW}@refs/heads/main`;
const DIGEST = createHash("sha256").update("the report bytes").digest("hex");

describe("report provenance decision (X5-02)", () => {
  const att = (over: Record<string, unknown> = {}) => ({ signatureVerified: true, signerUri: SIGNER, subjectDigests: [DIGEST], ...over });

  /** MUTATION: X5-02b, X5-02c. */
  it("accepts only a verified signature, from the review workflow, over these bytes", () => {
    expect(checkReportProvenance({ fileSha256: DIGEST, attestations: [att()], repo: REPO }).ok).toBe(true);
    expect(checkReportProvenance({ fileSha256: DIGEST, attestations: [att({ signatureVerified: false })], repo: REPO }).ok, "an unverified signature counted").toBe(false);
    expect(checkReportProvenance({ fileSha256: DIGEST, attestations: [att({ signerUri: `https://github.com/${REPO}/.github/workflows/other.yml@refs/heads/main` })], repo: REPO }).ok, "another workflow's signature counted").toBe(false);
    expect(checkReportProvenance({ fileSha256: DIGEST, attestations: [att({ signerUri: `https://github.com/evil/r/${REVIEW_SIGNER_WORKFLOW}@refs/heads/main` })], repo: REPO }).ok, "another repository's workflow counted").toBe(false);
    expect(checkReportProvenance({ fileSha256: DIGEST, attestations: [att({ subjectDigests: ["0".repeat(64)] })], repo: REPO }).ok, "an attestation of other bytes counted").toBe(false);
    expect(checkReportProvenance({ fileSha256: DIGEST, attestations: [], repo: REPO }).reason).toMatch(/no attestation/);
    expect(checkReportProvenance({ fileSha256: DIGEST, attestations: [att()], repo: "" }).ok, "no repository bound").toBe(false);
    expect(checkReportProvenance({ fileSha256: "nope", attestations: [att()], repo: REPO }).ok).toBe(false);
  });

  it("the gate names the passing report so its bytes can be checked", () => {
    const tree = "abcdef1234567";
    const res = checkAdversaryReport({ phase: "0", reports: [{ name: "ADVERSARY_REPORT_phase0.x9.md", content: `# r\nVerdict: PASS\nverified-tree: ${tree}\nReviewer-family: OpenAI` }], currentTreeHash: tree });
    expect(res.ok).toBe(true);
    expect(res.report).toBe("ADVERSARY_REPORT_phase0.x9.md");
  });
});

describe("attestation readers (X5-02)", () => {
  it("reads `gh attestation verify --format json` output, and nothing from garbage", () => {
    const out = JSON.stringify([{ verificationResult: { statement: { subject: [{ digest: { sha256: DIGEST } }] }, signature: { certificate: { buildSignerURI: SIGNER } } } }]);
    expect(attestationsFromGhVerify(out)).toEqual([{ signatureVerified: true, chainVerified: true, signerUri: SIGNER, subjectDigests: [DIGEST] }]);
    expect(attestationsFromGhVerify("")).toEqual([]);
    expect(attestationsFromGhVerify("{}")).toEqual([]);
  });

  /** A real ECDSA P-256 key and certificate carrying the signer as a SAN URI,
   * made with openssl; a DSSE envelope signed over the PAE. MUTATION: X5-02d. */
  it("verifies a REST bundle's DSSE signature against its certificate and reads the signer", () => {
    const dir = mkdtempSync(join(tmpdir(), "attest-"));
    try {
      const key = join(dir, "k.pem");
      const crt = join(dir, "c.pem");
      execFileSync("openssl", ["ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", key], { stdio: "pipe" });
      execFileSync("openssl", ["req", "-new", "-x509", "-key", key, "-out", crt, "-days", "1", "-subj", "/CN=test", "-addext", `subjectAltName=URI:${SIGNER}`], { stdio: "pipe" });
      const certDer = Buffer.from(readFileSync(crt, "utf8").replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""), "base64");
      const statement = Buffer.from(JSON.stringify({ _type: "https://in-toto.io/Statement/v1", subject: [{ name: "r.md", digest: { sha256: DIGEST } }] }));
      const type = "application/vnd.in-toto+json";
      const signer = createSign("sha256");
      signer.update(dssePae(type, statement));
      const sig = signer.sign(readFileSync(key, "utf8"));
      const bundle = (payload: Buffer, signature: Buffer) => ({
        attestations: [{ bundle: { dsseEnvelope: { payloadType: type, payload: payload.toString("base64"), signatures: [{ sig: signature.toString("base64") }] }, verificationMaterial: { certificate: { rawBytes: certDer.toString("base64") } } } }],
      });
      const [good] = attestationsFromApi(bundle(statement, sig));
      expect(good).toEqual({ signatureVerified: true, chainVerified: false, signerUri: SIGNER, subjectDigests: [DIGEST] });
      const tampered = Buffer.from(JSON.stringify({ subject: [{ digest: { sha256: "0".repeat(64) } }] }));
      const [bad] = attestationsFromApi(bundle(tampered, sig));
      expect(bad.signatureVerified, "a payload the signature does not cover was accepted").toBe(false);
      expect(bad.subjectDigests, "an unverified payload's subjects were read").toEqual([]);
      expect(attestationsFromApi(null)).toEqual([]);
      expect(attestationsFromApi({ attestations: [{ bundle: {} }] })[0].signatureVerified).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/** The x6 read (run 37544742946) wrote a FAIL report that the success()-gated
 * attest and commit steps skipped, so its findings were lost with the runner.
 * A report is attested and committed WHATEVER its verdict.
 * MUTATION: X6-01 — gate the attest step on success() again. */
describe("the review workflow keeps every report it writes", () => {
  it("attests and commits on report presence, not on the read's exit code", () => {
    const wf = readFileSync(new URL("../../../.github/workflows/cross-family-read.yml", import.meta.url), "utf8");
    expect(wf, "a step is still gated on the read succeeding").not.toMatch(/if: success\(\)/);
    const attest = wf.slice(wf.indexOf("actions/attest-build-provenance@"));
    expect(attest.split("\n")[1], "the attestation is not gated on a report existing").toMatch(/if: steps\.new\.outputs\.report != ''/);
    expect(wf).toMatch(/run: npm run cross-family-read \|\| echo "rc=\$\?" >> "\$GITHUB_OUTPUT"/);
    expect(wf, "the read's verdict no longer decides the job").toMatch(/exit "\$RC"/);
  });
});
