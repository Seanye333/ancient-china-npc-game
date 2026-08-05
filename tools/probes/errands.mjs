import { chromium } from '@playwright/test';

/** 四種活裡的三種現在要真的去辦。走一遍搶收與尋人。 */
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5178/', { waitUntil: 'load', timeout: 60000 });
await page.bringToFront();
await page.waitForFunction(() => typeof window.__talkTo === 'function' && typeof window.__errands === 'function', null, { timeout: 60000 });
await page.waitForTimeout(2500);
await page.evaluate(() => {
  localStorage.clear();
  window.__heroStore.setState({ gold: 400, grain: 20 });
  window.__setClock(8, 'autumn');
});

const list = await page.evaluate(() => window.__errands());
console.log('有活的人:', list.withWork, '/38');

// 找一件搶收
const pick = async (kind) => {
  const all = await page.evaluate(() => {
    const v = window.__villageState();
    const m = window.__heroStore.getState().merit;
    return window.__errandsRaw ? window.__errandsRaw() : null;
  });
  void all;
  return null;
};
void pick;

// 直接翻:對每個有活的人開對話,看是什麼活
let found = null;
for (const id of list.ids) {
  await page.evaluate((i) => window.__talkTo(i), id);
  await page.waitForTimeout(180);
  const has = await page.getByRole('button', { name: '有事要辦?' }).count();
  if (has) {
    await page.getByRole('button', { name: '有事要辦?' }).click();
    await page.waitForTimeout(160);
    const txt = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
    for (const k of ['搶收', '尋人', '護院']) {
      if (txt.includes(k) && !found) { found = { id, kind: k, txt }; break; }
    }
    if (found) break;
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
}
if (!found) { console.log('沒翻到搶收/尋人/護院'); await browser.close(); process.exit(0); }
console.log('接的是:', found.kind, '·', found.txt.slice(found.txt.indexOf(found.kind), found.txt.indexOf(found.kind) + 130));
await page.getByRole('button', { name: '我去' }).click();
await page.waitForTimeout(300);
const q = await page.evaluate(() => window.__quest());
console.log('手上的活:', JSON.stringify({ kind: q.errand.kind, done: q.done, need: q.need, lostAt: q.lostAt }));
await page.keyboard.press('Escape');

if (found.kind === '尋人') {
  console.log('\n去找人');
  for (let i = 0; i < 60; i++) {
    const t = await page.evaluate(() => window.__quest());
    if (!t || t.done >= t.need) break;
    await page.evaluate((p) => window.__walkTo(p.x, p.z), t.lostAt);
    await page.waitForTimeout(1000);
  }
  const after = await page.evaluate(() => window.__quest());
  console.log('找到了嗎:', after?.done >= after?.need ? '找到了' : '沒找到', JSON.stringify(after && { done: after.done, need: after.need, cleared: after.cleared }));
} else if (found.kind === '護院') {
  console.log('\n在村裡過夜');
  for (let i = 0; i < 40; i++) {
    await page.evaluate(() => window.__walkToPlace('home'));
    await page.waitForTimeout(900);
    if (await page.evaluate(() => window.__nearPlace() === 'home')) break;
  }
  for (let n = 0; n < 4; n++) {
    await page.keyboard.press('KeyF');
    await page.waitForTimeout(300);
    const b = page.getByRole('button', { name: /歇一夜/ });
    if (!(await b.count())) { console.log('  開不了落腳處面板'); break; }
    await b.click();
    await page.waitForTimeout(700);
    const t = await page.evaluate(() => window.__quest());
    console.log('  守了一夜 ->', t?.done, '/', t?.need, t?.cleared ? '(辦妥)' : '');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    if (t?.cleared) break;
  }
  // 覆命
  console.log('\n回去覆命');
  for (let i = 0; i < 25; i++) {
    const ok = await page.evaluate((id) => window.__walkToNpc(id), found.id);
    if (!ok) break;
    await page.waitForTimeout(1200);
    if (await page.evaluate((id) => window.__near() === id, found.id)) break;
  }
  await page.evaluate((id) => window.__talkTo(id), found.id);
  await page.waitForTimeout(400);
  const rep = page.getByRole('button', { name: /回來覆命|把人帶回來了/ });
  console.log('有覆命的選項嗎:', (await rep.count()) ? '有' : '沒有');
  if (await rep.count()) {
    const g0 = await page.evaluate(() => window.__heroStore.getState().gold);
    await rep.click();
    await page.waitForTimeout(300);
    const g1 = await page.evaluate(() => window.__heroStore.getState().gold);
    console.log('覆命:', g0, '->', g1);
  }
} else if (found.kind === '搶收') {
  console.log('\n去田裡做工');
  for (let i = 0; i < 40; i++) {
    await page.evaluate(() => window.__walkToPlace('field'));
    await page.waitForTimeout(900);
    if (await page.evaluate(() => window.__nearPlace() === 'field')) break;
  }
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('KeyF');
    await page.waitForTimeout(300);
    const b = page.getByRole('button', { name: /下田幫工/ });
    if (await b.count()) { await b.click(); await page.waitForTimeout(350); }
    const t = await page.evaluate(() => window.__quest());
    console.log('  進度', t?.done, '/', t?.need, t?.cleared ? '(辦妥)' : '');
    if (t?.cleared) break;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
}

const fin = await page.evaluate(() => window.__quest());
console.log('\n最後:', JSON.stringify(fin && { kind: fin.errand.kind, done: fin.done, need: fin.need, cleared: fin.cleared }));
console.log('日誌:', JSON.stringify((await page.evaluate(() => window.__journal())).slice(0, 4)));
console.log('errors:', errors.slice(0, 3).join(' | ') || 'none');
await browser.close();
