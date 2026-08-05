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

export function bodyGeom(robe: THREE.Color) {
  const gs: THREE.BufferGeometry[] = [];
  gs.push(tint(lathe(BODY_P, FIG_HR * 1.02, FIG_BODY_H, 14), robe));
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

export function headGeom(hat: boolean) {
  const gs: THREE.BufferGeometry[] = [];
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
    0, cy + FIG_HR * 0.30, -FIG_HR * 0.06, 1, 1, 0.42), HAIR));
  gs.push(tint(at(new THREE.SphereGeometry(FIG_HR * 0.30, 8, 6),
    0, cy + FIG_HR * 1.16, FIG_HR * 0.30), HAIR));
  if (hat) {
    gs.push(tint(at(new THREE.ConeGeometry(FIG_HR * 1.70, FIG_HR * 0.62, 10),
      0, cy + FIG_HR * 0.86, 0), TRIM));
  }
  return mergeGeometries(gs, false)!;
}

