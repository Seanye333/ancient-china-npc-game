"""當前基線 = v7 的著色與體積補償 + v8 的黃昏色調。

臉部手放影(瀏海投影/眼瞼影)三輪都失敗,原因不是位置沒調對:
**這個髮型的瀏海本來就蓋住整個額頭,根本沒有額頭可以投影。**
要有那道影,得先有一個露出額頭的髮型——而髮型正好是「必須雕」的那一類。
所以這裡不再加,留給雕好的髮型再說。
"""
from __future__ import annotations
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import qban_anime_v6 as A6      # noqa: E402
import qban_volume_v7 as V7     # noqa: E402
import qban_polish_v8 as V8     # noqa: E402
from qban_npc_v2 import wipe    # noqa: E402

HERO = HERE / "qban-baseline-hero.png"
FACES = HERE / "qban-baseline-faces.png"


def main():
    face = A6.Face("v", look=(0.12, 0.06), pupil=1.0, brow=0.12,
                   mouth="smile", blush=0.45)
    wipe(); V8.stage_dusk()
    V7.build(0.0, face, volume=True, p="hero")
    s = A6.configure_eevee(128)
    A6.render_to(s, HERO, (1.30, -2.55, 1.20), (-0.02, 0.06, 0.56), 62, 1200, 1400)

    wipe(); V8.stage_dusk()
    sp = 0.62
    x0 = -sp * (len(A6.FACES) - 1) / 2
    for i, fc in enumerate(A6.FACES):
        V7.build(x0 + i * sp, fc, volume=True, p=f"x{i}")
    s = A6.configure_eevee(96)
    A6.render_to(s, FACES, (0.0, -5.30, 0.80), (0.0, 0.0, 0.80), 57, 1800, 600)
    print(f"\nHERO={HERO}\nFACES={FACES}")


if __name__ == "__main__":
    main()
