import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  bodyGeom, headGeom, legGeom, armGeom, radiusAt, legSwing, armSwing,
  HEAD_P, BODY_P, FACE_SQUASH, LIP, BROW, TRIM,
  FIG_H, FIG_HR, FIG_BODY_H, FIG_LEG_H,
} from './figure';

/**
 * 人形的幾何。
 *
 * 這一批加的東西(交領、腰帶、眉鼻口、耳)全都是<b>貼在別的東西表面上</b>的
 * 小零件,而貼歪了的兩種下場眼睛都難察覺:浮在外面一公分(側面看像貼了張紙)、
 * 或者整個陷進去(那條線就這麼沒了,而沒人會發現「本來應該有一條線」)。
 *
 * 腰帶就這麼丟過一次:下擺提到胯以後,原本紮在輪廓最細處的腰帶落到了
 * 胯的鼓肚上,從此埋在袍子裡。畫面上只是少了一道線,誰也不會去找。
 */

/** 從合併後的幾何裡,按烘進頂點的顏色把某個零件挑出來。 */
function vertsOfColor(g: THREE.BufferGeometry, c: THREE.Color) {
  const pos = g.attributes.position.array as Float32Array;
  const col = g.attributes.color.array as Float32Array;
  const out: Array<[number, number, number]> = [];
  for (let i = 0; i < col.length / 3; i++) {
    if (Math.abs(col[i * 3] - c.r) < 1e-3 && Math.abs(col[i * 3 + 1] - c.g) < 1e-3
      && Math.abs(col[i * 3 + 2] - c.b) < 1e-3) {
      out.push([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]);
    }
  }
  return out;
}

const head = headGeom();
const body = bodyGeom(new THREE.Color('#3f5568'));

describe('五官貼在臉上', () => {
  const cy = FIG_HR * 0.84;
  /** 這個高度上,臉皮離中軸多遠。 */
  const skinR = (y: number) => radiusAt(HEAD_P, (y - cy) / FIG_HR) * FIG_HR;

  for (const [name, c] of [['嘴', LIP], ['眉', BROW]] as Array<[string, THREE.Color]>) {
    it(`${name}既不浮在臉前面,也不陷進臉裡`, () => {
      const vs = vertsOfColor(head, c);
      expect(vs.length, `${name}根本不在幾何裡`).toBeGreaterThan(0);
      for (const [x, y, z] of vs) {
        const r = skinR(y);
        expect(r, '這個高度上臉皮不該是零寬').toBeGreaterThan(FIG_HR * 0.2);
        // 貼面的零件:離中軸的距離要落在臉皮附近(擠壓過的 z 要先還原)
        const d = Math.hypot(x, z / FACE_SQUASH);
        expect(d / r, `${name} 在 y=${y.toFixed(3)} 偏離臉皮`).toBeGreaterThan(0.62);
        expect(d / r, `${name} 在 y=${y.toFixed(3)} 浮在臉外`).toBeLessThan(1.30);
      }
    });
  }

  it('五官都在臉的正面(-Z)那半邊', () => {
    for (const c of [LIP, BROW]) {
      for (const [, , z] of vertsOfColor(head, c)) expect(z).toBeLessThan(0);
    }
  });

  it('整顆頭不會有零件飛出去', () => {
    head.computeBoundingSphere();
    expect(head.boundingSphere!.radius).toBeLessThan(FIG_HR * 2.2);
  });
});

describe('身上的零件', () => {
  it('腰帶露在袍子外面 —— 埋進去就等於沒有', () => {
    const vs = vertsOfColor(body, TRIM);
    expect(vs.length).toBeGreaterThan(0);
    // 腰帶那一圈:取最寬的那些頂點,和同高度的袍身半徑比
    let worst = -1;
    for (const [x, y, z] of vs) {
      const robe = radiusAt(BODY_P, (y - FIG_LEG_H) / (FIG_BODY_H - FIG_LEG_H)) * FIG_HR * 1.02;
      worst = Math.max(worst, Math.hypot(x, z) / robe);
    }
    expect(worst, '腰帶最寬處仍在袍身之內').toBeGreaterThan(1.0);
  });

  it('袍子從胯起、到脖子止 —— 上下都不越界', () => {
    body.computeBoundingBox();
    const bb = body.boundingBox!;
    expect(bb.min.y, '袍子不該垂到地上(那一截是腿的)').toBeGreaterThan(FIG_LEG_H * 0.55);
    expect(bb.max.y).toBeLessThan(FIG_BODY_H * 1.25);
  });

  it('腿掛在胯下,腳落在腳底', () => {
    const leg = legGeom();
    leg.computeBoundingBox();
    const bb = leg.boundingBox!;
    /*
     * 原點在胯。腿頂<b>要略高於原點</b> —— 小腿刻意多給一截塞進下擺裡,
     * 抬腿的時候胯上才不會開一條縫。但也只能一點點:超過下擺能蓋住的範圍,
     * 那截褲管就會從袍子外面冒出來。
     */
    expect(bb.max.y).toBeGreaterThan(0);
    expect(bb.max.y, '腿頂冒出下擺了').toBeLessThan(FIG_LEG_H * 0.20);
    expect(bb.min.y).toBeGreaterThan(-FIG_LEG_H * 1.25);
    expect(bb.min.y).toBeLessThan(-FIG_LEG_H * 0.95);
  });

  it('一個人加起來就是一個人高', () => {
    // 頭頂 = 頭的包圍盒上緣 + 身高的落點;差太多就是某一段被改壞了
    head.computeBoundingBox();
    const top = FIG_BODY_H * 0.99 + head.boundingBox!.max.y;
    expect(top).toBeGreaterThan(FIG_H * 0.92);
    expect(top).toBeLessThan(FIG_H * 1.18);
  });
});

describe('邁步', () => {
  it('站住時兩腿歸零,走起來一前一後', () => {
    expect(legSwing(1.2, -1, false)).toBe(0);
    expect(legSwing(1.2, 1, false)).toBe(0);
    const l = legSwing(1.2, -1, true), r = legSwing(1.2, 1, true);
    expect(Math.sign(l)).toBe(-Math.sign(r));
    expect(Math.abs(l)).toBeCloseTo(Math.abs(r), 6);
  });

  it('手和<b>同側的腿</b>反相,幅度小一半 —— 同相走起來像殭屍', () => {
    for (const side of [-1, 1] as const) {
      for (const step of [0.3, 1.7, 4.2]) {
        const leg = legSwing(step, side, true);
        const arm = armSwing(step, side, true);
        expect(Math.sign(arm), `side=${side} step=${step}`).toBe(-Math.sign(leg));
        expect(Math.abs(arm)).toBeLessThan(Math.abs(leg));
      }
      expect(armSwing(1.2, side, false)).toBe(0);
    }
  });

  it('手臂掛在肩上、垂到胯附近 —— 原點在肩,所以整條都在 y<0', () => {
    const arm = armGeom(new THREE.Color('#3f5568'));
    arm.computeBoundingBox();
    const bb = arm.boundingBox!;
    expect(bb.max.y).toBeLessThan(FIG_HR * 0.4);
    expect(bb.min.y).toBeGreaterThan(-FIG_BODY_H * 0.75);
    expect(bb.min.y).toBeLessThan(-FIG_BODY_H * 0.45);
  });
});
