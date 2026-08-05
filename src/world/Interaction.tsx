import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { terrainHeight, slopeAt, walkable, blocked } from './field';
import {
  playerPos, presences, companions, findPresence,
  useInteract, TALK_RANGE, type Presence,
} from '../game/interact';
import { makeVillagers } from '../game/npcs';
import { FIG_BODY_H } from './figure';

/**
 * 搭話 — 走近誰,誰頭上就浮一個名字。
 *
 * 這是整個遊戲第一個「世界回應你」的地方。在此之前你走過去,
 * 那些人照樣忙自己的;現在他們會被你點亮。
 *
 * 偵測刻意<b>每 0.15 秒才跑一次</b>而不是每幀:三十幾個人的距離比較很便宜,
 * 但它會 set 到 store,每幀 set 就是每幀重繪整棵樹。
 */
export function Interaction() {
  const setNearby = useInteract((s) => s.setNearby);
  const nearbyId = useInteract((s) => s.nearbyId);
  const talkingTo = useInteract((s) => s.talkingTo);
  const open = useInteract((s) => s.open);

  const villagers = useMemo(() => makeVillagers(38), []);
  const byId = useMemo(
    () => Object.fromEntries(villagers.map((v) => [v.id, v])),
    [villagers],
  );

  const acc = useRef(0);
  const markRef = useRef<THREE.Group>(null);

  // E 搭話 — 綁在 window 上,因為 canvas 本身不吃鍵盤焦點
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyE') return;
      const { nearbyId: near, talkingTo: busy } = useInteract.getState();
      if (busy || !near) return;
      open(near);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // 原型階段把狀態掛到 window,截圖腳本才驗得到(canvas 裡的文字 DOM 抓不著)
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__near = () => useInteract.getState().nearbyId;
    // 直接開口 —— 驗收腳本要點對話裡的按鈕,不必先走三十步過去追人
    w.__talkTo = (id: string) => { useInteract.getState().open(id); };
    // 診斷用:玩家在哪、最近的人多遠 —— 找不到人的時候得知道是誰的問題
    // 走向指定的人 —— 診斷用,也是將來「地圖上點某人」的雛形
    w.__walkToNpc = (id: string) => {
      const p = findPresence(id);
      if (p) (window as unknown as Record<string, (x: number, z: number) => void>)
        .__walkTo(p.x, p.z);
      return !!p;
    };
    // 隊形檢查:每個隨行的人在你身後多遠(負數 = 跑到你前面去了)
    w.__line = () => companions.map((c) => {
      const dx = c.x - playerPos.x, dz = c.z - playerPos.z;
      const back = -(dx * Math.sin(playerPos.yaw) + dz * Math.cos(playerPos.yaw));
      const side = dx * Math.cos(playerPos.yaw) - dz * Math.sin(playerPos.yaw);
      return { id: c.id, back: +back.toFixed(2), side: +side.toFixed(2) };
    });
    // 腳下這塊地怎麼回事 —— 卡住的時候要分得清是山、是水、還是樹
    w.__terrain = (x: number, z: number) => ({
      h: +terrainHeight(x, z).toFixed(2),
      slope: +slopeAt(x, z).toFixed(2),
      walk: walkable(x, z),
      blocked: blocked(x, z, 0.34),
    });
    w.__probe = () => {
      let nearest = Infinity;
      let visible = 0;
      for (const p of presences) {
        if (!p.visible) continue;
        visible++;
        nearest = Math.min(nearest, Math.hypot(p.x - playerPos.x, p.z - playerPos.z));
      }
      let bx = 0; let bz = 0; let bd = Infinity;
      for (const p of presences) {
        if (!p.visible) continue;
        const d = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
        if (d < bd) { bd = d; bx = p.x - playerPos.x; bz = p.z - playerPos.z; }
      }
      return {
        player: [Math.round(playerPos.x), Math.round(playerPos.z)],
        presences: presences.length + companions.length, visible,
        nearest: Number.isFinite(nearest) ? Math.round(nearest) : null,
        toward: [bx, bz],
      };
    };
  }, []);

  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current > 0.15) {
      acc.current = 0;
      let best: Presence | null = null;
      let bestD = TALK_RANGE;
      for (const list of [presences, companions]) {
        for (const p of list) {
          if (!p.visible) continue;
          const d = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
          if (d <= bestD) { bestD = d; best = p; }
        }
      }
      setNearby(best ? best.id : null);
    }
    // 標記跟著人走 —— 對方在動,標籤黏在頭上而不是釘在地上
    if (markRef.current && nearbyId) {
      const p = findPresence(nearbyId);
      if (p) markRef.current.position.set(p.x, p.y + FIG_BODY_H + 0.95, p.z);
    }
  });

  if (!nearbyId || talkingTo) return null;
  const npc = byId[nearbyId];
  if (!npc) return null;

  return (
    <group ref={markRef}>
      <Billboard>
        <Text fontSize={0.26} color="#f4ead6" outlineWidth={0.018} outlineColor="#12100c"
          anchorX="center" anchorY="bottom">
          {npc.name}
        </Text>
        <Text position={[0, -0.30, 0]} fontSize={0.17} color="#c8a45a"
          outlineWidth={0.014} outlineColor="#12100c"
          anchorX="center" anchorY="bottom">
          E · 搭話
        </Text>
      </Billboard>
    </group>
  );
}
