import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useClock, daylight } from './worldTime';
import { terrainHeight, riverMask, rng, WATER_Y, water } from './field';
import { meanderAt } from './sites';

/**
 * 季節的氛圍粒子 — 秋天落葉、夏夜螢火。
 *
 * 這兩樣不改任何規則,卻是「這個世界活著」最便宜的證據:
 * 曆法跑了一年又一年,若畫面上秋天和夏天只差一個色調,季節就只是
 * 個換皮。葉子要往下掉、螢火要在河邊亮,季節才是<b>發生</b>的。
 *
 * 各一個 InstancedMesh,一次 draw call。不在季節裡就整個不掛,零開銷。
 */

export function Seasonals() {
  const season = useClock((s) => s.season);
  const weather = useClock((s) => s.weather);
  // 螢火要等真的黑下來 —— 日落後半個時辰。界線從 daylight() 拿,
  // 不自己拍一個數:季節改日照長度時,螢火不能還按舊的天黑
  const night = useClock((s) => {
    const { rise, set } = daylight(s.season);
    return s.hour > set + 0.5 || s.hour < rise - 0.3;
  });
  const day = !night;
  return (
    <>
      {season === 'autumn' && weather !== 'snow' && <FallingLeaves />}
      {season === 'spring' && weather === 'clear' && <FallingLeaves petals />}
      {season === 'summer' && weather === 'clear' && night && <Fireflies />}
      {(season === 'spring' || season === 'summer') && weather === 'clear' && day && <Butterflies />}
      {season === 'summer' && weather !== 'snow' && day && <Dragonflies />}
      {weather === 'clear' && <MorningMist />}
    </>
  );
}

/* ── 落葉 ── */

const LEAVES = 150;
const LEAF_BOX = 40;              // 鏡頭周圍的作用範圍 —— 收小一圈,眼前才有密度
const LEAF_COLORS = ['#c08a2e', '#b06a28', '#9a4a22', '#8a7a30'];
const PETAL_COLORS = ['#e6c3cc', '#efe6dd', '#e0b4c0', '#f2ece4'];

/** petals = 春天的花瓣:同一套飄落,片小、色淡、落得慢。 */
function FallingLeaves({ petals = false }: { petals?: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const { camera } = useThree();

  // 每片葉子:位置、下落速度、搖擺相位、翻滾軸速
  const leaves = useMemo(() => {
    const rand = rng(petals ? 1789 : 1123);
    return Array.from({ length: LEAVES }, () => ({
      x: 0, y: -999, z: 0,                       // -999 = 第一幀就重生
      fall: (petals ? 0.34 : 0.55) + rand() * (petals ? 0.3 : 0.5),
      phase: rand() * Math.PI * 2,
      spinX: (rand() - 0.5) * 4, spinZ: (rand() - 0.5) * 4,
    }));
  }, [petals]);

  const tmp = useMemo(() => ({ obj: new THREE.Object3D(), col: new THREE.Color() }), []);

  useFrame(({ clock }, dt) => {
    const im = mesh.current;
    if (!im) return;
    const t = clock.elapsedTime;
    const cx = camera.position.x, cz = camera.position.z;
    for (let i = 0; i < LEAVES; i++) {
      const f = leaves[i];
      f.y -= f.fall * dt;
      f.x += Math.sin(t * 1.7 + f.phase) * 0.55 * dt + 0.22 * dt;   // 搖擺 + 一絲風
      f.z += Math.cos(t * 1.3 + f.phase) * 0.4 * dt;
      const out = Math.abs(f.x - cx) > LEAF_BOX || Math.abs(f.z - cz) > LEAF_BOX;
      if (out || f.y < terrainHeight(f.x, f.z)) {
        // 掉到地上或鏡頭走遠了 —— 從鏡頭附近的半空重新飄下來
        f.x = cx + (Math.random() - 0.5) * LEAF_BOX * 1.7;
        f.z = cz + (Math.random() - 0.5) * LEAF_BOX * 1.7;
        f.y = terrainHeight(f.x, f.z) + 5 + Math.random() * 9;
      }
      tmp.obj.position.set(f.x, f.y, f.z);
      tmp.obj.rotation.set(t * f.spinX + f.phase, f.phase, t * f.spinZ);
      tmp.obj.updateMatrix();
      im.setMatrixAt(i, tmp.obj.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, LEAVES]}
      frustumCulled={false}
      onUpdate={(im) => {
        // 顏色和樹冠同一套 —— 落的要像是從那些樹上掉的
        const C = petals ? PETAL_COLORS : LEAF_COLORS;
        for (let i = 0; i < LEAVES; i++) {
          im.setColorAt(i, tmp.col.set(C[i % C.length]));
        }
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
      }}
    >
      <planeGeometry args={petals ? [0.13, 0.15] : [0.24, 0.32]} />
      <meshStandardMaterial color="#ffffff" roughness={0.9} side={THREE.DoubleSide} />
    </instancedMesh>
  );
}

/* ── 螢火 ── */

const FIREFLIES = 150;

function Fireflies() {
  const mesh = useRef<THREE.InstancedMesh>(null);

  // 家點撒在河岸低地 —— 螢火蟲的世界觀:近水、避開山坡
  const homes = useMemo(() => {
    const rand = rng(7331);
    const out: Array<{ x: number; z: number; y: number; phase: number; blink: number }> = [];
    let guard = 0;
    while (out.length < FIREFLIES && guard++ < FIREFLIES * 60) {
      const x = (rand() - 0.5) * 470;
      const z = (rand() - 0.5) * 470;
      const r = riverMask(x, z);
      if (r < 0.15 || r > 0.85) continue;
      const y = terrainHeight(x, z);
      if (y < WATER_Y - 0.1 || y > 7) continue;
      out.push({ x, z, y, phase: rand() * Math.PI * 2, blink: 0.7 + rand() * 0.9 });
    }
    return out;
  }, []);

  const tmp = useMemo(() => ({ obj: new THREE.Object3D() }), []);

  useFrame(({ clock }) => {
    const im = mesh.current;
    if (!im) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < homes.length; i++) {
      const h = homes[i];
      // 繞著家點畫慢圈,明滅各有各的節奏 —— 同步閃的螢火像聖誕燈
      const glow = Math.max(0, Math.sin(t * h.blink + h.phase) - 0.35) / 0.65;
      tmp.obj.position.set(
        h.x + Math.sin(t * 0.5 + h.phase) * 1.6,
        h.y + 0.75 + Math.sin(t * 0.9 + h.phase * 2.1) * 0.45,
        h.z + Math.cos(t * 0.41 + h.phase) * 1.6,
      );
      const s = glow * 0.9;
      tmp.obj.scale.set(s, s, s);
      tmp.obj.updateMatrix();
      im.setMatrixAt(i, tmp.obj.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
  });

  if (!homes.length) return null;

  // 螢火的「光」全是 bloom 給的 —— 顏色要推到 HDR(>1)才過得了 bloom 的
  // 亮度閾值。toneMapped=false 只繞過材質層的壓縮,合成器裡那道 ToneMapping
  // 是全屏的躲不掉;所以第一版用 #ffec9e(≤1)的螢火在畫面上就是幾顆灰點。
  const glowColor = useMemo(() => new THREE.Color(3.1, 2.7, 1.3), []);

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, homes.length]} frustumCulled={false}>
      <sphereGeometry args={[0.09, 6, 5]} />
      <meshBasicMaterial color={glowColor} toneMapped={false} />
    </instancedMesh>
  );
}

/* ── 蝴蝶(春夏晴晝) ── */

const FLIES = 36;

function Butterflies() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const homes = useMemo(() => {
    const rand = rng(2233);
    const out: Array<{ x: number; z: number; phase: number }> = [];
    let guard = 0;
    while (out.length < FLIES && guard++ < FLIES * 50) {
      const x = (rand() - 0.5) * 380;
      const z = (rand() - 0.5) * 380;
      const y = terrainHeight(x, z);
      if (y < 0.4 || y > 9) continue;
      // 別撒到河岸線上 —— 白翅膀貼著水邊,遠看就是一排莫名的閃點
      if (riverMask(x, z) > 0.25) continue;
      out.push({ x, z, phase: rand() * Math.PI * 2 });
    }
    return out;
  }, []);
  const tmp = useMemo(() => ({ obj: new THREE.Object3D(), col: new THREE.Color() }), []);
  useFrame(({ clock }) => {
    const im = mesh.current;
    if (!im) return;
    const t = clock.elapsedTime;
    homes.forEach((h, i) => {
      const x = h.x + Math.sin(t * 0.6 + h.phase) * 2.2;
      const z = h.z + Math.cos(t * 0.47 + h.phase * 1.7) * 2.2;
      tmp.obj.position.set(x, terrainHeight(x, z) + 0.7 + Math.sin(t * 1.7 + h.phase) * 0.35, z);
      tmp.obj.rotation.set(0, t * 0.6 + h.phase, 0);
      // 拍翅 —— 一開一合的橫向縮放,和飛鳥同一招
      tmp.obj.scale.set(0.25 + Math.abs(Math.sin(t * 11 + h.phase)) * 0.75, 1, 1);
      tmp.obj.updateMatrix();
      im.setMatrixAt(i, tmp.obj.matrix);
    });
    im.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh
      ref={mesh} args={[undefined, undefined, FLIES]} frustumCulled={false}
      onUpdate={(im) => {
        const C = ['#e8e4d2', '#e0c95a', '#b8cfe0'];
        for (let i = 0; i < FLIES; i++) im.setColorAt(i, tmp.col.set(C[i % C.length]));
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
      }}
    >
      <planeGeometry args={[0.16, 0.11]} />
      {/* 要受光的 standard,不是自發光的 basic —— 白翅膀一過 bloom 閾值就成了閃光點 */}
      <meshStandardMaterial color="#ffffff" roughness={1} side={THREE.DoubleSide} />
    </instancedMesh>
  );
}

/* ── 蜻蜓(夏晝的水邊) ── */

const DARTERS = 18;

function Dragonflies() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const homes = useMemo(() => {
    const rand = rng(4477);
    const out: Array<{
      x: number; z: number; tx: number; tz: number; cx: number; cz: number; next: number;
    }> = [];
    let guard = 0;
    while (out.length < DARTERS && guard++ < DARTERS * 60) {
      const x = (rand() - 0.5) * 420;
      const z = (rand() - 0.5) * 420;
      const r = riverMask(x, z);
      if (r < 0.2 || r > 0.75) continue;
      out.push({ cx: x, cz: z, x, z, tx: x, tz: z, next: rand() * 2 });
    }
    return out;
  }, []);
  const tmp = useMemo(() => ({ obj: new THREE.Object3D() }), []);
  useFrame(({ clock }, dt) => {
    const im = mesh.current;
    if (!im) return;
    const t = clock.elapsedTime;
    homes.forEach((d, i) => {
      // 蜻蜓的招牌是「一衝一停」—— 挑個點猛衝過去,懸停一下再換
      if (t > d.next) {
        d.next = t + 0.8 + Math.random() * 1.6;
        d.tx = d.cx + (Math.random() - 0.5) * 5;
        d.tz = d.cz + (Math.random() - 0.5) * 5;
      }
      d.x += (d.tx - d.x) * Math.min(1, dt * 6);
      d.z += (d.tz - d.z) * Math.min(1, dt * 6);
      const yaw = Math.atan2(d.tx - d.x, d.tz - d.z);
      tmp.obj.position.set(d.x, WATER_Y + water.offset + 0.6 + Math.sin(t * 3 + i) * 0.12, d.z);
      tmp.obj.rotation.set(Math.PI / 2, yaw, 0);
      tmp.obj.updateMatrix();
      im.setMatrixAt(i, tmp.obj.matrix);
    });
    im.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, DARTERS]} frustumCulled={false}>
      <cylinderGeometry args={[0.012, 0.02, 0.22, 4]} />
      <meshBasicMaterial color="#4a8a92" />
    </instancedMesh>
  );
}

/* ── 晨霧(晴天的河谷) ── */

const MIST_N = 9;

function MorningMist() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);

  // 一團軟邊 —— 和炊煙同一張圖的做法
  const alphaMap = useMemo(() => {
    const s = 64;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, '#fff');
    grad.addColorStop(0.5, 'rgba(255,255,255,.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    return new THREE.CanvasTexture(c);
  }, []);
  useEffect(() => () => alphaMap.dispose(), [alphaMap]);

  // 沿河擺 —— 晨霧是河谷的東西,不是滿地的
  const spots = useMemo(() => {
    const rand = rng(6161);
    return Array.from({ length: MIST_N }, (_, i) => {
      const z = -130 + (i / (MIST_N - 1)) * 260;
      return {
        x: meanderAt(z) + (rand() - 0.5) * 14, z: z + (rand() - 0.5) * 16,
        phase: rand() * Math.PI * 2, w: 20 + rand() * 14,
      };
    });
  }, []);

  const tmp = useMemo(() => ({ obj: new THREE.Object3D() }), []);

  useFrame(({ clock, camera }) => {
    const im = mesh.current;
    if (!im || !mat.current) return;
    const hr = useClock.getState().hour;
    // 只在清晨 —— 日頭一高就散
    const k = Math.min(
      Math.max(0, Math.min(1, (hr - 4.6) / 1.2)),
      Math.max(0, Math.min(1, (9.0 - hr) / 1.4)),
    );
    mat.current.opacity = k * 0.5;
    if (k <= 0) { im.count = 0; return; }
    const t = clock.elapsedTime;
    spots.forEach((s, i) => {
      tmp.obj.position.set(s.x + Math.sin(t * 0.05 + s.phase) * 5, WATER_Y + 2.4, s.z);
      // 只繞 y 對著鏡頭 —— 霧是立在河上的紗,不能跟著鏡頭躺倒
      tmp.obj.rotation.set(0, Math.atan2(camera.position.x - s.x, camera.position.z - s.z), 0);
      tmp.obj.scale.set(s.w / 20, 1, 1);
      tmp.obj.updateMatrix();
      im.setMatrixAt(i, tmp.obj.matrix);
    });
    im.count = spots.length;
    im.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, MIST_N]} frustumCulled={false} renderOrder={1}>
      <planeGeometry args={[20, 5.5]} />
      <meshBasicMaterial
        ref={mat} color="#dfe6ec" alphaMap={alphaMap} transparent opacity={0}
        depthWrite={false} side={THREE.DoubleSide}
      />
    </instancedMesh>
  );
}
