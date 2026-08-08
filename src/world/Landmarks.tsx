import { BuiltMeshes } from './Built';
import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { terrainHeight, rng } from './field';
import {
  emptyParts, pushBox, pushCyl, frame, roof, house,
  type Bucket, type Parts,
} from './build';

/**
 * 地標 — 城門、廟、院落、望樓。
 *
 * 一排一樣的鋪面只是「一條街」;要讀成一個<b>有結構的聚落</b>,
 * 得有幾樣壓得住場的東西:入口、信仰中心、大戶人家、防禦。
 * 它們同時也是導航地標 —— 玩家靠它們認路。
 */

const meanderAt = (z: number) => Math.sin(z * 0.02) * 9 + Math.sin(z * 0.047) * 3.5;

/** 城門樓 — 夯土墩台 + 拱門洞 + 上頭一座門樓。 */
function gatehouse(parts: Parts, cx: number, cz: number, g: number, yaw: number,
                   rand: () => number) {
  const { X, Z } = frame(cx, cz, yaw);
  const W = 13;
  const D = 5.4;
  const H = 6.2;

  // 墩台分左右兩塊,中間留門洞
  const gap = 3.4;
  for (const sx of [-1, 1]) {
    const bw = (W - gap) / 2;
    pushBox(parts, 'mud', bw, H, D,
      X(sx * (gap / 2 + bw / 2), 0), g + H / 2, Z(sx * (gap / 2 + bw / 2), 0), 0, yaw, 0);
  }
  // 門洞上方的過樑與拱
  pushBox(parts, 'mud', gap + 0.6, H - 3.9, D, X(0, 0), g + 3.9 + (H - 3.9) / 2, Z(0, 0), 0, yaw, 0);
  for (let i = 0; i < 9; i++) {
    const t = (i / 8) * Math.PI;
    const ax = Math.cos(t) * (gap / 2);
    const ay = Math.sin(t) * 1.5;
    pushBox(parts, 'stone', 0.55, 0.42, D + 0.14,
      X(ax, 0), g + 2.4 + ay, Z(ax, 0), 0, yaw, t - Math.PI / 2);
  }
  // 墩台頂的女牆 — 城牆的辨識度在這排齒
  const merlons = 9;
  for (let i = 0; i < merlons; i++) {
    const lx = -W / 2 + 0.7 + (i * (W - 1.4)) / (merlons - 1);
    pushBox(parts, 'mud', 0.86, 0.95, 0.42,
      X(lx, -D / 2 + 0.2), g + H + 0.48, Z(lx, -D / 2 + 0.2), 0, yaw, 0);
  }
  // 上層門樓
  house(parts, X(0, 0.2), Z(0, 0.2), g + H, 3, 3.6, 1, yaw, rand);

  // 兩側接一段城牆
  for (const sx of [-1, 1]) {
    const wl = 15;
    pushBox(parts, 'mud', wl, H * 0.72, D * 0.8,
      X(sx * (W / 2 + wl / 2), 0), g + (H * 0.72) / 2, Z(sx * (W / 2 + wl / 2), 0), 0, yaw, 0);
    for (let i = 0; i < 7; i++) {
      const lx = sx * (W / 2 + 1 + i * 2.1);
      pushBox(parts, 'mud', 0.8, 0.8, 0.4,
        X(lx, -D * 0.4 + 0.15), g + H * 0.72 + 0.4, Z(lx, -D * 0.4 + 0.15), 0, yaw, 0);
    }
  }
}

/** 廟 — 高台基、寬面闊、大屋頂、正面台階。 */
function temple(parts: Parts, cx: number, cz: number, g: number, yaw: number) {
  const { X, Z } = frame(cx, cz, yaw);
  const W = 12.5;
  const D = 8.5;
  const baseH = 1.5;
  const fh = 4.2;

  // 台基 + 三級踏跺
  pushBox(parts, 'stone', W + 2.6, baseH, D + 2.6, cx, g + baseH / 2, cz, 0, yaw, 0);
  for (let i = 0; i < 3; i++) {
    pushBox(parts, 'stone', 5.4, 0.5, 0.9,
      X(0, -(D / 2 + 1.3 + i * 0.9)), g + baseH - 0.25 - i * 0.5,
      Z(0, -(D / 2 + 1.3 + i * 0.9)), 0, yaw, 0);
  }
  // 檐柱一圈 — 廟的氣勢靠柱列
  for (let i = 0; i <= 5; i++) {
    const lx = -W / 2 + (i * W) / 5;
    for (const lz of [-D / 2, D / 2]) {
      pushCyl(parts, 'wood', 0.30, 0.34, fh, 8,
        X(lx, lz), g + baseH + fh / 2, Z(lx, lz), 0, yaw, 0);
    }
  }
  pushBox(parts, 'mud', W, fh, 0.3, X(0, D / 2), g + baseH + fh / 2, Z(0, D / 2), 0, yaw, 0);
  for (const sx of [-1, 1]) {
    pushBox(parts, 'mud', 0.3, fh, D, X((sx * W) / 2, 0), g + baseH + fh / 2, Z((sx * W) / 2, 0), 0, yaw, 0);
  }
  // 正面明間開門,次間格扇
  pushBox(parts, 'wood', 3.2, fh * 0.8, 0.2, X(0, -D / 2), g + baseH + fh * 0.40, Z(0, -D / 2), 0, yaw, 0);
  for (const sx of [-1, 1]) {
    pushBox(parts, 'paper', 3.0, fh * 0.5, 0.14,
      X(sx * 4.2, -D / 2), g + baseH + fh * 0.58, Z(sx * 4.2, -D / 2), 0, yaw, 0);
  }
  // 額枋 + 雙層檐
  pushBox(parts, 'wood', W + 1.0, 0.42, 0.36, X(0, -D / 2), g + baseH + fh - 0.24, Z(0, -D / 2), 0, yaw, 0);
  roof(parts, cx, cz, yaw, W, D, g + baseH + fh, 1.6, 0.62);
}

/** 院落 — 圍牆 + 門樓 + 三面廂房,大戶人家的樣子。 */
function courtyard(parts: Parts, cx: number, cz: number, g: number, yaw: number,
                   rand: () => number) {
  const { X, Z } = frame(cx, cz, yaw);
  const W = 20;
  const D = 17;
  const wallH = 2.6;

  // 圍牆(前牆留門)
  pushBox(parts, 'mud', W, wallH, 0.5, X(0, D / 2), g + wallH / 2, Z(0, D / 2), 0, yaw, 0);
  for (const sx of [-1, 1]) {
    pushBox(parts, 'mud', 0.5, wallH, D, X((sx * W) / 2, 0), g + wallH / 2, Z((sx * W) / 2, 0), 0, yaw, 0);
    pushBox(parts, 'mud', W / 2 - 2, wallH, 0.5,
      X(sx * (W / 4 + 1), -D / 2), g + wallH / 2, Z(sx * (W / 4 + 1), -D / 2), 0, yaw, 0);
  }
  // 門樓
  pushBox(parts, 'mud', 4.6, 3.4, 1.2, X(0, -D / 2), g + 1.7, Z(0, -D / 2), 0, yaw, 0);
  pushBox(parts, 'wood', 2.2, 2.4, 0.24, X(0, -D / 2 - 0.6), g + 1.2, Z(0, -D / 2 - 0.6), 0, yaw, 0);
  roof(parts, X(0, -D / 2), Z(0, -D / 2), yaw, 5.2, 1.8, g + 3.4, 0.5, 0.55);

  // 正房 + 兩廂
  house(parts, X(0, D / 2 - 3.2), Z(0, D / 2 - 3.2), g, 3, 4.6, 1, yaw + Math.PI, rand);
  for (const sx of [-1, 1]) {
    house(parts, X(sx * (W / 2 - 2.8), 0.6), Z(sx * (W / 2 - 2.8), 0.6), g,
      2, 4.0, 1, yaw + sx * Math.PI / 2, rand);
  }
}

/** 望樓 — 谷口的哨塔,兼作遠處的視覺錨點。 */
function watchtower(parts: Parts, cx: number, cz: number, g: number, yaw: number) {
  const { X, Z } = frame(cx, cz, yaw);
  const tiers = 3;
  let y = g;
  let w = 5.0;
  for (let t = 0; t < tiers; t++) {
    const h = 3.2 - t * 0.35;
    pushBox(parts, t === 0 ? 'mud' : 'wood', w, h, w, cx, y + h / 2, cz, 0, yaw, 0);
    for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      pushCyl(parts, 'wood', 0.16, 0.16, h, 6,
        X((ox * w) / 2, (oz * w) / 2), y + h / 2, Z((ox * w) / 2, (oz * w) / 2), 0, yaw, 0);
    }
    // 每層出一圈平座
    pushBox(parts, 'wood', w + 1.5, 0.18, w + 1.5, cx, y + h, cz, 0, yaw, 0);
    y += h;
    w *= 0.82;
  }
  roof(parts, cx, cz, yaw, w + 1.2, w + 1.2, y, 0.9, 0.75);
}

export function Landmarks() {
  const merged = useMemo(() => {
    const parts = emptyParts();
    const rand = rng(8899);

    // 谷口城門 — 卡在河谷南北兩端
    for (const z of [-118, 128]) {
      const x = meanderAt(z) + 15;
      gatehouse(parts, x, z, terrainHeight(x, z) - 0.2, z < 0 ? 0 : Math.PI, rand);
    }
    // 廟 — 東岸略高處,背山面水
    {
      const z = -34;
      const x = meanderAt(z) + 34;
      temple(parts, x, z, terrainHeight(x, z) - 0.2, -Math.PI / 2);
    }
    // 兩座院落
    for (const [z, side] of [[24, 1], [-72, -1]] as const) {
      const x = meanderAt(z) + side * 30;
      courtyard(parts, x, z, terrainHeight(x, z) - 0.2, side < 0 ? Math.PI / 2 : -Math.PI / 2, rand);
    }
    // 望樓 — 兩處高地
    for (const [z, off] of [[64, 46], [-96, -44]] as const) {
      const x = meanderAt(z) + off;
      watchtower(parts, x, z, terrainHeight(x, z) - 0.2, rand() * Math.PI);
    }

    const out: Array<{ key: Bucket; geom: THREE.BufferGeometry }> = [];
    (Object.keys(parts) as Bucket[]).forEach((k) => {
      if (!parts[k].length) return;
      const g = mergeGeometries(parts[k], false);
      if (g) {
        g.computeVertexNormals();
        out.push({ key: k, geom: g });
      }
    });
    return out;
  }, []);

  return (
    <>
      <BuiltMeshes parts={merged} />
    </>
  );
}
