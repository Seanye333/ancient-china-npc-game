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
const SKIN_D = new THREE.Color('#cf9878');       // 鼻樑側面、耳廓的陰面
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

export function bodyGeom(robe: THREE.Color) {
  const gs: THREE.BufferGeometry[] = [];
  // 衣緣比袍身深一號 —— 用同一個色壓暗,四種袍色各自配得上,不必再挑四個緣色
  const edge = robe.clone().multiplyScalar(0.62);

  // 下擺從胯起算 —— 側影不變,只是短了一截,底下那一截交給腿
  gs.push(tint(at(lathe(BODY_P, FIG_HR * 1.02, ROBE_SPAN, 14), 0, FIG_LEG_H, 0), robe));

  /*
   * 交領右衽 —— 一個字都不必寫的「這是漢代人」。
   *
   * 兩片衣襟從肩口斜下來交在胸前,右襟在內、左襟壓在外(右衽)。
   * 這是整副身子上<b>最便宜也最管用</b>的一筆:在這之前袍子是一個光溜溜的
   * 錐體,加了這個 V 才有「衣服」而不是「套子」。
   */
  const yTop = FIG_LEG_H + ROBE_SPAN * 0.86;      // 肩口
  const yCross = FIG_LEG_H + ROBE_SPAN * 0.50;    // 交在腰上一點
  for (const side of [-1, 1]) {
    const yMid = (yTop + yCross) / 2;
    const r = robeR(yMid);
    const dx = side * FIG_HR * 0.34;
    // 外襟(左)比內襟(右)略寬略前 —— 壓著的那一片才看得出是壓著
    const outer = side < 0;
    gs.push(tint(at(
      rot(slab(FIG_HR * (outer ? 0.46 : 0.40), (yTop - yCross) * 1.06, FIG_HR * 0.07),
        0, 0, side * 0.62),
      dx * 0.55, yMid, -r * (outer ? 0.92 : 0.86)), edge));
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

  for (const side of [-1, 1]) {
    gs.push(tint(at(lathe(SLEEVE_P, FIG_HR, FIG_BODY_H * 0.54, 8),
      side * FIG_HR * 0.80, FIG_BODY_H * 0.34, 0), robe));
    // 袖緣 —— 廣袖的口上一道深邊,手才不像從管子裡伸出來
    gs.push(tint(at(new THREE.TorusGeometry(FIG_HR * 0.47, FIG_HR * 0.05, 5, 10)
      .rotateX(Math.PI / 2), side * FIG_HR * 0.80, FIG_BODY_H * 0.34 + FIG_HR * 0.03, 0), edge));
    gs.push(tint(at(new THREE.SphereGeometry(FIG_HR * 0.15, 7, 5),
      side * FIG_HR * 0.92, FIG_BODY_H * 0.32, -FIG_HR * 0.12), SKIN));
  }
  gs.push(tint(at(new THREE.CylinderGeometry(FIG_HR * 0.32, FIG_HR * 0.32, FIG_HR * 0.40, 8),
    0, FIG_BODY_H * 0.99, 0), SKIN));
  return mergeGeometries(gs, false)!;
}

/** 臉的正面在 -Z。給一個高度(輪廓座標),回它在臉皮上的 z。 */
export const FACE_SQUASH = 0.94;
function faceZ(py: number, out = 0): number {
  return -(radiusAt(HEAD_P, py) * FIG_HR * FACE_SQUASH + out);
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
export function headGeom(hat: boolean, oldHair = false) {
  const gs: THREE.BufferGeometry[] = [];
  const HAIR_C = oldHair ? new THREE.Color('#d6d0c4') : HAIR;
  const cy = FIG_HR * 0.84;
  const R = FIG_HR;
  gs.push(tint(at(lathe(HEAD_P, R, R, 16), 0, cy, 0, 1, 1, FACE_SQUASH), SKIN));

  // 眼 —— 保持大眼睛(這個世界的人本來就是靠剪影認的),但加上眼上那一筆
  for (const side of [-1, 1]) {
    const ex = side * R * 0.43;
    gs.push(tint(at(new THREE.SphereGeometry(R * 0.28, 10, 7),
      ex, cy - R * 0.10, faceZ(-0.10, R * 0.06), 1, 1.10, 0.22), INK));
    gs.push(tint(at(new THREE.SphereGeometry(R * 0.11, 6, 5),
      ex - R * 0.07, cy + R * 0.01, faceZ(-0.10, R * 0.13), 1, 1, 0.3),
      new THREE.Color('#f2f0ea')));
    // 眉 —— 外高內低斜著一撇。老人的眉淡而長
    gs.push(tint(at(
      rot(slab(R * (oldHair ? 0.40 : 0.34), R * 0.075, R * 0.06), 0, 0, side * -0.20),
      ex + side * R * 0.02, cy + R * (oldHair ? 0.26 : 0.23), faceZ(0.24, R * 0.02)),
      oldHair ? new THREE.Color('#8e867c') : BROW));
    // 耳 —— 側面剪影上少了它就是一顆球
    gs.push(tint(at(new THREE.SphereGeometry(R * 0.17, 6, 5),
      side * R * 0.97, cy - R * 0.06, R * 0.04, 0.42, 1, 0.72), SKIN_D));
  }

  // 鼻 —— 一小塊斜著的楔子。它撐起整張臉的立體感,只花六個三角形
  gs.push(tint(at(rot(slab(R * 0.13, R * 0.30, R * 0.14), 0.34, 0, 0),
    0, cy - R * 0.13, faceZ(-0.13, R * 0.02)), SKIN_D));
  // 口 —— 一道短橫。不畫笑也不畫哭,留白比表情耐看
  gs.push(tint(at(slab(R * 0.24, R * 0.055, R * 0.05),
    0, cy - R * 0.45, faceZ(-0.45, R * 0.01)), LIP));

  /*
   * 髮。
   *
   * 舊版是一顆壓扁成 0.42 的球蓋在頭上,從四分之三角度看是一塊<b>帶硬邊的黑板</b>。
   * 改成三件:一頂沿著顱骨的帽蓋(球,但只取上半)、兩鬢、加頂上的髻與髮帶。
   * 髮線退到額頭上方,露出額角,人才有臉。
   */
  const cap = new THREE.SphereGeometry(R * 1.045, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62);
  gs.push(tint(at(cap, 0, cy + R * 0.04, R * 0.05, 1, 1.06, FACE_SQUASH * 1.02), HAIR_C));
  for (const side of [-1, 1]) {
    // 鬢角 —— 順著臉側垂下來一綹
    gs.push(tint(at(new THREE.SphereGeometry(R * 0.30, 7, 6),
      side * R * 0.80, cy + R * 0.02, R * 0.10, 0.55, 1.25, 0.85), HAIR_C));
  }
  // 髻與束髮的帶子
  gs.push(tint(at(new THREE.SphereGeometry(R * 0.29, 8, 6),
    0, cy + R * 1.14, R * 0.26), HAIR_C));
  gs.push(tint(at(new THREE.TorusGeometry(R * 0.24, R * 0.045, 5, 10).rotateX(Math.PI * 0.42),
    0, cy + R * 0.90, R * 0.22), oldHair ? new THREE.Color('#8b8378') : TRIM));

  if (hat) {
    // 斗笠 —— 加一圈笠緣,錐面才不像一個紙帽子
    gs.push(tint(at(new THREE.ConeGeometry(R * 1.70, R * 0.62, 12),
      0, cy + R * 0.86, 0), TRIM));
    gs.push(tint(at(new THREE.TorusGeometry(R * 1.66, R * 0.055, 5, 14).rotateX(Math.PI / 2),
      0, cy + R * 0.57, 0), TRIM.clone().multiplyScalar(0.7)));
  }
  return mergeGeometries(gs, false)!;
}

