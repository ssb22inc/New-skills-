#!/usr/bin/env python3
"""
Emberwing Phoenix Egg — a print-in-place egg that opens into a phoenix.

Closed, it is a feather-scaled egg. The egg is cut into upright slices.
The four slices in front of the centre are split left/right and swing out
on two low hinges to become the wings; the four slices behind the centre
swing down on one hinge to become the tail; a head and neck fold up out of
the front slice. Every hinge has a keyed stop, so each feather opens to its
own fixed angle and the same phoenix pose appears every time.

    pip install manifold3d trimesh numpy
    python generate_phoenix_egg.py

Millimetres. The egg prints standing up: Z is up, slices are stacked along
Y (front = +Y), every hinge axle runs along Y. 2-D shapes below are drawn in
the X-Z plane; positive angles are counter-clockwise in that drawing.
"""
import math
import os
import sys

import numpy as np
from manifold3d import CrossSection, FillRule, JoinType, Manifold, Mesh

# ---- egg -------------------------------------------------------------------
R_MAX, Z_WIDE, H_TOP = 31.0, 20.8, 54.0
ZTOP = Z_WIDE + H_TOP
SCALES_AROUND, ROW_H, RELIEF = 16, 6.5, 1.8

# ---- slicing ---------------------------------------------------------------
GAP = 0.5            # between neighbouring slices / pieces
B_HALF = 3.0         # the fixed centre plate is 6 mm thick
SLAB_T = 3.0
N_SLAB = 4
CAP_Y = B_HALF + N_SLAB * (SLAB_T + GAP) + GAP           # 17.5


def slab_range(i):
    """i = 1..4, nearest the centre plate first (returned for the front)."""
    y0 = B_HALF + GAP + (i - 1) * (SLAB_T + GAP)
    return y0, y0 + SLAB_T


# ---- hinges ----------------------------------------------------------------
AX_R, AX_FLAT = 3.0, 2.3      # axle radius; flat cut on its underside (bridges cleanly)
HOLE_R = 3.4
FIN_R, FIN_HALF = 5.5, 20.0   # the key: a rib along the top of each axle
KEY_R, KEY_PLAY = 5.9, 4.0    # keyway radius, angular play at each stop (deg)

WING_P = (15.0, 9.0)          # right wing hinge (left is mirrored)
TAIL_P = (0.0, 8.0)
HEAD_P = (0.0, 55.0)
HUB_R = 9.0

WING_OPEN = {1: 106.0, 2: 84.0, 3: 62.0, 4: 40.0}   # slab -> opening angle
TAIL_OPEN = {1: (+1, 164.0), 2: (-1, 164.0), 3: (+1, 132.0), 4: (-1, 132.0)}
HEAD_OPEN = 190.0             # swings up and 10 degrees past vertical, onto its stop


# ---------------------------------------------------------------------------
# egg surface
# ---------------------------------------------------------------------------
def egg_radius(z):
    z = np.asarray(z, dtype=float)
    lower = np.sqrt(np.clip(R_MAX ** 2 - (z - Z_WIDE) ** 2, 0, None))
    upper = R_MAX * np.sqrt(np.clip(1 - ((z - Z_WIDE) / H_TOP) ** 2, 0, None))
    return np.where(z < Z_WIDE, lower, upper)


def feather_relief(theta, z):
    dth = 2 * math.pi / SCALES_AROUND
    out = np.zeros_like(z)
    k0 = np.floor(z / ROW_H)
    for dk in (-1, 0):
        k = k0 + dk
        v = (z - k * ROW_H) / (2 * ROW_H)
        u = theta / dth - 0.5 * (k % 2)
        u = u - np.round(u)
        half = 0.5 * (1 - np.clip(v, 0, 1) ** 1.8)
        inside = (np.abs(u) < half) & (v >= 0) & (v <= 1)
        edge = np.clip((half - np.abs(u)) / 0.07, 0, 1)
        edge = edge * edge * (3 - 2 * edge)
        blade = RELIEF * v ** 1.15 + 0.35 * np.clip(1 - np.abs(u) * 9, 0, 1) * v
        out = np.maximum(out, np.where(inside, blade * edge, 0))
    fade = np.clip(z / 2.5, 0, 1) * np.clip((ZTOP - z) / 9.0, 0, 1)
    return out * fade


def build_egg(n_theta=360, dz=0.25):
    zs = np.arange(0, ZTOP - 0.6, dz)
    th = np.linspace(0, 2 * math.pi, n_theta, endpoint=False)
    TH, ZS = np.meshgrid(th, zs)
    Rr = egg_radius(ZS) + feather_relief(TH, ZS)
    verts = np.column_stack([(Rr * np.cos(TH)).ravel(), (Rr * np.sin(TH)).ravel(), ZS.ravel()])
    nz = len(zs)
    base_c, apex = len(verts), len(verts) + 1
    verts = np.vstack([verts, [0, 0, 0], [0, 0, ZTOP]])
    idx = np.arange(nz * n_theta).reshape(nz, n_theta)
    a, b = idx[:-1, :], np.roll(idx[:-1, :], -1, axis=1)
    c, d = idx[1:, :], np.roll(idx[1:, :], -1, axis=1)
    tris = [np.column_stack([a.ravel(), b.ravel(), d.ravel()]),
            np.column_stack([a.ravel(), d.ravel(), c.ravel()]),
            np.column_stack([np.full(n_theta, base_c), np.roll(idx[0], -1), idx[0]]),
            np.column_stack([np.full(n_theta, apex), idx[-1], np.roll(idx[-1], -1)])]
    m = Manifold(Mesh(vert_properties=verts.astype(np.float32),
                      tri_verts=np.vstack(tris).astype(np.uint32)))
    assert not m.is_empty(), m.status()
    return m


# ---------------------------------------------------------------------------
# 2-D helpers (X-Z plane)
# ---------------------------------------------------------------------------
def poly(pts):
    return CrossSection([pts], FillRule.NonZero)


def circle(r, at=(0, 0), n=64):
    return CrossSection.circle(r, n).translate(list(at))


def rect(x0, x1, z0, z1):
    return poly([(x0, z0), (x1, z0), (x1, z1), (x0, z1)])


def grow(cs, d):
    return cs.offset(d, JoinType.Round, 2.0, 32)


def rot(cs, deg, about):
    return cs.translate([-about[0], -about[1]]).rotate(deg).translate(list(about))


def sector(r, a0, a1, at):
    pts = [(0.0, 0.0)] + [(r * math.cos(math.radians(a)), r * math.sin(math.radians(a)))
                          for a in np.linspace(a0, a1, max(3, int(abs(a1 - a0) / 5) + 2))]
    return poly(pts).translate(list(at))


def teardrop(r, at):
    """Circle with a 45-degree peaked roof: prints without a sagging ceiling."""
    s = r * math.sqrt(0.5)
    return (circle(r) + poly([(-s, s), (s, s), (0, r * math.sqrt(2))])).translate(list(at))


def stroke(p, q, w):
    return CrossSection.batch_hull([circle(w / 2, p, 12), circle(w / 2, q, 12)])


def outline(y):
    """Smooth egg cross-section in the plane at distance |y| from the centre."""
    zs = np.linspace(0, ZTOP, 400)
    r = egg_radius(zs)
    ok = r > abs(y) + 1e-6
    zs, xs = zs[ok], np.sqrt(r[ok] ** 2 - y * y)
    return poly([(x, z) for x, z in zip(xs, zs)] + [(-x, z) for x, z in zip(xs[::-1], zs[::-1])])


def extr(cs, y0, y1):
    """Extrude a 2-D shape from y0 to y1."""
    return cs.extrude(y1 - y0).rotate([90, 0, 0]).translate([0, y1, 0])


def turn(m, deg, about):
    """Rotate a 3-D part counter-clockwise (as drawn) about a hinge axis."""
    return (m.translate([-about[0], 0, -about[1]]).rotate([0, -deg, 0])
            .translate([about[0], 0, about[1]]))


def box(y0, y1):
    return Manifold.cube([200, y1 - y0, 200]).translate([-100, y0, -10])


# ---------------------------------------------------------------------------
# hinge parts
# ---------------------------------------------------------------------------
def axle2d(at):
    body = circle(AX_R) ^ rect(-10, 10, -AX_FLAT, 10)
    fin = sector(FIN_R, 90 - FIN_HALF, 90 + FIN_HALF, (0, 0))
    return (body + fin).translate(list(at))


def keyhole(at, sign, open_deg):
    """Hole + keyway for a part that turns `open_deg` in direction `sign`."""
    pad = FIN_HALF + KEY_PLAY
    if sign > 0:
        a0, a1 = 90 - open_deg - pad, 90 + pad
    else:
        a0, a1 = 90 - pad, 90 + open_deg + pad
    s = KEY_R * math.sqrt(0.5)
    roof = poly([(-s, s), (s, s), (0, KEY_R * math.sqrt(2))])
    return (circle(HOLE_R) + sector(KEY_R, a0, a1, (0, 0)) + roof).translate(list(at))


# ---------------------------------------------------------------------------
# the head (drawn deployed, relative to its hinge, facing -X)
# ---------------------------------------------------------------------------
def head_deployed():
    neck = poly([(-6.0, 5.0), (5.5, 5.0), (4.0, 17.0), (-5.5, 17.0)])
    head = poly([(2.0, 38.5), (-7.6, 28.4), (-8.1, 26.4), (-14.3, 11.4), (-6.2, 19.8),
                 (-5.5, 16.5), (4.0, 16.5), (7.0, 22.0), (18.5, 9.5), (9.7, 29.0),
                 (19.0, 18.2), (8.0, 32.0)])
    eye = poly([(-4.2, 28.5), (-2.0, 26.3), (0.2, 28.5), (-2.0, 30.7)])
    hub = circle(HUB_R)
    collar = poly([(-HUB_R * 0.7071, HUB_R * 0.7071), (HUB_R * 0.7071, HUB_R * 0.7071),
                   (0, HUB_R * 1.4142)])            # keeps the stowed hub self-supporting
    shape = (neck + head + hub + collar) - eye
    # lean the whole head so its weight rests on the open stop instead of falling back
    solid = neck + head + hub
    cx = sum(_centroid_x(c) for c in solid.to_polygons()) / max(solid.area(), 1e-9)
    cz = sum(_centroid_z(c) for c in solid.to_polygons()) / max(solid.area(), 1e-9)
    lean = max(0.0, 95.0 - math.degrees(math.atan2(cz, cx)))
    return shape.rotate(lean)


def _centroid_x(c):
    c = np.asarray(c); x, z = c[:, 0], c[:, 1]; xn, zn = np.roll(x, -1), np.roll(z, -1)
    cr = x * zn - xn * z
    return float(((x + xn) * cr).sum() / 6.0)


def _centroid_z(c):
    c = np.asarray(c); x, z = c[:, 0], c[:, 1]; xn, zn = np.roll(x, -1), np.roll(z, -1)
    cr = x * zn - xn * z
    return float(((z + zn) * cr).sum() / 6.0)


FLAME_A, FLAME_T = 3.0, 14.0   # flame teeth along the split between a left and right wing


def left_of_split(phase):
    """Everything left of a zig-zag 'flame' line running up the middle of the egg.
    Both slopes are steeper than 45 degrees so the teeth print without support."""
    pts, k = [], 0
    z = -5.0 - FLAME_T + phase
    while z < 125:
        pts.append((FLAME_A if k % 2 else -FLAME_A, z))
        z += FLAME_T / 2
        k += 1
    return poly([(-90, pts[0][1])] + pts + [(-90, pts[-1][1])]) ^ rect(-90, 90, -5, 120)


def head_stowed():
    return rot(head_deployed().translate(list(HEAD_P)), -HEAD_OPEN, HEAD_P)


# ---------------------------------------------------------------------------
# engraved feather detail (on the flat faces that show once opened)
# ---------------------------------------------------------------------------
def wing_strokes(sgn, top):
    out = [stroke((sgn * 5.0, 17.0), (sgn * 3.6, top - 5.0), 1.1)]
    z = 22.0
    while z < top - 8:
        x0 = sgn * (5.0 - 1.4 * (z - 17) / (top - 22))
        out.append(stroke((x0, z), (x0 + sgn * 17.0, z + 11.0), 0.9))
        z += 5.5
    return CrossSection.batch_boolean(out, __import__('manifold3d').OpType.Add)


def tail_strokes(top):
    ez = top - 21.0
    ring = lambda rx, rz: circle(1.0, n=48).scale([rx, rz]).translate([0, ez])
    out = [stroke((0, 18.0), (0, ez - 13.0), 1.1),
           ring(10.0, 13.0) - ring(8.9, 11.9),
           ring(5.6, 7.6) - ring(4.6, 6.6),
           ring(2.0, 2.8)]
    z = 20.0
    while z < ez - 16:
        for s in (-1, 1):
            out.append(stroke((s * 0.4, z), (s * 15.0, z + 10.0), 0.9))
        z += 5.5
    return CrossSection.batch_boolean(out, __import__('manifold3d').OpType.Add)


def engrave(m, strokes, region, y0, y1, depth=0.6):
    s = strokes ^ grow(region, -2.0)
    if s.is_empty():
        return m
    return m - extr(s, y1 - depth, y1 + 0.2) - extr(s, y0 - 0.2, y0 + depth)


# ---------------------------------------------------------------------------
# build
# ---------------------------------------------------------------------------
def keep_main(m, name, tol=40.0):
    parts = sorted(m.decompose(), key=lambda q: -q.volume())
    lost = sum(p.volume() for p in parts[1:])
    assert lost < tol, f"{name}: would discard {lost:.1f} mm3"
    return parts[0]


def sweep_trim(region, about, sign, open_deg, obstacle, step=0.5):
    """Remove from `region` everything that would hit `obstacle` on the way open."""
    cut = []
    a = step
    while a < open_deg + step:
        cut.append(rot(obstacle, -sign * min(a, open_deg), about))
        a += step
    OpAdd = __import__('manifold3d').OpType.Add
    return region - CrossSection.batch_boolean(cut, OpAdd)


def build(egg=None):
    """Returns {name: dict(m=Manifold, pivot=(x,z), sign=+-1, open=deg, group=str)}."""
    egg = build_egg() if egg is None else egg
    parts = {}
    BIG = rect(-90, 90, -5, 120)
    hs = head_stowed()
    OpAdd = __import__('manifold3d').OpType.Add
    arc = CrossSection.batch_boolean([rot(hs, a, HEAD_P) for a in np.arange(0, HEAD_OPEN + 1, 2.5)], OpAdd)
    head_arc = grow(arc + arc.mirror([1, 0]), 0.6)

    # ---- body: centre plate + both end caps + five axles -------------------
    body = (egg ^ box(-B_HALF, B_HALF)) + (egg ^ box(CAP_Y, 100)) + (egg ^ box(-100, -CAP_Y))
    axles = (extr(axle2d((-WING_P[0], WING_P[1])), 1.0, 20.5)
             + extr(axle2d(WING_P), 1.0, 20.5)
             + extr(axle2d(HEAD_P), 1.0, 20.0)
             + extr(axle2d(TAIL_P), -21.0, -1.0))
    assert (axles - egg).volume() < 1e-6, "an axle pokes out of the egg"
    # a small shelf on the centre plate: the stowed head prints on it (one-layer gap)
    crown = min((p for c in hs.to_polygons() for p in c), key=lambda p: p[1])
    sx0, sx1, sz = crown[0] - 2.5, crown[0] + 0.8, crown[1] - 0.25
    yb = B_HALF - 0.5
    reach = SLAB_T + GAP - 0.2
    shelf = Manifold.hull_points([(sx0, yb, sz), (sx1, yb, sz), (sx0, yb + reach + 0.5, sz), (sx1, yb + reach + 0.5, sz),
                                  (sx0, yb, sz - reach - 0.5), (sx1, yb, sz - reach - 0.5),
                                  (sx0, yb, sz - 0.01), (sx0, yb + reach + 0.5, sz - 0.4), (sx1, yb + reach + 0.5, sz - 0.4)])
    shelf2d = rect(sx0, sx1, sz - reach - 0.5, sz)
    body = keep_main(body + axles + shelf, "body")
    parts["body"] = dict(m=body, pivot=(0, 0), sign=1, open=0.0, group="body")

    # ---- head --------------------------------------------------------------
    y0, y1 = slab_range(1)
    head2d = hs - keyhole(HEAD_P, +1, HEAD_OPEN)
    parts["head"] = dict(m=keep_main(extr(head2d, y0, y1) ^ egg, "head"),
                         pivot=HEAD_P, sign=+1, open=HEAD_OPEN, group="head")

    # ---- wings: front slabs, split left / right ----------------------------
    for i in range(1, N_SLAB + 1):
        y0, y1 = slab_range(i)
        lsplit = left_of_split((i - 1) * FLAME_T / 4)
        top = float(ZTOP - 1.0 if i == 1 else Z_WIDE + H_TOP * math.sqrt(max(1 - (y1 / R_MAX) ** 2, 0)))
        for sgn, side in ((-1, "L"), (1, "R")):
            pivot = (sgn * WING_P[0], WING_P[1])
            sign = -sgn                       # left wing opens counter-clockwise
            if sgn < 0:
                half, other = grow(lsplit, -GAP / 2), BIG - grow(lsplit, 0.15)
            else:
                half, other = BIG - grow(lsplit, GAP / 2), grow(lsplit, 0.15)
            if i == 1:
                static = grow(hs, GAP) + teardrop(HUB_R + GAP, HEAD_P) + grow(shelf2d, GAP)
                moving_obstacle = other + grow(hs, 0.45) + grow(shelf2d, 0.45)
            else:
                static = teardrop(KEY_R + 0.4, HEAD_P)
                moving_obstacle = other + circle(KEY_R, HEAD_P)
            region = half - static
            region = sweep_trim(region, pivot, sign, WING_OPEN[i], moving_obstacle)
            if i == 1:
                # once fully open, the wing must clear the arc the head swings through
                region = region - rot(head_arc, -sign * WING_OPEN[i], pivot)
            region = region - keyhole(pivot, sign, WING_OPEN[i])
            m = keep_main((egg ^ box(y0, y1)) ^ extr(region, y0, y1), f"wing{side}{i}")
            m = engrave(m, wing_strokes(sgn, top), region ^ outline(y1), y0, y1)
            parts[f"wing{side}{i}"] = dict(m=keep_main(m, f"wing{side}{i}"), pivot=pivot, sign=sign,
                                           open=WING_OPEN[i], group="wings")

    # ---- tail: rear slabs, whole slices on one axle ------------------------
    for i in range(1, N_SLAB + 1):
        f0, f1 = slab_range(i)
        y0, y1 = -f1, -f0
        sign, open_deg = TAIL_OPEN[i]
        top = float(Z_WIDE + H_TOP * math.sqrt(max(1 - (f1 / R_MAX) ** 2, 0)))
        region = BIG - keyhole(TAIL_P, sign, open_deg)
        m = keep_main((egg ^ box(y0, y1)) ^ extr(region, y0, y1), f"tail{i}")
        m = engrave(m, tail_strokes(top), region ^ outline(f1), y0, y1)
        parts[f"tail{i}"] = dict(m=keep_main(m, f"tail{i}"), pivot=TAIL_P, sign=sign,
                                 open=open_deg, group="tail")
    return parts


def posed(parts, wings=0.0, tail=0.0, head=0.0):
    f = dict(body=0.0, wings=wings, tail=tail, head=head)
    return {n: turn(p["m"], p["sign"] * p["open"] * f[p["group"]], p["pivot"])
            for n, p in parts.items()}


# ---------------------------------------------------------------------------
# verification
# ---------------------------------------------------------------------------
def verify(parts):
    ok = True

    def fail(msg):
        nonlocal ok
        ok = False
        print("  FAIL", msg)

    names = list(parts)
    closed = {n: p["m"] for n, p in parts.items()}
    for n, m in closed.items():
        if len(m.decompose()) != 1:
            fail(f"{n} is not one piece")
        if m.bounding_box()[2] < -1e-6:
            fail(f"{n} goes below the bed")

    def hits(a, b):
        return (a ^ b).volume() > 1e-4

    # 1. closed: nothing fused, clearances
    tight = (9.0, "")
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            if hits(closed[a], closed[b]):
                fail(f"closed: {a} and {b} overlap")
            g = closed[a].min_gap(closed[b], 1.5)
            if g < tight[0]:
                tight = (g, f"{a}/{b}")
    print(f"  tightest clearance closed: {tight[0]:.2f} mm ({tight[1]})")
    if tight[0] < 0.2:
        fail("a clearance is under one layer")

    def sweep(mover, others, lo=0.0, hi=None, step=4.0):
        p = parts[mover]
        hi = p["open"] if hi is None else hi
        a = lo
        while a <= hi + 1e-6:
            mm = turn(p["m"], p["sign"] * a, p["pivot"])
            for o, om in others.items():
                if o != mover and hits(mm, om):
                    return (a, o)
            a += step
        return None

    # 2. every wing and tail feather opens freely with everything else closed
    for n, p in parts.items():
        if p["group"] in ("wings", "tail"):
            r = sweep(n, closed)
            if r:
                fail(f"{n} hits {r[1]} at {r[0]:.0f} deg")
    # 3. the head rises freely once the wings are open ...
    wings_open = posed(parts, wings=1.0)
    r = sweep("head", wings_open)
    if r:
        fail(f"head hits {r[1]} at {r[0]:.0f} deg with wings open")
    # ... and the wings still move freely with the head up
    full = posed(parts, 1.0, 1.0, 1.0)
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            if hits(full[a], full[b]):
                fail(f"open pose: {a} and {b} overlap")
    # 4. every hinge has a stop at both ends, and nothing slides off its axle
    for n, p in parts.items():
        if p["group"] == "body":
            continue
        over = turn(p["m"], p["sign"] * (p["open"] + 2 * KEY_PLAY + 3), p["pivot"])
        under = turn(p["m"], -p["sign"] * (2 * KEY_PLAY + 3), p["pivot"])
        if not hits(over, closed["body"]):
            fail(f"{n} has no open stop")
        if not hits(under, closed["body"]):
            fail(f"{n} has no closed stop")
        for dy in (-1, 1):
            others = Manifold.compose([m for o, m in closed.items() if o != n])
            if not any(hits(p["m"].translate([0, dy * s, 0]), others) for s in np.arange(0.6, 6.1, 0.6)):
                fail(f"{n} can slide off its axle")
    return ok


def to_trimesh(m):
    import trimesh
    mesh = m.to_mesh()
    return trimesh.Trimesh(vertices=np.asarray(mesh.vert_properties)[:, :3],
                           faces=np.asarray(mesh.tri_verts), process=False)


def main():
    out = os.path.dirname(os.path.abspath(__file__))
    for d in ("stl", "3mf"):
        os.makedirs(os.path.join(out, d), exist_ok=True)
    print("building ...")
    parts = build()
    print(f"{len(parts)} parts: " + ", ".join(parts))
    ok = verify(parts)
    whole = Manifold.compose([p["m"] for p in parts.values()])
    tm = to_trimesh(whole)
    tm.export(os.path.join(out, "stl", "phoenix_egg.stl"))
    tm.export(os.path.join(out, "3mf", "phoenix_egg.3mf"))
    bb = whole.bounding_box()
    print(f"  closed size {bb[3] - bb[0]:.1f} x {bb[4] - bb[1]:.1f} x {bb[5]:.1f} mm, "
          f"solid volume {whole.volume() / 1000:.1f} cm3, {len(tm.faces)} triangles, "
          f"watertight={tm.is_watertight}")
    op = Manifold.compose(list(posed(parts, 1, 1, 1).values())).bounding_box()
    print(f"  open size {op[3] - op[0]:.0f} wide x {op[5] - op[2]:.0f} tall mm")
    if not ok:
        sys.exit("verification FAILED")
    print("verification passed")


if __name__ == "__main__":
    main()
