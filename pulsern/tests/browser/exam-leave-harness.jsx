/* Readiness exam Home, mounted the way the app mounts it.
   The exam service is stood in for. Home uses the same leave hook the app
   uses, so a confirm has to submit the committed answers, wait for the
   score, and wait until every scored item is recorded before the screen
   changes. A failed submit keeps those answers for retry. */
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import ExamCenter from "../../src/exam.jsx";
import { useExamHomeExit } from "../../src/exam-leave.js";

const QUESTIONS = [
  { key: "k1", q: { id: 11, type: "mc", cat: "Management of Care", diff: 0.4, stem: "STEM ONE", options: ["Alpha", "Beta"] } },
  { key: "k2", q: { id: 12, type: "mc", cat: "Safety & Infection Control", diff: 0.4, stem: "STEM TWO", options: ["Gamma", "Delta"] } },
];

const api = { failTimes: 0, submits: [] };

window.fetch = async (input, init = {}) => {
  const url = String(input);
  if (!url.includes("/api/exam")) return new Response("not found", { status: 404 });
  const body = JSON.parse(init.body || "{}");
  if (body.action === "status") {
    const availability = {};
    for (let form = 1; form <= 10; form += 1) availability[form] = { items: 55, cases: 5 };
    return Response.json({ availability });
  }
  if (body.action === "start") {
    return Response.json({ attemptId: `attempt-${api.submits.length + 1}`, sequence: QUESTIONS });
  }
  if (body.action === "submit") {
    api.submits.push(JSON.parse(JSON.stringify(body)));
    if (api.failTimes > 0) {
      api.failTimes -= 1;
      return Response.json({ error: "Score didn't save. Try again." }, { status: 503 });
    }
    const graded = body.responses.map((response) => {
      const item = QUESTIONS.find((entry) => entry.key === response.key);
      return {
        key: response.key,
        ok: response.sel?.[0] === 0,
        q: { ...item.q, answer: 0, rationale: "The first option is the one this form scores." },
      };
    });
    const correct = graded.filter((item) => item.ok).length;
    return Response.json({
      pct: graded.length ? Math.round((correct / graded.length) * 100) : 0,
      correct,
      total: graded.length,
      graded,
    });
  }
  return Response.json({ error: "unknown action" }, { status: 400 });
};

function Host() {
  const log = useRef([]);
  const [place, setPlace] = useState("exam");
  const [session, setSession] = useState({ exam: false, inSession: false, hasDraft: false });
  const examLeave = useExamHomeExit((destination) => {
    log.current.push({ event: "home", destination });
    setPlace(destination);
  });
  useEffect(() => {
    window.T.ready = true;
  }, []);
  window.T.log = () => log.current.map((entry) => ({ ...entry }));
  window.T.submits = () => api.submits.map((entry) => ({
    attemptId: entry.attemptId,
    keys: entry.keys,
    responses: entry.responses,
    timedOut: entry.timedOut,
  }));
  window.T.fail = (times) => { api.failTimes = times; api.submits.length = 0; };
  return (
    <div>
      <p data-testid="place">{place}</p>
      <button type="button" onClick={() => examLeave.confirm(session.exam, "home")}>Home</button>
      {place === "exam" && (
        <ExamCenter
          record={(item, ok) => { log.current.push({ event: "record", id: item.id, ok }); }}
          examResults={{}}
          setExamResults={() => {}}
          cats={["Management of Care", "Safety & Infection Control"]}
          isOwner
          onSession={setSession}
          bindExit={examLeave.bindExit}
          onScored={examLeave.onScored}
          onLeaveSubmit={examLeave.onLeaveSubmit}
        />
      )}
    </div>
  );
}

window.T = { ready: false };
createRoot(document.getElementById("host")).render(<Host />);
