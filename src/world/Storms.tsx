import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { terrainHeight, riverMask, waterLevel } from './field';
import { useClock } from './worldTime';
import { snowStep, snowTarget, gustAt, gusting } from './sky';
import { playerPos } from '../game/interact';

/**
 * 天氣落到地上的那一半 —— 雨打在地上、雪積起來、風吹過去、雷劈下來。
 *
 * 在這之前,天氣只存在於<b>空中那幾千顆粒子</b>:雨從天上掉下來,
 * 到了地面就憑空消失;雪下了一整天,地上還是那片草;
 * 打雷只是環境光閃一下,天上什麼都沒有。
 * 粒子是「正在下」,這個檔案是「下過了會怎樣」。
 */

/* ── 積雪的深度,全世界共用一份 ────────────── */

/**
 * 地上積了多厚(0..1)。
 *
 * 模組級的可變值,和 playerPos / fighters 同一套路 —— 每幀要被
 * 好幾個渲染元件讀(草、屋頂、腳印),進 zustand 的話每幀 set 一次
 * 就是整棵樹重繪。
 */
export const snow = { pack: 0 };

/* ── 雨打在地上 ────────────────────────────── */

const SPLASH = 90;
/** 只在鏡頭腳邊這一圈濺 —— 兩百公尺外的水花沒有人看得見。 */
const SPLASH_R = 13;

function Splashes() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const { camera } = useThree();
  const tmp = useMemo(() => ({ o: new THREE.Object3D() }), []);
  /** 每一朵:落點與生時。生命只有 0.35 秒 —— 濺起來就沒了。 */
  const drops = useRef<Array<{ x: number; z: number; y: number; t0: number }>>([]);

  useFrame(({ clock }, dt) => {
    const im = mesh.current;
    if (!im || !mat.current) return;
    const w = useClock.getState().weather;
    const t = clock.elapsedTime;
    if (w !== 'rain') {
      if (im.count) { im.count = 0; drops.current.length = 0; }
      stormStat.splashes = 0;
      return;
    }
    // 一秒補幾十朵,補到滿為止
    const want = Math.min(SPLASH, Math.round(dt * 260));
    for (let i = 0; i < want; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * SPLASH_R;
      const x = camera.position.x + Math.sin(a) * r;
      const z = camera.position.z + Math.cos(a) * r;
      const gy = terrainHeight(x, z);
      // 打在水面上的另有其人(Water 的雨圈),這裡只管落在土上的
      if (gy < waterLevel() + 0.05 && riverMask(x, z) > 0.2) continue;
      if (drops.current.length >= SPLASH) drops.current.shift();
      drops.current.push({ x, z, y: gy, t0: t });
    }
    let n = 0;
    for (const d of drops.current) {
      const age = (t - d.t0) / 0.35;
      if (age >= 1) continue;
      // 一圈往外擴、同時往上抬一點點 —— 平貼在地上的圓讀不出「濺」
      const s = 0.06 + age * 0.30;
      tmp.o.position.set(d.x, d.y + 0.02 + age * 0.05, d.z);
      tmp.o.rotation.set(-Math.PI / 2, 0, 0);
      tmp.o.scale.set(s, s, 1);
      tmp.o.updateMatrix();
      im.setMatrixAt(n++, tmp.o.matrix);
    }
    im.count = n;
    stormStat.splashes = n;
    mat.current.opacity = 0.30;
    im.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, SPLASH]} frustumCulled={false} renderOrder={2}>
      <ringGeometry args={[0.55, 1, 8]} />
      <meshBasicMaterial ref={mat} color="#cfe0ea" transparent opacity={0} depthWrite={false} />
    </instancedMesh>
  );
}

/* ── 風吹過去 ──────────────────────────────── */

const STREAKS = 54;

/**
 * 看得見的一陣風。
 *
 * 樹會搖、草會伏,可那是「一直在動的東西動得多一點」——
 * 讀不出<b>一陣風正從那邊掃過來</b>。真正讓人看見風的是空氣裡被捲起來的
 * 東西:一道細長的塵、幾片葉子,順著風貼著地面跑過去,然後散掉。
 *
 * 只在陣裡出現(gusting > 0),所以平時零開銷。
 */
function WindStreaks() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const { camera } = useThree();
  const tmp = useMemo(() => ({ o: new THREE.Object3D() }), []);
  const bits = useRef(Array.from({ length: STREAKS }, (_, i) => ({
    x: 0, z: 0, y: 0, life: -1, seed: i * 0.618,
  })));

  useFrame(({ clock }, dt) => {
    const im = mesh.current;
    if (!im || !mat.current) return;
    const t = clock.elapsedTime;
    const w = useClock.getState().weather;
    const g = gustAt(t, w);
    const k = gusting(g, w);
    if (k <= 0.02) {
      if (im.count) im.count = 0;
      stormStat.streaks = 0;
      return;
    }
    mat.current.opacity = k * 0.20;
    const speed = 9 + g.strength * 7;
    let n = 0;
    for (const b of bits.current) {
      b.life -= dt;
      if (b.life <= 0) {
        // 從上風處進場 —— 從畫面中間冒出來的塵不像被吹的
        const side = (b.seed * 37) % 1;
        b.x = camera.position.x - g.dx * 22 + (side - 0.5) * 30;
        b.z = camera.position.z - g.dz * 22 + ((b.seed * 91) % 1 - 0.5) * 30;
        b.y = terrainHeight(b.x, b.z) + 0.25 + ((b.seed * 53) % 1) * 1.2;
        b.life = 1.4 + ((b.seed * 17) % 1) * 1.2;
      }
      b.x += g.dx * speed * dt;
      b.z += g.dz * speed * dt;
      tmp.o.position.set(b.x, b.y, b.z);
      // 躺著、順著風向拉長 —— 一條細長的痕才讀得出方向
      tmp.o.rotation.set(0, Math.atan2(g.dx, g.dz), 0);
      const fade = Math.sin(Math.min(1, Math.max(0, b.life / 2.4)) * Math.PI);
      tmp.o.scale.set(0.10, 1, 2.6 * fade + 0.4);
      tmp.o.updateMatrix();
      im.setMatrixAt(n++, tmp.o.matrix);
    }
    im.count = n;
    stormStat.streaks = n;
    stormStat.gust = +k.toFixed(2);
    im.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, STREAKS]} frustumCulled={false} renderOrder={1}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        ref={mat} color="#d9cfb8" transparent opacity={0}
        depthWrite={false} side={THREE.DoubleSide}
      />
    </instancedMesh>
  );
}

/* ── 雷 ────────────────────────────────────── */

const BOLT_SEGS = 14;

/**
 * 一道真的閃電。
 *
 * 從前打雷只是環境光猛地拉滿一瞬 —— 亮是亮了,可<b>天上什麼都沒有</b>,
 * 讀起來像有人在按電燈開關。一道折線比多亮兩倍有用得多。
 *
 * 折線是隨機遊走生成的:從雲底往下,每一節橫著偏一點,越靠近地面偏得越少
 * (電走的是最短路徑,只是路上被空氣推歪)。另外岔出一條短枝 —— 沒有分岔
 * 的閃電是一根棍子。
 */
function Bolt({ show }: { show: React.RefObject<number> }) {
  const line = useRef<THREE.LineSegments>(null);
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    // 主幹 BOLT_SEGS 節 + 一條 4 節的岔枝,每節兩個端點
    g.setAttribute('position', new THREE.BufferAttribute(
      new Float32Array((BOLT_SEGS + 4) * 2 * 3), 3,
    ));
    return g;
  }, []);
  const shown = useRef(-1);

  useFrame(({ clock, camera }) => {
    const l = line.current;
    if (!l) return;
    const on = clock.elapsedTime < show.current;
    l.visible = on;
    if (!on) return;
    if (shown.current === show.current) return;     // 同一道,不重畫
    shown.current = show.current;

    const pos = geom.attributes.position.array as Float32Array;
    // 劈在鏡頭前方一段距離的側面 —— 正頭頂看不見,太遠又沒有威脅感
    const ang = Math.random() * Math.PI * 2;
    const dist = 60 + Math.random() * 90;
    let x = camera.position.x + Math.sin(ang) * dist;
    let z = camera.position.z + Math.cos(ang) * dist;
    let y = 66 + Math.random() * 20;
    const gy = terrainHeight(x, z);
    let w = 0;
    const branchAt = 4 + Math.floor(Math.random() * 5);
    let bx = 0, by = 0, bz = 0;
    for (let i = 0; i < BOLT_SEGS; i++) {
      const nx = x + (Math.random() - 0.5) * 9 * (1 - i / BOLT_SEGS);
      const nz = z + (Math.random() - 0.5) * 9 * (1 - i / BOLT_SEGS);
      const ny = y - (y - gy) / (BOLT_SEGS - i);
      pos[w++] = x; pos[w++] = y; pos[w++] = z;
      pos[w++] = nx; pos[w++] = ny; pos[w++] = nz;
      if (i === branchAt) { bx = nx; by = ny; bz = nz; }
      x = nx; y = ny; z = nz;
    }
    // 岔枝:從主幹某一節斜著甩出去,不落地
    for (let i = 0; i < 4; i++) {
      const nx = bx + (Math.random() - 0.5) * 7 + 3;
      const nz = bz + (Math.random() - 0.5) * 7;
      const ny = by - (by - gy) * 0.13;
      pos[w++] = bx; pos[w++] = by; pos[w++] = bz;
      pos[w++] = nx; pos[w++] = ny; pos[w++] = nz;
      bx = nx; by = ny; bz = nz;
    }
    geom.attributes.position.needsUpdate = true;
    geom.computeBoundingSphere();
    stormStat.bolts++;
  });

  return (
    <lineSegments ref={line} geometry={geom} frustumCulled={false} visible={false}>
      {/* 顏色推到 HDR(>1)才過得了 bloom 的門檻 —— 閃電要發光,不是一條白線 */}
      <lineBasicMaterial color={new THREE.Color(4, 4.2, 5)} toneMapped={false} />
    </lineSegments>
  );
}

/* ── 出口 ──────────────────────────────────── */

/** 原型階段的把手 —— 這些東西都是一閃即逝的,截圖抓不準。 */
export const stormStat = { splashes: 0, streaks: 0, gust: 0, bolts: 0, pack: 0 };

export function Storms({ boltUntil }: { boltUntil: React.RefObject<number> }) {
  // 積雪的深度在這裡推,全世界讀 snow.pack
  useFrame((_, dt) => {
    const st = useClock.getState();
    snow.pack = snowStep(snow.pack, snowTarget(st.weather, st.season), dt);
    stormStat.pack = +snow.pack.toFixed(3);
  });

  // 開局若已經是冬天,雪不該從零開始積 —— 那會有兩分鐘的「冬天沒有雪」
  useEffect(() => {
    const st = useClock.getState();
    snow.pack = snowTarget(st.weather, st.season);
  }, []);

  return (
    <>
      <Splashes />
      <WindStreaks />
      <Bolt show={boltUntil} />
    </>
  );
}

/** 玩家腳邊有沒有積雪 —— 給腳印用(在水裡、在屋簷下就沒有)。 */
export function snowUnderfoot(): number {
  return riverMask(playerPos.x, playerPos.z) > 0.5 ? 0 : snow.pack;
}
