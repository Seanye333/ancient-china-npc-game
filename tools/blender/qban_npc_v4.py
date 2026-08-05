"""Q 版 NPC v4 — 把辨識度推到剪影層。

v3 的結論是:辨識度要放在剪影和大色塊上,放在臉上的東西一縮就沒。
v4 就照這條規則加強,四件事都是「剪影面積大」的:

  披風 — 剪影面積僅次於坐騎,而且成本極低
  坐騎 — 騎乘狀態本身就是一整層辨識,純剪影
  勢力配色 — 先分陣營再分人,認知負擔減半
  體型軸 — 呂布該比別人高一個頭

順帶修掉 v3 認栽的兩處造型:偃月刀像三角旗(改用布林切出真的月牙)、
夏侯惇縮圖失效(眼罩是臉上細節,補一件殘破披風給他剪影)。

用法:
    /Applications/Blender.app/Contents/MacOS/Blender --background --python qban_npc_v4.py
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from qban_npc_v2 import (          # noqa: E402
    mat, sphere, cone, cyl, torus, wipe,
    stage, lights, configure, render_to, count_verts, enable_outline,
    INK, IRON,
)
from qban_npc_v3 import (          # noqa: E402
    build_beard, build_cap, build_weapon,
    JUJUBE, SWARTHY, PALE, TAN, FAIR, GOLD, SILVER, CRIMSON,
    GREEN_ROBE, WHITE_ROBE,
)

RANKS_IMG = HERE / "qban4-ranks.png"
THUMBS_IMG = HERE / "qban4-thumbs.png"
MOUNT_IMG = HERE / "qban4-mount.png"

# ── 勢力配色 ── 先分陣營再分人。同一勢力共用一條色帶,認知負擔立刻減半。
FACTIONS = {
    "shu":  {"main": GREEN_ROBE,               "trim": GOLD,   "accent": (0.360, 0.110, 0.085, 1.0)},
    "wei":  {"main": (0.105, 0.140, 0.215, 1.0), "trim": SILVER, "accent": (0.145, 0.165, 0.190, 1.0)},
    "wu":   {"main": (0.330, 0.110, 0.100, 1.0), "trim": GOLD,   "accent": (0.420, 0.230, 0.110, 1.0)},
    "none": {"main": (0.290, 0.245, 0.200, 1.0), "trim": (0.180, 0.150, 0.120, 1.0),
             "accent": (0.340, 0.290, 0.220, 1.0)},
}


class Hero4:
    def __init__(self, key, faction, height, head, girth, skin, hair,
                 beard="none", cap=None, weapon=None, mark=None, cloak=None,
                 mount=None, robe=None, trim=None, sash=None,
                 brow=0.0, squint=0.0, mouth=0.0, eye_tilt=0.0,
                 face_w=1.0, brow_weight=1.0, turn=0.0, shoulder=0.0, lean=0.0):
        self.__dict__.update(locals())
        del self.self
        f = FACTIONS[faction]
        self.robe = robe or f["main"]
        self.trim = trim or f["trim"]
        self.sash = sash if sash is not None else f["accent"]


# ── 披風 ── 剪影面積僅次於坐騎,成本卻只有一個錐台。
def build_cloak(parts, style, bx, y, body_h, hr, p, color, trim_col):
    if not style:
        return
    m = mat(f"{p}_cloak", color, rough=0.84, sheen=0.42)
    # 扁錐台掛在背後,下襬外張。壓扁 y 讓它讀成一片布而不是一個桶。
    c = cone(f"{p}_cloak", (bx, y + hr * 0.30, body_h * 0.50),
             r1=hr * 1.92, r2=hr * 0.70, depth=body_h * 1.06, verts=18,
             material=m, rot=(-0.08, 0, 0), scale=(1.0, 0.46, 1.0))
    parts.append(c)
    # 領口的繫帶 — 一顆結加兩道帶,把披風和人接起來
    parts.append(sphere(f"{p}_cloak_knot", (bx, y - hr * 0.20, body_h * 0.98),
                        hr * 0.13, seg=10, ring=7,
                        material=mat(f"{p}_knot_m", trim_col, rough=0.60, metal=0.35)))
    if style == "tattered":                     # 殘破 — 下襬撕開的缺口
        for i, dx in enumerate((-0.62, -0.10, 0.44)):
            parts.append(cone(f"{p}_cloak_rip{i}",
                              (bx + dx * hr, y + hr * 0.70, body_h * 0.10),
                              r1=hr * 0.20, r2=hr * 0.03, depth=body_h * 0.34, verts=6,
                              material=m, rot=(math.pi + 0.12, 0, dx * 0.22),
                              scale=(1.0, 0.34, 1.0)))


# ── 偃月刀 ── v3 切出來像三角旗。用布林從圓盤挖掉一塊,才有真的月牙。
def build_guandao(parts, bx, y, H, hr, p):
    m_shaft = mat(f"{p}_shaft", (0.230, 0.150, 0.088, 1.0), rough=0.80)
    m_blade = mat(f"{p}_blade", SILVER, rough=0.20, metal=0.92)
    wx = bx + hr * 1.16
    parts.append(cyl(f"{p}_gd_shaft", (wx, y - hr * 0.14, H * 0.62),
                     radius=hr * 0.062, depth=H * 1.45, verts=8, material=m_shaft))
    parts.append(cyl(f"{p}_gd_collar", (wx, y - hr * 0.14, H * 1.02),
                     radius=hr * 0.12, depth=hr * 0.22, verts=10, material=m_blade))

    disc_z = H * 1.34
    blade = cyl(f"{p}_gd_blade", (wx + hr * 0.52, y - hr * 0.14, disc_z),
                radius=hr * 0.92, depth=hr * 0.075, verts=28, material=m_blade,
                rot=(math.pi / 2, 0, 0))
    cutter = cyl(f"{p}_gd_cut", (wx + hr * 1.30, y - hr * 0.14, disc_z + hr * 0.30),
                 radius=hr * 0.86, depth=hr * 0.40, verts=28, material=m_blade,
                 rot=(math.pi / 2, 0, 0))
    mod = blade.modifiers.new("moon", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.object = cutter
    cutter.hide_render = True
    parts.append(blade)                        # cutter 不計入,它不渲染
    return cutter


# ── 坐騎 ── 騎乘是一整層辨識,而且完全是剪影的。
def build_mount(parts, bx, y, p, coat, scale=1.0, tack=GOLD):
    """回傳鞍座高度,騎手往上疊。"""
    m = mat(f"{p}_coat", coat, rough=0.66, sheen=0.25)
    m_dark = mat(f"{p}_coat_d", tuple(c * 0.55 for c in coat[:3]) + (1.0,), rough=0.60)
    m_tack = mat(f"{p}_tack", tack, rough=0.42, metal=0.55)
    s = scale
    body_z = 0.56 * s

    parts.append(sphere(f"{p}_m_body", (bx, y + 0.05 * s, body_z), 0.34 * s,
                        scale=(0.62, 1.85, 0.80), material=m))
    # 頸 — 從胸前上方伸出
    parts.append(cone(f"{p}_m_neck", (bx, y - 0.56 * s, body_z + 0.34 * s),
                      r1=0.19 * s, r2=0.12 * s, depth=0.62 * s, verts=12,
                      material=m, rot=(-0.62, 0, 0)))
    head_y, head_z = y - 0.80 * s, body_z + 0.60 * s
    parts.append(sphere(f"{p}_m_head", (bx, head_y, head_z), 0.17 * s,
                        scale=(0.78, 1.35, 0.90), seg=16, ring=10, material=m))
    parts.append(sphere(f"{p}_m_muzzle", (bx, head_y - 0.19 * s, head_z - 0.07 * s), 0.10 * s,
                        scale=(0.80, 1.05, 0.80), seg=12, ring=8, material=m_dark))
    for side in (-1, 1):
        parts.append(cone(f"{p}_m_ear{side}", (bx + side * 0.07 * s, head_y + 0.10 * s,
                                               head_z + 0.19 * s),
                          r1=0.045 * s, r2=0.0, depth=0.13 * s, verts=6, material=m_dark))
        parts.append(sphere(f"{p}_m_eye{side}", (bx + side * 0.11 * s, head_y - 0.05 * s,
                                                 head_z + 0.04 * s),
                            0.035 * s, seg=8, ring=6,
                            material=mat(f"{p}_m_eye{side}_m", INK, rough=0.30)))
    # 鬃 — 沿頸背的一片
    parts.append(cone(f"{p}_m_mane", (bx, y - 0.50 * s, body_z + 0.40 * s),
                      r1=0.15 * s, r2=0.07 * s, depth=0.66 * s, verts=8,
                      material=m_dark, rot=(-0.62, 0, 0), scale=(0.30, 1.0, 1.0)))
    # 四腿 — 前後各一對,前腿略前傾
    for sx in (-1, 1):
        for sy, tilt in ((-1, 0.13), (1, -0.10)):
            parts.append(cyl(f"{p}_m_leg{sx}{sy}",
                             (bx + sx * 0.19 * s, y + sy * 0.42 * s, 0.26 * s),
                             radius=0.050 * s, depth=0.56 * s, verts=8,
                             material=m, rot=(tilt, 0, 0)))
            parts.append(cyl(f"{p}_m_hoof{sx}{sy}",
                             (bx + sx * 0.19 * s, y + sy * 0.42 * s + tilt * 0.15 * s, 0.030 * s),
                             radius=0.062 * s, depth=0.06 * s, verts=8, material=m_dark))
    parts.append(cone(f"{p}_m_tail", (bx, y + 0.66 * s, body_z + 0.02 * s),
                      r1=0.085 * s, r2=0.025 * s, depth=0.56 * s, verts=8,
                      material=m_dark, rot=(-2.70, 0, 0)))
    # 鞍與韁 — 讓它讀成「被騎的馬」而不是一匹野馬
    saddle_z = body_z + 0.29 * s
    parts.append(sphere(f"{p}_m_saddle", (bx, y + 0.02 * s, saddle_z), 0.20 * s,
                        scale=(0.78, 1.05, 0.42), seg=14, ring=9, material=m_tack))
    parts.append(torus(f"{p}_m_rein", (bx, y - 0.62 * s, body_z + 0.40 * s),
                       major=0.19 * s, minor=0.018 * s, material=m_tack,
                       rot=(1.35, 0, 0), scale=(0.85, 1.0, 1.0)))
    return saddle_z + 0.02 * s


def build_hero4(h: Hero4, x: float, y: float = 0.0):
    parts = []
    extra = []
    p = f"{h.key}_{x:.2f}"

    z0 = 0.0
    if h.mount:
        z0 = build_mount(parts, x, y, p, h.mount["coat"],
                         scale=h.mount.get("scale", 1.0), tack=h.trim)

    m_robe = mat(f"{p}_robe", h.robe, rough=0.80, sheen=0.30)
    m_skin = mat(f"{p}_skin", h.skin, rough=0.58, sss=0.20)
    m_hair = mat(f"{p}_hair", h.hair, rough=0.48)
    m_ink = mat(f"{p}_ink", INK, rough=0.28)
    m_trim = mat(f"{p}_trim", h.trim, rough=0.70, sheen=0.24)

    H, hr = h.height, h.height * h.head
    body_h = H - hr * 1.85
    # 騎乘時下半身跨在馬背上,袍襬收短,否則會穿過馬身
    robe_h = body_h * (0.62 if h.mount else 1.0)
    head_z = z0 + body_h * (0.62 if h.mount else 1.0) + hr * 0.78
    head_y = y
    face_y = head_y - hr * 0.86 * h.face_w
    bx = x + h.lean * hr * 0.22
    hx = bx + h.turn * hr * 0.10
    torso_top = z0 + robe_h

    build_cloak(parts, h.cloak, bx, y, robe_h, hr, p, h.robe, h.trim)

    parts.append(cone(f"{p}_robe", (bx, y, z0 + robe_h * 0.5),
                      r1=hr * 1.05 * h.girth, r2=hr * 0.60, depth=robe_h,
                      verts=22, material=m_robe, rot=(0, 0, h.lean * 0.04)))
    parts.append(cyl(f"{p}_sash", (bx, y, z0 + robe_h * 0.60),
                     radius=hr * 0.80 * h.girth, depth=hr * 0.24, verts=20,
                     material=mat(f"{p}_sash_m", h.sash, rough=0.66, sheen=0.38)))
    for side in (-1, 1):
        drop = h.shoulder * side * hr * 0.10
        parts.append(cone(f"{p}_sleeve{side}", (bx + side * hr * 0.84, y,
                                                z0 + robe_h * 0.64 + drop),
                          r1=hr * 0.30, r2=hr * 0.42, depth=robe_h * 0.56, verts=14,
                          material=m_robe, rot=(0, side * 0.17, 0)))
        parts.append(torus(f"{p}_cuff{side}", (bx + side * hr * 0.94, y,
                                               z0 + robe_h * 0.37 + drop),
                           major=hr * 0.38, minor=hr * 0.055, material=m_trim,
                           scale=(1.0, 1.0, 0.6)))
        parts.append(sphere(f"{p}_hand{side}", (bx + side * hr * 0.96, y - hr * 0.22,
                                                z0 + robe_h * 0.40 + drop),
                            hr * 0.155, seg=12, ring=8, material=m_skin))
    parts.append(torus(f"{p}_collar", (bx, y, torso_top - hr * 0.06),
                       major=hr * 0.46, minor=hr * 0.07, material=m_trim, scale=(1.0, 1.0, 0.75)))

    parts.append(sphere(f"{p}_head", (hx, head_y, head_z), hr,
                        scale=(h.face_w, 0.94, 1.04), material=m_skin, rot=(0, 0, h.turn * 0.16)))

    eye_open = 1.0 - h.squint * 0.70
    eye_z = head_z - hr * 0.06
    for side in (-1, 1):
        ex = hx + side * hr * 0.38 * h.face_w
        if h.mark == "eyepatch" and side == 1:
            parts.append(sphere(f"{p}_patch", (ex, face_y + hr * 0.04, eye_z),
                                hr * 0.34, scale=(1.0, 0.22, 0.90), seg=14, ring=9,
                                material=mat(f"{p}_patch_m", (0.100, 0.090, 0.085, 1.0), rough=0.75)))
            parts.append(cyl(f"{p}_patch_str", (hx, face_y + hr * 0.30, eye_z + hr * 0.16),
                             radius=hr * 0.035, depth=hr * 2.0, verts=6,
                             material=mat(f"{p}_str_m", (0.100, 0.090, 0.085, 1.0), rough=0.80),
                             rot=(0, math.pi / 2, -0.14)))
            continue
        e = sphere(f"{p}_eye{side}", (ex, face_y, eye_z), hr * 0.26,
                   scale=(1.0, 0.30, eye_open), seg=16, ring=10, material=m_ink)
        if abs(h.eye_tilt) > 0.01:
            e.rotation_euler = (0, -side * h.eye_tilt * 0.5, 0)
        parts.append(e)
        parts.append(cyl(f"{p}_brow{side}", (ex, face_y + hr * 0.02, head_z + hr * 0.30),
                         radius=hr * 0.070 * h.brow_weight, depth=hr * 0.40 * h.brow_weight,
                         verts=8, material=m_ink, rot=(0, math.pi / 2, side * h.brow)))

    parts.append(sphere(f"{p}_nose", (hx, face_y + hr * 0.06, head_z - hr * 0.22),
                        hr * 0.085, scale=(1.0, 0.9, 0.8), seg=10, ring=7, material=m_skin))
    mouth_z = head_z - hr * 0.46
    for i, side in enumerate((-1, 0, 1)):
        lift = 0.0 if side == 0 else h.mouth * hr * 0.15
        parts.append(sphere(f"{p}_mouth{i}", (hx + side * hr * 0.100, face_y + hr * 0.04,
                                              mouth_z + lift),
                            hr * 0.115, scale=(1.0, 0.45, 0.62), seg=10, ring=7, material=m_ink))
    parts.append(sphere(f"{p}_hair", (hx, head_y + hr * 0.06, head_z + hr * 0.73),
                        hr * 1.13 * h.face_w, scale=(1.0, 1.02, 0.30), material=m_hair))

    build_beard(parts, h.beard, hx, face_y, head_z, hr, h.hair, p)
    build_cap(parts, h.cap, hx, head_y, head_z, hr, p, h.trim)

    if h.weapon == "guandao":
        extra.append(build_guandao(parts, bx, y, z0 + H, hr, p))
    elif h.weapon:
        build_weapon(parts, h.weapon, bx, y, z0 + H, hr, z0 + robe_h, p)
    return parts, extra


# ── 陣容 ── 三個勢力 + 體型軸 + 兩騎
CAST4 = [
    Hero4("lubu", "none", 1.38, 0.170, 1.14, TAN, INK,          # 最高,騎乘,方天畫戟
          beard="stubble", cap="helmet", weapon="zhangba",
          cloak="full", mount={"coat": (0.190, 0.175, 0.185, 1.0), "scale": 1.06},
          robe=(0.360, 0.145, 0.115, 1.0), trim=GOLD, sash=GOLD,
          brow=-0.44, squint=0.22, mouth=-0.38, eye_tilt=0.28, face_w=1.02, brow_weight=1.35),
    Hero4("guanyu", "shu", 1.22, 0.178, 1.02, JUJUBE, (0.130, 0.105, 0.085, 1.0),
          beard="long", cap="wubian", weapon="guandao",
          cloak="full", mount={"coat": (0.470, 0.145, 0.095, 1.0), "scale": 1.0},
          brow=-0.16, squint=0.52, mouth=-0.06, eye_tilt=0.30, face_w=0.94,
          brow_weight=1.25, turn=-0.2),
    Hero4("zhangfei", "shu", 1.18, 0.195, 1.24, SWARTHY, INK,
          beard="bushy", cap="helmet", weapon="zhangba",
          brow=-0.48, squint=0.0, mouth=-0.42, eye_tilt=0.16, face_w=1.10,
          brow_weight=1.45, shoulder=0.25),
    Hero4("zhaoyun", "shu", 1.14, 0.185, 0.96, FAIR, INK,
          beard="none", cap="helmet", weapon="silverspear", cloak="full",
          robe=WHITE_ROBE, trim=SILVER,
          brow=0.14, squint=0.18, mouth=0.08, eye_tilt=0.06, face_w=0.94,
          brow_weight=0.90, turn=0.2),
    Hero4("zhugeliang", "shu", 1.10, 0.190, 0.86, PALE, INK,
          beard="goatee", cap="guanjin", weapon="fan", cloak="full",
          robe=WHITE_ROBE, trim=(0.500, 0.470, 0.420, 1.0),
          brow=0.10, squint=0.28, mouth=0.12, eye_tilt=-0.10, face_w=0.88,
          brow_weight=0.75, turn=0.3),
    Hero4("caocao", "wei", 1.00, 0.202, 1.06, FAIR, INK,        # 最矮
          beard="wispy", cap="crown", weapon="sword", cloak="full",
          brow=-0.22, squint=0.46, mouth=-0.14, eye_tilt=0.26, face_w=1.02,
          brow_weight=1.10, turn=-0.4, lean=0.3),
    Hero4("xiahoudun", "wei", 1.16, 0.185, 1.10, TAN, INK,      # 補剪影:殘破披風
          beard="stubble", cap="wubian", weapon="sword", mark="eyepatch",
          cloak="tattered",
          brow=-0.36, squint=0.30, mouth=-0.30, eye_tilt=0.22, face_w=1.04,
          brow_weight=1.30, turn=-0.15),
    Hero4("zhouyu", "wu", 1.12, 0.188, 0.94, FAIR, INK,
          beard="wispy", cap="wubian", weapon="sword", cloak="full",
          brow=0.08, squint=0.24, mouth=0.06, eye_tilt=-0.06, face_w=0.92,
          brow_weight=0.85, turn=0.25),
]


def main():
    wipe()
    stage(9.5)
    lights()
    sp = 1.30
    x0 = -sp * (len(CAST4) - 1) / 2
    verts = 0
    for i, h in enumerate(CAST4):
        parts, _extra = build_hero4(h, x0 + i * sp)
        verts += count_verts(parts)

    s = configure(130)
    enable_outline(s, thickness=2.1)
    render_to(s, RANKS_IMG, (0.0, -14.6, 1.42), (0.0, 0.0, 0.72), 45, 2000, 820)
    render_to(s, THUMBS_IMG, (0.0, -14.6, 1.42), (0.0, 0.0, 0.72), 45, 620, 254)
    # 坐騎的辨識度在側面 — 正面看馬永遠像一條窄柱,這個角度才是公平的判斷
    gx = x0 + sp * 1                                     # 關羽的位置
    render_to(s, MOUNT_IMG, (gx + 3.30, -3.90, 1.62), (gx - 0.35, 0.10, 0.78),
              58, 1500, 900)

    print(f"\n平均每人 {verts // len(CAST4):,} 頂點(含坐騎與披風)")
    print(f"RANKS={RANKS_IMG}\nTHUMBS={THUMBS_IMG}\nMOUNT={MOUNT_IMG}")


if __name__ == "__main__":
    main()
