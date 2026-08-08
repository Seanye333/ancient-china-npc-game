import { chromium } from '@playwright/test';

/**
 * 後處理那一層的驗收 —— 這一批<b>沒有一項是眼睛驗得動的</b>。
 *
 * 「調色有沒有在動」「光柱是不是零」「腳下那片影子濃到什麼程度」,
 * 三樣都只差一點點,而且和光、和霧、和天氣糾纏在一起。
 * 所以每一項都在程式裡露一個數字(__post),先把數字驗過,
 * 再拍幾張固定機位的對照片給眼睛看。
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
await page.evaluate(() => window.__begin && window.__begin());
await page.waitForTimeout(2000);

const ok = (b, s) => console.log(b ? `  ✓ ${s}` : `  ✗ ${s}`);
const setSky = async (h, se, w) => {
  await page.evaluate(([hh, ss, ww]) => {
    window.__setWeather(ww);
    window.__setClock(hh, ss);
  }, [h, se, w]);
  // 調色與光柱都是插值過去的,要等它走完
  await page.waitForTimeout(2600);
  return page.evaluate(() => window.__post());
};

console.log('── 調色:季節、天氣、晝夜各有各的數');
const noonSummer = await setSky(12, 'summer', 'clear');
const noonWinter = await setSky(12, 'winter', 'clear');
const rain = await setSky(12, 'summer', 'rain');
const night = await setSky(1.5, 'summer', 'clear');
console.log(`  夏日正午 ${JSON.stringify(noonSummer)}`);
console.log(`  冬日正午 ${JSON.stringify(noonWinter)}`);
console.log(`  夏日大雨 ${JSON.stringify(rain)}`);
console.log(`  夏夜丑時 ${JSON.stringify(night)}`);
ok(noonWinter.sat < noonSummer.sat * 0.85, '冬天比夏天灰');
ok(rain.sat < noonSummer.sat * 0.8, '下雨把顏色洗掉');
ok(night.sat < noonSummer.sat * 0.6, '夜裡認不出顏色');
ok(night.liftB > noonSummer.liftB * 1.5, '夜裡暗處發藍');

console.log('── 接觸陰影:有人的地方就有,太陽越弱越濃');
ok(noonSummer.contacts > 0, `正午腳邊有影子(${noonSummer.contacts} 片)`);
ok(night.contacts > 0, `夜裡也有(${night.contacts} 片)`);
ok(night.contactAlpha > noonSummer.contactAlpha * 1.4,
   `夜裡濃、白天淡(${night.contactAlpha} vs ${noonSummer.contactAlpha})`);
ok(rain.contactAlpha > noonSummer.contactAlpha,
   `陰雨天也接手(${rain.contactAlpha})`);

console.log('── 體積光:日出前是零,日出後透出來,正午收乾淨');
const before = await setSky(4.4, 'summer', 'clear');
const rise = await setSky(5.6, 'summer', 'clear');
const noon = await setSky(12, 'summer', 'clear');
const dusk = await setSky(19.0, 'summer', 'clear');
const wet = await setSky(5.6, 'summer', 'rain');
console.log(`  天未亮 ${before.weight} · 日出 ${rise.weight} · 正午 ${noon.weight}`
  + ` · 日落 ${dusk.weight} · 雨中日出 ${wet.weight}`);
ok(before.weight < 0.01, '天沒亮沒有光柱');
ok(rise.weight > 0.15, '日出那陣最強');
ok(noon.weight < 0.01, '正午收乾淨');
ok(dusk.weight > 0.1, '黃昏也有');
ok(wet.weight < 0.01, '雨天不畫 —— 白付一遍取樣');

console.log('── 景深:焦點釘在人身上');
await setSky(12, 'summer', 'clear');
const f0 = await page.evaluate(() => window.__post().focus);
ok(f0 > 3 && f0 < 14, `焦距 ${f0} 步(鏡頭本來就在六步外)`);

console.log('── 成本');
const gpu = await page.evaluate(() => window.__gpu());
console.log(`  ${JSON.stringify(gpu)}`);
const fps = await page.evaluate(() => new Promise((res) => {
  let n = 0; const t0 = performance.now();
  const tick = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick);
    else res(Math.round((n * 1000) / (performance.now() - t0))); };
  requestAnimationFrame(tick);
}));
console.log(`  ${fps} fps`);

/* ── 對照片 ──
 * <b>機位要自己擺</b>。
 *
 * 第一版只是 __place 到某個座標,讓鏡頭解算器自己收 —— 拍回來兩張:
 * 一張貼著一堵牆,一張整個埋在樹冠裡,遠景一片都看不到。
 * 而這一批要驗的<b>就是遠景</b>(景深化的是遠山,調色看的是整片天地)。
 * 所以凍住解算器,把鏡頭架高、對著河谷望出去。
 */
await page.evaluate(() => window.__place(-6, 40));
await page.waitForTimeout(2400);
await page.evaluate(() => window.__freezeCam(true));
const CAM = [[-30, 26, 92], [10, 2, 0]];
const aim = async () => page.evaluate(([c, l]) => window.__setCam(c, l), CAM);
await aim();
await page.waitForTimeout(400);

const shots = [
  ['post-summer-noon', 12, 'summer', 'clear'],
  ['post-winter-noon', 12, 'winter', 'clear'],
  ['post-rain', 13, 'summer', 'rain'],
  ['post-sunrise-rays', 5.6, 'summer', 'clear'],
  ['post-night', 1.5, 'summer', 'clear'],
];
for (const [name, h, se, w] of shots) {
  await setSky(h, se, w);
  await aim();
  await page.bringToFront();
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  拍了 ${name}`);
}

/*
 * 景深 —— <b>它現在只在說話/進場所/落幕的時候掛上</b>(量過:一直開著要 5.8 毫秒)。
 *
 * 所以這一組要真的去和一個人搭話。順帶驗的是同一件事的另一半:
 * 鏡頭推近。兩張並排看,差別應該是「人變大了、背景化開了」。
 */
await page.evaluate(() => window.__freezeCam(false));
await setSky(11, 'summer', 'clear');
await page.evaluate(() => window.__place(0, 0));
await page.waitForTimeout(2200);

/*
 * 找人的方式:<b>不要用走的去撞,也不要走去他剛才站的地方</b>。
 *
 * 第一版按著 W 直走四十次,一個人都沒撞到 —— 這個村子二十步一個人,
 * 朝一個方向直走多半是走進田裡。第二版改成 __walkToNpc,還是沒撞到:
 * 那些人<b>自己也在走</b>,等你走到他剛才那個點,他已經去下一個地方了。
 * 直接瞬移到他身邊。
 */
const roster = await page.evaluate(() => (window.__villagers ? window.__villagers() : []));
console.log(`  街上 ${roster.length} 人`);
/*
 * 挑人還有第三個坑:<b>挑到站在屋裡的那個</b>。
 * 瞬移過去、鏡頭解算器退無可退,整張圖是一面土牆 —— 人一個都看不見。
 * 所以要順帶問一句 __cam().buried。
 */
let near = null;
for (const v of roster.slice(0, 14)) {
  await page.evaluate(([x, z]) => window.__place(x + 1.4, z + 1.4), [v.x, v.z]);
  await page.waitForTimeout(1300);
  const id = await page.evaluate(() => window.__near && window.__near());
  const buried = await page.evaluate(() => window.__cam().buried);
  if (id && !buried) { near = id; break; }
}
console.log(`  搭話對象:${near ?? '(沒找到人)'}`);
await page.bringToFront();
await page.screenshot({ path: `${OUT}/post-talk-before.png` });
if (near) {
  await page.evaluate((id) => window.__talkTo(id), near);
  await page.waitForTimeout(1800);
  await page.bringToFront();
  await page.screenshot({ path: `${OUT}/post-talk-after.png` });
  const on = await page.evaluate(() => window.__dof(3.0));
  ok(on, '說話時景深掛上了');
  await page.keyboard.press('Escape');
}

console.log(errors.length ? `!! ${errors.length} 個錯誤:\n${errors.slice(0, 4).join('\n')}` : '  無錯誤');
await browser.close();
