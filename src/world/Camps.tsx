import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { groundAt, slopeAt, rng } from './field';
import { emptyParts, MATERIALS, pushBox, pushCyl, type Bucket } from './build';
import { useBands } from '../game/bands';

/**
 * 賊窩 — 樹林裡幾個窩棚、一圈木柵、一堆火。
 *
 * 蓋得<b>刻意粗糙</b>:歪斜的柵欄、樹枝搭的棚、地上一圈石頭圍著的火。
 * 村子那邊的房子有台基、有柱、有瓦壟,兩下對比,不必寫一個字
 * 玩家就知道這裡住的是什麼人。
 *
 * 打散之後棚子還在,只是沒人了 —— <b>你做過的事要在地上留著</b>。
 */
export function Camps() {
  const bands = useBands((s) => s.bands);

  const merged = useMemo(() => {
    const parts = emptyParts();
    for (const b of bands) {
      const rand = rng(b.id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
      const g0 = groundAt(b.x, b.z);

      // 火塘 — 一圈石頭。營地的中心先立起來,其餘繞著它擺
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        pushCyl(parts, 'stone', 0.16, 0.2, 0.22, 5,
          b.x + Math.sin(a) * 0.85, g0 + 0.1, b.z + Math.cos(a) * 0.85);
      }
      for (let i = 0; i < 5; i++) {
        pushCyl(parts, 'wood', 0.06, 0.08, 1.0, 4,
          b.x + (rand() - 0.5) * 0.4, g0 + 0.35, b.z + (rand() - 0.5) * 0.4,
          (rand() - 0.5) * 0.9, rand() * 3, (rand() - 0.5) * 0.9);
      }

      // 窩棚 — 兩根叉桿架一道脊,斜披獸皮。人數多就多搭一個
      const huts = 1 + Math.floor(b.count / 3);
      for (let h = 0; h < huts; h++) {
        const a = (h / huts) * Math.PI * 2 + rand();
        const hx = b.x + Math.sin(a) * (3.4 + rand() * 1.4);
        const hz = b.z + Math.cos(a) * (3.4 + rand() * 1.4);
        if (slopeAt(hx, hz) > 0.5) continue;
        const gy = groundAt(hx, hz);
        const yaw = a + Math.PI;
        const len = 2.6 + rand() * 0.8;
        pushCyl(parts, 'wood', 0.07, 0.07, len, 5, hx, gy + 1.05, hz, Math.PI / 2, yaw, 0);
        for (const s of [-1, 1]) {
          const ex = hx + Math.cos(yaw) * (len / 2) * s;
          const ez = hz - Math.sin(yaw) * (len / 2) * s;
          for (const t of [-1, 1]) {
            pushCyl(parts, 'wood', 0.05, 0.07, 1.5, 4,
              ex + Math.sin(yaw) * 0.55 * t, gy + 0.55, ez + Math.cos(yaw) * 0.55 * t,
              t * 0.42, yaw, 0);
          }
          // 披的皮子
          pushBox(parts, 'mud', len * 0.98, 0.06, 1.28, hx, gy + 0.78, hz,
            0, yaw, 0);
        }
      }

      // 歪歪扭扭的木柵 — 只圍朝外那半邊,像臨時起意
      for (let i = 0; i < 11; i++) {
        const a = Math.PI * 0.15 + (i / 10) * Math.PI * 1.1;
        const px = b.x + Math.sin(a) * 6.2;
        const pz = b.z + Math.cos(a) * 6.2;
        if (slopeAt(px, pz) > 0.55) continue;
        pushCyl(parts, 'wood', 0.07, 0.10, 1.5 + rand() * 0.5, 5,
          px, groundAt(px, pz) + 0.66, pz,
          (rand() - 0.5) * 0.26, 0, (rand() - 0.5) * 0.26);
      }
    }

    const out: Array<{ key: Bucket; geom: THREE.BufferGeometry }> = [];
    (Object.keys(parts) as Bucket[]).forEach((k) => {
      if (!parts[k].length) return;
      const g = mergeGeometries(parts[k], false);
      if (g) { g.computeVertexNormals(); out.push({ key: k, geom: g }); }
    });
    return out;
  }, [bands]);

  return (
    <>
      {merged.map(({ key, geom }) => (
        <mesh key={key} geometry={geom} castShadow receiveShadow>
          <meshStandardMaterial {...MATERIALS[key]} />
        </mesh>
      ))}
    </>
  );
}
