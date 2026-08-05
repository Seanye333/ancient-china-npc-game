import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  terrainHeight, slopeAt, valleyMask, riverMask, rng,
  registerBlockers, clearBlockers, registerDecks, clearDecks,
  type Blocker, type Deck,
} from './field';
import { emptyParts, MATERIALS, pushBox, pushCyl, house, type Bucket } from './build';

/**
 * 聚落 — 沿河谷兩岸的鋪面,加一座跨河木橋。
 *
 * 選址規則就是真實聚落的邏輯:要在谷地、要夠平、不能壓在河床上、
 * 彼此不能太近。規則寫對了,分佈自己就會像個村子。
 */

const meanderAt = (z: number) => Math.sin(z * 0.02) * 9 + Math.sin(z * 0.047) * 3.5;

export function Settlement() {
  const { merged, foot, deck } = useMemo(() => {
    const parts = emptyParts();
    // 房子擋鏡頭但不擋人 —— 堂屋前面是敞開的,人走得進去;
    // 若連人一起擋,村民會被自己家門口卡住。
    const foot: Blocker[] = [];
    const deck: Deck[] = [];
    const rand = rng(20260802);

    // 必須記錄已放位置做間距檢查 —— 第一版沒做,屋頂全疊在一起穿模。
    const taken: Array<[number, number]> = [];
    const MIN_GAP = 11.5;
    let placed = 0;
    let guard = 0;
    while (placed < 46 && guard < 9000) {
      guard++;
      const z = (rand() - 0.5) * 300;
      const side = rand() < 0.5 ? -1 : 1;
      const off = 12 + rand() * 24;
      const x = meanderAt(z) + side * off;
      if (valleyMask(x, z) < 0.30) continue;
      if (riverMask(x, z) > 0.30) continue;
      if (slopeAt(x, z) > 0.20) continue;
      if (taken.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < MIN_GAP)) continue;
      taken.push([x, z]);

      const g = terrainHeight(x, z);
      const bays = 2 + Math.floor(rand() * 3);
      const depth = 4.2 + rand() * 2.4;
      const floors = rand() < 0.28 ? 2 : 1;
      // 面朝河 — 背對山,和真實聚落一樣
      const yaw = (side < 0 ? -Math.PI / 2 : Math.PI / 2) + (rand() - 0.5) * 0.34;
      house(parts, x, z, g - 0.15, bays, depth, floors, yaw, rand);
      // 長條的屋子用兩顆圓近似,比一顆大圓貼身得多
      const w = bays * 2.05;
      const r = depth / 2 + 1.2;      // 算上出簷
      const arm = Math.max(0, w / 2 - depth / 2);
      for (const t of [-1, 1]) {
        foot.push({
          x: x + Math.cos(yaw) * arm * t, z: z - Math.sin(yaw) * arm * t,
          solid: 0, view: r,
          top: g + 0.42 + floors * 2.5 + 1.5,        // 屋脊
        });
      }
      placed++;
    }

    // 跨河木橋
    const bz = 6;
    const bm = meanderAt(bz);
    const by = terrainHeight(bm, bz) + 2.3;
    pushBox(parts, 'wood', 26, 0.42, 3.4, bm, by, bz);
    // 橋板走得上去 —— 兩端各縮一點,免得站在半空的橋頭
    deck.push({ x0: bm - 12.4, x1: bm + 12.4, z0: bz - 1.5, z1: bz + 1.5, y: by + 0.21 });
    for (let i = 0; i < 7; i++) {
      const px = bm - 11 + i * 3.7;
      pushCyl(parts, 'wood', 0.22, 0.22, 5.6, 6, px, by - 2.8, bz + 1.5);
      pushCyl(parts, 'wood', 0.22, 0.22, 5.6, 6, px, by - 2.8, bz - 1.5);
      for (const s of [-1, 1]) {
        pushCyl(parts, 'wood', 0.10, 0.10, 1.5, 5, px, by + 0.75, bz + s * 1.7);
      }
    }
    for (const s of [-1, 1]) {
      pushBox(parts, 'wood', 26, 0.16, 0.16, bm, by + 1.45, bz + s * 1.7);
    }

    // 碼頭 — 有河就該有埠,順帶說明這個聚落靠什麼活
    for (const dz of [-46, 78]) {
      const dm = meanderAt(dz);
      const dy = terrainHeight(dm + 6, dz) + 0.3;
      pushBox(parts, 'wood', 7.5, 0.30, 3.0, dm + 5.2, dy, dz);
      deck.push({ x0: dm + 1.6, x1: dm + 8.8, z0: dz - 1.4, z1: dz + 1.4, y: dy + 0.15 });
      for (let i = 0; i < 4; i++) {
        pushCyl(parts, 'wood', 0.16, 0.16, 3.0, 6, dm + 2.4 + i * 1.9, dy - 1.5, dz + 1.2);
        pushCyl(parts, 'wood', 0.16, 0.16, 3.0, 6, dm + 2.4 + i * 1.9, dy - 1.5, dz - 1.2);
      }
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
    return { merged: out, foot, deck };
  }, []);

  useEffect(() => {
    registerBlockers('houses', foot);
    return () => clearBlockers('houses');
  }, [foot]);

  useEffect(() => {
    registerDecks('settlement', deck);
    return () => clearDecks('settlement');
  }, [deck]);

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
