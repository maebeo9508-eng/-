/* 물건 그림: 3D 모형을 화면 밖에서 그려 그림으로 뽑아 둔다.
   - top(it): 평면에 얹는 '위에서 본 그림' (조감도 모드의 컬러 평면)
   - thumb(kind, style): 물건을 고를 때 보여 주는 비스듬한 미리보기
   한 번에 몰아서 그리지 않고 틈틈이 그리며, 다 되면 화면을 다시 그리게 알린다. WebGL을 못 쓰면 null만 돌려줘서 기호로 그려진다. */
(function () {
  'use strict';
  const App = (window.App = window.App || {});

  const MAX_SIDE = 1024;       // 그림 한 장의 긴 변 (px)
  const THUMB = 168;           // 미리보기 한 변 (px)
  const BUDGET_MS = 14;        // 한 번에 그리는 데 쓰는 시간
  let R = null, glCanvas = null, failed = false;
  const tops = new Map();      // 열쇠 → { ppm, canvas, x0, z0, w, d } (mm)
  const thumbs = new Map();    // 'kind|style' → dataURL
  const jobs = [];             // 할 일: { type, key, run }
  const queued = new Set();
  let timer = 0;
  // 그림들이 차지하는 픽셀 상한: 아이폰·휴대폰은 캔버스 메모리가 넉넉지 않음 (넘으면 오래 안 쓴 그림부터 버림)
  const PIXEL_CAP = (App.platform && App.platform.ios) || (window.matchMedia && matchMedia('(pointer: coarse)').matches) ? 24e6 : 64e6;
  let pixels = 0;
  const area = (e) => (e && e.canvas ? e.canvas.width * e.canvas.height : 0);
  function release(e) {
    pixels -= area(e);
    if (e && e.canvas) { e.canvas.width = 0; e.canvas.height = 0; }
  }
  /** 새 그림을 넣고 (같은 열쇠의 예전 그림은 버림) 상한을 넘으면 오래 안 쓴 것부터 버림 */
  function remember(key, entry) {
    const old = tops.get(key);
    if (old && old !== entry) release(old);
    tops.delete(key);
    entry.used = performance.now();
    tops.set(key, entry);
    pixels += area(entry);
    if (pixels <= PIXEL_CAP) return;
    const now = performance.now();
    for (const [k, e] of tops) { // Map은 넣은 순서 → 쓸 때마다 뒤로 옮기므로 앞쪽이 오래 안 쓴 것
      if (pixels <= PIXEL_CAP) break;
      if (now - e.used < 1500) continue; // 지금 화면에 그리는 것은 남김
      release(e);
      tops.delete(k);
    }
  }

  function renderer() {
    if (R || failed) return R;
    try {
      glCanvas = document.createElement('canvas');
      R = new App.gl3d.Renderer(glCanvas, { alpha: true });
      // 잃으면 잠깐 선 기호로 그리고, 되살아나면 그림을 처음부터 다시 만듦
      glCanvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); failed = true; });
      glCanvas.addEventListener('webglcontextrestored', () => {
        try { R = new App.gl3d.Renderer(glCanvas, { alpha: true }); failed = false; tops.clear(); pixels = 0; if (App.plan) App.plan.render(); } catch (_) { R = null; }
      });
    } catch (_) {
      R = null;
      failed = true;
    }
    return R;
  }

  /** 모양을 정하는 값들로 만든 열쇠 (자리·회전은 빼고): 같은 모양이면 그림 한 장을 같이 씀 */
  const FIELDS = ['kind', 'size', 'depth', 'h3', 'style', 'variant', 'faceOn', 'color', 'text', 'imageId', 'cols', 'rows', 'count', 'gap', 'seatW', 'aisles', 'aisleW', 'chairs', 'units', 'floors', 'perRow', 'tiers', 'lanes'];
  function keyOf(it) {
    let k = '';
    for (const f of FIELDS) if (it[f] != null && it[f] !== '') k += `${f}=${it[f]};`;
    if (it.imageId && !App.images.get(it.imageId)) k += 'img?'; // 이미지를 다 읽으면 다시 그림
    return k;
  }

  function pump() {
    timer = 0;
    const t0 = performance.now();
    let did = false;
    while (jobs.length && performance.now() - t0 < BUDGET_MS) {
      const j = jobs.shift();
      queued.delete(j.id);
      try { j.run(); did = true; } catch (e) { console.warn('물건 그림을 만들지 못함', j.id, e); }
    }
    if (did) {
      if (App.plan) App.plan.requestRender();
      if (App.ui) App.ui.emit('sprites');
    }
    if (jobs.length) timer = setTimeout(pump, 0);
  }
  function enqueue(id, run, front = false) {
    if (queued.has(id)) return;
    queued.add(id);
    if (front) jobs.unshift({ id, run }); else jobs.push({ id, run });
    if (!timer) timer = setTimeout(pump, 0);
  }

  function drawScene(s, w, h, cam, o) {
    glCanvas.width = w;
    glCanvas.height = h;
    R.setScene({ layers: s.layers, textured: s.textured, bounds: s.bounds });
    R.render(cam, { sun: 0, sky: false, ground: false, transparent: true, shadows: false, clouds: false, ...o });
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    cv.getContext('2d').drawImage(glCanvas, 0, 0);
    R.clearScene();
    return cv;
  }

  /** 위에서 본 그림을 만듦. ppm: 1m에 몇 픽셀 */
  function makeTop(it, key, ppm) {
    const s = App.view3d.buildItem({ ...it, x: 0, y: 0, rotation: 0, wallId: null }, { seed: key, blobs: false, lod: ppm < 24 });
    if (!s) { remember(key, { ppm, canvas: null }); return; }
    const b = s.bounds, pad = 0.03;
    const x0 = b.min[0] - pad, x1 = b.max[0] + pad, z0 = b.min[2] - pad, z1 = b.max[2] + pad, wm = x1 - x0, dm = z1 - z0;
    const k = Math.min(ppm, MAX_SIDE / Math.max(wm, dm));
    const W = Math.max(4, Math.round(wm * k)), H = Math.max(4, Math.round(dm * k));
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, top = Math.max(1, b.max[1]) + 5;
    const canvas = drawScene(s, W, H, { eye: [cx, top, cz], target: [cx, 0, cz], up: [0, 0, -1], ortho: { hw: wm / 2, hh: dm / 2 }, near: 0.5, far: top + 5 }, { blobs: false });
    remember(key, { ppm, canvas, x0: x0 * 1000, z0: z0 * 1000, w: wm * 1000, d: dm * 1000 });
  }

  /** 고르는 창의 미리보기 한 장 */
  function makeThumb(id, kind, style) {
    const def = App.catalog.itemDef(kind);
    if (!def) return;
    const it = App.model.TYPES.item.create({ x: 0, y: 0 }, def.category, def, 0, null);
    if (style) it.style = style;
    if (def.face && def.kind !== '바닥 이미지') it.text = def.kind.replace('·', '\n');
    if (def.kind === '사람') Object.assign(it, { count: 3, perRow: 3 }, def.resize({ count: 3, perRow: 3 }));
    it.id = `thumb-${id}`;
    const s = App.view3d.buildItem(it, { seed: id });
    if (!s) return;
    const b = s.bounds, c = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
    const r = Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) / 2 || 1;
    const flat = b.max[1] - b.min[1] < 0.2;
    const yaw = -0.62, pitch = flat ? 0.95 : 0.46, fov = 0.5, dist = (r / Math.sin(fov / 2)) * (flat ? 0.92 : 1.02);
    const eye = [c[0] + dist * Math.cos(pitch) * Math.sin(yaw), c[1] + dist * Math.sin(pitch), c[2] + dist * Math.cos(pitch) * Math.cos(yaw)];
    const cv = drawScene(s, THUMB, THUMB, { eye, target: c, fov, near: Math.max(0.05, dist - r * 1.6), far: dist + r * 2 }, {});
    thumbs.set(id, cv.toDataURL('image/png'));
  }

  const sprites = {
    /** 평면에 얹을 위에서 본 그림. pxPerMm: 지금 화면 배율(기기 픽셀 포함). 아직 없으면 null (만들어지면 화면을 다시 그림) */
    top(it, pxPerMm) {
      if (failed || !App.view3d || !App.view3d.buildItem) return null;
      const key = keyOf(it);
      const want = Math.min(256, Math.max(4, 2 ** Math.ceil(Math.log2(Math.max(1e-6, pxPerMm * 1000))))); // 1m당 픽셀, 2의 거듭제곱으로
      const cur = tops.get(key);
      if (cur) { cur.used = performance.now(); tops.delete(key); tops.set(key, cur); } // 최근에 쓴 것으로
      const longest = Math.max(it.size, it.depth || it.size) / 1000;
      const enough = cur && (cur.ppm >= want || cur.ppm * longest >= MAX_SIDE * 0.95);
      // 끄는 중(크기 손잡이 등)인 물건은 크기마다 새 그림을 만들지 않음: 손을 뗀 뒤 마지막 크기로 한 번만
      const changing = App.doc && App.doc.tx && App.doc.tx.before.has(it.id);
      if (!enough && !changing && renderer()) enqueue(`top:${key}:${want}`, () => makeTop(it, key, want), !cur);
      return cur && cur.canvas ? cur : null;
    },
    /** 미리보기 그림 주소. 아직 없으면 null */
    thumb(kind, style = '') {
      if (failed || !App.view3d || !App.view3d.buildItem) return null;
      const id = `${kind}|${style}`;
      const url = thumbs.get(id);
      if (!url && renderer()) enqueue(`thumb:${id}`, () => makeThumb(id, kind, style));
      return url || null;
    },
    /** 이 종류의 미리보기를 먼저 만들어 달라고 (지금 보이는 분류) */
    prefer(kinds) {
      kinds.forEach((k) => {
        const id = `thumb:${k}|`;
        const i = jobs.findIndex((j) => j.id === id);
        if (i > 0) jobs.unshift(jobs.splice(i, 1)[0]);
      });
    },
    keyOf,
    get pending() { return jobs.length; },
    get available() { return !failed; },
    /** 시험용: 밀린 그림을 지금 다 그림 */
    flush() { while (jobs.length) { const j = jobs.shift(); queued.delete(j.id); try { j.run(); } catch (e) { console.warn(e); } } if (App.plan) App.plan.requestRender(); if (App.ui) App.ui.emit('sprites'); },
    clear() { tops.forEach(release); tops.clear(); pixels = 0; },
    /** 시험용: 그림들이 차지하는 픽셀 수와 상한 */
    get memory() { return { pixels, cap: PIXEL_CAP, count: tops.size }; },
  };

  App.sprites = sprites;
})();
