import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { groundAt, slideMove } from './field';
import { bodyGeom, headGeom, FIG_BODY_H, FIG_HR } from './figure';
import { playerPos } from '../game/interact';
import { useHero } from '../game/hero';
import { useBands } from '../game/bands';
import { raidParties, useRaids } from '../game/raids';
import { useQuest } from '../game/quest';
import { lifeTally } from '../game/daily';
import { useClock } from './worldTime';
import { swingSound, hitSound, hurtSound } from '../game/audio';
import { makeVillagers, might } from '../game/npcs';
import {
  fighters, beginBattle, stepBattle, battleOver, playerStrike, useBattle,
  alive, type Fighter,
} from '../game/combat';

/**
 * 打起來的樣子。
 *
 * 這裡只負責<b>把 combat.ts 算出來的事畫出來</b> —— 誰在走、誰在揮、誰倒了。
 * 沒有一條血條浮在頭上:傷勢用姿態講(踉蹌、單膝、趴下),
 * 因為這場架的重點是「畫面上還站著幾個人」,不是誰剩幾點血。
 *
 * 接戰的距離刻意給得寬(18 步):遠遠看見那夥人動起來、朝你走過來的那幾秒,
 * 是這個系統唯一的前搖。少了它,遭遇戰會像被偷襲。
 */

const ENGAGE = 18;
/**
 * 天黑以後他們遠遠就盯上你了。
 *
 * 這是「夜裡在野外是危險的」最便宜也最誠實的做法:不加一套夜間事件,
 * 只把察覺的距離拉開。於是「天要黑了,還去不去那趟」變成一個真的問題,
 * 而不是一句氣氛描寫。
 */
const ENGAGE_NIGHT = 30;

/** 我方出陣的人 —— 蹲窩的和攔路的兩處都要,抽出來免得各寫一份走樣。 */
function ourSide(
  hero: ReturnType<typeof useHero.getState>,
  byId: Record<string, ReturnType<typeof makeVillagers>[number]>,
) {
  return [
    { id: 'you', name: hero.name, war: hero.stats.war, isPlayer: true },
    ...hero.followers.map((id) => ({
      id: `mate-${id}`, npcId: id,
      name: byId[id]?.name ?? '同行', war: byId[id] ? might(byId[id]) : 40,
    })),
  ];
}

const FOE_ROBE = '#4a3f42';
const FOE_CHIEF_ROBE = '#5c3a33';

export function Battle() {
  const bands = useBands((s) => s.bands);
  const rout = useBands((s) => s.rout);
  const bandId = useBattle((s) => s.bandId);
  const tally = useBattle((s) => s.tally);
  const finish = useBattle((s) => s.finish);

  const villagers = useMemo(() => makeVillagers(38), []);
  const byId = useMemo(
    () => Object.fromEntries(villagers.map((v) => [v.id, v])), [villagers],
  );

  const geoms = useMemo(() => ({
    foe: { body: bodyGeom(new THREE.Color(FOE_ROBE)), head: headGeom(false) },
    chief: { body: bodyGeom(new THREE.Color(FOE_CHIEF_ROBE)), head: headGeom(true) },
    mate: { body: bodyGeom(new THREE.Color('#6b5741')), head: headGeom(false) },
  }), []);

  // 刀 = 柄 + 護手 + 身。三塊而已,但少了護手就只是一根白棍子
  const bladeGeom = useMemo(() => {
    const blade = new THREE.BoxGeometry(0.05, 0.56, 0.115);
    blade.translate(0, 0.42, 0.012);
    const guard = new THREE.BoxGeometry(0.14, 0.045, 0.14);
    guard.translate(0, 0.14, 0);
    const grip = new THREE.BoxGeometry(0.045, 0.16, 0.05);
    grip.translate(0, 0.05, 0);
    return mergeGeometries([blade, guard, grip], false)!;
  }, []);

  /** 這一場打的是「下山的那一夥」嗎 —— 收場的結算不一樣:窩還在,只是人少了。 */
  const engagedRaid = useRef<{ partyId: string; bandId: string; name: string } | null>(null);
  const lastHurt = useRef(-1);
  const groups = useRef<Record<string, THREE.Group | null>>({});
  const blades = useRef<Record<string, THREE.Group | null>>({});
  const bodies = useRef<Record<string, THREE.Mesh | null>>({});

  // 空白鍵出手 —— 綁 window,canvas 不吃鍵盤焦點
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      e.preventDefault();
      if (playerStrike('you')) swingSound();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 原型階段的探針:截圖腳本要能問「場上還剩幾個人、誰在幹嘛」
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__battle = () => ({
      bandId: useBattle.getState().bandId,
      tally: useBattle.getState().tally,
      ours: fighters.filter((f) => f.side === 'you' && alive(f)).length,
      foes: fighters.filter((f) => f.side === 'foe' && alive(f)).length,
      me: fighters.find((f) => f.isPlayer)
        ? { hp: Math.round(fighters.find((f) => f.isPlayer)!.hp), stance: fighters.find((f) => f.isPlayer)!.stance }
        : null,
      list: fighters.map((f) => ({ id: f.id, side: f.side, hp: Math.round(f.hp), stance: f.stance })),
    });
    w.__strike = () => playerStrike('you');
    // 走向還站著的敵人 —— 診斷用,也是將來「鎖定目標」的雛形
    w.__closeIn = () => {
      const foe = fighters.find((f) => f.side === 'foe' && alive(f));
      if (!foe) return null;
      (window as unknown as Record<string, (x: number, z: number) => void>)
        .__walkTo(foe.x, foe.z);
      return [Math.round(foe.x), Math.round(foe.z)];
    };
    // 就地開一場 —— 平衡與畫面驗收不必每次都走半張地圖過去
    w.__forceBattle = (x: number, z: number, count: number, fierce: number) => {
      const hero = useHero.getState();
      beginBattle({
        ours: [
          { id: 'you', name: hero.name, war: hero.stats.war, isPlayer: true },
          ...hero.followers.map((id) => ({
            id: `mate-${id}`, npcId: id,
            name: byId[id]?.name ?? '同行', war: byId[id] ? might(byId[id]) : 40,
          })),
        ],
        band: { id: 'spar', x, z, fierce, count },
        at: { x: playerPos.x, z: playerPos.z },
        ground: groundAt,
        leadership: hero.stats.leadership,
      });
    };
    // 驗收用:直接把一夥打散,不必真的走過去打一場
    w.__routBand = (id: string) => useBands.getState().rout(id);
    w.__bands = () => useBands.getState().bands.map((b) => ({
      id: b.id, name: b.name, x: Math.round(b.x), z: Math.round(b.z),
      count: b.count, routed: b.routed,
    }));
  }, []);

  useFrame((_, dt) => {
    const step = dt > 0.1 ? 0.1 : dt;
    const st = useBattle.getState();

    // 還沒開打:看看有沒有撞上哪一夥。
    // 兩種:蹲在窩裡的,和下了山在路上走的 —— 後者才是「治安差」真正的樣子
    if (!st.bandId) {
      const hr = useClock.getState().hour;
      const night = hr < 5.6 || hr > 19.2;
      const reach = night ? ENGAGE_NIGHT : ENGAGE;
      for (const r of raidParties) {
        if (r.fighting) continue;
        if (Math.hypot(r.x - playerPos.x, r.z - playerPos.z) > reach) continue;
        const hero = useHero.getState();
        beginBattle({
          ours: ourSide(hero, byId),
          band: { id: r.id, x: r.x, z: r.z, fierce: r.fierce, count: r.count },
          at: { x: playerPos.x, z: playerPos.z }, ground: groundAt,
          leadership: hero.stats.leadership,
        });
        // 掛旗子而不是刪掉 —— 刪了的話你打輸,他們就憑空消失,
        // 攔路失敗反而幫村子解了圍
        r.fighting = true;
        useRaids.getState().bump();
        engagedRaid.current = { partyId: r.id, bandId: r.bandId, name: r.name };
        return;
      }
      for (const b of bands) {
        if (b.routed) continue;
        if (Math.hypot(b.x - playerPos.x, b.z - playerPos.z) > reach) continue;
        const hero = useHero.getState();
        engagedRaid.current = null;
        beginBattle({
          ours: ourSide(hero, byId),
          band: { id: b.id, x: b.x, z: b.z, fierce: b.fierce, count: b.count },
          at: { x: playerPos.x, z: playerPos.z }, ground: groundAt,
          leadership: hero.stats.leadership,
        });
        break;
      }
      return;
    }
    if (st.tally) return;      // 打完了,等玩家收場

    // 玩家那一格由鍵盤推,這裡只把座標同步進戰鬥模型
    const me = fighters.find((f) => f.isPlayer);
    if (me && me.stance !== 'down') {
      me.x = playerPos.x; me.z = playerPos.z; me.y = playerPos.y; me.yaw = playerPos.yaw;
    }

    stepBattle(step, groundAt, slideMove);

    const over = battleOver();
    if (over) finish(over);
  });

  // 每幀把算好的位置搬到 three 的物件上
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    // 誰在這一幀挨了打 —— hurtAt 是現成的,不必另外開一條事件線
    for (const f of fighters) {
      if (t - f.hurtAt < 0.05 && f.hurtAt > lastHurt.current) {
        lastHurt.current = f.hurtAt;
        if (f.isPlayer) hurtSound(); else hitSound();
      }
    }
    for (const f of fighters) {
      const g = groups.current[f.id];
      if (!g) continue;
      if (f.isPlayer) { g.visible = false; continue; }   // 玩家由 Player.tsx 畫
      g.visible = true;
      poseInto(g, bodies.current[f.id], blades.current[f.id], f, t);
    }
  });

  /**
   * 收場之後,世界要跟著改。
   *
   * <b>只有打贏才算散</b> —— 先前這裡不看勝負一律 rout(),於是你被打趴在地上,
   * 那夥賊也跟著人間蒸發,連帶把「打輸了要再來一次」整條路砍掉。
   * 打輸他們還在原地,這才是打輸該有的樣子。
   */
  useEffect(() => {
    if (!tally || !bandId) return;

    /*
     * 打的是下山那一夥:窩還在,但出來的這幾個是從窩裡出來的,窩就該少這麼多人。
     * 直接 rout 整個營地會讓「攔路」比「端窩」還划算,那說不通。
     * 打輸了他們接著往村子走 —— 你攔不住,村子就得挨這一下。
     */
    const raid = engagedRaid.current;
    if (raid) {
      engagedRaid.current = null;
      const i = raidParties.findIndex((r) => r.id === raid.partyId);
      if (tally.won) {
        if (i >= 0) raidParties.splice(i, 1);
        const gone = tally.foesDown + tally.foesFled;
        useBands.setState((s) => ({
          bands: s.bands.map((b) => (b.id === raid.bandId
            ? { ...b, count: Math.max(0, b.count - gone), routed: b.count - gone <= 0 }
            : b)),
        }));
      } else if (i >= 0) {
        raidParties[i].fighting = false;
      }
      useRaids.getState().bump();
      return;
    }

    if (!tally.won) return;
    rout(bandId);
    lifeTally.bandsCleared++;
    // 若這正是你接下的活,回去就能覆命了
    const q = useQuest.getState();
    if (q.taken && q.taken.bandId === bandId) q.markCleared();
  }, [tally, bandId, rout]);

  if (!bandId) return null;

  return (
    <>
      {fighters.map((f) => {
        const g = f.isPlayer ? geoms.mate
          : f.side === 'foe' ? (f.chief ? geoms.chief : geoms.foe) : geoms.mate;
        return (
          <group key={f.id} ref={(o) => { groups.current[f.id] = o; }}>
            <mesh ref={(o) => { bodies.current[f.id] = o; }} geometry={g.body} castShadow>
              <meshStandardMaterial vertexColors roughness={0.74} />
            </mesh>
            <mesh geometry={g.head} position={[0, FIG_BODY_H * 0.99, 0]} castShadow>
              <meshStandardMaterial vertexColors roughness={0.62} />
            </mesh>
            {/* 掛在手上 —— 手的位置在 figure.ts 裡是 (0.92r, 0.32h, -0.12r),
                先前刀擺在 0.44h,離手約一掌高,近看就看得出來 */}
            <group ref={(o) => { blades.current[f.id] = o; }}
                   position={[FIG_HR * 0.92, FIG_BODY_H * 0.32, -FIG_HR * 0.12]}>
              <mesh geometry={bladeGeom} castShadow>
                <meshStandardMaterial color={f.side === 'foe' ? '#7d7a72' : '#9aa0a6'}
                                      roughness={0.42} metalness={0.55} />
              </mesh>
            </group>
          </group>
        );
      })}
    </>
  );
}

/**
 * 姿態 — 這是整個戰鬥唯一的「動畫」。
 *
 * 沒有骨架,能動的只有整個身子的傾斜、上下、以及刀的角度。
 * 但這幾樣已經夠讀:前傾+刀掄下去是砍,後仰是挨打,躺平是倒了。
 * <b>剪影讀得出來就夠了</b> —— 這個世界的人本來就是靠剪影認的。
 */
function poseInto(
  g: THREE.Group, body: THREE.Mesh | null, blade: THREE.Group | null,
  f: Fighter, t: number,
) {
  g.position.set(f.x, f.y, f.z);
  g.rotation.set(0, f.yaw, 0);

  const hurtFlash = t - f.hurtAt < 0.18;

  switch (f.stance) {
    case 'down': {
      // 倒下 — 往前撲,不是原地消失
      g.rotation.x = -Math.PI * 0.46;
      g.position.y = f.y + 0.12;
      if (blade) blade.rotation.set(0, 0, -1.4);
      break;
    }
    case 'striking': {
      // 掄過頂再劈下來
      const p = f.phase;
      const arc = p < 0.42 ? -1.9 + p * 1.2 : -1.4 + (p - 0.42) * 5.4;
      if (blade) blade.rotation.set(arc, 0, 0.2);
      g.rotation.x = Math.sin(Math.min(1, p * 1.6) * Math.PI) * 0.22;
      g.position.y = f.y;
      break;
    }
    case 'reeling': {
      g.rotation.x = -Math.sin(f.phase * Math.PI) * 0.34;
      g.position.y = f.y;
      if (blade) blade.rotation.set(-0.6, 0, 0.9);
      break;
    }
    case 'fleeing': {
      g.position.y = f.y + Math.abs(Math.sin(f.phase * Math.PI * 2)) * 0.075;
      g.rotation.x = 0.14;
      if (blade) blade.rotation.set(-1.2, 0, 0.4);
      break;
    }
    case 'closing': {
      g.position.y = f.y + Math.abs(Math.sin(f.phase * Math.PI * 2)) * 0.05;
      g.rotation.x = 0.06;
      if (blade) blade.rotation.set(-0.9 + Math.sin(t * 3 + f.x) * 0.06, 0, 0.25);
      break;
    }
    default: {
      // 對峙 — 刀舉著,身子輕微晃,別像個立牌
      g.position.y = f.y + Math.sin(t * 2.2 + f.z) * 0.012;
      g.rotation.x = 0.03;
      if (blade) blade.rotation.set(-1.35 + Math.sin(t * 2.6 + f.x) * 0.08, 0, 0.22);
    }
  }

  if (body) {
    const m = body.material as THREE.MeshStandardMaterial;
    // 挨打閃一下 —— 沒有血條,這是唯一的「中了」回饋
    m.emissive.setRGB(hurtFlash ? 0.45 : 0, 0, 0);
  }
}
