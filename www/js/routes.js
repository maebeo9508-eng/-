/* 동선: 길이·걸리는 시간, 동선 체크(통로 폭 안에 물건·벽이 걸리는 곳 찾기), 3D 둘러보기의 출발 자리.
   장애물: 가구·조감도 물건(텐트·현수막처럼 지나갈 수 있는 것은 뺌), 기둥, 벽(문 자리는 뚫린 것으로 봄) */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const G = App.geom;

  // speed: 걷는(달리는) 빠르기 m/s, width: 기본 통로 폭 mm
  const KINDS = [
    { kind: '관람객', color: '#1c7ed6', width: 1500, speed: 1.2 },
    { kind: 'VIP', color: '#b7791f', width: 1500, speed: 1.2 },
    { kind: '스태프', color: '#2f9e44', width: 1200, speed: 1.3 },
    { kind: '차량', color: '#495057', width: 3500, speed: 2.8 },
    { kind: '비상 대피', color: '#e03131', width: 1200, speed: 1.3 },
  ];
  const STEP = 150; // 동선을 따라 이 간격(mm)으로 살핌

  const def = (kind) => KINDS.find((k) => k.kind === kind) || KINDS[0];
  const length = (r) => App.model.TYPES.route.length(r);

  /** 걸리는 시간(초) */
  const time = (r) => length(r) / 1000 / def(r.kind).speed;
  function timeText(sec) {
    const s = Math.max(1, Math.round(sec));
    if (s < 60) return `약 ${s}초`;
    const m = Math.floor(s / 60), rest = Math.round((s % 60) / 10) * 10;
    return rest ? (rest === 60 ? `약 ${m + 1}분` : `약 ${m}분 ${rest}초`) : `약 ${m}분`;
  }

  /* ── 장애물 ── 각 장애물: { name, id, dist(p) → 가장자리까지 거리(안쪽이면 0 이하), cross(a, b) → 선분이 뚫고 지나가는지 } */
  let cache = { version: -1, list: [] };

  function rectObstacle(name, id, cx, cy, hw, hh, rotation) {
    const a = (-rotation * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
    const local = (p) => ({ x: (p.x - cx) * cos - (p.y - cy) * sin, y: (p.x - cx) * sin + (p.y - cy) * cos });
    return {
      name, id,
      dist(p) {
        const l = local(p);
        const dx = Math.abs(l.x) - hw, dy = Math.abs(l.y) - hh;
        return dx <= 0 && dy <= 0 ? Math.max(dx, dy) : Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
      },
    };
  }
  const circleObstacle = (name, id, cx, cy, r) => ({ name, id, dist: (p) => Math.hypot(p.x - cx, p.y - cy) - r });
  function segmentObstacle(name, id, a, b, half) {
    return {
      name, id, wall: true,
      dist: (p) => G.closestOnSegment(p, a, b).dist - half,
      cross: (p, q) => G.segmentsIntersect(p, q, a, b),
    };
  }

  /** 물건 하나의 장애물들 (의자 배열은 통로로 나뉜 묶음마다) */
  function itemObstacles(it, out) {
    const d = App.catalog.itemDef(it.kind);
    if (!d || d.pass || d.flat || d.wall || it.depth == null || it.wallId) return;
    if (it.category !== 'furn' && it.category !== 'event') return; // 천장에 다는 설비 등
    const name = it.kind;
    if (it.kind === '의자 배열') {
      const a = (it.rotation * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
      App.catalog.seatBlocks(it).forEach(([x0, x1]) => {
        const lx = (x0 + x1) / 2 - it.size / 2; // 묶음 가운데 (기호 가운데 기준)
        out.push(rectObstacle(name, it.id, it.x + lx * cos, it.y + lx * sin, (x1 - x0) / 2, it.depth / 2, it.rotation));
      });
      return;
    }
    if (it.kind === '원형 테이블') {
      const seats = App.catalog.seats(it);
      out.push(circleObstacle(name, it.id, it.x, it.y, it.size / 2 + (seats ? 480 : 0)));
      return;
    }
    if (it.kind === '스탠딩 테이블' || it.kind === '러버콘' || it.kind === '화분' || it.kind === '가로등' || it.kind === '깃발') {
      out.push(circleObstacle(name, it.id, it.x, it.y, Math.min(it.size, it.depth) / 2));
      return;
    }
    if (it.kind === '나무') {
      out.push(circleObstacle(name, it.id, it.x, it.y, Math.max(150, it.size * 0.07))); // 줄기만 (가지 아래는 지나감)
      return;
    }
    out.push(rectObstacle(name, it.id, it.x, it.y, it.size / 2, it.depth / 2, it.rotation));
  }

  /** 벽에서 문 자리를 뺀 막힌 토막들 */
  function wallObstacles(w, out) {
    const L = G.dist(w.start, w.end);
    if (L < 1) return;
    const dir = G.unit({ x: w.end.x - w.start.x, y: w.end.y - w.start.y });
    const gaps = [];
    App.measure.openingsOf(w.id).forEach((o) => {
      if (o.type !== 'door') return;
      const g = App.model.openingGeom(o);
      if (g) gaps.push([g.c - g.half, g.c + g.half]);
    });
    gaps.sort((a, b) => a[0] - b[0]);
    let at = 0;
    const piece = (s0, s1) => {
      if (s1 - s0 < 1) return;
      out.push(segmentObstacle('벽', w.id, { x: w.start.x + dir.x * s0, y: w.start.y + dir.y * s0 }, { x: w.start.x + dir.x * s1, y: w.start.y + dir.y * s1 }, w.thickness / 2));
    };
    gaps.forEach(([g0, g1]) => {
      piece(at, g0);
      at = Math.max(at, g1);
    });
    piece(at, L);
  }

  function obstacles() {
    const doc = App.doc;
    if (cache.version === doc.version) return cache.list;
    const list = [];
    for (const el of doc.all()) {
      if (el.type === 'item') itemObstacles(el, list);
      else if (el.type === 'column') {
        if (el.shape === 'circle') list.push(circleObstacle('기둥', el.id, el.x, el.y, el.width / 2));
        else list.push(rectObstacle('기둥', el.id, el.x, el.y, el.width / 2, el.depth / 2, 0));
      } else if (el.type === 'wall') wallObstacles(el, list);
    }
    cache = { version: doc.version, list };
    return list;
  }

  /** 점 p에서 가장 가까운 장애물까지: { dist, ob } (장애물이 없으면 dist는 Infinity) */
  function nearest(p, list = obstacles()) {
    let best = null, bestD = Infinity;
    for (const ob of list) {
      const d = ob.dist(p);
      if (d < bestD) { bestD = d; best = ob; }
    }
    return { dist: bestD, ob: best };
  }

  /** 동선을 따라 s(mm)만큼 간 자리와 방향 */
  function pointAt(r, s) {
    const pts = r.points;
    let left = Math.max(0, s);
    for (let i = 1; i < pts.length; i++) {
      const L = G.dist(pts[i - 1], pts[i]);
      if (left <= L || i === pts.length - 1) {
        const t = L > 0 ? Math.min(1, left / L) : 0;
        const dir = L > 0 ? { x: (pts[i].x - pts[i - 1].x) / L, y: (pts[i].y - pts[i - 1].y) / L } : { x: 1, y: 0 };
        return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t, dir, seg: i - 1 };
      }
      left -= L;
    }
    return { x: pts[0].x, y: pts[0].y, dir: { x: 1, y: 0 }, seg: 0 };
  }

  /* ── 동선 체크 ──
     issues: [{ from, to: 동선을 따라 걸리는 구간(mm), at: 가장 좁은 자리, gap: 그 자리에서 동선 가운데부터 장애물까지(mm, 0 이하면 막힘),
                name: 걸리는 것, blocked }] */
  let checked = { version: -1, map: new Map() };

  function check(r) {
    const doc = App.doc;
    if (checked.version !== doc.version) checked = { version: doc.version, map: new Map() };
    if (checked.map.has(r.id)) return checked.map.get(r.id);
    const list = obstacles();
    const total = length(r);
    const need = (r.width || def(r.kind).width) / 2;
    const issues = [];
    let cur = null;
    const close = () => {
      if (cur) issues.push(cur);
      cur = null;
    };
    const n = Math.max(1, Math.ceil(total / STEP));
    for (let i = 0; i <= n && list.length; i++) {
      const s = (total * i) / n;
      const p = pointAt(r, s);
      const near = nearest(p, list);
      if (near.dist < need - 0.5) {
        if (!cur) cur = { from: s, to: s, at: { x: p.x, y: p.y }, gap: near.dist, name: near.ob.name, id: near.ob.id, blocked: false };
        cur.to = s;
        if (near.dist < cur.gap) Object.assign(cur, { at: { x: p.x, y: p.y }, gap: near.dist, name: near.ob.name, id: near.ob.id });
        if (near.dist <= 0) cur.blocked = true;
      } else {
        close();
      }
    }
    close();
    // 얇은 벽을 건너뛰지 않게: 동선 선분이 벽을 뚫고 지나가면 막힘
    for (let i = 1; i < r.points.length; i++) {
      for (const ob of list) {
        if (!ob.cross || !ob.cross(r.points[i - 1], r.points[i])) continue;
        const hit = issues.find((x) => x.id === ob.id);
        if (hit) hit.blocked = true;
      }
    }
    const result = { length: total, time: time(r), need: need * 2, issues, ok: !issues.length };
    checked.map.set(r.id, result);
    return result;
  }

  const all = () => [...App.doc.all()].filter((e) => e.type === 'route');
  const checkAll = () => all().map((route) => ({ route, ...check(route) }));

  /** 걸리는 곳 설명 한 줄 */
  function issueText(r, x) {
    const U = App.units;
    const where = `출발에서 ${U.formatLength(Math.round(x.from / 100) * 100)}`;
    if (x.blocked) return `${where}: ${x.name}에 막힘`;
    return `${where}: ${x.name}까지 ${U.formatLength(Math.max(0, Math.round(x.gap / 10) * 10))} (통로 폭의 절반 ${U.formatLength(Math.round(r.width / 2))}보다 좁음)`;
  }

  /** 동선 체크 결과 창. 걸리는 곳을 누르면 그 자리로 화면을 옮김 */
  async function report() {
    const rows = checkAll();
    if (!rows.length) {
      App.ui.toast('동선이 없습니다. ‘동선’ 도구로 입구에서 자리까지 길을 그려 보세요.');
      return;
    }
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const U = App.units;
    const bad = rows.reduce((n, r) => n + r.issues.length, 0);
    const html = `
      <p class="dialog-note ${bad ? 'is-warn' : ''}">${bad ? `걸리는 곳 <b>${bad}곳</b>을 찾았습니다. 누르면 그 자리를 보여 줍니다.` : '모든 동선이 통로 폭만큼 비어 있습니다.'}</p>
      <div class="route-report">
        ${rows.map((r) => `
          <div class="route-row">
            <div class="route-head"><span class="swatch" style="background:${esc(r.route.color)}"></span><b>${esc(r.route.name)}</b>
              <small>${esc(r.route.kind)} · ${esc(U.formatRun(r.length))} · ${esc(timeText(r.time))} · 통로 폭 ${esc(U.formatLength(r.route.width))}</small></div>
            ${r.issues.length ? r.issues.map((x, i) => `<button type="button" class="btn btn-list route-issue${x.blocked ? ' is-blocked' : ''}" data-route="${esc(r.route.id)}" data-issue="${i}">
              <span>${esc(issueText(r.route, x))}</span></button>`).join('') : '<p class="props-meta">걸리는 곳 없음</p>'}
          </div>`).join('')}
      </div>
      <p class="props-meta">동선 가운데 선에서 통로 폭의 절반 안에 물건·기둥·벽이 있으면 걸리는 곳으로 봅니다. 문 자리는 지나갈 수 있고, 텐트·현수막·트러스 아래도 지나갈 수 있습니다.</p>`;
    let target = null;
    const r = await App.ui.dialog({
      title: '동선 체크',
      html,
      actions: [{ id: 'close', label: '닫기', primary: true }],
      onOpen(body) {
        body.addEventListener('click', (e) => {
          const b = e.target.closest('[data-route]');
          if (!b) return;
          target = { id: b.dataset.route, i: Number(b.dataset.issue) };
          document.querySelector('#dialogFoot [data-id="close"]').click();
        });
      },
    });
    if (!target || r.id === 'cancel') return;
    const row = rows.find((x) => x.route.id === target.id);
    const issue = row && row.issues[target.i];
    if (!issue) return;
    App.selection.set([row.route.id]);
    const m = Math.max(3000, row.route.width * 2);
    App.plan.fitToContent({ minX: issue.at.x - m, minY: issue.at.y - m, maxX: issue.at.x + m, maxY: issue.at.y + m });
    App.ui.toast(issueText(row.route, issue));
  }

  /* ── 3D 둘러보기 출발 자리: { x, y, angle(라디안, 보는 방향), route(따라갈 동선) } ──
     동선이 있으면 첫 동선의 출발점, 없으면 에어아치·문 바깥, 그것도 없으면 도면 아래쪽 바깥 */
  function entrance() {
    const routes = all();
    const first = routes.find((r) => r.kind === '관람객') || routes[0];
    if (first && first.points.length >= 2) {
      const p = pointAt(first, 0);
      return { x: p.x, y: p.y, angle: Math.atan2(p.dir.y, p.dir.x), route: first };
    }
    const b = App.doc.bounds();
    const center = b ? { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 } : { x: 0, y: 0 };
    const toward = (p) => Math.atan2(center.y - p.y, center.x - p.x);
    for (const el of App.doc.all()) {
      if (el.type === 'item' && el.kind === '에어아치') {
        // 아치 앞쪽(+y)으로 3m 물러선 자리에서 아치를 봄
        const a = (el.rotation * Math.PI) / 180;
        const p = { x: el.x - Math.sin(a) * 3000, y: el.y + Math.cos(a) * 3000 };
        return { x: p.x, y: p.y, angle: Math.atan2(el.y - p.y, el.x - p.x), route: null };
      }
    }
    let door = null;
    for (const el of App.doc.all()) {
      if (el.type !== 'door') continue;
      if (!door || el.kind === '방화문' || el.kind === '자동문') door = el; // 현관문 같은 것을 먼저
      if (el.kind === '방화문') break;
    }
    if (door) {
      const g = App.model.openingGeom(door);
      if (g) {
        // 문에서 건물 바깥쪽(도면 가운데 반대쪽)으로 1.5m 물러선 자리
        const out = (g.center.x - center.x) * g.n.x + (g.center.y - center.y) * g.n.y >= 0 ? 1 : -1;
        const p = { x: g.center.x + g.n.x * out * 1500, y: g.center.y + g.n.y * out * 1500 };
        return { x: p.x, y: p.y, angle: Math.atan2(g.center.y - p.y, g.center.x - p.x), route: null };
      }
    }
    if (!b) return { x: 0, y: 3000, angle: -Math.PI / 2, route: null };
    const p = { x: center.x, y: b.maxY + Math.min(6000, Math.max(2500, (b.maxY - b.minY) * 0.25)) };
    return { x: p.x, y: p.y, angle: toward(p), route: null };
  }

  App.routes = { KINDS, STEP, def, length, time, timeText, obstacles, nearest, pointAt, check, checkAll, all, issueText, report, entrance };
})();
