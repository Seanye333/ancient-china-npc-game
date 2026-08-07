import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { groundAt } from './field';
import { bodyGeom, headGeom, FIG_BODY_H } from './figure';
import { StandingLegs, StandingArms } from './Legs';
import { MARKET } from './sites';
import { useRefugees } from '../game/refugees';
import { useMarauders } from '../game/marauders';
import { registerPlace, unregisterPlace } from '../game/places';

/**
 * 世道爛出來的兩種人:村口蹲著的流民,和進了村的亂兵。
 *
 * 流民蹲著(整個人壓到六成高)—— 蹲是他們的姿態:不討不搶,就是走不動了。
 * 亂兵站著,而且站得<b>散</b>:歪歪扭扭一叢,刀掛在腰上。
 * 隊伍站得整齊是軍紀,站得散才是「潰下來的兵」。
 *
 * 兩者都不進戰鬥系統:流民不會打你,亂兵你打不過 —— 後者是刻意的,
 * 這個遊戲第一個刀解決不了的東西。
 */

const GATE: [number, number] = [MARKET[0] - 14, MARKET[1] + 26];

export function Drifters() {
  const band = useRefugees((s) => s.band);
  const phase = useMarauders((s) => s.phase);

  const geoms = useMemo(() => ({
    poor: { body: bodyGeom(new THREE.Color('#5d564a')), head: headGeom({ cloth: true }) },
    troop: { body: bodyGeom(new THREE.Color('#3a3d46')), head: headGeom({ beard: true }) },
  }), []);
  const spear = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.035, 0.035, 2.6, 5);
    g.translate(0, 1.3, 0);
    return g;
  }, []);
  const swayRef = useRef<THREE.Group>(null);

  // 流民在的時候,村口有一個能「上前」的地方
  useEffect(() => {
    if (!band) { unregisterPlace('refugees'); return; }
    registerPlace({
      id: 'refugees', kind: 'refugees', label: '路邊的流民', radius: 5,
      x: GATE[0], z: GATE[1], y: groundAt(GATE[0], GATE[1]),
    });
    return () => unregisterPlace('refugees');
  }, [band]);

  useFrame(({ clock }) => {
    if (swayRef.current) swayRef.current.rotation.y = Math.sin(clock.elapsedTime * 0.4) * 0.04;
  });

  return (
    <group ref={swayRef}>
      {band && Array.from({ length: band.count }, (_, i) => {
        const a = (i / band.count) * Math.PI * 1.4 + 0.4;
        const x = GATE[0] + Math.sin(a) * (1.6 + (i % 3));
        const z = GATE[1] + Math.cos(a) * (1.4 + ((i * 7) % 2));
        const y = groundAt(x, z);
        return (
          <group key={`r${i}`} position={[x, y, z]} rotation={[0, a + Math.PI, 0]}
            scale={[1, 0.62, 1]}>
            <mesh geometry={geoms.poor.body} castShadow>
              <meshStandardMaterial vertexColors roughness={0.9} />
            </mesh>
            <mesh geometry={geoms.poor.head} position={[0, FIG_BODY_H * 0.99, 0]} castShadow>
              <meshStandardMaterial vertexColors roughness={0.8} />
            </mesh>
            <StandingLegs roughness={0.9} />
            <StandingArms robe="#5d564a" roughness={0.9} />
          </group>
        );
      })}

      {phase === 'present' && Array.from({ length: 9 }, (_, i) => {
        // 歪歪扭扭一叢 —— 站得散才是潰下來的兵
        const x = MARKET[0] + Math.sin(i * 2.4) * 5.5 + (i % 3) * 1.2;
        const z = MARKET[1] + 6 + Math.cos(i * 1.9) * 4.5;
        const y = groundAt(x, z);
        return (
          <group key={`m${i}`} position={[x, y, z]} rotation={[0, i * 1.1, 0]}>
            <mesh geometry={geoms.troop.body} castShadow>
              <meshStandardMaterial vertexColors roughness={0.8} />
            </mesh>
            <mesh geometry={geoms.troop.head} position={[0, FIG_BODY_H * 0.99, 0]} castShadow>
              <meshStandardMaterial vertexColors roughness={0.7} />
            </mesh>
            <StandingLegs />
            <StandingArms robe="#3a3d46" roughness={0.8} />
            <mesh geometry={spear} position={[0.28, 0, 0.1]} rotation={[0.12, 0, -0.08]} castShadow>
              <meshStandardMaterial color="#4d4237" roughness={0.9} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
