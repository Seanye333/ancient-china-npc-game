import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * 人形 — 一個角色的「身」與「頭」兩塊幾何。
 *
 * 玩家與 NPC 共用同一副身體,差別只在誰在驅動它:NPC 由作息狀態機推,
 * 玩家由鍵盤推。抽出來是為了讓兩邊<b>看起來就是同一個世界的人</b> ——
 * 主角要是長得跟路人不是一套語言,那個世界就散了。
 *
 * 顏色烘進頂點,所以一個 InstancedMesh 也能有多色 —— 這一步讓動畫與批次不再互斥。
 */

export const ROBES = ['#4a6b52', '#6b5741', '#3f5568', '#6a6350'];
const SKIN = new THREE.Color('#e8b494');

/**
 * 膚色。
 *
 * 一整村同一張臉皮,是「複製人」感裡最說不出所以然的一條 ——
 * 髮式衣色都不同了,可是四十張臉一個色,遠看還是一批人。
 * 這幾個色是同一族的深淺:下田扛包的曬得黑,市面上的白些,
 * 老人褪成灰黃 —— 順帶把「行當寫在身上」延伸到臉上。
 */
export const SKINS = ['#e8b494', '#dca97f', '#c9905f', '#efc0a3', '#d3a887'];

/** 陰面(鼻樑側、耳廓)—— 從膚色壓下來,不另配一個色,免得兩邊調得不一樣。 */
function shade(skin: THREE.Color): THREE.Color {
  return skin.clone().multiplyScalar(0.78);
}
const HAIR = new THREE.Color('#241e26');
const INK = new THREE.Color('#161018');
export const TRIM = new THREE.Color('#b8863c');
export const LIP = new THREE.Color('#a45f4e');
export const BROW = new THREE.Color('#2b2226');

/** 輪廓線。匯出是為了讓測試釘「五官貼在臉上」—— 各抄一份遲早漂移。 */
export const HEAD_P: Array<[number, number]> = [
  [0.00, -1.00], [0.30, -0.94], [0.56, -0.80], [0.78, -0.58], [0.92, -0.30],
  [1.00, 0.02], [1.00, 0.34], [0.93, 0.62], [0.72, 0.84], [0.40, 0.96], [0.00, 1.00],
];
export const BODY_P: Array<[number, number]> = [
  [1.00, 0.00], [0.96, 0.10], [0.86, 0.34], [0.76, 0.55],
  [0.86, 0.72], [0.94, 0.88], [0.86, 0.97], [0.36, 1.00],
];
const SLEEVE_P: Array<[number, number]> = [
  [0.48, 0.00], [0.42, 0.26], [0.35, 0.66], [0.32, 0.92], [0.26, 1.00],
];

export const FIG_H = 1.34;
export const FIG_HR = FIG_H * 0.245;
export const FIG_BODY_H = FIG_H - FIG_HR * 1.85;

/**
 * 腿。
 *
 * 在這之前每個人都是「一件垂到地的袍子 + 一顆頭」——
 * 遠看是棋子,近看是保齡球瓶,走起來整個人平移過去,像在冰上滑。
 * 下擺提到胯、露出小腿和腳,人才是<b>站在</b>地上而不是浮在地上。
 *
 * <b>提下擺不動袖子和腰帶</b>:那兩樣的絕對高度是兵器掛點、頭的落點
 * 所依賴的,一動就要改七個檔案,而且改錯了刀會長在肚子上。
 */
export const FIG_LEG_H = FIG_BODY_H * 0.28;
/** 兩腿中心到身體中軸的距離。 */
export const FIG_HIP = FIG_HR * 0.30;

/**
 * 肩與手。
 *
 * 袖子從身上拆出來,和腿同一個道理:走路的時候手臂不動,人就只是
 * 下半身在動的一個雕像。拆出來以後,擺一條手臂就是繞肩轉一下 X 軸。
 *
 * <b>手的位置匯出成常數</b> —— 兵器掛在手上,而掛點從前是各處各抄一份
 * (0.92r, 0.32h, -0.12r)。上一批把手往下挪了 0.06h 去袖口外面,
 * 那幾份抄件沒跟著動,刀就懸在手腕上方半掌高。一個出口,才不會再漂。
 */
export const FIG_SHOULDER_Y = FIG_BODY_H * 0.88;
export const FIG_SHOULDER_X = FIG_HR * 0.80;
const ARM_L = FIG_BODY_H * 0.54;
/** 手心相對於<b>肩</b>的位置(x 是往外的方向,乘 side)。 */
export const FIG_HAND: [number, number, number] =
  [FIG_HR * 0.10, -ARM_L - FIG_BODY_H * 0.08, -FIG_HR * 0.16];

function lathe(profile: Array<[number, number]>, r: number, h: number, seg = 14) {
  return new THREE.LatheGeometry(
    profile.map(([pr, ph]) => new THREE.Vector2(Math.max(1e-4, pr * r), ph * h)), seg,
  );
}

/** 顏色烘進頂點 — 這一步讓動畫與批次不再互斥。 */
function tint(g: THREE.BufferGeometry, c: THREE.Color) {
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function at(g: THREE.BufferGeometry, x: number, y: number, z: number,
            sx = 1, sy = 1, sz = 1) {
  g.applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz)));
  return g;
}

/**
 * 沿著輪廓線查半徑 —— 「這個高度上,身體有多寬」。
 *
 * 五官和腰帶都得<b>貼在面上</b>。憑感覺填 z 座標的下場是:嘴浮在臉前面一公分,
 * 或者腰帶整條埋進袍子裡(下擺提到胯以後就發生過:腰帶原本在輪廓最細的地方,
 * 提完就落到胯的鼓肚上,從此再也沒露出來過)。位置一律從輪廓算。
 */
export function radiusAt(profile: Array<[number, number]>, py: number): number {
  for (let i = 1; i < profile.length; i++) {
    const [r0, y0] = profile[i - 1];
    const [r1, y1] = profile[i];
    if (py <= y1) {
      const k = y1 === y0 ? 0 : (py - y0) / (y1 - y0);
      return r0 + (r1 - r0) * Math.max(0, Math.min(1, k));
    }
  }
  return profile[profile.length - 1][0];
}

/**
 * 把一條輪廓線從某個高度切上去,切口處補一個插值點。
 *
 * 用途是「帽蓋要和顱骨同一個形狀」:另拿一顆球蓋上去的話,兩張面在髮線
 * 附近互相穿插,畫面上是一條鋸齒狀的爛邊。同一條線放大一點,處處平行。
 */
function profileAbove(profile: Array<[number, number]>, y0: number): Array<[number, number]> {
  const out: Array<[number, number]> = [[radiusAt(profile, y0), y0]];
  for (const p of profile) if (p[1] > y0) out.push(p);
  return out;
}

/** 一塊薄板 —— 五官、衣襟、腰帶垂頭都是它。 */
function slab(w: number, h: number, d: number) {
  return new THREE.BoxGeometry(w, h, d);
}

function rot(g: THREE.BufferGeometry, rx: number, ry: number, rz: number) {
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  return g;
}

/**
 * 一條腿 —— 原點在<b>胯</b>,往下長。
 *
 * 原點放在胯而不是腳底,是為了讓「邁步」就是繞原點轉一下 X 軸:
 * 轉軸放在腳踝的話,抬腿會把腳戳進地裡。
 */
export function legGeom(): THREE.BufferGeometry {
  const gs: THREE.BufferGeometry[] = [];
  const TROUSER = new THREE.Color('#332d30');
  const SHOE = new THREE.Color('#3f3227');
  const r = FIG_HR * 0.20;
  // 小腿:上粗下細一點,長度多給 6% 塞進下擺裡,免得抬腿時胯上開一條縫
  gs.push(tint(at(new THREE.CylinderGeometry(r, r * 0.86, FIG_LEG_H * 1.12, 6),
    0, -FIG_LEG_H * 0.50, 0), TROUSER));
  // 腳:一塊往前伸的板,前端略窄 —— 有腳尖才有方向
  gs.push(tint(at(new THREE.BoxGeometry(r * 1.7, FIG_LEG_H * 0.24, r * 3.0),
    0, -FIG_LEG_H * 1.02, r * 0.75), SHOE));
  return mergeGeometries(gs, false)!;
}

/**
 * 邁步的角度。左右差半個相位 —— 同相位就成了兔子跳。
 * 站著不動時歸零,而不是停在隨機的一個角度上(那會讓人劈著腿站在市集裡)。
 */
export function legSwing(step: number, side: number, moving: boolean): number {
  return moving ? Math.sin(step + (side > 0 ? 0 : Math.PI)) * 0.55 : 0;
}

/**
 * 把一條腿擺到位。<b>整個世界的人共用這一個出口</b> ——
 * 玩家、村民、同行的、陣上的、縣城裡站著的,腿長在同一個地方。
 *
 * 用 'YXZ':先繞世界的 Y 轉到面朝的方向,再繞<b>自己的</b> X 邁步。
 * 用預設的 'XYZ' 的話,人一轉身腿就往旁邊劈出去。
 *
 * o 可以是真的 mesh,也可以是一個臨時 Object3D —— InstancedMesh 那邊
 * 擺完再 updateMatrix() 取矩陣。
 */
export function poseLeg(
  o: THREE.Object3D, side: 1 | -1,
  x: number, hipY: number, z: number, yaw: number, swing: number, scale = 1,
) {
  const d = FIG_HIP * scale * side;
  o.position.set(x + Math.cos(yaw) * d, hipY, z - Math.sin(yaw) * d);
  o.rotation.order = 'YXZ';
  o.rotation.set(swing, yaw, 0);
  o.scale.setScalar(scale);
}

/** 袍子的半徑 —— 傳<b>絕對高度</b>,自己換算成輪廓上的位置。 */
const ROBE_SPAN = FIG_BODY_H - FIG_LEG_H;
function robeR(y: number): number {
  return radiusAt(BODY_P, (y - FIG_LEG_H) / ROBE_SPAN) * FIG_HR * 1.02;
}

/**
 * 沿著袍子的正面鋪一條斜帶(衣襟)—— 一條<b>貼著胸口彎過去的緞帶</b>。
 *
 * 前一版是把幾個方塊排成一條線,每塊各自算自己的深度。方向是對的,
 * 可是方塊有角:排在 45 度的斜線上、每塊的 z 又不一樣,邊緣就成了一排缺口,
 * 遠看是一條有鋸齒的帶子。改成一條真的帶子 —— 沿線取樣,每一站算出
 * 表面上的點與法線,左右各推半個帶寬,站與站之間補三角形。沒有角,就沒有缺口。
 */
function robeRibbon(o: {
  x0: number; y0: number; x1: number; y1: number; w: number; lift: number;
}): THREE.BufferGeometry {
  const N = 10;
  const pts: THREE.Vector3[] = [];
  const nrm: THREE.Vector3[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = o.x0 + (o.x1 - o.x0) * t;
    const y = o.y0 + (o.y1 - o.y0) * t;
    const r = robeR(y);
    // 胸口是個旋轉面:這個高度的半徑是 r,橫向偏 x 的地方,表面在 z = -√(r²-x²)
    const zz = Math.sqrt(Math.max(1e-4, r * r - x * x));
    const n = new THREE.Vector3(x / r, 0, -zz / r).normalize();
    pts.push(new THREE.Vector3(x, y, -zz).addScaledVector(n, o.lift));
    nrm.push(n);
  }
  const pos: number[] = [];
  const half = o.w / 2;
  const edge = (i: number, sgn: number) => {
    const fwd = (i < N ? pts[i + 1].clone().sub(pts[i]) : pts[i].clone().sub(pts[i - 1])).normalize();
    const side = new THREE.Vector3().crossVectors(fwd, nrm[i]).normalize();
    return pts[i].clone().addScaledVector(side, sgn * half);
  };
  const idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const a = edge(i, -1), b = edge(i, 1);
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    if (i < N) {
      const k = i * 2;
      idx.push(k, k + 1, k + 3, k, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  /*
   * uv 和<b>索引</b>都是必須的,即使一個像素的貼圖都不用。
   *
   * mergeGeometries 要求每一份幾何的屬性集完全一致 —— 少一個 uv、
   * 或者「有的有索引有的沒有」,它都回 null,而 bodyGeom 尾巴上那個 `!`
   * 會把 null 當幾何用下去。結果是<b>整個身子憑空消失</b>,
   * 控制台只有一句「Cannot read properties of null」,
   * 看不出跟一條衣襟有什麼關係。(這一條是 figure.test.ts 抓到的。)
   */
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * 衣緣的顏色。素色的麻緣,只染上一點袍子的味道 ——
 * 袖口和衣襟共用它,所以抽出來:兩處各配一次,遲早調得不一樣。
 */
function collarColor(robe: THREE.Color): THREE.Color {
  return new THREE.Color('#ddd2ba').lerp(robe, 0.16);
}

/**
 * 一條手臂 —— 原點在<b>肩</b>,往下垂。
 * 廣袖、袖緣、露在袖口外的手,一份幾何全帶著。
 */
export function armGeom(robe: THREE.Color, skin: THREE.Color = SKIN): THREE.BufferGeometry {
  const gs: THREE.BufferGeometry[] = [];
  const edge = collarColor(robe);
  gs.push(tint(at(lathe(SLEEVE_P, FIG_HR, ARM_L, 8), 0, -ARM_L, 0), robe));
  // 袖緣 —— 廣袖的口上一道邊,手才不像從管子裡伸出來
  gs.push(tint(at(new THREE.TorusGeometry(FIG_HR * 0.47, FIG_HR * 0.05, 5, 10)
    .rotateX(Math.PI / 2), 0, -ARM_L + FIG_HR * 0.03, 0), edge));
  // 手擺在中軸上(不左右偏):一份幾何兩邊共用,偏了就得鏡像,
  // 而負縮放會把三角形的繞序翻過來,整條手臂的光就錯了
  gs.push(tint(at(new THREE.SphereGeometry(FIG_HR * 0.17, 7, 6),
    0, FIG_HAND[1], FIG_HAND[2], 1, 0.9, 1.05), skin));
  return mergeGeometries(gs, false)!;
}

/** 手臂擺動 —— 和<b>同側的腿反相</b>,幅度小一半。同相走起來像殭屍。 */
export function armSwing(step: number, side: number, moving: boolean): number {
  // 站住的時候要回<b>正的</b>零。`-0 * 0.55` 是 -0,而 Object.is(-0, 0) 是 false ——
  // 畫面上分不出來,測試會炸,而且炸得莫名其妙
  return moving ? -legSwing(step, side, true) * 0.55 : 0;
}

/** 把一條手臂擺到位。和 poseLeg 同一套規矩('YXZ':先轉身,再繞自己的 X 擺)。 */
export function poseArm(
  o: THREE.Object3D, side: 1 | -1,
  x: number, shoulderY: number, z: number, yaw: number, swing: number, scale = 1,
) {
  const d = FIG_SHOULDER_X * scale * side;
  o.position.set(x + Math.cos(yaw) * d, shoulderY, z - Math.sin(yaw) * d);
  o.rotation.order = 'YXZ';
  o.rotation.set(swing, yaw, 0);
  o.scale.setScalar(scale);
}

export function bodyGeom(robe: THREE.Color, skin: THREE.Color = SKIN) {
  const gs: THREE.BufferGeometry[] = [];
  /*
   * 衣緣是<b>淺色</b>的,不是把袍色壓暗。
   *
   * 第一版取 robe×0.62 當緣色,想著「四種袍色各自配得上」。結果是:
   * 深藍袍上的深藍領,正面看根本不存在 —— 交領那個 V 只在四分之三角度、
   * 而且要湊得很近才看得出來,等於白做。
   * 漢代的深衣本來就是拿另一色的布鑲緣;素色的麻緣配什麼袍子都成立,
   * 而且是<b>離多遠都讀得出來</b>的一筆。
   */
  const edge = collarColor(robe);

  // 下擺從胯起算 —— 側影不變,只是短了一截,底下那一截交給腿
  gs.push(tint(at(lathe(BODY_P, FIG_HR * 1.02, ROBE_SPAN, 14), 0, FIG_LEG_H, 0), robe));

  /*
   * 交領右衽 —— 一個字都不必寫的「這是漢代人」。
   *
   * 兩片衣襟從肩口斜下來交在胸前,右襟在內、左襟壓在外(右衽)。
   * 這是整副身子上<b>最便宜也最管用</b>的一筆:在這之前袍子是一個光溜溜的
   * 錐體,加了這個 V 才有「衣服」而不是「套子」。
   */
  const yTop = FIG_LEG_H + ROBE_SPAN * 0.90;      // 肩口
  const yCross = FIG_LEG_H + ROBE_SPAN * 0.58;    // 交在腰帶正上方
  for (const side of [-1, 1]) {
    // 外襟(左)壓在內襟上,所以略寬、略往前 —— 壓著的那一片要看得出是壓著
    const outer = side < 0;
    gs.push(tint(robeRibbon({
      x0: side * robeR(yTop) * 0.66, y0: yTop,
      x1: side * FIG_HR * 0.05, y1: yCross,
      w: FIG_HR * (outer ? 0.17 : 0.145),
      lift: FIG_HR * (outer ? 0.030 : 0.012),
    }), edge));
  }
  // 領緣 —— 繞脖子一圈的那道深邊,把兩片衣襟收在一起
  gs.push(tint(at(new THREE.TorusGeometry(robeR(yTop) * 0.62, FIG_HR * 0.055, 5, 12)
    .rotateX(Math.PI / 2), 0, yTop + FIG_HR * 0.02, 0), edge));

  /*
   * 腰帶紮在<b>輪廓最細的地方</b>,不是憑一個係數。
   * 下擺提到胯以後,原本那個 0.55·H 落到了胯的鼓肚上 —— 腰帶整條埋進袍子裡,
   * 從此再也沒露出來過,而畫面上只是「腰上那條線不見了」,沒人會察覺。
   */
  const yWaist = FIG_LEG_H + ROBE_SPAN * 0.55;
  gs.push(tint(at(new THREE.TorusGeometry(robeR(yWaist) * 1.01, FIG_HR * 0.075, 5, 14)
    .rotateX(Math.PI / 2), 0, yWaist, 0), TRIM));
  // 垂帶 —— 腰前垂下來的兩條。靜態的東西給側影加一點不對稱,人就不像個瓶子
  for (const side of [-1, 1]) {
    gs.push(tint(at(rot(slab(FIG_HR * 0.10, FIG_HR * 0.46, FIG_HR * 0.05), 0, 0, side * 0.08),
      side * FIG_HR * 0.10, yWaist - FIG_HR * 0.24, -robeR(yWaist) * 0.95), TRIM));
  }

  // 袖子不在這裡 —— 見 armGeom:會擺動的東西不能烘進身子
  gs.push(tint(at(new THREE.CylinderGeometry(FIG_HR * 0.32, FIG_HR * 0.32, FIG_HR * 0.40, 8),
    0, FIG_BODY_H * 0.99, 0), skin));
  return mergeGeometries(gs, false)!;
}

/** 臉的正面在 -Z。給一個高度(輪廓座標),回它在臉皮上的 z。 */
export const FACE_SQUASH = 0.94;
function faceZ(py: number, out = 0): number {
  return -(radiusAt(HEAD_P, py) * FIG_HR * FACE_SQUASH + out);
}

/**
 * 貼在臉上的一道橫紋(眉、口)—— <b>切成幾小段,一段一段找自己的深度</b>。
 *
 * 一整條直板貼在圓臉上,只有正中間那一點是貼著的:眉毛有 0.32R 寬,
 * 到了外眼角那一頭,臉皮已經往後退了將近 0.05R —— 於是眉尾翹起來浮在空中,
 * 四分之三角度看得一清二楚(而正面完全看不出來,所以很容易一直錯下去)。
 *
 * 每一段自己算 z,就順著臉彎過去了。三段就夠 —— 這副臉本來就是低面數的。
 */
function faceStrip(o: {
  x: number; y: number; py: number;
  w: number; h: number; d: number; tilt: number; R: number;
  /**
   * 中段往上/往下拱多少 —— 一條直線的嘴只能是面無表情,
   * 兩端不動、中間動,才有得笑或撇。正 = 中間往下(嘴角上揚 = 笑)。
   */
  curve?: number;
}): THREE.BufferGeometry {
  const SEG = 4;
  const gs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < SEG; i++) {
    const t = (i + 0.5) / SEG - 0.5;              // -1/3 .. +1/3
    const sx = o.x + t * o.w;
    // 這一段所在的橫向位置上,臉皮退到多深(橢球:x 越偏,z 越淺)
    const rx = radiusAt(HEAD_P, o.py) * o.R;
    const k = Math.min(1, Math.abs(sx) / Math.max(rx, 1e-4));
    const z = -Math.sqrt(Math.max(0, 1 - k * k)) * rx * FACE_SQUASH + o.d * 0.30;
    // 疊 45%:第一版只疊 12%,順著臉彎過去以後每一段的 z 各不相同,
    // 斜著看縫就開了 —— 一條眉毛讀成一條虛線
    // 拱:中段偏移最大、兩端幾乎不動(t 走到 ±0.375 就歸零)
    const arc = (o.curve ?? 0) * (1 - (t / 0.375) ** 2);
    gs.push(at(rot(slab((o.w / SEG) * 1.45, o.h, o.d), 0, 0, o.tilt),
      sx, o.y + t * o.w * Math.tan(o.tilt) - arc, z));
  }
  return mergeGeometries(gs, false)!;
}

/**
 * 頭。
 *
 * 五官<b>不是裝飾</b>。在加眉鼻口之前,這張臉是一顆膚色的蛋加兩隻大眼睛 ——
 * 讀作玩偶,不讀作人;而且四十個村民長得一模一樣,連老少都只差髮色。
 * 加了眉、鼻、口以後,同一副幾何就有了年紀和神情的著力點。
 *
 * 每一件都貼著臉皮擺(faceZ),不是憑感覺填 z —— 憑感覺的下場是
 * 嘴浮在臉前面一公分,側面看像貼了張紙。
 */
/**
 * 一顆頭長什麼樣。
 *
 * 分開成一個物件而不是幾個位置參數,是因為<b>這裡遲早會長</b>:
 * 三十八個村民要是共用兩種頭,那不是一個村子,是一批複製人。
 */
/**
 * 神情。
 *
 * 這副臉的五官是<b>烘進幾何裡</b>的,不能每幀改 —— 所以神情是
 * 「這個人是什麼樣的人」,不是「他這一秒在想什麼」:
 * 賊眉眼壓著、老人眼皮垂著、性子暖的嘴角是揚的。
 *
 * 就這麼四個數也夠用:眉高、眉的斜度、嘴的弧、眼的大小。
 * 在這之前全村四十個人共用同一張沒有表情的臉 ——
 * 賊和賣菜的除了衣色以外一模一樣,那是這副臉最大的一處空白。
 */
export type Mood = 'calm' | 'stern' | 'afraid' | 'glad' | 'weary';

interface MoodShape {
  /** 眉往上抬多少(單位 R)。 */
  browY: number;
  /**
   * 眉的斜度。<b>正 = 內側壓低(兇),負 = 內側吊高(愁/怕)。</b>
   *
   * 這個方向是量出來才對的:原本以為預設那條眉是「外高內低」
   * (程式碼註解也這麼寫),把眉毛的頂點座標撈出來一算 ——
   * 內側 0.362、外側 0.338,是<b>內高外低</b>。照著錯的方向加,
   * 「兇」只會變成「更愁」。
   */
  browTilt: number;
  /** 嘴的弧。正 = 嘴角上揚。 */
  mouthCurve: number;
  /** 嘴寬倍率。 */
  mouthW: number;
  /** 眼睛大小倍率。 */
  eye: number;
}

const MOODS: Record<Mood, MoodShape> = {
  calm: { browY: 0, browTilt: 0, mouthCurve: 0, mouthW: 1, eye: 1 },
  // 兇:眉壓下來、內側壓到眼上,嘴抿成一條寬而平的線
  stern: { browY: -0.055, browTilt: 0.66, mouthCurve: -0.012, mouthW: 1.16, eye: 0.90 },
  // 怕:眉整個吊起來、內側最高,眼睜大,嘴縮小
  afraid: { browY: 0.075, browTilt: -0.40, mouthCurve: -0.006, mouthW: 0.76, eye: 1.22 },
  // 和氣:眉稍鬆,嘴角揚起來
  glad: { browY: 0.028, browTilt: -0.02, mouthCurve: 0.028, mouthW: 1.20, eye: 0.96 },
  // 倦:眼皮垂下來,眉尾也垮
  weary: { browY: -0.012, browTilt: -0.18, mouthCurve: -0.010, mouthW: 0.90, eye: 0.78 },
};

export interface HeadStyle {
  /** 這個人的膚色。不給就用預設那一個。 */
  skin?: THREE.Color;
  /** 神情。不給就是面無表情。 */
  mood?: Mood;
  /**
   * 這張臉的種子(0..1)。眼距、眼大小、眉高、嘴寬按它微調 ——
   * 同一副幾何,換一個數字就是另一個人。
   */
  face?: number;
  /** 斗笠 —— 下田扛包的戴。 */
  hat?: boolean;
  /** 白髮。 */
  old?: boolean;
  /** 幘(頭巾)—— 庶民束髮最常見的一種,和露髻的挑著用。 */
  cloth?: boolean;
  /** 鬍子。 */
  beard?: boolean;
}

export function headGeom(style: HeadStyle = {}) {
  const {
    hat = false, old: oldHair = false, cloth = false, beard = false,
    skin = SKIN, face = 0.5, mood = 'calm',
  } = style;
  const m = MOODS[mood];
  const SKIN_D = shade(skin);
  // 種子推出四個微調量。幅度都很小 —— 這副臉的骨架是固定的,
  // 差別要小到「說不出哪裡不一樣,但就是不同的人」
  const fGap = 0.40 + face * 0.06;                        // 眼距
  const fEye = (0.94 + face * 0.14) * m.eye;              // 眼大小
  const fBrow = 0.19 + face * 0.07 + m.browY;             // 眉高
  const fMouth = (0.17 + face * 0.07) * m.mouthW;         // 嘴寬
  const gs: THREE.BufferGeometry[] = [];
  const HAIR_C = oldHair ? new THREE.Color('#d6d0c4') : HAIR;
  const cy = FIG_HR * 0.84;
  const R = FIG_HR;
  gs.push(tint(at(lathe(HEAD_P, R, R, 16), 0, cy, 0, 1, 1, FACE_SQUASH), skin));

  /*
   * 五官的深度<b>從臉皮算,不是憑感覺</b>。
   *
   * 第一版眼睛是一顆半深 0.062R 的球,球心又擺在臉皮外 0.06R —— 眼球凸出
   * 臉面 0.12R,四分之三角度一看就是<b>兩隻黏上去的護目鏡</b>,連頭的側影
   * 都被它頂出去。眉毛同理:板子的背面露在外頭,像浮在臉前一公分。
   *
   * 現在的規矩:先算這一件的半深,再讓它<b>只凸出 proud 那麼多</b>,
   * 其餘埋進臉裡。凸多少是一個看得懂的數字,而不是兩個座標湊出來的結果。
   */
  const EYE_R = R * 0.225 * fEye;
  const EYE_FLAT = 0.16;                       // 眼球壓扁到只剩這麼厚
  const eyeHalf = EYE_R * EYE_FLAT;
  for (const side of [-1, 1]) {
    const ex = side * R * fGap;
    // 凸 0.02R:看得出是一顆球,又不至於頂出臉的側影
    gs.push(tint(at(new THREE.SphereGeometry(EYE_R, 10, 7),
      ex, cy - R * 0.10, faceZ(-0.10, R * 0.02 - eyeHalf), 1, 1.12, EYE_FLAT), INK));
    // 眼裡那一點光要跟著眼睛一起大小 —— 只放大虹膜的話,
    // 「睜大眼睛」在幾何上量不出差別(測試就是這樣抓到的:怕與平的眼白一樣高)
    gs.push(tint(at(new THREE.SphereGeometry(R * 0.095 * fEye, 6, 5),
      ex - side * R * 0.06, cy + R * 0.02, faceZ(-0.10, R * 0.035), 1, 1, 0.26),
      new THREE.Color('#f2f0ea')));
    // 眉 —— 外高內低斜著一撇。<b>切成三小段</b>,一段一段貼上去
    gs.push(tint(faceStrip({
      x: ex + side * R * 0.02, y: cy + R * (oldHair ? fBrow + 0.03 : fBrow), py: 0.22,
      w: R * (oldHair ? 0.36 : 0.30), h: R * 0.052, d: R * 0.042,
      tilt: side * (-0.22 + m.browTilt), R,
    }), oldHair ? new THREE.Color('#8e867c') : BROW));
    /*
     * 耳。膚色不是深一號的灰 —— 深色的一小塊掛在頭側,讀作一顆疣。
     * 而且要<b>貼著頭</b>:第一版擺在 0.97R、又往外撐,整隻耳朵浮在頭外面。
     */
    gs.push(tint(at(new THREE.SphereGeometry(R * 0.155, 6, 5),
      side * R * 0.90, cy - R * 0.05, R * 0.03, 0.34, 1.05, 0.80), skin));
    gs.push(tint(at(new THREE.SphereGeometry(R * 0.06, 5, 4),
      side * R * 0.95, cy - R * 0.05, R * 0.03, 0.30, 0.90, 0.55), SKIN_D));
  }

  /*
   * 鼻 —— 一個往前戳的三稜錐,不是一塊貼在臉上的板。
   *
   * 第一版是薄板,而且埋進了臉裡:正面看是一條深色的直槓,像用筆畫上去的。
   * 鼻子是整張臉上<b>唯一凸出來</b>的東西,它一平,臉就是一張紙。
   */
  /*
   * 轉的<b>方向</b>要對:繞 X 轉 +θ 是把 +Y 扳向 +Z(往腦後),不是往前。
   * 第一版寫成 +0.42π,整個錐體戳進了顱骨裡,露在臉外的是它的底 ——
   * 正面看只剩一小片淡色的三角,還以為是「鼻子太小」。
   * -0.56π 才是尖端朝前、略朝下,也就是一個鼻子該有的樣子。
   *
   * 一整塊膚色就夠 —— 三稜錐自己的三個面朝向不同,光一打上去
   * 明暗自然分開。第一版還在鼻子兩側加了「鼻翼」的小球,結果那兩顆球
   * 迎光比臉還亮,正面看是一個<b>豬鼻子</b>。這副臉的立體感要靠形狀給,
   * 不能靠往上貼深色的小零件。
   */
  gs.push(tint(at(rot(new THREE.ConeGeometry(R * 0.115, R * 0.38, 3), -Math.PI * 0.56, 0, 0),
    0, cy - R * 0.12, faceZ(-0.12, -R * 0.045)), skin));
  // 口 —— 一道短橫,細而不豔。不畫笑也不畫哭,留白比表情耐看
  gs.push(tint(faceStrip({
    x: 0, y: cy - R * 0.46, py: -0.46,
    w: R * fMouth, h: R * 0.042, d: R * 0.045, tilt: 0, R,
    curve: R * m.mouthCurve,
  }), LIP));

  /*
   * 髮 —— 用<b>頭本身的輪廓</b>放大一點,不是另拿一顆球蓋上去。
   *
   * 第一版是一顆球截了上半當帽蓋。球和顱骨是兩種形狀、段數也不同,
   * 兩張面在髮線附近互相穿插 —— 畫面上是一條<b>鋸齒狀的爛邊</b>,
   * 遠看像貼圖破了。同一條輪廓線放大 5%,兩張面處處平行、永不相交,
   * 髮線就是一個乾淨的圈。
   *
   * 髮線退到額頭上方,露出額角,人才有臉。
   */
  const HAIRLINE = 0.30;                    // 輪廓座標:0 是眉心高度,1 是頭頂
  gs.push(tint(at(lathe(profileAbove(HEAD_P, HAIRLINE), R * 1.05, R * 1.05, 16),
    0, cy, 0, 1, 1, FACE_SQUASH), HAIR_C));
  for (const side of [-1, 1]) {
    /*
     * 鬢角在<b>鬢</b>上,不在臉頰上。
     *
     * 第一版擺在 cy+0.02R、也就是眼睛那一層,還往前壓到 z=+0.06 ——
     * 於是四分之三角度上,一團深色貼在顴骨旁邊,讀作臉上長了塊東西。
     * 挪到太陽穴的高度、再往後靠,它才是「耳朵前面那一綹」。
     */
    gs.push(tint(at(new THREE.SphereGeometry(R * 0.22, 7, 6),
      side * R * 0.84, cy + R * 0.24, R * 0.20, 0.50, 1.15, 0.90), HAIR_C));
  }
  // 髻與束髮的帶子
  gs.push(tint(at(new THREE.SphereGeometry(R * 0.29, 8, 6),
    0, cy + R * 1.14, R * 0.26), HAIR_C));
  gs.push(tint(at(new THREE.TorusGeometry(R * 0.24, R * 0.045, 5, 10).rotateX(Math.PI * 0.42),
    0, cy + R * 0.90, R * 0.22), oldHair ? new THREE.Color('#8b8378') : TRIM));

  /*
   * 幘 —— 庶民把髮包起來的那塊布。
   *
   * 和露髻的挑著用,一個村子才不會人人一個模子。做法是沿著髮面再放大一點
   * 鋪一層(同一條輪廓線,所以還是處處平行),額前收一道折邊。
   */
  if (cloth) {
    /*
     * 幘的顏色要<b>比頭髮淺、比皮膚深</b>,而且不能發亮。
     * 第一版 #6d6a62 在暗處讀成一頂銀灰的盔 —— 一群裹幘的賊看起來像戴著鋼盔。
     */
    const CLOTH_C = oldHair ? new THREE.Color('#8b857a') : new THREE.Color('#4a453d');
    gs.push(tint(at(lathe(profileAbove(HEAD_P, HAIRLINE + 0.06), R * 1.075, R * 1.075, 16),
      0, cy, 0, 1, 1, FACE_SQUASH), CLOTH_C));
    // 額前那道折 —— 沒有它就只是一頂泳帽
    gs.push(tint(faceStrip({
      x: 0, y: cy + R * (HAIRLINE + 0.10), py: HAIRLINE + 0.10,
      w: R * 1.05, h: R * 0.095, d: R * 0.07, tilt: 0, R: R * 1.075,
    }), CLOTH_C.clone().multiplyScalar(0.78)));
  }

  /*
   * 鬍子。上了年紀的、或是幾個壯年,臉下半就不再是一片空白 ——
   * 這副臉本來只有眉眼,下巴那一塊是最大的一片留白。
   */
  if (beard) {
    const BEARD_C = oldHair ? new THREE.Color('#b9b2a6') : new THREE.Color('#33292c');
    // 頷下一撮
    gs.push(tint(at(new THREE.SphereGeometry(R * 0.30, 8, 6),
      0, cy - R * 0.74, faceZ(-0.74, -R * 0.06), 0.85, 0.95, 0.75), BEARD_C));
    // 髭 —— 鼻下兩撇
    for (const side of [-1, 1]) {
      gs.push(tint(at(rot(slab(R * 0.16, R * 0.05, R * 0.05), 0, 0, side * 0.30),
        side * R * 0.10, cy - R * 0.36, faceZ(-0.36, -R * 0.004)), BEARD_C));
    }
  }

  if (hat) {
    // 斗笠 —— 加一圈笠緣,錐面才不像一個紙帽子
    gs.push(tint(at(new THREE.ConeGeometry(R * 1.70, R * 0.62, 12),
      0, cy + R * 0.86, 0), TRIM));
    gs.push(tint(at(new THREE.TorusGeometry(R * 1.66, R * 0.055, 5, 14).rotateX(Math.PI / 2),
      0, cy + R * 0.57, 0), TRIM.clone().multiplyScalar(0.7)));
  }
  return mergeGeometries(gs, false)!;
}


/**
 * 做工的姿勢。
 *
 * 在這之前,村民走到田裡就<b>站住不動</b> —— 巳時到午時、未時到酉時,
 * 大半個白天全村人釘在田埂上,和發呆一模一樣。人會走會擺手以後,
 * 這一段空白就特別顯眼:世界看起來仍然是個佈景,只是佈景裡的人會走路。
 *
 * 姿勢只有三件事可調:身子前傾多少、上下起伏多少、兩條手臂各擺到哪。
 * 沒有骨架,但這三樣已經夠讀 —— 彎腰揮鋤和挺著站是兩個完全不同的剪影。
 */
export interface WorkPose {
  lean: number;
  bob: number;
  /** 左右手臂繞肩的角度(正 = 往前)。做工時兩手多半同進同出。 */
  armL: number;
  armR: number;
}

export function workPose(job: string, t: number, phase: number): WorkPose {
  switch (job) {
    case 'farm': {
      /*
       * 鋤地:抬起來、劈下去,一個週期。抬的時候身子直、手往後;
       * 落的時候腰彎下去、手掃到前下方。
       * 落得比抬得快 —— 用 k² 把時間偏向前半段,那一下才有力氣。
       */
      const raw = (Math.sin(t * 2.3 + phase) + 1) / 2;
      const k = raw * raw;
      // 手臂最多擺到 +0.6:再往前,兩隻廣袖就橫著張開像翅膀,
      // 讀作「伸手去夠」而不是「往下鋤」
      return { lean: 0.10 + k * 0.70, bob: -k * 0.045, armL: -0.85 + k * 1.45,
               armR: -0.85 + k * 1.45 };
    }
    case 'dock': {
      // 扛包:一肩扛著,身子往反側偏一點配重,腳下慢慢挪
      const s = Math.sin(t * 1.1 + phase);
      return { lean: 0.26, bob: Math.abs(s) * 0.03,
               armL: -1.15 + s * 0.10, armR: -0.35 };
    }
    case 'wood': {
      // 砍柴:掄圓了往下劈,幅度比鋤地大
      const raw = (Math.sin(t * 1.9 + phase) + 1) / 2;
      const k = raw * raw;
      return { lean: 0.06 + k * 0.50, bob: -k * 0.06, armL: -1.4 + k * 2.2,
               armR: -1.4 + k * 2.2 };
    }
    default: {
      // 市面上的:站著招呼人,偶爾比劃一下
      const s = Math.sin(t * 0.9 + phase);
      const g = Math.max(0, Math.sin(t * 0.37 + phase * 2.1));
      return { lean: 0.04, bob: s * 0.012, armL: -0.10 - g * 0.55, armR: -0.05 };
    }
  }
}

/**
 * 手勢 —— 說話時手在幹什麼。
 *
 * 在這之前,兩個人「在說話」的樣子是<b>站著點頭</b>:身體不動、手垂著,
 * 只有頭上下晃。那個畫面讀起來不像交談,像兩個人各自在打瞌睡。
 *
 * 漢代人見面拱手。這一下的好處是它<b>認得出來</b> ——
 * 兩隻手臂同時抬到胸前,剪影就變了,遠遠一看就知道那邊在打招呼。
 * 拱完手放下,說話時偶爾比劃一下,然後再拱一次。
 *
 * 回傳的是 WorkPose,和做工共用同一組旋鈕(前傾、起伏、兩臂)——
 * 渲染端不必分辨「這人在做工還是在說話」,拿到什麼擺什麼。
 */
export function gesturePose(t: number, phase: number): WorkPose {
  // 一輪 7 秒:拱手 → 放下 → 比劃 → 停
  const cyc = ((t * 0.143 + phase * 0.31) % 1 + 1) % 1;
  if (cyc < 0.22) {
    // 拱手:兩手抬到胸前,身子略躬。進出各佔前後兩成,中間是持禮
    const k = Math.sin(Math.min(1, cyc / 0.22) * Math.PI);
    const e = Math.min(1, k * 2.2);
    return { lean: 0.10 + e * 0.16, bob: -e * 0.02,
             armL: -0.10 + e * 1.25, armR: -0.10 + e * 1.25 };
  }
  if (cyc < 0.55) {
    // 比劃:單手抬起來甩兩下,另一手垂著
    const w = Math.sin((cyc - 0.22) * 26) * 0.5 + 0.5;
    return { lean: 0.05, bob: 0, armL: -0.08 - w * 0.75, armR: -0.04 };
  }
  // 聽著 —— 手垂著,身子微晃。留白也是動作的一部分
  return { lean: 0.03, bob: Math.sin(t * 1.1 + phase) * 0.010, armL: -0.05, armR: -0.05 };
}

/**
 * 手上的傢伙 —— 原點在<b>肩</b>,和手臂同一個座標系。
 *
 * 這樣一來它<b>和手臂共用同一個矩陣</b>:手臂擺到哪,鋤頭就跟到哪,
 * 不必另算一份跟隨。空手揮舞和握著鋤頭往下刨,是「在比劃」和「在幹活」的差別。
 *
 * 回 null = 這個行當手上沒東西(市面上的、上了年紀的)。
 */
export function toolGeom(job: string): THREE.BufferGeometry | null {
  const WOOD = new THREE.Color('#6b4a2c');
  const IRON = new THREE.Color('#7d7a72');
  const [hx, hy, hz] = FIG_HAND;
  const gs: THREE.BufferGeometry[] = [];
  if (job === 'farm') {
    // 鋤:一根桿,末端一片橫刃
    gs.push(tint(at(rot(new THREE.CylinderGeometry(FIG_HR * 0.035, FIG_HR * 0.035,
      FIG_BODY_H * 0.95, 5), -0.5, 0, 0),
      hx, hy - FIG_BODY_H * 0.16, hz - FIG_BODY_H * 0.30), WOOD));
    gs.push(tint(at(rot(slab(FIG_HR * 0.34, FIG_HR * 0.06, FIG_HR * 0.22), 0.5, 0, 0),
      hx, hy - FIG_BODY_H * 0.55, hz - FIG_BODY_H * 0.72), IRON));
  } else if (job === 'dock') {
    // 扁擔:橫在肩上的一根,兩頭各吊一件
    gs.push(tint(at(rot(new THREE.CylinderGeometry(FIG_HR * 0.045, FIG_HR * 0.045,
      FIG_BODY_H * 1.5, 5), 0, 0, Math.PI / 2),
      hx * 0.2, hy + FIG_BODY_H * 0.62, hz + FIG_HR * 0.1), WOOD));
    for (const e of [-1, 1]) {
      gs.push(tint(at(new THREE.BoxGeometry(FIG_HR * 0.34, FIG_HR * 0.30, FIG_HR * 0.30),
        hx * 0.2 + e * FIG_BODY_H * 0.62, hy + FIG_BODY_H * 0.34, hz + FIG_HR * 0.1),
        new THREE.Color('#8a7550')));
    }
  } else if (job === 'wood') {
    gs.push(tint(at(rot(new THREE.CylinderGeometry(FIG_HR * 0.04, FIG_HR * 0.04,
      FIG_BODY_H * 0.8, 5), -0.5, 0, 0),
      hx, hy - FIG_BODY_H * 0.14, hz - FIG_BODY_H * 0.26), WOOD));
    gs.push(tint(at(rot(slab(FIG_HR * 0.10, FIG_HR * 0.30, FIG_HR * 0.26), 0.5, 0, 0),
      hx, hy - FIG_BODY_H * 0.46, hz - FIG_BODY_H * 0.60), IRON));
  /*
   * 下面三樣不是「傢伙」,是<b>隨身帶的東西</b>。
   *
   * 分出來是因為手上有沒有東西,是這批人像不像「有日子在過」的分水嶺:
   * 沒有活幹的那幾種變體(市面上的、上了年紀的)從前手上空空,
   * 一整片人走來走去而沒有一個人拎著什麼 —— 那讀作路人甲,不是村民。
   */
  } else if (job === 'basket') {
    // 提籃:垂在身側,走路會晃(晃是手臂給的,它掛在同一個矩陣上)
    gs.push(tint(at(new THREE.CylinderGeometry(FIG_HR * 0.30, FIG_HR * 0.24,
      FIG_HR * 0.34, 7, 1, true),
      hx, hy - FIG_BODY_H * 0.30, hz), new THREE.Color('#9c8149')));
    gs.push(tint(at(rot(new THREE.TorusGeometry(FIG_HR * 0.26, FIG_HR * 0.022, 4, 8,
      Math.PI), 0, 0, 0), hx, hy - FIG_BODY_H * 0.14, hz), new THREE.Color('#7d6636')));
  } else if (job === 'jar') {
    // 水甕:扛在肩上,一手扶著
    gs.push(tint(at(new THREE.SphereGeometry(FIG_HR * 0.32, 8, 6),
      hx * 0.3, hy + FIG_HR * 0.46, hz - FIG_HR * 0.10, 1, 1.15, 1),
      new THREE.Color('#6d5a4c')));
    gs.push(tint(at(new THREE.CylinderGeometry(FIG_HR * 0.13, FIG_HR * 0.17, FIG_HR * 0.16, 7),
      hx * 0.3, hy + FIG_HR * 0.82, hz - FIG_HR * 0.10), new THREE.Color('#5e4d41')));
  } else if (job === 'firewood') {
    // 柴捆:背在背上,一捆橫著三根
    for (let i = 0; i < 3; i++) {
      gs.push(tint(at(rot(new THREE.CylinderGeometry(FIG_HR * 0.06, FIG_HR * 0.05,
        FIG_HR * 1.15, 4), 0, 0, Math.PI / 2 + (i - 1) * 0.10),
        -hx * 0.4, hy - FIG_HR * (0.10 + i * 0.22), hz - FIG_HR * 0.62), WOOD));
    }
    gs.push(tint(at(rot(new THREE.TorusGeometry(FIG_HR * 0.28, FIG_HR * 0.02, 4, 8), 0, Math.PI / 2, 0),
      -hx * 0.4, hy - FIG_HR * 0.32, hz - FIG_HR * 0.62), new THREE.Color('#4e4436')));
  } else {
    return null;
  }
  return mergeGeometries(gs, false)!;
}
