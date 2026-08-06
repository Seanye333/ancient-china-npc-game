import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { groundAt, slideMove } from './field';
import { bodyGeom, headGeom, FIG_BODY_H, FIG_HR } from './figure';
import { playerPos } from '../game/interact';
import { useHero, woundPenalty } from '../game/hero';
import { useBands, chiefAccepts } from '../game/bands';
import { raidParties, useRaids } from '../game/raids';
import { useQuest } from '../game/quest';
import { lifeTally } from '../game/daily';
import { useClock } from './worldTime';
import { swingSound, hitSound, hurtSound, bowSound } from '../game/audio';
import { WEAPONS } from '../game/weapons';
import { note } from '../game/journal';
import { makeVillagers, might } from '../game/npcs';
import {
  fighters, arrows, arrowTally, stuckArrows, beginBattle, stepBattle, battleOver,
  playerStrike, useBattle, alive, fx, type Fighter,
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
 * 夜裡的規矩,一句話說得出口:<b>路上的賊看得遠,窩裡的賊在睡覺</b>。
 *
 * 下了山在走的那夥,夜裡打著火把、豎著耳朵 —— 三十步就盯上你;
 * 蹲在窩裡的,火塘一滅各睡各的 —— 你摸到十一步他們才驚醒。
 * 這一反一正,「天黑了」就從一句氣氛描寫變成一道選擇題:
 * 夜路危險,可是夜襲正是時候。
 */
const ENGAGE_NIGHT = 30;
const CAMP_NIGHT = 11;

/** 我方出陣的人 —— 蹲窩的和攔路的兩處都要,抽出來免得各寫一份走樣。 */
function ourSide(
  hero: ReturnType<typeof useHero.getState>,
  byId: Record<string, ReturnType<typeof makeVillagers>[number]>,
) {
  const pen = woundPenalty(hero);
  return [
    {
      id: 'you', name: hero.name, war: hero.stats.war, isPlayer: true,
      // 臂上帶著傷,同一把刀砍下去就是輕 —— 帶傷打架的代價寫在出手上
      weapon: { ...WEAPONS[hero.weapon], dmgMul: WEAPONS[hero.weapon].dmgMul * pen.dmg },
    },
    ...hero.followers.map((id) => ({
      id: `mate-${id}`, npcId: id,
      name: byId[id]?.name ?? '同行', war: byId[id] ? might(byId[id]) : 40,
    })),
  ];
}

const FOE_ROBE = '#4a3f42';
const FOE_CHIEF_ROBE = '#5c3a33';

/**
 * 寨外叫陣 —— 賭一把:不帶人手也可能端得掉一窩。
 *
 * 兇的頭子好面子,多半肯出來單挑(0.35 + fierce*0.45);贏了他,
 * 全夥樹倒猢猻散 —— 走的是既有的「打贏就 rout」那條路,count 開 1
 * 就是單挑,開整夥就是罵完一擁而上。輸的代價也是現成的:
 * 擊昏、掉錢、帶傷 —— 傷還沒好又輸一場,就是死。
 * 回傳「他應沒應戰」,日誌那句話由呼叫端寫。
 */
export function challengeChief(b: {
  id: string; x: number; z: number; fierce: number; count: number;
}): boolean {
  const hero = useHero.getState();
  const villagers = makeVillagers(38);
  const byId = Object.fromEntries(villagers.map((v) => [v.id, v]));
  const accepted = Math.random() < chiefAccepts(b.fierce);
  beginBattle({
    // 應戰 = 你一個人上(單挑,你的人不插手);不應 = 全隊接一場硬仗
    ours: accepted ? [ourSide(hero, byId)[0]] : ourSide(hero, byId),
    band: {
      id: b.id, x: b.x, z: b.z, fierce: b.fierce,
      count: accepted ? 1 : b.count,
    },
    at: { x: playerPos.x, z: playerPos.z },
    ground: groundAt,
    leadership: hero.stats.leadership,
  });
  return accepted;
}

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

  // 弓 = 一道弧 + 一根弦。認得出「那個人拿的不是刀」就夠了
  const bowGeom = useMemo(() => {
    const arc = new THREE.TorusGeometry(0.46, 0.026, 5, 12, Math.PI * 0.92);
    arc.rotateZ(Math.PI * 0.54);
    const str = new THREE.CylinderGeometry(0.008, 0.008, 0.84, 3);
    str.translate(0.09, 0.46, 0);
    // 兩件都轉成 non-indexed —— mergeGeometries 不收混著索引的
    return mergeGeometries([arc.toNonIndexed(), str.toNonIndexed()], false)!;
  }, []);

  // 箭桿的幾何在 ArrowFlights 裡 —— 箭是高頻資料,和 fighters 一樣每幀搬

  /** 這一場打的是「下山的那一夥」嗎 —— 收場的結算不一樣:窩還在,只是人少了。 */
  const engagedRaid = useRef<{ partyId: string; bandId: string; name: string } | null>(null);
  const lastHurt = useRef(-1);
  const groups = useRef<Record<string, THREE.Group | null>>({});
  const blades = useRef<Record<string, THREE.Group | null>>({});
  const bodies = useRef<Record<string, THREE.Mesh | null>>({});
  const trails = useRef<Record<string, THREE.Mesh | null>>({});
  /** 倒地的煙 —— 誰這幀剛倒,在他腳邊揚一蓬土。 */
  const prevStance = useRef<Record<string, string>>({});
  const puffs = useRef<Array<{ x: number; y: number; z: number; t0: number }>>([]);
  const puffMesh = useRef<THREE.InstancedMesh>(null);

  // 空白鍵出手 —— 綁 window,canvas 不吃鍵盤焦點
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      e.preventDefault();
      // 拿弓的人不配刀風 —— 弦響由 ArrowFlights 在「多了一支箭」時配,
      // 這裡再響一聲就是一次出手兩個聲音
      if (playerStrike('you') && useHero.getState().weapon !== 'bow') swingSound();
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
      list: fighters.map((f) => ({ id: f.id, side: f.side, hp: Math.round(f.hp), stance: f.stance, bow: !!f.bow })),
      arrows: arrows.length,
      loosed: arrowTally.loosed,
      fx: { slow: +fx.slow.toFixed(2), finisher: +fx.finisher.toFixed(2) },
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
          { id: 'you', name: hero.name, war: hero.stats.war, isPlayer: true,
            weapon: WEAPONS[hero.weapon] },
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
    // 打擊感的衰減擺在這裡 —— 這個元件常駐,打完了殘餘的晃也要收得掉
    fx.slow = Math.max(0, fx.slow - step);
    fx.shake = Math.max(0, fx.shake - step * 2.2);
    fx.finisher = Math.max(0, fx.finisher - step);
    const st = useBattle.getState();

    // 還沒開打:看看有沒有撞上哪一夥。
    // 兩種:蹲在窩裡的,和下了山在路上走的 —— 後者才是「治安差」真正的樣子
    if (!st.bandId) {
      const hr = useClock.getState().hour;
      const night = hr < 5.6 || hr > 19.2;
      const reach = night ? ENGAGE_NIGHT : ENGAGE;
      const campReach = night ? CAMP_NIGHT : ENGAGE;
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
        if (Math.hypot(b.x - playerPos.x, b.z - playerPos.z) > campReach) continue;
        const hero = useHero.getState();
        engagedRaid.current = null;
        // 夜襲不是白撿的:兇的窩會留哨 —— 哨醒著,這一場就是硬仗
        const sleeping = night && Math.random() > 0.2 + b.fierce * 0.4;
        beginBattle({
          ours: ourSide(hero, byId),
          band: { id: b.id, x: b.x, z: b.z, fierce: b.fierce, count: b.count },
          at: { x: playerPos.x, z: playerPos.z }, ground: groundAt,
          leadership: hero.stats.leadership,
          sleeping,
        });
        if (night) {
          note(useClock.getState().day, sleeping
            ? `趁夜摸進了${b.name} —— 火塘只剩紅炭,他們還在睡。`
            : `摸到${b.name}跟前,哨子的鑼先響了 —— 他們醒著!`, sleeping ? 'good' : 'bad');
        }
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

    // 慢鏡只慢模擬,不慢你的手 —— 全場凝住而你還能動,那半秒就是「是我砍倒他的」
    stepBattle(fx.slow > 0 ? step * 0.22 : step, groundAt, slideMove);

    const over = battleOver();
    // 致命一擊的那一拍還在演 —— 收場的面板等它演完再出來。
    // 不等的話,鏡頭剛壓下去、慢鏡剛拉開,結算就糊在臉上,整拍白擺
    if (over && fx.finisher <= 0.35) finish(over);
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
      // 剛倒下 —— 腳邊揚一蓬土。塵土比慢鏡更早告訴你「這下是實的」
      if (f.stance === 'down' && prevStance.current[f.id] !== 'down') {
        puffs.current.push({ x: f.x, y: f.y + 0.15, z: f.z, t0: t });
        if (puffs.current.length > 8) puffs.current.shift();
      }
      prevStance.current[f.id] = f.stance;
      const g = groups.current[f.id];
      if (!g) continue;
      if (f.isPlayer) { g.visible = false; continue; }   // 玩家由 Player.tsx 畫
      g.visible = true;
      poseInto(g, bodies.current[f.id], blades.current[f.id], f, t, trails.current[f.id]);
    }
    // 土:每蓬三團,冒起來、散開、化掉
    const pm = puffMesh.current;
    if (pm) {
      const obj = new THREE.Object3D();
      let i = 0;
      for (const p of puffs.current) {
        const age = t - p.t0;
        if (age > 0.85) continue;
        for (let k = 0; k < 3 && i < 24; k++) {
          const a = k * 2.1 + p.x;
          const r = 0.25 + age * 1.3;
          obj.position.set(p.x + Math.sin(a) * r * 0.6, p.y + age * 0.9, p.z + Math.cos(a) * r * 0.6);
          const s = 0.3 + age * 1.1;
          obj.scale.set(s, s, s);
          obj.rotation.set(0, a + age, 0);
          obj.updateMatrix();
          pm.setMatrixAt(i++, obj.matrix);
        }
      }
      pm.count = i;
      pm.instanceMatrix.needsUpdate = true;
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
    if (useBattle.getState().sparring) return;   // 切磋 —— 世界不動,帳不記

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

  // 沒在打也要掛著 ArrowFlights —— 插在地上的箭是戰場的痕跡,
  // 打完就集體消失的話,「留痕」就是句空話
  if (!bandId) return <ArrowFlights />;

  return (
    <>
      <instancedMesh ref={puffMesh} args={[undefined, undefined, 24]} frustumCulled={false}>
        <sphereGeometry args={[0.3, 6, 5]} />
        <meshBasicMaterial color="#b9a888" transparent opacity={0.32} depthWrite={false} />
      </instancedMesh>
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
              {f.bow ? (
                <mesh geometry={bowGeom} castShadow>
                  <meshStandardMaterial color="#6e4f2e" roughness={0.8} />
                </mesh>
              ) : (
                <mesh geometry={bladeGeom} castShadow>
                  <meshStandardMaterial color={f.side === 'foe' ? '#7d7a72' : '#9aa0a6'}
                                        roughness={0.42} metalness={0.55} />
                </mesh>
              )}
            </group>
            {/* 刀光 —— 揮砍那一下掃出的一道弧,打擊感的最後一塊拼圖 */}
            <mesh ref={(o) => { trails.current[f.id] = o; }}
                  position={[0, FIG_BODY_H * 0.62, 0]} rotation-x={-Math.PI / 2} visible={false}>
              <ringGeometry args={[0.45, 1.3, 12, 1, 0, Math.PI * 0.85]} />
              <meshBasicMaterial color="#eef2f6" transparent opacity={0.4}
                side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
          </group>
        );
      })}
      <ArrowFlights />
    </>
  );
}

/**
 * 天上的箭。高頻資料 —— combat 每步算位置,這裡每幀搬進一個 InstancedMesh。
 * 箭桿順著速度的方向躺 —— 拋物線墜下來的時候箭頭也跟著低頭,
 * 少了這一下,箭就是一根平移的火柴棍。
 */
const ARROW_CAP = 24;

function ArrowFlights() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const stuck = useRef<THREE.InstancedMesh>(null);
  const heard = useRef(0);
  const tmp = useMemo(() => ({
    obj: new THREE.Object3D(),
    up: new THREE.Vector3(0, 1, 0),
    dir: new THREE.Vector3(),
  }), []);

  useFrame(() => {
    const im = mesh.current;
    if (!im) return;
    // 弦響配在「多了一支箭」上 —— 開新一場 loosed 會歸零,計數器要跟著回去
    if (arrowTally.loosed < heard.current) heard.current = arrowTally.loosed;
    if (arrowTally.loosed > heard.current) { heard.current = arrowTally.loosed; bowSound(); }
    let i = 0;
    for (const a of arrows) {
      if (i >= ARROW_CAP) break;
      tmp.dir.set(a.vx, a.vy, a.vz).normalize();
      tmp.obj.position.set(a.x, a.y, a.z);
      tmp.obj.quaternion.setFromUnitVectors(tmp.up, tmp.dir);
      tmp.obj.updateMatrix();
      im.setMatrixAt(i++, tmp.obj.matrix);
    }
    im.count = i;
    im.instanceMatrix.needsUpdate = true;

    // 插在地上的 —— 順著落地的方向斜著,箭羽朝天
    const sm = stuck.current;
    if (sm) {
      let k = 0;
      for (const s of stuckArrows) {
        if (k >= 32) break;
        tmp.dir.set(s.dx, s.dy, s.dz).normalize();
        tmp.obj.position.set(s.x + s.dx * 0.1, s.y + 0.16, s.z + s.dz * 0.1);
        tmp.obj.quaternion.setFromUnitVectors(tmp.up, tmp.dir);
        tmp.obj.updateMatrix();
        sm.setMatrixAt(k++, tmp.obj.matrix);
      }
      sm.count = k;
      sm.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      <instancedMesh ref={mesh} args={[undefined, undefined, ARROW_CAP]} frustumCulled={false}>
        <cylinderGeometry args={[0.017, 0.017, 0.6, 4]} />
        <meshBasicMaterial color="#e3d9bd" />
      </instancedMesh>
      <instancedMesh ref={stuck} args={[undefined, undefined, 32]} frustumCulled={false}>
        <cylinderGeometry args={[0.017, 0.017, 0.6, 4]} />
        <meshBasicMaterial color="#cfc4a6" />
      </instancedMesh>
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
  f: Fighter, t: number, trail?: THREE.Mesh | null,
) {
  g.position.set(f.x, f.y, f.z);
  g.rotation.set(0, f.yaw, 0);

  const hurtFlash = t - f.hurtAt < 0.18;
  // 逃跑的人刀都扔了 —— 「打散」要看得出是打散,不是換個方向走
  if (blade) blade.visible = f.stance !== 'fleeing';
  if (trail) trail.visible = f.stance === 'striking' && !f.bow;

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
      if (trail) {
        // 刀光跟著劈的那一段掃 —— 起手看不見,劈下去最亮,收招淡掉
        const k = Math.max(0, Math.min(1, (p - 0.3) / 0.5));
        trail.rotation.z = -0.6 + k * 1.6;
        (trail.material as THREE.MeshBasicMaterial).opacity = Math.sin(k * Math.PI) * 0.42;
      }
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
