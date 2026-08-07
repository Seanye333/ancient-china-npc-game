import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { groundAt } from './field';
import { bodyGeom, headGeom, FIG_BODY_H } from './figure';
import { StandingLegs, StandingArms } from './Legs';
import { playerPos } from '../game/interact';
import { useQuest } from '../game/quest';
import { useJournal } from '../game/journal';
import { useClock } from './worldTime';

/**
 * 走丟的那個人,真的站在那裡。
 *
 * 「尋人」這種活最容易做成假的:接了活,走到一個座標,跳一行字說找到了。
 * 那不是找人,是走到一個判定框裡。
 *
 * 所以他是<b>一個真的人形</b>:你遠遠看得見一個小小的身影蹲在田埂上,
 * 走近了他會站起來跟著你走。找到之後那件活還沒完 —— 得把人帶回村裡。
 * 從「看見他」到「把他送回去」中間那段路,才是這件差事真正的內容。
 */

const FOUND_AT = 4.5;

export function LostPerson() {
  const taken = useQuest((s) => s.taken);
  const advance = useQuest((s) => s.advance);
  const note = useJournal((s) => s.note);
  const group = useRef<THREE.Group>(null);
  const geom = useMemo(() => ({
    body: bodyGeom(new THREE.Color('#7a6a4e')),
    head: headGeom(),
  }), []);
  const trail = useRef({ x: 0, z: 0 });

  useFrame(({ clock }) => {
    const g = group.current;
    const t = taken;
    if (!g || !t?.lostAt) return;

    if (t.done < t.need) {
      // 還沒找到:他就蹲在那裡,偶爾動一下
      const y = groundAt(t.lostAt.x, t.lostAt.z);
      g.position.set(t.lostAt.x, y - 0.22, t.lostAt.z);
      g.rotation.y = Math.sin(clock.elapsedTime * 0.4) * 0.5;
      if (Math.hypot(t.lostAt.x - playerPos.x, t.lostAt.z - playerPos.z) < FOUND_AT) {
        advance(t.need);
        trail.current = { x: playerPos.x, z: playerPos.z };
        note(useClock.getState().day, '找著人了。腿傷著,走得慢 —— 帶他回去罷。', 'good');
      }
    } else {
      // 找到了:跟在你後頭。他走得慢,所以你得等他
      const dx = playerPos.x - trail.current.x;
      const dz = playerPos.z - trail.current.z;
      const d = Math.hypot(dx, dz);
      if (d > 2.6) {
        trail.current.x += (dx / d) * (d - 2.6) * 0.55;
        trail.current.z += (dz / d) * (d - 2.6) * 0.55;
      }
      g.position.set(trail.current.x, groundAt(trail.current.x, trail.current.z), trail.current.z);
      g.rotation.y = Math.atan2(dx, dz);
    }
  });

  if (!taken?.lostAt) return null;
  const found = taken.done >= taken.need;

  return (
    <group ref={group}>
      <mesh geometry={geom.body} castShadow>
        <meshStandardMaterial vertexColors roughness={0.8} />
      </mesh>
      <mesh geometry={geom.head} position={[0, FIG_BODY_H * 0.99, 0]} castShadow>
        <meshStandardMaterial vertexColors roughness={0.66} />
      </mesh>
      <StandingLegs />
      <StandingArms robe="#7a6a4e" roughness={0.8} />
      {!found && (
        <Billboard position={[0, FIG_BODY_H + 0.9, 0]}>
          <Text fontSize={0.24} color="#c8a45a" outlineWidth={0.016} outlineColor="#12100c"
            anchorX="center" anchorY="bottom">
            那是⋯⋯?
          </Text>
        </Billboard>
      )}
    </group>
  );
}
