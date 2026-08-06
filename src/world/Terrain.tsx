import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { terrainHeight, slopeAt, riverMask, WATER_Y, water } from './field';
import { SEASONS, paletteFor, useClock, type Season } from './worldTime';

const SIZE = 520;
const SEG = 300;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * 地形 — 位移網格 + 逐季頂點色。
 *
 * 原本想走 `material.onBeforeCompile` 注入 shader,但當成 JSX prop 傳給
 * `<meshStandardMaterial>` 會靜默失效(整片地維持白色 base color)。
 * 改烘進 color attribute:高度與坡度只算一次,四季各出一套顏色預先備好,
 * 換季就是換一個 attribute,不必重算地形。
 */
export function Terrain() {
  const season = useClock((s) => s.season);

  const { geom, colorSets } = useMemo(() => {
    const g = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const n = pos.count;

    // 高度與坡度是四季共用的,只算一次 — 否則四套顏色要跑四遍 slopeAt
    const hs = new Float32Array(n);
    const ss = new Float32Array(n);
    // 色彩打散也是四季共用的:斑塊(低頻)讓草地和枯草互滲成一塊塊,
    // 顆粒(高頻)給每個頂點一點明度差 —— 少了這兩層,地表就是一整張
    // 平色的塑料布,螢幕截圖裡最「假」的就是它
    const patch = new Float32Array(n);
    const grain = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = terrainHeight(x, z);
      pos.setY(i, y);
      hs[i] = y;
      ss[i] = slopeAt(x, z);
      patch[i] = 0.5 + 0.5 * Math.sin(x * 0.085 + Math.sin(z * 0.047) * 2.3)
        * Math.sin(z * 0.071 + Math.sin(x * 0.039) * 1.9);
      const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
      grain[i] = h - Math.floor(h);
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();

    const sets = {} as Record<Season, THREE.BufferAttribute>;
    const c = new THREE.Color();
    for (const s of SEASONS) {
      const p = paletteFor(s);
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const y = hs[i];
        const sl = ss[i];
        c.copy(p.grass);
        c.lerp(p.dry, smoothstep(6, 26, y));
        c.lerp(p.dry, patch[i] * 0.30);            // 低地也有一塊塊的枯黃
        c.lerp(p.silt, smoothstep(1.6, -1.4, y));
        c.lerp(p.rock, smoothstep(0.34, 0.70, sl));
        c.lerp(p.snow, smoothstep(p.snowLo, p.snowHi, y) * (1 - sl * 0.5));
        const v = 0.94 + grain[i] * 0.12;          // 顆粒:±6% 明度
        arr[i * 3] = c.r * v;
        arr[i * 3 + 1] = c.g * v;
        arr[i * 3 + 2] = c.b * v;
      }
      sets[s] = new THREE.BufferAttribute(arr, 3);
    }
    g.setAttribute('color', sets.autumn);
    return { geom: g, colorSets: sets };
  }, []);

  useEffect(() => {
    geom.setAttribute('color', colorSets[season]);
    (geom.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }, [season, geom, colorSets]);

  return (
    <mesh geometry={geom} receiveShadow castShadow>
      <meshStandardMaterial vertexColors roughness={0.95} metalness={0} />
    </mesh>
  );
}

/** 水面 — 只在河心那條帶露出來,冬天結一層薄冰。 */
export function River() {
  // 水面跟著水位走 —— 漲落是慢的,所以插值也給得慢
  const riverRef = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    const r = riverRef.current;
    if (!r) return;
    r.position.y += (WATER_Y + water.offset - r.position.y) * Math.min(1, dt * 0.6);
  });

  const season = useClock((s) => s.season);
  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(SIZE, SIZE, 140, 140);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, riverMask(pos.getX(i), pos.getZ(i)) > 0.16 ? 0 : -60);
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  }, []);

  const frozen = season === 'winter';
  return (
    <mesh ref={riverRef} geometry={geom} position={[0, WATER_Y, 0]} receiveShadow>
      <meshStandardMaterial
        color={frozen ? '#8fa6ae' : '#3b5a67'}
        roughness={frozen ? 0.42 : 0.12}
        metalness={frozen ? 0.15 : 0.55}
        transparent
        opacity={frozen ? 0.96 : 0.9}
      />
    </mesh>
  );
}
