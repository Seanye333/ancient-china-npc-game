import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { groundAt, steerMove } from './field';
import { findPath } from './nav';
import { playerPos } from '../game/interact';
import { convoy, useConvoy, CART_SPEED, CART_LEASH, DELIVER_AT } from '../game/convoy';
import { useQuest } from '../game/quest';
import { useJournal } from '../game/journal';
import { useClock } from './worldTime';
import { COUNTY } from './County';

/**
 * 那輛車。
 *
 * 它跟著你走,但<b>只在你附近的時候才走</b> —— 你跑遠了它就停下來等。
 * 這一條是押貨這件差事的全部:你不能先跑去探路,不能繞開那夥下山的賊,
 * 你被一輛牛車綁住了半天。
 *
 * 畫面上是兩個輪子、一個車廂、一頭牛的剪影 —— 夠讀就好。
 * 重點從來不是它多好看,是它<b>擋在你和「走快一點」之間</b>。
 */
export function Cart() {
  const version = useConvoy((s) => s.version);
  const advance = useQuest((s) => s.advance);
  const note = useJournal((s) => s.note);
  const group = useRef<THREE.Group>(null);
  /** 上次往哪一邊繞 —— 認一邊繞到底,不然會在樹前面發抖 */
  const side = useRef(0);

  const geom = useMemo(() => {
    const box = new THREE.BoxGeometry(1.5, 0.9, 2.4);
    box.translate(0, 0.95, 0);
    const shaft = new THREE.BoxGeometry(0.12, 0.12, 2.2);
    shaft.translate(0, 0.75, -2.1);
    return { box, shaft };
  }, []);
  const wheel = useMemo(() => new THREE.CylinderGeometry(0.62, 0.62, 0.14, 12), []);

  useEffect(() => {
    (window as unknown as Record<string, unknown>).__cart = () =>
      convoy.car && {
        x: Math.round(convoy.car.x), z: Math.round(convoy.car.z),
        state: convoy.car.state, worth: convoy.car.worth,
        left: convoy.car.route.length, next: convoy.car.route[0] ?? null,
        near: Math.hypot(playerPos.x - convoy.car.x, playerPos.z - convoy.car.z) < CART_LEASH,
      };
  }, []);

  useFrame((_, dt) => {
    const car = convoy.car;
    const g = group.current;
    if (!car || !g) return;
    const step = dt > 0.1 ? 0.1 : dt;

    if (car.state === 'moving') {
      const near = Math.hypot(playerPos.x - car.x, playerPos.z - car.z) < CART_LEASH;
      // 押貨的人不在,趕車的不敢走 —— 這就是那條繩子
      if (near) {
        // 車走自己的路,不追著你 —— 追著你的話,你一卡在樹叢裡,車也跟著停死
        const wp = car.route[0];
        if (wp) {
          const dx = wp[0] - car.x, dz = wp[1] - car.z;
          const d = Math.hypot(dx, dz);
          if (d < 2.0) { car.route.shift(); car.lastD = Infinity; car.stuck = 0; }
          else {
            const got = steerMove(car.x, car.z, dx / d, dz / d, CART_SPEED * step, side.current);
            if (got.side !== 0) side.current = got.side;
            car.x = got.x; car.z = got.z;
            car.y = groundAt(car.x, car.z);
            car.yaw = got.yaw;

            /*
             * 走不動就重算 —— 和玩家那邊同一條規矩。
             *
             * 這是同一個教訓第三次出現:<b>算好一條路然後閉著眼睛走完</b>,
             * 遇到路上任何一點意外就永遠卡在那裡。玩家踩過一次,
             * 車又踩了一次 —— 凡是會自己走路的東西,都要有這一段。
             */
            if (d < car.lastD - 0.05) { car.lastD = d; car.stuck = 0; }
            else {
              car.stuck += step;
              if (car.stuck > 2) {
                car.route = findPath(car.x, car.z, COUNTY.x, COUNTY.z) ?? [];
                car.stuck = 0;
                car.lastD = Infinity;
              }
            }
          }
        } else {
          // 沒有航點了卻還沒到 —— 重新問一次路
          car.route = findPath(car.x, car.z, COUNTY.x, COUNTY.z) ?? [];
        }
      }
      // 到縣城了
      if (Math.hypot(COUNTY.x - car.x, COUNTY.z - car.z) < DELIVER_AT) {
        car.state = 'delivered';
        advance();
        note(useClock.getState().day, '貨卸在縣城的行棧了。回去覆命罷。', 'good');
        useConvoy.getState().bump();
      }
    }

    g.position.set(car.x, car.y, car.z);
    g.rotation.y = car.yaw;
  });

  void version;
  const car = convoy.car;
  if (!car || car.state === 'delivered' || car.state === 'lost') return null;

  const far = Math.hypot(playerPos.x - car.x, playerPos.z - car.z) > CART_LEASH;

  return (
    <group ref={group}>
      <mesh geometry={geom.box} castShadow>
        <meshStandardMaterial color="#6b4a2c" roughness={0.85} />
      </mesh>
      <mesh geometry={geom.shaft} castShadow>
        <meshStandardMaterial color="#5a4028" roughness={0.9} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={wheel} position={[s * 0.86, 0.62, 0.2]}
          rotation={[0, 0, Math.PI / 2]} castShadow>
          <meshStandardMaterial color="#4a3423" roughness={0.9} />
        </mesh>
      ))}
      {/* 牛 —— 一個剪影就夠 */}
      <mesh position={[0, 0.85, -3.0]} castShadow>
        <boxGeometry args={[0.95, 1.0, 1.9]} />
        <meshStandardMaterial color="#6d5a44" roughness={0.9} />
      </mesh>
      {far && (
        <Billboard position={[0, 2.6, 0]}>
          <Text fontSize={0.3} color="#d08a72" outlineWidth={0.018} outlineColor="#12100c"
            anchorX="center" anchorY="bottom">
            車跟不上了
          </Text>
        </Billboard>
      )}
    </group>
  );
}
