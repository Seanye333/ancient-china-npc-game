import { chromium } from '@playwright/test';

/**
 * 告假的驗收。
 *
 * 規矩那半邊有 furlough.test.ts 釘著,這裡驗接線:
 * 求的話出不出得來、准了人是不是真的從隨行名單裡拿掉、日子到了回不回得來、
 * 以及晾著不答會不會自己走。
 *
 * <b>准了要真的從 followers 拿掉</b>是這一批最容易錯的一處:不拿掉的話,
 * 人在幾十里外,你的差事還算他一份人手、糧也照吃他一口。
 */

const PORT = process.env.PORT || 5181;
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 60000 });
await page.bringToFront();
await page.waitForFunction(() => typeof window.__askLeave === 'function', null, { timeout: 60000 });
await page.waitForTimeout(2000);
await page.getByRole('button', { name: /就這樣開始/ }).click();
await page.waitForTimeout(1500);

const ok = (b, s) => console.log(b ? `  ✓ ${s}` : `  ✗ ${s}`);

const who = await page.evaluate(() => {
  const id = window.__braveIds()[0];
  window.__heroStore.getState().recruit(id);
  return { id, name: window.__pickBrave().name };
});
console.log(`── 對象:${who.id}`);

console.log('── 一、他開口了');
await page.evaluate((id) => window.__askLeave(id, 'illness', 8), who.id);
await page.evaluate((id) => window.__talkTo(id), who.id);
await page.waitForTimeout(700);
ok(await page.getByText(/家裡老的病了/).count() > 0, '求的那句話出來了');
ok(await page.getByRole('button', { name: /去罷/ }).count() > 0, '有「准」這條路');
ok(await page.getByRole('button', { name: /眼下走不開/ }).count() > 0, '有「不准」這條路');

console.log('── 二、准了 —— 人要真的不在了');
const before = await page.evaluate(() => window.__heroStore.getState().followers.length);
await page.getByRole('button', { name: /去罷/ }).first().click();
await page.waitForTimeout(600);
const after = await page.evaluate(() => ({
  n: window.__heroStore.getState().followers.length,
  fur: window.__furlough(),
  payroll: window.__payroll(),
}));
console.log(`  隨行 ${before} → ${after.n} · 在外 ${JSON.stringify(after.fur.away)}`);
ok(after.n === before - 1, '從隨行名單裡拿掉了');
ok(after.fur.away.length === 1 && after.fur.away[0].id === who.id, '記在「在外」那一欄');
ok(after.fur.pending === null, '這一樁結了,門口空出來');
ok(after.payroll === after.n, '不在的人不領月錢也不吃糧');

console.log('── 三、日子到了他回來');
await page.keyboard.press('Escape');
const back = await page.evaluate(async () => {
  const d0 = window.__clock().day;
  const backOn = window.__furlough().away[0].backOn;
  // 一天一天結過去 —— 不能只結最後一天
  for (let d = d0 + 1; d <= backOn + 1; d++) window.__settle(d);
  return { d0, backOn, n: window.__heroStore.getState().followers.length,
           away: window.__furlough().away.length };
});
console.log(`  第 ${back.d0} 天走,第 ${back.backOn} 天回 · 隨行 ${back.n} · 在外 ${back.away}`);
ok(back.away === 0, '不在「在外」那一欄了');
ok(back.n === before, '人回到隨行名單裡');

console.log('errors:', errors.slice(0, 3).join(' | ') || 'none');
await browser.close();
