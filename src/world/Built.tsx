import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MATERIALS, upkeepTint, upkeepMul, type Bucket } from './build';
import { useClock, daylight } from './worldTime';
import { snow } from './Storms';
import { useVillage } from '../game/village';

/**
 * 蓋起來的東西怎麼畫 —— 村屋、縣城、地標共用這一個出口。
 *
 * 從前這段在三個檔案裡各抄一份(都是 `merged.map(...)` 配一個 meshStandardMaterial)。
 * 抄三份的代價是:加「冬天屋頂積雪」要改三處,加「夜裡窗戶亮起來」再改三處,
 * 而漏掉一處的樣子是「縣城不下雪」——沒人會想到去那裡找。
 */

export interface BuiltPart { key: Bucket; geom: THREE.BufferGeometry }

/** 原型階段的把手:房子此刻調到多「新」(0 = 破敗,1 = 齊整)。 */
export const builtStat = { upkeep: 0 };

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
  /** 每一桶各自的材質 —— 要按村況調色,就得抓得到它們。 */
  const mats = useRef<Partial<Record<Bucket, THREE.MeshStandardMaterial>>>({});
  const base = useMemo(() => {
    const out: Partial<Record<Bucket, THREE.Color>> = {};
    for (const k of Object.keys(MATERIALS) as Bucket[]) {
      out[k] = new THREE.Color(MATERIALS[k].color as string);
    }
    return out;
  }, []);
  /** 現在調到哪 —— 村況一天才動一次,顏色要慢慢跟過去,不能跳。 */
  const upkeep = useRef(-1);

  useFrame((_, dt) => {
    /*
     * 房子跟著村況變。
     *
     * 用<b>插值</b>而不是直接賦值:村況是一天結一次帳的,一結就跳三五分,
     * 直接套上去的話整村的顏色會在某一幀「啪」地變一下 ——
     * 那讀起來像 bug,不像日子在過。
     *
     * 時間常數十二秒。原本給三十,量的時候才發現那太長了:
     * 一天是四分鐘,而村況一天才動一次 —— 十二秒已經慢到你看不見它在變,
     * 三十秒則是「跑完一趟差事回來還沒調完」。
     */
    const v = useVillage.getState();
    const want = upkeepTint(v.order, v.harvest, v.trade);
    if (upkeep.current < 0) upkeep.current = want;
    else upkeep.current += (want - upkeep.current) * Math.min(1, dt / 12);
    for (const k of Object.keys(mats.current) as Bucket[]) {
      const m = mats.current[k];
      const b = base[k];
      if (!m || !b) continue;
      const [r, g, bl] = upkeepMul(k, upkeep.current);
      m.color.setRGB(b.r * r, b.g * g, b.b * bl);
    }
    builtStat.upkeep = +upkeep.current.toFixed(3);

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
              <meshStandardMaterial
                ref={(m) => { paperRef.current = m; mats.current.paper = m ?? undefined; }}
                {...MATERIALS.paper}
              />
            </mesh>
          );
        }
        return (
          <mesh key={key} geometry={geom} castShadow receiveShadow>
            <meshStandardMaterial
              ref={(m) => { mats.current[key] = m ?? undefined; }}
              {...MATERIALS[key]}
            />
          </mesh>
        );
      })}
    </>
  );
}
