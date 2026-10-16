/* PulseRN Readiness Exams — ten standardized forms that clone the real
   NCLEX-RN experience: 85 items (3 six-step case studies + 67 standalone),
   official category weighting, one question at a time, no going back, no
   feedback until the end, and a proportional time limit. Scoring and the
   readiness verdict are deterministic plain code (rule 6). */
import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase.js";
import { ngnExt } from "./ngn.js";
import { EXAM_FORMS, EXAM_MINUTES, FULL_STANDALONE, FULL_CASES, verdictFor } from "./exam-core.js";
import Calculator from "./calculator.jsx";
import { ExhibitVisual } from "./exhibits.jsx";

/* The exam rules live in exam-core.js so api/exam.js (which builds, serves
   and grades every exam) and this screen share one definition. */
export { EXAM_FORMS, EXAM_MINUTES, FULL_STANDALONE, FULL_CASES, verdictFor, scoreItem } from "./exam-core.js";

/* Every exam read and write goes through /api/exam with the student's
   session token. Exam items are not readable from the browser (migration
   018): the server sends them without answers and grades the responses. */
async function examApi(action, extra = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) { const e = new Error("Sign in first"); e.status = 401; throw e; }
  const r = await fetch("/api/exam", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ action, ...extra }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(data.error || "The exam service is unavailable. Please try again.");
    e.status = r.status; e.code = data.code;
    throw e;
  }
  return data;
}

function answerText(q) {
  const ext = ngnExt(q);
  switch (q.type) {
    case "mc": return q.options[q.answer];
    case "sata": return q.answer.map((i) => q.options[i]).join(" · ");
    case "order": return q.answer.map((i) => q.options[i]).join(" → ");
    case "matrix": return ext.rows.map((r, i) => `${r} → ${ext.columns[q.answer[i]]}`).join("; ");
    case "bowtie": return `Actions: ${q.answer.actions.map((i) => ext.actions[i]).join("; ")} · Condition: ${ext.conditions[q.answer.condition]} · Parameters: ${q.answer.parameters.map((i) => ext.parameters[i]).join("; ")}`;
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
  const [stage, setStage] = useState("picker"); // picker | intro | running | submitting | results | review
  const [availability, setAvailability] = useState(null); // {form: {items, cases}}
  const [form, setForm] = useState(null);
  const [sequence, setSequence] = useState([]); // [{key, q (no answer), caseInfo?}]
  const [idx, setIdx] = useState(0);
  const [sel, setSel] = useState([]);
  const [order, setOrder] = useState([]);
  const [calcOpen, setCalcOpen] = useState(false);
  const [responses, setResponses] = useState([]); // {key, sel, order}, graded on the server
  const [outcomes, setOutcomes] = useState([]); // {q, ok, caseInfo} after grading
  const [pendingRecords, setPendingRecords] = useState([]);
  const [secondsLeft, setSecondsLeft] = useState(EXAM_MINUTES * 60);
  const [result, setResult] = useState(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [submitErr, setSubmitErr] = useState(null); // {message, final}
  const timerRef = useRef(null);
  const responsesRef = useRef(responses);
  responsesRef.current = responses;
  const secondsLeftRef = useRef(secondsLeft);
  secondsLeftRef.current = secondsLeft;
  const attemptRef = useRef({ attemptId: null, form: null, sequence: [] });
  const pendingSubmitRef = useRef(null);

  /* lockdown: tell the app shell when the exam is live so it hides every
     menu, tab, and reference — the calculator on calc items is the only
     tool, exactly like the real testing center. It holds while the final
     answers are being scored. */
  useEffect(() => {
    onRunning?.(stage === "running" || (stage === "submitting" && !submitErr));
    return () => onRunning?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, submitErr]);

  /* availability: how complete is each form's bank (counts only) */
  useEffect(() => {
    if (stage !== "picker") return;
    let live = true;
    (async () => {
      const a = {};
      for (const f of EXAM_FORMS) a[f] = { items: 0, cases: 0 };
      try {
        const data = await examApi("status");
        for (const f of EXAM_FORMS) if (data.availability?.[f]) a[f] = data.availability[f];
      } catch { /* shown as "not built yet", as before */ }
      if (live) setAvailability(a);
    })();
    return () => { live = false; };
  }, [stage === "picker"]);

  /* Ability/streak/XP updates, one per scored item. One per render, so each
     update starts from the ability the previous one produced. */
  useEffect(() => {
    if (!pendingRecords.length) return;
    const [first, ...rest] = pendingRecords;
    record(first.item, first.ok);
    setPendingRecords(rest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRecords]);

  const begin = async () => {
    setLoading(true);
    setErr("");
    // The server checks the plan and remaining credits, refuses a form this
    // account has already started, and writes the permanent attempt BEFORE
    // sending a single item: no account is ever shown the same exam twice,
    // even across devices or resets. Owner exception: development runs
    // don't write attempts at all.
    let data;
    try {
      data = await examApi("start", { form });
    } catch (e) {
      setLoading(false);
      setErr(e.message);
      setStage("picker");
      return;
    }
    setLoading(false);
    if (!isOwner && data.attemptId) onAttempt?.(form);
    const seq = Array.isArray(data.sequence) ? data.sequence : [];
    if (!seq.length) return;
    attemptRef.current = { attemptId: data.attemptId ?? null, form, sequence: seq };
    setSequence(seq);
    setResponses([]);
    setOutcomes([]);
    setResult(null);
    setSubmitErr(null);
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
        if (s <= 1) { clearInterval(timerRef.current); setTimeout(() => finish(responsesRef.current, true), 0); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  /* Send the answers for scoring. The server grades with the same
     deterministic scorers and only then returns each item's answer and
     rationale for the review screen. Retryable on a network failure. */
  const sendSubmit = async () => {
    const p = pendingSubmitRef.current;
    if (!p) return;
    setSubmitErr(null);
    const { attemptId, form: f, sequence: seq } = attemptRef.current;
    let data;
    try {
      data = await examApi("submit", {
        attemptId, form: f, keys: seq.map((e) => e.key),
        responses: p.responses, timedOut: p.timedOut,
      });
    } catch (e) {
      setSubmitErr({ message: e.message, final: e.code === "already-submitted" || e.status === 403 || e.status === 404 });
      return;
    }
    pendingSubmitRef.current = null;
    const position = new Map(seq.map((e, i) => [e.key, i]));
    const selByKey = new Map(p.responses.map((r) => [r.key, r.sel]));
    const graded = Array.isArray(data.graded) ? data.graded : [];
    const finalOutcomes = graded.map((g) => ({ q: g.q, ok: g.ok, sel: selByKey.get(g.key), caseInfo: g.caseInfo ?? null }));
    const byCat = {};
    for (const c of cats) byCat[c] = { n: 0, ok: 0 };
    for (const o of finalOutcomes) {
      if (!byCat[o.q.cat]) byCat[o.q.cat] = { n: 0, ok: 0 };
      byCat[o.q.cat].n++; if (o.ok) byCat[o.q.cat].ok++;
    }
    const res = { pct: data.pct, correct: data.correct, total: data.total, byCat, minutes: p.minutes, timedOut: p.timedOut, incomplete: !!data.incomplete, verdict: data.verdict ?? verdictFor(data.pct).tier, date: new Date().toISOString().slice(0, 10) };
    setOutcomes(finalOutcomes);
    // ability/streak/XP update; numeric bank ids only (case steps use x-ids)
    setPendingRecords(graded.map((g) => ({
      item: { id: typeof g.q.id === "number" ? g.q.id : 90000 + (position.get(g.key) ?? 0), cat: g.q.cat, diff: g.q.diff },
      ok: g.ok,
    })));
    setResult(res);
    setExamResults((m) => ({ ...m, [f]: { ...res, attempts: (m[f]?.attempts ?? 0) + 1 } }));
    setStage("results");
  };

  const finish = (finalResponses, timedOut = false) => {
    clearInterval(timerRef.current);
    const minutes = Math.round((EXAM_MINUTES * 60 - secondsLeftRef.current) / 60);
    pendingSubmitRef.current = { responses: finalResponses, timedOut, minutes };
    setCalcOpen(false); setConfirmEnd(false);
    setStage("submitting");
    sendSubmit();
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
    // No scoring in the browser: the answer key never reaches it. The
    // response is kept and graded on the server when the exam ends.
    const nextResponses = [...responses, { key: cur.key, sel: JSON.parse(JSON.stringify(sel)), order: [...order] }];
    setResponses(nextResponses);
    setCalcOpen(false); setConfirmEnd(false);
    if (idx + 1 >= sequence.length) { finish(nextResponses); return; }
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
          <p className="small">Ten standardized exams of <strong>85 questions each</strong>, the real NCLEX-RN's minimum length. Every form is 55 standalone questions plus 5 full case studies (6 questions each, 30 case-study questions in all), weighted to the official test plan, with a {Math.floor(EXAM_MINUTES / 60)}h{EXAM_MINUTES % 60}m clock, one question at a time, and no feedback until you finish. These questions never appear in Practice, so your score is an honest signal, and no account is ever shown the same exam twice.</p>
          {isOwner && <p className="small tip">🔧 Owner dev access: every exam is open, retakes allowed, nothing is burned.</p>}
          {err && <p className="small tip" role="alert">{err}</p>}
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
              {ready && <p className="small">85-question readiness exam · includes 5 case studies (30 questions)</p>}
              {past && <p className="small">Your result: <strong>{past.pct}%</strong> · {past.verdict} · {past.date}</p>}
              {done
                ? <p className="small tip">Completed. Exams are never repeated, so this score stays an honest signal.</p>
                : !ready
                  ? <p className="small tip">{!a ? "Checking availability…" : partial ? "Still being built. Check back soon." : "Not built yet. Forms are built one at a time."}</p>
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
        <h2 className="h2">Exam conditions, just like test day</h2>
        <ul className="checklist" style={{ fontSize: 14, color: "var(--ink)" }}>
          <li>85 questions: 55 standalone + 5 full case studies (6 questions each, 30 case-study questions in all).</li>
          <li>{Math.floor(EXAM_MINUTES / 60)} hours {EXAM_MINUTES % 60} minutes on the clock. It auto-submits at zero.</li>
          <li>One question at a time. You must answer to move on. <strong>No going back.</strong></li>
          <li>No rationales, no tutor, and no lab reference until you finish.</li>
          <li>The on-screen calculator is available on calculation items, and it's the ONLY tool. Menus, lab references, and the rest of the app lock until you finish, just like the real testing center.</li>
          <li>Plan to finish in one sitting. Leaving the exam loses your progress.</li>
        </ul>
        <div className="row">
          <button className="btn" onClick={begin} disabled={loading}>{loading ? "Preparing exam…" : "Begin exam"}</button>
          <button className="btn ghost" onClick={() => setStage("picker")}>Back</button>
        </div>
      </section>
    </div>
  );

  /* ================= SCORING ================= */
  if (stage === "submitting") return (
    <div className="stack">
      <section className="card">
        <p className="eyebrow">Readiness Exam {form}</p>
        {!submitErr
          ? <p className="small" role="status">Scoring your exam…</p>
          : <>
              <p className="small" role="alert">{submitErr.message}</p>
              <div className="row">
                {!submitErr.final && <button className="btn" onClick={sendSubmit}>Try again</button>}
                <button className="btn ghost" onClick={() => { pendingSubmitRef.current = null; setStage("picker"); }}>Back to exams</button>
              </div>
            </>}
      </section>
    </div>
  );

  /* ================= RESULTS ================= */
  if (stage === "results" && result) {
    const v = verdictFor(result.pct);
    return (
      <div className="stack">
        <section className="card">
          <p className="eyebrow">Readiness Exam {form} · complete{result.timedOut ? " (time expired)" : result.incomplete ? " (ended early)" : ""}</p>
          <h2 className="h2">{result.pct}% · {result.correct}/{result.total} correct</h2>
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
        <ExhibitVisual spec={ext.visual} />
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
            : <>Score only what you've answered so far? <button className="auth-switch" onClick={() => finish(responses)}>Yes, end & score</button> · <button className="auth-switch" onClick={() => setConfirmEnd(false)}>Keep going</button></>}
        </p>
      </section>
    </div>
  );
}
