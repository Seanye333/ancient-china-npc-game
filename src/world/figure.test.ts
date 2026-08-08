import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  bodyGeom, headGeom, legGeom, armGeom, radiusAt, legSwing, armSwing, workPose, toolGeom,
  HEAD_P, BODY_P, FACE_SQUASH, LIP, BROW, TRIM, gesturePose, type Mood,
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

describe('做工的姿勢', () => {
  /** 一個週期裡取樣,看這個行當到底動了多少。 */
  function span(job: string) {
    let lo = { lean: 9, arm: 9 }, hi = { lean: -9, arm: -9 };
    for (let i = 0; i < 60; i++) {
      const w = workPose(job, i * 0.1, 0);
      lo = { lean: Math.min(lo.lean, w.lean), arm: Math.min(lo.arm, w.armL) };
      hi = { lean: Math.max(hi.lean, w.lean), arm: Math.max(hi.arm, w.armL) };
    }
    return { lean: hi.lean - lo.lean, arm: hi.arm - lo.arm, leanMax: hi.lean };
  }

  it('下田的人真的在動 —— 站著發呆和彎腰揮鋤是兩個剪影', () => {
    const farm = span('farm');
    // 腰要彎得看得出來(至少三十度),手要掄得過半徑一弧度
    expect(farm.leanMax).toBeGreaterThan(0.5);
    expect(farm.lean).toBeGreaterThan(0.4);
    expect(farm.arm).toBeGreaterThan(1.0);
  });

  it('手臂不會往前掄過頭 —— 過了就成了兩隻張開的翅膀', () => {
    for (const job of ['farm', 'dock', 'wood', 'market']) {
      for (let i = 0; i < 60; i++) {
        const w = workPose(job, i * 0.1, 0);
        expect(w.armL, `${job} 掄過頭`).toBeLessThan(1.15);
        expect(w.armR, `${job} 掄過頭`).toBeLessThan(1.15);
      }
    }
  });

  it('扛包的人是穩的,不是在揮舞 —— 各行當的動作要分得出來', () => {
    expect(span('dock').arm).toBeLessThan(span('farm').arm);
    expect(span('market').lean).toBeLessThan(span('farm').lean);
  });

  it('手上的傢伙:農有鋤、埠有擔,市面上的空手', () => {
    expect(toolGeom('farm')).not.toBeNull();
    expect(toolGeom('dock')).not.toBeNull();
    expect(toolGeom('market')).toBeNull();
    // 傢伙和手臂同一個座標系(原點在肩),所以整件都在肩以下
    const hoe = toolGeom('farm')!;
    hoe.computeBoundingBox();
    expect(hoe.boundingBox!.max.y).toBeLessThan(0);
  });
});

/**
 * 神情。
 *
 * 這一組<b>不能靠截圖驗</b>,試過了:把鏡頭端到人臉前面,再繞四圈挑
 * 「最亮的那一面」當正臉 —— 挑回來的是後腦勺(白髮比背光的臉還亮),
 * 而且那些人自己還會走開。神情是幾何,幾何就該從幾何驗:
 * 把烘了色的眉與唇挑出來,量它們的座標。
 */
describe('神情', () => {
  /** 眉毛內側(靠鼻樑那一端)的高度 —— 兇是壓下來,怕是吊起來。 */
  const browInnerY = (mood: Mood) => {
    const vs = vertsOfColor(headGeom({ mood }), BROW).filter(([x]) => x > 0);
    // x 最小的那幾個 = 最靠中線的一段
    const minX = Math.min(...vs.map(([x]) => x));
    const inner = vs.filter(([x]) => x < minX + FIG_HR * 0.06);
    return inner.reduce((a, [, y]) => a + y, 0) / inner.length;
  };

  it('兇的眉壓下來,怕的眉吊起來', () => {
    const stern = browInnerY('stern');
    const calm = browInnerY('calm');
    const afraid = browInnerY('afraid');
    expect(stern).toBeLessThan(calm);
    expect(afraid).toBeGreaterThan(calm);
    // 差距要看得出來 —— 差一根頭髮寬等於沒有表情
    expect(afraid - stern).toBeGreaterThan(FIG_HR * 0.06);
  });

  it('和氣的嘴角是揚的,兇的嘴是抿平的', () => {
    const cornerMinusMid = (mood: Mood) => {
      const vs = vertsOfColor(headGeom({ mood }), LIP);
      const maxX = Math.max(...vs.map(([x]) => Math.abs(x)));
      const corner = vs.filter(([x]) => Math.abs(x) > maxX * 0.7);
      const mid = vs.filter(([x]) => Math.abs(x) < maxX * 0.3);
      const avg = (a: Array<[number, number, number]>) =>
        a.reduce((s, [, y]) => s + y, 0) / a.length;
      return avg(corner) - avg(mid);
    };
    // 笑 = 嘴角比中段高
    expect(cornerMinusMid('glad')).toBeGreaterThan(0);
    // 兇 = 中段比嘴角高(撇下來)
    expect(cornerMinusMid('stern')).toBeLessThan(0);
    expect(Math.abs(cornerMinusMid('calm'))).toBeLessThan(FIG_HR * 0.005);
  });

  it('怕的時候眼睛睜大,倦的時候瞇著', () => {
    const eyeSpan = (mood: Mood) => {
      const g = headGeom({ mood });
      g.computeBoundingBox();
      // 眼白是唯一那個顏色 —— 拿它的縱向跨度當「眼睛多大」
      const vs = vertsOfColor(g, new THREE.Color('#f2f0ea'));
      expect(vs.length).toBeGreaterThan(0);
      const ys = vs.map(([, y]) => y);
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(eyeSpan('afraid')).toBeGreaterThan(eyeSpan('calm'));
    expect(eyeSpan('weary')).toBeLessThan(eyeSpan('calm'));
  });

  it('換神情不會把五官弄到臉外面去', () => {
    const cy = FIG_HR * 0.84;
    const skinR = (y: number) => radiusAt(HEAD_P, (y - cy) / FIG_HR) * FIG_HR;
    for (const mood of ['calm', 'stern', 'afraid', 'glad', 'weary'] as const) {
      const g = headGeom({ mood });
      for (const c of [LIP, BROW]) {
        for (const [x, y, z] of vertsOfColor(g, c)) {
          const d = Math.hypot(x, z / FACE_SQUASH);
          expect(d / skinR(y), `${mood} 的五官跑出臉外`).toBeLessThan(1.30);
        }
      }
    }
  });
});

describe('隨身帶的東西', () => {
  it('市面上的人手上不再是空的', () => {
    for (const kind of ['basket', 'jar', 'firewood']) {
      const g = toolGeom(kind);
      expect(g, `${kind} 沒做出來`).not.toBeNull();
      g!.computeBoundingBox();
      const b = g!.boundingBox!;
      // 掛在肩的座標系裡:不能大過人、也不能離身體太遠
      const size = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z);
      expect(size, `${kind} 大得不像話`).toBeLessThan(FIG_H);
      expect(size, `${kind} 小到看不見`).toBeGreaterThan(FIG_HR * 0.3);
      for (const v of [b.min, b.max]) {
        expect(Math.hypot(v.x, v.z), `${kind} 飄在身體外面`).toBeLessThan(FIG_H);
      }
    }
  });

  it('沒有這一行的還是回 null —— 不要無中生有', () => {
    expect(toolGeom('none')).toBeNull();
  });
});

describe('說話的手勢', () => {
  it('一輪裡有拱手、有比劃、也有垂手聽著', () => {
    const arms: Array<[number, number]> = [];
    for (let t = 0; t < 8; t += 0.05) {
      const p = gesturePose(t, 0);
      arms.push([p.armL, p.armR]);
    }
    // 拱手 = 兩手同時抬到胸前(而且左右一樣高)
    const bow = arms.filter(([l, r]) => l > 0.8 && Math.abs(l - r) < 1e-6);
    expect(bow.length, '一輪裡沒有拱手').toBeGreaterThan(4);
    // 比劃 = 一手抬起來、另一手垂著
    const point = arms.filter(([l, r]) => l < -0.5 && r > -0.2);
    expect(point.length, '一輪裡沒有比劃').toBeGreaterThan(4);
    // 聽著 = 兩手都垂著
    const idle = arms.filter(([l, r]) => Math.abs(l) < 0.1 && Math.abs(r) < 0.1);
    expect(idle.length, '一輪裡沒有停下來的時候').toBeGreaterThan(10);
  });

  it('每個人的節拍不同 —— 一village的人同時拱手是閱兵', () => {
    const a = gesturePose(3, 0);
    const b = gesturePose(3, 0.7);
    expect(a.armL).not.toBeCloseTo(b.armL, 3);
  });
});
