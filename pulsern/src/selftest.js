/* Engine self-test — deterministic invariants over the REAL shipped modules.

   This is not a mock and not a unit-test copy: it imports the same code the
   app runs and exercises it with known inputs. Run from api/health.js against
   a deployed build, it answers the question "is the engine that students are
   using right now behaving correctly", which CI cannot answer after the fact.

   Everything here is plain deterministic code on purpose (CLAUDE.md rule 6).
   An LLM is the wrong instrument for "is the scheduler working" — there is a
   correct answer, so we assert it. The adversarial AI stays where it belongs:
   judging content, which has no mechanical ground truth.

   Each check carries `why`: one plain sentence about what a student would
   experience if it failed. The owner dashboard shows that sentence, so a red
   light is self-explanatory. */

import { dueQueue, nextSchedule, migrateLegacySrs, NEW_PER_DAY } from "./srs.js";
import { todayStr, addDays, fmtLocal } from "./dates.js";
import { emptyAbility, updateAbility, readinessFrom, itemRating, overallTheta } from "./ability-engine.js";
import { scoreMatrix, scoreBowtie, scoreCloze, scoreCalc, scoreHighlight, fourFn } from "./ngn.js";
import { PLANS, planById, discountedCents, computeEntitlement } from "./pricing.js";

const CATS_SAMPLE = ["Pharmacology", "Management of Care", "Basic Care & Comfort"];
const deck = (n) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, cat: "Pharmacology" }));

/* ---------------------------------------------------------------- checks */

const CHECKS = [
  /* ---- flashcard scheduling ---- */
  {
    id: "srs.graded-cards-leave",
    area: "Flashcard scheduling",
    name: "A card you answered correctly does not come back today",
    why: "If this fails, students see the same cards over and over and the spacing is meaningless.",
    run() {
      for (const grade of ["good", "hard", "easy"]) {
        const map = { c0: nextSchedule(undefined, grade) };
        if (dueQueue(deck(5), map).includes("c0")) return [false, `"${grade}" left the card due today`];
      }
      return [true, "good, hard and easy all schedule forward"];
    },
  },
  {
    id: "srs.failed-cards-return",
    area: "Flashcard scheduling",
    name: "A card you got wrong does come back",
    why: "If this fails, students never get a second chance at the material they missed.",
    run() {
      const map = { c0: nextSchedule(undefined, "again") };
      return dueQueue(deck(5), map).includes("c0")
        ? [true, "failed cards stay in today's queue"]
        : [false, "a failed card was scheduled away"];
    },
  },
  {
    id: "srs.failed-card-not-pinned",
    area: "Flashcard scheduling",
    name: "A failed card does not jump to the front on every refresh",
    why: "If this fails, one card greets the student every time they open the app.",
    run() {
      const map = {
        c0: { interval: 2, due: todayStr(), seen: "2020-01-01" },
        c1: { interval: 2, due: todayStr(), seen: "2020-01-01" },
        c2: { interval: 2, due: todayStr(), seen: "2020-01-01" },
      };
      map.c1 = nextSchedule(map.c1, "again"); // just graded → should sort last
      const q = dueQueue(deck(5), map);
      return q.indexOf("c1") > q.indexOf("c0")
        ? [true, "just-graded cards sort behind cards not yet seen today"]
        : [false, `just-graded card sits at position ${q.indexOf("c1")}`];
    },
  },
  {
    id: "srs.placeholder-cleanup",
    area: "Flashcard scheduling",
    name: "Never-studied cards are treated as new, not as overdue reviews",
    why: "If this fails, unstudied cards crowd out the real review queue and skip the daily new-card limit.",
    run() {
      const poisoned = { c0: { interval: 0, due: todayStr() }, c1: { interval: 0, due: todayStr() } };
      const real = { interval: 15, due: addDays(5), seen: "2020-01-01" };
      const cleaned = migrateLegacySrs([], { ...poisoned, c9: real });
      if (cleaned.c0 || cleaned.c1) return [false, "placeholder entries survived the cleanup"];
      if (!cleaned.c9) return [false, "a genuine review was destroyed by the cleanup"];
      return [true, "placeholders dropped, real schedules kept"];
    },
  },
  {
    id: "srs.new-card-cap",
    area: "Flashcard scheduling",
    name: "New cards are capped per day",
    why: "If this fails, a student opening a 1,000-card deck is shown all of it at once.",
    run() {
      const n = dueQueue(deck(500), {}).length;
      return n === NEW_PER_DAY ? [true, `capped at ${NEW_PER_DAY} a day`] : [false, `queue served ${n} new cards`];
    },
  },
  {
    id: "srs.future-cards-hidden",
    area: "Flashcard scheduling",
    name: "Cards scheduled for a future date stay hidden",
    why: "If this fails, spacing collapses and every card is due immediately.",
    run() {
      const map = { c0: { interval: 9, due: addDays(4), seen: todayStr() } };
      return dueQueue(deck(1), map).length === 0
        ? [true, "future reviews correctly withheld"]
        : [false, "a card due in 4 days was served today"];
    },
  },

  /* ---- adaptive difficulty ---- */
  {
    id: "ability.moves-correct-direction",
    area: "Adaptive difficulty",
    name: "Right answers raise your level, wrong answers lower it",
    why: "If this fails, the app serves questions at the wrong difficulty and readiness is meaningless.",
    run() {
      const q = { id: 1, cat: "Pharmacology", diff: 2 };
      const base = emptyAbility(CATS_SAMPLE);
      const up = updateAbility(base, q, true).ability ?? updateAbility(base, q, true);
      const down = updateAbility(base, q, false).ability ?? updateAbility(base, q, false);
      const t0 = base.Pharmacology.theta;
      const tUp = up.Pharmacology.theta, tDown = down.Pharmacology.theta;
      if (!(tUp > t0)) return [false, `correct answer moved level ${t0} → ${tUp}`];
      if (!(tDown < t0)) return [false, `wrong answer moved level ${t0} → ${tDown}`];
      return [true, `correct ${t0}→${Math.round(tUp)}, wrong ${t0}→${Math.round(tDown)}`];
    },
  },
  {
    id: "ability.readiness-withheld-early",
    area: "Adaptive difficulty",
    name: "Readiness is withheld until there is enough evidence",
    why: "If this fails, a student sees a confident readiness score after two questions — which would be a false promise.",
    run() {
      const ab = emptyAbility(CATS_SAMPLE);
      const few = readinessFrom(ab, Array.from({ length: 11 }, () => ({ correct: true })));
      const enough = readinessFrom(ab, Array.from({ length: 12 }, () => ({ correct: true })));
      if (few !== null) return [false, "readiness was shown with only 11 answers"];
      if (!enough) return [false, "readiness never appears even at 12 answers"];
      return [true, "hidden below 12 answers, shown at 12"];
    },
  },
  {
    id: "ability.readiness-in-range",
    area: "Adaptive difficulty",
    name: "Readiness always reports a sane percentage and band",
    why: "If this fails, students could see impossible numbers like 130% ready.",
    run() {
      const log = Array.from({ length: 40 }, () => ({ correct: true }));
      for (const theta of [600, 1200, 2400]) {
        const ab = emptyAbility(CATS_SAMPLE);
        for (const c of CATS_SAMPLE) ab[c] = { theta, n: 20 };
        const r = readinessFrom(ab, log);
        if (!r) return [false, "readiness missing with 40 answers"];
        if (r.pct < 0 || r.pct > 100) return [false, `pct out of range: ${r.pct}`];
        if (r.low < 0 || r.high > 100 || r.low > r.high) return [false, `band invalid: ${r.low}–${r.high}`];
      }
      return [true, "percentage and band bounded 0–100 across the ability range"];
    },
  },

  /* ---- answer scoring ---- */
  {
    id: "ngn.exact-match-only",
    area: "Answer scoring",
    name: "Next Gen answers are marked right only when they are right",
    why: "If this fails, students are told they passed questions they actually got wrong.",
    run() {
      const cases = [
        ["matrix", scoreMatrix, [0, 1, 0], [0, 1, 0], [0, 0, 0]],
        // bow-tie scores an object per slot, not a flat list
        ["bow-tie", scoreBowtie,
          { condition: 2, actions: [1, 3], parameters: [4, 5] },
          { condition: 2, actions: [3, 1], parameters: [5, 4] },   // order must not matter
          { condition: 2, actions: [1, 3], parameters: [4, 9] }],
        ["cloze", scoreCloze, [0, 1], [0, 1], [1, 1]],
        ["highlight", scoreHighlight, [2, 5], [2, 5], [2, 6]],
      ];
      for (const [label, fn, good, answer, bad] of cases) {
        if (fn(good, answer) !== true) return [false, `${label}: a correct answer was marked wrong`];
        if (fn(bad, answer) !== false) return [false, `${label}: a wrong answer was marked correct`];
      }
      return [true, "matrix, bow-tie, cloze and highlight all score exactly"];
    },
  },
  {
    id: "ngn.calculation-tolerance",
    area: "Answer scoring",
    name: "Dosage calculations accept the right value and reject wrong ones",
    why: "If this fails, dosage practice teaches the wrong number — the highest-risk failure on the site.",
    run() {
      if (scoreCalc(2, 2) !== true) return [false, "exact dosage answer marked wrong"];
      if (scoreCalc(20, 2) !== false) return [false, "a ten-fold dosage error was marked correct"];
      if (scoreCalc(2.05, 2, 0.1) !== true) return [false, "value inside stated tolerance rejected"];
      if (scoreCalc(2.5, 2, 0.1) !== false) return [false, "value outside stated tolerance accepted"];
      if (fourFn(6, 3, "/") !== 2) return [false, "calculator division is wrong"];
      if (Number.isFinite(fourFn(6, 0, "/"))) return [false, "divide by zero returned a finite number"];
      return [true, "exact and tolerance scoring correct; calculator sane"];
    },
  },

  /* ---- plans and access ---- */
  {
    id: "billing.access-states",
    area: "Plans and access",
    name: "Access status is computed correctly from subscriptions",
    why: "If this fails, paying students get locked out or non-payers get in free.",
    run() {
      const future = new Date(Date.now() + 86400e3).toISOString();
      const past = new Date(Date.now() - 86400e3).toISOString();
      const none = computeEntitlement([], []);
      if (none.status !== "none") return [false, `no rows gave status "${none.status}"`];
      const paid = computeEntitlement([{ plan: "d30", expires_at: future, exams_granted: 1 }], []);
      if (paid.status !== "active") return [false, `active subscription gave status "${paid.status}"`];
      const trial = computeEntitlement([{ plan: "pass1", expires_at: future, exams_granted: 0 }], []);
      if (trial.status !== "trial") return [false, `free pass gave status "${trial.status}"`];
      const done = computeEntitlement([{ plan: "d30", expires_at: past, exams_granted: 1 }], []);
      if (done.status !== "expired") return [false, `lapsed subscription gave status "${done.status}"`];
      return [true, "none, trial, active and expired all resolve correctly"];
    },
  },
  {
    id: "billing.exam-credits",
    area: "Plans and access",
    name: "Exam credits are consumed and never repeat",
    why: "If this fails, students could sit the same readiness exam twice, which destroys the honest score.",
    run() {
      const future = new Date(Date.now() + 86400e3).toISOString();
      const rows = [{ plan: "d30", expires_at: future, exams_granted: 3 }];
      const fresh = computeEntitlement(rows, []);
      if (fresh.examsLeft !== 3) return [false, `expected 3 credits, got ${fresh.examsLeft}`];
      const used = computeEntitlement(rows, [{ form: 1 }, { form: 2 }]);
      if (used.examsLeft !== 1) return [false, `expected 1 credit left, got ${used.examsLeft}`];
      if (!used.attempted.includes(1)) return [false, "an attempted form was not recorded"];
      return [true, "credits decrement and attempted forms are permanent"];
    },
  },
  {
    id: "billing.prices-are-server-truth",
    area: "Plans and access",
    name: "Prices and discounts calculate correctly",
    why: "If this fails, students are charged the wrong amount.",
    run() {
      if (!PLANS.length) return [false, "no plans are defined"];
      for (const p of PLANS) {
        if (typeof p.cents !== "number" || p.cents < 0) return [false, `plan ${p.id} has an invalid price`];
        if (planById(p.id)?.id !== p.id) return [false, `plan ${p.id} cannot be looked up by id`];
      }
      const full = 10000;
      const half = discountedCents(full, { percent_off: 50 });
      if (half >= full || half <= 0) return [false, `50% off 100.00 produced ${half} cents`];
      if (discountedCents(full, null) !== full) return [false, "no code changed the price"];
      return [true, `${PLANS.length} plans priced; discounts apply and default safely`];
    },
  },

  /* ---- dates ---- */
  {
    id: "dates.local-not-utc",
    area: "Dates and streaks",
    name: "Dates use the student's local day, not UTC",
    why: "If this fails, students studying at night lose streaks and cards come due a day early.",
    run() {
      const now = new Date();
      const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      if (todayStr() !== expected) return [false, `today is ${todayStr()}, local calendar says ${expected}`];
      if (addDays(0) !== todayStr()) return [false, "addDays(0) does not equal today"];
      if (!(addDays(1) > todayStr())) return [false, "tomorrow does not sort after today"];
      if (fmtLocal(new Date(2026, 0, 5)) !== "2026-01-05") return [false, "date formatting is wrong"];
      return [true, `local date ${todayStr()} formats and sorts correctly`];
    },
  },
];

/* ---------------------------------------------------------------- runner */

export function runSelfTest() {
  const results = CHECKS.map((c) => {
    let pass = false, detail = "";
    try {
      const [ok, note] = c.run();
      pass = ok === true;
      detail = note;
    } catch (e) {
      pass = false;
      detail = `check threw: ${e.message}`;
    }
    return { id: c.id, area: c.area, name: c.name, why: c.why, pass, detail };
  });

  const areas = [];
  for (const r of results) {
    let a = areas.find((x) => x.area === r.area);
    if (!a) { a = { area: r.area, ok: true, checks: [] }; areas.push(a); }
    a.checks.push(r);
    if (!r.pass) a.ok = false;
  }

  const failed = results.filter((r) => !r.pass);
  return {
    ok: failed.length === 0,
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    areas,
    failures: failed.map((f) => ({ id: f.id, name: f.name, detail: f.detail, why: f.why })),
  };
}

export const CHECK_COUNT = CHECKS.length;
