import * as THREE from 'three';
import type { Fighter } from '../../game/combat';

/**
 * 姿態 — 這是整個戰鬥唯一的「動畫」。
 *
 * 單獨成檔的理由:它是<b>純函式</b>,不掛任何 React 的東西 ——
 * 收一個 Fighter 和幾個 ref,把姿勢寫進去。夾在元件中間的時候
 * 它看起來像元件的一部分,其實它和 React 一點關係都沒有。
 *
 * 沒有骨架,能動的只有整個身子的傾斜、上下、以及刀的角度。
 * 但這幾樣已經夠讀:前傾+刀掄下去是砍,後仰是挨打,躺平是倒了。
 * <b>剪影讀得出來就夠了</b> —— 這個世界的人本來就是靠剪影認的。
 */
export function poseInto(
  g: THREE.Group, body: THREE.Mesh | null, blade: THREE.Group | null,
  /** t = 三的鐘(拿來做無所謂起點的晃動);bt = 這一場的鐘(拿來和 hurtAt 比)。 */
  f: Fighter, t: number, bt: number, trail?: THREE.Mesh | null,
  legs?: Array<THREE.Mesh | null>,
) {
  g.position.set(f.x, f.y, f.z);
  g.rotation.set(0, f.yaw, 0);

  /*
   * 腿。只有<b>在移動的那兩個姿態</b>邁步:撲上去和逃。
   * 對峙、揮刀、挨打、倒地的時候腿要站定 —— 一個人一邊被砍一邊
   * 原地踏步,那不是打鬥,那是在跳舞。
   */
  if (legs) {
    const stepping = f.stance === 'closing' || f.stance === 'fleeing';
    for (let i = 0; i < 2; i++) {
      const leg = legs[i];
      if (!leg) continue;
      leg.rotation.x = stepping
        ? Math.sin(f.phase * Math.PI * 2 + (i ? 0 : Math.PI)) * 0.5 : 0;
    }
  }

  const hurtFlash = bt - f.hurtAt < 0.18;
  /*
   * 剛架開一刀 —— 兵器橫過來擋在身前,身子往後讓半步。
   *
   * 這一下和「挨打」是<b>兩件相反的事</b>,可從前畫面上長得一樣(都是什麼都沒有)。
   * 一場架裡有一半的出手是被架開的,那一半在畫面上原本完全不存在。
   */
  const guarding = bt - f.guardAt < 0.22 && f.stance !== 'down';
  // 逃跑的人刀都扔了 —— 「打散」要看得出是打散,不是換個方向走
  if (blade) blade.visible = f.stance !== 'fleeing';
  if (trail) trail.visible = f.stance === 'striking' && !f.bow;

  switch (f.stance) {
    case 'down': {
      // 倒下 — 往前撲,不是原地消失
      g.rotation.x = -Math.PI * 0.46;
      g.position.y = f.y + 0.12;
      if (blade) blade.rotation.set(0, 0, -1.4);
      break;
    }
    case 'striking': {
      // 掄過頂再劈下來
      const p = f.phase;
      const arc = p < 0.42 ? -1.9 + p * 1.2 : -1.4 + (p - 0.42) * 5.4;
      if (blade) blade.rotation.set(arc, 0, 0.2);
      if (trail) {
        // 刀光跟著劈的那一段掃 —— 起手看不見,劈下去最亮,收招淡掉
        const k = Math.max(0, Math.min(1, (p - 0.3) / 0.5));
        trail.rotation.z = -0.6 + k * 1.6;
        (trail.material as THREE.MeshBasicMaterial).opacity = Math.sin(k * Math.PI) * 0.42;
      }
      g.rotation.x = Math.sin(Math.min(1, p * 1.6) * Math.PI) * 0.22;
      g.position.y = f.y;
      break;
    }
    case 'reeling': {
      g.rotation.x = -Math.sin(f.phase * Math.PI) * 0.34;
      g.position.y = f.y;
      if (blade) blade.rotation.set(-0.6, 0, 0.9);
      break;
    }
    case 'fleeing': {
      g.position.y = f.y + Math.abs(Math.sin(f.phase * Math.PI * 2)) * 0.075;
      g.rotation.x = 0.14;
      if (blade) blade.rotation.set(-1.2, 0, 0.4);
      break;
    }
    case 'closing': {
      g.position.y = f.y + Math.abs(Math.sin(f.phase * Math.PI * 2)) * 0.05;
      g.rotation.x = 0.06;
      if (blade) blade.rotation.set(-0.9 + Math.sin(t * 3 + f.x) * 0.06, 0, 0.25);
      break;
    }
    default: {
      // 對峙 — 刀舉著,身子輕微晃,別像個立牌
      g.position.y = f.y + Math.sin(t * 2.2 + f.z) * 0.012;
      g.rotation.x = 0.03;
      if (blade) blade.rotation.set(-1.35 + Math.sin(t * 2.6 + f.x) * 0.08, 0, 0.22);
    }
  }

  // 擋/閃壓在姿態的最上層 —— 它比對峙、比逼近都優先,只讓給倒地
  if (guarding && f.stance !== 'down') {
    if (f.guardKind === 'parry') {
      // 架:刀橫過來、身子往後仰一點
      if (blade) blade.rotation.set(-0.35, 0, 1.25);
      g.rotation.x = -0.10;
    } else {
      // 閃:整個人往側後方一撤。yaw 不動 —— 撤步不是轉身
      const k = 1 - (bt - f.guardAt) / 0.22;
      g.rotation.z = 0.20 * k;
      g.position.y = f.y + 0.03 * k;
    }
  } else {
    g.rotation.z = 0;
  }

  if (body) {
    const m = body.material as THREE.MeshStandardMaterial;
    // 挨打閃一下 —— 沒有血條,這是唯一的「中了」回饋
    m.emissive.setRGB(hurtFlash ? 0.45 : 0, 0, 0);
    /*
     * 傷勢畫在<b>身上</b>。
     *
     * 這個系統刻意沒有血條(「重點是畫面上還站著幾個人」),可代價是
     * 一個剩一成血的人和一個沒挨過打的人長得一模一樣 —— 你根本不知道
     * 該補哪一個。衣色乘上一層暗紅:傷得越重,那件袍子越髒越深。
     * 這比血條誠實:你看得出「他快不行了」,但看不出還剩幾點。
     */
    const hurt = 1 - Math.max(0, Math.min(1, f.hp / f.maxHp));
    m.color.setRGB(1 - hurt * 0.42, 1 - hurt * 0.72, 1 - hurt * 0.70);
  }
}
