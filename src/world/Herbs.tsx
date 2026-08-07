import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { terrainHeight, rng } from './field';
import { useClock } from './worldTime';
import { herbSpots, useHerbs, spotReady } from '../game/herbs';

/**
 * 坡上的藥草。
 *
 * 這是世界上第一種<b>會被你採光、然後長回來</b>的東西。所以它必須看得見:
 * 採空的那一叢當場消失,十二天後再冒出來 —— 玩家記得住哪一叢是空的,
 * 「這一片山我採過了」才是真的。
 *
 * 花色跟著季節走(春柴胡、夏金銀花、秋桔梗),冬天只剩枯稈 ——
 * 於是「冬天採不到藥」不必寫在提示裡,遠遠一看就知道。
 */

/**
 * 一叢幾根。
 *
 * 第一版十五根、花頭 0.055 —— 走到跟前才看得見四五根白點,
 * 而這東西的<b>全部用處就是遠遠認得出來</b>:認不出來的話,
 * 十二叢藥草等於十二個看不見的按鈕。現在密一倍、花頭大一倍,
 * 底下再鋪一圈葉子,遠看是一片,近看才分得出根。
 */
const STEMS = 30;

export function Herbs() {
  const day = useClock((s) => s.day);
  const season = useClock((s) => s.season);
  const picked = useHerbs((s) => s.picked);
  const stemRef = useRef<THREE.InstancedMesh>(null);
  const flowerRef = useRef<THREE.InstancedMesh>(null);
  const leafRef = useRef<THREE.InstancedMesh>(null);

  /**
   * 稈與花在<b>同一個迴圈</b>裡算出來。
   *
   * 分兩個迴圈寫過一次,結果是兩邊的隨機數走的步子不一樣,花全開在稈的旁邊 ——
   * 位置和形體只要分開算就一定會漂移,這條規矩在晾衣桿那次已經吃過一回虧了。
   */
  const clumps = useMemo(() => {
    const rand = rng(31337);
    const out: Array<{
      m: THREE.Matrix4; f: THREE.Matrix4; l: THREE.Matrix4; ready: boolean;
    }> = [];
    for (const s of herbSpots()) {
      const ready = spotReady(s.id, day);
      for (let i = 0; i < STEMS; i++) {
        // 平方根鋪開 —— 直接乘 rand() 的話點全擠在外圈,中間反而是空的
        const a = rand() * Math.PI * 2;
        const r = Math.sqrt(rand()) * (s.wild ? 2.4 : 1.9);
        const x = s.x + Math.sin(a) * r;
        const z = s.z + Math.cos(a) * r;
        const y = terrainHeight(x, z);
        const h = 0.5 + rand() * 0.42;
        const tilt = (rand() - 0.5) * 0.5;
        const yaw = rand() * 3;
        out.push({
          m: new THREE.Matrix4().compose(
            new THREE.Vector3(x, y + h / 2, z),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, yaw, tilt * 0.6)),
            new THREE.Vector3(1, h / 0.4, 1)),
          f: new THREE.Matrix4().compose(
            new THREE.Vector3(x, y + h, z),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
            new THREE.Vector3(1, 1, 1)),
          l: new THREE.Matrix4().compose(
            new THREE.Vector3(x, y + 0.05, z),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, yaw)),
            new THREE.Vector3(1, 1, 1)),
          ready,
        });
      }
    }
    return out;
  }, [day, picked]);

  const flowerColor = season === 'spring' ? '#d8c25c'
    : season === 'summer' ? '#e8e4d0' : '#8d7fc0';

  useEffect(() => {
    const stem = stemRef.current, flower = flowerRef.current, leaf = leafRef.current;
    if (!stem || !flower || !leaf) return;
    // 採空的那一叢縮成零 —— 刪 instance 會讓後面全部平移,縮到看不見最省事
    const gone = new THREE.Matrix4().makeScale(0, 0, 0);
    clumps.forEach((c, i) => {
      stem.setMatrixAt(i, c.ready ? c.m : gone);
      flower.setMatrixAt(i, c.ready && season !== 'winter' ? c.f : gone);
      leaf.setMatrixAt(i, c.ready && season !== 'winter' ? c.l : gone);
    });
    for (const m of [stem, flower, leaf]) {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
  }, [clumps, season]);

  const n = clumps.length;
  if (!n) return null;

  return (
    <group>
      <instancedMesh ref={stemRef} args={[undefined, undefined, n]} frustumCulled={false}>
        <cylinderGeometry args={[0.012, 0.02, 0.4, 3]} />
        <meshStandardMaterial
          color={season === 'winter' ? '#8e8368' : '#6f8a4a'} roughness={0.92} />
      </instancedMesh>
      <instancedMesh ref={flowerRef} args={[undefined, undefined, n]} frustumCulled={false}>
        <icosahedronGeometry args={[0.105, 0]} />
        <meshStandardMaterial color={flowerColor} roughness={0.62} />
      </instancedMesh>
      {/* 底下鋪一圈葉子 —— 少了它遠看就是一片竹籤 */}
      <instancedMesh ref={leafRef} args={[undefined, undefined, n]} frustumCulled={false}>
        <circleGeometry args={[0.17, 5]} />
        <meshStandardMaterial color="#5c7a3e" roughness={0.94} side={THREE.DoubleSide} />
      </instancedMesh>
    </group>
  );
}
