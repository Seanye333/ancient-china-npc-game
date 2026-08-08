import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useClock } from './worldTime';

/**
 * 炊煙 —— 一戶人家在做飯。
 *
 * 村子在這之前是一排不動的屋頂:人走在裡面,可是屋子本身沒有任何
 * 「有人住」的跡象。一縷煙比十個細節管用,因為它<b>會動</b>,
 * 而且它說的是時間 —— 早上和傍晚冒,那正是燒飯的兩個時辰。
 *
 * <b>要和賊營的煙分得開。</b>那一道是全遊戲唯一的任務標記
 * (「西南約七十步」抬頭就對得上),混在一起等於把標記弄髒了。
 * 分法是形狀:賊營是一根升到九米半的粗柱子(遠遠看得見),
 * 村戶是<b>又細又矮又淡</b>的一縷,升三米就散 —— 你得在村子裡才看得見。
 */

const PUFFS = 7;
/** 一次最多幾戶在冒煙。全村四十六戶同時開火太滿,反而假。 */
const LIT = 14;

/** 這個時辰有幾成人家在燒飯。 */
export function cookingAt(hour: number, winter: boolean): number {
  // 卯末辰初一頓,酉時一頓 —— 漢代一日兩餐
  const morning = Math.exp(-((hour - 7.0) ** 2) / 1.6);
  const evening = Math.exp(-((hour - 17.8) ** 2) / 2.0);
  // 冬天還要取暖,白天也斷斷續續有煙
  const warmth = winter ? 0.28 : 0;
  return Math.min(1, morning + evening + warmth);
}

export function Hearths({ spots }: { spots: Array<{ x: number; z: number; y: number }> }) {
  const mesh = useRef<THREE.InstancedMesh>(null);

  const alphaMap = useMemo(() => {
    const s = 64;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,255,255,.62)');
    // 心也不能實 —— 實心的軟邊圓斑讀作棉花球,不是煙
    grad.addColorStop(0.28, 'rgba(255,255,255,.30)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.NoColorSpace;
    return t;
  }, []);
  useEffect(() => () => alphaMap.dispose(), [alphaMap]);

  // 哪幾戶今天開火 —— 由座標雜湊定,所以同一戶總是同一個節奏,不會整村同步
  const lit = useMemo(() => spots.slice(0, LIT).map((s, i) => ({
    ...s, phase: ((Math.sin(s.x * 12.9 + s.z * 7.3) * 43758.5) % 1 + 1) % 1, i,
  })), [spots]);

  const tmp = useMemo(() => ({
    obj: new THREE.Object3D(), col: new THREE.Color(),
    warm: new THREE.Color('#5d564e'), pale: new THREE.Color('#8f959b'),
  }), []);

  useFrame(({ clock, camera }) => {
    const im = mesh.current;
    if (!im) return;
    const st = useClock.getState();
    const k = cookingAt(st.hour, st.season === 'winter');
    if (k <= 0.02) { im.count = 0; return; }
    const t = clock.elapsedTime;
    let n = 0;
    for (const h of lit) {
      // 這一戶的門檻:k 越高開火的戶數越多。同一戶的門檻固定,
      // 所以是「陸續有人生火」,不是全村一起亮起來
      if (h.phase > k) continue;
      for (let p = 0; p < PUFFS; p++) {
        const ph = ((t * 0.20 + p / PUFFS + h.phase) % 1 + 1) % 1;
        const rise = ph * 6.0;
        tmp.obj.position.set(
          h.x + Math.sin(t * 0.5 + p + h.phase * 9) * ph * 0.7,
          h.y + 0.35 + rise,
          h.z + Math.cos(t * 0.42 + p * 1.7) * ph * 0.55,
        );
        tmp.obj.quaternion.copy(camera.quaternion);
        const s = 0.22 + ph * 0.95;
        tmp.obj.scale.set(s, s, s);
        tmp.obj.updateMatrix();
        im.setMatrixAt(n, tmp.obj.matrix);
        im.setColorAt(n, tmp.col.copy(tmp.warm).lerp(tmp.pale, Math.min(1, ph * 1.5)));
        n++;
      }
    }
    im.count = n;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  });

  if (!lit.length) return null;
  return (
    <instancedMesh
      ref={mesh} args={[undefined, undefined, lit.length * PUFFS]}
      frustumCulled={false} renderOrder={2}
    >
      <planeGeometry args={[1.1, 1.1]} />
      <meshBasicMaterial
        alphaMap={alphaMap} transparent opacity={0.17}
        // 這一縷要<b>吃色調映射</b>。不吃的話它在 AgX 壓過的世界裡是純白的,
        // 一排屋頂上頂著七個白球 —— 賊營那道煙不吃是因為它要遠遠看得見
        depthWrite={false} fog
      />
    </instancedMesh>
  );
}
