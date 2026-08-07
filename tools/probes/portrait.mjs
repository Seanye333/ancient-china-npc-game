import { chromium } from '@playwright/test';
/**
 * 人物近照:站到一個小高地上,鏡頭壓到<b>比腳還低</b>往上看 ——
 * 背景是天,保證沒有東西擋得住。繞一圈拍四個角度。
 */
const PORT = process.env.PORT || 5180;
const OUT = process.env.OUT || 'docs/art-research';
const b = await chromium.launch({ headless: false });
const page = await b.newPage({ viewport: { width: 700, height: 900 } });
page.on('pageerror', (e) => console.log('ERR', String(e)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 60000 });
await page.bringToFront();
await page.waitForFunction(() => typeof window.__place === 'function', null, { timeout: 60000 });
await page.waitForTimeout(2500);
await page.evaluate(() => window.__begin && window.__begin());
await page.waitForTimeout(1500);
await page.evaluate(() => { window.__setClock(9.5, 'autumn'); window.__setWeather('clear'); });

// 找一個「四周都比它低」的小丘,而且身上沒樹
const top = await page.evaluate(() => {
  let best = null;
  for (let r = 30; r < 160; r += 4) {
    for (let a = 0; a < 28; a++) {
      const x = Math.sin(a / 28 * 6.283) * r, z = Math.cos(a / 28 * 6.283) * r;
      const t = window.__terrain(x, z);
      if (!t.walk || t.blocked || t.slope > 0.3) continue;
      let ok = true, drop = 9;
      for (let k = 0; k < 8; k++) {
        const bx = x + Math.sin(k / 8 * 6.283) * 5, bz = z + Math.cos(k / 8 * 6.283) * 5;
        const n = window.__terrain(bx, bz);
        if (n.h > t.h) ok = false;
        drop = Math.min(drop, t.h - n.h);
        if (n.blocked) ok = false;
      }
      if (ok && (!best || drop > best.drop)) best = { x: Math.round(x), z: Math.round(z), h: t.h, drop };
    }
  }
  return best;
});
console.log('丘', JSON.stringify(top));
await page.evaluate(([x, z]) => window.__place(x, z), [top.x, top.z]);
await page.waitForTimeout(2600);
const py = top.h;
/*
 * 角度<b>相對於他面朝的方向</b>算,不是相對於世界。
 * 拍之前不問他朝哪邊,拍出來的「正面」十有八九是後腦勺。
 */
const yaw = await page.evaluate(() => window.__probe().yaw);
// 凍住鏡頭解算 —— 不凍的話湊近的機位擺完二十六毫秒就被拉回肩後了
await page.evaluate(() => window.__freezeCam(true));
const SHOTS = [
  // 名稱, 繞人的角度(0 = 正面), 距離, 鏡頭高, 看向的高
  ['face', 0, 1.05, 0.98, 0.92],
  ['front', 0, 2.4, 1.05, 0.62],
  ['q34', 0.85, 1.6, 1.00, 0.78],
  ['side', 1.57, 1.6, 1.00, 0.78],
  ['back', 3.14, 1.9, 1.05, 0.72],
];
for (const [name, rel, dist, camY, lookY] of SHOTS) {
  const a = yaw + Math.PI + rel;      // 他面朝 yaw,所以正面在 yaw+π 那一側
  await page.evaluate(([c, l]) => window.__setCam(c, l),
    [[top.x + Math.sin(a) * dist, py + camY, top.z + Math.cos(a) * dist],
     [top.x, py + lookY, top.z]]);
  await page.waitForTimeout(90);
  await page.bringToFront();
  await page.screenshot({ path: `${OUT}/fig-${name}.png`, timeout: 60000 });
  console.log(name);
}
await page.evaluate(() => window.__freezeCam(false));
await b.close();
