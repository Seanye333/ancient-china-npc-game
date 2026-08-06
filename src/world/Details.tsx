import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { terrainHeight, rng, water, WATER_Y } from './field';
import { houseSites, meanderAt, MARKET, BRIDGE, DOCKS } from './sites';

/**
 * 世界的皺紋 — 路牌、泊船、晾衣、井台、社樹、墳地、小廟。
 *
 * 沒有一樣進規則,但「有人住了很久」全靠這些:路是有人指的、
 * 衣裳是有人晾的、井是有人打的、墳是有人埋的。
 * 全部合併成幾個靜態 mesh,一次畫完;會動的只有船在水上晃。
 */

function woodMat() {
  return new THREE.MeshStandardMaterial({ color: '#5f4a32', roughness: 0.9 });
}

/** 路牌的字 —— 認得出方向就夠。 */
function signTex(lines: string[]): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#c9b184';
  g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#2c2218';
  g.font = 'bold 26px "Kaiti SC","STKaiti",serif';
  g.textAlign = 'center';
  lines.forEach((s, i) => g.fillText(s, 64, 28 + i * 28));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function Details() {
  /* 路牌:橋頭一根柱兩塊板 —— 北指縣城,南指渡口 */
  const signs = useMemo(() => {
    const x = BRIDGE.x + 3.4, z = BRIDGE.z + 2.5;
    return { x, z, y: terrainHeight(x, z), north: signTex(['北 縣城']), south: signTex(['南 渡口']) };
  }, []);

  /* 靜態合併:井台、社樹幹、墳地、小廟、晾衣桿 */
  const built = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    const add = (g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0) => {
      g.applyMatrix4(new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
        new THREE.Vector3(1, 1, 1)));
      parts.push(g);
    };

    // 井台 —— 村心一圈石、兩根柱一根橫樑
    const wx = MARKET[0] - 8, wz = MARKET[1] + 6;
    const wy = terrainHeight(wx, wz);
    add(new THREE.CylinderGeometry(0.75, 0.85, 0.55, 10), wx, wy + 0.27, wz);
    add(new THREE.CylinderGeometry(0.45, 0.45, 0.6, 10), wx, wy + 0.42, wz);
    for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.06, 0.07, 2.1, 5), wx + s * 0.75, wy + 1.05, wz);
    add(new THREE.CylinderGeometry(0.05, 0.05, 1.7, 5).rotateZ(Math.PI / 2), wx, wy + 2.05, wz);

    // 社樹 —— 市集邊一棵大樹幹(冠交給場景裡本來的樹群,樹幹粗就是老)
    const sx = MARKET[0] - 12, sz = MARKET[1] - 2;
    const sy = terrainHeight(sx, sz);
    add(new THREE.CylinderGeometry(0.42, 0.62, 3.2, 8), sx, sy + 1.6, sz);
    add(new THREE.IcosahedronGeometry(2.6, 0), sx, sy + 4.6, sz);

    // 墳地 —— 村外坡上一片土饅頭,各插一塊小碑
    const rand = rng(4004);
    const gx0 = meanderAt(-96) + 34, gz0 = -96;
    for (let i = 0; i < 7; i++) {
      const gx = gx0 + (rand() - 0.5) * 14;
      const gz = gz0 + (rand() - 0.5) * 12;
      const gy = terrainHeight(gx, gz);
      if (gy < 1) continue;
      add(new THREE.SphereGeometry(0.6, 8, 5).scale(1, 0.55, 1), gx, gy + 0.12, gz);
      add(new THREE.BoxGeometry(0.34, 0.6, 0.08), gx, gy + 0.55, gz - 0.55, rand() * 0.3);
    }

    // 小廟 —— 往縣城的半路上一座土地龕
    const mx = 86, mz = 70;
    const my = terrainHeight(mx, mz);
    add(new THREE.BoxGeometry(1.4, 1.1, 1.0), mx, my + 0.55, mz, 0.4);
    add(new THREE.ConeGeometry(1.25, 0.7, 4), mx, my + 1.4, mz, 0.4 + Math.PI / 4);

    // 晾衣桿 —— 挑三戶院前,兩根柱一根竿
    const homes = houseSites().filter((h) => Math.hypot(h.x - MARKET[0], h.z - MARKET[1]) < 46);
    for (let i = 0; i < 3 && i * 4 + 1 < homes.length; i++) {
      const h = homes[i * 4 + 1];
      const lx = h.door[0] + 2.4, lz = h.door[1] - 1.6;
      const ly = terrainHeight(lx, lz);
      for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.05, 0.06, 1.9, 5), lx + s * 1.3, ly + 0.95, lz);
      add(new THREE.CylinderGeometry(0.03, 0.03, 2.6, 4).rotateZ(Math.PI / 2), lx, ly + 1.8, lz);
    }

    const g = mergeGeometries(parts.map((p) => p.toNonIndexed()), false)!;
    g.computeVertexNormals();
    return { geom: g, laundry: homes.slice(0, 3).map((_, i) => {
      const h = homes[i * 4 + 1];
      return { x: h.door[0] + 2.4, z: h.door[1] - 1.6 };
    }) };
  }, []);

  /* 泊船 —— 兩條在碼頭邊隨水波輕晃 */
  const boats = useRef<Array<THREE.Group | null>>([]);
  const boatGeom = useMemo(() => {
    const hull = new THREE.CylinderGeometry(0.55, 0.36, 3.4, 7).rotateZ(Math.PI / 2);
    hull.scale(1, 0.5, 1);
    const deck = new THREE.BoxGeometry(2.4, 0.1, 0.8);
    deck.translate(0, 0.16, 0);
    const canopy = new THREE.CylinderGeometry(0.5, 0.5, 1.4, 8, 1, false, 0, Math.PI).rotateZ(Math.PI / 2);
    canopy.translate(0, 0.42, 0);
    return mergeGeometries([hull.toNonIndexed(), deck.toNonIndexed(), canopy.toNonIndexed()], false)!;
  }, []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    boats.current.forEach((b, i) => {
      if (!b) return;
      b.position.y = WATER_Y + water.offset + 0.12 + Math.sin(t * 0.8 + i * 2.4) * 0.05;
      b.rotation.z = Math.sin(t * 0.6 + i) * 0.04;
      b.rotation.x = Math.sin(t * 0.45 + i * 1.7) * 0.03;
    });
  });

  /* 晾着的衣裳 —— 兩片小布,顏色跟村民的袍子一家 */
  const clothTint = ['#6b5741', '#3f5568', '#4a6b52'];

  return (
    <>
      <mesh geometry={built.geom} castShadow receiveShadow>
        <meshStandardMaterial color="#8a7a62" roughness={0.92} vertexColors={false} />
      </mesh>
      {/* 路牌 */}
      <group position={[signs.x, signs.y, signs.z]}>
        <mesh position={[0, 1.1, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.09, 2.2, 6]} />
          <meshStandardMaterial color="#5f4a32" roughness={0.9} />
        </mesh>
        <mesh position={[0.42, 1.85, 0]} rotation-y={0.35} castShadow>
          <boxGeometry args={[1.0, 0.42, 0.06]} />
          <meshStandardMaterial map={signs.north} roughness={0.85} />
        </mesh>
        <mesh position={[-0.38, 1.45, 0.08]} rotation-y={-2.6} castShadow>
          <boxGeometry args={[1.0, 0.42, 0.06]} />
          <meshStandardMaterial map={signs.south} roughness={0.85} />
        </mesh>
      </group>
      {/* 泊船 */}
      {DOCKS.map(([dx, dz], i) => (
        <group key={i} ref={(o) => { boats.current[i] = o; }}
               position={[dx + 2.2, WATER_Y, dz + 3.2]} rotation-y={0.5 + i * 1.9}>
          <mesh geometry={boatGeom} castShadow>
            <meshStandardMaterial color="#4c3a28" roughness={0.85} />
          </mesh>
        </group>
      ))}
      {/* 晾着的衣裳 */}
      {built.laundry.map((l, i) => (
        <group key={i} position={[l.x, terrainHeight(l.x, l.z) + 1.45, l.z]}>
          {[-0.6, 0.25].map((off, k) => (
            <mesh key={k} position={[off, 0, 0]} castShadow>
              <planeGeometry args={[0.5, 0.62]} />
              <meshStandardMaterial color={clothTint[(i + k) % clothTint.length]}
                side={THREE.DoubleSide} roughness={0.95} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
}

void woodMat;
