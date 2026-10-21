'use strict';
// 저장 데이터. localStorage가 막힌 환경(사생활 보호 모드 등)에서도 게임은 메모리로 계속 동작합니다.
(function () {
  const KEY = 'mongle_tower_save_v1';

  function defaults() {
    return {
      v: 1,
      created: Date.now(),
      gold: 120,
      gems: 20,
      shards: 0,
      best: 0, // 최고 도달 층
      checkpoint: 0, // 처치한 가장 높은 보스 층 (0, 10, 20 ...)
      inv: [],
      eq: { weapon: null, hat: null, armor: null, shoes: null, acc: null },
      runes: [],
      runeSlots: [null, null, null, null, null, null],
      runeSlotsOpen: 2,
      traits: {},
      skills: { owned: ['spin', 'heal'], eq: ['spin', 'heal'], lv: {} },
      pets: { owned: { chick: 1 }, active: 'chick' },
      comps: { owned: { mungchi: 1, bopul: 1, poksin: 1 }, team: ['mungchi', 'bopul', 'poksin'] },
      potionLv: 0,
      chapters: 1, // 열린 소설 장 수 (프롤로그 = 1)
      seen: {}, // 본 대사
      dex: {}, // 만난 몬스터
      cleared: {}, // 처음 클리어한 스테이지
      stats: { runs: 0, kills: 0, deaths: 0, bosses: 0 },
      freeBoxAt: 0,
      settings: { sound: true, vibe: true, dmgText: true, auto: true, autoProgress: false, speed: 1 },
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

  // 예전 저장(동료 1명 동행)을 팀 편성 방식으로 바꿉니다
  function migrate(d) {
    const c = d.comps;
    if (!Array.isArray(c.team)) c.team = defaults().comps.team;
    if (c.active && !c.team.includes(c.active)) c.team[0] = c.active;
    delete c.active;
    c.team = c.team.filter((k, i) => k && c.owned[k] != null && c.team.indexOf(k) === i).slice(0, 3);
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
