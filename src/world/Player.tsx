import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { terrainHeight, groundAt, slideMove, steerMove, viewBlocked, walkable } from './field';
import {
  bodyGeom, headGeom, legGeom, legSwing, poseLeg, armGeom, armSwing, poseArm,
  FIG_BODY_H, FIG_LEG_H, FIG_SHOULDER_X, FIG_SHOULDER_Y, FIG_HAND,
} from './figure';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { setSightTarget } from './Vegetation';
import { pushContact } from './Contacts';
import { findPath } from './nav';
import { stepSound } from '../game/audio';
import { meanderAt } from './sites';
import { useHero, woundPenalty } from '../game/hero';
import { playerPos, useInteract, warp, findPresence } from '../game/interact';
import { fighters, alive, fx } from '../game/combat';
import { WEAPONS } from '../game/weapons';

/**
 * 你 — 這個世界裡第一個由玩家推動的人。
 *
 * 身體和路人共用同一副幾何(figure.ts),只是驅動的來源不同:
 * 他們由作息狀態機推,你由鍵盤推。這件事本身就是設計 ——
 * <b>主角不該是一個特別的物種</b>,他只是這條街上碰巧被你控制的那個人。
 *
 * 移動刻意做得慢(2.6 m/s,跑起來 4.2):這個遊戲的尺度是一個縣,
 * 不是一個大陸。走得太快,村子就變成地圖上的一個點。
 */

const WALK = 2.6;
const RUN = 4.2;
/** 鏡頭距離與高度 — 這個遊戲的尺度是一個縣,鏡頭拉太遠人就變成點。 */
const CAM_DIST = 6.2;
const CAM_HEIGHT = 3.2;
/** 打起來要看得見整個戰團 —— 貼在肩後只看得到自己的後腦勺。 */
const FIGHT_DIST = 8.4;
const FIGHT_HEIGHT = 4.6;

/** 鏡頭解算的結果 — 截圖腳本要能問「鏡頭現在是不是埋在樹裡」。 */
const cam = { dist: 0, lift: 0, yaw: 0, buried: false };
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__cam = () => ({ ...cam });
}

export function Player() {
  const { camera } = useThree();
  const wounded = useHero((s) => s.wounded);
  // 說話的時候人得站住 —— 邊走邊聊會把對方甩在身後
  const talking = useInteract((s) => s.talkingTo);

  const weapon = useHero((s) => s.weapon);
  const geom = useMemo(() => ({
    body: bodyGeom(new THREE.Color('#3f5568')),
    head: headGeom(),
    leg: legGeom(),
    arm: armGeom(new THREE.Color('#3f5568')),
  }), []);

  /**
   * 手上那件傢伙 —— 打起來才亮出來。
   *
   * 平時走路不掛兵器是刻意的:白身在村裡拎著刀晃,那個畫面不對;
   * 接戰的那一刻它出現在手上,「要打了」這件事就不必用文字說。
   */
  const weaponGeom = useMemo(() => {
    const w = WEAPONS[weapon];
    if (w.id === 'fists') return null;
    if (w.id === 'bow') {
      const arc = new THREE.TorusGeometry(0.46, 0.026, 5, 12, Math.PI * 0.92);
      arc.rotateZ(Math.PI * 0.54);
      const str = new THREE.CylinderGeometry(0.008, 0.008, 0.84, 3);
      str.translate(0.09, 0.46, 0);
      return mergeGeometries([arc.toNonIndexed(), str.toNonIndexed()], false)!;
    }
    if (w.id === 'spear') {
      const g = new THREE.CylinderGeometry(0.035, 0.045, 2.7, 6);
      g.translate(0, 0.9, 0);
      const tip = new THREE.ConeGeometry(0.06, 0.3, 6);
      tip.translate(0, 2.4, 0);
      return mergeGeometries([g, tip], false)!;
    }
    if (w.id === 'club') {
      const g = new THREE.CylinderGeometry(0.05, 0.075, 1.1, 6);
      g.translate(0, 0.4, 0);
      return g;
    }
    const blade = new THREE.BoxGeometry(0.05, 0.56, 0.115);
    blade.translate(0, 0.42, 0.012);
    const guard = new THREE.BoxGeometry(0.14, 0.045, 0.14);
    guard.translate(0, 0.14, 0);
    const grip = new THREE.BoxGeometry(0.045, 0.16, 0.05);
    grip.translate(0, 0.05, 0);
    return mergeGeometries([blade, guard, grip], false)!;
  }, [weapon]);
  const weaponRef = useRef<THREE.Mesh>(null);

  const bodyRef = useRef<THREE.Mesh>(null);
  const headRef = useRef<THREE.Mesh>(null);
  const legRefs = useRef<Array<THREE.Mesh | null>>([]);
  /** 0 = 平常,1 = 正在說話。鏡頭推近的程度,見下面的 talkPull。 */
  const talkPull = useRef(0);
  const armRefs = useRef<Array<THREE.Mesh | null>>([]);
  /** 看美術用:凍住鏡頭解算,好把機位擺到臉前面。 */
  const camFrozen = useRef(false);
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__freezeCam =
      (on = true) => { camFrozen.current = !!on; };
  }, []);

  // 玩家的位置活在 ref 裡,不進 zustand —— 每幀寫 store 會讓整棵樹重繪
  const me = useRef({
    x: meanderAt(2) + 14, z: 2, y: 0, yaw: 0, step: 0,
  });
  useEffect(() => {
    me.current.y = terrainHeight(me.current.x, me.current.z);
  }, []);

  /**
   * 自動走向一點 — 目前給截圖腳本用,將來就是「點地面走過去」。
   * 直線 + slideMove 已經夠這個尺度的世界用:村子沒有迷宮,
   * 沿障礙滑一下就繞得過去。
   */
  const goto = useRef<{ x: number; z: number } | null>(null);
  /**
   * 還沒走到的航點。
   *
   * 直線走法在村子裡夠用,過河不行:谷中間橫著一條河,只有一座橋。
   * 直線會把你帶到岸邊,然後在那裡左右試探到天荒地老 ——
   * 而橋就在下游三十步。所以先問 nav 要一條路,再一個一個航點走過去。
   */
  const route = useRef<Array<[number, number]>>([]);
  /**
   * 卡住了就重算。
   *
   * 路是出發時算好的一整條,而路上會發生事情:你被一棵樹頂住、
   * 有人擋在窄處、水漲了把灘地淹掉。<b>算好一條路然後閉著眼睛走完</b>
   * 是這類系統最常見的破法 —— 走到半路卡住,就永遠卡在那裡,
   * 而畫面上看起來只是「他不走了」。
   *
   * 所以盯著「有沒有在靠近下一個航點」。停滯超過一秒半就從當下重算一條。
   */
  const stall = useRef({ t: 0, d: Infinity });
  /** 上次往哪一邊繞。認一邊繞到底 —— 每幀改主意就會在障礙前面發抖 */
  const side = useRef(0);
  useEffect(() => {
    // 診斷:走不動的時候要分得清是「沒路」「被擋住」還是「根本沒在走」
    (window as unknown as Record<string, unknown>).__walkState = () => ({
      at: [+me.current.x.toFixed(1), +me.current.z.toFixed(1)],
      goto: goto.current,
      route: route.current.length,
      next: route.current[0] ?? null,
      stall: +stall.current.t.toFixed(2),
      walkableHere: walkable(me.current.x, me.current.z),
      wounded: useHero.getState().wounded,
      // 直接問走位函式:給它一個往下一個航點的方向,它挪得動嗎
      probe: (() => {
        const n = route.current[0] ?? [goto.current?.x ?? 0, goto.current?.z ?? 0];
        const dx = n[0] - me.current.x, dz = n[1] - me.current.z;
        const d = Math.hypot(dx, dz) || 1;
        const got = steerMove(me.current.x, me.current.z, dx / d, dz / d, 0.04);
        return +Math.hypot(got.x - me.current.x, got.z - me.current.z).toFixed(3);
      })(),
    });
    (window as unknown as Record<string, unknown>).__walkTo = (x: number, z: number) => {
      const m = me.current;
      const path = findPath(m.x, m.z, x, z);
      /*
       * <b>整條路都要留著,不能砍掉最後一個航點。</b>
       *
       * 我原本以為最後那個航點就是目標本身,砍掉省事 —— 其實不是:
       * 它是「進場點」,而目標常常和它差著幾步(目標落在走不到的格子上時,
       * A* 會退到附近一格)。砍掉以後,人走完倒數第二個航點就直奔目標,
       * 那一段是沒有驗算過的直線。
       *
       * 這個 bug 的樣子特別有欺騙性:過河的路規劃得完全正確
       * ——(10,6) 直直往西到 (-70,6),正好壓在橋上——
       * 可是砍掉終點以後,人從 (10,6) 斜著奔向 (-69,4),
       * 而橋只有三步寬,一走上去就滑下水了。路是對的,走法是錯的。
       */
      route.current = path ?? [];
      /*
       * 目標本身站不住的時候(賊窩中央、河裡、屋子裡),A* 會退到附近一格 ——
       * 那就<b>以那一格為終點</b>,不要再往真目標走最後那一段。
       * 不這樣做的話,人會走到柵欄外面,然後對著柵欄磨到天荒地老:
       * 路走完了,而「還沒到」永遠成立。
       */
      const reachable = walkable(x, z);
      const last = route.current[route.current.length - 1];
      goto.current = reachable || !last ? { x, z } : { x: last[0], z: last[1] };
      stall.current = { t: 0, d: Infinity };
      return route.current.length;
    };
    // 瞬移 —— 純截圖用:視覺驗收要在半張地圖外的四五個點位取景,
    // 用走的一個點就是兩分鐘。正式玩法沒有這個東西。
    (window as unknown as Record<string, unknown>).__place = (x: number, z: number) => {
      const m = me.current;
      m.x = x; m.z = z; m.y = terrainHeight(x, z);
      route.current = []; goto.current = null;
      stall.current = { t: 0, d: Infinity };
    };
  }, []);

  const keys = useRef<Record<string, boolean>>({});
  /** 回望的權重 0..1 —— M 鍵按住升起來,鬆手落回去。 */
  const overview = useRef(0);
  const prevPos = useRef({ x: 0, z: 0 });
  useEffect(() => {
    const down = (e: KeyboardEvent) => { keys.current[e.code] = true; };
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    const blur = () => { keys.current = {}; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  const tmp = useMemo(() => ({
    fwd: new THREE.Vector3(), right: new THREE.Vector3(),
    want: new THREE.Vector3(), camWant: new THREE.Vector3(),
    look: new THREE.Vector3(), sight: new THREE.Vector3(),
  }), []);

  useFrame((_, dt) => {
    const k = keys.current;
    const m = me.current;
    const step = dt > 0.1 ? 0.1 : dt;      // 分頁切回來時別瞬移

    // 被挪走了(目前只有打輸這一種)。鏡頭要當場跟上 ——
    // 讓它慢慢 lerp 過去的話,玩家會被拖著飛過半張地圖,那不叫轉場,叫穿幫
    let snapCam = false;
    if (warp.pending) {
      m.x = warp.x; m.z = warp.z; m.y = groundAt(m.x, m.z);
      warp.pending = false;
      goto.current = null;
      snapCam = true;
    }

    // 方向以鏡頭為準 —— 按前進就是往螢幕裡走,不是往世界的 +Z
    tmp.fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    tmp.fwd.y = 0; tmp.fwd.normalize();
    tmp.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    tmp.right.y = 0; tmp.right.normalize();

    tmp.want.set(0, 0, 0);
    if (k.KeyW || k.ArrowUp) tmp.want.add(tmp.fwd);
    if (k.KeyS || k.ArrowDown) tmp.want.sub(tmp.fwd);
    if (k.KeyD || k.ArrowRight) tmp.want.add(tmp.right);
    if (k.KeyA || k.ArrowLeft) tmp.want.sub(tmp.right);

    // 鍵盤沒輸入時才吃自動導航 —— 玩家一按鍵就該立刻奪回控制權
    if (tmp.want.lengthSq() < 1e-4 && goto.current) {
      // 先走航點,航點走完了才直奔目標
      const next = route.current[0];
      const aim = next ?? [goto.current.x, goto.current.z];
      const gx = aim[0] - m.x;
      const gz = aim[1] - m.z;
      const d = Math.hypot(gx, gz);

      // 有沒有在靠近?沒有就是卡住了
      if (d < stall.current.d - 0.05) {
        stall.current.d = d;
        stall.current.t = 0;
      } else {
        stall.current.t += step;
        if (stall.current.t > 1.5) {
          const again = findPath(m.x, m.z, goto.current.x, goto.current.z);
          route.current = again ?? [];
          stall.current.t = 0;
          stall.current.d = Infinity;
          // 重算完還是原地打轉的話,就別再耗著 —— 這一趟到不了
          if (!again || !again.length) goto.current = null;
        }
      }
      if (next) {
        // 到點的判定要比橋板窄。判定半徑大過通道寬度的話,
        // 人會在還沒真正踏上橋的時候就認為「這個航點到了」
        if (d < 1.4) { route.current.shift(); stall.current.d = Infinity; }
        else tmp.want.set(gx, 0, gz).normalize();
      } else if (d < 0.7) {
        goto.current = null;
      } else {
        tmp.want.set(gx, 0, gz).normalize();
      }
    } else if (tmp.want.lengthSq() > 1e-4) {
      goto.current = null;
      route.current.length = 0;
    }

    // 倒在地上的人不會走路
    const downed = fighters.some((f) => f.isPlayer && f.stance === 'down');
    // 帶傷<b>能</b>走 —— 從前 wounded>0 直接釘死在原地,和「帶傷出門
    // 是在賭命」那句話對不上。現在是走得慢、跑不動:腿傷最瘸
    const moving = tmp.want.lengthSq() > 1e-4 && !talking && !downed;
    if (moving) {
      tmp.want.normalize();
      const pen = woundPenalty(useHero.getState());
      const speed = ((k.ShiftLeft || k.ShiftRight) && wounded === 0 ? RUN : WALK) * pen.speed;
      if (goto.current) {
        // 自動走:遇到樹叢會自己繞 —— 直線走法過不了凹角
        const got = steerMove(m.x, m.z, tmp.want.x, tmp.want.z, speed * step, side.current);
        if (got.side !== 0) side.current = got.side;
        m.x = got.x; m.z = got.z; m.yaw = got.yaw;
      } else {
        // 你自己按的方向照走,擋住就沿著障礙滑 —— 河是河,山是牆
        const nx = m.x + tmp.want.x * speed * step;
        const nz = m.z + tmp.want.z * speed * step;
        const got = slideMove(m.x, m.z, nx, nz);
        m.x = got.x; m.z = got.z;
        m.yaw = Math.atan2(tmp.want.x, tmp.want.z);
      }
      m.y = groundAt(m.x, m.z);
      const before = m.step;
      m.step += speed * step * 3.1;
      // 一步一聲 —— 掛在步幅相位上,所以跑起來自然就密
      if (Math.floor(before / Math.PI) !== Math.floor(m.step / Math.PI)) {
        stepSound(speed >= RUN);
      }
    }

    // 共享座標給互動偵測 — 走模組級可變引用,不進 zustand(每幀 set 會全樹重繪)
    playerPos.x = m.x; playerPos.y = m.y; playerPos.z = m.z; playerPos.yaw = m.yaw;
    pushContact(m.x, m.y, m.z, 0.46);

    const bob = moving ? Math.abs(Math.sin(m.step)) * 0.055 : Math.sin(m.step * 0.2) * 0.012;
    const sway = moving ? Math.sin(m.step * 0.5) * 0.055 : 0;

    if (bodyRef.current) {
      bodyRef.current.position.set(m.x, m.y + bob, m.z);
      bodyRef.current.rotation.set(0, m.yaw, sway);
    }
    if (headRef.current) {
      headRef.current.position.set(m.x, m.y + bob + FIG_BODY_H * 0.99, m.z);
      headRef.current.rotation.set(0, m.yaw, sway * 0.6);
    }
    // 腿只吃一半的上下起伏 —— 全吃會把腳抬離地面,不吃則胯上開一條縫。
    // 一半兩頭都在小腿多留的那 12% 長度裡藏得住,而且讀作膝蓋在卸力
    for (const side of [-1, 1] as const) {
      const leg = legRefs.current[side < 0 ? 0 : 1];
      if (!leg) continue;
      poseLeg(leg, side, m.x, m.y + bob * 0.5 + FIG_LEG_H, m.z, m.yaw,
        legSwing(m.step, side, moving));
      const arm = armRefs.current[side < 0 ? 0 : 1];
      // 打起來的時候手臂定住 —— 刀掛在手上,手一擺刀就飛了
      if (arm) {
        poseArm(arm, side, m.x, m.y + bob + FIG_SHOULDER_Y, m.z, m.yaw,
          armSwing(m.step, side, moving && fighters.length === 0));
      }
    }
    if (weaponRef.current) {
      const fighting = fighters.length > 0;
      weaponRef.current.visible = fighting;
      if (fighting) {
        // 掛在右手上,跟著身子轉。座標從 FIG_HAND 來(相對於肩)——
        // 從前這裡是各抄一份,手一挪動刀就懸在半空
        const hx0 = FIG_SHOULDER_X + FIG_HAND[0], hz0 = FIG_HAND[2];
        const hx = m.x + Math.cos(m.yaw) * hx0 - Math.sin(m.yaw) * hz0;
        const hz = m.z - Math.sin(m.yaw) * hx0 - Math.cos(m.yaw) * hz0;
        weaponRef.current.position.set(hx, m.y + bob + FIG_SHOULDER_Y + FIG_HAND[1], hz);
        weaponRef.current.rotation.set(-0.85, m.yaw, 0.2);
      }
    }

    /*
     * 原型階段的把手:凍住鏡頭。
     *
     * 看美術要湊到跟前,可是解算器每幀把鏡頭往肩後拉 —— 湊得越近它推得越狠,
     * 一公尺的機位根本擺不住(擺完二十六毫秒就被拉回去了)。
     * 凍住它,截圖腳本才拍得到臉。
     */
    if (camFrozen.current) return;

    /**
     * 鏡頭跟隨。第三人稱最常見的破綻就是鏡頭埋進東西裡,所以這裡不是
     * 「擺在肩後」那麼簡單,而是一個三段的求解:
     *
     * 一、<b>先往兩邊繞</b>。正後方被一棵樹卡住,不代表側後方也不行 ——
     *     繞開比硬擠有效得多,這是這段最管用的一條。
     * 二、<b>再抬高</b>,從樹梢屋脊上看過去。但人若正站在樹冠底下就不能抬:
     *     爬過樹梢只會看到一片樹頂,人整個被葉子蓋住。
     * 三、<b>最後才收近</b>。收近是下策,收到極限就是貼著後腦勺。
     *
     * 打架時整體往後往上讓一步,視線擺在你和最近那個敵人中間 ——
     * 那時候你要判斷的是「誰能砍到我」,不是「我朝哪走」。
     */
    let foe: { x: number; z: number } | null = null;
    if (fighters.length) {
      let bd = Infinity;
      for (const f of fighters) {
        if (f.side !== 'foe' || !alive(f)) continue;
        const d = Math.hypot(f.x - m.x, f.z - m.z);
        if (d < bd) { bd = d; foe = { x: f.x, z: f.z }; }
      }
    }
    /**
     * 致命一擊 —— 放倒最後一個的那一秒,鏡頭壓低、收近,然後自己回來。
     * finisher 從 1.3 倒數到 0;sin 曲線讓它「推進去再退出來」,
     * 不是猛一跳。全場慢鏡是 combat 給的,這裡只管鏡頭的姿態。
     */
    const finPull = fx.finisher > 0 ? Math.sin(Math.min(1, fx.finisher / 1.3) * Math.PI) : 0;
    /**
     * 說話就推近 —— 鏡頭往前挪一步、壓低半步,視線抬到兩人臉的高度。
     *
     * 為什麼值得:對話在這之前是<b>一塊蓋在世界上的黑板</b> ——
     * 面板一開,底下那兩個人還是六步外的兩個小影子,你在讀字,不是在跟人說話。
     * 鏡頭挪進去以後,說話的那個人佔的畫面大了一倍,他的頭在點、
     * 你的臉朝著他 —— 那句話才像是他說的。
     *
     * 用 lerp 而不是切:一步一步挪過去約半秒,退出來也一樣。
     * 這一段和景深是配套的(見 App 的 DoF 掛載條件):推近的同時背景化開。
     */
    talkPull.current += ((talking ? 1 : 0) - talkPull.current) * Math.min(1, step * 3.4);
    const tk = talkPull.current;
    const baseDist = (foe ? FIGHT_DIST : CAM_DIST) * (1 - 0.30 * finPull) * (1 - 0.34 * tk);
    const baseHigh = (foe ? FIGHT_HEIGHT : CAM_HEIGHT) * (1 - 0.40 * finPull) * (1 - 0.30 * tk);
    const underCanopy = viewBlocked(m.x, m.z, m.y + 2.2);

    /**
     * 這個位置有多糟 —— 0 = 乾淨,數字越大擋得越多。
     *
     * 從前這裡回傳的是「清或不清」,於是全部都不清的時候(在林子裡打架就是
     * 這樣)只能退到梯級的最後一階,也就是貼著後腦勺 —— 那是<b>所有壞位置裡
     * 最壞的一個</b>。改成計分以後,退無可退時退到「擋得最少」的那個,
     * 通常是站遠一點、隔著幾片會自己淡掉的葉子看過去。
     */
    const sightScore = (yaw: number, dist: number, lift: number) => {
      const cx = m.x - Math.sin(yaw) * dist;
      const cz = m.z - Math.cos(yaw) * dist;
      const camY = m.y + baseHigh + lift;
      // 埋進山裡是硬傷,和葉子不同級 —— 給一個大到蓋過一切的分數
      if (terrainHeight(cx, cz) >= camY - 0.8) return 99;
      let hit = 0;
      // 沿視線取樣,而不是只看端點 —— 只看端點鏡頭會從樹幹中間穿過去
      for (let t = 0.26; t <= 1.001; t += 0.12) {
        const sx = m.x - Math.sin(yaw) * dist * t;
        const sz = m.z - Math.cos(yaw) * dist * t;
        const sy = m.y + 1.25 + (camY - m.y - 1.25) * t;
        // 地形也要沿線查,不能只查終點:營地貼著山根,鏡頭退到山脊
        // <b>另一側</b>時終點是乾淨的,可整座山正好橫在你和主角之間 ——
        // 貼崖打架滿屏黃土,就是這條沒查出來的
        if (terrainHeight(sx, sz) >= sy - 0.5) return 99;
        if (viewBlocked(sx, sz, sy)) hit++;
      }
      return hit;
    };

    // 繞的幅度收在 ±100° 內:WASD 是相對鏡頭的,轉太多會讓人分不清前後
    const SWEEP = [0, 0.42, -0.42, 0.85, -0.85, 1.25, -1.25, 1.75, -1.75];
    const LADDER: Array<[number, number]> = underCanopy
      ? [[1, 0], [0.78, 0], [0.58, 0.5], [0.42, 0.8], [0.3, 0.9]]
      : [[1, 0], [0.94, 0.9], [0.88, 1.8], [0.82, 2.7], [0.6, 3.4], [0.42, 3.4], [0.3, 3.4]];

    let yaw = m.yaw, dist = baseDist, lift = 0;
    let best = Infinity;
    for (const [dk, lk] of LADDER) {
      for (const da of SWEEP) {
        const score = sightScore(m.yaw + da, baseDist * dk, lk);
        // 全清就用它 —— 梯級是照「越前面越好」排的,不必再比下去
        if (score < best) {
          best = score; yaw = m.yaw + da; dist = baseDist * dk; lift = lk;
        }
        if (best === 0) break;
      }
      if (best === 0) break;
    }

    const cx = m.x - Math.sin(yaw) * dist;
    const cz = m.z - Math.cos(yaw) * dist;
    tmp.camWant.set(
      cx,
      // 地面若比主角高(走進谷底),鏡頭跟著抬,免得被前方的坡切掉
      Math.max(m.y, terrainHeight(cx, cz)) + baseHigh + lift,
      cz,
    );
    cam.dist = dist; cam.lift = lift; cam.yaw = yaw - m.yaw;
    if (snapCam) camera.position.copy(tmp.camWant);
    else camera.position.lerp(tmp.camWant, 1 - Math.pow(0.0016, step));
    // 平滑是奢侈品,埋在牆裡不是:鏡頭真的插進東西裡就當場歸位,不要慢慢挪。
    // 但這只在<b>目標位置本身是乾淨的</b>時候才成立(best === 0)——
    // 林子裡連目標位置都擋著,這時再每幀歸位就成了原地抽搐,
    // 而近處的葉子已經會自己淡開,慢慢挪過去反而看得清楚。
    if (best === 0 && viewBlocked(camera.position.x, camera.position.z, camera.position.y)) {
      camera.position.copy(tmp.camWant);
    }
    cam.buried = viewBlocked(camera.position.x, camera.position.z, camera.position.y);

    // 告訴植被視線落在哪 —— 擋在這條線上的樹會自己讓開(見 Vegetation 的 setSightTarget)。
    // 要先把鏡頭矩陣更新到位,否則餵過去的是上一幀的視空間
    camera.updateMatrixWorld();
    setSightTarget(tmp.sight.set(m.x, m.y + 1.15, m.z).applyMatrix4(camera.matrixWorldInverse));
    if (foe) {
      // 看向你和敵人之間偏你這一側 —— 完全取中會讓主角滑到畫面邊上
      tmp.look.set(m.x + (foe.x - m.x) * 0.32, m.y + 1.25, m.z + (foe.z - m.z) * 0.32);
    } else {
      tmp.look.set(m.x, m.y + 1.25, m.z);
      // 說話時視線移到<b>兩人中間</b>,並且抬到臉的高度 ——
      // 只推近而不改視線的話,對方會被推出畫面外
      const who = tk > 0.02 && talking ? findPresence(talking) : null;
      if (who) {
        tmp.look.set(
          m.x + (who.x - m.x) * 0.5 * tk,
          /*
           * 視線<b>往下</b>壓半公尺 —— 這一條是拍出來才發現的。
           *
           * 對話面板佔了畫面下面三分之一,而鏡頭推近以後兩個人正好落在
           * 那條邊上:講話的人被自己的台詞蓋住了半個身子。
           * 把視線壓低,兩張臉就往上抬出面板 —— 鏡頭仰角看起來也自然,
           * 因為你本來就是站在對方跟前和他說話,不是俯視他。
           */
          m.y + 1.25 - 0.50 * tk,
          m.z + (who.z - m.z) * 0.5 * tk,
        );
      }
    }
    camera.lookAt(tmp.look);

    /**
     * 回望 —— 按住 M,鏡頭慢慢升到高處環視全村(手不能動是應該的,
     * 你在看你住的地方)。鬆手就落回肩後。和解算器不搶:這裡的拉力
     * 比它強,按住時它每幀想收回去、我們每幀拉上來,勝負穩定在高處。
     */
    overview.current += ((keys.current.KeyM ? 1 : 0) - overview.current) * Math.min(1, step * 2);
    if (overview.current > 0.02) {
      const k = overview.current;
      const oa = performance.now() * 0.00006;
      tmp.camWant.set(
        m.x + Math.sin(oa) * 30 * k,
        m.y + 6 + 34 * k,
        m.z + Math.cos(oa) * 30 * k,
      );
      camera.position.lerp(tmp.camWant, Math.min(1, step * 3) * k);
      camera.lookAt(m.x, m.y, m.z);
    }

    // 跑起來視野微擴、鏡頭壓低一絲 —— 速度感白撿
    const spd = Math.hypot(m.x - prevPos.current.x, m.z - prevPos.current.z) / Math.max(1e-4, step);
    prevPos.current.x = m.x; prevPos.current.z = m.z;
    const pc = camera as THREE.PerspectiveCamera;
    const wantFov = 46 + (spd > 3.4 ? 3.5 : 0);
    if (Math.abs(pc.fov - wantFov) > 0.02) {
      pc.fov += (wantFov - pc.fov) * Math.min(1, step * 5);
      pc.updateProjectionMatrix();
    }

    // 鏡頭震 —— 挨打晃得狠,砍中晃一絲。加在 lookAt 之後,鏡頭姿態算完才抖
    if (fx.shake > 0.01) {
      camera.position.x += (Math.random() - 0.5) * fx.shake * 0.22;
      camera.position.y += (Math.random() - 0.5) * fx.shake * 0.16;
      camera.rotation.z += (Math.random() - 0.5) * fx.shake * 0.012;
    }
  });

  return (
    <>
      <mesh ref={bodyRef} geometry={geom.body} castShadow>
        <meshStandardMaterial vertexColors roughness={0.74} />
      </mesh>
      <mesh ref={headRef} geometry={geom.head} castShadow>
        <meshStandardMaterial vertexColors roughness={0.62} />
      </mesh>
      {[0, 1].map((i) => (
        <mesh key={i} ref={(o) => { legRefs.current[i] = o; }} geometry={geom.leg} castShadow>
          <meshStandardMaterial vertexColors roughness={0.8} />
        </mesh>
      ))}
      {[0, 1].map((i) => (
        <mesh key={`a${i}`} ref={(o) => { armRefs.current[i] = o; }} geometry={geom.arm} castShadow>
          <meshStandardMaterial vertexColors roughness={0.74} />
        </mesh>
      ))}
      {weaponGeom && (
        <mesh ref={weaponRef} geometry={weaponGeom} visible={false} castShadow>
          <meshStandardMaterial
            color={weapon === 'club' ? '#6b4a2c' : '#9aa0a6'}
            roughness={weapon === 'club' ? 0.85 : 0.42}
            metalness={weapon === 'club' ? 0 : 0.55}
          />
        </mesh>
      )}
    </>
  );
}
