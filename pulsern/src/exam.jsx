/* PulseRN Readiness Exams — ten standardized forms that clone the real
   NCLEX-RN experience: 85 items (3 six-step case studies + 67 standalone),
   official category weighting, one question at a time, no going back, no
   feedback until the end, and a proportional time limit. Scoring and the
   readiness verdict are deterministic plain code (rule 6). */
import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "./supabase.js";
import { ngnExt, scoreMatrix, scoreBowtie, scoreCloze, scoreCalc, scoreHighlight } from "./ngn.js";
import Calculator from "./calculator.jsx";

export const EXAM_FORMS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const EXAM_MINUTES = 170; // 5h/150 items on the real exam → 85 items ≈ 2h50m
const FULL_STANDALONE = 67, FULL_CASES = 3;

/* ---- deterministic verdict tiers (self-assessment estimate) ---- */
export function verdictFor(pct) {
  if (pct >= 68) return { tier: "HIGH", label: "High readiness — performing above the passing standard", cls: "ok" };
  if (pct >= 55) return { tier: "BORDERLINE", label: "Borderline — near the passing standard; focus your weak categories", cls: "warn" };
  return { tier: "BELOW", label: "Below the passing standard — build fundamentals before test day", cls: "no" };
}

/* score one item, all-or-nothing, same scorers as Practice */
export function scoreItem(q, sel, order) {
  const ext = ngnExt(q);
  switch (q.type) {
    case "mc": return sel[0] === q.answer;
    case "sata": return Array.isArray(sel) && sel.length === q.answer.length && [...sel].sort((a, b) => a - b).every((v, i) => v === [...q.answer].sort((a, b) => a - b)[i]);
    case "order": return Array.isArray(order) && order.length === q.answer.length && order.every((v, i) => v === q.answer[i]);
    case "matrix": return scoreMatrix(sel, q.answer);
    case "bowtie": return scoreBowtie(sel, q.answer);
    case "cloze": return scoreCloze(sel, q.answer);
    case "calc": return scoreCalc(sel, q.answer, ext.tolerance ?? 0);
    case "highlight": return scoreHighlight(sel, q.answer);
    default: return false;
  }
}

function answerText(q) {
  const ext = ngnExt(q);
  switch (q.type) {
    case "mc": return q.options[q.answer];
    case "sata": return q.answer.map((i) => q.options[i]).join(" · ");
    case "order": return q.answer.map((i) => q.options[i]).join(" → ");
    case "matrix": return ext.rows.map((r, i) => `${r} → ${ext.columns[q.answer[i]]}`).join("; ");
    case "bowtie": return `Actions: ${q.answer.actions.map((i) => ext.actions[i]).join("; ")} — Condition: ${ext.conditions[q.answer.condition]} — Parameters: ${q.answer.parameters.map((i) => ext.parameters[i]).join("; ")}`;
    case "cloze": return q.answer.map((a, i) => ext.dropdowns[i][a]).join(" · ");
    case "calc": return `${q.answer} ${ext.unit ?? ""}`;
    case "highlight": return q.answer.map((i) => ext.tokens[i]).join(" · ");
    default: return "";
  }
}

const initialSel = (q) => (q.type === "bowtie" ? { actions: [], condition: null, parameters: [] } : q.type === "calc" ? "" : []);

const fmtClock = (secs) => {
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

export default function ExamCenter({ record, examResults, setExamResults, cats, ent = null, isOwner = false, onRunning, onAttempt, onUpgrade }) {
  const [stage, setStage] = useState("picker"); // picker | intro | running | results | review
  const [availability, setAvailability] = useState(null); // {form: {items, cases}}
  const [form, setForm] = useState(null);
  const [sequence, setSequence] = useState([]); // [{q, caseInfo?}]
  const [idx, setIdx] = useState(0);
  const [sel, setSel] = useState([]);
  const [order, setOrder] = useState([]);
  const [calcOpen, setCalcOpen] = useState(false);
  const [outcomes, setOutcomes] = useState([]); // {q, ok, caseInfo}
  const [secondsLeft, setSecondsLeft] = useState(EXAM_MINUTES * 60);
  const [result, setResult] = useState(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);
  const outcomesRef = useRef(outcomes);
  outcomesRef.current = outcomes;

  /* lockdown: tell the app shell when the exam is live so it hides every
     menu, tab, and reference — the calculator on calc items is the only
     tool, exactly like the real testing center */
  useEffect(() => {
    onRunning?.(stage === "running");
    return () => onRunning?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  /* availability: how complete is each form's bank */
  useEffect(() => {
    (async () => {
      const [{ data: qs }, { data: cs }] = await Promise.all([
        supabase.from("questions").select("exam_form").not("exam_form", "is", null).eq("approved", true),
        supabase.from("case_studies").select("exam_form").not("exam_form", "is", null).eq("approved", true),
      ]);
      const a = {};
      for (const f of EXAM_FORMS) a[f] = { items: 0, cases: 0 };
      for (const r of qs ?? []) if (a[r.exam_form]) a[r.exam_form].items++;
      for (const r of cs ?? []) if (a[r.exam_form]) a[r.exam_form].cases++;
      setAvailability(a);
    })();
  }, [stage === "picker"]);

  const begin = async () => {
    setLoading(true);
    // Consume the attempt FIRST. The primary key on (user, form) plus the
    // no-update/no-delete policies make this permanent: no account is ever
    // shown the same exam twice, even across devices or resets.
    // Owner exception: development runs don't write attempts at all.
    if (!isOwner) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { setLoading(false); return; }
      const { error: attemptErr } = await supabase.from("exam_attempts").insert({ user_id: session.user.id, form });
      if (attemptErr) { setLoading(false); setStage("picker"); return; }
      onAttempt?.(form);
    }
    const [{ data: items }, { data: cases }] = await Promise.all([
      supabase.from("questions")
        .select("id, cat, diff, type, stem, options, extra, answer, rationale")
        .eq("approved", true).eq("exam_form", form),
      supabase.from("case_studies")
        .select("id, cat, title, intro, vitals, labs, note, steps")
        .eq("approved", true).eq("exam_form", form),
    ]);
    setLoading(false);
    if (!items?.length) return;
    // deterministic-enough shuffle for a fresh order each attempt
    const standalone = [...items].sort(() => Math.random() - 0.5).map((q) => ({ q }));
    const seq = [...standalone];
    // insert case blocks at roughly 1/4, 1/2, 3/4 of the exam, like the real thing
    (cases ?? []).slice(0, FULL_CASES).forEach((c, ci) => {
      const at = Math.min(seq.length, Math.floor(((ci + 1) / 4) * (seq.length + c.steps.length * (ci + 1))));
      const steps = c.steps.map((s, si) => ({
        q: { ...s, id: `x${c.id}-${si}`, cat: c.cat, diff: 3 },
        caseInfo: { title: c.title, intro: c.intro, vitals: c.vitals, labs: c.labs, note: c.note, step: si + 1, of: c.steps.length },
      }));
      seq.splice(at, 0, ...steps);
    });
    setSequence(seq);
    setOutcomes([]);
    setIdx(0);
    setSel(initialSel(seq[0].q));
    setOrder([]);
    setSecondsLeft(EXAM_MINUTES * 60);
    setStage("running");
  };

  /* countdown */
  useEffect(() => {
    if (stage !== "running") { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { clearInterval(timerRef.current); finish(outcomesRef.current, true); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  const finish = (finalOutcomes, timedOut = false) => {
    const total = finalOutcomes.length;
    const correct = finalOutcomes.filter((o) => o.ok).length;
    const pct = total ? Math.round((correct / total) * 100) : 0;
    const byCat = {};
    for (const c of cats) byCat[c] = { n: 0, ok: 0 };
    for (const o of finalOutcomes) {
      if (!byCat[o.q.cat]) byCat[o.q.cat] = { n: 0, ok: 0 };
      byCat[o.q.cat].n++; if (o.ok) byCat[o.q.cat].ok++;
    }
    const minutes = Math.round((EXAM_MINUTES * 60 - secondsLeft) / 60);
    const v = verdictFor(pct);
    const res = { pct, correct, total, byCat, minutes, timedOut, incomplete: total < sequence.length, verdict: v.tier, date: new Date().toISOString().slice(0, 10) };
    setResult(res);
    setExamResults((m) => ({ ...m, [form]: { ...res, attempts: (m[form]?.attempts ?? 0) + 1 } }));
    setStage("results");
  };

  const cur = sequence[idx];
  const q = cur?.q;
  const ext = q ? ngnExt(q) : {};

  const canSubmit = !q ? false :
    q.type === "order" ? order.length === q.options.length :
    q.type === "matrix" ? ext.rows.every((_, i) => Number.isInteger(sel[i])) :
    q.type === "bowtie" ? (sel.actions?.length === 2 && Number.isInteger(sel.condition) && sel.parameters?.length === 2) :
    q.type === "cloze" ? ext.dropdowns.every((_, i) => Number.isInteger(sel[i])) :
    q.type === "calc" ? Number.isFinite(parseFloat(String(sel).replace(/,/g, "").trim())) :
    sel.length > 0;

  const submit = () => {
    const ok = scoreItem(q, sel, order);
    // ability/streak/XP update; numeric bank ids only (case steps use x-ids)
    record({ id: typeof q.id === "number" ? q.id : 90000 + idx, cat: q.cat, diff: q.diff }, ok);
    const nextOutcomes = [...outcomes, { q, ok, sel: JSON.parse(JSON.stringify(sel)), caseInfo: cur.caseInfo ?? null }];
    setOutcomes(nextOutcomes);
    setCalcOpen(false); setConfirmEnd(false);
    if (idx + 1 >= sequence.length) { finish(nextOutcomes); return; }
    setIdx(idx + 1);
    setSel(initialSel(sequence[idx + 1].q));
    setOrder([]);
  };

  const toggleSel = (i) => {
    if (q.type === "mc") setSel([i]);
    else setSel((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]));
  };

  /* ================= PICKER ================= */
  if (stage === "picker") {
    const attempted = new Set(ent?.attempted ?? []);
    const trial = ent?.status === "trial";
    const examsLeft = ent?.examsLeft ?? 0;
    return (
      <div className="stack">
        <section className="card">
          <p className="eyebrow">Readiness self-assessment</p>
          <h2 className="h2">NCLEX-style exams</h2>
          <p className="small">Ten standardized exams of <strong>85 questions each</strong> — the real NCLEX-RN's minimum length. Every form is 67 standalone questions plus 3 full case studies (6 questions each, 18 total) weighted to the official test plan, with a {Math.floor(EXAM_MINUTES / 60)}h{EXAM_MINUTES % 60}m clock, one question at a time, and no feedback until you finish. These questions never appear in Practice, so your score is an honest signal — and no account is ever shown the same exam twice.</p>
          {isOwner && <p className="small tip">🔧 Owner dev access: every exam is open, retakes allowed, nothing is burned.</p>}
          {ent && !isOwner && !trial && <p className="small tip">You have <strong>{examsLeft}</strong> self-assessment{examsLeft === 1 ? "" : "s"} remaining.{examsLeft === 0 && onUpgrade ? <> Add one for $45 from <button className="auth-switch" onClick={onUpgrade}>Plans & upgrades</button>.</> : null}</p>}
        </section>
        {trial && !isOwner && (
          <section className="card">
            <p className="eyebrow">Included with any subscription</p>
            <p className="small">The free pass opens every study tool; readiness exams come with a subscription so each one stays an honest, never-repeated measure.</p>
            {onUpgrade && <button className="btn" onClick={onUpgrade}>See plans →</button>}
          </section>
        )}
        {EXAM_FORMS.map((f) => {
          const a = availability?.[f];
          const ready = a && a.items >= FULL_STANDALONE && a.cases >= FULL_CASES;
          const partial = a && !ready && (a.items > 0 || a.cases > 0);
          const qReady = a ? Math.min(a.items, FULL_STANDALONE) + Math.min(a.cases, FULL_CASES) * 6 : 0;
          const past = examResults?.[f];
          const done = !isOwner && (attempted.has(f) || !!past); // an exam is one-shot, forever (owner excepted)
          return (
            <section key={f} className="card">
              <div className="cat-top">
                <span className="small"><strong>Readiness Exam {f}</strong></span>
                <span className="small mono">{a ? `${qReady}/85 questions` : "…"}</span>
              </div>
              {ready && <p className="small">Full-length 85-question exam · includes 3 case studies</p>}
              {past && <p className="small">Your result: <strong>{past.pct}%</strong> · {past.verdict} · {past.date}</p>}
              {done
                ? <p className="small tip">Completed — exams are never repeated, so this score stays an honest signal.</p>
                : !ready
                  ? <p className="small tip">{partial ? "Still being built by the exam factory — check back soon." : "Not built yet — the factory generates one form at a time."}</p>
                  : isOwner
                    ? <button className="btn" onClick={() => { setForm(f); setStage("intro"); }}>Start exam (owner) →</button>
                    : !ent
                      ? <p className="small tip">Checking your plan…</p>
                      : trial
                        ? <p className="small tip">🔒 Unlocks with a subscription.</p>
                        : examsLeft <= 0
                          ? <p className="small tip">🔒 No self-assessments remaining on your plan.</p>
                          : <button className="btn" onClick={() => { setForm(f); setStage("intro"); }}>Start exam →</button>}
            </section>
          );
        })}
      </div>
    );
  }

  /* ================= INTRO ================= */
  if (stage === "intro") return (
    <div className="stack">
      <section className="card">
        <p className="eyebrow">Readiness Exam {form}</p>
        <h2 className="h2">Exam conditions — just like test day</h2>
        <ul className="checklist" style={{ fontSize: 14, color: "var(--ink)" }}>
          <li>• 85 items: 67 standalone questions + 3 full case studies (6 steps each)</li>
          <li>• {Math.floor(EXAM_MINUTES / 60)} hours {EXAM_MINUTES % 60} minutes on the clock — it auto-submits at zero</li>
          <li>• One question at a time. You must answer to move on. <strong>No going back.</strong></li>
          <li>• No rationales, no tutor, no lab reference until you finish</li>
          <li>• The on-screen calculator is available on calculation items — it's the ONLY tool: menus, lab references, and the rest of the app lock until you finish, just like the real testing center</li>
          <li>• Plan to finish in one sitting — leaving the exam loses your progress</li>
        </ul>
        <div className="row">
          <button className="btn" onClick={begin} disabled={loading}>{loading ? "Preparing exam…" : "Begin exam"}</button>
          <button className="btn ghost" onClick={() => setStage("picker")}>Back</button>
        </div>
      </section>
    </div>
  );

  /* ================= RESULTS ================= */
  if (stage === "results" && result) {
    const v = verdictFor(result.pct);
    return (
      <div className="stack">
        <section className="card">
          <p className="eyebrow">Readiness Exam {form} · complete{result.timedOut ? " (time expired)" : ""}{result.incomplete ? " (ended early)" : ""}</p>
          <h2 className="h2">{result.pct}% — {result.correct}/{result.total} correct</h2>
          <p className={"small"} style={{ fontWeight: 700, color: v.cls === "ok" ? "var(--accent-ink)" : v.cls === "warn" ? "#9a6a12" : "var(--coral)" }}>{v.label}</p>
          <p className="small">Time used: {Math.floor(result.minutes / 60)}h{String(result.minutes % 60).padStart(2, "0")}m · Self-assessment estimate, not a guarantee of NCLEX results.</p>
        </section>
        <section className="card">
          <p className="eyebrow">By client-needs category</p>
          {Object.entries(result.byCat).filter(([, s]) => s.n > 0).map(([c, s]) => {
            const p = Math.round((s.ok / s.n) * 100);
            return (
              <div key={c} className="cat-row">
                <div className="cat-top"><span className="small">{c}</span><span className="small mono">{p}% · {s.ok}/{s.n}</span></div>
                <div className="bar"><div className={"bar-fill" + (p < 60 ? " low" : "")} style={{ width: `${p}%` }} /></div>
              </div>
            );
          })}
        </section>
        <div className="row">
          <button className="btn" onClick={() => setStage("review")}>Review missed questions ({result.total - result.correct})</button>
          <button className="btn ghost" onClick={() => setStage("picker")}>Back to exams</button>
        </div>
      </div>
    );
  }

  /* ================= REVIEW ================= */
  if (stage === "review") return (
    <div className="stack">
      <section className="card">
        <p className="eyebrow">Readiness Exam {form} · review</p>
        <p className="small">Every missed item with its correct answer and rationale. These stay out of your Practice pool.</p>
        <button className="btn ghost" onClick={() => setStage("results")}>← Back to score</button>
      </section>
      {outcomes.filter((o) => !o.ok).map((o, i) => (
        <section key={i} className="card">
          <p className="small mono">{o.q.cat.toUpperCase()} · {o.q.type.toUpperCase()}{o.caseInfo ? ` · CASE: ${o.caseInfo.title}` : ""}</p>
          <p className="stem" style={{ fontSize: 15 }}>{o.q.stem}</p>
          <p className="small"><strong>Correct answer:</strong> {answerText(o.q)}</p>
          <p className="rationale"><strong>Rationale.</strong> {o.q.rationale}</p>
        </section>
      ))}
    </div>
  );

  /* ================= RUNNING ================= */
  if (!q) return null;
  return (
    <div className="stack">
      <section className="card exam-head-card">
        <div className="q-meta mono">
          <span>ITEM {idx + 1} OF {sequence.length}</span>
          <span className={secondsLeft < 600 ? "exam-clock low" : "exam-clock"}>⏱ {fmtClock(secondsLeft)}</span>
        </div>
      </section>

      {cur.caseInfo && (
        <section className="card">
          <p className="eyebrow">Case study · {cur.caseInfo.title} · step {cur.caseInfo.step} of {cur.caseInfo.of}</p>
          <details open={cur.caseInfo.step === 1}>
            <summary className="small mono" style={{ cursor: "pointer" }}>📋 CLIENT CHART</summary>
            <p className="small" style={{ marginTop: 6 }}>{cur.caseInfo.intro}</p>
            <div className="chart mono">
              {cur.caseInfo.vitals.map(([k, v2]) => <span key={k} className="chip">{k} {v2}</span>)}
              {cur.caseInfo.labs.map(([k, v2]) => <span key={k} className="chip lab">{k} {v2}</span>)}
            </div>
            <p className="small note">Nurse's note: {cur.caseInfo.note}</p>
          </details>
        </section>
      )}

      <section className="card">
        {Array.isArray(ext.exhibit) && ext.exhibit.length > 0 && (
          <div className="exhibit">
            {ext.exhibit.map((tab, i) => (
              <details key={i} className="exhibit-tab" open={i === 0}>
                <summary className="mono">📋 {tab.label}</summary>
                <p className="small exhibit-body">{tab.content}</p>
              </details>
            ))}
          </div>
        )}

        {q.type === "cloze" ? (
          <p className="stem">
            {q.stem.split(/\{(\d+)\}/).map((part, i2) => {
              if (i2 % 2 === 0) return <span key={i2}>{part}</span>;
              const gap = Number(part);
              return (
                <select key={i2} className="cloze-dd" value={Number.isInteger(sel[gap]) ? sel[gap] : ""}
                  onChange={(e) => setSel((s) => { const n = [...s]; n[gap] = Number(e.target.value); return n; })}>
                  <option value="" disabled>Select…</option>
                  {ext.dropdowns[gap].map((o, oi) => <option key={oi} value={oi}>{o}</option>)}
                </select>
              );
            })}
          </p>
        ) : (
          <p className="stem">{q.stem}</p>
        )}

        {q.type === "highlight" && (
          <div className="hl-box">
            {ext.tokens.map((t, i) => (
              <button key={i} className={sel.includes(i) ? "hl-token picked" : "hl-token"} onClick={() => toggleSel(i)}>{t}</button>
            ))}
          </div>
        )}

        {q.type === "matrix" && (
          <div className="ngn-matrix" role="table">
            <div className="mx-row mx-head" style={{ gridTemplateColumns: `2fr repeat(${ext.columns.length}, 1fr)` }}>
              <span />{ext.columns.map((c, ci) => <span key={ci} className="small mono mx-colhead">{c}</span>)}
            </div>
            {ext.rows.map((r, ri) => (
              <div key={ri} className="mx-row" style={{ gridTemplateColumns: `2fr repeat(${ext.columns.length}, 1fr)` }}>
                <span className="small">{r}</span>
                {ext.columns.map((c, ci) => (
                  <button key={ci} className={sel[ri] === ci ? "mx-cell picked" : "mx-cell"}
                    onClick={() => setSel((s) => { const n = [...s]; n[ri] = ci; return n; })}>{sel[ri] === ci ? "●" : "○"}</button>
                ))}
              </div>
            ))}
          </div>
        )}

        {q.type === "bowtie" && (
          <div className="bt-cols">
            {[
              { slot: "actions", label: "Actions to take · pick 2", items: ext.actions, cap: 2, picked: sel.actions ?? [] },
              { slot: "condition", label: "Condition · pick 1", items: ext.conditions, cap: 1, picked: Number.isInteger(sel.condition) ? [sel.condition] : [] },
              { slot: "parameters", label: "Parameters to monitor · pick 2", items: ext.parameters, cap: 2, picked: sel.parameters ?? [] },
            ].map((col) => (
              <div key={col.slot} className="bt-col">
                <p className="small mono bt-label">{col.label.toUpperCase()}</p>
                {col.items.map((it, i) => (
                  <button key={i} className={col.picked.includes(i) ? "opt bt-opt picked" : "opt bt-opt"}
                    onClick={() => setSel((s) => {
                      if (col.slot === "condition") return { ...s, condition: s.condition === i ? null : i };
                      const curArr = s[col.slot] ?? [];
                      if (curArr.includes(i)) return { ...s, [col.slot]: curArr.filter((x) => x !== i) };
                      if (curArr.length >= col.cap) return s;
                      return { ...s, [col.slot]: [...curArr, i] };
                    })}>{it}</button>
                ))}
              </div>
            ))}
          </div>
        )}

        {q.type === "calc" && (
          <>
            <div className="calc-box row" style={{ alignItems: "center" }}>
              <input className="select calc-input" type="text" inputMode="decimal" autoComplete="off"
                placeholder="Enter the number" value={typeof sel === "string" ? sel : ""}
                onChange={(e) => setSel(e.target.value)} />
              <span className="mono calc-unit">{ext.unit}</span>
            </div>
            <button className="btn ghost tutor-btn" onClick={() => setCalcOpen((o) => !o)}>{calcOpen ? "Hide calculator" : "🧮 Open calculator"}</button>
            {calcOpen && <Calculator onUse={(v2) => setSel(v2)} />}
          </>
        )}

        {["mc", "sata", "order"].includes(q.type) && (
          <div className="opts">
            {q.options.map((opt, i) => {
              if (q.type !== "order") {
                return (
                  <button key={i} className={sel.includes(i) ? "opt picked" : "opt"} onClick={() => toggleSel(i)}>
                    {q.type === "sata" ? (sel.includes(i) ? "☑ " : "☐ ") : ""}{opt}
                  </button>
                );
              }
              const pos = order.indexOf(i);
              return (
                <button key={i} className={pos !== -1 ? "opt picked" : "opt"}
                  onClick={() => setOrder((o) => (o.includes(i) ? o.filter((x) => x !== i) : [...o, i]))}>
                  {pos !== -1 ? <span className="ord mono">{pos + 1}</span> : <span className="ord mono dim">·</span>}{opt}
                </button>
              );
            })}
          </div>
        )}

        <div className="row">
          <button className="btn" disabled={!canSubmit} onClick={submit}>{idx + 1 >= sequence.length ? "Submit final answer" : "Next →"}</button>
        </div>
        <p className="small tip">
          {!confirmEnd
            ? <button className="auth-switch" style={{ color: "var(--muted)" }} onClick={() => setConfirmEnd(true)}>End exam early…</button>
            : <>Score only what you've answered so far? <button className="auth-switch" onClick={() => finish(outcomes)}>Yes, end & score</button> · <button className="auth-switch" onClick={() => setConfirmEnd(false)}>Keep going</button></>}
        </p>
      </section>
    </div>
  );
}
