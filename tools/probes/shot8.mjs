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
await page.waitForTimeout(700);

const goTo = async (id) => {
  for (let i = 0; i < 30; i++) {
    await page.evaluate((x) => window.__walkToNpc(x), id);
    await page.waitForTimeout(430);
    if (await page.evaluate((x) => window.__near?.() === x, id)) return true;
  }
  return false;
};

// 先靠近誰都行,把 __errands 掛上
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

// 找一個能招的人:反覆搭把手把人情堆到門檻
let recruited = 0;
for (const id of ids.slice(0, 5)) {
  if (!(await goTo(id))) continue;
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(600);
  // 先試招 —— 交情不夠會被拒
  if (await page.getByText('跟我走吧').count()) {
    await page.getByText('跟我走吧').click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'docs/art-research/r-refused.png' });
    console.log('REFUSED:', (await page.evaluate(() => document.body.innerText)).replace(/\s+/g,' ').slice(0,150));
    // 搭把手 15 次堆人情
    for (let i = 0; i < 15; i++) {
      await page.getByText('幫他搭把手').click();
      await page.waitForTimeout(90);
    }
    await page.getByText('跟我走吧').click();
    await page.waitForTimeout(500);
    const txt = await page.evaluate(() => document.body.innerText);
    console.log('ASKED:', txt.replace(/\s+/g,' ').slice(0,150));
    if (txt.includes('隨行') || txt.includes('已隨你左右')) { recruited++; }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    if (recruited >= 2) break;
  }
}
// 走一段,看跟班有沒有跟上
await page.evaluate(() => { const p = window.__probe(); window.__walkTo(p.player[0] + 16, p.player[1] + 12); });
await page.waitForTimeout(4200);
await page.screenshot({ path: 'docs/art-research/r-following.png' });
console.log('recruited:', recruited, '| ERRORS:', errors.length ? errors.slice(0,2).join(' | ') : 'none');
await browser.close();
