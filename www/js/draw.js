/* 도면 요소 그리기 (Canvas 2D). 화면에 보이는 요소만 그린다. */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const G = App.geom;

  const LABEL_FONT = '11px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif';
  const TAG_FONT = '600 13px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif';
  const ROOM_NAME_FONT = '700 13px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif';
  const ROOM_AREA_FONT = '12px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif';
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
        const joined = others.length > 0;
        if (others.length !== 1) return { plus, minus, joined };
        const o = others[0].wall;
        const oFrom = others[0].at === 'start' ? o.start : o.end;
        const oTo = others[0].at === 'start' ? o.end : o.start;
        const e = G.unit({ x: oTo.x - oFrom.x, y: oTo.y - oFrom.y });
        if (Math.abs(G.cross(away, e)) < 0.02) return { plus, minus, joined }; // 일직선
        const m = G.perp(e);
        const k = o.thickness / 2;
        // 이 벽의 +na 면은 상대 벽의 -m 면과, -na 면은 +m 면과 만난다
        const p2 = G.lineIntersect(plus, away, { x: P.x - m.x * k, y: P.y - m.y * k }, e);
        const m2 = G.lineIntersect(minus, away, { x: P.x + m.x * k, y: P.y + m.y * k }, e);
        const limit = MITER_LIMIT * Math.max(h, k);
        if (!p2 || !m2 || G.dist(p2, P) > limit || G.dist(m2, P) > limit) return { plus, minus, joined };
        return { plus: p2, minus: m2, joined };
      };
      const s = corners(w.start, d);                 // 시작점: +na가 벽의 왼쪽
      const t = corners(w.end, { x: -d.x, y: -d.y }); // 끝점: +na가 벽의 오른쪽
      // 모든 벽이 같은 방향으로 감기도록 (겹치는 부분이 비지 않게): 왼쪽 시작→끝, 오른쪽 끝→시작
      // joined: 그 끝에 다른 벽이 붙어 있으면 끝선을 그리지 않음
      map.set(w.id, { pts: [s.plus, t.minus, t.plus, s.minus], joined: [s.joined, t.joined] });
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
  const DETAIL_PX = 5; // 벽 두께가 화면에서 이보다 두꺼우면 층(석고·틀·콘크리트)을 나눠 그림

  function scene(plan) {
    const ctx = plan.ctx;
    const c = plan.colors;
    const vis = visibleRect(plan);
    const outlines = wallOutlines();
    const sel = App.selection;
    const marks = App.tools ? App.tools.highlight() : null; // { ids, color }
    const scale = plan.view.scale;

    const walls = [], rooms = [], openings = [], columns = [];
    for (const el of App.doc.all()) {
      const t = App.model.TYPES[el.type];
      if (!t || t.catalog) continue;
      const b = t.bounds(el);
      if (!b || !G.rectsOverlap(b, vis)) continue;
      if (el.type === 'wall') walls.push(el);
      else if (el.type === 'room') rooms.push(el);
      else if (el.type === 'door' || el.type === 'window') openings.push(el);
      else if (el.type === 'column') columns.push(el);
    }

    worldTransform(plan);
    drawRooms(plan, rooms, marks);

    // 벽: 확대했으면 층을 나눠 그리고, 멀리서는 한 색으로
    const solid = [];
    walls.forEach((w) => {
      const t = App.catalog.typeOf(w);
      if (w.thickness * scale >= DETAIL_PX) drawWallLayers(plan, w, outlines.get(w.id), t);
      else solid.push(w);
    });
    const fillWalls = (list, color, alpha = 1) => {
      if (!list.length) return;
      ctx.beginPath();
      list.forEach((w) => polygon(ctx, outlines.get(w.id).pts));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;
    };
    fillWalls(solid, c.wall);
    const selectedWalls = walls.filter((w) => sel.has(w.id));
    fillWalls(selectedWalls, c.accent, 0.4);
    if (marks && marks.ids.size) fillWalls(walls.filter((w) => marks.ids.has(w.id)), c[marks.color], 0.45);
    if (selectedWalls.length) {
      ctx.beginPath();
      selectedWalls.forEach((w) => polygon(ctx, outlines.get(w.id).pts));
      ctx.lineWidth = 2 / scale;
      ctx.strokeStyle = c.accent;
      ctx.stroke();
    }

    drawOpenings(plan, openings, marks);
    drawColumns(plan, columns, marks);

    screenTransform(plan);
    drawWallLabels(plan, walls);
    drawRoomLabels(plan, rooms);
    // 선택한 벽의 끝점. 벽 하나만 골랐으면 끌어서 늘일 수 있는 손잡이로 크게
    const handle = sel.size === 1 ? 5.5 : 3.5;
    ctx.fillStyle = c.canvasBg;
    ctx.strokeStyle = c.accent;
    ctx.lineWidth = sel.size === 1 ? 2 : 1.5;
    selectedWalls.forEach((w) => {
      [w.start, w.end].forEach((p) => {
        const s = plan.view.toScreen(p.x, p.y);
        ctx.fillRect(s.x - handle, s.y - handle, handle * 2, handle * 2);
        ctx.strokeRect(s.x - handle, s.y - handle, handle * 2, handle * 2);
      });
    });
  }

  /** 벽을 마감 쪽 → 반대쪽 순서로 층을 나눠 그림: [마감 쪽 석고][틀(세로재 단면)][기존 벽 빗금][반대쪽 석고]
      벽 종류가 없으면 기존 벽처럼 그림 */
  function drawWallLayers(plan, w, outline, t) {
    const ctx = plan.ctx;
    const c = plan.colors;
    const px = 1 / plan.view.scale;
    const L = G.dist(w.start, w.end);
    const d = G.unit({ x: w.end.x - w.start.x, y: w.end.y - w.start.y });
    let n = G.perp(d);
    if (w.flip) n = { x: -n.x, y: -n.y };
    const T = w.thickness;
    const ext = T * 3; // 모서리 맞춤 부분까지 덮도록 길이 방향으로 넉넉히
    const at = (s, off) => ({ x: w.start.x + d.x * s + n.x * off, y: w.start.y + d.y * s + n.y * off });
    // from, to: 마감 쪽 면에서 잰 깊이 (0 ~ T)
    const band = (from, to) => {
      const o1 = T / 2 - from, o2 = T / 2 - to;
      const pts = [at(-ext, o1), at(L + ext, o1), at(L + ext, o2), at(-ext, o2)];
      ctx.beginPath();
      polygon(ctx, pts);
    };
    const layer = (from, to, color) => {
      band(from, to);
      ctx.fillStyle = color;
      ctx.fill();
    };
    const seam = (depth) => {
      const o = T / 2 - depth;
      const a = at(-ext, o), b = at(L + ext, o);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    };

    ctx.save();
    ctx.beginPath();
    polygon(ctx, outline.pts);
    ctx.clip();

    const face = t ? t.boardFace : 0, back = t ? t.boardBack : 0;
    const bt = t ? t.boardT : 0;
    const frame = t && t.frameKind !== 'none' ? t.frameDepth : 0;
    const base = t ? t.base : T;
    let pos = 0;
    const seams = [];
    for (let i = 0; i < face; i++) { layer(pos, pos + bt, c.layerBoard); pos += bt; seams.push(pos); }
    if (frame) {
      const wood = t.frameKind === 'wood';
      layer(pos, pos + frame, wood ? c.layerWood : c.layerMetal);
      // 세로재 단면: 간격마다 작은 네모 (다루끼는 채움, 스터드는 테두리)
      const sw = wood ? Math.min(frame, 45) : 50;
      const count = Math.ceil(L / t.frameSpacing - 1e-9) + 1;
      const o1 = T / 2 - pos, o2 = T / 2 - pos - frame;
      ctx.lineWidth = 1.2 * px;
      for (let i = 0; i < count; i++) {
        const sc = G.clamp(Math.min(i * t.frameSpacing, L), sw / 2, Math.max(sw / 2, L - sw / 2));
        const pts = [at(sc - sw / 2, o1), at(sc + sw / 2, o1), at(sc + sw / 2, o2), at(sc - sw / 2, o2)];
        ctx.beginPath();
        polygon(ctx, pts);
        if (wood) {
          ctx.fillStyle = c.layerWoodStud;
          ctx.fill();
        } else {
          ctx.strokeStyle = c.layerMetalStud;
          ctx.stroke();
        }
      }
      pos += frame;
      seams.push(pos);
    }
    if (base > 0) {
      layer(pos, pos + base, c.layerConcrete);
      // 콘크리트 빗금
      ctx.save();
      band(pos, pos + base);
      ctx.clip();
      const span = L + 2 * ext + T * 2;
      const step = Math.max(7 * px, span / 2000); // 아주 긴 벽은 빗금 수를 제한
      ctx.beginPath();
      for (let k = -span; k <= span; k += step) {
        const a = at(k - T, T / 2 - pos), b = at(k + base - T, T / 2 - pos - base);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.lineWidth = 1 * px;
      ctx.strokeStyle = c.layerHatch;
      ctx.stroke();
      ctx.restore();
      pos += base;
      seams.push(pos);
    }
    for (let i = 0; i < back; i++) { layer(pos, pos + bt, c.layerBoard); pos += bt; seams.push(pos); }

    ctx.lineWidth = 0.8 * px;
    ctx.strokeStyle = c.layerLine;
    seams.slice(0, -1).forEach(seam);
    ctx.restore();

    // 바깥선: 양쪽 면, 다른 벽이 붙지 않은 끝만
    const q = outline.pts;
    ctx.beginPath();
    ctx.moveTo(q[0].x, q[0].y); ctx.lineTo(q[1].x, q[1].y);
    ctx.moveTo(q[2].x, q[2].y); ctx.lineTo(q[3].x, q[3].y);
    if (!outline.joined[0]) { ctx.moveTo(q[3].x, q[3].y); ctx.lineTo(q[0].x, q[0].y); }
    if (!outline.joined[1]) { ctx.moveTo(q[1].x, q[1].y); ctx.lineTo(q[2].x, q[2].y); }
    ctx.lineWidth = 1.4 * px;
    ctx.strokeStyle = c.layerLine;
    ctx.stroke();
  }

  /** 문·창문: 벽을 뚫고 기호를 그림 */
  function drawOpenings(plan, list, marks) {
    list.forEach((el) => {
      const g = App.model.openingGeom(el);
      if (!g) return;
      const color = App.selection.has(el.id) ? plan.colors.accent
        : marks && marks.ids.has(el.id) ? plan.colors[marks.color] : null;
      openingSymbol(plan, el, g, color);
    });
  }

  /** 문·창문 기호 하나. color를 주면 그 색으로 (선택·미리보기) */
  function openingSymbol(plan, el, g, color, alpha = 1) {
    const ctx = plan.ctx;
    const c = plan.colors;
    const px = 1 / plan.view.scale;
    const ink = color || c.layerLine;
    const h = g.th / 2;
    const P = (s, off) => ({ x: g.a.x + g.d.x * s + g.n.x * off, y: g.a.y + g.d.y * s + g.n.y * off });
    const W = g.half * 2;
    const line = (p, q, width) => {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.lineWidth = width * px;
      ctx.stroke();
    };
    ctx.save();
    ctx.globalAlpha = alpha;
    // 벽 뚫기
    ctx.beginPath();
    polygon(ctx, App.model.openingCorners(g, h + 0.6 * px));
    ctx.fillStyle = c.canvasBg;
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    // 문틀(양쪽 끝)
    line(P(0, h), P(0, -h), 1.4);
    line(P(W, h), P(W, -h), 1.4);

    if (el.type === 'window') {
      line(P(0, h), P(W, h), 1);
      line(P(0, -h), P(W, -h), 1);
      ctx.strokeStyle = color || c.glass;
      if (el.kind === '미서기') {
        line(P(0, h * 0.25), P(W * 0.55, h * 0.25), 1.6);
        line(P(W * 0.45, -h * 0.25), P(W, -h * 0.25), 1.6);
      } else if (el.kind === '고정창') {
        line(P(0, 0), P(W, 0), 2.2);
      } else {
        line(P(0, 0), P(W, 0), 1.6);
        // 여닫이·프로젝트창: 열리는 표시
        ctx.setLineDash([3 * px, 2 * px]);
        if (el.kind === '여닫이') {
          line(P(0, 0), P(W / 2, h * 1.8 + W * 0.15), 1);
          line(P(W, 0), P(W / 2, h * 1.8 + W * 0.15), 1);
        } else {
          line(P(0, 0), P(W / 2, h * 0.9), 1);
          line(P(W, 0), P(W / 2, h * 0.9), 1);
        }
        ctx.setLineDash([]);
      }
    } else if (el.kind === '여닫이' || el.kind === '방화문') {
      const side = el.side || 1;
      const hingeS = el.hinge === 'end' ? W : 0;
      const otherS = el.hinge === 'end' ? 0 : W;
      const H0 = P(hingeS, side * h);
      const leafEnd = P(hingeS, side * (h + W));
      line(H0, leafEnd, el.kind === '방화문' ? 3.2 : 2);
      // 문 열리는 궤적
      const m = { x: g.n.x * side, y: g.n.y * side };
      const toOther = G.unit({ x: (otherS - hingeS) * g.d.x, y: (otherS - hingeS) * g.d.y });
      const a1 = Math.atan2(m.y, m.x), a2 = Math.atan2(toOther.y, toOther.x);
      ctx.beginPath();
      ctx.arc(H0.x, H0.y, W, a1, a2, G.cross(m, toOther) < 0);
      ctx.lineWidth = 1 * px;
      ctx.setLineDash([4 * px, 3 * px]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (el.kind === '방화문') {
        ctx.save();
        const mid = P(W / 2, side * (h + W * 0.35));
        ctx.translate(mid.x, mid.y);
        ctx.scale(px, px);
        ctx.font = '700 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('방화', 0, 0);
        ctx.restore();
      }
    } else if (el.kind === '미닫이') {
      const side = el.side || 1;
      line(P(0, 0), P(W, 0), 0.8);
      line(P(-W * 0.02, side * h * 0.45), P(W, side * h * 0.45), 3);
      // 미는 방향 화살표
      const tip = P(W * 0.25, side * (h + 6 * px)), tail = P(W * 0.6, side * (h + 6 * px));
      line(tail, tip, 1);
      line(tip, P(W * 0.25 + 5 * px, side * (h + 9 * px)), 1);
      line(tip, P(W * 0.25 + 5 * px, side * (h + 3 * px)), 1);
    } else {
      // 자동문: 가운데에서 양쪽으로 열리는 두 짝
      line(P(0, h * 0.35), P(W / 2, h * 0.35), 3);
      line(P(W / 2, -h * 0.35), P(W, -h * 0.35), 3);
      const y = h + 7 * px;
      [[W * 0.4, W * 0.1], [W * 0.6, W * 0.9]].forEach(([from, to]) => {
        line(P(from, y), P(to, y), 1);
        const dir = to > from ? -1 : 1;
        line(P(to, y), P(to + dir * 5 * px, y + 3 * px), 1);
        line(P(to, y), P(to + dir * 5 * px, y - 3 * px), 1);
      });
    }
    ctx.restore();
  }

  /** 기둥: 콘크리트 빗금 */
  function drawColumns(plan, list, marks) {
    list.forEach((col) => {
      const color = App.selection.has(col.id) ? plan.colors.accent
        : marks && marks.ids.has(col.id) ? plan.colors[marks.color] : null;
      columnShape(plan, col, color);
    });
  }

  function columnShape(plan, col, color, alpha = 1) {
    const ctx = plan.ctx;
    const c = plan.colors;
    const px = 1 / plan.view.scale;
    const { hx, hy } = App.model.TYPES.column.half(col);
    const outline = () => {
      ctx.beginPath();
      if (col.shape === 'circle') ctx.arc(col.x, col.y, hx, 0, Math.PI * 2);
      else ctx.rect(col.x - hx, col.y - hy, hx * 2, hy * 2);
    };
    ctx.save();
    ctx.globalAlpha = alpha;
    outline();
    ctx.fillStyle = c.layerConcrete;
    ctx.fill();
    ctx.save();
    outline();
    ctx.clip();
    ctx.beginPath();
    const step = 7 * px;
    for (let k = -hx - hy; k <= hx + hy; k += step) {
      ctx.moveTo(col.x + k - hy, col.y + hy);
      ctx.lineTo(col.x + k + hy, col.y - hy);
    }
    ctx.lineWidth = px;
    ctx.strokeStyle = c.layerHatch;
    ctx.stroke();
    ctx.restore();
    outline();
    ctx.lineWidth = (color ? 2 : 1.4) * px;
    ctx.strokeStyle = color || c.layerLine;
    ctx.stroke();
    ctx.restore();
  }

  /** 문·창문 도구 미리보기: 놓일 자리와 벽 양 끝까지 거리 */
  function openingPreview(plan, kind, loc, preset) {
    if (!loc || !preset) return;
    const el = kind === 'door'
      ? { type: 'door', wallId: loc.wall.id, t: loc.t, width: preset.width, height: preset.height, kind: preset.style, side: loc.side, hinge: loc.hinge }
      : { type: 'window', wallId: loc.wall.id, t: loc.t, width: preset.width, kind: preset.style };
    const g = App.model.openingGeom(el);
    if (!g) return;
    worldTransform(plan);
    openingSymbol(plan, el, g, loc.error ? plan.colors.danger : plan.colors.accent, 0.9);
    screenTransform(plan);
    if (loc.error) return;
    const w = loc.wall;
    distanceTag(plan, w.start, g.a, g.n, g.th);
    distanceTag(plan, g.b, w.end, g.n, g.th);
  }

  /** 벽을 따라 두 점 사이 거리를 작게 표시 (벽 옆에) */
  function distanceTag(plan, p, q, n, th) {
    const len = G.dist(p, q);
    if (len < 1) return;
    const ctx = plan.ctx;
    const mid = plan.view.toScreen((p.x + q.x) / 2, (p.y + q.y) / 2);
    const off = (th / 2) * plan.view.scale + 16;
    const x = mid.x - n.x * off, y = mid.y - n.y * off;
    const text = App.units.formatLength(len);
    ctx.font = LABEL_FONT;
    const tw = ctx.measureText(text).width + 10;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - tw / 2, y - 9, tw, 18, 4);
    else ctx.rect(x - tw / 2, y - 9, tw, 18);
    ctx.fillStyle = plan.colors.canvasBg;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = plan.colors.accent;
    ctx.stroke();
    ctx.fillStyle = plan.colors.accent;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 0.5);
  }

  function columnPreview(plan, p, preset) {
    if (!p || !preset) return;
    const col = { x: p.x, y: p.y, shape: preset.shape, width: preset.width, depth: preset.shape === 'circle' ? preset.width : preset.depth };
    worldTransform(plan);
    columnShape(plan, col, plan.colors.accent, 0.6);
  }

  /** 방 바닥: 옅은 색. 선택은 주황, 경계를 못 찾은 방은 빨간 점선 */
  function drawRooms(plan, rooms, marks) {
    const ctx = plan.ctx;
    const c = plan.colors;
    const px = 1 / plan.view.scale; // 1 화면 px을 mm로
    rooms.forEach((r) => {
      const selected = App.selection.has(r.id);
      const marked = marks && marks.ids.has(r.id);
      ctx.beginPath();
      polygon(ctx, r.points);
      ctx.fillStyle = r.issue ? c.danger : selected || marked ? c.accent : c.roomFill;
      ctx.globalAlpha = r.issue ? 0.08 : selected ? 0.16 : marked ? 0.1 : 1;
      ctx.fill();
      ctx.globalAlpha = 1;
      if (selected || r.issue) {
        ctx.setLineDash(r.issue ? [6 * px, 4 * px] : []);
        ctx.lineWidth = 2 * px;
        ctx.strokeStyle = r.issue ? c.danger : c.accent;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });
  }

  /** 방 이름과 바닥 면적. 방이 화면에서 너무 작으면 생략 */
  function drawRoomLabels(plan, rooms) {
    const ctx = plan.ctx;
    const c = plan.colors;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    rooms.forEach((r) => {
      const b = App.model.TYPES.room.bounds(r);
      const wPx = (b.maxX - b.minX) * plan.view.scale;
      const hPx = (b.maxY - b.minY) * plan.view.scale;
      const name = r.name || '이름 없음';
      const area = r.issue ? (r.issue === 'open' ? '경계 끊김' : '경계 겹침') : App.units.formatArea(App.model.TYPES.room.floorArea(r));
      ctx.font = ROOM_NAME_FONT;
      const nameW = ctx.measureText(name).width;
      ctx.font = ROOM_AREA_FONT;
      const areaW = ctx.measureText(area).width;
      if (wPx < Math.max(nameW, areaW) + 12 || hPx < 40) return;
      const center = G.interiorPoint(r.points); // seed는 경계를 다시 찾는 기준점이라 가운데가 아닐 수 있음
      const s = plan.view.toScreen(center.x, center.y);
      const selected = App.selection.has(r.id);
      const lines = [[name, ROOM_NAME_FONT, selected ? c.accent : c.fg, -9], [area, ROOM_AREA_FONT, r.issue ? c.danger : c.label, 9]];
      lines.forEach(([text, font, color, dy]) => {
        ctx.font = font;
        ctx.lineWidth = 3;
        ctx.strokeStyle = c.canvasBg;
        ctx.strokeText(text, s.x, s.y + dy);
        ctx.fillStyle = color;
        ctx.fillText(text, s.x, s.y + dy);
      });
    });
  }

  /** 방 도구로 가리킨 곳: 등록될 범위와 면적 미리보기 */
  function facePreview(plan, face) {
    const ctx = plan.ctx;
    const px = 1 / plan.view.scale;
    worldTransform(plan);
    ctx.beginPath();
    polygon(ctx, face.points);
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = plan.colors.accent;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.setLineDash([6 * px, 4 * px]);
    ctx.lineWidth = 2 * px;
    ctx.strokeStyle = plan.colors.accent;
    ctx.stroke();
    ctx.setLineDash([]);
    screenTransform(plan);
    const p = G.interiorPoint(face.points);
    const s = plan.view.toScreen(p.x, p.y);
    const text = `${App.units.formatArea(face.area)} · 눌러서 방 만들기`;
    ctx.font = TAG_FONT;
    const w = ctx.measureText(text).width + 16;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(s.x - w / 2, s.y - 12, w, 24, 6);
    else ctx.rect(s.x - w / 2, s.y - 12, w, 24);
    ctx.fillStyle = plan.colors.accent;
    ctx.fill();
    ctx.fillStyle = plan.colors.accentFg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, s.x, s.y + 0.5);
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

  App.draw = {
    scene, wallOutlines, previewWall, lengthTag, snapMarker, pointMarker, selectionBox, facePreview,
    openingPreview, columnPreview, distanceTag, worldTransform, screenTransform,
  };
})();
