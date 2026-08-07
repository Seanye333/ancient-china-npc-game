import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { groundAt, slideMove } from './field';
import {
  ROBES, bodyGeom, headGeom, legSwing, poseLeg, FIG_BODY_H, FIG_LEG_H,
} from './figure';
import { sharedLegGeom } from './Legs';
import { playerPos, companions } from '../game/interact';
import { useHero } from '../game/hero';
import { useBattle } from '../game/combat';
import { anyPerson } from '../game/countyfolk';

/**
 * 隨行的人 — 跟在你身後那幾個。
 *
 * 他們排成一列跟著走,而不是擠成一團:<b>看得出「這是一支隊伍」</b>
 * 才有帶隊的感覺。跟得也不緊 —— 各自留一段距離、腳步不同步,
 * 整齊劃一反而像方陣不像同伴。
 *
 * 位置用<b>玩家的足跡</b>算:記下你走過的點,第 N 個人就踩在你 N 步之前的位置。
 * 這比每個人各自追著你跑省事,而且天然會繞開你繞過的東西。
 */

const TRAIL_STEP = 0.55;      // 每隔這麼遠記一個足跡
const GAP = 3;                // 每個人相隔幾個足跡
const NONE: string[] = [];
const STAGGER = 0.42;         // 左右錯開一點 —— 完全踩在同一條線上,後面的人會被前面的人擋光

export function Followers() {
  // 打起來以後,這幾個人歸 Battle 畫(那邊要擺姿態)—— 這裡讓開,
  // 否則同一個人會有兩具身體站在戰場上
  const inBattle = useBattle((s) => s.bandId !== null);
  const all = useHero((s) => s.followers);
  // 選擇器裡不能現生一個 [] —— 每次都是新的參考,zustand 會判定「變了」而無限重繪。
  // (第一版就是這樣把整個頁面凍住的。)
  const followers = inBattle ? NONE : all;

  // 名字與武力都從 anyPerson 查 —— 縣城招來的人不在村民名冊裡
  const byId = useMemo(
    () => Object.fromEntries(followers.map((id) => [id, anyPerson(id)])),
    [followers],
  );

  // 足跡環形緩衝 — 夠十個人跟
  const trail = useRef<Array<{ x: number; z: number; yaw: number }>>([]);
  const lastRec = useRef({ x: Infinity, z: Infinity });

  const geoms = useMemo(
    () => ROBES.map((hex, i) => ({
      body: bodyGeom(new THREE.Color(hex)),
      head: headGeom(i % 2 === 1),
    })),
    [],
  );

  const bodyRefs = useRef<Array<THREE.Mesh | null>>([]);
  const headRefs = useRef<Array<THREE.Mesh | null>>([]);
  /** 每人兩條腿:legRefs.current[i * 2 + (左0/右1)]。 */
  const legRefs = useRef<Array<THREE.Mesh | null>>([]);
  const phase = useRef<number[]>([]);

  useLayoutEffect(() => {
    phase.current = followers.map((_, i) => i * 1.7);
  }, [followers]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (inBattle) { companions.length = 0; return; }
    companions.length = 0;

    // 記足跡
    const d = Math.hypot(playerPos.x - lastRec.current.x, playerPos.z - lastRec.current.z);
    if (d > TRAIL_STEP) {
      lastRec.current = { x: playerPos.x, z: playerPos.z };
      trail.current.unshift({ x: playerPos.x, z: playerPos.z, yaw: playerPos.yaw });
      if (trail.current.length > 60) trail.current.length = 60;
    }

    followers.forEach((_, i) => {
      const body = bodyRefs.current[i];
      const head = headRefs.current[i];
      if (!body || !head) return;

      const spot = trail.current[(i + 1) * GAP];
      // 足跡還沒攢夠就先待在玩家旁邊,別讓人憑空出現在原點
      const yaw = spot ? spot.yaw : playerPos.yaw;
      const off = (i % 2 === 0 ? 1 : -1) * STAGGER * Math.min(1, (i + 1) / 2);
      const ox = Math.cos(yaw) * off, oz = -Math.sin(yaw) * off;
      const tx = (spot ? spot.x : playerPos.x - Math.sin(playerPos.yaw) * (1.2 + i * 0.7)) + ox;
      const tz = (spot ? spot.z : playerPos.z - Math.cos(playerPos.yaw) * (1.2 + i * 0.7)) + oz;

      const got = slideMove(tx, tz, tx, tz);
      const y = groundAt(got.x, got.z);
      const moving = d > 0.01 || trail.current.length > (i + 1) * GAP;
      const step = t * 3.4 + (phase.current[i] ?? 0);
      const bob = moving ? Math.abs(Math.sin(step)) * 0.05 : Math.sin(t * 1.2 + i) * 0.012;

      body.position.set(got.x, y + bob, got.z);
      body.rotation.set(0, yaw, moving ? Math.sin(step * 0.5) * 0.05 : 0);
      head.position.set(got.x, y + bob + FIG_BODY_H * 0.99, got.z);
      head.rotation.set(0, yaw + Math.sin(t * 0.6 + i * 2.1) * 0.2, 0);
      for (const side of [-1, 1] as const) {
        const leg = legRefs.current[i * 2 + (side < 0 ? 0 : 1)];
        if (leg) {
          poseLeg(leg, side, got.x, y + bob * 0.5 + FIG_LEG_H, got.z, yaw,
            legSwing(step, side, moving));
        }
      }
      companions.push({ id: followers[i], x: got.x, y, z: got.z, visible: true });
    });
  });

  return (
    <>
      {followers.map((id, i) => {
        const npc = byId[id];
        const g = geoms[(npc ? npc.name.charCodeAt(0) : i) % geoms.length];
        return (
          <group key={id}>
            <mesh ref={(m) => { bodyRefs.current[i] = m; }} geometry={g.body} castShadow>
              <meshStandardMaterial vertexColors roughness={0.74} />
            </mesh>
            <mesh ref={(m) => { headRefs.current[i] = m; }} geometry={g.head} castShadow>
              <meshStandardMaterial vertexColors roughness={0.62} />
            </mesh>
            {[0, 1].map((k) => (
              <mesh key={k} ref={(m) => { legRefs.current[i * 2 + k] = m; }}
                geometry={sharedLegGeom()} castShadow>
                <meshStandardMaterial vertexColors roughness={0.8} />
              </mesh>
            ))}
          </group>
        );
      })}
    </>
  );
}
