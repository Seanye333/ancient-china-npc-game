import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { groundAt } from './field';
import { MARKET } from './sites';
import { useClock } from './worldTime';
import { festivalOn } from '../game/calendar';
import { registerPlace, unregisterPlace } from '../game/places';
import { useFair } from '../game/fair';

/**
 * 社日那天,市集上搭起來的東西:一座矮台,四根彩幡。
 *
 * 台子要<b>看得見</b> —— 你從村口走過來,遠遠看見市集上多了一座台,
 * 「今天是社日」這件事就不必靠日誌說。散了以後台子拆掉,
 * 市集回到原來的樣子:節日的一半意義在「過完就沒了」。
 */
const AT: [number, number] = [MARKET[0] - 6, MARKET[1] - 8];

export function FairDay() {
  const day = useClock((s) => s.day);
  const fest = festivalOn(day);
  const reset = useFair((s) => s.reset);

  useEffect(() => {
    if (!fest) { unregisterPlace('fair'); return; }
    reset();
    registerPlace({
      id: 'fair', kind: 'fair', label: `${fest}擂台`, radius: 6,
      x: AT[0], z: AT[1], y: groundAt(AT[0], AT[1]),
    });
    return () => unregisterPlace('fair');
  }, [fest, reset]);

  const g = useMemo(() => groundAt(AT[0], AT[1]), []);

  if (!fest) return null;

  return (
    <group position={[AT[0], g, AT[1]]}>
      {/* 台 */}
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[7.5, 0.6, 7.5]} />
        <meshStandardMaterial color="#8a7554" roughness={0.9} />
      </mesh>
      {/* 彩幡 —— 紅的,節日唯一用得起的顏色 */}
      {[[-3.4, -3.4], [3.4, -3.4], [-3.4, 3.4], [3.4, 3.4]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 2.2, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.08, 4.4, 5]} />
            <meshStandardMaterial color="#5a4028" roughness={0.9} />
          </mesh>
          <mesh position={[0.35, 3.6, 0]} castShadow>
            <boxGeometry args={[0.7, 1.4, 0.04]} />
            <meshStandardMaterial color="#a03a2a" roughness={0.85}
              side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
