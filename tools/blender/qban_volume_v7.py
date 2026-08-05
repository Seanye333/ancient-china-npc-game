"""v7 — 動漫著色怎麼保住 3D 感。

v6 看起來像貼紙,原因不是「卡通著色錯了」,是我只做了卡通著色的<b>減法</b>
(把連續光影切成兩三檔硬邊),沒做回體積的<b>加法</b>。

日式 3D 動漫遊戲(原神那一類)靠五樣東西把立體感救回來,v6 一樣都沒有:

  一 · 邊緣光 rim  角色輪廓一圈亮邊。這是最有效的一招——單這一項就能把
                   平面色塊重新推成有厚度的體。
  二 · 高光帶      頭髮上那條亮弧,動漫髮型的立體全靠它。
  三 · 遮蔽暗部    下巴下、脖子、袖口的暗一階。體積是靠暗部讀出來的。
  四 · 相機角度    正面平視沒有任何透視線索。3/4 側 + 略俯視立刻有縱深。
  五 · 背景縱深    純色背板等於把角色貼在紙上;地面漸遠 + 遠景就有空間。

這一版左右並排:左邊是 v6 的做法,右邊加上這五樣。模型完全一樣。

用法:
    /Applications/Blender.app/Contents/MacOS/Blender --background --python qban_volume_v7.py
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import qban_anime_v6 as A6                                    # noqa: E402
from qban_npc_v2 import sphere, cyl, torus, wipe, look_at      # noqa: E402

CMP_IMG = HERE / "qban7-compare.png"
HERO_IMG = HERE / "qban7-hero.png"

RIM_COLOR = (0.780, 0.880, 1.000, 1.0)      # 冷白 — 邊緣光取天光的顏色
HAIR_GLOSS = (0.255, 0.243, 0.318, 1.0)


def toon_vol(name, color, shadow=0.66, cool=0.055, split=0.52, three=False,
             rim=0.0, rim_tight=0.58, rim_col=RIM_COLOR):
    """v6 的 toon 加一層邊緣光。rim=0 時退化成 v6 的做法。"""
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
    cr.interpolation = "CONSTANT"
    dark = (max(0.0, color[0] * shadow - cool * 0.3),
            max(0.0, color[1] * shadow),
            min(1.0, color[2] * shadow + cool), 1.0)
    cr.elements[0].position = 0.0
    cr.elements[0].color = dark
    cr.elements[1].position = split
    cr.elements[1].color = color
    if three:
        e = cr.elements.new(0.86)
        e.color = (min(1.0, color[0] * 1.13), min(1.0, color[1] * 1.11),
                   min(1.0, color[2] * 1.09), 1.0)

    nt.links.new(diff.outputs[0], s2r.inputs[0])
    nt.links.new(s2r.outputs[0], ramp.inputs[0])

    if rim > 0.001:
        # 菲涅耳取輪廓 → 常數色階切成一條硬邊亮帶 → 加到底色上。
        # 這一條就是「色塊」和「有厚度的體」的差別。
        fres = nt.nodes.new("ShaderNodeFresnel")
        fres.inputs["IOR"].default_value = 1.42
        rramp = nt.nodes.new("ShaderNodeValToRGB")
        rcr = rramp.color_ramp
        rcr.interpolation = "CONSTANT"
        rcr.elements[0].position = 0.0
        rcr.elements[0].color = (0, 0, 0, 1)
        rcr.elements[1].position = rim_tight
        rcr.elements[1].color = (rim_col[0] * rim, rim_col[1] * rim, rim_col[2] * rim, 1.0)

        add = nt.nodes.new("ShaderNodeMix")
        add.data_type = "RGBA"
        add.blend_type = "ADD"
        add.inputs[0].default_value = 1.0
        nt.links.new(ramp.outputs[0], add.inputs[6])
        nt.links.new(fres.outputs[0], rramp.inputs[0])
        nt.links.new(rramp.outputs[0], add.inputs[7])
        nt.links.new(add.outputs[2], emit.inputs[0])
    else:
        nt.links.new(ramp.outputs[0], emit.inputs[0])

    nt.links.new(emit.outputs[0], out.inputs[0])
    return m


def build(x, f, volume: bool, p):
    """借用 v6 的造型,只換材質工廠與加件。"""
    orig = A6.toon
    if volume:
        A6.toon = lambda name, color, **kw: toon_vol(
            name, color, rim=0.95 if "skin" in name else 0.72, **kw)
    try:
        head_z, hr = A6.build_anime(x, f, with_body=True, p=p)
    finally:
        A6.toon = orig

    if not volume:
        return head_z, hr

    # 二 · 髮型高光帶 — 動漫頭髮的立體幾乎全靠這條弧
    hg = A6.flat(f"{p}_hg", HAIR_GLOSS)
    for i, (dx, dy, w_) in enumerate(((-0.52, 0.16, 0.30), (0.02, 0.02, 0.40),
                                      (0.56, 0.18, 0.26))):
        sphere(f"{p}_hairgloss{i}",
               (x + dx * hr, hr * dy - hr * 0.52, head_z + hr * (0.70 - abs(dx) * 0.14)),
               hr * w_, scale=(1.0, 0.22, 0.16), seg=14, ring=9, material=hg)

    # 三 · 遮蔽暗部 — 體積是靠暗部讀出來的,不是靠亮部
    shade = A6.flat(f"{p}_ao", (0.735, 0.580, 0.560, 1.0))
    sphere(f"{p}_ao_chin", (x, -hr * 0.56, head_z - hr * 1.02), hr * 0.32,
           scale=(0.92, 0.34, 0.14), seg=16, ring=9, material=shade)
    return head_z, hr


def stage_depth():
    """五 · 背景縱深 — 純色背板等於把角色貼在紙上。"""
    bpy.ops.mesh.primitive_plane_add(size=120, location=(0, 0, 0))
    g = bpy.context.active_object
    g.name = "Ground"
    g.data.materials.append(toon_vol("ground", (0.660, 0.610, 0.545, 1.0),
                                     shadow=0.56, cool=0.10, split=0.42))
    # 遠景剪影三層 — 越遠越淡,提供空間線索
    for i, (dx, dist, w_, h_, tone) in enumerate((
            (-4.2, 8.0, 3.4, 1.5, 0.30), (0.6, 9.5, 4.2, 2.2, 0.34),
            (5.0, 8.6, 3.0, 1.2, 0.30), (-2.0, 15.0, 6.0, 3.0, 0.58),
            (4.4, 16.5, 5.4, 3.8, 0.62), (0.0, 25.0, 12.0, 5.4, 0.80))):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(dx, dist, h_ * 0.5))
        o = bpy.context.active_object
        o.name = f"Far{i}"
        o.scale = (w_, w_ * 0.5, h_)
        o.data.materials.append(A6.flat(f"far{i}", (0.235 + tone * 0.52,
                                                    0.290 + tone * 0.50,
                                                    0.390 + tone * 0.46, 1.0)))
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 34.0, 0),
                                     rotation=(math.pi / 2, 0, 0))
    bpy.context.active_object.name = "Sky"
    bpy.context.active_object.data.materials.append(
        A6.flat("sky", (0.820, 0.880, 0.940, 1.0)))

    bpy.ops.object.light_add(type="SUN", location=(3.4, -2.6, 5.0))
    key = bpy.context.active_object
    key.data.energy = 3.6
    key.data.angle = 0.02
    look_at(key, (0, 0, 0.6))
    bpy.ops.object.light_add(type="AREA", location=(-3.2, -1.0, 2.0))
    fill = bpy.context.active_object
    fill.data.energy, fill.data.size = 70, 4.0
    fill.data.color = (0.72, 0.82, 1.0)
    look_at(fill, (0, 0, 0.6))

    w = bpy.data.worlds.new("W")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.440, 0.520, 0.610, 1.0)
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.6
    bpy.context.scene.world = w


def main():
    face = A6.Face("v", look=(0.10, 0.05), pupil=1.0, brow=0.12,
                   mouth="smile", blush=0.45)

    # ── 並排:同一個模型,左邊 v6 的做法,右邊加五樣 ──
    wipe()
    stage_depth()
    build(-0.62, face, volume=False, p="flat")
    build(0.62, face, volume=True, p="vol")
    s = A6.configure_eevee(96)
    # 四 · 相機角度 — 3/4 側 + 略俯視,正面平視沒有任何透視線索
    A6.render_to(s, CMP_IMG, (1.55, -4.45, 1.42), (0.0, 0.10, 0.54), 60, 1700, 940)

    # ── 單人 hero shot ──
    wipe()
    stage_depth()
    build(0.0, face, volume=True, p="hero")
    s = A6.configure_eevee(128)
    A6.render_to(s, HERO_IMG, (1.30, -2.55, 1.20), (-0.02, 0.06, 0.56), 62, 1200, 1400)

    print(f"\nCOMPARE={CMP_IMG}\nHERO={HERO_IMG}")


if __name__ == "__main__":
    main()
