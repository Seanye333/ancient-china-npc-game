"""Q 版 NPC 生成器 v2 — 把「太簡單」的四個成因逐個拆掉。

v1 是球體堆。它證明了路線可行,但看起來廉價。原因不是面數太少,是四件別的事:

  一 · 沒有描邊。Q 版的辨識度有一半來自輪廓線,少了它體塊就糊成一團。
  二 · 完全對稱地立正。真人不會這樣站——重心、肩線、頭的朝向都該偏一點。
  三 · 每個部件一個純色。沒有腰帶、領緣、袖緣、下襬,所以讀不出「這是衣服」。
  四 · 臉是同一張。眼型、臉寬、眉濃淡沒有參數化,換色不換人。

v2 把這四項都補上,並且證明最後一件事:參數一旦夠多,隨機取樣就能生出
一條不重樣的街——這才是 NPC 遊戲真正需要的東西。

用法:
    /Applications/Blender.app/Contents/MacOS/Blender --background --python qban_npc_v2.py
"""

from __future__ import annotations

import math
import random
from pathlib import Path

import bpy
from mathutils import Vector

OUT = Path(__file__).resolve().parent
CAST_IMG = OUT / "qban2-cast.png"
CROWD_IMG = OUT / "qban2-crowd.png"
DETAIL_IMG = OUT / "qban2-detail.png"

INK = (0.075, 0.068, 0.058, 1.0)
AZURITE = (0.105, 0.245, 0.310, 1.0)
MALACHITE = (0.180, 0.290, 0.200, 1.0)
HEMP = (0.330, 0.265, 0.180, 1.0)
BONE = (0.720, 0.680, 0.590, 1.0)
CINNABAR = (0.480, 0.115, 0.085, 1.0)
OCHRE = (0.400, 0.190, 0.075, 1.0)
IRON = (0.150, 0.160, 0.172, 1.0)
SLATE = (0.170, 0.185, 0.210, 1.0)
PLUM = (0.250, 0.115, 0.150, 1.0)

# 膚色軸 — 階層與風吹日曬的差別,比單一膚色可信
SKINS = [
    (0.800, 0.615, 0.470, 1.0),   # 白皙(士人)
    (0.780, 0.585, 0.445, 1.0),
    (0.720, 0.520, 0.375, 1.0),
    (0.660, 0.460, 0.320, 1.0),   # 黝黑(力役)
]
ROBE_PALETTE = [HEMP, AZURITE, MALACHITE, CINNABAR, OCHRE, SLATE, PLUM,
                (0.255, 0.240, 0.215, 1.0), (0.400, 0.355, 0.290, 1.0)]
HAIR_COLORS = [INK, (0.110, 0.095, 0.080, 1.0), BONE, (0.430, 0.400, 0.360, 1.0)]


# ── 基礎 ────────────────────────────────────────────────────

def wipe() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, color, rough=0.62, metal=0.0, sheen=0.0, sss=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = color
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    # 布料的絨光與皮膚的透光 — Q 版一樣吃這兩個,少了就像塑膠
    for key, val in (("Sheen Weight", sheen), ("Subsurface Weight", sss)):
        try:
            b.inputs[key].default_value = val
        except KeyError:
            pass
    if sss:
        try:
            b.inputs["Subsurface Radius"].default_value = (0.35, 0.16, 0.10)
        except KeyError:
            pass
    return m


def assign(obj, material):
    obj.data.materials.clear()
    obj.data.materials.append(material)


def smooth(obj):
    for poly in obj.data.polygons:
        poly.use_smooth = True


def sphere(name, loc, radius, scale=(1, 1, 1), seg=20, ring=12, material=None, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=ring, radius=radius, location=loc)
    o = bpy.context.active_object
    o.name, o.scale, o.rotation_euler = name, scale, rot
    smooth(o)
    if material:
        assign(o, material)
    return o


def cone(name, loc, r1, r2, depth, verts=20, material=None, rot=(0, 0, 0), scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=depth, location=loc)
    o = bpy.context.active_object
    o.name, o.rotation_euler, o.scale = name, rot, scale
    smooth(o)
    if material:
        assign(o, material)
    return o


def cyl(name, loc, radius, depth, verts=14, material=None, rot=(0, 0, 0), scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc)
    o = bpy.context.active_object
    o.name, o.rotation_euler, o.scale = name, rot, scale
    smooth(o)
    if material:
        assign(o, material)
    return o


def torus(name, loc, major, minor, material=None, rot=(0, 0, 0), scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_torus_add(location=loc, major_radius=major, minor_radius=minor,
                                     major_segments=20, minor_segments=8)
    o = bpy.context.active_object
    o.name, o.rotation_euler, o.scale = name, rot, scale
    smooth(o)
    if material:
        assign(o, material)
    return o


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


# ── 參數 ────────────────────────────────────────────────────

class NPC:
    """v2 的參數表。比 v1 多出來的都在「深度」那一段。"""

    def __init__(self, key, zh, height, head, girth, robe, skin, hair,
                 hat=None, prop=None, brow=0.0, squint=0.0, mouth=0.0,
                 stoop=0.0, beard=None,
                 # ── v2 新增 ──
                 face_w=1.0,          # 臉寬:0.88 瘦長 → 1.12 圓潤
                 eye_tilt=0.0,        # 眼角:正=吊梢,負=垂眼
                 eye_gap=0.38,        # 眼距
                 brow_weight=1.0,     # 眉的濃淡
                 lean=0.0,            # 重心左右偏移
                 turn=0.0,            # 頭的朝向
                 shoulder=0.0,        # 肩線傾斜
                 trim=None,           # 領緣/袖緣的配色
                 sash=None,           # 腰帶
                 hem=0.0):            # 下襬深色的比重
        self.__dict__.update(locals())
        del self.self


def build(npc: NPC, x: float, y: float = 0.0, outline=True):
    parts = []
    p = f"{npc.key}_{x:.2f}_{y:.2f}"

    m_robe = mat(f"{p}_robe", npc.robe, rough=0.80, sheen=0.28)
    m_skin = mat(f"{p}_skin", npc.skin, rough=0.58, sss=0.22)
    m_hair = mat(f"{p}_hair", npc.hair, rough=0.48)
    m_ink = mat(f"{p}_ink", INK, rough=0.28)
    trim_col = npc.trim or tuple(min(1.0, c * 0.55) for c in npc.robe[:3]) + (1.0,)
    m_trim = mat(f"{p}_trim", trim_col, rough=0.72, sheen=0.20)

    H, hr = npc.height, npc.height * npc.head
    body_h = H - hr * 1.85
    st = npc.stoop
    head_z = body_h + hr * 0.78 - st * hr * 0.5
    head_y = y + st * 0.07
    face_y = head_y - hr * 0.86 * npc.face_w

    # 重心 — 整個人微微偏向一側,立正的玩偶感就消失了
    bx = x + npc.lean * hr * 0.22

    # 袍身 + 下襬深色 + 腰帶 —— 三層才讀得出「這是衣服」
    parts.append(cone(f"{p}_robe", (bx, y + st * 0.05, body_h * 0.5),
                      r1=hr * 1.05 * npc.girth, r2=hr * 0.60, depth=body_h,
                      verts=22, material=m_robe, rot=(st * 0.55, 0, npc.lean * 0.04)))
    if npc.hem > 0:
        parts.append(cone(f"{p}_hem", (bx, y + st * 0.05, body_h * npc.hem * 0.5),
                          r1=hr * 1.06 * npc.girth, r2=hr * (1.05 * npc.girth - 0.45 * npc.hem),
                          depth=body_h * npc.hem, verts=22, material=m_trim,
                          rot=(st * 0.55, 0, npc.lean * 0.04)))
    if npc.sash:
        parts.append(cyl(f"{p}_sash", (bx, y, body_h * 0.60),
                         radius=hr * 0.78 * npc.girth, depth=hr * 0.22, verts=20,
                         material=mat(f"{p}_sash_m", npc.sash, rough=0.68, sheen=0.35)))

    # 兩袖 — 肩線可傾斜,一高一低
    for side in (-1, 1):
        drop = npc.shoulder * side * hr * 0.10
        parts.append(cone(f"{p}_sleeve_{side}", (bx + side * hr * 0.84, y, body_h * 0.64 + drop),
                          r1=hr * 0.30, r2=hr * 0.42, depth=body_h * 0.56,
                          verts=14, material=m_robe, rot=(0, side * 0.17, 0)))
        parts.append(torus(f"{p}_cuff_{side}", (bx + side * hr * 0.94, y, body_h * 0.37 + drop),
                           major=hr * 0.38, minor=hr * 0.055, material=m_trim,
                           scale=(1.0, 1.0, 0.6)))
        parts.append(sphere(f"{p}_hand_{side}", (bx + side * hr * 0.96, y - hr * 0.22,
                                                 body_h * 0.40 + drop),
                            hr * 0.155, seg=12, ring=8, material=m_skin))

    # 領緣 — 脖子一圈,分開頭與身
    parts.append(torus(f"{p}_collar", (bx, y, body_h * 0.96),
                       major=hr * 0.46, minor=hr * 0.07, material=m_trim,
                       scale=(1.0, 1.0, 0.75)))

    # ── 頭 ── turn 讓臉朝向偏一點,是「有意識」和「玩偶」的分界
    hx = bx + npc.turn * hr * 0.10
    parts.append(sphere(f"{p}_head", (hx, head_y, head_z), hr,
                        scale=(npc.face_w, 0.94, 1.04), material=m_skin,
                        rot=(0, 0, npc.turn * 0.16)))

    eye_open = 1.0 - npc.squint * 0.70
    eye_z = head_z - hr * 0.06
    for side in (-1, 1):
        ex = hx + side * hr * npc.eye_gap * npc.face_w + npc.turn * hr * 0.06
        parts.append(sphere(f"{p}_eye_{side}", (ex, face_y, eye_z),
                            hr * 0.26, scale=(1.0, 0.30, eye_open), seg=16, ring=10,
                            material=m_ink, rot=(0, 0, 0), ))
        # 眼角傾斜 — 吊梢眼與垂眼是兩種完全不同的人
        if abs(npc.eye_tilt) > 0.01:
            parts[-1].rotation_euler = (0, -side * npc.eye_tilt * 0.5, 0)
        parts.append(cyl(f"{p}_brow_{side}", (ex, face_y + hr * 0.02, head_z + hr * 0.30),
                         radius=hr * 0.070 * npc.brow_weight, depth=hr * 0.40 * npc.brow_weight,
                         verts=8, material=m_ink,
                         rot=(0, math.pi / 2, side * npc.brow)))

    parts.append(sphere(f"{p}_nose", (hx, face_y + hr * 0.06, head_z - hr * 0.22),
                        hr * 0.085, scale=(1.0, 0.9, 0.8), seg=10, ring=7, material=m_skin))

    mouth_z = head_z - hr * 0.46
    for i, side in enumerate((-1, 0, 1)):
        lift = 0.0 if side == 0 else npc.mouth * hr * 0.15
        parts.append(sphere(f"{p}_mouth_{i}", (hx + side * hr * 0.100, face_y + hr * 0.04,
                                               mouth_z + lift),
                            hr * 0.115, scale=(1.0, 0.45, 0.62), seg=10, ring=7, material=m_ink))

    parts.append(sphere(f"{p}_hair", (hx, head_y + hr * 0.06, head_z + hr * 0.73),
                        hr * 1.13 * npc.face_w, scale=(1.0, 1.02, 0.30), material=m_hair))
    if not npc.hat:
        parts.append(sphere(f"{p}_hair_back", (hx, head_y + hr * 0.42, head_z + hr * 0.16),
                            hr * 1.00 * npc.face_w, scale=(1.0, 0.72, 0.86),
                            seg=16, ring=10, material=m_hair))

    if npc.key.startswith("haitong"):
        for side in (-1, 1):
            parts.append(sphere(f"{p}_tuft_{side}", (hx + side * hr * 0.86, head_y,
                                                     head_z + hr * 0.95),
                                hr * 0.28, seg=12, ring=8, material=m_hair))
    if npc.key.startswith("furen"):
        parts.append(sphere(f"{p}_bun", (hx, head_y + hr * 0.24, head_z + hr * 1.26),
                            hr * 0.44, scale=(1.0, 0.86, 0.92), material=m_hair))
        parts.append(cyl(f"{p}_pin", (hx, head_y + hr * 0.24, head_z + hr * 1.30),
                         radius=hr * 0.035, depth=hr * 1.05, verts=6,
                         material=mat(f"{p}_pin_m", (0.640, 0.520, 0.240, 1.0),
                                      rough=0.30, metal=0.75),
                         rot=(0, math.pi / 2, 0.28)))

    if npc.beard:
        parts.append(cone(f"{p}_beard", (hx, face_y + hr * 0.24, head_z - hr * 1.02),
                          r1=hr * 0.34, r2=hr * 0.06, depth=hr * 0.78, verts=12,
                          material=mat(f"{p}_beard_m", npc.beard, rough=0.68),
                          rot=(math.pi, 0, 0)))

    # ── 首服 ── v2 的重點:三種帽子要有完全不同的剪影,不能都做成扁盤
    if npc.hat == "douli":                        # 斗笠 — 寬、尖、有笠頂
        m_straw = mat(f"{p}_straw", (0.490, 0.390, 0.200, 1.0), rough=0.90)
        parts.append(cone(f"{p}_douli", (hx, head_y, head_z + hr * 0.86),
                          r1=hr * 1.85, r2=hr * 0.16, depth=hr * 0.82, verts=24, material=m_straw))
        parts.append(sphere(f"{p}_douli_top", (hx, head_y, head_z + hr * 1.28),
                            hr * 0.20, scale=(1, 1, 0.7), seg=12, ring=8, material=m_straw))
    elif npc.hat == "futou":                      # 幞頭 — 高、方、軟腳下垂
        parts.append(cyl(f"{p}_futou", (hx, head_y, head_z + hr * 0.94),
                         radius=hr * 0.76, depth=hr * 0.86, verts=18, material=m_ink,
                         scale=(1.0, 0.92, 1.0)))
        parts.append(cyl(f"{p}_futou_cap", (hx, head_y, head_z + hr * 1.36),
                         radius=hr * 0.72, depth=hr * 0.14, verts=18, material=m_ink,
                         scale=(1.0, 0.92, 1.0)))
        for side in (-1, 1):                      # 軟腳 — 往後下方垂
            parts.append(cone(f"{p}_futou_tail_{side}",
                              (hx + side * hr * 0.52, head_y + hr * 0.72, head_z + hr * 0.62),
                              r1=hr * 0.10, r2=hr * 0.16, depth=hr * 0.80, verts=8,
                              material=m_ink, rot=(0.95, 0, side * 0.22)))
    elif npc.hat == "helmet":                     # 兜鍪 — 圓頂、盔纓、頓項護頸
        m_iron = mat(f"{p}_iron", (0.210, 0.220, 0.232, 1.0), rough=0.32, metal=0.90)
        parts.append(sphere(f"{p}_helmet", (hx, head_y, head_z + hr * 0.50),
                            hr * 1.09, scale=(1.0, 1.0, 0.62), material=m_iron))
        parts.append(cone(f"{p}_helmet_spike", (hx, head_y, head_z + hr * 1.30),
                          r1=hr * 0.14, r2=0.0, depth=hr * 0.42, verts=10, material=m_iron))
        parts.append(sphere(f"{p}_plume", (hx, head_y + hr * 0.06, head_z + hr * 1.52),
                            hr * 0.26, scale=(0.7, 0.7, 1.25), seg=12, ring=8,
                            material=mat(f"{p}_plume_m", CINNABAR, rough=0.80, sheen=0.5)))
        parts.append(cone(f"{p}_neckguard", (hx, head_y + hr * 0.34, head_z - hr * 0.30),
                          r1=hr * 0.60, r2=hr * 1.00, depth=hr * 0.72, verts=16,
                          material=m_iron, rot=(0.28, 0, 0)))
    elif npc.hat == "guan":                       # 進賢冠 — 文官的高冠
        parts.append(cone(f"{p}_guan", (hx, head_y, head_z + hr * 1.02),
                          r1=hr * 0.62, r2=hr * 0.40, depth=hr * 1.00, verts=14,
                          material=m_ink, rot=(0.18, 0, 0)))
    elif npc.hat == "jin":                        # 幅巾 — 一塊布裹頭,後面打結
        parts.append(sphere(f"{p}_jin", (hx, head_y, head_z + hr * 0.62),
                            hr * 1.14, scale=(1.0, 1.0, 0.52), material=m_trim))
        parts.append(sphere(f"{p}_jin_knot", (hx, head_y + hr * 1.00, head_z + hr * 0.50),
                            hr * 0.28, seg=12, ring=8, material=m_trim))

    # ── 手持物 ──
    if npc.prop == "pole":
        m_wood = mat(f"{p}_wood", (0.240, 0.155, 0.090, 1.0), rough=0.82)
        parts.append(cyl(f"{p}_pole", (bx, y - hr * 0.20, body_h * 1.02),
                         radius=hr * 0.055, depth=H * 0.86, verts=8, material=m_wood,
                         rot=(0, math.pi / 2, npc.shoulder * 0.12)))
        for side in (-1, 1):
            parts.append(cyl(f"{p}_load_{side}", (bx + side * H * 0.36, y - hr * 0.20,
                                                  body_h * 0.80 + side * npc.shoulder * hr * 0.2),
                             radius=hr * 0.30, depth=hr * 0.38, verts=14,
                             material=mat(f"{p}_load_{side}_m", (0.375, 0.300, 0.175, 1.0), rough=0.86)))
    elif npc.prop == "cane":
        parts.append(cyl(f"{p}_cane", (bx + hr * 1.12, y - hr * 0.16, body_h * 0.46),
                         radius=hr * 0.055, depth=body_h * 0.98, verts=8,
                         material=mat(f"{p}_cane_m", (0.260, 0.175, 0.100, 1.0), rough=0.84),
                         rot=(0, 0.07, 0)))
    elif npc.prop == "spear":
        parts.append(cyl(f"{p}_spear", (bx + hr * 1.10, y - hr * 0.14, H * 0.60),
                         radius=hr * 0.055, depth=H * 1.38, verts=8,
                         material=mat(f"{p}_shaft", (0.225, 0.145, 0.085, 1.0), rough=0.80)))
        parts.append(cone(f"{p}_spearhead", (bx + hr * 1.10, y - hr * 0.14, H * 1.32),
                          r1=hr * 0.13, r2=0.0, depth=hr * 0.58, verts=10,
                          material=mat(f"{p}_blade", (0.580, 0.595, 0.610, 1.0), rough=0.22, metal=0.92)))
    elif npc.prop == "scroll":
        parts.append(cyl(f"{p}_scroll", (bx - hr * 1.02, y - hr * 0.36, body_h * 0.40),
                         radius=hr * 0.11, depth=hr * 0.70, verts=10,
                         material=mat(f"{p}_paper", (0.790, 0.745, 0.640, 1.0), rough=0.86),
                         rot=(0, math.pi / 2, 0.22)))
    elif npc.prop == "basket":
        parts.append(cone(f"{p}_basket", (bx + hr * 1.08, y - hr * 0.26, body_h * 0.34),
                          r1=hr * 0.44, r2=hr * 0.30, depth=hr * 0.42, verts=14,
                          material=mat(f"{p}_wicker", (0.445, 0.345, 0.180, 1.0), rough=0.90)))
    elif npc.prop == "jar":
        parts.append(sphere(f"{p}_jar", (bx + hr * 1.05, y - hr * 0.26, body_h * 0.42),
                            hr * 0.34, scale=(1, 1, 1.15), seg=14, ring=9,
                            material=mat(f"{p}_clay", (0.330, 0.215, 0.145, 1.0), rough=0.72)))
    elif npc.prop == "bundle":
        parts.append(cyl(f"{p}_bundle", (bx, y + hr * 0.70, body_h * 0.92),
                         radius=hr * 0.46, depth=hr * 0.62, verts=14,
                         material=mat(f"{p}_cloth", (0.400, 0.330, 0.230, 1.0), rough=0.88),
                         rot=(0.3, 0, 0)))

    return parts


# ── 描邊 ────────────────────────────────────────────────────
# Freestyle 是離線渲染的做法;遊戲裡等價實現是 inverted hull(把模型沿法線
# 外擴一圈、翻轉法線、塗黑),three.js 生態現成的方案很多。這裡要驗證的是
# 「有沒有描邊」對觀感的差別,不是具體技術。

def enable_outline(scene, thickness=1.9):
    scene.render.use_freestyle = True
    vl = scene.view_layers[0]
    vl.use_freestyle = True
    fs = vl.freestyle_settings
    fs.crease_angle = math.radians(134)
    lineset = fs.linesets[0] if fs.linesets else fs.linesets.new("outline")
    lineset.select_silhouette = True
    lineset.select_border = True
    lineset.select_crease = True
    lineset.select_edge_mark = False
    # 背景執行時 lineset 不會自帶 linestyle,得自己建一個掛上去
    ls = lineset.linestyle
    if ls is None:
        ls = bpy.data.linestyles.new("OutlineStyle")
        lineset.linestyle = ls
    ls.color = (0.055, 0.048, 0.042)
    ls.thickness = thickness
    ls.alpha = 0.92


# ── 場景 ────────────────────────────────────────────────────

def stage(backdrop_y=6.0):
    bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, 0))
    bpy.context.active_object.name = "Ground"
    assign(bpy.context.active_object, mat("ground", (0.170, 0.152, 0.128, 1.0), rough=0.95))
    bpy.ops.mesh.primitive_plane_add(size=80, location=(0, backdrop_y, 0),
                                     rotation=(math.pi / 2, 0, 0))
    bpy.context.active_object.name = "Backdrop"
    assign(bpy.context.active_object, mat("backdrop", (0.240, 0.222, 0.188, 1.0), rough=0.97))


def lights():
    bpy.ops.object.light_add(type="AREA", location=(3.4, -3.6, 4.4))
    k = bpy.context.active_object
    k.data.energy, k.data.size, k.data.color = 1200, 4.0, (1.0, 0.86, 0.68)
    look_at(k, (0, 0, 0.7))
    bpy.ops.object.light_add(type="AREA", location=(-4.4, 1.4, 2.6))
    f = bpy.context.active_object
    f.data.energy, f.data.size, f.data.color = 330, 5.0, (0.55, 0.74, 0.88)
    look_at(f, (0, 0, 0.6))
    bpy.ops.object.light_add(type="AREA", location=(0.5, 4.6, 2.4))
    r = bpy.context.active_object
    r.data.energy, r.data.size, r.data.color = 500, 3.0, (1.0, 0.92, 0.80)
    look_at(r, (0, 0, 0.8))
    w = bpy.data.worlds.new("World")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.060, 0.064, 0.074, 1.0)
    bpy.context.scene.world = w


def configure(samples=120, outline=True):
    s = bpy.context.scene
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = d.type == "METAL"
    except (AttributeError, TypeError, KeyError):
        pass
    s.render.engine = "CYCLES"
    s.cycles.device = "GPU"
    s.cycles.samples = samples
    s.cycles.use_denoising = True
    s.cycles.max_bounces = 6
    s.render.image_settings.file_format = "PNG"
    if outline:
        enable_outline(s)
    return s


def render_to(scene, path, loc, target, lens, rx, ry):
    bpy.ops.object.camera_add(location=loc)
    cam = bpy.context.active_object
    cam.data.lens = lens
    look_at(cam, target)
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = rx, ry
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)


def count_verts(parts):
    dg = bpy.context.evaluated_depsgraph_get()
    return sum(len(o.evaluated_get(dg).to_mesh().vertices) for o in parts)


# ── 一 · 深化後的六人 ────────────────────────────────────────

CAST = [
    NPC("huolang", "貨郎", 1.00, 0.205, 0.92, HEMP, SKINS[3], INK,
        hat="douli", prop="pole", brow=0.15, squint=0.34, mouth=0.30,
        face_w=0.96, eye_tilt=0.10, brow_weight=1.15, lean=-0.5, turn=0.4,
        shoulder=0.55, sash=(0.230, 0.180, 0.115, 1.0), hem=0.16),
    NPC("laoweng", "老翁", 0.94, 0.225, 1.02, (0.255, 0.240, 0.215, 1.0), SKINS[2], BONE,
        hat="jin", prop="cane", brow=-0.18, squint=0.58, mouth=-0.28, stoop=0.17, beard=BONE,
        face_w=0.92, eye_tilt=-0.22, brow_weight=1.3, lean=0.6, turn=-0.3,
        shoulder=-0.25, trim=(0.180, 0.170, 0.150, 1.0), hem=0.12),
    NPC("haitong", "孩童", 0.72, 0.250, 1.06, CINNABAR, SKINS[1], INK,
        brow=0.32, squint=0.0, mouth=0.70,
        face_w=1.12, eye_gap=0.40, brow_weight=0.7, lean=0.8, turn=0.7,
        shoulder=0.30, sash=(0.620, 0.480, 0.180, 1.0)),
    NPC("wenshi", "文士", 1.06, 0.195, 0.96, AZURITE, SKINS[0], INK,
        hat="guan", prop="scroll", brow=0.06, squint=0.24, mouth=0.10,
        face_w=0.90, eye_tilt=-0.08, eye_gap=0.36, brow_weight=0.85,
        lean=0.0, turn=-0.5, shoulder=-0.10,
        trim=(0.055, 0.130, 0.170, 1.0), sash=(0.640, 0.560, 0.330, 1.0), hem=0.20),
    NPC("bingzu", "兵卒", 1.14, 0.185, 1.14, IRON, SKINS[2], INK,
        hat="helmet", prop="spear", brow=-0.34, squint=0.44, mouth=-0.32,
        face_w=1.05, eye_tilt=0.24, brow_weight=1.35, lean=-0.3, turn=0.2,
        shoulder=0.20, trim=(0.320, 0.100, 0.075, 1.0), sash=CINNABAR),
    NPC("furen", "婦人", 0.99, 0.200, 0.94, MALACHITE, SKINS[1], INK,
        prop="basket", brow=0.10, squint=0.20, mouth=0.26,
        face_w=1.00, eye_tilt=-0.12, eye_gap=0.40, brow_weight=0.75,
        lean=0.4, turn=-0.6, shoulder=-0.35,
        trim=(0.700, 0.640, 0.480, 1.0), sash=(0.560, 0.420, 0.300, 1.0), hem=0.22),
]


def render_cast():
    wipe()
    stage(6.0)
    lights()
    sp = 0.96
    x0 = -sp * (len(CAST) - 1) / 2
    verts = 0
    for i, n in enumerate(CAST):
        verts += count_verts(build(n, x0 + i * sp))
    s = configure(130)
    render_to(s, CAST_IMG, (0.0, -8.2, 1.02), (0.0, 0.0, 0.56), 52, 1700, 720)
    render_to(s, DETAIL_IMG, (0.70, -2.55, 1.05), (0.52, 0.0, 0.78), 80, 1000, 1000)
    return verts // len(CAST)


# ── 二 · 隨機取樣的一條街 ────────────────────────────────────
# 參數一旦夠多,隨機組合就能生出不重樣的人群。這才是 NPC 遊戲要的東西:
# 不是「六個做好的角色」,是「一個能生出六百個的函式」。

HATS = [None, "douli", "futou", "jin", "guan", "helmet"]
PROPS = [None, "pole", "cane", "spear", "scroll", "basket", "jar", "bundle"]


def random_npc(rng: random.Random, idx: int) -> NPC:
    age = rng.random()                       # 0 童 → 1 老
    old = age > 0.78
    child = age < 0.16
    height = 0.70 + age * 0.30 if child else rng.uniform(0.93, 1.15)
    hair = BONE if old else rng.choice(HAIR_COLORS[:2])
    return NPC(
        f"r{idx}", f"路人{idx}",
        height=height,
        head=0.250 if child else rng.uniform(0.185, 0.215),
        girth=rng.uniform(0.88, 1.18),
        robe=rng.choice(ROBE_PALETTE),
        skin=rng.choice(SKINS),
        hair=hair,
        hat=None if child else rng.choice(HATS),
        prop=rng.choice(PROPS),
        brow=rng.uniform(-0.40, 0.35),
        squint=rng.uniform(0.0, 0.55),
        mouth=rng.uniform(-0.55, 0.70),
        stoop=rng.uniform(0.10, 0.20) if old else 0.0,
        beard=BONE if old and rng.random() < 0.7 else None,
        face_w=rng.uniform(0.90, 1.12),
        eye_tilt=rng.uniform(-0.25, 0.25),
        eye_gap=rng.uniform(0.35, 0.42),
        brow_weight=rng.uniform(0.7, 1.35),
        lean=rng.uniform(-0.9, 0.9),
        turn=rng.uniform(-0.8, 0.8),
        shoulder=rng.uniform(-0.5, 0.5),
        trim=rng.choice(ROBE_PALETTE) if rng.random() < 0.6 else None,
        sash=rng.choice(ROBE_PALETTE) if rng.random() < 0.65 else None,
        hem=rng.uniform(0.0, 0.24),
    )


def render_crowd(seed=20260802, n=12):
    wipe()
    stage(9.0)
    lights()
    rng = random.Random(seed)
    # 兩排錯落,後排退後並抬高間距,讀起來像一條街而不是隊列
    front, back = n // 2, n - n // 2
    for i in range(front):
        build(random_npc(rng, i), -2.75 + i * 1.10, 0.0)
    for i in range(back):
        build(random_npc(rng, 100 + i), -3.30 + i * 1.10, 2.30)
    s = configure(130)
    render_to(s, CROWD_IMG, (0.0, -9.6, 1.85), (0.0, 0.6, 0.70), 50, 1700, 780)


def main():
    avg = render_cast()
    render_crowd()
    print(f"\n平均每人 {avg:,} 頂點(v1 為 1,515,寫實 MPFB 基座 19,158)")
    print(f"CAST={CAST_IMG}\nCROWD={CROWD_IMG}\nDETAIL={DETAIL_IMG}")


if __name__ == "__main__":
    main()
