/* One description of the founder for every page's structured data and
   author box, so the schema and the visible text can't drift apart.
   Facts come from the review ledger (license, verified against the Florida
   Department of Health lookup) and the owner's own resume. No photo, by
   owner instruction (2026-11-28). Never add a home address. */
import { readFileSync } from "node:fs";

const SITE = "https://www.pulsern.app";
const LEDGER = JSON.parse(readFileSync(new URL("../content-review-records.json", import.meta.url), "utf8"));
export const REVIEWER = LEDGER.reviewer;
export const AUTHOR_URL = `${SITE}/about/#sheldon-bennett-rn`;
export const VERIFIED = REVIEWER?.verificationStatus === "verified" && /^https:\/\//.test(REVIEWER?.verificationUrl ?? "");
export const AUTHOR_LABEL = VERIFIED ? `${REVIEWER.displayName}, ${REVIEWER.credential}` : REVIEWER.displayName;

/* Visible one-line bio. Licensed since June 2020 per the state record. */
export const AUTHOR_SENTENCE = "Sheldon has been a registered nurse since 2020. He is licensed in Florida (multistate) and has six years of cardiac, neurology and orthopedic nursing experience.";
export const AUTHOR_BIO = "Registered nurse since 2020, licensed in Florida (multistate), with six years in cardiac, neurology and orthopedic nursing.";
export const LICENSE_LOOKUP_LABEL = "Florida Department of Health license lookup";

export function personNode() {
  const person = {
    "@type": "Person",
    "@id": AUTHOR_URL,
    name: AUTHOR_LABEL,
    url: AUTHOR_URL,
    worksFor: { "@id": `${SITE}/#org` },
  };
  if (!VERIFIED) return person;
  return {
    ...person,
    jobTitle: REVIEWER.licenseType,
    description: AUTHOR_BIO,
    knowsAbout: ["NCLEX-RN preparation", "Cardiac nursing", "Neurology nursing", "Orthopedic nursing"],
    sameAs: [REVIEWER.verificationUrl],
    hasCredential: [
      {
        "@type": "EducationalOccupationalCredential",
        credentialCategory: "license",
        name: "Registered Nurse (multistate license)",
        recognizedBy: { "@type": "GovernmentOrganization", name: REVIEWER.licenseJurisdiction },
        url: REVIEWER.verificationUrl,
      },
      {
        "@type": "EducationalOccupationalCredential",
        credentialCategory: "degree",
        name: "Associate degree in nursing",
        recognizedBy: { "@type": "EducationalOrganization", name: "Carleen Health Institute of South Florida" },
      },
    ],
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/* "2026-08-27" -> "Aug 27, 2026". The machine-readable datetime stays ISO. */
export function displayDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ""));
  if (!m) return String(iso ?? "");
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}
