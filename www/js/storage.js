/* 저장소: 설정·도면은 localStorage에, 크기가 큰 가져온 도면(밑그림) 데이터는 IndexedDB에.
   사생활 보호 모드 등으로 저장이 막혀도 앱은 그대로 동작하고, 저장 실패는 부르는 쪽에서 알림 */
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

  /* ── IndexedDB: 큰 데이터 (열쇠 → 값) ── */
  const DB_NAME = 'hjdm', STORE = 'blobs';
  let dbPromise = null;
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        if (!window.indexedDB) return reject(new Error('IndexedDB 없음'));
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }).catch((e) => {
        dbPromise = null; // 다음에 다시 시도
        throw e;
      });
    }
    return dbPromise;
  }
  async function tx(mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req && req.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('저장 취소됨'));
    });
  }
  const blobs = {
    put: (key, value) => tx('readwrite', (s) => s.put(value, key)),
    get: (key) => tx('readonly', (s) => s.get(key)),
    remove: (key) => tx('readwrite', (s) => s.delete(key)),
    keys: () => tx('readonly', (s) => s.getAllKeys()),
    clear: () => tx('readwrite', (s) => s.clear()),
  };

  const storage = {
    PREFIX,
    read,
    write,
    blobs,
    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch (_) { /* 저장소를 못 쓰는 환경 */ }
    },
    /** 이 앱이 localStorage에 쓴 열쇠들 */
    keys() {
      try {
        return Object.keys(localStorage).filter((k) => k.startsWith(PREFIX));
      } catch (_) {
        return [];
      }
    },

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
    async clearAll() {
      storage.keys().forEach((k) => storage.remove(k));
      try {
        await blobs.clear();
      } catch (_) { /* IndexedDB를 못 쓰는 환경 */ }
    },
  };

  App.storage = storage;
})();
