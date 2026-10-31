'use strict';
// 저장 데이터. localStorage가 막힌 환경(사생활 보호 모드 등)에서도 게임은 메모리로 계속 동작합니다.
(function () {
  const KEY = 'mongle_tower_save_v1';

  function defaults() {
    return {
      v: 1,
      created: Date.now(),
      gold: 120,
      gems: 20, // 마석 (화폐)
      shards: 0,
      best: 0, // 최고 도달 층
      checkpoint: 0, // 처치한 가장 높은 보스 층 (0, 10, 20 ...)
      inv: [],
      eq: { weapon: null, hat: null, armor: null, shoes: null, acc: null },
      runes: [],
      jewels: [], // 보석 (장비 홈에 끼우는 아이템)
      runeSlots: [null, null, null, null, null, null],
      runeSlotsOpen: 2,
      traits: {},
      skills: { owned: ['spin', 'heal'], eq: ['spin'], lv: {} },
      pets: { owned: { chick: 1 }, active: 'chick' },
      hero: 'mochi', // 탑에 오를 주인공
      comps: { owned: { mochi: 1, mungchi: 1, bopul: 1, poksin: 1 } }, // 함께하는 주인공들과 레벨
      potionLv: 0,
      chapters: 1, // 열린 소설 장 수 (프롤로그 = 1)
      seen: {}, // 본 대사
      dex: {}, // 만난 몬스터
      cleared: {}, // 처음 클리어한 스테이지
      stats: { runs: 0, kills: 0, deaths: 0, bosses: 0 },
      freeBoxAt: 0,
      settings: { sound: true, vibe: true, dmgText: true, pixel: true },
      started: false,
    };
  }

  function merge(base, saved) {
    for (const k in saved) {
      if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) && saved[k] && typeof saved[k] === 'object' && !Array.isArray(saved[k])) {
        merge(base[k], saved[k]);
      } else {
        base[k] = saved[k];
      }
    }
    return base;
  }

  // 예전 저장을 지금 방식으로 바꿉니다
  //  - 팀 편성 → 주인공 선택 (모찌와 친구들 모두 고를 수 있는 주인공)
  //  - 보조 능력치 룬 → 같은 효과의 보석, 사라진 무기 종류 → 새 무기
  function migrate(d) {
    const c = d.comps;
    c.owned.mochi = c.owned.mochi || 1;
    delete c.team;
    delete c.active;
    if (!G.HEROES[d.hero] || c.owned[d.hero] == null) d.hero = 'mochi';
    if (!Array.isArray(d.jewels)) d.jewels = [];
    const slotted = new Set(d.runeSlots.filter(Boolean));
    d.runes = d.runes.filter((r) => {
      if (G.RUNE_TYPES[r.type]) return true;
      const gem = G.RUNE_TO_GEM[r.type];
      if (gem) d.jewels.push({ id: r.id, type: gem, grade: r.grade });
      if (slotted.has(r.id)) d.runeSlots[d.runeSlots.indexOf(r.id)] = null;
      return false;
    });
    for (const it of d.inv) {
      if (it.wtype && G.WEAPON_RENAME[it.wtype]) it.wtype = G.WEAPON_RENAME[it.wtype];
      if (it.uniq && G.UNIQUE_RENAME[it.uniq]) it.uniq = G.UNIQUE_RENAME[it.uniq];
      if (!Array.isArray(it.sockets)) it.sockets = new Array(G.GEM_SOCKETS[it.rar] || 0).fill(null);
    }
    d.skills.eq = d.skills.eq.filter((k) => G.ACTIVE_SKILLS[k]).slice(0, 1);
    if (!d.skills.eq.length) d.skills.eq = ['spin'];
    for (const k of ['auto', 'autoProgress', 'speed']) delete d.settings[k];
    return d;
  }

  G.Save = {
    data: null,
    load() {
      let saved = null;
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) saved = JSON.parse(raw);
      } catch (e) { saved = null; }
      this.data = saved ? migrate(merge(defaults(), saved)) : defaults();
      return this.data;
    },
    persist() {
      try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* 저장 불가 환경 */ }
    },
    reset() {
      try { localStorage.removeItem(KEY); } catch (e) { /* 무시 */ }
      this.data = defaults();
    },
    defaults,
  };
})();
