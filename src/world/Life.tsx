import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { groundAt, terrainHeight, riverMask, rng, WATER_Y, water } from './field';
import { houseSites, MARKET, meanderAt } from './sites';
import { useClock } from './worldTime';
import { playerPos } from '../game/interact';
import { raidParties } from '../game/raids';
import { barkSound } from '../game/audio';

/**
 * 活物 — 雞、狗、飛鳥、河裡的魚。
 *
 * 這一批不進任何規則(狗吠是提示不是偵測),它們的全部工作是證明
 * 「這個村子不是佈景」。做法全是老一套:一種活物一個 InstancedMesh,
 * 矩陣每幀算,draw call 一隻手數得完。
 */

/* ── 飛鳥 ── */

const FLOCKS = [
  { cx: MARKET[0], cz: MARKET[1] - 30, r: 46, h: 30, speed: 0.045, n: 9 },
  { cx: meanderAt(-60) + 10, cz: -60, r: 60, h: 38, speed: 0.032, n: 7 },
];
const BIRD_N = FLOCKS.reduce((a, f) => a + f.n, 0);

export function Birds() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const tmp = useMemo(() => ({ obj: new THREE.Object3D() }), []);
  useFrame(({ clock }) => {
    const im = mesh.current;
    if (!im) return;
    const hr = useClock.getState().hour;
    // 鳥是白天的東西 —— 天黑歸巢,天亮才出來
    if (hr < 5.6 || hr > 18.8) { im.count = 0; return; }
    const t = clock.elapsedTime;
    let i = 0;
    for (const f of FLOCKS) {
      const a0 = t * f.speed * Math.PI * 2;
      for (let k = 0; k < f.n; k++) {
        // 各自在隊形裡錯開一點,還各有各的顛簸 —— 一群點繞正圓就是吊燈
        const a = a0 + k * 0.42 + Math.sin(t * 0.7 + k * 2.1) * 0.08;
        const r = f.r + Math.sin(t * 0.31 + k * 1.7) * 6;
        const x = f.cx + Math.sin(a) * r;
        const z = f.cz + Math.cos(a) * r;
        const y = f.h + Math.sin(t * 0.5 + k) * 3.5;
        tmp.obj.position.set(x, y, z);
        tmp.obj.rotation.set(0, a + Math.PI / 2, 0);
        // 拍翅:橫向縮放一開一合 —— 遠處的剪影只要這一下就像在飛
        const flap = 0.55 + Math.abs(Math.sin(t * 7 + k * 1.3)) * 0.45;
        tmp.obj.scale.set(flap, 1, 1);
        tmp.obj.updateMatrix();
        im.setMatrixAt(i++, tmp.obj.matrix);
      }
    }
    im.count = i;
    im.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, BIRD_N]} frustumCulled={false}>
      <planeGeometry args={[0.85, 0.22]} />
      <meshBasicMaterial color="#2c2a30" side={THREE.DoubleSide} />
    </instancedMesh>
  );
}

/* ── 雞 ── */

const HENS = 10;

export function Chickens() {
  const mesh = useRef<THREE.InstancedMesh>(null);

  const geom = useMemo(() => {
    // 身子一顆蛋、頭一顆珠、尾巴一撮 —— 雞的剪影就這三塊
    const body = new THREE.SphereGeometry(0.16, 8, 6);
    body.scale(1, 0.85, 1.25);
    body.translate(0, 0.16, 0);
    const head = new THREE.SphereGeometry(0.075, 7, 5);
    head.translate(0, 0.34, 0.17);
    const tail = new THREE.ConeGeometry(0.07, 0.18, 5);
    tail.rotateX(-Math.PI * 0.38);
    tail.translate(0, 0.26, -0.19);
    return mergeGeometries([body, head, tail], false)!;
  }, []);

  const hens = useMemo(() => {
    const rand = rng(818);
    const homes = houseSites().filter((h) => Math.hypot(h.x - MARKET[0], h.z - MARKET[1]) < 70);
    return Array.from({ length: HENS }, (_, i) => {
      const h = homes[i % homes.length];
      const hx = h.door[0] + (rand() - 0.5) * 4;
      const hz = h.door[1] + (rand() - 0.5) * 4;
      return {
        hx, hz, x: hx, z: hz, yaw: rand() * Math.PI * 2,
        mode: 'peck' as 'peck' | 'stroll' | 'flee',
        until: rand() * 3, phase: rand() * Math.PI * 2,
      };
    });
  }, []);

  const tmp = useMemo(() => ({ obj: new THREE.Object3D(), col: new THREE.Color() }), []);

  useFrame(({ clock }, dt) => {
    const im = mesh.current;
    if (!im) return;
    const t = clock.elapsedTime;
    hens.forEach((c, i) => {
      // 被人走近就撲開 —— 這一下比十隻站著的雞都「活」
      const pd = Math.hypot(playerPos.x - c.x, playerPos.z - c.z);
      if (pd < 1.7 && c.mode !== 'flee') { c.mode = 'flee'; c.until = t + 0.9; }
      if (c.mode === 'flee') {
        c.yaw = Math.atan2(c.x - playerPos.x, c.z - playerPos.z);
        c.x += Math.sin(c.yaw) * 2.6 * dt;
        c.z += Math.cos(c.yaw) * 2.6 * dt;
        if (t > c.until) { c.mode = 'peck'; c.until = t + 1.5 + Math.random() * 2; }
      } else if (c.mode === 'stroll') {
        c.x += Math.sin(c.yaw) * 0.45 * dt;
        c.z += Math.cos(c.yaw) * 0.45 * dt;
        if (Math.hypot(c.x - c.hx, c.z - c.hz) > 3.5) c.yaw = Math.atan2(c.hx - c.x, c.hz - c.z);
        if (t > c.until) { c.mode = 'peck'; c.until = t + 1.2 + Math.random() * 2.4; }
      } else if (t > c.until) {
        c.mode = 'stroll'; c.yaw = Math.random() * Math.PI * 2; c.until = t + 1 + Math.random() * 2;
      }
      tmp.obj.position.set(c.x, groundAt(c.x, c.z), c.z);
      // 啄食:整隻前傾一點一點 —— 沒有骨架,啄的是身子
      const peck = c.mode === 'peck' ? Math.max(0, Math.sin(t * 6 + c.phase)) * 0.5 : 0;
      tmp.obj.rotation.set(peck, c.yaw, 0);
      tmp.obj.scale.setScalar(1);
      tmp.obj.updateMatrix();
      im.setMatrixAt(i, tmp.obj.matrix);
    });
    im.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, HENS]}
      geometry={geom}
      castShadow
      frustumCulled={false}
      onUpdate={(im) => {
        const COLORS = ['#e8e2d4', '#8a5a34', '#4a3a30', '#c9b89a'];
        for (let i = 0; i < HENS; i++) im.setColorAt(i, tmp.col.set(COLORS[i % COLORS.length]));
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
      }}
    >
      <meshStandardMaterial color="#ffffff" roughness={0.9} />
    </instancedMesh>
  );
}

/* ── 狗 ── */

const DOGS = 2;

export function Dogs() {
  const mesh = useRef<THREE.InstancedMesh>(null);

  const geom = useMemo(() => {
    const body = new THREE.BoxGeometry(0.22, 0.24, 0.62);
    body.translate(0, 0.34, 0);
    const head = new THREE.BoxGeometry(0.18, 0.18, 0.24);
    head.translate(0, 0.5, 0.38);
    const ear1 = new THREE.ConeGeometry(0.045, 0.1, 4);
    ear1.translate(-0.06, 0.63, 0.34);
    const ear2 = new THREE.ConeGeometry(0.045, 0.1, 4);
    ear2.translate(0.06, 0.63, 0.34);
    const tail = new THREE.CylinderGeometry(0.03, 0.015, 0.3, 4);
    tail.rotateX(Math.PI * 0.32);
    tail.translate(0, 0.46, -0.4);
    const legs: THREE.BufferGeometry[] = [];
    for (const [lx, lz] of [[-0.08, 0.22], [0.08, 0.22], [-0.08, -0.22], [0.08, -0.22]]) {
      const leg = new THREE.CylinderGeometry(0.032, 0.028, 0.24, 4);
      leg.translate(lx, 0.12, lz);
      legs.push(leg);
    }
    return mergeGeometries([body, head, ear1, ear2, tail, ...legs], false)!;
  }, []);

  const dogs = useMemo(() => {
    const homes = houseSites().filter((h) => Math.hypot(h.x - MARKET[0], h.z - MARKET[1]) < 40);
    return Array.from({ length: DOGS }, (_, i) => {
      const h = homes[(i * 3) % homes.length];
      return {
        hx: h.door[0] + 1.2, hz: h.door[1] + 1.2,
        x: h.door[0] + 1.2, z: h.door[1] + 1.2,
        yaw: Math.random() * Math.PI * 2,
        mode: 'lie' as 'lie' | 'wander' | 'alert',
        until: 4 + i * 7, nextBark: 0,
      };
    });
  }, []);

  const tmp = useMemo(() => ({ obj: new THREE.Object3D(), col: new THREE.Color() }), []);

  useFrame(({ clock }, dt) => {
    const im = mesh.current;
    if (!im) return;
    const t = clock.elapsedTime;
    const hr = useClock.getState().hour;
    const night = hr < 5.6 || hr > 19.2;
    // 亂兵下山、賊摸到村子附近 —— 狗先知道。吠聲是村子的警報,不是偵測系統
    let threat: { x: number; z: number } | null = null;
    for (const r of raidParties) {
      if (Math.hypot(r.x - MARKET[0], r.z - MARKET[1]) < 80) { threat = r; break; }
    }
    dogs.forEach((d, i) => {
      if (threat && night) {
        d.mode = 'alert';
        d.yaw = Math.atan2(threat.x - d.x, threat.z - d.z);
        if (t > d.nextBark) {
          d.nextBark = t + 2.5 + Math.random() * 3;
          barkSound();
        }
      } else if (d.mode === 'alert') {
        d.mode = 'lie'; d.until = t + 5;
      } else if (d.mode === 'wander') {
        d.x += Math.sin(d.yaw) * 0.8 * dt;
        d.z += Math.cos(d.yaw) * 0.8 * dt;
        if (Math.hypot(d.x - d.hx, d.z - d.hz) > 5) d.yaw = Math.atan2(d.hx - d.x, d.hz - d.z);
        if (t > d.until) { d.mode = 'lie'; d.until = t + 8 + Math.random() * 10; }
      } else if (t > d.until && !night) {
        d.mode = 'wander'; d.yaw = Math.random() * Math.PI * 2; d.until = t + 3 + Math.random() * 4;
      }
      tmp.obj.position.set(d.x, groundAt(d.x, d.z), d.z);
      const lying = d.mode === 'lie';
      tmp.obj.rotation.set(0, d.yaw, 0);
      // 趴著:壓扁一點貼地 —— 剪影上「臥」和「立」分得出來就夠
      tmp.obj.scale.set(1, lying ? 0.55 : 1, 1);
      tmp.obj.updateMatrix();
      im.setMatrixAt(i, tmp.obj.matrix);
    });
    im.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, DOGS]}
      geometry={geom}
      castShadow
      frustumCulled={false}
      onUpdate={(im) => {
        im.setColorAt(0, tmp.col.set('#8a6a44'));
        im.setColorAt(1, tmp.col.set('#3c342c'));
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
      }}
    >
      <meshStandardMaterial color="#ffffff" roughness={0.92} />
    </instancedMesh>
  );
}

/* ── 魚躍 ── */

export function FishSplash() {
  const fish = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const st = useRef({ x: 0, z: 0, t0: -9, next: 6 });
  const { camera } = useThree();

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const s = st.current;
    if (t > s.next) {
      // 在鏡頭附近的河面挑一個點 —— 挑不到就過一會再試
      s.next = t + 5 + Math.random() * 9;
      for (let k = 0; k < 12; k++) {
        const a = Math.random() * Math.PI * 2;
        const d = 14 + Math.random() * 30;
        const x = camera.position.x + Math.sin(a) * d;
        const z = camera.position.z + Math.cos(a) * d;
        if (riverMask(x, z) > 0.5 && terrainHeight(x, z) < WATER_Y - 0.3) {
          s.x = x; s.z = z; s.t0 = t;
          break;
        }
      }
    }
    const age = t - s.t0;
    const wy = WATER_Y + water.offset;
    if (fish.current) {
      // 一道小黑弧跳起來又扎回去
      const k = age / 0.7;
      fish.current.visible = k >= 0 && k < 1;
      if (fish.current.visible) {
        fish.current.position.set(s.x, wy + Math.sin(k * Math.PI) * 0.55, s.z);
        fish.current.rotation.z = k * Math.PI * 1.6;
      }
    }
    if (ring.current) {
      const k = (age - 0.25) / 1.1;
      ring.current.visible = k >= 0 && k < 1;
      if (ring.current.visible) {
        ring.current.position.set(s.x, wy + 0.02, s.z);
        const sc = 0.3 + k * 1.6;
        ring.current.scale.set(sc, sc, sc);
        (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - k);
      }
    }
  });

  return (
    <>
      <mesh ref={fish} visible={false}>
        <sphereGeometry args={[0.11, 6, 5]} />
        <meshStandardMaterial color="#3a4448" roughness={0.4} metalness={0.3} />
      </mesh>
      <mesh ref={ring} visible={false} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.5, 0.62, 20]} />
        <meshBasicMaterial color="#dfe8ec" transparent opacity={0.5} depthWrite={false} />
      </mesh>
    </>
  );
}

/* ── 酒旗 ── */

/**
 * 酒肆挑出來的一面旗。位置抄 places.ts 的酒肆(市集東南) ——
 * 那邊的註解說了:這個座標本來就是寫死的常數,要動兩處一起動。
 * 布是一塊 CPU 每幀捏的細分平面 —— 就一面旗,犯不著上著色器。
 */
export function TavernFlag() {
  const cloth = useRef<THREE.Mesh>(null);
  const fx = MARKET[0] + 10.5, fz = MARKET[1] - 9;
  const gy = useMemo(() => terrainHeight(fx, fz), [fx, fz]);

  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#ddc894';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#2a2018';
    g.font = 'bold 84px "Kaiti SC", "STKaiti", serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('酒', 64, 70);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);

  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(1.15, 0.95, 8, 5);
    g.translate(0.575, 0, 0);        // 左緣掛在桿上,波從掛邊往外走
    return g;
  }, []);

  useFrame(({ clock }) => {
    const m = cloth.current;
    if (!m) return;
    const t = clock.elapsedTime;
    const pos = geom.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      // 掛邊不動,越到旗梢擺得越野
      pos.setZ(i, Math.sin(t * 2.6 + x * 4.2) * 0.09 * x + Math.sin(t * 1.1 + x * 2) * 0.05 * x);
    }
    pos.needsUpdate = true;
    geom.computeVertexNormals();
  });

  return (
    <group position={[fx, gy, fz]}>
      <mesh position={[0, 2.1, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.07, 4.2, 6]} />
        <meshStandardMaterial color="#5a4630" roughness={0.9} />
      </mesh>
      <mesh position={[0.35, 4.05, 0]} rotation-z={Math.PI / 2} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 0.9, 5]} />
        <meshStandardMaterial color="#5a4630" roughness={0.9} />
      </mesh>
      <mesh ref={cloth} geometry={geom} position={[0.08, 3.55, 0]} castShadow>
        <meshStandardMaterial map={tex} side={THREE.DoubleSide} roughness={0.85} />
      </mesh>
    </group>
  );
}
