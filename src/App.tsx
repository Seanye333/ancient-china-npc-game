import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sky, Cloud, Clouds } from '@react-three/drei';
import {
  EffectComposer, Bloom, N8AO, ToneMapping, Vignette, SMAA, GodRays, DepthOfField,
} from '@react-three/postprocessing';
import { ToneMappingMode, type GodRaysEffect, type DepthOfFieldEffect } from 'postprocessing';
import * as THREE from 'three';
import { Terrain, River } from './world/Terrain';
import {
  Conifers, BroadLeaf, Reeds, Rocks, Bamboo, Willows, setFoliageWind,
} from './world/Vegetation';
import { Birds, Chickens, Dogs, FishSplash, TavernFlag } from './world/Life';
import { Details } from './world/Details';
import { Herbs } from './world/Herbs';
import { GroundCover } from './world/GroundCover';
import { Marks, markStat } from './world/Marks';
import { WaterLife, waterStat } from './world/Water';
import { Sickbeds } from './world/Sickbeds';
import { Landmarks } from './world/Landmarks';
import { Farmland, Roads } from './world/Landuse';
import { Settlement } from './world/Settlement';
import { Crowd } from './world/Crowd';
import { Player } from './world/Player';
import { Interaction } from './world/Interaction';
import { Followers } from './world/Followers';
import { Camps } from './world/Camps';
import { Raiders } from './world/Raiders';
import { County, COUNTY } from './world/County';
import { CountyFolk } from './world/CountyFolk';
import { Drifters } from './world/Drifters';
import { FairDay } from './world/FairDay';
import { LostPerson } from './world/LostPerson';
import { Cart } from './world/Cart';
import { Battle } from './world/Battle';
import { Dialogue } from './ui/Dialogue';
import { BattleHud } from './ui/BattleHud';
import { QuestHud } from './ui/QuestHud';
import { PlacePanel } from './ui/PlacePanel';
import { Journal } from './ui/Journal';
import { Title } from './ui/Title';
import { Hud } from './ui/Hud';
import { Ending } from './ui/Ending';
import { Hint } from './ui/Hint';
import { HeroBar } from './ui/HeroBar';
import { Lanterns } from './world/Lanterns';
import { Weather } from './world/Weather';
import { Seasonals } from './world/Atmosphere';
import { ColorGrade, gradeStat } from './world/ColorGrade';
import { Contacts, contactStat } from './world/Contacts';
import { Tavern } from './world/Interior';
import { skyFor, godrayK, useClock } from './world/worldTime';
import { NightSky, SunDisc } from './world/NightSky';
import { MARKET } from './world/sites';
import { playerPos } from './game/interact';
import { useHero } from './game/hero';
import { useVillage } from './game/village';
import { settleDay, settleGuard } from './game/daily';
import { saveGame, loadGame } from './game/save';
import { useInteract, cityfolk } from './game/interact';
import { placeById, houseOf } from './game/places';
import { herbSpots, spotReady } from './game/herbs';
import { useFolk } from './game/folk';
import { useOath, payrollCount } from './game/oath';
import { useFurlough } from './game/furlough';
import { makeVillagers } from './game/npcs';
import { DOCKS } from './world/sites';
import { useJournal } from './game/journal';
import { originById } from './game/origin';
import { ORIGIN_WEAPON } from './game/weapons';
import {
  updateAmbience, isMuted, audioReady, musicState, nudgeMusic, thunderSound,
} from './game/audio';
import { useEnding } from './game/ending';
import { findPath, navStats, navOpen } from './world/nav';
import { water, steerMove, walkable } from './world/field';
import { useMarauders } from './game/marauders';
import { useRefugees } from './game/refugees';
import { useBands } from './game/bands';
import { raidParties, useRaids } from './game/raids';
import { hauntedBy, useVendetta } from './game/vendetta';
import { newsFrom } from './game/tavern';
import { bountyTarget, bountyPay } from './game/yamen';
import { useCalamity } from './game/calamity';
import { lifeTally } from './game/daily';

/**
 * 隨時間變的一切 — 太陽、天空、霧、曝光,全部從 skyFor() 拿同一份參數。
 * 各算各的下場是黃昏的太陽配上正午的霧。
 */
/** 村子的處境每過一天推一次 —— 世界得自己往前走,不是等玩家去戳。 */
function VillageClock() {
  const day = useClock((s) => s.day);
  const season = useClock((s) => s.season);
  const lastDay = useRef(-1);
  // 原型階段的除錯鉤子 — 讓截圖腳本壓治安,好把剿匪的活逼出來
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__village =
      (order: number) => useVillage.getState().nudge({ order });
  }, []);
  /**
   * 過一天結一次帳。
   *
   * 從前這裡寫的是 `Math.floor(hour / 24)`,而 hour 每次都對 24 取餘 ——
   * 那個式子<b>永遠是 0</b>,所以開場結了一次以後就再也沒結過:
   * 村況不動、賊窩不長、傷永遠不好。畫面上什麼都看不出來,
   * 因為那時候根本沒有東西顯示日期。
   */
  useEffect(() => {
    if (day === lastDay.current) return;
    // 讀檔跳過來的日子早就結過了,不能再結一遍
    if (day <= settleGuard.skipUntil) { lastDay.current = day; return; }
    const from = lastDay.current < 0 ? day : lastDay.current + 1;
    lastDay.current = day;
    // 一次跨多天(睡覺、趕路)也要一天一天結,不能只結最後一天。
    // 上限擋住病態情況 —— 一次補三十天以上多半是別處出了錯,不該讓它把糧吃光
    for (let d = from; d <= day && d > day - 30; d++) settleDay(d, season);
    saveGame();      // 一天存一次。這個遊戲沒有「讀檔重來」的樂趣,只有「別弄丟」
  }, [day, season]);
  return null;
}

function TimedScene() {
  const hour = useClock((s) => s.hour);
  const season = useClock((s) => s.season);
  const tick = useClock((s) => s.tick);
  const weather = useClock((s) => s.weather);
  const sky = useMemo(() => skyFor(hour, season, weather), [hour, season, weather]);
  const { gl, scene } = useThree();
  const dirRef = useRef<THREE.DirectionalLight>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const ambRef = useRef<THREE.AmbientLight>(null);
  /** 0 = 露天,1 = 在酒肆裡。進屋是漸變的 —— 光不能「啪」一下切。 */
  const indoor = useRef(0);

  useFrame((_, dt) => tick(dt));

  // 進了酒肆,太陽就交給門板擋:直射壓掉大半、曝光收一點,
  // 灶火油燈(Interior 自己的燈)才浮得出來 —— 「進屋」要有光的儀式
  useFrame((_, dt) => {
    const cx = MARKET[0] + 7, cz = MARKET[1] - 9;
    const inside = Math.abs(playerPos.x - cx) < 5.2 && Math.abs(playerPos.z - cz) < 4.2;
    indoor.current += ((inside ? 1 : 0) - indoor.current) * Math.min(1, dt * 3);
    const k = indoor.current;
    gl.toneMappingExposure = sky.exposure * (1 - k * 0.28);
    const dir = dirRef.current;
    if (dir) {
      dir.intensity = sky.sunIntensity * (1 - k * 0.68);
      /**
       * 影子跟著人走:光的位置與目標都掛在主角身上,陰影相機的框
       * 從 ±150 收到 ±60 —— 同一張 2048 貼圖,近處的影子銳了兩倍半。
       * 框釘死在原點的話,你走到縣城人就出了框,影子整個沒了。
       */
      const L = sky.light.length() || 1;
      dir.position.set(
        playerPos.x + (sky.light.x / L) * 170,
        playerPos.y + (sky.light.y / L) * 170,
        playerPos.z + (sky.light.z / L) * 170,
      );
      dir.target.position.set(playerPos.x, playerPos.y, playerPos.z);
      dir.target.updateMatrixWorld();
    }
    if (hemiRef.current) hemiRef.current.intensity = sky.hemiIntensity * (1 - k * 0.3);
  });

  // 風 —— 晴天有一陣沒一陣,雨裡樹是狂的。強度餵給植被的頂點著色器
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const gust = 0.55 + Math.sin(t * 0.13) * 0.22 + Math.sin(t * 0.047) * 0.14;
    const w = useClock.getState().weather;
    setFoliageWind(t, w === 'rain' ? 1.45 : w === 'snow' ? 0.9 : Math.max(0.25, gust));
  });

  // 環境音跟著時辰與天氣走 —— 一秒更新一次就夠,它本來就是慢慢淡的
  const amb = useRef(0);
  useFrame((_, dt) => {
    amb.current += dt;
    if (amb.current < 1) return;
    amb.current = 0;
    updateAmbience({
      hour: useClock.getState().hour, weather: useClock.getState().weather,
      indoors: indoor.current > 0.5,
    });
  });

  useEffect(() => {
    const fog = scene.fog as THREE.FogExp2 | null;
    if (fog) {
      fog.color.copy(sky.fog);
      fog.density = sky.fogDensity;
    }
  }, [sky, scene]);

  return (
    <>
      <Sky
        distance={4500}
        sunPosition={[sky.sun.x, sky.sun.y, sky.sun.z]}
        turbidity={sky.turbidity}
        rayleigh={sky.rayleigh}
        mieCoefficient={0.006}
        mieDirectionalG={0.82}
      />
      <directionalLight
        ref={dirRef}
        position={sky.light}
        intensity={sky.sunIntensity}
        color={sky.sunColor}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-camera-near={1}
        shadow-camera-far={400}
        shadow-bias={-0.0006}
        shadow-normalBias={0.035}
      />
      <hemisphereLight ref={hemiRef} args={[sky.skyColor, sky.groundColor, sky.hemiIntensity]} />
      <ambientLight ref={ambRef} intensity={sky.ambient} color="#9fb4c8" />
      <Storm ambRef={ambRef} baseAmbient={sky.ambient} />
    </>
  );
}

/**
 * 幀率掉了就先降解析度 —— 畫質的階梯裡 dpr 是最不心疼的一階。
 * 兩秒量一次;掉到 45 以下降一檔,穩回 70 以上慢慢還。
 */
function AdaptiveDpr() {
  const setDpr = useThree((s) => s.setDpr);
  const st = useRef({ n: 0, t0: performance.now(), dpr: Math.min(2, window.devicePixelRatio) });
  const cap = Math.min(2, window.devicePixelRatio);
  useFrame(() => {
    const s = st.current;
    s.n++;
    const now = performance.now();
    if (now - s.t0 < 2000) return;
    const fps = (s.n * 1000) / (now - s.t0);
    s.n = 0; s.t0 = now;
    if (fps < 45 && s.dpr > 1) {
      s.dpr = Math.max(1, s.dpr - 0.25);
      setDpr(s.dpr);
    } else if (fps > 70 && s.dpr < cap) {
      s.dpr = Math.min(cap, s.dpr + 0.25);
      setDpr(s.dpr);
    }
  });
  return null;
}

/**
 * 雷雨 — 夏天的大雨隔一陣劈一道:閃電是環境光猛地拉滿一瞬,
 * 雷聲晚半拍到兩拍才到(光比聲快,這半拍就是「遠」)。
 */
function Storm({ ambRef, baseAmbient }: {
  ambRef: React.RefObject<THREE.AmbientLight | null>; baseAmbient: number;
}) {
  const st = useRef({ next: 8, flashUntil: -1 });
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const s = useClock.getState();
    const storming = s.weather === 'rain' && s.season === 'summer';
    if (storming && t > st.current.next) {
      st.current.flashUntil = t + 0.13;
      st.current.next = t + 9 + Math.random() * 20;
      setTimeout(() => thunderSound(), 500 + Math.random() * 1600);
    }
    const a = ambRef.current;
    if (a) a.intensity = baseAmbient + (t < st.current.flashUntil ? 2.4 : 0);
  });
  return null;
}

/**
 * 對焦與光柱 —— 兩件每幀要餵的合成器參數。
 *
 * <b>景深的焦點永遠釘在主角身上</b>。這不是為了炫技:這個遊戲的鏡頭離人只有六步,
 * 而地平線在四百步外 —— 遠山、對岸的林子、縣城的城牆全都一樣銳,
 * 畫面因此沒有<b>深度</b>,像一張貼在玻璃上的圖。焦外一化開,遠景就退回它該在的地方。
 *
 * 化得<b>很輕</b>是刻意的:焦內範圍給到三十公尺,近處(擋在鏡頭與人之間的樹)
 * 和中景(整個村子)都還是清楚的,糊掉的只有再遠的那一層。
 * 這是「空氣透視」的補充,不是拍人像。
 */
/**
 * 焦內的範圍(公尺)。<b>這個數字比直覺大得多是有理由的</b>。
 *
 * 著色器算的是 smoothstep(0, range, |距離 - 焦距|):第一版給 30,
 * 於是二十步外的一條船就已經化了三成 —— 整個村子糊成一片,
 * 讀起來不是「有景深」,是「近視」。這個鏡頭離人只有六步,
 * 而該糊的是<b>對岸與遠山</b>,那是一兩百步外的事。
 */
const DOF_RANGE = 120;
const DOF_BOKEH = 3.0;

/**
 * 景深<b>不是一直開著的</b> —— 量過:5.8 毫秒。
 *
 * 一整幀本來 7.5 毫秒,掛上景深變 13.3 —— 幾乎翻倍,而換來的是
 * 遠山軟一點。試過把 resolutionScale 從 0.5 砍到 0.25:一毫秒都沒省下來,
 * 因為貴的是<b>全解析度的 CoC 與遮罩兩道</b>,和散景的解析度無關。
 *
 * 所以改成:只在<b>它有話要說</b>的時候開 —— 說話、進場所、落幕。
 * 那幾個時刻世界本來就停著,幀不緊張,而背景化開正好把人推到眼前。
 * 標題頁也開著:那一秒把著色器編譯掉,之後每次掛上都命中 three 的程式快取,
 * 不會在你按下搭話的那一幀卡一下。
 */

function Focus({ at, rays, dof }: {
  at: THREE.Vector3;
  rays: React.RefObject<GodRaysEffect | null>;
  dof: React.RefObject<DepthOfFieldEffect | null>;
}) {
  // 景深開/關的對照片 —— 「有沒有比較好」只有並排才看得出來
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__dof = (k: number) => {
      if (dof.current) dof.current.bokehScale = k;
      return !!dof.current;
    };
  }, [dof]);

  useFrame(({ camera }, dt) => {
    // 焦點在胸口高度,不是腳下 —— 釘在腳上的話人的頭會微微出焦
    at.set(playerPos.x, playerPos.y + 1.0, playerPos.z);
    const g = rays.current;
    if (g) {
      const st = useClock.getState();
      const k = godrayK(st.hour, st.season, st.weather);
      // 再插一次值 —— godrayK 本身連續,但天氣是瞬間切的
      const cur = g.godRaysMaterial.uniforms.weight.value as number;
      g.godRaysMaterial.uniforms.weight.value = cur + (k * 0.34 - cur) * Math.min(1, dt * 2.2);
      rayStat.weight = +g.godRaysMaterial.uniforms.weight.value.toFixed(3);
    } else rayStat.weight = 0;
    dofStat.focus = +at.distanceTo(camera.position).toFixed(1);
    if (dof.current) dofStat.bokeh = dof.current.bokehScale;
  });
  return null;
}

/** 原型階段的把手:光柱多強、焦點多遠。畫面上「有沒有在做」看不出來。 */
const rayStat = { weight: 0 };
const dofStat = { focus: 0, bokeh: 0 };

/** 截圖腳本用的相機把手。原型階段直接掛 window,正式版不會留。 */
/** 一幀開頭把 info 歸零 —— priority 給負的,讓它排在所有繪製之前。 */
function GpuInfoReset() {
  const gl = useThree((s) => s.gl);
  useFrame(() => gl.info.reset(), -1000);
  return null;
}

function CamBridge() {
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
    (window as unknown as Record<string, unknown>).__gpu = () => ({
      calls: gl.info.render.calls,
      tris: gl.info.render.triangles,
      programs: gl.info.programs?.length ?? 0,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
    });
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




export default function App() {
  /**
   * 開場那一頁只是<b>蓋在世界上面的一層</b>,世界本身一開始就掛著。
   *
   * 這件事看起來只是實作細節,其實是刻意的:世界先跑起來,
   * 按下「開始」不會有載入畫面,而且所有驗收腳本的 window 把手
   * 在標題頁時就已經存在 —— 否則加一個開場等於一次弄壞六支腳本。
   */
  const [started, setStarted] = useState(false);
  const ending = useEnding((s) => s.life);
  const talking = useInteract((s) => s.talkingTo);
  const atPlace = useInteract((s) => s.atPlace);
  const softFocus = !started || !!ending || !!talking || !!atPlace;
  /** GodRays 要一個光源網格 —— SunDisc 掛好後把 ref 遞給合成器。 */
  const [sunMesh, setSunMesh] = useState<THREE.Mesh | null>(null);
  const raysRef = useRef<GodRaysEffect>(null);
  const dofRef = useRef<DepthOfFieldEffect>(null);
  /** 焦點的那個 Vector3 <b>不能每幀換一個新的</b> —— effect 只在掛載時收一次引用。 */
  const focusAt = useMemo(() => new THREE.Vector3(), []);
  /*
   * 體積光掛不掛在場上。
   *
   * 強度由 godrayK() 每幀連續給(見 RayRamp),這裡只管<b>掛載</b> ——
   * 而且門檻壓得極低(0.002),所以掛上與卸下都發生在強度已經是零的時候:
   * 光柱是透出來的,不是彈出來的。
   */
  const lowSun = useClock((s) => godrayK(s.hour, s.season, s.weather) > 0.002);
  useEffect(() => {
    // 世界在標題頁不該偷偷走掉幾天
    if (!started) useClock.setState({ auto: false });
    (window as unknown as Record<string, unknown>).__begin = (originId?: string) => {
      if (originId) {
        const o = originById(originId);
        useHero.setState({
          name: '無名', hometown: o.hometown, stats: { ...o.stats },
          gold: o.gold, grain: o.grain, renown: o.renown, lodging: o.lodging,
          weapon: ORIGIN_WEAPON[o.id] ?? 'club',
        });
      }
      useClock.setState({ auto: true });
      setStarted(true);
    };
  }, [started]);

  // Esc 一律先關掉最上層的東西 —— 場所面板現在也在那一疊裡
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      const st = useInteract.getState();
      if (st.atPlace) st.closePlace();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [58, 34, 74], fov: 46, near: 0.5, far: 1400 }}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        onCreated={({ gl, scene }) => {
          gl.toneMapping = THREE.AgXToneMapping;
          /*
           * 自己管 info 的歸零。
           *
           * 預設每次 render 都清一次,而合成器一幀要 render 好幾遍 ——
           * 於是從外面讀到的永遠是<b>最後那一道全屏 pass</b>:1 個 draw、0 個三角形。
           * 我照著這個數字差點斷定「植被不花錢」。改成一幀開頭清一次,
           * 讀到的才是整幀的總帳。
           */
          gl.info.autoReset = false;
          scene.fog = new THREE.FogExp2(0xb9c9d8, 0.0018);
        }}
      >
        <TimedScene />
        <NightSky />
        <SunDisc ref={setSunMesh} />
        <VillageClock />
        <Suspense fallback={null}>
          <Terrain />
          <River />
          <Roads />
          <Farmland />
          <Settlement />
          <Landmarks />
          <Crowd />
          <Player />
          <County />
          <CountyFolk />
          <Drifters />
          <FairDay />
          <Camps />
          <Raiders />
          <LostPerson />
          <Cart />
          <Followers />
          <Battle />
          <Interaction />
          <Tavern />
          <Weather />
          <Seasonals />
          <Birds />
          <Chickens />
          <Dogs />
          <FishSplash />
          <TavernFlag />
          <Details />
          <GroundCover />
          <Marks />
          <Contacts />
          <WaterLife />
          <Herbs />
          <Sickbeds />
          <Lanterns />
          <Conifers />
          <BroadLeaf />
          <Bamboo />
          <Willows />
          <Reeds />
          <Rocks />
          <Clouds material={THREE.MeshBasicMaterial} limit={220}>
            <Cloud seed={7} bounds={[130, 8, 130]} volume={26} position={[0, 78, -40]}
              opacity={0.28} speed={0.06} color="#eef3fa" />
            <Cloud seed={13} bounds={[110, 6, 110]} volume={20} position={[80, 92, 60]}
              opacity={0.20} speed={0.05} color="#e6edf6" />
          </Clouds>
        </Suspense>

        <EffectComposer multisampling={0} enableNormalPass>
          <N8AO aoRadius={4.2} intensity={1.5} distanceFalloff={1.1} halfRes />
          {softFocus ? (
            <DepthOfField
              ref={dofRef} target={focusAt} worldFocusRange={DOF_RANGE}
              bokehScale={DOF_BOKEH} resolutionScale={0.5}
            />
          ) : <></>}
          {sunMesh && lowSun ? (
            <GodRays ref={raysRef} sun={sunMesh} samples={36} density={0.92} decay={0.94}
              weight={0} exposure={0.26} blur />
          ) : <></>}
          <Bloom intensity={0.42} luminanceThreshold={0.80} luminanceSmoothing={0.28} mipmapBlur />
          <ToneMapping mode={ToneMappingMode.AGX} />
          {/* 調色擺在色調映射之後 —— 這一層動的是<b>成片</b>,不是場景的光 */}
          <ColorGrade />
          <Vignette offset={0.28} darkness={0.60} />
          <SMAA />
        </EffectComposer>
        <Focus at={focusAt} rays={raysRef} dof={dofRef} />

        <AdaptiveDpr />
        <GpuInfoReset />
        <CamBridge />
      </Canvas>
      {!started && <Title onStart={() => setStarted(true)} />}
      {started && <Ending onRestart={() => {
        // 再來一局:回標題頁,把一生的流水帳歸零
        useEnding.getState().reset();
        lifeTally.reset();
        setStarted(false);
      }} />}
      {started && !ending && <Hint />}
      <Dialogue />
      <PlacePanel />
      <BattleHud />
      <QuestHud />
      <Journal />
      <HeroBar />
      <Hud />
    </>
  );
}
