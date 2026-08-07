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
const HAIR = new THREE.Color('#241e26');
const INK = new THREE.Color('#161018');
const TRIM = new THREE.Color('#b8863c');

const HEAD_P: Array<[number, number]> = [
  [0.00, -1.00], [0.30, -0.94], [0.56, -0.80], [0.78, -0.58], [0.92, -0.30],
  [1.00, 0.02], [1.00, 0.34], [0.93, 0.62], [0.72, 0.84], [0.40, 0.96], [0.00, 1.00],
];
const BODY_P: Array<[number, number]> = [
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

export function bodyGeom(robe: THREE.Color) {
  const gs: THREE.BufferGeometry[] = [];
  // 下擺從胯起算 —— 側影不變,只是短了一截,底下那一截交給腿
  gs.push(tint(at(lathe(BODY_P, FIG_HR * 1.02, FIG_BODY_H - FIG_LEG_H, 14),
    0, FIG_LEG_H, 0), robe));
  gs.push(tint(at(new THREE.TorusGeometry(FIG_HR * 0.72, FIG_HR * 0.075, 5, 12)
    .rotateX(Math.PI / 2), 0, FIG_BODY_H * 0.55, 0, 1, 1, 1), TRIM));
  for (const side of [-1, 1]) {
    gs.push(tint(at(lathe(SLEEVE_P, FIG_HR, FIG_BODY_H * 0.54, 8),
      side * FIG_HR * 0.80, FIG_BODY_H * 0.34, 0), robe));
    gs.push(tint(at(new THREE.SphereGeometry(FIG_HR * 0.15, 7, 5),
      side * FIG_HR * 0.92, FIG_BODY_H * 0.32, -FIG_HR * 0.12), SKIN));
  }
  gs.push(tint(at(new THREE.CylinderGeometry(FIG_HR * 0.32, FIG_HR * 0.32, FIG_HR * 0.40, 8),
    0, FIG_BODY_H * 0.99, 0), SKIN));
  return mergeGeometries(gs, false)!;
}

export function headGeom(hat: boolean, oldHair = false) {
  const gs: THREE.BufferGeometry[] = [];
  const HAIR_C = oldHair ? new THREE.Color('#d6d0c4') : HAIR;
  const cy = FIG_HR * 0.84;
  gs.push(tint(at(lathe(HEAD_P, FIG_HR, FIG_HR, 16), 0, cy, 0, 1, 1, 0.94), SKIN));
  for (const side of [-1, 1]) {
    const ex = side * FIG_HR * 0.43;
    gs.push(tint(at(new THREE.SphereGeometry(FIG_HR * 0.28, 10, 7),
      ex, cy - FIG_HR * 0.10, -FIG_HR * 0.99, 1, 1.10, 0.22), INK));
    gs.push(tint(at(new THREE.SphereGeometry(FIG_HR * 0.11, 6, 5),
      ex - FIG_HR * 0.07, cy + FIG_HR * 0.01, -FIG_HR * 1.06, 1, 1, 0.3),
      new THREE.Color('#f2f0ea')));
  }
  gs.push(tint(at(new THREE.SphereGeometry(FIG_HR * 1.13, 12, 8),
    0, cy + FIG_HR * 0.30, -FIG_HR * 0.06, 1, 1, 0.42), HAIR_C));
  gs.push(tint(at(new THREE.SphereGeometry(FIG_HR * 0.30, 8, 6),
    0, cy + FIG_HR * 1.16, FIG_HR * 0.30), HAIR_C));
  if (hat) {
    gs.push(tint(at(new THREE.ConeGeometry(FIG_HR * 1.70, FIG_HR * 0.62, 10),
      0, cy + FIG_HR * 0.86, 0), TRIM));
  }
  return mergeGeometries(gs, false)!;
}

