import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  terrainHeight, slopeAt, valleyMask, riverMask, humanMask, rng, WATER_Y,
  registerBlockers, clearBlockers,
} from './field';
import { paletteFor, useClock } from './worldTime';
import { useBands } from '../game/bands';

/**
 * 植被 — 全部走 InstancedMesh。
 *
 * 幾千棵樹如果各自一個 mesh,draw call 會先炸掉;既有專案在大地圖上踩過
 * 這個坑(卡頓的真因是 draw call 不是三角形數)。這裡一個樹種一個
 * InstancedMesh,總共四次 draw call 種滿整座山。
 */

type Placement = { x: number; z: number; y: number; s: number; r: number };

/**
 * 賊窩周圍是空地 —— 柵欄和柴火都是就地砍的樹。
 *
 * 這條規律順帶解決一個畫面問題:打起來的時候鏡頭最怕頭頂有樹冠。
 * 營地本來就該是一片開闊地,不必為了鏡頭去特別開洞。
 */
function inClearing(x: number, z: number): boolean {
  for (const b of useBands.getState().bands) {
    if (Math.hypot(b.x - x, b.z - z) < 11) return true;
  }
  return false;
}

/** 位置雜湊 — 用來在人跡帶裡穩定地留下極少數老樹,而不是整片砍光。 */
function rngGate(x: number, z: number): number {
  const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return h - Math.floor(h);
}

function scatter(seed: number, count: number, pick: (x: number, z: number) => number | null) {
  const rand = rng(seed);
  const out: Placement[] = [];
  let guard = 0;
  while (out.length < count && guard < count * 40) {
    guard++;
    const x = (rand() - 0.5) * 470;
    const z = (rand() - 0.5) * 470;
    const s = pick(x, z);
    if (s === null) continue;
    if (inClearing(x, z)) continue;
    out.push({
      x,
      z,
      y: terrainHeight(x, z),
      s: s * (0.72 + rand() * 0.62),
      r: rand() * Math.PI * 2,
    });
  }
  return out;
}

function useInstances(
  items: Placement[],
  yOffset: (p: Placement) => number,
) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    items.forEach((p, i) => {
      pos.set(p.x, p.y + yOffset(p), p.z);
      q.setFromAxisAngle(up, p.r);
      scl.set(p.s, p.s, p.s);
      m.compose(pos, q, scl);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items, yOffset]);
  return ref;
}

/**
 * 把這批樹登記成障礙 —— 樹幹擋人,樹冠擋鏡頭。
 *
 * 半徑跟著每棵樹的縮放走:一棵矮松和一棵老樟不該擋一樣寬。
 * 竹與蘆葦不登記 —— 竹竿細到攔不住人,整片登記就變成一堵牆了。
 */
function useBlockers(
  key: string, items: Placement[], solid: number, view: number, top: number,
) {
  useEffect(() => {
    registerBlockers(key, items.map((p) => ({
      x: p.x, z: p.z, solid: solid * p.s, view: view * p.s, top: p.y + top * p.s,
    })));
    return () => clearBlockers(key);
  }, [key, items, solid, view, top]);
}

/** 針葉林 — 山坡的主力。太陡不長,谷地讓給闊葉。 */
export function Conifers() {
  const p = paletteFor(useClock((s) => s.season));
  const items = useMemo(
    () =>
      scatter(1337, 2600, (x, z) => {
        const h = terrainHeight(x, z);
        if (h < 2.5 || h > 34) return null;
        if (slopeAt(x, z) > 0.62) return null;
        if (valleyMask(x, z) > 0.45) return null;
        if (humanMask(x, z) > 0.25) return null;
        return 1.5 + (1 - Math.min(1, h / 34)) * 1.1;
      }),
    [],
  );
  const trunk = useInstances(items, () => 0.55);
  useBlockers('conifer', items, 0.17, 0.80, 4.15);
  const crown = useInstances(items, () => 2.35);
  return (
    <>
      <instancedMesh ref={trunk} args={[undefined, undefined, items.length]} castShadow>
        <cylinderGeometry args={[0.13, 0.19, 1.2, 5]} />
        <meshStandardMaterial color="#3a2c20" roughness={0.94} />
      </instancedMesh>
      <instancedMesh ref={crown} args={[undefined, undefined, items.length]} castShadow>
        <coneGeometry args={[1.05, 3.6, 7]} />
        <meshStandardMaterial color={p.conifer} roughness={0.9} />
      </instancedMesh>
    </>
  );
}

/** 闊葉 — 谷地與緩坡,樹冠偏黃綠,和針葉拉開層次。 */
export function BroadLeaf() {
  const p = paletteFor(useClock((s) => s.season));
  const items = useMemo(
    () =>
      scatter(4242, 1500, (x, z) => {
        const h = terrainHeight(x, z);
        if (h < -0.4 || h > 13) return null;
        if (slopeAt(x, z) > 0.42) return null;
        if (riverMask(x, z) > 0.55) return null;
        const hm = humanMask(x, z);
        if (hm > 0.20 && rngGate(x, z) > 0.12) return null;
        return 1.35;
      }),
    [],
  );
  const trunk = useInstances(items, () => 0.75);
  useBlockers('broadleaf', items, 0.20, 1.30, 3.80);
  const crown = useInstances(items, () => 2.25);
  return (
    <>
      <instancedMesh ref={trunk} args={[undefined, undefined, items.length]} castShadow>
        <cylinderGeometry args={[0.16, 0.24, 1.7, 5]} />
        <meshStandardMaterial color="#42311f" roughness={0.94} />
      </instancedMesh>
      <instancedMesh ref={crown} args={[undefined, undefined, items.length]} castShadow>
        <icosahedronGeometry args={[1.55, 0]} />
        <meshStandardMaterial color={p.broadleaf} roughness={0.88} flatShading />
      </instancedMesh>
    </>
  );
}

/** 河岸的蘆葦 — 貼著水邊那一圈,補上生態的過渡。 */
export function Reeds() {
  const p = paletteFor(useClock((s) => s.season));
  const items = useMemo(
    () =>
      scatter(909, 2200, (x, z) => {
        const r = riverMask(x, z);
        if (r < 0.26 || r > 0.62) return null;
        if (terrainHeight(x, z) < WATER_Y - 0.15) return null;
        if (slopeAt(x, z) > 0.30) return null;
        return 0.75;
      }),
    [],
  );
  const ref = useInstances(items, () => 0.5);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]}>
      <coneGeometry args={[0.30, 1.5, 4]} />
      <meshStandardMaterial color={p.reed} roughness={0.95} />
    </instancedMesh>
  );
}

/** 岩塊 — 陡坡與山脊,讓山不只是一層皮。 */
export function Rocks() {
  const p = paletteFor(useClock((s) => s.season));
  const items = useMemo(
    () =>
      scatter(77, 900, (x, z) => {
        const h = terrainHeight(x, z);
        const s = slopeAt(x, z);
        if (h < 4 || s < 0.45) return null;
        return 0.9 + s * 1.5;
      }),
    [],
  );
  const ref = useInstances(items, () => 0.2);
  useBlockers('rock', items, 0.52, 0.85, 1.10);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} castShadow receiveShadow>
      <dodecahedronGeometry args={[0.9, 0]} />
      <meshStandardMaterial color={p.rock} roughness={0.95} flatShading />
    </instancedMesh>
  );
}

/** 竹林 — 河岸與谷坡的成片細竿,和針葉/闊葉拉出第三種林相。 */
export function Bamboo() {
  const p = paletteFor(useClock((s) => s.season));
  const items = useMemo(
    () =>
      scatter(5150, 2400, (x, z) => {
        const h = terrainHeight(x, z);
        const r = riverMask(x, z);
        if (h < 0.2 || h > 9) return null;
        if (slopeAt(x, z) > 0.34) return null;
        if (valleyMask(x, z) < 0.35) return null;
        if (r > 0.62) return null;
        if (humanMask(x, z) > 0.55) return null;
        return 1.0;
      }),
    [],
  );
  const culm = useInstances(items, () => 2.1);
  const leaf = useInstances(items, () => 4.15);
  return (
    <>
      <instancedMesh ref={culm} args={[undefined, undefined, items.length]} castShadow>
        <cylinderGeometry args={[0.05, 0.07, 4.2, 5]} />
        <meshStandardMaterial color="#6d7a3a" roughness={0.86} />
      </instancedMesh>
      <instancedMesh ref={leaf} args={[undefined, undefined, items.length]} castShadow>
        <coneGeometry args={[0.62, 1.9, 5]} />
        <meshStandardMaterial color={p.bamboo} roughness={0.88} flatShading />
      </instancedMesh>
    </>
  );
}

/** 柳 — 只長在水邊,樹冠壓扁下垂,是河岸的標誌。 */
export function Willows() {
  const p = paletteFor(useClock((s) => s.season));
  const items = useMemo(
    () =>
      scatter(6060, 240, (x, z) => {
        const r = riverMask(x, z);
        // 0.42~0.90 是河心不是河岸 —— 第一版照這個種,柳樹全浮在水面上
        if (r < 0.17 || r > 0.44) return null;
        if (terrainHeight(x, z) < WATER_Y + 0.35) return null;
        if (slopeAt(x, z) > 0.26) return null;
        return 0.95;
      }),
    [],
  );
  const trunk = useInstances(items, () => 1.05);
  useBlockers('willow', items, 0.28, 1.35, 4.00);
  const crown = useInstances(items, () => 2.55);
  return (
    <>
      <instancedMesh ref={trunk} args={[undefined, undefined, items.length]} castShadow>
        <cylinderGeometry args={[0.18, 0.30, 2.4, 6]} />
        <meshStandardMaterial color="#4a3826" roughness={0.94} />
      </instancedMesh>
      <instancedMesh ref={crown} args={[undefined, undefined, items.length]} castShadow>
        <sphereGeometry args={[1.45, 8, 6]} />
        <meshStandardMaterial color={p.willow} roughness={0.9} flatShading />
      </instancedMesh>
    </>
  );
}
