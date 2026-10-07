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
  const att = (over: Record<string, unknown> = {}) => ({ signatureVerified: true, chainVerified: true, signerUri: SIGNER, subjectDigests: [DIGEST], ...over });

  /** MUTATION: X5-02b, X5-02c. */
  it("accepts only a verified signature, from the review workflow, over these bytes", () => {
    expect(checkReportProvenance({ fileSha256: DIGEST, attestations: [att()], repo: REPO }).ok).toBe(true);
    expect(checkReportProvenance({ fileSha256: DIGEST, attestations: [att({ signatureVerified: false })], repo: REPO }).ok, "an unverified signature counted").toBe(false);
    expect(checkReportProvenance({ fileSha256: DIGEST, attestations: [att({ signerUri: `https://github.com/${REPO}/.github/workflows/other.yml@refs/heads/main` })], repo: REPO }).ok, "another workflow's signature counted").toBe(false);
    expect(checkReportProvenance({ fileSha256: DIGEST, attestations: [att({ signerUri: `https://github.com/evil/r/${REVIEW_SIGNER_WORKFLOW}@refs/heads/main` })], repo: REPO }).ok, "another repository's workflow counted").toBe(false);
    expect(checkReportProvenance({ fileSha256: DIGEST, attestations: [att({ subjectDigests: ["0".repeat(64)] })], repo: REPO }).ok, "an attestation of other bytes counted").toBe(false);
    // X6-01: the review workflow as rewritten on a branch is not the reviewer.
    expect(checkReportProvenance({ fileSha256: DIGEST, attestations: [att({ signerUri: `https://github.com/${REPO}/${REVIEW_SIGNER_WORKFLOW}@refs/heads/review-request/x9` })], repo: REPO }).ok, "a branch-run review workflow counted").toBe(false);
    expect(checkReportProvenance({ fileSha256: DIGEST, attestations: [att({ signerUri: `${SIGNER}-evil` })], repo: REPO }).ok, "a look-alike ref counted").toBe(false);
    expect(checkReportProvenance({ fileSha256: DIGEST, attestations: [att()], repo: REPO, trustedRef: "" }).ok, "no trusted branch still counted").toBe(false);
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
      /** X6-12: this bundle is SELF-SIGNED with the right SAN. Its signature
       * verifies; its chain does not — and the decision must refuse it.
       * MUTATION: X6-12. */
      expect(checkReportProvenance({ fileSha256: DIGEST, attestations: [good], repo: REPO }).ok, "a self-signed certificate was accepted as the review workflow").toBe(false);
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
    expect(wf).toMatch(/run: node trusted\/fullburn\/engine\/scripts\/cross-family-read\.mjs --target "\$RUNNER_TEMP\/target" \|\| echo "rc=\$\?" >> "\$GITHUB_OUTPUT"/);
    expect(wf, "the read's verdict no longer decides the job").toMatch(/exit "\$RC"/);
  });
});

/** X6-01 (GPT-6 Astra; human decision 2026-10-06): the reviewer is main's.
 * The workflow is dispatched on main, refuses any other ref, and runs main's
 * runner against the commit under review as data. MUTATION: X6-01b, X6-01c. */
describe("the review workflow runs main's reviewer against the target as data", () => {
  it("is dispatch-only, refuses any ref but main, and reviews --target", () => {
    const wf = readFileSync(new URL("../../../.github/workflows/cross-family-read.yml", import.meta.url), "utf8");
    const on = wf.slice(wf.indexOf("\non:\n"), wf.indexOf("\npermissions:"));
    expect(on).toMatch(/^  workflow_dispatch:/m);
    expect(on, "the reviewer can still be triggered from a branch").not.toMatch(/^  (?:push|pull_request|pull_request_target):/m);
    expect(wf, "the reviewer does not refuse a non-main ref").toMatch(/if: github\.ref != 'refs\/heads\/main'\n\s+run: \|\n.*\n\s+exit 1/);
    expect(wf).toMatch(/node trusted\/fullburn\/engine\/scripts\/cross-family-read\.mjs --target "\$RUNNER_TEMP\/target"/);
    expect(wf, "the reviewer installs packages").not.toMatch(/\bnpm (?:ci|install|i)\b/);
  });
});
