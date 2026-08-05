import { useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { terrainHeight } from './field';
import { MARKET } from './sites';
import { skyFor, useClock } from './worldTime';

/**
 * 酒肆 — 唯一一棟能看見裡面的房子。
 *
 * 對話場景遲早要進室內,但整村的房子都掏空既貴又沒必要。
 * 做法是<b>屋頂單獨一個 mesh</b>:相機一靠近就淡出,露出裡面的席、案、酒甕與燈。
 * 其餘房子維持實心 —— 需要進去的時候再照這個樣子加。
 */

type Bucket = 'wood' | 'dark' | 'mud' | 'cloth' | 'clay' | 'paper';
type Parts = Record<Bucket, THREE.BufferGeometry[]>;
const empty = (): Parts => ({ wood: [], dark: [], mud: [], cloth: [], clay: [], paper: [] });

const MAT: Record<Bucket, THREE.MeshStandardMaterialParameters> = {
  wood: { color: '#6b3a26', roughness: 0.80 },
  dark: { color: '#3a251b', roughness: 0.85 },
  mud: { color: '#a08e70', roughness: 0.95 },
  cloth: { color: '#8c3a2a', roughness: 0.90 },
  clay: { color: '#5d4632', roughness: 0.86 },
  paper: { color: '#d9c79a', roughness: 0.88 },
};

function box(p: Parts, b: Bucket, sx: number, sy: number, sz: number,
             x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  g.applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(1, 1, 1)));
  p[b].push(g);
}
function cyl(p: Parts, b: Bucket, r1: number, r2: number, h: number, seg: number,
             x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.CylinderGeometry(r1, r2, h, seg);
  g.applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(1, 1, 1)));
  p[b].push(g);
}

const W = 9.4;
const D = 7.2;
const FH = 3.1;

export function Tavern() {
  const [cx, cz] = useMemo(() => [MARKET[0] + 7, MARKET[1] - 9], []);
  const gy = useMemo(() => terrainHeight(cx, cz) - 0.1, [cx, cz]);
  const { camera } = useThree();
  const roofRef = useRef<THREE.Mesh>(null);
  const [near, setNear] = useState(false);

  const hour = useClock((s) => s.hour);
  const season = useClock((s) => s.season);
  const weather = useClock((s) => s.weather);
  const sky = useMemo(() => skyFor(hour, season, weather), [hour, season, weather]);
  const lampLit = Math.max(0.12, 1 - sky.day * 1.35);

  /* ── 殼與內裝 ── */
  const shell = useMemo(() => {
    const p = empty();
    box(p, 'mud', W + 1.4, 0.5, D + 1.4, cx, gy + 0.25, cz);           // 台基
    box(p, 'mud', W, FH, 0.3, cx, gy + 0.5 + FH / 2, cz + D / 2);      // 後牆
    for (const s of [-1, 1]) {
      box(p, 'mud', 0.3, FH, D, cx + (s * W) / 2, gy + 0.5 + FH / 2, cz);
    }
    // 臨街面:兩根柱撐開,中間敞著(酒肆本來就開放)
    for (const s of [-1, 1]) {
      cyl(p, 'wood', 0.18, 0.20, FH, 8, cx + s * 3.0, gy + 0.5 + FH / 2, cz - D / 2);
    }
    box(p, 'wood', W + 0.4, 0.32, 0.3, cx, gy + 0.5 + FH - 0.2, cz - D / 2);  // 額枋
    // 地板
    box(p, 'wood', W - 0.4, 0.12, D - 0.4, cx, gy + 0.56, cz);

    // ── 內裝 ──
    for (let i = 0; i < 3; i++) {                                      // 三張矮案
      const tx = cx - 2.8 + i * 2.8;
      const tz = cz + 0.6;
      box(p, 'wood', 1.7, 0.12, 1.0, tx, gy + 1.02, tz);
      for (const [ox, oz] of [[-0.7, -0.36], [0.7, -0.36], [-0.7, 0.36], [0.7, 0.36]] as const) {
        cyl(p, 'dark', 0.06, 0.06, 0.44, 5, tx + ox, gy + 0.78, tz + oz);
      }
      for (const s of [-1, 1]) {                                       // 兩側坐席
        box(p, 'cloth', 1.5, 0.10, 0.7, tx, gy + 0.66, tz + s * 1.1);
      }
      box(p, 'paper', 0.22, 0.26, 0.22, tx + 0.5, gy + 1.21, tz);      // 案上的碗
    }
    box(p, 'wood', 3.6, 1.05, 0.7, cx + 2.6, gy + 1.09, cz + D / 2 - 0.9);   // 櫃檯
    for (let i = 0; i < 4; i++) {                                      // 酒甕
      cyl(p, 'clay', 0.34, 0.26, 0.72, 10,
        cx - 3.4 + i * 0.85, gy + 0.92, cz + D / 2 - 0.75);
    }
    box(p, 'cloth', 2.2, 1.5, 0.06, cx - 3.2, gy + 2.5, cz - D / 2 + 0.2);   // 招幌

    const out: Array<{ k: Bucket; g: THREE.BufferGeometry }> = [];
    (Object.keys(p) as Bucket[]).forEach((k) => {
      if (!p[k].length) return;
      const g = mergeGeometries(p[k], false);
      if (g) { g.computeVertexNormals(); out.push({ k, g }); }
    });
    return out;
  }, [cx, cz, gy]);

  /* ── 屋頂:單獨一件,才能淡出 ── */
  const roof = useMemo(() => {
    const p = empty();
    const topY = gy + 0.5 + FH;
    const eave = 0.7;
    const halfD = D / 2 + eave;
    const ridgeY = topY + halfD * 0.5;
    const slope = Math.hypot(halfD, ridgeY - topY);
    const ang = Math.atan2(ridgeY - topY, halfD);
    for (const s of [-1, 1]) {
      box(p, 'dark', W + eave * 2, 0.16, slope, cx, (topY + ridgeY) / 2,
        cz + (s * halfD) / 2, s * ang, 0, 0);
      const n = Math.round(W / 0.42);
      for (let i = 0; i < n; i++) {
        cyl(p, 'dark', 0.075, 0.075, slope * 0.97, 5,
          cx - (W + eave * 1.6) / 2 + ((W + eave * 1.6) * (i + 0.5)) / n,
          (topY + ridgeY) / 2 + 0.10, cz + (s * halfD) / 2,
          Math.PI / 2 + s * ang, 0, 0);
      }
    }
    box(p, 'wood', W + eave * 2.1, 0.24, 0.26, cx, ridgeY + 0.11, cz);
    box(p, 'wood', W + eave * 2.2, 0.14, D + eave * 2.2, cx, topY - 0.06, cz);
    const gs = [...p.dark, ...p.wood];
    const g = mergeGeometries(gs, false)!;
    g.computeVertexNormals();
    return g;
  }, [cx, cz, gy]);

  useFrame(() => {
    const d = camera.position.distanceTo(new THREE.Vector3(cx, gy + 2, cz));
    const want = d < 26;
    if (want !== near) setNear(want);
    const m = roofRef.current?.material as THREE.MeshStandardMaterial | undefined;
    if (m) {
      const target = want ? 0.06 : 1;
      m.opacity += (target - m.opacity) * 0.09;      // 淡出要慢一點,別一閃
      m.transparent = m.opacity < 0.99;
      m.depthWrite = m.opacity > 0.5;
    }
  });

  return (
    <group>
      {shell.map(({ k, g }) => (
        <mesh key={k} geometry={g} castShadow receiveShadow>
          <meshStandardMaterial {...MAT[k]} />
        </mesh>
      ))}
      <mesh ref={roofRef} geometry={roof} castShadow>
        <meshStandardMaterial color="#3a4249" roughness={0.72} transparent opacity={1} />
      </mesh>
      {/* 屋裡的燈 — 天暗了才亮,近看時是這間屋的主光 */}
      <group position={[cx, gy + 2.35, cz + 0.4]}>
        <pointLight color="#ffb257" intensity={lampLit * 14} distance={13} decay={1.6} />
        <mesh>
          <sphereGeometry args={[0.22, 10, 8]} />
          <meshBasicMaterial color="#ffcf90" toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}
