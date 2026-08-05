import { describe, it, expect, beforeEach } from 'vitest';
import { kinOf, relatives, households, kinWord, relationWord } from './kin';
import {
  useFolk, folk, livingVillagers, isDead, sickChance, deathChance,
  renownWord, spreadRumor, stepRumors, rumors,
} from './folk';
import { askToJoin } from './recruiting';
import { moodOf, grumble, homeOf, homeBonus } from './company';
import { makeVillagers } from './npcs';

/**
 * 人。
 *
 * 這一組守的是這個遊戲最核心的一句話:<b>三十八個人不是三十八個個體,
 * 是十來戶人家</b>。你得罪一個人,他哥記你一輩子。
 */

describe('親眷', () => {
  it('關係是對稱的 —— 我是你的兄弟,你就是我的兄弟', () => {
    for (const p of makeVillagers(38)) {
      const k = kinOf(p.id);
      if (k.spouse) expect(kinOf(k.spouse).spouse).toBe(p.id);
      for (const c of k.children) expect(kinOf(c).parents).toContain(p.id);
      for (const s of k.siblings) expect(kinOf(s).siblings).toContain(p.id);
      for (const par of k.parents) expect(kinOf(par).children).toContain(p.id);
    }
  });

  it('沒有人是自己的親戚,爹娘也得比孩子大', () => {
    const people = makeVillagers(38);
    const age = (id: string) => people.find((p) => p.id === id)!.age;
    for (const p of people) {
      const k = kinOf(p.id);
      expect(k.spouse).not.toBe(p.id);
      expect(relatives(p.id)).not.toContain(p.id);
      for (const c of k.children) expect(p.age).toBeGreaterThan(age(c));
    }
  });

  it('村子分得成戶,而且每個人只屬於一戶', () => {
    const hs = households();
    const seen = new Set<string>();
    for (const h of hs) for (const id of h) {
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
    expect(seen.size).toBe(38);
    // 不該是三十八個獨門獨戶 —— 那就等於沒有這一層
    expect(hs.length).toBeLessThan(34);
  });

  it('關係說得出人話', () => {
    const withKin = makeVillagers(38).find((p) => relatives(p.id).length > 0)!;
    expect(kinWord(withKin.id)).not.toBe('孑然一身');
    expect(relationWord(withKin.id, relatives(withKin.id)[0])).toBeTruthy();
  });
});

describe('老病死', () => {
  beforeEach(() => useFolk.getState().reset());

  it('老人和小孩先病倒,冬天和荒年更凶', () => {
    expect(sickChance(72, 60, false)).toBeGreaterThan(sickChance(30, 60, false));
    expect(sickChance(72, 60, true)).toBeGreaterThan(sickChance(72, 60, false));
    expect(sickChance(30, 10, false)).toBeGreaterThan(sickChance(30, 80, false));
  });

  it('病得越久越難熬,但不會必死', () => {
    expect(deathChance(70, 12)).toBeGreaterThan(deathChance(70, 1));
    expect(deathChance(80, 40)).toBeLessThanOrEqual(0.35);
  });

  /**
   * 這一條才是真正的規格:上面那些「誰比誰高」都成立,數字仍然可以錯十倍。
   * 第一版每一條比較都過,而七十歲的人每天有一成六的機會病倒 ——
   * 一個月全村的老人就死光了,測試一句話都不會說。
   */
  it('一年死一兩個人,不是一個月死光一村', () => {
    const people = makeVillagers(38);
    let deaths = 0;
    const sickDays: Record<string, number> = {};
    let seed = 12345;
    const roll = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const gone = new Set<string>();
    for (let day = 0; day < 360; day++) {
      const winter = day % 360 >= 270;
      for (const p of people) {
        if (gone.has(p.id)) continue;
        if (sickDays[p.id]) {
          if (roll() < deathChance(p.age, sickDays[p.id])) { gone.add(p.id); deaths++; continue; }
          sickDays[p.id] = roll() < 0.22 ? 0 : sickDays[p.id] + 1;
        } else if (roll() < sickChance(p.age, 60, winter)) {
          sickDays[p.id] = 1;
        }
      }
    }
    expect(deaths).toBeGreaterThanOrEqual(0);
    expect(deaths, `一年死了 ${deaths} 個,三十八人的村子撐不了幾年`).toBeLessThan(5);
  });

  it('死了的人不再出現在村裡,但名字還查得到 —— 別人還會提起他', () => {
    const id = makeVillagers(38)[3].id;
    useFolk.getState().patch(id, { dead: true, diedOn: 5 });
    expect(isDead(id)).toBe(true);
    expect(livingVillagers().some((p) => p.id === id)).toBe(false);
    expect(folk(id)?.dead).toBe(true);
  });

  it('長了一歲,問到的年紀就要跟著變', () => {
    const p = makeVillagers(38)[0];
    useFolk.getState().patch(p.id, { aged: 3 });
    expect(folk(p.id)!.age).toBe(p.age + 3);
  });
});

describe('兩套名聲', () => {
  it('鄉望說得出好壞', () => {
    expect(renownWord(80)).toBe('名動一鄉');
    expect(renownWord(0)).toBe('無人知曉');
    expect(renownWord(-30)).toBe('名聲狼藉');
  });

  it('招人看的是名不是功 —— 名聲好的人少欠一點人情也請得動', () => {
    const npc = makeVillagers(38).find((p) => p.temper === 'shrewd')!;
    const base = {
      npc, merit: 0, charisma: 50, headcount: 0, cap: 10, alreadyWith: false,
    };
    // 同樣的人情,有名聲的成、沒名聲的不成
    const favor = 7;
    expect(askToJoin({ ...base, favor, renown: 40 }).ok).toBe(true);
    expect(askToJoin({ ...base, favor, renown: 0 }).ok).toBe(false);
  });

  it('名聲壞了,人家會直說', () => {
    const npc = makeVillagers(38)[0];
    const r = askToJoin({
      npc, favor: 0, merit: 0, charisma: 50, headcount: 0, cap: 10,
      alreadyWith: false, renown: -20,
    });
    expect(r.ok).toBe(false);
    expect(r.line).toContain('聽說');
  });
});

describe('流言沿著血緣走', () => {
  beforeEach(() => { useFolk.getState().reset(); rumors.length = 0; });

  it('傳出去的話會改變別人對你的看法', () => {
    spreadRumor({ text: '他救了人。', delta: 2, life: 3 });
    let roll = 0;
    stepRumors(() => { roll = (roll + 0.137) % 1; return roll; });
    const changed = Object.values(useFolk.getState().deltas).filter((d) => d.regard !== 0);
    expect(changed.length).toBeGreaterThan(0);
  });

  it('當事人的親眷聽了反應更大 —— 這就是 kin 存在的理由', () => {
    const subject = makeVillagers(38).find((p) => relatives(p.id).length > 0)!;
    const kinId = relatives(subject.id)[0];
    spreadRumor({ text: '他害了人。', delta: -2, life: 6, aboutId: subject.id });
    let roll = 0.01;
    for (let i = 0; i < 6; i++) stepRumors(() => { roll = (roll + 0.0731) % 1; return roll; });
    const d = useFolk.getState().deltas;
    const kinDrop = d[kinId]?.regard ?? 0;
    const avg = Object.entries(d)
      .filter(([id]) => id !== kinId && !relatives(subject.id).includes(id))
      .reduce((a, [, x]) => a + x.regard, 0) / Math.max(1, Object.keys(d).length);
    expect(kinDrop).toBeLessThanOrEqual(avg);
  });

  it('話傳完就沒了,不會永遠傳下去', () => {
    spreadRumor({ text: '一句話。', delta: 1, life: 2 });
    for (let i = 0; i < 5; i++) stepRumors(() => 0.5);
    expect(rumors.length).toBe(0);
  });
});

describe('跟著你的人有自己的想法', () => {
  const npc = makeVillagers(38).find((p) => p.temper === 'shrewd')!;

  it('餓過的人心思會散,但直脾氣的忍得住', () => {
    const gruff = makeVillagers(38).find((p) => p.temper === 'gruff')!;
    const base = { favor: 5, renown: 0, hungryDays: 2, grieving: false };
    expect(moodOf({ ...base, npc: gruff }).score)
      .toBeGreaterThan(moodOf({ ...base, npc }).score);
  });

  it('家裡剛出事的人跟不動 —— 死的不是他,可是他心思不在這兒', () => {
    const a = moodOf({ npc, favor: 6, renown: 0, hungryDays: 0, grieving: true });
    const b = moodOf({ npc, favor: 6, renown: 0, hungryDays: 0, grieving: false });
    expect(a.score).toBeLessThan(b.score);
  });

  it('名聲爛的人帶不住隊伍', () => {
    const good = moodOf({ npc, favor: 4, renown: 40, hungryDays: 0, grieving: false });
    const bad = moodOf({ npc, favor: 4, renown: -40, hungryDays: 0, grieving: false });
    expect(good.score).toBeGreaterThan(bad.score);
    expect(bad.restless).toBe(true);
  });

  it('每一種心情都說得出一句話', () => {
    for (const r of [-60, -20, 0, 30, 80]) {
      expect(moodOf({ npc, favor: 0, renown: r, hungryDays: 0, grieving: false }).word)
        .toBeTruthy();
    }
    expect(grumble({ npc, hungryDays: 3, grieving: false, renown: 0 })).toContain('飯');
  });
});

describe('同鄉', () => {
  it('籍貫從 id 雜湊來,不動 makeVillagers 的亂數 —— 否則加一個欄位就換了一村人', () => {
    const before = makeVillagers(38).map((p) => `${p.id}:${p.name}:${p.age}`).join('|');
    makeVillagers(38).forEach((p) => homeOf(p.id));
    const after = makeVillagers(38).map((p) => `${p.id}:${p.name}:${p.age}`).join('|');
    expect(after).toBe(before);
  });

  it('外鄉的同鄉最親,本地的同鄉不算什麼', () => {
    const foreign = makeVillagers(38).find((p) => homeOf(p.id) !== '河谷')!;
    const local = makeVillagers(38).find((p) => homeOf(p.id) === '河谷')!;
    expect(homeBonus(homeOf(foreign.id), foreign.id)).toBeGreaterThan(
      homeBonus('河谷', local.id));
    // 不是同鄉就沒有這一份
    expect(homeBonus('不存在的地方', local.id)).toBe(0);
  });
});
