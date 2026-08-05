import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { terrainHeight, rng, WATER_Y } from './field';

/**
 * Q 版角色 — 把 Blender 那套造型語言搬進 three.js。
 *
 * 身體與頭仍然是<b>旋轉體剖線</b>(three 內建 LatheGeometry),所以肩、腰、
 * 下襬的轉折跟先前一致;眼睛仍是黑眼眶包虹膜再疊高光的疊片。
 *
 * 但這裡的重點不是像不像,是<b>比例對不對</b>:人站進去之後,
 * 房子、橋、田的尺度才有參照。角色一律合併進材質桶,三十個人五次 draw call。
 */

type Bucket = 'skin' | 'robe' | 'hair' | 'ink' | 'trim';
type Parts = Record<Bucket, THREE.BufferGeometry[]>;

const empty = (): Parts => ({ skin: [], robe: [], hair: [], ink: [], trim: [] });

const PALETTE: Record<Bucket, THREE.MeshStandardMaterialParameters> = {
  skin: { color: '#e8b494', roughness: 0.62 },
  robe: { color: '#4a6b52', roughness: 0.78 },
  hair: { color: '#241e26', roughness: 0.62 },
  ink: { color: '#161018', roughness: 0.42 },
  trim: { color: '#b8863c', roughness: 0.55, metalness: 0.25 },
};

// 剖線和 Blender v5/v6 那版同一組 — 圓潤路線的體塊語言
const HEAD_P: Array<[number, number]> = [
  [0.00, -1.00], [0.30, -0.94], [0.56, -0.80], [0.78, -0.58], [0.92, -0.30],
  [1.00, 0.02], [1.00, 0.34], [0.93, 0.62], [0.72, 0.84], [0.40, 0.96], [0.00, 1.00],
];
const BODY_P: Array<[number, number]> = [
  [1.00, 0.00], [0.96, 0.10], [0.86, 0.34], [0.76, 0.55],
  [0.86, 0.72], [0.94, 0.88], [0.86, 0.97], [0.36, 1.00],
];
const SLEEVE_P: Array<[number, number]> = [
  [0.48, 0.00], [0.42, 0.26], [0.35, 0.66], [0.32, 0.92], [0.26, 1.00],
];

function lathe(profile: Array<[number, number]>, rScale: number, hScale: number, seg = 14) {
  const pts = profile.map(([r, h]) => new THREE.Vector2(Math.max(1e-4, r * rScale), h * hScale));
  return new THREE.LatheGeometry(pts, seg);
}

function put(parts: Parts, b: Bucket, g: THREE.BufferGeometry,
             px: number, py: number, pz: number,
             yaw = 0, sx = 1, sy = 1, sz = 1) {
  g.applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3(px, py, pz),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
    new THREE.Vector3(sx, sy, sz),
  ));
  parts[b].push(g);
}

/** 一個人。H = 視覺身高(公尺);Q 版頭身比約 1:2.2。 */
function person(parts: Parts, x: number, z: number, ground: number, yaw: number,
                H: number, rand: () => number) {
  const hr = H * 0.245;                       // 頭半徑
  const bodyH = H - hr * 1.85;
  const headY = ground + bodyH + hr * 0.84;

  put(parts, 'robe', lathe(BODY_P, hr * 1.02, bodyH, 16), x, ground, z, yaw);
  // 腰帶
  put(parts, 'trim', new THREE.TorusGeometry(hr * 0.78, hr * 0.10, 6, 14),
      x, ground + bodyH * 0.55, z, yaw, 1, 1, 0.7);
  // 兩袖 + 手
  for (const side of [-1, 1]) {
    const sg = lathe(SLEEVE_P, hr, bodyH * 0.54, 10);
    put(parts, 'robe', sg, x + Math.cos(yaw) * side * hr * 0.80,
        ground + bodyH * 0.34, z + Math.sin(yaw) * side * hr * 0.80, yaw);
    put(parts, 'skin', new THREE.SphereGeometry(hr * 0.15, 8, 6),
        x + Math.cos(yaw) * side * hr * 0.92,
        ground + bodyH * 0.32, z + Math.sin(yaw) * side * hr * 0.92, yaw);
  }
  // 脖子與頭
  put(parts, 'skin', new THREE.CylinderGeometry(hr * 0.32, hr * 0.32, hr * 0.36, 10),
      x, ground + bodyH * 0.99, z, yaw);
  put(parts, 'skin', lathe(HEAD_P, hr, hr, 18), x, headY, z, yaw, 1, 1, 0.94);

  // ── 五官 ── 全部貼在臉面外側,埋進臉裡就只剩兩顆豆子(Blender 那邊踩過)
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  const face = hr * 0.99;
  const eyeY = headY - hr * 0.10;
  const eyeR = hr * 0.26;
  for (const side of [-1, 1]) {
    const ex = x + rx * side * hr * 0.43 + fx * face;
    const ez = z + rz * side * hr * 0.43 + fz * face;
    put(parts, 'ink', new THREE.SphereGeometry(eyeR * 1.08, 12, 8), ex, eyeY, ez,
        yaw, 1, 1.10, 0.22);
    put(parts, 'trim', new THREE.SphereGeometry(eyeR * 0.42, 8, 6),
        ex + fx * hr * 0.10, eyeY + hr * 0.10, ez + fz * hr * 0.10, yaw, 1, 1, 0.3);
  }
  // 髮 — 扣在頭頂的扁球冠 + 髮髻
  put(parts, 'hair', new THREE.SphereGeometry(hr * 1.13, 14, 10),
      x + fx * hr * 0.06, headY + hr * 0.30, z + fz * hr * 0.06, yaw, 1, 1, 0.42);
  put(parts, 'hair', new THREE.SphereGeometry(hr * 0.30, 10, 8),
      x - fx * hr * 0.30, headY + hr * 1.16, z - fz * hr * 0.30, yaw);
  if (rand() < 0.45) {                        // 一部分人戴笠
    put(parts, 'trim', new THREE.ConeGeometry(hr * 1.70, hr * 0.62, 12),
        x, headY + hr * 0.86, z, yaw);
  }
}

const meanderAt = (z: number) => Math.sin(z * 0.02) * 9 + Math.sin(z * 0.047) * 3.5;

export function Characters() {
  const merged = useMemo(() => {
    const parts = empty();
    const rand = rng(31337);

    // 人要站在有意義的地方 — 路上、橋頭、埠邊、田裡、村口
    const spots: Array<[number, number, number]> = [];
    for (let i = 0; i < 26; i++) {            // 沿主道
      const z = -150 + i * 12 + (rand() - 0.5) * 5;
      spots.push([meanderAt(z) + 15 + (rand() - 0.5) * 2.6, z, rand() * Math.PI * 2]);
    }
    for (let i = 0; i < 7; i++) {             // 橋上
      spots.push([meanderAt(6) - 9 + i * 3.1, 6 + (rand() - 0.5) * 1.4, Math.PI / 2]);
    }
    for (const dz of [-46, 78]) {             // 兩個碼頭
      for (let i = 0; i < 3; i++) {
        spots.push([meanderAt(dz) + 3.4 + rand() * 3.4, dz + (rand() - 0.5) * 2.2,
                    rand() * Math.PI * 2]);
      }
    }
    for (let i = 0; i < 12; i++) {            // 田裡
      const z = (rand() - 0.5) * 240;
      const side = rand() < 0.5 ? -1 : 1;
      spots.push([meanderAt(z) + side * (32 + rand() * 30), z, rand() * Math.PI * 2]);
    }

    const bridgeY = terrainHeight(meanderAt(6), 6) + 2.51;
    for (const [x, z, yaw] of spots) {
      // 橋要先判斷 —— 橋跨在河床上,河床低於 -0.5,
      // 先跑「別站在水裡」那道檢查會把橋上的人全濾掉(第一版就是這樣)
      const onBridge = Math.abs(z - 6) < 2.4 && Math.abs(x - meanderAt(6)) < 12.5;
      const g = terrainHeight(x, z);
      if (!onBridge && g < WATER_Y + 0.25) continue;
      person(parts, x, z, onBridge ? bridgeY : g, yaw, 1.24 + rand() * 0.22, rand);
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
      {merged.map(({ key, geom }) => (
        <mesh key={`ch-${key}`} geometry={geom} castShadow receiveShadow>
          <meshStandardMaterial {...PALETTE[key]} />
        </mesh>
      ))}
    </>
  );
}
