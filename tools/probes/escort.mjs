import { chromium } from '@playwright/test';

/** 押貨:碼頭裝車 → 陪它走到縣城 → 回來覆命。車比人慢,你走遠了它就停。 */
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5178/', { waitUntil: 'load', timeout: 60000 });
await page.bringToFront();
await page.waitForFunction(() => typeof window.__talkTo === 'function' && typeof window.__cart === 'function',
  null, { timeout: 60000 });
await page.waitForTimeout(2500);
await page.evaluate(() => window.__begin());
await page.evaluate(() => {
  window.__heroStore.setState({ gold: 200, grain: 40 });
  window.__villageState().nudge({ trade: 70, order: 50 });
});

// 找一件押貨的活
const list = await page.evaluate(() => window.__errands());
let found = null;
for (const id of list.ids) {
  await page.evaluate((i) => window.__talkTo(i), id);
  await page.waitForTimeout(150);
  if (await page.getByRole('button', { name: '有事要辦?' }).count()) {
    await page.getByRole('button', { name: '有事要辦?' }).click();
    await page.waitForTimeout(150);
    const t = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g,' ');
    if (t.includes('押貨')) { found = { id, t }; break; }
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
}
if (!found) { console.log('沒翻到押貨的活'); await browser.close(); process.exit(0); }
console.log('差事卡:', found.t.slice(found.t.indexOf('押貨'), found.t.indexOf('押貨') + 140));
await page.getByRole('button', { name: '我去' }).click();
await page.waitForTimeout(300);
console.log('車:', JSON.stringify(await page.evaluate(() => window.__cart())));
await page.keyboard.press('Escape');

// 先試「跑遠了車會不會停」
const c0 = await page.evaluate(() => window.__cart());
await page.evaluate(() => window.__walkToPlace('county-market'));
await page.waitForTimeout(9000);
const c1 = await page.evaluate(() => window.__cart());
const p1 = await page.evaluate(() => window.__probe().player);
console.log('九秒後 · 車', [c1.x, c1.z], '· 人', p1,
  '· 相距', Math.round(Math.hypot(c1.x-p1[0], c1.z-p1[1])), '步');

// 陪著它走:每次都走到車旁邊一點的位置
let delivered = false;
for (let i = 0; i < 220 && !delivered; i++) {
  const c = await page.evaluate(() => window.__cart());
  if (!c) break;
  if (c.state === 'delivered') { delivered = true; break; }
  // 走到車與縣城之間 —— 這就是「陪著走」
  await page.evaluate(([cx, cz]) => {
    const t = window.__countyAt();
    const dx = t[0] - cx, dz = t[1] - cz;
    const d = Math.hypot(dx, dz) || 1;
    window.__walkTo(cx + dx / d * 6, cz + dz / d * 6);
  }, [c.x, c.z]);
  await page.waitForTimeout(1400);
  if (i % 8 === 0) {
    const pp = await page.evaluate(() => window.__probe().player);
    const ws = await page.evaluate(() => window.__walkState());
    console.log('  車', [c.x, c.z], c.state, 'near', c.near, 'walk', c.walkHere,
      'lastMove', c.lastMove, '剩', c.left, 'next', c.next,
      '· 人', pp, '相距', Math.round(Math.hypot(c.x - pp[0], c.z - pp[1])),
      '· 人stall', ws.stall);
  }
}
const cart = await page.evaluate(() => window.__cart());
console.log('交貨了嗎:', cart?.state, '· quest:', JSON.stringify(await page.evaluate(() => {
  const q = window.__quest(); return q && { kind: q.errand.kind, done: q.done, cleared: q.cleared };
})));
// 回去覆命
if (cart?.state === 'delivered') {
  console.log('\n回村覆命');
  for (let i = 0; i < 40; i++) {
    const ok = await page.evaluate((id) => window.__walkToNpc(id), found.id);
    if (!ok) break;
    await page.waitForTimeout(1500);
    if (await page.evaluate((id) => window.__near() === id, found.id)) break;
  }
  await page.evaluate((id) => window.__talkTo(id), found.id);
  await page.waitForTimeout(400);
  const rep = page.getByRole('button', { name: /回來覆命/ });
  if (await rep.count()) {
    const g0 = await page.evaluate(() => window.__heroStore.getState().gold);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /回來覆命/.test(x.textContent||''));
      b?.click();
    });
    await page.waitForTimeout(400);
    console.log('覆命:', g0, '->', await page.evaluate(() => window.__heroStore.getState().gold),
      '· 車還在嗎:', await page.evaluate(() => window.__cart()));
  } else console.log('沒有覆命的選項');
}
console.log('errors:', errors.slice(0, 3).join(' | ') || 'none');
await browser.close();
