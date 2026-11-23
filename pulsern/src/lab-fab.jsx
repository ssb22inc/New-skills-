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
export function resetLabFab() {
  try { clearAnchor(window.localStorage); } catch { /* private mode */ }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(LABFAB_RESET_EVENT));
}

/* Everything a tap can land on. Header and tab bar are kept out through
   the usable band instead. */
const TARGETS = [
  "button", "a[href]", "input", "select", "textarea", "summary", "label",
  "[role=radio]", "[role=checkbox]", "[role=button]", "[role=tab]", "[tabindex]:not([tabindex='-1'])",
  ".flashcard", ".grades", ".q-nav-wrap", ".bigbtn", ".fchip",
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
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > vh) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || cs.pointerEvents === "none") continue;
    out.push({ x: r.left, y: r.top, w: r.width, h: r.height });
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

  const settle = useCallback(() => {
    if (drag.current?.active || typeof window === "undefined") return;
    const view = measureView();
    const spot = findClearSpot(anchorToPx(anchor.current, view), view, collectBlocks(btnRef.current));
    setPos((p) => (p && p.x === spot.x && p.y === spot.y ? p : { x: spot.x, y: spot.y }));
  }, [btnRef]);

  useLayoutEffect(() => {
    anchor.current = loadAnchor(storage());
    settle();
  }, [settle]);

  /* Re-settle whenever the screen under it changes: resize, scroll end,
     new question, opened sheet, a different tab. */
  useEffect(() => {
    if (hidden) return undefined;
    let raf = 0; let t = 0;
    const soon = (delay = 120) => { clearTimeout(t); t = setTimeout(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(settle); }, delay); };
    soon(0);
    const onScroll = () => soon(180);
    const onResize = () => soon(60);
    const onReset = () => { anchor.current = { ...DEFAULT_ANCHOR }; setMoved(false); soon(0); };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener(LABFAB_RESET_EVENT, onReset);
    const root = document.querySelector("main.body") || document.body;
    const mo = typeof MutationObserver === "function" ? new MutationObserver(() => soon(140)) : null;
    mo?.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden"] });
    return () => {
      clearTimeout(t); cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener(LABFAB_RESET_EVENT, onReset);
      mo?.disconnect();
    };
  }, [hidden, settle, settleKey]);

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
    setPos({ x: spot.x, y: spot.y });
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
    setPos({ x: spot.x, y: spot.y });
  };

  if (hidden) return null;
  const style = pos
    ? { transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`, width: FAB_SIZE, height: FAB_SIZE }
    : { visibility: "hidden", width: FAB_SIZE, height: FAB_SIZE };
  return (
    <button
      ref={btnRef}
      type="button"
      className={"fab lab-fab" + (dragging ? " dragging" : "") + (moved ? " moved" : "")}
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
