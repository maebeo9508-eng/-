'use strict';
// 장비·룬 생성과 가격 계산
G.Loot = (function () {
  const U = G.U;
  const FLAT = { atk: 1, hp: 1, def: 1 };

  function themeIdx(ilvl) { return Math.floor((Math.max(1, ilvl) - 1) / 10) % 10; }

  function rollRarity(floor, luck) {
    luck = luck || 0;
    const pool = G.RARITIES.filter((r) => (r.id < 4 || floor >= 8) && (r.id < 5 || floor >= 30));
    // 층이 높을수록, 행운이 높을수록 좋은 등급이 잘 나옵니다
    const climb = Math.min(1.5, floor / 70);
    const r = U.weighted(pool, (x) => x.w * (1 + x.id * (climb + luck) * 0.55));
    return r.id;
  }

  function baseStats(slot, variant, ilvl, rar, wtype) {
    const s = G.S(ilvl) * G.RARITIES[rar].mul * U.rand(0.92, 1.08);
    const k = (rar + 1);
    const st = {};
    switch (slot) {
      case 'weapon':
        st.atk = Math.round(6 * s);
        break;
      case 'hat':
        st.hp = Math.round(28 * s * [1, 1, 0.85, 1.25][variant]);
        st.def = Math.round(2.5 * s * [1, 0.9, 1.35, 0.8][variant]);
        if (variant === 1) st.crit = 0.008 * k;
        break;
      case 'armor':
        st.hp = Math.round(48 * s * [1, 0.9, 1.0, 0.9][variant]);
        st.def = Math.round(4.5 * s * [1, 0.85, 1.35, 0.8][variant]);
        if (variant === 1) st.dodge = 0.01 + 0.004 * k;
        if (variant === 3) st.cdr = 0.01 + 0.005 * k;
        break;
      case 'shoes':
        st.hp = Math.round(18 * s * [1.3, 0.9, 1, 1][variant]);
        st.move = +((0.03 + 0.008 * k) * [1, 1.4, 1.2, 1][variant]).toFixed(3);
        if (variant === 2) st.dodge = 0.008 * k;
        if (variant === 3) st.def = Math.round(2 * s);
        break;
      case 'acc':
        if (variant === 0) { st.atk = Math.round(2 * s); st.crit = 0.015 + 0.007 * k; }
        if (variant === 1) { st.hp = Math.round(22 * s); st.critDmg = 0.06 + 0.035 * k; }
        if (variant === 2) { st.goldP = 0.06 + 0.035 * k; st.aspd = 0.015 + 0.008 * k; }
        if (variant === 3) { st.def = Math.round(1.5 * s); st.aspd = 0.025 + 0.01 * k; }
        break;
    }
    return st;
  }

  function makeItem(slot, ilvl, rar, opts) {
    opts = opts || {};
    ilvl = Math.max(1, Math.round(ilvl));
    const t = opts.theme != null ? opts.theme : themeIdx(ilvl);
    const item = {
      id: U.uid(), slot, ilvl, rar, upg: 0, theme: t, variant: 0, wtype: null,
      stats: null, affixes: [], uniq: null, locked: false, isNew: true,
    };
    let uniq = null;
    if (rar >= 4 && Math.random() < (rar === 5 ? 0.75 : 0.4)) {
      const cands = G.UNIQUES.filter((u) => u.slot === slot && (!opts.wtype || !u.wtype || u.wtype === opts.wtype));
      if (cands.length) uniq = U.pick(cands);
    }
    if (slot === 'weapon') {
      item.wtype = uniq ? uniq.wtype : opts.wtype || U.pick(Object.keys(G.WEAPONS));
    } else {
      item.variant = opts.variant != null ? opts.variant : U.randi(0, 3);
    }
    item.stats = baseStats(slot, item.variant, ilvl, rar, item.wtype);
    // 랜덤 옵션
    const n = G.RARITIES[rar].affix;
    const used = new Set(Object.keys(item.stats));
    const picks = U.weightedN(G.AFFIXES.filter((a) => !used.has(a.stat)), n, (a) => a.w);
    const q = 0.55 + rar * 0.17;
    for (const a of picks) item.affixes.push({ stat: a.stat, val: +(U.rand(a.min, a.max) * q).toFixed(4) });
    if (uniq) { item.uniq = uniq.id; }
    item.name = itemName(item);
    return item;
  }

  function itemName(item) {
    const u = item.uniq && G.UNIQUES.find((x) => x.id === item.uniq);
    if (u) return u.name;
    const th = G.THEMES[item.theme].prefix;
    if (item.slot === 'weapon') return `${th} ${G.WEAPONS[item.wtype].name}`;
    return `${th} ${G.GEAR_VARIANTS[item.slot][item.variant]}`;
  }

  function randomItem(ilvl, luck, minRar) {
    const slot = U.pick(G.SLOTS);
    let rar = rollRarity(ilvl, luck);
    if (minRar != null) rar = Math.max(rar, minRar);
    return makeItem(slot, ilvl, rar);
  }

  // 강화 수치가 반영된 기본 능력치
  function itemStats(item) {
    const m = 1 + 0.07 * item.upg;
    const out = {};
    for (const k in item.stats) out[k] = FLAT[k] ? Math.round(item.stats[k] * m) : item.stats[k] * (1 + 0.03 * item.upg);
    return out;
  }

  function itemPower(item) {
    const st = itemStats(item);
    let p = (st.atk || 0) * 3 + (st.hp || 0) * 0.3 + (st.def || 0) * 1.6;
    const scale = 6 * G.S(item.ilvl) * 3;
    for (const k in st) if (!FLAT[k]) p += st[k] * scale * 1.5;
    for (const a of item.affixes) p += a.val * scale * 1.2;
    if (item.uniq) p *= 1.25;
    return Math.round(p);
  }

  const MAX_UPG = 20;
  function upgradeCost(item) {
    return Math.floor(25 * Math.pow(G.S(item.ilvl), 0.85) * (1 + item.upg * 0.45) * (1 + item.rar * 0.35));
  }
  function salvageValue(item) {
    return Math.floor(8 * Math.pow(G.S(item.ilvl), 0.85) * (1 + item.rar * 0.9) * (1 + item.upg * 0.3));
  }

  function makeRune(type, grade) {
    return { id: U.uid(), type: type || U.pick(Object.keys(G.RUNE_TYPES)), grade: grade || 1 };
  }
  function runeGradeFor(floor) {
    const r = Math.random();
    if (floor >= 70 && r < 0.12) return 3;
    if (floor >= 30 && r < 0.3) return 2;
    return 1;
  }

  function addItemToSave(item) {
    const s = G.Save.data;
    s.inv.push(item);
  }

  return {
    rollRarity, makeItem, randomItem, itemStats, itemPower, upgradeCost, salvageValue,
    makeRune, runeGradeFor, addItemToSave, themeIdx, MAX_UPG, FLAT,
  };
})();
