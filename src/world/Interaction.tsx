import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { terrainHeight, slopeAt, walkable, blocked } from './field';
import {
  playerPos, presences, companions, cityfolk, findPresence,
  useInteract, TALK_RANGE, type Presence,
} from '../game/interact';
import { makeVillagers } from '../game/npcs';
import { placeAt, placeById } from '../game/places';
import { COUNTY_FOLK } from '../game/countyfolk';
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
/**
 * 牌子上那個動詞。
 *
 * 新加一種場所<b>一定要在這裡補一行</b> —— 漏了的話牌子上會寫「F · undefined」,
 * 而那是只有走到跟前才看得見的錯:面板本身好端端的,測試也全綠。
 */
const PLACE_VERB: Record<string, string> = {
  market: '糴糶', work: '做活', home: '歇息', tavern: '進去',
  inn: '投宿', yamen: '進去', refugees: '上前', fair: '湊過去',
  herb: '採藥', apothecary: '進去', sickbed: '探病',
};

export function Interaction() {
  const setNearby = useInteract((s) => s.setNearby);
  const nearbyId = useInteract((s) => s.nearbyId);
  const talkingTo = useInteract((s) => s.talkingTo);
  const nearPlace = useInteract((s) => s.nearPlace);
  const open = useInteract((s) => s.open);

  const villagers = useMemo(() => makeVillagers(38), []);
  const byId = useMemo(
    () => Object.fromEntries([...villagers, ...COUNTY_FOLK].map((v) => [v.id, v])),
    [villagers],
  );

  const acc = useRef(0);
  const markRef = useRef<THREE.Group>(null);

  /**
   * E 搭話、F 用場所 —— <b>兩顆鍵,不是一顆</b>。
   *
   * 第一版讓 E 兼管兩者,人優先於地方。看起來省事,實際上把市集和碼頭
   * 變成了進不去的地方:那兩處本來就整天站著人 —— 販子在市集、船工在碼頭。
   * 「人優先」等於「你永遠只能跟他們說話,永遠糴不到米」。
   *
   * 同一個位置上兩件事都成立的時候,不該由程式替玩家猜哪一件。
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useInteract.getState();
      if (st.talkingTo || st.atPlace) return;
      if (e.code === 'KeyE' && st.nearbyId) open(st.nearbyId);
      if (e.code === 'KeyF' && st.nearPlace) st.openPlace(st.nearPlace);
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
      for (const list of [presences, companions, cityfolk]) {
        for (const p of list) {
          if (!p.visible) continue;
          const d = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
          if (d <= bestD) { bestD = d; best = p; }
        }
      }
      setNearby(best ? best.id : null);
      const here = placeAt(playerPos.x, playerPos.z);
      useInteract.getState().setNearPlace(here ? here.id : null);
    }
    // 標記跟著人走 —— 對方在動,標籤黏在頭上而不是釘在地上
    if (markRef.current && nearbyId) {
      const p = findPresence(nearbyId);
      if (p) markRef.current.position.set(p.x, p.y + FIG_BODY_H + 0.95, p.z);
    }
  });

  if (talkingTo) return null;

  const here = nearPlace ? placeById(nearPlace) : null;
  const npc = nearbyId ? byId[nearbyId] : null;

  // 兩塊牌子可以同時掛著 —— 站在市集上跟販子說話,和糴米,是兩件事
  return (
    <>
      {here && (
        <group position={[here.x, here.y + 1.9, here.z]}>
          <Billboard>
            <Text fontSize={0.28} color="#f4ead6" outlineWidth={0.018} outlineColor="#12100c"
              anchorX="center" anchorY="bottom">
              {here.label}
            </Text>
            <Text position={[0, -0.32, 0]} fontSize={0.17} color="#c8a45a"
              outlineWidth={0.014} outlineColor="#12100c"
              anchorX="center" anchorY="bottom">
              F · {PLACE_VERB[here.kind]}
            </Text>
          </Billboard>
        </group>
      )}
      {npc && (
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
      )}
    </>
  );
}
