/* 넣은 이미지(현수막·백월·벽보·바닥 그림 등): 사진첩에서 골라 알맞은 크기로 줄여 이 기기(IndexedDB)에 저장.
   도면에는 이미지 id만 들어가고, 백업 파일에는 이미지도 함께 담긴다. */
(function () {
  'use strict';
  const App = (window.App = window.App || {});

  const MAX_SIDE = 1600;            // 긴 변을 이 픽셀로 줄여 저장 (현수막 글자가 3D에서 읽힐 만큼)
  const KEY = (id) => `image:${id}`;
  const cache = new Map();          // id → { name, w, h, data(dataURL), img(HTMLImageElement|null), state: 'loading'|'ready'|'missing' }
  const newId = () => `img-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

  const notify = () => {
    if (App.ui) App.ui.emit('images');
    if (App.plan) App.plan.requestRender();
  };

  function decode(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'));
      img.src = dataUrl;
    });
  }

  const readFile = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('파일을 읽지 못했습니다.'));
    r.readAsDataURL(file);
  });

  /** 줄여서 저장할 데이터로: 투명한 곳이 있으면 PNG, 없으면 JPEG */
  function shrink(img) {
    const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const c = cv.getContext('2d');
    c.drawImage(img, 0, 0, w, h);
    let alpha = false;
    try {
      const d = c.getImageData(0, 0, w, h).data;
      for (let i = 3; i < d.length; i += 4 * 97) if (d[i] < 250) { alpha = true; break; } // 드문드문 봄
    } catch (_) { /* 못 읽으면 불투명으로 봄 */ }
    return { w, h, data: alpha ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.86) };
  }

  async function store(rec) {
    cache.set(rec.id, { ...rec, img: null, state: 'loading' });
    try {
      await App.storage.blobs.put(KEY(rec.id), { id: rec.id, name: rec.name, w: rec.w, h: rec.h, data: rec.data });
    } catch (_) {
      App.ui.toast('이미지를 이 기기에 저장하지 못했습니다. 앱을 닫으면 사라질 수 있습니다.');
    }
    const e = cache.get(rec.id);
    try {
      e.img = await decode(rec.data);
      e.state = 'ready';
    } catch (_) {
      e.state = 'missing';
    }
    notify();
    return rec.id;
  }

  /** 저장소에서 읽어 옴 (한 번만). 끝나면 화면을 다시 그리게 알림 */
  function load(id) {
    if (cache.has(id)) return cache.get(id).promise || Promise.resolve();
    const e = { state: 'loading', img: null };
    cache.set(id, e);
    e.promise = (async () => {
      try {
        const rec = await App.storage.blobs.get(KEY(id));
        if (!rec || !rec.data) throw new Error('없음');
        Object.assign(e, { name: rec.name, w: rec.w, h: rec.h, data: rec.data });
        e.img = await decode(rec.data);
        e.state = 'ready';
      } catch (_) {
        e.state = 'missing';
      }
      e.promise = null;
      notify();
    })();
    return e.promise;
  }

  const images = {
    MAX_SIDE,
    /** 사진첩·파일에서 이미지를 골라 저장하고 id를 돌려줌. 취소하면 null */
    pick() {
      return new Promise((resolve) => {
        const input = document.getElementById('imageFile');
        let done = false;
        const finish = (v) => { if (!done) { done = true; resolve(v); } };
        input.value = '';
        input.onchange = async () => {
          const f = input.files && input.files[0];
          input.value = '';
          if (!f) return finish(null);
          try {
            finish(await images.add(f));
          } catch (e) {
            App.ui.toast(e && e.message ? e.message : '이미지를 읽지 못했습니다.');
            finish(null);
          }
        };
        // 고르지 않고 닫은 경우 (지원하는 브라우저만 알려 줌)
        input.oncancel = () => finish(null);
        input.click();
      });
    },
    /** 사진 여러 장 고르기 (휴대폰은 카메라로 찍기도 됨): [{ id, at(찍은·파일 시각) }]. 취소하면 [].
        o.camera: 바로 카메라로 찍기 (안드로이드 앱은 고르는 창에 카메라가 없어서 따로) */
    pickMany(o = {}) {
      return new Promise((resolve) => {
        const input = document.getElementById(o.camera ? 'photoCamera' : 'photoFiles');
        let done = false;
        const finish = (v) => { if (!done) { done = true; resolve(v); } };
        input.value = '';
        input.onchange = async () => {
          const files = [...(input.files || [])];
          input.value = '';
          const out = [];
          for (const f of files) {
            try {
              out.push({ id: await images.add(f), at: new Date(f.lastModified || Date.now()).toISOString() });
            } catch (e) {
              App.ui.toast(e && e.message ? e.message : '사진을 읽지 못했습니다.');
            }
          }
          finish(out);
        };
        input.oncancel = () => finish([]);
        input.click();
      });
    },
    /** 파일(Blob)을 줄여 저장 */
    async add(file) {
      if (file.type && !/^image\//.test(file.type)) throw new Error('이미지 파일(JPG·PNG 등)을 골라 주세요.');
      App.ui.busy('이미지를 넣는 중…');
      try {
        const img = await decode(await readFile(file));
        const s = shrink(img);
        return await store({ id: newId(), name: String(file.name || '이미지').slice(0, 80), ...s });
      } finally {
        App.ui.busy(false);
      }
    },
    /** 바로 그릴 수 있는 이미지. 아직 못 읽었으면 null (읽고 나면 화면을 다시 그림) */
    get(id) {
      if (!id) return null;
      const e = cache.get(id);
      if (!e) {
        load(id);
        return null;
      }
      return e.state === 'ready' ? e.img : null;
    },
    /** <img>에 넣을 주소. 아직 못 읽었으면 null */
    url(id) {
      const e = id && cache.get(id);
      if (!e) {
        if (id) load(id);
        return null;
      }
      return e.state === 'ready' ? e.data : null;
    },
    missing(id) {
      const e = cache.get(id);
      return !!e && e.state === 'missing';
    },
    /** 가로÷세로 비율 (모르면 null) */
    aspect(id) {
      const e = cache.get(id);
      return e && e.state === 'ready' ? e.w / e.h : null;
    },
    /** 도면에서 쓰는 이미지 id들 */
    used(elements) {
      const ids = new Set();
      for (const el of elements) {
        if (!el) continue;
        if (el.imageId) ids.add(el.imageId);
        if (Array.isArray(el.photos)) el.photos.forEach((p) => p && p.id && ids.add(p.id)); // 현장 사진 핀
      }
      return ids;
    },
    /** 도면을 열 때: 쓰는 이미지를 미리 읽어 둠 */
    loadAll(elements) {
      return Promise.all([...images.used(elements)].map((id) => load(id)));
    },
    /** 백업 파일에 담을 데이터 */
    async exportData(id) {
      await load(id);
      const e = cache.get(id);
      return e && e.state === 'ready' ? { id, name: e.name, w: e.w, h: e.h, data: e.data } : null;
    },
    /** 백업 파일에서 가져옴. 성공하면 true */
    async importData(rec) {
      if (!rec || typeof rec.id !== 'string' || typeof rec.data !== 'string' || !/^data:image\//.test(rec.data)) return false;
      try {
        await App.storage.blobs.put(KEY(rec.id), { id: rec.id, name: String(rec.name || ''), w: rec.w, h: rec.h, data: rec.data });
        cache.delete(rec.id);
        return true;
      } catch (_) {
        return false;
      }
    },
    /** 어느 도면에서도 쓰지 않는 이미지를 지움 */
    async cleanup(usedIds) {
      try {
        const keys = await App.storage.blobs.keys();
        await Promise.all(keys.filter((k) => String(k).startsWith('image:') && !usedIds.has(String(k).slice(6)))
          .map((k) => App.storage.blobs.remove(k)));
      } catch (_) { /* IndexedDB를 못 쓰는 환경 */ }
    },
  };

  App.images = images;
})();
