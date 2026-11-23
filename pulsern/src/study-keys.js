import { useEffect, useRef } from "react";

/* One set of keyboard shortcuts across Practice, Case Study, and Cards.
     1–9      pick an option (Cards: 1–4 grade Again / Hard / Good / Easy)
     Enter    check the answer, then go to the next item (Cards: flip)
     ← / →    back / next
   Nothing fires while typing, inside a dialog, the lab drawer, or a menu.
   Deterministic plain code. */

const FIELD = /^(INPUT|TEXTAREA|SELECT)$/;

export function studyKeyAction(event) {
  if (!event) return null;
  const key = typeof event === "string" ? event : event.key;
  const target = typeof event === "string" ? null : event.target;
  if (typeof event === "object" && (event.altKey || event.ctrlKey || event.metaKey)) return null;
  if (target?.isContentEditable) return null;
  const tag = target?.tagName?.toUpperCase?.() ?? "";
  if (FIELD.test(tag)) return null;
  if (typeof target?.closest === "function" && target.closest("[role='dialog'], .lab-drawer, .fab-menu, .menu-panel, .sheet")) return null;
  if (key === "ArrowLeft") return { type: "back" };
  if (key === "ArrowRight") return { type: "next" };
  if (key === "Enter") {
    /* Enter on a focused control already activates it. */
    if (tag === "BUTTON" || tag === "A" || tag === "SUMMARY") return null;
    return { type: "primary" };
  }
  if (/^[1-9]$/.test(key)) return { type: "pick", index: Number(key) - 1 };
  return null;
}

/* handlers: { back, next, primary, pick(index) } — any may be missing.
   A ref ({ current: handlers }) is accepted too, so a screen can register
   the hook before its early returns and fill the handlers in later. */
export function useStudyKeys(handlers, active = true) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (document.querySelector(".tour-overlay, .sheet-overlay, .menu-panel")) return;
      const a = studyKeyAction(e);
      if (!a) return;
      const raw = ref.current ?? {};
      const h = (raw && typeof raw === "object" && "current" in raw ? raw.current : raw) ?? {};
      const fn = a.type === "pick" ? (h.pick ? () => h.pick(a.index) : null) : h[a.type];
      if (!fn) return;
      e.preventDefault();
      fn();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);
}

export const SHORTCUT_HINT = "Keys: 1–9 pick · Enter check / next · ← → move";
export const CARD_SHORTCUT_HINT = "Keys: Enter flip · 1–4 grade · ← → move";
