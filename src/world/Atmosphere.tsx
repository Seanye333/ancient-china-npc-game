import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useClock, daylight } from './worldTime';
import { terrainHeight, riverMask, rng, WATER_Y } from './field';

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
  return (
    <>
      {season === 'autumn' && weather !== 'snow' && <FallingLeaves />}
      {season === 'summer' && weather === 'clear' && night && <Fireflies />}
    </>
  );
}

/* ── 落葉 ── */

const LEAVES = 150;
const LEAF_BOX = 40;              // 鏡頭周圍的作用範圍 —— 收小一圈,眼前才有密度
const LEAF_COLORS = ['#c08a2e', '#b06a28', '#9a4a22', '#8a7a30'];

function FallingLeaves() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const { camera } = useThree();

  // 每片葉子:位置、下落速度、搖擺相位、翻滾軸速
  const leaves = useMemo(() => {
    const rand = rng(1123);
    return Array.from({ length: LEAVES }, () => ({
      x: 0, y: -999, z: 0,                       // -999 = 第一幀就重生
      fall: 0.55 + rand() * 0.5,
      phase: rand() * Math.PI * 2,
      spinX: (rand() - 0.5) * 4, spinZ: (rand() - 0.5) * 4,
    }));
  }, []);

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
        // 顏色和樹冠同一套秋色 —— 落的葉要像是從那些樹上掉的
        for (let i = 0; i < LEAVES; i++) {
          im.setColorAt(i, tmp.col.set(LEAF_COLORS[i % LEAF_COLORS.length]));
        }
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
      }}
    >
      <planeGeometry args={[0.24, 0.32]} />
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
