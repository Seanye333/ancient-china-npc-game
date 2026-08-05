import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  terrainHeight, rng, registerBlockers, clearBlockers, type Blocker,
} from './field';
import {
  emptyParts, MATERIALS, pushBox, pushCyl, house, roof, type Bucket,
} from './build';

/**
 * 縣城。
 *
 * 這個世界原本只有一個村子 —— 而一個只有一個聚落的世界,說不出「離開」這件事。
 * 押貨沒有地方可押,行商沒有第二個價,官身沒有衙門可去,
 * 亡命也沒有地方可亡。<b>第二個地方是很多事情的前提</b>。
 *
 * 位置是<b>掃出來的不是挑出來的</b>:在離村一百一到二百步的環帶裡,
 * 找一整片(而不是一個點)坡度夠緩、走得到、不在河道上的地。
 * 掃出三十六處候選,取最平的那一片高地 —— 漢代的縣治本來也多半在高處。
 *
 * 走過去大約半天。這個距離是刻意的:近了就只是村子的延伸,
 * 遠了每一趟都變成折磨。
 */

export const COUNTY = { x: 140, z: 124 };
/** 城牆的半邊長。裡頭要塞得下一條街。 */
const R = 26;

export function County() {
  const built = useMemo(() => {
    const parts = emptyParts();
    const rand = rng(90210);
    const foot: Blocker[] = [];
    const g = terrainHeight(COUNTY.x, COUNTY.z);
    const { x: cx, z: cz } = COUNTY;

    /* 夯土城牆 —— 四面,南面留門。牆是這座城最重要的一句話:
       村子沒有牆,而有牆的地方就有官 */
    const WALL_H = 5.2;
    const seg = 2.6;
    for (const side of ['n', 's', 'e', 'w'] as const) {
      const along = side === 'n' || side === 's';
      for (let t = -R; t <= R; t += seg) {
        // 南面正中留一個門洞
        if (side === 's' && Math.abs(t) < 3.6) continue;
        const x = along ? cx + t : cx + (side === 'e' ? R : -R);
        const z = along ? cz + (side === 's' ? R : -R) : cz + t;
        const h = WALL_H + Math.sin(t * 0.3) * 0.18;
        pushBox(parts, 'mud', along ? seg + 0.1 : 2.4, h, along ? 2.4 : seg + 0.1,
          x, g + h / 2, z);
        foot.push({ x, z, solid: 1.5, view: 1.5, top: g + h });
      }
    }

    /* 城門樓 —— 門洞上頭架一層 */
    const gz = cz + R;
    pushBox(parts, 'mud', 9.4, WALL_H, 3.0, cx, g + WALL_H / 2, gz);
    pushBox(parts, 'wood', 7.6, 0.5, 3.4, cx, g + WALL_H + 0.25, gz);
    for (const s of [-1, 1]) {
      pushCyl(parts, 'wood', 0.2, 0.22, 2.9, 6, cx + s * 3.0, g + WALL_H + 1.7, gz - 1.1);
      pushCyl(parts, 'wood', 0.2, 0.22, 2.9, 6, cx + s * 3.0, g + WALL_H + 1.7, gz + 1.1);
    }
    roof(parts, cx, gz, g + WALL_H + 3.1, 8.6, 4.4, 0, 1.0);
    // 門洞兩側的牆墩擋人,門洞本身不擋 —— 不然進不去
    for (const s of [-1, 1]) {
      foot.push({ x: cx + s * 4.4, z: gz, solid: 2.2, view: 2.2, top: g + WALL_H });
    }

    /* 一條南北向的街,兩旁鋪面 */
    for (let i = 0; i < 5; i++) {
      const z = cz + R - 9 - i * 8.2;
      for (const s of [-1, 1]) {
        const x = cx + s * 8.6;
        const bays = 2 + Math.floor(rand() * 2);
        const depth = 4.6 + rand() * 1.6;
        house(parts, x, z, terrainHeight(x, z) - 0.1, bays, depth,
          rand() < 0.3 ? 2 : 1, s < 0 ? Math.PI / 2 : -Math.PI / 2, rand);
        foot.push({ x, z, solid: 3.2, view: 3.4, top: terrainHeight(x, z) + 5 });
      }
    }

    /* 縣衙 —— 城北,台基抬高,三開間帶院牆 */
    const yz = cz - R + 12;
    const yg = terrainHeight(cx, yz);
    pushBox(parts, 'stone', 16, 1.0, 12, cx, yg + 0.5, yz);
    house(parts, cx, yz, yg + 1.0, 4, 7.2, 1, Math.PI, rand);
    foot.push({ x: cx, z: yz, solid: 5.5, view: 6, top: yg + 6 });
    for (const s of [-1, 1]) {
      pushCyl(parts, 'wood', 0.26, 0.3, 4.2, 8, cx + s * 5.4, yg + 3.1, yz + 7.4);
      // 衙前那對石獸,遠遠就認得出這是官府
      pushBox(parts, 'stone', 0.9, 1.1, 1.3, cx + s * 7.2, yg + 0.55, yz + 8.6);
    }

    /* 市集 —— 城中央幾排棚子 */
    const mz = cz + 2;
    for (let i = 0; i < 7; i++) {
      const sx = cx - 5 + (i % 4) * 3.4;
      const sz = mz + Math.floor(i / 4) * 4.2;
      const sg = terrainHeight(sx, sz);
      for (const [ox, oz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]] as const) {
        pushCyl(parts, 'wood', 0.07, 0.07, 2.2, 5, sx + ox, sg + 1.1, sz + oz);
      }
      // 棚頂用 paper 桶(米白布幔),遠看就是一排市棚
      pushBox(parts, 'paper', 3.2, 0.08, 3.2, sx, sg + 2.25, sz, 0.06, 0, 0);
      pushBox(parts, 'wood', 2.6, 0.14, 1.0, sx, sg + 0.85, sz);
    }

    /* 客棧 —— 城東,兩層,門口挑一面旗 */
    const ix = cx + 15, iz = cz - 4;
    const ig = terrainHeight(ix, iz);
    house(parts, ix, iz, ig - 0.1, 3, 6.4, 2, -Math.PI / 2, rand);
    foot.push({ x: ix, z: iz, solid: 3.6, view: 4, top: ig + 7 });
    pushCyl(parts, 'wood', 0.09, 0.09, 5.2, 5, ix - 4.2, ig + 2.6, iz + 2.6);
    pushBox(parts, 'paper', 0.12, 1.6, 0.9, ix - 4.2, ig + 4.4, iz + 3.1);

    registerBlockers('county', foot);

    const out: Array<{ key: Bucket; geom: THREE.BufferGeometry }> = [];
    (Object.keys(parts) as Bucket[]).forEach((k) => {
      if (!parts[k].length) return;
      const geom = mergeGeometries(parts[k], false);
      if (geom) { geom.computeVertexNormals(); out.push({ key: k, geom }); }
    });
    return out;
  }, []);

  useEffect(() => () => clearBlockers('county'), []);

  return (
    <>
      {built.map(({ key, geom }) => (
        <mesh key={key} geometry={geom} castShadow receiveShadow>
          <meshStandardMaterial {...MATERIALS[key]} />
        </mesh>
      ))}
    </>
  );
}
