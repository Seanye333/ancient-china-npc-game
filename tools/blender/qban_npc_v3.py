"""Q 版 NPC v3 — 2,201 個角色的辨識度問題。

疑慮很合理:Q 版簡化了五官,兩千多個武將會不會全長一樣?

但這題的答案跟直覺相反。寫實臉的差異落在鼻樑高度、眼距、顴骨這種細微處,
縮到 64 像素全糊成同一張;Q 版可以把特徵<b>誇張到符號級別</b>,64 像素照樣認得出。

而且三國題材手上有一張王牌:中國古代人物畫的辨識傳統本來就<b>不靠五官</b>,
靠的是冠帶、鬚髯、體貌、兵器。關羽是美髯配偃月刀,張飛是虯髯配丈八矛,
孔明是綸巾配羽扇——這套符號系統本身就是為「遠看也認得出」設計的。

v3 加進四套辨識系統(鬚髯 / 冠帶 / 體貌 / 兵器),然後拿七個最有名的人做檢驗:
不標名字,看你認不認得出誰是誰。

用法:
    /Applications/Blender.app/Contents/MacOS/Blender --background --python qban_npc_v3.py
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from qban_npc_v2 import (          # noqa: E402  — 復用 v2 的工具與場景
    mat, assign, sphere, cone, cyl, torus, look_at, wipe,
    stage, lights, configure, render_to, count_verts, enable_outline,
    INK, AZURITE, MALACHITE, CINNABAR, BONE, IRON,
)

HEROES_IMG = HERE / "qban3-heroes.png"
THUMBS_IMG = HERE / "qban3-thumbs.png"

# 臉色 — 演義給人物的臉譜色,是最省事也最有效的辨識軸
JUJUBE = (0.560, 0.255, 0.190, 1.0)     # 關羽:面如重棗
SWARTHY = (0.430, 0.330, 0.255, 1.0)    # 張飛:豹頭黑面
PALE = (0.830, 0.680, 0.545, 1.0)       # 孔明:面如冠玉
TAN = (0.740, 0.545, 0.400, 1.0)
FAIR = (0.800, 0.615, 0.470, 1.0)

GOLD = (0.620, 0.480, 0.170, 1.0)
SILVER = (0.640, 0.660, 0.680, 1.0)
CRIMSON = (0.420, 0.095, 0.075, 1.0)
GREEN_ROBE = (0.115, 0.270, 0.150, 1.0)
WHITE_ROBE = (0.760, 0.745, 0.700, 1.0)
DARK_ROBE = (0.135, 0.130, 0.135, 1.0)


class Hero:
    """四套辨識系統的參數表。姓名只用在檔案命名,畫面上不標。"""

    def __init__(self, key, height, head, girth, robe, skin, hair,
                 beard="none", cap=None, weapon=None, mark=None,
                 brow=0.0, squint=0.0, mouth=0.0, eye_tilt=0.0,
                 face_w=1.0, brow_weight=1.0, stoop=0.0,
                 trim=None, sash=None, turn=0.0, shoulder=0.0, lean=0.0):
        self.__dict__.update(locals())
        del self.self


# ── 鬚髯 ── 最強的一套。七種形態,遠看就分得開。
def build_beard(parts, style, hx, face_y, head_z, hr, color, p):
    m = mat(f"{p}_beard", color, rough=0.70, sheen=0.30)
    if style == "long":                    # 三縷長髯 — 過腹,分縷
        for i, dx in enumerate((-0.30, 0.0, 0.30)):
            length = hr * (1.66 if i == 1 else 1.38)
            parts.append(cone(f"{p}_bd{i}",
                              (hx + dx * hr, face_y - hr * 0.06, head_z - hr * (0.90 + length / hr * 0.5)),
                              r1=hr * 0.22, r2=hr * 0.05, depth=length, verts=10,
                              material=m, rot=(math.pi, 0, dx * 0.16)))
        parts.append(cone(f"{p}_bd_root", (hx, face_y + hr * 0.10, head_z - hr * 0.84),
                          r1=hr * 0.40, r2=hr * 0.26, depth=hr * 0.34, verts=12,
                          material=m, rot=(math.pi, 0, 0)))
    elif style == "bushy":                 # 虯髯 — 炸開的球團
        parts.append(sphere(f"{p}_bd", (hx, face_y + hr * 0.40, head_z - hr * 0.86),
                            hr * 0.56, scale=(1.18, 0.60, 0.74), material=m))
        for i, (dx, dz) in enumerate(((-0.52, 0.10), (0.52, 0.10), (-0.34, -0.42),
                                      (0.34, -0.42), (0.0, -0.58))):
            parts.append(sphere(f"{p}_bd_tuft{i}",
                                (hx + dx * hr, face_y + hr * 0.40, head_z - hr * (0.86 - dz)),
                                hr * 0.24, seg=10, ring=7, material=m))
    elif style == "full":                  # 絡腮 — 包住下半臉
        parts.append(sphere(f"{p}_bd", (hx, face_y + hr * 0.46, head_z - hr * 0.64),
                            hr * 0.74, scale=(1.10, 0.56, 0.70), material=m))
    elif style == "goatee":                # 山羊鬚
        parts.append(cone(f"{p}_bd", (hx, face_y + hr * 0.22, head_z - hr * 1.02),
                          r1=hr * 0.20, r2=hr * 0.04, depth=hr * 0.62, verts=10,
                          material=m, rot=(math.pi, 0, 0)))
    elif style == "wispy":                 # 八字鬚
        for side in (-1, 1):
            parts.append(cone(f"{p}_bd{side}",
                              (hx + side * hr * 0.26, face_y + hr * 0.10, head_z - hr * 0.52),
                              r1=hr * 0.075, r2=hr * 0.02, depth=hr * 0.46, verts=8,
                              material=m, rot=(math.pi * 0.86, 0, side * 0.55)))
    elif style == "stubble":               # 短髭
        parts.append(cyl(f"{p}_bd", (hx, face_y + hr * 0.06, head_z - hr * 0.34),
                         radius=hr * 0.055, depth=hr * 0.34, verts=8, material=m,
                         rot=(0, math.pi / 2, 0)))


# ── 冠帶 ── 第二強。八種,剪影差異要大。
def build_cap(parts, cap, hx, head_y, head_z, hr, p, trim_col):
    if cap is None:
        return
    m_ink = mat(f"{p}_capink", INK, rough=0.34)
    if cap == "guanjin":                   # 綸巾 — 孔明。方頂軟巾,後垂兩帶
        m = mat(f"{p}_jin", (0.780, 0.765, 0.720, 1.0), rough=0.86, sheen=0.4)
        parts.append(cyl(f"{p}_jin", (hx, head_y, head_z + hr * 0.92),
                         radius=hr * 0.92, depth=hr * 0.78, verts=4, material=m,
                         rot=(0, 0, math.pi / 4), scale=(1.0, 0.94, 1.0)))
        for side in (-1, 1):
            parts.append(cone(f"{p}_jin_tail{side}",
                              (hx + side * hr * 0.44, head_y + hr * 0.86, head_z + hr * 0.30),
                              r1=hr * 0.13, r2=hr * 0.20, depth=hr * 1.00, verts=6,
                              material=m, rot=(1.15, 0, side * 0.18)))
    elif cap == "shufa":                   # 束髮 — 髮髻加一支簪
        m = mat(f"{p}_bun", INK, rough=0.48)
        parts.append(sphere(f"{p}_bun", (hx, head_y + hr * 0.10, head_z + hr * 1.16),
                            hr * 0.40, scale=(1.0, 0.92, 1.0), material=m))
        parts.append(cyl(f"{p}_zan", (hx, head_y + hr * 0.10, head_z + hr * 1.18),
                         radius=hr * 0.038, depth=hr * 1.00, verts=6,
                         material=mat(f"{p}_zan_m", GOLD, rough=0.28, metal=0.80),
                         rot=(0, math.pi / 2, 0.24)))
    elif cap == "wubian":                  # 武弁 — 武官的高筒冠
        parts.append(cyl(f"{p}_wubian", (hx, head_y, head_z + hr * 1.02),
                         radius=hr * 0.60, depth=hr * 1.00, verts=14, material=m_ink,
                         rot=(0.14, 0, 0)))
        parts.append(torus(f"{p}_wubian_band", (hx, head_y, head_z + hr * 0.56),
                           major=hr * 0.62, minor=hr * 0.075, material=mat(f"{p}_band", GOLD,
                                                                          rough=0.32, metal=0.7),
                           scale=(1.0, 1.0, 0.7)))
    elif cap == "helmet":                  # 兜鍪 — 圓頂、盔纓、頓項
        m_iron = mat(f"{p}_iron", (0.215, 0.225, 0.238, 1.0), rough=0.30, metal=0.90)
        parts.append(sphere(f"{p}_helmet", (hx, head_y, head_z + hr * 0.50),
                            hr * 1.09, scale=(1.0, 1.0, 0.62), material=m_iron))
        parts.append(cone(f"{p}_spike", (hx, head_y, head_z + hr * 1.30),
                          r1=hr * 0.14, r2=0.0, depth=hr * 0.42, verts=10, material=m_iron))
        parts.append(sphere(f"{p}_plume", (hx, head_y + hr * 0.06, head_z + hr * 1.56),
                            hr * 0.28, scale=(0.7, 0.7, 1.30), seg=12, ring=8,
                            material=mat(f"{p}_plume_m", CRIMSON, rough=0.82, sheen=0.5)))
        parts.append(cone(f"{p}_neck", (hx, head_y + hr * 0.40, head_z - hr * 0.46),
                          r1=hr * 0.58, r2=hr * 1.02, depth=hr * 0.60, verts=16,
                          material=m_iron, rot=(0.30, 0, 0)))
    elif cap == "crown":                   # 王冠 — 平天冠,前後垂旒
        m = mat(f"{p}_crown", INK, rough=0.30)
        parts.append(cyl(f"{p}_crown_base", (hx, head_y, head_z + hr * 0.86),
                         radius=hr * 0.70, depth=hr * 0.50, verts=14, material=m))
        parts.append(cyl(f"{p}_crown_board", (hx, head_y, head_z + hr * 1.18),
                         radius=hr * 1.05, depth=hr * 0.10, verts=4, material=m,
                         rot=(0.10, 0, math.pi / 4), scale=(1.0, 0.62, 1.0)))
        for i, dx in enumerate((-0.5, -0.17, 0.17, 0.5)):   # 垂旒
            parts.append(cyl(f"{p}_liu{i}", (hx + dx * hr, head_y - hr * 0.62, head_z + hr * 0.92),
                             radius=hr * 0.032, depth=hr * 0.52, verts=6,
                             material=mat(f"{p}_liu_m", GOLD, rough=0.30, metal=0.8)))
    elif cap == "daoguan":                 # 道冠 — 小而高的髻冠
        parts.append(cyl(f"{p}_daoguan", (hx, head_y, head_z + hr * 1.14),
                         radius=hr * 0.34, depth=hr * 0.72, verts=10, material=m_ink))


# ── 兵器 ── 第三強。剪影的最後一筆,遠看比臉有用。
def build_weapon(parts, weapon, bx, y, H, hr, body_h, p):
    if weapon is None:
        return
    m_shaft = mat(f"{p}_shaft", (0.230, 0.150, 0.088, 1.0), rough=0.80)
    m_blade = mat(f"{p}_blade", SILVER, rough=0.20, metal=0.92)
    wx = bx + hr * 1.16
    if weapon == "guandao":                # 青龍偃月刀 — 長桿加一片寬彎刃
        parts.append(cyl(f"{p}_wp", (wx, y - hr * 0.14, H * 0.62),
                         radius=hr * 0.062, depth=H * 1.45, verts=8, material=m_shaft))
        parts.append(cone(f"{p}_wp_blade", (wx + hr * 0.42, y - hr * 0.14, H * 1.34),
                          r1=hr * 0.78, r2=hr * 0.04, depth=hr * 1.30, verts=3,
                          material=m_blade, rot=(0, 0.55, 0), scale=(1.0, 0.14, 1.0)))
        parts.append(cyl(f"{p}_wp_collar", (wx, y - hr * 0.14, H * 1.06),
                         radius=hr * 0.11, depth=hr * 0.20, verts=10, material=m_blade))
    elif weapon == "zhangba":              # 丈八蛇矛 — 極長,矛尖帶波折
        parts.append(cyl(f"{p}_wp", (wx, y - hr * 0.14, H * 0.78),
                         radius=hr * 0.058, depth=H * 1.85, verts=8, material=m_shaft))
        parts.append(cone(f"{p}_wp_head", (wx, y - hr * 0.14, H * 1.78),
                          r1=hr * 0.16, r2=0.0, depth=hr * 0.86, verts=8, material=m_blade))
    elif weapon == "fan":                  # 羽扇 — 半圓一把
        parts.append(cyl(f"{p}_wp_handle", (bx - hr * 1.05, y - hr * 0.34, body_h * 0.50),
                         radius=hr * 0.045, depth=hr * 0.52, verts=6, material=m_shaft))
        parts.append(cyl(f"{p}_wp_fan", (bx - hr * 1.05, y - hr * 0.36, body_h * 0.82),
                         radius=hr * 0.52, depth=hr * 0.05, verts=14,
                         material=mat(f"{p}_feather", (0.870, 0.855, 0.820, 1.0),
                                      rough=0.86, sheen=0.6),
                         rot=(0.12, 0, 0), scale=(1.0, 1.0, 0.75)))
    elif weapon == "silverspear":          # 銀槍 — 細長,槍纓
        parts.append(cyl(f"{p}_wp", (wx, y - hr * 0.14, H * 0.66),
                         radius=hr * 0.048, depth=H * 1.55, verts=8,
                         material=mat(f"{p}_silver", SILVER, rough=0.28, metal=0.85)))
        parts.append(cone(f"{p}_wp_head", (wx, y - hr * 0.14, H * 1.50),
                          r1=hr * 0.12, r2=0.0, depth=hr * 0.56, verts=8, material=m_blade))
        parts.append(sphere(f"{p}_tassel", (wx, y - hr * 0.14, H * 1.20),
                            hr * 0.16, scale=(0.8, 0.8, 1.5), seg=10, ring=7,
                            material=mat(f"{p}_tassel_m", CRIMSON, rough=0.85, sheen=0.5)))
    elif weapon == "twinji":               # 雙戟 — 兩把短的,左右各一
        for side in (-1, 1):
            parts.append(cyl(f"{p}_wp{side}", (bx + side * hr * 1.22, y - hr * 0.20, body_h * 0.72),
                             radius=hr * 0.052, depth=H * 0.72, verts=8, material=m_shaft))
            parts.append(cone(f"{p}_wp_h{side}", (bx + side * hr * 1.22, y - hr * 0.20, body_h * 1.16),
                              r1=hr * 0.13, r2=0.0, depth=hr * 0.44, verts=8, material=m_blade))
            parts.append(cyl(f"{p}_wp_b{side}", (bx + side * hr * 1.34, y - hr * 0.20, body_h * 1.02),
                             radius=hr * 0.20, depth=hr * 0.05, verts=6, material=m_blade,
                             rot=(0, math.pi / 2, 0)))
    elif weapon == "sword":                # 佩劍 — 懸在腰側
        parts.append(cyl(f"{p}_wp", (bx + hr * 0.95, y + hr * 0.20, body_h * 0.44),
                         radius=hr * 0.070, depth=body_h * 0.72, verts=8,
                         material=mat(f"{p}_scab", (0.170, 0.130, 0.115, 1.0), rough=0.55),
                         rot=(0, 0.30, 0)))
        parts.append(sphere(f"{p}_wp_pommel", (bx + hr * 1.16, y + hr * 0.20, body_h * 0.74),
                            hr * 0.10, seg=10, ring=7,
                            material=mat(f"{p}_pommel_m", GOLD, rough=0.30, metal=0.8)))


def build_hero(h: Hero, x: float, y: float = 0.0):
    parts = []
    p = f"{h.key}_{x:.2f}"
    m_robe = mat(f"{p}_robe", h.robe, rough=0.80, sheen=0.30)
    m_skin = mat(f"{p}_skin", h.skin, rough=0.58, sss=0.20)
    m_hair = mat(f"{p}_hair", h.hair, rough=0.48)
    m_ink = mat(f"{p}_ink", INK, rough=0.28)
    trim_col = h.trim or tuple(min(1.0, c * 0.55) for c in h.robe[:3]) + (1.0,)
    m_trim = mat(f"{p}_trim", trim_col, rough=0.72, sheen=0.22)

    H, hr = h.height, h.height * h.head
    body_h = H - hr * 1.85
    st = h.stoop
    head_z = body_h + hr * 0.78 - st * hr * 0.5
    head_y = y + st * 0.07
    face_y = head_y - hr * 0.86 * h.face_w
    bx = x + h.lean * hr * 0.22
    hx = bx + h.turn * hr * 0.10

    parts.append(cone(f"{p}_robe", (bx, y, body_h * 0.5),
                      r1=hr * 1.05 * h.girth, r2=hr * 0.60, depth=body_h,
                      verts=22, material=m_robe, rot=(st * 0.55, 0, h.lean * 0.04)))
    if h.sash:
        parts.append(cyl(f"{p}_sash", (bx, y, body_h * 0.60),
                         radius=hr * 0.80 * h.girth, depth=hr * 0.24, verts=20,
                         material=mat(f"{p}_sash_m", h.sash, rough=0.66, sheen=0.38)))
    for side in (-1, 1):
        drop = h.shoulder * side * hr * 0.10
        parts.append(cone(f"{p}_sleeve{side}", (bx + side * hr * 0.84, y, body_h * 0.64 + drop),
                          r1=hr * 0.30, r2=hr * 0.42, depth=body_h * 0.56, verts=14,
                          material=m_robe, rot=(0, side * 0.17, 0)))
        parts.append(torus(f"{p}_cuff{side}", (bx + side * hr * 0.94, y, body_h * 0.37 + drop),
                           major=hr * 0.38, minor=hr * 0.055, material=m_trim,
                           scale=(1.0, 1.0, 0.6)))
        parts.append(sphere(f"{p}_hand{side}", (bx + side * hr * 0.96, y - hr * 0.22,
                                                body_h * 0.40 + drop),
                            hr * 0.155, seg=12, ring=8, material=m_skin))
    parts.append(torus(f"{p}_collar", (bx, y, body_h * 0.96),
                       major=hr * 0.46, minor=hr * 0.07, material=m_trim, scale=(1.0, 1.0, 0.75)))

    parts.append(sphere(f"{p}_head", (hx, head_y, head_z), hr,
                        scale=(h.face_w, 0.94, 1.04), material=m_skin, rot=(0, 0, h.turn * 0.16)))

    eye_open = 1.0 - h.squint * 0.70
    eye_z = head_z - hr * 0.06
    for side in (-1, 1):
        ex = hx + side * hr * 0.38 * h.face_w
        if h.mark == "eyepatch" and side == 1:        # 獨目 — 一塊布,最強的單點辨識
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
    build_cap(parts, h.cap, hx, head_y, head_z, hr, p, trim_col)
    build_weapon(parts, h.weapon, bx, y, H, hr, body_h, p)
    return parts


# ── 七個檢驗對象 ── 不標名字,看剪影認不認得出
HEROES = [
    # 關羽:面如重棗、三縷長髯、綠袍、偃月刀
    Hero("guanyu", 1.20, 0.180, 1.02, GREEN_ROBE, JUJUBE, (0.130, 0.105, 0.085, 1.0),
         beard="long", cap="wubian", weapon="guandao",
         brow=-0.16, squint=0.52, mouth=-0.06, eye_tilt=0.30, face_w=0.94,
         brow_weight=1.25, trim=GOLD, sash=GOLD, turn=-0.2),
    # 張飛:豹頭環眼、虯髯、黑面、丈八矛
    Hero("zhangfei", 1.18, 0.195, 1.22, DARK_ROBE, SWARTHY, INK,
         beard="bushy", cap="helmet", weapon="zhangba",
         brow=-0.48, squint=0.0, mouth=-0.42, eye_tilt=0.16, face_w=1.10,
         brow_weight=1.45, trim=IRON, sash=CRIMSON, shoulder=0.25),
    # 諸葛亮:綸巾羽扇、面如冠玉、清癯
    Hero("zhugeliang", 1.10, 0.190, 0.86, WHITE_ROBE, PALE, INK,
         beard="goatee", cap="guanjin", weapon="fan",
         brow=0.10, squint=0.28, mouth=0.12, eye_tilt=-0.10, face_w=0.88,
         brow_weight=0.75, trim=(0.500, 0.470, 0.420, 1.0), turn=0.3),
    # 曹操:短小精悍、短髭、錦袍佩劍、王冠
    Hero("caocao", 1.02, 0.200, 1.06, (0.240, 0.115, 0.145, 1.0), FAIR, INK,
         beard="wispy", cap="crown", weapon="sword",
         brow=-0.22, squint=0.46, mouth=-0.14, eye_tilt=0.26, face_w=1.02,
         brow_weight=1.10, trim=GOLD, sash=GOLD, turn=-0.4, lean=0.3),
    # 趙雲:白袍銀槍、少年無鬚
    Hero("zhaoyun", 1.14, 0.185, 0.96, WHITE_ROBE, FAIR, INK,
         beard="none", cap="helmet", weapon="silverspear",
         brow=0.14, squint=0.18, mouth=0.08, eye_tilt=0.06, face_w=0.94,
         brow_weight=0.90, trim=SILVER, sash=AZURITE, turn=0.2),
    # 典韋:魁梧絡腮、雙戟
    Hero("dianwei", 1.24, 0.175, 1.30, (0.280, 0.230, 0.180, 1.0), TAN, INK,
         beard="full", cap=None, weapon="twinji",
         brow=-0.42, squint=0.10, mouth=-0.36, eye_tilt=0.20, face_w=1.14,
         brow_weight=1.50, trim=(0.180, 0.150, 0.120, 1.0), sash=(0.320, 0.150, 0.090, 1.0),
         shoulder=0.30),
    # 夏侯惇:獨目
    Hero("xiahoudun", 1.16, 0.185, 1.10, (0.190, 0.185, 0.200, 1.0), TAN, INK,
         beard="stubble", cap="wubian", weapon="sword", mark="eyepatch",
         brow=-0.36, squint=0.30, mouth=-0.30, eye_tilt=0.22, face_w=1.04,
         brow_weight=1.30, trim=IRON, sash=IRON, turn=-0.15),
]


def main():
    wipe()
    stage(7.5)
    lights()
    sp = 1.08
    x0 = -sp * (len(HEROES) - 1) / 2
    verts = 0
    for i, h in enumerate(HEROES):
        verts += count_verts(build_hero(h, x0 + i * sp))

    s = configure(130)
    enable_outline(s, thickness=2.1)
    print(f"freestyle={s.render.use_freestyle} "
          f"lineset={s.view_layers[0].freestyle_settings.linesets[0].linestyle}")
    render_to(s, HEROES_IMG, (0.0, -11.5, 1.16), (0.0, 0.0, 0.60), 52, 1900, 800)
    # 同一批人的小尺寸版 — 縮圖檢驗用,渲染成窄圖直接逼近遊戲裡的實際大小
    render_to(s, THUMBS_IMG, (0.0, -11.5, 1.16), (0.0, 0.0, 0.60), 52, 560, 236)

    print(f"\n平均每人 {verts // len(HEROES):,} 頂點")
    print(f"HEROES={HEROES_IMG}\nTHUMBS={THUMBS_IMG}")


if __name__ == "__main__":
    main()
