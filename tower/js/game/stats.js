'use strict';
// 능력치 계산: 기본 + 장비 + 룬 + 특성 + 펫/동료 (+ 탑 안에서 얻은 능력)
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
    // 장비
    for (const slot of G.SLOTS) {
      const it = findItem(save, save.eq[slot]);
      if (!it) continue;
      const st = G.Loot.itemStats(it);
      for (const k in st) add(s, k, st[k]);
      for (const a of it.affixes) add(s, a.stat, a.val);
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
    // 동료
    for (const k of save.comps.team || []) {
      const comp = G.COMPANIONS[k];
      if (comp && comp.goldP) s.goldP += comp.goldP;
    }

    const w = findItem(save, save.eq.weapon);
    const wtype = w ? w.wtype : 'sword';
    const out = finalize(s, wtype);
    out.noWeapon = !w;
    out.weaponItem = w || null;
    return out;
  }

  function finalize(s, wtype) {
    const W = G.WEAPONS[wtype];
    const o = {
      raw: s,
      wtype, weapon: W,
      atk: (10 + s.atk) * (1 + s.atkP),
      maxHp: (100 + s.hp) * (1 + s.hpP),
      def: (4 + s.def) * (1 + s.defP),
      aspd: 1 + s.aspd,
      crit: Math.min(1, 0.05 + s.crit),
      critDmg: 1.5 + s.critDmg,
      move: 105 * Math.max(0.6, 1 + s.move),
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
    o.power = power(o);
    return o;
  }

  function power(o) {
    const W = o.weapon;
    const dps = o.atk * W.atkMul * W.rate * o.aspd * (1 + o.crit * (o.critDmg - 1));
    return Math.round(dps * 4 + o.maxHp * 0.35 + o.def * 2);
  }

  // 탑 안의 능력(레벨업 선택)을 반영한 전투용 능력치
  function run(m, ab) {
    const L = (id) => ab[id] || 0;
    const r = Object.assign({}, m);
    r.atk = m.atk * (1 + 0.18 * L('atk')) * (1 + 0.22 * L('giant'));
    r.aspd = m.aspd * (1 + 0.15 * L('aspd'));
    r.crit = Math.min(1, m.crit + 0.08 * L('crit'));
    r.critDmg = m.critDmg + 0.15 * L('crit');
    r.maxHp = m.maxHp * (1 + 0.2 * L('hp'));
    r.move = m.move * (1 + 0.12 * L('move'));
    r.vamp = m.vamp + 0.03 * L('vamp');
    r.goldP = m.goldP + 0.25 * L('luck');
    r.luck = m.luck + 0.15 * L('luck');
    r.cdr = Math.min(0.65, m.cdr + 0.15 * L('cdr'));
    r.bossDmg = m.bossDmg + 0.25 * L('hunter');
    r.allyDmg = m.allyDmg + 0.4 * L('petpow');
    r.burn = m.burn + 0.35 * L('burn');
    r.frost = m.frost + 0.35 * L('frost');
    r.poison = m.poison + 0.4 * L('poison');
    r.shock = m.shock + 0.25 * L('shock');
    r.multi = L('multi') + (m.uniq.extraProj ? 0 : 0);
    r.diag = L('diag');
    r.rear = L('rear');
    r.pierce = L('pierce');
    r.bounce = L('bounce');
    r.wave = L('wave') + (m.uniq.swordWave ? 1 : 0);
    r.orbit = L('orbit');
    r.bubbleCd = L('bubble') ? 13 - 3 * L('bubble') : 0;
    r.killheal = 0.015 * L('killheal');
    r.explode = L('explode');
    r.pickup = 70 * (1 + 0.7 * L('magnet'));
    r.size = 1 + 0.15 * L('giant');
    r.meteorLv = L('meteor');
    r.thunderLv = L('thunder');
    r.rage = 0.25 * L('rage');
    r.dashLv = L('dash');
    r.revive = m.revive + L('revive');
    // 팀 능력
    r.ultRate = 1 + 0.25 * L('rally');
    r.compRed = 0.15 * L('guard');
    r.clearHeal = 0.15 * L('firstaid');
    r.compRevive = L('comeback') ? 12 - 2 * L('comeback') : 0;
    return r;
  }

  function findItem(save, id) {
    if (!id) return null;
    return save.inv.find((x) => x.id === id) || null;
  }

  return { meta, run, findItem, power };
})();
