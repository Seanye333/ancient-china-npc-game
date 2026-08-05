import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: false, args: [
    '--use-gl=angle',
    // macOS 會判定被遮住的視窗「不可見」而把 rAF 節流到 1 FPS ——
    // 量出來的一切都會變成慢動作。這兩個旗標把那個判定關掉。
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
  ] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
await page.waitForTimeout(11000);
await page.evaluate(() => { window.__setClock?.(10.5, 'autumn'); window.__village?.(22); });
await page.waitForTimeout(700);

// 先隨便搭一次話,把 __errands 掛上去
for (let i = 0; i < 16; i++) {
  await page.evaluate(() => { const p = window.__probe(); window.__walkTo(p.player[0]+p.toward[0], p.player[1]+p.toward[1]); });
  await page.waitForTimeout(500);
  if (await page.evaluate(() => window.__near?.())) break;
}
await page.keyboard.press('KeyE');
await page.waitForTimeout(500);
const info = await page.evaluate(() => window.__errands());
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
console.log('withWork:', info.withWork, info.sample.join(', '));

// 直奔一個有活的人
let done = false;
for (const id of info.ids.slice(0, 6)) {
  for (let i = 0; i < 26; i++) {
    await page.evaluate((x) => window.__walkToNpc(x), id);
    await page.waitForTimeout(450);
    if (await page.evaluate((x) => window.__near?.() === x, id)) break;
  }
  if (!(await page.evaluate((x) => window.__near?.() === x, id))) continue;
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(700);
  if (!(await page.evaluate(() => document.body.innerText.includes('有事要辦')))) {
    await page.keyboard.press('Escape'); await page.waitForTimeout(250); continue;
  }
  await page.getByText('有事要辦?').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'docs/art-research/e-offer.png' });
  console.log('OFFER:', (await page.evaluate(() => document.body.innerText)).replace(/\s+/g,' ').slice(0,240));
  await page.getByText('我去').click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'docs/art-research/e-result.png' });
  console.log('RESULT:', (await page.evaluate(() => document.body.innerText)).replace(/\s+/g,' ').slice(0,200));
  done = true; break;
}
console.log('took-errand:', done, '| ERRORS:', errors.length ? errors.slice(0,2).join(' | ') : 'none');
await browser.close();
