"""v8b — 回退髮型,保留有效項。

v8 想把瀏海從「五片各自為政的三角」改成連續髮束,連改兩輪都更糟:
髮面高光成了三塊白斑、髮束成了扇形板。**頭髮跟馬是同一類問題**——
連續轉折的有機形體,拿錐體和球去湊永遠差一口氣。

所以髮型回到 v7 的做法,只保留 v8 真正有效的兩項:

  額頭上那道瀏海投影 — cel shading 會把真實陰影吃掉,業界普遍手動放一塊影。
                        這是「頭髮長在頭上」和「貼在頭上」的差別。
  黃昏色調           — 中性灰藍不會錯,但什麼都沒說。

用法:
    /Applications/Blender.app/Contents/MacOS/Blender --background --python qban_final_v8b.py
"""
from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import qban_anime_v6 as A6                       # noqa: E402
import qban_volume_v7 as V7                      # noqa: E402
import qban_polish_v8 as V8                      # noqa: E402
from qban_npc_v2 import sphere, wipe             # noqa: E402

HERO_IMG = HERE / "qban8b-hero.png"
CMP_IMG = HERE / "qban8b-compare.png"
FACE_IMG = HERE / "qban8b-faces.png"


def face_shadows(x, head_z, hr, p):
    """兩塊手放的影。位置是關鍵:必須落在髮際下緣與眉之間那條窄帶。"""
    face_y = -hr * 0.99
    sphere(f"{p}_bangshadow", (x, face_y + hr * 0.02, head_z + hr * 0.40),
           hr * 0.76, scale=(1.0, 0.08, 0.11), seg=22, ring=12,
           material=A6.flat(f"{p}_bs", V8.BANG_SHADOW))
    for side in (-1, 1):                          # 眼瞼下一線影,眼睛才坐進眼窩
        sphere(f"{p}_lid{side}", (x + side * hr * 0.43, face_y + hr * 0.005,
                                  head_z + hr * 0.20),
               hr * 0.28, scale=(1.0, 0.09, 0.09), seg=16, ring=9,
               material=A6.flat(f"{p}_ls", V8.LID_SHADOW))


def build(x, f, p, volume=True, shadows=True):
    head_z, hr = V7.build(x, f, volume=volume, p=p)
    if shadows:
        face_shadows(x, head_z, hr, p)
    return head_z, hr


def main():
    face = A6.Face("v", look=(0.12, 0.06), pupil=1.0, brow=0.12,
                   mouth="smile", blush=0.45)

    wipe(); V8.stage_dusk()
    build(0.0, face, "hero")
    s = A6.configure_eevee(128)
    A6.render_to(s, HERO_IMG, (1.30, -2.55, 1.20), (-0.02, 0.06, 0.56), 62, 1200, 1400)

    wipe(); V8.stage_dusk()
    build(-0.62, face, "old", shadows=False)      # 無臉部影
    build(0.62, face, "new", shadows=True)        # 有臉部影
    s = A6.configure_eevee(96)
    A6.render_to(s, CMP_IMG, (1.55, -4.45, 1.42), (0.0, 0.10, 0.54), 60, 1700, 940)

    wipe(); V8.stage_dusk()
    sp = 0.62
    x0 = -sp * (len(A6.FACES) - 1) / 2
    for i, fc in enumerate(A6.FACES):
        build(x0 + i * sp, fc, f"x{i}")
    s = A6.configure_eevee(96)
    A6.render_to(s, FACE_IMG, (0.0, -5.30, 0.80), (0.0, 0.0, 0.80), 57, 1800, 600)

    print(f"\nHERO={HERO_IMG}\nCOMPARE={CMP_IMG}\nFACES={FACE_IMG}")


if __name__ == "__main__":
    main()
