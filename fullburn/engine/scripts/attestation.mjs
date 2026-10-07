/** Reads GitHub artifact attestations into the shape `checkReportProvenance`
 * decides on (cross-family finding X5-02). Data only — the decision is in
 * gate-lib.mjs.
 *
 * Two sources:
 *  - CI: the JSON printed by `gh attestation verify --format json`, which has
 *    already verified the full Sigstore chain, transparency log and signer
 *    workflow. Every entry it returns is signature-verified by construction.
 *  - The completion checker, where that client is absent: the REST listing
 *    `GET /repos/{repo}/attestations/sha256:{digest}`. Each bundle's DSSE
 *    signature is verified here against the leaf certificate's key, and the
 *    signer is read from that certificate. LIMITATION, stated: the leaf's
 *    chain to the Sigstore root and the transparency-log entry are NOT
 *    verified on this path (`chainVerified: false`); CI's gate is the one that
 *    does, and it is the gate a merge passes through. */
import { X509Certificate, createVerify } from "node:crypto";

export function attestationsFromGhVerify(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(String(jsonText));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map((r) => {
    const v = r?.verificationResult;
    const subjects = Array.isArray(v?.statement?.subject) ? v.statement.subject : [];
    return {
      signatureVerified: true,
      chainVerified: true,
      signerUri: typeof v?.signature?.certificate?.buildSignerURI === "string" ? v.signature.certificate.buildSignerURI : null,
      subjectDigests: subjects.map((s) => s?.digest?.sha256).filter((d) => typeof d === "string"),
    };
  });
}

/** DSSE pre-authentication encoding (the bytes a DSSE signature covers). */
export function dssePae(payloadType, payload) {
  const type = Buffer.from(String(payloadType), "utf8");
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  return Buffer.concat([Buffer.from(`DSSEv1 ${type.length} `), type, Buffer.from(` ${body.length} `), body]);
}

function leafCertificate(material) {
  const raw = material?.certificate?.rawBytes ?? material?.x509CertificateChain?.certificates?.[0]?.rawBytes;
  if (typeof raw !== "string") return null;
  try {
    return new X509Certificate(Buffer.from(raw, "base64"));
  } catch {
    return null;
  }
}

function signerFromSan(cert) {
  const san = String(cert?.subjectAltName ?? "");
  const m = /(?:^|,\s*)URI:([^,]+)/.exec(san);
  return m ? m[1].trim() : null;
}

export function attestationsFromApi(body) {
  const list = Array.isArray(body?.attestations) ? body.attestations : [];
  return list.map((a) => {
    const bundle = a?.bundle;
    const env = bundle?.dsseEnvelope;
    const cert = leafCertificate(bundle?.verificationMaterial);
    let signatureVerified = false;
    let subjectDigests = [];
    try {
      const payload = Buffer.from(String(env?.payload ?? ""), "base64");
      const sig = Buffer.from(String(env?.signatures?.[0]?.sig ?? ""), "base64");
      if (cert && payload.length > 0 && sig.length > 0) {
        const verifier = createVerify("sha256");
        verifier.update(dssePae(env.payloadType, payload));
        signatureVerified = verifier.verify(cert.publicKey, sig);
      }
      if (signatureVerified) {
        const statement = JSON.parse(payload.toString("utf8"));
        subjectDigests = (Array.isArray(statement?.subject) ? statement.subject : [])
          .map((s) => s?.digest?.sha256)
          .filter((d) => typeof d === "string");
      }
    } catch {
      signatureVerified = false;
      subjectDigests = [];
    }
    return { signatureVerified, chainVerified: false, signerUri: cert ? signerFromSan(cert) : null, subjectDigests };
  });
}
