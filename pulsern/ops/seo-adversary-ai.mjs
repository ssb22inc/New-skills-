#!/usr/bin/env node

/* Optional second-opinion reviewer. It uses the same server-side OpenRouter
   connection as PulseRN's existing content factories, while the deterministic
   gate remains decisive. */
import fs from "node:fs/promises";
import process from "node:process";

export function extractOutputText(response) {
  const chatText = response?.choices?.[0]?.message?.content;
  if (typeof chatText === "string") return chatText.trim();
  return (response?.output ?? []).flatMap((item) => item.content ?? []).filter((item) => item.type === "output_text").map((item) => item.text).join("\n").trim();
}

export async function runAdversary({ reportFile = "reports/seo/report.json", outputFile = "reports/seo/adversary.md", apiKey = process.env.OPENROUTER_API_KEY, model = process.env.SEO_ADVERSARY_MODEL || "openai/gpt-4.1" } = {}) {
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is required for the optional adversarial model review.");
  const report = JSON.parse(await fs.readFile(reportFile, "utf8"));
  const evidence = JSON.stringify({ verdict: report.verdict, findings: report.findings, pages: report.pages.map(({ route, title, words, types }) => ({ route, title, words, types })) });
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model, temperature: 0.2, max_tokens: 3000,
      messages: [{ role: "user", content: `Act as PulseRN's independent adversarial search reviewer. Challenge the deterministic audit. Identify false positives, false negatives, unsupported or manipulative claims, weak medical-adjacent sourcing, missing search intents, entity ambiguity, and agent-access failures. Use only supplied evidence and label inferences. Never approve or invent clinical facts. Require licensed-RN review for clinical changes. Never claim rankings can be guaranteed. Return concise Markdown sections: Verdict, strongest objections, release blockers, non-blocking experiments.\n\nBuilt-site audit evidence:\n${evidence}` }],
    }),
  });
  if (!response.ok) throw new Error(`OpenRouter returned ${response.status}: ${(await response.text()).slice(0, 500)}`);
  const review = extractOutputText(await response.json());
  if (!review) throw new Error("Adversarial reviewer returned no text.");
  await fs.writeFile(outputFile, `# PulseRN model-based adversarial review\n\nModel: ${model}\nGenerated: ${new Date().toISOString()}\n\n${review}\n`);
  return outputFile;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const output = await runAdversary();
  console.log(`wrote ${output}`);
}
