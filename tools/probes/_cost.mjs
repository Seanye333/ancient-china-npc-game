import { chromium } from '@playwright/test';
/** 量成本:先看畫幾次、幾個三角形,再看關掉植被之後幀率動不動。 */
const PORT = process.env.PORT || 5182;
const b = await chromium.launch({ headless: false });
const page = await b.newPage({ viewport: { width: 1500, height: 860 } });
page.on('pageerror', (e) => console.log('ERR', String(e)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 60000 });
await page.bringToFront();
await page.waitForFunction(() => typeof window.__gpu === 'function', null, { timeout: 60000 });
await page.waitForTimeout(2500);
await page.evaluate(() => window.__begin && window.__begin());
await page.waitForTimeout(2500);

/** 穩態幀率:不截圖(截圖會凍住 rAF,表上的數是假的)。 */
async function fps(ms = 2500) {
  return page.evaluate((d) => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; performance.now() - t0 < d ? requestAnimationFrame(tick)
      : res(+(n * 1000 / (performance.now() - t0)).toFixed(1)); };
    requestAnimationFrame(tick);
  }), ms);
}
const at = async (x, z, label) => {
  await page.evaluate(([a, c]) => window.__place(a, c), [x, z]);
  await page.waitForTimeout(2200);
  const g = await page.evaluate(() => window.__gpu());
  const f = await fps();
  console.log(`${label}: ${f} fps · ${g.calls} draw · ${(g.tris / 1000).toFixed(0)}k 三角形`
    + ` · ${g.programs} 程式 · ${g.geometries} 幾何`);
  return { f, g };
};
await page.evaluate(() => { window.__setClock(11, 'autumn'); window.__setWeather('clear'); });
await at(10, 0, '村口   ');
await at(-69, 142, '山上   ');
const ct = await page.evaluate(() => window.__countyAt());
await at(ct[0], ct[1] + 20, '縣城   ');

// 把植被整批藏起來 —— 看幀率會不會跳
console.log('── 藏掉植被(松/闊葉/竹/柳/蘆葦/岩)再量一次');
await page.evaluate(() => {
  window.__hidden = [];
  window.__scene.traverse((o) => {
    if (o.isInstancedMesh && o.count > 300 && o.visible) { o.visible = false; window.__hidden.push(o); }
  });
  return window.__hidden.length;
});
await page.evaluate(([a, c]) => window.__place(a, c), [10, 0]);
await page.waitForTimeout(1800);
const g2 = await page.evaluate(() => window.__gpu());
const f2 = await fps();
console.log(`村口(無植被): ${f2} fps · ${g2.calls} draw · ${(g2.tris / 1000).toFixed(0)}k 三角形`);
await b.close();
