import { forwardRef, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { skyFor, moonPhase, useClock } from './worldTime';
import { rng } from './field';

/**
 * 夜空 — 月亮、星野、銀河。
 *
 * 月相從曆法推(worldTime.moonPhase):初一無月、十五滿月。
 * 月亮畫在<b>光來的方向</b>上 —— skyFor 夜裡的光源就是月亮的位置,
 * 這裡沿同一個方向擺一個圓盤,天上掛的和照在地上的才是同一輪月。
 * 星和月都跟著鏡頭平移(方向不變)—— 它們在無窮遠,不許有視差。
 */

export function NightSky() {
  const moon = useRef<THREE.Mesh>(null);
  const moonMat = useRef<THREE.MeshBasicMaterial>(null);
  const stars = useRef<THREE.Points>(null);
  const starMat = useRef<THREE.PointsMaterial>(null);
  const lastPhaseDay = useRef(-1);

  // 月面:亮盤 + 一個偏移的暗圓咬出月牙。每天只重畫一次
  const moonTex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => moonTex.dispose(), [moonTex]);

  const drawMoon = (phase: number) => {
    const c = moonTex.image as HTMLCanvasElement;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, 128, 128);
    g.fillStyle = '#f3ecd9';
    g.beginPath();
    g.arc(64, 64, 56, 0, Math.PI * 2);
    g.fill();
    // 陰影圓從一側掃過去:朔在正中(全遮),望在兩倍半徑外(不遮)
    const k = Math.cos(phase * Math.PI * 2);   // 1=朔 -1=望
    if (k > -0.98) {
      g.globalCompositeOperation = 'destination-out';
      g.beginPath();
      g.arc(64 + (1 - Math.abs(k)) * 74 * (phase < 0.5 ? 1 : -1) + (k > 0 ? 0 : 0), 64,
        56 * (k > 0 ? 1 : Math.max(0.02, k + 1)), 0, Math.PI * 2);
      // 上面這一筆對「弦月」只是近似 —— Q 版的天,認得出圓缺就夠
      g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    moonTex.needsUpdate = true;
  };

  // 星野:滿天散 800 + 沿一條斜帶加密 500 當銀河
  const starGeom = useMemo(() => {
    const rand = rng(9099);
    const N = 1300;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      let v = new THREE.Vector3();
      if (i < 800) {
        v.set(rand() * 2 - 1, rand(), rand() * 2 - 1).normalize();
      } else {
        // 銀河帶:繞一根斜軸的窄環
        const a = rand() * Math.PI * 2;
        v.set(Math.cos(a), (rand() - 0.5) * 0.24, Math.sin(a)).normalize();
        v.applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.9);
        if (v.y < 0.03) v.y = 0.03 + rand() * 0.1;
      }
      v = v.multiplyScalar(880);
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);

  useFrame(({ camera }) => {
    const st = useClock.getState();
    const sky = skyFor(st.hour, st.season, st.weather);
    const night = 1 - sky.day;
    const clear = st.weather === 'clear' ? 1 : 0.12;

    if (stars.current && starMat.current) {
      stars.current.position.copy(camera.position);
      starMat.current.opacity = Math.max(0, night - 0.55) * 2.2 * clear;
      stars.current.visible = starMat.current.opacity > 0.01;
    }
    if (moon.current && moonMat.current) {
      const phase = moonPhase(st.day);
      if (st.day !== lastPhaseDay.current) { lastPhaseDay.current = st.day; drawMoon(phase); }
      // 亮度跟著月相走 —— 朔夜連月亮都沒有,那才叫黑燈瞎火
      const bright = Math.max(0, 0.5 - Math.abs(phase - 0.5)) * 2;
      moonMat.current.opacity = Math.max(0, night - 0.4) * 1.7 * (0.25 + bright * 0.75) * clear;
      moon.current.visible = moonMat.current.opacity > 0.01 && sky.light.y > 0 && night > 0.5;
      if (moon.current.visible) {
        const dir = sky.light.clone().normalize();
        moon.current.position.copy(camera.position).addScaledVector(dir, 820);
        moon.current.lookAt(camera.position);
      }
    }
  });

  return (
    <>
      <points ref={stars} geometry={starGeom} frustumCulled={false} renderOrder={-2}>
        <pointsMaterial
          ref={starMat} color="#e8eef8" size={2.3} sizeAttenuation={false}
          transparent opacity={0} depthWrite={false} fog={false}
        />
      </points>
      <mesh ref={moon} frustumCulled={false} renderOrder={-1}>
        <planeGeometry args={[64, 64]} />
        <meshBasicMaterial
          ref={moonMat} map={moonTex} transparent opacity={0}
          depthWrite={false} fog={false} toneMapped={false}
        />
      </mesh>
    </>
  );
}

/**
 * 太陽的圓盤 —— 它存在的意義是給 GodRays 一個光源網格。
 * 平時幾乎看不出來(天空著色器自己有太陽輝斑),清晨黃昏的體積光全靠它。
 */
export const SunDisc = forwardRef<THREE.Mesh>(function SunDisc(_, ref) {
  const inner = useRef<THREE.Mesh>(null);
  useFrame(({ camera }) => {
    const m = (ref as React.RefObject<THREE.Mesh>)?.current ?? inner.current;
    if (!m) return;
    const st = useClock.getState();
    const sky = skyFor(st.hour, st.season, st.weather);
    const dir = sky.sun.clone().normalize();
    // 只在日頭低的時候現身 —— 高懸的太陽有天穹自己的輝斑,
    // 這個盤子一大一亮就是貼在畫面上的白餅(踩過:清晨滿屏一顆巨蛋)
    m.visible = sky.day > 0.01 && dir.y < 0.4;
    if (m.visible) {
      m.position.copy(camera.position).addScaledVector(dir, 900);
      m.lookAt(camera.position);
    }
  });
  return (
    <mesh ref={(o) => {
      inner.current = o;
      if (typeof ref === 'function') ref(o);
      else if (ref) (ref as React.MutableRefObject<THREE.Mesh | null>).current = o;
    }} frustumCulled={false} renderOrder={-1}>
      <circleGeometry args={[13, 20]} />
      <meshBasicMaterial color={new THREE.Color(2.0, 1.55, 1.0)} transparent opacity={0.5}
        depthWrite={false} fog={false} toneMapped={false} />
    </mesh>
  );
});
