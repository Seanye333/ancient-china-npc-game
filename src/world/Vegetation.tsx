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

/**
 * 擋在你和鏡頭之間的樹要讓開。
 *
 * 林子裡打起來的時候,鏡頭繞到哪一邊都在某棵樹的樹冠裡 —— 求解器把每一段
 * 梯級都試過,最後只能貼到後腦勺上,畫面仍舊是一整片綠。這不是求解器不夠
 * 聰明,是<b>那個位置根本不存在</b>:人站在樹底下,六步之內全是葉子。
 *
 * 第一版按「離鏡頭多近就多淡」篩,結果兩頭不討好:調小了擋在中間的那棵樹
 * 照樣糊住主角,調大了在林子裡走路整片林子跟著你融化。
 * 真正該問的不是<b>離鏡頭多近</b>,而是<b>擋不擋著你</b> ——
 * 所以判斷改成一根從鏡頭指向主角的圓柱:落在柱子裡的像素才篩掉,
 * 旁邊的樹一片葉子都不會少。
 *
 * 樹還在、影子還在、擋人擋鏡頭的規則都不變,只是視線上那幾片葉子退開。
 */
const SIGHT_R = 1.5;          // 視線圓柱的半徑,再往外一倍羽化回實心

/** 每一份編譯過的樹材質 —— 每幀要把主角在視空間的位置餵給它們。 */
const fadeShaders: Array<{ uniforms: Record<string, { value: unknown }> }> = [];

/**
 * 告訴植被「主角在鏡頭的哪個方向、多遠」。由 Player 每幀呼叫 ——
 * 那裡本來就在解算鏡頭,位置與矩陣都是現成的。
 */
export function setSightTarget(viewSpacePlayer: THREE.Vector3) {
  for (const s of fadeShaders) {
    (s.uniforms.uSight.value as THREE.Vector3).copy(viewSpacePlayer);
  }
}

const applyNearFade = (m: THREE.Material | null) => {
  if (!m || m.userData.nearFade) return;
  m.userData.nearFade = true;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSight = { value: new THREE.Vector3(0, 0, -6) };
    shader.uniforms.uSightR = { value: SIGHT_R };
    fadeShaders.push(shader as unknown as { uniforms: Record<string, { value: unknown }> });
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vViewPos;\nvoid main() {')
      // project_vertex 這一段裡才有 mvPosition(而且已經乘過 instanceMatrix)
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n  vViewPos = mvPosition.xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        'varying vec3 vViewPos;\nuniform vec3 uSight;\nuniform float uSightR;\nvoid main() {',
      )
      .replace('#include <clipping_planes_fragment>', `
        #include <clipping_planes_fragment>
        {
          float len = length(uSight);
          vec3 dir = uSight / max(len, 0.001);
          float along = dot(vViewPos, dir);
          // 只管鏡頭與主角<b>之間</b>那一段;主角背後的樹是背景,不該動
          if (along > 0.05 && along < len) {
            float radial = length(vViewPos - dir * along);
            // 圓柱心最透,一倍半徑外羽化回實心 —— 免得邊緣切出一個硬圓洞
            float keep = smoothstep(uSightR, uSightR * 2.0, radial);
            // 有序抖動而不是整棵樹忽然不見 —— 一格一格篩掉才不會「啪」一下
            mat4 bayer = mat4(
               0.0,  8.0,  2.0, 10.0,
              12.0,  4.0, 14.0,  6.0,
               3.0, 11.0,  1.0,  9.0,
              15.0,  7.0, 13.0,  5.0) / 16.0;
            float th = bayer[int(mod(gl_FragCoord.x, 4.0))][int(mod(gl_FragCoord.y, 4.0))];
            if (keep < th) discard;
          }
        }
      `);
  };
  m.needsUpdate = true;
};

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
        <meshStandardMaterial color="#3a2c20" roughness={0.94} ref={applyNearFade} />
      </instancedMesh>
      <instancedMesh ref={crown} args={[undefined, undefined, items.length]} castShadow>
        <coneGeometry args={[1.05, 3.6, 7]} />
        <meshStandardMaterial color={p.conifer} roughness={0.9} ref={applyNearFade} />
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
        <meshStandardMaterial color="#42311f" roughness={0.94} ref={applyNearFade} />
      </instancedMesh>
      <instancedMesh ref={crown} args={[undefined, undefined, items.length]} castShadow>
        <icosahedronGeometry args={[1.55, 0]} />
        <meshStandardMaterial color={p.broadleaf} roughness={0.88} flatShading ref={applyNearFade} />
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
        <meshStandardMaterial color="#6d7a3a" roughness={0.86} ref={applyNearFade} />
      </instancedMesh>
      <instancedMesh ref={leaf} args={[undefined, undefined, items.length]} castShadow>
        <coneGeometry args={[0.62, 1.9, 5]} />
        <meshStandardMaterial color={p.bamboo} roughness={0.88} flatShading ref={applyNearFade} />
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
        <meshStandardMaterial color="#4a3826" roughness={0.94} ref={applyNearFade} />
      </instancedMesh>
      <instancedMesh ref={crown} args={[undefined, undefined, items.length]} castShadow>
        <sphereGeometry args={[1.45, 8, 6]} />
        <meshStandardMaterial color={p.willow} roughness={0.9} flatShading ref={applyNearFade} />
      </instancedMesh>
    </>
  );
}
