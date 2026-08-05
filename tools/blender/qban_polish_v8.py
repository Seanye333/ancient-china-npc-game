"""v8 — 把 v7 認栽的幾處收乾淨。

v7 的診斷成立(卡通著色是減法,要配加法),但三處沒調好:
瀏海碎片感、髮面高光過曝、遠景只是色塊。v8 逐個處理,並補上一個
日式 3D 動漫最標誌性、我前面一直漏掉的特徵:

  **瀏海在額頭上的投影。**

那道橫過額頭的暗影,是動漫角色「頭髮長在頭上」而不是「貼在頭上」的關鍵。
真實陰影在 cel shading 管線裡會被色階吃掉,所以業界普遍是<b>手動放一塊影</b>——
這裡照做。

其餘四項:
  瀏海改成沿額頭弧面排列的重疊髮束(不再是五片各自為政的三角)
  髮面高光壓暗並跟隨髮流
  眼睛補下睫毛與眼瞼陰影
  背景給時間感(黃昏),不再是中性灰藍

用法:
    /Applications/Blender.app/Contents/MacOS/Blender --background --python qban_polish_v8.py
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import qban_anime_v6 as A6                                     # noqa: E402
import qban_volume_v7 as V7                                    # noqa: E402
from qban_npc_v2 import sphere, cone, cyl, torus, wipe, look_at  # noqa: E402

HERO_IMG = HERE / "qban8-hero.png"
CMP_IMG = HERE / "qban8-compare.png"
FACE_IMG = HERE / "qban8-faces.png"

HAIR = (0.140, 0.115, 0.145, 1.0)
HAIR_GLOSS = (0.232, 0.222, 0.300, 1.0)          # 比髮色亮一階就夠,v7 亮了三階
SKIN = (0.985, 0.815, 0.720, 1.0)
BANG_SHADOW = (0.760, 0.588, 0.560, 1.0)         # 額頭上那道影
LID_SHADOW = (0.870, 0.700, 0.660, 1.0)


def drop(prefix):
    """移掉 v6 建的髮件,v8 自己重建。"""
    for o in list(bpy.data.objects):
        if any(o.name.startswith(f"{prefix}_{k}") for k in ("bang", "hair", "side")):
            bpy.data.objects.remove(o, do_unlink=True)


def build_hair_v8(x, head_z, hr, p, m_hair, m_trim):
    """瀏海沿額頭弧面排列並互相重疊,才連得成一片,而不是五片各自為政。"""
    # 後髮 — 底,包住整個顱型
    from qban_base_v5 import lathe
    lathe(f"{p}_h_back", [(-0.66, 0.70), (-0.24, 1.02), (0.28, 1.07),
                          (0.68, 0.88), (0.98, 0.00)],
          segments=28, material=m_hair,
          loc=(x, hr * 0.12, head_z + hr * 0.28),
          scale=(1.07 * hr, 1.12 * hr, 0.94 * hr))

    # 瀏海 — 七撮,沿弧面排,寬度重疊,長度中間長兩邊短
    N = 7
    for i in range(N):
        t = i / (N - 1) - 0.5                       # -0.5 … 0.5
        a = t * 2.05
        dx = math.sin(a) * 1.02
        dy = -math.cos(a) * 0.62
        dz = 0.70 - abs(t) * 0.30
        ln = (0.62 - abs(t) * 0.16) * (1.0 + 0.14 * math.cos(i * 2.1))
        cone(f"{p}_h_bang{i}",
             (x + dx * hr, hr * dy - hr * 0.30, head_z + dz * hr),
             r1=hr * 0.30, r2=hr * 0.03, depth=hr * ln, verts=8, material=m_hair,
             rot=(math.pi - 0.15, t * 0.72, 0), scale=(1.0, 0.42, 1.0))

    # 鬢髮 — 貼臉側垂下,收窄
    for side in (-1, 1):
        cone(f"{p}_h_side{side}", (x + side * hr * 0.92, -hr * 0.34, head_z - hr * 0.30),
             r1=hr * 0.20, r2=hr * 0.06, depth=hr * 1.10, verts=8, material=m_hair,
             rot=(math.pi - 0.06, 0, side * 0.12), scale=(0.58, 0.50, 1.0))

    # 髮髻與簪
    sphere(f"{p}_h_bun", (x, hr * 0.32, head_z + hr * 1.18), hr * 0.30,
           scale=(1.0, 0.92, 1.0), seg=18, ring=12, material=m_hair)
    cyl(f"{p}_h_zan", (x, hr * 0.32, head_z + hr * 1.20), radius=hr * 0.032,
        depth=hr * 0.88, verts=6, material=m_trim, rot=(0, math.pi / 2, 0.20))

    # 髮面高光 — 三段短弧,跟隨髮流,只比髮色亮一階
    hg = A6.flat(f"{p}_hg", HAIR_GLOSS)
    for i, (gx, gz, gw) in enumerate(((-0.44, 0.74, 0.22), (0.0, 0.80, 0.28),
                                      (0.46, 0.72, 0.20))):
        sphere(f"{p}_h_gloss{i}",
               (x + gx * hr, -hr * 0.90, head_z + gz * hr),
               hr * gw, scale=(1.0, 0.12, 0.10), seg=14, ring=9, material=hg)


def build_face_extras(x, head_z, hr, p):
    """兩塊手放的影 — cel shading 吃掉真實陰影,業界普遍手動補。"""
    face_y = -hr * 0.99
    # 一 · 瀏海投在額頭上的暗影 —— 這是「頭髮長在頭上」的關鍵一筆
    m_bs = A6.flat(f"{p}_bs", BANG_SHADOW)
    sphere(f"{p}_bangshadow", (x, face_y + hr * 0.03, head_z + hr * 0.52),
           hr * 0.80, scale=(1.0, 0.09, 0.17), seg=22, ring=12, material=m_bs)
    # 二 · 眼瞼下的一線影,讓眼睛坐進眼窩
    m_ls = A6.flat(f"{p}_ls", LID_SHADOW)
    for side in (-1, 1):
        sphere(f"{p}_lid{side}", (x + side * hr * 0.43, face_y + hr * 0.01,
                                  head_z + hr * 0.18),
               hr * 0.30, scale=(1.0, 0.10, 0.13), seg=16, ring=9, material=m_ls)


def build_v8(x, f, p, volume=True):
    head_z, hr = V7.build(x, f, volume=volume, p=p)
    m_hair = V7.toon_vol(f"{p}_hair8", HAIR, shadow=0.62, cool=0.09, split=0.50,
                         three=True, rim=0.72 if volume else 0.0)
    m_trim = V7.toon_vol(f"{p}_trim8", (0.870, 0.720, 0.310, 1.0),
                         shadow=0.66, split=0.52, rim=0.52 if volume else 0.0)
    drop(p)
    build_hair_v8(x, head_z, hr, p, m_hair, m_trim)
    if volume:
        build_face_extras(x, head_z, hr, p)
    return head_z, hr


def stage_dusk():
    """背景給時間感。中性灰藍不會錯,但也什麼都沒說。"""
    bpy.ops.mesh.primitive_plane_add(size=140, location=(0, 0, 0))
    g = bpy.context.active_object
    g.name = "Ground"
    g.data.materials.append(V7.toon_vol("ground", (0.640, 0.545, 0.435, 1.0),
                                        shadow=0.54, cool=0.12, split=0.44))
    tiers = ((-4.6, 8.4, 3.6, 1.7, 0.20), (0.8, 9.8, 4.4, 2.4, 0.24),
             (5.4, 8.8, 3.2, 1.3, 0.20), (-2.2, 15.5, 6.4, 3.2, 0.50),
             (4.8, 17.0, 5.6, 4.0, 0.55), (0.0, 26.0, 13.0, 5.8, 0.76))
    for i, (dx, dist, w_, h_, tone) in enumerate(tiers):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(dx, dist, h_ * 0.5))
        o = bpy.context.active_object
        o.name = f"Far{i}"
        o.scale = (w_, w_ * 0.5, h_)
        o.data.materials.append(A6.flat(f"far{i}", (0.300 + tone * 0.54,
                                                    0.270 + tone * 0.50,
                                                    0.330 + tone * 0.42, 1.0)))
    bpy.ops.mesh.primitive_plane_add(size=240, location=(0, 36.0, 0),
                                     rotation=(math.pi / 2, 0, 0))
    bpy.context.active_object.name = "Sky"
    bpy.context.active_object.data.materials.append(
        A6.flat("sky", (0.960, 0.855, 0.720, 1.0)))          # 黃昏的天

    bpy.ops.object.light_add(type="SUN", location=(4.0, -2.2, 4.2))
    key = bpy.context.active_object
    key.data.energy = 3.5
    key.data.angle = 0.02
    key.data.color = (1.0, 0.90, 0.76)
    look_at(key, (0, 0, 0.6))
    bpy.ops.object.light_add(type="AREA", location=(-3.4, -0.6, 1.9))
    fill = bpy.context.active_object
    fill.data.energy, fill.data.size = 60, 4.0
    fill.data.color = (0.66, 0.76, 1.0)
    look_at(fill, (0, 0, 0.6))

    w = bpy.data.worlds.new("W")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.520, 0.470, 0.470, 1.0)
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.62
    bpy.context.scene.world = w


def main():
    face = A6.Face("v", look=(0.12, 0.06), pupil=1.0, brow=0.12,
                   mouth="smile", blush=0.45)

    # 一 · hero
    wipe()
    stage_dusk()
    build_v8(0.0, face, "hero")
    s = A6.configure_eevee(128)
    A6.render_to(s, HERO_IMG, (1.30, -2.55, 1.20), (-0.02, 0.06, 0.56), 62, 1200, 1400)

    # 二 · v7 做法 vs v8
    wipe()
    stage_dusk()
    V7.build(-0.62, face, volume=True, p="old")
    build_v8(0.62, face, "new")
    s = A6.configure_eevee(96)
    A6.render_to(s, CMP_IMG, (1.55, -4.45, 1.42), (0.0, 0.10, 0.54), 60, 1700, 940)

    # 三 · 表情重跑一次(五官改過了)
    wipe()
    stage_dusk()
    sp = 0.62
    x0 = -sp * (len(A6.FACES) - 1) / 2
    for i, fc in enumerate(A6.FACES):
        build_v8(x0 + i * sp, fc, f"x{i}")
    s = A6.configure_eevee(96)
    A6.render_to(s, FACE_IMG, (0.0, -5.30, 0.80), (0.0, 0.0, 0.80), 57, 1800, 600)

    print(f"\nHERO={HERO_IMG}\nCOMPARE={CMP_IMG}\nFACES={FACE_IMG}")


if __name__ == "__main__":
    main()
