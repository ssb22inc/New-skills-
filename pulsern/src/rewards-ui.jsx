/* Reward surfaces, drawn in the app's own language: the monitor motif,
   teal palette, Archivo + IBM Plex Mono, hand-drawn inline SVG. No emoji,
   no clip-art, no new colors. Every animation is CSS and is switched off
   by prefers-reduced-motion or the in-app "Reduce effects" setting
   (the .fx-reduced class on .app). */
import React, { useEffect, useRef } from "react";
import { CAREER, TIERS, SHORT_CAT, RECENT_WINDOW, COVER_EVERY_WEEK, MAX_COVERS, nextMilestone } from "./rewards.js";

const INITIALS = ["SN", "GN", "NG", "RN", "PR", "CN", "NE", "CNS"];

export function friendlyDay(day, today) {
  if (!day) return "";
  if (day === today) return "today";
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const [ty, tm, td] = today.split("-").map(Number);
  const diff = Math.round((dt - new Date(ty, tm - 1, td)) / 86400000);
  if (diff === 1) return "tomorrow";
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/* ---------- glyphs ---------- */
export function StreakGlyph({ size = 14, className = "" }) {
  return (
    <svg className={"rw-glyph " + className} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M8 14.2 2.6 8.9A3.3 3.3 0 0 1 8 4.6a3.3 3.3 0 0 1 5.4 4.3Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M3.6 8.6h2.2l1-1.8 1.4 3.2 1-1.4h3.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ShieldGlyph({ size = 14, used = false }) {
  return (
    <svg className="rw-glyph" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M8 1.6 13.2 3.5v4.1c0 3.1-2.2 5.6-5.2 6.8-3-1.2-5.2-3.7-5.2-6.8V3.5Z" fill={used ? "none" : "currentColor"} fillOpacity={used ? 0 : 0.18} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeDasharray={used ? "2 2" : undefined} />
      {!used && <path d="m5.6 8 1.7 1.7 3.2-3.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

function Check({ size = 12 }) {
  return <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="m2.5 6.2 2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

/* Mastery insignia: four ring segments (Advanced Beginner → Expert) around
   a heartbeat. Expert is the only solid one. */
export function Insignia({ tier = 0, size = 52, label }) {
  const r = 22, c = 2 * Math.PI * r, seg = c / 4 - 5;
  return (
    <svg className={"rw-insignia t" + tier} width={size} height={size} viewBox="0 0 56 56" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : "true"} focusable="false">
      <circle cx="28" cy="28" r={r} fill="none" className="rw-ins-track" strokeWidth="4" />
      {[0, 1, 2, 3].map((i) => (
        <circle key={i} cx="28" cy="28" r={r} fill="none" strokeWidth="4" strokeLinecap="round"
          className={i < tier ? "rw-ins-seg on" : "rw-ins-seg"}
          strokeDasharray={`${seg} ${c - seg}`} strokeDashoffset={-(i * (c / 4)) - 2.5 + c / 4}
          transform="rotate(-90 28 28)" />
      ))}
      <circle cx="28" cy="28" r="15" className={tier >= 4 ? "rw-ins-core solid" : "rw-ins-core"} />
      <path d="M17 28h4.5l2-4.5 3.2 9 2.6-7 1.6 2.5H39" fill="none" className={tier >= 4 ? "rw-ins-ecg solid" : tier ? "rw-ins-ecg on" : "rw-ins-ecg"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* Career rank: a small monitor dial. Eight segments, one per rank on the
   ladder, lit up to the rank held; the initials sit in the middle. */
export function RankDial({ index = 0, size = 64 }) {
  const r = 26, c = 2 * Math.PI * r, n = CAREER.length, seg = c / n - 4;
  return (
    <svg className="rw-dial" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle cx="32" cy="32" r="31" className="rw-dial-bg" />
      {Array.from({ length: n }, (_, i) => (
        <circle key={i} cx="32" cy="32" r={r} fill="none" strokeWidth="4" strokeLinecap="round"
          className={i <= index ? "rw-dial-seg on" : "rw-dial-seg"}
          strokeDasharray={`${seg} ${c - seg}`} strokeDashoffset={-(i * (c / n)) - 2 + c / 4}
          transform="rotate(-90 32 32)" />
      ))}
      <text x="32" y="36.5" textAnchor="middle" className="rw-dial-txt">{INITIALS[index] ?? "RN"}</text>
    </svg>
  );
}

/* One heartbeat drawn across the feedback line when an answer is right. */
export function EcgBeat({ className = "" }) {
  return (
    <svg className={"rw-beat " + className} viewBox="0 0 120 24" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M0 12h30l4-5 4 10 3-5h8l4-11 5 21 4-10h10l3-3 3 3h38" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Ripple() {
  return <span className="rw-ripple" aria-hidden="true"><span /><span /></span>;
}

/* ---------- inline answer feedback ---------- */
export function ComboChip({ combo, newBest = false }) {
  if (!combo && !newBest) return null;
  return (
    <p className="rw-combo mono" role="status">
      <EcgBeat className="mini" />
      <span>{combo ? `${combo.n} in a row · ${combo.label}` : "New personal best run"}{combo && newBest ? " · personal best" : ""}</span>
    </p>
  );
}

/* ---------- moments (milestone / promotion / badge / cover) ---------- */
const MOMENT_EYEBROW = { streak: "Streak milestone", rank: "Promotion", badge: "Mastery badge", cover: "Shift cover earned" };

export function MomentSheet({ moment, onClose, motion = true }) {
  const btn = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    requestAnimationFrame(() => btn.current?.focus());
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } if (e.key === "Tab") { e.preventDefault(); btn.current?.focus(); } };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); if (prev && document.contains(prev)) prev.focus?.(); };
  }, [onClose]);
  if (!moment) return null;
  return (
    <div className="rw-moment-wrap">
      <div className="rw-moment-overlay" onClick={onClose} />
      <section className="rw-moment" role="dialog" aria-modal="true" aria-labelledby="rw-moment-title" aria-describedby="rw-moment-line">
        <div className="rw-moment-hero">
          {motion && <Ripple />}
          {moment.kind === "streak" && (
            <div className="rw-moment-num"><StreakGlyph size={22} /><span className="mono">{moment.count}</span></div>
          )}
          {moment.kind === "rank" && <RankDial index={moment.index} size={92} />}
          {moment.kind === "badge" && <Insignia tier={moment.tier} size={92} />}
          {moment.kind === "cover" && <span className="rw-moment-shield"><ShieldGlyph size={56} /></span>}
          <EcgBeat className="hero" />
        </div>
        <div className="rw-moment-body">
          <p className="eyebrow">{MOMENT_EYEBROW[moment.kind]}</p>
          <h2 id="rw-moment-title" className="h2">{moment.title}</h2>
          <p id="rw-moment-line" className="small">{moment.line}</p>
          {moment.next && <p className="small mono rw-moment-next">{moment.next}</p>}
          <button ref={btn} type="button" className="btn rw-moment-btn" onClick={onClose}>Continue</button>
        </div>
      </section>
    </div>
  );
}

export function streakMoment(count) {
  const copy = {
    7: ["One week of spaced practice", "Seven days in a row. Short daily sessions like these are how long-term memory forms."],
    30: ["Thirty days on shift", "A month of showing up. This is the habit that carries you into test day."],
    100: ["One hundred days", "Consistency at this level is rare. Keep the rhythm going."],
    365: ["A full year of practice", "Every day for a year. That is a professional's habit."],
  }[count] ?? [`${count}-day streak`, "Consistency compounds."];
  const nm = nextMilestone(count);
  return { kind: "streak", count, title: copy[0], line: copy[1], next: nm ? `Next milestone: day ${nm}` : null };
}

/* ---------- Today's shift ---------- */
export function ShiftCard({ shift, streak, rewards, tourClass = "", children }) {
  const nm = nextMilestone(streak.count);
  return (
    <section className={"card rw-shift" + tourClass}>
      <div className="rw-row-between">
        <p className="eyebrow">Today's shift</p>
        <span className="rw-count mono" aria-label={`${shift.done} of ${shift.total} tasks done`}>{shift.done}/{shift.total}</span>
      </div>
      <h2 className="h2">{shift.complete ? "Shift complete. Handoff given." : "Three tasks, about ten minutes"}</h2>
      <ul className="rw-tasks">
        {shift.tasks.map((t) => (
          <li key={t.key} className={t.done ? "rw-task done" : "rw-task"}>
            <span className="rw-task-mark" aria-hidden="true">
              {t.done ? <Check /> : <svg width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="9" className="rw-task-track" /><circle cx="11" cy="11" r="9" className="rw-task-arc" strokeDasharray={`${56.5 * t.progress} 56.5`} transform="rotate(-90 11 11)" /></svg>}
            </span>
            <span className="rw-task-text"><strong>{t.label}</strong><span className="rw-task-detail">{t.detail}</span></span>
            <span className="sr-only">{t.done ? "done" : "to do"}</span>
          </li>
        ))}
      </ul>
      <div className="rw-streakline">
        <span className="rw-pill"><StreakGlyph /> Day {streak.count}{nm ? ` · ${nm - streak.count} to ${nm}` : ""}</span>
        <span className={streak.shield ? "rw-pill" : "rw-pill caution"}><ShieldGlyph used={!streak.shield} /> {streak.shield ? "Shield ready" : "Shield used"}</span>
        <span className="rw-pill"><ShieldGlyph /> {rewards.covers} shift cover{rewards.covers === 1 ? "" : "s"}</span>
      </div>
      {children}
    </section>
  );
}

/* ---------- career ---------- */
export function CareerCard({ career, full = false, tourClass = "" }) {
  const { rank, index, next, reqs, progress } = career;
  return (
    <section className={"card rw-career" + (full ? " wide" : "") + tourClass}>
      <p className="eyebrow">Clinical career</p>
      <div className="rw-career-head">
        <RankDial index={index} />
        <div>
          <h2 className="h2">{rank.name}</h2>
          <p className="small">{rank.line}</p>
        </div>
      </div>
      {next ? (
        <>
          <div className="rw-row-between rw-next-head">
            <span className="small"><strong>Next: {next.name}</strong></span>
            <span className="small mono">{Math.round(progress * 100)}%</span>
          </div>
          <div className="bar"><div className="bar-fill" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
          <ul className="rw-reqs">
            {reqs.map((r) => (
              <li key={r.key} className={r.met ? "met" : ""}>
                <span className="rw-req-mark" aria-hidden="true">{r.met ? <Check /> : null}</span>
                <span>{r.label}</span>
                <span className="mono rw-req-have">{r.met ? "done" : r.key === "acc" ? `${r.have}%` : `${r.have}/${r.need}`}</span>
              </li>
            ))}
          </ul>
        </>
      ) : <p className="small tip">Top of the ladder. Keep every category sharp.</p>}
      {full && (
        <ol className="rw-ladder" aria-label="Career ladder">
          {CAREER.map((c, i) => (
            <li key={c.name} className={i < index ? "held" : i === index ? "now" : ""}>
              <span className="rw-ladder-dot" aria-hidden="true">{i <= index ? <Check size={10} /> : null}</span>
              <span className="rw-ladder-name">{c.name}</span>
              <span className="rw-ladder-req mono">{i === 0 ? "start" : `${c.xp} XP${c.acc ? ` · ${c.acc}%` : ""}${c.competent ? ` · ${c.competent} comp.` : ""}${c.proficient ? ` · ${c.proficient} prof.` : ""}`}</span>
            </li>
          ))}
        </ol>
      )}
      {full && <p className="small tip">Ranks need recent accuracy and category mastery, not just volume. A rank, once earned, is never taken away.</p>}
    </section>
  );
}

/* ---------- mastery badges ---------- */
export function BadgeGrid({ board }) {
  const earned = board.filter((b) => b.earned >= 1).length;
  return (
    <section className="card wide rw-badges">
      <div className="rw-row-between">
        <p className="eyebrow">Mastery badges · NCLEX test plan</p>
        <span className="rw-count mono">{earned}/{board.length}</span>
      </div>
      <p className="small">One badge per client-needs category, earned by accuracy on your last {RECENT_WINDOW} questions in it. Levels follow novice to expert: {TIERS.slice(1).map((t) => t.name).join(", ")}.</p>
      <ul className="rw-badge-grid">
        {board.map((b) => (
          <li key={b.cat} className={b.earned ? "rw-badge on" : "rw-badge"}>
            <Insignia tier={b.earned} size={48} />
            <div className="rw-badge-text">
              <strong>{SHORT_CAT[b.cat] ?? b.cat}</strong>
              <span className="rw-badge-tier mono">{b.earned ? b.earnedName : b.n ? `Novice · ${b.n} answered` : "Not started"}</span>
              <span className="rw-badge-meta">{b.plan ? `${b.plan} of the exam` : ""}</span>
              <span className="rw-badge-next">
                {b.slipping ? `Recent accuracy ${b.acc}%. A short review keeps it sharp.`
                  : b.next ? `${b.next.name}: ${b.next.needN ? `${b.next.needN} more` : "questions done"} · ${b.next.needAcc}%${b.acc != null ? ` (now ${b.acc}%)` : ""}`
                  : "Top level reached"}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------- weekly rounds ---------- */
export function RoundsCard({ week, rewards }) {
  return (
    <section className="card rw-rounds">
      <div className="rw-row-between">
        <p className="eyebrow">This week's rounds</p>
        <span className="rw-count mono">{week.shifts}/{COVER_EVERY_WEEK} shifts</span>
      </div>
      <ol className="rw-week" aria-label="This week, Monday to Sunday">
        {week.days.map((d) => (
          <li key={d.day} className={`rw-day ${d.state}${d.isToday ? " today" : ""}`} aria-label={`${d.day}: ${{ shift: "shift complete", studied: "studied", cover: "protected by a cover", off: "no study", future: "upcoming" }[d.state]}${d.isToday ? ", today" : ""}`}>
            <span className="rw-day-dot" aria-hidden="true">{d.state === "shift" ? <Check /> : d.state === "cover" ? <ShieldGlyph size={12} /> : null}</span>
            <span className="rw-day-lab mono" aria-hidden="true">{d.label}</span>
          </li>
        ))}
      </ol>
      <p className="small mono rw-week-sum">{week.q} questions · {week.acc == null ? "--" : `${week.acc}%`} · {week.cards} cards · +{week.xp} XP</p>
      <p className="small tip">
        {week.coverEarned ? "Shift cover earned this week. It protects your streak on a day you can't study."
          : `${Math.min(week.shifts, COVER_EVERY_WEEK)} of ${COVER_EVERY_WEEK} shifts toward a shift cover (bank up to ${MAX_COVERS}). A shift is 8+ questions in a day.`}
        {rewards.covers ? ` You have ${rewards.covers} banked.` : ""}
      </p>
    </section>
  );
}

/* ---------- personal bests ---------- */
export function BestsCard({ best, bestRun }) {
  const rows = [
    ["Longest correct run", Math.max(best.run, bestRun), "in a row"],
    ["Best round (8+ questions)", best.sessionAcc, "% correct"],
    ["Most questions in a day", best.dayQ, "questions"],
    ["Longest streak", best.streak, "days"],
  ];
  return (
    <section className="card rw-bests">
      <p className="eyebrow">Personal bests</p>
      <dl className="rw-best-list">
        {rows.map(([k, v, unit]) => (
          <div key={k}><dt>{k}</dt><dd className="mono">{v ? `${v}${unit.startsWith("%") ? "" : " "}${unit}` : "--"}</dd></div>
        ))}
      </dl>
    </section>
  );
}

/* ---------- session recap ---------- */
export function SessionRecap({ recap, shift, today, motion = true, onDone, doneLabel = "Back to Today", onMore, moreLabel }) {
  const r = 30, c = 2 * Math.PI * r;
  const pct = recap.acc ?? 0;
  return (
    <section className="card rw-recap" aria-labelledby="rw-recap-title">
      <div className="rw-recap-hero">
        {motion && <Ripple />}
        <p className="rw-recap-eyebrow mono">Round complete</p>
        <div className="rw-recap-main">
          <svg className="rw-ring" width="84" height="84" viewBox="0 0 72 72" role="img" aria-label={`${pct}% correct`}>
            <circle cx="36" cy="36" r={r} className="rw-ring-track" />
            <circle cx="36" cy="36" r={r} className="rw-ring-fill" strokeDasharray={`${(c * pct) / 100} ${c}`} transform="rotate(-90 36 36)" />
            <text x="36" y="40" textAnchor="middle" className="rw-ring-txt">{recap.acc == null ? "--" : `${pct}%`}</text>
          </svg>
          <dl className="rw-recap-stats">
            <div><dt>XP</dt><dd className="mono">+{recap.xp}</dd></div>
            <div><dt>Questions</dt><dd className="mono">{recap.ok}/{recap.n}</dd></div>
            <div><dt>Cards</dt><dd className="mono">{recap.cards}</dd></div>
            <div><dt>Minutes</dt><dd className="mono">{recap.minutes}</dd></div>
          </dl>
        </div>
        <EcgBeat className="hero" />
      </div>
      <h2 id="rw-recap-title" className="h2">{recap.acc == null ? "Reviews done" : recap.acc >= 80 ? "Sharp round" : recap.acc >= 60 ? "Solid work" : "Good reps. The misses come back for you."}</h2>
      {recap.bests.map((b) => (
        <p key={b.key} className="rw-best mono">New best · {b.label}</p>
      ))}
      {recap.improved.length > 0 && (
        <div className="rw-improved">
          <p className="small"><strong>Categories improved</strong></p>
          <ul>
            {recap.improved.map((i) => (
              <li key={i.cat} className="small"><span>{SHORT_CAT[i.cat] ?? i.cat}</span><span className="mono">{i.before == null ? "new" : `${i.before}%`} → {i.after}%</span></li>
            ))}
          </ul>
        </div>
      )}
      <p className="small tip">
        {recap.dueCount
          ? `${recap.dueCount} flashcard${recap.dueCount === 1 ? "" : "s"} still due today. Clearing them finishes your scheduled reviews.`
          : `${recap.nextDue ? `Next flashcards due ${friendlyDay(recap.nextDue, today)}. ` : ""}Missed questions come back on their review dates, so this is a good place to stop.`}
      </p>
      {shift && <p className="small mono rw-recap-shift">Today's shift {shift.done}/{shift.total}{shift.complete ? " · complete" : ""}</p>}
      <div className="row">
        <button type="button" className="btn" onClick={onDone}>{doneLabel}</button>
        {onMore && <button type="button" className="btn ghost" onClick={onMore}>{moreLabel}</button>}
      </div>
    </section>
  );
}

/* ---------- styles ---------- */
export function RewardsStyle() {
  return (
    <style>{`
      .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
      .rw-glyph{display:inline-block;vertical-align:-2px;flex:0 0 auto}
      .rw-row-between{display:flex;justify-content:space-between;align-items:center;gap:8px}
      .rw-count{font-size:12px;font-weight:600;color:var(--accent-ink);background:var(--chip-bg);border-radius:99px;padding:3px 9px}
      /* insignia + dial */
      .rw-ins-track{stroke:var(--line)}
      .rw-ins-seg{stroke:transparent}
      .rw-ins-seg.on{stroke:var(--teal)}
      .rw-ins-core{fill:var(--surface);stroke:var(--line);stroke-width:1.5}
      .rw-ins-core.solid{fill:var(--teal);stroke:var(--teal)}
      .rw-ins-ecg{stroke:var(--muted);opacity:.55}
      .rw-ins-ecg.on{stroke:var(--teal);opacity:1}
      .rw-ins-ecg.solid{stroke:var(--card);opacity:1}
      .rw-dial-bg{fill:var(--mon)}
      .rw-dial-seg{stroke:#24433C}
      .rw-dial-seg.on{stroke:var(--ecg)}
      .rw-dial-txt{font-family:'IBM Plex Mono',monospace;font-weight:600;font-size:13px;fill:#CFEADF;letter-spacing:.04em}
      /* heartbeat line + ripple */
      .rw-beat{display:block;width:100%;height:24px}
      .rw-beat path{stroke:var(--teal);stroke-dasharray:180;stroke-dashoffset:0}
      .rw-beat.mini{width:34px;height:14px;flex:0 0 auto}
      .rw-beat.hero path{stroke:var(--ecg)}
      .feedback.ok .rw-beat.fb{height:22px;margin:2px 0 6px}
      .app:not(.fx-reduced) .rw-beat path{animation:rwDraw .8s cubic-bezier(.3,.7,.2,1) both}
      @keyframes rwDraw{from{stroke-dashoffset:180}to{stroke-dashoffset:0}}
      .rw-ripple{position:absolute;left:50%;top:50%;width:120px;height:120px;margin:-60px 0 0 -60px;pointer-events:none}
      .rw-ripple span{position:absolute;inset:0;border-radius:50%;border:2px solid var(--ecg);opacity:0}
      .app:not(.fx-reduced) .rw-ripple span{animation:rwRipple 1.3s cubic-bezier(.2,.6,.3,1) 2}
      .app:not(.fx-reduced) .rw-ripple span+span{animation-delay:.22s}
      @keyframes rwRipple{0%{transform:scale(.35);opacity:.65}100%{transform:scale(1.9);opacity:0}}
      .fb-head.rw-pop{transform-origin:left center}
      .app:not(.fx-reduced) .feedback.ok .fb-badge{animation:rwBeat .6s ease-out 1}
      @keyframes rwBeat{0%{transform:scale(1)}25%{transform:scale(1.22)}45%{transform:scale(.96)}65%{transform:scale(1.1)}100%{transform:scale(1)}}
      .stat-chip .rw-glyph{margin-right:3px}
      /* combo */
      .rw-combo{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--accent-ink);background:var(--card);border:1px solid var(--ok-line);border-radius:99px;padding:5px 12px 5px 8px;margin:0 0 8px}
      .app:not(.fx-reduced) .rw-combo{animation:rwRise .35s ease-out both}
      @keyframes rwRise{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
      /* moment sheet */
      .rw-moment-wrap{position:fixed;inset:0;z-index:80;display:grid;place-items:center;padding:20px}
      .rw-moment-overlay{position:absolute;inset:0;background:rgba(8,20,18,.55)}
      .rw-moment{position:relative;width:100%;max-width:360px;background:var(--card);border:1px solid var(--line);border-radius:20px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.28)}
      .app:not(.fx-reduced) .rw-moment{animation:rwIn .32s cubic-bezier(.2,.8,.2,1) both}
      @keyframes rwIn{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
      .rw-moment-hero{position:relative;background:var(--mon);display:flex;flex-direction:column;align-items:center;gap:6px;padding:26px 16px 10px;overflow:hidden}
      .rw-moment-hero .rw-beat{max-width:240px;opacity:.9}
      .rw-moment-num{display:flex;align-items:center;gap:8px;color:var(--ecg)}
      .rw-moment-num .mono{font-size:56px;font-weight:600;line-height:1;color:#EAF7F1}
      .rw-moment-shield{color:var(--ecg)}
      .rw-moment-body{padding:18px 20px 20px;text-align:center}
      .rw-moment-body .small{margin-bottom:10px}
      .rw-moment-next{color:var(--accent-ink)}
      .rw-moment-btn{width:100%;min-height:48px;margin-top:4px}
      /* shift */
      .rw-tasks{list-style:none;padding:0;margin:6px 0 10px;display:flex;flex-direction:column;gap:8px}
      .rw-task{display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}
      .rw-task.done{border-color:var(--ok-line);background:var(--ok-bg)}
      .rw-task-mark{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;flex:0 0 auto;color:var(--btn-ink)}
      .rw-task.done .rw-task-mark{background:var(--teal)}
      .rw-task-track{fill:none;stroke:var(--line);stroke-width:2.5}
      .rw-task-arc{fill:none;stroke:var(--teal);stroke-width:2.5;stroke-linecap:round}
      .rw-task-text{display:flex;flex-direction:column;gap:1px;min-width:0}
      .rw-task-text strong{font-size:14px;color:var(--ink)}
      .rw-task-detail{font-size:12.5px;color:var(--muted)}
      .rw-streakline{display:flex;flex-wrap:wrap;gap:6px}
      .rw-pill{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:var(--accent-ink);background:var(--chip-bg);border-radius:99px;padding:5px 10px}
      .rw-pill.caution{color:var(--lab-ink);background:var(--lab-bg)}
      /* career */
      .rw-career-head{display:flex;gap:14px;align-items:center;margin-bottom:10px}
      .rw-career-head .h2{margin-bottom:2px}
      .rw-career-head .small{margin:0}
      .rw-next-head{margin-bottom:4px}
      .rw-next-head .small{margin:0}
      .rw-reqs{list-style:none;padding:0;margin:10px 0 0;display:flex;flex-direction:column;gap:6px}
      .rw-reqs li{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted)}
      .rw-reqs li.met{color:var(--ink)}
      .rw-req-mark{width:18px;height:18px;border-radius:50%;border:1.5px solid var(--line);display:grid;place-items:center;flex:0 0 auto;color:var(--btn-ink)}
      .rw-reqs li.met .rw-req-mark{background:var(--teal);border-color:var(--teal)}
      .rw-req-have{margin-left:auto;font-size:12px;color:var(--accent-ink)}
      .rw-ladder{list-style:none;padding:0;margin:14px 0 4px;border-left:2px solid var(--line);margin-left:9px}
      .rw-ladder li{position:relative;display:flex;flex-wrap:wrap;align-items:baseline;column-gap:8px;row-gap:0;padding:6px 0 6px 18px;font-size:13.5px;color:var(--muted)}
      .rw-ladder li.held,.rw-ladder li.now{color:var(--ink)}
      .rw-ladder li.now .rw-ladder-name{font-weight:800}
      .rw-ladder-dot{position:absolute;left:-10px;top:8px;width:18px;height:18px;border-radius:50%;background:var(--card);border:2px solid var(--line);display:grid;place-items:center;color:var(--btn-ink)}
      .rw-ladder li.held .rw-ladder-dot,.rw-ladder li.now .rw-ladder-dot{background:var(--teal);border-color:var(--teal)}
      .rw-ladder li.now .rw-ladder-dot{box-shadow:0 0 0 4px var(--tab-on)}
      .rw-ladder-name{flex:1 1 auto;min-width:0}
      .rw-ladder-req{margin-left:auto;font-size:12px;color:var(--muted);text-align:right;white-space:nowrap}
      @media (max-width:560px){.rw-ladder-req{flex-basis:100%;margin-left:0;text-align:left}}
      /* badges */
      .rw-badge-grid{list-style:none;padding:0;margin:8px 0 0;display:grid;grid-template-columns:1fr;gap:8px}
      .rw-badge{display:flex;gap:12px;align-items:flex-start;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}
      .rw-badge.on{background:var(--card);border-color:var(--ok-line)}
      .rw-badge-text{display:flex;flex-direction:column;gap:1px;min-width:0}
      .rw-badge-text strong{font-size:14px}
      .rw-badge-tier{font-size:12px;font-weight:600;color:var(--accent-ink);letter-spacing:.04em}
      .rw-badge-meta,.rw-badge-next{font-size:12px;color:var(--muted);line-height:1.4}
      @media (min-width:700px){.rw-badge-grid{grid-template-columns:1fr 1fr}}
      /* rounds */
      .rw-week{list-style:none;padding:0;margin:8px 0 6px;display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
      .rw-day{display:flex;flex-direction:column;align-items:center;gap:4px}
      .rw-day-dot{width:30px;height:30px;border-radius:50%;border:2px solid var(--line);display:grid;place-items:center;color:var(--btn-ink)}
      .rw-day.shift .rw-day-dot{background:var(--teal);border-color:var(--teal)}
      .rw-day.studied .rw-day-dot{border-color:var(--teal)}
      .rw-day.cover .rw-day-dot{border-style:dashed;border-color:var(--lab-ink);color:var(--lab-ink)}
      .rw-day.future .rw-day-dot{opacity:.5}
      .rw-day.today .rw-day-dot{box-shadow:0 0 0 3px var(--tab-on)}
      .rw-day-lab{font-size:12px;color:var(--muted)}
      .rw-week-sum{margin:4px 0 0}
      /* bests */
      .rw-best-list{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:4px 0 0}
      .rw-best-list div{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px 12px}
      .rw-best-list dt{font-size:12px;color:var(--muted)}
      .rw-best-list dd{font-size:16px;font-weight:600;margin:2px 0 0;color:var(--ink)}
      /* recap */
      .rw-recap{padding:0;overflow:hidden}
      .rw-recap > :not(.rw-recap-hero){margin-left:18px;margin-right:18px}
      .rw-recap > .row{margin-bottom:18px}
      .rw-recap-hero{position:relative;background:var(--mon);color:#CFEADF;padding:16px 18px 6px;margin-bottom:14px;overflow:hidden}
      .rw-recap-eyebrow{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#8FD7C4;margin:0 0 8px}
      .rw-recap-main{display:flex;align-items:center;gap:16px}
      .rw-ring-track{fill:none;stroke:#24433C;stroke-width:7}
      .rw-ring-fill{fill:none;stroke:var(--ecg);stroke-width:7;stroke-linecap:round}
      .rw-ring-txt{font-family:'IBM Plex Mono',monospace;font-size:15px;font-weight:600;fill:#EAF7F1}
      .rw-recap-stats{display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;flex:1}
      .rw-recap-stats dt{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8FD7C4}
      .rw-recap-stats dd{font-size:18px;font-weight:600;color:#EAF7F1;margin:0}
      .rw-recap-hero .rw-beat{margin-top:6px;opacity:.85}
      .rw-improved ul{max-width:280px}
      .rw-best{display:inline-block;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--accent-ink);background:var(--ok-bg);border:1px solid var(--ok-line);border-radius:8px;padding:6px 10px;margin:0 0 8px}
      .rw-improved ul{list-style:none;padding:0;margin:0 0 8px}
      .rw-improved li{display:flex;justify-content:space-between;margin:0 0 4px}
      .rw-recap-shift{color:var(--accent-ink)}
      @media (prefers-reduced-motion: reduce){
        .rw-beat path,.rw-ripple span,.rw-combo,.rw-moment,.feedback.ok .fb-badge{animation:none !important}
        .rw-ripple{display:none}
      }
      .app.fx-reduced .rw-ripple{display:none}
      .menu-switch{display:flex;justify-content:space-between;align-items:center;gap:10px}
      .menu-state{font-size:12px;font-weight:600;color:var(--accent-ink);background:var(--chip-bg);border-radius:99px;padding:3px 9px}
      .rw-saved{border-color:var(--ok-line)}
      .guest-ai{border:1px dashed var(--line);border-radius:12px;padding:12px;margin:10px 0 4px;background:var(--surface)}
      .guest-ai .small{margin-bottom:8px}
    `}</style>
  );
}
