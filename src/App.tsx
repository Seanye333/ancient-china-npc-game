import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
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
import { Battle } from './world/Battle';
import { Dialogue } from './ui/Dialogue';
import { BattleHud } from './ui/BattleHud';
import { QuestHud } from './ui/QuestHud';
import { Lanterns } from './world/Lanterns';
import { Weather } from './world/Weather';
import { Tavern } from './world/Interior';
import {
  skyFor, useClock, SEASONS, SEASON_LABEL, WEATHERS, WEATHER_LABEL,
} from './world/worldTime';
import { useHero, rankForMerit, rankLabel, nextRankMerit, retinueCap } from './game/hero';
import { useVillage, orderWord, harvestWord } from './game/village';
import { useBands } from './game/bands';

/**
 * 隨時間變的一切 — 太陽、天空、霧、曝光,全部從 skyFor() 拿同一份參數。
 * 各算各的下場是黃昏的太陽配上正午的霧。
 */
/** 村子的處境每過一天推一次 —— 世界得自己往前走,不是等玩家去戳。 */
function VillageClock() {
  const hour = useClock((s) => s.hour);
  const season = useClock((s) => s.season);
  const tick = useVillage((s) => s.tick);
  // 打散的賊窩過些時日會有人回來 —— 剿匪不是一勞永逸,不然世界會越玩越空
  const regrow = useBands((s) => s.regrow);
  const lastDay = useRef(-1);
  // 原型階段的除錯鉤子 — 讓截圖腳本壓治安,好把剿匪的活逼出來
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__village =
      (order: number) => useVillage.getState().nudge({ order });
  }, []);
  useEffect(() => {
    const day = Math.floor(hour / 24);
    if (day !== lastDay.current) { lastDay.current = day; tick(season); regrow(); }
  }, [hour, season, tick, regrow]);
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
  const { camera, controls } = useThree() as unknown as {
    camera: THREE.PerspectiveCamera;
    controls: { target: THREE.Vector3; update: () => void } | null;
  };
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__setClock = (
      h: number, se: 'spring' | 'summer' | 'autumn' | 'winter',
    ) => {
      useClock.getState().setHour(h);
      useClock.getState().setSeason(se);
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
  }, [camera, controls]);
  return null;
}

function Hud() {
  const hour = useClock((s) => s.hour);
  const season = useClock((s) => s.season);
  const auto = useClock((s) => s.auto);
  const setHour = useClock((s) => s.setHour);
  const setSeason = useClock((s) => s.setSeason);
  const weather = useClock((s) => s.weather);
  const setWeather = useClock((s) => s.setWeather);
  const toggleAuto = useClock((s) => s.toggleAuto);
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let n = 0; let last = performance.now(); let raf = 0;
    const loop = () => {
      n++;
      const now = performance.now();
      if (now - last > 500) { setFps(Math.round((n * 1000) / (now - last))); n = 0; last = now; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const hh = Math.floor(hour);
  const mm = Math.floor((hour - hh) * 60);
  const btn = (active: boolean): CSSProperties => ({
    padding: '.3rem .7rem',
    background: active ? '#c8a45a' : 'rgba(255,255,255,.10)',
    color: active ? '#1a1206' : '#e6e2d8',
    border: '1px solid rgba(255,255,255,.18)',
    cursor: 'pointer',
    fontSize: '.82rem',
    fontFamily: 'inherit',
  });

  return (
    <div style={{
      position: 'fixed', top: 16, right: 16, width: 236, padding: '.9rem 1rem',
      background: 'rgba(14,17,22,.78)', backdropFilter: 'blur(8px)',
      border: '1px solid rgba(255,255,255,.14)',
      color: '#e6e2d8', fontFamily: '"PingFang SC","Hiragino Sans GB",system-ui,sans-serif',
      display: 'flex', flexDirection: 'column', gap: '.6rem', userSelect: 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '.5rem' }}>
        <span style={{ fontSize: '1.5rem', fontVariantNumeric: 'tabular-nums' }}>
          {String(hh).padStart(2, '0')}:{String(mm).padStart(2, '0')}
        </span>
        <span style={{ fontSize: '.74rem', opacity: 0.6, letterSpacing: '.12em' }}>時辰</span>
        <button style={{ ...btn(auto), marginLeft: 'auto' }} onClick={toggleAuto}>
          {auto ? '運行中' : '靜止'}
        </button>
      </div>
      <input
        type="range" min={0} max={24} step={0.1} value={hour}
        onChange={(e) => setHour(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: '#c8a45a' }}
        aria-label="時辰"
      />
      <div style={{ display: 'flex', gap: '.3rem' }}>
        {SEASONS.map((s) => (
          <button key={s} style={{ ...btn(season === s), flex: 1 }} onClick={() => setSeason(s)}>
            {SEASON_LABEL[s]}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '.3rem' }}>
        {WEATHERS.map((w) => (
          <button key={w} style={{ ...btn(weather === w), flex: 1 }} onClick={() => setWeather(w)}>
            {WEATHER_LABEL[w]}
          </button>
        ))}
      </div>
      <div style={{
        fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace',
        fontSize: '.7rem', opacity: 0.55, letterSpacing: '.08em',
        display: 'flex', justifyContent: 'space-between',
      }}>
        <span>{fps} FPS</span>
        <span>河谷 · 卯至戌</span>
      </div>
    </div>
  );
}

/** 主角欄 — 你是誰、爬到哪、養得起幾個人。沒有這一條,玩家不知道自己在玩什麼。 */
function HeroBar() {
  const merit = useHero((s) => s.merit);
  const gold = useHero((s) => s.gold);
  const retinue = useHero((s) => s.retinue);
  const followers = useHero((s) => s.followers);
  const lead = useHero((s) => s.stats.leadership);
  const wounded = useHero((s) => s.wounded);
  const village = useVillage();
  const rank = rankForMerit(merit);
  const label = rankLabel(rank);
  const next = nextRankMerit(rank);
  const cap = retinueCap(rank, lead);

  const cell: CSSProperties = {
    display: 'flex', flexDirection: 'column', gap: '.1rem', minWidth: '3.4rem',
  };
  const k: CSSProperties = {
    fontSize: '.62rem', letterSpacing: '.14em', opacity: 0.55,
  };
  const v: CSSProperties = { fontSize: '.98rem', fontVariantNumeric: 'tabular-nums' };

  return (
    <div style={{
      position: 'fixed', left: 16, bottom: 16, padding: '.8rem 1.1rem',
      background: 'rgba(14,17,22,.78)', backdropFilter: 'blur(8px)',
      border: '1px solid rgba(255,255,255,.14)',
      color: '#e6e2d8', fontFamily: '"PingFang SC","Hiragino Sans GB",system-ui,sans-serif',
      display: 'flex', gap: '1.4rem', alignItems: 'flex-end', userSelect: 'none',
    }}>
      <div style={cell}>
        <span style={k}>身份</span>
        <span style={{ ...v, fontSize: '1.25rem' }}>{label.zh}</span>
      </div>
      <div style={cell}>
        <span style={k}>功績</span>
        <span style={v}>{merit}{next !== null && <span style={{ opacity: .5 }}> / {next}</span>}</span>
      </div>
      <div style={cell}>
        <span style={k}>隨行</span>
        <span style={v}>{followers.length + retinue}<span style={{ opacity: .5 }}> / {cap}</span></span>
      </div>
      <div style={cell}>
        <span style={k}>錢</span>
        <span style={v}>{gold}</span>
      </div>
      {wounded > 0 && (
        <div style={cell}>
          <span style={k}>傷</span>
          <span style={{ ...v, color: '#d07862' }}>{wounded}</span>
        </div>
      )}
      <div style={cell}>
        <span style={k}>村況</span>
        <span style={{ ...v, fontSize: '.86rem' }}>{village.order}<span style={{ opacity: .5 }}> 治安</span></span>
      </div>
      <div style={{ ...k, alignSelf: 'flex-end', marginLeft: '.4rem', lineHeight: 1.5 }}>
        WASD 走 · Shift 跑 · E 搭話<br />
        {orderWord(village.order)} · {harvestWord(village.harvest)} · 米 {village.grainPrice}
      </div>
    </div>
  );
}

export default function App() {
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
          <Camps />
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
      <Dialogue />
      <BattleHud />
      <QuestHud />
      <HeroBar />
      <Hud />
    </>
  );
}
