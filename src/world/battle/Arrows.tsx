import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { arrows, arrowTally, stuckArrows } from '../../game/combat';
import { bowSound } from '../../game/audio';

/**
 * 天上的箭。
 *
 * 從 Battle 拆出來,因為它有一條和戰鬥不同的生命線:
 * <b>沒在打的時候也要掛著</b> —— 插在地上的箭是戰場的痕跡,
 * 打完就集體消失的話,「留痕」就是句空話。高頻資料 —— combat 每步算位置,這裡每幀搬進一個 InstancedMesh。
 * 箭桿順著速度的方向躺 —— 拋物線墜下來的時候箭頭也跟著低頭,
 * 少了這一下,箭就是一根平移的火柴棍。
 */
const ARROW_CAP = 24;

export function ArrowFlights() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const stuck = useRef<THREE.InstancedMesh>(null);
  const heard = useRef(0);
  const tmp = useMemo(() => ({
    obj: new THREE.Object3D(),
    up: new THREE.Vector3(0, 1, 0),
    dir: new THREE.Vector3(),
  }), []);

  useFrame(() => {
    const im = mesh.current;
    if (!im) return;
    // 弦響配在「多了一支箭」上 —— 開新一場 loosed 會歸零,計數器要跟著回去
    if (arrowTally.loosed < heard.current) heard.current = arrowTally.loosed;
    if (arrowTally.loosed > heard.current) { heard.current = arrowTally.loosed; bowSound(); }
    let i = 0;
    for (const a of arrows) {
      if (i >= ARROW_CAP) break;
      tmp.dir.set(a.vx, a.vy, a.vz).normalize();
      tmp.obj.position.set(a.x, a.y, a.z);
      tmp.obj.quaternion.setFromUnitVectors(tmp.up, tmp.dir);
      tmp.obj.updateMatrix();
      im.setMatrixAt(i++, tmp.obj.matrix);
    }
    im.count = i;
    im.instanceMatrix.needsUpdate = true;

    // 插在地上的 —— 順著落地的方向斜著,箭羽朝天
    const sm = stuck.current;
    if (sm) {
      let k = 0;
      for (const s of stuckArrows) {
        if (k >= 32) break;
        tmp.dir.set(s.dx, s.dy, s.dz).normalize();
        tmp.obj.position.set(s.x + s.dx * 0.1, s.y + 0.16, s.z + s.dz * 0.1);
        tmp.obj.quaternion.setFromUnitVectors(tmp.up, tmp.dir);
        tmp.obj.updateMatrix();
        sm.setMatrixAt(k++, tmp.obj.matrix);
      }
      sm.count = k;
      sm.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      <instancedMesh ref={mesh} args={[undefined, undefined, ARROW_CAP]} frustumCulled={false}>
        <cylinderGeometry args={[0.017, 0.017, 0.6, 4]} />
        <meshBasicMaterial color="#e3d9bd" />
      </instancedMesh>
      <instancedMesh ref={stuck} args={[undefined, undefined, 32]} frustumCulled={false}>
        <cylinderGeometry args={[0.017, 0.017, 0.6, 4]} />
        <meshBasicMaterial color="#cfc4a6" />
      </instancedMesh>
    </>
  );
}
