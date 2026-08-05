"""v9 — 世界生成器:一條街。

在頭髮上卡了三輪之後換方向,而且理由不是「繞過困難」:
按前面得出的分界線(幾何化的能堆、有機形體必須雕),**建築正好落在能堆那一邊**。
台基、柱、牆、格扇、瓦壟、屋脊、起翹、幌子——沒有一樣是連續轉折的有機體。

中國古建更是天生模組化:開間、進深、屋頂形制都有定式。
給一組參數(幾間、幾進、什麼頂、什麼色),出一棟房子;排一排,出一條街。

用法:
    /Applications/Blender.app/Contents/MacOS/Blender --background --python qban_street_v9.py
"""

from __future__ import annotations

import math
import random
import sys
from pathlib import Path

import bpy

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import qban_anime_v6 as A6                       # noqa: E402
import qban_volume_v7 as V7                      # noqa: E402
from qban_npc_v2 import sphere, cone, cyl, wipe, look_at   # noqa: E402

STREET_IMG = HERE / "qban9-street.png"
CLOSE_IMG = HERE / "qban9-close.png"

# 材質譜 — 木構赭紅、夯土牆、青瓦,黃昏下的一套
WOOD = (0.360, 0.145, 0.105, 1.0)
WOOD_DARK = (0.235, 0.105, 0.080, 1.0)
WALL = (0.780, 0.720, 0.615, 1.0)
WALL_MUD = (0.640, 0.550, 0.420, 1.0)
TILE = (0.230, 0.250, 0.285, 1.0)
TILE_LIGHT = (0.290, 0.315, 0.340, 1.0)
STONE = (0.580, 0.540, 0.480, 1.0)
PAPER = (0.930, 0.830, 0.620, 1.0)
CLOTH = (0.560, 0.185, 0.135, 1.0)
LANTERN = (0.980, 0.560, 0.280, 1.0)

MATS: dict = {}


def M(key, color, rim=0.34, **kw):
    """材質快取 — 一條街有幾百個物件,不快取會生出幾百份材質。"""
    if key not in MATS:
        MATS[key] = V7.toon_vol(key, color, rim=rim, **kw)
    return MATS[key]


def box(name, loc, size, material, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    o.rotation_euler = rot
    o.data.materials.append(material)
    return o


# ── 屋頂 ── 中國屋頂的辨識度全在坡度、瓦壟、正脊與起翹
def roof(name, cx, cy, w, d, base_z, pitch=0.42, eave=0.30, tiles=True):
    ridge_z = base_z + d * 0.5 * pitch
    m_tile = M("tile", TILE, rim=0.30)
    m_tile_l = M("tile_l", TILE_LIGHT, rim=0.42)
    m_wood_d = M("wood_d", WOOD_DARK, rim=0.28)

    half_d = d * 0.5 + eave
    slope_len = math.hypot(half_d, ridge_z - base_z)
    ang = math.atan2(ridge_z - base_z, half_d)

    for side in (-1, 1):                       # 兩坡
        box(f"{name}_slope{side}",
            (cx, cy + side * half_d * 0.5, (base_z + ridge_z) * 0.5),
            (w + eave * 2, slope_len, 0.055),
            m_tile, rot=(side * ang, 0, 0))
        if tiles:                              # 瓦壟 — 這個細節最出效果
            n = max(4, int(w / 0.16))
            for i in range(n):
                gx = cx - (w + eave * 1.6) * 0.5 + (w + eave * 1.6) * (i + 0.5) / n
                cyl(f"{name}_t{side}_{i}", (gx, cy + side * half_d * 0.5,
                                            (base_z + ridge_z) * 0.5 + 0.035),
                    radius=0.030, depth=slope_len * 0.98, verts=6,
                    material=m_tile_l, rot=(math.pi / 2 + side * ang, 0, 0))
    box(f"{name}_ridge", (cx, cy, ridge_z + 0.045),
        (w + eave * 2.1, 0.10, 0.085), m_wood_d)
    for ex in (-1, 1):                         # 博風板 — 山牆那道斜邊,取代做壞的起翹
        box(f"{name}_barge{ex}", (cx + ex * (w * 0.5 + eave * 0.9), cy,
                                  (base_z + ridge_z) * 0.5 + 0.03),
            (0.07, d + eave * 2.0, 0.10), m_wood_d)
    box(f"{name}_eave", (cx, cy, base_z - 0.02), (w + eave * 2.2, d + eave * 2.2, 0.05),
        m_wood_d)


def building(x, y, bays=3, depth=2.2, floors=1, facing=1, rng=None, key="b"):
    """一棟臨街鋪面。bays=開間數,facing=+1 面向街(-y)。"""
    rng = rng or random.Random(0)
    bay_w = 1.05
    w = bays * bay_w
    m_wood = M("wood", WOOD, rim=0.34)
    m_wood_d = M("wood_d", WOOD_DARK, rim=0.28)
    m_wall = M("wall", WALL, rim=0.36)
    m_mud = M("wall_mud", WALL_MUD, rim=0.32)
    m_stone = M("stone", STONE, rim=0.30)
    m_paper = M("paper", PAPER, rim=0.50)

    base_h = 0.16
    box(f"{key}_podium", (x, y, base_h * 0.5), (w + 0.42, depth + 0.42, base_h), m_stone)

    floor_h = 1.05
    for fl in range(floors):
        z0 = base_h + fl * floor_h
        # 柱 — 開間的骨
        for i in range(bays + 1):
            px = x - w * 0.5 + i * bay_w
            cyl(f"{key}_col{fl}_{i}", (px, y - facing * depth * 0.5, z0 + floor_h * 0.5),
                radius=0.055, depth=floor_h, verts=8, material=m_wood)
        # 背牆與兩側
        box(f"{key}_back{fl}", (x, y + facing * depth * 0.5, z0 + floor_h * 0.5),
            (w, 0.10, floor_h), m_mud)
        for sx in (-1, 1):
            box(f"{key}_side{fl}{sx}", (x + sx * w * 0.5, y, z0 + floor_h * 0.5),
                (0.10, depth, floor_h), m_mud)
        # 臨街面:一間門、其餘格扇窗
        door_bay = rng.randrange(bays)
        for i in range(bays):
            bx = x - w * 0.5 + (i + 0.5) * bay_w
            fy = y - facing * (depth * 0.5 + 0.02)
            if fl == 0 and i == door_bay:
                box(f"{key}_door{i}", (bx, fy, z0 + floor_h * 0.42),
                    (bay_w * 0.72, 0.055, floor_h * 0.84), m_wood_d)
                for h in (-1, 1):              # 門扇分縫
                    box(f"{key}_dl{i}{h}", (bx + h * bay_w * 0.17, fy - 0.03,
                                            z0 + floor_h * 0.42),
                        (0.028, 0.03, floor_h * 0.80), m_wood)
            else:
                box(f"{key}_win{fl}{i}", (bx, fy, z0 + floor_h * 0.60),
                    (bay_w * 0.74, 0.045, floor_h * 0.46), m_paper)
                for gi in range(4):            # 格扇欞條
                    box(f"{key}_g{fl}{i}{gi}",
                        (bx - bay_w * 0.28 + gi * bay_w * 0.185, fy - 0.03,
                         z0 + floor_h * 0.60),
                        (0.026, 0.03, floor_h * 0.46), m_wood)
                box(f"{key}_sill{fl}{i}", (bx, fy, z0 + floor_h * 0.36),
                    (bay_w * 0.78, 0.06, 0.05), m_wood_d)
        # 額枋 — 柱頭那道橫木,古建的立面全靠它分層
        box(f"{key}_arch{fl}", (x, y - facing * depth * 0.5, z0 + floor_h - 0.05),
            (w + 0.12, 0.09, 0.10), m_wood_d)

    top_z = base_h + floors * floor_h
    roof(f"{key}_roof", x, y, w, depth, top_z, pitch=0.46, eave=0.34)
    return w, top_z


def shop_sign(x, y, z, key, rng):
    """幌子與燈籠 — 街道的生活感有一半在這些懸掛物上"""
    m_cloth = M("cloth", CLOTH, rim=0.44)
    m_wood_d = M("wood_d", WOOD_DARK, rim=0.28)
    m_lan = A6.flat(f"{key}_lan", LANTERN)
    if rng.random() < 0.7:                     # 豎幌
        cyl(f"{key}_pole", (x, y - 0.16, z + 0.22), radius=0.028, depth=0.52,
            verts=6, material=m_wood_d, rot=(math.pi / 2, 0, 0))
        box(f"{key}_flag", (x, y - 0.40, z - 0.18), (0.26, 0.03, 0.72), m_cloth)
    if rng.random() < 0.8:                     # 燈籠
        for dx in ((-0.42, 0.42) if rng.random() < 0.5 else (0.0,)):
            sphere(f"{key}_lantern{dx}", (x + dx, y - 0.30, z - 0.10), 0.115,
                   scale=(1.0, 1.0, 1.25), seg=14, ring=10, material=m_lan)
            cyl(f"{key}_lstr{dx}", (x + dx, y - 0.30, z + 0.06), radius=0.012,
                depth=0.20, verts=6, material=m_wood_d)


def street(rng):
    m_stone = M("stone", STONE, rim=0.30)
    m_slab = M("slab", (0.455, 0.435, 0.400, 1.0), rim=0.26)
    # 石板路 — 中央御道 + 兩側,錯縫排列
    for i in range(26):
        yy = -5.0 + i * 0.86
        for j in range(5):
            xx = -1.7 + j * 0.85 + (0.16 if i % 2 else -0.16)
            box(f"slab{i}_{j}", (xx, yy, 0.012), (0.80, 0.80, 0.024), m_slab)
    for sx in (-1, 1):                          # 街沿石
        box(f"curb{sx}", (sx * 2.42, 3.0, 0.055), (0.20, 22.0, 0.11), m_stone)


def lamp_posts(rng):
    m_wood_d = M("wood_d", WOOD_DARK, rim=0.28)
    m_lan = A6.flat("post_lan", LANTERN)
    for i in range(4):
        for sx in (-1, 1):
            yy = -2.4 + i * 3.4
            cyl(f"lp{i}{sx}", (sx * 2.62, yy, 0.72), radius=0.042, depth=1.44,
                verts=8, material=m_wood_d)
            sphere(f"lpl{i}{sx}", (sx * 2.62, yy, 1.54), 0.135,
                   scale=(1.0, 1.0, 1.30), seg=14, ring=10, material=m_lan)


def sky_and_light():
    bpy.ops.mesh.primitive_plane_add(size=400, location=(0, 0, -0.02))
    g = bpy.context.active_object
    g.name = "Earth"
    g.data.materials.append(M("earth", (0.560, 0.470, 0.360, 1.0), rim=0.20,
                              shadow=0.56, cool=0.10, split=0.44))
    # 遠山三層
    ridges = ((-22, 44, 20, 4.2, 0.38), (-6, 48, 24, 5.6, 0.42), (12, 45, 18, 3.8, 0.38),
              (26, 52, 22, 6.2, 0.46), (-14, 66, 34, 8.0, 0.62), (14, 70, 38, 9.4, 0.66),
              (0, 92, 70, 12.0, 0.80))
    for i, (dx, dist, w_, h_, tone) in enumerate(ridges):
        bpy.ops.mesh.primitive_cone_add(vertices=7, radius1=w_ * 0.5, radius2=w_ * 0.14,
                                        depth=h_ * 2.0, location=(dx, dist, 0))
        o = bpy.context.active_object
        o.name = f"Hill{i}"
        o.scale = (1.0, 0.55, 1.0)             # 壓扁成山脊,不是金字塔
        o.data.materials.append(A6.flat(f"hill{i}", (0.360 + tone * 0.48,
                                                     0.330 + tone * 0.44,
                                                     0.395 + tone * 0.38, 1.0)))
    bpy.ops.mesh.primitive_plane_add(size=600, location=(0, 110.0, 0),
                                     rotation=(math.pi / 2, 0, 0))
    bpy.context.active_object.name = "Sky"
    bpy.context.active_object.data.materials.append(
        A6.flat("sky", (1.000, 0.790, 0.555, 1.0)))

    bpy.ops.object.light_add(type="SUN", location=(7.0, -3.0, 4.4))
    key = bpy.context.active_object
    key.data.energy = 4.2
    key.data.angle = 0.03
    key.data.color = (1.0, 0.80, 0.55)
    look_at(key, (0, 0, 0.8))
    bpy.ops.object.light_add(type="AREA", location=(-4.0, -6.0, 3.0))
    fill = bpy.context.active_object
    fill.data.energy, fill.data.size = 95, 6.0
    fill.data.color = (0.52, 0.64, 1.0)
    look_at(fill, (0, 2, 0.8))

    w = bpy.data.worlds.new("W")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.700, 0.545, 0.430, 1.0)
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.82
    bpy.context.scene.world = w


def populate(rng):
    """放幾個人進去當尺度參照 — 世界的比例得有人才讀得出來。"""
    poses = ((-1.35, -1.2, 0.10), (0.95, 1.6, -0.35), (-0.55, 4.4, 0.20),
             (1.45, 6.8, -0.15))
    for i, (px, py, turn) in enumerate(poses):
        f = A6.Face(f"p{i}", look=(turn, 0.0), pupil=1.0,
                    brow=rng.uniform(-0.2, 0.25),
                    mouth=rng.choice(("smile", "neutral", "open")),
                    blush=rng.uniform(0.0, 0.5))
        A6.build_anime(px, f, with_body=True, p=f"npc{i}")
        # build_anime 只吃 x,把整個人挪到街上的位置
        for o in bpy.data.objects:
            if o.name.startswith(f"npc{i}_") and abs(o.location.y) < 50:
                o.location.y += py


def main():
    rng = random.Random(20260802)
    wipe()
    sky_and_light()
    street(rng)
    lamp_posts(rng)

    # 兩側各排一列鋪面,進深與開間隨機,面向街心
    y = -4.2
    while y < 9.0:
        bays = rng.choice((2, 3, 3, 4))
        depth = rng.uniform(2.0, 2.8)
        floors = 2 if rng.random() < 0.35 else 1
        for sx in (-1, 1):
            w, top = building(sx * (2.9 + depth * 0.5), y, bays=bays, depth=depth,
                              floors=floors, facing=sx, rng=rng, key=f"b{sx}{y:.1f}")
            shop_sign(sx * (2.9 + depth * 0.05), y - 0.9 * sx, top * 0.72,
                      f"s{sx}{y:.1f}", rng)
        y += max(3.0, bays * 1.05 + 0.7)

    populate(rng)

    s = A6.configure_eevee(96)
    # 街道盡頭望進去 — 透視最強的角度
    A6.render_to(s, STREET_IMG, (0.55, -7.4, 1.75), (0.0, 4.0, 1.05), 42, 1800, 1000)
    A6.render_to(s, CLOSE_IMG, (2.05, -3.1, 1.42), (-0.6, 1.4, 0.85), 55, 1500, 1000)
    print(f"\nSTREET={STREET_IMG}\nCLOSE={CLOSE_IMG}")


if __name__ == "__main__":
    main()
