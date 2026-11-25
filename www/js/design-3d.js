/* 설계 모드 3D 작업 화면 (‘입체’ 그림): 돌려 보며 부재를 눌러 고르고, 면 손잡이를 끌어 늘이고 줄인다.
   방향 단추(앞·뒤·왼쪽·오른쪽·위·비스듬히·45° 돌리기·맞춤)로 보는 쪽을 정한다. 자르기·꺾기·둥글게·복제·지우기는 아래 빠른 막대에서.
   - 끌기: 빈 곳·부재를 끌면 돌려 봄(마우스 오른쪽·Shift 또는 두 손가락은 화면 이동), 휠·두 손가락 벌리기로 확대
   - 누르기: 부재 고르기 (빈 곳을 누르면 고르기 풀기)
   - 주황 점(보이는 면의 가운데): 그 면을 끌어 크기를 바꿈 (10mm·다른 부재 면에 붙음, Alt를 누르면 1mm)
   장면 좌표는 toModel과 같은 자리 맞춤(design.sceneMap)이고, 부재가 바뀌어 장면 가운데가 움직이면 보는 곳도 같이 옮겨 화면이 흔들리지 않게 한다 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const D = () => App.design, UI = () => App.designUI;
  const FOV = 0.5, TH = Math.tan(FOV / 2);
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
    if (qb && !qb.hidden) y1 = Math.min(y1, qb.getBoundingClientRect().top - br.top - 8);
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
  function syncDirButtons() {
    if (!st.box) return;
    st.box.querySelectorAll('[data-dir]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.dir === st.dirNow)));
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
    st.el = el; st.B = B; st.sel = sel; st.doors = doors;
    const m = D().toModel(el, { pick: sel, hideDoors: !doors });
    st.empty = !m;
    if (!m) { st.scene = null; st.map = null; draw(); return; }
    const scene = App.library.sceneOf(m), map = D().sceneMap(el);
    if (same && st.map && map) { // 장면 가운데가 옮겨진 만큼 보는 곳도 옮겨 화면이 그대로 있게
      const a = st.map([0, 0, 0]), b = map([0, 0, 0]);
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

  /* ── 손잡이 (고른 직접 넣은 부재: 보이는 면 가운데, 막대·LED는 양 끝) ── */
  const touch = () => !!App.pointerTouch;
  function handles() {
    const el = D().current(), id = UI().selected();
    if (!el || !id || !st.map || App.ui.tool !== 'dselect') return [];
    const q = (el.parts || []).find((x) => x.id === id);
    if (!q || q.s === 'poly' || q.s === 'arc') return [];
    const Bs = basis(), out = [];
    if (q.s === 'bar') {
      const len = D().lenOf(q) || 1, u = q.b.map((v, i) => (v - q.a[i]) / len);
      [['a', q.a, u.map((v) => -v)], ['b', q.b, u]].forEach(([end, p, n]) => { const s = project(st.map(p), Bs); if (s) out.push({ kind: 'end', end, p, n, x: s.x, y: s.y }); });
      return out;
    }
    const lo = [q.x, q.y, q.z], sz = [q.w, q.d, q.h], cen = lo.map((v, k) => v + sz[k] / 2);
    const M = D().sheet && D().SHEETS.find((x) => x.id === q.m), minK = sz.indexOf(Math.min(...sz));
    for (let k = 0; k < 3; k++) {
      if (M && k === minK && Math.abs(sz[k] - M.t) < 0.6) continue; // 판의 두께는 손잡이 없이
      for (const sg of [1, -1]) {
        const c = cen.slice(); c[k] = sg > 0 ? lo[k] + sz[k] : lo[k];
        const n = [0, 0, 0]; n[k] = sg;
        const S = st.map(c), N = sub(st.map(c.map((v, i) => v + n[i] * 100)), S);
        if (dot(N, sub(Bs.eye, S)) <= 0) continue; // 뒤쪽 면
        const s = project(S, Bs);
        if (s) out.push({ kind: 'face', k, sg, c, n, x: s.x, y: s.y });
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
      ctx.fillStyle = '#495057'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `600 14px ${FONT}`;
      ctx.fillText(st.failed ? '이 기기에서는 3D 작업 화면을 쓸 수 없습니다 — 정면·평면·측면에서 고치세요' : '부재가 없습니다 — 아래 ‘+가로판’·‘+세로판’·‘+막대’를 눌러 넣으세요', c.clientWidth / 2, c.clientHeight / 2);
      return;
    }
    const hs = handles(), R = touch() ? 11 : 8;
    hs.forEach((h) => {
      // 면이 보는 쪽을 가리키는 짧은 화살
      const s1 = project(st.map(h.c ? h.c.map((v, i) => v + h.n[i] * 60) : h.p.map((v, i) => v + h.n[i] * 60)));
      if (s1) {
        const dx = s1.x - h.x, dy = s1.y - h.y, l = Math.hypot(dx, dy);
        if (l > 2) {
          const ux = dx / l, uy = dy / l, L = R + 14;
          ctx.strokeStyle = '#e8590c'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(h.x + ux * R, h.y + uy * R); ctx.lineTo(h.x + ux * L, h.y + uy * L);
          ctx.moveTo(h.x + ux * L - (ux * 6 - uy * 4), h.y + uy * L - (uy * 6 + ux * 4)); ctx.lineTo(h.x + ux * L, h.y + uy * L); ctx.lineTo(h.x + ux * L - (ux * 6 + uy * 4), h.y + uy * L - (uy * 6 - ux * 4));
          ctx.stroke();
        }
      }
      ctx.beginPath(); ctx.arc(h.x, h.y, R, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#e8590c'; ctx.stroke();
    });
    if (st.label) { // 끄는 동안 크기
      const t = st.label.text, x = st.label.x, y = st.label.y - (touch() ? 60 : 30);
      ctx.font = `700 13px ${FONT}`;
      const w = ctx.measureText(t).width + 14;
      ctx.fillStyle = 'rgba(33,37,41,0.88)';
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x - w / 2, y - 11, w, 22, 6); else ctx.rect(x - w / 2, y - 11, w, 22); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, x, y);
    }
  }

  /* ── 고르기: 광선과 부재 상자(막대는 선분 둘레) ── */
  function pickAt(x, y) {
    const el = D().current();
    if (!el || !st.map || el.kind === 'model') return null;
    const Bs = basis(), R0 = ray(x, y, Bs), doors = App.current.designDoors !== false;
    let best = null, bt = Infinity;
    D().build(el).parts.forEach((q) => {
      if (q.halo || (!doors && q.door)) return;
      let t = null;
      if (q.s === 'bar') {
        const A = st.map(q.a), Bq = st.map(q.b), u = sub(Bq, A), w0 = sub(R0.o, A), a = dot(R0.d, R0.d), b = dot(R0.d, u), c = dot(u, u), d = dot(R0.d, w0), e = dot(u, w0);
        const den = a * c - b * b;
        let sc = den > 1e-12 ? (b * e - c * d) / den : 0, tc = den > 1e-12 ? (a * e - b * d) / den : 0;
        tc = Math.max(0, Math.min(1, tc));
        sc = Math.max(0, (b * tc - d) / a);
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
      if (t != null && t < bt) { bt = t; best = q; }
    });
    return best;
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
      if (st.drag && st.drag.started) { App.doc.commit(); }
      st.drag = null; st.press = null; st.label = null;
      return;
    }
    if (st.ptrs.size > 2) return;
    st.press = { ...p, pan: e.button === 2 || e.shiftKey, moved: false, t: performance.now() };
    // 손잡이?
    const hs = handles(), R = touch() ? 26 : 12;
    let best = null, bd = R;
    hs.forEach((h) => { const d = Math.hypot(h.x - p.x, h.y - p.y); if (d < bd) { bd = d; best = h; } });
    if (best && e.button !== 2) {
      const el = D().current(), q = (el.parts || []).find((x) => x.id === UI().selected());
      const from = best.kind === 'face' ? best.c : best.p, S0 = st.map(from), S1 = st.map(from.map((v, i) => v + best.n[i] * 100));
      const a = project(S0), b = project(S1);
      if (a && b) {
        const v = { x: (b.x - a.x) / 100, y: (b.y - a.y) / 100 };
        if (Math.hypot(v.x, v.y) > 0.002) st.drag = { h: best, el, q: JSON.parse(JSON.stringify(q)), v, started: false };
      }
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
    if (g) return dragHandle(g, p, e.altKey);
    st.anim = null; st.dirNow = null; syncDirButtons();
    busy();
    if (st.press.pan) pan(p.x - prev.x, p.y - prev.y);
    else { st.cam.yaw -= (p.x - prev.x) * 0.01; st.cam.pitch = Math.max(-0.15, Math.min(1.55, st.cam.pitch + (p.y - prev.y) * 0.008)); }
    draw();
  }
  function onUp(e) {
    if (!st.ptrs.has(e.pointerId)) return;
    st.ptrs.delete(e.pointerId);
    if (st.ptrs.size < 2) st.pinch = null;
    const press = st.press, g = st.drag;
    if (st.ptrs.size) return;
    st.press = null; st.drag = null; st.label = null;
    if (g && g.started) { App.doc.commit(); UI().renderQuick(); draw(); return; }
    if (!press || press.moved) { draw(); return; }
    // 누름: 고르기
    const q = pickAt(press.x, press.y);
    const now = performance.now();
    if (q && q.id === UI().selected() && now - st.lastTap < 350) fit(true); // 같은 부재를 두 번 누르면 그 부재로 가까이
    st.lastTap = now;
    UI().select(q ? q.id : null);
    draw();
  }
  function onCancel(e) {
    st.ptrs.delete(e.pointerId);
    if (st.drag && st.drag.started) App.doc.rollback();
    st.press = null; st.drag = null; st.pinch = null; st.label = null;
    draw();
  }
  function zoom(k) { st.cam.dist = Math.max(st.cam.r * 0.15, Math.min(st.cam.r * 20, st.cam.dist * k)); }
  function pan(dx, dy) {
    const Bs = basis(), { h } = size(), per = (2 * st.cam.dist * TH) / h; // 보는 곳 거리에서 1픽셀의 길이
    st.cam.target = st.cam.target.map((v, k) => v - Bs.r[k] * dx * per + Bs.u[k] * dy * per);
  }
  /** 손잡이 끌기: 그 면(막대는 끝)을 축을 따라 옮김 */
  function dragHandle(g, p, free) {
    const press = st.press, dx = p.x - press.x, dy = p.y - press.y, v = g.v, vv = v.x * v.x + v.y * v.y;
    let amt = (dx * v.x + dy * v.y) / vv; // mm
    const el = D().current(), q0 = g.q;
    if (!el) return;
    if (!g.started) { g.started = true; App.doc.begin(g.h.kind === 'end' ? '막대 늘이기' : '부재 크기 바꾸기'); }
    const step = free ? 1 : 10, tol = 8 / Math.sqrt(vv);
    let next, text;
    if (g.h.kind === 'end') {
      const len0 = D().lenOf(q0), len = Math.max(10, Math.round((len0 + amt) / step) * step), u = q0.b.map((x, i) => (x - q0.a[i]) / len0);
      next = g.h.end === 'b' ? { b: q0.a.map((x, i) => r1(x + u[i] * len)) } : { a: q0.b.map((x, i) => r1(x - u[i] * len)) };
      text = `길이 ${fmt(len)}`;
    } else {
      const k = g.h.k, POS = ['x', 'y', 'z'], SIZE = ['w', 'd', 'h'], lo = q0[POS[k]], hi = lo + q0[SIZE[k]];
      let face = (g.h.sg > 0 ? hi : lo) + amt;
      // 다른 부재의 면에 붙음, 아니면 10mm
      let snapped = null;
      if (!free) D().build(el).parts.forEach((o) => { if (o.id === q0.id || o.halo) return; const c = D().corners(o); [Math.min(...c.map((x) => x[k])), Math.max(...c.map((x) => x[k]))].forEach((f) => { if (Math.abs(f - face) <= tol && (snapped == null || Math.abs(f - face) < Math.abs(snapped - face))) snapped = f; }); });
      face = snapped != null ? snapped : Math.round(face / step) * step;
      if (g.h.sg > 0) { face = Math.max(lo + 5, face); next = { [SIZE[k]]: r1(face - lo) }; } else { face = Math.min(hi - 5, face); next = { [POS[k]]: r1(face), [SIZE[k]]: r1(hi - face) }; }
      text = `${['폭', '깊이', '높이'][k]} ${fmt(next[SIZE[k]])}`;
    }
    App.doc.update(el.id, { parts: (el.parts || []).map((x) => (x.id === q0.id ? { ...x, ...next } : x)) });
    st.label = { text, x: p.x, y: p.y };
    busy();
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
    if (!was) { st.el = null; st.elId = null; st.cam.yaw = DIRS.iso[0]; st.cam.pitch = DIRS.iso[1]; st.dirNow = 'iso'; syncDirButtons(); }
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
    st.cv = null; st.scene = null; st.map = null; st.el = null; st.B = null; st.elId = null; st.failed = false;
  }
  /** 화면 기준 축: 오른쪽(→)이 가장 가까운 수평 축(부호 포함), 보는 쪽(앞)은 남은 수평 축 — 빠른 막대의 화살표·앞뒤가 보는 대로 움직이게 */
  function axes() {
    const y = st.cam.yaw, cx = Math.cos(y), sy = Math.sin(y);
    if (Math.abs(cx) >= Math.abs(sy)) return { ha: 0, hs: Math.sign(cx) || 1, va: 2, ta: 1, toward: -Math.sign(cx) || -1 };
    return { ha: 1, hs: Math.sign(sy) || 1, va: 2, ta: 0, toward: Math.sign(sy) || 1 };
  }
  function init() {
    st.box = document.getElementById('ds3dView');
    if (!st.box) return;
    st.box.addEventListener('pointerdown', (e) => { if (e.target.closest('.ds-dir')) return; onDown(e); });
    st.box.addEventListener('pointermove', onMove);
    st.box.addEventListener('pointerup', onUp);
    st.box.addEventListener('pointercancel', onCancel);
    st.box.addEventListener('contextmenu', (e) => e.preventDefault());
    st.box.addEventListener('wheel', (e) => { if (!active()) return; e.preventDefault(); zoom(Math.exp(Math.max(-300, Math.min(300, e.deltaY)) * 0.0015)); busy(); draw(); }, { passive: false });
    st.box.querySelector('.ds-dir').addEventListener('click', (e) => { const b = e.target.closest('[data-dir]'); if (b) setDir(b.dataset.dir); });
    window.addEventListener('resize', () => { if (active()) { placeDirs(); draw(); } });
  }

  App.design3d = {
    init, sync, active, setDir, fit, axes, pickAt, handles,
    /** 부재가 바뀌었을 수 있음: 다음 그림 때 장면을 새로 */
    kick() { if (active()) draw(); },
    /** 시험용: 사진기와 장면 상태 */
    state: () => ({ on: active(), gl: !!st.R, yaw: st.cam.yaw, pitch: st.cam.pitch, dist: st.cam.dist, target: st.cam.target.slice(), dir: st.dirNow || null, empty: st.empty, scene: !!st.scene }),
    /** 시험용: 부재(설계 좌표 점)가 화면 어디에 보이는지 (캔버스 기준 픽셀) */
    screenOf(p) { if (!st.map) return null; const s = project(st.map(p)); if (!s) return null; const r = st.box.getBoundingClientRect(); return { x: r.left + s.x, y: r.top + s.y }; },
    /** 시험용: 지금 그려 그림 주소로 */
    shot() { if (!st.R) return null; render(); return st.cv.toDataURL('image/png'); },
  };
})();
