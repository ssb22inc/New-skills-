/* The floating 🧪 button: where it may sit, how a drop is remembered, and
   that it always settles off buttons, the nav row, and the tab bar. */
import { describe, it, expect } from "vitest";
import {
  FAB_SIZE, FAB_MARGIN, PARK_W, PARK_H, DEFAULT_ANCHOR, FAB_STORE_KEY, clampPos, rectsOverlap, hitsAny, findClearSpot,
  anchorToPx, pxToAnchor, normalizeAnchor, loadAnchor, saveAnchor, clearAnchor, isDrag, band,
} from "../src/float-pos.js";

const phone = { vw: 390, vh: 844, top: 67, bottom: 767 };      // under header, above tab bar
const desk = { vw: 1280, vh: 800, top: 71, bottom: 723 };
const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
const box = (p) => ({ x: p.x, y: p.y, w: FAB_SIZE, h: FAB_SIZE });

describe("clamping", () => {
  it("keeps the button inside the usable band", () => {
    expect(clampPos({ x: -100, y: -100 }, phone)).toEqual({ x: FAB_MARGIN, y: Math.max(FAB_MARGIN, phone.top) });
    const b = band(phone);
    expect(clampPos({ x: 9999, y: 9999 }, phone)).toEqual({ x: phone.vw - FAB_SIZE - FAB_MARGIN, y: b.maxY });
    expect(b.maxY + FAB_SIZE).toBeLessThanOrEqual(phone.bottom);
  });
  it("never lets the button cover the tab bar", () => {
    const tabBar = { x: 0, y: 777, w: 390, h: 67 };
    const p = clampPos({ x: 200, y: 900 }, phone);
    expect(rectsOverlap(box(p), tabBar)).toBe(false);
  });
});

describe("anchor memory", () => {
  it("round-trips side and height", () => {
    const a = pxToAnchor({ x: 12, y: 300 }, phone);
    expect(a.side).toBe("left");
    const p = anchorToPx(a, phone);
    expect(p.x).toBe(FAB_MARGIN);
    expect(Math.abs(p.y - 300)).toBeLessThanOrEqual(1);
    expect(pxToAnchor({ x: 330, y: 300 }, phone).side).toBe("right");
  });
  it("adapts to another screen size by fraction", () => {
    const a = { side: "right", y: 0.5 };
    const p = anchorToPx(a, desk);
    expect(p.x).toBe(desk.vw - FAB_SIZE - FAB_MARGIN);
    const b = band(desk);
    expect(p.y).toBe(Math.round(b.top + 0.5 * (b.maxY - b.top)));
  });
  it("stores under its own key and survives junk", () => {
    const s = memStore();
    expect(loadAnchor(s)).toEqual(DEFAULT_ANCHOR);
    saveAnchor(s, { side: "left", y: 0.25 });
    expect(JSON.parse(s.m.get(FAB_STORE_KEY))).toEqual({ side: "left", y: 0.25 });
    expect(loadAnchor(s)).toEqual({ side: "left", y: 0.25 });
    s.setItem(FAB_STORE_KEY, "{not json");
    expect(loadAnchor(s)).toEqual(DEFAULT_ANCHOR);
    expect(normalizeAnchor({ side: "up", y: 7 })).toEqual({ side: "right", y: 1 });
    clearAnchor(s);
    expect(loadAnchor(s)).toEqual(DEFAULT_ANCHOR);
    expect(loadAnchor(null)).toEqual(DEFAULT_ANCHOR);
    expect(() => saveAnchor({ setItem() { throw new Error("quota"); } }, DEFAULT_ANCHOR)).not.toThrow();
  });
});

describe("settling clear of every target", () => {
  /* A phone practice question: answer options, Check, and the sticky
     Back / Skip / Next row. */
  const options = [0, 1, 2, 3].map((i) => ({ x: 35, y: 260 + i * 70, w: 320, h: 58 }));
  const check = { x: 35, y: 560, w: 120, h: 44 };
  const navRow = { x: 20, y: 640, w: 350, h: 120 };
  const blocks = [...options, check, navRow];

  it("default spot covers nothing", () => {
    const spot = findClearSpot(DEFAULT_ANCHOR, phone, blocks);
    expect(spot.clear).toBe(true);
    expect(hitsAny(box(spot), blocks)).toBe(false);
    expect(spot.side).toBe("right");
  });
  it("a drop right on top of Next snaps to the nearest clear spot on an edge", () => {
    const next = { x: 250, y: 700, w: 110, h: 48 };
    const dropped = clampPos({ x: next.x + 20, y: next.y }, phone);
    const spot = findClearSpot({ ...dropped, side: pxToAnchor(dropped, phone).side }, phone, [...blocks, next]);
    expect(spot.clear).toBe(true);
    expect(hitsAny(box(spot), [...blocks, next])).toBe(false);
    expect([FAB_MARGIN, phone.vw - FAB_SIZE - FAB_MARGIN]).toContain(spot.x);
  });
  it("hops to the other edge when that is a much shorter move", () => {
    const wallRight = { x: 300, y: 0, w: 90, h: 844 };
    const spot = findClearSpot({ side: "right", y: 0.5 }, phone, [wallRight]);
    expect(spot.side).toBe("left");
    expect(spot.clear).toBe(true);
  });
  it("parks a half-size tab off every control when no full spot is clear", () => {
    const wall = { x: 16, y: phone.top, w: 358, h: phone.bottom - phone.top };
    const tabBar = { x: 0, y: phone.bottom, w: 390, h: phone.vh - phone.bottom, primary: true };
    const next = { x: 250, y: 700, w: 120, h: 52, primary: true };
    const blocks = [wall, tabBar, next];
    const spot = findClearSpot(DEFAULT_ANCHOR, phone, blocks);
    const rect = { x: spot.x, y: spot.y, w: spot.w ?? FAB_SIZE, h: spot.h ?? FAB_SIZE };
    expect(spot.parked).toBe(true);
    expect(spot.clear).toBe(true);
    expect(hitsAny(rect, blocks)).toBe(false);
    expect(rectsOverlap(rect, tabBar)).toBe(false);
    expect(rectsOverlap(rect, next)).toBe(false);
    expect(rect.w).toBe(PARK_W);
    expect(rect.h).toBe(PARK_H);
    const onScreen = Math.max(0, Math.min(rect.x + rect.w, phone.vw) - Math.max(rect.x, 0));
    expect(onScreen).toBeGreaterThan(0);
  });
  it("does not sit on a control even when the whole screen is blocked", () => {
    const wall = { x: 0, y: 0, w: 390, h: 844 };
    const spot = findClearSpot(DEFAULT_ANCHOR, phone, [wall]);
    const rect = { x: spot.x, y: spot.y, w: spot.w ?? FAB_SIZE, h: spot.h ?? FAB_SIZE };
    expect(spot.parked).toBe(true);
    expect(hitsAny(rect, [wall])).toBe(false);
  });
  it("on a desktop the default sits in the free right margin", () => {
    const column = { x: 80, y: 71, w: 1120, h: 650 };
    const spot = findClearSpot(DEFAULT_ANCHOR, desk, [column]);
    expect(spot.clear).toBe(true);
    expect(spot.x).toBe(desk.vw - FAB_SIZE - FAB_MARGIN);
  });
});

describe("tap versus drag", () => {
  it("a small wobble is still a tap", () => {
    expect(isDrag(3, 4)).toBe(false);
    expect(isDrag(5, 5)).toBe(true);
  });
});
