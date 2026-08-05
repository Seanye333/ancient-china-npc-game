import { chromium } from '@playwright/test';

/**
 * 過幾天日子:糴米、做工、睡覺、看糧食少下去。
 * 這條線斷掉的樣子都是「什麼都沒發生」,所以每一步都要問一次狀態。
 */
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5178/', { waitUntil: 'load', timeout: 60000 });
await page.bringToFront();
await page.waitForFunction(() => typeof window.__bands === 'function', null, { timeout: 60000 });
await page.waitForTimeout(2500);
await page.evaluate(() => { localStorage.clear(); });

const st = () => page.evaluate(() => {
  const h = window.__heroStore.getState();
  return { day: window.__clock().day, hour: +window.__clock().hour.toFixed(1),
           gold: h.gold, grain: +h.grain.toFixed(2), lodging: h.lodging, toil: h.toil };
});
console.log('開局', JSON.stringify(await st()));

// 走到市集糴米
// 到了沒要比對<b>是不是那個地方</b> —— 第一版只問「腳下有沒有地方」,
// 於是站在市集上就算「到了碼頭」,後面三段全都在對著市集的面板點按鈕
const go = async (id) => {
  for (let i = 0; i < 60; i++) {
    await page.evaluate((p) => window.__walkToPlace(p), id);
    await page.waitForTimeout(900);
    if (await page.evaluate((p) => window.__nearPlace() === p, id)) return true;
  }
  return false;
};

// 開局 30 錢買不起一石米(34)—— 先去做點活。這本身就是白身該有的處境
console.log('\n往碼頭做工');
console.log('到了嗎:', await go('dock'), await page.evaluate(() => window.__nearPlace()));
await page.keyboard.press('KeyF');
await page.waitForTimeout(400);
const jobBtn = page.getByRole('button', { name: /碼頭扛包/ });
if (await jobBtn.count()) {
  for (let i = 0; i < 3; i++) { await jobBtn.click(); await page.waitForTimeout(350); }
}
console.log('做了三趟工', JSON.stringify(await st()), '(錢該多、時辰該跳、身子該累)');
await page.keyboard.press('Escape');

console.log('\n往市集');
console.log('到了嗎:', await go('market'), await page.evaluate(() => window.__nearPlace()));
await page.keyboard.press('KeyF');
await page.waitForTimeout(400);
const shot = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
console.log('面板:', shot.slice(shot.indexOf('市集'), shot.indexOf('市集') + 150));
await page.getByRole('button', { name: /^糴米 1 石/ }).click();
await page.waitForTimeout(300);
console.log('糴米後', JSON.stringify(await st()));
await page.keyboard.press('Escape');

console.log('\n往落腳處睡覺');
console.log('到了嗎:', await go('home'), await page.evaluate(() => window.__nearPlace()));
await page.keyboard.press('KeyF');
await page.waitForTimeout(400);
await page.getByRole('button', { name: /歇一夜/ }).click();
await page.waitForTimeout(700);
console.log('睡醒', JSON.stringify(await st()), '(日子該 +1,糧該少)');
await page.keyboard.press('Escape');

console.log('\n存讀檔');
const before = await st();
await page.evaluate(() => window.__heroStore.setState({ gold: 777 }));
await page.evaluate(() => window.__save());
await page.evaluate(() => window.__heroStore.setState({ gold: 1 }));
await page.evaluate(() => window.__load());
await page.waitForTimeout(400);
const after = await st();
console.log('存 777 → 改成 1 → 讀回:', after.gold, after.gold === 777 ? '✓' : '✗');
console.log('讀檔沒有把過去補結一遍:', after.day === before.day ? '✓' : `✗ ${before.day}→${after.day}`);

const j = await page.evaluate(() => window.__journal());
console.log('\n日誌:', JSON.stringify(j.slice(0, 5)));
console.log('errors:', errors.slice(0, 3).join(' | ') || 'none');
await browser.close();
