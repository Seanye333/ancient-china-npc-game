import { chromium } from '@playwright/test';

/** 治安壓到底,看賊會不會真的下山、路上撞不撞得見、村子會不會真的受損。 */
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5178/', { waitUntil: 'load', timeout: 60000 });
await page.bringToFront();
await page.waitForFunction(() => typeof window.__raids === 'function', null, { timeout: 60000 });
await page.waitForTimeout(2500);
// 標題頁蓋在世界上面 —— 驗收腳本要先開局,否則點不到任何東西
await page.evaluate(() => window.__begin && window.__begin());
await page.evaluate(() => {
  localStorage.clear();
  window.__village(8);                       // 治安崩了
  window.__setClock(8, 'autumn');            // 秋收前後最凶
  window.__heroStore.setState({ grain: 40, gold: 300 });
});

// 讓日子快轉:一天一天推,看有沒有人出窩
let seen = null;
for (let d = 0; d < 40 && !seen; d++) {
  await page.evaluate(() => {
    const c = window.__clock();
    window.__clock().advance(24);
    void c;
  });
  await page.waitForTimeout(260);
  const raids = await page.evaluate(() => window.__raids());
  if (raids.length) seen = raids;
}
console.log('有人下山了嗎:', seen ? JSON.stringify(seen) : '四十天都沒有');
const vBefore = await page.evaluate(() => {
  const v = window.__villageState(); return { order: v.order, harvest: v.harvest };
});
console.log('村況(遭搶前):', JSON.stringify(vBefore));

if (seen) {
  // 走過去攔他們
  console.log('\n過去攔');
  let met = false;
  for (let i = 0; i < 50 && !met; i++) {
    const r = (await page.evaluate(() => window.__raids()))[0];
    if (!r) break;
    await page.evaluate(([x, z]) => window.__walkTo(x, z), r.at);
    await page.waitForTimeout(900);
    met = !!(await page.evaluate(() => window.__battle().bandId));
  }
  console.log('撞上了嗎:', met, JSON.stringify(await page.evaluate(() => {
    const b = window.__battle(); return { bandId: b.bandId, ours: b.ours, foes: b.foes };
  })));

  if (met) {
    for (let i = 0; i < 90; i++) {
      await page.evaluate(() => { window.__strike(); window.__closeIn(); });
      await page.waitForTimeout(420);
      if (await page.evaluate(() => window.__battle().tally)) break;
    }
    const t = await page.evaluate(() => window.__battle().tally);
    console.log('收場:', JSON.stringify(t));
    const bandsBefore = await page.evaluate(() => window.__bands());
    // 招安
    const s = page.getByRole('button', { name: /招安/ });
    if (await s.count()) {
      await s.click(); await page.waitForTimeout(300);
      const txt = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
      console.log('招安:', txt.slice(txt.indexOf('招安'), txt.indexOf('招安') + 90));
    } else console.log('招安: 沒得招(沒人跑掉)');
    await page.getByRole('button', { name: /收兵|撐起身子/ }).click();
    await page.waitForTimeout(400);
    console.log('打完那個窩的人數:', JSON.stringify(
      (await page.evaluate(() => window.__bands())).map((b) => `${b.name}:${b.count}${b.routed ? '(散)' : ''}`)));
    console.log('（打之前:', bandsBefore.map((b) => `${b.name}:${b.count}`).join(' '), '）');
    console.log('隨行:', await page.evaluate(() => window.__heroStore.getState().retinue));
  }
}

// 沒攔住會怎樣:再放一夥進村
console.log('\n放著不管會怎樣');
for (let d = 0; d < 60; d++) {
  await page.evaluate(() => window.__clock().advance(24));
  await page.waitForTimeout(200);
  const j = await page.evaluate(() => window.__journal());
  if (j.some((x) => x.includes('搶了村東'))) break;
}
const vAfter = await page.evaluate(() => {
  const v = window.__villageState(); return { order: v.order, harvest: v.harvest };
});
console.log('村況(之後):', JSON.stringify(vAfter));
console.log('日誌:', JSON.stringify((await page.evaluate(() => window.__journal())).slice(0, 6)));
console.log('errors:', errors.slice(0, 3).join(' | ') || 'none');
await browser.close();
