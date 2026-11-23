/* 내 사물 화면: 등록 창(제품 사진·3D 모델 파일·공유 받은 글), 목록 관리, 사물 묶음 파일, 구매 목록.
   - 제품 사진: 오늘의집 같은 쇼핑 앱에서 저장한 사진을 넣고 흰 바탕을 지운 뒤 실제 크기·가격·링크를 적어 둠
   - 3D 모델: GLB·glTF·OBJ·STL (단위·위쪽 축·방향을 미리보기로 맞춤)
   - 묶음 파일(.hjobj.json): 등록한 사물을 다른 기기·동료에게 넘김 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (v) => { const n = Number(String(v == null ? '' : v).replace(/[,\s원]/g, '')); return Number.isFinite(n) ? n : 0; };
  const won = (v) => `${Math.round(v).toLocaleString('ko-KR')}원`;
  const mm = (v) => Math.round(v).toLocaleString('ko-KR');
  const IMG_SIDE = 1024, THUMB = 220, PACK_KIND = 'hjdm-objects';
  const MODEL_EXT = ['glb', 'gltf', 'obj', 'stl'];
  const extOf = (n) => App.meshio.extOf(n);
  const isImageFile = (f) => /^image\//.test(f.type || '') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'heic'].includes(extOf(f.name));

  /* ── 글에서 이름·링크·가격·크기 찾기 (쇼핑 앱에서 ‘공유’한 글, 상품 정보를 복사한 글) ── */
  function parseSize(text) {
    const t = String(text || '');
    const N = '(\\d{1,5}(?:\\.\\d+)?)\\s*(mm|cm|m|㎜|㎝)?';
    const unit = (u) => ({ mm: 1, '㎜': 1, cm: 10, '㎝': 10, m: 1000 }[String(u || '').toLowerCase()] || 0);
    const pick = (re) => { const m = t.match(re); return m ? { v: parseFloat(m[1]), u: unit(m[2]) } : null; };
    let W = pick(new RegExp(`(?:가로|폭|너비|넓이|길이|\\bW)\\s*[:：]?\\s*${N}`, 'i'));
    let D = pick(new RegExp(`(?:세로|깊이|\\bD)\\s*[:：]?\\s*${N}`, 'i'));
    let H = pick(new RegExp(`(?:높이|\\bH)\\s*[:：]?\\s*${N}`, 'i'));
    if ([W, D, H].filter(Boolean).length < 2) {
      const m = t.match(new RegExp(`${N}\\s*[x×*X]\\s*${N}(?:\\s*[x×*X]\\s*${N})?`));
      if (!m) return null;
      W = { v: parseFloat(m[1]), u: unit(m[2]) };
      D = { v: parseFloat(m[3]), u: unit(m[4]) };
      H = m[5] ? { v: parseFloat(m[5]), u: unit(m[6]) } : null;
    }
    const list = [W, D, H].filter(Boolean);
    // 단위: 적힌 것이 있으면 그것(하나만 적혔으면 모두에), 없으면 숫자 크기로 (400 아래면 cm)
    const given = list.map((x) => x.u).filter(Boolean);
    const fallback = given.length ? given[given.length - 1] : Math.max(...list.map((x) => x.v)) < 400 ? 10 : 1;
    const to = (x) => (x ? Math.round(x.v * (x.u || fallback)) : 0);
    const out = { w: to(W), d: to(D), h: to(H) };
    return out.w > 0 || out.d > 0 ? out : null;
  }
  function parseText(text) {
    const t = String(text || '');
    const out = {};
    const url = (t.match(/https?:\/\/[^\s<>"']+/) || [])[0];
    if (url) out.url = url.replace(/[)\].,]+$/, '');
    const size = parseSize(t.replace(/https?:\/\/\S+/g, ' '));
    if (size) Object.assign(out, size);
    const price = t.match(/(\d{1,3}(?:,\d{3})+|\d{4,9})\s*원/);
    if (price) out.price = num(price[1]);
    let name = t.replace(/https?:\/\/\S+/g, ' ').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0] || '';
    name = name.replace(/^\[[^\]]{1,14}\]\s*/, '').replace(/\s*[|·\-–—]\s*(오늘의집|ohou\.se|네이버(?:\s*쇼핑)?|쿠팡|이케아|IKEA|한샘|11번가|G마켓|옥션).*$/i, '').replace(/\s+/g, ' ').trim();
    if (name) out.name = name.slice(0, 36);
    const host = out.url || '';
    out.src = /ohou\.se|ohouse|bucketplace/i.test(host) ? '오늘의집' : /ikea\./i.test(host) ? '이케아' : /coupang\./i.test(host) ? '쿠팡' : /naver\./i.test(host) ? '네이버' : /hanssem/i.test(host) ? '한샘' : '';
    return out;
  }

  /* ── 그림 다루기 ── */
  const blobUrl = (file) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error || new Error('파일을 읽지 못했습니다.')); r.readAsDataURL(file); });
  const decodeUrl = (url) => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('이미지를 읽지 못했습니다. JPG·PNG·WebP 파일인지 확인해 주세요.')); img.src = url; });
  /** 파일·주소 → 캔버스 (긴 변 1024까지) */
  async function loadImage(src) {
    const img = await decodeUrl(typeof src === 'string' ? src : await blobUrl(src));
    const sw = img.naturalWidth, sh = img.naturalHeight;
    if (!sw || !sh) throw new Error('이미지를 읽지 못했습니다.');
    const k = Math.min(1, IMG_SIDE / Math.max(sw, sh));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(sw * k));
    cv.height = Math.max(1, Math.round(sh * k));
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    return cv;
  }
  /** 가장자리에서 이어진 바탕(대개 흰색)을 투명하게. tol: 바탕 색과의 차이 허용 (0~120). 돌려주는 값: { canvas, removed(지운 비율) } */
  function cutBackground(src, tol = 30) {
    const w = src.width, h = src.height;
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const ctx = out.getContext('2d');
    ctx.drawImage(src, 0, 0);
    const id = ctx.getImageData(0, 0, w, h), d = id.data;
    // 바탕 색: 가장자리 픽셀의 가운데 값
    const br = [], bg = [], bb = [];
    const edge = (x, y) => { const o = (y * w + x) * 4; if (d[o + 3] > 200) { br.push(d[o]); bg.push(d[o + 1]); bb.push(d[o + 2]); } };
    for (let x = 0; x < w; x++) { edge(x, 0); edge(x, h - 1); }
    for (let y = 0; y < h; y++) { edge(0, y); edge(w - 1, y); }
    if (br.length < 8) return { canvas: out, removed: 0 }; // 이미 가장자리가 투명한 그림
    const med = (a) => { a.sort((p, q) => p - q); return a[a.length >> 1]; };
    const R = med(br), G = med(bg), B = med(bb);
    const dist = (o) => Math.max(Math.abs(d[o] - R), Math.abs(d[o + 1] - G), Math.abs(d[o + 2] - B));
    const mask = new Uint8Array(w * h), stack = new Int32Array(w * h);
    let top = 0;
    const seed = (p) => { if (!mask[p] && (d[p * 4 + 3] < 16 || dist(p * 4) <= tol)) { mask[p] = 1; stack[top++] = p; } };
    for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
    while (top) {
      const p = stack[--top], x = p % w;
      if (x > 0) seed(p - 1);
      if (x < w - 1) seed(p + 1);
      if (p >= w) seed(p - w);
      if (p < w * (h - 1)) seed(p + w);
    }
    let removed = 0;
    for (let p = 0; p < w * h; p++) {
      if (mask[p]) { d[p * 4 + 3] = 0; removed++; continue; }
      // 지운 곳과 맞닿은 테두리: 바탕 색에 가까울수록 옅게 (흰 테가 남지 않게)
      const x = p % w;
      if ((x > 0 && mask[p - 1]) || (x < w - 1 && mask[p + 1]) || (p >= w && mask[p - w]) || (p < w * (h - 1) && mask[p + w])) {
        const k = Math.min(1, dist(p * 4) / Math.max(1, tol * 2.2));
        d[p * 4 + 3] = Math.round(d[p * 4 + 3] * (0.25 + 0.75 * k));
      }
    }
    ctx.putImageData(id, 0, 0);
    return { canvas: out, removed: removed / (w * h) };
  }
  /** 투명한 가장자리를 잘라 냄 (사물 크기가 그림 크기와 맞게) */
  function trim(cv) {
    const w = cv.width, h = cv.height;
    const d = cv.getContext('2d').getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0 || (x0 === 0 && y0 === 0 && x1 === w - 1 && y1 === h - 1)) return cv;
    const out = document.createElement('canvas');
    out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
    out.getContext('2d').drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return out;
  }
  /** 보이는 픽셀의 평균 색과 투명한 곳이 있는지 */
  function look(cv) {
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let r = 0, g = 0, b = 0, n = 0, clear = 0;
    for (let i = 0; i < d.length; i += 4 * 7) { if (d[i + 3] > 128) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } else clear++; }
    const hex = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    return { avg: n ? `#${hex(r / n)}${hex(g / n)}${hex(b / n)}` : '#b9b3a8', alpha: clear > (n + clear) * 0.004 };
  }
  const toUrl = (cv, alpha) => (alpha ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.9));
  function thumbUrl(src, size = THUMB) {
    const sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height;
    const cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    const k = Math.min(size / sw, size / sh) * 0.94;
    cv.getContext('2d').drawImage(src, (size - sw * k) / 2, (size - sh * k) / 2, sw * k, sh * k);
    return cv.toDataURL('image/png');
  }

  /* ── 3D 미리보기: 끌어서 돌리고 휠·두 손가락으로 확대 ── */
  class Orbit {
    constructor(canvas) {
      this.canvas = canvas;
      this.R = null;
      this.scene = null;
      this.cam = { yaw: -0.65, pitch: 0.38, dist: 3, target: [0, 0.4, 0], r: 1 };
      try { this.R = new App.gl3d.Renderer(canvas, {}); } catch (_) { this.R = null; }
      this.raf = 0;
      this.pts = new Map();
      const pos = (e) => ({ x: e.clientX, y: e.clientY });
      canvas.addEventListener('pointerdown', (e) => { this.pts.set(e.pointerId, pos(e)); try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* 무시 */ } e.preventDefault(); });
      canvas.addEventListener('pointermove', (e) => {
        const prev = this.pts.get(e.pointerId);
        if (!prev) return;
        const now = pos(e);
        if (this.pts.size === 1) {
          this.cam.yaw -= (now.x - prev.x) * 0.01;
          this.cam.pitch = Math.max(-0.2, Math.min(1.5, this.cam.pitch + (now.y - prev.y) * 0.008));
        } else if (this.pts.size === 2) {
          const other = [...this.pts.entries()].find(([id]) => id !== e.pointerId)[1];
          const d0 = Math.hypot(prev.x - other.x, prev.y - other.y) || 1, d1 = Math.hypot(now.x - other.x, now.y - other.y) || 1;
          this.zoom(d0 / d1);
        }
        this.pts.set(e.pointerId, now);
        this.draw();
      });
      const up = (e) => this.pts.delete(e.pointerId);
      canvas.addEventListener('pointerup', up);
      canvas.addEventListener('pointercancel', up);
      canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom(Math.exp(Math.max(-300, Math.min(300, e.deltaY)) * 0.0015)); this.draw(); }, { passive: false });
      canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    }
    get ok() { return !!this.R; }
    zoom(k) { this.cam.dist = Math.max(this.cam.r * 0.6, Math.min(this.cam.r * 12, this.cam.dist * k)); }
    /** 장면을 바꿈 ({ layers, textured, bounds }). keep: 보는 방향·거리는 그대로 */
    set(scene, keep = false) {
      this.scene = scene;
      if (!this.R || !scene) return;
      this.R.setScene(scene);
      const b = scene.bounds, c = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
      const r = Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) / 2 || 0.5;
      this.R.setGround(App.gl3d.MAT.concrete, App.gl3d.hex('#e6e8eb'), [c[0], c[2]], Math.max(4, r * 6));
      this.cam.target = c;
      this.cam.r = r;
      if (!keep) this.cam.dist = (r / Math.sin(0.5 / 2)) * 1.08;
      this.draw();
    }
    resize() {
      const c = this.canvas, dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(2, Math.round(c.clientWidth * dpr)), h = Math.max(2, Math.round(c.clientHeight * dpr));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    }
    draw() {
      if (!this.R || !this.scene || this.raf) return;
      this.raf = requestAnimationFrame(() => { this.raf = 0; this.now(); });
    }
    now() {
      if (!this.R || !this.scene) return;
      this.resize();
      const { yaw, pitch, dist, target, r } = this.cam;
      const eye = [target[0] + dist * Math.cos(pitch) * Math.sin(yaw), target[1] + dist * Math.sin(pitch), target[2] + dist * Math.cos(pitch) * Math.cos(yaw)];
      this.R.render({ eye, target, fov: 0.5, near: Math.max(0.01, dist - r * 3), far: dist + r * 40 + 50 }, { sun: 0, clouds: false, shadows: true, shadowSize: 1024, focus: { center: target, radius: r * 1.6 + 0.2 }, fog: 1 / 4000 });
    }
    dispose() {
      cancelAnimationFrame(this.raf);
      this.scene = null;
      if (!this.R) return;
      try { this.R.dispose(); const lose = this.R.gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); } catch (_) { /* 무시 */ }
      this.R = null;
    }
  }

  /* ── 파일 고르기 ── */
  function pickFiles(o = {}) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.hidden = true;
      input.id = 'objFileInput';
      if (o.accept) input.accept = o.accept;
      if (o.multiple) input.multiple = true;
      const old = document.getElementById('objFileInput');
      if (old) old.remove();
      document.body.appendChild(input);
      let done = false;
      const finish = (v) => { if (done) return; done = true; input.remove(); resolve(v); };
      input.onchange = () => finish([...(input.files || [])]);
      input.oncancel = () => finish([]);
      input.click();
    });
  }
  const readBuffer = (f) => (f.arrayBuffer ? f.arrayBuffer() : new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error); r.readAsArrayBuffer(f); }));

  /* ── 등록 창 ── */
  const DEFAULT_H = { flat: 450, stand: 800, cutout: 1200 };
  let orbit = null;
  const closeOrbit = () => { if (orbit) { orbit.dispose(); orbit = null; } };

  /** 그림 상태에서 지금 쓸 그림(바탕 지움·자름 반영)을 만듦 */
  function imageNow(st) {
    if (st.bgOn) {
      if (!st.cut || st.cutTol !== st.tol) { const r = cutBackground(st.src, st.tol); st.cut = trim(r.canvas); st.cutTol = st.tol; st.removed = r.removed; }
      return st.cut;
    }
    return st.src;
  }
  /** 비율에 묶인 치수를 폭에서 다시 계산 */
  function relink(st, changed = 'w') {
    if (!st.lock) return;
    if (st.kind === 'image') {
      const cv = imageNow(st), a = cv.width / cv.height; // 가로÷세로
      if (st.look === 'flat') { if (changed === 'd') st.w = Math.round(st.d * a); else st.d = Math.round(st.w / a); }
      else if (changed === 'h') st.w = Math.round(st.h * a); else st.h = Math.round(st.w / a);
    } else if (st.kind === 'model' && st.nat) {
      const n = st.nat, k = changed === 'd' ? st.d / n[2] : changed === 'h' ? st.h / n[1] : st.w / n[0];
      if (!(k > 0)) return;
      st.w = Math.max(1, Math.round(n[0] * k)); st.h = Math.max(1, Math.round(n[1] * k)); st.d = Math.max(1, Math.round(n[2] * k));
    }
  }
  /** 모델을 지금 단위·축·방향으로 놓고 자연 크기를 다시 잼. sized: 크기 칸도 자연 크기로 */
  function placeModel(st, sized = true) {
    st.placed = App.meshio.place(st.raw.model, { scale: App.meshio.UNIT_MM[st.unit], up: st.up, turn: st.turn });
    const b = st.placed.bbox;
    st.nat = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]].map((v) => Math.max(0.001, v));
    if (sized) { st.w = Math.max(1, Math.round(st.nat[0])); st.h = Math.max(1, Math.round(st.nat[1])); st.d = Math.max(1, Math.round(st.nat[2])); }
    else relink(st, 'w');
  }

  function regHtml(st) {
    const sizeField = (k, label) => `<div class="field"><label class="field-label" for="obj-${k}">${label}</label><div class="field-box"><input id="obj-${k}" data-size="${k}" type="text" inputmode="numeric" value="${st[k] || ''}" autocomplete="off"><span class="field-unit">mm</span></div></div>`;
    const seg = (name, cur, list) => `<div class="seg-inline obj-seg" role="radiogroup">${list.map(([v, t, tip]) => `<button type="button" class="seg-btn" role="radio" data-${name}="${v}" aria-checked="${String(v) === String(cur)}"${tip ? ` title="${esc(tip)}"` : ''}>${esc(t)}</button>`).join('')}</div>`;
    let stage, opts = '';
    if (!st.kind) {
      stage = `<div class="obj-empty">
          <p><b>밖에서 받아 온 사물을 등록합니다</b></p>
          <div class="btn-row">
            <button type="button" class="btn btn-primary" data-act="obj-pick-image">제품 사진·그림 고르기</button>
            <button type="button" class="btn btn-primary" data-act="obj-pick-model">3D 모델 파일 고르기</button>
          </div>
          <p class="props-meta">사진: 오늘의집 같은 쇼핑 앱에서 저장한 제품 사진(JPG·PNG·WebP) · 화면 캡처도 됩니다. PC는 그림을 복사해 <kbd>Ctrl</kbd>+<kbd>V</kbd>로 붙여도 됩니다.<br>
          3D 모델: GLB·glTF·OBJ·STL (OBJ는 MTL·그림 파일, glTF는 .bin·그림 파일을 함께 고르세요). 스케치업·블렌더·3ds Max에서 GLB나 OBJ로 내보낸 것도 됩니다.</p>
        </div>`;
    } else if (st.kind === 'image') {
      stage = '<canvas class="obj-canvas obj-image" id="objCanvas" aria-label="사진 미리보기"></canvas>';
      opts = `
        <div class="field-group-label">보이는 방식</div>
        ${seg('look', st.look, [['stand', '제품 사진', '앞에서 찍은 제품 사진: 평면에는 자리 상자, 3D에는 상자 앞면에 사진'], ['flat', '위에서 본 그림', '위에서 내려다본 그림(러그·평면 기호): 평면에 그대로 깔림'], ['cutout', '세운 그림', '입간판처럼 사진만 세움 (사람·화분·등신대)']])}
        <div class="obj-row">
          <label class="check-row obj-check"><input type="checkbox" id="objBg" ${st.bgOn ? 'checked' : ''}><span>바탕 지우기 (흰 배경)</span></label>
          <label class="obj-tol" ${st.bgOn ? '' : 'hidden'}><span>세기</span><input type="range" id="objTol" min="6" max="110" step="2" value="${st.tol}" aria-label="바탕 지우기 세기"></label>
        </div>`;
    } else {
      stage = '<canvas class="obj-canvas" id="objCanvas" aria-label="3D 미리보기 (끌어서 돌리기)"></canvas>';
      const r = st.raw;
      opts = `
        <div class="obj-row">
          <span class="obj-lab">파일 단위</span>${seg('unit', st.unit, [['mm', 'mm'], ['cm', 'cm'], ['m', 'm'], ['inch', '인치']])}
        </div>
        <div class="obj-row">
          <span class="obj-lab">위쪽</span>${seg('up', st.up, [['y', 'Y축'], ['z', 'Z축']])}
          <button type="button" class="btn" data-act="obj-turn" title="위에서 봐서 시계 방향으로 90° — 앞면이 화면 앞쪽(아래)을 보게 맞추세요">↻ 90° 돌리기</button>
        </div>
        <p class="props-meta" id="objInfo">${esc(r.format.toUpperCase())} · 삼각형 ${r.tris.toLocaleString('ko-KR')}개${r.tris > App.meshio.PLACE_TRIS ? ` · 도면에 놓을 때는 ${App.meshio.PLACE_TRIS.toLocaleString('ko-KR')}개 아래로 줄여 가볍게 씁니다` : ''}</p>
        ${r.warnings.map((w) => `<p class="dialog-note is-warn">${esc(w)}</p>`).join('')}`;
    }
    return `
      <div class="obj-reg" data-keys="local">
        <div class="obj-stage">${stage}</div>
        ${st.kind ? `
        ${opts}
        <div class="field"><label class="field-label" for="objName">이름</label><div class="field-box"><input id="objName" type="text" maxlength="36" value="${esc(st.name)}" placeholder="예: 3인 패브릭 소파" autocomplete="off"></div></div>
        <div class="field-group-label obj-sizehead"><span>실제 크기</span><label class="check-row obj-check"><input type="checkbox" id="objLock" ${st.lock ? 'checked' : ''}><span>비율 고정</span></label></div>
        <div class="field-grid obj-size">${sizeField('w', '폭')}${sizeField('d', '깊이')}${sizeField('h', '높이')}</div>
        <details class="est-info obj-more" ${st.url || st.price || st.pasted ? 'open' : ''}>
          <summary>가격·구매 링크 · 상품 글 붙여넣기</summary>
          <div class="field-grid">
            <div class="field"><label class="field-label" for="objPrice">가격</label><div class="field-box"><input id="objPrice" type="text" inputmode="numeric" value="${st.price ? Math.round(st.price).toLocaleString('ko-KR') : ''}" placeholder="견적 단가로 들어갑니다" autocomplete="off"><span class="field-unit">원</span></div></div>
            <div class="field"><label class="field-label" for="objBrand">브랜드·판매처</label><div class="field-box"><input id="objBrand" type="text" maxlength="40" value="${esc(st.brand)}" placeholder="예: 오늘의집" autocomplete="off"></div></div>
          </div>
          <div class="field"><label class="field-label" for="objUrl">구매 링크</label><div class="field-box"><input id="objUrl" type="url" inputmode="url" maxlength="600" value="${esc(st.url)}" placeholder="https://…" autocomplete="off"></div></div>
          <div class="field"><label class="field-label" for="objPaste">상품 글 붙여넣기 (이름·링크·가격·크기를 찾아 채움)</label>
            <textarea id="objPaste" class="field-text" rows="2" placeholder="쇼핑 앱에서 ‘공유 → 복사’한 글이나 상품 정보의 크기 줄을 붙여 넣으세요. 예: 가로 2000 × 깊이 850 × 높이 800 mm">${esc(st.pasted || '')}</textarea>
            <button type="button" class="btn" data-act="obj-fill">글에서 채우기</button></div>
        </details>
        <div class="btn-row obj-again">
          <button type="button" class="btn" data-act="obj-pick-image">다른 사진</button>
          <button type="button" class="btn" data-act="obj-pick-model">다른 3D 모델</button>
        </div>` : ''}
      </div>`;
  }

  /** 미리보기 그림을 다시 그림 */
  function paint(body, st) {
    const cv = body.querySelector('#objCanvas');
    if (!cv) return;
    if (st.kind === 'image') {
      const img = imageNow(st);
      const box = cv.parentElement.clientWidth || 320, H = 240;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(box * dpr); cv.height = Math.round(H * dpr);
      const c = cv.getContext('2d');
      // 투명한 곳이 보이게 체크무늬
      const s = 12 * dpr;
      for (let y = 0; y < cv.height; y += s) for (let x = 0; x < cv.width; x += s) { c.fillStyle = ((x / s + y / s) & 1) ? '#e9ecef' : '#f8f9fa'; c.fillRect(x, y, s, s); }
      const k = Math.min((cv.width * 0.92) / img.width, (cv.height * 0.92) / img.height);
      c.drawImage(img, (cv.width - img.width * k) / 2, (cv.height - img.height * k) / 2, img.width * k, img.height * k);
      return;
    }
    if (!orbit || orbit.canvas !== cv) {
      closeOrbit();
      orbit = new Orbit(cv);
      if (st.view) { orbit.cam.yaw = st.view.yaw; orbit.cam.pitch = st.view.pitch; } // 단위·방향을 바꿔도 보던 쪽 그대로
      st.view = orbit.cam;
    }
    if (orbit.ok) orbit.set(App.library.sceneOf(st.placed));
    else if (!body.querySelector('.obj-nogl')) cv.insertAdjacentHTML('afterend', '<p class="obj-nogl">이 기기에서는 3D 미리보기를 쓸 수 없습니다. 크기만 확인하고 등록하세요.</p>');
  }
  const syncSize = (body, st) => ['w', 'd', 'h'].forEach((k) => { const el = body.querySelector(`#obj-${k}`); if (el && document.activeElement !== el) el.value = st[k] || ''; });

  async function takeImage(st, src, name) {
    const cv = await loadImage(src);
    const first = look(cv);
    Object.assign(st, { kind: 'image', src: cv, cut: null, cutTol: null, tol: st.tol || 30, bgOn: !first.alpha, look: st.look || 'stand', removed: 0, raw: null, placed: null, painted: false });
    // 바탕이 잘 안 지워지는 사진(배경이 복잡한 사진)은 끈 채로 시작
    if (st.bgOn) { const r = cutBackground(cv, st.tol); if (r.removed < 0.04 || r.removed > 0.97) st.bgOn = false; else { st.cut = trim(r.canvas); st.cutTol = st.tol; st.removed = r.removed; } }
    if (!st.name && name) st.name = String(name).replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 36);
    if (!st.w) { st.w = 1000; st.d = 500; st.h = DEFAULT_H[st.look]; st.lock = true; }
    if (st.look === 'flat' ? !st.gotD : !st.gotH) relink(st, 'w');
  }
  async function takeModel(st, files) {
    const list = [];
    for (const f of files) list.push({ name: f.name, buffer: await readBuffer(f) }); // eslint-disable-line no-await-in-loop
    const raw = await App.meshio.parse(list);
    Object.assign(st, { kind: 'model', raw, unit: raw.unit, up: raw.up, turn: 0, src: null, cut: null, painted: false, lock: true });
    const keep = st.w > 0 && st.gotSize; // 글에서 받은 크기가 있으면 폭만 맞춰 비율대로
    placeModel(st, !keep);
    if (!st.name) st.name = String(raw.name || '').replace(/[_-]+/g, ' ').trim().slice(0, 36);
  }

  /** 등록 창을 엶. o: { files: [File], image: 주소·Blob, text: 공유 받은 글 } — 등록하면 사물 id */
  async function register(o = {}) {
    const st = { kind: null, name: '', w: 0, d: 0, h: 0, lock: true, price: 0, url: '', brand: '', memo: '', pasted: '', tol: 30, look: 'stand' };
    const fill = (text, force = false) => {
      const p = parseText(text);
      if (p.name && (force || !st.name)) st.name = p.name;
      if (p.url) st.url = p.url;
      if (p.price) st.price = p.price;
      if (p.src && !st.brand) st.brand = p.src;
      if (p.w) { st.w = p.w; st.gotSize = true; }
      if (p.d) { st.d = p.d; st.gotD = true; }
      if (p.h) { st.h = p.h; st.gotH = true; }
      if (p.w && st.kind === 'model') relink(st, 'w');
      return p;
    };
    const take = async (files) => {
      const fs = [...files];
      const model = fs.find((f) => MODEL_EXT.includes(extOf(f.name)));
      const image = fs.find(isImageFile);
      if (!model && !image) {
        // 모르는 형식: 3D 모델 쪽 안내를 보여 줌
        await App.meshio.parse(await Promise.all(fs.slice(0, 1).map(async (f) => ({ name: f.name, buffer: await readBuffer(f) }))));
        return;
      }
      if (model) await takeModel(st, fs); else await takeImage(st, image, image.name);
    };
    const safe = async (fn, msg) => {
      App.ui.busy(msg);
      try { await fn(); return true; } catch (e) { App.ui.toast(e && e.message ? e.message : '파일을 읽지 못했습니다.'); return false; } finally { App.ui.busy(false); }
    };
    if (o.text) { st.pasted = String(o.text).slice(0, 600); fill(o.text); }
    if (o.files && o.files.length) await safe(() => take(o.files), '파일을 읽는 중…');
    else if (o.image) await safe(() => takeImage(st, o.image, o.name || ''), '사진을 읽는 중…');

    let pasteHandler = null;
    for (;;) {
      const r = await App.ui.dialog({ // eslint-disable-line no-await-in-loop
        title: '사물 등록',
        html: regHtml(st),
        actions: st.kind ? [{ id: 'cancel', label: '취소' }, { id: 'ok', label: '등록', primary: true }] : [{ id: 'cancel', label: '닫기', primary: true }],
        onOpen(body) {
          const redraw = () => { const top = body.scrollTop; closeOrbit(); body.innerHTML = regHtml(st); App.icons.apply(body); body.scrollTop = top; wireFoot(); paint(body, st); };
          const wireFoot = () => {
            const foot = document.getElementById('dialogFoot');
            const want = st.kind ? '등록' : '';
            if (st.kind && !foot.querySelector('[data-id="ok"]')) foot.innerHTML = '<button type="button" class="btn" data-id="cancel">취소</button><button type="button" class="btn btn-primary" data-id="ok">등록</button>';
            return want;
          };
          const choose = async (model) => {
            const files = await pickFiles(model ? { multiple: true } : { accept: 'image/*' });
            if (!files.length) return;
            if (await safe(() => take(files), model ? '3D 모델을 읽는 중…' : '사진을 읽는 중…')) redraw();
          };
          body.addEventListener('click', async (e) => {
            const b = e.target.closest('[data-act], [data-look], [data-unit], [data-up]');
            if (!b) return;
            if (b.dataset.act === 'obj-pick-image') return choose(false);
            if (b.dataset.act === 'obj-pick-model') return choose(true);
            if (b.dataset.act === 'obj-fill') { const t = body.querySelector('#objPaste').value; st.pasted = t; const p = fill(t, true); redraw(); App.ui.toast(Object.keys(p).filter((k) => k !== 'src' || p.src).length ? '글에서 찾은 값을 채웠습니다. 크기를 확인하세요.' : '글에서 이름·링크·가격·크기를 찾지 못했습니다.'); return; }
            if (b.dataset.act === 'obj-turn') { st.turn = (st.turn + 90) % 360; placeModel(st, true); redraw(); return; }
            if (b.dataset.look) {
              st.look = b.dataset.look;
              if (!st.gotH && !st.hTouched) st.h = DEFAULT_H[st.look];
              if (st.look !== 'flat' && !st.gotD && !st.dTouched) st.d = st.look === 'cutout' ? 100 : 500;
              relink(st, 'w');
              redraw();
              return;
            }
            if (b.dataset.unit) { st.unit = b.dataset.unit; placeModel(st, true); redraw(); return; }
            if (b.dataset.up) { st.up = b.dataset.up; placeModel(st, true); redraw(); }
          });
          body.addEventListener('input', (e) => {
            const el = e.target;
            if (el.id === 'objName') st.name = el.value;
            else if (el.id === 'objPrice') st.price = num(el.value);
            else if (el.id === 'objUrl') st.url = el.value.trim();
            else if (el.id === 'objBrand') st.brand = el.value;
            else if (el.id === 'objPaste') st.pasted = el.value;
            else if (el.id === 'objTol') { st.tol = num(el.value); relink(st, 'w'); syncSize(body, st); paint(body, st); }
            else if (el.dataset.size) {
              const k = el.dataset.size;
              st[k] = Math.max(0, Math.round(num(el.value)));
              if (k === 'h') st.hTouched = true;
              if (k === 'd') st.dTouched = true;
              relink(st, k);
              syncSize(body, st);
            }
          });
          body.addEventListener('change', (e) => {
            const el = e.target;
            if (el.id === 'objBg') { st.bgOn = el.checked; relink(st, 'w'); redraw(); }
            else if (el.id === 'objLock') { st.lock = el.checked; if (st.lock) { relink(st, 'w'); syncSize(body, st); } }
            else if (el.id === 'objPrice') el.value = st.price ? Math.round(st.price).toLocaleString('ko-KR') : '';
          });
          body.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { e.preventDefault(); const c = document.querySelector('#dialogFoot [data-id="cancel"]'); if (c) c.click(); }
            else if (e.key === 'Enter' && e.target.tagName === 'INPUT' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); e.target.blur(); }
          });
          // 그림을 붙여넣기 (PC: 복사한 제품 사진을 Ctrl+V)
          pasteHandler = async (e) => {
            if (document.getElementById('dialog').hidden || !document.querySelector('#dialogBody .obj-reg')) return;
            const items = [...((e.clipboardData && e.clipboardData.items) || [])];
            const img = items.find((i) => i.kind === 'file' && /^image\//.test(i.type));
            if (img) {
              e.preventDefault();
              const f = img.getAsFile();
              if (f && await safe(() => takeImage(st, f, ''), '사진을 읽는 중…')) redraw();
            } else if (!/^(INPUT|TEXTAREA)$/.test((document.activeElement || {}).tagName || '')) {
              const t = e.clipboardData && e.clipboardData.getData('text');
              if (t && /https?:\/\//.test(t)) { st.pasted = t.slice(0, 600); fill(t); redraw(); }
            }
          };
          document.addEventListener('paste', pasteHandler);
          // 파일을 끌어다 놓기
          body.addEventListener('dragover', (e) => { e.preventDefault(); });
          body.addEventListener('drop', async (e) => {
            e.preventDefault();
            const files = [...((e.dataTransfer && e.dataTransfer.files) || [])];
            if (files.length && await safe(() => take(files), '파일을 읽는 중…')) redraw();
          });
          paint(body, st);
        },
      });
      if (pasteHandler) { document.removeEventListener('paste', pasteHandler); pasteHandler = null; }
      closeOrbit();
      if (r.id !== 'ok') return null;
      const name = String(st.name || '').replace(/\s+/g, ' ').trim();
      const bad = !name ? '이름을 넣어 주세요.' : !(st.w > 0 && st.d > 0) ? '폭과 깊이를 넣어 주세요.' : !(st.h > 0) && !(st.kind === 'image' && st.look === 'flat') ? '높이를 넣어 주세요.' : '';
      if (!bad) break;
      App.ui.toast(bad);
    }

    // 저장
    App.ui.busy('사물을 등록하는 중…');
    let id = null;
    try {
      const base = { name: st.name, w: st.w, d: st.d, h: st.h, price: st.price, url: /^https?:\/\//i.test(st.url) ? st.url : '', brand: st.brand, memo: st.memo };
      if (st.kind === 'image') {
        const cv = imageNow(st), lk = look(cv);
        id = await App.library.add({ ...base, type: st.look, avg: lk.avg, alpha: lk.alpha, src: '사진' }, { img: toUrl(cv, lk.alpha), thumb: thumbUrl(cv) });
      } else {
        const M = App.meshio, low = M.reduce(st.placed, M.PLACE_TRIS);
        const mesh = M.pack(low), view = low === st.placed ? null : M.pack(st.placed);
        id = await App.library.add({ ...base, type: 'mesh', tris: M.stats(low).tris, src: st.raw.format.toUpperCase() }, { mesh, view, thumb: null });
        const m = App.library.byId(id);
        const url = m && App.sprites && App.sprites.thumbNow ? App.sprites.thumbNow(m.name) : null;
        if (url) await App.library.setThumb(id, url);
      }
    } catch (e) {
      App.ui.toast(e && e.message ? e.message : '등록하지 못했습니다.');
      return null;
    } finally {
      App.ui.busy(false);
    }
    const m = App.library.byId(id);
    if (m && o.place !== false) placeNow(m.name, `‘${m.name}’을 등록했습니다.`);
    return id;
  }

  /** 등록한 사물을 바로 놓을 수 있게 도구·팔레트를 맞춤 */
  function placeNow(kind, lead = '') {
    if (App.modes.is('design')) { App.ui.toast(`${lead} 인테리어·조감도 모드의 가구·물건 → ‘내 사물’에서 놓을 수 있습니다.`.trim()); return; }
    const tool = App.modes.is('event') ? 'event' : 'furn';
    App.current[`${tool}Kind`] = kind;
    App.current[`${tool}Cat`] = App.library.CAT;
    App.ui.emit('current');
    App.ui.pickTool(tool);
    App.ui.toast(`${lead} 놓을 곳을 누르세요.`.trim());
  }

  /* ── 고치기 ── */
  async function edit(id) {
    const m = App.library.byId(id);
    if (!m) return false;
    const image = m.type !== 'mesh';
    const r = await App.ui.dialog({
      title: '사물 정보 고치기',
      html: `
        <div class="obj-reg" data-keys="local">
          <div class="field"><label class="field-label" for="objName">이름</label><div class="field-box"><input id="objName" type="text" maxlength="36" value="${esc(m.name)}" autocomplete="off"></div></div>
          ${image ? `<div class="field"><label class="field-label" for="objType">보이는 방식</label><div class="field-box"><select id="objType">${['stand', 'flat', 'cutout'].map((t) => `<option value="${t}" ${t === m.type ? 'selected' : ''}>${esc(App.library.TYPES[t])}</option>`).join('')}</select></div></div>` : ''}
          <div class="field-grid obj-size">
            ${[['w', '폭'], ['d', '깊이'], ['h', '높이']].map(([k, label]) => `<div class="field"><label class="field-label" for="obj-${k}">${label}</label><div class="field-box"><input id="obj-${k}" type="text" inputmode="numeric" value="${m[k]}" autocomplete="off"><span class="field-unit">mm</span></div></div>`).join('')}
          </div>
          <div class="field-grid">
            <div class="field"><label class="field-label" for="objPrice">가격</label><div class="field-box"><input id="objPrice" type="text" inputmode="numeric" value="${m.price ? m.price.toLocaleString('ko-KR') : ''}" autocomplete="off"><span class="field-unit">원</span></div></div>
            <div class="field"><label class="field-label" for="objBrand">브랜드·판매처</label><div class="field-box"><input id="objBrand" type="text" maxlength="40" value="${esc(m.brand)}" autocomplete="off"></div></div>
          </div>
          <div class="field"><label class="field-label" for="objUrl">구매 링크</label><div class="field-box"><input id="objUrl" type="url" inputmode="url" maxlength="600" value="${esc(m.url)}" placeholder="https://…" autocomplete="off"></div></div>
          <div class="field"><label class="field-label" for="objMemo">메모</label><div class="field-box"><input id="objMemo" type="text" maxlength="200" value="${esc(m.memo)}" autocomplete="off"></div></div>
          <p class="props-meta">크기를 바꾸면 앞으로 놓는 것부터 새 크기로 놓입니다 (이미 놓은 것은 그대로). 가격은 견적의 단가로 들어갑니다.</p>
        </div>`,
      actions: [{ id: 'cancel', label: '취소' }, { id: 'ok', label: '저장', primary: true }],
      onOpen(body) {
        body.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') { e.preventDefault(); document.querySelector('#dialogFoot [data-id="cancel"]').click(); }
          else if (e.key === 'Enter' && e.target.tagName === 'INPUT' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); document.querySelector('#dialogFoot [data-id="ok"]').click(); }
        });
      },
    });
    if (r.id !== 'ok') return false;
    const q = (s) => r.body.querySelector(s);
    const url = q('#objUrl').value.trim();
    const patch = {
      name: q('#objName').value, w: num(q('#obj-w').value) || m.w, d: num(q('#obj-d').value) || m.d, h: Math.max(0, num(q('#obj-h').value)),
      price: num(q('#objPrice').value), brand: q('#objBrand').value, url: /^https?:\/\//i.test(url) ? url : '', memo: q('#objMemo').value,
      ...(image ? { type: q('#objType').value } : {}),
    };
    const next = App.library.update(id, patch);
    if (next) App.ui.toast(`‘${next.name}’을 고쳤습니다.`);
    if (App.summary && App.summary.render) App.summary.render();
    return !!next;
  }

  /* ── 목록 관리 ── */
  const sizeText = (m) => `${mm(m.w)} × ${mm(m.d)} × ${mm(m.h)} mm`;
  function cardHtml(m) {
    const t = App.library.thumb(m.name);
    return `<article class="obj-card" data-id="${esc(m.id)}">
        <div class="obj-pic">${t ? `<img src="${esc(t)}" alt="" draggable="false">` : `<span class="obj-nopic" style="background:${esc(m.avg)}"></span>`}</div>
        <div class="obj-meta">
          <b>${esc(m.name)}</b>
          <small>${esc(App.library.TYPES[m.type])} · ${esc(sizeText(m))}</small>
          <small>${m.price ? esc(won(m.price)) : '가격 없음'}${m.brand ? ` · ${esc(m.brand)}` : ''}</small>
        </div>
        <div class="obj-acts">
          <button type="button" class="btn btn-primary" data-act="obj-place">놓기</button>
          <button type="button" class="btn" data-act="obj-edit">고치기</button>
          ${m.url ? '<button type="button" class="btn" data-act="obj-link" title="구매 링크 열기">링크</button>' : ''}
          <button type="button" class="btn" data-act="obj-export" title="이 사물만 파일로 내보내기">내보내기</button>
          <button type="button" class="btn btn-danger" data-act="obj-del" aria-label="${esc(m.name)} 지우기">지우기</button>
        </div>
      </article>`;
  }
  function listHtml() {
    const list = App.library.list();
    return `
      <div class="obj-list" data-keys="local">
        <div class="btn-row obj-top">
          <button type="button" class="btn btn-primary" data-act="obj-new">＋ 사물 등록 (사진·3D 모델)</button>
          <button type="button" class="btn" data-act="obj-import">묶음 파일 가져오기</button>
          <button type="button" class="btn" data-act="obj-export-all" ${list.length ? '' : 'disabled'}>모두 내보내기</button>
        </div>
        ${list.length ? `<div class="obj-grid">${list.map(cardHtml).join('')}</div>` : `
          <div class="empty"><div class="empty-title">등록한 사물이 없습니다</div>
          <p>오늘의집 같은 쇼핑 앱에서 저장한 <b>제품 사진</b>이나, 모델 사이트에서 받은 <b>3D 모델 파일</b>(GLB·OBJ·STL)을 등록하면 가구·물건처럼 도면에 놓고 3D로 볼 수 있습니다. 설계 모드에서 만든 가구·전광판도 여기에 모입니다.</p></div>`}
        <p class="props-meta">사물은 이 기기에 저장됩니다. 다른 기기로 옮길 때는 ‘모두 내보내기’로 만든 묶음 파일을 그 기기에서 ‘묶음 파일 가져오기’로 여세요. 도면 백업 파일에는 그 도면에 놓인 사물이 함께 들어갑니다.</p>
      </div>`;
  }
  async function open() {
    let again = null;
    await App.ui.dialog({
      title: '내 사물',
      html: listHtml(),
      actions: [{ id: 'close', label: '닫기', primary: true }],
      onOpen(body) {
        const close = () => document.querySelector('#dialogFoot [data-id="close"]').click();
        body.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } });
        body.addEventListener('click', async (e) => {
          const b = e.target.closest('[data-act]');
          if (!b) return;
          const card = b.closest('[data-id]'), id = card && card.dataset.id, m = id && App.library.byId(id);
          switch (b.dataset.act) {
            case 'obj-new': again = () => register(); close(); break;
            case 'obj-import': again = async () => { await importPack(); open(); }; close(); break;
            case 'obj-export-all': exportPack(App.library.list().map((x) => x.id)); break;
            case 'obj-place': if (m) { close(); placeNow(m.name); } break;
            case 'obj-edit': if (m) { again = async () => { await edit(id); open(); }; close(); } break;
            case 'obj-link': if (m && m.url) window.open(m.url, '_blank', 'noopener'); break;
            case 'obj-export': if (m) exportPack([id]); break;
            case 'obj-del': if (m) { again = async () => { await removeAsk(id); open(); }; close(); } break;
            default:
          }
        });
      },
    });
    if (again) await again();
  }
  async function removeAsk(id) {
    const m = App.library.byId(id);
    if (!m) return false;
    const used = App.doc && [...App.doc.all()].filter((e) => e.type === 'item' && e.kind === m.name).length;
    const r = await App.ui.dialog({
      title: '사물 지우기',
      html: `<p>‘${esc(m.name)}’을 내 사물 목록에서 지울까요?</p>${used ? `<p class="dialog-note is-warn">지금 도면에 ${used}개 놓여 있습니다. 놓인 것은 그대로 남고, 목록에서만 빠집니다.</p>` : '<p class="props-meta">다른 도면에 놓인 것이 있으면 그 도면에서는 계속 보입니다.</p>'}`,
      actions: [{ id: 'cancel', label: '취소' }, { id: 'ok', label: '지우기', danger: true }],
    });
    if (r.id !== 'ok') return false;
    await App.library.remove(id);
    App.ui.toast(`‘${m.name}’을 목록에서 지웠습니다.`);
    return true;
  }

  /* ── 사물 묶음 파일 ── */
  async function exportPack(ids) {
    if (!ids.length) return false;
    App.ui.busy('사물을 파일로 묶는 중…');
    try {
      const objects = [];
      for (const id of ids) { const rec = await App.library.exportData(id); if (rec && (rec.img || rec.mesh)) objects.push(rec); } // eslint-disable-line no-await-in-loop
      if (!objects.length) { App.ui.toast('내보낼 사물 데이터를 찾지 못했습니다.'); return false; }
      const one = objects.length === 1 ? objects[0].meta.name : `내사물_${objects.length}개`;
      const name = `${one.replace(/[\\/:*?"<>|]+/g, '_')}_${App.exporter.stamp()}.hjobj.json`;
      const text = JSON.stringify({ kind: PACK_KIND, version: 1, appVersion: App.settingsUI.APP_VERSION, savedAt: new Date().toISOString(), objects });
      App.exporter.saved(App.exporter.download(name, text, 'application/json'), `‘${name}’을 저장했습니다 (사물 ${objects.length}개). 다른 기기에서 ‘내 사물 → 묶음 파일 가져오기’로 여세요.`);
      return { name, count: objects.length, text };
    } finally {
      App.ui.busy(false);
    }
  }
  /** 묶음 파일(글)을 읽어 목록에 넣음. 돌려주는 값: { added, kept, failed } */
  async function importPackText(text) {
    let data;
    try { data = JSON.parse(text); } catch (_) { data = null; }
    if (!data || data.kind !== PACK_KIND || !Array.isArray(data.objects)) throw new Error('사물 묶음 파일(.hjobj.json)이 아닙니다.');
    const out = { added: 0, kept: 0, failed: 0 };
    for (const rec of data.objects) { const r = await App.library.importData(rec); out[r]++; } // eslint-disable-line no-await-in-loop
    return out;
  }
  async function importPack() {
    const files = await pickFiles({ multiple: true });
    if (!files.length) return false;
    App.ui.busy('사물 묶음을 여는 중…');
    const sum = { added: 0, kept: 0, failed: 0 };
    let bad = 0;
    try {
      for (const f of files) {
        try { const r = await importPackText(await f.text()); Object.keys(sum).forEach((k) => { sum[k] += r[k]; }); } catch (_) { bad++; } // eslint-disable-line no-await-in-loop
      }
    } finally {
      App.ui.busy(false);
    }
    App.ui.toast(sum.added || sum.kept ? `사물 ${sum.added}개를 넣었습니다.${sum.kept ? ` 이미 있던 ${sum.kept}개는 그대로 두었습니다.` : ''}${sum.failed || bad ? ' 읽지 못한 것이 있습니다.' : ''}` : '사물 묶음 파일(.hjobj.json)을 골라 주세요.');
    return sum.added > 0;
  }

  /* ── 구매 목록 ── */
  function shoppingRows() {
    const list = App.library.shopping();
    return { list, total: list.reduce((t, r) => t + r.amount, 0), count: list.reduce((t, r) => t + r.qty, 0) };
  }
  function shoppingText() {
    const { list, total } = shoppingRows();
    const name = App.projects && App.projects.current ? App.projects.current.name : '도면';
    return [`[구매 목록] ${name}`, ...list.map((r, i) => `${i + 1}. ${r.name} ${sizeText(r.meta)} × ${r.qty}개${r.price ? ` · ${won(r.amount)}` : ''}${r.url ? `\n   ${r.url}` : ''}`), total ? `합계 ${won(total)} (등록한 가격 기준)` : ''].filter(Boolean).join('\n');
  }
  function shoppingCsv() {
    const { list, total } = shoppingRows();
    const rows = [['이름', '폭(mm)', '깊이(mm)', '높이(mm)', '수량', '단가(원)', '금액(원)', '브랜드·판매처', '구매 링크']];
    list.forEach((r) => rows.push([r.name, r.meta.w, r.meta.d, r.meta.h, r.qty, r.price || '', r.price ? r.amount : '', r.meta.brand, r.url]));
    rows.push(['합계', '', '', '', list.reduce((t, r) => t + r.qty, 0), '', total || '', '', '']);
    const name = `${(App.projects && App.projects.current ? App.projects.current.name : '도면').replace(/[\\/:*?"<>|]+/g, '_')}_구매목록_${App.exporter.stamp()}.csv`;
    App.exporter.saved(App.exporter.download(name, App.exporter.csvText(rows), 'text/csv;charset=utf-8'), `‘${name}’을 저장했습니다.`);
    return { name, rows };
  }
  async function shopping() {
    const { list, total, count } = shoppingRows();
    await App.ui.dialog({
      title: '구매 목록 (내 사물)',
      html: `
        <div class="obj-shop" data-keys="local">
          ${list.length ? `<table class="sum-table obj-shop-table"><tbody>
            ${list.map((r) => `<tr><th scope="row">${esc(r.name)}<small>${esc(sizeText(r.meta))}${r.meta.brand ? ` · ${esc(r.meta.brand)}` : ''}</small></th>
              <td>${r.qty}개${r.price ? `<small>${esc(won(r.price))} × ${r.qty} = ${esc(won(r.amount))}</small>` : '<small>가격 없음</small>'}</td>
              <td class="obj-shop-link">${r.url ? `<a class="btn" href="${esc(r.url)}" target="_blank" rel="noopener">열기</a>` : ''}</td></tr>`).join('')}
            <tr class="is-total"><th scope="row">합계</th><td>${count}개${total ? `<small>${esc(won(total))}</small>` : ''}</td><td></td></tr>
          </tbody></table>` : '<p class="props-meta">도면에 놓인 내 사물이 없습니다.</p>'}
          <div class="btn-row">
            <button type="button" class="btn" data-act="shop-copy" ${list.length ? '' : 'disabled'}>글로 복사 (카톡·문자)</button>
            <button type="button" class="btn" data-act="shop-csv" ${list.length ? '' : 'disabled'}>CSV</button>
          </div>
          <p class="props-meta">가격은 사물을 등록할 때 넣은 값입니다 (실제 가격·재고는 링크에서 확인). 견적의 단가에도 같은 값이 들어갑니다.</p>
        </div>`,
      actions: [{ id: 'close', label: '닫기', primary: true }],
      onOpen(body) {
        body.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); document.querySelector('#dialogFoot [data-id="close"]').click(); } });
        body.addEventListener('click', async (e) => {
          const b = e.target.closest('[data-act]');
          if (!b) return;
          if (b.dataset.act === 'shop-csv') shoppingCsv();
          if (b.dataset.act === 'shop-copy') {
            const text = shoppingText();
            try { await navigator.clipboard.writeText(text); App.ui.toast('구매 목록을 복사했습니다. 카톡·문자에 붙여 넣으세요.'); }
            catch (_) { const ta = document.createElement('textarea'); ta.className = 'field-text'; ta.rows = 8; ta.readOnly = true; ta.value = text; b.closest('.btn-row').after(ta); ta.select(); App.ui.toast('아래 글을 길게 눌러 복사하세요.'); }
          }
        });
      },
    });
  }
  /** 집계 ‘전체’에 넣을 묶음 */
  function summaryBlock() {
    const { list, total, count } = shoppingRows();
    if (!list.length) return null;
    const V = (text) => ({ text });
    return {
      title: '내 사물 (구매 목록)', sub: '등록한 사물 · 가격·링크는 ‘링크 보기’에서', action: { act: 'obj-shopping', label: '링크 보기' },
      rows: [...list.map((r) => ({ label: r.name, value: V(`${r.qty}개`), note: `${sizeText(r.meta)}${r.price ? ` · ${won(r.amount)}` : ''}`, cls: '', cat: '' })),
        { label: '내 사물 총계', value: V(`${count}개`), note: total ? won(total) : '', cls: 'total', cat: '' }],
    };
  }

  /* ── 다른 앱에서 ‘공유’로 받은 것 (안드로이드 앱·웹앱) ── */
  async function fromShare(s = {}) {
    const text = [s.title, s.text, s.url].filter(Boolean).join('\n').trim();
    if (s.image) return register({ image: s.image, text, name: s.name || '' });
    if (s.files && s.files.length) return register({ files: s.files, text });
    if (text) return register({ text });
    return null;
  }
  function init() {
    // 웹앱(PWA) 공유 대상: index.html?share-title=…&share-text=…&share-url=…
    try {
      const q = new URLSearchParams(location.search);
      if (q.has('share-title') || q.has('share-text') || q.has('share-url')) {
        const s = { title: q.get('share-title') || '', text: q.get('share-text') || '', url: q.get('share-url') || '' };
        history.replaceState(null, '', location.pathname);
        setTimeout(() => fromShare(s), 600);
      }
    } catch (_) { /* 주소를 못 읽는 환경 */ }
    // 안드로이드 앱: 다른 앱의 ‘공유’ 목록에서 현장도면을 고르면 글·사진이 넘어옴
    const C = window.Capacitor;
    const P = C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.ShareIn;
    if (P) {
      const take = (d) => { if (d && (d.text || d.image)) fromShare({ text: d.text || '', image: d.image || null, name: d.name || '' }); };
      try { P.addListener('share', take); P.consume().then(take).catch(() => {}); } catch (_) { /* 플러그인이 없는 빌드 */ }
    }
    const m = document.getElementById('menuObjects');
    if (m) m.addEventListener('click', () => open());
    // 목록 창이 열려 있을 때 사물이 바뀌면(미리보기 그림을 다 읽었을 때 등) 다시 그림
    App.ui.on('library', () => {
      const body = document.querySelector('#dialogBody');
      if (!body || document.getElementById('dialog').hidden || !body.querySelector('.obj-list')) return;
      const top = body.scrollTop;
      body.innerHTML = listHtml();
      body.scrollTop = top;
    });
  }

  App.libraryUI = { init, register, open, edit, placeNow, shopping, shoppingCsv, shoppingText, summaryBlock, exportPack, importPack, importPackText, fromShare, parseText, parseSize, cutBackground, trim, loadImage, look, Orbit };
})();
