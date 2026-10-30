/* 치수 자동: 안목(면에서 면까지), 벽 중심, 바깥 치수 한 번에.
   벽 외곽선(joins.js, T자·ㄱ자 이음 반영)을 기준으로 잰다.
   - 안목: 빈 곳(방 안)을 누르면 그 자리에서 가로·세로로 양쪽 벽 면까지.
           벽을 누르면 누른 쪽 면을 따라 양쪽에 붙은 벽 면까지 (붙은 벽이 없으면 그 면 끝까지)
   - 벽 중심: 벽을 누르면 그 벽 중심선에서 이어진 벽 중심(또는 벽 끝)까지, 벽 바깥쪽에 표시
   - 바깥 치수: 도면 네 바깥쪽에 벽 중심 사이 연속 치수와 전체 치수. 다시 넣으면 새로 맞춤 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const G = App.geom;

  const REACH = 50000;    // 안목을 찾는 최대 거리 (50m)
  const AUTO = 'outside'; // 바깥 치수 표시 (다시 넣을 때 지울 것)
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const dot = (a, b) => a.x * b.x + a.y * b.y;
  const add = (p, v, k = 1) => ({ x: p.x + v.x * k, y: p.y + v.y * k });
  const neg = (v) => ({ x: -v.x, y: -v.y });

  function walls() {
    const out = [];
    for (const el of App.doc.all()) {
      if (el.type === 'wall' && App.layers.visible(el) && G.dist(el.start, el.end) >= 1) out.push(el);
    }
    return out;
  }

  /** 반직선 o + t·dir 이 벽 외곽선에 처음 닿는 거리. 안 닿으면 Infinity */
  function rayHit(o, dir, list, excludeId) {
    let best = Infinity;
    for (const w of list) {
      if (w.id === excludeId) continue;
      const pts = App.joins.outline(w).pts;
      for (let i = 0; i < 4; i++) {
        const a = pts[i], e = sub(pts[(i + 1) % 4], a);
        const den = G.cross(dir, e);
        if (Math.abs(den) < 1e-12) continue;
        const ao = sub(a, o);
        const t = G.cross(ao, e) / den;
        const u = G.cross(ao, dir) / den;
        if (t > 1e-6 && u >= -1e-9 && u <= 1 + 1e-9 && t < best) best = t;
      }
    }
    return best;
  }

  /** 점이 벽 위(외곽선 안 또는 tol 안)면 그 벽 */
  function wallAt(p, list, tol) {
    let best = null, bestD = tol;
    for (const w of list) {
      const pts = App.joins.outline(w).pts;
      if (G.pointInPolygon(p, pts)) return w;
      for (let i = 0; i < 4; i++) {
        const d = G.closestOnSegment(p, pts[i], pts[(i + 1) % 4]).dist;
        if (d <= bestD) {
          bestD = d;
          best = w;
        }
      }
    }
    return best;
  }

  /** 치수선을 두 점 기준 side 쪽으로 gap만큼 띄우는 offset 값 */
  function offsetToward(a, b, side, gap) {
    const n = G.perp(G.unit(sub(b, a)));
    return dot(n, side) >= 0 ? gap : -gap;
  }

  /** 왼쪽→오른쪽, 위→아래로 읽히게 두 점 순서를 맞춤 */
  function ordered(a, b) {
    const d = sub(b, a);
    return Math.abs(d.x) >= Math.abs(d.y) ? (d.x >= 0 ? [a, b] : [b, a]) : (d.y >= 0 ? [a, b] : [b, a]);
  }

  /** 벽 한쪽 면의 안목: 그 면을 따라 양쪽에 붙은 벽 면까지 (없으면 이 면 끝까지) */
  function faceSpan(w, p, list, gap) {
    const d = G.unit(sub(w.end, w.start)), n = G.perp(d);
    const s = dot(sub(p, w.start), n) >= 0 ? 1 : -1;
    const pts = App.joins.outline(w).pts;
    const f0 = s > 0 ? pts[0] : pts[3], f1 = s > 0 ? pts[1] : pts[2];
    const len = Math.max(0, dot(sub(f1, f0), d));
    const q = add(f0, d, G.clamp(dot(sub(p, f0), d), 0, len));
    const out = add(q, n, s); // 면 밖으로 1mm에서 면을 따라 양쪽으로
    const hp = rayHit(out, d, list, w.id), hm = rayHit(out, neg(d), list, w.id);
    const ep = Math.max(0, dot(sub(f1, q), d)), em = Math.max(0, dot(sub(q, f0), d));
    const [a, b] = ordered(add(q, d, -Math.min(hm, em)), add(q, d, Math.min(hp, ep)));
    if (G.dist(a, b) < 1) return [];
    return [{ start: a, end: b, offset: offsetToward(a, b, { x: n.x * s, y: n.y * s }, gap), kind: '안목' }];
  }

  /** 빈 곳에서 가로·세로 안목. 가까운 벽이 기울어 있으면 그 방향으로.
      잰 자리는 누른 곳이고, 두 치수선은 위·왼쪽으로 조금 비켜 그려 글자가 서로(그리고 방 이름과) 겹치지 않게 */
  function spaceSpans(p, list, shift) {
    let u = { x: 1, y: 0 }, nearest = Infinity;
    list.forEach((w) => {
      const c = G.closestOnSegment(p, w.start, w.end);
      if (c.dist < nearest) {
        nearest = c.dist;
        u = G.unit(sub(w.end, w.start));
      }
    });
    if (Math.abs(u.x) < Math.abs(u.y)) u = G.perp(u);
    if (u.x < 0) u = neg(u);
    const out = [];
    [[u, neg(G.perp(u))], [G.perp(u), neg(u)]].forEach(([dir, away]) => {
      const hp = rayHit(p, dir, list), hm = rayHit(p, neg(dir), list);
      if (hp < REACH && hm < REACH) {
        const [a, b] = ordered(add(p, dir, -hm), add(p, dir, hp));
        out.push({ start: a, end: b, offset: offsetToward(a, b, away, shift), kind: '안목' });
      }
    });
    return out;
  }

  /** 벽 중심선에서 누른 곳을 사이에 둔 이음(벽 끝, 다른 벽이 붙은 곳)까지. 벽 바깥쪽에 표시 */
  function centerSpan(w, p, list, gap) {
    const L = G.dist(w.start, w.end);
    const d = G.unit(sub(w.end, w.start)), n = G.perp(d);
    const stops = [0, L];
    list.forEach((o) => {
      if (o === w) return;
      [o.start, o.end].forEach((q) => {
        const c = G.closestOnSegment(q, w.start, w.end);
        if (c.dist <= 1 && c.t * L > 1 && (1 - c.t) * L > 1) stops.push(c.t * L);
      });
    });
    stops.sort((x, y) => x - y);
    const at = G.clamp(dot(sub(p, w.start), d), 0, L);
    let i = 0;
    while (i < stops.length - 2 && stops[i + 1] < at) i++;
    const [a, b] = ordered(add(w.start, d, stops[i]), add(w.start, d, stops[i + 1]));
    if (G.dist(a, b) < 1) return [];
    const s = dot(sub(p, w.start), n) >= 0 ? 1 : -1;
    return [{ start: a, end: b, offset: offsetToward(a, b, { x: n.x * s, y: n.y * s }, w.thickness / 2 + gap), kind: '벽 중심' }];
  }

  /** 누른 자리에서 만들 치수들 { start, end, offset, kind } */
  function at(p, mode, touch) {
    const list = walls();
    if (!list.length) return [];
    const scale = App.plan.view.scale;
    const gap = G.clamp(28 / scale, 60, 1000); // 치수선을 면에서 띄우는 거리: 화면에서 28px 안팎
    const w = wallAt(p, list, App.snap.radius(touch) * 0.5);
    if (mode === 'center') return w ? centerSpan(w, p, list, gap) : [];
    return w ? faceSpan(w, p, list, gap) : spaceSpans(p, list, G.clamp(40 / scale, 60, 1500));
  }

  function addDims(specs, label, extra = {}) {
    const T = App.model.TYPES.dim;
    const ids = [];
    App.doc.transact(label, () => specs.forEach((s) => {
      const el = { ...T.create(s.start, s.end), offset: s.offset || 0, ...extra };
      App.doc.add(el);
      ids.push(el.id);
    }));
    return ids;
  }

  /** 누른 자리에 치수를 만들고 결과를 알림. 만든 개수 */
  function create(p, mode, touch) {
    const specs = at(p, mode, touch);
    if (!specs.length) {
      App.ui.hint(mode === 'center' ? '벽을 누르면 그 벽의 중심 치수를 넣습니다.' : '벽 사이 빈 곳이나 벽을 누르세요. 양쪽에 벽이 있어야 잴 수 있습니다.', 3500);
      return 0;
    }
    addDims(specs, `${specs[0].kind} 치수`);
    App.ui.toast(`${specs[0].kind} ${specs.map((s) => App.units.formatLength(G.dist(s.start, s.end))).join(' × ')}`);
    return specs.length;
  }

  /* ── 바깥 치수: 가로·세로 벽만 보고 네 방향 바깥쪽에 연속 치수 + 전체 ── */
  const SIDES = [
    { dir: { x: 0, y: -1 }, horiz: true },  // 위
    { dir: { x: 0, y: 1 }, horiz: true },   // 아래
    { dir: { x: -1, y: 0 }, horiz: false }, // 왼쪽
    { dir: { x: 1, y: 0 }, horiz: false },  // 오른쪽
  ];

  function outsideSpecs(list) {
    const isH = (w) => Math.abs(w.end.y - w.start.y) < 0.5;
    const isV = (w) => Math.abs(w.end.x - w.start.x) < 0.5;
    const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    list.forEach((w) => App.joins.outline(w).pts.forEach((q) => {
      box.minX = Math.min(box.minX, q.x); box.minY = Math.min(box.minY, q.y);
      box.maxX = Math.max(box.maxX, q.x); box.maxY = Math.max(box.maxY, q.y);
    }));
    const gap = Math.max(App.settings.dimTextSize * 3, 450);
    const specs = [];
    SIDES.forEach(({ dir, horiz }) => {
      const along = horiz ? (q) => q.x : (q) => q.y;
      const across = horiz ? (q) => q.y : (q) => q.x;
      // 그 방향 바깥에 드러난 벽 (바깥 면에서 바깥쪽으로 쏜 선이 다른 벽에 안 닿음)
      const exposed = list.filter((w) => (horiz ? isH(w) : isV(w)) && [0.2, 0.5, 0.8].some((k) => {
        const m = { x: w.start.x + (w.end.x - w.start.x) * k, y: w.start.y + (w.end.y - w.start.y) * k };
        return rayHit(add(m, dir, w.thickness / 2 + 1), dir, list, w.id) === Infinity;
      }));
      if (!exposed.length) return;
      const pos = [];
      exposed.forEach((w) => {
        const lo = Math.min(along(w.start), along(w.end)), hi = Math.max(along(w.start), along(w.end));
        pos.push(lo, hi);
        // 이 벽에 끝이 닿은 직각 방향 벽들의 중심 위치
        list.forEach((o) => {
          if (!(horiz ? isV(o) : isH(o))) return;
          [o.start, o.end].forEach((q) => {
            if (Math.abs(across(q) - across(w.start)) <= 1 && along(q) >= lo - 1 && along(q) <= hi + 1) pos.push(along(q));
          });
        });
      });
      pos.sort((x, y) => x - y);
      const stops = pos.filter((v, i) => i === 0 || v - pos[i - 1] > 1);
      if (stops.length < 2) return;
      // 치수를 재는 점은 도면 바깥 테두리 위, 치수선은 그 바깥으로
      const edge = horiz ? (dir.y < 0 ? box.minY : box.maxY) : (dir.x < 0 ? box.minX : box.maxX);
      const pt = (v) => (horiz ? { x: v, y: edge } : { x: edge, y: v });
      for (let i = 0; i + 1 < stops.length; i++) {
        const a = pt(stops[i]), b = pt(stops[i + 1]);
        specs.push({ start: a, end: b, offset: offsetToward(a, b, dir, gap) });
      }
      if (stops.length > 2) {
        const a = pt(stops[0]), b = pt(stops[stops.length - 1]);
        specs.push({ start: a, end: b, offset: offsetToward(a, b, dir, gap * 2) });
      }
    });
    return specs;
  }

  /** 바깥 치수를 (다시) 넣음. 전에 넣은 바깥 치수는 지우고 새로. 한 묶음으로 골라짐 */
  function outside() {
    const list = walls();
    const specs = list.length ? outsideSpecs(list) : [];
    if (!specs.length) {
      App.ui.toast(list.length ? '가로·세로 벽이 없어 바깥 치수를 넣지 못했습니다.' : '벽을 먼저 그리세요. 바깥 치수는 벽을 기준으로 넣습니다.');
      return 0;
    }
    const old = [...App.doc.all()].filter((e) => e.type === 'dim' && e.auto === AUTO).map((e) => e.id);
    App.doc.begin('바깥 치수');
    old.forEach((id) => App.doc.remove(id));
    const T = App.model.TYPES.dim;
    specs.forEach((s) => App.doc.add({ ...T.create(s.start, s.end), offset: s.offset, auto: AUTO, group: 'dims-outside' }));
    App.doc.commit();
    App.selection.prune();
    App.ui.toast(`바깥 치수 ${specs.length}개를 넣었습니다. 벽을 고친 뒤 다시 누르면 새로 맞춥니다.`);
    return specs.length;
  }

  App.dims = { at, create, outside, rayHit };
})();
