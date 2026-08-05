import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useClock } from './worldTime';

/**
 * 天氣 — 雨與雪。
 *
 * 粒子跟著相機走:整個世界撒滿粒子太貴,實際只需要相機周圍那一盒。
 * 掉出盒底就從盒頂重新丟下來,所以無論鏡頭飛多遠,永遠只有這幾千顆。
 */

const BOX = 90;          // 相機周圍的作用範圍
const TOP = 46;

export function Weather() {
  const weather = useClock((s) => s.weather);
  const ref = useRef<THREE.Points>(null);
  const { camera } = useThree();

  const count = weather === 'rain' ? 4200 : weather === 'snow' ? 2600 : 0;

  const { geom, vel } = useMemo(() => {
    const n = Math.max(1, count);
    const pos = new Float32Array(n * 3);
    const v = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * BOX;
      pos[i * 3 + 1] = Math.random() * TOP;
      pos[i * 3 + 2] = (Math.random() - 0.5) * BOX;
      v[i] = 0.7 + Math.random() * 0.6;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return { geom: g, vel: v };
  }, [count]);

  useFrame((_, dt) => {
    if (!count || !ref.current) return;
    const p = geom.attributes.position as THREE.BufferAttribute;
    const arr = p.array as Float32Array;
    const fall = weather === 'rain' ? 34 : 3.4;
    const drift = weather === 'rain' ? 1.4 : 3.2;
    for (let i = 0; i < count; i++) {
      const k = i * 3;
      arr[k + 1] -= fall * vel[i] * dt;
      arr[k] += Math.sin(arr[k + 1] * 0.12 + i) * drift * dt;
      if (arr[k + 1] < -6) {
        arr[k] = (Math.random() - 0.5) * BOX;
        arr[k + 1] = TOP;
        arr[k + 2] = (Math.random() - 0.5) * BOX;
      }
    }
    p.needsUpdate = true;
    // 粒子盒跟著相機平移,只取整數格避免抖動
    ref.current.position.set(
      Math.round(camera.position.x / 4) * 4, 0, Math.round(camera.position.z / 4) * 4,
    );
  });

  if (!count) return null;
  return (
    <points ref={ref} geometry={geom} frustumCulled={false}>
      <pointsMaterial
        color={weather === 'rain' ? '#9db9cc' : '#eef4fa'}
        size={weather === 'rain' ? 0.16 : 0.30}
        sizeAttenuation
        transparent
        opacity={weather === 'rain' ? 0.55 : 0.85}
        depthWrite={false}
      />
    </points>
  );
}
