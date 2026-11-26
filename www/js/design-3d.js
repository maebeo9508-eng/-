/* 설계 모드 3D 작업 화면 (‘입체’ 그림): 돌려 보며 부재를 눌러 고르고, 끌어 옮기고, 면 손잡이를 끌어 늘이고 줄인다.
   방향 단추(앞·뒤·왼쪽·오른쪽·위·비스듬히·45° 돌리기·맞춤)로 보는 쪽을 정한다. 복제·삭제·여러 개·자르기·꺾기·둥글게는 아래 빠른 막대에서.
   - 빈 곳·다른 부재를 끌면 돌려 봄 (마우스 오른쪽·Shift 또는 두 손가락은 화면 이동), 휠·두 손가락 벌리기로 확대
   - 누르기: 부재 고르기 (같은 자리를 다시 누르면 뒤에 있는 부재, 빈 곳을 누르면 고르기 풀기)
   - 고른 부재를 끌면 옮김: 비스듬히·위에서 보면 바닥을 따라, 옆에서 보면 마주 보는 면을 따라 (10mm·다른 부재 면에 붙음, Alt는 1mm)
   - 주황 점(보이는 면의 가운데): 그 면을 끌어 크기 · ↕ 점: 위아래로 옮김 · 점을 그냥 누르면 숫자로
   - 값으로 만든 설계(수납장·테이블…): 아무것도 안 골랐을 때 청록 점으로 전체 폭·깊이·높이
   장면 좌표는 toModel과 같은 자리 맞춤(design.sceneMap)이고, 부재가 바뀌어 장면 가운데가 움직이면 보는 곳도 같이 옮겨 화면이 흔들리지 않게 한다 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const D = () => App.design, UI = () => App.designUI;
  const FOV = 0.5, TH = Math.tan(FOV / 2);
  const TOP_PITCH = 1.0;   // 이보다 내려다보면 ‘위에서 보기’: 화살표가 바닥을 따라 움직임
  const SIDE_PITCH = 0.35; // 이보다 낮게 보면 ‘옆에서 보기’: 끌면 마주 보는 면을 따라(좌우·위아래) 옮김
  const DIRS = { iso: [0.785, 0.5], front: [0, 0.06], right: [Math.PI / 2, 0.06], back: [Math.PI, 0.06], left: [-Math.PI / 2, 0.06], top: [0, 1.55] };
  const st = {
    R: null, box: null, cv: null, hud: null, failed: false,
    cam: { yaw: DIRS.iso[0], pitch: DIRS.iso[1], dist: 3, target: [0, 0.4, 0], r: 1 },
    map: null, el: null, B: null, sel: undefined, doors: null, elId: null, raf: 0, lastBuild: 0, anim: null, empty: false,
    ptrs: new Map(), press: null, drag: null, pinch: null, lastTap: 0, label: null,
    lod: false, lodTimer: 0, // 돌리거나 끄는 동안은 낮은 해상도·작은 그림자로 (손을 떼면 선명하게 다시)
  };
  const isMode = () => App.modes && App.modes.is('design');
  const viewIs3d = () => App.designDraw && App.designDraw.viewNow() === 'iso';
  const active = () => !!st.box && !st.box.hidden;
  const r1 = (v) => Math.round(v * 10) / 10;
  const fmt = (v) => App.designDraw.fmt(v);
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

  /* ── 사진기 ── */
  function eyeOf(c = st.cam) {
    const cp = Math.cos(c.pitch);
    return [c.target[0] + c.dist * cp * Math.sin(c.yaw), c.target[1] + c.dist * Math.sin(c.pitch), c.target[2] + c.dist * cp * Math.cos(c.yaw)];
  }
  /** 사진기 바탕: { eye, f(앞), r(오른쪽), u(위) } (장면 좌표) */
  function basis() {
    const eye = eyeOf(), f = nrm(sub(st.cam.target, eye)), r = nrm(crs(f, [0, 1, 0])), u = crs(r, f);
    return { eye, f, r, u };
  }
  const size = () => ({ w: st.cv ? st.cv.clientWidth || 1 : 1, h: st.cv ? st.cv.clientHeight || 1 : 1 });
  /** 장면 좌표 → 화면 픽셀 (캔버스 기준). 사진기 뒤면 null */
  function project(p, B = basis()) {
    const { w, h } = size(), v = sub(p, B.eye), z = dot(v, B.f);
    if (z < 1e-4) return null;
    const asp = w / h;
    return { x: ((dot(v, B.r) / (z * TH * asp)) + 1) * w / 2, y: (1 - dot(v, B.u) / (z * TH)) * h / 2, z };
  }
  /** 화면 픽셀 → 광선 { o, d } (장면 좌표) */
  function ray(x, y, B = basis()) {
    const { w, h } = size(), nx = (2 * x) / w - 1, ny = 1 - (2 * y) / h, asp = w / h;
    return { o: B.eye, d: nrm([B.f[0] + B.r[0] * nx * TH * asp + B.u[0] * ny * TH, B.f[1] + B.r[1] * nx * TH * asp + B.u[1] * ny * TH, B.f[2] + B.r[2] * nx * TH * asp + B.u[2] * ny * TH]) };
  }
  /** 3D 화면에서 가리지 않는 칸 (캔버스 픽셀): 위쪽 버튼 줄 아래, 빠른 막대·서랍 위 */
  function visRect() {
    const { w, h } = size();
    if (!st.box) return { x0: 0, y0: 0, x1: w, y1: h };
    const br = st.box.getBoundingClientRect(), top = document.getElementById('stageTop'), qb = document.getElementById('dsQuick'), P = App.plan;
    let y0 = top ? top.getBoundingClientRect().bottom - br.top + 8 : 0, y1 = h - ((P && P.insets && P.insets.bottom) || 0) - 8;
    const dir = st.box.querySelector('.ds-dir'), dr = dir ? dir.getBoundingClientRect() : null;
    if (dr && dr.width > w * 0.6) y0 = Math.max(y0, dr.bottom - br.top + 8); // 휴대폰: 방향 단추가 한 줄로 가로지름
    if (qb && !qb.hidden && qb.offsetParent) y1 = Math.min(y1, qb.getBoundingClientRect().top - br.top - 8);
    if (y1 - y0 < h * 0.35) { y0 = Math.max(0, y1 - h * 0.35); } // 너무 좁으면 위를 조금 덮어도 됨
    return { x0: 8, y0: Math.max(0, y0), x1: w - 8, y1: Math.max(y0 + 40, y1) };
  }
  /** 장면 범위에 맞는 거리 (Orbit과 같은 방식, 가리지 않는 칸에 맞춤) */
  function fitDist(b, c) {
    const { yaw, pitch } = st.cam, cp = Math.cos(pitch), dir = [cp * Math.sin(yaw), Math.sin(pitch), cp * Math.cos(yaw)];
    const rl = Math.hypot(dir[2], dir[0]) || 1, right = [dir[2] / rl, 0, -dir[0] / rl], up = crs(dir, right).map((v) => -v);
    const { w, h } = size(), V = visRect(), asp = Math.max(0.3, Math.min(3, w / h)), tv = TH * ((V.y1 - V.y0) / h), th = TH * asp * ((V.x1 - V.x0) / w);
    let d = 0;
    for (let i = 0; i < 8; i++) {
      const p = [(i & 1 ? b.max[0] : b.min[0]) - c[0], (i & 2 ? b.max[1] : b.min[1]) - c[1], (i & 4 ? b.max[2] : b.min[2]) - c[2]];
      const along = dot(p, dir), x = Math.abs(dot(p, right)), y = Math.abs(dot(p, up));
      d = Math.max(d, x / th + along, y / tv + along);
    }
    return d;
  }
  /** 보는 곳·거리를 맞춤: 고른 부재가 있으면 그 부재로, 없으면 전체 */
  function fit(toSel = false) {
    if (!st.R || !st.scene) return;
    let b = st.scene.bounds;
    const el = D().current(), id = UI().selected();
    if (toSel && el && id && st.map) {
      const q = D().build(el).parts.find((x) => x.id === id);
      if (q) { const S = D().corners(q).map(st.map); b = { min: [0, 1, 2].map((k) => Math.min(...S.map((p) => p[k]))), max: [0, 1, 2].map((k) => Math.max(...S.map((p) => p[k]))) }; }
    }
    const c = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
    const r = Math.max(0.05, Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) / 2);
    st.cam.target = c; st.cam.r = Math.max(r, st.scene ? Math.hypot(st.scene.bounds.max[0] - st.scene.bounds.min[0], st.scene.bounds.max[1] - st.scene.bounds.min[1], st.scene.bounds.max[2] - st.scene.bounds.min[2]) / 2 : r);
    const V = visRect(), { w, h } = size();
    st.cam.dist = Math.max((r / Math.sin(0.25)) * 1.02 * Math.min(1, h / Math.max(1, V.y1 - V.y0)), fitDist(b, c) * 1.06);
    // 가리지 않는 칸의 가운데에 보이게 보는 곳을 옮김
    const Bs = basis(), per = (2 * st.cam.dist * TH) / h, dx = (V.x0 + V.x1) / 2 - w / 2, dy = (V.y0 + V.y1) / 2 - h / 2;
    st.cam.target = c.map((v, k) => v - Bs.r[k] * dx * per + Bs.u[k] * dy * per);
    st.userView = false;
    draw();
  }
  /** 방향 단추: 그쪽에서 보게 (0.35초에 걸쳐 돌아감). 'cw'·'ccw'는 45°씩 돌리기, 'fit'은 맞춤 */
  function setDir(name) {
    if (name === 'fit') { fit(!!UI().selected()); return; }
    let to;
    if (name === 'cw' || name === 'ccw') to = [st.cam.yaw + (name === 'cw' ? Math.PI / 4 : -Math.PI / 4), st.cam.pitch > 1.3 ? DIRS.iso[1] : st.cam.pitch];
    else if (DIRS[name]) to = DIRS[name].slice();
    else return;
    // 가장 가까운 쪽으로 돌기
    let dy = to[0] - st.cam.yaw;
    dy = ((dy + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    st.anim = { y0: st.cam.yaw, p0: st.cam.pitch, dy, p1: to[1], t0: performance.now(), dur: 350 };
    st.dirNow = DIRS[name] ? name : null;
    syncDirButtons();
    draw();
  }
  const DIR_NAME = { front: '앞', right: '오른쪽', back: '뒤', left: '왼쪽', top: '위', iso: '비스듬히' };
  function syncDirButtons() {
    if (!st.box) return;
    st.box.querySelectorAll('[data-dir]:not(.ds-dir-toggle)').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.dir === st.dirNow)));
    const now = st.box.querySelector('.ds-dir-now'); // 휴대폰: 접어 둔 단추에 지금 보는 쪽 이름
    if (now) now.textContent = DIR_NAME[st.dirNow] || '방향';
  }
  /** 휴대폰: 방향 단추 줄을 펼치고 접음 (접으면 단추 하나만 남아 화면을 가리지 않음) */
  function openDirs(on) {
    const pad = st.box && st.box.querySelector('.ds-dir');
    if (!pad) return;
    pad.classList.toggle('is-open', !!on);
    const t = pad.querySelector('.ds-dir-toggle');
    if (t) t.setAttribute('aria-expanded', String(!!on));
  }

  /* ── 장면 ── */
  function ensure() {
    if (st.R || st.failed || !st.box) return !!st.R;
    const cv = st.box.querySelector('.ds-3dv-gl');
    try { st.R = new App.gl3d.Renderer(cv, {}); } catch (_) { st.R = null; }
    if (!st.R) { st.failed = true; return false; }
    st.cv = cv;
    return true;
  }
  /** 부재·고른 것·문짝이 바뀌었으면 장면을 다시 만듦 */
  function rebuild(force = false) {
    const el = isMode() ? D().current() : null;
    if (!el || !ensure()) return;
    const sel = UI().selected(), doors = App.current.designDoors !== false;
    if (el.kind === 'model') return rebuildModel(el);
    const B = D().build(el);
    if (!force && st.el === el && st.B === B && st.sel === sel && st.doors === doors) return;
    const same = st.elId === el.id, grew = same && st.B && st.B.parts.length !== B.parts.length; // 부재를 넣거나 지움
    const prevB = st.B;
    st.el = el; st.B = B; st.sel = sel; st.doors = doors;
    const m = D().toModel(el, { pick: sel, hideDoors: !doors });
    st.empty = !m;
    if (!m) { st.scene = null; st.map = null; draw(); return; }
    const scene = App.library.sceneOf(m), map = D().sceneMap(el);
    if (same && st.map && map) { // 장면 가운데가 옮겨진 만큼 보는 곳도 옮겨 화면이 그대로 있게
      // 붙박는 점: 보통은 설계 좌표의 원점. 전체 크기를 − 쪽 면에서 끄는 동안은 + 쪽 끝 (끄는 면이 손가락을 따라오게)
      let p0 = [0, 0, 0], p1 = [0, 0, 0];
      if (st.anchor && prevB && prevB.max) { p0 = prevB.min.slice(); p1 = B.min.slice(); p0[st.anchor.k] = prevB.max[st.anchor.k]; p1[st.anchor.k] = B.max[st.anchor.k]; }
      const a = st.map(p0), b = map(p1);
      st.cam.target = st.cam.target.map((v, k) => v + (b[k] - a[k]));
    }
    st.scene = scene; st.map = map;
    st.R.setScene(scene);
    const bb = scene.bounds, c = [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, (bb.min[2] + bb.max[2]) / 2];
    st.R.setGround(App.gl3d.MAT.concrete, App.gl3d.hex('#e6e8eb'), [c[0], c[2]], Math.max(4, Math.hypot(bb.max[0] - bb.min[0], bb.max[2] - bb.min[2]) * 3));
    if (!same) { st.elId = el.id; const cam = typeof B.cam === 'number' ? B.cam : null; if (cam != null) st.cam.yaw = cam; fit(); return; }
    if (grew && !st.drag && !inView(bb)) { fit(); return; } // 새로 넣은 부재가 화면 밖이면 다시 맞춤 (보는 방향은 그대로)
    draw();
  }
  /** 장면 범위가 화면 안에 다 보이는지 */
  function inView(b) {
    const Bs = basis(), V = visRect();
    for (let i = 0; i < 8; i++) {
      const s = project([i & 1 ? b.max[0] : b.min[0], i & 2 ? b.max[1] : b.min[1], i & 4 ? b.max[2] : b.min[2]], Bs);
      if (!s || s.x < V.x0 || s.y < V.y0 || s.x > V.x1 || s.y > V.y1) return false;
    }
    return true;
  }
  async function rebuildModel(el) {
    const m = el.objId ? App.library.byId(el.objId) : null;
    if (!m) return;
    if (st.el === el && st.scene) return;
    st.el = el; st.B = null; st.map = null; st.empty = false;
    await App.library.ready(m.id);
    const e = App.library.data(m.id), model = e ? e.view || e.mesh : null;
    if (!model || !st.R || st.el !== el) return;
    st.scene = App.library.sceneOf(model);
    st.R.setScene(st.scene);
    st.elId = el.id;
    fit();
  }
  function draw() {
    if (!active() || st.raf) return;
    st.raf = requestAnimationFrame(frame);
  }
  function frame(now) {
    st.raf = 0;
    if (!active()) return;
    if (st.anim) {
      const a = st.anim, t = Math.min(1, (now - a.t0) / a.dur), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      st.cam.yaw = a.y0 + a.dy * e; st.cam.pitch = a.p0 + (a.p1 - a.p0) * e;
      if (t >= 1) st.anim = null; else busy();
    }
    // 부재가 바뀌었으면 (끄는 동안은 1초에 20번쯤) 장면을 새로
    if (now - st.lastBuild > (st.drag ? 50 : 0)) { st.lastBuild = now; rebuild(); }
    render();
    const top = st.cam.pitch > TOP_PITCH;
    if (top !== st.wasTop) { st.wasTop = top; UI().renderQuick(); } // 위에서 보면 화살표·앞뒤 단추의 뜻이 바뀜
    if (st.anim) draw();
  }
  function render() {
    resize();
    if (st.R && st.scene) {
      const { dist, target, r } = st.cam, eye = eyeOf();
      st.R.render({ eye, target, fov: FOV, near: Math.max(0.01, dist - r * 3), far: dist + r * 40 + 50 }, { sun: 0, clouds: false, shadows: true, shadowSize: st.lod ? 512 : 1024, focus: { center: target, radius: r * 1.6 + 0.2 }, fog: 1 / 4000 });
    }
    hud();
  }
  /** 손으로 다루는 동안: 낮은 해상도로 빨리 그리고, 0.2초 멈추면 선명하게 다시 */
  function busy() {
    st.lod = true;
    clearTimeout(st.lodTimer);
    st.lodTimer = setTimeout(() => { st.lod = false; draw(); }, 200);
  }
  function resize() {
    // 화면 픽셀 비율 (2까지), 그림 칸이 너무 크면 160만 픽셀 안으로, 다루는 동안은 그 절반 남짓
    const c0 = st.cv, css = c0 ? Math.max(1, c0.clientWidth * c0.clientHeight) : 1;
    let dpr = Math.min(2, window.devicePixelRatio || 1, Math.sqrt(1.6e6 / css));
    if (st.lod) dpr *= 0.55;
    const hdpr = Math.min(2, window.devicePixelRatio || 1);
    [[st.cv, dpr], [st.hud, hdpr]].forEach(([c, k]) => { if (!c) return; const w = Math.max(2, Math.round(c.clientWidth * k)), h = Math.max(2, Math.round(c.clientHeight * k)); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } });
  }

  /* ── 손잡이 ──
     고른 직접 넣은 부재: 보이는 면 가운데(주황 — 그 면을 늘이고 줄임), 막대·LED는 양 끝, 위쪽 ↕(위아래로 옮김)
     아무것도 안 골랐고 값으로 만든 설계: 전체 폭·깊이·높이 (청록) */
  const touch = () => !!App.pointerTouch;
  const POS = ['x', 'y', 'z'], SIZE = ['w', 'd', 'h'], AXN = ['폭', '깊이', '높이'];
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const extent = (q) => { const c = D().corners(q); return { lo: [0, 1, 2].map((k) => Math.min(...c.map((p) => p[k]))), hi: [0, 1, 2].map((k) => Math.max(...c.map((p) => p[k]))) }; };
  /** 설계 좌표의 점 p에서 방향 n으로 1mm 갈 때 화면에서 움직이는 픽셀 벡터.
      안 보이거나, 그 방향이 보는 쪽과 거의 나란해 화면에서 아주 짧으면(조금만 끌어도 크게 움직임) null */
  function screenDir(p, n) {
    const a = project(st.map(p)), b = project(st.map(p.map((v, i) => v + n[i] * 100)));
    if (!a || !b) return null;
    const v = { x: (b.x - a.x) / 100, y: (b.y - a.y) / 100 };
    const nominal = size().h / (2 * a.z * TH) / 1000; // 그 거리에서 화면과 나란한 1mm의 픽셀 수
    return Math.hypot(v.x, v.y) > Math.max(0.002, nominal * 0.3) ? v : null;
  }
  /** 면(가운데 c, 바깥 방향 n)이 보는 사람 쪽을 향하는지 — 옆에서 본 모서리 같은 면(8°쯤 넘어간 것)까지는 잡을 수 있게 */
  const facing = (c, n, Bs) => { const S = st.map(c), N = nrm(sub(st.map(c.map((v, i) => v + n[i] * 100)), S)), V = nrm(sub(Bs.eye, S)); return dot(N, V) > -0.15; };
  /** 손잡이는 면(막대는 끝) 가운데에서 그 면이 움직이는 쪽으로 화면에서 조금 띄워 둠 — 부재 몸통은 ‘끌어 옮기는 자리’로 남고,
      작은 부재도 손가락으로 점과 몸통을 가려 잡을 수 있게. (ax, ay)는 면 가운데, (ux, uy)는 띄운 방향 */
  const offPx = () => (touch() ? 18 : 13);
  function standOff(h, c, n, Bs) {
    const s = project(st.map(c), Bs), v = screenDir(c, n);
    if (!s || !v) return null;
    const l = Math.hypot(v.x, v.y), ux = v.x / l, uy = v.y / l, o = offPx();
    return { ...h, p: c, n, ax: s.x, ay: s.y, ux, uy, x: s.x + ux * o, y: s.y + uy * o };
  }
  function handles() {
    const el = D().current(), id = UI().selected();
    if (!el || !st.map || el.kind === 'model' || App.ui.tool !== 'dselect') return [];
    const Bs = basis(), out = [];
    if (!id) return sizeHandles(el, Bs);
    const q = (el.parts || []).find((x) => x.id === id);
    if (!q) return [];
    const { lo, hi } = extent(q);
    if (q.s === 'bar') {
      const len = D().lenOf(q) || 1, u = q.b.map((v, i) => (v - q.a[i]) / len);
      [['a', q.a, u.map((v) => -v)], ['b', q.b, u]].forEach(([end, p, n]) => { const h = standOff({ kind: 'end', end }, p, n, Bs); if (h) out.push(h); });
    } else if (q.s !== 'poly' && q.s !== 'arc') {
      const sz = [q.w, q.d, q.h], cen = lo.map((v, k) => (v + hi[k]) / 2);
      const M = D().SHEETS.find((x) => x.id === q.m), minK = sz.indexOf(Math.min(...sz));
      for (let k = 0; k < 3; k++) {
        if (M && k === minK && Math.abs(sz[k] - M.t) < 0.6) continue; // 판의 두께는 손잡이 없이
        for (const sg of [1, -1]) {
          const c = cen.slice(); c[k] = sg > 0 ? hi[k] : lo[k];
          const n = [0, 0, 0]; n[k] = sg;
          if (!facing(c, n, Bs)) continue; // 뒤쪽 면은 뺌 (보는 쪽과 나란한 축은 standOff가 뺌)
          const h = standOff({ kind: 'face', k, sg }, c, n, Bs);
          if (h) out.push(h);
        }
      }
    }
    // 위아래로 옮기기(↕): 부재 위쪽 가운데에서 화면으로 36px 위 — 윗면 손잡이가 있으면 그 위로 (위에서 내려다보면 뺌)
    const topC = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, hi[2]], s = project(st.map(topC), Bs);
    const up = out.some((h) => h.kind === 'face' && h.k === 2 && h.sg > 0) ? offPx() + 32 : 36;
    if (s && screenDir(topC, [0, 0, 1])) out.push({ kind: 'lift', p: topC, n: [0, 0, 1], x: s.x, y: s.y - up, ax: s.x, ay: s.y });
    return out;
  }
  /** 값으로 만든 설계의 전체 크기: 축마다 보이는 쪽 면 가운데 (그 값이 실제 전체 크기와 같은 것만) */
  function sizeHandles(el, Bs) {
    if (el.kind === 'free') return [];
    const B = D().build(el), out = [], mid = [0, 1, 2].map((k) => (B.min[k] + B.max[k]) / 2);
    for (let k = 0; k < 3; k++) {
      const key = App.designDraw.sizeParam(el, k, B);
      if (!key) continue;
      for (const sg of k === 2 ? [1] : [1, -1]) {
        const c = mid.slice(); c[k] = sg > 0 ? B.max[k] : B.min[k];
        const n = [0, 0, 0]; n[k] = sg;
        if (!facing(c, n, Bs)) continue;
        const h = standOff({ kind: 'size', k, sg, key }, c, n, Bs);
        if (h) { out.push(h); break; }
      }
    }
    return out;
  }
  function hud() {
    const c = st.hud;
    if (!c) return;
    const ctx = c.getContext('2d'), dpr = c.width / (c.clientWidth || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, c.clientWidth, c.clientHeight);
    const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif';
    if (st.empty || st.failed) {
      ctx.fillStyle = (App.plan && App.plan.colors && App.plan.colors.fgMuted) || '#495057'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `600 14px ${FONT}`;
      const lines = st.failed ? ['이 기기에서는 3D 작업 화면을 쓸 수 없습니다', '정면·평면·측면에서 고치세요'] : ['부재가 없습니다', '아래 +가로판 · +세로판 · +막대를 눌러 넣으세요'];
      lines.forEach((t, k) => ctx.fillText(t, c.clientWidth / 2, c.clientHeight / 2 - 12 + k * 24));
      return;
    }
    const TEAL = (App.plan && App.plan.colors && App.plan.colors.accent) || '#0b7285';
    const hs = handles(), R = touch() ? 11 : 8;
    const arrow = (h, color) => { // 면 가운데에서 점까지 가는 이음선, 점 바깥으로 면이 움직이는 쪽을 가리키는 짧은 화살
      const ux = h.ux, uy = h.uy, L = R + 12;
      ctx.strokeStyle = color; ctx.lineCap = 'round';
      ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(h.ax, h.ay); ctx.lineTo(h.x - ux * R, h.y - uy * R); ctx.stroke();
      ctx.beginPath(); ctx.arc(h.ax, h.ay, 2.2, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(h.x + ux * R, h.y + uy * R); ctx.lineTo(h.x + ux * L, h.y + uy * L);
      ctx.moveTo(h.x + ux * L - (ux * 6 - uy * 4), h.y + uy * L - (uy * 6 + ux * 4)); ctx.lineTo(h.x + ux * L, h.y + uy * L); ctx.lineTo(h.x + ux * L - (ux * 6 + uy * 4), h.y + uy * L - (uy * 6 - ux * 4));
      ctx.stroke();
    };
    hs.forEach((h) => {
      if (h.kind === 'lift') { // ↕: 가는 이음선 끝에 청록 점
        ctx.strokeStyle = TEAL; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(h.ax, h.ay); ctx.lineTo(h.x, h.y + R); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(h.x, h.y, R + 1, 0, Math.PI * 2); ctx.fillStyle = TEAL; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff'; ctx.stroke();
        const a = R * 0.55;
        ctx.lineWidth = 1.8; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(h.x, h.y - a); ctx.lineTo(h.x, h.y + a);
        ctx.moveTo(h.x - a * 0.6, h.y - a + a * 0.6); ctx.lineTo(h.x, h.y - a); ctx.lineTo(h.x + a * 0.6, h.y - a + a * 0.6);
        ctx.moveTo(h.x - a * 0.6, h.y + a - a * 0.6); ctx.lineTo(h.x, h.y + a); ctx.lineTo(h.x + a * 0.6, h.y + a - a * 0.6);
        ctx.stroke();
        return;
      }
      if (h.kind === 'size') { // 전체 크기: 청록 점
        arrow(h, TEAL);
        ctx.beginPath(); ctx.arc(h.x, h.y, R + 1, 0, Math.PI * 2); ctx.fillStyle = TEAL; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff'; ctx.stroke();
        return;
      }
      arrow(h, '#e8590c');
      ctx.beginPath(); ctx.arc(h.x, h.y, R, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#e8590c'; ctx.stroke();
    });
    if (st.label) { // 끄는 동안 크기·옮긴 거리
      const t = st.label.text, w0 = c.clientWidth;
      ctx.font = `700 13px ${FONT}`;
      const w = ctx.measureText(t).width + 14, x = Math.max(w / 2 + 6, Math.min(w0 - w / 2 - 6, st.label.x)), y = Math.max(24, st.label.y - (touch() ? 64 : 32));
      ctx.fillStyle = 'rgba(33,37,41,0.88)';
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x - w / 2, y - 11, w, 22, 6); else ctx.rect(x - w / 2, y - 11, w, 22); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, x, y);
    }
  }

  /* ── 고르기: 광선과 부재 상자(막대는 선분 둘레). 가까운 것부터 [{ q, t }] ── */
  function pickAll(x, y) {
    const el = D().current();
    if (!el || !st.map || el.kind === 'model') return [];
    const Bs = basis(), R0 = ray(x, y, Bs), doors = App.current.designDoors !== false, out = [];
    D().build(el).parts.forEach((q) => {
      if (q.halo || (!doors && q.door)) return;
      let t = null;
      if (q.s === 'bar') {
        const A = st.map(q.a), Bq = st.map(q.b), u = sub(Bq, A), w0 = sub(R0.o, A), a = dot(R0.d, R0.d), b = dot(R0.d, u), c = dot(u, u), d = dot(R0.d, w0), e = dot(u, w0);
        const den = a * c - b * b;
        let tc = den > 1e-12 ? (a * e - b * d) / den : 0;
        tc = Math.max(0, Math.min(1, tc));
        const sc = Math.max(0, (b * tc - d) / a);
        const P = R0.o.map((v, i) => v + R0.d[i] * sc), Q = A.map((v, i) => v + u[i] * tc), dist = Math.hypot(...sub(P, Q));
        const tol = Math.max(0.025, (sc * TH * 2 * (touch() ? 14 : 7)) / size().h); // 단면 반쯤, 아니면 화면 몇 픽셀
        if (dist <= tol) t = sc;
      } else {
        const S = D().hexes(q).flat().map(st.map), mn = [0, 1, 2].map((k) => Math.min(...S.map((p) => p[k]))), mx = [0, 1, 2].map((k) => Math.max(...S.map((p) => p[k])));
        let t0 = -Infinity, t1 = Infinity;
        for (let k = 0; k < 3; k++) {
          if (Math.abs(R0.d[k]) < 1e-12) { if (R0.o[k] < mn[k] || R0.o[k] > mx[k]) { t0 = Infinity; break; } continue; }
          let ta = (mn[k] - R0.o[k]) / R0.d[k], tb = (mx[k] - R0.o[k]) / R0.d[k];
          if (ta > tb) [ta, tb] = [tb, ta];
          t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        }
        if (t0 <= t1 && t1 > 0) t = Math.max(0, t0);
      }
      if (t != null) out.push({ q, t });
    });
    return out.sort((a, b) => a.t - b.t);
  }
  const pickAt = (x, y) => { const l = pickAll(x, y); return l.length ? l[0].q : null; };
  const RING = [[1, 0], [0.7, 0.7], [0, 1], [-0.7, 0.7], [-1, 0], [-0.7, -0.7], [0, -1], [0.7, -0.7]];
  /** 손가락: 정확히 닿은 것이 없으면 둘레(9·17px)에서 가장 먼저 닿는 것 — 옆에서 본 얇은 판도 눌러 고를 수 있게 */
  function pickNear(x, y) {
    const l = pickAll(x, y);
    if (l.length || !touch()) return l;
    for (const r of [9, 17]) for (const [cx, cy] of RING) { const m = pickAll(x + cx * r, y + cy * r); if (m.length) return m; }
    return [];
  }
  /** 손가락: 고른 부재 바로 곁(12px)을 눌러도 그 부재를 잡은 것으로 (얇은 판을 끌어 옮길 때) */
  function nearSel(x, y, id) {
    for (const [cx, cy] of RING) { const m = pickAll(x + cx * 12, y + cy * 12).find((o) => o.q.id === id); if (m) return m; }
    return null;
  }
  /** 화면 점의 광선을 설계 좌표로: { o, d } (d는 장면 1m에 해당하는 설계 mm 벡터) */
  function rayD(x, y) {
    const R0 = ray(x, y), o = st.map.back(R0.o), p = st.map.back(R0.o.map((v, i) => v + R0.d[i]));
    return { o, d: p.map((v, i) => v - o[i]) };
  }

  /* ── 손으로 다루기 ── */
  function onDown(e) {
    if (!active()) return;
    const r = st.box.getBoundingClientRect(), p = { x: e.clientX - r.left, y: e.clientY - r.top };
    st.ptrs.set(e.pointerId, p);
    try { st.box.setPointerCapture(e.pointerId); } catch (_) { /* 무시 */ }
    App.pointerTouch = e.pointerType === 'touch';
    if (st.ptrs.size === 2) { // 두 손가락: 확대·이동
      const [a, b] = [...st.ptrs.values()];
      st.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      endDrag(true);
      st.press = null;
      return;
    }
    if (st.ptrs.size > 2) return;
    st.press = { ...p, pan: e.button === 2 || e.shiftKey, moved: false, list: null };
    st.drag = null;
    if (e.button === 2 || !st.map) return;
    const el = D().current(), id = UI().selected();
    if (!el) return;
    const list = (st.press.list = pickAll(p.x, p.y));
    const onSel = id ? list.find((x) => x.q.id === id) : null;
    // 1) 손잡이 — 고른 부재의 몸통 위에서는 점에 바로 닿았을 때만 (몸통은 끌어 옮기는 자리)
    const hs = handles(), R = onSel ? (touch() ? 15 : 10) : touch() ? 26 : 13;
    let best = null, bd = R;
    hs.forEach((h) => { const d = Math.hypot(h.x - p.x, h.y - p.y); if (d < bd) { bd = d; best = h; } });
    if (best) {
      const v = screenDir(best.p, best.n);
      if (!v) return;
      if (best.kind === 'size') { const B = D().build(el); st.drag = { kind: 'size', h: best, el, p0: { ...el.p }, v, started: false, v0: Number(el.p[best.key]) || [B.size.w, B.size.d, B.size.h][best.k] }; }
      else { const q = (el.parts || []).find((x) => x.id === id); if (q) st.drag = { kind: best.kind, h: best, el, q: clone(q), v, started: false }; }
      return;
    }
    // 2) 고른 (직접 넣은) 부재 위를 누름: 끌면 옮기기, 그냥 떼면 그 뒤 부재 고르기 (손가락은 바로 곁을 눌러도 잡힘)
    const hit = onSel || (id && touch() ? nearSel(p.x, p.y, id) : null);
    if (hit) {
      st.press.onSel = !!onSel;
      const q = hit.q.user ? (el.parts || []).find((x) => x.id === id) : null;
      if (q) st.drag = { kind: 'move', el, q: clone(q), t: hit.t, started: false };
    }
  }
  function onMove(e) {
    if (!active() || !st.ptrs.has(e.pointerId)) return;
    const r = st.box.getBoundingClientRect(), p = { x: e.clientX - r.left, y: e.clientY - r.top }, prev = st.ptrs.get(e.pointerId);
    st.ptrs.set(e.pointerId, p);
    if (st.pinch && st.ptrs.size === 2) {
      const [a, b] = [...st.ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y) || 1, m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      zoom(st.pinch.d / d); pan(m.x - st.pinch.m.x, m.y - st.pinch.m.y);
      st.pinch = { d, m };
      busy();
      draw();
      return;
    }
    if (!st.press) return;
    if (!st.press.moved && Math.hypot(p.x - st.press.x, p.y - st.press.y) > (touch() ? 8 : 4)) st.press.moved = true;
    if (!st.press.moved) return;
    const g = st.drag;
    if (g) { if (g.kind === 'move') dragMove(g, p, e.altKey); else dragHandle(g, p, e.altKey); return; }
    st.anim = null; st.dirNow = null; syncDirButtons();
    busy();
    if (st.press.pan) pan(p.x - prev.x, p.y - prev.y);
    else { st.cam.yaw -= (p.x - prev.x) * 0.01; st.cam.pitch = Math.max(-0.15, Math.min(1.55, st.cam.pitch + (p.y - prev.y) * 0.008)); }
    draw();
  }
  function endDrag(commit) {
    const g = st.drag;
    st.drag = null; st.label = null; st.anchor = null;
    if (g && g.started) { if (commit) App.doc.commit(); else App.doc.rollback(); UI().renderQuick(); }
  }
  function onUp(e) {
    if (!st.ptrs.has(e.pointerId)) return;
    st.ptrs.delete(e.pointerId);
    if (st.ptrs.size < 2) st.pinch = null;
    const press = st.press, g = st.drag;
    if (st.ptrs.size) return;
    st.press = null;
    if (g && g.started) { endDrag(true); draw(); return; }
    st.drag = null; st.label = null; st.anchor = null;
    if (!press || press.moved) { draw(); return; }
    // 끌지 않고 뗌
    if (g && g.kind !== 'move') { tapHandle(g); return; } // 손잡이를 그냥 누름: 숫자로
    let list = press.list || pickAll(press.x, press.y);
    if (!list.length) list = pickNear(press.x, press.y);
    const id = UI().selected();
    if (press.onSel) { // 고른 부재를 다시 누름: 그 뒤에 있는 부재로 (하나뿐이면 그대로)
      if (list.length > 1) { const i = list.findIndex((x) => x.q.id === id); UI().select(list[(i + 1) % list.length].q.id); }
    } else UI().select(list.length ? list[0].q.id : null);
    draw();
  }
  function onCancel(e) {
    st.ptrs.delete(e.pointerId);
    endDrag(false);
    st.press = null; st.pinch = null;
    draw();
  }
  function zoom(k) { st.cam.dist = Math.max(st.cam.r * 0.15, Math.min(st.cam.r * 20, st.cam.dist * k)); st.userView = true; }
  function pan(dx, dy) {
    st.userView = true;
    const Bs = basis(), { h } = size(), per = (2 * st.cam.dist * TH) / h; // 보는 곳 거리에서 1픽셀의 길이
    st.cam.target = st.cam.target.map((v, k) => v - Bs.r[k] * dx * per + Bs.u[k] * dy * per);
  }
  /** 다른 부재의 면들 (축 k) */
  function facesOf(el, skipId, k) {
    const out = [];
    D().build(el).parts.forEach((o) => { if (o.id === skipId || o.halo) return; const c = D().corners(o); out.push(Math.min(...c.map((x) => x[k])), Math.max(...c.map((x) => x[k]))); });
    return out;
  }
  /** 값들(움직이는 것의 면) 가운데 하나가 다른 부재 면과 tol 안이면 그만큼, 아니면 null */
  function faceSnap(vals, faces, tol) {
    let best = null;
    vals.forEach((v) => faces.forEach((f) => { const d = f - v; if (Math.abs(d) <= tol && (best == null || Math.abs(d) < Math.abs(best))) best = d; }));
    return best;
  }
  const moved = (q, sh) => (q.s === 'bar' ? { a: q.a.map((v, i) => r1(v + sh[i])), b: q.b.map((v, i) => r1(v + sh[i])) } : { x: r1(q.x + sh[0]), y: r1(q.y + sh[1]), z: r1(q.z + sh[2]) });
  const setPart = (el, id, next) => App.doc.update(el.id, { parts: (el.parts || []).map((x) => (x.id === id ? { ...x, ...next } : x)) });
  /** 손잡이 끌기: 면(막대는 끝)을 축을 따라 · ↕ 위아래로 · 전체 크기 */
  function dragHandle(g, p, free) {
    const press = st.press, dx = p.x - press.x, dy = p.y - press.y, v = g.v, vv = v.x * v.x + v.y * v.y;
    const amt = (dx * v.x + dy * v.y) / vv; // 손잡이 방향으로 움직인 mm
    const el = D().current();
    if (!el) return;
    const step = free ? 1 : 10, tol = 9 / Math.sqrt(vv);
    if (!g.started) { g.started = true; App.doc.begin(g.kind === 'size' ? '크기 바꾸기' : g.kind === 'lift' ? '부재 옮기기' : g.kind === 'end' ? '막대 늘이기' : '부재 크기 바꾸기'); }
    let text;
    if (g.kind === 'size') { // 값으로 만든 설계의 전체 폭·깊이·높이 (어느 쪽 면이든 바깥으로 끌면 커짐)
      const key = g.h.key, val = Math.max(key === 'T' ? 30 : 100, Math.min(30000, Math.round((g.v0 + amt) / 10) * 10));
      st.anchor = g.h.sg < 0 ? { k: g.h.k } : null; // − 쪽 면을 끌면 + 쪽 끝을 붙박음
      if (Number(el.p[key]) !== val) App.doc.update(el.id, { p: { ...g.p0, [key]: val } });
      text = `전체 ${{ W: '폭', D: '깊이', T: '두께', H: '높이' }[key]} ${fmt(val)}`;
    } else if (g.kind === 'lift') {
      const q0 = g.q, { lo, hi } = extent(q0);
      let d = amt;
      const f = free ? null : faceSnap([lo[2] + d, hi[2] + d], facesOf(el, q0.id, 2), tol);
      d = f != null ? d + f : Math.round((lo[2] + d) / step) * step - lo[2];
      setPart(el, q0.id, moved(q0, [0, 0, d]));
      text = `바닥에서 ${fmt(lo[2] + d)}`;
    } else if (g.kind === 'end') {
      const q0 = g.q, len0 = D().lenOf(q0), len = Math.max(10, Math.round((len0 + amt) / step) * step), u = q0.b.map((x, i) => (x - q0.a[i]) / len0);
      setPart(el, q0.id, g.h.end === 'b' ? { b: q0.a.map((x, i) => r1(x + u[i] * len)) } : { a: q0.b.map((x, i) => r1(x - u[i] * len)) });
      text = `길이 ${fmt(len)}`;
    } else {
      const q0 = g.q, k = g.h.k, lo = q0[POS[k]], hi = lo + q0[SIZE[k]];
      let face = (g.h.sg > 0 ? hi : lo) + amt * g.h.sg;
      const f = free ? null : faceSnap([face], facesOf(el, q0.id, k), tol);
      face = f != null ? face + f : Math.round(face / step) * step;
      let next;
      if (g.h.sg > 0) { face = Math.max(lo + 5, face); next = { [SIZE[k]]: r1(face - lo) }; } else { face = Math.min(hi - 5, face); next = { [POS[k]]: r1(face), [SIZE[k]]: r1(hi - face) }; }
      setPart(el, q0.id, next);
      text = `${AXN[k]} ${fmt(next[SIZE[k]])}`;
    }
    st.label = { text, x: p.x, y: p.y };
    busy();
    draw();
  }
  /** 고른 부재를 끌어 옮김: 비스듬히·위에서 보면 바닥과 나란한 면을 따라(X·Y), 옆에서 보면 마주 보는 세로 면을 따라(좌우·위아래) */
  function dragMove(g, p, free) {
    const el = D().current(), press = st.press;
    if (!el || !st.map) return;
    if (!g.started) {
      g.started = true;
      App.doc.begin('부재 옮기기');
      const A = axes(), R0 = ray(press.x, press.y);
      g.k = st.cam.pitch < SIDE_PITCH ? A.ta : 2;                                   // 이 축은 그대로 (평면의 법선)
      g.g0 = st.map.back(R0.o.map((v, i) => v + R0.d[i] * g.t));                    // 잡은 점 (설계 좌표)
      g.ext = extent(g.q);
    }
    const R1 = rayD(p.x, p.y), k = g.k;
    if (Math.abs(R1.d[k]) < 1e-9) return;
    const t = (g.g0[k] - R1.o[k]) / R1.d[k];
    if (!(t > 0)) return; // 평면이 사진기 뒤
    const sh = [0, 0, 0], step = free ? 1 : 10;
    for (let a = 0; a < 3; a++) {
      if (a === k) continue;
      let d = R1.o[a] + R1.d[a] * t - g.g0[a];
      const n = [0, 0, 0]; n[a] = 1;
      const sv = screenDir(g.g0, n), pxmm = sv ? Math.hypot(sv.x, sv.y) : 0, tol = pxmm ? 9 / pxmm : 20;
      if (pxmm && Math.abs(d) * pxmm < (touch() ? 8 : 3)) continue; // 거의 안 움직인 축은 그대로 (한쪽으로만 끌 때 다른 쪽이 간격에 맞춰 튀지 않게)
      const f = free ? null : faceSnap([g.ext.lo[a] + d, g.ext.hi[a] + d], facesOf(el, g.q.id, a), Math.min(tol, 60));
      d = f != null ? d + f : Math.round((g.ext.lo[a] + d) / step) * step - g.ext.lo[a];
      sh[a] = d;
    }
    setPart(el, g.q.id, moved(g.q, sh));
    const names = ['X', 'Y', 'Z'];
    st.label = { text: [0, 1, 2].filter((a) => a !== k).map((a) => `${names[a]} ${sh[a] >= 0 ? '+' : ''}${fmt(sh[a])}`).join(' · '), x: p.x, y: p.y };
    busy();
    draw();
  }
  /** 손잡이를 끌지 않고 누름: 그 치수를 숫자로 */
  async function tapHandle(g) {
    const el = D().current(), h = g.h;
    if (!el) return;
    if (h.kind === 'size') { const B = D().build(el); UI().editDim({ key: 'param', k: h.key, v: [B.size.w, B.size.d, B.size.h][h.k] }); return; }
    const q = g.q, id = q.id;
    if (h.kind === 'lift') {
      const { lo } = extent(q), v = await UI().askNumber('바닥에서 높이', lo[2], '부재의 아래쪽이 바닥에서 떨어진 높이입니다. 1200-36 처럼 셈도 됩니다.');
      if (v != null) UI().setPart(id, moved(q, [0, 0, v - lo[2]]), '부재 옮기기');
    } else if (h.kind === 'end') {
      const len0 = D().lenOf(q), v = await UI().askNumber('막대 길이', len0, '반대쪽 끝은 그대로 두고 늘이거나 줄입니다.');
      if (v != null && v >= 10) { const u = q.b.map((x, i) => (x - q.a[i]) / len0); UI().setPart(id, h.end === 'b' ? { b: q.a.map((x, i) => r1(x + u[i] * v)) } : { a: q.b.map((x, i) => r1(x - u[i] * v)) }, '막대 길이 바꾸기'); }
    } else {
      const k = h.k, v = await UI().askNumber(`부재 ${AXN[k]}`, q[SIZE[k]], '반대쪽 면은 그대로 두고 늘이거나 줄입니다. 1200-36 처럼 셈도 됩니다.');
      if (v != null && v >= 1) UI().setPart(id, h.sg > 0 ? { [SIZE[k]]: r1(v) } : { [POS[k]]: r1(q[POS[k]] + q[SIZE[k]] - v), [SIZE[k]]: r1(v) }, '부재 크기 바꾸기');
    }
    draw();
  }

  /* ── 보이기·숨기기 ── */
  function placeDirs() {
    const pad = st.box && st.box.querySelector('.ds-dir'), top = document.getElementById('stageTop'), stage = document.getElementById('stage');
    if (!pad || !top || !stage) return;
    const sr = stage.getBoundingClientRect(), tr = top.getBoundingClientRect(), clear = tr.right < sr.right - pad.offsetWidth - 24;
    pad.style.top = `${Math.round(clear ? 12 : tr.bottom - sr.top + 8)}px`;
  }
  /** 설계 모드·입체 그림일 때만 보이게 (나가면 3D 자원을 놓음) */
  function sync() {
    const box = st.box || (st.box = document.getElementById('ds3dView'));
    if (!box) return;
    const el = isMode() ? D().current() : null, on = !!el && viewIs3d();
    if (!on) {
      if (!box.hidden) { box.hidden = true; release(); }
      return;
    }
    const was = !box.hidden;
    box.hidden = false;
    st.hud = box.querySelector('.ds-3dv-hud');
    placeDirs();
    if (!was) { st.el = null; st.elId = null; st.cam.yaw = DIRS.iso[0]; st.cam.pitch = DIRS.iso[1]; st.dirNow = 'iso'; st.wasTop = false; syncDirButtons(); }
    rebuild(!was);
    draw();
  }
  function release() {
    cancelAnimationFrame(st.raf); st.raf = 0;
    if (st.R) {
      try { st.R.dispose(); const lose = st.R.gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); } catch (_) { /* 무시 */ }
      st.R = null;
      const old = st.box.querySelector('.ds-3dv-gl'), fresh = old.cloneNode(false); // 놓은 캔버스는 3D를 다시 못 씀
      old.replaceWith(fresh);
    }
    st.cv = null; st.scene = null; st.map = null; st.el = null; st.B = null; st.elId = null; st.failed = false; st.drag = null; st.press = null; st.ptrs.clear();
  }
  /** 화면 기준 축 — 빠른 막대의 화살표·앞뒤·90°가 보는 대로 움직이게.
      ha·hs: 화면 오른쪽(→)에 가장 가까운 수평 축과 부호, va·vs: 화면 위쪽(↑) 축과 부호, ta·toward: 보는 사람 쪽 축과 부호.
      옆·비스듬히 볼 때는 ↑가 높이(Z), 위에서 내려다볼 때(top)는 ↑가 멀어지는 쪽이고 앞·뒤가 위·아래(Z) */
  function axes() {
    const y = st.cam.yaw, cx = Math.cos(y), sy = Math.sin(y);
    const A = Math.abs(cx) >= Math.abs(sy) ? { ha: 0, hs: Math.sign(cx) || 1, ta: 1, toward: -Math.sign(cx) || -1 } : { ha: 1, hs: Math.sign(sy) || 1, ta: 0, toward: Math.sign(sy) || 1 };
    if (st.cam.pitch > TOP_PITCH) return { ha: A.ha, hs: A.hs, va: A.ta, vs: -A.toward, ta: 2, toward: 1, top: true };
    return { ...A, va: 2, vs: 1, top: false };
  }
  function init() {
    st.box = document.getElementById('ds3dView');
    if (!st.box) return;
    st.box.addEventListener('pointerdown', (e) => { if (e.target.closest('.ds-dir')) return; openDirs(false); onDown(e); });
    st.box.addEventListener('pointermove', onMove);
    st.box.addEventListener('pointerup', onUp);
    st.box.addEventListener('pointercancel', onCancel);
    st.box.addEventListener('contextmenu', (e) => e.preventDefault());
    st.box.addEventListener('wheel', (e) => { if (!active()) return; e.preventDefault(); zoom(Math.exp(Math.max(-300, Math.min(300, e.deltaY)) * 0.0015)); busy(); draw(); }, { passive: false });
    st.box.querySelector('.ds-dir').addEventListener('click', (e) => {
      const b = e.target.closest('[data-dir]');
      if (!b) return;
      if (b.dataset.dir === 'toggle') { openDirs(!b.parentNode.classList.contains('is-open')); return; }
      setDir(b.dataset.dir);
      openDirs(false); // 골랐으면 다시 접음
    });
    window.addEventListener('resize', () => { if (active()) { placeDirs(); draw(); } });
  }

  App.design3d = {
    init, sync, active, setDir, fit, axes, pickAt, pickAll, handles,
    /** 부재가 바뀌었을 수 있음: 다음 그림 때 장면을 새로 */
    kick() { if (active()) draw(); },
    /** 보이는 칸이 바뀜(서랍·창 크기): 손으로 확대·이동하지 않았으면 다시 맞춤 */
    refit() { if (!active()) return; placeDirs(); if (!st.userView) fit(); else draw(); },
    /** 시험용: 사진기와 장면 상태 */
    state: () => ({ on: active(), gl: !!st.R, yaw: st.cam.yaw, pitch: st.cam.pitch, dist: st.cam.dist, target: st.cam.target.slice(), dir: st.dirNow || null, empty: st.empty, scene: !!st.scene }),
    /** 시험용: 부재(설계 좌표 점)가 화면 어디에 보이는지 (화면 픽셀) */
    screenOf(p) { if (!st.map) return null; const s = project(st.map(p)); if (!s) return null; const r = st.box.getBoundingClientRect(); return { x: r.left + s.x, y: r.top + s.y }; },
    /** 시험용: 지금 그려 그림 주소로 */
    shot() { if (!st.R) return null; render(); return st.cv.toDataURL('image/png'); },
  };
})();
