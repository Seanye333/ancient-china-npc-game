import { useEffect, useState } from 'react';
import { whatNow } from '../game/ending';
import { useHero } from '../game/hero';
import { useVillage } from '../game/village';
import { useClock } from '../world/worldTime';
import { useQuest } from '../game/quest';
import { grainDays } from '../game/daily';
import { GOLD, RUST, FONT } from './style';

/**
 * 眼下該做的事。
 *
 * 不是教學關卡 —— 這個遊戲沒有「按 F 開啟商店」那種東西可教,
 * 新玩家真正卡住的地方是「我現在到底該幹嘛」。
 * 所以這一行講的是處境不是操作:糧快沒了、天黑了還沒地方睡、
 * 手上的活辦妥了該回去覆命。
 *
 * 講處境的提示不會過期:玩到第一百天它還在,只是那時候它說的是別的事。
 * 沒事可提醒的時候它自己消失 —— 這比一個永遠占著位置的教學面板好。
 */
export function Hint() {
  const hero = useHero();
  const village = useVillage();
  const hour = useClock((s) => s.hour);
  const taken = useQuest((s) => s.taken);
  const [, bump] = useState(0);

  // 提示要跟著時辰變,但不必每幀算
  useEffect(() => {
    const h = setInterval(() => bump((n) => n + 1), 1000);
    return () => clearInterval(h);
  }, []);

  const hint = whatNow({
    grainDays: grainDays(hero.grain, hero.followers.length, hero.retinue),
    gold: hero.gold,
    grainPrice: village.grainPrice,
    hour,
    lodging: hero.lodging,
    hasQuest: !!taken,
    questCleared: !!taken?.cleared,
    patronName: taken?.patronName,
    followers: hero.followers.length + hero.retinue,
    toil: hero.toil,
    wounded: hero.wounded,
  });

  if (!hint) return null;

  return (
    <div style={{
      position: 'fixed', left: '50%', bottom: 62, transform: 'translateX(-50%)',
      pointerEvents: 'none', fontFamily: FONT,
      fontSize: '.86rem', letterSpacing: '.03em',
      color: hint.urgent ? RUST : 'rgba(230,226,216,.72)',
      textShadow: '0 1px 6px rgba(0,0,0,.9), 0 0 2px rgba(0,0,0,.9)',
      borderLeft: `2px solid ${hint.urgent ? RUST : GOLD}`,
      paddingLeft: '.6rem',
    }}>
      {hint.text}
    </div>
  );
}
