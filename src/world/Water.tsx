import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { riverMask, waterLevel, terrainHeight, rng } from './field';
import { meanderAt } from './sites';
import { useClock } from './worldTime';
import { playerPos } from '../game/interact';

/**
 * 水的三件事:岸邊那道白、雨打出來的圈、以及人走進去濺起來的。
 *
 * 河面本身早就有真反射了,可它和岸是<b>一條硬邊</b>——水像一塊藍玻璃鋪在土上,
 * 而不是流過來淹到那裡。真正讓人相信那是水的,是水和別的東西<b>接觸</b>的地方:
 * 拍在岸上的那道白沫、雨點打出來的一圈圈、腳踩下去炸開的那一下。
 */

/* ── 岸邊的浪線 ──────────────────────────────── */

/*
 * 岸線取樣點的上限。
 *
 * 第一版寫 150 然後 slice —— 而一條三百八十公尺的河兩岸掃出來將近三百點,
 * 於是<b>只有南半段有浪</b>,北半段的岸還是硬邊。截圖裡看起來像「浪沒做出來」,
 * 其實是做出來的那一半剛好不在鏡頭裡。三百個實例一次 draw,沒有省的必要。
 */
const FOAM = 520;

/**
 * 岸線在哪。
 *
 * <b>不是 riverMask 的邊界。</b>水面那張網用 riverMask > 0.16 裁掉外圍,
 * 可它是一整片<b>平的</b>板子鋪在 WATER_Y —— 靠岸那一段早就埋進土裡了。
 * 眼睛看到的水邊,是<b>地面高度剛好跨過水位</b>的那條線,在遮罩邊界的內側。
 *
 * 第一版照遮罩邊界擺浪,三百道浪全在地底下,截圖裡一道都看不見 ——
 * 而我先去改了數量、又去改了不透明度,都不是原因。
 */
function shoreSpots() {
  const out: Array<{ x: number; z: number; yaw: number }> = [];
  const wl = waterLevel();
  /*
   * 取樣間距要比浪片<b>短得多</b>。
   *
   * 岸不是南北筆直的:斜著走的那一段,同樣 2.6 公尺的 z 步進,
   * 沿岸實際跨出去三四公尺 —— 於是浪片斷成一塊一塊的白方磚。
   * 步進砍到 1.6、浪片加長到 3.6,斜岸上也還疊得住。
   */
  for (let z = -190; z <= 190; z += 1.6) {
    const cx = meanderAt(z);
    for (const side of [-1, 1]) {
      // 從河心往外掃,找地面爬過水位的那一步
      let edge = null as number | null;
      for (let d = 0.5; d < 30; d += 0.3) {
        if (terrainHeight(cx + side * d, z) >= wl) { edge = d; break; }
      }
      if (edge === null) continue;
      // 這一點必須真的在水裡那一側(遮罩還沒歸零)—— 否則是一段乾河床
      if (riverMask(cx + side * (edge - 0.4), z) < 0.10) continue;
      out.push({ x: cx + side * (edge - 0.25), z, yaw: side > 0 ? Math.PI / 2 : -Math.PI / 2 });
    }
  }
  return out;
}

function Foam() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const spots = useMemo(() => shoreSpots().slice(0, FOAM), []);
  const tmp = useMemo(() => ({ o: new THREE.Object3D() }), []);

  const alphaMap = useMemo(() => {
    const S = 64;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, S);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.45, 'rgba(255,255,255,.85)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.NoColorSpace;
    return t;
  }, []);
  useEffect(() => () => alphaMap.dispose(), [alphaMap]);

  useFrame(({ clock }) => {
    const im = mesh.current;
    if (!im || !mat.current) return;
    // 冬天封凍 —— 冰面沒有浪
    if (useClock.getState().season === 'winter') { im.count = 0; waterStat.foam = 0; return; }
    const t = clock.elapsedTime;
    const y = waterLevel();
    spots.forEach((s, i) => {
      // 一道一道推上來又退下去,相位沿著河往下游走 —— 那是水在流
      const wave = Math.sin(t * 0.9 - s.z * 0.12 + i * 0.3);
      tmp.o.position.set(s.x, y + 0.035, s.z);
      tmp.o.rotation.set(-Math.PI / 2, 0, s.yaw);
      tmp.o.scale.set(1, 0.62 + wave * 0.30, 1);
      tmp.o.updateMatrix();
      im.setMatrixAt(i, tmp.o.matrix);
    });
    im.count = spots.length;
    waterStat.foam = spots.length;
    im.instanceMatrix.needsUpdate = true;
    mat.current.opacity = 0.42;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, Math.max(1, spots.length)]}
      frustumCulled={false} renderOrder={2}>
      <planeGeometry args={[3.6, 1.5]} />
      <meshBasicMaterial ref={mat} color="#dfe8ec" alphaMap={alphaMap}
        transparent opacity={0} depthWrite={false} />
    </instancedMesh>
  );
}

/* ── 水在流 ──────────────────────────────────── */

const STREAKS = 48;

/**
 * 河心的流痕。
 *
 * 岸邊的浪已經是一道一道往下游推的了,可<b>河面本身是靜止的</b>——
 * 一塊會反光的藍板子。真正說出「這條河在流」的,是水面上那些
 * 順流而下的細痕:光在起伏上拉長的一條條亮線。
 *
 * 做法最省:幾十條細長的淡色片子,順著河道往下游漂,漂出範圍就回上游。
 * 不動水面幾何(一萬九千個頂點每幀動不起),只在它上面鋪一層痕。
 */
function Streaks() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const tmp = useMemo(() => ({ o: new THREE.Object3D(), c: new THREE.Color() }), []);
  const seed = useMemo(() => rng(3131), []);
  const bits = useMemo(() => Array.from({ length: STREAKS }, () => ({
    z: 0, off: 0, len: 1, spawned: false,
  })), []);

  useFrame((_, dt) => {
    const im = mesh.current;
    if (!im || !mat.current) return;
    // 結冰的河不流。<b>提早 return 也要把計數歸零</b> ——
    // 只清 im.count 的話,畫面是對的而把手在說謊,驗收就白做了
    if (useClock.getState().season === 'winter') { im.count = 0; waterStat.streaks = 0; return; }
    const y = waterLevel();
    let n = 0;
    for (const b of bits) {
      if (!b.spawned) {
        b.z = (seed() - 0.5) * 380;
        b.off = (seed() - 0.5) * 13;
        b.len = 1.6 + seed() * 3.4;
        b.spawned = true;
      }
      // 往 -z 漂 = 往下游。漂過頭就回到上游那一端
      b.z -= (1.5 + b.len * 0.2) * dt;
      if (b.z < -195) { b.z = 195; b.off = (seed() - 0.5) * 13; }
      const x = meanderAt(b.z) + b.off;
      // 只在真的有水的地方畫 —— 河道彎過去以後,固定的橫向偏移會漂到岸上
      const m = riverMask(x, b.z);
      if (m < 0.42) continue;
      tmp.o.position.set(x, y + 0.03, b.z);
      tmp.o.rotation.set(-Math.PI / 2, 0, 0);
      tmp.o.scale.set(0.16, b.len, 1);
      tmp.o.updateMatrix();
      im.setMatrixAt(n, tmp.o.matrix);
      // 越靠河心越明顯 —— 岸邊交給浪線
      im.setColorAt(n, tmp.c.setScalar(Math.min(1, (m - 0.42) * 2.4)));
      n++;
    }
    im.count = n;
    waterStat.streaks = n;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    mat.current.opacity = 0.16;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, STREAKS]}
      frustumCulled={false} renderOrder={2}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial ref={mat} color="#dbe6ea" transparent opacity={0} depthWrite={false} />
    </instancedMesh>
  );
}

/* ── 雨打出來的圈 ────────────────────────────── */

const RINGS = 130;

function RainRings() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const tmp = useMemo(() => ({ o: new THREE.Object3D(), c: new THREE.Color() }), []);
  /** 每個圈:落點與出生時刻。落點只擲一次,擴散是算出來的。 */
  const drops = useMemo(
    () => Array.from({ length: RINGS }, () => ({ x: 0, z: 0, born: -9, life: 0 })), []);
  const seed = useMemo(() => rng(777), []);

  useFrame(({ clock, camera }) => {
    const im = mesh.current;
    if (!im || !mat.current) return;
    const st = useClock.getState();
    if (st.weather !== 'rain' || st.season === 'winter') { im.count = 0; waterStat.rings = 0; return; }
    const t = clock.elapsedTime;
    const y = waterLevel();
    let n = 0;
    for (const d of drops) {
      const age = (t - d.born) / d.life;
      if (age >= 1 || d.born < 0) {
        /*
         * 重生:在<b>鏡頭附近的水面</b>上挑一點。
         * 滿河撒的話,你眼前這一段幾乎沒有圈 —— 和落葉、雨雪同一個道理。
         */
        for (let k = 0; k < 8; k++) {
          const x = camera.position.x + (seed() - 0.5) * 46;
          const z = camera.position.z + (seed() - 0.5) * 46;
          if (riverMask(x, z) > 0.30) { d.x = x; d.z = z; break; }
        }
        d.born = t;
        d.life = 0.9 + seed() * 0.7;
        continue;
      }
      /*
       * 圈越擴越大越淡 —— 這是「一滴打在水上」唯一需要的兩件事。
       *
       * 淡出<b>不能靠材質的 opacity</b>:那是整批共用的,調它是所有圈一起淡。
       * 拿 instanceColor 往水色上壓,每個圈才各淡各的 ——
       * 不然圈擴到頭會「啪」一下消失,而那一下比沒有圈還顯眼。
       */
      const r = 0.10 + age * 0.46;
      tmp.o.position.set(d.x, y + 0.02, d.z);
      tmp.o.rotation.set(-Math.PI / 2, 0, 0);
      tmp.o.scale.set(r, r, 1);
      tmp.o.updateMatrix();
      im.setMatrixAt(n, tmp.o.matrix);
      const fade = Math.max(0, 1 - age * age);
      im.setColorAt(n, tmp.c.setScalar(fade));
      n++;
    }
    im.count = n;
    im.instanceMatrix.needsUpdate = true;
    waterStat.rings = n;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    mat.current.opacity = 0.40;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, RINGS]}
      frustumCulled={false} renderOrder={2}>
      <ringGeometry args={[0.74, 1, 12]} />
      <meshBasicMaterial ref={mat} color="#cfdde4" transparent opacity={0} depthWrite={false} />
    </instancedMesh>
  );
}

/* ── 涉水的水花 ──────────────────────────────── */

const SPLASH = 26;

function Wade() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const bits = useMemo(() => Array.from({ length: SPLASH }, () => ({
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, born: -9,
  })), []);
  const tmp = useMemo(() => ({ o: new THREE.Object3D() }), []);
  const lastStep = useRef({ x: Infinity, z: Infinity });
  const head = useRef(0);

  useFrame(({ clock }, dt) => {
    const im = mesh.current;
    if (!im || !mat.current) return;
    const t = clock.elapsedTime;
    const y = waterLevel();
    // 腳踩在水面以下才濺 —— 站在岸上走不該有水花
    const inWater = playerPos.y < y + 0.12 && riverMask(playerPos.x, playerPos.z) > 0.2;
    const moved = Math.hypot(playerPos.x - lastStep.current.x, playerPos.z - lastStep.current.z);
    if (inWater && moved > 0.5) {
      lastStep.current = { x: playerPos.x, z: playerPos.z };
      // 一步炸三粒 —— 再多就成了噴泉
      for (let k = 0; k < 3; k++) {
        const b = bits[head.current];
        head.current = (head.current + 1) % SPLASH;
        const a = Math.random() * Math.PI * 2;
        const sp = 0.9 + Math.random() * 1.3;
        b.x = playerPos.x; b.y = y + 0.05; b.z = playerPos.z;
        b.vx = Math.sin(a) * sp * 0.5; b.vz = Math.cos(a) * sp * 0.5;
        b.vy = 1.4 + Math.random() * 1.1;
        b.born = t;
      }
    }
    let n = 0;
    for (const b of bits) {
      if (b.born < 0) continue;
      const age = t - b.born;
      if (age > 0.75) continue;
      b.vy -= 9.8 * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.y < y) { b.born = -9; continue; }
      const s = 0.09 * (1 - age * 0.6);
      tmp.o.position.set(b.x, b.y, b.z);
      tmp.o.scale.set(s, s, s);
      tmp.o.updateMatrix();
      im.setMatrixAt(n++, tmp.o.matrix);
    }
    im.count = n;
    waterStat.splash = n;
    im.instanceMatrix.needsUpdate = true;
    mat.current.opacity = 0.75;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, SPLASH]} frustumCulled={false}>
      <sphereGeometry args={[1, 5, 4]} />
      <meshBasicMaterial ref={mat} color="#e8f1f5" transparent opacity={0} depthWrite={false} />
    </instancedMesh>
  );
}

/** 原型階段的把手:此刻水上有多少東西。畫面上數不清,而「零」和「有」差很多。 */
export const waterStat = { foam: 0, rings: 0, splash: 0, streaks: 0 };

export function WaterLife() {
  return (
    <>
      <Foam />
      <Streaks />
      <RainRings />
      <Wade />
    </>
  );
}

/** 只給測試用:岸線是沿著遮罩算出來的,不是手擺的。 */
export const __shoreSpots = shoreSpots;
