import { chromium } from '@playwright/test';

/**
 * 收尾那一批的驗收 —— 葉子透光、中景草、房子隨村況、鐵匠鋪、事件鏡頭。
 *
 * 外加把<b>植被 LOD 到底值不值得做</b>再量一次:上次量的結論是
 * 「現在買不到幀率」,而這一輪加了中景草、雲、接觸陰影、屍首 ——
 * 憑印象說「應該還好」是不行的,得再跑一次。
 */

const PORT = process.env.PORT || 5178;
const OUT = process.env.OUT || 'docs/art-research';
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 60000 });
await page.bringToFront();
await page.waitForFunction(() => typeof window.__post === 'function', null, { timeout: 60000 });
/*
 * 開場<b>用真的點一下</b>,不用 __begin()。
 *
 * 差別只在聲音:瀏覽器不准沒有使用者手勢就開 AudioContext,
 * 而 page.evaluate 呼叫的函式不算手勢 —— 用 __begin 進場的話
 * 整局都是靜音的,而且 __audio() 會誠實地報 ready:false。
 * (別的探針無所謂,這一支要驗聲音。)
 */
const startBtn = page.getByRole('button', { name: '就這樣開始' });
if (await startBtn.count()) await startBtn.first().click();
else await page.evaluate(() => window.__begin && window.__begin());
await page.waitForTimeout(2200);

const ok = (b, s) => console.log(b ? `  ✓ ${s}` : `  ✗ ${s}`);
const frameMs = () => page.evaluate(() => new Promise((res) => {
  const t = []; let last = performance.now();
  const tick = () => {
    const n = performance.now(); t.push(n - last); last = n;
    if (t.length < 200) requestAnimationFrame(tick);
    else { t.sort((a, b) => a - b); res(+t[Math.floor(t.length / 2)].toFixed(2)); }
  };
  requestAnimationFrame(tick);
}));

console.log('── 中景草:腳邊那一圈之外還有東西');
await page.evaluate(() => window.__place(-4, 44));
await page.waitForTimeout(2400);
const cover = await page.evaluate(() => window.__groundCover);
console.log(`  ${JSON.stringify(cover)}`);
ok(cover.far > 100, `中景鋪了 ${cover.far} 叢`);
ok(cover.ms < 12, `重鋪一次 ${cover.ms} 毫秒`);

/*
 * 房子跟著村況變。
 *
 * 兩個坑都在這一段裡踩過:
 * 一、只推 order 一項 —— 而顏色看的是治安/收成/交易的合成,推不太動。
 * 二、只等四秒 —— 而過渡的時間常數是十幾秒,量到的是「才走了兩成」。
 */
console.log('── 房子跟著村況變');
await page.evaluate(() => window.__village(8, 8, 8));
await page.waitForTimeout(16000);
const poor = await page.evaluate(() => window.__built());
await page.evaluate(() => window.__village(96, 96, 96));
await page.waitForTimeout(16000);
const rich = await page.evaluate(() => window.__built());
console.log(`  破敗 ${poor.upkeep} → 齊整 ${rich.upkeep}`);
ok(rich.upkeep - poor.upkeep > 0.5, '村況真的推得動房子的顏色');

console.log('── 鐵匠鋪:第二間看得見裡面的屋子');
await page.evaluate(() => window.__walkToPlace('market'));
await page.waitForTimeout(400);
const smithy = await page.evaluate(() => {
  let found = 0;
  window.__scene.traverse((o) => {
    if (o.isPointLight && o.color && o.color.r > o.color.b * 1.5) found++;
  });
  return found;
});
console.log(`  暖色點光源 ${smithy} 盞(酒肆 + 爐火)`);
ok(smithy >= 2, '兩處室內各有一盞');

console.log('── 葉子透光:日出與正午該不一樣');
const sss = async (h) => {
  await page.evaluate((hh) => { window.__setWeather('clear'); window.__setClock(hh, 'summer'); }, h);
  await page.waitForTimeout(2200);
  return page.evaluate(() => window.__foliage());
};
const dawn = await sss(5.7);
const noon = await sss(12);
console.log(`  日出 ${JSON.stringify(dawn)} · 正午 ${JSON.stringify(noon)}`);
ok(dawn.sss > noon.sss * 1.5, '低角度的光才透得過來');

/*
 * 植被 LOD 值不值得。
 *
 * <b>要先把畫面撐到吃不消,量到的數字才算數。</b>
 * 上一次量出「藏光了也省 0.00 毫秒」——那是因為兩邊都<b>頂在垂直同步上</b>
 * (13.3 毫秒剛好是 75Hz),等於拿兩個都爆表的溫度計比體溫。
 * 把視窗放大到 2800×1600,離開那道天花板再比。
 */
console.log('── 植被 LOD 到底值不值得(再量一次)');
await page.setViewportSize({ width: 2800, height: 1600 });
await page.waitForTimeout(1500);
await page.evaluate(() => window.__place(-4, 44));
await page.waitForTimeout(2000);
await page.evaluate(() => { window.__setWeather('clear'); window.__setClock(12, 'summer'); });
await page.waitForTimeout(1200);
const withVeg = await frameMs();
const g1 = await page.evaluate(() => window.__gpu());
await page.evaluate(() => window.__hideVeg(true));
await page.waitForTimeout(1200);
const noVeg = await frameMs();
const g2 = await page.evaluate(() => window.__gpu());
await page.evaluate(() => window.__hideVeg(false));
await page.setViewportSize({ width: 1400, height: 800 });
console.log(`  有植被 ${withVeg} ms · ${g1.calls} draw · ${(g1.tris / 1e6).toFixed(2)}M`);
console.log(`  全藏起 ${noVeg} ms · ${g2.calls} draw · ${(g2.tris / 1e6).toFixed(2)}M`);
console.log(`  植被的代價 ${(withVeg - noVeg).toFixed(2)} ms —— `
  + `${withVeg - noVeg < 1.5 ? 'LOD 現在買不到幀率,不做' : '值得做 LOD'}`);

/*
 * 聲音 —— 這一段只有<b>真的瀏覽器</b>驗得到。
 *
 * 混音與樂句的規矩已經抽成純函式在 vitest 裡驗了(audio.test.ts),
 * 剩下的是「噪音真的接上濾波器了嗎、排程真的在走嗎」——
 * 那需要一個 AudioContext。而聲音壞掉的樣子是安靜,
 * 和「還沒做」一模一樣,所以非驗不可。
 */
console.log('── 聲音:真的在響嗎');
const a0 = await page.evaluate(() => window.__audio());
console.log(`  ${JSON.stringify(a0)}`);
ok(a0.ready, '音訊起來了 —— 而且是真的點了「就這樣開始」才起來的');
await page.evaluate(() => window.__pluck());
await page.waitForTimeout(2500);
const a1 = await page.evaluate(() => window.__audio());
ok(a1.music.plucked > a0.music.plucked,
   `琴真的撥了(${a0.music.plucked} → ${a1.music.plucked} 個音)`);
ok(!a1.muted, '沒有被靜音');

/* ── 對照片 ── */
await page.evaluate(() => window.__freezeCam(true));
const CAM = [[-30, 26, 92], [10, 2, 0]];
const aim = () => page.evaluate(([c, l]) => window.__setCam(c, l), CAM);
for (const [name, h] of [['final-dawn', 5.8], ['final-noon', 12], ['final-dusk', 18.6]]) {
  await page.evaluate((hh) => window.__setClock(hh, 'summer'), h);
  await page.waitForTimeout(2400);
  await aim();
  await page.bringToFront();
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  拍了 ${name}`);
}
await page.evaluate(() => window.__freezeCam(false));
await page.evaluate(() => window.__walkToPlace('market'));
await page.waitForTimeout(9000);
await page.evaluate(() => window.__setClock(20.5, 'summer'));
await page.waitForTimeout(2000);
await page.bringToFront();
await page.screenshot({ path: `${OUT}/final-market-night.png` });
console.log('  拍了 final-market-night');

console.log(errors.length ? `!! ${errors.length} 個錯誤:\n${errors.slice(0, 4).join('\n')}` : '  無錯誤');
await browser.close();
