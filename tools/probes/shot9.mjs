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
await page.goto('http://localhost:5178/', { waitUntil: 'load', timeout: 60000 });
// macOS 會把被遮住的視窗節流到 1 FPS,量到的一切都成了慢動作 —— 必須把它拉到前面
await page.bringToFront();
await page.waitForTimeout(11000);
await page.evaluate(() => { window.__setClock?.(10.5, 'autumn'); window.__village?.(22); });
await page.waitForTimeout(600);

const goTo = async (id) => {
  for (let i = 0; i < 30; i++) {
    await page.evaluate((x) => window.__walkToNpc(x), id);
    await page.waitForTimeout(430);
    if (await page.evaluate((x) => window.__near?.() === x, id)) return true;
  }
  return false;
};
for (let i = 0; i < 16; i++) {
  await page.evaluate(() => { const p = window.__probe(); window.__walkTo(p.player[0]+p.toward[0], p.player[1]+p.toward[1]); });
  await page.waitForTimeout(480);
  if (await page.evaluate(() => window.__near?.())) break;
}
await page.keyboard.press('KeyE');
await page.waitForTimeout(500);
const ids = (await page.evaluate(() => window.__errands())).ids;
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

let n = 0;
for (const id of ids) {
  if (n >= 3) break;
  if (!(await goTo(id))) continue;
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(500);
  if (!(await page.getByText('跟我走吧').count())) { await page.keyboard.press('Escape'); continue; }
  for (let i = 0; i < 15; i++) { await page.getByText('幫他搭把手').click(); await page.waitForTimeout(70); }
  await page.getByText('跟我走吧').click();
  await page.waitForTimeout(400);
  if (await page.getByText('已隨你左右').count()) n++;
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
}
// 走幾段路,每段拍一張:看隊伍有沒有排成一列跟上、鏡頭有沒有再被樹埋掉
const legs = [[18, 14], [-22, 6], [10, -20]];
for (let i = 0; i < legs.length; i++) {
  await page.evaluate((d) => { const p = window.__probe(); window.__walkTo(p.player[0] + d[0], p.player[1] + d[1]); }, legs[i]);
  await page.waitForTimeout(4500);
  await page.screenshot({ path: `docs/art-research/f-leg${i + 1}.png` });
}
console.log('followers:', n, '| fps:', await page.evaluate(() => document.body.innerText.match(/(\d+)\s*FPS/)?.[1]), '| errors:', errors.slice(0,2).join(' | ') || 'none');
await browser.close();
