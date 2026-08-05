import { chromium } from '@playwright/test';

/**
 * 把「接活 → 走過去 → 打 → 回來覆命」整條線走一遍。
 *
 * 這條線任何一環斷掉,單看畫面都像是沒事發生:接了活沒指到人、打贏了沒記成
 * 辦妥、覆命拿不到錢 —— 三種失敗長得一模一樣(什麼都沒發生)。所以每一步
 * 都要問一次狀態,而不是最後看一眼。
 *
 * headless 一定要 false(SwiftShader 什麼都畫不出來),而且要 bringToFront ——
 * macOS 把被遮住的視窗節流到 1 FPS,量到的一切都會變成慢動作。
 */

const PORT = process.env.PORT || 5178;
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 60000 });
await page.bringToFront();
// 等鉤子掛好,不要等一個猜出來的秒數 —— 掛慢了就會拿到 undefined is not a function
await page.waitForFunction(() => typeof window.__bands === 'function', null, { timeout: 60000 });
await page.waitForTimeout(3000);

const step = (s) => console.log(`\n── ${s}`);

// 治安壓低,剿匪的活才出得來;先招兩個人,不然白身一個人送死
await page.evaluate(() => {
  window.__setClock?.(10, 'autumn');
  window.__village(20);
  window.__heroStore.setState({ followers: ['v3', 'v11'] });
});
await page.waitForTimeout(600);

step('誰有剿匪的活');
const errands = await page.evaluate(() => window.__errands());
console.log('有活的人:', errands.withWork, '/ 38 · 剿匪:', JSON.stringify(errands.bandits));
if (!errands.bandits.length) { console.log('沒有剿匪的活,收工'); await browser.close(); process.exit(1); }

const [patronId, tail] = errands.bandits[0].split(':');
const bandId = tail.split('→')[1];
console.log('委託人', patronId, '目標', bandId);

step('接活');
await page.evaluate((id) => window.__talkTo(id), patronId);
await page.waitForTimeout(400);
await page.getByRole('button', { name: '有事要辦?' }).click();
await page.waitForTimeout(300);
const card = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
console.log('差事卡:', card.slice(card.indexOf('剿匪'), card.indexOf('剿匪') + 120));
await page.getByRole('button', { name: '我去' }).click();
await page.waitForTimeout(300);
console.log('接到手上:', JSON.stringify(await page.evaluate(() => window.__quest())));
await page.getByRole('button', { name: /告辭/ }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: 'docs/art-research/q-taken.png', timeout: 60000 }).catch(() => {});

step('走過去');
const band = await page.evaluate((id) => window.__bands().find((b) => b.id === id), bandId);
console.log('目標', band.name, [band.x, band.z], '共', band.count, '人');
// 走多久不看次數看狀態 —— 路是繞的,固定次數只會量到「我猜的秒數不夠」
for (let i = 0; i < 90; i++) {
  await page.evaluate(([x, z]) => window.__walkTo(x, z), [band.x, band.z]);
  await page.waitForTimeout(1500);
  if (await page.evaluate(() => window.__battle().bandId)) break;
  if (i % 4 === 3) {
    const p = await page.evaluate(() => window.__probe().player);
    console.log('  走到', p, '離營地', Math.round(Math.hypot(band.x - p[0], band.z - p[1])), '步');
  }
}
console.log('接戰:', JSON.stringify(await page.evaluate(() => {
  const b = window.__battle(); return { bandId: b.bandId, ours: b.ours, foes: b.foes };
})));
await page.screenshot({ path: 'docs/art-research/q-engage.png', timeout: 60000 }).catch(() => {});

step('打');
for (let i = 0; i < 120; i++) {
  await page.evaluate(() => { window.__strike(); window.__closeIn(); });
  await page.waitForTimeout(450);
  const st = await page.evaluate(() => window.__battle());
  if (st.tally) { console.log('收場:', JSON.stringify(st.tally)); break; }
  if (i % 12 === 0) console.log(' ', i, '我', st.ours, '賊', st.foes, JSON.stringify(st.me));
}
await page.screenshot({ path: 'docs/art-research/q-aftermath.png', timeout: 60000 }).catch(() => {});
const before = await page.evaluate(() => {
  const h = window.__heroStore.getState(); return { gold: h.gold, merit: h.merit };
});
const close = page.getByRole('button', { name: /收兵|撐起身子/ });
if (!(await close.count())) { console.log('打不完,收工'); await browser.close(); process.exit(1); }
await close.click();
await page.waitForTimeout(500);
console.log('打完 quest:', JSON.stringify(await page.evaluate(() => window.__quest())));
console.log('賊窩:', JSON.stringify(await page.evaluate((id) =>
  window.__bands().find((b) => b.id === id), bandId)));

step('回去覆命');
for (let i = 0; i < 30; i++) {
  const ok = await page.evaluate((id) => window.__walkToNpc(id), patronId);
  if (!ok) { console.log('委託人不在場上(進屋了?)'); break; }
  await page.waitForTimeout(1800);
  if (await page.evaluate((id) => window.__near() === id, patronId)) break;
}
await page.evaluate((id) => window.__talkTo(id), patronId);
await page.waitForTimeout(400);
const hasReport = await page.getByRole('button', { name: '回來覆命' }).count();
console.log('有沒有覆命的選項:', hasReport ? '有' : '沒有');
if (hasReport) {
  await page.getByRole('button', { name: '回來覆命' }).click();
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => {
    const h = window.__heroStore.getState(); return { gold: h.gold, merit: h.merit };
  });
  console.log('覆命前', JSON.stringify(before), '→ 覆命後', JSON.stringify(after));
  console.log('手上的活清掉了嗎:', await page.evaluate(() => window.__quest()) === null ? '清了' : '沒清');
  const txt = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  console.log('他說:', txt.slice(0, 160));
}
await page.screenshot({ path: 'docs/art-research/q-report.png', timeout: 60000 }).catch(() => {});

console.log('\nerrors:', errors.slice(0, 3).join(' | ') || 'none');
await browser.close();
