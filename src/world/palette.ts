import * as THREE from 'three';

/**
 * 逐棵的色彩抖動 —— 一片林子最露餡的不是模型糙,是<b>每棵樹一個色</b>。
 *
 * 真實的林相裡沒有兩棵樹同色:向陽背陰、老葉新葉、個體差異。
 * 這裡用位置雜湊(不是 rand,換季重掛時同一棵樹要拿到同一個色)
 * 在 HSL 上各抖一點。畫面上的變化遠大於代價 —— instanceColor
 * 是一次性的 buffer,draw call 一個不多。
 *
 * 注意:instanceColor 是<b>乘</b>在 material.color 上的,
 * 所以用它的材質底色必須是白 —— 基色搬進每棵樹裡,不然雙重壓暗。
 *
 * 這一段從 Vegetation.tsx 搬出來,是為了讓它<b>測得到</b>:
 * 「抖動不會把顏色抖沒了」這條規矩用眼睛在畫面上看不出來
 * (黑樹混在暗處的林子裡就是幾個黑點),但一行斷言就釘得死。
 */

/** 位置雜湊 —— 同一棵樹每次掛上來都拿到同一個色。 */
export function rngGate(x: number, z: number): number {
  const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return h - Math.floor(h);
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const HSL = { h: 0, s: 0, l: 0 };

export function jitteredColor(
  base: THREE.Color, x: number, z: number, dh: number, ds: number, dl: number,
): THREE.Color {
  /*
   * 兩頭都要指明是 sRGB。
   *
   * three 的 getHSL 預設讀的是<b>工作色彩空間</b>(線性),setHSL 預設寫的是
   * <b>sRGB</b> —— 兩個預設值不是同一個空間。來回一趟剛好互相抵消
   * (#2c402a 進去還是 #2c402a),所以這件事藏得住;露餡的是<b>抖動</b>:
   * 針葉樹的 #2c402a 在 sRGB 裡明度 0.208,在線性裡只有 0.037,
   * 而我們往上下各抖 0.09 —— 一半以上的抖動落到 0 以下,
   * clamp 完就是<b>純黑</b>。全世界 2600 棵針葉樹有 644 棵是純黑的,
   * 畫面上讀作「那邊幾棵樹壞了」。飽和度同理:讀到 0.378、
   * 寫回去當 sRGB,整片林子比配色表濃一大截。
   */
  base.getHSL(HSL, THREE.SRGBColorSpace);
  return new THREE.Color().setHSL(
    (HSL.h + (rngGate(x, z) - 0.5) * 2 * dh + 1) % 1,
    clamp01(HSL.s + (rngGate(x * 1.7 + 13, z * 2.3 + 7) - 0.5) * 2 * ds),
    clamp01(HSL.l + (rngGate(x * 2.9 + 31, z * 1.3 + 17) - 0.5) * 2 * dl),
    THREE.SRGBColorSpace,
  );
}
