/* Email typo suggestions.
   ------------------------------------------------------------------
   The cost of a miss is one lost signup. The cost of a false positive is
   telling a student their own address is wrong, on the sign-up form, before
   they have any reason to trust the product. So the tests weight heavily
   toward "never suggest when unsure". */
import { describe, it, expect } from "vitest";
import { suggestEmail } from "../src/email-typo.js";

describe("email typo suggestions", () => {
  it("catches the typo that actually cost a signup", () => {
    // A real address from the user table: one missing 'h'.
    expect(suggestEmail("dasheli@yaoo.com")).toBe("dasheli@yahoo.com");
  });

  it("catches the common transpositions", () => {
    expect(suggestEmail("a@gmial.com")).toBe("a@gmail.com");
    expect(suggestEmail("a@gmai.com")).toBe("a@gmail.com");
    expect(suggestEmail("a@hotmial.com")).toBe("a@hotmail.com");
    expect(suggestEmail("a@outlok.com")).toBe("a@outlook.com");
  });

  it("stays silent on an address that is already correct", () => {
    for (const d of ["gmail.com", "yahoo.com", "icloud.com", "outlook.com"]) {
      expect(suggestEmail(`student@${d}`)).toBeNull();
    }
  });

  it("does not second-guess a legitimate university or work address", () => {
    // These are the addresses a nursing student most plausibly uses after a
    // personal one. Suggesting a correction here would be insulting and wrong.
    for (const d of ["nursing.edu", "student.miami.edu", "hospital.org", "nhs.uk", "protonmail.com"]) {
      expect(suggestEmail(`someone@${d}`)).toBeNull();
    }
  });

  it("does not turn one short domain into a different real one", () => {
    // me.com and aol.com are both real and short; two edits apart from other
    // real domains. A suggestion here would send mail to the wrong provider.
    expect(suggestEmail("a@me.com")).toBeNull();
    expect(suggestEmail("a@aol.com")).toBeNull();
  });

  it("says nothing until there is a whole address to judge", () => {
    for (const partial of ["", "a", "a@", "@gmail.com", "a@ ", "   "]) {
      expect(suggestEmail(partial)).toBeNull();
    }
  });

  it("keeps the local part exactly as typed, lowercased with the address", () => {
    expect(suggestEmail("First.Last+tag@yaoo.com")).toBe("first.last+tag@yahoo.com");
  });

  it("never throws, whatever it is handed", () => {
    for (const junk of [null, undefined, 42, {}, [], "@@@", "a@@b"]) {
      expect(() => suggestEmail(junk)).not.toThrow();
    }
  });
});
