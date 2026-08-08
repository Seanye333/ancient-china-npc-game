import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useClock, skyFor } from './worldTime';
import { cloudLook } from './sky';
import { rng } from './field';

/**
 * 天上的雲。
 *
 * 從前這裡掛的是 drei 的 &lt;Cloud&gt; 兩朵,參數是拍腦袋定的 ——
 * 而且<b>不管天氣怎麼變都是那兩朵晴天的白棉花</b>:大雨天抬頭看還是白雲,
 * 於是「要下雨了」這件事天上一點徵兆都沒有。
 *
 * 換成自己畫的還有一個更難堪的理由:那兩朵在遠景裡讀成
 * <b>幾個掛在山腰的白色大泡泡</b> —— volume 26 攤在 130 公尺上,
 * 一片就是二十幾公尺的圓,邊緣又硬,眼睛只能認成球。
 * 自己畫就控得住:一團雲 = 十幾片小的疊在一起,邊緣靠 alpha 化開。
 *
 * 一個 InstancedMesh,一次 draw call。
 */

const PER = 18;              // 一團幾片
const CLUSTERS = 16;
const MAX = CLUSTERS * PER;

interface Puff { a: number; r: number; ox: number; oy: number; oz: number; s: number }

/**
 * 雲團擺在<b>繞著鏡頭的一圈</b>上,而不是撒在世界座標裡。
 *
 * 第一版是世界固定的雲海,結果拍出來滿山腰掛著幾個白色大泡泡 ——
 * 因為總有幾團的中心正好落在你附近,一片四十公尺的雲在三十公尺外
 * 就是半個天空那麼大的一個圓。真實的雲離人好幾公里,走幾步不會變形,
 * 所以綁在鏡頭上反而更對:半徑最近也有兩百公尺,永遠只在地平線那一帶。
 *
 * 角度隨時間慢慢轉,那就是「雲在飄」。
 */
function makePuffs(): Puff[] {
  const rand = rng(3311);
  const out: Puff[] = [];
  for (let c = 0; c < CLUSTERS; c++) {
    const a = (c / CLUSTERS) * Math.PI * 2 + (rand() - 0.5) * 0.3;
    const r = 200 + rand() * 260;
    for (let i = 0; i < PER; i++) {
      // 一團雲扁而寬:橫向散得開,縱向只有三分之一 —— 立起來就成了棉花糖
      out.push({
        a, r,
        ox: (rand() - 0.5) * 2.6, oy: (rand() - 0.5) * 0.5, oz: (rand() - 0.5) * 2.6,
        s: 0.55 + rand() * 0.8,
      });
    }
  }
  return out;
}

/** 原型階段的把手:此刻畫了幾片、多高、什麼顏色。 */
export const cloudStat = { puffs: 0, y: 0, opacity: 0 };

export function SkyClouds() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const puffs = useMemo(() => makePuffs(), []);
  const tmp = useMemo(() => ({ o: new THREE.Object3D(), c: new THREE.Color() }), []);

  const alphaMap = useMemo(() => {
    const s = 96;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    // 中心也只有八成 —— 全白的核心疊起來會結成一塊硬邊的雲餅
    grad.addColorStop(0, 'rgba(255,255,255,.82)');
    grad.addColorStop(0.45, 'rgba(255,255,255,.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    return new THREE.CanvasTexture(c);
  }, []);
  useEffect(() => () => alphaMap.dispose(), [alphaMap]);

  useFrame(({ clock, camera }) => {
    const im = mesh.current;
    if (!im || !mat.current) return;
    const st = useClock.getState();
    const look = cloudLook(st.weather, st.season, skyFor(st.hour, st.season, st.weather).day);
    const t = clock.elapsedTime;

    mat.current.color.setRGB(look.color[0], look.color[1], look.color[2]);
    mat.current.opacity = look.opacity;
    cloudStat.y = look.y;
    cloudStat.opacity = +look.opacity.toFixed(3);

    // 整圈慢慢轉 —— 這就是「雲在飄」
    const spin = t * 0.0016;
    const need = look.clusters * PER;
    let n = 0;
    for (let i = 0; i < puffs.length && n < need; i++) {
      const p = puffs[i];
      const a = p.a + spin;
      const sz = look.size * p.s;
      tmp.o.position.set(
        camera.position.x + Math.sin(a) * p.r + p.ox * look.size,
        look.y + p.oy * look.size * 0.5,
        camera.position.z + Math.cos(a) * p.r + p.oz * look.size,
      );
      // 只朝鏡頭轉 —— 雲片是立牌,躺下去從側面看就是一條線
      tmp.o.quaternion.copy(camera.quaternion);
      tmp.o.scale.set(sz, sz * 0.62, 1);
      tmp.o.updateMatrix();
      im.setMatrixAt(n++, tmp.o.matrix);
    }
    im.count = n;
    cloudStat.puffs = n;
    im.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, MAX]} frustumCulled={false} renderOrder={-1}>
      <planeGeometry args={[1, 1]} />
      {/*
        三個開關各有各的理由:
        · basic —— 雲不受地面那盞平行光影響,它在光源的那一側。
        · depthWrite 關 —— 十四片疊在一起,互相寫深度會結出一格一格的硬邊。
          但 depthTest 要<b>留著</b>:關掉的話雲會蓋在山頭前面
          (透明物件本來就排在不透明之後畫,renderOrder 管不到這件事)。
        · fog 關 —— 雲的深淺已經由 cloudLook 給了。開著霧的話雨天最慘:
          霧濃度是晴天的 2.6 倍,四百公尺外的雲被吃到剩百分之一,
          「烏雲壓頂」變成一片空白的天。
      */}
      <meshBasicMaterial
        ref={mat} alphaMap={alphaMap} transparent opacity={0.3}
        depthWrite={false} fog={false} color="#ffffff"
      />
    </instancedMesh>
  );
}
