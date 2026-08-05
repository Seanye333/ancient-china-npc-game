"""Q 版基座 v5 — 兩種風格錨點,並排比較。

前四版都是「錐台加球」堆出來的,所以身體永遠是一個桶。v5 換方法:
用<b>旋轉體輪廓</b>(lathe)造型——給一條側面剖線,繞 Z 軸掃出體積。
肩、腰、下襬的轉折是剖線寫出來的,不是拿圓柱湊的。

風格差異也就落在剖線和分段數上,而不是換個顏色:

  朴拙   剖線轉折硬、分段少(10)、保留稜面、材質粗糙、眼睛是刻痕
         參照漢俑與木雕的體塊語言。適合沉重的敘事。

  圓潤   剖線連續、分段多(28)、全平滑、次表面散射、眼睛大而有高光
         日式 chibi 的體塊語言。適合輕快的市井人情。

用法:
    /Applications/Blender.app/Contents/MacOS/Blender --background --python qban_base_v5.py
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bmesh
import bpy

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from qban_npc_v2 import (          # noqa: E402
    mat, sphere, cone, cyl, torus, wipe, look_at,
    stage, lights, configure, render_to, enable_outline, INK,
)

FULL_IMG = HERE / "qban5-styles.png"
HEAD_IMG = HERE / "qban5-heads.png"

JUJUBE_MATTE = (0.470, 0.270, 0.215, 1.0)
JUJUBE_WARM = (0.680, 0.400, 0.310, 1.0)
ROBE_EARTH = (0.215, 0.235, 0.180, 1.0)
ROBE_BRIGHT = (0.140, 0.360, 0.250, 1.0)
TRIM_DULL = (0.360, 0.300, 0.180, 1.0)
TRIM_BRIGHT = (0.720, 0.560, 0.210, 1.0)
SASH_DULL = (0.330, 0.180, 0.130, 1.0)
SASH_BRIGHT = (0.620, 0.220, 0.170, 1.0)


# ── 旋轉體 ── 這一版的核心。剖線寫得出轉折,錐台寫不出。
def lathe(name, profile, segments=24, material=None, shade_smooth=True,
          loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0)):
    """profile: [(z, radius), ...] 由下而上。半徑 0 的端點會收成一個尖。"""
    bm = bmesh.new()
    rings, caps = [], []
    for z, r in profile:
        if r <= 1e-6:
            rings.append(None)
            caps.append(bm.verts.new((0.0, 0.0, z)))
            continue
        ring = []
        for i in range(segments):
            a = 2.0 * math.pi * i / segments
            ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
        rings.append(ring)
        caps.append(None)

    for k in range(len(rings) - 1):
        lo, hi = rings[k], rings[k + 1]
        if lo is None and hi is None:
            continue
        if lo is None:                                  # 下端收尖
            apex = caps[k]
            for i in range(segments):
                bm.faces.new([apex, hi[i], hi[(i + 1) % segments]])
        elif hi is None:                                # 上端收尖
            apex = caps[k + 1]
            for i in range(segments):
                bm.faces.new([lo[(i + 1) % segments], lo[i], apex])
        else:
            for i in range(segments):
                j = (i + 1) % segments
                bm.faces.new([lo[i], lo[j], hi[j], hi[i]])

    # 兩端若非尖端則封口
    for idx in (0, len(rings) - 1):
        if rings[idx] is not None:
            verts = rings[idx] if idx == 0 else list(reversed(rings[idx]))
            try:
                bm.faces.new(verts)
            except ValueError:
                pass

    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.validate()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    o.location, o.scale, o.rotation_euler = loc, scale, rot
    if shade_smooth:
        for poly in o.data.polygons:
            poly.use_smooth = True
    if material:
        o.data.materials.append(material)
    return o


# ── 兩套剖線 ── 風格的真正所在
HEAD_RUSTIC = [           # 漢俑:方頷、顴骨明確、顱頂平
    (-1.00, 0.00), (-0.90, 0.46), (-0.72, 0.68), (-0.46, 0.82),
    (-0.16, 0.92), (0.16, 0.96), (0.48, 0.93), (0.74, 0.80),
    (0.92, 0.50), (1.00, 0.00),
]
HEAD_ROUND = [            # chibi:飽滿、下頷收得快、顱頂圓
    (-1.00, 0.00), (-0.94, 0.30), (-0.80, 0.56), (-0.58, 0.78),
    (-0.30, 0.92), (0.02, 1.00), (0.34, 1.00), (0.62, 0.93),
    (0.84, 0.72), (0.96, 0.40), (1.00, 0.00),
]
BODY_RUSTIC = [           # 硬轉折:下襬外張、腰明確收、肩方
    (0.00, 1.00), (0.06, 0.97), (0.30, 0.84), (0.52, 0.71),
    (0.58, 0.70), (0.74, 0.84), (0.90, 0.93), (0.96, 0.88),
    (1.00, 0.34),
]
BODY_ROUND = [            # 連續:下襬圓收、腰淺、肩溜
    (0.00, 1.00), (0.10, 0.96), (0.34, 0.86), (0.55, 0.76),
    (0.72, 0.86), (0.88, 0.94), (0.97, 0.86), (1.00, 0.36),
]
SLEEVE_RUSTIC = [(0.00, 0.46), (0.30, 0.40), (0.72, 0.33), (1.00, 0.30)]
SLEEVE_ROUND = [(0.00, 0.48), (0.26, 0.42), (0.66, 0.35), (0.92, 0.32), (1.00, 0.26)]


class Style:
    def __init__(self, key, seg, head_p, body_p, sleeve_p, head_ratio,
                 skin, robe, trim, sash, hair,
                 skin_rough, skin_sss, robe_rough, robe_sheen,
                 eye_kind, eye_w, eye_h, eye_gap, brow_w, brow_z, bevel):
        self.__dict__.update(locals())
        del self.self


RUSTIC = Style(
    "rustic", 10, HEAD_RUSTIC, BODY_RUSTIC, SLEEVE_RUSTIC, 0.205,
    skin=JUJUBE_MATTE, robe=ROBE_EARTH, trim=TRIM_DULL, sash=SASH_DULL, hair=(0.115, 0.100, 0.090, 1.0),
    skin_rough=0.92, skin_sss=0.0, robe_rough=0.95, robe_sheen=0.10,
    eye_kind="incised", eye_w=0.34, eye_h=0.058, eye_gap=0.40, brow_w=1.25, brow_z=0.24, bevel=0.006,
)
ROUND = Style(
    "round", 28, HEAD_ROUND, BODY_ROUND, SLEEVE_ROUND, 0.240,
    skin=JUJUBE_WARM, robe=ROBE_BRIGHT, trim=TRIM_BRIGHT, sash=SASH_BRIGHT, hair=INK,
    skin_rough=0.44, skin_sss=0.32, robe_rough=0.62, robe_sheen=0.45,
    eye_kind="glossy", eye_w=0.30, eye_h=0.34, eye_gap=0.38, brow_w=0.95, brow_z=0.44, bevel=0.0,
)


def bevel_edges(obj, width):
    if width <= 0:
        return
    m = obj.modifiers.new("bevel", "BEVEL")
    m.width = width
    m.segments = 2
    m.limit_method = "ANGLE"
    m.angle_limit = math.radians(38)


def build_figure(st: Style, x: float, H: float = 1.15):
    hr = H * st.head_ratio
    body_h = H - hr * 1.85
    seg = st.seg

    m_skin = mat(f"{st.key}_skin", st.skin, rough=st.skin_rough, sss=st.skin_sss)
    m_robe = mat(f"{st.key}_robe", st.robe, rough=st.robe_rough, sheen=st.robe_sheen)
    m_trim = mat(f"{st.key}_trim", st.trim, rough=max(0.30, st.robe_rough - 0.25),
                 metal=0.25, sheen=st.robe_sheen)
    m_sash = mat(f"{st.key}_sash", st.sash, rough=st.robe_rough - 0.10, sheen=st.robe_sheen)
    m_hair = mat(f"{st.key}_hair", st.hair, rough=st.skin_rough - 0.18)
    m_ink = mat(f"{st.key}_ink", INK, rough=0.26)

    # 身 — 剖線掃出來的,有肩有腰有下襬
    body = lathe(f"{st.key}_body",
                 [(z * body_h, r * hr * 1.02) for z, r in st.body_p],
                 segments=seg, material=m_robe, shade_smooth=(seg > 14),
                 loc=(x, 0, 0))
    bevel_edges(body, st.bevel)

    # 腰帶落在剖線收腰處
    waist = 0.55 * body_h
    torus(f"{st.key}_sash", (x, 0, waist), major=hr * 0.76, minor=hr * 0.11,
          material=m_sash, scale=(1.0, 1.0, 0.72))

    # 袖 — 同樣是旋轉體,袖口略收
    for side in (-1, 1):
        sl = lathe(f"{st.key}_sleeve{side}",
                   [(z * body_h * 0.54, r * hr) for z, r in st.sleeve_p],
                   segments=max(8, seg // 2), material=m_robe, shade_smooth=(seg > 14),
                   loc=(x + side * hr * 0.80, 0, body_h * 0.34),
                   rot=(0, side * 0.16, 0))
        bevel_edges(sl, st.bevel)
        sphere(f"{st.key}_hand{side}", (x + side * hr * 0.92, -hr * 0.20, body_h * 0.32),
               hr * 0.15, seg=max(8, seg // 2), ring=8, material=m_skin)

    torus(f"{st.key}_collar", (x, 0, body_h * 0.98), major=hr * 0.44, minor=hr * 0.075,
          material=m_trim, scale=(1.0, 1.0, 0.78))

    # 頭 — 剖線掃出下頷、顴骨、顱頂
    head_z = body_h + hr * 0.82
    head = lathe(f"{st.key}_head", [(z * hr, r * hr) for z, r in st.head_p],
                 segments=seg, material=m_skin, shade_smooth=(seg > 14),
                 loc=(x, 0, head_z), scale=(1.0, 0.94, 1.0))
    bevel_edges(head, st.bevel)

    cyl(f"{st.key}_neck", (x, 0, body_h * 0.99), radius=hr * 0.34, depth=hr * 0.34,
        verts=max(8, seg), material=m_skin)

    face_y = -hr * 0.84
    eye_z = head_z - hr * 0.05

    if st.eye_kind == "incised":       # 朴拙 — 一道刻痕,靠陰影讀,不靠大小
        for side in (-1, 1):
            cyl(f"{st.key}_eye{side}", (x + side * hr * st.eye_gap, face_y + hr * 0.11, eye_z),
                radius=hr * st.eye_h, depth=hr * st.eye_w, verts=6, material=m_ink,
                rot=(0, math.pi / 2, side * 0.15))
    else:                               # 圓潤 — 大眼、虹膜、兩顆高光
        for side in (-1, 1):
            ex = x + side * hr * st.eye_gap
            sphere(f"{st.key}_eye{side}", (ex, face_y, eye_z), hr * st.eye_w,
                   scale=(1.0, 0.34, st.eye_h / st.eye_w * 1.0), seg=18, ring=12,
                   material=mat(f"{st.key}_eyew{side}", (0.960, 0.945, 0.930, 1.0), rough=0.22))
            sphere(f"{st.key}_iris{side}", (ex, face_y - hr * 0.055, eye_z - hr * 0.015),
                   hr * st.eye_w * 0.74, scale=(1.0, 0.30, st.eye_h / st.eye_w * 0.96),
                   seg=16, ring=10,
                   material=mat(f"{st.key}_irism{side}", (0.095, 0.140, 0.180, 1.0), rough=0.18))
            sphere(f"{st.key}_gl{side}", (ex - hr * 0.09, face_y - hr * 0.085, eye_z + hr * 0.10),
                   hr * 0.062, scale=(1.0, 0.35, 1.0), seg=10, ring=7,
                   material=mat(f"{st.key}_glm{side}", (1.0, 1.0, 1.0, 1.0), rough=0.05))
            sphere(f"{st.key}_gl2{side}", (ex + hr * 0.075, face_y - hr * 0.075, eye_z - hr * 0.10),
                   hr * 0.034, scale=(1.0, 0.35, 1.0), seg=8, ring=6,
                   material=mat(f"{st.key}_gl2m{side}", (1.0, 1.0, 1.0, 1.0), rough=0.05))

    for side in (-1, 1):
        cyl(f"{st.key}_brow{side}", (x + side * hr * st.eye_gap, face_y + hr * 0.03,
                                     head_z + hr * st.brow_z),
            radius=hr * 0.062 * st.brow_w, depth=hr * 0.38 * st.brow_w, verts=8,
            material=m_ink, rot=(0, math.pi / 2, -side * 0.12))

    sphere(f"{st.key}_nose", (x, face_y + hr * 0.07, head_z - hr * 0.22),
           hr * (0.075 if st.eye_kind == "glossy" else 0.10),
           scale=(1.0, 0.9, 0.85), seg=10, ring=7, material=m_skin)

    mouth_z = head_z - hr * 0.46
    for i, side in enumerate((-1, 0, 1)):
        lift = 0.0 if side == 0 else hr * 0.055
        sphere(f"{st.key}_mouth{i}", (x + side * hr * 0.095, face_y + hr * 0.05, mouth_z + lift),
               hr * (0.105 if st.eye_kind == "glossy" else 0.085),
               scale=(1.0, 0.45, 0.60), seg=10, ring=7, material=m_ink)

    # 髮冠 — 同樣用剖線,朴拙的稜面在這裡最看得出來
    hair_p = [(-0.55, 0.86), (-0.20, 1.06), (0.20, 1.02), (0.55, 0.78), (0.80, 0.00)]
    hd = lathe(f"{st.key}_hair", [(z * hr * 0.60 + hr * 0.62, r * hr) for z, r in hair_p],
               segments=seg, material=m_hair, shade_smooth=(seg > 14),
               loc=(x, hr * 0.05, head_z), scale=(1.0, 1.02, 1.0))
    bevel_edges(hd, st.bevel)
    # 髮髻
    sphere(f"{st.key}_bun", (x, hr * 0.16, head_z + hr * 1.18), hr * 0.30,
           scale=(1.0, 0.94, 1.0), seg=max(10, seg // 2), ring=8, material=m_hair)
    cyl(f"{st.key}_zan", (x, hr * 0.16, head_z + hr * 1.20), radius=hr * 0.035,
        depth=hr * 0.86, verts=6, material=m_trim, rot=(0, math.pi / 2, 0.22))

    # 佩劍 — 兩邊一樣,讓比較只落在造型語言上
    cyl(f"{st.key}_sword", (x + hr * 0.92, hr * 0.22, body_h * 0.44),
        radius=hr * 0.068, depth=body_h * 0.70, verts=8,
        material=mat(f"{st.key}_scab", (0.150, 0.120, 0.105, 1.0), rough=0.55),
        rot=(0, 0.28, 0))
    sphere(f"{st.key}_pommel", (x + hr * 1.12, hr * 0.22, body_h * 0.72), hr * 0.095,
           seg=10, ring=7, material=m_trim)
    return head_z, hr


def main():
    wipe()
    stage(6.5)
    lights()

    gap = 1.05
    z_r, hr_r = build_figure(RUSTIC, -gap / 2)
    z_o, hr_o = build_figure(ROUND, gap / 2)

    s = configure(150)
    enable_outline(s, thickness=1.9)
    render_to(s, FULL_IMG, (0.0, -5.6, 0.92), (0.0, 0.0, 0.56), 62, 1700, 900)

    # 頭部近景 — 風格差異最集中的地方
    mid_z = (z_r + z_o) / 2
    render_to(s, HEAD_IMG, (0.0, -5.0, mid_z + 0.01), (0.0, 0.0, mid_z - 0.02),
              100, 1700, 780)

    print(f"\nFULL={FULL_IMG}\nHEAD={HEAD_IMG}")


if __name__ == "__main__":
    main()
