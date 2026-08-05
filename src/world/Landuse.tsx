import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { terrainHeight, slopeAt, valleyMask, riverMask, rng } from './field';
import { paletteFor, useClock } from './worldTime';

/**
 * 土地利用 — 農田與道路。
 *
 * 一個世界看起來「有人住」,靠的不是房子多,是<b>房子之間那些痕跡</b>:
 * 誰家的田、路往哪走、水從哪引。少了這層,聚落只是擺在荒地上的模型。
 */

const meanderAt = (z: number) => Math.sin(z * 0.02) * 9 + Math.sin(z * 0.047) * 3.5;

/** 梯田 — 沿等高線一階一階往上,是丘陵農作的樣子。 */
export function Farmland() {
  const p = paletteFor(useClock((st) => st.season));
  const geoms = useMemo(() => {
    const rand = rng(555);
    const paddy: THREE.BufferGeometry[] = [];
    const bund: THREE.BufferGeometry[] = [];

    let made = 0;
    let guard = 0;
    while (made < 130 && guard < 6000) {
      guard++;
      const z = (rand() - 0.5) * 330;
      const side = rand() < 0.5 ? -1 : 1;
      const off = 30 + rand() * 46;
      const x = meanderAt(z) + side * off;
      const h = terrainHeight(x, z);
      const s = slopeAt(x, z);
      if (h < 0.4 || h > 15) continue;
      if (s > 0.30) continue;                       // 太陡種不了
      if (valleyMask(x, z) < 0.10) continue;
      if (riverMask(x, z) > 0.35) continue;

      const w = 7 + rand() * 9;
      const d = 5 + rand() * 7;
      const yaw = (rand() - 0.5) * 0.8 + (side < 0 ? 0.2 : -0.2);

      // 田面 — 壓成薄片貼在地上,略低於地面免得邊緣浮起
      const g = new THREE.BoxGeometry(w, 0.16, d);
      g.applyMatrix4(new THREE.Matrix4().compose(
        new THREE.Vector3(x, h + 0.05, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
        new THREE.Vector3(1, 1, 1),
      ));
      paddy.push(g);

      // 田埂 — 四邊的土坎,梯田的辨識度全在這幾條線
      for (const [ox, oz, sw, sd] of [
        [0, d / 2, w, 0.42], [0, -d / 2, w, 0.42],
        [w / 2, 0, 0.42, d], [-w / 2, 0, 0.42, d],
      ] as const) {
        const b = new THREE.BoxGeometry(sw, 0.34, sd);
        const c = Math.cos(yaw); const sn = Math.sin(yaw);
        b.applyMatrix4(new THREE.Matrix4().compose(
          new THREE.Vector3(x + ox * c - oz * sn, h + 0.16, z + ox * sn + oz * c),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
          new THREE.Vector3(1, 1, 1),
        ));
        bund.push(b);
      }
      made++;
    }
    return {
      paddy: mergeGeometries(paddy, false),
      bund: mergeGeometries(bund, false),
    };
  }, []);

  return (
    <>
      {geoms.paddy && (
        <mesh geometry={geoms.paddy} receiveShadow>
          <meshStandardMaterial color={p.paddy} roughness={0.9} metalness={0.06} />
        </mesh>
      )}
      {geoms.bund && (
        <mesh geometry={geoms.bund} castShadow receiveShadow>
          <meshStandardMaterial color="#6a5b41" roughness={0.96} />
        </mesh>
      )}
    </>
  );
}

/**
 * 道路 — 沿河谷的主道 + 岔進山裡的小徑。
 * 用一串貼地的短段拼成,每段都採當地高度,所以路會跟著地形起伏。
 */
export function Roads() {
  const geom = useMemo(() => {
    const segs: THREE.BufferGeometry[] = [];

    const layPath = (
      points: Array<[number, number]>,
      width: number,
      steps = 6,
    ) => {
      for (let i = 0; i < points.length - 1; i++) {
        const [x0, z0] = points[i];
        const [x1, z1] = points[i + 1];
        for (let k = 0; k < steps; k++) {
          const t0 = k / steps;
          const t1 = (k + 1) / steps;
          const ax = x0 + (x1 - x0) * t0;
          const az = z0 + (z1 - z0) * t0;
          const bx = x0 + (x1 - x0) * t1;
          const bz = z0 + (z1 - z0) * t1;
          const mx = (ax + bx) / 2;
          const mz = (az + bz) / 2;
          const ya = terrainHeight(ax, az);
          const yb = terrainHeight(bx, bz);
          const run = Math.hypot(bx - ax, bz - az);
          const len = Math.hypot(run, yb - ya) * 1.16;
          const yaw = Math.atan2(bx - ax, bz - az);
          // 沿段的俯仰 — 少了這個,路在坡上就是一截截插進土裡的木板
          const pitch = Math.atan2(yb - ya, run);
          const g = new THREE.BoxGeometry(width, 0.34, len);
          g.applyMatrix4(new THREE.Matrix4().compose(
            new THREE.Vector3(mx, (ya + yb) / 2 + 0.02, mz),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, yaw, 0, 'YXZ')),
            new THREE.Vector3(1, 1, 1),
          ));
          segs.push(g);
        }
      }
    };

    // 主道 — 貼著河谷走,和河道保持一段距離
    const main: Array<[number, number]> = [];
    for (let z = -170; z <= 170; z += 8) main.push([meanderAt(z) + 15, z]);
    layPath(main, 3.6);

    // 對岸的次道
    const west: Array<[number, number]> = [];
    for (let z = -120; z <= 130; z += 10) west.push([meanderAt(z) - 17, z]);
    layPath(west, 2.6);

    // 兩條進山的小徑
    const rand = rng(31);
    for (const startZ of [-56, 42]) {
      const trail: Array<[number, number]> = [];
      let x = meanderAt(startZ) + 15;
      let z = startZ;
      for (let i = 0; i < 16; i++) {
        x += 5.5 + rand() * 3;
        z += (rand() - 0.5) * 9;
        trail.push([x, z]);
      }
      layPath(trail, 1.5, 4);
    }
    return mergeGeometries(segs, false);
  }, []);

  if (!geom) return null;
  return (
    <mesh geometry={geom} receiveShadow>
      <meshStandardMaterial color="#7d6f56" roughness={0.98} />
    </mesh>
  );
}
