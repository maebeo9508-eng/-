/* 내 사물: 밖에서 받아 온 사물(제품 사진·3D 모델 파일)과 설계 모드에서 만든 것을 이 기기에 모아 두고 도면에 놓는다.
   - 가벼운 목록(이름·크기·가격·링크)은 localStorage, 그림·모형은 IndexedDB('obj:id')
   - 도면에는 이름(kind)으로 들어가고, 쓰인 사물의 가벼운 정보는 도면에도 함께 저장(App.current.objs)되어 다른 기기에서도 자리·이름·크기가 보임.
     그림·모형까지 옮기려면 백업 파일이나 사물 묶음 파일로.
   - 종류(type): flat(위에서 본 그림) · stand(제품 사진을 상자 앞면에) · cutout(세운 그림) · mesh(3D 모형) */
(function () {
  'use strict';
  const App = (window.App = window.App || {});

  const KEY_INDEX = 'hjdm.objects';
  const KEY = (id) => `obj:${id}`;
  const CAT = '내 사물';
  const TYPES = { flat: '위에서 본 그림', stand: '제품 사진 (상자)', cutout: '세운 그림', mesh: '3D 모형' };
  const newId = () => `obj-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const clampMm = (v, lo = 1, hi = 100000) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));

  let index = null;               // [meta] 이 기기의 목록
  const cache = new Map();        // id → { state: 'loading'|'ready'|'missing', promise, img, thumb, mesh, view, rec }
  const defs = new Map();         // 'id:ver' → 목록 정의 (catalog가 쓰는 모양)
  let stamp = 0;                  // 그림 캐시 열쇠용: 데이터가 바뀔 때마다 오름

  const notify = () => {
    stamp++;
    if (App.ui) App.ui.emit('library');
    if (App.plan) App.plan.requestRender();
  };

  /* ── 목록 ── */
  function cleanMeta(m) {
    if (!m || typeof m !== 'object' || typeof m.id !== 'string' || !TYPES[m.type]) return null;
    const name = String(m.name || '').replace(/[|\s]+/g, ' ').trim().slice(0, 40); // ‘|’는 견적 줄 열쇠에 쓰는 글자
    if (!name) return null;
    return {
      id: m.id, name, type: m.type, w: clampMm(m.w), d: clampMm(m.d), h: clampMm(m.h, 0),
      price: Math.max(0, Math.round(Number(m.price) || 0)), url: typeof m.url === 'string' ? m.url.slice(0, 600) : '',
      brand: String(m.brand || '').slice(0, 40), memo: String(m.memo || '').slice(0, 200), src: String(m.src || '').slice(0, 80),
      avg: /^#[0-9a-f]{6}$/i.test(m.avg || '') ? m.avg : '#b9b3a8', alpha: !!m.alpha, tris: Math.max(0, Math.round(Number(m.tris) || 0)),
      at: typeof m.at === 'string' ? m.at : new Date().toISOString(), ver: Math.max(1, Math.round(Number(m.ver) || 1)),
      lift: Math.max(0, Math.min(20000, Math.round(Number(m.lift) || 0))), // 바닥에서 띄우는 높이 (벽에 다는 것)
      design: typeof m.design === 'string' ? m.design : '', // 설계 모드에서 만든 것: 설계물 id
      aka: Array.isArray(m.aka) ? m.aka.filter((s) => typeof s === 'string' && s && s !== name).slice(-12) : [], // 예전 이름들 (다른 도면에 놓인 것이 계속 보이게)
    };
  }
  function load() {
    if (index) return index;
    const raw = App.storage.read(KEY_INDEX);
    index = (Array.isArray(raw) ? raw : []).map(cleanMeta).filter(Boolean);
    return index;
  }
  const saveIndex = () => App.storage.write(KEY_INDEX, load());
  /** 이 도면에 함께 저장된 사물 정보 (이 기기의 목록에 없는 것도 그릴 수 있게) */
  const embedded = () => (App.current && App.current.objs && typeof App.current.objs === 'object' ? App.current.objs : {});
  function metaOf(kind) {
    if (!kind) return null;
    const list = load();
    const hit = list.find((m) => m.name === kind) || list.find((m) => m.aka.includes(kind));
    if (hit) return hit;
    const e = embedded()[kind];
    return e && typeof e.id === 'string' && TYPES[e.type] ? e : null;
  }
  const byId = (id) => load().find((m) => m.id === id) || Object.values(embedded()).find((m) => m && m.id === id) || null;

  /** 기본 목록·다른 사물과 겹치지 않는 이름 */
  function freeName(name, exceptId = null) {
    const base = String(name || '사물').replace(/[|\s]+/g, ' ').trim().slice(0, 36) || '사물';
    const taken = (n) => (App.catalog.builtin && App.catalog.builtin(n)) || load().some((m) => m.id !== exceptId && (m.name === n || m.aka.includes(n)));
    if (!taken(base)) return base;
    for (let i = 2; i < 500; i++) if (!taken(`${base} (${i})`)) return `${base} (${i})`;
    return `${base} ${Date.now().toString(36)}`;
  }

  /* ── 그림·모형 (IndexedDB) ── */
  const decode = (url) => new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
  async function hydrate(e, rec) {
    e.rec = rec;
    e.thumb = rec.thumb || null;
    e.img = await decode(rec.img);
    const open = async (packed) => {
      if (!packed) return null;
      const m = App.meshio.unpack(packed);
      for (const g of m.groups) if (g.tex && g.tex.url) g.tex.img = await decode(g.tex.url); // eslint-disable-line no-await-in-loop
      return m;
    };
    e.mesh = await open(rec.mesh);
    e.view = rec.view ? await open(rec.view) : e.mesh;
  }
  function entry(id) {
    let e = cache.get(id);
    if (e) return e;
    e = { state: 'loading', img: null, thumb: null, mesh: null, view: null, rec: null };
    cache.set(id, e);
    e.promise = (async () => {
      try {
        const rec = await App.storage.blobs.get(KEY(id));
        if (!rec) throw new Error('없음');
        await hydrate(e, rec);
        e.state = 'ready';
      } catch (_) {
        e.state = 'missing';
      }
      e.promise = null;
      notify();
    })();
    return e;
  }
  const ready = (id) => { const e = entry(id); return e.promise || Promise.resolve(); };

  /* ── 3D 모형 ── */
  const gl = () => App.gl3d;
  const texturedMesh = (C, n) => {
    const S = C.S, m = new (gl().Mesh)(n);
    m.tx = S.tx; m.ty = S.ty; m.tz = S.tz; m.c = S.c; m.s = S.s;
    return m;
  };
  /** 모형(mm, 바닥 가운데가 원점)을 그릇에 넣음. 폭 w × 깊이 d × 높이 h(m)에 맞춰 늘림 */
  function emitMesh(C, model, w, d, h, key, lift = 0) {
    const b = model.bbox, MAT = gl().MAT;
    const kx = w / Math.max(1e-6, b.max[0] - b.min[0]), ky = h / Math.max(1e-6, b.max[1] - b.min[1]), kz = d / Math.max(1e-6, b.max[2] - b.min[2]);
    const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2, y0 = b.min[1] - lift / ky;
    const even = Math.abs(kx / ky - 1) < 0.01 && Math.abs(kz / ky - 1) < 0.01;
    const col = [1, 1, 1];
    model.groups.forEach((g, gi) => {
      const img = g.uv && g.tex && (g.tex.img || g.tex.canvas);
      const glass = g.alpha < 0.6;
      const tris = g.idx ? g.idx.length / 3 : g.pos.length / 9;
      const M = img ? texturedMesh(C, tris * 3) : glass ? C.G : C.S;
      const mat = g.mat != null ? g.mat : glass ? MAT.glass : MAT.plain;
      const P = g.pos, N = g.nor, U = img ? g.uv : null, VC = g.col, base = g.color;
      for (let t = 0; t < tris * 3; t++) {
        const v = g.idx ? g.idx[t] : t, o = v * 3;
        let nx = N[o], ny = N[o + 1], nz = N[o + 2];
        if (!even) { nx /= kx; ny /= ky; nz /= kz; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; }
        if (VC) { col[0] = base[0] * VC[o]; col[1] = base[1] * VC[o + 1]; col[2] = base[2] * VC[o + 2]; }
        else { col[0] = base[0]; col[1] = base[1]; col[2] = base[2]; }
        M._v((P[o] - cx) * kx, (P[o + 1] - y0) * ky, (P[o + 2] - cz) * kz, nx, ny, nz, col, mat, U ? U[v * 2] : 0, U ? U[v * 2 + 1] : 0);
      }
      if (img) C.textured.push({ mesh: M, source: img, layer: 'solid', repeat: !!g.repeat, share: `${key}:${gi}` });
    });
  }
  const hexOf = (s) => gl().hex(s);
  /** 물건 하나의 3D 모형을 넣음 (view3d.js itemModel에서 부름). w·d·h는 m */
  function model3d(C, it, w, d, h) {
    const m = metaOf(it.kind);
    if (!m) return false;
    const e = entry(m.id), MAT = gl().MAT, S = C.S;
    const avg = hexOf(m.avg);
    const hh = Math.max(0.004, h);
    if (e.state !== 'ready') { // 아직 못 읽었거나 이 기기에 없는 사물: 자리 상자
      S.box(-w / 2, 0, -d / 2, w / 2, Math.max(0.02, hh), d / 2, hexOf('#c9c4bb'), MAT.plain);
      return true;
    }
    if (m.type === 'mesh' && e.mesh) { emitMesh(C, e.mesh, w, d, hh, `${m.id}:${m.ver}`, (m.lift || 0) / 1000); return true; }
    const img = e.img;
    const quad = (pts, layer = 'solid') => { if (img) C.face(pts, img, layer); };
    if (m.type === 'flat') {
      if (m.h <= 30) { // 러그처럼 바닥에 붙는 것
        const y = Math.max(0.012, hh);
        if (img) quad([[-w / 2, y, d / 2], [w / 2, y, d / 2], [w / 2, y, -d / 2], [-w / 2, y, -d / 2]], 'decal');
        else C.D.quad([-w / 2, y, d / 2], [w / 2, y, d / 2], [w / 2, y, -d / 2], [-w / 2, y, -d / 2], avg, MAT.plain);
      } else {
        if (!m.alpha || !img) S.box(-w / 2, 0, -d / 2, w / 2, hh, d / 2, avg, MAT.plain);
        quad([[-w / 2, hh + 0.002, d / 2], [w / 2, hh + 0.002, d / 2], [w / 2, hh + 0.002, -d / 2], [-w / 2, hh + 0.002, -d / 2]]);
      }
      return true;
    }
    if (m.type === 'cutout') { // 세운 그림: 가운데에 한 장 (앞뒤 모두 보임)
      if (img) quad([[-w / 2, 0, 0], [w / 2, 0, 0], [w / 2, hh, 0], [-w / 2, hh, 0]]);
      else S.box(-w / 2, 0, -0.01, w / 2, hh, 0.01, avg, MAT.plain);
      return true;
    }
    // stand: 상자 + 앞면(과 뒷면)에 제품 사진
    S.box(-w / 2, 0, -d / 2, w / 2, hh, d / 2, avg, MAT.plain);
    const z = d / 2 + 0.003;
    quad([[-w / 2, 0, z], [w / 2, 0, z], [w / 2, hh, z], [-w / 2, hh, z]]);
    quad([[w / 2, 0, -z], [-w / 2, 0, -z], [-w / 2, hh, -z], [w / 2, hh, -z]]);
    return true;
  }
  /** 모형만 따로 그릴 장면 (미리보기·설계 화면): { layers, textured, bounds } (m) */
  function sceneOf(model) {
    const Mesh = gl().Mesh;
    const L = { solid: new Mesh(4096), ceil: new Mesh(4), glass: new Mesh(64), decals: [new Mesh(4), new Mesh(4), new Mesh(4), new Mesh(4)], blobs: new Mesh(4) };
    const textured = [];
    const C = { S: L.solid, G: L.glass, D: L.decals[2], textured };
    const b = model.bbox, w = (b.max[0] - b.min[0]) / 1000, h = (b.max[1] - b.min[1]) / 1000, d = (b.max[2] - b.min[2]) / 1000;
    emitMesh(C, model, Math.max(1e-4, w), Math.max(1e-4, d), Math.max(1e-4, h), `scene${++stamp}`);
    return { layers: L, textured, bounds: { min: [-w / 2, 0, -d / 2], max: [w / 2, h, d / 2] } };
  }

  /* ── 목록 정의 (catalog.itemDef가 돌려주는 모양) ── */
  function def(kind) {
    const m = metaOf(kind);
    if (!m) return null;
    const key = `${m.id}:${m.ver}:${m.name}:${m.w}:${m.d}:${m.h}:${m.type}`;
    let d = defs.get(key);
    if (!d) {
      d = { kind: m.name, cat: CAT, size: m.w, depth: m.d, h3: Math.max(1, m.h), custom: true, objId: m.id, back: m.type !== 'flat' && m.type !== 'cutout', flat: m.type === 'flat' && m.h <= 30, pass: m.type === 'flat' && m.h <= 30 };
      if (defs.size > 400) defs.clear();
      defs.set(key, d);
    }
    return d;
  }

  const library = {
    CAT, TYPES,
    list: () => load().slice(),
    /** 고르는 막대·창에 나오는 정의들 (새것부터) */
    defs: () => load().slice().sort((a, b) => (a.at < b.at ? 1 : -1)).map((m) => def(m.name)).filter(Boolean),
    meta: metaOf,
    byId,
    def,
    isCustom: (kind) => !!metaOf(kind),
    freeName,
    model3d,
    sceneOf,
    ready,
    /** 바로 쓸 수 있는 데이터 (아직 못 읽었으면 null, 읽고 나면 화면을 다시 그림) */
    data(id) { const e = entry(id); return e.state === 'ready' ? e : null; },
    state: (id) => entry(id).state,
    /** 고르는 막대의 미리보기 그림 주소 */
    thumb(kind) { const m = metaOf(kind); if (!m) return null; const e = entry(m.id); return e.state === 'ready' ? e.thumb : null; },
    /** 평면에 바로 그릴 그림: flat은 그림 그대로, stand·cutout은 자리 상자 안에 제품 사진 */
    planImage(it) {
      const m = metaOf(it.kind);
      if (!m || m.type === 'mesh') return null;
      const e = entry(m.id);
      return { meta: m, img: e.state === 'ready' ? e.img : null, state: e.state };
    },
    /** 위에서 본 그림(스프라이트) 캐시 열쇠에 붙는 값: 사물이 바뀌거나 다 읽으면 달라짐 */
    keyOf(kind) { const m = metaOf(kind); return m ? `obj=${m.id}.${m.ver}.${m.type}.${entry(m.id).state};` : ''; },

    /** 새 사물 등록. meta: { name, type, w, d, h, price, url, … }, data: { img, thumb, mesh(pack), view(pack) } → id */
    async add(meta, data) {
      const id = newId();
      const m = cleanMeta({ ...meta, id, name: freeName(meta.name), at: new Date().toISOString(), ver: 1 });
      if (!m) throw new Error('이름과 크기를 넣어 주세요.');
      const rec = { id, img: data.img || null, thumb: data.thumb || null, mesh: data.mesh || null, view: data.view || null };
      await App.storage.blobs.put(KEY(id), rec);
      load().unshift(m);
      if (!saveIndex()) { load().shift(); try { await App.storage.blobs.remove(KEY(id)); } catch (_) { /* 무시 */ } throw new Error('이 기기에 저장하지 못했습니다. 저장 공간을 확인해 주세요.'); }
      const e = { state: 'loading', img: null, thumb: null, mesh: null, view: null, rec: null };
      cache.set(id, e);
      await hydrate(e, rec);
      e.state = 'ready';
      notify();
      return id;
    },
    /** 이름·크기·가격·링크 고치기. 이름·크기가 바뀌면 지금 도면에 놓인 것도 따라 바뀜 (크기를 따로 바꾼 것은 그대로) */
    update(id, patch) {
      const list = load(), i = list.findIndex((m) => m.id === id);
      if (i < 0) return null;
      const old = list[i];
      const name = patch.name != null && String(patch.name).replace(/\s+/g, ' ').trim() ? freeName(patch.name, id) : old.name;
      const next = cleanMeta({ ...old, ...patch, id, name, ver: old.ver + 1, aka: name !== old.name ? [...old.aka, old.name] : old.aka });
      if (!next) return null;
      list[i] = next;
      saveIndex();
      const renamed = next.name !== old.name, sized = next.w !== old.w || next.d !== old.d || next.h !== old.h;
      if ((renamed || sized) && App.doc) {
        // 지금 도면에 놓인 것: 새 이름으로 (다른 도면의 것은 예전 이름(aka)으로 계속 찾음), 크기를 따로 바꾸지 않은 것은 새 크기로
        const names = [old.name, ...old.aka];
        const todo = [...App.doc.all()].filter((e) => e.type === 'item' && names.includes(e.kind)).map((e) => {
          const p = {};
          if (renamed) p.kind = next.name;
          if (sized && e.size === old.w && (e.depth == null || e.depth === old.d)) { p.size = next.w; if (e.depth != null) p.depth = next.d; }
          if (sized && e.h3 != null && e.h3 === old.h) p.h3 = next.h;
          return [e, p];
        }).filter(([, p]) => Object.keys(p).length);
        if (todo.length) App.doc.transact(renamed ? '사물 이름 바꾸기' : '사물 크기 바꾸기', () => todo.forEach(([e, p]) => App.doc.update(e.id, p)));
        if (renamed) ['furnKind', 'eventKind'].forEach((k) => { if (App.current[k] === old.name) App.current[k] = next.name; });
      }
      library.embed();
      notify();
      return next;
    },
    /** 고르는 막대에 보일 미리보기 그림을 저장 (3D 모형은 등록한 뒤에 그려서 넣음) */
    async setThumb(id, url) {
      const e = cache.get(id);
      if (!e || !e.rec || !url) return false;
      e.rec.thumb = url;
      e.thumb = url;
      try { await App.storage.blobs.put(KEY(id), e.rec); } catch (_) { /* 미리보기만 못 남김 */ }
      notify();
      return true;
    },
    /** 그림·모형을 바꿈 (설계한 것을 다시 등록할 때) */
    async replaceData(id, data, metaPatch = {}) {
      const rec = { id, img: data.img || null, thumb: data.thumb || null, mesh: data.mesh || null, view: data.view || null };
      await App.storage.blobs.put(KEY(id), rec);
      const e = { state: 'loading', img: null, thumb: null, mesh: null, view: null, rec: null };
      await hydrate(e, rec);
      e.state = 'ready';
      cache.set(id, e);
      return library.update(id, metaPatch);
    },
    /** 목록에서 지움. 도면에 놓인 것은 그대로 두고(자리 상자·이름), 어느 도면에서도 안 쓰면 그림·모형도 지움 */
    async remove(id) {
      const list = load(), i = list.findIndex((m) => m.id === id);
      if (i < 0) return false;
      const m = list[i];
      list.splice(i, 1);
      saveIndex();
      const usedHere = App.doc && [...App.doc.all()].some((e) => e.type === 'item' && e.kind === m.name);
      if (usedHere) library.embed(m); // 이 도면에서는 계속 보이게
      else if (!(App.projects && App.projects.usesObject && App.projects.usesObject(id))) {
        cache.delete(id);
        try { await App.storage.blobs.remove(KEY(id)); } catch (_) { /* 무시 */ }
      }
      notify();
      return true;
    },

    /** 도면에 쓰인 사물의 정보를 도면에 함께 담음 (저장 직전). keep: 목록에서 지웠지만 도면에 남길 것 */
    embed(keep = null) {
      if (!App.doc || !App.current) return;
      const used = new Set();
      for (const e of App.doc.all()) if (e.type === 'item' && e.kind) used.add(e.kind);
      const prev = embedded(), next = {};
      used.forEach((kind) => {
        const list = load();
        const m = list.find((x) => x.name === kind) || list.find((x) => x.aka.includes(kind)) || (keep && (keep.name === kind || keep.aka.includes(kind)) ? keep : null) || prev[kind];
        if (m && TYPES[m.type]) next[kind] = { ...m };
      });
      if (JSON.stringify(prev) !== JSON.stringify(next)) {
        if (Object.keys(next).length) App.current.objs = next; else delete App.current.objs;
      }
    },
    /** 요소들이 쓰는 사물 id들 (지금 도면의 정보 기준) */
    used(elements, objs = embedded()) {
      const ids = new Set();
      for (const el of elements) {
        if (!el || el.type !== 'item' || !el.kind) continue;
        const list = load();
        const m = list.find((x) => x.name === el.kind) || list.find((x) => x.aka.includes(el.kind)) || (objs && objs[el.kind]);
        if (m && typeof m.id === 'string') ids.add(m.id);
      }
      return ids;
    },
    /** 백업·묶음 파일에 담을 데이터 (숫자 배열은 base64) */
    async exportData(id) {
      const m = byId(id);
      if (!m) return null;
      await ready(id);
      const e = cache.get(id);
      if (!e || e.state !== 'ready' || !e.rec) return { meta: { ...m } };
      const r = e.rec, J = App.meshio.toJSON;
      return { meta: { ...m }, img: r.img || null, thumb: r.thumb || null, mesh: r.mesh ? J(r.mesh) : null, view: r.view ? J(r.view) : null };
    },
    /** 백업·묶음 파일에서 가져옴. o.list: 이 기기의 목록에도 넣음. 돌려주는 값: 'added'|'kept'|'failed' */
    async importData(rec, o = {}) {
      const m = cleanMeta(rec && rec.meta);
      if (!m) return 'failed';
      const F = App.meshio.fromJSON;
      const img = typeof rec.img === 'string' && /^data:image\//.test(rec.img) ? rec.img : null;
      const data = { id: m.id, img, thumb: typeof rec.thumb === 'string' && /^data:image\//.test(rec.thumb) ? rec.thumb : null, mesh: rec.mesh ? F(rec.mesh) : null, view: rec.view ? F(rec.view) : null };
      const has = data.img || data.mesh;
      const list = load(), same = list.find((x) => x.id === m.id);
      try {
        if (has) { await App.storage.blobs.put(KEY(m.id), data); cache.delete(m.id); }
      } catch (_) { return 'failed'; }
      if (same) { notify(); return 'kept'; }
      if (o.list !== false && has) {
        const clash = list.some((x) => x.name === m.name);
        list.unshift(clash && o.rename !== false ? { ...m, name: freeName(m.name) } : m);
        if (clash && o.rename === false) list.shift(); // 같은 이름이 이미 있으면 그것을 씀
        saveIndex();
      }
      notify();
      return has ? 'added' : 'failed';
    },
    /** 어느 도면에서도 쓰지 않고 목록에도 없는 사물 데이터를 지움 */
    async cleanup(usedIds) {
      try {
        const keep = new Set([...usedIds, ...load().map((m) => m.id)]);
        const keys = await App.storage.blobs.keys();
        await Promise.all(keys.filter((k) => String(k).startsWith('obj:') && !keep.has(String(k).slice(4))).map((k) => App.storage.blobs.remove(k)));
      } catch (_) { /* IndexedDB를 못 쓰는 환경 */ }
    },
    /** 도면을 열 때: 쓰는 사물을 미리 읽어 둠 */
    loadAll(elements) {
      return Promise.all([...library.used(elements)].map((id) => ready(id)));
    },
    /** 구매 목록: 지금 도면에 놓인 내 사물을 이름별로 [{ name, meta, qty, price, amount, url }] */
    shopping(elements = App.doc ? [...App.doc.all()] : []) {
      const by = new Map();
      elements.forEach((el) => {
        if (el.type !== 'item' || !el.kind) return;
        const m = metaOf(el.kind);
        if (!m) return;
        if (App.layers && App.layers.excludeHidden && App.layers.excludeHidden() && !App.layers.visible(el)) return;
        const cur = by.get(m.id) || { name: m.name, meta: m, qty: 0 };
        cur.qty++;
        by.set(m.id, cur);
      });
      return [...by.values()].map((r) => ({ ...r, price: r.meta.price, amount: r.meta.price * r.qty, url: r.meta.url })).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    },
    /** 시험용: 목록을 다시 읽음 */
    _reload() { index = null; cache.clear(); defs.clear(); notify(); },
    get stamp() { return stamp; },
  };

  App.library = library;
})();
