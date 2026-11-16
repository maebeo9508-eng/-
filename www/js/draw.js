/* 도면 요소 그리기 (Canvas 2D). 화면에 보이는 요소만 그린다. */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const G = App.geom;

  const LABEL_FONT = '11px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif';
  const TAG_FONT = '600 13px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif';
  const ROOM_NAME_FONT = '700 13px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif';
  const ROOM_AREA_FONT = '12px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif';
  const DIM_TEXT_MAX_PX = 22;

  /* ── 벽 외곽선: 이음 모양(T자는 상대 벽 면에서 끊고, ㄱ자는 비스듬히)은 joins.js에서 정함 ── */
  let outlineCache = { version: -1, map: new Map() };

  function wallOutlines() {
    const doc = App.doc;
    if (outlineCache.version === doc.wallVersion) return outlineCache.map;
    const map = new Map();
    for (const el of doc.all()) if (el.type === 'wall') map.set(el.id, App.joins.outline(el));
    outlineCache = { version: doc.wallVersion, map };
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
    const marks = App.tools && !App.exporting ? App.tools.highlight() : null; // { ids, color }. 내보낼 때는 없음
    const scale = plan.view.scale;

    const walls = [], rooms = [], openings = [], columns = [], zones = [], lines = [], items = [], texts = [], dims = [], underlays = [], routes = [], photos = [];
    for (const el of App.doc.all()) {
      const t = App.model.TYPES[el.type];
      if (!t || t.catalog || !App.layers.visible(el)) continue; // 숨긴 레이어
      const b = t.bounds(el);
      if (!b || !G.rectsOverlap(b, vis)) continue;
      if (el.type === 'wall') walls.push(el);
      else if (el.type === 'room') rooms.push(el);
      else if (el.type === 'door' || el.type === 'window') openings.push(el);
      else if (el.type === 'column') columns.push(el);
      else if (el.type === 'zone') zones.push(el);
      else if (el.type === 'route') routes.push(el);
      else if (el.type === 'line') lines.push(el);
      else if (el.type === 'item') items.push(el);
      else if (el.type === 'text') texts.push(el);
      else if (el.type === 'photo') photos.push(el);
      else if (el.type === 'dim') dims.push(el);
      else if (el.type === 'underlay') underlays.push(el);
    }

    worldTransform(plan);
    if (underlays.length) App.underlay.draw(plan, underlays, vis); // 가져온 도면은 맨 아래
    drawRooms(plan, rooms, marks);
    drawZones(plan, zones, marks);
    if (App.safety) App.safety.drawUnder(plan); // 안전 점검 겹쳐 보기: 밀집도 색·소화기 닿는 곳 (물건 아래)

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
    walls.filter((w) => w.color).forEach((w) => fillWalls([w], w.color, 0.85)); // 색을 정한 벽
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
    const markColor = (el) => (App.selection.has(el.id) ? c.accent : marks && marks.ids.has(el.id) ? c[marks.color] : null);
    lines.forEach((l) => {
      const sel = markColor(l);
      if (sel) lineShape(plan, l, App.doc.get(l.presetId), sel, 0.35, 5); // 선택 표시: 굵은 바탕
      lineShape(plan, l, App.doc.get(l.presetId));
    });
    // 바닥에 까는 것(카펫·바닥 이미지·주차 구획)을 먼저, 그 위에 다른 물건
    const flat = (it) => !!(App.catalog.itemDef(it.kind) || {}).flat;
    items.filter(flat).forEach((it) => itemShape(plan, it, markColor(it)));
    items.filter((it) => !flat(it)).forEach((it) => itemShape(plan, it, markColor(it)));
    routes.forEach((r) => routeShape(plan, r, { selected: sel.has(r.id), marked: !!(marks && marks.ids.has(r.id)) }));
    if (App.safety) App.safety.drawOverlay(plan); // 안전 점검 겹쳐 보기 (켰을 때만)

    screenTransform(plan);
    if (App.settings.showWallLengths) drawWallLabels(plan, walls);
    drawRoomLabels(plan, rooms);
    drawZoneLabels(plan, zones);
    drawRouteLabels(plan, routes);
    if (App.modes.is('event') && App.settings.itemNames !== false) drawItemNames(plan, items);
    drawSeatNumbers(plan, items);
    if (App.safety) App.safety.drawLabels(plan); // 안전 점검: 밀집도·비상구·먼 물건 글자
    dims.forEach((d) => dimShape(plan, d, markColor(d)));
    texts.forEach((t) => textShape(plan, t, markColor(t)));
    if (photos.length) drawPhotoPins(plan, photos, markColor);
    // 선택한 벽의 끝점. 벽 하나만 골랐으면 끌어서 늘일 수 있는 손잡이로 크게
    const handle = sel.size === 1 ? 5.5 : 3.5;
    ctx.fillStyle = c.canvasBg;
    ctx.strokeStyle = c.accent;
    ctx.lineWidth = sel.size === 1 ? 2 : 1.5;
    const handled = [...selectedWalls, ...lines.filter((l) => sel.has(l.id)), ...dims.filter((d) => sel.has(d.id))];
    handled.filter((w) => !w.locked).forEach((w) => {
      [w.start, w.end].forEach((p) => {
        const s = plan.view.toScreen(p.x, p.y);
        ctx.fillRect(s.x - handle, s.y - handle, handle * 2, handle * 2);
        ctx.strokeRect(s.x - handle, s.y - handle, handle * 2, handle * 2);
      });
    });
    // 동선·영역 하나를 골랐으면 꼭짓점 손잡이 (끌어서 모양을 고침)
    if (sel.size === 1 && !App.exporting) {
      const one = App.doc.get(sel.list()[0]);
      if (one && (one.type === 'route' || one.type === 'zone') && !one.locked && App.layers.visible(one)) {
        ctx.lineWidth = 2;
        one.points.forEach((p) => {
          const s = plan.view.toScreen(p.x, p.y);
          ctx.beginPath();
          ctx.arc(s.x, s.y, 5.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
      }
    }
    // 조감도 물건 하나를 골랐으면: 돌리는 손잡이(동그라미)와 크기 손잡이(네모)
    if (sel.size === 1 && !App.exporting) {
      const one = App.doc.get(sel.list()[0]);
      if (App.model.handled(one) && App.layers.visible(one) && App.tools.id === 'select') {
        const hd = App.model.itemHandles(one, scale), S2 = (p) => plan.view.toScreen(p.x, p.y); // 너무 작은 쪽은 크기 손잡이 없음
        const r = S2(hd.rotate), st = S2(hd.stem);
        ctx.strokeStyle = c.accent;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(st.x, st.y); ctx.lineTo(r.x, r.y); ctx.stroke();
        ctx.fillStyle = c.accent;
        ctx.beginPath(); ctx.arc(r.x, r.y, 11, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(r.x, r.y, 5.5, -2.4, 1.4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(r.x + 1, r.y + 8.5); ctx.lineTo(r.x + 1.5, r.y + 3.5); ctx.lineTo(r.x + 6, r.y + 6.5); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill();
        if (App.catalog.resizable(one)) {
          hd.sizes.forEach((q) => {
            const p = S2(q);
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = c.accent;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.rect(p.x - 5, p.y - 5, 10, 10); ctx.fill(); ctx.stroke();
          });
        }
      }
    }
    drawGroupBoxes(plan);
    drawLockBadges(plan);
    // 기호·가구·기둥 하나를 골랐으면(옮기는 중 포함) 벽까지 거리
    if (!App.exporting && sel.size === 1) {
      const el = App.doc.get(sel.list()[0]);
      if (el && (el.type === 'item' || el.type === 'column')) clearanceGuides(plan, el);
    }
  }

  /** 기호·가구·기둥에서 네 방향 벽 면까지 점선과 거리 (가장자리 기준). 놓는 중인 것(미리 보기)에도 씀 */
  function clearanceGuides(plan, el) {
    if (App.settings.showDistances === false) return;
    const c = App.dims.clearance(el);
    if (!c) return;
    const ctx = plan.ctx, view = plan.view;
    screenTransform(plan);
    ctx.save();
    ctx.font = '600 11px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    Object.values(c).forEach((k) => {
      if (k.edge < 0.5) return; // 벽에 붙어 있음
      const a = view.toScreen(el.x + k.dir.x * k.ext, el.y + k.dir.y * k.ext);
      const b = view.toScreen(el.x + k.dir.x * k.center, el.y + k.dir.y * k.center);
      if (Math.hypot(b.x - a.x, b.y - a.y) < 8) return;
      ctx.strokeStyle = plan.colors.accent;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.setLineDash([]);
      const nx = -k.dir.y * 5, ny = k.dir.x * 5; // 벽 쪽 끝 눈금
      ctx.beginPath(); ctx.moveTo(b.x - nx, b.y - ny); ctx.lineTo(b.x + nx, b.y + ny); ctx.stroke();
      const text = App.units.formatLength(k.edge);
      const tw = ctx.measureText(text).width + 8;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      ctx.fillStyle = plan.colors.surface;
      ctx.fillRect(mx - tw / 2, my - 8, tw, 16);
      ctx.strokeRect(mx - tw / 2 + 0.5, my - 7.5, tw - 1, 15);
      ctx.fillStyle = plan.colors.accent;
      ctx.fillText(text, mx, my + 0.5);
    });
    ctx.restore();
  }

  /** 고른 것 중 잠긴 것: 오른쪽 위에 자물쇠 */
  function drawLockBadges(plan) {
    const ctx = plan.ctx;
    App.selection.list().forEach((id) => {
      const el = App.doc.get(id);
      if (!el || !el.locked || el.type === 'underlay') return;
      const b = App.model.TYPES[el.type].bounds(el);
      if (!b) return;
      const s = plan.view.toScreen(b.maxX, b.minY);
      const x = s.x + 4, y = s.y - 20;
      ctx.fillStyle = plan.colors.accent;
      ctx.beginPath();
      ctx.arc(x + 8, y + 8, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = plan.colors.accentFg;
      ctx.fillStyle = plan.colors.accentFg;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(x + 8, y + 6, 2.6, Math.PI, 0);
      ctx.stroke();
      ctx.fillRect(x + 4.5, y + 6.5, 7, 5.5);
    });
  }

  /** 고른 묶음 둘레에 점선 상자: 하나씩이 아니라 묶음으로 골라졌다는 표시 */
  function drawGroupBoxes(plan) {
    const groups = new Set();
    App.selection.list().forEach((id) => {
      const el = App.doc.get(id);
      if (el && el.group) groups.add(el.group);
    });
    if (!groups.size) return;
    const boxes = new Map();
    for (const el of App.doc.all()) {
      if (!el.group || !groups.has(el.group)) continue;
      const b = App.model.TYPES[el.type].bounds(el);
      if (!b) continue;
      const cur = boxes.get(el.group);
      boxes.set(el.group, cur ? {
        minX: Math.min(cur.minX, b.minX), minY: Math.min(cur.minY, b.minY), maxX: Math.max(cur.maxX, b.maxX), maxY: Math.max(cur.maxY, b.maxY),
      } : b);
    }
    const ctx = plan.ctx;
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = plan.colors.accent;
    ctx.lineWidth = 1.2;
    boxes.forEach((b) => {
      const a = plan.view.toScreen(b.minX, b.minY), z = plan.view.toScreen(b.maxX, b.maxY);
      ctx.strokeRect(a.x - 6, a.y - 6, z.x - a.x + 12, z.y - a.y + 12);
    });
    ctx.restore();
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
      // 세로재 단면: 물량과 같은 자리에 작은 네모 (다루끼는 채움, 스터드는 테두리).
      // 다른 벽 안으로는 안 들어가고, 문·창문 양옆에 하나씩
      const { studs, sw } = App.measure.frameLayout(w, t);
      const o1 = T / 2 - pos, o2 = T / 2 - pos - frame;
      ctx.lineWidth = 1.2 * px;
      for (const sc of studs) {
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

  /* ── 전기·설비 기호 ──
     (0, 0)을 가운데로 폭 w, 깊이 h(mm)에 그림. px: 화면 1px의 도면 길이(선 굵기용), bg: 속 채움(없으면 비움) */
  function itemSymbol(ctx, kind, w, h, px, ink, bg, it = null) {
    const variant = it && it.variant;
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    const lw = (k) => { ctx.lineWidth = k * px; };
    const circle = (r, x = 0, y = 0) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); };
    const box = () => { ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w, h); };
    const back = () => { if (bg) { ctx.fillStyle = bg; ctx.fill(); ctx.fillStyle = ink; } };
    const seg = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
    switch (kind) {
      case '콘센트':
        circle(w / 2); back(); lw(1.6); ctx.stroke();
        lw(2); seg(-w * 0.15, -h * 0.2, -w * 0.15, h * 0.2); seg(w * 0.15, -h * 0.2, w * 0.15, h * 0.2);
        break;
      case '스위치':
        circle(w * 0.3); ctx.fill();
        lw(2); seg(0, 0, w * 0.48, -h * 0.48);
        break;
      case '조명': {
        circle(w / 2); back(); lw(1.6); ctx.stroke();
        const r = (w / 2) * 0.7;
        seg(-r, -r, r, r); seg(-r, r, r, -r);
        break;
      }
      case '분전반':
        box(); back(); lw(1.6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-w / 2, h / 2); ctx.lineTo(w / 2, -h / 2); ctx.lineTo(w / 2, h / 2); ctx.closePath(); ctx.fill();
        break;
      case '에어컨 실내기':
        box(); back(); lw(1.6); ctx.stroke();
        lw(1); seg(-w * 0.42, h * 0.18, w * 0.42, h * 0.18);
        ctx.font = `700 ${h * 0.55}px system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('AC', 0, -h * 0.08);
        break;
      case '에어컨 실외기': {
        box(); back(); lw(1.6); ctx.stroke();
        const r = h * 0.36, cx = -w * 0.2;
        circle(r, cx, 0); lw(1.2); ctx.stroke();
        for (let i = 0; i < 3; i++) {
          const a = (i * Math.PI * 2) / 3;
          seg(cx, 0, cx + Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85);
        }
        for (const x of [0.12, 0.24, 0.36]) seg(w * x, -h * 0.32, w * x, h * 0.32);
        break;
      }
      case '환기구':
        box(); back(); lw(1.6); ctx.stroke();
        circle(w * 0.34); lw(1.2); ctx.stroke();
        for (const y of [-0.15, 0, 0.15]) seg(-w * 0.26, h * y, w * 0.26, h * y);
        break;
      case '배수구':
        circle(w / 2); back(); lw(1.6); ctx.stroke();
        circle(w * 0.25); lw(1.2); ctx.stroke();
        seg(-w * 0.18, 0, w * 0.18, 0); seg(0, -h * 0.18, 0, h * 0.18);
        break;
      case '감지기': {
        circle(w / 2); back(); lw(1.5); ctx.stroke();
        ctx.font = `700 ${h * 0.55}px system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(variant === '열' ? 'H' : variant === '가스' ? 'G' : 'S', 0, h * 0.03);
        break;
      }
      case '유도등':
        box(); back(); lw(1.5); ctx.stroke();
        // 달리는 방향 화살표
        ctx.beginPath(); ctx.moveTo(-w * 0.3, 0); ctx.lineTo(w * 0.15, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(w * 0.32, 0); ctx.lineTo(w * 0.1, -h * 0.3); ctx.lineTo(w * 0.1, h * 0.3); ctx.closePath(); ctx.fill();
        break;
      case '비상조명':
        circle(w / 2); back(); lw(1.5); ctx.stroke();
        circle(w * 0.2); ctx.fill();
        seg(-w * 0.42, 0, -w * 0.26, 0); seg(w * 0.26, 0, w * 0.42, 0);
        break;
      case '통신 단자': {
        circle(w / 2); back(); lw(1.5); ctx.stroke();
        const t = variant === 'TV' ? 'T' : variant === '전화' ? 'P' : variant === 'TV+랜' ? 'TL' : 'L';
        ctx.font = `700 ${h * (t.length > 1 ? 0.42 : 0.55)}px system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(t, 0, h * 0.03);
        break;
      }
      case '월패드':
        box(); back(); lw(1.5); ctx.stroke();
        ctx.beginPath(); ctx.rect(-w * 0.3, -h * 0.25, w * 0.6, h * 0.5); lw(1); ctx.stroke();
        break;
      case '시스템 에어컨': {
        box(); back(); lw(1.4); ctx.stroke();
        const m = Math.min(w, h), e = m * 0.07, sl = m * 0.05;
        ctx.beginPath(); ctx.rect(-w / 2 + e * 2.4, -h / 2 + e * 2.4, w - e * 4.8, h - e * 4.8); lw(0.9); ctx.stroke(); // 흡입 그릴
        // 바람 나오는 곳(슬롯): 4way는 네 변, 2way는 앞뒤, 1way는 앞
        const ratio = h / w;
        const slot = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineWidth = Math.max(sl, 1.2 * px); ctx.stroke(); };
        const sx = w / 2 - e * 1.4, sy = h / 2 - e * 1.4;
        slot(-w * 0.32, sy, w * 0.32, sy);
        if (ratio >= 0.45) slot(-w * 0.32, -sy, w * 0.32, -sy);
        if (ratio >= 0.8) { slot(-sx, -h * 0.32, -sx, h * 0.32); slot(sx, -h * 0.32, sx, h * 0.32); }
        break;
      }
      case '점검구': {
        box(); back(); lw(1.4); ctx.stroke();
        const i = Math.min(w, h) * 0.1;
        ctx.beginPath(); ctx.rect(-w / 2 + i, -h / 2 + i, w - i * 2, h - i * 2); lw(0.9); ctx.stroke();
        lw(0.7); seg(-w / 2 + i, -h / 2 + i, w / 2 - i, h / 2 - i); seg(-w / 2 + i, h / 2 - i, w / 2 - i, -h / 2 + i);
        break;
      }
      case '디퓨저': {
        lw(1.3);
        if (variant === '원형') {
          const r = Math.min(w, h) / 2;
          for (const k of [1, 0.66, 0.33]) { circle(r * k); if (k === 1) back(); ctx.stroke(); lw(0.9); }
        } else if (variant === '라인' || h < w * 0.3) {
          box(); back(); ctx.stroke(); lw(0.9);
          seg(-w * 0.45, -h * 0.15, w * 0.45, -h * 0.15); seg(-w * 0.45, h * 0.15, w * 0.45, h * 0.15);
        } else {
          box(); back(); ctx.stroke(); lw(0.9);
          for (const k of [0.66, 0.33]) { ctx.beginPath(); ctx.rect((-w / 2) * k, (-h / 2) * k, w * k, h * k); ctx.stroke(); }
          seg(-w / 2, -h / 2, w / 2, h / 2); seg(-w / 2, h / 2, w / 2, -h / 2);
        }
        break;
      }
      case '스프링클러':
        circle(w / 2); back(); lw(1.4); ctx.stroke();
        seg(-w * 0.36, 0, w * 0.36, 0); seg(0, -h * 0.36, 0, h * 0.36);
        circle(w * 0.12); ctx.fill();
        break;
      case '수전':
        circle(w * 0.32, 0, h * 0.1); back(); lw(1.4); ctx.stroke();
        lw(1.6); seg(0, -h * 0.22, 0, -h * 0.48); seg(-w * 0.22, -h * 0.48, w * 0.22, -h * 0.48); // 손잡이
        break;
      case '보일러':
        box(); back(); lw(1.5); ctx.stroke();
        ctx.font = `700 ${h * 0.6}px system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('B', 0, h * 0.03);
        break;
      default:
        if (furniture(ctx, kind, w, h, lw, seg, box, back)) break;
        if (eventSymbol(ctx, kind, w, h, px, ink, lw, seg, box, back, it)) break;
        circle(w / 2); back(); lw(1.6); ctx.stroke();
    }
  }

  /** 가구 평면 기호 (기호 가운데 기준, 위쪽 -y가 등·벽 쪽). 가구 종류가 아니면 false */
  function furniture(ctx, kind, w, h, lw, seg, box, back) {
    const W = w / 2, H = h / 2, m = Math.min(w, h);
    const rect = (x, y, ww, hh, r = 0) => {
      ctx.beginPath();
      if (r > 0 && ctx.roundRect) ctx.roundRect(x, y, ww, hh, Math.min(r, ww / 2, hh / 2));
      else ctx.rect(x, y, ww, hh);
    };
    const ellipse = (x, y, rx, ry) => { ctx.beginPath(); ctx.ellipse(x, y, Math.max(rx, 0.01), Math.max(ry, 0.01), 0, 0, Math.PI * 2); };
    const outline = () => { box(); back(); lw(1.3); ctx.stroke(); lw(0.9); };
    switch (kind) {
      case '침대': {
        outline();
        const hb = h * 0.05;
        seg(-W, -H + hb, W, -H + hb); // 머리판
        const n = w >= h * 0.65 ? 2 : 1;
        const pw = (w - m * 0.12 * (n + 1)) / n;
        for (let i = 0; i < n; i++) { rect(-W + m * 0.12 + i * (pw + m * 0.12), -H + hb + h * 0.03, pw, h * 0.12, h * 0.03); ctx.stroke(); }
        const fold = -H + h * 0.3; // 이불 접힌 선
        seg(-W, fold, W, fold);
        seg(W - m * 0.28, fold, W, fold + m * 0.28);
        return true;
      }
      case '안락의자':
      case '소파': {
        outline();
        const br = h * 0.25, aw = Math.min(w * 0.12, h * 0.28);
        rect(-W, -H, w, br); ctx.stroke();
        rect(-W, -H + br, aw, h - br); ctx.stroke();
        rect(W - aw, -H + br, aw, h - br); ctx.stroke();
        const n = w >= h * 2 ? 3 : w >= h * 1.4 ? 2 : 1;
        for (let i = 1; i < n; i++) { const x = -W + aw + ((w - aw * 2) * i) / n; seg(x, -H + br, x, H); }
        return true;
      }
      case '식탁': {
        const n = w >= h * 1.7 ? 3 : w >= h * 1.2 ? 2 : 1;
        const cs = Math.min((w / n) * 0.6, h * 0.55);
        for (const side of [-1, 1]) {
          for (let i = 0; i < n; i++) {
            const x = -W + ((i + 0.5) * w) / n;
            const y = side < 0 ? -H - cs * 0.75 : H - cs * 0.25;
            rect(x - cs / 2, y, cs, cs, cs * 0.15); back(); lw(0.9); ctx.stroke();
            const by = side < 0 ? y + cs * 0.12 : y + cs * 0.88;
            seg(x - cs * 0.4, by, x + cs * 0.4, by);
          }
        }
        box(); back(); lw(1.3); ctx.stroke();
        return true;
      }
      case '식탁 의자':
        rect(-W, -H + h * 0.12, w, h * 0.88, m * 0.12); back(); lw(1.3); ctx.stroke();
        rect(-W, -H, w, h * 0.22, m * 0.1); back(); ctx.stroke();
        return true;
      case '책상':
        outline();
        seg(-W, -H + h * 0.22, W, -H + h * 0.22);
        rect(-w * 0.2, -H + h * 0.06, w * 0.4, h * 0.1); ctx.stroke(); // 모니터
        return true;
      case '옷장': {
        outline();
        ctx.setLineDash([m * 0.06, m * 0.05]);
        seg(-W + m * 0.08, 0, W - m * 0.08, 0); // 옷걸이 봉
        ctx.setLineDash([]);
        const n = Math.max(3, Math.round(w / (m * 0.45)));
        for (let i = 1; i < n; i++) { const x = -W + (w * i) / n; seg(x - m * 0.08, -m * 0.16, x + m * 0.08, m * 0.16); }
        seg(-W, H - h * 0.08, W, H - h * 0.08); // 문
        return true;
      }
      case '수납장':
        outline();
        seg(-W, -H, W, H); seg(-W, H, W, -H);
        return true;
      case 'TV장':
        outline();
        rect(-w * 0.35, -H + h * 0.12, w * 0.7, h * 0.16); ctx.fill(); // TV
        return true;
      case '냉장고':
        outline();
        seg(-W, H - h * 0.1, W, H - h * 0.1);
        if (w >= h * 0.95) seg(0, -H, 0, H - h * 0.1); // 양문형
        ctx.font = `600 ${m * 0.2}px system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('냉장고', 0, -h * 0.05);
        return true;
      case '세탁기':
        outline();
        seg(-W, -H + h * 0.18, W, -H + h * 0.18);
        ellipse(0, h * 0.08, m * 0.3, m * 0.3); ctx.stroke();
        ellipse(0, h * 0.08, m * 0.18, m * 0.18); ctx.stroke();
        return true;
      case '싱크대': {
        outline();
        const bw = Math.min(w * 0.35, h * 1.3), bh = h * 0.62;
        const cx = w > h * 2 ? -w * 0.12 : 0;
        rect(cx - bw / 2, -bh / 2 + h * 0.04, bw, bh, bh * 0.2); ctx.stroke();
        ellipse(cx, -H + h * 0.1, m * 0.04, m * 0.04); ctx.fill(); // 수전
        if (w > h * 2) for (let i = 0; i < 2; i++) { ellipse(w * 0.22 + (i - 0.5) * h * 0.4, 0, h * 0.14, h * 0.14); ctx.stroke(); }
        return true;
      }
      case '쿡탑': {
        outline();
        const r = Math.min(w / 4, h / 4) * 0.72;
        for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ellipse((x * w) / 4, (y * h) / 4, r, r); ctx.stroke(); }
        return true;
      }
      case '변기':
        rect(-W, -H, w, h * 0.24, m * 0.08); back(); lw(1.3); ctx.stroke(); // 물탱크
        ellipse(0, -H + h * 0.24 + h * 0.38, W * 0.92, h * 0.37); back(); ctx.stroke();
        lw(0.9); ellipse(0, -H + h * 0.24 + h * 0.4, W * 0.6, h * 0.24); ctx.stroke();
        return true;
      case '세면대':
        rect(-W, -H, w, h, m * 0.12); back(); lw(1.3); ctx.stroke();
        lw(0.9); ellipse(0, h * 0.08, W * 0.72, H * 0.6); ctx.stroke();
        ellipse(0, -H + h * 0.14, m * 0.04, m * 0.04); ctx.fill();
        return true;
      case '욕조': {
        outline();
        const i = m * 0.09;
        rect(-W + i, -H + i, w - i * 2, h - i * 2, h * 0.3); ctx.stroke();
        ellipse(W - h * 0.28, 0, m * 0.04, m * 0.04); ctx.stroke(); // 배수구
        return true;
      }
      case '샤워부스':
        outline();
        seg(-W, H, W, -H);
        ellipse(0, 0, m * 0.06, m * 0.06); ctx.stroke();
        return true;
      case '신발장': {
        outline();
        const n = Math.min(5, Math.max(2, Math.round(w / (h * 1.2))));
        for (let i = 1; i < n; i++) { const x = -W + (w * i) / n; seg(x, -H, x, H); }
        seg(-W, H - h * 0.12, W, H - h * 0.12);
        return true;
      }
      // ── 2.2 가구
      case 'L자 소파': {
        const sd = h * 0.6, cw = w * 0.36, br = h * 0.14, aw = w * 0.07;
        ctx.beginPath();
        ctx.moveTo(-W, -H); ctx.lineTo(W, -H); ctx.lineTo(W, H); ctx.lineTo(W - cw, H); ctx.lineTo(W - cw, -H + sd); ctx.lineTo(-W, -H + sd); ctx.closePath();
        back(); lw(1.3); ctx.stroke(); lw(0.9);
        rect(-W, -H, w, br); ctx.stroke();
        rect(-W, -H + br, aw, sd - br); ctx.stroke();
        const span = w - aw - cw, n = Math.max(1, Math.round(span / (h * 0.45)));
        for (let i = 1; i < n; i++) { const x = -W + aw + (span * i) / n; seg(x, -H + br, x, -H + sd); }
        seg(W - cw, -H + br, W - cw, -H + sd);
        return true;
      }
      case '거실 테이블':
        rect(-W, -H, w, h, m * 0.12); back(); lw(1.3); ctx.stroke();
        lw(0.9); rect(-W + m * 0.12, -H + m * 0.12, w - m * 0.24, h - m * 0.24, m * 0.06); ctx.stroke();
        return true;
      case '책장': {
        outline();
        const n = Math.max(2, Math.round(w / (h * 1.5)));
        for (let i = 1; i < n; i++) { const x = -W + (w * i) / n; seg(x, -H, x, H); }
        seg(-W, H - h * 0.18, W, H - h * 0.18);
        return true;
      }
      case '피아노': {
        const body = h * 0.62;
        rect(-W, -H, w, body); back(); lw(1.3); ctx.stroke(); lw(0.9);
        rect(-W + w * 0.04, -H + body * 0.58, w * 0.92, body * 0.38); ctx.stroke();
        const keys = Math.max(6, Math.round(w / (m * 0.09)));
        for (let i = 1; i < keys; i++) { const x = -W + w * 0.04 + (w * 0.92 * i) / keys; seg(x, -H + body * 0.58, x, -H + body * 0.8); }
        rect(-w * 0.24, -H + body + (h - body) * 0.25, w * 0.48, (h - body) * 0.5); back(); ctx.stroke();
        return true;
      }
      case '협탁':
        outline();
        ellipse(0, -h * 0.05, m * 0.24, m * 0.24); ctx.stroke();
        ellipse(0, -h * 0.05, m * 0.06, m * 0.06); ctx.fill();
        return true;
      case '화장대': {
        const td = h * 0.56;
        rect(-W, -H, w, td); back(); lw(1.3); ctx.stroke(); lw(0.9);
        rect(-w * 0.3, -H, w * 0.6, Math.max(h * 0.05, m * 0.04)); ctx.fill();
        rect(-W, -H, w * 0.35, td); ctx.stroke();
        ellipse(0, -H + td + (h - td) * 0.5, Math.min(w, h - td) * 0.22, Math.min(w, h - td) * 0.22); back(); ctx.stroke();
        return true;
      }
      case '아일랜드 식탁': {
        const top = h * 0.69;
        rect(-W, -H, w, top); back(); lw(1.3); ctx.stroke(); lw(0.9);
        ctx.setLineDash([m * 0.04, m * 0.03]); rect(-W + w * 0.01, -H, w * 0.98, top * 0.7); ctx.stroke(); ctx.setLineDash([]);
        const n = Math.max(2, Math.round(w / (h * 0.42))), r = Math.min((w / n) * 0.3, (h - top) * 0.42);
        for (let i = 0; i < n; i++) { ellipse(-W + ((i + 0.5) * w) / n, -H + top + (h - top) * 0.5, r, r); back(); ctx.stroke(); }
        return true;
      }
      case '바 테이블': {
        const r = Math.min(h * 0.5, w * 0.2), sr = Math.min(h * 0.3, w * 0.14);
        ellipse(0, 0, r, r); back(); lw(1.3); ctx.stroke(); lw(0.9);
        [-1, 1].forEach((sd) => { ellipse(sd * (W - sr * 1.2), 0, sr, sr); back(); ctx.stroke(); });
        return true;
      }
      case '사무용 의자': {
        lw(0.9);
        for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + 0.3; seg(0, 0, Math.cos(a) * W * 0.95, Math.sin(a) * H * 0.95); }
        rect(-W * 0.78, -H * 0.62, w * 0.78, h * 0.84, m * 0.12); back(); lw(1.3); ctx.stroke();
        rect(-W * 0.72, -H, w * 0.72, h * 0.16, m * 0.06); back(); ctx.stroke();
        return true;
      }
      case '회의 테이블': {
        const n = Math.max(2, Math.round(w / (h * 0.68))), cs = Math.min((w / n) * 0.55, h * 0.42);
        const chair = (x, y, rot) => {
          ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
          rect(-cs / 2, -cs / 2, cs, cs, cs * 0.2); back(); lw(0.9); ctx.stroke();
          seg(-cs * 0.4, -cs * 0.38, cs * 0.4, -cs * 0.38);
          ctx.restore();
        };
        for (let i = 0; i < n; i++) {
          const x = -W + ((i + 0.5) * w) / n;
          chair(x, -H - cs * 0.45, 0);
          chair(x, H + cs * 0.45, Math.PI);
        }
        if (w >= h * 2.1) { chair(-W - cs * 0.45, 0, -Math.PI / 2); chair(W + cs * 0.45, 0, Math.PI / 2); }
        rect(-W, -H, w, h, m * 0.15); back(); lw(1.3); ctx.stroke();
        return true;
      }
      case '파티션':
        box(); ctx.fill();
        return true;
      case '서류 캐비닛':
        outline();
        seg(-W, H - h * 0.14, W, H - h * 0.14);
        for (const k of [-0.25, 0.25]) seg(k * w - w * 0.08, H - h * 0.07, k * w + w * 0.08, H - h * 0.07);
        return true;
      case '카운터':
        outline();
        seg(-W, H - h * 0.12, W, H - h * 0.12);
        rect(-W + w * 0.08, -H + h * 0.3, w * 0.16, h * 0.28); ctx.stroke();
        return true;
      case '진열장':
        outline();
        ctx.setLineDash([m * 0.08, m * 0.06]); seg(-W, H - h * 0.1, W, H - h * 0.1); ctx.setLineDash([]);
        seg(0, H - h * 0.1, 0, H);
        return true;
      case '러그': {
        box(); back(); lw(1.1); ctx.stroke(); lw(0.8);
        const e = m * 0.1;
        ctx.setLineDash([m * 0.05, m * 0.04]); rect(-W + e, -H + e, w - e * 2, h - e * 2); ctx.stroke(); ctx.setLineDash([]);
        const step = Math.max(m * 0.06, 1e-3);
        for (let x = -W; x <= W + 1e-6; x += step) { seg(x, -H, x, -H - m * 0.05); seg(x, H, x, H + m * 0.05); }
        return true;
      }
      case '실내 화분': {
        ellipse(0, 0, m * 0.3, m * 0.3); back(); lw(1.2); ctx.stroke(); lw(0.9);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + 0.4;
          ctx.beginPath(); ctx.ellipse(Math.cos(a) * m * 0.27, Math.sin(a) * m * 0.27, m * 0.2, m * 0.08, a, 0, Math.PI * 2); ctx.stroke();
        }
        return true;
      }
      case '스탠드 조명':
        ctx.setLineDash([m * 0.08, m * 0.06]); ellipse(0, 0, m * 0.48, m * 0.48); ctx.stroke(); ctx.setLineDash([]);
        lw(1.2); ellipse(0, 0, m * 0.34, m * 0.34); back(); ctx.stroke();
        ellipse(0, 0, m * 0.1, m * 0.1); ctx.fill();
        return true;
      default:
        return false;
    }
  }

  /** 조감도 물건 평면 기호 (기호 가운데 기준, 위쪽 -y가 등, 아래쪽 +y가 앞. 차는 오른쪽 +x가 앞). 조감도 종류가 아니면 false.
      it가 없으면(팔레트 아이콘) 크기 단위가 mm가 아니므로 비율로만 그림 */
  function eventSymbol(ctx, kind, w, h, px, ink, lw, seg, box, back, it) {
    const W = w / 2, H = h / 2, m = Math.min(w, h);
    const circle = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, Math.max(r, 0.01), 0, Math.PI * 2); };
    const rect = (x, y, ww, hh) => { ctx.beginPath(); ctx.rect(x, y, ww, hh); };
    const rrect = (x, y, ww, hh, r) => {
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, ww, hh, Math.max(0, Math.min(r, ww / 2, hh / 2)));
      else ctx.rect(x, y, ww, hh);
    };
    /** 지금 경로를 옅게 채움 (color가 없으면 선 색) */
    const tint = (alpha, color) => {
      const a = ctx.globalAlpha, f = ctx.fillStyle;
      if (color) ctx.fillStyle = color;
      ctx.globalAlpha = a * alpha;
      ctx.fill();
      ctx.globalAlpha = a;
      ctx.fillStyle = f;
    };
    /** 물건에 색을 정했으면 그 색으로 옅게 */
    const paint = (alpha = 0.26) => { if (it && it.color && ink !== App.plan.colors.accent) tint(alpha, it.color); };
    const outline = (k = 1.3) => { box(); back(); paint(); lw(k); ctx.stroke(); lw(0.9); };
    const label = (text, size, y = 0) => {
      ctx.font = `700 ${size}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, 0, y);
    };
    const style = it && it.style;
    /** 의자 하나: (cx, cy) 가운데, 폭 cw × 깊이 ch, 등받이는 -y 쪽. rot(라디안) 만큼 돌림 */
    const chair = (cx, cy, cw, ch, rot = 0) => {
      ctx.save();
      ctx.translate(cx, cy);
      if (rot) ctx.rotate(rot);
      if (style === '스툴') {
        circle(0, 0, Math.min(cw, ch) * 0.42); back(); ctx.stroke();
      } else {
        rect(-cw / 2, -ch / 2, cw, ch); back(); ctx.stroke();
        rect(-cw / 2, -ch / 2, cw, ch * 0.22); ctx.fill();
      }
      ctx.restore();
    };
    const dash = (on) => ctx.setLineDash(on ? [m * 0.06, m * 0.05] : []);
    switch (kind) {
      case '몽골텐트': {
        outline();
        seg(-W, -H, W, H); seg(-W, H, W, -H);
        circle(0, 0, m * 0.04); ctx.fill();
        const v = it && it.variant;
        if (v === '뒤' || v === '뒤·양옆') { lw(2.8); seg(-W, -H, W, -H); }
        if (v === '뒤·양옆') { seg(-W, -H, -W, H); seg(W, -H, W, H); }
        return true;
      }
      case '의무실 텐트': {
        outline();
        seg(-W, -H, W, H); seg(-W, H, W, -H);
        const v = it && it.variant;
        if (v !== '없음') { lw(2.8); seg(-W, -H, W, -H); if (v !== '뒤') { seg(-W, -H, -W, H); seg(W, -H, W, H); } lw(0.9); }
        // 가운데 빨간 십자
        const f = ctx.fillStyle, k = m * 0.2, t = m * 0.07;
        ctx.fillStyle = '#e03131';
        ctx.fillRect(-k, -t, k * 2, t * 2); ctx.fillRect(-t, -k, t * 2, k * 2);
        ctx.fillStyle = f;
        return true;
      }
      case '대형 텐트': {
        outline();
        const wide = w >= h;
        if (it && it.variant === '박공 지붕') {
          if (wide) seg(-W, 0, W, 0); else seg(0, -H, 0, H); // 용마루
          const n = Math.max(2, Math.round(Math.max(w, h) / 5000));
          for (let i = 1; i < n; i++) {
            const t = -1 + (2 * i) / n;
            if (wide) seg(W * t, -H, W * t, H); else seg(-W, H * t, W, H * t);
          }
          return true;
        }
        const n = Math.max(1, Math.round(Math.max(w, h) / m));
        for (let i = 0; i < n; i++) {
          const a0 = -1 + (2 * i) / n, a1 = -1 + (2 * (i + 1)) / n;
          if (wide) {
            seg(W * a0, -H, W * a1, H); seg(W * a0, H, W * a1, -H);
            if (i) seg(W * a0, -H, W * a0, H);
          } else {
            seg(-W, H * a0, W, H * a1); seg(W, H * a0, -W, H * a1);
            if (i) seg(-W, H * a0, W, H * a0);
          }
        }
        return true;
      }
      case '파라솔': {
        const r = m / 2;
        circle(0, 0, r); back(); paint(); lw(1.3); ctx.stroke(); lw(0.8);
        for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; seg(0, 0, Math.cos(a) * r, Math.sin(a) * r); }
        circle(0, 0, r * 0.08); ctx.fill();
        return true;
      }
      case '무대':
        outline(2);
        seg(-W, H - m * 0.08, W, H - m * 0.08); // 앞쪽 끝
        if (it && it.variant === '트러스 지붕') {
          const q = Math.min(m * 0.07, 400);
          for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { rect(sx * (W - q) - q / 2, sy * (H - q) - q / 2, q, q); ctx.fill(); }
          dash(true); rect(-W + q, -H + q, w - q * 2, h - q * 2); ctx.stroke(); dash(false);
        }
        label('무대', m * 0.24);
        return true;
      case '계단': {
        outline();
        const n = 4;
        for (let i = 1; i < n; i++) seg(-W, -H + (h * i) / n, W, -H + (h * i) / n);
        lw(1.3);
        seg(0, H * 0.7, 0, -H * 0.55);
        ctx.beginPath(); ctx.moveTo(0, -H * 0.8); ctx.lineTo(-m * 0.12, -H * 0.45); ctx.lineTo(m * 0.12, -H * 0.45); ctx.closePath(); ctx.fill();
        return true;
      }
      case '트러스': {
        outline();
        const n = Math.max(2, Math.round(w / h));
        for (let i = 0; i < n; i++) {
          const x0 = -W + (w * i) / n, x1 = -W + (w * (i + 1)) / n;
          if (i % 2) seg(x0, H, x1, -H); else seg(x0, -H, x1, H);
        }
        return true;
      }
      case '부스': {
        box(); back(); paint();
        ctx.beginPath(); ctx.moveTo(-W, H); ctx.lineTo(-W, -H); ctx.lineTo(W, -H); ctx.lineTo(W, H);
        lw(2.6); ctx.stroke(); // 뒤·옆 벽
        lw(0.9);
        dash(true);
        seg(-W, H, W, H); // 열린 앞쪽
        dash(false);
        return true;
      }
      case '에어아치': {
        const r = Math.min(H, W * 0.25);
        dash(true); lw(0.9); rect(-W + r, -r * 0.7, w - r * 2, r * 1.4); paint(0.3); ctx.stroke(); dash(false);
        for (const s of [-1, 1]) { circle(s * (W - r), 0, r); back(); paint(0.4); lw(1.3); ctx.stroke(); }
        return true;
      }
      case '원형 테이블': {
        const r = m / 2;
        lw(0.9);
        const n = it ? (App.catalog.seats(it) || { count: 0 }).count : 8;
        const cs = it ? 430 : r * 0.55;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const d = r + cs * 0.62;
          chair(Math.sin(a) * d, -Math.cos(a) * d, cs, cs, a); // 등받이가 바깥쪽
        }
        circle(0, 0, r); back(); paint(); lw(1.3); ctx.stroke();
        return true;
      }
      case '테이블': {
        const n = it ? (App.catalog.seats(it) || { count: 0 }).count : 0;
        const cs = it ? 430 : h * 0.7;
        lw(0.9);
        const top = Math.ceil(n / 2), bottom = n - top;
        for (let i = 0; i < top; i++) chair(-W + ((i + 0.5) * w) / top, -H - cs * 0.58, cs, cs, 0);
        for (let i = 0; i < bottom; i++) chair(-W + ((i + 0.5) * w) / bottom, H + cs * 0.58, cs, cs, Math.PI);
        outline();
        return true;
      }
      case '스탠딩 테이블':
        circle(0, 0, m / 2); back(); paint(); lw(1.3); ctx.stroke();
        circle(0, 0, m * 0.1); ctx.fill();
        return true;
      case '데스크':
        outline();
        seg(-W, -H + h * 0.3, W, -H + h * 0.3);
        return true;
      case '의자':
        lw(1.1);
        chair(0, 0, w, h);
        return true;
      case '의자 배열': {
        lw(0.9);
        dash(true); box(); ctx.stroke(); dash(false);
        if (!it) {
          const pw = w / 4, ph = h / 3;
          for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) chair(-W + (c + 0.5) * pw, -H + (r + 0.5) * ph, pw * 0.8, ph * 0.62);
          return true;
        }
        const L = App.catalog.seatLayout(it);
        if (L.pw / px < 4) {
          // 멀리서는 묶음·줄마다 띠로
          App.catalog.seatBlocks(it).forEach(([x0, x1]) => {
            for (let r = 0; r < L.rows; r++) { rect(-W + x0, -H + r * L.ph + L.ph * 0.05, x1 - x0, L.ph * 0.5); tint(0.45); }
          });
          return true;
        }
        const cw = Math.min(L.pw * 0.86, 470), ch = Math.min(L.ph * 0.52, cw);
        for (let r = 0; r < L.rows; r++) {
          const [c0, c1] = L.rowRange(r);
          for (let c = c0; c < c1; c++) chair(-W + L.xs[c], -H + r * L.ph + ch / 2 + L.ph * 0.04, cw, ch);
        }
        return true;
      }
      case '펜스':
        outline();
        for (let i = 1; i < 4; i++) seg(-W + (w * i) / 4, -H, -W + (w * i) / 4, H);
        return true;
      case 'LED 스크린':
        box(); ctx.fill(); lw(1.3); ctx.stroke();
        return true;
      case '백월':
      case '포토월':
      case '액자·벽보':
        box(); back(); tint(0.35, it && it.color); lw(1.3); ctx.stroke();
        return true;
      case '현수막':
      case '테이프 커팅':
      case '차단봉': {
        const r = Math.max(Math.min(H, w * 0.06), 2 * px);
        const n = kind === '차단봉' ? Math.max(1, Math.round(w / (it ? 2000 : w / 2))) : 1;
        ctx.save();
        if (it && it.color) ctx.strokeStyle = it.color;
        lw(kind === '현수막' ? 2.6 : 1.8);
        seg(-W + r, 0, W - r, 0);
        ctx.restore();
        lw(1.2);
        for (let i = 0; i <= n; i++) { circle(-W + r + ((w - r * 2) * i) / n, 0, r); back(); ctx.fill(); }
        if (kind === '테이프 커팅') {
          const b = Math.max(r * 1.6, 3 * px);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-b, -b * 0.7); ctx.lineTo(-b, b * 0.7); ctx.closePath(); ctx.fill();
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(b, -b * 0.7); ctx.lineTo(b, b * 0.7); ctx.closePath(); ctx.fill();
        }
        return true;
      }
      case 'X배너':
        lw(1.1); seg(-W, -H, W, H); seg(-W, H, W, -H);
        lw(2.6); seg(-W, H, W, H);
        return true;
      case '안내판':
        lw(0.9); rect(-W * 0.5, -H, w * 0.5, h); ctx.stroke();
        lw(2.6); seg(-W, H, W, H);
        return true;
      case '깃발':
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, -H * 0.45); ctx.lineTo(0, -H * 0.9); ctx.closePath();
        tint(0.5, it && it.color); lw(1.1); ctx.stroke();
        circle(0, 0, m * 0.13); ctx.fill();
        return true;
      case '연단':
        outline();
        seg(-W, -H + h * 0.32, W, -H + h * 0.32);
        circle(0, -H + h * 0.16, m * 0.06); ctx.fill();
        return true;
      case '레드카펫':
        box(); tint(0.4, (it && it.color) || '#e03131'); lw(1.1); ctx.stroke();
        return true;
      case '바닥 이미지': {
        const img = it && App.images.get(it.imageId);
        if (img) {
          ctx.save();
          ctx.globalAlpha *= 0.9;
          ctx.drawImage(img, -W, -H, w, h);
          ctx.restore();
        }
        dash(true); lw(1); box(); ctx.stroke(); dash(false);
        if (!img) {
          seg(-W, -H, W, H); seg(-W, H, W, -H);
          if (it && it.text) label(String(it.text).split('\n')[0].slice(0, 12), Math.min(m * 0.2, w / 8));
        }
        return true;
      }
      case '화분':
        if (style === '꽃 화단') {
          outline();
          for (let i = 0; i < 3; i++) { circle(-W + ((i + 0.5) * w) / 3, 0, m * 0.2); tint(0.5, it && it.color); ctx.stroke(); }
          return true;
        }
        circle(0, 0, m / 2); back(); tint(0.2, it && it.color); lw(1.3); ctx.stroke(); lw(0.9);
        circle(0, 0, m * 0.26); ctx.stroke();
        if (style === '축하 화환') { seg(-m * 0.12, m * 0.26, -m * 0.2, m * 0.5); seg(m * 0.12, m * 0.26, m * 0.2, m * 0.5); }
        return true;
      case '스피커':
        outline();
        circle(0, 0, m * 0.3); ctx.stroke();
        circle(0, 0, m * 0.1); ctx.fill();
        return true;
      case '라인어레이':
        outline();
        for (const k of [-0.45, -0.1, 0.25]) seg(-W, H * k, W, H * k);
        rect(-W, H - h * 0.18, w, h * 0.18); ctx.fill();
        return true;
      case '모니터 스피커':
        ctx.beginPath(); ctx.moveTo(-W, H); ctx.lineTo(W, H); ctx.lineTo(W * 0.72, -H); ctx.lineTo(-W * 0.72, -H); ctx.closePath();
        back(); lw(1.3); ctx.stroke();
        circle(0, H * 0.1, m * 0.22); lw(0.9); ctx.stroke();
        return true;
      case '콘솔 데스크': {
        outline();
        rect(-W * 0.8, -H * 0.55, w * 0.8, h * 0.6); ctx.stroke();
        for (let i = 0; i < 6; i++) { const x = -W * 0.7 + (w * 0.7 * i) / 5; seg(x, -H * 0.35, x, H * 0.25); }
        return true;
      }
      case '조명 타워':
        outline();
        seg(-W, -H, W, H); seg(-W, H, W, -H);
        circle(0, 0, m * 0.2); back(); ctx.stroke();
        return true;
      case '발전기':
        outline();
        seg(-W * 0.55, -H, -W * 0.55, H);
        label('G', m * 0.5, 0);
        return true;
      case '이동식 화장실':
        outline();
        label('WC', m * 0.34);
        return true;
      case '푸드트럭':
        rrect(-W, -H, w, h, m * 0.12);
        back(); paint(); lw(1.3); ctx.stroke(); lw(0.9);
        seg(W - w * 0.22, -H, W - w * 0.22, H); // 운전석
        lw(2.6); seg(-W + w * 0.12, H, W - w * 0.36, H); // 판매 창 (앞쪽)
        return true;
      case '쓰레기통':
        circle(0, 0, m / 2); back(); paint(); lw(1.3); ctx.stroke();
        circle(0, 0, m * 0.28); lw(0.9); ctx.stroke();
        return true;
      case '러버콘':
        outline();
        circle(0, 0, m * 0.3); ctx.stroke();
        circle(0, 0, m * 0.08); ctx.fill();
        return true;
      case '소화기':
        circle(0, 0, m / 2); back(); lw(1.3); ctx.stroke();
        label('소', m * 0.6, m * 0.03);
        return true;
      case '사람': {
        const person = (x, y, rx, ry, r) => {
          ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); back(); ctx.stroke();
          circle(x, y, r); ctx.fill();
        };
        lw(1);
        if (!it) { person(0, 0, w * 0.42, h * 0.3, m * 0.2); return true; }
        const n = Math.max(1, it.count || 1), per = Math.max(1, Math.min(n, it.perRow || 10));
        const rows = Math.ceil(n / per), cw = w / per;
        if (cw / px < 5) {
          for (let r = 0; r < rows; r++) { rect(-W, -H + r * 600, w, 400); tint(0.45); }
          return true;
        }
        for (let i = 0; i < n; i++) {
          const r = Math.floor(i / per), c = i % per;
          const inRow = r === rows - 1 ? n - per * (rows - 1) : per;
          person(-W + (w - inRow * cw) / 2 + (c + 0.5) * cw, -H + 200 + r * 600, 230, 120, 95);
        }
        return true;
      }
      case '승용차':
      case '버스': {
        rrect(-W, -H, w, h, m * (kind === '버스' ? 0.14 : 0.3));
        back(); paint(); lw(1.3); ctx.stroke(); lw(0.9);
        if (kind === '버스') {
          seg(W - w * 0.07, -H * 0.8, W - w * 0.07, H * 0.8);
          for (let i = 1; i < 7; i++) { const x = -W + (w * 0.9 * i) / 7; seg(x, -H, x, -H * 0.8); seg(x, H, x, H * 0.8); }
        } else {
          rrect(-W * 0.55, -H * 0.78, w * 0.5, h * 0.78, m * 0.12); ctx.stroke(); // 지붕
          seg(W * 0.45, -H * 0.78, W * 0.62, -H * 0.55); seg(W * 0.45, H * 0.78, W * 0.62, H * 0.55);
        }
        return true;
      }
      case '건물': {
        box(); back(); tint(0.16, it && it.color); lw(2.6); ctx.stroke(); lw(0.8);
        const step = Math.max(m * 0.22, 6 * px);
        ctx.save();
        ctx.beginPath(); ctx.rect(-W, -H, w, h); ctx.clip();
        ctx.globalAlpha *= 0.45;
        for (let x = -W - h; x < W; x += step) seg(x, H, x + h, -H);
        ctx.restore();
        lw(4); ctx.save(); ctx.strokeStyle = App.plan ? App.plan.colors.canvasBg : '#fff'; if (it) seg(-Math.min(W * 0.2, 1500), H, Math.min(W * 0.2, 1500), H); ctx.restore(); // 출입구 (앞쪽 가운데)
        if (it) label(`건물 ${it.floors || 1}층`, Math.min(m * 0.2, w / 8));
        return true;
      }
      case '나무': {
        const r = m / 2;
        ctx.beginPath();
        for (let i = 0; i <= 10; i++) {
          const a0 = (i / 10) * Math.PI * 2;
          ctx.arc(Math.cos(a0) * r * 0.72, Math.sin(a0) * r * 0.72, r * 0.3, a0 - 1.2, a0 + 1.2);
        }
        ctx.closePath();
        tint(0.14); lw(1.1); ctx.stroke();
        circle(0, 0, r * 0.1); ctx.fill();
        return true;
      }
      case '담장':
        box(); tint(0.5); lw(1.1); ctx.stroke();
        return true;
      case '주차 구획': {
        const n = it ? Math.max(1, it.count || 1) : 3;
        lw(1.4);
        seg(-W, -H, W, -H);
        for (let i = 0; i <= n; i++) seg(-W + (w * i) / n, -H, -W + (w * i) / n, H);
        return true;
      }
      case '가로등':
        circle(0, 0, m * 0.35); ctx.fill();
        lw(1.2); seg(0, 0, 0, m * 1.3);
        circle(0, m * 1.3, m * 0.3); back(); ctx.stroke();
        return true;
      default: {
        // 따로 기호가 없는 조감도 물건: 자리 상자와 이름 첫 글자
        const d = App.catalog.itemDef(kind);
        if (!d || d.category !== 'event') return false;
        outline();
        if (it) label(kind.replace(/\s/g, '').slice(0, 3), Math.min(m * 0.3, w / 4));
        else { seg(-W, -H, W, H); }
        return true;
      }
    }
  }

  /** 조감도 물건·가구는 3D 모형을 위에서 본 그림으로 (아직 못 만들었거나 꺼 두었으면 기호). 벽에 거는 것은 기호 */
  const pictureOf = (plan, it) => ((it.category === 'event' || it.category === 'furn') && it.depth != null && App.sprites && App.settings.planPictures !== false
    && !(App.catalog.itemDef(it.kind) || {}).wall ? App.sprites.top(it, plan.view.scale * plan.dpr) : null);

  function itemShape(plan, it, color, alpha = 1) {
    const ctx = plan.ctx;
    const pic = pictureOf(plan, it);
    if (pic) {
      const px = 1 / plan.view.scale;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(it.x, it.y);
      ctx.rotate((it.rotation * Math.PI) / 180);
      ctx.drawImage(pic.canvas, pic.x0, pic.z0, pic.w, pic.d);
      if (it.category === 'furn' && !color) {
        // 인테리어 가구: 도면처럼 보이게 자리 테두리를 옅게
        ctx.globalAlpha = alpha * 0.35;
        ctx.lineWidth = px;
        ctx.strokeStyle = plan.colors.furn || '#6b4f2a';
        ctx.strokeRect(-it.size / 2, -it.depth / 2, it.size, it.depth);
        ctx.globalAlpha = alpha;
      }
      if (color) {
        // 고름·가리킴: 자리 테두리
        ctx.globalAlpha = alpha * 0.1;
        ctx.fillStyle = color;
        ctx.fillRect(-it.size / 2, -it.depth / 2, it.size, it.depth);
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 2 * px;
        ctx.strokeStyle = color;
        ctx.strokeRect(-it.size / 2 - 2 * px, -it.depth / 2 - 2 * px, it.size + 4 * px, it.depth + 4 * px);
      }
      ctx.restore();
      return;
    }
    const { w, h } = App.model.TYPES.item.dims(it);
    const ink = color || plan.colors[it.category] || plan.colors.mech;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(it.x, it.y);
    ctx.rotate((it.rotation * Math.PI) / 180);
    itemSymbol(ctx, it.kind, w, h, 1 / plan.view.scale, ink, plan.colors.canvasBg, it);
    ctx.restore();
  }

  /* ── 선(전선관·배관·덕트) ──
     전선관: 점선, 배관: 실선, 덕트: 실제 폭의 띠, 기타: 짧은 점선 */
  function lineShape(plan, l, preset, color, alpha = 1, extraPx = 0) {
    const ctx = plan.ctx;
    const px = 1 / plan.view.scale;
    const cat = preset ? preset.category : '기타';
    const ink = color || (preset && preset.color) || plan.colors.mech;
    if (G.samePoint(l.start, l.end, 0.01)) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = ink;
    ctx.lineCap = 'round';
    if (cat === '덕트') {
      const width = Math.max(preset.size, 4 * px) + extraPx * 2 * px;
      const d = G.unit({ x: l.end.x - l.start.x, y: l.end.y - l.start.y });
      const n = G.perp(d);
      const h = width / 2;
      const pts = [
        { x: l.start.x + n.x * h, y: l.start.y + n.y * h }, { x: l.end.x + n.x * h, y: l.end.y + n.y * h },
        { x: l.end.x - n.x * h, y: l.end.y - n.y * h }, { x: l.start.x - n.x * h, y: l.start.y - n.y * h },
      ];
      ctx.beginPath();
      polygon(ctx, pts);
      ctx.fillStyle = ink;
      ctx.globalAlpha = alpha * (extraPx ? 1 : 0.18);
      ctx.fill();
      ctx.globalAlpha = alpha;
      if (!extraPx) {
        ctx.lineWidth = 1.4 * px;
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(l.start.x, l.start.y);
      ctx.lineTo(l.end.x, l.end.y);
      ctx.lineWidth = ((cat === '배관' ? 2.6 : 2) + extraPx * 2) * px;
      if (!extraPx) ctx.setLineDash(cat === '전선관' ? [8 * px, 5 * px] : cat === '기타' ? [2 * px, 4 * px] : []);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ── 영역 ── */
  function drawZones(plan, zones, marks) {
    const ctx = plan.ctx;
    const px = 1 / plan.view.scale;
    zones.forEach((z) => {
      const selected = App.selection.has(z.id);
      const marked = marks && marks.ids.has(z.id);
      ctx.beginPath();
      polygon(ctx, z.points);
      // 바닥 종류(잔디·아스팔트 등)를 정한 영역은 그 색으로 더 진하게
      const color = App.catalog.surfaceColor(z);
      const base = z.surface ? 0.3 : 0.1;
      ctx.fillStyle = marked ? plan.colors[marks.color] : color;
      ctx.globalAlpha = selected ? base + 0.12 : marked ? base + 0.08 : base;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.setLineDash([8 * px, 5 * px]);
      ctx.lineWidth = (selected ? 2.4 : 1.6) * px;
      ctx.strokeStyle = selected ? plan.colors.accent : color;
      ctx.stroke();
      ctx.setLineDash([]);
    });
  }

  function drawZoneLabels(plan, zones) {
    const ctx = plan.ctx, Z = App.model.TYPES.zone;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 작은 영역부터 씀: 다른 영역을 품은 큰 영역(부지 전체)의 이름표는 위(안 되면 아래) 가장자리에, 이름표끼리 겹쳐도 비킴
    const placed = [], inner = [];
    const hit = (b) => placed.some((p) => b.x0 < p.x1 && b.x1 > p.x0 && b.y0 < p.y1 && b.y1 > p.y0);
    zones.map((z) => ({ z, area: Z.area(z) })).sort((a, b) => a.area - b.area).forEach(({ z, area }) => {
      const b = Z.bounds(z);
      if ((b.maxX - b.minX) * plan.view.scale < 50 || (b.maxY - b.minY) * plan.view.scale < 36) return;
      const lines = [[z.name, ROOM_NAME_FONT, -9], [App.units.formatArea(area), ROOM_AREA_FONT, 9]];
      const w = Math.max(...lines.map(([text, font]) => { ctx.font = font; return ctx.measureText(text).width; }));
      const boxAt = (q) => ({ x0: q.x - w / 2 - 4, x1: q.x + w / 2 + 4, y0: q.y - 18, y1: q.y + 18 });
      const center = G.interiorPoint(z.points);
      let s = plan.view.toScreen(center.x, center.y);
      const nested = inner.some((p) => G.pointInPolygon(p, z.points));
      inner.push(center);
      if (nested || hit(boxAt(s))) {
        const mid = (b.minX + b.maxX) / 2;
        const alt = [[b.minY, 24], [b.maxY, -24]].map(([y, dy]) => { const q = plan.view.toScreen(mid, y); return { x: q.x, y: q.y + dy }; })
          .find((q) => G.pointInPolygon(plan.view.toWorld(q.x, q.y), z.points) && !hit(boxAt(q)));
        if (alt) s = alt;
      }
      placed.push(boxAt(s));
      lines.forEach(([text, font, dy]) => {
        ctx.font = font;
        ctx.lineWidth = 3;
        ctx.strokeStyle = plan.colors.canvasBg;
        ctx.strokeText(text, s.x, s.y + dy);
        ctx.fillStyle = App.selection.has(z.id) ? plan.colors.accent : (z.surface ? plan.colors.fg || plan.colors.wall : z.color);
        ctx.fillText(text, s.x, s.y + dy);
      });
    });
  }

  /* ── 동선: 통로 폭 띠 + 가운데 점선 + 방향 화살표. 걸리는 구간은 빨갛게 ── */
  const ROUTE_BAD = '#e03131';
  function strokePath(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
  /** 동선을 따라 s0~s1(mm) 구간의 점들 */
  function subPath(r, s0, s1) {
    const R = App.routes;
    const out = [R.pointAt(r, s0)];
    let acc = 0;
    for (let i = 1; i < r.points.length; i++) {
      acc += G.dist(r.points[i - 1], r.points[i]);
      if (acc > s0 && acc < s1) out.push(r.points[i]);
    }
    out.push(R.pointAt(r, s1));
    return out;
  }
  function arrowHead(ctx, p, dir, size) {
    const n = { x: -dir.y, y: dir.x };
    ctx.beginPath();
    ctx.moveTo(p.x + dir.x * size, p.y + dir.y * size);
    ctx.lineTo(p.x - dir.x * size * 0.6 + n.x * size * 0.7, p.y - dir.y * size * 0.6 + n.y * size * 0.7);
    ctx.lineTo(p.x - dir.x * size * 0.6 - n.x * size * 0.7, p.y - dir.y * size * 0.6 - n.y * size * 0.7);
    ctx.closePath();
    ctx.fill();
  }
  function routeShape(plan, r, opts = {}) {
    const pts = r.points;
    if (!pts || pts.length < 2) return;
    const ctx = plan.ctx;
    const px = 1 / plan.view.scale;
    const R = App.routes;
    const color = r.color || R.def(r.kind).color;
    const total = App.model.TYPES.route.length(r);
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // 통로 폭 띠
    ctx.strokeStyle = opts.marked ? plan.colors.accent : color;
    ctx.globalAlpha = opts.selected || opts.marked ? 0.3 : 0.17;
    ctx.lineWidth = Math.max(r.width || 0, 8 * px);
    strokePath(ctx, pts);
    // 걸리는 구간
    const issues = opts.preview ? [] : R.check(r).issues;
    ctx.strokeStyle = ROUTE_BAD;
    ctx.globalAlpha = 0.42;
    issues.forEach((x) => strokePath(ctx, subPath(r, Math.max(0, x.from - R.STEP / 2), Math.min(total, x.to + R.STEP / 2))));
    // 가운데 선
    ctx.globalAlpha = opts.preview ? 0.8 : 1;
    ctx.strokeStyle = opts.selected ? plan.colors.accent : color;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = (opts.selected ? 3 : 2.2) * px;
    ctx.setLineDash([10 * px, 6 * px]);
    strokePath(ctx, pts);
    ctx.setLineDash([]);
    // 방향 화살표: 일정 간격마다, 그리고 끝에 크게
    const gap = Math.max(110 * px, 3000);
    for (let s = gap / 2; s < total - gap * 0.3; s += gap) {
      const p = R.pointAt(r, s);
      arrowHead(ctx, p, p.dir, 6 * px);
    }
    const end = R.pointAt(r, total);
    arrowHead(ctx, end, end.dir, 10 * px);
    // 출발점
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, 6.5 * px, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2 * px;
    ctx.strokeStyle = plan.colors.canvasBg;
    ctx.stroke();
    ctx.restore();
  }

  /** 조감도 물건 이름표: 화면에서 충분히 크게 보이는 것만, 물건 아래에 작게 */
  function drawItemNames(plan, items) {
    const ctx = plan.ctx, scale = plan.view.scale, T = App.model.TYPES.item;
    ctx.font = '600 11px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const LH = 13;
    // 이미 놓인 글자 자리 (동선 이름표 + 앞서 놓은 부스 이름표): 부스 이름표는 겹치면 다른 자리로, 그래도 겹치면 줄이거나 뺌
    const placed = (plan.labelBoxes || []).slice();
    const hits = (b) => placed.some((q) => b.x0 < q.x1 && q.x0 < b.x1 && b.y0 < q.y1 && q.y0 < b.y1);
    const boxOf = (x, y, lines) => {
      const w = Math.max(...lines.map((t) => ctx.measureText(t).width)) / 2 + 2;
      return { x0: x - w, x1: x + w, y0: y - 1, y1: y + lines.length * LH };
    };
    const draw = (x, y, lines, it) => {
      ctx.lineWidth = 3;
      ctx.strokeStyle = plan.colors.canvasBg;
      ctx.fillStyle = App.selection.has(it.id) ? plan.colors.accent : plan.colors.label || plan.colors.fg;
      lines.forEach((t, i) => { ctx.strokeText(t, x, y + i * LH); ctx.fillText(t, x, y + i * LH); });
    };
    const fit = (text, max) => {
      if (ctx.measureText(text).width <= max) return text;
      let t = text;
      while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
      return `${t}…`;
    };
    items.forEach((it) => {
      if (it.category !== 'event' || it.depth == null) return;
      const isBooth = App.booths && App.booths.isBooth(it);
      const booth = isBooth && (it.boothNo || it.exhibitor) ? [it.boothNo, it.exhibitor].filter(Boolean).join(' ') : ''; // 부스 번호·업체
      if (Math.max(it.size, it.depth) * scale < (booth ? 22 : 58)) return; // 부스 번호는 작아도 보이게
      const s = plan.view.toScreen(it.x, it.y);
      if (!booth) {
        const seats = App.catalog.seats(it);
        draw(s.x, s.y + T.extent(it, { x: 0, y: 1 }) * scale + 4, [`${it.kind}${seats && it.kind !== '의자' ? ` ${seats.count}석` : ''}`], it);
        return;
      }
      // 부스: 칸 폭(화면)에 맞춰 한 줄 또는 두 줄(번호 / 업체), 업체는 칸 폭에 맞게 줄임
      const a = ((it.rotation || 0) * Math.PI) / 180;
      const wpx = (Math.abs(Math.cos(a)) * it.size + Math.abs(Math.sin(a)) * it.depth) * scale;
      const hpx = T.extent(it, { x: 0, y: 1 }) * scale * 2;
      const max = Math.max(wpx - 2, 26);
      let lines = [booth];
      if (ctx.measureText(booth).width > max && it.boothNo && it.exhibitor) lines = wpx >= 40 ? [it.boothNo, fit(it.exhibitor, max)] : [it.boothNo];
      // 자리 후보: 앞쪽(돌린 방향, 통로 쪽) → 칸 안(들어가면) → 뒤쪽
      const front = Math.cos(a) >= 0 ? 1 : -1; // 앞이 화면 아래(+y)면 1
      const below = s.y + (hpx / 2) + 4, above = (n) => s.y - (hpx / 2) - 4 - n * LH;
      const inside = (n) => s.y - (n * LH) / 2;
      const spots = (n) => [front > 0 ? below : above(n), ...(hpx >= n * LH + 6 && wpx >= 30 ? [inside(n)] : []), front > 0 ? above(n) : below];
      let done = false;
      for (const cand of [lines, lines.length > 1 ? [lines[0]] : null].filter(Boolean)) {
        for (const y of spots(cand.length)) {
          const b = boxOf(s.x, y, cand);
          if (!hits(b)) { placed.push(b); draw(s.x, y, cand, it); done = true; break; }
        }
        if (done) break;
      }
    });
  }

  /** 현장 사진 핀: 물방울 모양 핀 머리에 번호, 아래에 제목. 화면 크기 고정 (멀리서도 보이게). 화면 좌표 */
  function drawPhotoPins(plan, photos, markColor) {
    const ctx = plan.ctx, c = plan.colors;
    const font = (w, s) => `${w} ${s}px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif`;
    photos.forEach((ph) => {
      const p = plan.view.toScreen(ph.x, ph.y), r = 14, cy = p.y - r - 6;
      const sel = markColor(ph);
      // 핀: 아래 끝이 놓은 자리
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.bezierCurveTo(p.x - 4, p.y - 6, p.x - r, cy + r * 0.55, p.x - r, cy);
      ctx.arc(p.x, cy, r, Math.PI, 0);
      ctx.bezierCurveTo(p.x + r, cy + r * 0.55, p.x + 4, p.y - 6, p.x, p.y);
      ctx.closePath();
      ctx.fillStyle = sel || '#0b7285';
      ctx.fill();
      ctx.lineWidth = sel ? 3 : 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      const n = App.photos ? App.photos.numberOf(ph.id) : '';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = font(800, n >= 10 ? 11 : 13);
      ctx.fillText(String(n), p.x, cy + 0.5);
      // 사진 수 (2장 이상)
      const count = (ph.photos || []).length;
      if (count > 1) {
        const bx = p.x + r * 0.85, by = cy - r * 0.8;
        ctx.beginPath(); ctx.arc(bx, by, 7.5, 0, Math.PI * 2);
        ctx.fillStyle = '#f08c00'; ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.font = font(800, 9.5);
        ctx.fillText(String(count), bx, by + 0.5);
      }
      if (ph.title) {
        ctx.font = font(600, 11.5);
        ctx.lineWidth = 3;
        ctx.strokeStyle = c.canvasBg;
        ctx.strokeText(ph.title, p.x, p.y + 10);
        ctx.fillStyle = sel || c.fg;
        ctx.fillText(ph.title, p.x, p.y + 10);
      }
    });
  }

  /** 의자 배열의 좌석 번호 (A1, A2 …). 가까이서는 의자마다, 멀리서는 줄 양 끝에 열 글자만. 화면 좌표 */
  function drawSeatNumbers(plan, items) {
    const ctx = plan.ctx, scale = plan.view.scale;
    items.forEach((it) => {
      if (it.kind !== '의자 배열' || !it.seatNo) return;
      const L = App.catalog.seatLayout(it);
      const pitch = L.pw * scale, rowH = L.ph * scale;
      if (rowH < 9) return;
      const a = ((it.rotation || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      const toS = (lx, ly) => plan.view.toScreen(it.x + lx * c - ly * s, it.y + lx * s + ly * c);
      const labels = App.catalog.seatLabels(it);
      const put = (text, p, size, weight = 700) => {
        ctx.font = `${weight} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif`;
        ctx.lineWidth = Math.max(2, size * 0.28);
        ctx.strokeStyle = plan.colors.canvasBg;
        ctx.strokeText(text, p.x, p.y);
        ctx.fillStyle = App.selection.has(it.id) ? plan.colors.accent : plan.colors.fg;
        ctx.fillText(text, p.x, p.y);
      };
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (pitch >= 20) {
        const size = Math.max(8, Math.min(12, pitch * 0.34));
        labels.forEach((l) => put(l.label, toS(l.x, l.y), size, 600));
        return;
      }
      // 멀리서: 줄마다 양 끝 바깥에 열 글자
      const rows = new Map();
      labels.forEach((l) => { const r = rows.get(l.row) || { y: l.y, x0: Infinity, x1: -Infinity }; r.x0 = Math.min(r.x0, l.x); r.x1 = Math.max(r.x1, l.x); rows.set(l.row, r); });
      const size = Math.max(9, Math.min(13, rowH * 0.7));
      rows.forEach((r, row) => { put(row, toS(r.x0 - L.pw * 0.9, r.y), size); put(row, toS(r.x1 + L.pw * 0.9, r.y), size); });
    });
  }

  /** 동선 이름·길이·걸리는 시간, 걸리는 곳 표시(!). 화면 좌표 */
  function drawRouteLabels(plan, routes) {
    const ctx = plan.ctx;
    plan.labelBoxes = [];
    const R = App.routes, U = App.units;
    const placed = []; // 이미 놓은 이름표 자리 (겹치면 아래로 밀어 냄)
    routes.forEach((r) => {
      if (!r.points || r.points.length < 2) return;
      const res = R.check(r);
      const mid = R.pointAt(r, res.length / 2);
      const s = plan.view.toScreen(mid.x, mid.y);
      const n = { x: -mid.dir.y, y: mid.dir.x };
      const off = Math.max(16, ((r.width || 0) / 2) * plan.view.scale * 0.5 + 12);
      const text = `${r.name} · ${U.formatRun(res.length)} · ${R.timeText(res.time)}`;
      if (res.length * plan.view.scale > 70) {
        ctx.font = TAG_FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const x = s.x + n.x * off, tw = ctx.measureText(text).width / 2 + 6;
        let y = s.y + n.y * off;
        for (let k = 0; k < 6 && placed.some((q) => Math.abs(q.x - x) < q.w + tw && Math.abs(q.y - y) < 18); k++) y += 19;
        placed.push({ x, y, w: tw });
        plan.labelBoxes = plan.labelBoxes || [];
        plan.labelBoxes.push({ x0: x - tw, x1: x + tw, y0: y - 9, y1: y + 9 }); // 부스 이름표가 피해 가게
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = plan.colors.canvasBg;
        ctx.strokeText(text, x, y);
        ctx.fillStyle = App.selection.has(r.id) ? plan.colors.accent : r.color;
        ctx.fillText(text, x, y);
      }
      // 걸리는 곳: 빨간 동그라미에 느낌표
      res.issues.forEach((x) => {
        const q = plan.view.toScreen(x.at.x, x.at.y);
        ctx.beginPath();
        ctx.arc(q.x, q.y, 9, 0, Math.PI * 2);
        ctx.fillStyle = ROUTE_BAD;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
        ctx.font = '700 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.fillText('!', q.x, q.y + 0.5);
      });
    });
  }

  /* ── 치수: 치수선 양 끝에 사선 표시, 글자는 화면에서 너무 작아지지 않게 ── */
  function dimShape(plan, d, color, alpha = 1) {
    const g = App.model.TYPES.dim.geom(d);
    if (g.length < 1) return;
    const ctx = plan.ctx;
    const view = plan.view;
    const ink = color || plan.colors.dim;
    const S = (p) => view.toScreen(p.x, p.y);
    const a = S(g.a), b = S(g.b), sa = S(d.start), sb = S(d.end);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    // 보조선: 잰 점에서 치수선까지 (조금 넘게)
    if (Math.abs(d.offset || 0) * view.scale > 3) {
      const ux = (a.x - sa.x), uy = (a.y - sa.y);
      const len = Math.hypot(ux, uy) || 1;
      [[sa, a], [sb, b]].forEach(([p, q]) => {
        ctx.moveTo(p.x + (ux / len) * 3, p.y + (uy / len) * 3);
        ctx.lineTo(q.x + (ux / len) * 5, q.y + (uy / len) * 5);
      });
    }
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    // 양 끝 사선
    const ux = (b.x - a.x), uy = (b.y - a.y);
    const len = Math.hypot(ux, uy) || 1;
    const tx = (ux / len + uy / len) * 4, ty = (uy / len - ux / len) * 4;
    [a, b].forEach((p) => {
      ctx.moveTo(p.x - tx, p.y - ty);
      ctx.lineTo(p.x + tx, p.y + ty);
    });
    ctx.stroke();
    // 글자: 도면 크기(mm)를 따르되 화면에서 11~22px (크게 확대해도 글자가 화면을 덮지 않게)
    const size = G.clamp(App.settings.dimTextSize * view.scale, 11, DIM_TEXT_MAX_PX);
    const value = d.manual != null ? d.manual : g.length;
    const text = App.units.formatLength(value);
    let ang = Math.atan2(b.y - a.y, b.x - a.x);
    if (ang >= Math.PI / 2 - 1e-6) ang -= Math.PI;
    else if (ang < -Math.PI / 2 - 1e-6) ang += Math.PI;
    ctx.translate((a.x + b.x) / 2, (a.y + b.y) / 2);
    ctx.rotate(ang);
    ctx.font = `${d.manual != null ? '700 ' : ''}${size}px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3;
    ctx.strokeStyle = plan.colors.canvasBg;
    ctx.strokeText(text, 0, -3);
    ctx.fillStyle = d.manual != null && !color ? plan.colors.accent : ink;
    ctx.fillText(text, 0, -3);
    ctx.restore();
  }

  /* ── 글자(메모) ── */
  function textShape(plan, t, color) {
    const ctx = plan.ctx;
    const view = plan.view;
    const size = Math.max(t.size * view.scale, 11);
    const s = view.toScreen(t.x, t.y);
    const lines = String(t.content || '').split('\n');
    ctx.save();
    ctx.font = `600 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';
    lines.forEach((line, i) => {
      const y = s.y + i * size * 1.3;
      ctx.lineWidth = 4;
      ctx.strokeStyle = plan.colors.canvasBg;
      ctx.strokeText(line, s.x, y);
      ctx.fillStyle = color || plan.colors.note;
      ctx.fillText(line, s.x, y);
    });
    if (color) {
      const b = App.model.TYPES.text.box(t);
      const p = view.toScreen(b.minX, b.minY), q = view.toScreen(b.maxX, b.maxY);
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(p.x - 3, p.y - 3, q.x - p.x + 6, q.y - p.y + 6);
    }
    ctx.restore();
  }

  /** 방 바닥: 옅은 색. 선택은 주황, 경계를 못 찾은 방은 빨간 점선 */
  /** 방 바닥 모양: 색을 깔고 무늬(마루 널·타일 줄눈·V자)를 그림. 줄 간격이 화면에서 너무 촘촘하면 무늬는 생략 */
  const FLOOR_SIZE = { plank: [1200, 190], wide: [1800, 220], deco: [900, 150], tile: [600], 'tile-l': [800], 'tile-s': [300], marble: [600] };
  function floorPattern(ctx, r, look, px) {
    const b = App.model.TYPES.room.bounds(r);
    ctx.save();
    ctx.beginPath();
    polygon(ctx, r.points);
    ctx.clip();
    ctx.globalAlpha = 0.78;
    ctx.fillStyle = look.color;
    ctx.fillRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
    const dark = parseInt(look.color.slice(1, 3), 16) + parseInt(look.color.slice(3, 5), 16) + parseInt(look.color.slice(5, 7), 16) < 330;
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.32)' : 'rgba(60,45,30,0.26)';
    ctx.globalAlpha = 1;
    ctx.lineWidth = px;
    ctx.beginPath();
    const size = FLOOR_SIZE[look.pattern];
    const longX = b.maxX - b.minX >= b.maxY - b.minY; // 마루는 방의 긴 쪽으로 깔림
    // (u, v): 널의 길이 방향 u, 폭 방향 v
    const line = (u0, v0, u1, v1) => { if (longX) { ctx.moveTo(u0, v0); ctx.lineTo(u1, v1); } else { ctx.moveTo(v0, u0); ctx.lineTo(v1, u1); } };
    const [uMin, uMax, vMin, vMax] = longX ? [b.minX, b.maxX, b.minY, b.maxY] : [b.minY, b.maxY, b.minX, b.maxX];
    if (look.pattern === 'plank' || look.pattern === 'wide' || look.pattern === 'deco') {
      const [L, W] = size;
      if (W / px >= 4) {
        for (let v = Math.floor(vMin / W) * W, row = 0; v <= vMax; v += W, row++) {
          line(uMin, v, uMax, v);
          if (L / px < 6) continue;
          const shift = (((Math.round(v / W) * 7919) % 5) / 5) * L;
          for (let u = Math.floor((uMin - shift) / L) * L + shift; u <= uMax; u += L) line(u, v, u, v + W);
        }
      }
    } else if (look.pattern === 'chevron') {
      const cw = 340, t = 95;
      if (cw / px >= 5) {
        for (let u = Math.floor(uMin / cw) * cw; u <= uMax; u += cw) {
          line(u, vMin, u, vMax);
          if (t / px < 4) continue;
          const dir = Math.round(u / cw) % 2 ? 1 : -1;
          for (let v = Math.floor(vMin / t) * t - cw; v <= vMax + cw; v += t) line(u, v, u + cw, v + dir * cw);
        }
      }
    } else if (size) {
      const g = size[0];
      if (g / px >= 5) {
        for (let x = Math.floor(b.minX / g) * g; x <= b.maxX; x += g) { ctx.moveTo(x, b.minY); ctx.lineTo(x, b.maxY); }
        for (let y = Math.floor(b.minY / g) * g; y <= b.maxY; y += g) { ctx.moveTo(b.minX, y); ctx.lineTo(b.maxX, y); }
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawRooms(plan, rooms, marks) {
    const ctx = plan.ctx;
    const c = plan.colors;
    const px = 1 / plan.view.scale; // 1 화면 px을 mm로
    rooms.forEach((r) => {
      const selected = App.selection.has(r.id);
      const marked = marks && marks.ids.has(r.id);
      const look = !r.issue && App.catalog.floorLook(r);
      if (look) floorPattern(ctx, r, look, px);
      ctx.beginPath();
      polygon(ctx, r.points);
      ctx.fillStyle = r.issue ? c.danger : selected || marked ? c.accent : c.roomFill;
      ctx.globalAlpha = r.issue ? 0.08 : selected ? 0.16 : marked ? 0.1 : 1;
      if (!look || selected || marked) ctx.fill();
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
      if (lenPx < 56) continue; // 가장 짧은 글자도 못 들어감 → 글자를 만들지도 않음
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
    } else if (p.kind === 'near') {
      // 선 위: 모래시계 (CAD의 '근처점' 표시)
      ctx.moveTo(s.x - 6, s.y - 6);
      ctx.lineTo(s.x + 6, s.y - 6);
      ctx.lineTo(s.x - 6, s.y + 6);
      ctx.lineTo(s.x + 6, s.y + 6);
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

  /** 커서 옆의 작은 꼬리표 (돌리는 각도, 바뀌는 크기) */
  function textTag(plan, world, text) {
    const ctx = plan.ctx;
    screenTransform(plan);
    const s = plan.view.toScreen(world.x, world.y);
    ctx.font = TAG_FONT;
    const w = ctx.measureText(text).width + 14, x = s.x + 16, y = s.y - 30;
    ctx.fillStyle = plan.colors.accent;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, 24, 6); else ctx.rect(x, y, w, 24);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 7, y + 12.5);
  }

  /* ── 도구 미리보기 ── */
  function previewLine(plan, a, b, preset) {
    worldTransform(plan);
    lineShape(plan, { start: a, end: b }, preset, null, 0.75);
  }
  function previewItem(plan, it) {
    worldTransform(plan);
    itemShape(plan, it, plan.colors.accent, 0.75);
  }
  function previewDim(plan, a, b, offset = 0) {
    screenTransform(plan);
    dimShape(plan, { start: a, end: b, offset, manual: null }, plan.colors.accent);
  }
  /** 동선 그리는 중: 찍은 점들과 커서까지 */
  function previewRoute(plan, points, def) {
    if (points.length < 2) return;
    worldTransform(plan);
    routeShape(plan, { points, color: def.color, width: def.width, kind: def.kind }, { preview: true });
  }
  /** 영역 그리는 중: 찍은 점들과 커서까지 */
  function previewZone(plan, points, color) {
    if (points.length < 2) return;
    const ctx = plan.ctx;
    const px = 1 / plan.view.scale;
    worldTransform(plan);
    ctx.beginPath();
    polygon(ctx, points);
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.setLineDash([8 * px, 5 * px]);
    ctx.lineWidth = 2 * px;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /* ── 팔레트 아이콘: 기호를 검은색으로 그려 CSS mask로 씀 (글자색을 따름) ── */
  const iconCache = new Map();
  function makeIcon(key, draw) {
    if (iconCache.has(key)) return iconCache.get(key);
    const cv = document.createElement('canvas');
    cv.width = cv.height = 72;
    const c = cv.getContext('2d');
    c.scale(3, 3);
    c.translate(12, 12);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    draw(c);
    const url = cv.toDataURL('image/png');
    iconCache.set(key, url);
    return url;
  }
  function itemIcon(kind) {
    const def = App.catalog.itemDef(kind) || { aspect: 1 };
    // 아주 길쭉한 것(트러스·레드카펫 등)도 아이콘에서 알아보이게 비율을 제한
    const a = G.clamp(def.aspect, 0.3, 1.5);
    const w = kind === '원형 테이블' ? 11 : a < 0.6 ? 22 : a > 1 ? 20 / a : 18; // 원형 테이블은 둘레 의자 자리를 남김
    return makeIcon(`item:${kind}`, (c) => itemSymbol(c, kind, w, w * a, 0.9, '#000', null));
  }
  function lineIcon(category) {
    return makeIcon(`line:${category}`, (c) => {
      c.strokeStyle = c.fillStyle = '#000';
      if (category === '덕트') {
        c.globalAlpha = 0.35;
        c.fillRect(-10, -4, 20, 8);
        c.globalAlpha = 1;
        c.lineWidth = 1.4;
        c.strokeRect(-10, -4, 20, 8);
        return;
      }
      c.lineWidth = category === '배관' ? 2.4 : 2;
      c.setLineDash(category === '전선관' ? [4, 3] : []);
      c.beginPath();
      c.moveTo(-10, 7);
      c.lineTo(-2, -5);
      c.lineTo(10, -5);
      c.stroke();
    });
  }

  App.draw = {
    scene, wallOutlines, clearanceGuides, previewWall, lengthTag, snapMarker, pointMarker, selectionBox, facePreview,
    openingPreview, columnPreview, distanceTag, worldTransform, screenTransform,
    previewLine, previewItem, previewDim, previewZone, previewRoute, itemIcon, lineIcon, textTag,
  };
})();
