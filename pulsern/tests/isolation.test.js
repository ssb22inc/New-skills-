/* Which precautions a named condition needs — the mapping that outlines a
   row of the isolation diagram. */
import { describe, it, expect } from "vitest";
import { precautionFor } from "../src/diagrams/isolation.jsx";

describe("precautionFor", () => {
  it.each([
    ["A client with MRSA in a wound", "contact"],
    ["Clostridioides difficile diarrhea", "contact"],
    ["A child with pertussis", "droplet"],
    ["Neisseria meningitidis infection", "droplet"],
    ["Pulmonary tuberculosis is suspected", "airborne"],
    ["Rule out pulmonary TB; the client has night sweats", "airborne"],
    ["laryngeal TB", "airborne"],
    ["measles (rubeola)", "airborne"],
  ])("%s → %s", (text, type) => {
    expect(precautionFor(text).types).toEqual([type]);
  });

  it("gives chickenpox both airborne and contact", () => {
    expect(precautionFor("A child with varicella").types).toEqual(["airborne", "contact"]);
  });

  /* "German measles" is rubella (droplet), not measles (airborne). */
  it("reads 'German measles' as rubella, not measles", () => {
    expect(precautionFor("A child with German measles")).toEqual({ condition: "rubella", types: ["droplet"] });
    // exposure is not an infection: no row
    expect(precautionFor("A pregnant client exposed to German measles")).toBeNull();
  });

  /* Pneumococcal meningitis needs standard precautions only. */
  it("does not put bacterial meningitis in general on droplet", () => {
    expect(precautionFor("bacterial meningitis caused by Streptococcus pneumoniae")).toBeNull();
  });

  it("lights no row when a question compares two conditions", () => {
    expect(precautionFor("Which client can share a room: one with TB or one with MRSA?")).toBeNull();
  });

  /* Sol, PR #155 diagram review: the disease name alone picked the wrong
     precautions for these forms. */
  it.each([
    ["Latent tuberculosis infection on isoniazid", null],
    ["A client with a positive tuberculin skin test and latent TB", null],
    ["Infant with congenital rubella", { condition: "congenital rubella", types: ["contact"] }],
    ["Localized varicella-zoster in an immunocompetent client, lesions covered", null],
    ["Herpes zoster (shingles) on the trunk", null],
    ["Disseminated herpes zoster", { condition: "disseminated zoster", types: ["airborne", "contact"] }],
    ["Shingles in a client who is immunocompromised", null],
    /* Sol, PR #155 diagram review, round 2 */
    ["Active renal tuberculosis without pulmonary or laryngeal involvement", null],
    ["A client with congenital heart disease has acquired rubella", { condition: "rubella", types: ["droplet"] }],
    ["An immunocompetent client has localized shingles, not disseminated disease; all lesions are covered", null],
    ["The client received an influenza vaccine today", null],
    ["Localized zoster in an immunocompromised client; dissemination has been ruled out", null],
    ["A child with pubic lice", null],
    ["Body lice found during the assessment", null],
    ["A school-age child with head lice", { condition: "head lice", types: ["contact"] }],
    ["Pulmonary TB was ruled out", null],
    /* round 3 */
    ["The client with covered localized zoster has an intact immune system. The nurse is immunocompromised.", null],
    ["An immunocompetent nurse cares for an immunocompromised client with localized zoster", null],
    ["The client has pneumococcal meningitis rather than meningococcal disease", null],
    ["No fever in a client with measles", null],
    /* Sol, round 4: test results, negation after the name, history, another
       person's immune status, ruled-out dissemination, treatment and
       comparisons all leave the client's current need unsettled. */
    ["A client has measles and a negative rubella test.", null],
    ["Pulmonary TB is not suspected in this client.", null],
    ["The client completed treatment for pulmonary TB five years ago and has no active disease.", null],
    ["An immunocompetent client has localized zoster with covered lesions and an immunocompromised child at home.", null],
    ["An immunocompromised client has localized zoster with covered lesions; disseminated zoster has been ruled out.", null],
    ["A client with meningococcal disease has received effective antibiotics for 48 hours.", null],
    ["A client with chickenpox has all lesions dry and crusted.", null],
    ["Which client needs isolation: one with latent TB or one with pulmonary TB?", null],
    ["A client is admitted with suspected pulmonary tuberculosis.", { condition: "pulmonary or laryngeal TB", types: ["airborne"] }],
    ["A client has disseminated zoster.", { condition: "disseminated zoster", types: ["airborne", "contact"] }],
    ["Head lice were effectively treated 48 hours ago", null],
    ["Head lice were treated 6 hours ago with a pediculicide", null],
    ["Head lice were treated 24 hours ago", null],
    ["Head lice were treated this morning", null],
    ["A client has pulmonary TB with extrapulmonary involvement", { condition: "pulmonary or laryngeal TB", types: ["airborne"] }],
    ["A client with a history of MRSA admitted for knee surgery", null],
    ["MRSA was ruled out; the client has influenza", null],
    ["The client has tuberculosis", null],
  ])("%s", (text, want) => {
    expect(precautionFor(text)).toEqual(want);
  });

  it("does not read 'fluid' as flu", () => {
    expect(precautionFor("Encourage oral fluid intake")).toBeNull();
  });
});

/* PR #133 review, finding 10: the overview listed chickenpox under airborne
   only; the contact requirement appeared only in the last step. */
describe("chickenpox is shown as airborne + contact wherever it appears", () => {
  it("in the static diagram, its description, the airborne step and the facts", async () => {
    const React = (await import("react")).default;
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { isolation } = await import("../src/diagrams/isolation.jsx");
    const html = renderToStaticMarkup(React.createElement(isolation.Diagram, {}));
    expect(html).toMatch(/chickenpox[^<]*<\/text>(?:<text[^>]*>)?\(\+\u00a0contact\)|chickenpox \(\+\u00a0contact\)/);
    expect(html).toMatch(/<desc[^>]*>[^<]*Chickenpox and disseminated zoster need airborne and contact precautions/);
    const step = isolation.steps.find((s) => s.key === "airborne");
    expect(step.caption).toMatch(/Chickenpox also needs contact precautions/);
    expect(step.narration).toMatch(/contact precautions/);
    expect(isolation.facts.join(" ")).toMatch(/airborne AND contact/);
  });
});
