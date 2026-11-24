/* Where the floating 🧪 button sits. Deterministic plain code.

   The student can drag the button anywhere. What we remember is an
   anchor — which edge it was dropped nearest, and how far down the usable
   band it sat — so the spot survives rotation and different screens.
   Wherever the anchor lands, the button then settles on the nearest spot
   along that edge that covers no button, answer option, card, nav row, or
   the tab bar ("chat-head" edge snap). If one edge is crowded it may hop
   to the other edge when that is a much shorter move. */

export const FAB_SIZE = 52;
export const FAB_MARGIN = 10;
/* When a full-size button has no clear edge, a short tab still has to
   stay off every control. It can hang halfway off the screen. */
export const PARK_W = 28;
export const PARK_H = 44;
export const FAB_STORE_KEY = "pulsern-labfab-v1";
export const DEFAULT_ANCHOR = Object.freeze({ side: "right", y: 0.62 });
const SIDE_SWITCH_COST = 140;

export function clamp(n, lo, hi) {
  if (hi < lo) return lo;
  return Math.min(hi, Math.max(lo, n));
}

/* view: { vw, vh, top, bottom } — top/bottom bound the usable band
   (under the header, above the tab bar). */
export function band(view, size = FAB_SIZE, margin = FAB_MARGIN) {
  const top = Math.max(margin, view.top ?? margin);
  const bottom = Math.min(view.vh - margin, view.bottom ?? view.vh - margin);
  return { top, maxY: Math.max(top, bottom - size), minX: margin, maxX: Math.max(margin, view.vw - size - margin) };
}

export function clampPos(pos, view, size = FAB_SIZE, margin = FAB_MARGIN) {
  const b = band(view, size, margin);
  return { x: clamp(Math.round(pos.x), b.minX, b.maxX), y: clamp(Math.round(pos.y), b.top, b.maxY) };
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function hitsAny(rect, blocks, pad = 0) {
  const r = { x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2 };
  return (blocks ?? []).some((b) => rectsOverlap(r, b));
}

export function sideX(side, view, size = FAB_SIZE, margin = FAB_MARGIN) {
  const b = band(view, size, margin);
  return side === "left" ? b.minX : b.maxX;
}

export function anchorToPx(anchor, view, size = FAB_SIZE, margin = FAB_MARGIN) {
  const a = normalizeAnchor(anchor);
  const b = band(view, size, margin);
  return { x: sideX(a.side, view, size, margin), y: Math.round(b.top + a.y * (b.maxY - b.top)), side: a.side };
}

export function pxToAnchor(pos, view, size = FAB_SIZE, margin = FAB_MARGIN) {
  const b = band(view, size, margin);
  const side = pos.x + size / 2 < view.vw / 2 ? "left" : "right";
  const span = b.maxY - b.top;
  const y = span > 0 ? clamp((pos.y - b.top) / span, 0, 1) : 0;
  return { side, y: Math.round(y * 1000) / 1000 };
}

export function normalizeAnchor(a) {
  if (!a || typeof a !== "object") return { ...DEFAULT_ANCHOR };
  const side = a.side === "left" ? "left" : a.side === "right" ? "right" : DEFAULT_ANCHOR.side;
  const y = typeof a.y === "number" && Number.isFinite(a.y) ? clamp(a.y, 0, 1) : DEFAULT_ANCHOR.y;
  return { side, y };
}

/* Nearest clear spot to the anchor, edge-snapped. blocks are rects
   ({x,y,w,h}) the button must not cover; pad keeps a small gap. */
export function findClearSpot(anchor, view, blocks, { size = FAB_SIZE, margin = FAB_MARGIN, pad = 6, step = 4 } = {}) {
  const start = anchor && typeof anchor.x === "number" ? anchor : anchorToPx(anchor, view, size, margin);
  const side = start.side ?? (start.x + size / 2 < view.vw / 2 ? "left" : "right");
  const b = band(view, size, margin);
  const ay = clamp(start.y, b.top, b.maxY);
  let best = null;
  for (const s of [side, side === "left" ? "right" : "left"]) {
    const x = sideX(s, view, size, margin);
    const penalty = s === side ? 0 : SIDE_SWITCH_COST;
    for (let d = 0; d <= b.maxY - b.top + step; d += step) {
      if (best && d + penalty >= best.cost) break;
      let found = null;
      for (const y of d === 0 ? [ay] : [ay - d, ay + d]) {
        if (y < b.top || y > b.maxY) continue;
        if (!hitsAny({ x, y, w: size, h: size }, blocks, pad)) { found = y; break; }
      }
      if (found != null) {
        const cost = d + penalty;
        if (!best || cost < best.cost) best = { x, y: Math.round(found), side: s, cost };
        break;
      }
    }
  }
  if (best) return { x: best.x, y: best.y, w: size, h: size, side: best.side, clear: true, parked: false };
  return parkTab(ay, view, guardChrome(view, blocks), side);
}

/* The header and the tab bar are not in the caller's block list (the
   usable band keeps a full-size button out of them). A parked tab has to
   be told about them or it will sit on Home, the menu, or a tab. */
function guardChrome(view, blocks) {
  const extra = [];
  if ((view.top ?? 0) > 0) extra.push({ x: 0, y: 0, w: view.vw, h: view.top });
  const bottom = view.bottom ?? view.vh;
  if (bottom < view.vh) extra.push({ x: 0, y: bottom, w: view.vw, h: view.vh - bottom });
  return [...(blocks ?? []), ...extra];
}

function overlapArea(rect, block) {
  const x = Math.max(rect.x, block.x);
  const y = Math.max(rect.y, block.y);
  const r = Math.min(rect.x + rect.w, block.x + block.w);
  const b = Math.min(rect.y + rect.h, block.y + block.h);
  if (r <= x || b <= y) return 0;
  return (r - x) * (b - y);
}

/* A place the button can occupy without covering any control. Prefer a
   visible edge tab; if the whole screen is blocked, hang fully outside
   rather than sit on a button. Primary controls (Next, Check, grades,
   the tab bar) are never covered, same as every other control. */
function parkTab(preferY, view, blocks, side) {
  const w = PARK_W;
  const h = PARK_H;
  const xs = side === "left"
    ? [0, -Math.round(w / 2), view.vw - w, view.vw - Math.round(w / 2), -w, view.vw]
    : [view.vw - w, view.vw - Math.round(w / 2), 0, -Math.round(w / 2), view.vw, -w];
  let best = null;
  for (const x of xs) {
    for (let y = -h; y <= view.vh; y += 4) {
      const rect = { x, y, w, h };
      if (blocks.some((b) => overlapArea(rect, b) > 0)) continue;
      const onW = Math.max(0, Math.min(x + w, view.vw) - Math.max(x, 0));
      const onH = Math.max(0, Math.min(y + h, view.vh) - Math.max(y, 0));
      const visible = onW * onH;
      const score = visible * 1000 - Math.abs(y - preferY);
      if (!best || score > best.score) best = { x, y, w, h, side: x + w / 2 < view.vw / 2 ? "left" : "right", score };
    }
  }
  if (!best) return { x: side === "left" ? -w : view.vw, y: 0, w, h, side, clear: true, parked: true };
  return { x: best.x, y: best.y, w, h, side: best.side, clear: true, parked: true };
}

export function loadAnchor(storage) {
  try {
    const raw = storage?.getItem?.(FAB_STORE_KEY);
    if (!raw) return { ...DEFAULT_ANCHOR };
    return normalizeAnchor(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_ANCHOR };
  }
}

export function saveAnchor(storage, anchor) {
  try { storage?.setItem?.(FAB_STORE_KEY, JSON.stringify(normalizeAnchor(anchor))); } catch { /* private mode */ }
}

export function clearAnchor(storage) {
  try { storage?.removeItem?.(FAB_STORE_KEY); } catch { /* private mode */ }
}

/* A press becomes a drag only after it travels this far, so a slightly
   wobbly tap still opens the toolkit. */
export const DRAG_THRESHOLD = 6;
export function isDrag(dx, dy, threshold = DRAG_THRESHOLD) {
  return Math.hypot(dx, dy) > threshold;
}
