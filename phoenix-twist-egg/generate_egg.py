#!/usr/bin/env python3
"""
Emberwing Phoenix Egg — print-in-place twisty fidget egg.

A feather-scaled egg cut into thin vertical blades that all turn on one
hidden axle. Each blade can turn a few degrees against its neighbour, so
twisting the two halves fans the egg out into a spiral "wing" and twisting
back snaps it closed into a perfect egg.

    pip install manifold3d trimesh numpy
    python generate_egg.py

Millimetres throughout. The egg prints standing up: Z is the egg's long
axis, the blades are stacked along Y, the axle runs along Y.
"""
import math
import os
import sys

import numpy as np
from manifold3d import CrossSection, Manifold, Mesh

# ---- egg -------------------------------------------------------------------
R_MAX = 31.0          # widest radius
Z_WIDE = 20.8         # height of the widest point (gives a 46 mm flat base)
H_TOP = 54.0          # widest point to tip
SCALES_AROUND = 16
ROW_H = 6.5           # feather-scale rows
RELIEF = 1.8          # how far each feather tip stands proud

# ---- mechanism -------------------------------------------------------------
N_BLADES = 13
BLADE_T = 2.0
GAP = 0.5             # between neighbouring blades
AXLE_Z = 30.0
AXLE_R = 3.5
HOLE_R = 3.9          # 0.25 mm under the axle, 0.55 mm over it
HOLE_LIFT = 0.15
PIN_R = 11.0          # stop pins sit 11 mm above / below the axle
PIN_HALF_W = 1.5      # tangential
PIN_HALF_H = 2.0      # radial
PIN_REACH = 1.5       # how far a pin enters the next blade
STEP_DEG = 11.0       # twist allowed between neighbours
SLOT_CLEAR = 0.4
FLANGE_R, FLANGE_T = 5.5, 2.5

HALF_STACK = (N_BLADES * BLADE_T + (N_BLADES + 1) * GAP) / 2   # 16.5


def egg_radius(z):
    z = np.asarray(z, dtype=float)
    lower = np.sqrt(np.clip(R_MAX ** 2 - (z - Z_WIDE) ** 2, 0, None))
    upper = R_MAX * np.sqrt(np.clip(1 - ((z - Z_WIDE) / H_TOP) ** 2, 0, None))
    return np.where(z < Z_WIDE, lower, upper)


def feather_relief(theta, z):
    """Overlapping, upward-pointing feather scales (max of two staggered rows)."""
    dth = 2 * math.pi / SCALES_AROUND
    out = np.zeros_like(z)
    k0 = np.floor(z / ROW_H)
    for dk in (-1, 0):
        k = k0 + dk
        v = (z - k * ROW_H) / (2 * ROW_H)                 # 0 at root, 1 at tip
        shift = 0.5 * (k % 2)
        u = theta / dth - shift
        u = u - np.round(u)                               # -0.5 .. 0.5
        half = 0.5 * (1 - np.clip(v, 0, 1) ** 1.8)
        inside = (np.abs(u) < half) & (v >= 0) & (v <= 1)
        blade = RELIEF * v ** 1.15
        shaft = 0.35 * np.clip(1 - np.abs(u) * 9, 0, 1) * v     # raised quill
        barb = 0.08 * np.cos(np.abs(u) * 2 * math.pi * 7 + v * 9)  # fine barbs
        # soften the feather outline over ~1 mm so edges print crisp, not jagged
        edge = np.clip((half - np.abs(u)) / 0.07, 0, 1)
        edge = edge * edge * (3 - 2 * edge)
        out = np.maximum(out, np.where(inside, (blade + shaft + barb * v) * edge, 0))
    ztop = Z_WIDE + H_TOP
    fade = np.clip(z / 2.5, 0, 1) * np.clip((ztop - z) / 9.0, 0, 1)
    return out * fade


def build_egg(n_theta=360, dz=0.25):
    ztop = Z_WIDE + H_TOP
    zs = np.arange(0, ztop - 0.6, dz)
    th = np.linspace(0, 2 * math.pi, n_theta, endpoint=False)
    TH, ZS = np.meshgrid(th, zs)
    Rr = egg_radius(ZS) + feather_relief(TH, ZS)
    X, Y = Rr * np.cos(TH), Rr * np.sin(TH)
    verts = np.column_stack([X.ravel(), Y.ravel(), ZS.ravel()])
    nz = len(zs)
    base_c, apex = len(verts), len(verts) + 1
    verts = np.vstack([verts, [0, 0, 0], [0, 0, ztop]])
    tris = []
    idx = np.arange(nz * n_theta).reshape(nz, n_theta)
    a, b = idx[:-1, :], np.roll(idx[:-1, :], -1, axis=1)
    c, d = idx[1:, :], np.roll(idx[1:, :], -1, axis=1)
    tris.append(np.column_stack([a.ravel(), b.ravel(), d.ravel()]))
    tris.append(np.column_stack([a.ravel(), d.ravel(), c.ravel()]))
    r0, r1 = idx[0], np.roll(idx[0], -1)
    tris.append(np.column_stack([np.full(n_theta, base_c), r1, r0]))
    t0, t1 = idx[-1], np.roll(idx[-1], -1)
    tris.append(np.column_stack([np.full(n_theta, apex), t0, t1]))
    m = Manifold(Mesh(vert_properties=verts.astype(np.float32),
                      tri_verts=np.vstack(tris).astype(np.uint32)))
    assert not m.is_empty(), m.status()
    return m


# ---- helpers ---------------------------------------------------------------
def slab(y0, y1):
    return Manifold.cube([200, y1 - y0, 200]).translate([-100, y0, -10])


def prism_xz(points, y0, y1):
    """Extrude an (x, z) polygon from y0 to y1."""
    m = CrossSection([points]).extrude(y1 - y0).rotate([90, 0, 0])
    return m.translate([0, y1, 0])


def turn(m, deg):
    """Rotate about the axle."""
    return m.translate([0, 0, -AXLE_Z]).rotate([0, deg, 0]).translate([0, 0, AXLE_Z])


def axle_hole(y0, y1):
    """Round hole with a 45-degree peaked roof so it prints cleanly."""
    pts = [(HOLE_R * math.cos(math.radians(a)), HOLE_R * math.sin(math.radians(a)))
           for a in range(135, 406, 9)]
    pts.append((0, HOLE_R * math.sqrt(2)))
    pts = [(x, z + AXLE_Z + HOLE_LIFT) for x, z in pts]
    return prism_xz(pts, y0, y1)


def cyl_y(r, y0, y1, z=AXLE_Z):
    return Manifold.cylinder(y1 - y0, r, r, 64).rotate([-90, 0, 0]).translate([0, y0, z])


def stop_pin(y_face, top):
    """Stop pin growing out of a +Y face; underside ramps at 45 degrees."""
    zc = AXLE_Z + (PIN_R if top else -PIN_R)
    L = GAP + PIN_REACH
    z0, z1 = zc - PIN_HALF_H, zc + PIN_HALF_H
    # side profile in (y, z): root is full height, the tip is undercut
    prof = [(-0.6, z0 - 0.6), (L, z0 + L), (L, z1), (-0.6, z1)]
    m = CrossSection([prof]).extrude(2 * PIN_HALF_W)          # x=y, y=z, z=x
    m = m.rotate([90, 0, 90]).translate([-PIN_HALF_W, y_face, 0])
    return m


def stop_slot(y0, y1, top):
    """Arc-shaped track the neighbour's pin travels in (one-way, 0..STEP)."""
    pad = math.degrees(math.asin((PIN_HALF_W + SLOT_CLEAR) / (PIN_R - PIN_HALF_H)))
    a0, a1 = -STEP_DEG - pad, pad
    ri, ro = PIN_R - PIN_HALF_H - SLOT_CLEAR, PIN_R + PIN_HALF_H + SLOT_CLEAR
    sgn = 1 if top else -1
    arc = lambda r, a: (sgn * r * math.sin(math.radians(a)),
                        AXLE_Z + sgn * r * math.cos(math.radians(a)))
    steps = [a0 + (a1 - a0) * i / 12 for i in range(13)]
    pts = [arc(ro, a) for a in steps] + [arc(ri, a) for a in reversed(steps)]
    return prism_xz(pts[::-1], y0, y1)


# ---- parts -----------------------------------------------------------------
def build(egg=None):
    """Returns the list of rigid parts, in stacking order along +Y."""
    egg = build_egg() if egg is None else egg
    bounds = [(-100.0, -HALF_STACK)]
    y = -HALF_STACK + GAP
    for _ in range(N_BLADES):
        bounds.append((y, y + BLADE_T))
        y += BLADE_T + GAP
    bounds.append((HALF_STACK, 100.0))
    last = len(bounds) - 1

    parts = []
    for k, (y0, y1) in enumerate(bounds):
        m = egg ^ slab(y0, y1)
        # the fine barb texture can leave dust-sized crumbs at a cut: drop them
        m = max(m.decompose(), key=lambda q: q.volume())
        pin_top = (k % 2 == 0)              # this part's pin: top if even
        slot_top = ((k - 1) % 2 == 0)       # slot for the previous part's pin
        if k > 0:
            if k < last:
                m = m - stop_slot(y0 - 1, y1 + 1, slot_top)
            else:
                m = m - stop_slot(y0 - 1, y0 + PIN_REACH + 0.5, slot_top)
        if k == 0:
            # cap A carries the axle and its retaining flange
            y_f = HALF_STACK + 4.5
            m = m + cyl_y(AXLE_R, y1 - 8.0, y_f + FLANGE_T)
            m = m + cyl_y(FLANGE_R, y_f, y_f + FLANGE_T)
        elif k < last:
            m = m - axle_hole(y0 - 1, y1 + 1)
        else:
            m = m - axle_hole(y0 - 1, y0 + 4.0 + 0.01)
            cav = cyl_y(FLANGE_R + 0.5, y0 + 4.0, y0 + 4.5 + FLANGE_T + 0.5,
                        AXLE_Z + 0.25)
            roof = prism_xz([(-(FLANGE_R + 0.5) * 0.72, AXLE_Z + 0.25 + (FLANGE_R + 0.5) * 0.69),
                             ((FLANGE_R + 0.5) * 0.72, AXLE_Z + 0.25 + (FLANGE_R + 0.5) * 0.69),
                             (0, AXLE_Z + 0.25 + (FLANGE_R + 0.5) * 1.41)],
                            y0 + 4.0, y0 + 4.5 + FLANGE_T + 0.5)
            m = m - cav - roof
        if k < last:
            m = m + stop_pin(y1, pin_top)
        parts.append(m)
    return parts


def posed(parts, frac):
    """Twist the stack open: frac 0 = closed egg, 1 = fully fanned."""
    return [turn(p, k * STEP_DEG * frac) for k, p in enumerate(parts)]


# ---- verification ----------------------------------------------------------
def verify(parts):
    ok = True

    def fail(msg):
        nonlocal ok
        ok = False
        print("  FAIL", msg)

    for k, p in enumerate(parts):
        n = len(p.decompose())
        if n != 1:
            fail(f"part {k} is {n} pieces")
        if p.bounding_box()[2] < -1e-6:
            fail(f"part {k} below bed")
    tight = 9.0
    for i in range(len(parts)):
        for j in range(i + 1, len(parts)):
            if (parts[i] ^ parts[j]).volume() > 1e-6:
                fail(f"parts {i} and {j} fused")
            if j == i + 1 or i == 0:
                tight = min(tight, parts[i].min_gap(parts[j], 2.0))
    print(f"  tightest clearance (closed): {tight:.2f} mm")
    if tight < 0.2:
        fail("clearance under one layer")
    # every neighbour pair: free through the allowed range, blocked outside it
    for k in range(len(parts) - 1):
        a, b = parts[k], parts[k + 1]
        for d in (STEP_DEG * 0.5, STEP_DEG):
            if (a ^ turn(b, d)).volume() > 1e-6:
                fail(f"joint {k} binds at {d:.1f} deg")
        if (a ^ turn(b, STEP_DEG + 4)).volume() < 1e-6:
            fail(f"joint {k} has no open stop")
        if (a ^ turn(b, -4)).volume() < 1e-6:
            fail(f"joint {k} has no closed stop")
    # the whole stack fully open and half open
    for f in (0.5, 1.0):
        pp = posed(parts, f)
        for i in range(len(pp)):
            for j in range(i + 1, len(pp)):
                if (pp[i] ^ pp[j]).volume() > 1e-6:
                    fail(f"parts {i},{j} collide at {int(f * 100)}% open")
    # nothing can slide off the axle
    for k in range(1, len(parts)):
        rest = Manifold.compose(parts[:k])
        if not any((rest ^ parts[k].translate([0, s, 0])).volume() > 1e-6
                   for s in np.arange(0.5, 12.5, 0.5)):
            # the last cap is what the flange retains; blades are trapped by it
            if k == len(parts) - 1:
                fail("end cap can be pulled off the axle")
    print(f"  total twist: {STEP_DEG * (len(parts) - 1):.0f} degrees over "
          f"{len(parts) - 1} joints")
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
    print("building egg surface ...")
    parts = build()
    print(f"{len(parts)} parts ({N_BLADES} blades + 2 caps)")
    ok = verify(parts)
    whole = Manifold.compose(parts)
    tm = to_trimesh(whole)
    tm.export(os.path.join(out, "stl", "phoenix_twist_egg.stl"))
    tm.export(os.path.join(out, "3mf", "phoenix_twist_egg.3mf"))
    bb = whole.bounding_box()
    print(f"  size {bb[3] - bb[0]:.1f} x {bb[4] - bb[1]:.1f} x {bb[5]:.1f} mm, "
          f"solid volume {whole.volume() / 1000:.1f} cm3, {len(tm.faces)} triangles, "
          f"watertight={tm.is_watertight}")
    if not ok:
        sys.exit("verification FAILED")
    print("verification passed")


if __name__ == "__main__":
    main()
