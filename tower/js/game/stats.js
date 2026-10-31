'use strict';
// 능력치 계산: 주인공 + 장비(+보석) + 룬 + 특성 + 펫 (+ 탑 안에서 얻은 능력·아티팩트)
G.Stats = (function () {
  const PCT_KEYS = ['atkP', 'hpP', 'defP', 'aspd', 'crit', 'critDmg', 'move', 'vamp', 'goldP', 'expP', 'cdr', 'bossDmg',
    'skillDmg', 'burn', 'frost', 'shock', 'poison', 'regen', 'dodge', 'luck', 'allyDmg', 'dmgRed'];

  function empty() {
    const s = { atk: 0, hp: 0, def: 0, potions: 0, revive: 0, choices: 0, uniq: {} };
    for (const k of PCT_KEYS) s[k] = 0;
    return s;
  }

  function add(s, k, v) {
    if (k in s) s[k] += v;
  }

  // 마을에서 정한 것들로 계산되는 능력치
  function meta(save) {
    save = save || G.Save.data;
    const s = empty();
    // 장비 (+ 홈에 낀 보석)
    for (const slot of G.SLOTS) {
      const it = findItem(save, save.eq[slot]);
      if (!it) continue;
      const st = G.Loot.itemStats(it);
      for (const k in st) add(s, k, st[k]);
      for (const a of it.affixes) add(s, a.stat, a.val);
      for (const jid of it.sockets || []) {
        const j = jid && (save.jewels || []).find((x) => x.id === jid);
        if (j && G.GEMS[j.type]) add(s, G.GEMS[j.type].stat, G.GEMS[j.type].vals[j.grade - 1]);
      }
      if (it.uniq) {
        const u = G.UNIQUES.find((x) => x.id === it.uniq);
        if (u) {
          s.uniq[u.effect] = true;
          if (u.effect === 'vamp') s.vamp += 0.06;
          if (u.effect === 'turtle') { s.dmgRed += 0.18; s.move -= 0.08; }
          if (u.effect === 'goldBell') { s.goldP += 0.5; s.luck += 0.3; }
          if (u.effect === 'hourglass') s.cdr += 0.25;
          if (u.effect === 'revive') s.revive += 1;
        }
      }
    }
    // 룬
    for (let i = 0; i < save.runeSlotsOpen; i++) {
      const r = save.runes.find((x) => x.id === save.runeSlots[i]);
      if (!r) continue;
      const def = G.RUNE_TYPES[r.type];
      add(s, def.stat, def.vals[r.grade - 1]);
    }
    // 특성
    for (const tree of G.TRAIT_TREES) {
      for (const n of tree.nodes) {
        const lv = save.traits[n.id] || 0;
        if (lv) add(s, n.stat, n.per * lv);
      }
    }
    // 펫
    const pet = G.PETS[save.pets.active];
    if (pet) {
      const lv = save.pets.owned[save.pets.active] || 1;
      for (const k in pet.passive) add(s, k, pet.passive[k] + (pet.per[k] || 0) * (lv - 1));
    }
    // 주인공 고유 특성
    const heroKey = G.HEROES[save.hero] ? save.hero : 'mochi';
    const hero = G.HEROES[heroKey];
    const fx = hero.trait.fx;
    if (fx === 'yarnArmor') s.dmgRed += 0.12;
    if (fx === 'needle') s.crit += 0.05;
    if (fx === 'fluffy') s.regen += 0.006;
    if (fx === 'merchant') s.goldP += 0.35;
    if (fx === 'arcane') { s.skillDmg += 0.3; s.cdr += 0.15; }
    if (fx === 'clockwork') s.aspd += 0.15;
    if (fx === 'hunter') s.bossDmg += 0.3;
    if (fx === 'blessing') s.revive += 1;

    const w = findItem(save, save.eq.weapon);
    const wtype = w && G.WEAPONS[w.wtype] ? w.wtype : hero.weapon;
    const W = G.WEAPONS[wtype];
    if (W.crit) s.crit += W.crit;
    if (W.critDmg) s.critDmg += W.critDmg;
    if (W.vamp) s.vamp += W.vamp;
    const out = finalize(s, wtype, hero, save.comps.owned[heroKey] || 1);
    out.noWeapon = !w;
    out.weaponItem = w || null;
    out.hero = heroKey;
    out.trait = fx;
    out.favored = wtype === hero.weapon;
    if (out.noWeapon) out.atk *= 0.7;
    out.power = power(out);
    return out;
  }

  // 주인공 레벨 1당 체력·공격력 +6%
  const heroLvMul = (lv) => 1 + 0.06 * (lv - 1);

  function finalize(s, wtype, hero, lv) {
    const W = G.WEAPONS[wtype];
    const H = hero.stats, L = heroLvMul(lv);
    const fav = wtype === hero.weapon ? 1 + G.FAVORED_BONUS : 1;
    const o = {
      raw: s,
      wtype, weapon: W,
      atk: (10 + s.atk) * (1 + s.atkP) * H.atk * L * fav,
      maxHp: (100 + s.hp) * (1 + s.hpP) * H.hp * L,
      def: (4 + s.def) * (1 + s.defP) * H.def,
      aspd: 1 + s.aspd,
      crit: Math.min(1, 0.05 + s.crit + (H.crit || 0)),
      critDmg: 1.5 + s.critDmg,
      move: 105 * Math.max(0.6, 1 + s.move) * H.move,
      vamp: s.vamp,
      goldP: s.goldP,
      expP: s.expP,
      cdr: Math.min(0.6, s.cdr),
      bossDmg: s.bossDmg,
      skillDmg: s.skillDmg,
      burn: s.burn, frost: s.frost, shock: s.shock, poison: s.poison,
      regen: s.regen,
      dodge: Math.min(0.4, s.dodge),
      luck: s.luck,
      allyDmg: s.allyDmg,
      dmgRed: Math.min(0.6, s.dmgRed),
      potions: 3 + s.potions,
      revive: s.revive,
      choices: s.choices,
      uniq: s.uniq,
    };
    return o;
  }

  function power(o) {
    const W = o.weapon;
    const dps = o.atk * W.atkMul * W.rate * 0.55 * o.aspd * (1 + o.crit * (o.critDmg - 1));
    return Math.round(dps * 4 + o.maxHp * 0.35 + o.def * 2);
  }

  // 탑 안의 능력(레벨업 선택)과 아티팩트를 반영한 전투용 능력치
  function run(m, ab, arts) {
    const L = (id) => ab[id] || 0;
    const A = {};
    const fx = {};
    for (const id of arts || []) {
      const d = G.artifactDef(id);
      if (!d) continue;
      if (d.fx) fx[d.fx] = true;
      for (const k in d.mod || {}) A[k] = (A[k] || 0) + d.mod[k];
    }
    const a = (k) => A[k] || 0;
    const r = Object.assign({}, m);
    r.arts = arts || [];
    r.fx = fx;
    r.atk = m.atk * (1 + 0.18 * L('atk')) * (1 + 0.22 * L('giant')) * (1 + a('atkM'));
    r.aspd = m.aspd * (1 + 0.15 * L('aspd')) * Math.max(0.3, 1 + a('aspdM'));
    r.crit = Math.min(1, m.crit + 0.08 * L('crit') + a('crit'));
    r.critDmg = m.critDmg + 0.15 * L('crit');
    r.maxHp = m.maxHp * (1 + 0.2 * L('hp')) * Math.max(0.3, 1 + a('hpM'));
    r.move = m.move * (1 + 0.12 * L('move')) * (1 + a('moveM'));
    r.vamp = m.vamp + 0.03 * L('vamp') + a('vamp');
    r.goldP = m.goldP + 0.25 * L('luck') + a('goldP');
    r.expP = m.expP + a('expP');
    r.luck = m.luck + 0.15 * L('luck') + a('luck');
    r.cdr = Math.min(0.65, m.cdr + 0.15 * L('cdr') + a('cdr'));
    r.bossDmg = m.bossDmg + 0.25 * L('hunter') + a('bossDmg');
    r.allyDmg = m.allyDmg + 0.4 * L('petpow');
    r.dmgRed = Math.min(0.7, m.dmgRed + a('dmgRed'));
    r.dmgTaken = a('dmgTaken');
    r.burn = m.burn + 0.35 * L('burn');
    r.frost = m.frost + 0.35 * L('frost');
    r.poison = m.poison + 0.4 * L('poison');
    r.shock = m.shock + 0.25 * L('shock');
    r.multi = L('multi') + a('multi');
    r.diag = L('diag');
    r.rear = L('rear');
    r.pierce = L('pierce') + (m.trait === 'hunter' ? 1 : 0);
    r.bounce = L('bounce');
    r.wave = L('wave') + a('wave') + (m.uniq.swordWave ? 1 : 0);
    r.orbit = L('orbit');
    r.bubbleCd = L('bubble') ? 13 - 3 * L('bubble') : 0;
    r.killheal = 0.015 * L('killheal');
    r.explode = L('explode');
    r.pickup = 70 * (1 + 0.7 * L('magnet')) * (1 + a('pickupM'));
    r.size = 1 + 0.15 * L('giant');
    r.reach = (1 + 0.15 * L('reach') + a('reach')) * (m.trait === 'needle' ? 1.1 : 1);
    r.finisher = 0.4 * L('combo') + a('finisher') + (m.trait === 'brave' ? 0.35 : 0);
    r.execute = a('execute');
    r.meteorLv = L('meteor');
    r.thunderLv = L('thunder');
    r.rage = 0.25 * L('rage') + a('rage');
    r.dashLv = L('dash');
    r.dashCdM = (1 + a('dashCdM')) * (m.trait === 'clockwork' ? 0.8 : 1);
    r.revive = m.revive + L('revive') + a('revive');
    r.ultRate = (1 + 0.25 * L('ultcharge') + 0.15 * L('cdr') + a('ultRate'));
    r.clearHeal = 0.15 * L('firstaid') + (fx.springwater ? 0.15 : 0);
    return r;
  }

  function findItem(save, id) {
    if (!id) return null;
    return save.inv.find((x) => x.id === id) || null;
  }

  return { meta, run, findItem, power };
})();
