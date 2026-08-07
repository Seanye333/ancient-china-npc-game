import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { groundAt, steerMove } from './field';
import { bodyGeom, headGeom, FIG_BODY_H, ROBES } from './figure';
import { StandingLegs, StandingArms } from './Legs';
import { COUNTY } from './County';
import { COUNTY_FOLK } from '../game/countyfolk';
import { cityfolk } from '../game/interact';
import { useHero } from '../game/hero';

/**
 * 縣城裡的人,站在各自的崗位上。
 *
 * 兩個門吏守門、掌櫃倚在客棧門口、販子守著攤 —— 這五個<b>不動</b>,
 * 只是站著微晃;三個閒人沿著南北那條街來回走。
 * 站崗的不動是刻意的:城裡人的「有人住」不是靠亂走,是靠<b>各在其位</b> ——
 * 你一進門就有人上下打量你,那一眼比十個亂走的路人有用。
 *
 * 招走的人不再出現在崗位上(和村裡同一條規矩:一個人不能有兩個)。
 */

interface Post {
  id: string;
  x: number; z: number;
  /** 走動的:在這兩點之間來回。 */
  to?: [number, number];
  yaw: number;
}

export function CountyFolk() {
  const followers = useHero((s) => s.followers);
  const { x: cx, z: cz } = COUNTY;

  const posts = useMemo<Post[]>(() => [
    { id: 'c0', x: cx - 2.6, z: cz + 25.2, yaw: Math.PI },          // 門吏,門洞兩側
    { id: 'c1', x: cx + 2.6, z: cz + 25.2, yaw: Math.PI },
    { id: 'c2', x: cx + 11.2, z: cz - 4, yaw: -Math.PI / 2 },       // 掌櫃,客棧門口
    { id: 'c3', x: cx - 3.2, z: cz + 2.5, yaw: Math.PI / 2 },       // 米行
    { id: 'c4', x: cx + 1.8, z: cz + 6.2, yaw: 0 },                 // 布攤
    { id: 'c5', x: cx, z: cz + 20, to: [cx, cz - 10], yaw: 0 },     // 沿街走的
    { id: 'c6', x: cx - 6, z: cz + 10, to: [cx + 6, cz - 2], yaw: 0 },
    { id: 'c7', x: cx + 4, z: cz - 8, to: [cx - 4, cz + 14], yaw: 0 },
  ], [cx, cz]);

  const geoms = useMemo(() => COUNTY_FOLK.map((p, i) => ({
    body: bodyGeom(new THREE.Color(ROBES[i % ROBES.length])),
    head: headGeom({
      hat: p.trade === 'market' && p.age > 40,
      old: p.age > 55, cloth: i % 3 === 0, beard: p.age > 44,
    }),
  })), []);

  const groups = useRef<Record<string, THREE.Group | null>>({});
  const walkers = useRef<Record<string, { x: number; z: number; dir: 1 | -1; side: number }>>({});

  // 這張表歸這個元件管 —— 卸載時要清乾淨,不能把影子留在互動偵測裡
  useEffect(() => () => { cityfolk.length = 0; }, []);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const step = dt > 0.1 ? 0.1 : dt;
    cityfolk.length = 0;

    for (const post of posts) {
      if (followers.includes(post.id)) continue;      // 被你招走了
      const g = groups.current[post.id];
      let x = post.x, z = post.z, yaw = post.yaw;

      if (post.to) {
        // 來回走 —— 端點對調,不記路,撞到東西讓 steerMove 自己繞
        const w = walkers.current[post.id]
          ?? (walkers.current[post.id] = { x: post.x, z: post.z, dir: 1, side: 0 });
        const tx = w.dir > 0 ? post.to[0] : post.x;
        const tz = w.dir > 0 ? post.to[1] : post.z;
        const dx = tx - w.x, dz = tz - w.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.2) w.dir = w.dir > 0 ? -1 : 1;
        else {
          const got = steerMove(w.x, w.z, dx / d, dz / d, 1.1 * step, w.side);
          if (got.side !== 0) w.side = got.side;
          w.x = got.x; w.z = got.z;
        }
        x = w.x; z = w.z; yaw = Math.atan2(dx, dz);
      }

      const y = groundAt(x, z);
      if (g) {
        const bob = post.to ? Math.abs(Math.sin(t * 5.2 + x)) * 0.05
          : Math.sin(t * 1.8 + post.x) * 0.014;
        g.position.set(x, y + bob, z);
        g.rotation.y = yaw + (post.to ? 0 : Math.sin(t * 0.7 + post.z) * 0.12);
      }
      cityfolk.push({ id: post.id, x, y, z, visible: true });
    }
  });

  return (
    <>
      {posts.map((post, i) => followers.includes(post.id) ? null : (
        <group key={post.id} ref={(o) => { groups.current[post.id] = o; }}>
          <mesh geometry={geoms[i].body} castShadow>
            <meshStandardMaterial vertexColors roughness={0.74} />
          </mesh>
          <mesh geometry={geoms[i].head} position={[0, FIG_BODY_H * 0.99, 0]} castShadow>
            <meshStandardMaterial vertexColors roughness={0.62} />
          </mesh>
          <StandingLegs />
          <StandingArms robe={ROBES[i % ROBES.length]} />
        </group>
      ))}
    </>
  );
}
