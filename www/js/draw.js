/* 도면 요소 그리기 (Canvas 2D). 화면에 보이는 요소만 그린다. */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const G = App.geom;

  const LABEL_FONT = '11px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif';
  const TAG_FONT = '600 13px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif';
  const MITER_LIMIT = 5; // 모서리가 두께의 5배보다 길게 뾰족해지면 맞춤 생략

  /* ── 벽 외곽선: 두 벽만 만나는 모서리는 비스듬히 잘라 이음매 없이 ── */
  let outlineCache = { version: -1, map: new Map() };

  const key = (p) => `${Math.round(p.x)},${Math.round(p.y)}`;

  function wallOutlines() {
    const doc = App.doc;
    if (outlineCache.version === doc.version) return outlineCache.map;
    const walls = [];
    const ends = new Map(); // 끝점 위치 → 그 점에 닿는 벽들
    for (const el of doc.all()) {
      if (el.type !== 'wall') continue;
      walls.push(el);
      for (const at of ['start', 'end']) {
        const k = key(el[at]);
        if (!ends.has(k)) ends.set(k, []);
        ends.get(k).push({ wall: el, at });
      }
    }
    const map = new Map();
    for (const w of walls) {
      const d = G.unit({ x: w.end.x - w.start.x, y: w.end.y - w.start.y });
      const h = w.thickness / 2;
      // 끝점 P에서 벽이 뻗어 나가는 방향(away) 기준으로 양쪽 면의 모서리를 구함
      const corners = (P, away) => {
        const na = G.perp(away);
        const plus = { x: P.x + na.x * h, y: P.y + na.y * h };
        const minus = { x: P.x - na.x * h, y: P.y - na.y * h };
        const others = ends.get(key(P)).filter((o) => o.wall !== w);
        if (others.length !== 1) return { plus, minus };
        const o = others[0].wall;
        const oFrom = others[0].at === 'start' ? o.start : o.end;
        const oTo = others[0].at === 'start' ? o.end : o.start;
        const e = G.unit({ x: oTo.x - oFrom.x, y: oTo.y - oFrom.y });
        if (Math.abs(G.cross(away, e)) < 0.02) return { plus, minus }; // 일직선
        const m = G.perp(e);
        const k = o.thickness / 2;
        // 이 벽의 +na 면은 상대 벽의 -m 면과, -na 면은 +m 면과 만난다
        const p2 = G.lineIntersect(plus, away, { x: P.x - m.x * k, y: P.y - m.y * k }, e);
        const m2 = G.lineIntersect(minus, away, { x: P.x + m.x * k, y: P.y + m.y * k }, e);
        const limit = MITER_LIMIT * Math.max(h, k);
        if (!p2 || !m2 || G.dist(p2, P) > limit || G.dist(m2, P) > limit) return { plus, minus };
        return { plus: p2, minus: m2 };
      };
      const s = corners(w.start, d);                 // 시작점: +na가 벽의 왼쪽
      const t = corners(w.end, { x: -d.x, y: -d.y }); // 끝점: +na가 벽의 오른쪽
      // 모든 벽이 같은 방향으로 감기도록 (겹치는 부분이 비지 않게): 왼쪽 시작→끝, 오른쪽 끝→시작
      map.set(w.id, [s.plus, t.minus, t.plus, s.minus]);
    }
    outlineCache = { version: doc.version, map };
    return map;
  }

  function polygon(ctx, pts) {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
  }

  /** 도면 좌표(mm)로 그리도록 변환 설정 */
  function worldTransform(plan) {
    const { view, dpr } = plan;
    plan.ctx.setTransform(view.scale * dpr, 0, 0, view.scale * dpr, view.ox * dpr, view.oy * dpr);
  }
  /** 화면 좌표(CSS px)로 그리도록 변환 설정 */
  function screenTransform(plan) {
    plan.ctx.setTransform(plan.dpr, 0, 0, plan.dpr, 0, 0);
  }

  function visibleRect(plan, marginPx = 40) {
    const r = plan.view.worldRect(plan.width, plan.height);
    const m = marginPx / plan.view.scale;
    return { minX: r.minX - m, minY: r.minY - m, maxX: r.maxX + m, maxY: r.maxY + m };
  }

  /* ── 장면 ── */
  function scene(plan) {
    const ctx = plan.ctx;
    const c = plan.colors;
    const vis = visibleRect(plan);
    const outlines = wallOutlines();
    const sel = App.selection;
    const marks = App.tools ? App.tools.highlight() : null; // { ids, color }

    const visibleWalls = [];
    for (const el of App.doc.all()) {
      if (el.type !== 'wall') continue;
      if (!G.rectsOverlap(App.model.TYPES.wall.bounds(el), vis)) continue;
      visibleWalls.push(el);
    }

    worldTransform(plan);
    const fillWalls = (list, color, alpha = 1) => {
      if (!list.length) return;
      ctx.beginPath();
      list.forEach((w) => polygon(ctx, outlines.get(w.id)));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;
    };
    fillWalls(visibleWalls, c.wall);
    fillWalls(visibleWalls.filter((w) => sel.has(w.id)), c.accent);
    if (marks && marks.ids.size) fillWalls(visibleWalls.filter((w) => marks.ids.has(w.id)), c[marks.color], 0.55);

    screenTransform(plan);
    drawWallLabels(plan, visibleWalls);
    // 선택한 벽의 끝점 표시
    ctx.fillStyle = c.canvasBg;
    ctx.strokeStyle = c.accent;
    ctx.lineWidth = 1.5;
    visibleWalls.forEach((w) => {
      if (!sel.has(w.id)) return;
      [w.start, w.end].forEach((p) => {
        const s = plan.view.toScreen(p.x, p.y);
        ctx.fillRect(s.x - 3.5, s.y - 3.5, 7, 7);
        ctx.strokeRect(s.x - 3.5, s.y - 3.5, 7, 7);
      });
    });
  }

  /** 벽 길이 글자: 화면에서 일정한 크기, 벽이 짧게 보이면 생략 */
  function drawWallLabels(plan, walls) {
    const ctx = plan.ctx;
    const view = plan.view;
    ctx.font = LABEL_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const w of walls) {
      const a = view.toScreen(w.start.x, w.start.y);
      const b = view.toScreen(w.end.x, w.end.y);
      const lenPx = Math.hypot(b.x - a.x, b.y - a.y);
      const text = App.units.formatLength(G.dist(w.start, w.end));
      const tw = ctx.measureText(text).width;
      if (lenPx < tw + 24) continue;
      // 글자가 거꾸로 서지 않게. 세로 벽은 도면 관례대로 아래에서 위로 읽음
      let ang = Math.atan2(b.y - a.y, b.x - a.x);
      if (ang >= Math.PI / 2 - 1e-6) ang -= Math.PI;
      else if (ang < -Math.PI / 2 - 1e-6) ang += Math.PI;
      const off = (w.thickness / 2) * view.scale + 9;
      const nx = Math.sin(ang), ny = -Math.cos(ang); // 글자 기준 위쪽
      ctx.save();
      ctx.translate((a.x + b.x) / 2 + nx * off, (a.y + b.y) / 2 + ny * off);
      ctx.rotate(ang);
      ctx.lineWidth = 3;
      ctx.strokeStyle = plan.colors.canvasBg;
      ctx.strokeText(text, 0, 0);
      ctx.fillStyle = App.selection.has(w.id) ? plan.colors.accent : plan.colors.label;
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }
  }

  /* ── 도구가 쓰는 보조 그림 ── */

  /** 그리는 중인 벽 미리보기 */
  function previewWall(plan, a, b, thickness) {
    if (G.samePoint(a, b, 0.01)) return;
    const ctx = plan.ctx;
    const d = G.unit({ x: b.x - a.x, y: b.y - a.y });
    const n = G.perp(d);
    const h = thickness / 2;
    worldTransform(plan);
    ctx.beginPath();
    polygon(ctx, [
      { x: a.x + n.x * h, y: a.y + n.y * h }, { x: b.x + n.x * h, y: b.y + n.y * h },
      { x: b.x - n.x * h, y: b.y - n.y * h }, { x: a.x - n.x * h, y: a.y - n.y * h },
    ]);
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = plan.colors.accent;
    ctx.fill();
    ctx.globalAlpha = 1;
    screenTransform(plan);
    const sa = plan.view.toScreen(a.x, a.y), sb = plan.view.toScreen(b.x, b.y);
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = plan.colors.accent;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /** 길이 표시 꼬리표. 손가락에 가리지 않게 터치에서는 위로 띄움 */
  function lengthTag(plan, a, b, touch) {
    if (G.samePoint(a, b, 0.01)) return;
    const ctx = plan.ctx;
    screenTransform(plan);
    const sa = plan.view.toScreen(a.x, a.y), sb = plan.view.toScreen(b.x, b.y);
    const text = App.units.formatLength(G.dist(a, b));
    ctx.font = TAG_FONT;
    const tw = ctx.measureText(text).width;
    let x = touch ? sb.x : (sa.x + sb.x) / 2;
    let y = touch ? sb.y - 56 : (sa.y + sb.y) / 2 - 22;
    x = G.clamp(x, tw / 2 + 10, plan.width - tw / 2 - 10);
    y = G.clamp(y, 18, plan.height - 18);
    const w = tw + 16, h = 24;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h / 2, w, h, 6);
    else ctx.rect(x - w / 2, y - h / 2, w, h);
    ctx.fillStyle = plan.colors.accent;
    ctx.fill();
    ctx.fillStyle = plan.colors.accentFg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 0.5);
  }

  /** 스냅 표시: 끝점 □, 중간점 △, 격자 + */
  function snapMarker(plan, p) {
    if (!p || !p.kind) return;
    const ctx = plan.ctx;
    screenTransform(plan);
    const s = plan.view.toScreen(p.x, p.y);
    ctx.strokeStyle = plan.colors.snap;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (p.kind === 'end') ctx.rect(s.x - 6, s.y - 6, 12, 12);
    else if (p.kind === 'mid') {
      ctx.moveTo(s.x, s.y - 7);
      ctx.lineTo(s.x + 7, s.y + 5);
      ctx.lineTo(s.x - 7, s.y + 5);
      ctx.closePath();
    } else {
      ctx.moveTo(s.x - 5, s.y);
      ctx.lineTo(s.x + 5, s.y);
      ctx.moveTo(s.x, s.y - 5);
      ctx.lineTo(s.x, s.y + 5);
    }
    ctx.stroke();
  }

  /** 이어 그리기 중인 마지막 점 */
  function pointMarker(plan, p) {
    const ctx = plan.ctx;
    screenTransform(plan);
    const s = plan.view.toScreen(p.x, p.y);
    ctx.beginPath();
    ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = plan.colors.accent;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = plan.colors.canvasBg;
    ctx.stroke();
  }

  /** 범위 선택 상자: 왼쪽→오른쪽은 실선(완전히 들어온 것만), 오른쪽→왼쪽은 점선(걸친 것도) */
  function selectionBox(plan, a, b, crossing) {
    const ctx = plan.ctx;
    screenTransform(plan);
    const color = crossing ? plan.colors.selCross : plan.colors.selWindow;
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
    ctx.setLineDash(crossing ? [5, 4] : []);
    ctx.lineWidth = 1;
    ctx.strokeStyle = color;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    ctx.setLineDash([]);
  }

  App.draw = { scene, wallOutlines, previewWall, lengthTag, snapMarker, pointMarker, selectionBox };
})();
