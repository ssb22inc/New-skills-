import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, RotateCcw, Zap, ShieldAlert, Database, Globe, Lock, CheckCircle2, XCircle, AlertTriangle, ChevronRight, Skull, Trophy, FlaskConical, Ban, Eye, FileSearch, Scale, Wallet, ArrowDown, Flame, Sparkles, Award, BookOpen } from "lucide-react";

/* ---------- design tokens (from the source slides) ---------- */
const C = {
  bg: "#141519", panel: "#1e2025", line: "#33363d",
  navy: "#273a53", purple: "#43345c", green: "#2d4a38", maroon: "#4d2c31",
  gold: "#4d4023", goldHi: "#d9b45b", cream: "#f2ead9", dim: "#a8a294",
  red: "#c96a5e", win: "#7fb586", blue: "#7ea6d9", vio: "#b39ddb",
};
const font = "'Nunito', system-ui, sans-serif";
const mono = "'JetBrains Mono', ui-monospace, monospace";

const Css = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;800;900&family=JetBrains+Mono:wght@400;600&display=swap');
    * { -webkit-tap-highlight-color: transparent; }
    ::-webkit-scrollbar{width:0;height:0}
    @keyframes pulseDot { 0%{top:0;opacity:0} 8%{opacity:1} 92%{opacity:1} 100%{top:100%;opacity:0} }
    @keyframes popIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }
    .pop { animation: popIn .35s ease both }
    @media (prefers-reduced-motion: reduce){ .pulse-dot{display:none} .pop{animation:none} }
    button:focus-visible{outline:2px solid ${C.goldHi};outline-offset:2px;border-radius:8px}
  `}</style>
);

/* ---------- shared bits ---------- */
const SlideTitle = ({ children }) => (
  <div className="inline-block px-3 py-1.5 mb-3 rounded-lg font-black tracking-wide text-sm"
    style={{ border: `1.5px solid ${C.goldHi}`, color: C.cream, background: "#211d12", fontFamily: font }}>
    {children}
  </div>
);
const Banner = ({ children }) => (
  <div className="rounded-xl px-3 py-2.5 text-center text-[13px] font-extrabold my-3"
    style={{ background: C.gold, color: C.cream, border: `1px solid #6b5a30` }}>{children}</div>
);
const Card = ({ bg = C.panel, children, className = "", onClick, style }) => (
  <div onClick={onClick} className={`rounded-xl p-3 ${className}`} style={{ background: bg, border: `1px solid ${C.line}`, ...style }}>{children}</div>
);
const Tag = ({ children, bg = "#2a2c31", color = C.dim }) => (
  <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide" style={{ background: bg, color }}>{children}</span>
);

/* =====================================================
   TAB 1 — FLOW : URL in, marketing out (demo client)
   ===================================================== */
function FlowTab() {
  const [step, setStep] = useState(0);
  const [broken, setBroken] = useState(false);
  const [checks, setChecks] = useState([]);
  const [conn, setConn] = useState({});
  const [approved, setApproved] = useState(false);
  const [synth, setSynth] = useState(0);

  const steps = ["Ingest", "Understand", "Pre-flight", "Connect", "Research", "Build", "Launch", "Run"];

  useEffect(() => { // pre-flight checks animate
    if (step !== 2) return;
    setChecks([]);
    const list = [
      { t: "Claims vs. 1,283 reviews", ok: true },
      { t: "Meta policy scan — skincare vertical", ok: true },
      { t: "Checkout probe (test purchase)", ok: !broken },
      { t: "Legal pages (privacy, terms, refunds)", ok: true },
    ];
    list.forEach((c, i) => setTimeout(() => setChecks(p => [...p, c]), 450 * (i + 1)));
  }, [step, broken]);

  useEffect(() => { // synthetic purchase gate
    if (step !== 5) return;
    setSynth(0);
    [1, 2, 3].forEach(n => setTimeout(() => setSynth(n), 600 * n));
  }, [step]);

  const rejected = step === 2 && checks.length === 4 && checks.some(c => !c.ok);
  const allConn = ["Facebook", "Stripe", "GA4", "Email"].every(k => conn[k]);
  const canNext = step === 2 ? (checks.length === 4 && !rejected) : step === 3 ? allConn : step === 6 ? approved : true;

  const positionings = ["Anti-greasy", "Reef guilt", "Dermatologist dad", "Chemical vs mineral", "Kids won't cry", "Beach-bag test (UGC)", "SPF myths podcast", "Competitor callout", "Founder story", "Sweat-proof proof", "Sunday reset", "Tan-through fear"];

  return (
    <div className="pop">
      <SlideTitle>URL IN → MARKETING OUT</SlideTitle>
      <div className="flex gap-1 mb-3 flex-wrap">
        {steps.map((s, i) => (
          <span key={s} className="text-[10px] font-extrabold px-1.5 py-0.5 rounded"
            style={{ background: i === step ? C.goldHi : i < step ? C.green : "#26282d", color: i === step ? "#211d12" : i < step ? C.cream : C.dim }}>{i + 1} {s}</span>
        ))}
      </div>

      {step === 0 && <Card bg={C.navy}>
        <div className="text-xs font-bold mb-2" style={{ color: C.blue }}>THE ONLY INPUT</div>
        <div className="rounded-lg px-3 py-2 text-sm font-bold mb-3" style={{ background: "#161a21", color: C.cream, fontFamily: mono }}>https://coralcove.shop</div>
        <div className="text-[13px] space-y-1" style={{ color: C.cream }}>
          <div>Browser Run crawls the whole site…</div>
          <div className="pop">• Stack detected: <b>Shopify + Stripe + GA4</b></div>
          <div className="pop">• 42 products · reef-safe sunscreen · AOV signals ~$64</div>
          <div className="pop">• 1,283 reviews scraped · session recording stored as evidence</div>
        </div>
      </Card>}

      {step === 1 && <Card bg={C.purple}>
        <div className="text-xs font-bold mb-2" style={{ color: C.vio }}>THE ENGINE WRITES THE BRIEF — NO QUESTIONNAIRE</div>
        <div className="text-[13px] space-y-1.5" style={{ color: C.cream }}>
          <div><b>Sells:</b> mineral reef-safe sunscreen, $22–$68</div>
          <div><b>To:</b> beach families + divers, US coastal states</div>
          <div><b>Funnel today:</b> IG organic → PDP → 1.9% conv</div>
          <div><b>Review signal:</b> loved for "no white cast", complaints about pump clogging</div>
        </div>
        <div className="mt-3 rounded-lg py-2 text-center text-sm font-extrabold" style={{ background: C.win, color: "#16281c" }}>Client confirms — one tap ✓</div>
      </Card>}

      {step === 2 && <Card bg={C.maroon}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-bold" style={{ color: "#e0a49b" }}>PRE-FLIGHT ADVERSARY — BEFORE A DOLLAR MOVES</div>
          <button onClick={() => setBroken(b => !b)} className="text-[10px] font-bold px-2 py-1 rounded-md" style={{ background: broken ? C.red : "#3a2a2d", color: C.cream }}>{broken ? "checkout: BROKEN" : "simulate broken checkout"}</button>
        </div>
        {checks.map((c, i) => (
          <div key={i} className="flex items-center gap-2 text-[13px] py-1 pop" style={{ color: C.cream }}>
            {c.ok ? <CheckCircle2 size={15} color={C.win} /> : <XCircle size={15} color="#ff8f80" />} {c.t}
          </div>
        ))}
        {rejected && <div className="mt-2 rounded-lg p-2.5 text-[13px] font-bold pop" style={{ background: "#5d2a24", color: C.cream }}>
          CLIENT REJECTED — "Fix your checkout before advertising." Rejection is a trust feature, and this audit is the sales weapon.
        </div>}
        {checks.length === 4 && !rejected && <Banner>Cleared for money. This gate is our underwriting — it's why we can guarantee CAC.</Banner>}
      </Card>}

      {step === 3 && <Card bg={C.navy}>
        <div className="text-xs font-bold mb-2" style={{ color: C.blue }}>SCREEN 1 OF 4 — THE ONE IRREDUCIBLE HUMAN STEP</div>
        <div className="grid grid-cols-2 gap-2">
          {["Facebook", "Stripe", "GA4", "Email"].map(k => (
            <button key={k} onClick={() => setConn(p => ({ ...p, [k]: true }))} className="rounded-lg py-2.5 text-sm font-extrabold"
              style={{ background: conn[k] ? C.green : "#1a2536", color: C.cream, border: `1px solid ${conn[k] ? C.win : "#33475f"}` }}>
              {conn[k] ? "✓ " : ""}{k}
            </button>
          ))}
        </div>
        {allConn && <div className="mt-3 text-[13px] pop" style={{ color: C.cream }}>
          Claude Code provisions Airbyte connectors → warehouse fills → <b>baseline computed from Stripe history:</b>
          <div className="flex gap-2 mt-2">
            {[["CAC", "$38.20"], ["AOV", "$64"], ["LTV", "$142"]].map(([k, v]) => (
              <div key={k} className="flex-1 rounded-lg p-2 text-center" style={{ background: "#161a21" }}>
                <div className="text-[10px] font-bold" style={{ color: C.dim }}>{k}</div>
                <div className="font-black" style={{ color: C.goldHi, fontFamily: mono }}>{v}</div>
              </div>))}
          </div>
          <div className="text-[11px] mt-1.5" style={{ color: C.dim }}>Every future lift claim is measured against this — provable, not vibes.</div>
        </div>}
      </Card>}

      {step === 4 && <Card bg={C.green}>
        <div className="text-xs font-bold mb-2" style={{ color: "#9ecfa8" }}>PAIN-MINING + COMPETITOR ADS LIBRARY → 12 POSITIONINGS</div>
        <div className="flex flex-wrap gap-1.5">
          {positionings.map(p => <span key={p} className="px-2 py-1 rounded-md text-[11px] font-bold pop" style={{ background: "#1e3527", color: C.cream }}>{p}</span>)}
        </div>
        <div className="text-[11px] mt-2" style={{ color: "#bcd8c2" }}>Every angle traces to a real source (Reddit, reviews, Ads Library). Test wide — let volume find the winner.</div>
      </Card>}

      {step === 5 && <Card bg={C.purple}>
        <div className="text-xs font-bold mb-2" style={{ color: C.vio }}>CREATIVE FACTORY + THE LAUNCH GATE</div>
        <div className="text-[13px] mb-2" style={{ color: C.cream }}>10 creatives generated (2 sets × 5) — Nano Banana images, HeyGen/Seedance video → assets in R2, prompts logged to the genome. 2 slots are <Tag bg="#2e2447" color={C.vio}>EXPLORE</Tag> DNA.</div>
        <div className="rounded-lg p-2.5 text-[12px]" style={{ background: "#161a21", fontFamily: mono, color: C.cream }}>
          <div style={{ opacity: synth >= 1 ? 1 : .25 }}>▸ synthetic purchase fired…</div>
          <div style={{ opacity: synth >= 2 ? 1 : .25 }}>▸ server-side CAPI captured (iOS-proof)…</div>
          <div style={{ opacity: synth >= 3 ? 1 : .25, color: C.win }}>▸ landed in revenue_ledger, joined to ad ✓ GATE OPEN</div>
        </div>
        <div className="text-[11px] mt-1.5" style={{ color: C.dim }}>No tracking proof → no launch. Ever.</div>
      </Card>}

      {step === 6 && <Card bg={C.gold}>
        <div className="text-xs font-bold mb-2" style={{ color: C.goldHi }}>TRUST LADDER — RUNG 2: APPROVE-TO-PUBLISH</div>
        <div className="text-[13px]" style={{ color: C.cream }}>Bracket starts at floor budgets. For the first two weeks, nothing publishes without your tap. Autonomy is earned, never assumed.</div>
        <button onClick={() => setApproved(true)} className="w-full mt-3 rounded-lg py-2.5 font-black text-sm"
          style={{ background: approved ? C.win : C.goldHi, color: "#211d12" }}>{approved ? "✓ Approved — publishing tonight's batch" : "Approve today's 10 ads"}</button>
      </Card>}

      {step === 7 && <Card bg={C.navy}>
        <div className="text-xs font-bold mb-2" style={{ color: C.blue }}>RUNNING — FOREVER</div>
        <div className="text-[13px] space-y-1" style={{ color: C.cream }}>
          <div>• Elimination bracket every 3 days (→ <b>Bracket</b> tab, watch it live)</div>
          <div>• Entropy feeds keep new DNA flowing in</div>
          <div>• Fatigue monitor retires tired winners</div>
          <div>• Nightly adversary reconciliation of every dollar</div>
          <div>• Monthly counterfactual report: what we killed & what it would've cost</div>
        </div>
        <Banner>Marketing is not a campaign anymore. It's a running system.</Banner>
      </Card>}

      <div className="flex gap-2 mt-3">
        <button onClick={() => setStep(s => Math.max(0, s - 1))} className="px-3 py-2 rounded-lg text-sm font-bold" style={{ background: "#26282d", color: C.dim }}>Back</button>
        <button disabled={!canNext || step === 7 || rejected} onClick={() => setStep(s => Math.min(7, s + 1))}
          className="flex-1 rounded-lg py-2 text-sm font-black flex items-center justify-center gap-1"
          style={{ background: canNext && step < 7 && !rejected ? C.goldHi : "#26282d", color: canNext && step < 7 && !rejected ? "#211d12" : C.dim }}>
          {step === 7 ? "Live" : rejected ? "Fix the site first" : "Next step"} <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

/* =====================================================
   TAB 2 — BRACKET : live elimination simulation
   ===================================================== */
const ANGLES = ["Anti-greasy", "Reef guilt", "Derm dad", "Mineral vs chem", "Kids won't cry", "Beach-bag UGC", "SPF myths", "Callout", "Founder story", "Sweat-proof", "Sunday reset", "Tan fear", "Pump fix", "No white cast", "Dive master"];
let AID = 0;
const mkAd = (born, explore) => {
  const q = explore ? 0.15 + Math.random() * 0.8 : 0.25 + Math.random() * 0.6; // latent quality
  return { id: ++AID, name: ANGLES[Math.floor(Math.random() * ANGLES.length)] + " #" + AID, q, explore, born, spend: 0, hook: 18 + q * 20 + Math.random() * 6, ctr: 0.5 + q * 1.6, rev: 0, status: "live", decay: 0 };
};

function BracketTab() {
  const [ads, setAds] = useState([]);
  const [day, setDay] = useState(0);
  const [run, setRun] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [log, setLog] = useState([]);
  const [toast, setToast] = useState(null);
  const [frozen, setFrozen] = useState(false);
  const ref = useRef({ nextBatch: 0, vetoDone: false, driftDone: false, blockDone: false });

  const addLog = (d, txt, color) => setLog(l => [{ d: d.toFixed(1), txt, color }, ...l].slice(0, 45));
  const reset = () => { AID = 0; ref.current = { nextBatch: 0, vetoDone: false, driftDone: false, blockDone: false }; setAds([]); setDay(0); setLog([]); setFrozen(false); setRun(false); };

  useEffect(() => {
    if (!run) return;
    const iv = setInterval(() => {
      setDay(d => {
        const nd = +(d + 0.25).toFixed(2);
        setAds(prev => {
          let a = prev.map(x => ({ ...x }));
          const R = ref.current;
          // publish daily batch
          if (nd >= R.nextBatch) {
            R.nextBatch = Math.floor(nd) + 1;
            if (!frozen) {
              const batch = Array.from({ length: 10 }, (_, i) => mkAd(nd, i >= 8)); // 20% explore
              // scripted ban-risk veto on day 2 batch
              if (Math.floor(nd) === 2 && !R.vetoDone) {
                R.vetoDone = true;
                const v = batch[3];
                addLog(nd, `BAN-RISK VETO pre-publish: "${v.name}" copy implied a health claim. Never reached Facebook. 9 of 10 shipped.`, C.red);
                batch.splice(3, 1);
              } else addLog(nd, `PUBLISH ${batch.length} ads (2×5) — ${batch.filter(b => b.explore).length} exploration slots. Auto-uploaded.`, C.blue);
              a = [...a, ...batch];
            } else addLog(nd, "PUBLISH SKIPPED — scaling frozen by data adversary.", C.red);
          }
          // metrics tick
          a.forEach(x => {
            if (x.status === "live" || x.status === "winner") {
              x.spend += 2.5 + Math.random() * 4 + (x.status === "winner" ? 6 : 0);
              x.ctr = Math.max(0.2, x.ctr + (Math.random() - 0.5) * 0.15 - (x.status === "winner" && nd - x.born > 6 ? 0.06 : 0));
              if (x.status === "winner" && nd - x.born > 6 && x.ctr < 0.9 + x.q) x.decay++; else x.decay = Math.max(0, x.decay - 1);
              if (Math.random() < x.q * 0.16) x.rev += 40 + Math.random() * 60;
            }
          });
          // proxy kills after protection window
          const live = a.filter(x => x.status === "live" && nd - x.born >= 2.5);
          if (live.length > 4) {
            live.sort((p, q2) => (p.hook * 0.4 + p.ctr * 10) - (q2.hook * 0.4 + q2.ctr * 10));
            const kill = live.slice(0, live.length - 4);
            kill.forEach(k => { k.status = "killed"; addLog(nd, `PROXY KILL "${k.name}" — hook ${k.hook.toFixed(0)}%, CTR ${k.ctr.toFixed(1)}%. Decision adversary: min spend met ✓ window closed ✓`, C.dim); });
          }
          // revenue promotion only
          a.filter(x => x.status === "live" && nd - x.born >= 3).forEach(x => {
            if (x.rev >= 130 && !frozen) { x.status = "winner"; addLog(nd, `PROMOTE "${x.name}" → winners pool. $${x.rev.toFixed(0)} verified in revenue_ledger. Genome + prompt logged: make more of this.`, C.win); }
            else if (x.ctr > 2.1 && x.rev < 60 && !R.blockDone) { R.blockDone = true; addLog(nd, `PROMOTION BLOCKED "${x.name}" — CTR ${x.ctr.toFixed(1)}% but no warehouse revenue. Proxies kill, never promote (Law 5).`, C.goldHi); }
          });
          // fatigue retirement
          a.filter(x => x.status === "winner" && x.decay >= 5).forEach(x => {
            const ch = a.find(y => y.status === "winner" && y.id !== x.id && y.rev / Math.max(1, y.spend) > x.rev / Math.max(1, x.spend));
            if (ch) { x.status = "retired"; addLog(nd, `FATIGUE RETIRE "${x.name}" — multi-day CTR decay, challenger "${ch.name}" beat it head-to-head.`, C.vio); }
          });
          return a;
        });
        // scripted data adversary events
        if (Math.floor(nd) !== Math.floor(d) && Math.floor(nd) > 0) {
          if (Math.floor(nd) === 5 && !ref.current.driftDone) { ref.current.driftDone = true; setFrozen(true); addLog(nd, "NIGHTLY RECONCILE: Stripe $12,940 vs platform-claimed $14,102 → 8.2% drift. ALL SCALING FROZEN. Human alerted.", C.red); }
          else if (frozen && Math.floor(nd) === 6) { setFrozen(false); addLog(nd, "Drift resolved (duplicate webhook). Human ack. Scaling unfrozen.", C.win); }
          else addLog(nd, `NIGHTLY RECONCILE: Stripe vs platform vs warehouse — drift ${(0.4 + Math.random() * 1.4).toFixed(1)}% ✓`, C.dim);
        }
        return nd;
      });
    }, 700 / speed);
    return () => clearInterval(iv);
  }, [run, speed, frozen]);

  const tryKill = (ad) => {
    if (ad.status !== "live") return;
    const age = day - ad.born;
    if (age < 2.5) {
      setToast(`Decision adversary BLOCKED your kill: "${ad.name}" is ${age.toFixed(1)} days into a 2–3 day protection window. All ten stay live. Nobody touches them.`);
      setTimeout(() => setToast(null), 3200);
    } else {
      setAds(p => p.map(x => x.id === ad.id ? { ...x, status: "killed" } : x));
      addLog(day, `HUMAN KILL "${ad.name}" — window closed, allowed. Logged to decisions ledger.`, C.dim);
    }
  };

  const live = ads.filter(a => a.status === "live");
  const winners = ads.filter(a => a.status === "winner");
  const killed = ads.filter(a => a.status === "killed" || a.status === "retired").length;
  const spend = ads.reduce((s, a) => s + a.spend, 0), rev = ads.reduce((s, a) => s + a.rev, 0);

  return (
    <div className="pop">
      <SlideTitle>TEN ADS A DAY, THEN LET THEM FIGHT</SlideTitle>
      <div className="grid grid-cols-4 gap-1.5 mb-2 text-center">
        {[["Day", day.toFixed(1)], ["Spend", "$" + spend.toFixed(0)], ["Revenue", "$" + rev.toFixed(0)], ["ROAS", spend > 0 ? (rev / spend).toFixed(1) + "x" : "—"]].map(([k, v]) => (
          <div key={k} className="rounded-lg py-1.5" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
            <div className="text-[9px] font-bold" style={{ color: C.dim }}>{k}</div>
            <div className="text-sm font-black" style={{ color: k === "ROAS" && rev / Math.max(1, spend) >= 3 ? C.win : C.cream, fontFamily: mono }}>{v}</div>
          </div>))}
      </div>
      <div className="flex items-center gap-2 mb-2">
        <button onClick={() => setRun(r => !r)} className="flex items-center gap-1 px-3 py-2 rounded-lg font-black text-sm" style={{ background: C.goldHi, color: "#211d12" }}>
          {run ? <Pause size={14} /> : <Play size={14} />} {run ? "Pause" : ads.length ? "Resume" : "Run it"}
        </button>
        {[1, 4, 16].map(s => <button key={s} onClick={() => setSpeed(s)} className="px-2 py-1.5 rounded-md text-xs font-bold" style={{ background: speed === s ? C.navy : "#26282d", color: speed === s ? C.cream : C.dim }}>{s}x</button>)}
        <button onClick={reset} className="ml-auto p-2 rounded-lg" style={{ background: "#26282d" }}><RotateCcw size={14} color={C.dim} /></button>
      </div>
      {frozen && <div className="rounded-lg px-3 py-2 mb-2 text-[12px] font-extrabold flex items-center gap-2 pop" style={{ background: "#5d2a24", color: C.cream }}><ShieldAlert size={15} /> SCALING FROZEN — data adversary found revenue drift. Nothing scales on numbers that might be lies.</div>}
      {toast && <div className="rounded-lg px-3 py-2 mb-2 text-[12px] font-bold pop" style={{ background: C.maroon, color: C.cream, border: `1px solid ${C.red}` }}>{toast}</div>}
      {!ads.length && !run && <Card><div className="text-[13px]" style={{ color: C.cream }}>Tap <b>Run it</b>. The engine publishes 10 ads a day, protects them 2–3 days, kills the worst on proxies, promotes only on warehouse revenue, and learns from every winner. <b>Try tapping a fresh ad to kill it early</b> — see what happens.</div></Card>}

      {live.length > 0 && <>
        <div className="text-[11px] font-black mb-1 flex items-center gap-1" style={{ color: C.blue }}><Zap size={12} /> LIVE — TAP ONE TO TRY A MANUAL KILL</div>
        <div className="grid grid-cols-2 gap-1.5 mb-2">
          {live.slice(-8).map(a => {
            const age = day - a.born;
            return (
              <button key={a.id} onClick={() => tryKill(a)} className="rounded-lg p-2 text-left pop" style={{ background: age < 2.5 ? C.navy : "#2c3a2f", border: `1px solid ${age < 2.5 ? "#3a5375" : "#3f5c46"}` }}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold truncate" style={{ color: C.cream }}>{a.name}</span>
                  {a.explore && <FlaskConical size={11} color={C.vio} />}
                </div>
                <div className="text-[10px]" style={{ color: C.dim, fontFamily: mono }}>d{age.toFixed(1)} · CTR {a.ctr.toFixed(1)}% · ${a.rev.toFixed(0)}</div>
                <div className="text-[9px] font-bold mt-0.5" style={{ color: age < 2.5 ? "#8fb3dd" : "#9ecfa8" }}>{age < 2.5 ? "🔒 protected" : "window open"}</div>
              </button>);
          })}
        </div>
      </>}

      {winners.length > 0 && <>
        <div className="text-[11px] font-black mb-1 flex items-center gap-1" style={{ color: C.win }}><Trophy size={12} /> WINNERS POOL — competing for the budget</div>
        <div className="space-y-1 mb-2">
          {winners.map(a => (
            <div key={a.id} className="flex items-center justify-between rounded-lg px-2.5 py-1.5 pop" style={{ background: C.green, border: `1px solid #3f5c46` }}>
              <span className="text-[12px] font-extrabold" style={{ color: C.cream }}>{a.name} {a.decay >= 3 && <Flame size={11} color="#e8a05c" className="inline" />}</span>
              <span className="text-[11px] font-black" style={{ color: C.win, fontFamily: mono }}>${a.rev.toFixed(0)} · {(a.rev / Math.max(1, a.spend)).toFixed(1)}x</span>
            </div>))}
        </div>
      </>}

      <div className="text-[11px] font-black mb-1" style={{ color: C.dim }}>DECISIONS LEDGER (append-only) · {killed} killed</div>
      <div className="rounded-xl p-2 space-y-1 overflow-y-auto" style={{ background: "#101216", border: `1px solid ${C.line}`, maxHeight: 190, fontFamily: mono }}>
        {log.length === 0 && <div className="text-[11px]" style={{ color: C.dim }}>Every publish, kill, promote & adversary verdict lands here — the audit trail clients never get from an agency.</div>}
        {log.map((l, i) => <div key={i} className="text-[10.5px] leading-snug" style={{ color: l.color }}><span style={{ color: "#5c5f66" }}>d{l.d}</span> {l.txt}</div>)}
      </div>
      <Banner>It's not picking ads. It's running an elimination bracket every three days.</Banner>
    </div>
  );
}

/* =====================================================
   TAB 3 — ENGINE : spine, modules, trust ladder
   ===================================================== */
function EngineTab() {
  const [rung, setRung] = useState(1);
  const spine = [
    { t: "SOURCES", d: "Facebook Ads · GA4 · PostHog · HubSpot · Stripe", bg: "#2a2c31", icon: <Globe size={14} color={C.dim} /> },
    { t: "AIRBYTE", d: "Open-source pipeline. Claude Code sets it up.", bg: C.navy, icon: <ArrowDown size={14} color={C.blue} /> },
    { t: "CLICKHOUSE", d: "Every source in one context — ties each ad to real revenue. Langfuse traces every agent decision.", bg: C.purple, icon: <Database size={14} color={C.vio} /> },
    { t: "THE AGENT", d: "One Durable Object per client. Workflows run the 3-day bracket. Reads the warehouse, publishes · pauses · promotes the winners.", bg: C.green, icon: <Zap size={14} color={C.win} /> },
  ];
  const cf = ["Durable Objects", "Workflows", "AI Gateway", "Vectorize", "R2", "Browser Run", "Workers AI", "Turnstile/WAF"];
  const modules = [
    { n: 2, name: "Paid acquisition", d: "The elimination bracket", s: "LIVE" },
    { n: 7, name: "Security / data integrity", d: "Bots out of the warehouse", s: "NEXT" },
    { n: 3, name: "Organic / content", d: "Short-form mining → posts + ad DNA", s: "LOCKED" },
    { n: 5, name: "Capture / conversion", d: "Conversational forms + edge LPs", s: "LOCKED" },
    { n: 6, name: "Commerce / lifecycle", d: "AI storekeeper, cart flows, email", s: "LOCKED" },
    { n: 4, name: "SEO", d: "Writes meta, links, restructures", s: "LOCKED" },
    { n: 1, name: "Research", d: "Pain-mining (always on)", s: "LIVE" },
  ];
  const rungs = [
    { t: "Draft only", d: "Engine proposes. Nothing ships without you building it." },
    { t: "Approve to publish", d: "Every batch waits for your tap. Mandatory first 2 weeks." },
    { t: "Auto + veto window", d: "Ships on schedule; you get a window to pull anything." },
    { t: "Full auto within caps", d: "Earned. Spend caps in code still bind everything." },
  ];
  return (
    <div className="pop">
      <SlideTitle>PIPELINE — WAREHOUSE — AGENT — BACK</SlideTitle>
      <div className="relative pl-4">
        <div className="absolute left-1 top-2 bottom-2 w-0.5 rounded" style={{ background: C.line }}>
          <div className="pulse-dot absolute -left-[3px] w-2 h-2 rounded-full" style={{ background: C.goldHi, animation: "pulseDot 3.2s linear infinite" }} />
        </div>
        <div className="space-y-2">
          {spine.map(s => (
            <Card key={s.t} bg={s.bg}>
              <div className="flex items-center gap-2 mb-0.5">{s.icon}<span className="text-[12px] font-black" style={{ color: C.cream }}>{s.t}</span></div>
              <div className="text-[12px]" style={{ color: C.cream, opacity: .9 }}>{s.d}</div>
              {s.t === "THE AGENT" && <div className="flex flex-wrap gap-1 mt-2">{cf.map(c => <Tag key={c} bg="#1e3527" color="#9ecfa8">{c}</Tag>)}</div>}
            </Card>))}
        </div>
      </div>
      <div className="text-[11px] text-center mt-1.5 font-bold" style={{ color: C.dim }}>↺ Facebook results flow back into the warehouse</div>
      <Banner>Reads come from the warehouse. Writes go through the API. That is the rule.</Banner>
      <div className="text-[11px]" style={{ color: C.dim }}>The ban myth: accounts die from pulling hundreds of millions of rows (a TOS violation) — not from agent writes. Marketing API = writes only: publish · pause · promote.</div>

      <div className="mt-4"><SlideTitle>SEVEN MODULES, ONE WAREHOUSE</SlideTitle></div>
      <div className="space-y-1.5">
        {modules.map(m => (
          <div key={m.n} className="flex items-center gap-2 rounded-lg px-2.5 py-2" style={{ background: m.s === "LIVE" ? C.green : m.s === "NEXT" ? C.gold : C.panel, border: `1px solid ${C.line}`, opacity: m.s === "LOCKED" ? .65 : 1 }}>
            {m.s === "LOCKED" ? <Lock size={13} color={C.dim} /> : m.s === "NEXT" ? <Sparkles size={13} color={C.goldHi} /> : <CheckCircle2 size={13} color={C.win} />}
            <div className="flex-1">
              <span className="text-[12px] font-extrabold" style={{ color: C.cream }}>{m.name}</span>
              <span className="text-[11px] ml-1.5" style={{ color: C.dim }}>{m.d}</span>
            </div>
            <Tag bg={m.s === "LIVE" ? "#1e3527" : "#26282d"} color={m.s === "LIVE" ? "#9ecfa8" : C.dim}>{m.s}</Tag>
          </div>))}
      </div>
      <div className="text-[11px] mt-1.5" style={{ color: C.dim }}>Sequenced rollout: a module unlocks only when the previous one passes its adversary on live data. Architecture is well-rounded from day one; risk is not.</div>

      <div className="mt-4"><SlideTitle>THE TRUST LADDER</SlideTitle></div>
      <div className="grid grid-cols-4 gap-1.5 mb-2">
        {rungs.map((r, i) => (
          <button key={i} onClick={() => setRung(i)} className="rounded-lg py-2 text-[10px] font-black" style={{ background: rung === i ? C.goldHi : i < rung ? C.navy : C.panel, color: rung === i ? "#211d12" : C.cream, border: `1px solid ${C.line}` }}>Rung {i + 1}</button>))}
      </div>
      <Card bg={C.navy}><div className="text-[13px] font-extrabold mb-0.5" style={{ color: C.cream }}>{rungs[rung].t}</div><div className="text-[12px]" style={{ color: C.cream, opacity: .85 }}>{rungs[rung].d}</div></Card>
      <div className="mt-3"><SlideTitle>THE WHOLE CLIENT SURFACE</SlideTitle></div>
      <div className="grid grid-cols-4 gap-1.5">
        {[["Connect", "OAuth buttons"], ["Digest", "1 approve tap"], ["Red button", "pause all <60s"], ["Chat", "ask the warehouse"]].map(([t, d]) => (
          <div key={t} className="rounded-lg p-2 text-center" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
            <div className="text-[11px] font-black" style={{ color: C.cream }}>{t}</div>
            <div className="text-[9px]" style={{ color: C.dim }}>{d}</div>
          </div>))}
      </div>
      <div className="text-[11px] mt-1.5" style={{ color: C.dim }}>Four screens. If a client ever needs a fifth, we failed. The chat doubles as whole-business analytics: "We can't hit payroll — what's going wrong?" → "your accounts receivable."</div>
    </div>
  );
}

/* =====================================================
   TAB 4 — ADVERSARY : six watchers, tap to see a catch
   ===================================================== */
function AdversaryTab() {
  const [open, setOpen] = useState(null);
  const [lines, setLines] = useState([]);
  const advs = [
    { k: "build", name: "Build adversary", icon: <FileSearch size={15} />, bg: C.gold, tag: "gates every Claude Code phase",
      play: ["PHASE 4 — creative factory submitted as done", "ATTACK: paraphrased health claim slipped past copy check → FINDING (sev 2: ban risk)", "ATTACK: exploration slots were near-duplicates of genome → FINDING", "Builder fixes both →", "LOCK: 2 deterministic tests written — fail pre-fix, pass post-fix, wired to CI", "ADVERSARY_REPORT_phase4.md → PASS. Gate opens. Phase 5 may begin."] },
    { k: "data", name: "Data adversary", icon: <Database size={15} />, bg: C.maroon, tag: "is any of this even true?",
      play: ["Nightly: Stripe $12,940 vs platform-claimed $14,102", "Drift 8.2% > 5% threshold", "ALL SCALING FROZEN account-wide. Human alerted.", "Root cause: duplicate webhook delivery → dedupe fix", "Reconciles to the cent → unfrozen. Nothing ever scales on numbers that might be lies."] },
    { k: "decision", name: "Decision adversary", icon: <Scale size={15} />, bg: C.navy, tag: "attacks every kill / promote / scale",
      play: ['Builder: KILL "Derm dad #12" (CTR 0.6%)', "Check: age 1.8d < 2.5d protection window → BLOCKED", 'Builder: PROMOTE "Beach-bag UGC #7" (CTR 2.3%)', "Check: warehouse revenue $41 < threshold → BLOCKED. Proxies kill, never promote.", "Disagreements don't auto-resolve — they go to the human queue."] },
    { k: "ban", name: "Ban-risk adversary", icon: <Ban size={15} />, bg: C.maroon, tag: "absolute veto — one bad upload can nuke an account",
      play: ['Pre-flight on tonight\'s batch: ad #4 copy — "clears sun damage"', "Meta health-claim policy → VETO. Never reaches the API.", "Write rate check ✓ · spend caps intact ✓ · Business Manager isolation ✓", "9 of 10 ship. The veto is logged; only a human can override, in writing."] },
    { k: "claims", name: "Claims adversary", icon: <Eye size={15} />, bg: C.purple, tag: "copy vs. what the product actually does",
      play: ['Draft email: "loved by 10,000 divers"', "Warehouse: 6,214 lifetime customers → CONTRADICTION", 'Rewritten: "trusted by 6,000+ divers" → PASS', "FTC + Meta lens on every ad and every lifecycle email. The engine never lies for you — that would eventually cost you the account and the brand."] },
    { k: "report", name: "Report adversary", icon: <CheckCircle2 size={15} />, bg: C.green, tag: "re-queries every number a client will see",
      play: ["Monthly report drafted: ROAS 5.2x", "Independent warehouse re-query: 4.9x → DIFF FOUND", "Report corrected before the client ever sees it", "App attribution gets confidence intervals, stated plainly. Honest numbers are the product."] },
  ];
  const runSim = (a) => {
    setOpen(a.k); setLines([]);
    a.play.forEach((l, i) => setTimeout(() => setLines(p => [...p, l]), 420 * (i + 1)));
  };
  return (
    <div className="pop">
      <SlideTitle>NOTHING SHIPS UNGRADED</SlideTitle>
      <div className="text-[12px] mb-2" style={{ color: C.cream }}>Two layers of adversarial AI: one gates the <b>build</b> (Claude Code never grades its own work), five police the <b>runtime</b> with real money. Deterministic rules first, LLM judgment second — two models can share a blind spot; hard gates can't.</div>
      <div className="rounded-lg px-2.5 py-1.5 mb-3 text-[10px] font-bold" style={{ background: "#26282d", color: C.dim }}>Severity order: money loss → ban risk → data lies → isolation breaks → dummy-proof violations</div>
      <div className="space-y-2">
        {advs.map(a => (
          <Card key={a.k} bg={a.bg}>
            <button onClick={() => open === a.k ? setOpen(null) : runSim(a)} className="w-full text-left">
              <div className="flex items-center gap-2">
                <span style={{ color: C.cream }}>{a.icon}</span>
                <span className="text-[13px] font-black" style={{ color: C.cream }}>{a.name}</span>
                <span className="ml-auto text-[10px] font-bold px-2 py-1 rounded-md" style={{ background: "#00000030", color: C.cream }}>{open === a.k ? "close" : "watch a catch"}</span>
              </div>
              <div className="text-[11px] mt-0.5" style={{ color: C.cream, opacity: .8 }}>{a.tag}</div>
            </button>
            {open === a.k && <div className="mt-2 rounded-lg p-2 space-y-1" style={{ background: "#00000040", fontFamily: mono }}>
              {lines.map((l, i) => <div key={i} className="text-[10.5px] leading-snug pop" style={{ color: l.includes("BLOCK") || l.includes("VETO") || l.includes("FROZEN") || l.includes("FINDING") || l.includes("CONTRADICTION") || l.includes("DIFF") ? "#f0a89d" : l.includes("PASS") || l.includes("✓") || l.includes("unfrozen") ? C.win : C.cream }}>▸ {l}</div>)}
            </div>}
          </Card>))}
      </div>
      <Banner>The builder never grades its own work. FAIL blocks the gate — only the human overrides, in writing.</Banner>
    </div>
  );
}

/* =====================================================
   TAB 5 — PRICE : premium, guaranteed, underwritten
   ===================================================== */
function PriceTab() {
  const tiers = [
    { n: "Ignition", band: "$3–10K/mo ad spend", p: "$2,997", bg: C.navy },
    { n: "Growth", band: "$10–30K/mo ad spend", p: "$5,997", bg: C.purple },
    { n: "Scale", band: "$30–100K/mo ad spend", p: "$9,997", bg: C.green },
  ];
  return (
    <div className="pop">
      <SlideTitle>PRICED LIKE ONE HIRE. WORKS LIKE A DEPARTMENT.</SlideTitle>
      <Card bg={C.maroon} className="mb-2">
        <div className="text-[11px] font-black mb-1" style={{ color: "#e0a49b" }}>WHAT WE REPLACE (the real comp — not "an agency")</div>
        <div className="text-[12px] space-y-0.5" style={{ color: C.cream, fontFamily: mono }}>
          <div>Media buyer (loaded) ........ $5–8K/mo</div>
          <div>Creative / UGC pipeline ..... $2–5K/mo</div>
          <div>Analyst + BI tooling ........ $3–6K/mo</div>
          <div>Lifecycle / email ........... $1–3K/mo</div>
          <div className="pt-1 font-black" style={{ color: "#ffb3a6" }}>Fully-loaded function ....... $12–25K+/mo</div>
        </div>
        <div className="text-[11px] mt-1.5" style={{ color: C.cream, opacity: .85 }}>…and none of it can prove its own lift. We can — the warehouse computed your baseline on day one.</div>
      </Card>
      <div className="flex items-center gap-2 mb-2">
        <Card bg={C.panel} className="flex-1 text-center"><div className="text-[10px] font-bold" style={{ color: C.dim }}>PRE-FLIGHT AUDIT</div><div className="font-black" style={{ color: C.win }}>Free</div><div className="text-[9px]" style={{ color: C.dim }}>the sales weapon</div></Card>
        <Card bg={C.gold} className="flex-1 text-center"><div className="text-[10px] font-bold" style={{ color: C.goldHi }}>INSTALL</div><div className="font-black" style={{ color: C.cream }}>$7,500</div><div className="text-[9px]" style={{ color: C.cream, opacity: .8 }}>an asset you keep forever</div></Card>
      </div>
      <div className="space-y-2 mb-2">
        {tiers.map(t => (
          <Card key={t.n} bg={t.bg}>
            <div className="flex items-center justify-between">
              <div><div className="text-[14px] font-black" style={{ color: C.cream }}>{t.n}</div><div className="text-[11px]" style={{ color: C.cream, opacity: .75 }}>{t.band}</div></div>
              <div className="text-right"><div className="text-lg font-black" style={{ color: C.goldHi, fontFamily: mono }}>{t.p}</div><div className="text-[10px]" style={{ color: C.cream, opacity: .7 }}>flat / month</div></div>
            </div>
          </Card>))}
        <div className="text-[11px] text-center" style={{ color: C.dim }}>Above $100K/mo spend → custom · 3-month minimum (the bracket needs cycles) · leave anytime after — you keep the Business Manager, the warehouse, the data. It was installed as yours.</div>
      </div>
      <Card bg={C.green} className="mb-2">
        <div className="flex items-center gap-2 mb-1"><ShieldAlert size={15} color={C.win} /><span className="text-[13px] font-black" style={{ color: C.cream }}>The guarantee</span></div>
        <div className="text-[12px]" style={{ color: C.cream }}>Beat your historical CAC within 90 days <b>or we work free until we do.</b> We can say that because the pre-flight adversary is our underwriting — we only take accounts we can measure and win.</div>
      </Card>
      <Card bg={C.panel} className="mb-2">
        <div className="text-[11px] font-black mb-1" style={{ color: C.goldHi }}>WHY NOT CHEAPER · WHY NOT % OF SPEND</div>
        <div className="text-[12px] space-y-1" style={{ color: C.cream }}>
          <div>• % of spend pays us to inflate budgets — at war with our own decision adversary. Killed.</div>
          <div>• % of revenue pressures our report adversary to flatter numbers. Killed. Honest numbers are the product.</div>
          <div>• A guaranteed system priced under a mediocre retainer reads "too good to be true." Premium price is part of the proof.</div>
        </div>
      </Card>
      <Card bg={C.navy}>
        <div className="text-[11px] font-black mb-1" style={{ color: C.blue }}>FOUNDING COHORT — 3–5 SEATS</div>
        <div className="text-[12px]" style={{ color: C.cream }}>Standing monthly price, <b>$7,500 install waived</b>, in exchange for case-study rights. They pay with proof, not with a discount that devalues the category. Client zero = our own offer: the engine's rookie mistakes cost us, never a client.</div>
      </Card>
      <Banner>A dollar in, five out. Keep feeding that ATM.</Banner>
    </div>
  );
}

/* =====================================================
   TAB 6 — GRADES : the registry + the monthly council
   ===================================================== */
const AREAS_INIT = [
  { k: "mkt", name: "Marketing engine", bg: C.navy, m: [["CAC vs client baseline", "−22%", "beat within 90d"], ["Blended ROAS", "5.1x", "≥ 4.0x target"], ["Cap breaches / policy strikes", "0 / 0", "= 0"]] },
  { k: "seo", name: "WordPress / SEO", bg: C.green, m: [["Organic clicks vs baseline", "+18%", "on trend by d90"], ["Core Web Vitals passing", "86%", "≥ 75% of pages"], ["Mutations reversible", "100%", "= 100%"], ["Verdicts before window close", "0", "= 0"]] },
  { k: "model", name: "Model layer", bg: C.purple, m: [["Roles ≥ eval threshold", "9 / 9", "all roles"], ["Family diversity", "holds", "builder ≠ adversary"], ["Monthly failover drill", "passed", "must pass"]] },
  { k: "advl", name: "Adversary layer", bg: C.maroon, m: [["Decisions carrying verdicts", "100%", "= 100%"], ["Unreviewed FAILs", "0", "= 0"], ["Injection drills", "passed", "must pass"]] },
  { k: "data", name: "Data truth", bg: C.gold, m: [["Stripe ↔ warehouse drift", "1.3%", "< 2%"], ["Incrementality gap stated", "yes", "every report"]] },
  { k: "ux", name: "Dummy-proof", bg: C.navy, m: [["Unassisted onboarding", "93%", "≥ 90%"], ["Red-button drill", "41s", "< 60s"], ["Client screens", "4", "= 4, forever"]] },
  { k: "sec", name: "Security / isolation", bg: C.green, m: [["Cross-tenant events", "0", "= 0"], ["Bot filtration", "98.7%", "≥ threshold"], ["WP credentials scoped", "yes", "never admin-wide"]] },
];
const COUNCIL = [
  { d: 500, log: ["Council convened — reading Grade Registry trendlines, Langfuse evals, findings, warehouse outcomes…", C.cream] },
  { d: 1100, log: ["RESEARCH SCAN: arXiv cs.CL/cs.IR · NeurIPS · KDD · Marketing Science · Google Search Central · Meta engineering · WP core notes…", C.blue] },
  { d: 1800, log: ["5 proposals drafted. Citation verification (deterministic) starting…", C.cream] },
  { d: 2300, prop: { id: 1, title: "Bandit budget pacing across winners pool", cls: 1, cite: "arXiv:2504.11873 — constrained bandit allocation", status: "verifying citation…", sc: C.dim } },
  { d: 2900, prop: { id: 2, title: "Internal-link scheme for topical authority", cls: 1, cite: "KDD '26 — site-graph restructuring study", status: "verifying citation…", sc: C.dim } },
  { d: 3500, prop: { id: 3, title: "Genome tagger → open-source Qwen", cls: 1, cite: "role_evals: +3 pts vs incumbent, −71% cost", status: "verifying evidence…", sc: C.dim } },
  { d: 4100, prop: { id: 4, title: "Meta-description emotional framing", cls: 1, cite: "\"J. Marketing Res. 2025\" — DOI lookup…", status: "verifying citation…", sc: C.dim } },
  { d: 4700, prop: { id: 5, title: "Raise drift threshold 5% → 8%", cls: 2, cite: "internal — touches the Grade Registry", status: "routing…", sc: C.dim } },
  { d: 5400, patch: { id: 4, status: "KILLED — citation does not resolve. Hallucinated source. Severity-2 finding filed against the Council itself.", sc: "#f0a89d" }, log: ["P4 citation FAILED quote-match → proposal dead. The improver is held to the same honesty bar as client reports.", C.red] },
  { d: 6100, patch: { id: 5, status: "HUMAN QUEUE — Class 2. The improver never moves its own bar.", sc: C.goldHi } },
  { d: 6800, patch: { id: 1, status: "citation ✓ → adversary A/B ✓ → invariants ✓ → canary…", sc: C.blue }, log: ["P1 & P2 citations verified (resolve + quote-match ✓). Entering Class 1 pipeline.", C.win] },
  { d: 7500, patch: { id: 2, status: "citation ✓ → staging grades A ✓ → canary client → 14-day watch…", sc: C.blue } },
  { d: 8200, patch: { id: 3, status: "champion/challenger shadow: beat incumbent on live traffic ✓ → canary…", sc: C.blue } },
  { d: 9200, patch: { id: 1, status: "AUTO-SHIPPED — 14-day watch complete, every area held A.", sc: C.win }, log: ["P1 shipped fleet-wide. No human touched it. Grades stayed A throughout.", C.win] },
  { d: 10200, patch: { id: 2, status: "AUTO-ROLLBACK — day 9 of watch: indexation coverage dipped, SEO grade left A. Reverted from site_changes diffs. Finding filed.", sc: "#f0a89d" }, log: ["P2 rolled back automatically. A grade dip anywhere = the improvement dies, not the standard.", C.red] },
  { d: 11000, patch: { id: 3, status: "AUTO-SHIPPED — evals green 14 days. Tagging cost −71%.", sc: C.win }, log: ["Council closed. Report to human: 2 shipped · 1 rolled back · 1 killed (citation) · 1 awaiting your approval.", C.goldHi] },
];
function GradesTab() {
  const [open, setOpen] = useState(null);
  const [dip, setDip] = useState(false);
  const [cLog, setCLog] = useState([]);
  const [props, setProps] = useState([]);
  const [running, setRunning] = useState(false);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const runCouncil = () => {
    timers.current.forEach(clearTimeout); timers.current = [];
    setCLog([]); setProps([]); setRunning(true);
    COUNCIL.forEach(s => timers.current.push(setTimeout(() => {
      if (s.log) setCLog(p => [...p, s.log]);
      if (s.prop) setProps(p => [...p, s.prop]);
      if (s.patch) setProps(p => p.map(x => x.id === s.patch.id ? { ...x, status: s.patch.status, sc: s.patch.sc } : x));
    }, s.d)));
    timers.current.push(setTimeout(() => setRunning(false), 11200));
  };
  return (
    <div className="pop">
      <SlideTitle>"A" IS AN INVARIANT, NOT AN OPINION</SlideTitle>
      <div className="text-[12px] mb-2" style={{ color: C.cream }}>Every area is graded continuously against hard thresholds computed from the warehouse. Tap an area for its metrics — then break one and watch what the engine does about it.</div>
      <div className="space-y-1.5 mb-2">
        {AREAS_INIT.map(a => {
          const bad = dip && a.k === "data";
          return (
            <div key={a.k}>
              <button onClick={() => setOpen(open === a.k ? null : a.k)} className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2" style={{ background: bad ? "#5d2a24" : a.bg, border: `1px solid ${C.line}` }}>
                <span className="text-[12px] font-extrabold flex-1 text-left" style={{ color: C.cream }}>{a.name}</span>
                <span className="w-7 h-7 rounded-md flex items-center justify-center text-[13px] font-black" style={{ background: bad ? C.red : C.goldHi, color: "#211d12" }}>{bad ? "B" : "A"}</span>
              </button>
              {open === a.k && <div className="rounded-b-lg px-2.5 py-2 space-y-1" style={{ background: "#101216", border: `1px solid ${C.line}`, borderTop: "none" }}>
                {a.m.map(([l, v, t], i) => {
                  const isDipMetric = bad && i === 0;
                  return (
                    <div key={l} className="flex items-center justify-between text-[11px]" style={{ fontFamily: mono }}>
                      <span style={{ color: C.dim }}>{l}</span>
                      <span className="font-bold" style={{ color: isDipMetric ? "#f0a89d" : C.win }}>{isDipMetric ? "6.2%" : v} <span style={{ color: "#5c5f66" }}>({t})</span></span>
                    </div>);
                })}
              </div>}
            </div>);
        })}
      </div>
      <button onClick={() => setDip(d => !d)} className="w-full rounded-lg py-2 mb-2 text-[12px] font-black" style={{ background: dip ? C.win : C.maroon, color: C.cream, border: `1px solid ${dip ? "#3f5c46" : C.red}` }}>
        {dip ? "Resolve it (dedupe webhook fix → drift 1.3%)" : "Simulate a grade dip — spike revenue drift to 6.2%"}
      </button>
      {dip && <div className="rounded-lg px-3 py-2 mb-2 text-[12px] font-bold pop" style={{ background: "#5d2a24", color: C.cream }}>
        DATA TRUTH BELOW A → trust ladder stepped down one rung · <b>all auto-improvements halted platform-wide</b> · human alerted. The dip itself becomes the top improvement priority.
      </div>}

      <div className="mt-3"><SlideTitle>THE MONTHLY IMPROVEMENT COUNCIL</SlideTitle></div>
      <div className="text-[12px] mb-2" style={{ color: C.cream }}>On the 1st, the adversary reads the registry, sweeps real research — and every proposal lives or dies by a citation that actually resolves.</div>
      <button onClick={runCouncil} disabled={running || dip} className="w-full rounded-lg py-2.5 mb-2 text-sm font-black flex items-center justify-center gap-1.5"
        style={{ background: running || dip ? "#26282d" : C.goldHi, color: running || dip ? C.dim : "#211d12" }}>
        <BookOpen size={15} /> {dip ? "Disabled — an area is below A" : running ? "Council in session…" : "Run this month's council"}
      </button>
      {props.length > 0 && <div className="space-y-1.5 mb-2">
        {props.map(p => (
          <div key={p.id} className="rounded-lg p-2 pop" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-extrabold flex-1" style={{ color: C.cream }}>{p.title}</span>
              <Tag bg={p.cls === 1 ? "#1e3527" : "#3d3418"} color={p.cls === 1 ? "#9ecfa8" : C.goldHi}>Class {p.cls}</Tag>
            </div>
            <div className="text-[10px] mt-0.5" style={{ color: C.dim, fontFamily: mono }}>{p.cite}</div>
            <div className="text-[10.5px] mt-1 font-bold leading-snug" style={{ color: p.sc, fontFamily: mono }}>▸ {p.status}</div>
          </div>))}
      </div>}
      {cLog.length > 0 && <div className="rounded-xl p-2 space-y-1" style={{ background: "#101216", border: `1px solid ${C.line}`, fontFamily: mono }}>
        {cLog.map((l, i) => <div key={i} className="text-[10.5px] leading-snug pop" style={{ color: l[1] }}>▸ {l[0]}</div>)}
      </div>}
      <Banner>An engine that can lower its own grading scale isn't self-improving — it's self-deceiving.</Banner>
      <div className="text-[11px]" style={{ color: C.dim }}>Class 2 — the Laws, spend caps, pricing, this registry, the improvement loop itself — always queues for you. The improver never modifies the grader or itself.</div>
    </div>
  );
}

/* =====================================================
   APP SHELL
   ===================================================== */
export default function App() {
  const [tab, setTab] = useState("flow");
  const tabs = [
    { k: "flow", label: "Flow", icon: <Globe size={16} /> },
    { k: "bracket", label: "Bracket", icon: <Skull size={16} /> },
    { k: "engine", label: "Engine", icon: <Database size={16} /> },
    { k: "adv", label: "Adversary", icon: <ShieldAlert size={16} /> },
    { k: "price", label: "Price", icon: <Wallet size={16} /> },
    { k: "grades", label: "Grades", icon: <Award size={16} /> },
  ];
  return (
    <div className="min-h-screen w-full flex justify-center" style={{ background: C.bg, fontFamily: font }}>
      <Css />
      <div className="w-full max-w-md flex flex-col min-h-screen">
        <header className="px-4 pt-4 pb-2 sticky top-0 z-10" style={{ background: C.bg }}>
          <div className="rounded-xl px-3 py-2.5 flex items-center justify-between" style={{ background: "#1b1d22", border: `1.5px solid ${C.goldHi}` }}>
            <div>
              <div className="text-[15px] font-black tracking-wide" style={{ color: C.cream }}>FULLBURN</div>
              <div className="text-[10px] font-bold" style={{ color: C.dim }}>a marketing employee that proves its own work</div>
            </div>
            <Zap size={18} color={C.goldHi} />
          </div>
        </header>
        <main className="flex-1 px-4 pb-24 pt-1 overflow-y-auto">
          {tab === "flow" && <FlowTab />}
          {tab === "bracket" && <BracketTab />}
          {tab === "engine" && <EngineTab />}
          {tab === "adv" && <AdversaryTab />}
          {tab === "price" && <PriceTab />}
          {tab === "grades" && <GradesTab />}
        </main>
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md px-4 pb-4">
          <div className="rounded-2xl flex justify-around py-2" style={{ background: "#1b1d22", border: `1px solid ${C.line}`, boxShadow: "0 -8px 30px #000000aa" }}>
            {tabs.map(t => (
              <button key={t.k} onClick={() => setTab(t.k)} className="flex flex-col items-center gap-0.5 px-1 py-1 rounded-lg"
                style={{ color: tab === t.k ? C.goldHi : C.dim }}>
                {t.icon}<span className="text-[10px] font-extrabold">{t.label}</span>
              </button>))}
          </div>
        </nav>
      </div>
    </div>
  );
}
