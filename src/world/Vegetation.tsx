import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  terrainHeight, slopeAt, valleyMask, riverMask, humanMask, rng, WATER_Y,
  registerBlockers, clearBlockers,
} from './field';
import { paletteFor, useClock } from './worldTime';
import { jitteredColor, rngGate } from './palette';
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
// 視線圓柱的半徑。只要露得出人就夠 —— 半徑越大,挖掉的樹冠越多,
// 羽化帶上的殘點雲也越大(近處一棵樹冠佔半個屏幕,殘點就是滿牆霉斑)
const SIGHT_R = 1.15;

/** 每一份編譯過的樹材質 —— 每幀要把主角在視空間的位置餵給它們。 */
const fadeShaders: Array<{ uniforms: Record<string, { value: unknown }> }> = [];
/** 會搖的那些 —— 每幀餵時間與風力。 */
const windShaders: Array<{ uniforms: Record<string, { value: unknown }> }> = [];

/**
 * 告訴植被「主角在鏡頭的哪個方向、多遠」。由 Player 每幀呼叫 ——
 * 那裡本來就在解算鏡頭,位置與矩陣都是現成的。
 */
export function setSightTarget(viewSpacePlayer: THREE.Vector3) {
  for (const s of fadeShaders) {
    (s.uniforms.uSight.value as THREE.Vector3).copy(viewSpacePlayer);
  }
}

/** 風 —— App 每幀餵。世界不搖的時候是一張剪紙,搖起來才是林子。 */
export function setFoliageWind(time: number, strength: number) {
  for (const s of windShaders) {
    (s.uniforms.uTime as { value: number }).value = time;
    (s.uniforms.uWind as { value: number }).value = strength;
  }
}

/**
 * 植被材質的兩件事:視線讓路(fade)與隨風搖(sway)。
 *
 * 搖在<b>局部空間</b>做(begin_vertex 之後、instanceMatrix 之前),
 * 相位從 instanceMatrix 的平移抽 —— 同一片林子每棵樹各搖各的,
 * 不然整座山像一塊果凍。幅度由底到梢漸強(smoothstep lo→hi):
 * 樹幹不動,動的是冠;蘆葦整根伏。陰影貼圖沒跟著搖 —— 幅度小,看不出。
 */
const applyFoliage = (fade: boolean, sway: number, lo: number, hi: number) =>
  (m: THREE.Material | null) => {
  if (!m || m.userData.foliage) return;
  m.userData.foliage = true;
  m.onBeforeCompile = (shader) => {
    if (sway > 0) {
      shader.uniforms.uTime = { value: 0 };
      shader.uniforms.uWind = { value: 0.7 };
      shader.uniforms.uSway = { value: sway };
      shader.uniforms.uSwayLo = { value: lo };
      shader.uniforms.uSwayHi = { value: hi };
      windShaders.push(shader as unknown as { uniforms: Record<string, { value: unknown }> });
      shader.vertexShader = shader.vertexShader
        .replace(
          'void main() {',
          'uniform float uTime;\nuniform float uWind;\nuniform float uSway;\n'
          + 'uniform float uSwayLo;\nuniform float uSwayHi;\nvoid main() {',
        )
        .replace('#include <begin_vertex>', `
          #include <begin_vertex>
          {
            #ifdef USE_INSTANCING
              vec2 iwp = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
            #else
              vec2 iwp = vec2(0.0);
            #endif
            float ph = iwp.x * 0.37 + iwp.y * 0.29;
            float k = uSway * uWind * smoothstep(uSwayLo, uSwayHi, transformed.y);
            transformed.x += (sin(uTime * 1.7 + ph) + 0.5 * sin(uTime * 3.1 + ph * 1.7)) * k;
            transformed.z += cos(uTime * 1.35 + ph * 1.3) * k * 0.7;
          }
        `);
    }
    if (!fade) { m.needsUpdate = true; return; }
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
            /*
             * 讓路的形狀是<b>圓錐不是圓柱</b> —— 比的是張角,不是公尺。
             *
             * 第一版是一根從鏡頭伸到主角、半徑固定的圓柱。毛病出在
             * 「同樣粗的柱子,離鏡頭越近佔的畫面越大」:一棵樹冠貼到鏡頭上時,
             * 那根 1.15 公尺的柱子橫跨大半個畫面,連羽化帶都有幾百像素寬 ——
             * 於是眼前糊著一大團顆粒,讀起來不像葉子讓開,像螢幕發霉。
             *
             * 改成比張角以後,挖掉的洞在畫面上永遠只有主角那麼大。
             * 這本來就是這個機制要的:讓得出人就夠,多挖的每一分都是白挖。
             * 羽化帶跟著變成固定的幾十像素,顆粒帶也就窄了。
             * 上限 0.55 弧度是防身用的 —— 鏡頭被逼到貼著主角時 len 很小,
             * 不封頂的話張角會炸開,整片林子跟著融化。
             */
            float want = min(uSightR / len, 0.55);
            float ang = radial / max(along, 0.05);
            // 羽化帶收到 15%:張角化以後這條帶子在畫面上是固定寬度,
            // 收窄不會再像圓柱那樣「近處整片糊掉」,顆粒雲也就只剩一圈細邊
            float keep = smoothstep(want, want * 1.15, ang);
            // 抖動篩掉而不是整棵樹忽然不見。閾值用位置雜湊(噪點)而不是
            // Bayer 棋盤格 —— 規則格子在大面積半透上是滿屏網紋,
            // 噪點在同樣的覆蓋率下讀作「顆粒」,眼睛會把它當材質而不是故障。
            // 顆粒取 2×2 像素一格:單像素的殘點糊在牆上像長霉,
            // 粗一號的顆粒才讀得出「這是葉子讓開了」。
            float th = fract(sin(dot(floor(gl_FragCoord.xy / 2.0), vec2(12.9898, 78.233))) * 43758.5453);
            if (keep < th * 0.996) discard;
          }
        }
      `);
  };
  m.needsUpdate = true;
};

/** 樹幹只讓路不搖;各樹種的冠按自己的身量搖 —— 竹最軟,蘆葦整根伏。 */
const applyNearFade = applyFoliage(true, 0, 0, 0);
const coniferSway = applyFoliage(true, 0.07, -1.6, 1.8);
const broadSway = applyFoliage(true, 0.06, -1.2, 1.6);
const willowSway = applyFoliage(true, 0.065, -1.1, 1.2);
const bambooLeafSway = applyFoliage(true, 0.10, -0.9, 0.95);
const bambooCulmSway = applyFoliage(true, 0.045, -2.1, 2.1);
const reedSway = applyFoliage(false, 0.10, -0.75, 0.75);

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

function useInstanceColors(
  ref: RefObject<THREE.InstancedMesh | null>,
  items: Placement[],
  colorOf: (p: Placement) => THREE.Color,
) {
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((p, i) => mesh.setColorAt(i, colorOf(p)));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // colorOf 換季會換一個新函式進來 —— 依賴收它,不收每個顏色
  }, [ref, items, colorOf]);
}

/**
 * 闊葉/柳樹的樹冠 —— 三團錯開的多面體合併成<b>一份</b>幾何。
 *
 * 單顆 icosahedron 遠看是樹,近看是一塊滾石:二十個大平面貼著鏡頭,
 * 加上秋季的褐色,截圖裡整個村子像堆滿了土堆。三團錯開以後輪廓
 * 有了凹進去的地方,眼睛才肯把它讀成「葉子疊出來的」。
 * 合併成一份 BufferGeometry,InstancedMesh 照舊一次畫完 —— 面數 ×3,
 * draw call ×1,這筆帳怎麼算都划算。
 */
const broadCrownGeom = mergeGeometries([
  new THREE.IcosahedronGeometry(1.30, 0).translate(0, 0.22, 0),
  new THREE.IcosahedronGeometry(0.92, 0).rotateY(0.9).translate(0.78, -0.30, 0.30),
  new THREE.IcosahedronGeometry(0.84, 0).rotateY(2.1).translate(-0.62, -0.34, -0.48),
], false)!;

const willowCrownGeom = mergeGeometries([
  new THREE.SphereGeometry(1.30, 7, 5).scale(1, 0.72, 1),
  new THREE.SphereGeometry(0.85, 6, 5).scale(1, 0.62, 1).translate(0.95, -0.42, 0.25),
  new THREE.SphereGeometry(0.80, 6, 5).scale(1, 0.60, 1).translate(-0.80, -0.48, -0.40),
], false)!;

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
  const colorOf = useMemo(
    () => (q: Placement) => jitteredColor(p.conifer, q.x, q.z, 0.012, 0.10, 0.09),
    [p],
  );
  useInstanceColors(crown, items, colorOf);
  return (
    <>
      <instancedMesh ref={trunk} args={[undefined, undefined, items.length]} castShadow>
        <cylinderGeometry args={[0.13, 0.19, 1.2, 5]} />
        <meshStandardMaterial color="#3a2c20" roughness={0.94} ref={applyNearFade} />
      </instancedMesh>
      <instancedMesh ref={crown} args={[undefined, undefined, items.length]} castShadow>
        <coneGeometry args={[1.05, 3.6, 7]} />
        <meshStandardMaterial color="#ffffff" roughness={0.9} ref={coniferSway} />
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
  const season = useClock((s) => s.season);
  const colorOf = useMemo(() => {
    // 秋林不是一種顏色 —— 金、鏽、赭、殘綠雜在一起才是「層林盡染」。
    // 原本整片 #8a6326,截圖裡讀作一村子的土堆;哪棵樹拿哪個色用位置
    // 雜湊定,同一棵樹每年秋天都紅成同一個樣子。
    if (season === 'autumn') {
      const AUTUMN = [
        new THREE.Color('#c08a2e'), new THREE.Color('#b06a28'),
        new THREE.Color('#9a4a22'), new THREE.Color('#8a7a30'),
      ];
      return (q: Placement) => {
        const pick = AUTUMN[Math.floor(rngGate(q.x * 3.7 + 5, q.z * 2.1 + 3) * AUTUMN.length) % AUTUMN.length];
        return jitteredColor(pick, q.x, q.z, 0.012, 0.10, 0.10);
      };
    }
    if (season === 'spring') {
      // 春天四棵裡有一棵開花 —— 粉白兩色。同一棵樹每年春天開同一樹花,
      // 這就是「春」的招牌:秋葉、夏螢、冬雪,春要有花
      const BLOOM = [new THREE.Color('#e6c3cc'), new THREE.Color('#efe6dd')];
      return (q: Placement) => {
        const roll = rngGate(q.x * 2.9 + 11, q.z * 3.3 + 7);
        if (roll < 0.25) {
          return jitteredColor(BLOOM[roll < 0.13 ? 0 : 1], q.x, q.z, 0.008, 0.06, 0.05);
        }
        return jitteredColor(p.broadleaf, q.x, q.z, 0.018, 0.12, 0.11);
      };
    }
    return (q: Placement) => jitteredColor(p.broadleaf, q.x, q.z, 0.018, 0.12, 0.11);
  }, [p, season]);
  useInstanceColors(crown, items, colorOf);
  return (
    <>
      <instancedMesh ref={trunk} args={[undefined, undefined, items.length]} castShadow>
        <cylinderGeometry args={[0.16, 0.24, 1.7, 5]} />
        <meshStandardMaterial color="#42311f" roughness={0.94} ref={applyNearFade} />
      </instancedMesh>
      <instancedMesh ref={crown} args={[undefined, undefined, items.length]} geometry={broadCrownGeom} castShadow>
        <meshStandardMaterial color="#ffffff" roughness={0.88} flatShading ref={broadSway} />
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
  const colorOf = useMemo(
    () => (q: Placement) => jitteredColor(p.reed, q.x, q.z, 0.010, 0.08, 0.10),
    [p],
  );
  useInstanceColors(ref, items, colorOf);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]}>
      <coneGeometry args={[0.30, 1.5, 4]} />
      <meshStandardMaterial color="#ffffff" roughness={0.95} ref={reedSway} />
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
  // 石頭只抖明度不抖色相 —— 花崗岩的深深淺淺是風化,不是染色
  const colorOf = useMemo(
    () => (q: Placement) => jitteredColor(p.rock, q.x, q.z, 0.004, 0.05, 0.13),
    [p],
  );
  useInstanceColors(ref, items, colorOf);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} castShadow receiveShadow>
      <dodecahedronGeometry args={[0.9, 0]} />
      <meshStandardMaterial color="#ffffff" roughness={0.95} flatShading />
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
  const colorOf = useMemo(
    () => (q: Placement) => jitteredColor(p.bamboo, q.x, q.z, 0.014, 0.10, 0.10),
    [p],
  );
  useInstanceColors(leaf, items, colorOf);
  return (
    <>
      <instancedMesh ref={culm} args={[undefined, undefined, items.length]} castShadow>
        <cylinderGeometry args={[0.05, 0.07, 4.2, 5]} />
        <meshStandardMaterial color="#6d7a3a" roughness={0.86} ref={bambooCulmSway} />
      </instancedMesh>
      <instancedMesh ref={leaf} args={[undefined, undefined, items.length]} castShadow>
        <coneGeometry args={[0.62, 1.9, 5]} />
        <meshStandardMaterial color="#ffffff" roughness={0.88} flatShading ref={bambooLeafSway} />
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
  const colorOf = useMemo(
    () => (q: Placement) => jitteredColor(p.willow, q.x, q.z, 0.014, 0.10, 0.10),
    [p],
  );
  useInstanceColors(crown, items, colorOf);
  return (
    <>
      <instancedMesh ref={trunk} args={[undefined, undefined, items.length]} castShadow>
        <cylinderGeometry args={[0.18, 0.30, 2.4, 6]} />
        <meshStandardMaterial color="#4a3826" roughness={0.94} ref={applyNearFade} />
      </instancedMesh>
      <instancedMesh ref={crown} args={[undefined, undefined, items.length]} geometry={willowCrownGeom} castShadow>
        <meshStandardMaterial color="#ffffff" roughness={0.9} flatShading ref={willowSway} />
      </instancedMesh>
    </>
  );
}
