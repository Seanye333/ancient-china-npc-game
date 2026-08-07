import * as THREE from 'three';
import { legGeom, FIG_HIP, FIG_LEG_H } from './figure';

/**
 * 站著的一雙腿。
 *
 * 掛在角色那個 group 底下就行 —— 縣城裡站樁的、流民、走失的人、
 * 賊窩門口的哨,這些都不邁步,腿只要在那裡撐住身子。
 *
 * 會走路的(玩家、村民、隨行、陣上)不用這個,走 poseLeg 每幀擺。
 * 分開的理由很實際:靜態的那些連 useFrame 都沒有,為了兩條腿去開一個
 * 每幀回呼,是拿全世界的幀率換一個看不出來的差別。
 */
/** 一份幾何全世界共用 —— 一人一份的話,幾百份一模一樣的小腿躺在記憶體裡。 */
let shared: THREE.BufferGeometry | null = null;
export function sharedLegGeom(): THREE.BufferGeometry {
  return shared ?? (shared = legGeom());
}

export function StandingLegs({ roughness = 0.8 }: { roughness?: number }) {
  const geo = sharedLegGeom();
  return (
    <>
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={geo} position={[FIG_HIP * s, FIG_LEG_H, 0]} castShadow>
          <meshStandardMaterial vertexColors roughness={roughness} />
        </mesh>
      ))}
    </>
  );
}
