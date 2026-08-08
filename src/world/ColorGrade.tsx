import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Effect } from 'postprocessing';
import { useClock, skyFor } from './worldTime';
import { gradeFor } from './grade';

/**
 * 調色那一層 —— 合成器的最後一道。
 *
 * 規矩全在 grade.ts(純數字、有測試),這裡只負責把它搬進著色器。
 * 四行 GLSL 和 applyGrade() 的四行是<b>同一份算式</b>,改一邊要記得改另一邊。
 *
 * 為什麼不用 LUT:LUT 是一張烘好的表,換季就得換一張圖 ——
 * 而季節與天氣是<b>連續</b>過渡的(黃昏那半小時飽和一路掉下去),
 * 換圖只能「啪」一下切。四個 uniform 每幀插值,過渡是白撿的。
 */

const FRAG = /* glsl */`
  uniform vec3 uLift;
  uniform vec3 uGain;
  uniform float uContrast;
  uniform float uSat;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec3 c = inputColor.rgb;
    // 暗部抬起來、亮部染色。lift 乘 (1-c) —— 抬的是暗處,亮處幾乎不動
    c = c * uGain + uLift * (1.0 - c);
    c = (c - 0.5) * uContrast + 0.5;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, uSat);
    outputColor = vec4(clamp(c, 0.0, 1.0), inputColor.a);
  }
`;

class GradeEffect extends Effect {
  constructor() {
    super('Grade', FRAG, {
      uniforms: new Map<string, THREE.Uniform>([
        ['uLift', new THREE.Uniform(new THREE.Vector3())],
        ['uGain', new THREE.Uniform(new THREE.Vector3(1, 1, 1))],
        ['uContrast', new THREE.Uniform(1)],
        ['uSat', new THREE.Uniform(1)],
      ]),
    });
  }
}

/** 原型階段的把手:此刻的調色是什麼。畫面上「有沒有在調」是看不出來的。 */
export const gradeStat = { sat: 1, contrast: 1, liftB: 0 };

export function ColorGrade() {
  const effect = useMemo(() => new GradeEffect(), []);

  useFrame((_, dt) => {
    const st = useClock.getState();
    // dayK 從 skyFor 拿 —— 「天有多亮」只准有一個來源,
    // 這裡自己按時辰算一份的話,黃昏的調色會和黃昏的光錯開半個時辰
    const g = gradeFor(st.season, st.weather, skyFor(st.hour, st.season, st.weather).day);
    const u = effect.uniforms;
    const lift = u.get('uLift')!.value as THREE.Vector3;
    const gain = u.get('uGain')!.value as THREE.Vector3;
    /*
     * 全部走插值,不直接賦值。
     *
     * 季節與時辰本來就是連續的,可<b>天氣不是</b> —— setWeather 一呼叫,
     * 飽和從 1.12 掉到 0.78 是同一幀完成的,畫面「啪」地褪色一下。
     * 天要陰下來得花兩三秒,這一條讓天氣的切換不像在按開關。
     */
    const k = Math.min(1, dt * 1.6);
    lift.x += (g.lift[0] - lift.x) * k;
    lift.y += (g.lift[1] - lift.y) * k;
    lift.z += (g.lift[2] - lift.z) * k;
    gain.x += (g.gain[0] - gain.x) * k;
    gain.y += (g.gain[1] - gain.y) * k;
    gain.z += (g.gain[2] - gain.z) * k;
    const uc = u.get('uContrast')!;
    const us = u.get('uSat')!;
    uc.value += (g.contrast - (uc.value as number)) * k;
    us.value += (g.saturation - (us.value as number)) * k;
    gradeStat.sat = +(us.value as number).toFixed(3);
    gradeStat.contrast = +(uc.value as number).toFixed(3);
    gradeStat.liftB = +lift.z.toFixed(4);
  });

  return <primitive object={effect} dispose={null} />;
}
