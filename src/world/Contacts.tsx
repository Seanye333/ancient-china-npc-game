import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useClock, skyFor } from './worldTime';

/**
 * 腳邊的接觸陰影 —— 一片壓在地上的軟影。
 *
 * 為什麼需要:這個世界的影子全靠一盞平行光,而<b>平行光有一半的時間形同虛設</b> ——
 * 陰雨天 sunIntensity 只剩兩成、入夜只剩月光的 0.30。那些時候陰影貼圖幾乎是白的,
 * 於是滿村子的人是<b>浮</b>在地上的:腳和地之間沒有一點暗,像貼紙。
 *
 * 接觸陰影補的正是這一段。它不是平行光的影子(那是有方向的、會被拉長的),
 * 它是「腳把天光擋掉了」——所以它永遠在正下方,而且<b>太陽越弱它越明顯</b>。
 * 這兩件事湊在一起,晴天不會出現雙重影子,陰天的人也踩得到地。
 *
 * 一個 InstancedMesh 畫完全村。
 */

/** 這一幀有誰要影子。x, y(地面高), z, r 四個一組,平鋪。 */
const buf: number[] = [];

/**
 * 報一個接觸點。各家角色的渲染元件每幀呼叫一次。
 *
 * <b>不做「先清空再收集」的排程</b> —— R3F 的 useFrame 同優先度是按掛載順序跑的,
 * 而正優先度會把渲染迴圈整個接管過去(踩過的坑不必再踩一次)。
 * 這裡改成:畫的人自己畫完就清。誰先誰後都不會漏,最壞情況是晚一幀 ——
 * 一片腳下的軟影晚 16 毫秒,沒有人看得出來。
 */
export function pushContact(x: number, y: number, z: number, r = 0.42) {
  if (buf.length > 4 * 256) return;      // 防身:某處寫了迴圈也不會把記憶體吃光
  buf.push(x, y, z, r);
}

const CAP = 256;

/** 原型階段的把手:這一幀畫了幾片、濃到什麼程度。 */
export const contactStat = { count: 0, opacity: 0 };

export function Contacts() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const tmp = useMemo(() => ({ o: new THREE.Object3D() }), []);

  /** 一團中心濃、邊緣化開的圓 —— 硬邊的圓片讀起來是地上貼了張黑紙。 */
  const alphaMap = useMemo(() => {
    const s = 64;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, '#fff');
    grad.addColorStop(0.42, 'rgba(255,255,255,.62)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    return new THREE.CanvasTexture(c);
  }, []);

  useFrame(() => {
    const im = mesh.current;
    if (!im || !mat.current) return;
    const st = useClock.getState();
    const sky = skyFor(st.hour, st.season, st.weather);
    /*
     * 太陽越猛,這片影子越淡。
     *
     * 大晴天的正午 sunIntensity 到 3.6,那時候真影子又黑又利,
     * 底下再壓一片圓影就是<b>兩個影子</b>(而且一個是圓的)。
     * 陰雨與夜裡 intensity 在 0.3 上下,真影子沒了,這片就接手。
     */
    const k = 0.34 - Math.min(0.26, sky.sunIntensity * 0.075);
    mat.current.opacity = k;
    contactStat.opacity = +k.toFixed(3);

    let n = 0;
    for (let i = 0; i + 3 < buf.length && n < CAP; i += 4) {
      // 貼著地皮,但要高過地形網格與解析高度的落差(草那邊吃過同一個虧)
      tmp.o.position.set(buf[i], buf[i + 1] + 0.02, buf[i + 2]);
      tmp.o.rotation.set(-Math.PI / 2, 0, 0);
      tmp.o.scale.set(buf[i + 3], buf[i + 3], 1);
      tmp.o.updateMatrix();
      im.setMatrixAt(n++, tmp.o.matrix);
    }
    buf.length = 0;
    im.count = n;
    contactStat.count = n;
    im.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, CAP]} frustumCulled={false} renderOrder={2}>
      <planeGeometry args={[1, 1]} />
      {/*
        basic 而不是 standard —— 這片東西不該再被光照一次。
        它<b>是</b>「光沒照到」本身,受光的話陰天反而會亮起來。
      */}
      <meshBasicMaterial
        ref={mat} color="#0d1014" alphaMap={alphaMap}
        transparent opacity={0} depthWrite={false}
      />
    </instancedMesh>
  );
}
