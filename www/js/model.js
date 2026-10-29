/* 도면 데이터와 실행 취소 기록.
   모든 변경은 transact()(또는 begin~commit) 안에서 하고, 바뀐 요소의 이전·이후 상태만 기록한다. */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const G = App.geom;

  const DATA_VERSION = 1;   // 저장 데이터 구조 버전 (8단계 저장 기능에서 사용)
  const HISTORY_LIMIT = 100; // 실행 취소 단계 수 (요구: 50 이상)

  const LAYERS = [
    { id: 'arch', label: '건축' },
    { id: 'elec', label: '전기' },
    { id: 'mech', label: '설비' },
    { id: 'zone', label: '영역' },
    { id: 'memo', label: '메모' },
    { id: 'dim', label: '치수' },
  ];

  const clone = (v) => (v == null ? null : JSON.parse(JSON.stringify(v)));
  let seq = 0;
  const newId = (type) =>
    `${type}-${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

  /** 모든 요소가 가지는 공통 속성 */
  function base(type, layer) {
    return { id: newId(type), type, layer, room: null, memo: '', createdAt: new Date().toISOString() };
  }

  /** 문·창문이 벽 위에 놓인 모양. 벽보다 넓으면 벽 길이만큼, 벽 끝을 넘지 않게 위치를 맞춤
      t: 벽 시작점에서 개구부 가운데까지의 비율(0~1) */
  function openingGeom(el) {
    const w = App.doc.get(el.wallId);
    if (!w) return null;
    const L = G.dist(w.start, w.end);
    if (L < 1) return null;
    const d = G.unit({ x: w.end.x - w.start.x, y: w.end.y - w.start.y });
    const n = G.perp(d);
    const half = Math.min(el.width, L) / 2;
    const c = G.clamp(el.t * L, half, L - half);
    const at = (s) => ({ x: w.start.x + d.x * s, y: w.start.y + d.y * s });
    return { wall: w, L, d, n, c, half, th: w.thickness, center: at(c), a: at(c - half), b: at(c + half) };
  }
  function openingCorners(g, reach = g.th / 2) {
    const off = (p, k) => ({ x: p.x + g.n.x * k, y: p.y + g.n.y * k });
    return [off(g.a, reach), off(g.b, reach), off(g.b, -reach), off(g.a, -reach)];
  }
  function boxOf(pts) {
    return {
      minX: Math.min(...pts.map((p) => p.x)), minY: Math.min(...pts.map((p) => p.y)),
      maxX: Math.max(...pts.map((p) => p.x)), maxY: Math.max(...pts.map((p) => p.y)),
    };
  }

  /** 화면에서 최소 px 크기를 지키기 위한 도면 길이(mm). 멀리서 봐도 기호·글자가 너무 작아지지 않게 */
  const minWorld = (px) => (App.plan ? px / App.plan.view.scale : 0);

  /* 선분 요소(선·치수)의 공통 기하 */
  const segmentShape = (halfWidth) => ({
    bounds(e) {
      const h = halfWidth(e);
      return {
        minX: Math.min(e.start.x, e.end.x) - h, minY: Math.min(e.start.y, e.end.y) - h,
        maxX: Math.max(e.start.x, e.end.x) + h, maxY: Math.max(e.start.y, e.end.y) + h,
      };
    },
    distance(e, p) {
      return G.closestOnSegment(p, e.start, e.end).dist - halfWidth(e);
    },
    inRect(e, r, crossing) {
      return crossing ? G.segmentIntersectsRect(e.start, e.end, r) : G.pointInRect(e.start, r) && G.pointInRect(e.end, r);
    },
    movedBy(e, dx, dy) {
      return { start: { x: e.start.x + dx, y: e.start.y + dy }, end: { x: e.end.x + dx, y: e.end.y + dy } };
    },
  });

  /* 다각형 요소(방·영역)의 공통 기하 */
  const polygonShape = {
    bounds(r) {
      const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      r.points.forEach((p) => {
        b.minX = Math.min(b.minX, p.x); b.minY = Math.min(b.minY, p.y);
        b.maxX = Math.max(b.maxX, p.x); b.maxY = Math.max(b.maxY, p.y);
      });
      return b;
    },
    // 안이면 거의 0. 겹치면 작은 것이 먼저 잡히도록 넓이에 비례한 아주 작은 값
    distance(r, p) {
      return G.pointInPolygon(p, r.points) ? Math.abs(G.signedArea(r.points)) * 1e-15 : Infinity;
    },
    inRect(r, rect, crossing) {
      if (!crossing) return r.points.every((p) => G.pointInRect(p, rect));
      const n = r.points.length;
      for (let i = 0; i < n; i++) {
        if (G.segmentIntersectsRect(r.points[i], r.points[(i + 1) % n], rect)) return true;
      }
      return G.pointInPolygon({ x: (rect.minX + rect.maxX) / 2, y: (rect.minY + rect.maxY) / 2 }, r.points);
    },
  };

  /** 벽면에 붙은 기호의 자리: 벽 시작에서 비율 t, side(+1/-1) 쪽 면, 깊이 depth인 기호의 가운데와 방향(도) */
  function mountPoint(w, t, side, depth) {
    const L = G.dist(w.start, w.end);
    const dir = G.unit({ x: w.end.x - w.start.x, y: w.end.y - w.start.y });
    const n = G.perp(dir);
    const along = G.clamp(t, 0, 1) * L;
    const off = side * (w.thickness / 2 + depth / 2);
    let rot = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
    if (side < 0) rot += 180; // 기호 앞면이 벽에서 바깥(방 쪽)을 보도록
    rot = ((Math.round(rot) % 360) + 360) % 360;
    return { x: w.start.x + dir.x * along + n.x * off, y: w.start.y + dir.y * along + n.y * off, rotation: rot };
  }

  /** 글자 상자(mm). (x, y)는 왼쪽 위. 한글은 글자 크기만큼, 영문·숫자는 0.6배 폭으로 어림 */
  function textBox(t) {
    const size = Math.max(t.size, minWorld(11));
    const lines = String(t.content || ' ').split('\n');
    const width = Math.max(...lines.map((l) => [...l].reduce((s, ch) => s + (/[\u1100-\uffff]/.test(ch) ? 1 : 0.6), 0))) * size;
    return { minX: t.x, minY: t.y, maxX: t.x + Math.max(width, size), maxY: t.y + lines.length * size * 1.3 };
  }

  /** 치수선 위치: 잰 두 점에서 offset만큼 옆으로 띄운 선 */
  function dimGeom(d) {
    const dir = G.unit({ x: d.end.x - d.start.x, y: d.end.y - d.start.y });
    const n = G.perp(dir);
    const o = d.offset || 0;
    return {
      dir, n,
      a: { x: d.start.x + n.x * o, y: d.start.y + n.y * o },
      b: { x: d.end.x + n.x * o, y: d.end.y + n.y * o },
      length: G.dist(d.start, d.end),
    };
  }

  /* 문과 창문의 공통 기하. pick 0: 누르기 판정에서 벽보다 먼저 */
  const opening = (label) => ({
    label,
    pick: 0,
    bounds(el) {
      const g = openingGeom(el);
      // 여닫이문은 문짝이 벽 밖으로 열리므로 문 폭만큼 넉넉히
      return g ? boxOf(openingCorners(g, el.type === 'door' ? Math.max(g.th / 2, el.width) : g.th / 2)) : null;
    },
    distance(el, p) {
      const g = openingGeom(el);
      if (!g) return Infinity;
      const vx = p.x - g.center.x, vy = p.y - g.center.y;
      const u = Math.abs(vx * g.d.x + vy * g.d.y) - g.half;
      const v = Math.abs(vx * g.n.x + vy * g.n.y) - g.th / 2;
      return Math.hypot(Math.max(u, 0), Math.max(v, 0));
    },
    inRect(el, r, crossing) {
      const g = openingGeom(el);
      if (!g) return false;
      const c = openingCorners(g);
      return crossing ? G.segmentIntersectsRect(g.a, g.b, r) : c.every((p) => G.pointInRect(p, r));
    },
    snapPoints() {
      return [];
    },
    movedBy() {
      return {}; // 벽에 붙어 있어 벽을 따라 움직임
    },
    /** 벽 면적에서 빼는 개구부 면적(mm²). 벽보다 넓으면 벽 길이까지만 */
    area(el) {
      const g = openingGeom(el);
      return g ? g.half * 2 * el.height : 0;
    },
  });

  /* 요소 종류별 기하 처리. 종류가 늘면 여기에 추가
     pick: 누르기 판정 순서 (0 문·창문·기둥 → 1 벽 → 2 방), catalog: 도면에 그리지 않는 목록 항목 */
  const TYPES = {
    wall: {
      label: '벽',
      pick: 1,
      /** typeId: 벽 종류(다루끼·석고 구성). 두께는 벽 종류에서 정해짐 (catalog.js가 맞춤)
          flip: 마감 쪽(석고·틀이 붙는 쪽)을 반대로 */
      create(start, end, opts = {}) {
        const typeId = opts.typeId ?? (App.current && App.current.wallTypeId) ?? null;
        const type = typeId && App.doc.get(typeId);
        return {
          ...base('wall', 'arch'),
          start: { x: start.x, y: start.y },
          end: { x: end.x, y: end.y },
          typeId,
          flip: false,
          thickness: type ? App.catalog.thickness(type) : (opts.thickness ?? 100),
          height: opts.height ?? App.settings.wallHeight,
        };
      },
      length(w) {
        return G.dist(w.start, w.end);
      },
      bounds(w) {
        const h = w.thickness / 2;
        return {
          minX: Math.min(w.start.x, w.end.x) - h, minY: Math.min(w.start.y, w.end.y) - h,
          maxX: Math.max(w.start.x, w.end.x) + h, maxY: Math.max(w.start.y, w.end.y) + h,
        };
      },
      /** 벽 면까지의 거리. 벽 안쪽이면 0 이하 */
      distance(w, p) {
        return G.closestOnSegment(p, w.start, w.end).dist - w.thickness / 2;
      },
      /** crossing: 걸치기만 해도 선택, 아니면 완전히 들어와야 선택 */
      inRect(w, r, crossing) {
        return crossing
          ? G.segmentIntersectsRect(w.start, w.end, r)
          : G.pointInRect(w.start, r) && G.pointInRect(w.end, r);
      },
      snapPoints(w) {
        return [
          { x: w.start.x, y: w.start.y, kind: 'end' },
          { x: w.end.x, y: w.end.y, kind: 'end' },
          { x: (w.start.x + w.end.x) / 2, y: (w.start.y + w.end.y) / 2, kind: 'mid' },
        ];
      },
      movedBy(w, dx, dy) {
        return {
          start: { x: w.start.x + dx, y: w.start.y + dy },
          end: { x: w.end.x + dx, y: w.end.y + dy },
        };
      },
    },

    /* 방: 벽 중심선으로 둘러싸인 다각형. 바닥 면적은 points로 그때그때 계산 (저장 안 함)
       seed: 방 안쪽의 한 점. 벽이 바뀌면 이 점을 기준으로 경계를 다시 찾음
       issue: null | 'open'(벽이 끊겨 경계를 못 찾음) | 'overlap'(다른 방과 같은 경계) */
    room: {
      label: '방',
      pick: 2,
      ...polygonShape,
      create(points, wallIds, name) {
        return {
          ...base('room', 'arch'),
          name,
          points: points.map((p) => ({ x: p.x, y: p.y })),
          wallIds: wallIds.slice(),
          seed: G.interiorPoint(points),
          ceilingHeight: App.settings.wallHeight,
          ceilingArea: null, // 천장 면적(mm²). null이면 바닥 면적과 같음
          wallHeight: App.settings.wallHeight,
          issue: null,
        };
      },
      floorArea(r) {
        return Math.abs(G.signedArea(r.points)); // mm²
      },
      snapPoints() {
        return [];
      },
      movedBy(r, dx, dy) {
        return {
          points: r.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
          seed: { x: r.seed.x + dx, y: r.seed.y + dy },
        };
      },
    },

    /* 문: 종류(kind) 여닫이·미닫이·자동문·방화문. side: 열리는 쪽(벽의 왼쪽 +1 / 오른쪽 -1), hinge: 경첩이 있는 끝 */
    door: {
      ...opening('문'),
      KINDS: ['여닫이', '미닫이', '자동문', '방화문'],
      create(wallId, t, preset, side = 1, hinge = 'start') {
        return { ...base('door', 'arch'), wallId, t, width: preset.width, height: preset.height, kind: preset.style, side, hinge };
      },
    },

    /* 창문: 종류 미서기·여닫이·고정창·프로젝트창, sill: 바닥에서 창 아래까지 높이 */
    window: {
      ...opening('창문'),
      KINDS: ['미서기', '여닫이', '고정창', '프로젝트창'],
      create(wallId, t, preset) {
        return { ...base('window', 'arch'), wallId, t, width: preset.width, height: preset.height, sill: preset.sill, kind: preset.style };
      },
    },

    /* 기둥: 사각(rect, 폭×깊이) 또는 원형(circle, 지름=폭). x, y는 가운데 */
    column: {
      label: '기둥',
      pick: 0,
      create(p, preset) {
        return {
          ...base('column', 'arch'),
          x: p.x, y: p.y, shape: preset.shape, width: preset.width,
          depth: preset.shape === 'circle' ? preset.width : preset.depth,
        };
      },
      half(c) {
        return { hx: c.width / 2, hy: (c.shape === 'circle' ? c.width : c.depth) / 2 };
      },
      bounds(c) {
        const { hx, hy } = TYPES.column.half(c);
        return { minX: c.x - hx, minY: c.y - hy, maxX: c.x + hx, maxY: c.y + hy };
      },
      distance(c, p) {
        const { hx, hy } = TYPES.column.half(c);
        if (c.shape === 'circle') return Math.max(0, Math.hypot(p.x - c.x, p.y - c.y) - hx);
        return Math.hypot(Math.max(Math.abs(p.x - c.x) - hx, 0), Math.max(Math.abs(p.y - c.y) - hy, 0));
      },
      inRect(c, r, crossing) {
        const b = TYPES.column.bounds(c);
        return crossing ? G.rectsOverlap(b, r) : G.pointInRect({ x: b.minX, y: b.minY }, r) && G.pointInRect({ x: b.maxX, y: b.maxY }, r);
      },
      snapPoints(c) {
        const pts = [{ x: c.x, y: c.y, kind: 'mid' }];
        if (c.shape !== 'circle') {
          const b = TYPES.column.bounds(c);
          pts.push({ x: b.minX, y: b.minY, kind: 'end' }, { x: b.maxX, y: b.minY, kind: 'end' },
            { x: b.maxX, y: b.maxY, kind: 'end' }, { x: b.minX, y: b.maxY, kind: 'end' });
        }
        return pts;
      },
      movedBy(c, dx, dy) {
        return { x: c.x + dx, y: c.y + dy };
      },
    },

    /* 전기·설비 아이템: category 'elec' | 'mech', kind(콘센트 등), 가운데 (x, y), rotation(도), size(기호 폭 mm) */
    item: {
      label: '아이템',
      pick: 0,
      /** height: 설치 높이(null=천장), gang·variant·circuits: 종류별 속성, mount: 벽에 붙었으면 { wallId, t, side } */
      create(p, category, def, rotation = 0, mount = null) {
        return {
          ...base('item', category), category, kind: def.kind, x: p.x, y: p.y, rotation, size: def.size,
          ...App.catalog.itemDefaults(def),
          wallId: mount ? mount.wallId : null, t: mount ? mount.t : null, side: mount ? mount.side : null,
        };
      },
      /** 화면에 그려지는 폭·깊이(mm). 멀리서 봐도 16px보다 작아지지 않음 */
      dims(it) {
        const def = App.catalog.itemDef(it.kind);
        const w = Math.max(it.size, minWorld(16));
        return { w, h: w * (def ? def.aspect : 1) };
      },
      bounds(it) {
        const { w, h } = TYPES.item.dims(it);
        const r = Math.max(w, h) / 2;
        return { minX: it.x - r, minY: it.y - r, maxX: it.x + r, maxY: it.y + r };
      },
      distance(it, p) {
        const { w, h } = TYPES.item.dims(it);
        const a = (-it.rotation * Math.PI) / 180;
        const dx = p.x - it.x, dy = p.y - it.y;
        const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
        return Math.hypot(Math.max(Math.abs(lx) - w / 2, 0), Math.max(Math.abs(ly) - h / 2, 0));
      },
      inRect(it, r, crossing) {
        const b = TYPES.item.bounds(it);
        return crossing ? G.rectsOverlap(b, r) : G.pointInRect({ x: it.x, y: it.y }, r) && G.pointInRect({ x: b.minX, y: b.minY }, r) && G.pointInRect({ x: b.maxX, y: b.maxY }, r);
      },
      snapPoints(it) {
        return [{ x: it.x, y: it.y, kind: 'end' }]; // 배관·전선관을 기구 가운데에 붙일 수 있게
      },
      movedBy(it, dx, dy) {
        return { x: it.x + dx, y: it.y + dy };
      },
    },

    /* 선: 전선관·배관·덕트 (길이 집계용). presetId: 선 종류, rise: 수직으로 오르내리는 길이(mm, 평면 길이에 더함) */
    line: {
      label: '선',
      pick: 0,
      create(a, b, preset) {
        return {
          ...base('line', App.catalog.lineLayer(preset.category)),
          presetId: preset.id, category: preset.category,
          start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y },
          runHeight: preset.runHeight ?? null, // 배관이 지나가는 높이(null=천장)
          rise: 0,                             // 자동 계산 외에 더할 수직 길이
        };
      },
      ...segmentShape((l) => {
        const p = App.doc.get(l.presetId);
        return p && p.category === '덕트' ? p.size / 2 : 0;
      }),
      snapPoints(l) {
        return [
          { x: l.start.x, y: l.start.y, kind: 'end' },
          { x: l.end.x, y: l.end.y, kind: 'end' },
          { x: (l.start.x + l.end.x) / 2, y: (l.start.y + l.end.y) / 2, kind: 'mid' },
        ];
      },
    },

    /* 영역: 공정 구역·작업 범위 표시용 다각형 */
    zone: {
      label: '영역',
      pick: 2,
      ...polygonShape,
      create(points, name, color) {
        return { ...base('zone', 'zone'), name, color, points: points.map((p) => ({ x: p.x, y: p.y })) };
      },
      area(z) {
        return Math.abs(G.signedArea(z.points));
      },
      snapPoints(z) {
        return z.points.map((p) => ({ x: p.x, y: p.y, kind: 'end' }));
      },
      movedBy(z, dx, dy) {
        return { points: z.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
      },
    },

    /* 글자(메모): (x, y)는 왼쪽 위, size는 글자 높이(mm). 멀리서도 11px보다 작아지지 않음 */
    text: {
      label: '텍스트',
      pick: 0,
      create(p, content, size) {
        return { ...base('text', 'memo'), x: p.x, y: p.y, content, size };
      },
      box: textBox,
      bounds: textBox,
      distance(t, p) {
        const b = textBox(t);
        return Math.hypot(Math.max(b.minX - p.x, p.x - b.maxX, 0), Math.max(b.minY - p.y, p.y - b.maxY, 0));
      },
      inRect(t, r, crossing) {
        const b = textBox(t);
        return crossing ? G.rectsOverlap(b, r) : G.pointInRect({ x: b.minX, y: b.minY }, r) && G.pointInRect({ x: b.maxX, y: b.maxY }, r);
      },
      snapPoints() {
        return [];
      },
      movedBy(t, dx, dy) {
        return { x: t.x + dx, y: t.y + dy };
      },
    },

    /* 치수: 두 점 사이 거리. manual이 있으면 그 값을 표시(수동), offset은 치수선을 옆으로 띄우는 거리 */
    dim: {
      label: '치수',
      pick: 0,
      create(a, b) {
        return { ...base('dim', 'dim'), start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y }, offset: 0, manual: null };
      },
      geom: dimGeom,
      ...segmentShape(() => 0),
      bounds(d) {
        const g = dimGeom(d);
        const pts = [d.start, d.end, g.a, g.b];
        return {
          minX: Math.min(...pts.map((p) => p.x)), minY: Math.min(...pts.map((p) => p.y)),
          maxX: Math.max(...pts.map((p) => p.x)), maxY: Math.max(...pts.map((p) => p.y)),
        };
      },
      distance(d, p) {
        const g = dimGeom(d);
        return G.closestOnSegment(p, g.a, g.b).dist;
      },
      snapPoints() {
        return [];
      },
    },

    /* 목록 항목 (도면에 그리지 않음). 프로젝트와 함께 저장되고 고치면 실행 취소 가능 */
    wallType: {
      label: '벽 종류',
      catalog: true,
      create(params) {
        return { ...base('wallType', 'arch'), ...params };
      },
    },
    /* 문·창문·기둥·선 프리셋. kind: 'door' | 'window' | 'column' | 'line' */
    preset: {
      label: '프리셋',
      catalog: true,
      create(kind, params) {
        return { ...base('preset', 'arch'), kind, ...params };
      },
    },
  };

  class Doc {
    constructor() {
      this.elements = new Map(); // 삽입 순서 = 그리는 순서
      this.version = 0;          // 바뀔 때마다 증가 (그리기 캐시용)
      this.undoStack = [];
      this.redoStack = [];
      this.tx = null;
      this.listeners = [];
      this.commitHooks = []; // 기록 직전에 딸린 데이터(방 경계 등)를 같은 단계 안에서 고침
      this._queued = false;
    }

    beforeCommit(fn) { this.commitHooks.push(fn); }

    get(id) { return this.elements.get(id); }
    has(id) { return this.elements.has(id); }
    all() { return this.elements.values(); }
    get size() { return this.elements.size; }

    /** 변경 알림. 한 동작 안의 여러 변경은 한 번으로 묶어서 알림 */
    onChange(fn) { this.listeners.push(fn); }
    _changed() {
      this.version++;
      if (this._queued) return;
      this._queued = true;
      queueMicrotask(() => {
        this._queued = false;
        this.listeners.forEach((fn) => fn());
      });
    }

    _touch(id) {
      if (!this.tx) throw new Error('도면 변경은 transact() 안에서 해야 합니다');
      if (!this.tx.before.has(id)) this.tx.before.set(id, clone(this.elements.get(id)));
    }
    add(el) {
      this._touch(el.id);
      this.elements.set(el.id, el);
      this._changed();
      return el;
    }
    update(id, patch) {
      const el = this.elements.get(id);
      if (!el) return;
      this._touch(id);
      Object.assign(el, clone(patch));
      this._changed();
    }
    remove(id) {
      if (!this.elements.has(id)) return;
      this._touch(id);
      this.elements.delete(id);
      this._changed();
    }

    begin(label) {
      if (this.tx) this.commit();
      this.tx = { label, before: new Map() };
    }
    /** 실제로 바뀐 것이 있으면 실행 취소 기록에 한 단계로 남김 */
    commit() {
      const tx = this.tx;
      if (!tx) return false;
      this.commitHooks.forEach((fn) => fn(tx));
      this.tx = null;
      const changes = [];
      tx.before.forEach((before, id) => {
        const after = clone(this.elements.get(id));
        if (JSON.stringify(before) !== JSON.stringify(after)) changes.push({ id, before, after });
      });
      if (!changes.length) return false;
      this.undoStack.push({ label: tx.label, changes });
      if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
      this.redoStack.length = 0;
      this._changed();
      return true;
    }
    rollback() {
      const tx = this.tx;
      if (!tx) return;
      this.tx = null;
      tx.before.forEach((before, id) => this._put(id, before));
      this._changed();
    }
    transact(label, fn) {
      this.begin(label);
      try {
        const result = fn();
        this.commit();
        return result;
      } catch (err) {
        this.rollback();
        throw err;
      }
    }
    /** 처음 상태로 채움 (실행 취소 기록 없음). 새 도면·불러오기에 사용 */
    reset(elements) {
      this.tx = null;
      this.elements = new Map(elements.map((el) => [el.id, clone(el)]));
      this.undoStack = [];
      this.redoStack = [];
      this._changed();
    }

    _put(id, value) {
      if (value) this.elements.set(id, clone(value));
      else this.elements.delete(id);
    }

    canUndo() { return this.undoStack.length > 0; }
    canRedo() { return this.redoStack.length > 0; }
    undo() {
      if (this.tx) this.rollback();
      const entry = this.undoStack.pop();
      if (!entry) return null;
      entry.changes.forEach((c) => this._put(c.id, c.before));
      this.redoStack.push(entry);
      this._changed();
      return entry;
    }
    redo() {
      if (this.tx) this.rollback();
      const entry = this.redoStack.pop();
      if (!entry) return null;
      entry.changes.forEach((c) => this._put(c.id, c.after));
      this.undoStack.push(entry);
      this._changed();
      return entry;
    }

    /* ── 조회 ── */

    /** 도면 점 p 가까이(tol mm 안)에 있는 요소 id. 여러 개면 가장 가까운 것.
        문·창문·기둥 → 벽 → 방 순으로 찾음 */
    hitTest(p, tol, filter) {
      for (const pick of [0, 1, 2, 3]) { // 3: 가져온 도면 (잠금을 풀었을 때만)
        let best = null, bestD = Infinity;
        for (const el of this.elements.values()) {
          const t = TYPES[el.type];
          if (!t || t.catalog || t.pick !== pick || (filter && !filter(el))) continue;
          const d = t.distance(el, p);
          if (d <= tol && d < bestD) {
            best = el.id;
            bestD = d;
          }
        }
        if (best) return best;
      }
      return null;
    }

    inRect(rect, crossing) {
      const ids = [];
      for (const el of this.elements.values()) {
        const t = TYPES[el.type];
        if (t && !t.catalog && t.inRect(el, rect, crossing)) ids.push(el.id);
      }
      return ids;
    }

    /** 전체 요소 범위. 비어 있으면 null */
    bounds(ids) {
      let r = null;
      const list = ids ? ids.map((id) => this.elements.get(id)).filter(Boolean) : this.elements.values();
      for (const el of list) {
        const t = TYPES[el.type];
        if (!t || t.catalog) continue;
        const b = t.bounds(el);
        if (!b) continue;
        r = r
          ? { minX: Math.min(r.minX, b.minX), minY: Math.min(r.minY, b.minY), maxX: Math.max(r.maxX, b.maxX), maxY: Math.max(r.maxY, b.maxY) }
          : b;
      }
      return r;
    }
  }

  App.model = { DATA_VERSION, LAYERS, TYPES, Doc, clone, openingGeom, openingCorners, mountPoint };
})();
