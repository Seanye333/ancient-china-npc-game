"""Q 版 NPC 生成器原型 — 參數進,一條街的人出。

驗證三件事,都是「自己做人物 vs Mixamo」這個決定的關鍵依據:

1. 造型可以程序化生成。同一組參數槽(身高/頭身比/胖瘦/衣色/髮式/首服/手持物)
   餵不同的值,出來的是可辨識的不同身份,而不是換色的同一個人。
2. 頂點預算。Q 版本來就該低模,低模在這個風格下是「對的」而非妥協。
   腳本結束會印出每個角色套用修改器後的實際頂點數。
3. 表情不需要面部骨骼。眉/眼/嘴是貼在臉上的幾何,改三個浮點數就是換一種神色——
   這正好繞開 Mixamo 最致命的限制(mixamorig 沒有面部骨骼,臉是死的)。

用法:
    /Applications/Blender.app/Contents/MacOS/Blender --background \
        --python qban_npc_prototype.py
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector

OUT = Path(__file__).resolve().parent
STREET = OUT / "qban-street.png"
CLOSEUP = OUT / "qban-closeup.png"
FACES = OUT / "qban-faces.png"

# 礦物顏料色系 — 石青 / 石綠 / 赭石 / 墨,和畫面方向提案同一套色板。
INK = (0.075, 0.068, 0.058, 1.0)
AZURITE = (0.105, 0.245, 0.310, 1.0)
MALACHITE = (0.180, 0.290, 0.200, 1.0)
HEMP = (0.330, 0.265, 0.180, 1.0)
BONE = (0.720, 0.680, 0.590, 1.0)
CINNABAR = (0.480, 0.115, 0.085, 1.0)
SKIN = (0.780, 0.585, 0.445, 1.0)
SKIN_OLD = (0.720, 0.565, 0.455, 1.0)
IRON = (0.150, 0.160, 0.172, 1.0)


# ── 基礎工具 ────────────────────────────────────────────────

def wipe() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name: str, color, rough: float = 0.62, metal: float = 0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    return m


def assign(obj, material) -> None:
    obj.data.materials.clear()
    obj.data.materials.append(material)


def smooth(obj) -> None:
    for poly in obj.data.polygons:
        poly.use_smooth = True


def sphere(name, loc, radius, scale=(1, 1, 1), seg=20, ring=12, material=None, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=ring, radius=radius, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    o.rotation_euler = rot
    smooth(o)
    if material:
        assign(o, material)
    return o


def cone(name, loc, r1, r2, depth, verts=20, material=None, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=depth, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.rotation_euler = rot
    smooth(o)
    if material:
        assign(o, material)
    return o


def cyl(name, loc, radius, depth, verts=14, material=None, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.rotation_euler = rot
    smooth(o)
    if material:
        assign(o, material)
    return o


def look_at(obj, target) -> None:
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


# ── 人物參數 ────────────────────────────────────────────────
# 這就是「生成器」的介面。加一個 NPC = 加一行,不是再雕一次。

class NPC:
    def __init__(self, key, zh, height, head, girth, robe, skin, hair,
                 hat=None, prop=None, brow=0.0, squint=0.0, mouth=0.0,
                 stoop=0.0, beard=None):
        self.key = key          # 物件命名前綴
        self.zh = zh            # 身份
        self.height = height    # 總高(m)——孩童 0.72,兵卒 1.14
        self.head = head        # 頭身比:頭半徑 / 總高。Q 版落在 0.17–0.25
        self.girth = girth      # 胖瘦:袍身下擺半徑係數
        self.robe = robe
        self.skin = skin
        self.hair = hair
        self.hat = hat          # 'douli'斗笠 / 'futou'幞頭 / 'helmet'兜鍪 / None
        self.prop = prop        # 'pole'扁擔 / 'cane'杖 / 'spear'矛 / 'scroll'卷 / 'basket'籃
        # ── 神色三參數 ── 這三個浮點數就是「表情系統」的全部
        self.brow = brow        # 眉傾角:正=舒展,負=蹙起
        self.squint = squint    # 眼開合:0 圓睜,1 眯起
        self.mouth = mouth      # 嘴角:正=上揚,負=下撇
        self.stoop = stoop      # 佝僂
        self.beard = beard


CAST = [
    NPC("huolang", "貨郎", 1.00, 0.205, 0.92, HEMP, SKIN, INK,
        hat="douli", prop="pole", brow=0.15, squint=0.30, mouth=0.35),
    NPC("laoweng", "老翁", 0.94, 0.225, 1.02, (0.255, 0.240, 0.215, 1.0), SKIN_OLD, BONE,
        prop="cane", brow=-0.18, squint=0.55, mouth=-0.25, stoop=0.16, beard=BONE),
    NPC("haitong", "孩童", 0.72, 0.250, 1.05, CINNABAR, SKIN, INK,
        brow=0.30, squint=0.0, mouth=0.65),
    NPC("wenshi", "文士", 1.06, 0.195, 0.98, AZURITE, SKIN, INK,
        hat="futou", prop="scroll", brow=0.05, squint=0.22, mouth=0.10),
    NPC("bingzu", "兵卒", 1.14, 0.185, 1.12, IRON, SKIN, INK,
        hat="helmet", prop="spear", brow=-0.32, squint=0.42, mouth=-0.30),
    NPC("furen", "婦人", 0.99, 0.200, 0.94, MALACHITE, SKIN, INK,
        prop="basket", brow=0.10, squint=0.18, mouth=0.25),
]


def build(npc: NPC, x: float, y: float = 0.0):
    """把一組參數變成一個角色。回傳它的所有物件。"""
    parts = []
    p = f"{npc.key}_{x:.2f}"

    m_robe = mat(f"{p}_robe", npc.robe, rough=0.78)
    m_skin = mat(f"{p}_skin", npc.skin, rough=0.55)
    m_hair = mat(f"{p}_hair", npc.hair, rough=0.52)
    m_ink = mat(f"{p}_ink", INK, rough=0.28)       # 五官要夠黑,否則強光下讀成灰豆子

    H = npc.height
    hr = H * npc.head                      # 頭半徑
    body_h = H - hr * 1.85                 # 身高扣掉頭
    lean = npc.stoop
    head_z = body_h + hr * 0.78 - lean * hr * 0.5
    head_y = y + lean * 0.07
    face_y = head_y - hr * 0.86            # 臉面(五官貼在這個深度)

    # 袍身 — 一個下擺外張的錐台。Q 版不做腿,下擺落地。
    robe = cone(f"{p}_robe", (x, y + lean * 0.05, body_h * 0.5),
                r1=hr * 1.05 * npc.girth, r2=hr * 0.60, depth=body_h,
                verts=22, material=m_robe, rot=(lean * 0.55, 0, 0))
    parts.append(robe)

    # 兩袖 — 錐台,袖口大於袖根(寬袍大袖的簡寫),有厚度不是紙片
    for side in (-1, 1):
        parts.append(cone(f"{p}_sleeve_{side}", (x + side * hr * 0.84, y, body_h * 0.64),
                          r1=hr * 0.30, r2=hr * 0.40, depth=body_h * 0.56,
                          verts=14, material=m_robe, rot=(0, side * 0.17, 0)))
        # 手 — 塞進袖口裡,不是浮在外面
        parts.append(sphere(f"{p}_hand_{side}",
                            (x + side * hr * 0.94, y - hr * 0.20, body_h * 0.42),
                            hr * 0.155, seg=12, ring=8, material=m_skin))

    # 頭 — 略扁的球。Q 版的辨識度九成在這顆球上。
    head = sphere(f"{p}_head", (x, head_y, head_z), hr,
                  scale=(1.0, 0.94, 1.04), material=m_skin)
    parts.append(head)

    # ── 五官 ── 全部貼在臉面上,靠參數換神色,不需要任何骨骼。
    # 垂直排版是這整個造型最容易錯的地方,所以把佔位寫死在一處(單位皆為頭半徑):
    #   髮下緣 +0.39 / 眉頂 +0.31 / 眉心 +0.24 / 眼頂 +0.20 / 眼心 -0.06
    #   鼻 -0.22 / 嘴 -0.46
    # 髮下緣一旦低於眉頂,整條眉會被吃掉,臉就只剩兩顆豆子。
    eye_open = 1.0 - npc.squint * 0.70
    eye_z = head_z - hr * 0.06
    for side in (-1, 1):
        # 眼 — 佔頭寬約 26%,Q 版靠這個尺寸讀神色
        parts.append(sphere(f"{p}_eye_{side}", (x + side * hr * 0.38, face_y, eye_z),
                            hr * 0.26, scale=(1.0, 0.30, eye_open),
                            seg=16, ring=10, material=m_ink))
        # 眉 — 緊貼眼上方的粗短一筆,傾角由 brow 決定
        parts.append(cyl(f"{p}_brow_{side}",
                         (x + side * hr * 0.38, face_y + hr * 0.02, head_z + hr * 0.30),
                         radius=hr * 0.070, depth=hr * 0.40, verts=8, material=m_ink,
                         rot=(0, math.pi / 2, side * npc.brow)))

    # 鼻 — 一顆小球。Q 版可以沒有,但有了臉才不空。
    parts.append(sphere(f"{p}_nose", (x, face_y + hr * 0.06, head_z - hr * 0.22),
                        hr * 0.085, scale=(1.0, 0.9, 0.8), seg=10, ring=7, material=m_skin))

    # 嘴 — 三顆互相重疊的小球連成一條弧線(間距須小於半徑,否則散成三點),
    # 兩端相對中心的高低就是嘴角
    mouth_z = head_z - hr * 0.46
    for i, side in enumerate((-1, 0, 1)):
        lift = 0.0 if side == 0 else npc.mouth * hr * 0.15
        parts.append(sphere(f"{p}_mouth_{i}",
                            (x + side * hr * 0.100, face_y + hr * 0.04, mouth_z + lift),
                            hr * 0.115, scale=(1.0, 0.45, 0.62),
                            seg=10, ring=7, material=m_ink))

    # 髮 — 扣在頭頂的扁球冠。上緣 +1.07(略高於頭頂 +1.04),下緣 +0.39(壓在眉頂之上),
    # 半徑明顯大於頭才不會和頭皮 z-fighting。
    parts.append(sphere(f"{p}_hair", (x, head_y + hr * 0.06, head_z + hr * 0.73),
                        hr * 1.13, scale=(1.0, 1.02, 0.30), material=m_hair))
    if not npc.hat:                                # 無首服者補一塊後腦髮量
        parts.append(sphere(f"{p}_hair_back", (x, head_y + hr * 0.42, head_z + hr * 0.16),
                            hr * 1.00, scale=(1.0, 0.72, 0.86), seg=16, ring=10, material=m_hair))

    if npc.key == "haitong":                      # 總角 — 孩童的兩個小髻,要露在髮冠之外
        for side in (-1, 1):
            parts.append(sphere(f"{p}_tuft_{side}",
                                (x + side * hr * 0.86, head_y, head_z + hr * 0.95),
                                hr * 0.28, seg=12, ring=8, material=m_hair))
    if npc.key == "furen":                        # 高髻 — 坐在髮冠上緣(+1.07)之上
        parts.append(sphere(f"{p}_bun", (x, head_y + hr * 0.24, head_z + hr * 1.26),
                            hr * 0.44, scale=(1.0, 0.86, 0.92), material=m_hair))

    if npc.beard:                                  # 長髯 — 從下頦垂下,尖端朝下
        m_beard = mat(f"{p}_beard", npc.beard, rough=0.68)
        parts.append(cone(f"{p}_beard", (x, face_y + hr * 0.24, head_z - hr * 1.02),
                          r1=hr * 0.34, r2=hr * 0.06, depth=hr * 0.78,
                          verts=12, material=m_beard, rot=(math.pi, 0, 0)))

    # 首服 — 剪影辨識度的另一半
    if npc.hat == "douli":                        # 斗笠
        parts.append(cone(f"{p}_douli", (x, head_y, head_z + hr * 0.80),
                          r1=hr * 1.70, r2=hr * 0.10, depth=hr * 0.60,
                          verts=22, material=mat(f"{p}_straw", (0.490, 0.390, 0.200, 1.0), rough=0.88)))
    elif npc.hat == "futou":                      # 幞頭 — 底 +0.49 不壓眉,頂 +1.11 蓋住髮冠
        parts.append(cyl(f"{p}_futou", (x, head_y, head_z + hr * 0.80),
                         radius=hr * 0.85, depth=hr * 0.62, verts=18, material=m_ink))
        for side in (-1, 1):                      # 展腳
            parts.append(cyl(f"{p}_futou_wing_{side}",
                             (x + side * hr * 1.12, head_y + hr * 0.34, head_z + hr * 0.76),
                             radius=hr * 0.065, depth=hr * 0.60, verts=8, material=m_ink,
                             rot=(0, math.pi / 2, 0)))
    elif npc.hat == "helmet":                     # 兜鍪 — 扁碗扣在頭上,底 +0.34 剛好不壓眉
        m_iron = mat(f"{p}_iron", (0.200, 0.210, 0.222, 1.0), rough=0.34, metal=0.88)
        parts.append(sphere(f"{p}_helmet", (x, head_y, head_z + hr * 0.77),
                            hr * 1.10, scale=(1.0, 1.0, 0.39), material=m_iron))
        parts.append(cone(f"{p}_helmet_spike", (x, head_y, head_z + hr * 1.32),
                          r1=hr * 0.13, r2=0.0, depth=hr * 0.46, verts=10, material=m_iron))

    # 手持物 — 剪影的最後一筆,也是「這個人在做什麼」的唯一線索
    if npc.prop == "pole":                        # 扁擔加兩頭的貨
        m_wood = mat(f"{p}_wood", (0.240, 0.155, 0.090, 1.0), rough=0.80)
        parts.append(cyl(f"{p}_pole", (x, y - hr * 0.20, body_h * 1.02),
                         radius=hr * 0.055, depth=H * 0.86, verts=8, material=m_wood,
                         rot=(0, math.pi / 2, 0)))
        for side in (-1, 1):
            parts.append(cyl(f"{p}_load_{side}", (x + side * H * 0.36, y - hr * 0.20, body_h * 0.80),
                             radius=hr * 0.30, depth=hr * 0.38, verts=14,
                             material=mat(f"{p}_load_{side}_m", (0.375, 0.300, 0.175, 1.0), rough=0.85)))
    elif npc.prop == "cane":
        parts.append(cyl(f"{p}_cane", (x + hr * 1.10, y - hr * 0.14, body_h * 0.46),
                         radius=hr * 0.055, depth=body_h * 0.96, verts=8,
                         material=mat(f"{p}_cane_m", (0.260, 0.175, 0.100, 1.0), rough=0.82),
                         rot=(0, 0.06, 0)))
    elif npc.prop == "spear":
        m_shaft = mat(f"{p}_shaft", (0.225, 0.145, 0.085, 1.0), rough=0.78)
        parts.append(cyl(f"{p}_spear", (x + hr * 1.10, y - hr * 0.14, H * 0.60),
                         radius=hr * 0.055, depth=H * 1.38, verts=8, material=m_shaft))
        parts.append(cone(f"{p}_spearhead", (x + hr * 1.10, y - hr * 0.14, H * 1.32),
                          r1=hr * 0.13, r2=0.0, depth=hr * 0.58, verts=10,
                          material=mat(f"{p}_blade", (0.580, 0.595, 0.610, 1.0), rough=0.24, metal=0.92)))
    elif npc.prop == "scroll":
        parts.append(cyl(f"{p}_scroll", (x - hr * 1.00, y - hr * 0.34, body_h * 0.38),
                         radius=hr * 0.11, depth=hr * 0.70, verts=10,
                         material=mat(f"{p}_paper", (0.790, 0.745, 0.640, 1.0), rough=0.85),
                         rot=(0, math.pi / 2, 0.22)))
    elif npc.prop == "basket":
        parts.append(cone(f"{p}_basket", (x + hr * 1.06, y - hr * 0.24, body_h * 0.32),
                          r1=hr * 0.44, r2=hr * 0.30, depth=hr * 0.42, verts=14,
                          material=mat(f"{p}_wicker", (0.445, 0.345, 0.180, 1.0), rough=0.88)))

    return parts


# ── 場景 ────────────────────────────────────────────────────

def stage_scene(backdrop_y: float = 6.0):
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0))
    bpy.context.active_object.name = "Ground"
    assign(bpy.context.active_object, mat("ground", (0.150, 0.135, 0.115, 1.0), rough=0.94))

    # 背景牆 — 給剪影一個乾淨的底
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, backdrop_y, 0), rotation=(math.pi / 2, 0, 0))
    bpy.context.active_object.name = "Backdrop"
    assign(bpy.context.active_object, mat("backdrop", (0.225, 0.208, 0.176, 1.0), rough=0.96))


def light_scene():
    # 主光 — 暖,右上前方,斜射
    bpy.ops.object.light_add(type="AREA", location=(3.2, -3.4, 4.2))
    key = bpy.context.active_object
    key.data.energy = 1100
    key.data.size = 4.0
    key.data.color = (1.0, 0.86, 0.68)
    look_at(key, (0, 0, 0.7))

    # 補光 — 冷(石青),左後,把暗面提起來
    bpy.ops.object.light_add(type="AREA", location=(-4.2, 1.6, 2.4))
    fill = bpy.context.active_object
    fill.data.energy = 300
    fill.data.size = 5.0
    fill.data.color = (0.55, 0.74, 0.88)
    look_at(fill, (0, 0, 0.6))

    # 輪廓光 — 從背後打,讓剪影從背景剝離
    bpy.ops.object.light_add(type="AREA", location=(0.5, 4.4, 2.2))
    rim = bpy.context.active_object
    rim.data.energy = 460
    rim.data.size = 3.0
    rim.data.color = (1.0, 0.92, 0.80)
    look_at(rim, (0, 0, 0.8))

    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.058, 0.062, 0.072, 1.0)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    bpy.context.scene.world = world


def configure_render(samples=128):
    scene = bpy.context.scene
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for device in prefs.devices:
            device.use = device.type == "METAL"
    except (AttributeError, TypeError, KeyError):
        pass
    scene.render.engine = "CYCLES"
    scene.cycles.device = "GPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 6
    scene.render.image_settings.file_format = "PNG"
    return scene


def render_to(scene, path, location, target, lens, res_x, res_y):
    bpy.ops.object.camera_add(location=location)
    cam = bpy.context.active_object
    cam.data.lens = lens
    look_at(cam, target)
    scene.camera = cam
    scene.render.resolution_x = res_x
    scene.render.resolution_y = res_y
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)


def count_vertices(parts) -> int:
    """套用修改器後的真實頂點數 — 這才是導出到 GLB 的數字。"""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    total = 0
    for obj in parts:
        total += len(obj.evaluated_get(depsgraph).to_mesh().vertices)
    return total


# ── 兩張圖 ──────────────────────────────────────────────────

def render_street():
    wipe()
    stage_scene(backdrop_y=6.0)
    light_scene()

    spacing = 0.96
    x0 = -spacing * (len(CAST) - 1) / 2
    budget = []
    for i, npc in enumerate(CAST):
        parts = build(npc, x0 + i * spacing)
        budget.append((npc.zh, len(parts), count_vertices(parts)))

    scene = configure_render(140)
    render_to(scene, STREET, (0.0, -8.2, 1.02), (0.0, 0.0, 0.56), 52, 1700, 720)
    render_to(scene, CLOSEUP, (0.62, -2.75, 1.00), (0.52, 0.0, 0.76), 76, 1000, 1000)
    return budget


def render_faces():
    """同一張臉,五種神色 — 全部只改 brow / squint / mouth 三個浮點數。"""
    wipe()
    stage_scene(backdrop_y=4.2)
    light_scene()

    moods = [
        ("平", 0.05, 0.22, 0.05),
        ("喜", 0.28, 0.45, 0.75),
        ("疑", -0.30, 0.15, -0.10),
        ("怒", -0.55, 0.50, -0.55),
        ("悲", 0.32, 0.40, -0.62),
    ]
    spacing = 0.78
    x0 = -spacing * (len(moods) - 1) / 2
    for i, (_zh, brow, squint, mouth) in enumerate(moods):
        face = NPC("mood", "文士", 1.06, 0.195, 0.98, AZURITE, SKIN, INK,
                   hat="futou", brow=brow, squint=squint, mouth=mouth)
        build(face, x0 + i * spacing)

    scene = configure_render(140)
    # 貼近臉部的排像 — 文士頭中心在 z≈0.84
    render_to(scene, FACES, (0.0, -6.5, 0.84), (0.0, 0.0, 0.84), 60, 1700, 620)
    return [m[0] for m in moods]


def main():
    budget = render_street()
    moods = render_faces()

    print("\n===== Q 版 NPC 頂點預算(套用修改器後) =====")
    for zh, n_parts, verts in budget:
        print(f"{zh}  部件 {n_parts:>2}  頂點 {verts:>6,}")
    total = sum(v for _, _, v in budget)
    print(f"{'合計':<4}  {len(CAST)} 人      頂點 {total:>6,}")
    print(f"平均每人 {total // len(CAST):,} 頂點  ·  寫實 MPFB 基座為 19,158")
    print(f"\n神色: {' / '.join(moods)} — 只改 brow / squint / mouth 三個浮點數")
    print(f"STREET={STREET}")
    print(f"CLOSEUP={CLOSEUP}")
    print(f"FACES={FACES}")


if __name__ == "__main__":
    main()
