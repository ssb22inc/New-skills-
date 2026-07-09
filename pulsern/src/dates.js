/* ---- date helpers for real multi-day spacing ---- */
/* Local-date helpers. NEVER use toISOString() here — it returns the UTC date,
   so a student studying at 9 PM in Florida would be logged as "tomorrow":
   streaks would break and flashcards would come due a day early/late. */
export const fmtLocal = (d) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
export const todayStr = () => fmtLocal(new Date());
export const yesterdayStr = () => { const d = new Date(); d.setDate(d.getDate() - 1); return fmtLocal(d); };
export const twoDaysAgoStr = () => { const d = new Date(); d.setDate(d.getDate() - 2); return fmtLocal(d); };
export const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return fmtLocal(d); };
export const weekStart = () => {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to local Monday
  return fmtLocal(d);
};
