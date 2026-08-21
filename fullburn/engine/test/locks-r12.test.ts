import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { CapError, getCaps } from "@fullburn/config/caps";
import { FrozenCapsSpendMeter, MemorySpendMeter, MeterUnavailableError, medianOfThree, trustedClock } from "../src/spend-meter.ts";
import { InMemorySpendLedger, processLedger, resetProcessLedgerForTests } from "../src/spend-ledger.ts";
import { TEST_CLIENT } from "./helpers.ts";

/** R12 LOCKS — the ledger enforces the ceiling, and exposes no way around it.
 *
 * R11 moved the state out of the meter and left it reachable: the ledger
 * arrived with public setters, so `setCommittedMicros(period, 0)` minted a
 * fresh ceiling on every call — $30 against a frozen $5/day, one meter, zero
 * `CapError`s, `todayUsd()` reading $0.00 (adversary finding R12-01). The
 * fences built for R11-07 guarded the RESET and had nothing to say about
 * writing the balance directly. */

beforeEach(resetProcessLedgerForTests);

const FROZEN_DAY = getCaps(TEST_CLIENT).dailyAiSpendUsd;

/** The method names the `SpendLedger` CONTRACT declares, read from the source.
 * Hard-coding them would go stale the day someone adds a setter — which is the
 * exact thing this file exists to catch. */
function contractMethods(): string[] {
  const src = readFileSync(new URL("../src/spend-ledger.ts", import.meta.url), "utf8");
  const body = /export interface SpendLedger \{([\s\S]*?)\n\}/.exec(src)?.[1];
  expect(body, "the SpendLedger interface could not be read — this test would pass vacuously").toBeDefined();
  const withoutComments = body!.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  return [...withoutComments.matchAll(/^\s*(\w+)\s*\(/gm)].map((m) => m[1]!);
}

describe("money — the ledger has no balance-write primitive, in any SEQUENCE (R12-01, R13-01)", () => {
  /** A SEQUENCE FUZZ, NOT A NAME ENUMERATION — and the difference is the whole
   * finding.
   *
   * The previous lock called each contract method ALONE with thirteen fixed
   * argument tuples and re-read the balance after each single call. Lowering a
   * balance takes TWO calls, `reserve` then `settle`, so the sequence that does
   * it was outside the fuzz's alphabet by construction; and none of its tuples
   * carried a negative amount. It enumerated method NAMES while the capability
   * lived in the state machine — the recurring root cause, applied to the lock
   * instead of the fix (adversary finding R13-01 leg B).
   *
   * Human ruling 2026-08-20: "Replace name-enumeration with a sequence fuzz
   * over the contract — random method orderings with adversarial arguments,
   * asserting the committed balance never falls and never rises except through
   * a cap-checked path. Multi-call sequences must be inside the alphabet by
   * construction."
   *
   * So: random walks over every contract method, with arguments drawn from an
   * adversarial pool that includes negatives, non-integers, huge values, other
   * tenants' ids and handles harvested from earlier calls. Two invariants are
   * checked after EVERY step, not after every test:
   *
   *   1. the committed balance never falls;
   *   2. it never exceeds the frozen ceiling.
   *
   * Seeded and deterministic — a flaky lock is a finding against the lock. */
  const FROZEN_MONTH = getCaps(TEST_CLIENT).monthlyAiSpendUsd;

  /** A tiny deterministic PRNG. `Math.random` would make a failure unrepeatable,
   * and an unrepeatable money finding is one nobody can fix. */
  function rng(seed: number): () => number {
    let x = seed >>> 0;
    return () => {
      x ^= x << 13;
      x >>>= 0;
      x ^= x >> 17;
      x ^= x << 5;
      x >>>= 0;
      return x / 0x1_0000_0000;
    };
  }

  it("no sequence of contract calls lowers a committed balance or beats the ceiling", () => {
    const methods = contractMethods();
    // The vacuity guard is about the money-moving surface being present, not
    // about a magic number: `isAvailable` left the contract when it turned out
    // nothing called it, and a hard-coded count made this test fail for a
    // reason that had nothing to do with money.
    expect(methods, "the money-moving methods are missing — this fuzz would prove nothing").toEqual(
      expect.arrayContaining(["reserve", "settle", "release", "committedMicros", "reservedMicros"]),
    );
    expect(methods.length).toBeGreaterThan(6);

    const violations: string[] = [];
    let everCommitted = false;

    for (let seed = 1; seed <= 40; seed++) {
      resetProcessLedgerForTests();
      const ledger = processLedger() as unknown as Record<string, (...a: unknown[]) => unknown>;
      const meter = new FrozenCapsSpendMeter();
      const next = rng(seed * 2_654_435_761);
      const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!;

      // Handles harvested as the walk goes, so `settle`/`release` have real
      // keys to work with and a two-call sequence is INSIDE the alphabet.
      const handles: object[] = [{}, {}];
      let high = 0;

      for (let step = 0; step < 60; step++) {
        const name = pick(methods);
        const args = pick<unknown[]>([
          [],
          [TEST_CLIENT],
          [TEST_CLIENT, "day"],
          [TEST_CLIENT, "month"],
          [TEST_CLIENT, -1_000_000, pick(handles)],
          [TEST_CLIENT, -1, pick(handles)],
          [TEST_CLIENT, 0, pick(handles)],
          [TEST_CLIENT, 0.5, pick(handles)],
          [TEST_CLIENT, 1_000, pick(handles)],
          [TEST_CLIENT, Number.MAX_SAFE_INTEGER, pick(handles)],
          [TEST_CLIENT, Number.NaN, pick(handles)],
          [TEST_CLIENT, -1_000_000, pick(handles), { [TEST_CLIENT]: { dailyAiSpendUsd: 1e9 } }],
          [TEST_CLIENT, 1_000, pick(handles), { [TEST_CLIENT]: { dailyAiSpendUsd: 1e9, monthlyAiSpendUsd: 1e9 } }],
          ["pulsern", 1_000_000, pick(handles)],
          [pick(handles)],
          [{}],
          [TEST_CLIENT, true, "fuzz"],
          [TEST_CLIENT, false, "fuzz"],
        ]);
        try {
          const out = ledger[name]?.(...args);
          if (out !== null && typeof out === "object") handles.push(out as object);
        } catch {
          // A refusal is the correct answer; only a successful write matters.
        }
        // Occasionally take the LEGITIMATE path too, so the walk reaches states
        // a pure-attack walk never would — and so `everCommitted` is real.
        if (next() < 0.25) {
          try {
            meter.settle(meter.reserve(TEST_CLIENT, 0.01));
            everCommitted = true;
          } catch {
            /* the ceiling binding is the expected outcome once it is full */
          }
        }

        let today: number;
        try {
          today = new FrozenCapsSpendMeter().todayUsd(TEST_CLIENT);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          /** A CORRUPT LEDGER IS A VIOLATION, NOT A SKIP.
           *
           * The first version of this fuzz skipped every failed read, and that
           * swallowed the finding it exists to catch: committing a negative
           * makes the stored total negative, the `usable()` guard then refuses
           * every subsequent read, and "the balance fell" never gets measured.
           * Fail-closed is the right REFUSAL, but arriving there through a
           * successful bad write is money damage — the tenant is bricked and
           * something wrote a number that cannot be money. Only the fuzz's own
           * availability flag is a legitimate skip. */
          if (/ledger is corrupt/.test(msg)) {
            violations.push(`seed ${seed} step ${step}: ${name} corrupted the ledger — ${msg}`);
            break;
          }
          ledger["setAvailable"]?.(TEST_CLIENT, true, "fuzz cleanup");
          continue; // storage marked down by the fuzz: fail-closed, not loss
        }
        if (today < high) violations.push(`seed ${seed} step ${step}: ${name} lowered $${high} → $${today}`);
        if (today > FROZEN_DAY) violations.push(`seed ${seed} step ${step}: ${name} put $${today} past $${FROZEN_DAY}/day`);
        const month = new FrozenCapsSpendMeter().monthUsd(TEST_CLIENT);
        if (month > FROZEN_MONTH) violations.push(`seed ${seed} step ${step}: ${name} put $${month} past $${FROZEN_MONTH}/month`);
        high = Math.max(high, today);
      }
    }

    expect(everCommitted, "the fuzz never committed anything — it would pass against a ledger that does nothing").toBe(true);
    expect(
      violations.slice(0, 10),
      `a SEQUENCE of contract calls moved money without a cap check — R12-01/R13-01 are reopened:\n  ` +
        violations.slice(0, 10).join("\n  "),
    ).toEqual([]);
  });

  /** The single call R13-01 used, stated on its own so the finding has a name
   * of its own in the suite.
   *
   * MUTATION: drop the sign check from `InMemorySpendLedger.reserve`. */
  it("a negative reservation is refused at the boundary, not projected", () => {
    const meter = new FrozenCapsSpendMeter();
    meter.settle(meter.reserve(TEST_CLIENT, FROZEN_DAY));
    const handle = {};
    expect(
      () => processLedger().reserve(TEST_CLIENT, -5_000_000, handle),
      "a negative amount was accepted, so `projected > cap` cannot fail",
    ).toThrow(/must be a positive whole number/);
    // The handle was never opened, so there is nothing for settle to commit.
    expect(processLedger().settle(handle), "a refused reservation still opened a handle").toBeNull();
    expect(meter.todayUsd(TEST_CLIENT), "the balance moved anyway").toBe(FROZEN_DAY);
  });

  /** Ceilings are not a parameter in any form, so there is nothing to hand
   * yourself. The narrowing table is the one permitted input and it clamps.
   *
   * MUTATION: give `reserve` a ceiling argument again. */
  it("a caller cannot supply the ceiling it is measured against", () => {
    const wide = new FrozenCapsSpendMeter({ [TEST_CLIENT]: { dailyAiSpendUsd: 1e9, monthlyAiSpendUsd: 1e9 } });
    let spent = 0;
    for (let i = 0; i < 2_000; i++) {
      try {
        wide.settle(wide.reserve(TEST_CLIENT, 0.01));
        spent += 0.01;
      } catch {
        break;
      }
    }
    expect(spent, `a widening table put $${spent} through a frozen $${FROZEN_DAY}/day`).toBeLessThanOrEqual(FROZEN_DAY);
    // …and it can still NARROW, so the table is not simply ignored.
    resetProcessLedgerForTests();
    const narrow = new FrozenCapsSpendMeter({ [TEST_CLIENT]: { dailyAiSpendUsd: 0.05 } });
    narrow.settle(narrow.reserve(TEST_CLIENT, 0.05));
    expect(() => narrow.reserve(TEST_CLIENT, 0.01), "the narrowing was ignored").toThrow(CapError);
  });

  /** The runtime object may carry more than the contract. Anything extra is a
   * capability Phase 2's Durable Object will not implement — today that is
   * exactly `clear()`, which ledger L31 discloses and the reset fences.
   *
   * MUTATION: add a method to `InMemorySpendLedger` without adding it to the
   * interface. */
  it("the implementation carries nothing beyond the contract except the disclosed reset", () => {
    const ledger = processLedger() as object;
    const runtime = Object.getOwnPropertyNames(Object.getPrototypeOf(ledger)).filter(
      (n) => n !== "constructor" && typeof (ledger as Record<string, unknown>)[n] === "function",
    );
    const extra = runtime.filter((n) => !contractMethods().includes(n));
    expect(extra, "an undeclared capability appeared on the production ledger").toEqual(["clear"]);
  });

  /** The production ledger is frozen, so a method cannot be replaced on it.
   *
   * MUTATION: drop `Object.freeze(fresh)` from `slot()`. */
  it("the production ledger cannot be patched", () => {
    const ledger = processLedger() as unknown as Record<string, unknown>;
    expect(Object.isFrozen(ledger), "the production ledger is mutable").toBe(true);
    expect(() => {
      ledger["settle"] = () => null;
    }, "settle was replaced on the production ledger").toThrow();
  });

  /** The measured R12-01 attack, end to end. */
  it("a caller holding the process ledger cannot spend past the frozen day", () => {
    const meter = new FrozenCapsSpendMeter();
    let spent = 0;
    for (let i = 0; i < 3_000; i++) {
      try {
        meter.settle(meter.reserve(TEST_CLIENT, 0.01));
        spent += 0.01;
      } catch {
        break;
      }
    }
    expect(spent, `3,000 dispatches put $${spent} through a frozen $${FROZEN_DAY}/day`).toBeLessThanOrEqual(FROZEN_DAY);
    expect(meter.todayUsd(TEST_CLIENT), "the ledger under-reports what was spent").toBeCloseTo(spent, 10);
  });
});

describe("storage availability is per client and audited (R12-07)", () => {
  /** R11-06 moved `setAvailable` off the meter and onto a PROCESS-WIDE object,
   * so one tenant's storage flag halted every tenant's spend — measured against
   * an unrelated client. The method moved; every clause of R11-06's complaint
   * still held, and the blast radius grew.
   *
   * MUTATION: make `isAvailable`/`setAvailable` ignore their `clientId`. */
  it("halting one client's storage leaves another client spending", () => {
    processLedger().setAvailable(TEST_CLIENT, false, "R12-07 fixture");
    const meter = new FrozenCapsSpendMeter();
    expect(() => meter.reserve(TEST_CLIENT, 0.01), "the halted client kept spending").toThrow(MeterUnavailableError);
    // A DIFFERENT tenant is untouched.
    expect(() => meter.settle(meter.reserve("pulsern", 0.01)), "an unrelated tenant was halted too").not.toThrow();
    expect(meter.todayUsd("pulsern")).toBeCloseTo(0.01, 10);
  });

  /** An operator action with money consequences leaves a record, and cannot be
   * taken without a stated reason.
   *
   * MUTATION: drop the reason check, or stop recording the event. */
  it("a halt requires a reason and is recorded", () => {
    const ledger = processLedger();
    expect(() => ledger.setAvailable(TEST_CLIENT, false, ""), "an unaudited halt was accepted").toThrow(MeterUnavailableError);
    expect(() => ledger.setAvailable("", false, "no client"), "a process-wide halt was accepted").toThrow(MeterUnavailableError);
    expect(ledger.availabilityAudit(), "a refused halt was recorded as though it happened").toEqual([]);
    ledger.setAvailable(TEST_CLIENT, false, "simulated storage outage");
    const audit = ledger.availabilityAudit();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ clientId: TEST_CLIENT, available: false, reason: "simulated storage outage" });
    // The audit is a COPY: a caller cannot rewrite the record it was handed.
    (audit as unknown as unknown[]).length = 0;
    expect(ledger.availabilityAudit(), "the audit log was editable through its own return value").toHaveLength(1);
  });

  /** The contract no longer hands a caller every tenant's open reservations.
   *
   * MUTATION: reintroduce `openEntries()`, or drop `assertOwnPeriod`. */
  it("one tenant cannot read another tenant's ledger through the contract", () => {
    const meter = new FrozenCapsSpendMeter();
    meter.settle(meter.reserve("pulsern", 1));
    meter.reserve("pulsern", 1); // held open, not settled
    // THERE IS NO PERIOD-KEY PARAMETER ANY MORE (R13-01): a caller names the
    // SPAN of its OWN calendar, so there is nothing to point at another tenant.
    // The previous version of this test forged `d:<day>|pulsern` and asserted a
    // refusal; the refusal is gone because the capability is.
    expect(processLedger().committedMicros(TEST_CLIENT, "day"), "another tenant's spend leaked into this client's day").toBe(0);
    expect(processLedger().committedMicros(TEST_CLIENT, "month"), "another tenant's spend leaked into this client's month").toBe(0);
    expect(processLedger().reservedMicros(TEST_CLIENT), "another tenant's holdings leaked into this client's total").toBe(0);
    // …and the other tenant's own readings are intact, so this is isolation
    // rather than a ledger that reports zero for everyone.
    expect(processLedger().committedMicros("pulsern", "day")).toBe(1_000_000);
    expect(processLedger().reservedMicros("pulsern")).toBe(1_000_000);
  });
});

describe("the process ledger survives a module reset (R12-06, L31(a))", () => {
  /** A module-scoped `const` is one ledger per MODULE INSTANCE, and a second
   * instance is obtainable inside a single process: `vi.resetModules()` plus a
   * re-import minted a full second ceiling, $10 against a frozen $5/day. The
   * project's own suite did it, which is why four of six shuffle seeds were red.
   *
   * MUTATION: replace the `Symbol.for` slot with a module-scoped `const`. */
  it("a re-imported module instance finds the same ledger, not a fresh ceiling", async () => {
    const meter = new FrozenCapsSpendMeter();
    meter.settle(meter.reserve(TEST_CLIENT, FROZEN_DAY));

    const { vi } = await import("vitest");
    vi.resetModules();
    const freshMeter = await import("../src/spend-meter.ts");
    const freshLedger = await import("../src/spend-ledger.ts");

    expect(freshLedger.processLedger(), "the re-imported module built its own ledger").toBe(processLedger());
    const second = new freshMeter.FrozenCapsSpendMeter();
    expect(second.todayUsd(TEST_CLIENT), "a re-imported module read a fresh balance").toBe(FROZEN_DAY);
    expect(() => second.reserve(TEST_CLIENT, 0.01), "a re-imported module minted a second ceiling").toThrow();
  });
});

describe("the trusted clock's median is a guard, and guards get driven (R12-03)", () => {
  /** `readings.map(...).sort(...)[1]` was inline, and replacing it with
   * `readings[0]` left the whole suite green — while the attack narrowed from
   * "move two sources consistently" back to "move `Date.now`", which is
   * R10-03's original target. It is the load-bearing half of `spend-meter.ts`'s
   * claim that one tampered source "can only fail the spread", and it had no
   * test at all (adversary findings R11-03, R12-03).
   *
   * MUTATION: `medianOfThree` returns `values[0]`. */
  it("one tampered source cannot drag the anchor, whichever position it takes", () => {
    // A tampered reading in each slot in turn; the honest pair is 100/101.
    expect(medianOfThree([100, 101, 5_000]), "a high outlier dragged the anchor").toBe(101);
    expect(medianOfThree([5_000, 100, 101]), "a leading outlier dragged the anchor").toBe(101);
    expect(medianOfThree([100, 5_000, 101]), "a middle outlier dragged the anchor").toBe(101);
    expect(medianOfThree([1, 100, 101]), "a low outlier dragged the anchor").toBe(100);
    // It does not sort in place: the caller's array is evidence, not scratch.
    const readings = [3, 1, 2];
    medianOfThree(readings);
    expect(readings, "the reading order was mutated by the median").toEqual([3, 1, 2]);
  });

  /** The other half of the same claim, which the spread check enforces: a
   * source far enough out fails construction rather than being medianed away.
   * Together these two make "one tampered source is refused" true rather than
   * merely stated.
   *
   * MUTATION: drop the spread check from anchorWallMs. */
  it("a source outside the tolerance is refused rather than out-voted", () => {
    const realPerfNow = performance.now.bind(performance);
    try {
      performance.now = () => realPerfNow() + 3 * 24 * 3600 * 1000;
      expect(() => trustedClock(), "one tampered time source was out-voted instead of refused").toThrow(/disagree/);
    } finally {
      performance.now = realPerfNow;
    }
  });
});

describe("the disclosed in-process residual, MEASURED (L31(b), R13-03)", () => {
  /** L31(b) claimed this file "carries the BOUNDING test the standing ruling
   * requires: it executes the patch and records exactly how far it gets". It
   * did not exist — the row described what was intended and the test was never
   * written, in the very commit that adopted the rule requiring behavioural
   * rows to carry one (adversary finding R13-03). Here it is.
   *
   * The prototype stays unfrozen by human ruling — freezing it is another
   * spelling, and two rounds proved what that is worth. So the residual is
   * real, and the point of this test is to state its SIZE in executable form:
   * the day the bound changes, this goes red and the ledger row has to be
   * rewritten rather than quietly outliving its facts. */
  /** BOTH PROTOTYPES. The row named only `MemorySpendMeter.prototype`, and
   * R13-01 is the fix that moved every enforcement decision onto
   * `InMemorySpendLedger.prototype` — unfrozen, exported, and re-exported a
   * second time from `spend-meter.ts` (adversary finding R14-02). A disclosure
   * that names one of two members of its own residual class is a disclosure
   * that will be read as covering both. */
  it("an in-process LEDGER prototype patch spends unmetered — and this is how far it gets", () => {
    /** THE PROTOTYPE THE PRODUCTION LEDGER ACTUALLY RESOLVES THROUGH, not the
     * one this file imported. A second module instance has its own class, so
     * patching the import missed the live object entirely under a single-fork
     * pool — and an attacker would reach for the live one anyway. */
    const proto = Object.getPrototypeOf(processLedger()) as Record<string, unknown>;
    // The vacuity guard is that the prototype carries the method being patched
    // — NOT that it is the class this file imported. Under a shared registry a
    // second module instance has its own class, and the live object is the one
    // that matters; asserting identity there fails for a reason that has
    // nothing to do with the residual being measured.
    expect(typeof proto["reserve"], "the ledger prototype carries no reserve — the fixture is broken").toBe("function");
    const realReserve = proto["reserve"];
    try {
      proto["reserve"] = function () {
        /* the cap check, deleted */
      };
      const meter = new FrozenCapsSpendMeter();
      let spent = 0;
      for (let i = 0; i < 800; i++) {
        try {
          meter.settle(meter.reserve(TEST_CLIENT, 0.01));
          spent += 0.01;
        } catch {
          break;
        }
      }
      expect(spent, "the ledger-prototype residual has NARROWED — L31(c) now overstates it").toBeCloseTo(8, 10);
      expect(meter.todayUsd(TEST_CLIENT), "the ledger recorded the patched spend").toBe(0);
    } finally {
      proto["reserve"] = realReserve;
    }
    resetProcessLedgerForTests();
    const clean = new FrozenCapsSpendMeter();
    let honest = 0;
    for (let i = 0; i < 3_000; i++) {
      try {
        clean.settle(clean.reserve(TEST_CLIENT, 0.01));
        honest += 0.01;
      } catch {
        break;
      }
    }
    expect(honest, "the fixture did not restore the prototype").toBeLessThanOrEqual(FROZEN_DAY);
  });

  it("an in-process METER prototype patch spends unmetered — and this is how far it gets", () => {
    const proto = MemorySpendMeter.prototype as unknown as Record<string, unknown>;
    const realSettle = proto["settle"];
    const realReserve = proto["reserve"];
    try {
      // R10-02's payload, one layer down: settle releases instead of committing.
      proto["settle"] = function (this: { release(r: unknown): void }, r: unknown) {
        this.release(r);
      };
      const meter = new FrozenCapsSpendMeter();
      let spent = 0;
      for (let i = 0; i < 500; i++) {
        try {
          meter.settle(meter.reserve(TEST_CLIENT, 0.01));
          spent += 0.01;
        } catch {
          break;
        }
      }
      /** THE BOUND, STATED: unbounded. The patch spends the full loop and the
       * ledger reads $0.00, because `settle` never reaches the ledger's commit.
       * Written as an assertion rather than a comment so it cannot go stale. */
      expect(spent, "the prototype-patch residual has NARROWED — L31(b) now overstates it").toBeCloseTo(5, 10);
      expect(meter.todayUsd(TEST_CLIENT), "the ledger recorded the patched spend").toBe(0);
    } finally {
      proto["settle"] = realSettle;
      proto["reserve"] = realReserve;
    }
    // …and with the prototype restored, the ceiling binds again, so the test
    // measured the patch rather than a broken fixture.
    resetProcessLedgerForTests();
    const clean = new FrozenCapsSpendMeter();
    let honest = 0;
    for (let i = 0; i < 3_000; i++) {
      try {
        clean.settle(clean.reserve(TEST_CLIENT, 0.01));
        honest += 0.01;
      } catch {
        break;
      }
    }
    expect(honest).toBeLessThanOrEqual(FROZEN_DAY);
  });
});
