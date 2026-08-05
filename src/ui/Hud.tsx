import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  useClock, SEASONS, SEASON_LABEL, WEATHERS, WEATHER_LABEL,
} from '../world/worldTime';
import { saveGame, loadGame, hasSave, wipeSave } from '../game/save';
import { setMuted, isMuted, audioReady } from '../game/audio';
import { panel } from './style';

/**
 * 除錯與時間的控制盤。
 *
 * 這是<b>原型階段的工具</b>,不是遊戲的一部分:直接撥時辰、跳季節、換天氣、
 * 存讀檔。正式版不會留 —— 但在那之前,能不能三秒鐘把世界擺成「秋天傍晚下著雨」
 * 決定了驗收一件事要花三十秒還是三十分鐘。
 *
 * 順帶盯著兩個數:FPS 與 draw call。既有專案在大地圖上踩過的坑是
 * <b>卡頓的真因是 draw call 不是三角形</b>,所以要盯的是後者。
 */
export function Hud() {
  const hour = useClock((s) => s.hour);
  const season = useClock((s) => s.season);
  const auto = useClock((s) => s.auto);
  const setHour = useClock((s) => s.setHour);
  const setSeason = useClock((s) => s.setSeason);
  const weather = useClock((s) => s.weather);
  const setWeather = useClock((s) => s.setWeather);
  const toggleAuto = useClock((s) => s.toggleAuto);
  const [fps, setFps] = useState(0);
  /**
   * draw call,不是三角形數。
   *
   * 既有專案在大地圖上追過一次卡頓,最後查出來真因是 draw call ——
   * 三角形再多,一次畫完就不痛;而幾百個各自為政的小物件會把主執行緒磨死。
   * 所以這裡盯的是這個數字,樹和房子才都併成一個 mesh。
   */
  const [calls, setCalls] = useState(0);
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(null), 2200);
    return () => clearTimeout(t);
  }, [saved]);
  useEffect(() => {
    let n = 0; let last = performance.now(); let raf = 0;
    const loop = () => {
      n++;
      const now = performance.now();
      if (now - last > 500) {
        setFps(Math.round((n * 1000) / (now - last)));
        const r = (window as unknown as { __renderInfo?: () => number }).__renderInfo;
        if (r) setCalls(r());
        n = 0; last = now;
      }
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
      ...panel,
      position: 'fixed', top: 16, right: 16, width: 236, padding: '.9rem 1rem',
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
      <div style={{ display: 'flex', gap: '.3rem' }}>
        <button style={{ ...btn(false), flex: 1 }} onClick={() => setSaved(saveGame() ? '存了' : '存不了')}>
          存檔
        </button>
        <button style={{ ...btn(false), flex: 1, opacity: hasSave() ? 1 : .45 }}
          onClick={() => setSaved(loadGame() ? '讀了' : '沒有存檔')}>
          讀檔
        </button>
        <button style={{ ...btn(false), padding: '.3rem .5rem' }}
          onClick={() => { wipeSave(); setSaved('清了'); }}>
          清
        </button>
        <button style={{ ...btn(false), padding: '.3rem .5rem' }}
          onClick={() => { setMuted(!isMuted()); setSaved(isMuted() ? '靜音' : '有聲'); }}>
          {audioReady() && !isMuted() ? '♪' : '×'}
        </button>
      </div>
      <div style={{
        fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace',
        fontSize: '.7rem', opacity: 0.55, letterSpacing: '.08em',
        display: 'flex', justifyContent: 'space-between',
      }}>
        <span>{fps} FPS · {calls} draw</span>
        <span>{saved ?? '河谷 · 卯至戌'}</span>
      </div>
    </div>
  );
}
