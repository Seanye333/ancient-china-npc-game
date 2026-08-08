import { chromium } from '@playwright/test';

/**
 * 天氣批的驗收 —— 雲、積雪、陣風、雷。
 *
 * 四樣有三樣是<b>一閃即逝</b>的(水花 0.35 秒、風痕只在陣裡、閃電 0.16 秒),
 * 靠截圖抓等於碰運氣。所以先盯數字(__sky),再拍幾張看得出天色的對照片。
 */

const PORT = process.env.PORT || 5178;
const OUT = process.env.OUT || 'docs/art-research';
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 60000 });
await page.bringToFront();
await page.waitForFunction(() => typeof window.__sky === 'function', null, { timeout: 60000 });
await page.evaluate(() => window.__begin && window.__begin());
await page.waitForTimeout(2000);

const ok = (b, s) => console.log(b ? `  ✓ ${s}` : `  ✗ ${s}`);
const sky = () => page.evaluate(() => window.__sky());
const set = async (h, se, w, wait = 1500) => {
  await page.evaluate(([hh, ss, ww]) => {
    window.__setWeather(ww); window.__setClock(hh, ss);
  }, [h, se, w]);
  await page.waitForTimeout(wait);
  return sky();
};

console.log('── 雲隨天氣換一副樣子');
const clear = await set(12, 'summer', 'clear');
const rain = await set(12, 'summer', 'rain');
const snowy = await set(12, 'winter', 'snow');
const night = await set(1.5, 'summer', 'clear');
console.log(`  晴 ${JSON.stringify(clear)}`);
console.log(`  雨 ${JSON.stringify(rain)}`);
console.log(`  雪 ${JSON.stringify(snowy)}`);
ok(rain.y < clear.y * 0.7, `雨雲壓低了(${rain.y} vs ${clear.y})`);
ok(rain.puffs > clear.puffs, `雨天雲更多(${rain.puffs} 片 vs ${clear.puffs})`);
ok(night.puffs > 0, '夜裡也有雲');

console.log('── 雨打在地上');
await set(12, 'summer', 'rain', 2500);
let maxSplash = 0;
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(180);
  maxSplash = Math.max(maxSplash, (await sky()).splashes);
}
ok(maxSplash > 20, `地上濺起 ${maxSplash} 朵`);
const dry = await set(12, 'summer', 'clear', 1200);
ok(dry.splashes === 0, '天晴就沒有了');

console.log('── 雪一場一場積起來');
await set(12, 'autumn', 'clear', 1200);
// 上一段把冬天的雪堆起來了,而雪要好幾分鐘才化得完 —— 驗收等不起,直接歸零
await page.evaluate(() => window.__snow(0));
// __snow 改的是 snow.pack,而 __sky() 讀的是上一幀寫進 stormStat 的那份 ——
// 不等一幀,量到的還是歸零之前的數字(第一次就被這個騙了)
await page.waitForTimeout(300);
const before = (await sky()).pack;
await set(12, 'autumn', 'snow', 1000);
const t0 = (await sky()).pack;
await page.waitForTimeout(9000);
const t1 = (await sky()).pack;
await page.evaluate(() => window.__setWeather('clear'));
await page.waitForTimeout(9000);
const t2 = (await sky()).pack;
console.log(`  秋天晴 ${before} → 下雪 9 秒 ${t0}→${t1} → 停雪 9 秒 ${t2}`);
ok(before < 0.02, '秋天本來沒有雪');
ok(t1 > t0 + 0.05, '下著下著就積起來');
ok(t2 > t1 * 0.6, '停了以後化得慢 —— 不是雲一散地就乾');
const winter = await set(12, 'winter', 'clear', 3000);
ok(winter.pack > 0.1, `冬天沒下雪也有底(${winter.pack})`);

console.log('── 陣風:平時靜,偶爾一陣');
await set(12, 'summer', 'clear', 800);
// 陣與陣之間最長四十五秒 —— 盯得不夠久就會得到「風不存在」的結論
let gustMax = 0, calm = 0, n = 0;
for (let i = 0; i < 200; i++) {
  await page.waitForTimeout(250);
  const g = (await sky()).gust;
  gustMax = Math.max(gustMax, g);
  if (g < 0.05) calm++;
  n++;
}
console.log(`  五十秒裡最強 ${gustMax},靜的佔 ${Math.round((calm / n) * 100)}%`);
ok(gustMax > 0.4, '真的颳起來過');
ok(calm / n > 0.4, `大半時間是靜的(${Math.round((calm / n) * 100)}%)`);

console.log('── 雷:天上劈得出形狀');
await set(13, 'summer', 'rain', 1000);
const b0 = (await sky()).bolts;
await page.waitForTimeout(30000);
const b1 = (await sky()).bolts;
console.log(`  三十秒裡劈了 ${b1 - b0} 道`);
ok(b1 > b0, '夏天的雷雨會劈');

/* ── 對照片:同一個機位,四種天 ── */
await page.evaluate(() => window.__place(-6, 40));
await page.waitForTimeout(2400);
await page.evaluate(() => window.__freezeCam(true));
const CAM = [[-30, 26, 92], [10, 2, 0]];
const aim = () => page.evaluate(([c, l]) => window.__setCam(c, l), CAM);

for (const [name, h, se, w] of [
  ['sky-clear', 12, 'summer', 'clear'],
  ['sky-rain', 13, 'summer', 'rain'],
  ['sky-snow', 12, 'winter', 'snow'],
  ['sky-autumn', 16, 'autumn', 'clear'],
]) {
  await set(h, se, w, 2600);
  await aim();
  await page.bringToFront();
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  拍了 ${name}`);
}

console.log(errors.length ? `!! ${errors.length} 個錯誤:\n${errors.slice(0, 4).join('\n')}` : '  無錯誤');
await browser.close();
