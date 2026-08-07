import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { groundAt, dryLandNear } from './field';
import { useFolk, livingVillagers } from '../game/folk';
import { homeOf, registerPlace, unregisterPlace } from '../game/places';

/**
 * 病家 —— 門口掛白布的那幾戶。
 *
 * 「某某病倒了」從前只是日誌上的一行字:人從街上消失,你連他住哪都不知道。
 * 現在他家門口掛起一條白布,遠遠就看得見 —— <b>這個村子病了幾戶,
 * 是用眼睛數的,不是用日誌數的</b>。走過去就能探病、送藥。
 *
 * 掛布這件事本身也是有出處的:漢時病家門前立標以告人,
 * 一半是求醫,一半是叫路人繞著走。
 */

export function Sickbeds() {
  const deltas = useFolk((s) => s.deltas);
  const swayRef = useRef<THREE.Group>(null);

  const beds = useMemo(() => {
    const out: Array<{ id: string; name: string; x: number; z: number; y: number }> = [];
    for (const p of livingVillagers()) {
      if ((deltas[p.id]?.sick ?? 0) <= 0) continue;
      const h = homeOf(p.id);
      if (!h) continue;
      // 門前一步是<b>往外</b>算的,算到河裡去的不在少數 ——
      // 挑白布的竿子插在水面上,那一戶看著就像淹了不是病了
      const [x, z] = dryLandNear(h.door[0], h.door[1]);
      out.push({ id: p.id, name: p.name, x, z, y: groundAt(x, z) });
    }
    return out;
  }, [deltas]);

  // 病家是可以走過去的地方 —— 病著的人不出門,所以只能上門
  useEffect(() => {
    for (const b of beds) {
      registerPlace({
        id: `sick-${b.id}`, kind: 'sickbed', label: `${b.name}家`, radius: 4,
        x: b.x, z: b.z, y: b.y,
      });
    }
    return () => { for (const b of beds) unregisterPlace(`sick-${b.id}`); };
  }, [beds]);

  useFrame(({ clock }) => {
    if (swayRef.current) swayRef.current.rotation.y = Math.sin(clock.elapsedTime * 0.5) * 0.05;
  });

  if (!beds.length) return null;

  return (
    <group ref={swayRef}>
      {beds.map((b) => (
        <group key={b.id} position={[b.x, b.y, b.z]}>
          {/* 竿 */}
          <mesh position={[0, 1.05, 0]} castShadow>
            <cylinderGeometry args={[0.035, 0.045, 2.1, 5]} />
            <meshStandardMaterial color="#5f4a32" roughness={0.9} />
          </mesh>
          {/* 白布 —— 兩面都要看得見,不然繞到背後就沒了 */}
          <mesh position={[0.22, 1.5, 0]} castShadow>
            <planeGeometry args={[0.42, 0.9]} />
            <meshStandardMaterial color="#ddd8cc" roughness={0.95} side={THREE.DoubleSide} />
          </mesh>
          {/* 門邊一隻藥罐 */}
          <mesh position={[-0.5, 0.12, 0.3]} castShadow>
            <cylinderGeometry args={[0.13, 0.16, 0.24, 8]} />
            <meshStandardMaterial color="#4a3b30" roughness={0.85} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
