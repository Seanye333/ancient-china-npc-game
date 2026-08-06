import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { groundAt, slideMove } from './field';
import { MARKET } from './sites';
import { bodyGeom, headGeom, FIG_BODY_H, FIG_HR } from './figure';
import { raidParties, useRaids } from '../game/raids';
import { useBands } from '../game/bands';
import { useVillage } from '../game/village';
import { useClock } from '../world/worldTime';
import { note } from '../game/journal';

/**
 * 下山的那幾夥人,在路上走著的樣子。
 *
 * 移動走模組級陣列 + 每幀更新,和戰鬥同一套:位置每幀在變,進 store 就是
 * 每幀重繪整棵樹。他們走得比你慢(1.5 對 2.6)—— 你追得上,
 * 但要是等到他們進了村,追上去也沒用了。
 */

const SPEED = 1.5;
/** 到村口算「到了」。不用 0,不然他們會擠進屋子中間。 */
const ARRIVE = 9;
/** 搶完賴一會兒再走 —— 給你趕回來的機會。 */
const LINGER = 26;

export function Raiders() {
  const version = useRaids((s) => s.version);
  const geoms = useMemo(() => ({
    body: bodyGeom(new THREE.Color('#4a3f42')),
    head: headGeom(false),
  }), []);
  const bladeGeom = useMemo(() => {
    const g = new THREE.BoxGeometry(0.05, 0.5, 0.1);
    g.translate(0, 0.34, 0);
    return g;
  }, []);
  const groups = useRef<Record<string, THREE.Group | null>>({});
  const torches = useRef<Record<string, THREE.Group | null>>({});
  const lights = useRef<Record<string, THREE.PointLight | null>>({});

  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__raids = () => raidParties.map((r) => ({
      id: r.id, band: r.name, count: r.count, phase: r.phase,
      at: [Math.round(r.x), Math.round(r.z)],
    }));
  }, []);

  useFrame((_, dt) => {
    if (!raidParties.length) return;
    const step = dt > 0.1 ? 0.1 : dt;
    let changed = false;

    for (let i = raidParties.length - 1; i >= 0; i--) {
      const r = raidParties[i];
      if (r.fighting) continue;      // 正在跟你打,原地不動
      const camp = useBands.getState().bands.find((b) => b.id === r.bandId);

      if (r.phase === 'raiding') {
        r.linger -= step;
        if (r.linger <= 0) { r.phase = 'back'; changed = true; }
      } else {
        const [tx, tz] = r.phase === 'out'
          ? [MARKET[0], MARKET[1]]
          : [camp?.x ?? r.x, camp?.z ?? r.z];
        const dx = tx - r.x, dz = tz - r.z;
        const d = Math.hypot(dx, dz);

        if (r.phase === 'out' && d < ARRIVE) {
          // 到村口了 —— 搶。你沒趕上,這就是代價
          const v = useVillage.getState();
          const bite = 3 + Math.round(r.count * 1.6 * (0.6 + r.fierce));
          v.nudge({
            order: v.order - bite,
            harvest: Math.max(0, v.harvest - Math.round(bite * 0.7)),
          });
          note(useClock.getState().day,
            `${r.name}的人下來了,搶了村東幾戶。你不在。`, 'bad');
          r.phase = 'raiding';
          r.linger = LINGER;
          changed = true;
        } else if (r.phase === 'back' && d < 4) {
          raidParties.splice(i, 1);
          changed = true;
          continue;
        } else if (d > 0.01) {
          const nx = r.x + (dx / d) * SPEED * step;
          const nz = r.z + (dz / d) * SPEED * step;
          const got = slideMove(r.x, r.z, nx, nz);
          r.x = got.x; r.z = got.z;
          r.y = groundAt(r.x, r.z);
          r.yaw = Math.atan2(dx, dz);
        }
      }

      const g = groups.current[r.id];
      if (g) {
        g.position.set(r.x, r.y, r.z);
        g.rotation.set(0, r.yaw, 0);
      }
      /**
       * 夜裡打火把 —— 「路上的賊夜裡看得遠」終於有了畫面上的解釋:
       * 他們自己就是移動的光源,你在黑地裡看見那點火,他們也看得見你。
       */
      const hr = useClock.getState().hour;
      const night = hr < 5.6 || hr > 19.2;
      const tg = torches.current[r.id];
      if (tg) tg.visible = night;
      const li = lights.current[r.id];
      if (li) {
        li.visible = night;
        if (night) li.intensity = 5.5 + Math.sin(performance.now() * 0.011 + r.x) * 1.4;
      }
    }
    if (changed) useRaids.getState().bump();
  });

  void version;
  if (!raidParties.length) return null;

  return (
    <>
      {raidParties.map((r) => (
        <group key={r.id} ref={(o) => { groups.current[r.id] = o; }}>
          {/* 火把:一根桿 + 兩片交叉的火焰,HDR 色靠 bloom 發光;一夥一盞點光 */}
          <group ref={(o) => { torches.current[r.id] = o; }}
                 position={[0.55, FIG_BODY_H * 0.9, 0.2]}>
            <mesh>
              <cylinderGeometry args={[0.03, 0.04, 0.85, 5]} />
              <meshStandardMaterial color="#4a3524" roughness={0.9} />
            </mesh>
            <mesh position={[0, 0.55, 0]}>
              <coneGeometry args={[0.13, 0.4, 6]} />
              <meshBasicMaterial color={new THREE.Color(3.4, 1.6, 0.5)} toneMapped={false} />
            </mesh>
          </group>
          <pointLight ref={(o) => { lights.current[r.id] = o; }}
            position={[0.55, FIG_BODY_H * 1.6, 0.2]} distance={16} decay={1.6}
            color="#ff9a4a" intensity={5.5} />
          {/* 一夥人畫成幾個並排的身子 —— 人數看得出來就夠了 */}
          {Array.from({ length: Math.min(4, r.count) }, (_, k) => {
            const off = (k - (Math.min(4, r.count) - 1) / 2) * 0.9;
            return (
              <group key={k} position={[Math.cos(r.yaw) * off, 0, -Math.sin(r.yaw) * off]}>
                <mesh geometry={geoms.body} castShadow>
                  <meshStandardMaterial vertexColors roughness={0.74} />
                </mesh>
                <mesh geometry={geoms.head} position={[0, FIG_BODY_H * 0.99, 0]} castShadow>
                  <meshStandardMaterial vertexColors roughness={0.62} />
                </mesh>
                <mesh geometry={bladeGeom} castShadow
                  position={[FIG_HR * 0.95, FIG_BODY_H * 0.44, 0]}
                  rotation={[-1.1, 0, 0.25]}>
                  <meshStandardMaterial color="#7d7a72" roughness={0.42} metalness={0.55} />
                </mesh>
              </group>
            );
          })}
        </group>
      ))}
    </>
  );
}
