/* Home and section changes. Pure decisions so a mid-round exit can be
   tested without rendering the app.
   Checked answers and graded cards are already in the saved blob. What a
   leave clears is the open screen: an unchecked selection and the place
   in the round. A readiness exam is different: the attempt is already
   burned, so leaving scores what was submitted and then goes home. */

export function hasDraftAnswer(q, sel, order = []) {
  if (!q) return false;
  if (q.type === "order") return order.length > 0;
  if (q.type === "calc") return String(sel ?? "").trim().length > 0;
  if (q.type === "bowtie") {
    const picked = sel ?? {};
    return (picked.actions?.length ?? 0) > 0
      || (picked.parameters?.length ?? 0) > 0
      || Number.isInteger(picked.condition);
  }
  if (q.type === "matrix" || q.type === "cloze") {
    return Array.isArray(sel) && sel.some((value) => value != null && value !== "");
  }
  return Array.isArray(sel) && sel.length > 0;
}

export function leaveConfirm(session, destination = "home") {
  if (!session?.exam && !session?.inSession) return null;
  if (session.exam) {
    return {
      title: "End the exam and go home?",
      body: "Answers you've already moved past are scored. The question on screen counts once you submit it. This exam is taken once. Your score is saved, then PulseRN takes you home.",
      confirmLabel: "End exam and go home",
      cancelLabel: "Stay in the exam",
    };
  }
  const title = destination === "home"
    ? "Go home?"
    : destination === "tour"
      ? "Leave this round for the tour?"
      : "Leave this round?";
  const confirmLabel = destination === "home"
    ? "Go home"
    : destination === "tour"
      ? "Start the tour"
      : "Leave round";
  const body = session.hasDraft
    ? "Checked answers and graded cards stay saved. The open question clears, along with your place in the round."
    : "Checked answers and graded cards stay saved. Your place in the round clears.";
  return { title, body, confirmLabel, cancelLabel: "Keep studying" };
}
