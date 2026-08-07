import { chromium } from '@playwright/test';

/**
 * 世界巡檢 —— 把各個角落、各個季節各拍一張,外加一輪<b>看不見的</b>檢查。
 *
 * 兩件事這支腳本才做得到:
 * 一、畫面批最後只能用眼睛判,那就得有一組固定機位的對照片;
 * 二、有些畫面 bug 眼睛分不出來 —— 2600 棵針葉樹裡有 644 棵 instanceColor
 *     是純黑的,可黑樹散在暗綠的林子裡只像「那邊背光」。
 *     把 instanceColor 撈出來數,才知道是四分之一。
 *
 * 兩個取景的坑:__place 之後鏡頭解算器要兩秒才安頓好;而<b>擺完鏡頭要立刻
 * 按快門</b> —— 它每幀把鏡頭往主角肩後拉,半秒就完全收回去了。
 */

const PORT = process.env.PORT || 5179;
const OUT = process.env.OUT || 'docs/art-research';
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1500, height: 860 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 60000 });
await page.bringToFront();
await page.waitForFunction(() => typeof window.__place === 'function', null, { timeout: 60000 });
await page.waitForTimeout(2500);
await page.evaluate(() => window.__begin && window.__begin());
await page.waitForTimeout(1200);

const ok = (b, s) => console.log(b ? `  ✓ ${s}` : `  ✗ ${s}`);

/* ── 一、看不見的那一輪 ────────────────────── */

console.log('── instanceColor:抖色不能把東西抖成純黑');
const scan = await page.evaluate(() => {
  const out = [];
  window.__scene.traverse((o) => {
    if (!o.isInstancedMesh || !o.instanceColor) return;
    const a = o.instanceColor.array;
    let black = 0; let min = 9;
    for (let i = 0; i < o.count; i++) {
      const s = a[i * 3] + a[i * 3 + 1] + a[i * 3 + 2];
      if (s < 0.006) black++;
      min = Math.min(min, s);
    }
    out.push({ geo: o.geometry?.type, n: o.count, black, min: +min.toFixed(4) });
  });
  return out;
});
for (const r of scan) console.log(`  ${r.geo} ×${r.n} · 黑 ${r.black} · 最暗 ${r.min}`);
ok(scan.every((r) => r.black === 0), '沒有一批是純黑的');

/* ── 二、看得見的那一輪 ────────────────────── */

async function shot(name) {
  await page.bringToFront();
  await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 60000 });
  console.log(' ', name);
}
const y = (x, z) => page.evaluate(([a, b]) => window.__terrain(a, b).h, [x, z]);
const clock = async (h, s, w = 'clear') => {
  await page.evaluate(([hh, ss, ww]) => { window.__setClock(hh, ss); window.__setWeather(ww); },
    [h, s, w]);
  await page.waitForTimeout(500);
};
/** 站到某處,把鏡頭擺到指定位置,<b>立刻</b>截。 */
async function pose(px, pz, cam, look, wait = 1900) {
  await page.evaluate(([x, z]) => window.__place(x, z), [px, pz]);
  await page.waitForTimeout(wait);
  await page.evaluate(([c, l]) => window.__setCam(c, l), [cam, look]);
  await page.waitForTimeout(30);
}

console.log('── 取景');
await clock(8.6, 'autumn');
{
  const h = await y(10, 0);
  await pose(10, 0, [56, h + 26, 54], [10, h + 2, 0]);
  await shot('s-village-wide');
}
{
  const ct = await page.evaluate(() => window.__countyAt());
  await clock(13.5, 'autumn');
  const h = await y(ct[0], ct[1]);
  await pose(ct[0], ct[1] + 30, [ct[0] + 30, h + 22, ct[1] + 66], [ct[0], h + 4, ct[1]], 2400);
  await shot('s-county');
}
{
  const dk = await page.evaluate(() => window.__dockAt());
  await clock(18.0, 'autumn');
  const h = await y(dk[0], dk[1]);
  await pose(dk[0] + 3, dk[1] + 3, [dk[0] + 22, h + 9, dk[1] + 26], [dk[0], h + 1.5, dk[1]]);
  await shot('s-dock-dusk');
}
{
  const mk = await page.evaluate(() => window.__placePos('market'));
  await clock(21.0, 'autumn');
  const h = await y(mk[0], mk[1]);
  await pose(mk[0], mk[1] + 8, [mk[0] + 14, h + 7, mk[1] + 22], [mk[0], h + 1.5, mk[1]]);
  await shot('s-village-night');
}
for (const [h, se, w, name] of [
  [14.0, 'summer', 'rain', 's-rain'],
  [12.0, 'winter', 'snow', 's-snow'],
  [10.0, 'spring', 'clear', 's-spring'],
]) {
  await clock(h, se, w);
  const gh = await y(10, 0);
  await pose(10, 0, [36, gh + 12, 30], [10, gh + 2, 0]);
  await shot(name);
}

console.log('errors:', errors.slice(0, 3).join(' | ') || 'none');
await browser.close();
