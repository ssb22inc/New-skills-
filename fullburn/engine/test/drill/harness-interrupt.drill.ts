import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/** THE HARNESS INTERRUPT DRILL — DELIBERATELY OUTSIDE THE DEFAULT SUITE.
 *
 * This file is NOT matched by `vitest.config.ts`'s `include`. It runs only via
 * `npm run drill`, as its own CI stage.
 *
 * That separation is the whole point. The drill spawns the REAL mutation
 * harness against the REAL workspace, and it lived in `engine/test/integration/`
 * — which the default include matches. So `npm test` spawned a harness, which
 * mutated `engine/src/spend-meter.ts` on disk; the harness in turn ran the suite
 * 117 times, each of which spawned another harness; and because the interrupt
 * killed the `npx` shim rather than the vitest process it exec-chains to, every
 * run orphaned a CPU-bound worker tree that was never reaped. One failing drill
 * left the money-path file reverted on disk with every other gate green
 * (adversary finding R10-05).
 *
 * A test that writes to the source tree IS a tool that writes to the source
 * tree, and the standing invariant applies to it. Keeping it out of the suite
 * every other check runs under is how that invariant is honoured here — and the
 * invariant's enumeration now covers test files too, so a second one cannot
 * appear unnoticed. */

/** THE INTERRUPT DRILL — the "fails closed" half of the standing invariant,
 * executed rather than grepped.
 *
 * The harness carried SIGINT and SIGTERM handlers under the comment "Every
 * death a process can observe", and they could not run: the runner blocked the
 * event loop with `execSync` for the whole suite, so a queued handler waited
 * until every entry was done. Executed against the real harness, a Ctrl-C did
 * not stop it, restored nothing, and three more source files were rewritten
 * after the signal (adversary finding R9-03). The strings were present; the
 * behaviour was absent — and the invariant that claimed to check it was
 * grepping for the strings "SIGINT" and "SIGTERM".
 *
 * Human ruling 2026-08-17: a guard must be proven to block what it claims to
 * block, BY EXECUTING IT. So this spawns the real harness, waits until it has
 * genuinely broken a file, interrupts it, and asserts the tree came back.
 *
 * It lives in the integration suite because it costs real seconds — the same
 * reasoning that put the gate CLIs here rather than in the unit suite. */
describe("mutation harness — an interrupted run restores the tree (R9-03)", () => {
  it("SIGINT stops it, clears the marker, and leaves no file mutated", async () => {
    const { spawn } = await import("node:child_process");
    const { existsSync, readFileSync } = await import("node:fs");
    const workspace = fileURLToPath(new URL("../../../", import.meta.url)).replace(/\/$/, "");
    const marker = join(workspace, "engine/scripts/.mutate-inflight.json");

    /** A PRE-EXISTING MARKER IS A FAILURE, NOT A SKIP.
     *
     * This used to decline when a marker named a live pid, because the drill
     * lived in the default suite and the harness runs that suite 117 times
     * while holding the marker. R10-05 moved the drill out of the suite, so it
     * never runs inside a harness run and the decline has no legitimate case
     * left — what it did have was `echo '{"pid":1}' > .mutate-inflight.json`,
     * which permanently disabled the ONLY behavioural proof of the interrupt
     * property while the drill reported PASS (adversary finding R10-06).
     *
     * A check that reports success when it did not check is the defect this
     * project has spent four rounds removing. So: fail, and say what to do.
     *
     * (The earlier decline itself came from R9-01 re-created here — the first
     * version asserted the marker was absent while the harness held it, and the
     * meta-check's negative canary is what caught it. Both lessons stand; the
     * resolution is that this file does not run under `npm test` at all.) */
    expect(
      existsSync(marker),
      `a marker already exists at ${marker}, so this drill cannot spawn a harness and the interrupt ` +
        "property is UNVERIFIED. Find what left it — a crashed run, or a hand-written file — then remove it. " +
        "Never make this check skip: a silent pass here is exactly R10-06.",
    ).toBe(false);

    const child = spawn(process.execPath, ["engine/scripts/mutate.mjs"], { cwd: workspace, stdio: "ignore" });
    try {
      // Wait until it has ACTUALLY broken a file — interrupting before that
      // would prove nothing, because there would be nothing to restore.
      let mutated = null;
      for (let i = 0; i < 240 && mutated === null; i++) {
        await new Promise((r) => setTimeout(r, 500));
        if (existsSync(marker)) {
          try {
            const rec = JSON.parse(readFileSync(marker, "utf8"));
            if (typeof rec?.path === "string" && readFileSync(rec.path, "utf8") !== rec.original) mutated = rec;
          } catch {
            /* the marker is mid-write; look again */
          }
        }
      }
      expect(mutated, "the harness never broke a file, so this drill proved nothing").not.toBe(null);

      /** WHAT HAPPENS *AFTER* THE SIGNAL IS THE PROPERTY, not merely how fast
       * the process dies.
       *
       * The 30-second deadline is a DURATION, and anything that services the
       * signal inside it passes — including a runner that blocks for three
       * whole suite runs first and rewrites two more source files on the way
       * (adversary finding R12-04, measured with every gate green). R9-03's
       * recorded harm is "three more source files were rewritten after the
       * signal", so that is what is measured: the marker names the file being
       * mutated, and it must not name a DIFFERENT one once the signal is in. */
      /** WHAT HAPPENS *AFTER* THE SIGNAL IS THE PROPERTY.
       *
       * The 30-second deadline is a DURATION, and anything that services the
       * signal inside it passes — including a runner that blocks for three
       * whole suite runs first. The previous version tried to measure the real
       * property and did not: it only recorded whether the marker named a
       * DIFFERENT path, and the harness mutates `spend-meter.ts` for its first
       * four entries, so there was a three-entry window it could not see —
       * R9-03's recorded harm is exactly three (adversary finding R13-05).
       *
       * So the FILES are watched, not the marker's path. A snapshot is taken at
       * the instant of the signal; after that, the only content any watched file
       * may take is what it had then, or its pre-mutation original (that is the
       * restore). Anything else is a write that happened after the signal. */
      const watchList = new Set<string>([mutated!.path]);
      for (const rel of ["engine/src/spend-meter.ts", "engine/src/spend-ledger.ts", "engine/src/gateway.ts"]) {
        watchList.add(join(workspace, rel));
      }
      const atSignal = new Map<string, string>();
      const originals = new Map<string, string>([[mutated!.path, mutated!.original]]);
      for (const f of watchList) {
        try {
          atSignal.set(f, readFileSync(f, "utf8"));
        } catch {
          /* not present; nothing to watch */
        }
      }
      const afterSignal = new Set<string>();
      const watch = setInterval(() => {
        for (const f of watchList) {
          let now: string;
          try {
            now = readFileSync(f, "utf8");
          } catch {
            continue;
          }
          if (now === atSignal.get(f)) continue;
          if (now === originals.get(f)) continue; // the restore, which is the point
          afterSignal.add(f);
        }
        // A marker naming a file we were not watching is also a post-signal
        // write, and it tells us which one.
        try {
          const rec = JSON.parse(readFileSync(marker, "utf8"));
          if (typeof rec?.path === "string" && rec.path !== mutated!.path) afterSignal.add(rec.path);
        } catch {
          /* no marker, or mid-write */
        }
      }, 25);
      const exitCode = await new Promise((r) => {
        child.on("exit", (code, signal) => r(code ?? signal));
        child.kill("SIGINT");
        setTimeout(() => r("STILL RUNNING"), 30_000);
      });
      clearInterval(watch);
      expect(exitCode, "SIGINT did not stop the harness — it kept rewriting source").not.toBe("STILL RUNNING");
      // One last look after exit, in case the final write landed between polls.
      for (const f of watchList) {
        try {
          const now = readFileSync(f, "utf8");
          if (now !== atSignal.get(f) && now !== originals.get(f)) afterSignal.add(f);
        } catch {
          /* gone; nothing to compare */
        }
      }
      expect(
        [...afterSignal],
        "the harness wrote to source files AFTER the signal was delivered — the loop is blocking, so the " +
          "handler waited behind it (R9-03's recorded harm; R12-04 and R13-05 measured it past the old check)",
      ).toEqual([]);
      expect(readFileSync(mutated!.path, "utf8"), "an interrupted run left a guard reverted on disk").toBe(
        mutated!.original,
      );
      expect(existsSync(marker), "the marker outlived the interrupted run").toBe(false);
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  }, 180_000);
});
