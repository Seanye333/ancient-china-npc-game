import { terrainHeight, slopeAt, valleyMask, riverMask, rng } from './field';

/**
 * 選址 — 房、田、埠、橋的座標,由同一顆種子算出來。
 *
 * 抽出來是因為<b>建築與 NPC 必須看到同一份地址簿</b>:
 * 各自生成的話,人會走向不存在的家。
 */

export const meanderAt = (z: number) =>
  Math.sin(z * 0.02) * 9 + Math.sin(z * 0.047) * 3.5;

export interface HouseSite {
  x: number; z: number; y: number;
  bays: number; depth: number; floors: number; yaw: number;
  side: number;
  /** 門前一步的位置 — NPC 進出走這裡,不會穿牆。 */
  door: [number, number];
}

const MIN_GAP = 11.5;

export function houseSites(): HouseSite[] {
  const rand = rng(20260802);
  const out: HouseSite[] = [];
  let guard = 0;
  while (out.length < 46 && guard < 9000) {
    guard++;
    const z = (rand() - 0.5) * 300;
    const side = rand() < 0.5 ? -1 : 1;
    const off = 12 + rand() * 24;
    const x = meanderAt(z) + side * off;
    if (valleyMask(x, z) < 0.30) continue;
    if (riverMask(x, z) > 0.30) continue;
    if (slopeAt(x, z) > 0.20) continue;
    if (out.some((h) => Math.hypot(h.x - x, h.z - z) < MIN_GAP)) continue;

    const bays = 2 + Math.floor(rand() * 3);
    const depth = 4.2 + rand() * 2.4;
    const floors = rand() < 0.28 ? 2 : 1;
    const yaw = (side < 0 ? -Math.PI / 2 : Math.PI / 2) + (rand() - 0.5) * 0.34;
    // 門開在臨街那面(朝河),往外退兩步當集合點
    const dx = -Math.sin(yaw) * (depth / 2 + 2.0);
    const dz = -Math.cos(yaw) * (depth / 2 + 2.0);
    out.push({
      x, z, y: terrainHeight(x, z) - 0.15,
      bays, depth, floors, yaw, side,
      door: [x + dx, z + dz],
    });
  }
  return out;
}

export interface FieldSite { x: number; z: number; }

export function fieldSites(): FieldSite[] {
  const rand = rng(555);
  const out: FieldSite[] = [];
  let guard = 0;
  while (out.length < 130 && guard < 6000) {
    guard++;
    const z = (rand() - 0.5) * 330;
    const side = rand() < 0.5 ? -1 : 1;
    const off = 30 + rand() * 46;
    const x = meanderAt(z) + side * off;
    const h = terrainHeight(x, z);
    if (h < 0.4 || h > 15) continue;
    if (slopeAt(x, z) > 0.30) continue;
    if (valleyMask(x, z) < 0.10) continue;
    if (riverMask(x, z) > 0.35) continue;
    // 這裡只取位置,尺寸留給 Landuse 自己抽 — 但抽的次數要對得上
    rand(); rand(); rand();
    out.push({ x, z });
  }
  return out;
}

export const DOCKS: Array<[number, number]> = [[-46, 0], [78, 0]].map(
  ([z]) => [meanderAt(z) + 5.2, z],
);

export const BRIDGE = { z: 6, x: meanderAt(6), y: terrainHeight(meanderAt(6), 6) + 2.51 };

/** 市集 — 村心那塊空地,白天的聚集點。 */
export const MARKET: [number, number] = [meanderAt(18) + 19, 18];
