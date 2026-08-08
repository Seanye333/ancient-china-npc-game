import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { terrainHeight, slopeAt, riverMask, waterLevel, rng } from './field';
import { useClock } from './worldTime';
import { playerPos } from '../game/interact';
import { snowUnderfoot } from './Storms';

/**
 * 地上的痕跡 —— 積水的窪和踩出來的腳印。
 *
 * 兩樣東西一個檔案,因為它們是同一件事:<b>貼在地面上的一片薄東西</b>,
 * 都要繞開水面與陡坡、都要跟著鏡頭只鋪眼前那一圈、都是一個 InstancedMesh。
 *
 * 為什麼值得做:天氣在這之前只改地面的 roughness 和顏色 ——
 * 「下過雨」是一整片均勻地變暗,而真正讓人相信下過雨的是<b>積水的那幾處</b>;
 * 走過雪地留不留印子,則決定了雪是一層雪還是一張白紙。
 */

/* ── 雨後的積水 ────────────────────────────────── */

const POOLS = 46;

/**
 * 窪地在哪。
 *
 * 挑「四周都比它高」的點 —— 水往低處走,這一條不必問任何人。
 * 位置由地形算,所以是死的:同一場雨,水永遠積在同一幾處。
 */
function poolSpots(): Array<{ x: number; z: number; y: number; r: number }> {
  const rand = rng(9182);
  const out: Array<{ x: number; z: number; y: number; r: number }> = [];
  let guard = 0;
  while (out.length < POOLS && guard++ < POOLS * 400) {
    const x = (rand() - 0.5) * 300;
    const z = (rand() - 0.5) * 300;
    const y = terrainHeight(x, z);
    if (y < waterLevel() + 0.4) continue;       // 河裡不必再積水
    if (riverMask(x, z) > 0.55) continue;
    if (slopeAt(x, z) > 0.12) continue;         // 坡上留不住水
    // 四周八個方向都不低於它 —— 這才是窪,不是一塊平地
    let low = true;
    for (let k = 0; k < 8 && low; k++) {
      const a = (k / 8) * Math.PI * 2;
      if (terrainHeight(x + Math.sin(a) * 2.2, z + Math.cos(a) * 2.2) < y - 0.02) low = false;
    }
    if (!low) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.z - z) < 9)) continue;
    out.push({ x, z, y, r: 1.1 + rand() * 1.9 });
  }
  return out;
}

function Puddles() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const spots = useMemo(() => poolSpots(), []);
  const tmp = useMemo(() => ({ o: new THREE.Object3D() }), []);
  /** 0 = 乾透,1 = 剛下完。攢得快、退得慢 —— 水窪是雨停以後才最明顯的。 */
  const wet = useRef(0);

  useFrame((_, dt) => {
    const im = mesh.current;
    if (!im || !mat.current) return;
    const w = useClock.getState().weather;
    wet.current = w === 'rain'
      ? Math.min(1, wet.current + dt / 14)
      : Math.max(0, wet.current - dt / 90);
    const k = wet.current;
    if (k <= 0.02) { im.count = 0; markStat.puddles = 0; return; }
    mat.current.opacity = Math.min(1, k * 1.2);
    if (im.count === spots.length) return;      // 位置是死的,擺一次就夠
    spots.forEach((s, i) => {
      tmp.o.position.set(s.x, s.y + 0.035, s.z);
      tmp.o.rotation.set(-Math.PI / 2, 0, i * 1.7);
      tmp.o.scale.set(s.r, s.r * (0.7 + (i % 5) * 0.1), 1);
      tmp.o.updateMatrix();
      im.setMatrixAt(i, tmp.o.matrix);
    });
    im.count = spots.length;
    markStat.puddles = spots.length;
    im.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, spots.length]}
      frustumCulled={false} renderOrder={1}>
      <circleGeometry args={[1, 12]} />
      {/*
        水窪不是「一塊藍色」——它是<b>一面鏡子</b>。
        深色 + 低粗糙 + 高金屬感,天光落上去就有那道亮,而顏色幾乎不參與。
      */}
      <meshStandardMaterial
        ref={mat} color="#2b2e30" roughness={0.06} metalness={0.65}
        transparent opacity={0} depthWrite={false}
      />
    </instancedMesh>
  );
}

/* ── 腳印 ────────────────────────────────────── */

const PRINTS = 90;
/** 走多遠留一個。半步一個太密,一步一個剛好讀得出是「走過去的」。 */
const STRIDE = 0.62;

interface Print { x: number; z: number; y: number; yaw: number; side: number; born: number }

function Footprints() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const ring = useRef<Print[]>([]);
  const head = useRef(0);
  const last = useRef({ x: Infinity, z: Infinity, side: 1 });
  const tmp = useMemo(() => ({ o: new THREE.Object3D() }), []);
  /**
   * 地面「還軟不軟」的記憶。
   *
   * 直接拿當下的天氣當開關的話,雪一停,滿地腳印<b>同一幀全部消失</b>——
   * 走了一路的印子憑空不見,比沒有腳印更假。地面軟得慢、硬得更慢,
   * 所以雪停以後那串印子還會留一陣,慢慢淡掉。
   */
  const soft = useRef(0);

  useFrame(({ clock }, dt) => {
    const im = mesh.current;
    if (!im || !mat.current) return;
    const w = useClock.getState().weather;
    /*
     * 只有<b>踩得出印子的地面</b>才留腳印:雪地和雨後的泥。
     * 乾土上走一趟不留痕,這一條讓「下雪了」多一層看得見的後果。
     */
    /*
     * 踩得出印子的是<b>地上有什麼</b>,不是天上在下什麼。
     *
     * 從前直接看 weather:雪一停,腳印立刻開始淡 —— 可地上那層雪還在,
     * 走過去當然還是留印子。改讀積雪深度以後,雪停後那一串腳印
     * 會跟著雪一起慢慢化掉,而不是跟著雲走。
     */
    const pack = snowUnderfoot();
    const want = Math.max(pack, w === 'rain' ? 0.7 : 0);
    soft.current += (want - soft.current) * Math.min(1, dt / (want > soft.current ? 6 : 45));
    mat.current.opacity = soft.current * 0.5;
    if (soft.current <= 0.02) { im.count = 0; markStat.prints = 0; return; }
    // 雪上的印子是暗的(踩開了雪露出土),泥上的是亮的(壓實反光)
    mat.current.color.setHex(pack > 0.3 ? 0x8d8b86 : 0x5f5647);

    const d = Math.hypot(playerPos.x - last.current.x, playerPos.z - last.current.z);
    if (d > STRIDE && want > 0) {
      last.current.side *= -1;
      last.current.x = playerPos.x;
      last.current.z = playerPos.z;
      const p: Print = {
        x: playerPos.x, z: playerPos.z, y: terrainHeight(playerPos.x, playerPos.z),
        yaw: playerPos.yaw, side: last.current.side, born: clock.elapsedTime,
      };
      if (ring.current.length < PRINTS) ring.current.push(p);
      else { ring.current[head.current] = p; head.current = (head.current + 1) % PRINTS; }
    }

    const t = clock.elapsedTime;
    let n = 0;
    for (const p of ring.current) {
      // 印子會淡掉 —— 雪還在下,舊的先被蓋住
      const age = (t - p.born) / 70;
      if (age >= 1) continue;
      // 腳印落在<b>身側</b>,左右交替。落在正中間的話是一條拖痕,不是腳印
      const off = 0.11 * p.side;
      tmp.o.position.set(
        p.x + Math.cos(p.yaw) * off, p.y + 0.03, p.z - Math.sin(p.yaw) * off,
      );
      tmp.o.rotation.set(-Math.PI / 2, 0, -p.yaw);
      const s = 1 - age * 0.35;
      tmp.o.scale.set(s, s, 1);
      tmp.o.updateMatrix();
      im.setMatrixAt(n++, tmp.o.matrix);
    }
    im.count = n;
    markStat.prints = n;
    im.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, PRINTS]}
      frustumCulled={false} renderOrder={1}>
      <planeGeometry args={[0.17, 0.3]} />
      <meshStandardMaterial
        ref={mat} color="#8d8b86" roughness={1}
        transparent opacity={0} depthWrite={false}
      />
    </instancedMesh>
  );
}

/** 原型階段的把手:此刻地上有幾個痕跡。畫面上很難數,而「零」和「有」差很多。 */
export const markStat = { prints: 0, puddles: 0 };

export function Marks() {
  return (
    <>
      <Puddles />
      <Footprints />
    </>
  );
}

/** 只給測試用:窪地選址的規矩(水往低處走)。 */
export const __poolSpots = poolSpots;
