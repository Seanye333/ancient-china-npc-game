/**
 * 原型階段的 window 把手 —— 給驗收腳本用的那一整排 `__xxx`。
 *
 * 這一坨從 App.tsx 搬出來,理由不是它太長(雖然它佔了那個檔的三成),
 * 而是它<b>和遊戲本身沒有關係</b>:它一行都不影響畫面,只是把內部狀態
 * 開一個口給 tools/probes 那些腳本。混在場景樹旁邊的時候,
 * 「App.tsx 到底掛了哪些東西」要往下捲兩百行才看得完。
 *
 * 正式版不會留這個檔 —— 到那時候刪掉一個 import 就乾淨了,
 * 這也是把它獨立出來的第二個理由。
 *
 * 幾條慣例:
 * · 凡是「等它自己發生要等好幾旬」的,都給一個強制發生的把手
 *   (__askLeave / __forceVendetta / __makeSick / __forceBattle)。
 * · 凡是眼睛驗不動的,都露一個數字(__post / __sky / __fallen / __built)。
 * · 位置類的一律提供瞬移版本 —— __walkToPlace 是<b>用走的</b>,
 *   跨半個村子要好幾十秒,驗收等不起。
 */

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { rayStat, dofStat } from '../world/postStat';
import { useBands } from '../game/bands';
import { raidParties, useRaids } from '../game/raids';
import { hauntedBy, useVendetta } from '../game/vendetta';
import { newsFrom } from '../game/tavern';
import { bountyTarget, bountyPay } from '../game/yamen';
import { useCalamity } from '../game/calamity';
import * as THREE from 'three';
import {} from '../world/Details';
import {} from '../world/Herbs';
import {} from '../world/GroundCover';
import { markStat } from '../world/Marks';
import { waterStat } from '../world/Water';
import {} from '../world/Sickbeds';
import {} from '../world/Landmarks';
import {} from '../world/Settlement';
import {} from '../world/Crowd';
import {} from '../world/Player';
import {} from '../world/Interaction';
import {} from '../world/Followers';
import {} from '../world/Camps';
import {} from '../world/Raiders';
import { COUNTY } from '../world/County';
import {} from '../world/CountyFolk';
import {} from '../world/Drifters';
import {} from '../world/FairDay';
import {} from '../world/LostPerson';
import {} from '../world/Cart';
import {} from '../world/Battle';
import { fallenStat } from '../world/Fallen';
import {} from '../ui/Dialogue';
import {} from '../ui/BattleHud';
import {} from '../ui/QuestHud';
import {} from '../ui/PlacePanel';
import {} from '../ui/Journal';
import {} from '../ui/Title';
import {} from '../ui/Hud';
import {} from '../ui/Ending';
import {} from '../ui/Hint';
import {} from '../ui/HeroBar';
import {} from '../world/Lanterns';
import {} from '../world/Weather';
import {} from '../world/Atmosphere';
import { cloudStat } from '../world/SkyClouds';
import { stormStat, snow } from '../world/Storms';
import { gradeStat } from '../world/ColorGrade';
import { contactStat } from '../world/Contacts';
import { builtStat } from '../world/Built';
import { coverStat } from '../world/GroundCover';
import { foliageStat, setVegHidden } from '../world/Vegetation';
import { useClock } from '../world/worldTime';
import {} from '../world/sky';
import {} from '../world/sites';
import { playerPos } from '../game/interact';
import { useHero } from '../game/hero';
import { useVillage } from '../game/village';
import { settleDay } from '../game/daily';
import { saveGame, loadGame } from '../game/save';
import { useInteract, cityfolk } from '../game/interact';
import { placeById, houseOf } from '../game/places';
import { herbSpots, spotReady } from '../game/herbs';
import { useFolk } from '../game/folk';
import { useOath, payrollCount } from '../game/oath';
import { useFurlough } from '../game/furlough';
import { makeVillagers } from '../game/npcs';
import { DOCKS } from '../world/sites';
import { useJournal } from '../game/journal';
import {} from '../game/origin';
import {} from '../game/weapons';
import {
  isMuted, audioReady, musicState, nudgeMusic, 
} from '../game/audio';
import {} from '../game/ending';
import { findPath, navStats, navOpen } from '../world/nav';
import { water, steerMove, walkable } from '../world/field';
import { useMarauders } from '../game/marauders';
import { useRefugees } from '../game/refugees';

export function DevHandles() {
  const { camera, controls, gl, scene } = useThree() as unknown as {
    camera: THREE.PerspectiveCamera;
    gl: THREE.WebGLRenderer;
    scene: THREE.Scene;
    controls: { target: THREE.Vector3; update: () => void } | null;
  };
  useEffect(() => {
    /**
     * 整棵場景 —— 畫面出問題的時候,「是顏色壞了還是光的問題」
     * 用眼睛分不出來,要能把 instanceColor 撈出來數。
     */
    (window as unknown as Record<string, unknown>).__scene = scene;
    (window as unknown as Record<string, unknown>).__setClock = (
      h: number, se: 'spring' | 'summer' | 'autumn' | 'winter',
    ) => {
      useClock.getState().setHour(h);
      useClock.getState().setSeason(se);
    };
    // 驗收腳本要問時間、存讀檔、走到某個場所 —— 都是原型階段的把手
    (window as unknown as Record<string, unknown>).__clock = () => useClock.getState();
    (window as unknown as Record<string, unknown>).__renderInfo = () => gl.info.render.calls;
    // 量成本要看三樣:畫幾次、幾個三角形、幾個程式。只看一樣會找錯瓶頸
    (window as unknown as Record<string, unknown>).__marks = () => ({ ...markStat, ...waterStat });
    // 後處理是最難用眼睛驗的一層:調色「有沒有在動」、光柱「是不是零」
    // 全都看不出來,所以每一項都露一個數字出來
    (window as unknown as Record<string, unknown>).__post = () => ({
      ...gradeStat, ...rayStat, ...dofStat, contacts: contactStat.count,
      contactAlpha: contactStat.opacity,
    });
    // 天氣落到地上的那一半:雲/水花/風痕/雷/積雪。全都是一閃即逝的,截圖抓不準
    (window as unknown as Record<string, unknown>).__sky = () => ({
      ...cloudStat, ...stormStat,
    });
    // 地上躺著幾個、幾攤血 —— 打完就走的人不會回頭看,驗收要看
    (window as unknown as Record<string, unknown>).__fallen = () => ({ ...fallenStat });
    // 房子調到多「新」、葉子透光透多少 —— 兩樣都是幾個百分點的事,眼睛比不出來
    (window as unknown as Record<string, unknown>).__built = () => ({ ...builtStat });
    (window as unknown as Record<string, unknown>).__foliage = () => ({ ...foliageStat });
    (window as unknown as Record<string, unknown>).__groundCover2 = () => ({ ...coverStat });
    // 量「植被到底花多少錢」用的:整批藏起來,前後各量一次幀時間
    (window as unknown as Record<string, unknown>).__hideVeg = (on: boolean) => setVegHidden(!!on);
    // 積雪要好幾分鐘才化得完 —— 驗收等不起,給一個直接設深度的把手
    (window as unknown as Record<string, unknown>).__snow = (k: number) => {
      snow.pack = Math.min(1, Math.max(0, k));
      return snow.pack;
    };
    (window as unknown as Record<string, unknown>).__gpu = () => ({
      calls: gl.info.render.calls,
      tris: gl.info.render.triangles,
      programs: gl.info.programs?.length ?? 0,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
    });
    /*
     * 螢幕上這一點是什麼東西。
     *
     * 加這個把手是因為:遠景裡有三個對不上任何東西的白色大圓,
     * 掃過整棵場景樹也認不出是誰(「大而透明」的清單裡沒有一個對得上)。
     * 眼睛認不出、清單也查不到的時候,就從那個像素射一條線回去問。
     */
    (window as unknown as Record<string, unknown>).__pick = (px: number, py: number) => {
      const rc = new THREE.Raycaster();
      const el = gl.domElement;
      rc.setFromCamera(new THREE.Vector2(
        (px / el.clientWidth) * 2 - 1, -(py / el.clientHeight) * 2 + 1,
      ), camera);
      return rc.intersectObjects(scene.children, true).slice(0, 5).map((h) => ({
        d: Math.round(h.distance),
        geo: (h.object as THREE.Mesh).geometry?.type,
        mat: ((h.object as THREE.Mesh).material as THREE.Material)?.type,
        type: h.object.type,
        at: [h.point.x, h.point.y, h.point.z].map((v) => Math.round(v)),
      }));
    };
    (window as unknown as Record<string, unknown>).__nav = (
      x0: number, z0: number, x1: number, z1: number,
    ) => ({ path: findPath(x0, z0, x1, z1), stats: navStats() });
    (window as unknown as Record<string, unknown>).__navOpen = (x: number, z: number) => navOpen(x, z);
    (window as unknown as Record<string, unknown>).__water = () => water.offset;
    (window as unknown as Record<string, unknown>).__countyAt = () => [COUNTY.x, COUNTY.z];
    (window as unknown as Record<string, unknown>).__dockAt = () => [DOCKS[0][0], DOCKS[0][1]];
    (window as unknown as Record<string, unknown>).__forceMarauders = (d: number) =>
      useMarauders.getState().begin(d);
    (window as unknown as Record<string, unknown>).__news = () => newsFrom({
      bands: useBands.getState().bands, raids: [],
      marauders: useMarauders.getState(),
      village: useVillage.getState(), at: { x: 0, z: 0 }, sickNames: [],
      hunted: hauntedBy(),
    });
    (window as unknown as Record<string, unknown>).__refugees = () => useRefugees.getState().band;
    (window as unknown as Record<string, unknown>).__vendetta = () => useVendetta.getState().grudges;
    (window as unknown as Record<string, unknown>).__grudge = (id: string, n: number, day: number) =>
      useVendetta.getState().remember(id, n, day);
    // 驗收用:讓仇家立刻出現在你旁邊,不必等機率湊齊
    (window as unknown as Record<string, unknown>).__forceVendetta = (id: string) => {
      const band = useBands.getState().bands.find((b) => b.id === id);
      if (!band) return false;
      raidParties.push({
        id: `${id}-vendetta-force`, bandId: id, name: band.name,
        count: 3, fierce: band.fierce,
        x: playerPos.x + 22, y: 0, z: playerPos.z + 10, yaw: 0,
        phase: 'out', linger: 110, since: useClock.getState().day, hunting: true,
      });
      useRaids.getState().bump();
      return true;
    };
    // 採藥:藥叢在哪、採空了幾叢、手上幾株
    (window as unknown as Record<string, unknown>).__herbs = () => ({
      spots: herbSpots().map((s) => ({
        id: s.id, at: [Math.round(s.x), Math.round(s.z)], wild: s.wild,
        ready: spotReady(s.id, useClock.getState().day),
      })),
      onHand: useHero.getState().herbs,
      wounded: useHero.getState().wounded,
      woundKind: useHero.getState().woundKind,
      dressedOn: useHero.getState().dressedOn,
      scars: useHero.getState().scars,
    });
    // 讓某個人病倒 —— 等他自己病要等好幾旬,驗收等不起
    (window as unknown as Record<string, unknown>).__makeSick = (id: string, days = 3) => {
      useFolk.getState().patch(id, { sick: days });
      return houseOf(id);
    };
    (window as unknown as Record<string, unknown>).__folk = (id: string) =>
      useFolk.getState().deltas[id] ?? null;
    // 結義:狀態、月錢份數,以及一個「挑個不怕事的人」——
    // 怕事的擔不起結義這種事,驗收隨手抓一個是會抓到的
    (window as unknown as Record<string, unknown>).__oath = () => ({
      sworn: useOath.getState().sworn,
      swornOn: useOath.getState().swornOn,
      fallen: useOath.getState().fallen,
    });
    // 告假:讓某個隨行的人立刻開口(等他自己開口要好幾旬,驗收等不起)
    (window as unknown as Record<string, unknown>).__askLeave = (
      id: string, reason = 'illness', days = 8,
    ) => {
      useFurlough.getState().clearAsk();
      useFurlough.getState().ask({
        id, reason: reason as never, askedOn: useClock.getState().day, days,
      });
      return useFurlough.getState().pending;
    };
    // 手動結一天的帳 —— 驗收要把日子往前推,而等時鐘走太慢
    (window as unknown as Record<string, unknown>).__settle = (d: number) =>
      settleDay(d, useClock.getState().season);
    (window as unknown as Record<string, unknown>).__furlough = () => ({
      pending: useFurlough.getState().pending,
      away: useFurlough.getState().away,
    });
    (window as unknown as Record<string, unknown>).__payroll = () => {
      const h = useHero.getState();
      return payrollCount(h.followers, h.retinue);
    };
    (window as unknown as Record<string, unknown>).__braveIds = () =>
      makeVillagers(38).filter((v) => v.temper !== 'timid').map((v) => v.id);
    (window as unknown as Record<string, unknown>).__pickBrave = () => {
      const v = makeVillagers(38).find((p) => p.temper !== 'timid')!;
      return { id: v.id, name: v.name, temper: v.temper, age: v.age };
    };
    (window as unknown as Record<string, unknown>).__bandsStore = () => useBands;
    (window as unknown as Record<string, unknown>).__bounty = () => {
      const t = bountyTarget(useBands.getState().bands, useVillage.getState().order);
      return t && { name: t.name, pay: bountyPay(t) };
    };
    (window as unknown as Record<string, unknown>).__cityfolk = () =>
      cityfolk.map((c) => ({ id: c.id, x: Math.round(c.x), z: Math.round(c.z) }));
    (window as unknown as Record<string, unknown>).__steer = (
      x: number, z: number, tx: number, tz: number, step: number,
    ) => {
      const dx = tx - x, dz = tz - z; const d = Math.hypot(dx, dz) || 1;
      const got = steerMove(x, z, dx / d, dz / d, step);
      return { moved: +Math.hypot(got.x - x, got.z - z).toFixed(3),
               to: [+got.x.toFixed(1), +got.z.toFixed(1)],
               walkHere: walkable(x, z) };
    };
    (window as unknown as Record<string, unknown>).__flood = () => useCalamity.getState()
      .begin({ kind: 'flood', since: useClock.getState().day, daysLeft: 40 });
    (window as unknown as Record<string, unknown>).__audio = () => ({
      ready: audioReady(), muted: isMuted(), music: musicState(),
    });
    (window as unknown as Record<string, unknown>).__pluck = () => nudgeMusic();
    (window as unknown as Record<string, unknown>).__villageState = () => useVillage.getState();
    (window as unknown as Record<string, unknown>).__save = () => saveGame();
    (window as unknown as Record<string, unknown>).__load = () => loadGame();
    (window as unknown as Record<string, unknown>).__journal = () =>
      useJournal.getState().entries.map((e) => `${e.day}: ${e.text}`);
    (window as unknown as Record<string, unknown>).__nearPlace = () =>
      useInteract.getState().nearPlace;
    // 場所在哪 —— 驗收要瞬移過去(__walkToPlace 是<b>用走的</b>,跨半個村子要好幾十秒)
    (window as unknown as Record<string, unknown>).__placePos = (id: string) => {
      const p = placeById(id);
      return p ? [p.x, p.z] : null;
    };
    (window as unknown as Record<string, unknown>).__walkToPlace = (id: string) => {
      const p = placeById(id);
      if (p) (window as unknown as Record<string, (x: number, z: number) => void>)
        .__walkTo(p.x, p.z);
      return !!p;
    };
    (window as unknown as Record<string, unknown>).__setWeather = (
      w: 'clear' | 'rain' | 'snow',
    ) => useClock.getState().setWeather(w);
    (window as unknown as Record<string, unknown>).__setCam = (
      cam: [number, number, number], target: [number, number, number],
    ) => {
      camera.position.set(...cam);
      if (controls) {
        controls.target.set(...target);
        controls.update();
      }
      camera.lookAt(...target);
    };
  }, [camera, controls, gl, scene]);
  return null;
}
