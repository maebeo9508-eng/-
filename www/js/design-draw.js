/* 설계도면 그리기: 설계물 하나를 정면도(왼쪽 아래)·평면도(그 위)·우측면도(오른쪽)·입체도(오른쪽 위)로 한 장에 (3각법).
   종이 좌표는 mm, y는 아래로. 도면 캔버스(설계 모드)와 PDF가 같은 그림을 쓴다.
   - 부재는 멀리 있는 것부터 칠해 가려진 선을 지우고(화가 방식), 가려진 선은 옅은 점선으로 다시 그림
   - 치수: 전체 치수와 부재 자리의 연속 치수 (단위 mm)
   - 내려받은 3D 모델은 네 방향에서 그린 그림으로 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif';
  const ISO_K = 0.72, C30 = 0.866;
  const INK = '#2b3138', DIM = '#1c7ed6', MUTE = '#6b7680';
  const D = () => App.design;
  const fmt = (v) => { const r = Math.round(v * 10) / 10; return (Math.abs(r - Math.round(r)) < 0.05 ? Math.round(r) : r).toLocaleString('ko-KR'); };

  /** 종이 배치. 돌려주는 값: { B(부재), G(그림 사이), views: { front, top, side, iso }, rect(전체 범위) } */
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
      return { q, key: near(q, c), poly: curved ? D().outline2(q).map(([x, z]) => P([x, q.y, z])) : q.s === 'bar' ? hull(c.map(P)) : rectOf(c.map(P)) };
    }).sort((a, b) => (a.q.role === 'lite') - (b.q.role === 'lite') || a.key - b.key); // LED 라인은 맨 위에
  }
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
  function drawLabels(ctx, L, px) {
    const m = L.min, s = L.s;
    (L.B.labels || []).forEach((lb) => {
      const side = lb.view === 'side', off = side ? s.w + L.G - m[1] : -m[0];
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

  /** 종이 한 장을 그림. ctx에는 종이 좌표(mm) 변환이 걸려 있어야 함. o: { px(1화면픽셀 = 몇 mm), sel(고른 부재 id), hidden(가려진 선), dims(치수), paper(종이용: 글자를 진하게) } */
  function drawSheet(ctx, el, o = {}) {
    const px = o.px || 1, model = el.kind === 'model';
    const L = model ? modelLayout(el) : layout(el);
    const V = L.views, s = L.s, base = model ? 0 : L.lift;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'butt';
    const caption = (v, extra = '') => {
      ctx.fillStyle = MUTE; ctx.font = `600 ${11 * px}px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(`${v.name}${extra}`, v.x, v.y + v.h + (v === V.front || v === V.side ? base + 80 * px : 10 * px));
    };
    if (model) {
      const pics = modelShots(el);
      ['front', 'top', 'side', 'iso'].forEach((k) => {
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
        shapes.forEach(({ q, poly, shade }) => {
          const sel = o.sel && o.sel === q.id;
          const base = colorOf(q), led = q.role === 'led', lite = q.role === 'lite';
          ctx.beginPath();
          poly.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
          ctx.closePath();
          ctx.fillStyle = sel ? '#ffd8a8' : lite ? '#fab005' : led ? mix('#27313d', iso ? shade * 0.5 : 0) : mix(base, iso ? 0.35 + shade : 0.55);
          ctx.fill();
          ctx.lineWidth = (sel ? 2.2 : 1.1) * px;
          ctx.strokeStyle = sel ? '#e8590c' : lite ? '#e67700' : led ? '#7d8894' : INK;
          ctx.stroke();
        });
      };
      const vis = o.doors === false ? (q) => !q.door : null; // 문짝을 떼고 속을 봄
      ['front', 'top', 'side'].forEach((k) => {
        const shapes = orthoShapes(L, k, vis);
        paint(shapes, false);
        if (o.hidden !== false) {
          ctx.save();
          ctx.globalAlpha = 0.34; ctx.lineWidth = 0.9 * px; ctx.strokeStyle = INK; ctx.setLineDash([5 * px, 4 * px]);
          shapes.forEach(({ poly }) => { ctx.beginPath(); poly.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.stroke(); });
          ctx.restore();
        }
      });
      paint(isoFaces(L, vis), true);
      if (o.dims !== false) drawLabels(ctx, L, px);
    }
    // 바닥선 (정면도·측면도). 떠 있으면 그만큼 아래에 긋고, 아래쪽 치수는 바닥선 밑으로
    ctx.strokeStyle = MUTE; ctx.lineWidth = 1.6 * px; ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(V.front.x - 30 * px, base); ctx.lineTo(V.front.x + V.front.w + 30 * px, base);
    ctx.moveTo(V.side.x - 30 * px, base); ctx.lineTo(V.side.x + V.side.w + 30 * px, base);
    ctx.stroke();
    caption(V.front); caption(V.top); caption(V.side); caption(V.iso, ' (비율만 맞춤)');
    if (o.dims !== false) {
      dimStyle(ctx, px);
      const g1 = 30 * px, g2 = 58 * px;
      const cx = model ? null : many(chain(L, 'x')), cz = model ? null : many(chain(L, 'z')), cy = model ? null : many(chain(L, 'y'));
      // 정면도: 아래 폭, 왼쪽 높이
      if (cx) for (let i = 0; i + 1 < cx.length; i++) dimH(ctx, cx[i], cx[i + 1], base + g1, 0, px);
      dimH(ctx, 0, s.w, base + (cx ? g2 : g1), 0, px);
      if (cz) for (let i = 0; i + 1 < cz.length; i++) dimV(ctx, -cz[i], -cz[i + 1], -g1, 0, px);
      dimV(ctx, 0, -s.h, cz ? -g2 : -g1, 0, px);
      // 평면도: 왼쪽 깊이
      const ty = V.top.y + V.top.h;
      if (cy) for (let i = 0; i + 1 < cy.length; i++) dimV(ctx, ty - cy[i], ty - cy[i + 1], -g1, 0, px);
      dimV(ctx, ty, ty - s.d, cy ? -g2 : -g1, 0, px);
      // 우측면도: 아래 깊이 (ㄱ자 주방처럼 옆줄의 모듈 자리가 있으면 연속 치수도)
      const cyS = !model && L.B.chain && L.B.chain.y && cy && cy.length > 2 ? cy : null;
      if (cyS) for (let i = 0; i + 1 < cyS.length; i++) dimH(ctx, V.side.x + cyS[i], V.side.x + cyS[i + 1], base + g1, 0, px);
      dimH(ctx, V.side.x, V.side.x + s.d, base + (cyS ? g2 : g1), 0, px);
      // 바닥에서 떠 있는 높이: 우측면도 오른쪽에
      if (base > 0) dimV(ctx, 0, base, V.side.x + V.side.w + g1 * 0.7, V.side.x + V.side.w, px, `바닥에서 ${fmt(base)}`, { out: true });
    }
    return L;
  }

  /** 도면 캔버스에 지금 설계물을 그림 (설계 모드) */
  function scene(plan) {
    const el = D().current();
    const ctx = plan.ctx;
    if (!el) {
      App.draw.screenTransform(plan);
      ctx.fillStyle = plan.colors.fgMuted || MUTE; ctx.font = `600 15px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('위쪽 ‘＋ 새 설계’를 눌러 수납장·테이블·각파이프 틀·전광판을 만들어 보세요', plan.width / 2, plan.height / 2);
      return;
    }
    App.draw.worldTransform(plan);
    const px = 1 / plan.view.scale;
    const L = drawSheet(ctx, el, { px, sel: App.designUI ? App.designUI.selected() : null, hidden: App.current.designHidden !== false, dims: App.current.designDims !== false, doors: App.current.designDoors !== false });
    // 제목: 이름과 전체 크기 — 가장 위에 있는 그림보다 화면 픽셀로 일정하게 위에 (작게 봐도 그림과 겹치지 않게)
    // 마감사양은 화면 폭에 맞춰 여러 줄로 (휴대폰에서 오른쪽으로 넘치지 않게)
    const tx = -(EDGE.l - 6) * px, right = plan.view.worldRect(plan.width, plan.height).maxX - ((plan.insets && plan.insets.right) || 0) * px;
    const specs = specLines(L, Math.max(160, (right - tx) / px - 12));
    const top = Math.min(L.views.top.y, L.views.iso.y), th = TITLE_H + 17 * specs.length;
    ctx.fillStyle = plan.colors.fg || INK; ctx.font = `700 ${15 * px}px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(el.name || '설계', -(EDGE.l - 6) * px, top - th * px);
    ctx.fillStyle = MUTE; ctx.font = `500 ${11.5 * px}px ${FONT}`;
    ctx.fillText(`폭 ${fmt(L.s.w)} × 깊이 ${fmt(L.s.d)} × 높이 ${fmt(L.s.h)} mm · 치수 단위 mm`, -(EDGE.l - 6) * px, top - (th - 21) * px);
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
    items.forEach((it, i) => {
      const add = (cur === '마감사양 — ' || cur === '' ? '' : ' · ') + it;
      if (cur !== '마감사양 — ' && cur !== '' && wide(cur + add) > maxPx) { lines.push(cur); cur = it; } else cur += add;
      if (i === items.length - 1) lines.push(cur);
    });
    return lines.slice(0, 4);
  }
  const titleH = (L, maxPx = 4000) => TITLE_H + 17 * specLines(L, maxPx).length;
  const TITLE_H = 52; // 제목 두 줄이 차지하는 높이 (화면 픽셀)
  const EDGE = { l: 76, r: 34, t: TITLE_H + 6, b: 98 }; // 그림 둘레에 치수선·제목·이름이 차지하는 자리 (화면 픽셀)

  /** 종이 좌표의 점이 어느 그림의 어느 부재 위인지. 돌려주는 값: { view, part, at: [a, b](그 그림의 두 축 값, 부재 좌표) } 또는 { view, part: null, at } 또는 null */
  function hit(el, pt, pad = 0) {
    if (!el || el.kind === 'model') return null;
    const L = layout(el), V = L.views, m = L.min;
    const inside = (v) => pt.x >= v.x - pad && pt.x <= v.x + v.w + pad && pt.y >= v.y - pad && pt.y <= v.y + v.h + pad;
    const view = ['front', 'top', 'side'].find((k) => inside(V[k]));
    if (!view) return null;
    const at = view === 'front' ? [pt.x + m[0], -pt.y + m[2]] : view === 'top' ? [pt.x + m[0], -(pt.y + L.s.h + L.G) + m[1]] : [pt.x - L.s.w - L.G + m[1], -pt.y + m[2]];
    const shapes = orthoShapes(L, view, App.current && App.current.designDoors === false ? (q) => !q.door : null);
    for (let i = shapes.length - 1; i >= 0; i--) {
      const poly = shapes[i].poly;
      let inPoly = false;
      for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
        const [xa, ya] = poly[a], [xb, yb] = poly[b];
        if ((ya > pt.y) !== (yb > pt.y) && pt.x < ((xb - xa) * (pt.y - ya)) / (yb - ya) + xa) inPoly = !inPoly;
      }
      if (inPoly) return { view, part: shapes[i].q, at };
    }
    return { view, part: null, at };
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
  /** 화면 맞춤에 쓰는 범위. 치수선·제목·그림 이름이 들어갈 둘레를 화면 픽셀로 잡음 (화면이 작을수록 mm로는 더 넓게) */
  function bounds(el = D().current()) {
    if (!el) return null;
    const L = el.kind === 'model' ? modelLayout(el) : layout(el), V = L.views;
    const plan = App.plan;
    const W = Math.max(V.side.x + V.side.w, V.iso.x + V.iso.w), top = Math.min(V.top.y, V.iso.y), base = el.kind === 'model' ? 0 : L.lift, H = -top + base;
    if (!plan || !(plan.width > 0)) return L.rect;
    const i = plan.insets || { top: 0, right: 0, bottom: 0, left: 0 }, pad = Math.min(48, Math.min(plan.width, plan.height) * 0.08);
    const vw = plan.width - i.left - i.right - pad * 2, vh = plan.height - i.top - i.bottom - pad * 2;
    const nSpec = specLines(L, Math.max(160, vw - 18)).length;
    const k = Math.min((vw - EDGE.l - EDGE.r) / W, (vh - EDGE.t - 17 * nSpec - EDGE.b) / H);
    if (!(k > 0) || !isFinite(k)) return L.rect;
    return { minX: -EDGE.l / k, minY: top - (EDGE.t + 17 * nSpec) / k, maxX: W + EDGE.r / k, maxY: base + EDGE.b / k };
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
    /** 끄는 동안 그림 기준을 붙박음 (el을 주면 지금 기준으로, null이면 풂) */
    freeze(el) { if (!el) { frozen = null; return; } const L = layout(el); frozen = { id: el.id, min: L.min.slice(), s: { ...L.s } }; },
  };
})();
