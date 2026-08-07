import { chromium } from '@playwright/test';

/**
 * 義結金蘭的驗收。
 *
 * 規矩那半邊有 oath.test.ts 釘著(含空跑的擋刀),這裡驗的是接線:
 * 對話裡按不按得到、按下去錢糧扣不扣、牌子換不換、
 * 「你先回去罷」是不是真的按不出來了、以及月錢是不是真的少收了他那一份。
 */

const PORT = process.env.PORT || 5181;
const browser = await chromium.launch({
  headless: false,
  args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
         '--disable-background-timer-throttling'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 60000 });
await page.bringToFront();
await page.waitForFunction(() => typeof window.__oath === 'function', null, { timeout: 60000 });
await page.waitForTimeout(2000);
await page.getByRole('button', { name: /就這樣開始/ }).click();
await page.waitForTimeout(1500);

const ok = (b, s) => console.log(b ? `  ✓ ${s}` : `  ✗ ${s}`);
async function shot(name) {
  await page.bringToFront();
  await page.screenshot({ path: `docs/art-research/${name}.png`, timeout: 30000 });
}

/** 挑一個不怕事的村民 —— 怕事的擔不起結義這種事(規矩如此)。 */
const who = await page.evaluate(() => window.__pickBrave());
console.log(`── 對象:${who.name}(${who.temper},${who.age} 歲)`);

console.log('── 一、門檻:沒跟過你的人談不上生死');
await page.evaluate((id) => {
  window.__heroStore.setState({ gold: 200, grain: 5, followers: [] });
  window.__heroStore.getState().addFavor(id, 30);
  window.__talkTo(id);
}, who.id);
await page.waitForTimeout(600);
ok(await page.getByRole('button', { name: /義結金蘭/ }).count() === 0,
   '還沒跟過你的人,結義的鈕根本不出現');

console.log('── 二、擺一桌,設個誓');
await page.evaluate((id) => { window.__heroStore.getState().recruit(id); }, who.id);
await page.waitForTimeout(500);
const before = await page.evaluate(() => {
  const h = window.__heroStore.getState();
  return { gold: h.gold, grain: h.grain, renown: h.renown };
});
const swearBtn = page.getByRole('button', { name: /義結金蘭/ });
ok(await swearBtn.count() > 0, '跟過你以後,鈕就出來了');
await shot('v4-oath-offer');
if (await swearBtn.count()) { await swearBtn.first().click(); await page.waitForTimeout(700); }
const after = await page.evaluate(() => {
  const h = window.__heroStore.getState();
  return { gold: h.gold, grain: h.grain, renown: h.renown, oath: window.__oath() };
});
console.log(`  錢 ${before.gold}→${after.gold} · 糧 ${before.grain}→${after.grain}`
  + ` · 鄉望 ${before.renown}→${after.renown}`);
ok(after.oath.sworn.includes(who.id), '結成了');
ok(before.gold - after.gold === 30 && before.grain - after.grain === 1, '酒肉錢照收');
ok(after.renown > before.renown, '全村都知道了');
await shot('v4-oath-sworn');

console.log('── 三、結了就退不掉');
ok(await page.getByRole('button', { name: /你先回去罷/ }).count() === 0,
   '「你先回去罷」對義兄弟按不出來');
ok(await page.getByRole('button', { name: /義結金蘭/ }).count() === 0,
   '不能再結第二次');
const badge = await page.locator('text=義兄弟').count();
ok(badge > 0, '頭上掛的是「義兄弟」不是「隨行」');

console.log('── 四、最多兩個');
const others = await page.evaluate((firstId) => {
  const ids = window.__braveIds().filter((i) => i !== firstId).slice(0, 2);
  const h = window.__heroStore.getState();
  for (const id of ids) { h.recruit(id); h.addFavor(id, 30); }
  return ids;
}, who.id);
await page.keyboard.press('Escape');
for (const id of others) {
  await page.evaluate((i) => window.__talkTo(i), id);
  await page.waitForTimeout(500);
  const b = page.getByRole('button', { name: /義結金蘭/ });
  const n = await page.evaluate(() => window.__oath().sworn.length);
  if (await b.count()) { await b.first().click(); await page.waitForTimeout(600); }
  const after2 = await page.evaluate(() => window.__oath().sworn.length);
  console.log(`  第 ${n + 1} 個:${after2 > n ? '結成' : '沒結成'}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}
const total = await page.evaluate(() => window.__oath().sworn.length);
ok(total === 2, `結義封頂在兩個(現在 ${total} 個)`);

console.log('── 五、月錢不收他們的');
const pay = await page.evaluate(() => {
  const h = window.__heroStore.getState();
  return { men: h.followers.length + h.retinue, payroll: window.__payroll() };
});
console.log(`  隨行 ${pay.men} 人,要發 ${pay.payroll} 份月錢`);
ok(pay.payroll === pay.men - 2, '兩個義兄弟不領月錢');

console.log('── 六、他替你擋那一刀');
await page.evaluate(() => {
  window.__setClock(11, 'autumn');
  window.__place(0, -40);
});
await page.waitForTimeout(700);
await page.evaluate(() => {
  const p = window.__probe().player;
  window.__forceBattle(p[0] + 9, p[1] + 3, 5, 0.8);
});
console.log('  陣上義兄弟:',
  (await page.evaluate(() => window.__battle().list.filter((f) => f.sworn).length)), '人');
let shielded = null, tally = null;
// 打到有人擋刀為止,最多五場 —— 擋刀只在「這一下會要了你」那一刻發生,
// 一場架未必碰得上。碰不上就再開一場,別把「沒觸發」當成「沒接上」
for (let round = 0; round < 5 && !shielded; round++) {
  /*
   * <b>一定要打到收場</b>,不能一看見擋刀就收手。
   * 「記進沒能跟你回來」那一步是在收兵的那一頁上結的 —— 第一版在擋刀那一刻
   * 就 break,於是收場永遠是 null,而探針報「✗ 沒記進去」,
   * 看起來像是接線壞了,其實只是這場架還沒打完。
   */
  for (let i = 0; i < 200; i++) {
    await page.evaluate(() => { window.__strike(); window.__closeIn(); });
    await page.waitForTimeout(120);
    const b = await page.evaluate(() => ({ fx: window.__battle().fx, tally: window.__battle().tally }));
    if (b.fx?.shielded && !shielded) {
      shielded = b.fx.shielded;
      await shot('v4-oath-shield');
    }
    if (b.tally) { tally = b.tally; break; }
  }
  const closeBtn = page.getByRole('button', { name: /收兵|撐起身子/ });
  if (await closeBtn.count()) { await closeBtn.first().click(); await page.waitForTimeout(700); }
  if (shielded) break;
  // 再擺一場:傷會累積,所以每場之間把身子調回來,量的才是擋刀本身
  await page.evaluate(() => {
    window.__heroStore.setState({ wounded: 0, woundKind: null });
    window.__place(0, -40);
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const p = window.__probe().player;
    window.__forceBattle(p[0] + 9, p[1] + 3, 5, 0.8);
  });
  await page.waitForTimeout(400);
}
console.log(`  擋刀的是:${shielded ?? '(五場都沒人需要擋)'} · 收場 ${JSON.stringify(tally)?.slice(0, 90)}`);
ok(!!shielded, '義兄弟真的橫過來擋了那一刀');
if (shielded) {
  const gone = await page.evaluate(() => window.__oath());
  console.log(`  結義剩 ${gone.sworn.length} 人,沒回來的 ${JSON.stringify(gone.fallen)}`);
  ok(gone.fallen.length > 0, '擋刀的那個記進了「沒能跟你回來」');
}

console.log('errors:', errors.slice(0, 3).join(' | ') || 'none');
await browser.close();
