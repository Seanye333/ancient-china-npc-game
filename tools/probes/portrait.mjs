import { chromium } from '@playwright/test';
/**
 * 人物近照:站到一個小高地上,鏡頭壓到<b>比腳還低</b>往上看 ——
 * 背景是天,保證沒有東西擋得住。繞一圈拍四個角度。
 */
const PORT = process.env.PORT || 5180;
const OUT = process.env.OUT || 'docs/art-research';
const b = await chromium.launch({ headless: false });
const page = await b.newPage({ viewport: { width: 900, height: 900 } });
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
const R = 1.9;
for (const [name, ang] of [['front', 0], ['q34', 0.8], ['side', 1.57], ['back', 3.14]]) {
  await page.evaluate(([c, l]) => window.__setCam(c, l),
    [[top.x + Math.sin(ang) * R, py + 0.42, top.z + Math.cos(ang) * R],
     [top.x, py + 0.82, top.z]]);
  await page.waitForTimeout(26);
  await page.bringToFront();
  await page.screenshot({ path: `${OUT}/fig-${name}.png`, timeout: 60000 });
  console.log(name);
}
await b.close();
