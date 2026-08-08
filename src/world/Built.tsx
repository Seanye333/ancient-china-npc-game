import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MATERIALS, type Bucket } from './build';
import { useClock, daylight } from './worldTime';
import { snow } from './Storms';

/**
 * 蓋起來的東西怎麼畫 —— 村屋、縣城、地標共用這一個出口。
 *
 * 從前這段在三個檔案裡各抄一份(都是 `merged.map(...)` 配一個 meshStandardMaterial)。
 * 抄三份的代價是:加「冬天屋頂積雪」要改三處,加「夜裡窗戶亮起來」再改三處,
 * 而漏掉一處的樣子是「縣城不下雪」——沒人會想到去那裡找。
 */

export interface BuiltPart { key: Bucket; geom: THREE.BufferGeometry }

/**
 * 窗紙透出的燈火。
 *
 * 這個世界入夜以後,光只來自燈籠和灶火 —— 一整排屋子是黑的,
 * 讀起來像沒人住。窗紙後面有一盞燈,是「這裡有人」最省的一筆:
 * 不加光源(幾十戶各一盞點光源會把幀率吃掉),只讓那面紙<b>自己發光</b>。
 *
 * 亮度不是全村一致的:入夜漸亮、夜深了大半熄掉,天明前只剩零星幾家。
 * 睡覺這件事在村子的外觀上要看得見。
 */
function windowGlow(hour: number, season: Parameters<typeof daylight>[0]): number {
  const { rise, set } = daylight(season);
  // 天擦黑點燈,天亮前吹燈
  const dusk = Math.min(1, Math.max(0, (hour - (set - 0.4)) / 1.1));
  const dawn = Math.min(1, Math.max(0, ((rise + 0.5) - hour) / 1.1));
  const lit = hour > 12 ? dusk : dawn;
  // 三更以後大半熄了 —— 留一成,那是還沒睡的人家
  const deep = hour >= 22 || hour < 4.5 ? 0.22 : 1;
  return lit * deep;
}

export function BuiltMeshes({ parts }: { parts: BuiltPart[] }) {
  const paperRef = useRef<THREE.MeshStandardMaterial>(null);
  const snowRef = useRef<THREE.Mesh>(null);
  const glow = useMemo(() => new THREE.Color('#ffb257'), []);

  useFrame(() => {
    const m = paperRef.current;
    if (m) {
      const st = useClock.getState();
      const k = windowGlow(st.hour, st.season);
      // 窗紙本來就是暖白,發光只是把它推上去 —— 推過 bloom 的閾值就有燈的味道
      m.emissive.copy(glow);
      m.emissiveIntensity = k * 1.15;
    }
    /*
     * 屋頂的雪跟著<b>積雪深度</b>走,不再是「季節是不是冬天」。
     *
     * 舊寫法有兩個說不通的地方:秋天下一整天的雪,屋頂還是乾的;
     * 冬天一個沒下雪的大晴天,屋頂照樣白。現在兩邊都對了 ——
     * 而且薄薄一層先貼上去、越積越厚(用縮放演,幾何只有一份)。
     */
    const s = snowRef.current;
    if (s) {
      const k = Math.min(1, Math.max(0, (snow.pack - 0.18) / 0.5));
      s.visible = k > 0.02;
      s.scale.set(1, 0.35 + k * 0.85, 1);
    }
  });

  return (
    <>
      {parts.map(({ key, geom }) => {
        if (key === 'snow') {
          return (
            <mesh key={key} ref={snowRef} geometry={geom} castShadow receiveShadow visible={false}>
              <meshStandardMaterial {...MATERIALS.snow} />
            </mesh>
          );
        }
        if (key === 'paper') {
          return (
            <mesh key={key} geometry={geom} castShadow receiveShadow>
              <meshStandardMaterial ref={paperRef} {...MATERIALS.paper} />
            </mesh>
          );
        }
        return (
          <mesh key={key} geometry={geom} castShadow receiveShadow>
            <meshStandardMaterial {...MATERIALS[key]} />
          </mesh>
        );
      })}
    </>
  );
}
