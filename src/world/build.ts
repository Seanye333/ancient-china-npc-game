import * as THREE from 'three';

/**
 * 木構模組的共用件 — 幾何堆疊、材質分桶、屋頂。
 *
 * 分桶是這裡的關鍵:所有零件按材質丟進五個桶,最後每桶合成一個
 * BufferGeometry。一座村莊上萬個零件,合完只剩五次 draw call。
 */

export type Bucket = 'stone' | 'mud' | 'wood' | 'tile' | 'paper';
export type Parts = Record<Bucket, THREE.BufferGeometry[]>;

export const emptyParts = (): Parts =>
  ({ stone: [], mud: [], wood: [], tile: [], paper: [] });

export const MATERIALS: Record<Bucket, THREE.MeshStandardMaterialParameters> = {
  stone: { color: '#8d8577', roughness: 0.95 },
  mud: { color: '#9c8b6e', roughness: 0.96 },
  wood: { color: '#5d2a1e', roughness: 0.82 },
  tile: { color: '#3a4249', roughness: 0.72 },
  paper: { color: '#d9c79a', roughness: 0.85 },
};

function place(g: THREE.BufferGeometry, px: number, py: number, pz: number,
               rx: number, ry: number, rz: number) {
  g.applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3(px, py, pz),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(1, 1, 1),
  ));
  return g;
}

export function pushBox(
  parts: Parts, b: Bucket,
  sx: number, sy: number, sz: number,
  px: number, py: number, pz: number,
  rx = 0, ry = 0, rz = 0,
) {
  parts[b].push(place(new THREE.BoxGeometry(sx, sy, sz), px, py, pz, rx, ry, rz));
}

export function pushCyl(
  parts: Parts, b: Bucket,
  r1: number, r2: number, h: number, seg: number,
  px: number, py: number, pz: number,
  rx = 0, ry = 0, rz = 0,
) {
  parts[b].push(place(new THREE.CylinderGeometry(r1, r2, h, seg), px, py, pz, rx, ry, rz));
}

/** 局部座標 → 世界座標的旋轉輔助。建築整體繞 y 轉,零件得跟著轉。 */
export function frame(cx: number, cz: number, yaw: number) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return {
    X: (lx: number, lz: number) => cx + lx * c - lz * s,
    Z: (lx: number, lz: number) => cz + lx * s + lz * c,
  };
}

/** 兩坡頂 — 瓦壟、正脊、博風板、簷口。中式屋頂的辨識度全在這裡。 */
export function roof(
  parts: Parts, cx: number, cz: number, yaw: number,
  w: number, depth: number, topY: number,
  eave = 0.55, pitch = 0.5, tileBucket: Bucket = 'tile',
) {
  const { X, Z } = frame(cx, cz, yaw);
  const halfD = depth / 2 + eave;
  const ridgeY = topY + halfD * pitch;
  const slopeLen = Math.hypot(halfD, ridgeY - topY);
  const ang = Math.atan2(ridgeY - topY, halfD);

  for (const side of [-1, 1]) {
    const lz = (side * halfD) / 2;
    pushBox(parts, tileBucket, w + eave * 2, 0.14, slopeLen,
      X(0, lz), (topY + ridgeY) / 2, Z(0, lz), side * ang, yaw, 0);
    const n = Math.max(5, Math.round(w / 0.42));
    for (let i = 0; i < n; i++) {
      const gx = -(w + eave * 1.7) / 2 + ((w + eave * 1.7) * (i + 0.5)) / n;
      pushCyl(parts, tileBucket, 0.075, 0.075, slopeLen * 0.97, 5,
        X(gx, lz), (topY + ridgeY) / 2 + 0.09, Z(gx, lz),
        Math.PI / 2 + side * ang, yaw, 0);
    }
  }
  pushBox(parts, 'wood', w + eave * 2.1, 0.22, 0.24, X(0, 0), ridgeY + 0.10, Z(0, 0), 0, yaw, 0);
  for (const ex of [-1, 1]) {
    pushBox(parts, 'wood', 0.17, 0.26, depth + eave * 2,
      X(ex * (w / 2 + eave * 0.9), 0), (topY + ridgeY) / 2 + 0.08,
      Z(ex * (w / 2 + eave * 0.9), 0), 0, yaw, 0);
  }
  pushBox(parts, 'wood', w + eave * 2.2, 0.13, depth + eave * 2.2,
    X(0, 0), topY - 0.05, Z(0, 0), 0, yaw, 0);
  return ridgeY;
}

/** 一棟臨街鋪面。 */
export function house(
  parts: Parts, cx: number, cz: number, ground: number,
  bays: number, depth: number, floors: number, yaw: number,
  rand: () => number,
) {
  const bay = 2.05;
  const w = bays * bay;
  const fh = 2.5;
  const baseH = 0.42;
  const { X, Z } = frame(cx, cz, yaw);

  pushBox(parts, 'stone', w + 1.1, baseH, depth + 1.1, cx, ground + baseH / 2, cz, 0, yaw, 0);

  for (let fl = 0; fl < floors; fl++) {
    const y0 = ground + baseH + fl * fh;
    for (let i = 0; i <= bays; i++) {
      const lx = -w / 2 + i * bay;
      pushCyl(parts, 'wood', 0.13, 0.15, fh, 6,
        X(lx, -depth / 2), y0 + fh / 2, Z(lx, -depth / 2), 0, yaw, 0);
    }
    pushBox(parts, 'mud', w, fh, 0.24, X(0, depth / 2), y0 + fh / 2, Z(0, depth / 2), 0, yaw, 0);
    for (const sx of [-1, 1]) {
      pushBox(parts, 'mud', 0.24, fh, depth,
        X((sx * w) / 2, 0), y0 + fh / 2, Z((sx * w) / 2, 0), 0, yaw, 0);
    }
    const doorBay = Math.floor(rand() * bays);
    for (let i = 0; i < bays; i++) {
      const lx = -w / 2 + (i + 0.5) * bay;
      const lz = -depth / 2 - 0.05;
      if (fl === 0 && i === doorBay) {
        pushBox(parts, 'wood', bay * 0.70, fh * 0.82, 0.13,
          X(lx, lz), y0 + fh * 0.41, Z(lx, lz), 0, yaw, 0);
      } else {
        pushBox(parts, 'paper', bay * 0.72, fh * 0.44, 0.10,
          X(lx, lz), y0 + fh * 0.60, Z(lx, lz), 0, yaw, 0);
        for (let gi = 0; gi < 4; gi++) {
          const gx = lx - bay * 0.27 + gi * bay * 0.18;
          pushBox(parts, 'wood', 0.06, fh * 0.44, 0.07,
            X(gx, lz - 0.04), y0 + fh * 0.60, Z(gx, lz - 0.04), 0, yaw, 0);
        }
        pushBox(parts, 'wood', bay * 0.76, 0.12, 0.14,
          X(lx, lz), y0 + fh * 0.36, Z(lx, lz), 0, yaw, 0);
      }
    }
    pushBox(parts, 'wood', w + 0.3, 0.24, 0.22,
      X(0, -depth / 2), y0 + fh - 0.14, Z(0, -depth / 2), 0, yaw, 0);
  }
  roof(parts, cx, cz, yaw, w, depth, ground + baseH + floors * fh);
}
