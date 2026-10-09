#!/usr/bin/env node
/* The explainer player, mounted in a real browser — what unit tests on
   static markup cannot see.
   ------------------------------------------------------------------
   Checks, on the REAL built components (ops/preview-diagrams.mjs):
     1. Pause stops the diagram moving: no animation is left running.
     2. Play starts it again.
     3. With reduced motion, a step whose narration ends does NOT move on.
     4. Without it, the player does move on when a clip ends.
   (Astra, PR #133 review, findings 15 and 16.)

   Usage: node ops/check-player.mjs   — exit 0 all pass, 1 any failure. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildPreview } from "./preview-diagrams.mjs";
import { launchBrowser } from "./browser.mjs";

const dir = mkdtempSync(join(tmpdir(), "pulsern-player-"));
const html = join(dir, "preview.html");
await buildPreview({ out: html });
const browser = await launchBrowser();
const failures = [];
const check = (ok, what) => { console.log(`${ok ? "✓" : "✗"} ${what}`); if (!ok) failures.push(what); };

/* Anything that moves: CSS entrance/loop classes or SVG (SMIL) animation
   elements, inside the explainer's drawing. */
const moving = (pg) => pg.evaluate(() => {
  const svg = document.querySelector(".dg-wrap svg");
  return svg.querySelectorAll(".dg-a, .dg-press, animate, animateMotion, animateTransform").length;
});
const stepNo = (pg) => pg.evaluate(() => [...document.querySelectorAll(".dg-dot")].findIndex((d) => d.classList.contains("on")));

try {
  // 1–2: pause and play, on a diagram with ambient motion (tonicity's water drops)
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const pg = await ctx.newPage();
    await pg.goto(`${pathToFileURL(html).href}?only=tonicity`);
    await pg.getByRole("button", { name: /Watch the explainer/ }).click();
    await pg.waitForTimeout(300);
    check(await moving(pg) > 0, "playing: the step is animated");
    await pg.getByRole("button", { name: "Pause" }).click();
    await pg.waitForTimeout(200);
    check(await moving(pg) === 0, "paused: nothing in the diagram is still animating");
    await pg.getByRole("button", { name: "Play" }).click();
    await pg.waitForTimeout(200);
    check(await moving(pg) > 0, "play again: the step animates again");
    await ctx.close();
  }
  // 3: reduced motion + narration ends → stays on the step
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: "reduce" });
    const pg = await ctx.newPage();
    await pg.goto(`${pathToFileURL(html).href}?only=potassium&audio=silent`);
    await pg.getByRole("button", { name: /Watch the explainer/ }).click();
    await pg.getByRole("button", { name: "Play" }).click();
    const before = await stepNo(pg);
    await pg.locator("audio").evaluate((a) => a.dispatchEvent(new Event("ended")));
    await pg.waitForTimeout(300);
    check(await stepNo(pg) === before, "reduced motion: the end of a clip does not advance the step");
    check(await pg.getByRole("button", { name: "Play" }).isVisible(), "reduced motion: playback stops at the end of the clip");
    check(await moving(pg) === 0, "reduced motion: nothing animates");
    await ctx.close();
  }
  // 4: normal motion + narration ends → next step
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const pg = await ctx.newPage();
    await pg.goto(`${pathToFileURL(html).href}?only=potassium&audio=silent`);
    await pg.getByRole("button", { name: /Watch the explainer/ }).click();
    const before = await stepNo(pg);
    await pg.locator("audio").evaluate((a) => a.dispatchEvent(new Event("ended")));
    await pg.waitForTimeout(300);
    check(await stepNo(pg) === before + 1, "normal motion: the end of a clip moves to the next step");
    await ctx.close();
  }
} finally {
  await browser.close();
  rmSync(dir, { recursive: true, force: true });
}
if (failures.length) { console.error(`\n${failures.length} player check(s) failed.`); process.exit(1); }
console.log("\nPlayer checks: all passed.");
