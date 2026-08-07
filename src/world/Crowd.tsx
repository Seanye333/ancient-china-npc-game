import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { groundAt, rng, slideMove, dryLandNear } from './field';
import { bodyGeom, headGeom, FIG_BODY_H } from './figure';
import { houseSites, fieldSites, meanderAt, DOCKS, BRIDGE, MARKET } from './sites';
import { useClock } from './worldTime';
import { makeVillagers } from '../game/npcs';
import { useFolk } from '../game/folk';
import { presences } from '../game/interact';
import { useHero } from '../game/hero';

/**
 * 人群 — 有作息的版本。
 *
 * 批次的訣竅是把顏色<b>烘進頂點</b>:一個角色只剩「身」與「頭」兩個 geometry,
 * 各一個 InstancedMesh,四種袍色共八次 draw call,人數再多都不變。
 *
 * 行為是一個小狀態機,不是隨機遊走:每個人有家、有活幹,按時辰出門下田、
 * 晌午上市集、天黑回家;路上遇見人會停下來說幾句。
 * <b>「有人住」不是靠人多,是靠他們各有各的去處。</b>
 */

/* ── 行為 ────────────────────────────────────────────── */

type Job = 'farm' | 'dock' | 'market';
type State = 'home' | 'goWork' | 'work' | 'goMarket' | 'market' | 'goHome' | 'talk';

interface Agent {
  /** 對應 npcs.ts 的身份 — 有名字才談得上搭話。 */
  npcId: string;
  variant: number;
  /** 上了年紀 —— 白髮、弓背、腳程慢。年紀要穿在身上,不能只寫在對話裡。 */
  old: boolean;
  home: [number, number];
  door: [number, number];
  work: [number, number];
  job: Job;
  state: State;
  x: number; z: number; y: number;
  yaw: number;
  target: [number, number];
  timer: number;
  phase: number;
  speed: number;
  partner: number;        // -1 = 沒人
  visible: boolean;
}

/**
 * 落腳點不許在水裡。淺灘是<b>涉得過去</b>的(不然過不了河),
 * 但「涉過去」和「站在水裡幹活」是兩回事 —— 碼頭工人的活動點
 * 抽進淺灘裡,人就整天泡在河裡,截圖裡一排人腰深站水中。
 * 落了水就繞圈找最近的乾地;找不到就原樣退回(總比亂跳好)。
 */

/** 作息表 — 世界的節奏感全在這裡。 */
function scheduleFor(hour: number): State {
  if (hour < 5.6 || hour >= 19.4) return 'home';
  if (hour < 7.0) return 'goWork';
  if (hour < 11.2) return 'work';
  if (hour < 12.0) return 'goMarket';
  if (hour < 13.4) return 'market';
  if (hour < 14.2) return 'goWork';
  if (hour < 17.6) return 'work';
  return 'goHome';
}

export function Crowd() {
  const hour = useClock((s) => s.hour);
  // 跟了你走的人不再過村裡的日子 —— 否則同一個人會出現兩次
  const followers = useHero((s) => s.followers);
  /**
   * 死了的人不再出門,病著的也不出門。
   *
   * 這一句是「村子會空」這件事唯一看得見的地方:荒年病死幾個人以後,
   * 街上真的會少幾個攤子。數字掉下去而街景不變的話,那些數字就是假的。
   */
  const deltas = useFolk((s) => s.deltas);
  const absent = useMemo(
    () => new Set(Object.entries(deltas)
      .filter(([, d]) => d.dead || d.sick > 0).map(([id]) => id)),
    [deltas],
  );

  const agents = useMemo<Agent[]>(() => {
    const rand = rng(70707);
    const houses = houseSites();
    const fields = fieldSites();
    const villagers = makeVillagers(38);
    const out: Agent[] = [];
    for (let i = 0; i < 38; i++) {
      const h = houses[i % houses.length];
      /**
       * 行當直接用 npcs.ts 那份 —— 對話裡自稱佃農的人不能在碼頭扛包。
       * (從前這裡另擲一次骰,同一個人嘴上一套身上一套。)
       */
      const job: Job = villagers[i].trade;
      rand();                                  // 佔位:別讓後面的抽數整批平移
      const old = villagers[i].age >= 52;
      const work: [number, number] =
        job === 'farm'
          ? (() => { const f = fields[Math.floor(rand() * fields.length)];
                     return [f.x + (rand() - 0.5) * 3, f.z + (rand() - 0.5) * 3]; })()
          : job === 'dock'
            ? (() => { const d = DOCKS[Math.floor(rand() * DOCKS.length)];
                       return dryLandNear(d[0] + (rand() - 0.5) * 3, d[1] + (rand() - 0.5) * 3); })()
            : [MARKET[0] + (rand() - 0.5) * 6, MARKET[1] + (rand() - 0.5) * 6];
      // 衣裳跟著行當走:農褐、埠青、市綠;上了年紀一律灰袍白髮。
      // 遠遠一看衣色就知道他是幹什麼的 —— 這就是「行當穿在身上」
      const variant = old ? 3 : job === 'farm' ? 0 : job === 'dock' ? 1 : 2;
      rand();                                  // 佔位:原本的 variant 抽數
      out.push({
        npcId: villagers[i].id,
        variant,
        old,
        home: [h.x, h.z], door: h.door, work, job,
        state: 'home',
        x: h.door[0], z: h.door[1], y: groundAt(h.door[0], h.door[1]),
        yaw: rand() * Math.PI * 2,
        target: h.door,
        timer: 0,
        phase: rand() * Math.PI * 2,
        speed: (1.6 + rand() * 0.9) * (old ? 0.72 : 1),
        partner: -1,
        visible: false,
      });
    }
    return out;
  }, []);

  // 0 農(褐+笠) 1 埠(青+笠) 2 市(綠) 3 老(灰+白髮)
  const variants = useMemo(
    () => [
      { robe: '#6b5741', hat: true, old: false },
      { robe: '#3f5568', hat: true, old: false },
      { robe: '#4a6b52', hat: false, old: false },
      { robe: '#6a6350', hat: false, old: true },
    ].map((v, i) => ({
      body: bodyGeom(new THREE.Color(v.robe)),
      head: headGeom(v.hat, v.old),
      idx: agents.map((a, k) => (a.variant === i ? k : -1)).filter((k) => k >= 0),
    })),
    [agents],
  );

  const bodyRefs = useRef<Array<THREE.InstancedMesh | null>>([]);
  const headRefs = useRef<Array<THREE.InstancedMesh | null>>([]);

  useLayoutEffect(() => {
    // 矩陣每幀都在動,而包圍球是初始化時算的 —— 不關掉會被整批剔除
    bodyRefs.current.forEach((m) => m && (m.frustumCulled = false));
    headRefs.current.forEach((m) => m && (m.frustumCulled = false));
  }, []);

  const tmp = useMemo(() => ({
    m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(),
    p: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1), hide: new THREE.Vector3(0, 0, 0),
  }), []);

  // 地形每幀重採很貴(五層 fbm),走路時每 0.25 秒採一次、其餘沿用
  const sampleAcc = useRef(0);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const want = scheduleFor(hour);
    sampleAcc.current += dt;
    const resample = sampleAcc.current > 0.25;
    if (resample) sampleAcc.current = 0;

    // ── 狀態轉移 ──
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      if (a.state !== 'talk' && a.state !== want) {
        a.state = want;
        a.target = want === 'home' || want === 'goHome' ? a.door
          : want === 'goMarket' || want === 'market' ? MARKET
            : a.work;
        a.timer = 0;
      }
      a.timer += dt;

      const moving = a.state === 'goWork' || a.state === 'goMarket' || a.state === 'goHome';
      a.visible = !(a.state === 'home' && a.timer > 2.5);   // 到家就進屋

      if (a.state === 'talk') {
        a.timer -= dt * 0;                                   // 由下面的計時結束
        if (a.timer > 4 + (i % 3)) { a.state = want; a.partner = -1; }
      } else if (moving || a.state === 'work' || a.state === 'market' || a.state === 'home') {
        const [tx, tz] = a.target;
        const dx = tx - a.x;
        const dz = tz - a.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.6) {
          const step = Math.min(d, a.speed * dt);
          // 村民也得繞開河 —— 之前他們會從河心直穿過去
          const got = slideMove(a.x, a.z, a.x + (dx / d) * step, a.z + (dz / d) * step);
          a.x = got.x; a.z = got.z;
          a.yaw = Math.atan2(dx, dz);
          if (resample) a.y = groundAt(a.x, a.z);
        } else if (a.state === 'work' || a.state === 'market') {
          // 到了就在原地小範圍挪動 — 幹活的樣子
          if (a.timer > 3.5) {
            a.timer = 0;
            a.target = dryLandNear(
              a.target[0] + (Math.sin(t * 1.7 + a.phase) * 2.4),
              a.target[1] + (Math.cos(t * 1.3 + a.phase) * 2.4),
            );
          }
        }
      }
    }

    // ── 路上遇見就停下說話 ── 只對前 20 人做兩兩檢查,夠用且便宜
    if (resample) {
      for (let i = 0; i < Math.min(agents.length, 20); i++) {
        const a = agents[i];
        if (a.partner >= 0 || !a.visible) continue;
        if (a.state !== 'goWork' && a.state !== 'goHome' && a.state !== 'goMarket') continue;
        for (let j = i + 1; j < Math.min(agents.length, 20); j++) {
          const b = agents[j];
          if (b.partner >= 0 || !b.visible) continue;
          if (Math.hypot(a.x - b.x, a.z - b.z) > 2.6) continue;
          a.state = b.state = 'talk';
          a.partner = j; b.partner = i;
          a.timer = b.timer = 0;
          a.yaw = Math.atan2(b.x - a.x, b.z - a.z);
          b.yaw = Math.atan2(a.x - b.x, a.z - b.z);
          break;
        }
      }
    }

    // 即時位置表 — 互動偵測要讀,但這是高頻資料,不進 store
    presences.length = 0;
    for (const a of agents) {
      if (followers.includes(a.npcId) || absent.has(a.npcId)) continue;
      presences.push({ id: a.npcId, x: a.x, y: a.y, z: a.z, visible: a.visible });
    }

    // ── 寫矩陣 ──
    variants.forEach((v, vi) => {
      const bm = bodyRefs.current[vi];
      const hm = headRefs.current[vi];
      if (!bm || !hm) return;
      v.idx.forEach((ai, slot) => {
        const a = agents[ai];
        if (!a.visible || followers.includes(a.npcId) || absent.has(a.npcId)) {  // 進了屋、病了、歿了就縮到零
          tmp.m.compose(tmp.p.set(a.x, a.y - 40, a.z), tmp.q.identity(), tmp.hide);
          bm.setMatrixAt(slot, tmp.m);
          hm.setMatrixAt(slot, tmp.m);
          return;
        }
        const moving = a.state === 'goWork' || a.state === 'goMarket' || a.state === 'goHome';
        const step = t * a.speed * 3.1 + a.phase;
        const bob = moving ? Math.abs(Math.sin(step)) * 0.055
          : Math.sin(t * 1.15 + a.phase) * 0.014;
        const sway = moving ? Math.sin(step * 0.5) * 0.055 : 0;
        // 走路微微前傾,老人常年弓著背 —— 體態是不用寫字的年齡與狀態
        const lean = (moving ? 0.055 : 0) + (a.old ? 0.10 : 0);

        tmp.p.set(a.x, a.y + bob, a.z);
        tmp.e.set(lean, a.yaw, sway);
        tmp.q.setFromEuler(tmp.e);
        tmp.s.setScalar(a.old ? 0.94 : 1);
        tmp.m.compose(tmp.p, tmp.q, tmp.s);
        bm.setMatrixAt(slot, tmp.m);

        // 說話時頭會點,走路時小幅張望
        const look = a.state === 'talk'
          ? Math.sin(t * 3.1 + a.phase) * 0.10
          : Math.sin(t * 0.5 + a.phase * 1.7) * (moving ? 0.16 : 0.40);
        const nod = a.state === 'talk' ? Math.sin(t * 2.6 + a.phase) * 0.07 : 0;
        tmp.p.set(
          a.x + Math.sin(a.yaw) * lean * 0.5,
          a.y + bob + FIG_BODY_H * 0.99 * (a.old ? 0.94 : 1),
          a.z + Math.cos(a.yaw) * lean * 0.5,
        );
        tmp.e.set(nod + lean * 0.6, a.yaw + look, sway * 0.6);
        tmp.q.setFromEuler(tmp.e);
        tmp.m.compose(tmp.p, tmp.q, tmp.s);
        hm.setMatrixAt(slot, tmp.m);
      });
      bm.instanceMatrix.needsUpdate = true;
      hm.instanceMatrix.needsUpdate = true;
    });
  });

  return (
    <>
      {variants.map((v, i) => (
        <group key={i}>
          <instancedMesh
            ref={(m) => { bodyRefs.current[i] = m; }}
            args={[v.body, undefined, Math.max(1, v.idx.length)]}
            castShadow
          >
            <meshStandardMaterial vertexColors roughness={0.74} />
          </instancedMesh>
          <instancedMesh
            ref={(m) => { headRefs.current[i] = m; }}
            args={[v.head, undefined, Math.max(1, v.idx.length)]}
            castShadow
          >
            <meshStandardMaterial vertexColors roughness={0.62} />
          </instancedMesh>
        </group>
      ))}
    </>
  );
}

export { meanderAt, BRIDGE };
