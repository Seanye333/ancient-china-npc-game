/**
 * 聲音 —— 全部現算,不帶一個音檔。
 *
 * 這個決定不是為了省事,是為了<b>不讓聲音變成資產問題</b>:一旦開始收集
 * wav,專案就會長出一個素材庫、一套授權問題、一個載入流程,而這個原型
 * 需要的其實只是「腳踩在土上」「刀劃過空氣」「入夜以後蟲叫起來」。
 * 這些用噪音加濾波就夠像,而且改起來是改一個數字,不是重錄一段。
 *
 * 瀏覽器不准沒有互動就出聲,所以整套在標題頁按下「開始」時才啟動 ——
 * 那一下點擊正好是使用者的第一個手勢。
 */

import { useBattle } from './combat';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let bed: { wind: GainNode; night: GainNode; rain: GainNode } | null = null;
let muted = false;

export function audioReady(): boolean {
  return !!ctx && ctx.state === 'running';
}

/** 一段固定長度的噪音 —— 風、雨、腳步、刀,全部從這裡長出來。 */
function noiseBuffer(c: AudioContext, seconds = 2): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    // 粉紅一點的噪音:純白噪音聽起來像電視雪花,不像風
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    d[i] = last * 3.5;
  }
  return buf;
}

function loopNoise(c: AudioContext, type: BiquadFilterType, freq: number, q: number) {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 3);
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.value = 0;
  src.connect(f).connect(g);
  src.start();
  return g;
}

export function startAudio() {
  if (ctx) { void ctx.resume(); return; }
  const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!C) return;
  ctx = new C();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);

  bed = {
    wind: loopNoise(ctx, 'bandpass', 420, 0.7),
    night: loopNoise(ctx, 'bandpass', 2600, 6),   // 蟲聲那一段高頻
    rain: loopNoise(ctx, 'highpass', 1400, 0.6),
  };
  bed.wind.connect(master);
  bed.night.connect(master);
  bed.rain.connect(master);
  // 開場先靜幾秒再來第一段琴 —— 按下「開始」的那口氣要先讓風聲接住
  music.next = ctx.currentTime + 5;
}

export function setMuted(m: boolean) {
  muted = m;
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.5, ctx.currentTime, 0.1);
}

export function isMuted(): boolean {
  return muted;
}

/**
 * 環境音跟著時辰、天氣、以及你站在哪裡走。
 *
 * 三層各自淡入淡出,而不是切換音軌:白天的風裡本來就摻著一點蟲聲,
 * 傍晚是慢慢換過去的。硬切會讓人聽出這是三段錄音。
 */
export function updateAmbience(input: {
  hour: number; weather: string; indoors?: boolean;
}) {
  if (!ctx || !bed) return;
  const t = ctx.currentTime;
  const night = input.hour < 5.4 || input.hour > 19.4;
  const dusk = !night && (input.hour < 7 || input.hour > 17.6);
  const damp = input.indoors ? 0.4 : 1;

  bed.wind.gain.setTargetAtTime((night ? 0.06 : 0.11) * damp, t, 1.2);
  bed.night.gain.setTargetAtTime((night ? 0.055 : dusk ? 0.022 : 0.004) * damp, t, 1.6);
  bed.rain.gain.setTargetAtTime(
    (input.weather === 'rain' ? 0.16 : input.weather === 'snow' ? 0.02 : 0) * damp, t, 1.0);

  // 琴 —— 幾十秒一段,夜裡更稀更輕。打起來就把下一段往後推:
  // 那時候的配樂是刀風;收場之後它也不搶著回來,喘完氣才續上
  const fighting = useBattle.getState().bandId !== null;
  if (fighting) {
    music.next = Math.max(music.next, t + 9 + Math.random() * 8);
  } else if (!muted && t >= music.next) {
    const dur = playPhrase(night);
    music.next = t + dur + 20 + Math.random() * 28 + (night ? 14 : 0);
  }
}

/** 一次性的短音 —— 腳步、刀、挨打。 */
function blip(o: {
  type: BiquadFilterType; freq: number; q: number;
  attack: number; decay: number; gain: number; sweepTo?: number;
}) {
  if (!ctx || !master || muted) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 0.35);
  const f = ctx.createBiquadFilter();
  f.type = o.type;
  f.frequency.value = o.freq;
  f.Q.value = o.q;
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(o.gain, t + o.attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.attack + o.decay);
  if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t + o.attack + o.decay);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + o.attack + o.decay + 0.02);
}

/** 腳步 —— 土路上的一聲悶響。跑起來重一點。 */
export function stepSound(running: boolean) {
  blip({
    type: 'lowpass', freq: running ? 380 : 300, q: 1.1,
    attack: 0.005, decay: running ? 0.11 : 0.08, gain: running ? 0.16 : 0.1,
  });
}

/** 揮刀 —— 一道由高到低的風聲。 */
export function swingSound() {
  blip({
    type: 'bandpass', freq: 2400, q: 1.6,
    attack: 0.012, decay: 0.2, gain: 0.14, sweepTo: 600,
  });
}

/** 砍中 —— 短而鈍。 */
export function hitSound() {
  blip({ type: 'lowpass', freq: 220, q: 2.2, attack: 0.003, decay: 0.14, gain: 0.26 });
}

/** 挨打 —— 比砍中更悶,而且要讓玩家自己聽得出是自己中了。 */
export function hurtSound() {
  blip({ type: 'lowpass', freq: 150, q: 3, attack: 0.004, decay: 0.26, gain: 0.32 });
}

/** 銅錢落袋 —— 給買賣與領俸。 */
export function coinSound() {
  blip({ type: 'bandpass', freq: 3200, q: 4, attack: 0.002, decay: 0.13, gain: 0.1 });
}

/** 弓弦 —— 「啪」的一下彈開,比刀風短促、高一截。 */
export function bowSound() {
  blip({ type: 'bandpass', freq: 1500, q: 2.4, attack: 0.003, decay: 0.16, gain: 0.15, sweepTo: 420 });
}

/* ── 古琴 ─────────────────────────────────────────────
 *
 * 和其他聲音一樣現算,不帶音檔。撥弦用 Karplus-Strong:
 * 一段噪音塞進「弦長」那麼長的延遲環裡反覆平均,幾毫秒後噪音就
 * 收斂成那根弦的音高,而且衰減自然 —— 這個一九八三年的算法,
 * 合出來的就是「撥」的聲音,比任何振盪器都像弦。
 *
 * 樂句稀,間隔幾十秒才來一段 —— 古琴的意思一半在留白裡。
 * 打起來就停:那時候的配樂是刀風和心跳。
 */

/** 宮調五聲,兩個八度 —— C D F G A,古琴定弦的骨架。 */
const GONG = [130.8, 146.8, 174.6, 196.0, 220.0, 261.6, 293.7, 349.2];

const music = { next: 0, plucked: 0 };
const pluckCache = new Map<number, AudioBuffer>();

function pluckBuffer(c: AudioContext, freq: number): AudioBuffer {
  const got = pluckCache.get(freq);
  if (got) return got;
  const sr = c.sampleRate;
  const N = Math.round(sr / freq);
  const len = Math.floor(sr * 2.4);
  const buf = c.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < N; i++) d[i] = Math.random() * 2 - 1;
  // 環裡每圈把相鄰兩點平均一次 —— 高頻先死,剩下的就是弦音。
  // 0.996 是弦的「餘韻」:低音拖得長,像琴不像箏
  for (let i = N; i < len; i++) d[i] = 0.996 * 0.5 * (d[i - N] + d[i - N + 1]);
  pluckCache.set(freq, buf);
  return buf;
}

/** 撥一聲。slideFrom 給「綽」—— 從低一點滑上來,古琴的招牌。 */
function pluck(freq: number, when: number, gain: number, slideFrom = 1) {
  if (!ctx || !master) return;
  const src = ctx.createBufferSource();
  src.buffer = pluckBuffer(ctx, freq);
  if (slideFrom !== 1) {
    src.playbackRate.setValueAtTime(slideFrom, when);
    src.playbackRate.linearRampToValueAtTime(1, when + 0.14);
  }
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 2100;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, when);
  src.connect(f).connect(g).connect(master);
  src.start(when);
  src.stop(when + 2.4);
  music.plucked++;
}

/**
 * 一段樂句:三到六個音在五聲音階上散步,步子小、節奏散,收在一個長音上。
 * 沒有「曲子」—— 每段都是現編的,聽起來像有人在遠處隨手撫弦。
 */
function playPhrase(soft: boolean): number {
  if (!ctx) return 0;
  let t = ctx.currentTime + 0.05;
  let idx = 1 + Math.floor(Math.random() * 5);
  const notes = 3 + Math.floor(Math.random() * 4);
  const vol = soft ? 0.10 : 0.16;
  for (let i = 0; i < notes; i++) {
    const last = i === notes - 1;
    const slide = Math.random() < 0.3 ? 0.92 : 1;
    pluck(GONG[idx], t, vol * (0.8 + Math.random() * 0.4), slide);
    t += last ? 1.7 : [0.38, 0.55, 0.8, 1.15][Math.floor(Math.random() * 4)];
    idx = Math.max(0, Math.min(GONG.length - 1,
      idx + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)]));
  }
  return t - ctx.currentTime;
}

/** 驗收要問得到 —— 聲音壞掉的樣子就是安靜,和沒做完全一樣。 */
export function musicState() {
  return { plucked: music.plucked, nextIn: ctx ? +(music.next - ctx.currentTime).toFixed(1) : null };
}

/** 立刻來一段 —— 純驗收用,不進正式流程。 */
export function nudgeMusic() {
  if (!ctx) return;
  music.next = ctx.currentTime;
}
