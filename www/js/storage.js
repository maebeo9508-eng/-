/* 저장소: 설정은 localStorage에. 사생활 보호 모드 등으로 저장이 막혀도 앱은 그대로 동작
   (8단계에서 도면 자동 저장·프로젝트 목록을 더함) */
(function () {
  'use strict';
  const App = (window.App = window.App || {});

  const PREFIX = 'hjdm.';           // 현장도면
  const KEY_SETTINGS = `${PREFIX}settings`;

  const read = (key) => {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? null : JSON.parse(raw);
    } catch (_) {
      return null;
    }
  };
  const write = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  };

  const storage = {
    PREFIX,
    read,
    write,

    /** 저장된 설정을 기본값 위에 얹음. 모르는 값·형식이 다른 값은 버림 (버전이 바뀌어도 안전) */
    loadSettings(defaults, allowed = {}) {
      const saved = read(KEY_SETTINGS);
      const out = { ...defaults };
      if (!saved || typeof saved !== 'object') return out;
      Object.keys(defaults).forEach((k) => {
        const v = saved[k];
        if (v === undefined || typeof v !== typeof defaults[k]) return;
        if (typeof v === 'number' && !Number.isFinite(v)) return;
        if (allowed[k] && !allowed[k].includes(v)) return;
        out[k] = v;
      });
      return out;
    },
    saveSettings(settings) {
      return write(KEY_SETTINGS, settings);
    },

    /** 이 앱이 저장한 것을 모두 지움 (전체 초기화) */
    clearAll() {
      try {
        Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
      } catch (_) { /* 저장소를 못 쓰는 환경 */ }
    },
  };

  App.storage = storage;
})();
