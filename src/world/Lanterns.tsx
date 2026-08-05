import { useMemo } from 'react';
import { terrainHeight } from './field';
import { skyFor, useClock } from './worldTime';

/**
 * 燈籠 — 只在天黑後亮。
 *
 * 夜景最怕的是「全黑一片」:輪廓看不見、聚落像廢墟。幾盞暖光就能把
 * 「有人住」講清楚。點光源很貴,所以只在橋頭、埠邊、村心與城門放六盞,
 * 其餘靠發光的球體帶氣氛。
 */

const meanderAt = (z: number) => Math.sin(z * 0.02) * 9 + Math.sin(z * 0.047) * 3.5;

export function Lanterns() {
  const hour = useClock((s) => s.hour);
  const season = useClock((s) => s.season);
  const sky = useMemo(() => skyFor(hour, season), [hour, season]);
  // 天光越暗,燈越亮 — 黃昏就開始點,不是到全黑才亮
  const lit = Math.max(0, 1 - sky.day * 1.5);

  const spots = useMemo(() => {
    const pts: Array<[number, number, number]> = [];
    const push = (x: number, z: number, up: number) =>
      pts.push([x, terrainHeight(x, z) + up, z]);
    push(meanderAt(6) - 12, 6, 3.4);            // 橋頭兩端
    push(meanderAt(6) + 12, 6, 3.4);
    push(meanderAt(-46) + 5, -46, 2.6);         // 兩個碼頭
    push(meanderAt(78) + 5, 78, 2.6);
    push(meanderAt(24) + 22, 24, 3.0);          // 村心
    push(meanderAt(-118) + 15, -118, 7.4);      // 城門樓
    return pts;
  }, []);

  if (lit < 0.02) return null;
  return (
    <>
      {spots.map(([x, y, z], i) => (
        <group key={i} position={[x, y, z]}>
          <pointLight
            color="#ffb257"
            intensity={lit * 34}
            distance={26}
            decay={1.7}
          />
          <mesh>
            <sphereGeometry args={[0.42, 10, 8]} />
            <meshBasicMaterial color="#ffcb84" toneMapped={false} />
          </mesh>
        </group>
      ))}
    </>
  );
}
