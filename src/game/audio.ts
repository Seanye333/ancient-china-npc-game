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
