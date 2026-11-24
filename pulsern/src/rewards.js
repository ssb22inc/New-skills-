/* PulseRN rewards: the deterministic rules behind XP, the clinical career
   ladder, client-needs mastery badges, Today's shift, weekly rounds, the
   streak (shield + shift covers + milestones), combos, and the session
   recap. Plain code only (CLAUDE.md rule 6), LOCAL dates only (rule 4).

   Design rule: rewards follow learning, never clicking.
     - XP is earned by a considered, correct retrieval. A skip, a wrong
       answer, a repeat of a question already answered correctly, or an
       answer given faster than the stem can be read earns 0 XP. The answer
       still counts toward stats and readiness, so the data stays honest.
     - Correcting an earlier miss (spaced retrieval of an error) earns a
       small bonus, because error correction is where memory is built.
     - Ranks and badges need accuracy over a recent window, not volume. */

/* ---------------- dates (LOCAL) ---------------- */
export function parseDay(s) {
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export function fmtDay(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function shiftDay(day, n) {
  const d = parseDay(day);
  d.setDate(d.getDate() + n);
  return fmtDay(d);
}
/* Whole calendar days from a to b (b later = positive). Rounded so a DST
   change (23 or 25 hour day) still counts as one day. */
export function daysBetween(a, b) {
  return Math.round((parseDay(b) - parseDay(a)) / 86400000);
}
export function mondayOf(day) {
  const d = parseDay(day);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return fmtDay(d);
}

/* ---------------- constants ---------------- */
export const SHIFT_QUESTIONS = 8;            // same as the existing daily goal
export const REVIEW_FIX_BONUS = 5;           // a miss answered correctly later
export const MAX_COVERS = 2;                 // banked shift covers
export const COVER_EVERY_WEEK = 5;           // complete 5 shifts in a week to earn one
export const STREAK_MILESTONES = [7, 30, 100, 365];
export const COMBO_STEPS = [3, 5, 10, 15, 20, 30, 40, 50];
export const RECENT_WINDOW = 40;             // accuracy window for mastery and rank gates
export const HISTORY_DAYS = 35;              // day stats kept for the weekly view

/* Official NCLEX-RN test plan distribution (2026 RN Test Plan, the same
   ranges published on /learn/). Badges are pinned to these categories. */
export const TEST_PLAN = {
  "Management of Care": "15–21%",
  "Safety & Infection Control": "10–16%",
  "Health Promotion & Maintenance": "6–12%",
  "Psychosocial Integrity": "6–12%",
  "Basic Care & Comfort": "6–12%",
  "Pharmacology": "13–19%",
  "Reduction of Risk": "9–15%",
  "Physiological Adaptation": "11–17%",
};
export const SHORT_CAT = {
  "Management of Care": "Management of Care",
  "Safety & Infection Control": "Safety & Infection",
  "Health Promotion & Maintenance": "Health Promotion",
  "Psychosocial Integrity": "Psychosocial",
  "Basic Care & Comfort": "Basic Care",
  "Pharmacology": "Pharmacology",
  "Reduction of Risk": "Reduction of Risk",
  "Physiological Adaptation": "Physiological Adaptation",
};

/* ---------------- persisted shape (additive blob key "rewards") ---------------- */
export function emptyRewards() {
  return {
    v: 1,
    days: {},                 // {"YYYY-MM-DD": {q, ok, xp, cards, fixes, ms}}
    covers: 0,                // banked shift covers (0..MAX_COVERS)
    coverWeeks: [],           // Monday dates whose cover was already granted
    coverDays: [],            // days a cover or the shield protected
    best: { run: 0, sessionAcc: 0, sessionN: 0, dayQ: 0, streak: 0 },
    milestones: [],           // streak milestones already celebrated
    rankHigh: null,           // highest career rank index ever reached (ranks are never lost)
    badgesSeen: {},           // {cat: highest tier index celebrated}
    prefs: { sound: false, haptics: true, reduceFx: false },
  };
}

const num = (v, d = 0) => (Number.isFinite(v) ? v : d);

export function migrateRewards(r) {
  const base = emptyRewards();
  if (!r || typeof r !== "object") return base;
  const days = {};
  for (const [k, v] of Object.entries(r.days ?? {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !v || typeof v !== "object") continue;
    days[k] = { q: num(v.q), ok: num(v.ok), xp: num(v.xp), cards: num(v.cards), fixes: num(v.fixes), ms: num(v.ms) };
  }
  return {
    v: 1,
    days,
    covers: Math.max(0, Math.min(MAX_COVERS, num(r.covers))),
    coverWeeks: Array.isArray(r.coverWeeks) ? r.coverWeeks.filter((x) => typeof x === "string") : [],
    coverDays: Array.isArray(r.coverDays) ? r.coverDays.filter((x) => typeof x === "string") : [],
    best: { ...base.best, ...Object.fromEntries(Object.entries(r.best ?? {}).filter(([, v]) => Number.isFinite(v))) },
    milestones: Array.isArray(r.milestones) ? r.milestones.filter(Number.isFinite) : [],
    rankHigh: Number.isInteger(r.rankHigh) ? r.rankHigh : null,
    badgesSeen: r.badgesSeen && typeof r.badgesSeen === "object" ? { ...r.badgesSeen } : {},
    prefs: { ...base.prefs, ...(r.prefs && typeof r.prefs === "object" ? r.prefs : {}) },
  };
}

/* ---------------- XP for one answer ---------------- */
/* The least time a considered answer can take: about 60 ms per stem word
   (four times faster than skimming), never under 2.5 s, never over 6 s.
   Anything faster is a tap, not a retrieval. */
export function minThinkMs(q) {
  const words = String(q?.stem ?? "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(2500, Math.min(6000, 1500 + 60 * words));
}

/* log = the answer log BEFORE this answer. */
export function answerXp({ q, correct, ms = Infinity, log = [], skipped = false }) {
  if (skipped) return { xp: 0, reason: "skip", base: 0, bonus: 0 };
  let last = null;
  for (let i = log.length - 1; i >= 0; i--) if (String(log[i].id) === String(q.id)) { last = log[i]; break; }
  if (!correct) return { xp: 0, reason: "incorrect", base: 0, bonus: 0, fix: false };
  if (last && last.correct) return { xp: 0, reason: "repeat", base: 0, bonus: 0, fix: false };
  if (Number.isFinite(ms) && ms < minThinkMs(q)) return { xp: 0, reason: "too-fast", base: 0, bonus: 0, fix: false };
  const fix = !!(last && !last.correct);
  /* A corrected miss earns the fix bonus only, never the full first-try XP:
     wrong-then-right must never pay more than right the first time
     (otherwise "miss on purpose, read the rationale, re-answer" farms XP). */
  if (fix) return { xp: REVIEW_FIX_BONUS, reason: "fix", base: 0, bonus: REVIEW_FIX_BONUS, fix };
  const base = 10 * (q.diff || 1);
  return { xp: base, reason: "correct", base, bonus: 0, fix };
}

export function xpNote(res) {
  if (!res) return "";
  if (res.reason === "fix") return `+${res.xp} XP · miss corrected`;
  if (res.reason === "correct") return `+${res.xp} XP`;
  if (res.reason === "repeat") return "XP counts once per question";
  if (res.reason === "too-fast") return "XP counts for considered answers";
  return "";
}

/* ---------------- combos ---------------- */
export function comboFor(run) {
  if (!COMBO_STEPS.includes(run)) return null;
  const label = run >= 10 ? "Clinical judgment, locked in" : run >= 5 ? "Steady hands" : "On a roll";
  return { n: run, label };
}

/* ---------------- day stats ---------------- */
export function bumpDay(rewards, day, delta) {
  const days = { ...rewards.days };
  const cur = days[day] ?? { q: 0, ok: 0, xp: 0, cards: 0, fixes: 0, ms: 0 };
  const next = { ...cur };
  for (const [k, v] of Object.entries(delta)) next[k] = num(cur[k]) + num(v);
  days[day] = next;
  const cutoff = shiftDay(day, -HISTORY_DAYS);
  for (const k of Object.keys(days)) if (k < cutoff) delete days[k];
  const best = { ...rewards.best, dayQ: Math.max(rewards.best.dayQ, next.q) };
  return { ...rewards, days, best };
}

/* ---------------- Today's shift ---------------- */
/* Three tasks, each one a learning behavior:
     assessments = retrieval practice (8 questions)
     due cards   = spacing (clear what is due today)
     fix a miss  = error correction (one earlier miss answered correctly) */
export function shiftStatus({ day, answeredToday = 0, dueCount = 0, missesOpen = 0 }) {
  const d = day ?? { q: 0, cards: 0, fixes: 0 };
  const tasks = [
    { key: "questions", label: "Assessments", detail: `${Math.min(answeredToday, SHIFT_QUESTIONS)} of ${SHIFT_QUESTIONS} questions`, done: answeredToday >= SHIFT_QUESTIONS, progress: Math.min(1, answeredToday / SHIFT_QUESTIONS) },
    { key: "cards", label: "Scheduled reviews", detail: dueCount ? `${dueCount} card${dueCount === 1 ? "" : "s"} due` : (d.cards ? `${d.cards} reviewed` : "Nothing due"), done: dueCount === 0, progress: dueCount === 0 ? 1 : (d.cards ? d.cards / (d.cards + dueCount) : 0) },
    { key: "fix", label: "Fix a miss", detail: d.fixes ? `${d.fixes} corrected` : missesOpen ? `${missesOpen} waiting in review` : "No misses to fix", done: d.fixes > 0 || missesOpen === 0, progress: d.fixes > 0 || missesOpen === 0 ? 1 : 0 },
  ];
  const done = tasks.filter((t) => t.done).length;
  /* A shift only counts once something was actually studied today. */
  const complete = done === tasks.length && (answeredToday > 0 || d.cards > 0);
  return { tasks, done, total: tasks.length, complete };
}

/* A day "counts as a shift" in history when 8+ questions were answered. */
export const dayShiftDone = (d) => !!d && d.q >= SHIFT_QUESTIONS;

/* ---------------- weekly rounds ---------------- */
export function weekRounds(rewards, today) {
  const mon = mondayOf(today);
  const days = [];
  let q = 0, ok = 0, cards = 0, xp = 0, shifts = 0;
  for (let i = 0; i < 7; i++) {
    const day = shiftDay(mon, i);
    const d = rewards.days[day];
    const shift = dayShiftDone(d);
    const covered = rewards.coverDays.includes(day);
    if (d) { q += d.q; ok += d.ok; cards += d.cards; xp += d.xp; }
    if (shift) shifts++;
    days.push({ day, label: "MTWTFSS"[i], state: shift ? "shift" : covered ? "cover" : d && (d.q || d.cards) ? "studied" : day > today ? "future" : "off", isToday: day === today });
  }
  return { monday: mon, days, q, ok, acc: q ? Math.round((ok / q) * 100) : null, cards, xp, shifts, coverEarned: rewards.coverWeeks.includes(mon) };
}

/* Grant one shift cover the first time a week reaches COVER_EVERY_WEEK shifts. */
export function maybeGrantCover(rewards, today) {
  const wk = weekRounds(rewards, today);
  if (wk.shifts < COVER_EVERY_WEEK || rewards.coverWeeks.includes(wk.monday)) return { rewards, granted: false };
  return {
    rewards: { ...rewards, covers: Math.min(MAX_COVERS, rewards.covers + 1), coverWeeks: [...rewards.coverWeeks, wk.monday].slice(-12) },
    granted: rewards.covers < MAX_COVERS,
  };
}

/* ---------------- streak ---------------- */
/* Extends the existing {count, lastDay, shield} streak (shape unchanged):
     - same day: nothing changes
     - next day: +1; the shield comes back on every 7th day (existing rule)
     - missed days: the shield covers one, then banked shift covers cover
       the rest; if they can't cover every missed day, the streak restarts
   Returns the new streak, the new rewards, and what happened. */
export function advanceStreak(streak, rewards, today) {
  const s = { count: 0, lastDay: null, shield: true, ...(streak ?? {}) };
  if (s.lastDay === today) return { streak: s, rewards, event: "same", milestone: null };
  let next, event, r = rewards, protectedDays = [];
  const gap = s.lastDay ? daysBetween(s.lastDay, today) : null;
  if (gap === 1) {
    const n = s.count + 1;
    next = { ...s, count: n, lastDay: today, shield: s.shield || n % 7 === 0 };
    event = "extended";
  } else if (gap != null && gap > 1) {
    const missed = gap - 1;
    const fromShield = s.shield ? 1 : 0;
    if (missed <= fromShield + r.covers) {
      const coversUsed = Math.max(0, missed - fromShield);
      for (let i = 1; i <= missed; i++) protectedDays.push(shiftDay(s.lastDay, i));
      next = { ...s, count: s.count + 1, lastDay: today, shield: fromShield ? false : s.shield };
      r = { ...r, covers: r.covers - coversUsed, coverDays: [...r.coverDays, ...protectedDays].slice(-60) };
      event = coversUsed ? "cover" : "shield";
    } else {
      next = { ...s, count: 1, lastDay: today, shield: s.shield ?? true };
      event = "restart";
    }
  } else {
    next = { ...s, count: 1, lastDay: today, shield: s.shield ?? true };
    event = "start";
  }
  let milestone = null;
  if (STREAK_MILESTONES.includes(next.count) && !r.milestones.includes(next.count)) {
    milestone = next.count;
    r = { ...r, milestones: [...r.milestones, next.count] };
  }
  r = { ...r, best: { ...r.best, streak: Math.max(r.best.streak, next.count) } };
  return { streak: next, rewards: r, event, milestone, protectedDays };
}

export function nextMilestone(count) {
  return STREAK_MILESTONES.find((m) => m > count) ?? null;
}

/* ---------------- mastery badges (Benner, novice to expert) ---------------- */
export const TIERS = [
  { name: "Novice", min: 0, acc: 0 },
  { name: "Advanced Beginner", min: 10, acc: 60 },
  { name: "Competent", min: 25, acc: 70 },
  { name: "Proficient", min: 50, acc: 78 },
  { name: "Expert", min: 100, acc: 85 },
];

export function categoryMastery(log, cat) {
  const rows = log.filter((l) => l.cat === cat);
  const recent = rows.slice(-RECENT_WINDOW);
  const acc = recent.length ? Math.round((recent.filter((r) => r.correct).length / recent.length) * 100) : null;
  let tier = 0;
  for (let i = 1; i < TIERS.length; i++) if (rows.length >= TIERS[i].min && acc != null && acc >= TIERS[i].acc) tier = i;
  const next = TIERS[tier + 1] ?? null;
  return {
    cat, n: rows.length, acc, tier, tierName: TIERS[tier].name,
    next: next ? { name: next.name, needN: Math.max(0, next.min - rows.length), needAcc: next.acc, accMet: acc != null && acc >= next.acc } : null,
  };
}

export function badgeBoard(log, cats, seen = {}) {
  return cats.map((cat) => {
    const m = categoryMastery(log, cat);
    const earned = Math.max(m.tier, Number.isInteger(seen[cat]) ? seen[cat] : 0);
    return { ...m, earned, earnedName: TIERS[earned].name, slipping: earned > m.tier, plan: TEST_PLAN[cat] ?? null };
  });
}

/* ---------------- clinical career ladder ---------------- */
/* Each rank needs XP (effort) AND recent accuracy AND category mastery.
   Volume alone never promotes anyone past New Grad RN. */
export const CAREER = [
  { name: "Student Nurse", xp: 0, answers: 0, acc: 0, competent: 0, proficient: 0, line: "Every expert started here. Build the habit." },
  { name: "Graduate Nurse", xp: 80, answers: 20, acc: 0, competent: 0, proficient: 0, line: "The basics are in place. Now build accuracy." },
  { name: "New Grad RN", xp: 200, answers: 50, acc: 60, competent: 0, proficient: 0, line: "Safe, steady, and getting faster at prioritizing." },
  { name: "Staff Nurse", xp: 400, answers: 100, acc: 65, competent: 2, proficient: 0, line: "Reliable judgment across your first categories." },
  { name: "Preceptor", xp: 700, answers: 200, acc: 70, competent: 4, proficient: 0, line: "Strong enough to teach the reasoning, not just the answer." },
  { name: "Charge Nurse", xp: 1100, answers: 350, acc: 72, competent: 6, proficient: 0, mgmt: true, line: "Prioritization, delegation, and safety under load." },
  { name: "Nurse Educator", xp: 1600, answers: 500, acc: 75, competent: 8, proficient: 3, line: "Command of the whole test plan." },
  { name: "Clinical Nurse Specialist", xp: 2400, answers: 800, acc: 78, competent: 8, proficient: 8, line: "Proficient in every client-needs category." },
];

/* The pre-ladder XP ranks map onto the ladder so nobody loses a title. */
const LEGACY = [[900, 6], [600, 5], [380, 4], [200, 3], [80, 2], [0, 0]];
export function legacyRankIndex(xp) {
  for (const [min, idx] of LEGACY) if (xp >= min) return idx;
  return 0;
}

export function recentAccuracy(log) {
  const recent = log.slice(-RECENT_WINDOW);
  return recent.length ? Math.round((recent.filter((r) => r.correct).length / recent.length) * 100) : null;
}

function rankReqs(rank, { xp, log, board }) {
  const acc = recentAccuracy(log);
  const competent = board.filter((b) => b.tier >= 2).length;
  const proficient = board.filter((b) => b.tier >= 3).length;
  const reqs = [
    { key: "xp", label: `${rank.xp} XP`, have: xp, need: rank.xp, met: xp >= rank.xp },
    { key: "answers", label: `${rank.answers} questions answered`, have: log.length, need: rank.answers, met: log.length >= rank.answers },
  ];
  if (rank.acc) reqs.push({ key: "acc", label: `${rank.acc}% accuracy on your last ${RECENT_WINDOW}`, have: acc ?? 0, need: rank.acc, met: acc != null && acc >= rank.acc && log.length >= Math.min(RECENT_WINDOW, rank.answers) });
  if (rank.competent) reqs.push({ key: "competent", label: `${rank.competent} categor${rank.competent === 1 ? "y" : "ies"} at Competent`, have: competent, need: rank.competent, met: competent >= rank.competent });
  if (rank.proficient) reqs.push({ key: "proficient", label: `${rank.proficient} categor${rank.proficient === 1 ? "y" : "ies"} at Proficient`, have: proficient, need: rank.proficient, met: proficient >= rank.proficient });
  if (rank.mgmt) {
    const m = board.find((b) => b.cat === "Management of Care");
    reqs.push({ key: "mgmt", label: "Management of Care at Competent", have: m?.tier ?? 0, need: 2, met: (m?.tier ?? 0) >= 2 });
  }
  return reqs;
}

export function careerStatus({ xp = 0, log = [], cats = [], rankHigh = null, seen = {} }) {
  const board = badgeBoard(log, cats, {}); // ranks use CURRENT mastery, not the high-water mark
  void seen;
  let earned = 0;
  for (let i = 1; i < CAREER.length; i++) {
    if (rankReqs(CAREER[i], { xp, log, board }).every((r) => r.met)) earned = i; else break;
  }
  const held = Math.max(earned, Number.isInteger(rankHigh) ? rankHigh : 0);
  const nextRank = CAREER[held + 1] ?? null;
  const reqs = nextRank ? rankReqs(nextRank, { xp, log, board }) : [];
  const progress = reqs.length
    ? reqs.reduce((s, r) => s + Math.min(1, r.need ? r.have / r.need : 1), 0) / reqs.length
    : 1;
  return { index: held, earnedNow: earned, rank: CAREER[held], next: nextRank, reqs, progress: Math.round(progress * 100) / 100 };
}

/* ---------------- moments (celebrate once) ---------------- */
export function detectMoments({ before, after, rewards }) {
  const out = [];
  if (after.career.index > (Number.isInteger(rewards.rankHigh) ? rewards.rankHigh : before.career.index)) {
    out.push({ kind: "rank", title: after.career.rank.name, line: after.career.rank.line, index: after.career.index });
  }
  for (const b of after.board) {
    const seen = Number.isInteger(rewards.badgesSeen[b.cat]) ? rewards.badgesSeen[b.cat] : 0;
    if (b.tier > seen && b.tier >= 1) out.push({ kind: "badge", cat: b.cat, tier: b.tier, title: `${TIERS[b.tier].name} · ${SHORT_CAT[b.cat] ?? b.cat}`, line: `${b.acc}% on your last ${Math.min(b.n, RECENT_WINDOW)} ${SHORT_CAT[b.cat] ?? b.cat} questions.` });
  }
  return out;
}

export function markMomentsSeen(rewards, moments) {
  let r = rewards;
  for (const m of moments) {
    if (m.kind === "rank") r = { ...r, rankHigh: Math.max(m.index, Number.isInteger(r.rankHigh) ? r.rankHigh : 0) };
    if (m.kind === "badge") r = { ...r, badgesSeen: { ...r.badgesSeen, [m.cat]: Math.max(m.tier, r.badgesSeen[m.cat] ?? 0) } };
  }
  return r;
}

/* ---------------- session recap ---------------- */
const catPct = (rows, cat) => {
  const r = rows.filter((l) => l.cat === cat);
  return r.length ? Math.round((r.filter((x) => x.correct).length / r.length) * 100) : null;
};

export function sessionRecap({ start, log, xp, now = Date.now(), rewards, cardsToday = 0, dueCount = 0, nextDue = null, bestRun = 0 }) {
  const rows = log.slice(start.logLen);
  const n = rows.length;
  const ok = rows.filter((r) => r.correct).length;
  const acc = n ? Math.round((ok / n) * 100) : null;
  const minutes = Math.max(1, Math.round((now - start.at) / 60000));
  const before = log.slice(0, start.logLen);
  const cats = [...new Set(rows.map((r) => r.cat))];
  const improved = cats
    .map((cat) => ({ cat, before: catPct(before, cat), after: catPct(log, cat), n: rows.filter((r) => r.cat === cat).length }))
    .filter((c) => c.after != null && (c.before == null ? c.n > 0 && c.after >= 50 : c.after > c.before))
    .sort((a, b) => (b.after - (b.before ?? 0)) - (a.after - (a.before ?? 0)))
    .slice(0, 3);
  const bests = [];
  const prev = rewards.best;
  if (n >= 8 && acc > prev.sessionAcc) bests.push({ key: "sessionAcc", label: `${acc}% round accuracy`, was: prev.sessionAcc });
  if (bestRun > (start.bestRun ?? 0) && bestRun >= 3) bests.push({ key: "run", label: `${bestRun} correct in a row`, was: start.bestRun ?? 0 });
  const nextBest = { ...prev, run: Math.max(prev.run, bestRun) };
  if (n >= 8 && acc > prev.sessionAcc) { nextBest.sessionAcc = acc; nextBest.sessionN = n; }
  return {
    n, ok, acc, minutes, xp: Math.max(0, xp - start.xp), improved, bests, nextBest,
    cards: Math.max(0, cardsToday - (start.cards ?? 0)), dueCount, nextDue,
  };
}
