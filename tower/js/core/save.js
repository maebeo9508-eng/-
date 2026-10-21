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
      comps: { owned: {}, active: null },
      potionLv: 0,
      chapters: 1, // 열린 소설 장 수 (프롤로그 = 1)
      seen: {}, // 본 대사
      dex: {}, // 만난 몬스터
      cleared: {}, // 처음 클리어한 스테이지
      stats: { runs: 0, kills: 0, deaths: 0, bosses: 0 },
      freeBoxAt: 0,
      settings: { sound: true, vibe: true, dmgText: true },
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

  G.Save = {
    data: null,
    load() {
      let saved = null;
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) saved = JSON.parse(raw);
      } catch (e) { saved = null; }
      this.data = saved ? merge(defaults(), saved) : defaults();
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
