import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sky, Cloud, Clouds } from '@react-three/drei';
import {
  EffectComposer, Bloom, N8AO, ToneMapping, Vignette, SMAA,
} from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { Terrain, River } from './world/Terrain';
import { Conifers, BroadLeaf, Reeds, Rocks, Bamboo, Willows } from './world/Vegetation';
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
import { Tavern } from './world/Interior';
import { skyFor, useClock } from './world/worldTime';
import { useHero } from './game/hero';
import { useVillage } from './game/village';
import { settleDay, settleGuard } from './game/daily';
import { saveGame, loadGame } from './game/save';
import { useInteract, cityfolk } from './game/interact';
import { placeById } from './game/places';
import { DOCKS } from './world/sites';
import { useJournal } from './game/journal';
import { originById } from './game/origin';
import { ORIGIN_WEAPON } from './game/weapons';
import { updateAmbience, isMuted, audioReady } from './game/audio';
import { useEnding } from './game/ending';
import { findPath, navStats, navOpen } from './world/nav';
import { water, steerMove, walkable } from './world/field';
import { useMarauders } from './game/marauders';
import { useRefugees } from './game/refugees';
import { useBands } from './game/bands';
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

  useFrame((_, dt) => tick(dt));

  // 環境音跟著時辰與天氣走 —— 一秒更新一次就夠,它本來就是慢慢淡的
  const amb = useRef(0);
  useFrame((_, dt) => {
    amb.current += dt;
    if (amb.current < 1) return;
    amb.current = 0;
    updateAmbience({ hour: useClock.getState().hour, weather: useClock.getState().weather });
  });

  useEffect(() => {
    gl.toneMappingExposure = sky.exposure;
    const fog = scene.fog as THREE.FogExp2 | null;
    if (fog) {
      fog.color.copy(sky.fog);
      fog.density = sky.fogDensity;
    }
  }, [sky, gl, scene]);

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
        position={sky.sun}
        intensity={sky.sunIntensity}
        color={sky.sunColor}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-150}
        shadow-camera-right={150}
        shadow-camera-top={150}
        shadow-camera-bottom={-150}
        shadow-camera-near={1}
        shadow-camera-far={480}
        shadow-bias={-0.0006}
        shadow-normalBias={0.035}
      />
      <hemisphereLight args={[sky.skyColor, sky.groundColor, sky.hemiIntensity]} />
      <ambientLight intensity={sky.ambient} color="#9fb4c8" />
    </>
  );
}

/** 截圖腳本用的相機把手。原型階段直接掛 window,正式版不會留。 */
function CamBridge() {
  const { camera, controls, gl } = useThree() as unknown as {
    camera: THREE.PerspectiveCamera;
    gl: THREE.WebGLRenderer;
    controls: { target: THREE.Vector3; update: () => void } | null;
  };
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__setClock = (
      h: number, se: 'spring' | 'summer' | 'autumn' | 'winter',
    ) => {
      useClock.getState().setHour(h);
      useClock.getState().setSeason(se);
    };
    // 驗收腳本要問時間、存讀檔、走到某個場所 —— 都是原型階段的把手
    (window as unknown as Record<string, unknown>).__clock = () => useClock.getState();
    (window as unknown as Record<string, unknown>).__renderInfo = () => gl.info.render.calls;
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
    });
    (window as unknown as Record<string, unknown>).__refugees = () => useRefugees.getState().band;
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
      ready: audioReady(), muted: isMuted(),
    });
    (window as unknown as Record<string, unknown>).__villageState = () => useVillage.getState();
    (window as unknown as Record<string, unknown>).__save = () => saveGame();
    (window as unknown as Record<string, unknown>).__load = () => loadGame();
    (window as unknown as Record<string, unknown>).__journal = () =>
      useJournal.getState().entries.map((e) => `${e.day}: ${e.text}`);
    (window as unknown as Record<string, unknown>).__nearPlace = () =>
      useInteract.getState().nearPlace;
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
  }, [camera, controls, gl]);
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
          scene.fog = new THREE.FogExp2(0xb9c9d8, 0.0018);
        }}
      >
        <TimedScene />
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
          <Camps />
          <Raiders />
          <LostPerson />
          <Cart />
          <Followers />
          <Battle />
          <Interaction />
          <Tavern />
          <Weather />
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
          <Bloom intensity={0.42} luminanceThreshold={0.80} luminanceSmoothing={0.28} mipmapBlur />
          <ToneMapping mode={ToneMappingMode.AGX} />
          <Vignette offset={0.28} darkness={0.60} />
          <SMAA />
        </EffectComposer>

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
