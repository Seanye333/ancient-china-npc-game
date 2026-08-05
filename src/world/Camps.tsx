import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { groundAt, slopeAt, rng } from './field';
import { emptyParts, MATERIALS, pushBox, pushCyl, type Bucket } from './build';
import { useBands } from '../game/bands';

/**
 * 賊窩 — 樹林裡幾個窩棚、一圈木柵、一堆火。
 *
 * 蓋得<b>刻意粗糙</b>:歪斜的柵欄、樹枝搭的棚、地上一圈石頭圍著的火。
 * 村子那邊的房子有台基、有柱、有瓦壟,兩下對比,不必寫一個字
 * 玩家就知道這裡住的是什麼人。
 *
 * 打散之後棚子還在,只是沒人了 —— <b>你做過的事要在地上留著</b>。
 */
export function Camps() {
  const bands = useBands((s) => s.bands);

  const merged = useMemo(() => {
    const parts = emptyParts();
    for (const b of bands) {
      const rand = rng(b.id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
      const g0 = groundAt(b.x, b.z);

      // 火塘 — 一圈石頭。營地的中心先立起來,其餘繞著它擺
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        pushCyl(parts, 'stone', 0.16, 0.2, 0.22, 5,
          b.x + Math.sin(a) * 0.85, g0 + 0.1, b.z + Math.cos(a) * 0.85);
      }
      for (let i = 0; i < 5; i++) {
        pushCyl(parts, 'wood', 0.06, 0.08, 1.0, 4,
          b.x + (rand() - 0.5) * 0.4, g0 + 0.35, b.z + (rand() - 0.5) * 0.4,
          (rand() - 0.5) * 0.9, rand() * 3, (rand() - 0.5) * 0.9);
      }

      // 窩棚 — 兩根叉桿架一道脊,斜披獸皮。人數多就多搭一個
      const huts = 1 + Math.floor(b.count / 3);
      for (let h = 0; h < huts; h++) {
        const a = (h / huts) * Math.PI * 2 + rand();
        const hx = b.x + Math.sin(a) * (3.4 + rand() * 1.4);
        const hz = b.z + Math.cos(a) * (3.4 + rand() * 1.4);
        if (slopeAt(hx, hz) > 0.5) continue;
        const gy = groundAt(hx, hz);
        const yaw = a + Math.PI;
        const len = 2.6 + rand() * 0.8;
        pushCyl(parts, 'wood', 0.07, 0.07, len, 5, hx, gy + 1.05, hz, Math.PI / 2, yaw, 0);
        for (const s of [-1, 1]) {
          const ex = hx + Math.cos(yaw) * (len / 2) * s;
          const ez = hz - Math.sin(yaw) * (len / 2) * s;
          for (const t of [-1, 1]) {
            pushCyl(parts, 'wood', 0.05, 0.07, 1.5, 4,
              ex + Math.sin(yaw) * 0.55 * t, gy + 0.55, ez + Math.cos(yaw) * 0.55 * t,
              t * 0.42, yaw, 0);
          }
          // 披的皮子
          pushBox(parts, 'mud', len * 0.98, 0.06, 1.28, hx, gy + 0.78, hz,
            0, yaw, 0);
        }
      }

      // 歪歪扭扭的木柵 — 只圍朝外那半邊,像臨時起意
      for (let i = 0; i < 11; i++) {
        const a = Math.PI * 0.15 + (i / 10) * Math.PI * 1.1;
        const px = b.x + Math.sin(a) * 6.2;
        const pz = b.z + Math.cos(a) * 6.2;
        if (slopeAt(px, pz) > 0.55) continue;
        pushCyl(parts, 'wood', 0.07, 0.10, 1.5 + rand() * 0.5, 5,
          px, groundAt(px, pz) + 0.66, pz,
          (rand() - 0.5) * 0.26, 0, (rand() - 0.5) * 0.26);
      }
    }

    const out: Array<{ key: Bucket; geom: THREE.BufferGeometry }> = [];
    (Object.keys(parts) as Bucket[]).forEach((k) => {
      if (!parts[k].length) return;
      const g = mergeGeometries(parts[k], false);
      if (g) { g.computeVertexNormals(); out.push({ key: k, geom: g }); }
    });
    return out;
  }, [bands]);

  return (
    <>
      {merged.map(({ key, geom }) => (
        <mesh key={key} geometry={geom} castShadow receiveShadow>
          <meshStandardMaterial {...MATERIALS[key]} />
        </mesh>
      ))}
      <CampSmoke />
    </>
  );
}

/**
 * 炊煙 —— 這是整個遊戲裡唯一的「任務標記」,而它不是 UI。
 *
 * 接了剿匪的活以後總得找得到地方。做法有兩種:在地圖上點一個黃色驚嘆號,
 * 或者<b>讓那個地方本來就看得見</b>。七十步外的林子上頭飄著一道煙,
 * 這件事村裡人人都知道 —— 差事說「西南約七十步」,你抬頭就能對上。
 *
 * 打散了的營地不冒煙。你做過的事在地平線上就看得出來,不必翻任何面板。
 *
 * 一個 InstancedMesh 吃下所有營地的所有煙團:朝向鏡頭靠每幀套上鏡頭的
 * 四元數,不用 Billboard 元件 —— 那會讓每一團煙各自變成一個節點。
 */
const PUFFS = 7;

function CampSmoke() {
  const bands = useBands((s) => s.bands);
  const live = useMemo(() => bands.filter((b) => !b.routed), [bands]);
  const mesh = useRef<THREE.InstancedMesh>(null);

  // 一團軟邊的圓斑。沒有它,煙就是一疊硬邊的方片
  const alphaMap = useMemo(() => {
    const s = 64;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, '#fff');
    grad.addColorStop(0.45, 'rgba(255,255,255,.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.NoColorSpace;
    return t;
  }, []);
  useEffect(() => () => alphaMap.dispose(), [alphaMap]);

  const tmp = useMemo(() => ({
    obj: new THREE.Object3D(), col: new THREE.Color(),
    dark: new THREE.Color('#4c453f'), pale: new THREE.Color('#c2c8cd'),
  }), []);

  useFrame(({ clock, camera }) => {
    const im = mesh.current;
    if (!im) return;
    const t = clock.elapsedTime;
    let i = 0;
    for (const b of live) {
      const gy = groundAt(b.x, b.z);
      for (let p = 0; p < PUFFS; p++) {
        // 每團煙各自從火塘升到散掉,再從頭來 —— 相位錯開才不是一串珠子
        const phase = ((t * 0.13 + p / PUFFS + b.x * 0.017) % 1 + 1) % 1;
        const rise = phase * 9.5;
        tmp.obj.position.set(
          b.x + Math.sin(t * 0.4 + p) * phase * 1.5,
          gy + 0.9 + rise,
          b.z + Math.cos(t * 0.33 + p * 1.7) * phase * 1.2,
        );
        tmp.obj.quaternion.copy(camera.quaternion);     // 永遠正對鏡頭
        const s = 1.0 + phase * 3.6;
        tmp.obj.scale.set(s, s, s);
        tmp.obj.updateMatrix();
        im.setMatrixAt(i, tmp.obj.matrix);
        // 越升越淡:instanceColor 沒有 alpha,所以拿顏色往天色上靠來當淡出
        im.setColorAt(i, tmp.col.copy(tmp.dark).lerp(tmp.pale, Math.min(1, phase * 1.35)));
        i++;
      }
    }
    im.count = i;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  });

  if (!live.length) return null;

  return (
    <instancedMesh
      ref={mesh}
      // key 帶上數量:一夥被打散,整個 buffer 要重配,不然舊的煙團會留在天上
      key={live.length}
      args={[undefined, undefined, live.length * PUFFS]}
      frustumCulled={false}
      renderOrder={2}
    >
      <planeGeometry args={[2.6, 2.6]} />
      <meshBasicMaterial
        alphaMap={alphaMap} transparent opacity={0.34}
        depthWrite={false} toneMapped={false} fog
      />
    </instancedMesh>
  );
}
