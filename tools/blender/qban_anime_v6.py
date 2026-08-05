"""Q 版基座 v6 — 日式動漫路線,做到位。

v5 的「圓潤」只是把面數調高、材質調亮,那還不是動漫。動漫感真正靠三件事,
v6 全部補上:

  一 · 卡通著色  用 EEVEE 的 ShaderToRGB + 常數插值色階,把連續光影切成
                 兩三檔硬邊。這是動漫感的根本——比任何造型調整都有效。
  二 · 動漫眼    日式畫法不是「一顆黑球加高光」,是黑眼眶包住虹膜、
                 虹膜包住瞳孔,再疊兩顆高光。上緣那道粗黑線(睫毛線)
                 是整張臉最重要的一筆。
  三 · 髮型分束  瀏海要是幾撮尖角髮束,不是一個碗。鬢髮垂在臉側。

順帶:腮紅、修好被髮緣壓掉的眉、把嘴改小(chibi 的嘴小而靈活)。

用法:
    /Applications/Blender.app/Contents/MacOS/Blender --background --python qban_anime_v6.py
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from qban_npc_v2 import sphere, cone, cyl, torus, wipe, look_at   # noqa: E402
from qban_base_v5 import lathe, HEAD_ROUND, BODY_ROUND, SLEEVE_ROUND   # noqa: E402

FULL_IMG = HERE / "qban6-anime.png"
FACE_IMG = HERE / "qban6-faces.png"

SKIN = (0.985, 0.815, 0.720, 1.0)
HAIR = (0.140, 0.115, 0.145, 1.0)
ROBE = (0.155, 0.400, 0.290, 1.0)
TRIM = (0.870, 0.720, 0.310, 1.0)
SASH = (0.720, 0.235, 0.190, 1.0)
IRIS = (0.260, 0.480, 0.560, 1.0)
BLUSH = (0.960, 0.560, 0.520, 1.0)
LINE = (0.085, 0.055, 0.075, 1.0)


# ── 卡通著色 ── EEVEE 專屬。連續光影切成硬邊色階,這是動漫感的根本。
def toon(name, color, shadow=0.66, cool=0.055, split=0.52, three=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()

    diff = nt.nodes.new("ShaderNodeBsdfDiffuse")
    diff.inputs["Color"].default_value = (1, 1, 1, 1)
    s2r = nt.nodes.new("ShaderNodeShaderToRGB")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    emit = nt.nodes.new("ShaderNodeEmission")
    out = nt.nodes.new("ShaderNodeOutputMaterial")

    cr = ramp.color_ramp
    cr.interpolation = "CONSTANT"                # 硬邊,不是漸層
    # 暗部壓暗並偏冷 — 動漫的陰影從來不是純粹變黑
    dark = (max(0.0, color[0] * shadow - cool * 0.3),
            max(0.0, color[1] * shadow),
            min(1.0, color[2] * shadow + cool), 1.0)
    cr.elements[0].position = 0.0
    cr.elements[0].color = dark
    cr.elements[1].position = split
    cr.elements[1].color = color
    if three:                                    # 第三檔:受光面再提一級
        e = cr.elements.new(0.86)
        e.color = (min(1.0, color[0] * 1.13), min(1.0, color[1] * 1.11),
                   min(1.0, color[2] * 1.09), 1.0)

    nt.links.new(diff.outputs[0], s2r.inputs[0])
    nt.links.new(s2r.outputs[0], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], emit.inputs[0])
    nt.links.new(emit.outputs[0], out.inputs[0])
    return m


def flat(name, color):
    """平塗 — 眼睛與線條不吃光影。"""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs[0].default_value = color
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(e.outputs[0], o.inputs[0])
    return m


class Face:
    """表情 — 大眼睛能表達的維度遠多於刻痕眼,這裡用得上六個。"""

    def __init__(self, key, look=(0.0, 0.0), pupil=1.0, gloss=1.0,
                 brow=0.0, brow_lift=0.0, mouth="smile", blush=0.0, squint=0.0):
        self.__dict__.update(locals())
        del self.self


def build_eye(x, y, z, r, f: Face, side, p):
    """由後往前疊:黑眼眶 → 眼白 → 虹膜 → 瞳孔 → 兩顆高光。"""
    m_line = flat(f"{p}_ln{side}", LINE)
    open_k = 1.0 - f.squint * 0.62

    # 眼眶 — 上緣那道粗線就是它露出來的部分,動漫臉最重的一筆
    sphere(f"{p}_rim{side}", (x, y + r * 0.10, z), r * 1.08,
           scale=(1.0, 0.22, 1.10 * open_k), seg=22, ring=14, material=m_line)
    sphere(f"{p}_white{side}", (x, y, z - r * 0.05), r * 1.02,
           scale=(1.0, 0.20, 1.02 * open_k), seg=22, ring=14,
           material=flat(f"{p}_w{side}", (0.995, 0.985, 0.980, 1.0)))

    ix = x + f.look[0] * r * 0.30
    iz = z + f.look[1] * r * 0.26 - r * 0.06
    sphere(f"{p}_iris{side}", (ix, y - r * 0.10, iz), r * 0.80,
           scale=(1.0, 0.22, 1.06 * open_k), seg=20, ring=13,
           material=flat(f"{p}_ir{side}", IRIS))
    sphere(f"{p}_pupil{side}", (ix, y - r * 0.32, iz), r * 0.80 * 0.40 * f.pupil,
           scale=(1.0, 0.20, 1.06 * open_k), seg=16, ring=10, material=m_line)

    if f.gloss > 0.01:
        m_g = flat(f"{p}_g{side}", (1.0, 1.0, 1.0, 1.0))
        sphere(f"{p}_gl{side}", (ix - r * 0.34, y - r * 0.46, iz + r * 0.42),
               r * 0.26 * f.gloss, scale=(1.0, 0.22, 1.0), seg=14, ring=9, material=m_g)
        sphere(f"{p}_gl2{side}", (ix + r * 0.30, y - r * 0.46, iz - r * 0.38),
               r * 0.13 * f.gloss, scale=(1.0, 0.22, 1.0), seg=12, ring=8, material=m_g)


def build_mouth(x, y, z, hr, kind, p):
    m = flat(f"{p}_mth", LINE)
    if kind == "smile":                       # 小小一道上揚弧
        for i, dx in enumerate((-1, 0, 1)):
            sphere(f"{p}_m{i}", (x + dx * hr * 0.090, y, z + abs(dx) * hr * 0.055),
                   hr * 0.062, scale=(1.0, 0.42, 0.72), seg=10, ring=7, material=m)
    elif kind == "open":                      # 張口 — chibi 的驚訝
        sphere(f"{p}_m", (x, y, z - hr * 0.02), hr * 0.115,
               scale=(1.0, 0.42, 0.92), seg=14, ring=9, material=m)
    elif kind == "frown":
        for i, dx in enumerate((-1, 0, 1)):
            sphere(f"{p}_m{i}", (x + dx * hr * 0.072, y, z - abs(dx) * hr * 0.045),
                   hr * 0.052, scale=(1.0, 0.42, 0.72), seg=10, ring=7, material=m)
    elif kind == "wave":                      # 波浪嘴 — 為難、心虛
        for i, dx in enumerate((-1.2, -0.4, 0.4, 1.2)):
            sphere(f"{p}_m{i}", (x + dx * hr * 0.058, y, z + (1 if i % 2 else -1) * hr * 0.030),
                   hr * 0.046, scale=(1.0, 0.42, 0.72), seg=10, ring=7, material=m)
    else:                                     # neutral
        cyl(f"{p}_m", (x, y, z), radius=hr * 0.042, depth=hr * 0.16, verts=8,
            material=m, rot=(0, math.pi / 2, 0))


def build_anime(x, f: Face, H=1.12, with_body=True, p=None):
    p = p or f.key
    hr = H * 0.245                              # chibi 頭身比 ≈ 1:2.2
    body_h = H - hr * 1.85
    head_z = body_h + hr * 0.84

    m_skin = toon(f"{p}_skin", SKIN, shadow=0.80, cool=0.045, split=0.48, three=True)
    m_hair = toon(f"{p}_hair", HAIR, shadow=0.62, cool=0.09, split=0.50, three=True)
    m_robe = toon(f"{p}_robe", ROBE, shadow=0.60, cool=0.075, split=0.52)
    m_trim = toon(f"{p}_trim", TRIM, shadow=0.66, cool=0.05, split=0.52)
    m_sash = toon(f"{p}_sash", SASH, shadow=0.62, cool=0.07, split=0.52)

    if with_body:
        lathe(f"{p}_body", [(z * body_h, r * hr * 1.02) for z, r in BODY_ROUND],
              segments=28, material=m_robe, loc=(x, 0, 0))
        torus(f"{p}_sash", (x, 0, body_h * 0.55), major=hr * 0.78, minor=hr * 0.115,
              material=m_sash, scale=(1.0, 1.0, 0.72))
        for side in (-1, 1):
            lathe(f"{p}_sleeve{side}",
                  [(z * body_h * 0.54, r * hr) for z, r in SLEEVE_ROUND],
                  segments=16, material=m_robe,
                  loc=(x + side * hr * 0.80, 0, body_h * 0.34), rot=(0, side * 0.16, 0))
            sphere(f"{p}_hand{side}", (x + side * hr * 0.92, -hr * 0.20, body_h * 0.32),
                   hr * 0.15, seg=14, ring=9, material=m_skin)
        torus(f"{p}_collar", (x, 0, body_h * 0.98), major=hr * 0.44, minor=hr * 0.075,
              material=m_trim, scale=(1.0, 1.0, 0.78))
    cyl(f"{p}_neck", (x, 0, body_h * 0.99), radius=hr * 0.32, depth=hr * 0.36,
        verts=20, material=m_skin)

    lathe(f"{p}_head", [(z * hr, r * hr) for z, r in HEAD_ROUND],
          segments=32, material=m_skin, loc=(x, 0, head_z), scale=(1.0, 0.94, 1.0))

    face_y = -hr * 0.99
    eye_z = head_z - hr * 0.10
    eye_r = hr * 0.26                            # 佔頭寬約 30% — 動漫的比例
    for side in (-1, 1):
        build_eye(x + side * hr * 0.43, face_y, eye_z, eye_r, f, side, p)

    # 眉 — 抬到髮緣之下、眼眶之上的空檔。v5 這裡被髮冠壓掉了大半。
    m_line = flat(f"{p}_brow_m", LINE)
    for side in (-1, 1):
        cyl(f"{p}_brow{side}",
            (x + side * hr * 0.41, face_y + hr * 0.04,
             head_z + hr * (0.325 + f.brow_lift * 0.085)),
            radius=hr * 0.040, depth=hr * 0.34, verts=8, material=m_line,
            rot=(0, math.pi / 2, side * f.brow))

    sphere(f"{p}_nose", (x, face_y + hr * 0.05, head_z - hr * 0.26), hr * 0.055,
           scale=(1.0, 0.85, 0.75), seg=10, ring=7, material=m_skin)
    build_mouth(x, face_y + hr * 0.03, head_z - hr * 0.50, hr, f.mouth, p)

    if f.blush > 0.01:
        m_bl = flat(f"{p}_bl", BLUSH)
        for side in (-1, 1):
            sphere(f"{p}_blush{side}", (x + side * hr * 0.58, face_y + hr * 0.20,
                                        head_z - hr * 0.44),
                   hr * 0.20 * f.blush, scale=(1.0, 0.14, 0.52), seg=14, ring=9,
                   material=m_bl)

    # ── 髮型分束 ── 瀏海是幾撮尖角,不是一個碗
    lathe(f"{p}_hair_back", [(-0.62, 0.72), (-0.20, 1.02), (0.30, 1.06),
                             (0.70, 0.86), (0.98, 0.00)],
          segments=28, material=m_hair,
          loc=(x, hr * 0.10, head_z + hr * 0.30), scale=(1.06 * hr, 1.10 * hr, 0.92 * hr))
    for i, (dx, dz, ln, tilt) in enumerate((
            (-0.66, 0.74, 0.42, -0.30), (-0.28, 0.82, 0.46, -0.12),
            (0.12, 0.84, 0.44, 0.10), (0.52, 0.78, 0.40, 0.28), (0.80, 0.66, 0.34, 0.44))):
        cone(f"{p}_bang{i}", (x + dx * hr, face_y + hr * 0.30, head_z + dz * hr),
             r1=hr * 0.24, r2=hr * 0.02, depth=hr * ln, verts=8, material=m_hair,
             rot=(math.pi - 0.16, 0, tilt), scale=(1.0, 0.46, 1.0))
    for side in (-1, 1):                        # 鬢髮 — 垂在臉側
        cone(f"{p}_side{side}", (x + side * hr * 0.94, face_y + hr * 0.52,
                                 head_z - hr * 0.34),
             r1=hr * 0.19, r2=hr * 0.07, depth=hr * 0.98, verts=8, material=m_hair,
             rot=(math.pi - 0.08, 0, side * 0.10), scale=(0.62, 0.52, 1.0))
    sphere(f"{p}_bun", (x, hr * 0.30, head_z + hr * 1.16), hr * 0.30,
           scale=(1.0, 0.92, 1.0), seg=18, ring=12, material=m_hair)
    cyl(f"{p}_zan", (x, hr * 0.30, head_z + hr * 1.18), radius=hr * 0.032,
        depth=hr * 0.88, verts=6, material=m_trim, rot=(0, math.pi / 2, 0.20))
    return head_z, hr


# ── 場景 ── toon 著色靠自發光,燈只負責把明暗切在該切的地方
def anime_stage():
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0))
    bpy.context.active_object.name = "Ground"
    bpy.context.active_object.data.materials.append(
        toon("ground", (0.560, 0.530, 0.500, 1.0), shadow=0.80, split=0.42))
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 7.5, 0), rotation=(math.pi / 2, 0, 0))
    bpy.context.active_object.name = "Backdrop"
    bpy.context.active_object.data.materials.append(
        flat("backdrop", (0.735, 0.795, 0.845, 1.0)))

    bpy.ops.object.light_add(type="SUN", location=(3.0, -3.0, 5.0))
    key = bpy.context.active_object
    key.data.energy = 3.4
    key.data.angle = 0.0                        # 銳利陰影邊 — toon 要的就是硬邊
    look_at(key, (0, 0, 0.6))
    bpy.ops.object.light_add(type="AREA", location=(-3.6, -1.2, 2.2))
    fill = bpy.context.active_object
    fill.data.energy, fill.data.size = 90, 4.0
    fill.data.color = (0.72, 0.82, 1.0)
    look_at(fill, (0, 0, 0.6))

    w = bpy.data.worlds.new("W")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.400, 0.470, 0.545, 1.0)
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.55
    bpy.context.scene.world = w


def configure_eevee(samples=64):
    s = bpy.context.scene
    s.render.engine = "BLENDER_EEVEE"
    try:
        s.eevee.taa_render_samples = samples
        s.eevee.use_shadows = True
    except AttributeError:
        pass
    s.render.image_settings.file_format = "PNG"
    s.render.film_transparent = False
    # 描邊
    s.render.use_freestyle = True
    vl = s.view_layers[0]
    vl.use_freestyle = True
    fs = vl.freestyle_settings
    fs.crease_angle = math.radians(138)
    ls_set = fs.linesets[0] if fs.linesets else fs.linesets.new("outline")
    ls_set.select_silhouette = True
    ls_set.select_border = True
    ls_set.select_crease = False               # 動漫描邊只要外輪廓,內部摺線會髒
    style = ls_set.linestyle
    if style is None:
        style = bpy.data.linestyles.new("AnimeLine")
        ls_set.linestyle = style
    style.color = LINE[:3]
    style.thickness = 1.8
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


FACES = [
    Face("f0", look=(0.0, 0.0), pupil=1.0, brow=0.10, mouth="smile", blush=0.55),
    Face("f1", look=(-0.9, 0.35), pupil=0.72, brow=-0.34, brow_lift=-0.5,
         mouth="frown", squint=0.30),
    Face("f2", look=(0.0, 0.15), pupil=1.35, gloss=1.25, brow=0.30, brow_lift=0.9,
         mouth="open", blush=0.35),
    Face("f3", look=(0.55, -0.35), pupil=0.85, gloss=0.55, brow=0.05,
         mouth="wave", blush=0.75, squint=0.18),
    Face("f4", look=(0.0, -0.10), pupil=0.55, gloss=0.0, brow=-0.10,
         brow_lift=-0.2, mouth="neutral", squint=0.42),
]


def main():
    # 一 · 全身
    wipe()
    anime_stage()
    build_anime(0.0, FACES[0])
    s = configure_eevee(96)
    render_to(s, FULL_IMG, (0.0, -3.15, 0.78), (0.0, 0.0, 0.60), 78, 1200, 1400)

    # 二 · 一排表情 — 大眼能表達的維度
    wipe()
    anime_stage()
    sp = 0.62
    x0 = -sp * (len(FACES) - 1) / 2
    for i, f in enumerate(FACES):
        build_anime(x0 + i * sp, f, with_body=False, p=f"e{i}")
    s = configure_eevee(96)
    render_to(s, FACE_IMG, (0.0, -5.30, 0.80), (0.0, 0.0, 0.80), 57, 1800, 600)

    print(f"\nFULL={FULL_IMG}\nFACES={FACE_IMG}")


if __name__ == "__main__":
    main()
