import { useHero } from './hero';
import { useVillage } from './village';
import { useBands } from './bands';
import { useQuest } from './quest';
import { useJournal } from './journal';
import { useFolk } from './folk';
import { useCalamity } from './calamity';
import { convoy, useConvoy } from './convoy';
import { useEnding } from './ending';
import { useMarauders } from './marauders';
import { useRefugees } from './refugees';
import { useVendetta } from './vendetta';
import { useFair } from './fair';
import { lifeTally } from './daily';
import { useClock } from '../world/worldTime';
import { settleGuard } from './daily';

/**
 * 存檔。
 *
 * 有了日子、糧、租金以後,「關掉分頁一切歸零」就不再只是不方便 ——
 * 它讓這個遊戲<b>沒法真的玩一局</b>:過冬這件事本身要好幾個鐘頭的遊戲時間。
 *
 * 兩條規矩:
 *
 * 一、<b>只存決定,不存推導</b>。存 day 不存 season(季節從日子算),
 *     存 merit 不存品階,存 routed 不存煙。派生的東西存下來,遲早會和來源對不上,
 *     而那種錯最難查:讀檔以後世界「差一點點」,但你不知道差在哪。
 * 二、<b>版本對不上就當沒有存檔</b>,不做遷移。原型階段欄位天天改,
 *     寫遷移的成本遠大於重開一局;但要說清楚,不能默默吃掉玩家的進度。
 */

const KEY = 'baishen.save.v1';
// 2:傷有了形狀(woundKind/scars)。版本不合就丟 —— 舊檔缺欄位,
// undefined 混進帳裡是 NaN 的溫床
const VERSION = 2;

interface SaveData {
  v: number;
  at: number;
  clock: { day: number; hour: number; weather: string };
  hero: ReturnType<typeof heroSlice>;
  village: { order: number; harvest: number; trade: number; grainPrice: number };
  bands: Array<{ id: string; routed: boolean; count: number; fierce: number }>;
  quest: unknown;
  journal: unknown;
  /** 村民後來怎麼了 —— 不存的話讀檔以後死人會復活。 */
  folk: unknown;
  calamity: unknown;
  /** 押到一半的車。不存的話,押貨途中讀檔 = 貨憑空消失,而差事還掛著。 */
  convoy: unknown;
  marauders: unknown;
  refugees: unknown;
  grudges: unknown;
  /** 擂台打到第幾場 —— 比到一半讀檔丟兩場勝利,那就是搶劫。 */
  fair: unknown;
  /**
   * 一生的流水帳(誰跟過你、剿了幾夥)與推掉過的收場。
   * 不存的話,讀檔以後落幕那頁「跟過你的人」是空的 ——
   * 而那一頁的全部意義就是名字。
   */
  tally: unknown;
  declined: unknown;
}

function heroSlice() {
  const h = useHero.getState();
  return {
    name: h.name, courtesy: h.courtesy, hometown: h.hometown,
    stats: h.stats, merit: h.merit, gold: h.gold, grain: h.grain,
    retinue: h.retinue, followers: h.followers, renown: h.renown, weapon: h.weapon,
    favors: h.favors, wounded: h.wounded, woundKind: h.woundKind, scars: h.scars,
    lodging: h.lodging, rentPaidThrough: h.rentPaidThrough, toil: h.toil,
  };
}

export function saveGame(): boolean {
  try {
    const c = useClock.getState();
    const v = useVillage.getState();
    const data: SaveData = {
      v: VERSION,
      at: Date.now(),
      clock: { day: c.day, hour: c.hour, weather: c.weather },
      hero: heroSlice(),
      village: { order: v.order, harvest: v.harvest, trade: v.trade, grainPrice: v.grainPrice },
      // 賊窩只存會變的三個欄位;座標與名字由種子決定,存了反而會和世界生成對不上
      bands: useBands.getState().bands.map((b) => ({
        id: b.id, routed: b.routed, count: b.count, fierce: b.fierce,
      })),
      quest: useQuest.getState().taken,
      journal: useJournal.getState().entries,
      folk: useFolk.getState().deltas,
      calamity: useCalamity.getState().active,
      convoy: convoy.car,
      marauders: { phase: useMarauders.getState().phase, daysLeft: useMarauders.getState().daysLeft },
      refugees: useRefugees.getState().band,
      // 仇家記著你的臉 —— 讀了檔就忘,那筆帳等於沒發生過
      grudges: useVendetta.getState().grudges,
      fair: {
        round: useFair.getState().round,
        out: useFair.getState().out,
        champion: useFair.getState().champion,
      },
      tally: {
        ...lifeTally,
        companions: [...lifeTally.companions],
        lost: [...lifeTally.lost],
      },
      declined: useEnding.getState().declined,
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function hasSave(): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    return (JSON.parse(raw) as SaveData).v === VERSION;
  } catch {
    return false;
  }
}

export function loadGame(): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const data = JSON.parse(raw) as SaveData;
    if (data.v !== VERSION) return false;

    useHero.setState(data.hero);
    useVillage.setState(data.village);
    useQuest.setState({ taken: data.quest as never });
    useJournal.setState({ entries: (data.journal as never) ?? [], unread: 0 });
    useFolk.setState({ deltas: (data.folk as never) ?? {} });
    useCalamity.setState({ active: (data.calamity as never) ?? null });
    convoy.car = (data.convoy as never) ?? null;
    if (data.marauders) useMarauders.setState(data.marauders as never);
    useRefugees.setState({ band: (data.refugees as never) ?? null });
    useVendetta.getState().reset((data.grudges as never) ?? {});
    if (data.fair) useFair.setState(data.fair as never);
    useConvoy.getState().bump();
    if (data.tally) {
      const t = data.tally as {
        starvingDays: number; sickDays: number; bandsCleared: number;
        errandsDone: number; companions: string[]; lost: string[];
      };
      lifeTally.starvingDays = t.starvingDays ?? 0;
      lifeTally.sickDays = t.sickDays ?? 0;
      lifeTally.bandsCleared = t.bandsCleared ?? 0;
      lifeTally.errandsDone = t.errandsDone ?? 0;
      lifeTally.companions = new Set(t.companions ?? []);
      lifeTally.lost = new Set(t.lost ?? []);
    }
    useEnding.setState({ declined: (data.declined as never) ?? [], life: null });
    useBands.setState((s) => ({
      bands: s.bands.map((b) => {
        const saved = data.bands.find((x) => x.id === b.id);
        return saved ? { ...b, ...saved } : b;
      }),
    }));
    // 時鐘最後放 —— 它一動就會觸發跨日結算,得等其餘狀態都到位。
    // 而且要先落閘:存的是結算之後的狀態,那些日子不能再結一遍
    settleGuard.skipUntil = data.clock.day;
    useClock.setState({
      day: data.clock.day, hour: data.clock.hour,
      weather: data.clock.weather as never,
    });
    return true;
  } catch {
    return false;
  }
}

export function wipeSave() {
  try { localStorage.removeItem(KEY); } catch { /* 無痕模式會丟,無所謂 */ }
}

export function savedAt(): number | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return (JSON.parse(raw) as SaveData).at ?? null;
  } catch {
    return null;
  }
}
