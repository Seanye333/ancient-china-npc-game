import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { bodyGeom, headGeom, SKINS, FIG_BODY_H } from './figure';
import { corpses, stains, impacts, ageBattlefield, battleTime, CORPSE_DAYS } from '../game/combat';
import { useClock } from './worldTime';
import { pushContact } from './Contacts';

/**
 * 打完之後留下的東西 —— 躺著的人、地上的血、剛剛那一下的火花。
 *
 * 這個元件<b>不在戰鬥裡</b>:它一直掛著。這正是重點 ——
 * 從前一場架收場,fighters 整個清空,倒下的人跟著消失。
 * 你打完轉身走十步再回頭,那片草地什麼都沒發生過。
 * 一個把死寫進日誌、寫進仇家名單的遊戲,地上卻乾乾淨淨,
 * 那是這個世界最說不通的一處。
 *
 * 屍首躺三天(見 CORPSE_DAYS),血漬六天。之後村裡有人來收 ——
 * 那不必演,少掉就是了。
 */

const CAP = 24;

/** 原型階段的把手:地上此刻躺著幾個、幾攤血、剛剛炸了幾朵。 */
export const fallenStat = { corpses: 0, stains: 0, impacts: 0 };

export function Fallen() {
  const day = useClock((s) => s.day);
  const foeBody = useRef<THREE.InstancedMesh>(null);
  const foeHead = useRef<THREE.InstancedMesh>(null);
  const ourBody = useRef<THREE.InstancedMesh>(null);
  const ourHead = useRef<THREE.InstancedMesh>(null);
  const stainMesh = useRef<THREE.InstancedMesh>(null);
  const sparkMesh = useRef<THREE.InstancedMesh>(null);
  const tmp = useMemo(() => ({ o: new THREE.Object3D(), c: new THREE.Color() }), []);

  const geoms = useMemo(() => ({
    foeBody: bodyGeom(new THREE.Color('#4a3f42')),
    foeHead: headGeom({ cloth: true, skin: new THREE.Color(SKINS[2]), face: 0.2, mood: 'calm' }),
    ourBody: bodyGeom(new THREE.Color('#6b5741')),
    ourHead: headGeom({ skin: new THREE.Color(SKINS[1]), face: 0.6, mood: 'calm' }),
  }), []);

  const stainMap = useMemo(() => {
    const s = 64;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,255,255,.95)');
    grad.addColorStop(0.55, 'rgba(255,255,255,.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    return new THREE.CanvasTexture(c);
  }, []);
  useEffect(() => () => stainMap.dispose(), [stainMap]);

  // 過了一天就收一次 —— 規矩在 combat.ts(那邊是純邏輯,有測試)
  useEffect(() => { ageBattlefield(day); }, [day]);

  useFrame(() => {
    const today = useClock.getState().day;

    /* 屍首。兩邊各一組 InstancedMesh —— 一具屍首兩個 draw,不是七個 */
    let nf = 0, no = 0;
    for (const c of corpses) {
      const foe = c.side === 'foe';
      const b = foe ? foeBody.current : ourBody.current;
      const h = foe ? foeHead.current : ourHead.current;
      if (!b || !h) continue;
      const slot = foe ? nf : no;
      if (slot >= CAP) continue;
      /*
       * 往前撲、臉朝下,和戰鬥裡「倒地」那一拍同一個角度 ——
       * 那一拍演完人就進了這裡,角度不接的話會看到屍體<b>彈</b>一下。
       */
      tmp.o.position.set(c.x, c.y + 0.10, c.z);
      tmp.o.rotation.set(-Math.PI * 0.46, c.yaw, 0);
      tmp.o.scale.setScalar(c.chief ? 1.06 : 1);
      tmp.o.updateMatrix();
      b.setMatrixAt(slot, tmp.o.matrix);
      // 頭跟著身子躺 —— 身子是往前撲的,頭在「上方」其實是往前
      tmp.o.position.set(
        c.x + Math.sin(c.yaw) * FIG_BODY_H * 0.9,
        c.y + 0.10 + FIG_BODY_H * 0.35,
        c.z + Math.cos(c.yaw) * FIG_BODY_H * 0.9,
      );
      tmp.o.updateMatrix();
      h.setMatrixAt(slot, tmp.o.matrix);
      if (foe) nf++; else no++;
      pushContact(c.x, c.y, c.z, 0.66);
    }
    if (foeBody.current) { foeBody.current.count = nf; foeBody.current.instanceMatrix.needsUpdate = true; }
    if (foeHead.current) { foeHead.current.count = nf; foeHead.current.instanceMatrix.needsUpdate = true; }
    if (ourBody.current) { ourBody.current.count = no; ourBody.current.instanceMatrix.needsUpdate = true; }
    if (ourHead.current) { ourHead.current.count = no; ourHead.current.instanceMatrix.needsUpdate = true; }
    fallenStat.corpses = nf + no;

    /* 血漬。越舊越淡 —— 淡靠顏色往土色收(instanceColor 沒有 alpha) */
    const sm = stainMesh.current;
    if (sm) {
      let n = 0;
      for (const s of stains) {
        const age = Math.min(1, (today - s.day) / (CORPSE_DAYS * 2));
        tmp.o.position.set(s.x, s.y + 0.025, s.z);
        tmp.o.rotation.set(-Math.PI / 2, 0, s.x * 1.7);
        tmp.o.scale.set(s.r, s.r * 0.82, 1);
        tmp.o.updateMatrix();
        sm.setMatrixAt(n, tmp.o.matrix);
        sm.setColorAt(n, tmp.c.setRGB(0.24, 0.05, 0.05).lerp(new THREE.Color('#6b5a44'), age));
        n++;
      }
      sm.count = n;
      fallenStat.stains = n;
      sm.instanceMatrix.needsUpdate = true;
      if (sm.instanceColor) sm.instanceColor.needsUpdate = true;
    }

    /* 剛剛那一下:火花與血點往打來的方向濺出去,半秒散掉 */
    const km = sparkMesh.current;
    if (km) {
      let n = 0;
      // 火花的 t 是<b>戰鬥的鐘</b>,不是三的鐘 —— 混用的話 age 永遠 > 1,
      // 一顆都不會出現(而且不報錯)
      const bt = battleTime();
      for (const im of impacts) {
        const age = (bt - im.t) / 0.45;
        if (age < 0 || age >= 1) continue;
        for (let k = 0; k < 3 && n < CAP * 4; k++) {
          const spread = (k - 1) * 0.55;
          const dx = im.dx * Math.cos(spread) - im.dz * Math.sin(spread);
          const dz = im.dz * Math.cos(spread) + im.dx * Math.sin(spread);
          const r = age * (0.55 + k * 0.12);
          tmp.o.position.set(
            im.x + dx * r, im.y + 0.28 * age - 0.7 * age * age, im.z + dz * r,
          );
          tmp.o.scale.setScalar((1 - age) * (im.kind === 'spark' ? 0.075 : 0.055));
          tmp.o.updateMatrix();
          km.setMatrixAt(n, tmp.o.matrix);
          // 火星是暖白(推到 HDR 過 bloom),血是暗紅(絕不能過 bloom —— 會發光)
          km.setColorAt(n, im.kind === 'spark'
            ? tmp.c.setRGB(3.4, 2.4, 1.1) : tmp.c.setRGB(0.34, 0.03, 0.03));
          n++;
        }
      }
      km.count = n;
      fallenStat.impacts = n;
      km.instanceMatrix.needsUpdate = true;
      if (km.instanceColor) km.instanceColor.needsUpdate = true;
    }
  });

  return (
    <>
      <instancedMesh ref={foeBody} args={[geoms.foeBody, undefined, CAP]} frustumCulled={false} castShadow>
        <meshStandardMaterial vertexColors roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={foeHead} args={[geoms.foeHead, undefined, CAP]} frustumCulled={false} castShadow>
        <meshStandardMaterial vertexColors roughness={0.66} />
      </instancedMesh>
      <instancedMesh ref={ourBody} args={[geoms.ourBody, undefined, CAP]} frustumCulled={false} castShadow>
        <meshStandardMaterial vertexColors roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={ourHead} args={[geoms.ourHead, undefined, CAP]} frustumCulled={false} castShadow>
        <meshStandardMaterial vertexColors roughness={0.66} />
      </instancedMesh>
      <instancedMesh ref={stainMesh} args={[undefined, undefined, 32]} frustumCulled={false} renderOrder={1}>
        <circleGeometry args={[1, 10]} />
        <meshBasicMaterial alphaMap={stainMap} transparent opacity={0.72} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={sparkMesh} args={[undefined, undefined, CAP * 4]} frustumCulled={false}>
        <sphereGeometry args={[1, 5, 4]} />
        {/* toneMapped 關掉是為了火星:血那一路自己的顏色壓在 0.34 以下,過不了 bloom */}
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </>
  );
}
