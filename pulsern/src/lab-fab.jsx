import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  FAB_SIZE, FAB_MARGIN, DEFAULT_ANCHOR, anchorToPx, clampPos, clearAnchor, findClearSpot,
  isDrag, loadAnchor, pxToAnchor, saveAnchor,
} from "./float-pos.js";

/* The floating 🧪 study-toolkit button. Students drag it anywhere (touch,
   pen, or mouse via pointer events); the spot is remembered on this device.
   It always settles on a clear spot along an edge, so it never sits on
   Next, Check, Skip, Back, a grade button, an answer, or the tab bar.
   Tap (not drag), Enter, or Space opens the toolkit. Arrow keys move it
   (Up/Down slide along the edge, Left/Right switch edge), so dragging is
   never the only way. */

export const LABFAB_RESET_EVENT = "pulsern:labfab-reset";
const SETTLE_KEY_EVENT = "pulsern:lab-settle-key";

/* Screens call this with the question, case step, or card on screen so a
   new item re-checks the button even when the text nodes are reused. */
export function useLabSettleKey(key) {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(SETTLE_KEY_EVENT, { detail: key ?? "" }));
  }, [key]);
}
export function resetLabFab() {
  try { clearAnchor(window.localStorage); } catch { /* private mode */ }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(LABFAB_RESET_EVENT));
}

/* Controls, and the reading surfaces a student needs to answer: the stem,
   the choices, the rationale, an exhibit, the case chart, and any other
   visible text. Header and tab bar are kept out through the usable band. */
const TARGETS = [
  "button", "a[href]", "input", "select", "textarea", "summary", "label",
  "[role=radio]", "[role=checkbox]", "[role=button]", "[role=tab]", "[tabindex]:not([tabindex='-1'])",
  ".flashcard", ".grades", ".q-nav-wrap", ".bigbtn", ".fchip",
  ".stem", ".rationale", ".exhibit", ".exhibit-body", ".exhibit-tab", ".chart", ".case-chart", ".note", ".fc-text",
  ".exh-wrap", ".exh-svg", ".dg-wrap", ".dg-svg", ".fc-scale", ".ngn-matrix", ".mx-row",
  "figure", "img", "svg", "table", "canvas", "video",
  "p", "li", "td", "th", "h1", "h2", "h3",
  /* Rewards cards only (every rewards class starts with rw-), so #183's
     placement on every other screen is unchanged. */
  ":is([class^='rw-'],[class*=' rw-']) :is(dt,dd,span.mono)", ".rw-next-head > span", ".rw-best",
].join(",");

function storage() {
  try { return window.localStorage; } catch { return null; }
}

function measureView() {
  const vw = document.documentElement.clientWidth || window.innerWidth;
  const vh = window.innerHeight;
  const header = document.querySelector("header.top");
  const tabs = document.querySelector("nav.tabs");
  const hb = header ? header.getBoundingClientRect().bottom : 0;
  const tt = tabs ? tabs.getBoundingClientRect().top : vh;
  return { vw, vh, top: Math.max(0, hb) + FAB_MARGIN, bottom: Math.min(vh, tt) - FAB_MARGIN };
}

function collectBlocks(self) {
  const out = [];
  const vh = window.innerHeight;
  for (const el of document.querySelectorAll(TARGETS)) {
    if (self && (el === self || self.contains(el))) continue;
    if (el.closest(".lab-drawer, header.top, nav.tabs, .lab-overlay, [aria-hidden='true'], [inert]")) continue;
    const label = `${el.getAttribute("aria-label") || ""} ${el.textContent || ""}`;
    const primary = !!el.closest(".grades, .q-nav-wrap, .bigbtn") || /\b(Next|Check answer|Again|Hard|Good|Easy)\b/.test(label);
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > vh) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || cs.pointerEvents === "none") continue;
    out.push({ x: r.left, y: r.top, w: r.width, h: r.height, primary });
  }
  return out;
}

export function LabFab({ onOpen, hidden = false, open = false, settleKey = "", btnRef: outerRef }) {
  const innerRef = useRef(null);
  const btnRef = outerRef ?? innerRef;
  const anchor = useRef(DEFAULT_ANCHOR);
  const drag = useRef(null);
  const suppressClick = useRef(false);
  const [pos, setPos] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [moved, setMoved] = useState(false);
  const [contentKey, setContentKey] = useState("");

  useEffect(() => {
    const onKey = (e) => setContentKey(String(e.detail ?? ""));
    window.addEventListener(SETTLE_KEY_EVENT, onKey);
    return () => window.removeEventListener(SETTLE_KEY_EVENT, onKey);
  }, []);

  const settle = useCallback(() => {
    if (drag.current?.active || typeof window === "undefined") return;
    const view = measureView();
    const spot = findClearSpot(anchorToPx(anchor.current, view), view, collectBlocks(btnRef.current));
    const next = { x: spot.x, y: spot.y, w: spot.w ?? FAB_SIZE, h: spot.h ?? FAB_SIZE, parked: !!spot.parked };
    setPos((p) => (p && p.x === next.x && p.y === next.y && p.w === next.w && p.h === next.h && p.parked === next.parked ? p : next));
  }, [btnRef]);

  useLayoutEffect(() => {
    anchor.current = loadAnchor(storage());
    settle();
  }, [settle]);

  /* The toolkit hides this button while it is open, which is exactly when
     Reset is on screen. The listener has to stay up through that, or the
     click clears storage and the in-memory anchor never moves. */
  useEffect(() => {
    const onReset = () => {
      anchor.current = { ...DEFAULT_ANCHOR };
      setMoved(false);
      settle();
    };
    window.addEventListener(LABFAB_RESET_EVENT, onReset);
    return () => window.removeEventListener(LABFAB_RESET_EVENT, onReset);
  }, [settle]);

  /* Coming back from hidden, storage is the source of truth: Reset may
     have cleared it while this button was not on screen. */
  useEffect(() => {
    if (hidden) return;
    anchor.current = loadAnchor(storage());
    settle();
  }, [hidden, settle]);

  /* Re-settle when the screen under the button changes. One check per
     frame: a new question, a rationale, a chart, or text that grows. */
  useEffect(() => {
    if (hidden) return undefined;
    let raf = 0;
    const root = document.querySelector("main.body") || document.body;
    let ro = null;
    const watch = () => {
      ro?.observe(root);
      root.querySelectorAll(".stem, .rationale, .chart, .opts, .case-chart, .case-chart-bar, .case-chart-body, .flashcard, .card, .grades, .exh-wrap, .exh-svg, .dg-wrap, .ngn-matrix, .mx-row, figure, table").forEach((el) => ro?.observe(el));
    };
    const soon = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; watch(); settle(); });
    };
    ro = typeof ResizeObserver === "function" ? new ResizeObserver(soon) : null;
    soon();
    window.addEventListener("scroll", soon, { passive: true });
    window.addEventListener("resize", soon);
    const mo = typeof MutationObserver === "function" ? new MutationObserver(soon) : null;
    mo?.observe(root, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ["class", "style", "hidden", "aria-expanded"],
    });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", soon);
      window.removeEventListener("resize", soon);
      mo?.disconnect();
      ro?.disconnect();
    };
  }, [hidden, settle, settleKey, contentKey]);

  const onPointerDown = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const start = pos ?? { x: 0, y: 0 };
    drag.current = { id: e.pointerId, px: e.clientX, py: e.clientY, x: start.x, y: start.y, active: false };
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* synthetic pointer */ }
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.px; const dy = e.clientY - d.py;
    if (!d.active) {
      if (!isDrag(dx, dy)) return;
      d.active = true;
      setDragging(true);
    }
    e.preventDefault();
    setPos(clampPos({ x: d.x + dx, y: d.y + dy }, measureView()));
  };
  const finish = (e) => {
    const d = drag.current;
    if (!d || (e && d.id !== e.pointerId)) return;
    drag.current = null;
    try { e?.currentTarget?.releasePointerCapture?.(d.id); } catch { /* synthetic pointer */ }
    if (!d.active) return;
    suppressClick.current = true;
    setTimeout(() => { suppressClick.current = false; }, 400);
    setDragging(false);
    const view = measureView();
    const dropped = clampPos({ x: d.x + (e.clientX - d.px), y: d.y + (e.clientY - d.py) }, view);
    anchor.current = pxToAnchor(dropped, view);
    saveAnchor(storage(), anchor.current);
    setMoved(true);
    const spot = findClearSpot({ ...dropped, side: anchor.current.side }, view, collectBlocks(btnRef.current));
    setPos({ x: spot.x, y: spot.y, w: spot.w ?? FAB_SIZE, h: spot.h ?? FAB_SIZE, parked: !!spot.parked });
  };
  const onClick = (e) => {
    if (suppressClick.current) { e.preventDefault(); suppressClick.current = false; return; }
    onOpen?.();
  };
  const onKeyDown = (e) => {
    const view = measureView();
    let next = null;
    const cur = pos ?? anchorToPx(anchor.current, view);
    if (e.key === "ArrowUp") next = { x: cur.x, y: cur.y - 32 };
    else if (e.key === "ArrowDown") next = { x: cur.x, y: cur.y + 32 };
    else if (e.key === "ArrowLeft") next = { x: 0, y: cur.y };
    else if (e.key === "ArrowRight") next = { x: view.vw, y: cur.y };
    if (!next) return;
    e.preventDefault();
    e.stopPropagation();
    const c = clampPos(next, view);
    anchor.current = pxToAnchor(c, view);
    saveAnchor(storage(), anchor.current);
    setMoved(true);
    const spot = findClearSpot({ ...c, side: anchor.current.side }, view, collectBlocks(btnRef.current));
    setPos({ x: spot.x, y: spot.y, w: spot.w ?? FAB_SIZE, h: spot.h ?? FAB_SIZE, parked: !!spot.parked });
  };

  if (hidden) return null;
  const w = pos?.w ?? FAB_SIZE;
  const h = pos?.h ?? FAB_SIZE;
  const style = pos
    ? { transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`, width: w, height: h }
    : { visibility: "hidden", width: FAB_SIZE, height: FAB_SIZE };
  return (
    <button
      ref={btnRef}
      type="button"
      className={"fab lab-fab" + (dragging ? " dragging" : "") + (moved ? " moved" : "") + (pos?.parked ? " parked" : "")}
      style={style}
      aria-label="Study toolkit: lab ranges, quick lookup, and help. Drag to move, or use arrow keys"
      aria-haspopup="dialog"
      aria-expanded={open}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onClick={onClick}
      onKeyDown={onKeyDown}
      data-x={pos?.x ?? ""}
      data-y={pos?.y ?? ""}
    >
      <span aria-hidden="true">🧪</span>
    </button>
  );
}
