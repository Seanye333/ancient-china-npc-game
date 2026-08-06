import { chromium } from '@playwright/test';

/**
 * 畫面批的驗收 —— 四個取景點把這一批的每一項都看一遍:
 * 秋晨村景(雜色秋林/地表斑塊/落葉)、林中近景(噪點抖動不是棋盤格)、
 * 夏夜河邊(螢火)、貼崖的賊窩戰鬥(鏡頭不鑽山)。
 * 順帶盯 draw call 和 pageerror —— 畫面批最容易「好看了但變卡了」。
 */

const PORT = process.env.PORT || 5181;
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 60000 });
await page.bringToFront();
await page.waitForFunction(() => typeof window.__bands === 'function', null, { timeout: 60000 });
await page.waitForTimeout(3000);
await page.evaluate(() => window.__begin && window.__begin());
await page.waitForTimeout(800);

const shot = async (name) => {
  await page.screenshot({ path: `docs/art-research/${name}.png`, timeout: 60000 });
  console.log(name, '· draws', await page.evaluate(() => window.__renderInfo()),
    '· cam', JSON.stringify(await page.evaluate(() => window.__cam())));
};

console.log('── 秋晨村景');
await page.evaluate(() => { window.__setClock(9.5, 'autumn'); window.__setWeather('clear'); });
await page.evaluate(() => window.__place(18, 6));
await page.waitForTimeout(2500);
await shot('v2-autumn-morning');

console.log('── 林中近景(視線抖動該是顆粒,不是棋盤格)');
// 取景點是試出來的:瞬移過去若鏡頭被迫收得很近,多半是塞進了屋簷或樹冠裡,
// 那一張什麼也驗不了 —— 換下一個候選點
for (const [x, z] of [[64, 58], [-52, 40], [86, 24], [-30, -44]]) {
  await page.evaluate(([px, pz]) => window.__place(px, pz), [x, z]);
  await page.waitForTimeout(2200);
  const cam = await page.evaluate(() => window.__cam());
  console.log('候選', [x, z], 'dist', cam.dist);
  if (cam.dist >= 4) break;
}
await shot('v2-forest-close');

console.log('── 秋暮村景(和舊 x-dusk 對照)');
await page.evaluate(() => window.__setClock(18.2, 'autumn'));
await page.evaluate(() => window.__place(6, -8));
await page.waitForTimeout(2200);
await shot('v2-autumn-dusk');

console.log('── 夏夜河邊(螢火)');
const dock = await page.evaluate(() => window.__dockAt());
await page.evaluate(() => window.__setClock(22.6, 'summer'));
await page.evaluate(([x, z]) => window.__place(x + 3, z + 2), dock);
await page.waitForTimeout(2500);
await shot('v2-summer-night');

console.log('── 賊窩戰鬥(鏡頭不鑽山)');
await page.evaluate(() => { window.__setClock(11, 'autumn'); window.__setWeather('clear'); });
const band = await page.evaluate(() => window.__bands().find((b) => !b.routed));
console.log('目標', band.name, [Math.round(band.x), Math.round(band.z)]);
await page.evaluate(([x, z]) => window.__place(x + 14, z + 8), [band.x, band.z]);
await page.waitForTimeout(600);
for (let i = 0; i < 20; i++) {
  await page.evaluate(([x, z]) => window.__walkTo(x, z), [band.x, band.z]);
  await page.waitForTimeout(800);
  if (await page.evaluate(() => window.__battle().bandId)) break;
}
console.log('接戰:', JSON.stringify(await page.evaluate(() => {
  const b = window.__battle(); return { bandId: b.bandId, foes: b.foes };
})));
// 打上十幾秒,一邊統計鏡頭有多少幀是埋著的 —— 這一批修的就是這個
let buried = 0, frames = 0;
for (let i = 0; i < 24; i++) {
  await page.evaluate(() => { window.__strike(); window.__closeIn(); });
  await page.waitForTimeout(400);
  frames++;
  if (await page.evaluate(() => window.__cam().buried)) buried++;
  if (i === 10) await shot('v2-camp-fight');
}
console.log(`鏡頭埋住: ${buried}/${frames} 幀`);

console.log('errors:', errors.slice(0, 3).join(' | ') || 'none');
await browser.close();
