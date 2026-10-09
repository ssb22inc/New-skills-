/* Which model writes, and which model judges. One place, on purpose.
   ------------------------------------------------------------------
   The reviewer used to be written out as "openai/gpt-4.1" in seven separate
   files, four of which also carried their own private copy of the HTTP call.
   A rule that lives in seven places is a rule that drifts: the next change
   updates five of them and leaves two still answering to the old judge, and
   nothing says so.

   Standing instruction from the owner (2026-10-06): all AI review and
   adversarial action belongs to one named OpenAI reviewer, and nothing is ever reviewed by a model
   from the same family that wrote it. The second half is not a preference. A
   model grading its own family's output shares its blind spots, so the review
   catches least exactly where it is needed most. assertCrossFamily() turns
   that rule into a check every reviewer runs, rather than a convention someone
   has to remember. */

export const GEN_MODEL = "anthropic/claude-sonnet-4.6";
/* Owner decision 2026-10-09: the adversarial reviewer is GPT Luna (it was
   GPT Astra until then). Every review, gate and audit reads it from here. */
export const REVIEW_MODEL = "openai/gpt-6-luna";
export const REVIEWER_NAME = "Luna";

/* Reasoning models reject or silently ignore sampling temperature. Sending
   0.7 to one is at best a no-op and at worst a 400 that would take a factory
   down the moment the reviewer switched — so the client asks this before
   sending it, rather than every caller having to know. */
const NO_TEMPERATURE = new Set(["openai/gpt-6-astra", "openai/gpt-6-luna"]);
export const acceptsTemperature = (model) => !NO_TEMPERATURE.has(model);

/* The vendor prefix is the family. Good enough here because the question is
   "did the same lab train both", and OpenRouter ids lead with the lab. */
export const familyOf = (model) => String(model ?? "").split("/")[0].toLowerCase();

export function assertCrossFamily(writer, reviewer) {
  const w = familyOf(writer);
  const r = familyOf(reviewer);
  if (!w || !r) throw new Error(`Cannot determine model family for "${writer}" / "${reviewer}".`);
  if (w === r) {
    throw new Error(
      `Same-family review refused: ${writer} would be judged by ${reviewer}. ` +
      `A model reviewing its own family's output shares its blind spots.`
    );
  }
}
