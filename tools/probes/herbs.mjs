import { chromium } from '@playwright/test';

/**
 * 採藥批的驗收。
 *
 * 純邏輯那半邊有 herbs.test.ts 釘著,這裡只驗<b>接線</b> ——
 * 藥叢在不在畫面上、走過去按不按得開、採空了看不看得出來、
 * 病家門口那條白布掛沒掛起來、送藥以後那個人身上有沒有留下記號。
 *
 * headless 一定要 false:React.lazy 的彈窗在無頭模式下永遠不 resolve,
 * 這條坑之前吃過一次。
 */

const PORT = process.env.PORT || 5181;
/*
 * 那三個 flag 不是裝飾:視窗被別的窗遮住的時候 Chromium 會把 rAF 停掉,
 * 而 page.screenshot 是<b>等一幀</b>才回傳的 —— 於是截圖整整卡六十秒然後逾時。
 * 這批就是這麼吃了一次虧:五張圖全部無聲失敗(.catch 把錯吞了),
 * 探針卻一路報 ✓。
 */
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
await page.waitForFunction(() => typeof window.__herbs === 'function', null, { timeout: 60000 });
await page.waitForTimeout(2000);
await page.getByRole('button', { name: /就這樣開始/ }).click();
await page.waitForTimeout(1500);

const ok = (b, s) => console.log(b ? `  ✓ ${s}` : `  ✗ ${s}`);

/**
 * 截圖前<b>一定要把視窗提到最前</b>。
 *
 * macOS 把被遮住的視窗停掉合成,而 page.screenshot 是等一幀才回傳的 ——
 * 於是它會卡滿逾時然後拋錯。光靠 --disable-backgrounding-occluded-windows
 * 擋不住(那管的是 Chromium 自己的節流,不是系統層的遮擋)。
 */
async function shot(name) {
  await page.bringToFront();
  await page.screenshot({ path: `docs/art-research/${name}.png`, timeout: 30000 });
}

/** 走到某個地方並把面板打開 —— 站定了才按 F,不然 nearPlace 還沒算出來。 */
async function openPlace(x, z, label) {
  await page.evaluate(([px, pz]) => window.__place(px, pz), [x, z]);
  await page.waitForTimeout(700);
  const near = await page.evaluate(() => window.__nearPlace());
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(400);
  console.log(`  腳下:${JSON.stringify(near)}${label ? ` (要的是 ${label})` : ''}`);
  return near;
}

console.log('── 一、山坡上的藥草');
await page.evaluate(() => { window.__setClock(10, 'summer'); window.__setWeather('clear'); });
await page.waitForTimeout(600);
const h0 = await page.evaluate(() => window.__herbs());
console.log(`  藥叢 ${h0.spots.length} 叢,深山的 ${h0.spots.filter((s) => s.wild).length} 叢`);
console.log(`  最近的幾叢:`, JSON.stringify(h0.spots.slice(0, 3)));

const spot = h0.spots.find((s) => !s.wild) ?? h0.spots[0];
await openPlace(spot.at[0], spot.at[1], spot.id);
await shot('v4-herb-patch');

const pickBtn = page.getByRole('button', { name: /採藥/ });
ok(await pickBtn.count() > 0, '走到藥叢上按得開「採藥」');
const before = (await page.evaluate(() => window.__herbs())).onHand;
if (await pickBtn.count()) { await pickBtn.first().click(); await page.waitForTimeout(600); }
const h1 = await page.evaluate(() => window.__herbs());
console.log(`  採了一趟:${before} → ${h1.onHand} 株`);
ok(h1.onHand > before, '夏天採得到藥');
ok(h1.spots.find((s) => s.id === spot.id)?.ready === false, '採空的那一叢當場沒了(要等它長回來)');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await shot('v4-herb-picked');

console.log('── 二、冬天上山是白跑');
await page.evaluate(() => window.__setClock(10, 'winter'));
await page.waitForTimeout(800);
const cold = h0.spots.filter((s) => s.id !== spot.id).slice(0, 4);
let winterGot = 0;
for (const s of cold) {
  await openPlace(s.at[0], s.at[1]);
  const b = (await page.evaluate(() => window.__herbs())).onHand;
  const btn = page.getByRole('button', { name: /採藥/ });
  if (await btn.count()) { await btn.first().click(); await page.waitForTimeout(500); }
  winterGot += (await page.evaluate(() => window.__herbs())).onHand - b;
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}
console.log(`  冬天採了四叢,共得 ${winterGot} 株`);
ok(winterGot <= 2, '雪底下基本什麼都沒有');
await shot('v4-herb-winter');

console.log('── 三、病家門口的白布');
await page.evaluate(() => window.__setClock(10, 'autumn'));
const home = await page.evaluate(() => window.__makeSick('v5', 4));
await page.waitForTimeout(900);
console.log(`  v5 家在 ${JSON.stringify([Math.round(home.door[0]), Math.round(home.door[1])])}`);
const near = await openPlace(home.door[0], home.door[1], `sick-v5`);
ok(String(near?.id ?? near) .includes('sick-v5'), '病家是一個走得過去的地方');
await shot('v4-sickbed');

// 手上得先有藥才送得出去
await page.evaluate(() => window.__heroStore.setState({ herbs: 6 }));
await page.waitForTimeout(300);
const giveBtn = page.getByRole('button', { name: /送一副藥/ });
ok(await giveBtn.count() > 0, '有「送一副藥」這個選項');
if (await giveBtn.count()) { await giveBtn.first().click(); await page.waitForTimeout(600); }
const f5 = await page.evaluate(() => window.__folk('v5'));
console.log(`  v5:`, JSON.stringify(f5));
ok(f5?.dosed === true, '藥送到了 —— 他身上留下了記號');
ok((await page.evaluate(() => window.__herbs())).onHand === 3, '扣了三株');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

console.log('── 四、敷自己的傷');
await page.evaluate(() => window.__heroStore.setState({
  wounded: 3, woundKind: 'face', herbs: 6, dressedOn: null, scars: 0,
}));
await page.waitForTimeout(400);
// __walkToPlace 是<b>用走的</b>,跨半個村子要好幾十秒 —— 驗收用瞬移
const homeAt = await page.evaluate(() => window.__placePos('home'));
await openPlace(homeAt[0], homeAt[1], 'home');
const dressBtn = page.getByRole('button', { name: /敷藥/ });
ok(await dressBtn.count() > 0, '落腳處按得到「敷藥」');
if (await dressBtn.count()) { await dressBtn.first().click(); await page.waitForTimeout(600); }
const h2 = await page.evaluate(() => window.__herbs());
console.log(`  敷完:`, JSON.stringify(h2).slice(0, 160));
ok(h2.wounded === 2, '傷減了一分(不是立刻好)');
ok(h2.dressedOn !== null, '記下了這一旬敷過');
if (await dressBtn.count()) { await dressBtn.first().click(); await page.waitForTimeout(400); }
ok((await page.evaluate(() => window.__herbs())).wounded === 2, '同一旬敷第二次沒有用');

console.log('── 五、破相敷過藥就不留疤');
await page.evaluate(() => window.__heroStore.setState({
  wounded: 1, woundKind: 'face', herbs: 6, dressedOn: null, scars: 0,
}));
await page.waitForTimeout(300);
if (await dressBtn.count()) { await dressBtn.first().click(); await page.waitForTimeout(500); }
const h3 = await page.evaluate(() => window.__herbs());
console.log(`  傷 ${h3.wounded} · 疤 ${h3.scars}`);
ok(h3.wounded === 0 && h3.scars === 0, '敷過藥的破相好了不留疤');

console.log('errors:', errors.slice(0, 3).join(' | ') || 'none');
await browser.close();
