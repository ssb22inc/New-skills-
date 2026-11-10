#!/usr/bin/env python3
"""
Emberwing — articulated print-in-place flexi phoenix.

Parametric generator. Produces a single print-in-place model made of
separate rigid links joined by captive chain-link joints (the same
mechanism used by "flexi" articulated dragons): no supports, no assembly.

    pip install manifold3d trimesh numpy
    python generate_phoenix.py            # writes ./stl and ./3mf

All dimensions are millimetres. +X runs from the head toward the tail,
+Z is up, the print bed is Z = 0.
"""
import math
import os
import sys

import numpy as np
from manifold3d import CrossSection, Manifold

SEG = 48  # circular resolution

# ----------------------------------------------------------------------------
# Joint parameters (the heart of the mechanism)
# ----------------------------------------------------------------------------
BAR_HALF_X = 1.5       # captive crossbar is 3.0 mm long (along the chain)
BAR_Z0, BAR_Z1 = 3.0, 6.0   # crossbar is a 3 mm tall bridge between two arms
SLOT_HALF_Y = 3.5      # slot between the arms (7.0 mm wide)
SLOT_FRONT = -6.5      # slot reaches 6.5 mm in front of the joint centre
ARM_OUT = 6.0          # arms reach +-6 mm from the joint axis
ARM_TOP = 7.0
RING_HALF_Y = 1.8      # ring plate is 3.6 mm thick -> 1.7 mm side play
RING_FRONT = -5.5      # front post of ring: x in [-5.5, -2.5]
WIN_HALF_X = 2.5       # window in ring: 1.0 mm play fore/aft of crossbar
WIN_Z0, WIN_Z1 = 1.8, 7.2   # 1.2 mm play below and above crossbar
RING_TOP = 9.4
RING_BACK = 6.5        # ring plate buries itself in the link body
BODY_FRONT = 4.0       # link bodies start 4 mm behind their joint centre


# ----------------------------------------------------------------------------
# Small geometry helpers
# ----------------------------------------------------------------------------
def ell(a, b, c, at=(0, 0, 0)):
    return Manifold.sphere(1.0, SEG).scale([a, b, c]).translate(list(at))


def box(x0, x1, y0, y1, z0, z1):
    return Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0])


def hull(*ms):
    return Manifold.batch_hull(list(ms))


def union(ms):
    out = ms[0]
    for m in ms[1:]:
        out = out + m
    return out


def place(m, x=0.0, y=0.0, deg=0.0):
    """Rotate about Z then translate: local joint frame -> parent frame."""
    return m.rotate([0, 0, deg]).translate([x, y, 0])


def above_bed(m):
    return m ^ box(-500, 500, -500, 500, 0, 200)


def profile_xz(points, half_y):
    """Extrude an (x, z) polygon symmetrically along Y."""
    cs = CrossSection([points])
    return cs.extrude(2 * half_y).rotate([90, 0, 0]).translate([0, half_y, 0])


# ----------------------------------------------------------------------------
# Joint features, all expressed in the joint frame:
#   origin = joint centre on the bed, +X = pointing away from the parent link
# ----------------------------------------------------------------------------
def arm_block():
    """Rounded block on the parent that carries the two arms + crossbar."""
    pts = []
    for x in (-5.0, 0.0):
        for y in (-4.0, 4.0):
            for z in (0.0, 5.0):
                pts.append(Manifold.sphere(2.0, 24).translate([x, y, z]))
    return hull(*pts)


def socket_cut():
    return box(SLOT_FRONT, 60, -SLOT_HALF_Y, SLOT_HALF_Y, -1, 100)


def crossbar():
    return box(-BAR_HALF_X, BAR_HALF_X, -4.6, 4.6, BAR_Z0, BAR_Z1)


def ring():
    """Child-side loop that wraps the parent's crossbar."""
    # arched silhouette: reads as a dorsal feather ridge, not a bracket
    cx, ax, z0 = 0.5, 6.0, 5.0
    arc = [(cx + ax * math.cos(math.radians(t)),
            z0 + (RING_TOP - z0) * math.sin(math.radians(t)))
           for t in range(0, 181, 12)]
    outer = profile_xz([(RING_FRONT, 0), (RING_BACK, 0), (RING_BACK, z0)] + arc[1:-1] + [(RING_FRONT, z0)],
                       RING_HALF_Y)
    window = box(-WIN_HALF_X, WIN_HALF_X, -10, 10, WIN_Z0, WIN_Z1)
    return outer - window


def finish_link(body, sockets, has_ring=True, extras=()):
    """body: convex-ish solid in link frame (ring joint at origin).
    sockets: list of (x, y, deg) child joints carried by this link."""
    m = body
    for (x, y, d) in sockets:
        m = m - place(socket_cut(), x, y, d)
    for (x, y, d) in sockets:
        m = m + place(crossbar(), x, y, d)
    if has_ring:
        m = m + ring()
    for e in extras:
        m = m + e
    return above_bed(m)


# ----------------------------------------------------------------------------
# Decorative building blocks
# ----------------------------------------------------------------------------
def feather(length, half_w, h, root=(0, 0), deg=0.0, rachis=True):
    """A leaf-shaped feather lying on the bed, root near `root`, pointing
    along `deg`. Slightly pointed tip, raised central shaft."""
    L = length
    blade = hull(
        ell(L * 0.34, half_w, h, (L * 0.36, 0, 0)),
        ell(1.4, 1.2, h * 0.55, (L - 1.4, 0, 0)),
        ell(2.0, half_w * 0.55, h * 0.9, (1.0, 0, 0)),
    )
    if rachis:
        blade = blade + hull(
            ell(1.0, 0.75, h + 0.55, (2.0, 0, 0)),
            ell(1.0, 0.6, h * 0.55 + 0.5, (L - 2.4, 0, 0)))
        # barbs: shallow chevron grooves either side of the shaft
        for i in range(1, int(L // 5.5)):
            x = 1.5 + i * 5.5
            if x > L * 0.8:
                break
            for s in (-1, 1):
                g = box(0, half_w * 1.5, -0.3, 0.3, h * 0.25, h + 2)
                g = g.rotate([0, 0, s * 55]).translate([x, s * 0.9, 0])
                blade = blade - g
    return place(blade, root[0], root[1], deg)


def chain_body(P, W, H):
    """Standard spine link: rounded dome flowing into the rear arm block."""
    xc = (BODY_FRONT + P + 2) / 2
    a = (P + 2 - BODY_FRONT) / 2
    return hull(ell(a, W, H, (xc, 0, 0)), place(arm_block(), P))


def scale_ridges(P, W, H, n=2):
    """Overlapping feather-scale tiers on top of a spine link."""
    out = []
    for i in range(n):
        t = (i + 0.5) / n
        x = BODY_FRONT + 2.5 + t * (P - 9)
        out.append(hull(
            ell(2.6, W * (0.80 - 0.12 * i), H * (0.99 - 0.02 * i) + 0.7, (x, 0, 0)),
            ell(0.8, W * 0.25, H * 0.80, (x + 4.2, 0, 0))))
    return out


# ----------------------------------------------------------------------------
# Links
# ----------------------------------------------------------------------------
def spine_link(P, W, H, tiers=2):
    body = chain_body(P, W, H)
    for r in scale_ridges(P, W, H, tiers):
        body = body + r
    return finish_link(body, [(P, 0, 0)])


def head_link():
    """Head frame: its rear joint is at the origin, beak points to -X."""
    skull = hull(ell(10.5, 8.6, 13.0, (-15.0, 0, 0)), arm_block())
    brow = ell(6.5, 7.6, 3.0, (-17.5, 0, 9.3))
    beak_top = hull(ell(3.2, 4.6, 7.4, (-23.0, 0, 0)),
                    ell(1.3, 1.1, 2.6, (-34.0, 0, 0)),
                    ell(1.5, 1.6, 4.6, (-29.5, 0, 0)))
    body = skull + beak_top
    # beak mouth line + nostril
    for s in (-1, 1):
        body = body - box(-36, -24.5, s * 3.2 - 0.9 if s < 0 else s * 3.2 - 0.9 + 0.0,
                          s * 3.2 + 0.9, 2.6, 3.3).translate([0, s * 1.4, 0])
    eyes = []
    for s in (-1, 1):
        eyes.append(ell(2.5, 1.6, 2.5, (-18.6, s * 6.15, 7.4)))    # eyelid ring
        eyes.append(ell(1.6, 1.5, 1.6, (-18.6, s * 6.95, 7.4)))    # eyeball
        # cheek flame swirl
        eyes.append(hull(ell(1.2, 0.9, 1.2, (-15.0, s * 7.9, 4.5)),
                         ell(0.8, 0.8, 0.8, (-9.5, s * 7.6, 7.6))))
    crest = []
    for (bx, bz, tx, tz, r) in [(-15.0, 10.5, -13.5, 26.0, 2.2),
                                (-13.5, 10.5, -8.0, 23.6, 2.0),
                                (-12.0, 10.0, -3.4, 20.6, 1.9)]:
        stem = hull(ell(2.6, 1.6, 2.6, (bx, 0, bz)),
                    ell(1.3, 1.5, 1.3, (tx, 0, tz)))
        ball = ell(r, r * 0.95, r, (tx, 0, tz))
        crest += [stem, ball]
    m = body - socket_cut()
    m = m + crossbar()
    m = m + union(eyes) + union(crest)
    return above_bed(m)


def shoulder_link(P, wing_x, wing_y):
    """Chest link: carries the next spine joint and both wing joints."""
    body = hull(ell(11.0, 13.0, 13.8, (14.0, 0, 0)),
                place(arm_block(), P),
                place(arm_block(), wing_x, wing_y, 90),
                place(arm_block(), wing_x, -wing_y, -90))
    extras = [hull(ell(4.0, 8.0, 14.4, (11.0, 0, 0)), ell(1.0, 2.5, 11.0, (17.5, 0, 0))),
              hull(ell(3.5, 6.5, 13.6, (16.5, 0, 0)), ell(0.9, 2.0, 10.0, (22.0, 0, 0)))]
    body = body + union(extras)
    return finish_link(body, [(P, 0, 0), (wing_x, wing_y, 90), (wing_x, -wing_y, -90)])


def tail_base_link(sockets):
    blocks = [place(arm_block(), *s) for s in sockets]
    body = hull(ell(7.5, 10.5, 11.5, (11.0, 0, 0)), *blocks)
    body = body + hull(ell(3.6, 7.5, 12.3, (10.0, 0, 0)), ell(1.0, 2.2, 9.5, (16.0, 0, 0)))
    return finish_link(body, sockets)


def plume_link(P=14.0):
    body = chain_body(P, 6.4, 7.6)
    # little barbs flicking out each side, like a feather shaft
    for s in (-1, 1):
        body = body + feather(12.5, 3.0, 3.0, (6.5, s * 4.2), s * 40, rachis=False)
    body = body + hull(ell(2.2, 4.6, 8.3, (7.2, 0, 0)), ell(0.8, 1.6, 6.4, (11.0, 0, 0)))
    return finish_link(body, [(P, 0, 0)])


def eye_feather_link(L=42.0, W=14.0):
    """Tail plume tip: teardrop 'eye' feather with concentric relief."""
    blade = hull(ell(12.0, W, 3.2, (16.5, 0, 0)),
                 ell(1.5, 1.2, 1.8, (L, 0, 0)),
                 ell(3.0, 4.5, 3.2, (5.5, 0, 0)))
    # scalloped barbs along both edges
    for i in range(6):
        x = 10.0 + i * 5.0
        for s in (-1, 1):
            g = box(0, 14, -0.35, 0.35, 0.9, 9).rotate([0, 0, s * 52])
            blade = blade - g.translate([x, s * 6.6, 0])
    eye1 = ell(8.6, 9.2, 4.3, (15.5, 0, 0))
    eye2 = ell(5.6, 6.0, 5.5, (15.0, 0, 0))
    eye3 = ell(2.8, 3.0, 6.6, (14.4, 0, 0))
    shaft = hull(ell(1.0, 0.9, 3.9, (24, 0, 0)), ell(0.8, 0.7, 2.3, (L - 2, 0, 0)))
    return finish_link(blade + eye1 + eye2 + eye3 + shaft, [])


def wing_inner_link(P=26.0):
    """Wing 'arm'. Link frame +X = out along the span, -Y = trailing edge.
    (Built for the left wing; the right wing is a mirror image.)"""
    arm = hull(ell(3.0, 5.0, 6.5, (7.0, 0, 0)), place(arm_block(), P))
    arm = arm + hull(ell(8.0, 3.2, 7.6, (14.0, 1.2, 0)), ell(1.5, 2.0, 6.0, (24.0, 1.0, 0)))
    feathers = [
        feather(30.0, 5.4, 3.2, (10.5, -1.0), -90),
        feather(36.0, 5.6, 3.3, (16.0, -1.0), -86),
        feather(42.0, 5.8, 3.4, (21.5, -1.0), -82),
        # short coverts overlapping the roots
        feather(15.0, 4.2, 4.4, (12.5, -1.5), -92),
        feather(17.0, 4.2, 4.5, (18.5, -1.5), -86),
        # leading-edge flick
        feather(10.0, 2.8, 3.6, (12.0, 3.0), 62, rachis=False),
    ]
    return finish_link(arm + union(feathers), [(P, 0, 0)])


def wing_outer_link():
    """Wing 'hand' with the long fanned primaries."""
    palm = hull(ell(4.2, 5.2, 6.8, (8.6, 0, 0)), ell(2.0, 3.0, 5.0, (13.5, 1.5, 0)))
    specs = [  # (length, half width, angle)
        (54.0, 5.6, 8),
        (58.0, 5.8, -8),
        (58.0, 5.8, -24),
        (55.0, 5.7, -40),
        (51.0, 5.6, -55),
        (46.0, 5.5, -68),
    ]
    feathers = [feather(L, w, 3.3, (8.8, -0.8), a) for (L, w, a) in specs]
    feathers.append(feather(20.0, 4.4, 4.5, (8.5, -0.5), -16))
    feathers.append(feather(20.0, 4.4, 4.5, (8.5, -0.5), -32))
    feathers.append(feather(19.0, 4.3, 4.6, (8.5, -0.5), -48))
    feathers.append(feather(18.0, 4.2, 4.6, (8.5, -0.5), -62))
    return finish_link(palm + union(feathers), [])


# ----------------------------------------------------------------------------
# Assembly
# ----------------------------------------------------------------------------
def T(x, y, deg):
    return (x, y, deg)


def compose(parent, local):
    """Chain 2-D rigid transforms (x, y, deg)."""
    px, py, pd = parent
    lx, ly, ld = local
    c, s = math.cos(math.radians(pd)), math.sin(math.radians(pd))
    return (px + c * lx - s * ly, py + s * lx + c * ly, pd + ld)


def build():
    parts = []  # (name, manifold in world frame)

    def add(name, m, frame, mirror=False):
        if mirror:
            m = m.mirror([0, 1, 0])
        parts.append((name, place(m, *frame)))

    # --- spine -------------------------------------------------------------
    j = T(0, 0, 0)
    add("head", head_link(), j)
    for i, (P, W, H) in enumerate([(14.0, 8.6, 9.8), (14.0, 9.2, 10.4), (14.5, 10.2, 11.2)]):
        add(f"neck{i + 1}", spine_link(P, W, H), j)
        j = compose(j, T(P, 0, 0))

    P_sh, wing_x, wing_y = 24.0, 11.5, 14.0
    add("shoulder", shoulder_link(P_sh, wing_x, wing_y), j)
    wing_l = compose(j, T(wing_x, wing_y, 90))
    j = compose(j, T(P_sh, 0, 0))

    P_b = 18.0
    add("body", spine_link(P_b, 13.0, 12.6, tiers=2), j)
    j = compose(j, T(P_b, 0, 0))

    socks = [T(18.0, 0, 0), T(12.5, 14.0, 46), T(12.5, -14.0, -46)]
    add("tailbase", tail_base_link(socks), j)

    # --- tail plumes --------------------------------------------------------
    for label, sock, n_links, mir in [("C", socks[0], 4, False),
                                      ("L", socks[1], 3, False)]:
        f = compose(j, sock)
        chain = []
        for k in range(n_links):
            chain.append((f"plume{label}{k + 1}", plume_link(14.0), f))
            f = compose(f, T(14.0, 0, 0))
        chain.append((f"plume{label}_eye", eye_feather_link(), f))
        for (nm, m, fr) in chain:
            parts.append((nm, place(m, *fr)))
            if label == "L":
                parts.append((nm.replace("L", "R", 1), place(m, *fr).mirror([0, 1, 0])))

    # --- wings --------------------------------------------------------------
    P_w = 26.0
    inner = place(wing_inner_link(P_w), *wing_l)
    outer = place(wing_outer_link(), *compose(wing_l, T(P_w, 0, 0)))
    parts += [("wingL_inner", inner), ("wingL_outer", outer),
              ("wingR_inner", inner.mirror([0, 1, 0])),
              ("wingR_outer", outer.mirror([0, 1, 0]))]
    return parts


# ----------------------------------------------------------------------------
# Verification + export
# ----------------------------------------------------------------------------
def verify(parts, min_clear=0.8):
    ok = True
    for name, m in parts:
        n = len(m.decompose())
        if m.is_empty() or n != 1:
            print(f"  FAIL {name}: {n} disconnected pieces")
            ok = False
        bb = m.bounding_box()
        if bb[2] < -1e-6:
            print(f"  FAIL {name}: below bed")
            ok = False
    worst = (9e9, None)
    for i in range(len(parts)):
        for k in range(i + 1, len(parts)):
            a, b = parts[i][1], parts[k][1]
            ba, bb = a.bounding_box(), b.bounding_box()
            if (ba[0] > bb[3] + 2 or bb[0] > ba[3] + 2 or
                    ba[1] > bb[4] + 2 or bb[1] > ba[4] + 2):
                continue
            inter = (a ^ b).volume()
            gap = a.min_gap(b, 3.0)
            if inter > 1e-6:
                print(f"  FAIL {parts[i][0]} x {parts[k][0]}: fused ({inter:.2f} mm3)")
                ok = False
            elif gap < min_clear:
                print(f"  FAIL {parts[i][0]} x {parts[k][0]}: gap {gap:.2f} mm")
                ok = False
            if gap < worst[0]:
                worst = (gap, f"{parts[i][0]} / {parts[k][0]}")
    print(f"  tightest clearance: {worst[0]:.2f} mm ({worst[1]})")
    return ok


def to_trimesh(m):
    import trimesh
    mesh = m.to_mesh()
    return trimesh.Trimesh(vertices=np.asarray(mesh.vert_properties)[:, :3],
                           faces=np.asarray(mesh.tri_verts), process=False)


def export(parts, outdir, scale=1.0, tag="100pct"):
    import trimesh
    os.makedirs(os.path.join(outdir, "stl"), exist_ok=True)
    os.makedirs(os.path.join(outdir, "3mf"), exist_ok=True)
    whole = Manifold.compose([m for _, m in parts])
    bb = whole.bounding_box()
    # centre on the bed origin
    whole = whole.translate([-(bb[0] + bb[3]) / 2, -(bb[1] + bb[4]) / 2, 0]).scale([scale] * 3)
    tm = to_trimesh(whole)
    stl = os.path.join(outdir, "stl", f"emberwing_phoenix_{tag}.stl")
    tm.export(stl)
    tm.export(os.path.join(outdir, "3mf", f"emberwing_phoenix_{tag}.3mf"))
    bb = whole.bounding_box()
    vol = whole.volume()
    print(f"  {tag}: {bb[3] - bb[0]:.1f} x {bb[4] - bb[1]:.1f} x {bb[5]:.1f} mm, "
          f"solid volume {vol / 1000:.1f} cm3, {len(tm.faces)} triangles, "
          f"watertight={tm.is_watertight}")
    return whole


def main():
    out = os.path.dirname(os.path.abspath(__file__))
    print("building links ...")
    parts = build()
    print(f"{len(parts)} links")
    ok = verify(parts)
    print("exporting ...")
    export(parts, out, 1.00, "100pct_256bed")
    export(parts, out, 0.85, "85pct_220bed")
    export(parts, out, 0.70, "70pct_180bed")
    if not ok:
        sys.exit("verification FAILED")
    print("verification passed")


if __name__ == "__main__":
    main()
