/* 설계도면 그리기: 설계물 하나를 정면도(왼쪽 아래)·평면도(그 위)·우측면도(오른쪽)·입체도(오른쪽 위)로 한 장에 (3각법).
   종이 좌표는 mm, y는 아래로. 도면 캔버스(설계 모드)와 PDF가 같은 그림을 쓴다.
   - 부재는 멀리 있는 것부터 칠해 가려진 선을 지우고(화가 방식), 가려진 선은 옅은 점선으로 다시 그림
   - 치수: 전체 치수와 부재 자리의 연속 치수 (단위 mm)
   - 내려받은 3D 모델은 네 방향에서 그린 그림으로
   - 설계 화면은 그림 하나를 크게 볼 수 있음 (정면이 처음, 평면·측면·입체·전체로 바꿈). PDF·DXF는 늘 네 그림 한 장 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif';
  const ISO_K = 0.72, C30 = 0.866;
  const INK = '#2b3138', DIM = '#1c7ed6', MUTE = '#6b7680';
  const D = () => App.design;
  /** 설계 화면에서 지금 크게 보는 그림: 'front'(정면, 처음) · 'top' · 'side' · 'iso' · 'all'(네 그림 한 장) */
  const VIEWS = ['front', 'top', 'side', 'iso', 'all'];
  const viewNow = () => { const v = App.current && App.current.designView; return VIEWS.includes(v) ? v : 'front'; };
  const ORTHO = ['front', 'top', 'side'];
  const fmt = (v) => { const r = Math.round(v * 10) / 10; return (Math.abs(r - Math.round(r)) < 0.05 ? Math.round(r) : r).toLocaleString('ko-KR'); };

  /** 종이 배치. 돌려주는 값: { B(부재), G(그림 사이), views: { front, top, side, iso }, rect(전체 범위) } */
  let tapDims = [];   // 화면에 그린 고른 부재 치수 글자 자리
  let frozen = null; // 부재를 끄는 동안: 그림 자리가 따라 움직이지 않게 끌기 시작할 때의 기준을 씀 { id, min, s }
  function layout(el) {
    const B = D().build(el);
    const f = frozen && frozen.id === el.id ? frozen : null;
    const s = f ? f.s : { w: Math.max(1, B.size.w), d: Math.max(1, B.size.d), h: Math.max(1, B.size.h) };
    const min = f ? f.min : B.min;
    const G = Math.max(260, Math.round(Math.max(s.w, s.h, s.d) * 0.24));
    const isoW = (s.w + s.d) * C30 * ISO_K, isoH = (s.h + (s.w + s.d) * 0.5) * ISO_K;
    const views = {
      front: { x: 0, y: -s.h, w: s.w, h: s.h, name: '정면도' },
      top: { x: 0, y: -s.h - G - s.d, w: s.w, h: s.d, name: '평면도' },
      side: { x: s.w + G, y: -s.h, w: s.d, h: s.h, name: '우측면도' },
      iso: { x: s.w + G, y: -s.h - G - isoH, w: isoW, h: isoH, name: '입체도' },
    };
    const maxX = Math.max(views.side.x + views.side.w, views.iso.x + views.iso.w), minY = Math.min(views.top.y, views.iso.y);
    const pad = G * 0.95;
    const lift = B.min && B.min[2] > 1 ? B.min[2] : 0; // 바닥에서 떠 있는 높이 (벽에 붙이는 틀 따위): 바닥선·아래 치수가 그만큼 내려감
    return { B, s, G, min, views, lift, rect: { minX: -pad, minY: minY - pad * 0.75, maxX: maxX + pad * 0.45, maxY: pad + lift } };
  }
  /** 부재 좌표 → 종이 좌표 (그림마다) */
  function projector(L) {
    const m = L.min, s = L.s, G = L.G, V = L.views;
    return {
      front: (c) => [c[0] - m[0], -(c[2] - m[2])],
      top: (c) => [c[0] - m[0], -(s.h + G) - (c[1] - m[1])],
      side: (c) => [s.w + G + (c[1] - m[1]), -(c[2] - m[2])],
      iso: (c) => { const x = c[0] - m[0], y = c[1] - m[1], z = c[2] - m[2]; return [V.iso.x + (x + y) * C30 * ISO_K, V.iso.y + V.iso.h - (z + (y - x) * 0.5 + s.w * 0.5) * ISO_K]; },
    };
  }
  /** 볼록 껍질 (점이 적으므로 단순하게) */
  function hull(pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (p.length < 3) return p;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    lo.pop(); up.pop();
    return lo.concat(up);
  }
  const mix = (hex, t) => {
    const v = parseInt(String(hex).replace('#', ''), 16) || 0, r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
    const f = (c) => Math.round(t >= 0 ? c + (255 - c) * t : c * (1 + t));
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  };
  const colorOf = (q) => q.c || (D().mat(q.m) || {}).color || '#cccccc';

  /** 한 그림(정면·평면·측면)에 보이는 부재들: 멀리 있는 것부터. 돌려주는 값: [{ q, poly: [[u, v]…] }] */
  function orthoShapes(L, view, vis = null) {
    const P = projector(L)[view];
    const near = view === 'front' ? (q, c) => -Math.min(...c.map((p) => p[1])) : view === 'top' ? (q, c) => Math.max(...c.map((p) => p[2])) : (q, c) => Math.max(...c.map((p) => p[0]));
    return (vis ? L.B.parts.filter(vis) : L.B.parts).filter((q) => !q.halo).map((q) => {
      const c = D().corners(q);
      // 곡선 부재(아치·니치·아치문): 정면도에서는 윤곽 그대로, 평면·측면은 둘러싼 네모
      const curved = (q.s === 'poly' || q.s === 'arc') && view === 'front';
      // 둥근 부재: 둥근 면을 마주 보는 그림에서는 원·모서리 R 윤곽, 다른 그림은 둘러싼 네모
      const round = q.s === 'rnd' && RND_VIEW[q.ax] === view;
      return { q, key: near(q, c), poly: curved ? D().outline2(q).map(([x, z]) => P([x, q.y, z])) : round ? D().rndOutline(q).map(([u, v]) => P(D().rndPoint(q, u, v, 0))) : q.s === 'bar' ? hull(c.map(P)) : rectOf(c.map(P)) };
    }).sort((a, b) => (a.q.role === 'lite') - (b.q.role === 'lite') || a.key - b.key); // LED 라인은 맨 위에
  }
  const RND_VIEW = { y: 'front', z: 'top', x: 'side' }; // 둥근 면을 마주 보는 그림
  function rectOf(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    pts.forEach((p) => { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; });
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  }
  /** 입체도의 보이는 면들: 멀리 있는 것부터. [{ q, poly, shade(−1 어둡게 … 1 밝게) }] */
  function isoFaces(L, vis = null) {
    const P = projector(L).iso, out = [];
    const view = [1, -1, 1]; // 보는 사람 쪽 (오른쪽·앞·위)
    const F = [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]]; // corners 차례 [아래 4, 위 4] 기준의 여섯 면 (바깥에서 봐서 반시계가 아닐 수도 있어 법선으로 가림)
    (vis ? L.B.parts.filter(vis) : L.B.parts).filter((q) => !q.halo).forEach((q) => {
      if (q.s === 'rnd') { // 둥근 부재: 두 둥근 면 + 둘레 띠, 보는 쪽을 향한 면만
        const O = D().rndOutline(q), [ku, kv] = D().RND_AX[q.ax] || [0, 1], ka = 3 - ku - kv, a0 = [q.x, q.y, q.z][ka], a1 = a0 + [q.w, q.d, q.h][ka];
        const A = O.map(([u, v]) => D().rndPoint(q, u, v, a0)), Bc = O.map(([u, v]) => D().rndPoint(q, u, v, a1));
        const cen = [q.x + q.w / 2, q.y + q.d / 2, q.z + q.h / 2];
        const faces = [A, Bc, ...O.map((_, i) => { const j = (i + 1) % O.length; return [A[i], A[j], Bc[j], Bc[i]]; })];
        const soft = O.length > 4; // 둥근 둘레의 잘게 나눈 면은 선 없이 (줄무늬가 되지 않게), 바깥 윤곽만 따로
        let top = -Infinity;
        faces.forEach((f, fi) => {
          let n = [0, 0, 0];
          for (let i = 0; i < f.length; i++) { const p = f[i], r = f[(i + 1) % f.length]; n[0] += (p[1] - r[1]) * (p[2] + r[2]); n[1] += (p[2] - r[2]) * (p[0] + r[0]); n[2] += (p[0] - r[0]) * (p[1] + r[1]); }
          const fc = [0, 1, 2].map((k) => f.reduce((t, p) => t + p[k], 0) / f.length);
          if (n[0] * (fc[0] - cen[0]) + n[1] * (fc[1] - cen[1]) + n[2] * (fc[2] - cen[2]) < 0) n = n.map((v) => -v);
          const nl = Math.hypot(n[0], n[1], n[2]);
          if (nl < 1e-9 || n[0] * view[0] + n[1] * view[1] + n[2] * view[2] <= 1e-6) return;
          const key = fc[0] - fc[1] + fc[2];
          top = Math.max(top, key);
          out.push({ q, key, poly: f.map(P), shade: n[2] / nl > 0.6 ? 0.28 : n[0] / nl > 0.5 ? -0.16 : 0, ...(soft && fi > 1 ? { soft: true } : {}) });
        });
        if (soft) out.push({ q, key: top + 1e-3, poly: hull([...A, ...Bc].map(P)), outline: true });
        return;
      }
      if (q.s === 'poly' || q.s === 'arc') { // 곡선 부재: 앞면 윤곽 + 보이는 옆면들
        const O = D().outline2(q), y0 = q.y, y1 = q.y + q.d;
        let A = 0;
        O.forEach((p, i) => { const r = O[(i + 1) % O.length]; A += p[0] * r[1] - r[0] * p[1]; });
        const cx = O.reduce((t, p) => t + p[0], 0) / O.length, cz = O.reduce((t, p) => t + p[1], 0) / O.length;
        out.push({ q, key: cx - y0 + cz, poly: O.map(([x, z]) => P([x, y0, z])), shade: 0 });
        O.forEach((p, i) => {
          const r = O[(i + 1) % O.length], dx = r[0] - p[0], dz = r[1] - p[1], l = Math.hypot(dx, dz);
          if (l < 1e-6) return;
          const nx = (A > 0 ? dz : -dz) / l, nz = (A > 0 ? -dx : dx) / l; // 바깥쪽
          if (nx * view[0] + nz * view[2] <= 1e-6) return;
          out.push({ q, key: (p[0] + r[0]) / 2 - (y0 + y1) / 2 + (p[1] + r[1]) / 2, poly: [P([p[0], y0, p[1]]), P([r[0], y0, r[1]]), P([r[0], y1, r[1]]), P([p[0], y1, p[1]])], shade: nz > 0.6 ? 0.28 : nx > 0.5 ? -0.16 : 0 });
        });
        return;
      }
      const c = D().corners(q);
      const faces = q.s === 'bar' ? [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]] : F;
      const cen = [0, 1, 2].map((k) => c.reduce((t, p) => t + p[k], 0) / 8);
      faces.forEach((f) => {
        const a = c[f[0]], b = c[f[1]], d = c[f[2]];
        let n = [(b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]), (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]), (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0])];
        const fc = [0, 1, 2].map((k) => f.reduce((t, i) => t + c[i][k], 0) / 4);
        if (n[0] * (fc[0] - cen[0]) + n[1] * (fc[1] - cen[1]) + n[2] * (fc[2] - cen[2]) < 0) n = n.map((v) => -v); // 바깥을 보게
        const facing = n[0] * view[0] + n[1] * view[1] + n[2] * view[2];
        if (facing <= 1e-6) return;
        const nl = Math.hypot(n[0], n[1], n[2]) || 1;
        out.push({ q, key: fc[0] - fc[1] + fc[2], poly: f.map((i) => P(c[i])), shade: n[2] / nl > 0.6 ? 0.28 : n[0] / nl > 0.5 ? -0.16 : 0 });
      });
    });
    return out.sort((a, b) => a.key - b.key);
  }

  /* ── 치수선 ── */
  function dimStyle(ctx, px) {
    ctx.strokeStyle = DIM; ctx.fillStyle = DIM; ctx.lineWidth = 1 * px; ctx.setLineDash([]);
    ctx.font = `600 ${11.5 * px}px ${FONT}`; ctx.textAlign = 'center';
  }
  /** 가로 치수: x0~x1을 높이 y에. from: 그림 쪽 끝 y (보조선이 시작하는 곳) */
  function dimH(ctx, x0, x1, y, from, px, text = fmt(Math.abs(x1 - x0))) {
    if (Math.abs(x1 - x0) < 0.5) return;
    const t = 4 * px, dir = y > from ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(x0, from + dir * 3 * px); ctx.lineTo(x0, y + dir * t);
    ctx.moveTo(x1, from + dir * 3 * px); ctx.lineTo(x1, y + dir * t);
    ctx.moveTo(x0, y); ctx.lineTo(x1, y);
    ctx.moveTo(x0 - t, y + t); ctx.lineTo(x0 + t, y - t);
    ctx.moveTo(x1 - t, y + t); ctx.lineTo(x1 + t, y - t);
    ctx.stroke();
    const w = ctx.measureText(text).width, len = Math.abs(x1 - x0), mid = (x0 + x1) / 2;
    if (w <= len - 4 * px) { ctx.textBaseline = 'bottom'; ctx.fillText(text, mid, y - 2 * px); return; }
    // 좁은 칸: 글자를 세워서 그림과 치수선 사이에 (칸이 글자 높이보다 넓고, 사이에 들어갈 때만). 더 좁은 칸(판 두께 따위)은 뺌
    const gap = 30 * px; // 치수선과 그 안쪽(그림이나 앞 치수선) 사이
    if (len >= 13 * px && w <= gap - 6 * px) {
      ctx.save();
      ctx.translate(mid + 0.5 * px, y - dir * (gap / 2 - 1.5 * px));
      ctx.rotate(-Math.PI / 2);
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }
  }
  /** 세로 치수: y0~y1을 x에 (글자는 세워서). o.out: 글자를 선 바깥에 눕혀서 (‘바닥에서 500’처럼 긴 글) */
  function dimV(ctx, y0, y1, x, from, px, text = fmt(Math.abs(y1 - y0)), o = null) {
    if (Math.abs(y1 - y0) < 0.5) return;
    const t = 4 * px, dir = x > from ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(from + dir * 3 * px, y0); ctx.lineTo(x + dir * t, y0);
    ctx.moveTo(from + dir * 3 * px, y1); ctx.lineTo(x + dir * t, y1);
    ctx.moveTo(x, y0); ctx.lineTo(x, y1);
    ctx.moveTo(x - t, y0 + t); ctx.lineTo(x + t, y0 - t);
    ctx.moveTo(x - t, y1 + t); ctx.lineTo(x + t, y1 - t);
    ctx.stroke();
    const w = ctx.measureText(text).width, len = Math.abs(y1 - y0), mid = (y0 + y1) / 2;
    if (o && o.out) { // 선 바깥에 눕혀서
      ctx.save(); ctx.textAlign = dir > 0 ? 'left' : 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(text, x + dir * 8 * px, mid); ctx.restore();
      return;
    }
    if (w <= len - 4 * px) {
      ctx.save();
      ctx.translate(x - 2 * px, mid);
      ctx.rotate(-Math.PI / 2);
      ctx.textBaseline = 'bottom';
      ctx.fillText(text, 0, 0);
      ctx.restore();
      return;
    }
    // 좁은 칸: 선과 그림 사이에 눕혀서 (보조선 사이에 들어갈 때만)
    if (len >= 13 * px && w <= Math.abs(from - x) - 6 * px) {
      ctx.save(); ctx.textBaseline = 'middle';
      ctx.fillText(text, (x + from) / 2 + dir * -1.5 * px, mid + 0.5 * px);
      ctx.restore();
    }
  }
  /** 연속 치수에 쓸 자리들: 뼈대가 되는 부재(문짝·선반 빼고)의 면. 너무 많으면 막대만, 그래도 많으면 없음 */
  const many = (c) => (c && c.length >= 3 ? c : null); // 한 칸짜리 연속 치수는 전체 치수와 같으므로 뺌
  function chain(L, axis) {
    const k = axis === 'x' ? 0 : axis === 'y' ? 1 : 2, m = L.min[k], size = [L.s.w, L.s.d, L.s.h][k];
    const given = L.B.chain && L.B.chain[axis];
    if (given && given.length >= 2) return given.map((v) => Math.round((v - m) * 10) / 10).filter((v) => v >= -0.5 && v <= size + 0.5);
    const pick = (parts) => {
      const set = [];
      parts.forEach((q) => { const c = D().corners(q); const lo = Math.min(...c.map((p) => p[k])) - m, hi = Math.max(...c.map((p) => p[k])) - m; set.push(lo, hi); });
      set.push(0, size);
      const s = set.map((v) => Math.round(v * 10) / 10).sort((a, b) => a - b), out = [];
      s.forEach((v) => { if (!out.length || v - out[out.length - 1] > 2.5) out.push(v); });
      return out;
    };
    const body = L.B.parts.filter((q) => !q.door && !q.dr && q.role !== 'fix' && q.role !== 'lite' && q.n !== '선반' && q.s !== 'bar' && !q.thin);
    const leds = body.filter((q) => q.role === 'led');
    for (const set of [leds.length ? leds : body.filter((q) => q.role !== 'led'), body.filter((q) => q.role === 'bar')]) {
      if (!set.length) continue;
      const c = pick(set);
      if (c.length >= 3 && c.length <= 16) return c;
    }
    return null;
  }

  /** 모듈 이름표 (‘개수대 900’ 따위): 정면도·측면도의 그 모듈 위에. 좁으면 세워서, 그래도 안 들어가면 뺌 */
  function drawLabels(ctx, L, px, view = 'all') {
    const m = L.min, s = L.s;
    (L.B.labels || []).forEach((lb) => {
      const side = lb.view === 'side';
      if (view !== 'all' && view !== (side ? 'side' : 'front')) return;
      const off = side ? s.w + L.G - m[1] : -m[0];
      const x0 = lb.a0 + off, x1 = lb.a1 + off, y0 = -(lb.z1 - m[2]), y1 = -(lb.z0 - m[2]);
      ctx.font = `700 ${10.5 * px}px ${FONT}`;
      const w = ctx.measureText(lb.text).width, bw = x1 - x0, bh = y1 - y0, pad = 5 * px, th = 15 * px;
      let rot = false;
      if (w + pad * 2 > bw - 4 * px) { if (w + pad * 2 <= bh - 4 * px && th <= bw - 2 * px) rot = true; else return; }
      ctx.save();
      ctx.translate((x0 + x1) / 2, rot ? (y0 + y1) / 2 : y0 + bh * 0.6);
      if (rot) ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.strokeStyle = 'rgba(43,49,56,0.4)'; ctx.lineWidth = 0.8 * px; ctx.setLineDash([]);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-w / 2 - pad, -th / 2, w + pad * 2, th, 4 * px); else ctx.rect(-w / 2 - pad, -th / 2, w + pad * 2, th);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(lb.text, 0, 0.5 * px);
      ctx.restore();
    });
  }

  /* ── 내려받은 3D 모델: 네 방향 그림 ── */
  const shots = new Map(); // 'id:ver' → { front, top, side, iso } (캔버스) 또는 'wait'
  function modelShots(el) {
    const m = el.objId && App.library ? App.library.byId(el.objId) : null;
    if (!m) return null;
    const key = `${m.id}:${m.ver}`;
    const hit = shots.get(key);
    if (hit) return hit === 'wait' ? null : hit;
    const e = App.library.data(m.id);
    if (!e || !(e.view || e.mesh)) return null;
    shots.set(key, 'wait');
    let R = null;
    const cv = document.createElement('canvas');
    try {
      R = new App.gl3d.Renderer(cv, { alpha: true });
      const scene = App.library.sceneOf(e.view || e.mesh);
      R.setScene(scene);
      const b = scene.bounds, c = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
      const w = b.max[0] - b.min[0], h = b.max[1] - b.min[1], d = b.max[2] - b.min[2], far = Math.max(w, h, d) * 4 + 10;
      const snap = (cam, wm, hm) => {
        const k = Math.min(900 / wm, 900 / hm, 4000);
        cv.width = Math.max(8, Math.round(wm * k)); cv.height = Math.max(8, Math.round(hm * k));
        R.render({ ...cam, target: c, ortho: { hw: wm / 2, hh: hm / 2 }, near: 0.01, far }, { sun: 0, sky: false, ground: false, transparent: true, shadows: false, clouds: false, blobs: false });
        const out = document.createElement('canvas');
        out.width = cv.width; out.height = cv.height;
        out.getContext('2d').drawImage(cv, 0, 0);
        return out;
      };
      const L = Math.max(w, h, d) * 2 + 5;
      const isoW = (w + d) * C30, isoH = h + (w + d) * 0.5;
      const made = {
        front: snap({ eye: [c[0], c[1], c[2] + L], up: [0, 1, 0] }, w, h),
        top: snap({ eye: [c[0], c[1] + L, c[2]], up: [0, 0, -1] }, w, d),
        side: snap({ eye: [c[0] + L, c[1], c[2]], up: [0, 1, 0] }, d, h),
        iso: snap({ eye: [c[0] + L * 0.7071 * 0.8165, c[1] + L * 0.5774, c[2] + L * 0.7071 * 0.8165], up: [0, 1, 0] }, isoW, isoH),
      };
      shots.set(key, made);
      if (shots.size > 12) shots.delete(shots.keys().next().value);
      return made;
    } catch (err) {
      console.warn('모델 그림을 만들지 못함', err);
      shots.delete(key);
      return null;
    } finally {
      if (R) { try { R.dispose(); const lose = R.gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); } catch (_) { /* 무시 */ } }
    }
  }
  /** 모델 보기용 배치: 사물의 크기로 */
  function modelLayout(el) {
    const m = el.objId && App.library ? App.library.byId(el.objId) : null;
    const size = m ? { w: m.w, d: m.d, h: Math.max(1, m.h) } : { w: 1000, d: 1000, h: 1000 };
    return layout({ ...el, kind: 'free', p: {}, parts: [{ s: 'box', n: '모델', m: 'ply18', x: 0, y: 0, z: 0, w: size.w, d: size.d, h: size.h }] });
  }

  /** 종이 한 장을 그림. ctx에는 종이 좌표(mm) 변환이 걸려 있어야 함.
      o: { px(1화면픽셀 = 몇 mm), sel(고른 부재 id), hidden(가려진 선), dims(치수), paper(종이용: 글자를 진하게), view('all' 네 그림 | 'front'·'top'·'side'·'iso' 그 그림만) } */
  function drawSheet(ctx, el, o = {}) {
    const px = o.px || 1, model = el.kind === 'model';
    const L = model ? modelLayout(el) : layout(el);
    const V = L.views, s = L.s, base = model ? 0 : L.lift;
    const view = VIEWS.includes(o.view) ? o.view : 'all', on = (k) => view === 'all' || view === k;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'butt';
    const caption = (v, extra = '') => {
      ctx.fillStyle = MUTE; ctx.font = `600 ${11 * px}px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      // 정면·측면은 바닥선과 아래 치수 밑에, 평면도만 볼 때는 아래 치수(폭) 밑에
      ctx.fillText(`${v.name}${extra}`, v.x, v.y + v.h + (v === V.front || v === V.side ? base + 80 * px : v === V.top && view === 'top' ? 80 * px : 10 * px));
    };
    if (model) {
      const pics = modelShots(el);
      ['front', 'top', 'side', 'iso'].filter(on).forEach((k) => {
        const v = V[k];
        if (pics && pics[k]) ctx.drawImage(pics[k], v.x, v.y, v.w, v.h);
        else { ctx.strokeStyle = MUTE; ctx.lineWidth = px; ctx.setLineDash([6 * px, 4 * px]); ctx.strokeRect(v.x, v.y, v.w, v.h); ctx.setLineDash([]); }
      });
    } else if (!L.B.parts.length) {
      ctx.fillStyle = MUTE; ctx.font = `600 ${14 * px}px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('부재가 없습니다 — ‘판’·‘막대’ 도구로 그리거나 속성에서 값을 넣으세요', 0, -40 * px);
      return L;
    } else {
      const paint = (shapes, iso) => {
        shapes.forEach(({ q, poly, shade, soft, outline }) => {
          const sel = o.sel && o.sel === q.id;
          const base = colorOf(q), led = q.role === 'led', lite = q.role === 'lite';
          ctx.beginPath();
          poly.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
          ctx.closePath();
          const line = sel ? '#e8590c' : lite ? '#e67700' : led ? '#7d8894' : INK;
          if (outline) { ctx.lineWidth = (sel ? 2.2 : 1.1) * px; ctx.strokeStyle = line; ctx.stroke(); return; } // 둥근 부재의 바깥 윤곽만
          ctx.fillStyle = sel ? '#ffd8a8' : lite ? '#fab005' : led ? mix('#27313d', iso ? shade * 0.5 : 0) : mix(base, iso ? 0.35 + shade : 0.55);
          ctx.fill();
          ctx.lineWidth = (soft ? 0.7 : sel ? 2.2 : 1.1) * px;
          ctx.strokeStyle = soft ? ctx.fillStyle : line;
          ctx.stroke();
        });
      };
      const vis = o.doors === false ? (q) => !q.door : null; // 문짝을 떼고 속을 봄
      ORTHO.filter(on).forEach((k) => {
        const shapes = orthoShapes(L, k, vis);
        paint(shapes, false);
        if (o.hidden !== false) {
          ctx.save();
          ctx.globalAlpha = 0.34; ctx.lineWidth = 0.9 * px; ctx.strokeStyle = INK; ctx.setLineDash([5 * px, 4 * px]);
          shapes.forEach(({ poly }) => { ctx.beginPath(); poly.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.stroke(); });
          ctx.restore();
        }
      });
      if (on('iso')) paint(isoFaces(L, vis), true);
      if (o.dims !== false) drawLabels(ctx, L, px, view);
    }
    // 바닥선 (정면도·측면도). 떠 있으면 그만큼 아래에 긋고, 아래쪽 치수는 바닥선 밑으로
    ctx.strokeStyle = MUTE; ctx.lineWidth = 1.6 * px; ctx.setLineDash([]);
    ctx.beginPath();
    if (on('front')) { ctx.moveTo(V.front.x - 30 * px, base); ctx.lineTo(V.front.x + V.front.w + 30 * px, base); }
    if (on('side')) { ctx.moveTo(V.side.x - 30 * px, base); ctx.lineTo(V.side.x + V.side.w + 30 * px, base); }
    ctx.stroke();
    if (o.caption !== false) {
      if (on('front')) caption(V.front);
      if (on('top')) caption(V.top);
      if (on('side')) caption(V.side);
      if (on('iso')) caption(V.iso, ' (비율만 맞춤)');
    }
    L.overall = []; // 그림 하나를 볼 때 전체 치수 글자 자리 (눌러서 값 고치기): [{ ax(0 X·1 Y·2 Z), v, x, y, horiz }]
    if (o.dims !== false) {
      dimStyle(ctx, px);
      const g1 = 30 * px, g2 = 58 * px, one = view !== 'all';
      const keep = (ax, v, x, y, horiz) => { if (one) L.overall.push({ ax, v, x, y, horiz }); };
      const cx = model ? null : many(chain(L, 'x')), cz = model ? null : many(chain(L, 'z')), cy = model ? null : many(chain(L, 'y'));
      // 정면도: 아래 폭, 왼쪽 높이
      if (on('front')) {
        if (cx) for (let i = 0; i + 1 < cx.length; i++) dimH(ctx, cx[i], cx[i + 1], base + g1, 0, px);
        dimH(ctx, 0, s.w, base + (cx ? g2 : g1), 0, px);
        keep(0, s.w, s.w / 2, base + (cx ? g2 : g1), true);
        if (cz) for (let i = 0; i + 1 < cz.length; i++) dimV(ctx, -cz[i], -cz[i + 1], -g1, 0, px);
        dimV(ctx, 0, -s.h, cz ? -g2 : -g1, 0, px);
        keep(2, s.h, cz ? -g2 : -g1, -s.h / 2, false);
      }
      // 평면도: 왼쪽 깊이 (평면도만 볼 때는 아래에 폭도)
      if (on('top')) {
        const ty = V.top.y + V.top.h;
        if (cy) for (let i = 0; i + 1 < cy.length; i++) dimV(ctx, ty - cy[i], ty - cy[i + 1], -g1, 0, px);
        dimV(ctx, ty, ty - s.d, cy ? -g2 : -g1, 0, px);
        keep(1, s.d, cy ? -g2 : -g1, ty - s.d / 2, false);
        if (one) {
          if (cx) for (let i = 0; i + 1 < cx.length; i++) dimH(ctx, cx[i], cx[i + 1], ty + g1, ty, px);
          dimH(ctx, 0, s.w, ty + (cx ? g2 : g1), ty, px);
          keep(0, s.w, s.w / 2, ty + (cx ? g2 : g1), true);
        }
      }
      // 우측면도: 아래 깊이 (ㄱ자 주방처럼 옆줄의 모듈 자리가 있으면 연속 치수도). 측면도만 볼 때는 왼쪽에 높이도
      if (on('side')) {
        const cyS = !model && L.B.chain && L.B.chain.y && cy && cy.length > 2 ? cy : null;
        if (cyS) for (let i = 0; i + 1 < cyS.length; i++) dimH(ctx, V.side.x + cyS[i], V.side.x + cyS[i + 1], base + g1, 0, px);
        dimH(ctx, V.side.x, V.side.x + s.d, base + (cyS ? g2 : g1), 0, px);
        keep(1, s.d, V.side.x + s.d / 2, base + (cyS ? g2 : g1), true);
        if (one) {
          const sx = V.side.x;
          if (cz) for (let i = 0; i + 1 < cz.length; i++) dimV(ctx, -cz[i], -cz[i + 1], sx - g1, sx, px);
          dimV(ctx, 0, -s.h, sx - (cz ? g2 : g1), sx, px);
          keep(2, s.h, sx - (cz ? g2 : g1), -s.h / 2, false);
        }
        // 바닥에서 떠 있는 높이: 우측면도 오른쪽에
        if (base > 0) dimV(ctx, 0, base, V.side.x + V.side.w + g1 * 0.7, V.side.x + V.side.w, px, `바닥에서 ${fmt(base)}`, { out: true });
      }
    }
    return L;
  }

  /* ── 고른 부재의 치수 (그림 하나를 볼 때): 부재 크기와 전체 끝에서 떨어진 거리. 눌러서 숫자로 고칠 수 있게 글자 자리를 돌려줌 ── */
  const PART = '#e8590c';
  /** 부재가 그 그림에서 차지하는 범위: { lo: [가로, 세로], hi: [가로, 세로] } (부재 좌표, mm) */
  function partSpan(q, view) {
    const [ha, va] = AXES[view], c = D().corners(q);
    const lo = (k) => Math.min(...c.map((p) => p[k])), hi = (k) => Math.max(...c.map((p) => p[k]));
    return { lo: [lo(ha), lo(va)], hi: [hi(ha), hi(va)] };
  }
  /** 그림의 두 축 값 → 종이 좌표 */
  function paperOf(L, view, a, b) {
    const c = L.min.slice(), [ha, va] = AXES[view];
    c[ha] = a; c[va] = b;
    const p = projector(L)[view](c);
    return { x: p[0], y: p[1] };
  }
  /** 고른 부재의 연속 치수: 그림 바깥 위쪽에 [왼쪽 끝에서 · 폭 · 오른쪽 끝까지], 바깥 오른쪽에 [아래에서 · 높이 · 위 끝까지] (다른 부재를 가로지르지 않게).
      돌려주는 값: [{ key: 'size'|'lo'|'hi', ax: 0(가로)|1(세로), v(값), r: {x0,y0,x1,y1}(종이 좌표, 누를 자리) }] */
  function drawPartDims(ctx, L, view, q, px) {
    const [ha, va] = AXES[view], sp = partSpan(q, view), out = [];
    const min = [L.min[ha], L.min[va]], max = [L.min[ha] + [L.s.w, L.s.d, L.s.h][ha], L.min[va] + [L.s.w, L.s.d, L.s.h][va]];
    const topY = paperOf(L, view, min[0], max[1]).y, rightX = paperOf(L, view, max[0], min[1]).x; // 그림 전체의 위 끝, 오른쪽 끝 (종이)
    ctx.save();
    dimStyle(ctx, px);
    ctx.strokeStyle = PART; ctx.fillStyle = PART; ctx.font = `700 ${12 * px}px ${FONT}`;
    const gy = topY - 18 * px, gx = rightX + 18 * px;
    const segsH = [['lo', min[0], sp.lo[0]], ['size', sp.lo[0], sp.hi[0]], ['hi', sp.hi[0], max[0]]];
    segsH.forEach(([key, a, b]) => {
      if (b - a < 0.5) return;
      const x0 = paperOf(L, view, a, 0).x, x1 = paperOf(L, view, b, 0).x;
      dimH(ctx, x0, x1, gy, topY, px);
      const w = Math.max(ctx.measureText(fmt(b - a)).width / 2 + 6 * px, 20 * px), mid = (x0 + x1) / 2;
      out.push({ key, ax: 0, v: b - a, r: { x0: mid - w, x1: mid + w, y0: gy - 20 * px, y1: gy + 6 * px } });
    });
    const segsV = [['lo', min[1], sp.lo[1]], ['size', sp.lo[1], sp.hi[1]], ['hi', sp.hi[1], max[1]]];
    segsV.forEach(([key, a, b]) => {
      if (b - a < 0.5) return;
      const y0 = paperOf(L, view, 0, a).y, y1 = paperOf(L, view, 0, b).y;
      dimV(ctx, y0, y1, gx, rightX, px);
      const h = Math.max(ctx.measureText(fmt(b - a)).width / 2 + 6 * px, 20 * px), mid = (y0 + y1) / 2;
      out.push({ key, ax: 1, v: b - a, r: { x0: gx - 15 * px, x1: gx + 8 * px, y0: mid - h, y1: mid + h } });
    });
    ctx.restore();
    return out;
  }

  /** 전체 미리보기 창(오른쪽 위 3D)의 자리: 캔버스 기준 화면 픽셀 { left, top, right, bottom }, 없으면 null */
  function previewRect(plan) {
    if (typeof document === 'undefined' || !plan || !plan.canvas) return null;
    const b = document.getElementById('dsPreview');
    if (!b || b.hidden) return null;
    const cr = plan.canvas.getBoundingClientRect(), r = b.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { left: r.left - cr.left, top: r.top - cr.top, right: r.right - cr.left, bottom: r.bottom - cr.top };
  }
  /** 값으로 만든 설계에서 축 하나(0 폭·1 깊이·2 높이)의 전체 크기를 정하는 값 이름 ('W'·'D'·'T'·'H').
      그 값이 실제 전체 크기와 같을 때만 (주방처럼 값과 전체 크기가 다르면 null) */
  function sizeParam(el, ax, B = D().build(el)) {
    if (!el || el.kind === 'model' || el.kind === 'free') return null;
    const K = D().KINDS[el.kind];
    if (!K) return null;
    const k = ['W', el.kind === 'archwall' ? 'T' : 'D', 'H'][ax], size = [B.size.w, B.size.d, B.size.h][ax];
    return K.fields.some((f) => f.k === k && (!f.when || f.when(el.p || {}, el))) && Math.abs((Number(el.p && el.p[k]) || 0) - size) < 1.5 ? k : null;
  }

  /** 도면 캔버스에 지금 설계물을 그림 (설계 모드) */
  function scene(plan) {
    const el = D().current();
    const ctx = plan.ctx;
    if (el && App.design3d && App.design3d.active()) { tapDims = []; return; } // 입체: 3D 작업 화면이 덮음
    tapDims = [];
    if (!el) return; // 설계물이 없으면 가운데 안내 카드가 뜸 (design-ui)
    if (el.kind !== 'model' && !D().build(el).parts.length) { // 빈 자유 설계: 넣는 법만 화면 가운데에
      App.draw.screenTransform(plan);
      const cx = plan.width / 2, cy = (plan.height - ((plan.insets && plan.insets.bottom) || 0)) / 2;
      ctx.fillStyle = plan.colors.fg || INK; ctx.font = `700 16px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('부재가 없습니다', cx, cy - 34);
      ctx.fillStyle = plan.colors.fgMuted || MUTE; ctx.font = `500 13px ${FONT}`;
      ctx.fillText('아래 +가로판 · +세로판 · +막대를 눌러 넣으세요', cx, cy - 6);
      ctx.fillText('(판·막대 도구로 끌어서 그려도 됩니다)', cx, cy + 16);
      return;
    }
    App.draw.worldTransform(plan);
    const px = 1 / plan.view.scale, view = viewNow(), sel = App.designUI ? App.designUI.selected() : null;
    const L = drawSheet(ctx, el, { px, sel, view, caption: view === 'all', hidden: App.current.designHidden !== false, dims: App.current.designDims !== false, doors: App.current.designDoors !== false });
    // 그림 하나를 볼 때: 고른 부재의 크기·자리 치수 (눌러서 숫자로 고침)
    const q = sel && el.kind !== 'model' && ORTHO.includes(view) ? L.B.parts.find((x) => x.id === sel && !x.halo) : null;
    if (q && App.current.designDims !== false) tapDims = drawPartDims(ctx, L, view, q, px).map((t) => ({ ...t, view, id: q.id }));
    // 아무것도 안 골랐으면: 값으로 만든 설계의 전체 치수 글자를 눌러 폭·깊이·높이 값을 고침
    if (!sel && L.overall && L.overall.length && App.current.designDims !== false) {
      ctx.font = `600 ${11.5 * px}px ${FONT}`;
      L.overall.forEach((d) => {
        const k = sizeParam(el, d.ax, L.B);
        if (!k) return;
        const half = Math.max(ctx.measureText(fmt(d.v)).width / 2 + 6 * px, 22 * px);
        const r = d.horiz ? { x0: d.x - half, x1: d.x + half, y0: d.y - 20 * px, y1: d.y + 6 * px } : { x0: d.x - 15 * px, x1: d.x + 8 * px, y0: d.y - half, y1: d.y + half };
        tapDims.push({ key: 'param', k, ax: d.ax, v: d.v, view, id: '@', r });
      });
    }
    // 제목: 이름과 전체 크기 — 가장 위에 있는 그림보다 화면 픽셀로 일정하게 위에 (작게 봐도 그림과 겹치지 않게)
    const one = view !== 'all', vx = one ? L.views[view].x : 0, compact = compactOf(plan);
    const tx = vx - (view === 'iso' ? 18 : EDGE.l - 6) * px, right = plan.view.worldRect(plan.width, plan.height).maxX - ((plan.insets && plan.insets.right) || 0) * px;
    const drawTop = one ? L.views[view].y : Math.min(L.views.top.y, L.views.iso.y);
    const P = previewRect(plan);
    const sizeFull = `폭 ${fmt(L.s.w)} × 깊이 ${fmt(L.s.d)} × 높이 ${fmt(L.s.h)} mm`, sizeShort = `${fmt(L.s.w)} × ${fmt(L.s.d)} × ${fmt(L.s.h)} mm`;
    ctx.textAlign = 'left';
    if (compact) {
      // 좁은 화면: 한 줄 ‘이름 폭 × 깊이 × 높이’. 부재를 골라 그 치수가 이 자리에 나오면 제목은 쉼
      if (q && App.current.designDims !== false) return;
      const y = drawTop - 9 * px, sx0 = plan.view.toScreen(tx, 0).x, sy = plan.view.toScreen(0, y).y;
      let room = (right - tx) / px - 8;
      if (P && sy > P.top - 4 && sy - 16 < P.bottom + 4) room = Math.min(room, P.left - sx0 - 8); // 미리보기 옆이면 그 앞까지
      room = Math.max(90, room);
      ctx.textBaseline = 'alphabetic';
      ctx.font = `500 ${11.5 * px}px ${FONT}`;
      const sizeText = ctx.measureText(sizeShort).width / px <= room * 0.62 ? sizeShort : '';
      const sw = sizeText ? ctx.measureText(sizeText).width / px + 8 : 0;
      ctx.font = `700 ${14 * px}px ${FONT}`;
      let name = el.name || '설계';
      while (name.length > 2 && ctx.measureText(name).width / px > room - sw) name = `${name.slice(0, -2)}…`;
      ctx.fillStyle = plan.colors.fg || INK;
      ctx.fillText(name, tx, y);
      if (sizeText) { const nw = ctx.measureText(name).width; ctx.fillStyle = MUTE; ctx.font = `500 ${11.5 * px}px ${FONT}`; ctx.fillText(sizeText, tx + nw + 8 * px, y); }
      return;
    }
    // 넓은 화면: 이름 · 크기 · 마감사양(화면 폭에 맞춰 여러 줄, 전체 미리보기가 떠 있으면 그 앞까지)
    let room = (right - tx) / px - 12;
    if (P) room = Math.min(room, P.left - plan.view.toScreen(tx, 0).x - 12);
    const specs = specLines(L, Math.max(160, room));
    // 그림 하나를 볼 때는 고른 부재의 치수가 그림 위에 붙으므로 제목을 그만큼 더 위로
    const top = drawTop - (one && view !== 'iso' ? PART_GAP : 0) * px, th = TITLE_H + 17 * specs.length;
    ctx.fillStyle = plan.colors.fg || INK; ctx.font = `700 ${15 * px}px ${FONT}`; ctx.textBaseline = 'top';
    ctx.fillText(el.name || '설계', tx, top - th * px);
    ctx.fillStyle = MUTE; ctx.font = `500 ${11.5 * px}px ${FONT}`;
    let sizeLine = `${sizeFull} · 치수 단위 mm`;
    if (ctx.measureText(sizeLine).width / px > Math.max(160, room)) sizeLine = sizeFull;
    if (ctx.measureText(sizeLine).width / px > Math.max(160, room)) sizeLine = sizeShort;
    ctx.fillText(sizeLine, tx, top - (th - 21) * px);
    specs.forEach((line, i) => ctx.fillText(line, tx, top - (th - 38 - 17 * i) * px));
  }
  const specOf = (L) => (L.B.spec && L.B.spec.length ? L.B.spec.join(' · ') : '');
  /** 제목 줄들이 차지하는 높이 (화면 픽셀): 마감사양이 있으면 한 줄 더 */
  let meter = null;
  /** 마감사양을 폭(화면 픽셀)에 맞춰 줄로 나눔: ‘ · ’에서 끊음 */
  function specLines(L, maxPx) {
    const items = L.B.spec && L.B.spec.length ? L.B.spec : [];
    if (!items.length) return [];
    if (!meter && typeof document !== 'undefined') { meter = document.createElement('canvas').getContext('2d'); }
    const wide = (s) => { if (!meter) return s.length * 8; meter.font = `500 11.5px ${FONT}`; return meter.measureText(s).width; };
    const lines = [];
    let cur = '마감사양 — ';
    // 한 항목이 폭보다 길면 띄어쓰기에서 끊음 (미리보기·화면 끝을 넘지 않게)
    const push = (text) => {
      let t = text;
      while (wide(t) > maxPx && t.includes(' ')) {
        const words = t.split(' ');
        let head = words.shift();
        while (words.length && wide(`${head} ${words[0]}`) <= maxPx) head += ` ${words.shift()}`;
        if (!words.length) break;
        lines.push(head); t = words.join(' ');
      }
      return t;
    };
    items.forEach((it, i) => {
      const add = (cur === '마감사양 — ' || cur === '' ? '' : ' · ') + it;
      if (cur !== '마감사양 — ' && cur !== '' && wide(cur + add) > maxPx) { lines.push(cur); cur = it; } else cur += add;
      cur = push(cur);
      if (i === items.length - 1) lines.push(cur);
    });
    return lines.slice(0, 4);
  }
  const titleH = (L, maxPx = 4000) => TITLE_H + 17 * specLines(L, maxPx).length;
  const TITLE_H = 52; // 제목 두 줄이 차지하는 높이 (화면 픽셀)
  const PART_GAP = 34; // 그림 하나를 볼 때 그림 위에 고른 부재 치수가 들어갈 자리 (화면 픽셀)
  const EDGE = { l: 76, r: 34, t: TITLE_H + 6, b: 98 }; // 그림 둘레에 치수선·제목·이름이 차지하는 자리 (화면 픽셀)
  /* 좁거나 낮은 화면(휴대폰): 제목은 한 줄(고른 부재의 치수와 같은 자리를 나눠 씀), 마감사양·그림 이름은 빼고 둘레를 줄여 도면을 크게 */
  const BAND = 30;       // 좁은 화면: 그림 위 한 줄 (제목, 부재를 고르면 그 부재의 치수)
  const BOTTOM1 = 68;    // 그림 하나를 볼 때 아래 치수 두 줄 (그림 이름은 위쪽 단추가 알려 주므로 뺌)
  const compactOf = (plan) => !!plan && (plan.width <= 560 || plan.height <= 520);
  /** 화면 맞춤의 바깥 여백 (화면 픽셀): 좁은 화면은 8, 넓으면 화면의 8%(48까지) */
  const padOf = (plan) => (compactOf(plan) ? 8 : Math.min(48, Math.min(plan.width, plan.height) * 0.08));
  /** 그림 둘레에 둘 자리 (화면 픽셀): { l, r, t, b }. nSpec: 마감사양 줄 수 (넓은 화면만) */
  function edgesOf(plan, view, nSpec = 0, lifted = false) {
    const c = compactOf(plan), one = view !== 'all', ortho = one && view !== 'iso';
    if (view === 'iso') return { l: 24, r: 24, t: c ? BAND : EDGE.t + 17 * nSpec, b: 44 };
    const E = {
      l: EDGE.l,
      r: ortho ? (c ? 46 : EDGE.r + 30) : EDGE.r,                     // 고른 부재의 세로 치수가 오른쪽에 붙음
      t: c ? BAND : EDGE.t + 17 * nSpec + (ortho ? PART_GAP : 0),     // 제목 (+ 고른 부재의 가로 치수)
      b: one ? BOTTOM1 : EDGE.b,
    };
    if (view === 'side' && lifted) E.r += 60;                         // ‘바닥에서 500’ 글
    return E;
  }

  /** 종이 좌표의 점이 어느 그림의 어느 부재 위인지. 돌려주는 값: { view, part, at: [a, b](그 그림의 두 축 값, 부재 좌표) } 또는 { view, part: null, at } 또는 null */
  const inPoly = (poly, pt) => {
    let r = false;
    for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
      const [xa, ya] = poly[a], [xb, yb] = poly[b];
      if ((ya > pt.y) !== (yb > pt.y) && pt.x < ((xb - xa) * (pt.y - ya)) / (yb - ya) + xa) r = !r;
    }
    return r;
  };
  /** 점에서 다각형 둘레까지 거리 (얇은 부재를 손가락으로 고르기 쉽게) */
  const edgeDist = (poly, pt) => {
    let best = Infinity;
    for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
      const [xa, ya] = poly[b], [xb, yb] = poly[a], dx = xb - xa, dy = yb - ya, l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((pt.x - xa) * dx + (pt.y - ya) * dy) / l2)) : 0;
      best = Math.min(best, Math.hypot(pt.x - (xa + t * dx), pt.y - (ya + t * dy)));
    }
    return best;
  };
  /** 종이 좌표의 점이 어느 그림의 어느 부재 위인지. only: 볼 그림 ('all'이면 세 그림 중 들어간 곳, 'iso'면 입체도의 보이는 면).
      near: 부재 밖이어도 이만큼(mm) 안이면 가장 가까운 부재 (얇은 판·막대를 손가락으로).
      돌려주는 값: { view, part, at: [a, b](그 그림의 두 축 값, 부재 좌표; 입체도는 null) } 또는 { view, part: null, at } 또는 null */
  function hit(el, pt, pad = 0, only = viewNow(), near = 0) {
    if (!el || el.kind === 'model') return null;
    const L = layout(el), V = L.views, m = L.min;
    const vis = App.current && App.current.designDoors === false ? (q) => !q.door : null;
    const inside = (v) => pt.x >= v.x - pad && pt.x <= v.x + v.w + pad && pt.y >= v.y - pad && pt.y <= v.y + v.h + pad;
    // 앞에 있는 것부터: 그 안이거나 둘레가 가까우면 (앞 문짝 안을 누르면 문짝, 뒤판 위에서 선반 가까이를 누르면 선반)
    const pick = (list) => {
      for (let i = list.length - 1; i >= 0; i--) if (inPoly(list[i].poly, pt) || (near > 0 && edgeDist(list[i].poly, pt) < near)) return list[i].q;
      return null;
    };
    if (only === 'iso') {
      if (!inside({ x: V.iso.x - near, y: V.iso.y - near, w: V.iso.w + near * 2, h: V.iso.h + near * 2 })) return null;
      return { view: 'iso', part: pick(isoFaces(L, vis)), at: null };
    }
    const view = (only === 'all' || !ORTHO.includes(only) ? ORTHO : [only]).find((k) => inside(V[k]) || (near > 0 && inside({ x: V[k].x - near, y: V[k].y - near, w: V[k].w + near * 2, h: V[k].h + near * 2 })));
    if (!view) return null;
    const at = view === 'front' ? [pt.x + m[0], -pt.y + m[2]] : view === 'top' ? [pt.x + m[0], -(pt.y + L.s.h + L.G) + m[1]] : [pt.x - L.s.w - L.G + m[1], -pt.y + m[2]];
    return { view, part: pick(orthoShapes(L, view, vis)), at };
  }
  /** 점 아래에 겹쳐 있는 부재들 (앞에 있는 것부터) — 같은 자리를 다시 눌러 뒤 부재를 고를 때 */
  function hitAll(el, pt, only = viewNow(), near = 0) {
    if (!el || el.kind === 'model') return [];
    const L = layout(el), V = L.views;
    const vis = App.current && App.current.designDoors === false ? (q) => !q.door : null;
    const inside = (v) => pt.x >= v.x - near && pt.x <= v.x + v.w + near && pt.y >= v.y - near && pt.y <= v.y + v.h + near;
    const view = (only === 'all' || !ORTHO.includes(only) ? ORTHO : [only]).find((k) => inside(V[k]));
    if (!view) return [];
    const list = orthoShapes(L, view, vis), out = [];
    for (let i = list.length - 1; i >= 0; i--) if (inPoly(list[i].poly, pt) || (near > 0 && edgeDist(list[i].poly, pt) < near)) out.push(list[i].q);
    return out;
  }
  /** 그림마다 두 축이 부재 좌표의 어느 축인지: [가로 축, 세로 축] (0 = X, 1 = Y, 2 = Z) */
  const AXES = { front: [0, 2], top: [0, 1], side: [1, 2] };
  /** 부재 좌표의 두 축 값 → 종이 좌표 (끌 때 미리보기) */
  function toPaper(el, view, a, b) {
    const L = layout(el), m = L.min;
    if (view === 'front') return { x: a - m[0], y: -(b - m[2]) };
    if (view === 'top') return { x: a - m[0], y: -(L.s.h + L.G) - (b - m[1]) };
    return { x: L.s.w + L.G + (a - m[1]), y: -(b - m[2]) };
  }
  /** 화면 맞춤에 쓰는 범위. 치수선·제목이 들어갈 둘레를 화면 픽셀로 잡음 (화면이 작을수록 mm로는 더 넓게).
      빠른 막대·전체 미리보기를 피하되, 그러면 도면이 너무 작아질 때는 차례로 양보함 (미리보기 → 막대 → 제목 자리) */
  function bounds(el = D().current(), view = viewNow()) {
    if (!el) return null;
    if (el.kind !== 'model' && !D().build(el).parts.length) return { minX: -300, minY: -1300, maxX: 1300, maxY: 300 }; // 빈 자유 설계: 끌어 그리기 알맞은 배율 (1m 남짓)
    const L = el.kind === 'model' ? modelLayout(el) : layout(el), V = L.views;
    const plan = App.plan, base = el.kind === 'model' ? 0 : L.lift;
    // 그림 자리(종이 mm)
    let x0 = 0, x1 = Math.max(V.side.x + V.side.w, V.iso.x + V.iso.w), top = Math.min(V.top.y, V.iso.y), bot = base;
    if (view !== 'all' && V[view]) {
      const v = V[view];
      x0 = v.x; x1 = v.x + v.w; top = v.y; bot = v.y + v.h + (view === 'front' || view === 'side' ? base : 0);
    }
    const W = Math.max(1, x1 - x0), H = Math.max(1, bot - top);
    if (!plan || !(plan.width > 0)) return view === 'all' ? L.rect : { minX: x0 - W * 0.3, minY: top - H * 0.3, maxX: x1 + W * 0.3, maxY: bot + H * 0.3 };
    const i = plan.insets || { top: 0, right: 0, bottom: 0, left: 0 }, pad = padOf(plan), compact = compactOf(plan);
    const vw = plan.width - i.left - i.right - pad * 2, vh = plan.height - i.top - i.bottom - pad * 2;
    const P = previewRect(plan); // 전체 미리보기가 떠 있으면 제목은 그 앞에서 줄바꿈 (scene과 같은 폭)
    const nSpec = compact ? 0 : specLines(L, Math.max(160, P ? Math.min(vw - 18, P.left - (i.left + pad) - 18) : vw - 18)).length;
    const E = edgesOf(plan, view, nSpec, base > 0);
    // 빠른 막대(고른 부재·부재 넣기)가 도면 아래쪽을 가리는 만큼 더 비움
    let qb = 0;
    const q = typeof document !== 'undefined' ? document.getElementById('dsQuick') : null;
    if (q && !q.hidden && plan.canvas) { const cr = plan.canvas.getBoundingClientRect(), r = q.getBoundingClientRect(); if (r.height) qb = Math.max(0, Math.min(cr.height * 0.4, cr.bottom - r.top - (i.bottom || 0) - pad + 8)); }
    const kOf = (dw, dh, e = E, bar = qb) => Math.min((vw - e.l - e.r - dw) / W, (vh - e.t - e.b - bar - dh) / H);
    let k = kOf(0, 0), dw = 0, dh = 0, Eu = E, bar = qb;
    // 전체 미리보기(오른쪽 위 3D)를 피함: 그 아래로 내리거나(dh) 왼쪽으로 비키거나(dw) — 도면이 더 크게 보이는 쪽.
    // 넓은 화면은 제목 옆(제목 줄 높이만큼)에는 그냥 두고, 비슷하면 아래로 내림
    if (P) {
      const pw = Math.max(0, plan.width - (i.right || 0) - pad - P.left + 8);
      const freeAbove = compact ? 0 : E.t - (view !== 'all' && view !== 'iso' ? PART_GAP : 0); // 제목만 있는 높이 (고른 부재 치수 자리는 빼고)
      const ph = Math.max(0, P.bottom + 8 - ((i.top || 0) + pad) - freeAbove);
      if (pw > 0 && ph > 0) { const kR = kOf(pw, 0), kT = kOf(0, ph); if (kT > 0 && kT >= kR * (compact ? 1 : 0.85)) { k = kT; dh = ph; } else { k = kR; dw = pw; } }
      // 비키면 도면이 너무 작아질 때(크게 키운 미리보기 따위)는 비키지 않고 미리보기가 잠깐 위에 떠 있게
      const k0 = kOf(0, 0);
      if (k < k0 * 0.6) { k = k0; dw = 0; dh = 0; }
    }
    // 그래도 도면이 너무 작으면(낮은 화면·서랍을 연 휴대폰): 막대 자리, 그다음 제목 자리를 내줌
    const small = (kk) => !(kk > 0) || H * kk < Math.min(110, vh * 0.3);
    if (small(k) && bar > 0) { bar = 0; dw = 0; dh = 0; k = kOf(0, 0, E, 0); }
    if (small(k)) { Eu = { ...E, t: Math.min(E.t, 10) }; dw = 0; dh = 0; bar = 0; k = kOf(0, 0, Eu, 0); }
    if (!(k > 0) || !isFinite(k)) return L.rect;
    return { minX: x0 - Eu.l / k, minY: top - (Eu.t + dh) / k, maxX: x1 + (Eu.r + dw) / k, maxY: bot + (Eu.b + bar) / k };
  }
  /** 지금 보는 그림(들)이 종이에서 차지하는 네모 (mm) — 화면에 남아 있는지 볼 때 */
  function viewRect(el, view = viewNow()) {
    if (!el) return null;
    const L = el.kind === 'model' ? modelLayout(el) : layout(el), V = L.views;
    if (view !== 'all' && V[view]) { const v = V[view]; return { minX: v.x, minY: v.y, maxX: v.x + v.w, maxY: v.y + v.h }; }
    return { minX: 0, minY: Math.min(V.top.y, V.iso.y), maxX: Math.max(V.side.x + V.side.w, V.iso.x + V.iso.w), maxY: 0 };
  }
  /** 그림 네 개가 차지하는 자리 (mm): x는 0~W, y는 top~0. 치수선·이름이 차지하는 둘레(EDGE, 화면 픽셀)는 따로 */
  function frame(el) {
    const L = el.kind === 'model' ? modelLayout(el) : layout(el), V = L.views;
    return { W: Math.max(V.side.x + V.side.w, V.iso.x + V.iso.w), top: Math.min(V.top.y, V.iso.y), base: el.kind === 'model' ? 0 : L.lift, L };
  }
  /** DXF·시험용: 세 그림의 테두리 선과 치수 값. { lines: [{ view, n, pts }], size } */
  function outlines(el, o = {}) {
    const L = layout(el), out = [], vis = o.doors === false ? (q) => !q.door : null;
    ['front', 'top', 'side'].forEach((view) => orthoShapes(L, view, vis).forEach(({ q, poly }) => out.push({ view, n: q.n, m: q.m, pts: poly, ...(q.role === 'lite' ? { lite: true } : {}) })));
    isoFaces(L, vis).forEach(({ q, poly }) => out.push({ view: 'iso', n: q.n, m: q.m, pts: poly, ...(q.role === 'lite' ? { lite: true } : {}) }));
    // 모듈 이름표: 종이 좌표의 가운데 자리
    const labels = (L.B.labels || []).map((lb) => { const off = lb.view === 'side' ? L.s.w + L.G - L.min[1] : -L.min[0]; return { text: lb.text, x: (lb.a0 + lb.a1) / 2 + off, y: -((lb.z0 + lb.z1) / 2 - L.min[2]), w: lb.a1 - lb.a0 }; });
    return { lines: out, size: L.s, views: L.views, chains: { x: many(chain(L, 'x')), y: many(chain(L, 'y')), z: many(chain(L, 'z')) }, sideChain: !!(L.B.chain && L.B.chain.y), lift: L.B.min[2], labels, spec: L.B.spec || [] };
  }

  App.designDraw = {
    layout, drawSheet, scene, hit, toPaper, bounds, frame, EDGE, outlines, specOf, specLines, titleH, AXES, fmt, modelShots, isoFaces, orthoShapes, chain,
    VIEWS, viewNow, partSpan, paperOf, sizeParam, previewRect, compactOf, pad: padOf, edgesOf, viewRect, hitAll,
    /** 화면에 그린 고른 부재 치수 글자 자리 (눌러서 고치기) */
    tapDims: () => tapDims,
    /** 끄는 동안 그림 기준을 붙박음 (el을 주면 지금 기준으로, null이면 풂) */
    freeze(el) { if (!el) { frozen = null; return; } const L = layout(el); frozen = { id: el.id, min: L.min.slice(), s: { ...L.s } }; },
  };
})();
