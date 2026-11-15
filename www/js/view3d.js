/* 3D 보기: 도면을 입체로 조립해 조감도로 돌려 보고, 사람 눈높이로 걸어서 둘러본다.
   - 조감도: 한 손가락 돌리기, 두 손가락 확대·이동 (마우스: 끌기, 오른쪽 끌기, 휠)
   - 걷기: 입구(동선 출발점)에서 시작. 조이스틱·WASD로 걷고 끌어서 둘러봄. 동선을 따라 자동으로 걷기
   그리기는 gl3d.js, 물건 모형은 models3d.js */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const G = App.geom;
  const { M4, MAT, Mesh, Renderer, SUNS, hex, shade, mixc } = App.gl3d;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  const LOW_WALL = 1.2;
  /** 벽 낮추기에서 벽에 붙은 기호를 잘린 벽 아래로 내릴 때 쓰는 판의 반 높이(m) — models3d.js symbol()의 판 크기와 같게 */
  const PLATE_HALF = { 분전반: 0.3, 보일러: 0.325, '에어컨 실내기': 0.15, 환기구: 0.125, 월패드: 0.08, 유도등: 0.07 };   // '벽 낮추기': 이 높이(m)에서 자른 것처럼
  const EYE = 1.6;        // 걷기: 눈높이(m)
  const BODY = 280;       // 걷기: 몸 반지름(mm) — 이보다 좁은 틈은 못 지나감
  const FOV_ORBIT = (38 * Math.PI) / 180, FOV_WALK = (68 * Math.PI) / 180;

  // 바닥 종류: [이름, 재질, 색]
  const GROUNDS = {
    asphalt: ['아스팔트', MAT.asphalt, '#5a5d63'],
    grass: ['잔디', MAT.grass, '#4f9a45'],
    paver: ['보도블록', MAT.paver, '#b89077'],
    soil: ['흙·모래', MAT.soil, '#c2a172'],
    concrete: ['콘크리트', MAT.concrete, '#b9bcc0'],
    sand: ['모래', MAT.sand, '#e6d3a3'],
    court: ['체육관 마루', MAT.wood, '#d2a66a'],
    plain: ['밝은 바닥', MAT.concrete, '#e3e5e8'],
  };
  const SURFACE = {
    grass: [MAT.grass, '#4f9a45'], asphalt: [MAT.asphalt, '#5a5d63'], paver: [MAT.paver, '#b89077'], soil: [MAT.soil, '#c2a172'],
    deck: [MAT.wood, '#a9744b'], concrete: [MAT.concrete, '#b9bcc0'], water: [MAT.water, '#2f86cf'],
    sand: [MAT.sand, '#e6d3a3'], turf: [MAT.track, '#3e8f4a'], track: [MAT.track, '#b5513c'], court: [MAT.wood, '#d2a66a'],
  };
  const WALL = hex('#f1eee8'), WALL_TOP = hex('#9aa0a8'), CURB = hex('#d8d6d0'), FRAME = hex('#f4f4f2');

  /** 문자열에서 만든 고정 난수 (물건마다 같은 모양이 나오게) */
  function seeded(str) {
    let h = 1779033703;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 3432918353), h = (h << 13) | (h >>> 19);
    return () => {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return ((h ^= h >>> 16) >>> 0) / 4294967296;
    };
  }

  const groundKey = () => {
    const g = App.current.ground;
    return GROUNDS[g] ? g : App.modes.is('event') ? 'asphalt' : 'plain';
  };

  const newLayers = (n = 256) => ({ solid: new Mesh(n * 16), ceil: new Mesh(64), glass: new Mesh(64), decals: [new Mesh(n), new Mesh(64), new Mesh(n), new Mesh(64)], blobs: new Mesh(64) });

  /** 물건 모형을 넣을 그릇: 자리(place)를 정하고 모형 함수에 넘김 */
  function makeCtx(L, textured, o = {}) {
    const S = L.solid, meshes = [L.solid, L.glass, L.decals[2], L.ceil, L.blobs];
    return {
      S, G: L.glass, D: L.decals[2], T: L.ceil, B: L.blobs, lod: !!o.lod, crowd: o.crowd || 0, rnd: Math.random,
      base: { x: 0, z: 0, rot: 0, y: 0, c: 1, s: 0 },
      place(x, z, rot, y) {
        const r = (rot * Math.PI) / 180;
        this.base = { x, z, rot, y, c: Math.cos(r), s: Math.sin(r) };
        this.at(0, 0);
      },
      at(lx, lz, deg = 0, ly = 0) {
        const b = this.base;
        const wx = b.x + lx * b.c - lz * b.s, wz = b.z + lx * b.s + lz * b.c;
        meshes.forEach((m) => m.at(wx, wz, b.rot + deg, b.y + ly));
      },
      world() { meshes.forEach((m) => m.at(0, 0, 0, 0)); },
      face(pts, canvas, layer = 'solid', emissive = false) {
        const m = new Mesh(8);
        m.tx = S.tx; m.ty = S.ty; m.tz = S.tz; m.c = S.c; m.s = S.s;
        m.quad(pts[0], pts[1], pts[2], pts[3], [1, 1, 1], emissive ? MAT.emissive : MAT.plain);
        textured.push({ mesh: m, source: canvas, layer });
      },
    };
  }

  // 밤에 불빛이 번지는 물건: [앞쪽으로 떨어진 거리, 반지름, 색]
  const POOLS = { '스탠드 조명': [0, 2.6, '#ffe2a8'], '협탁': [0, 1.3, '#ffe2a8'], '진열장': [0.5, 1.6, '#fff1cf'], '가로등': [1.15, 7, '#ffe2a8'], '조명 타워': [3, 10, '#fff1cf'], '난로': [0, 2.6, '#ff9a4d'], 'LED 스크린': [2.5, 5, '#9fb6ff'], '점수판': [2, 4, '#9fb6ff'], '버스 정류장': [0.3, 4, '#fff1cf'], '매표소': [1, 3.5, '#fff1cf'] };

  /** 물건 하나의 모형을 그릇의 지금 자리에 넣음 (바닥 그늘·밤 불빛 포함) */
  function itemModel(C, it, o = {}) {
    const def = App.catalog.itemDef(it.kind);
    if (!def) return;
    const M3 = App.models3d, S = C.S;
    const w = it.size / 1000, d = (it.depth != null ? it.depth : it.size * (def.aspect || 1)) / 1000, h = App.catalog.itemHeight3(it) / 1000;
    try {
      if (it.category === 'event' && M3.EVENT[it.kind]) M3.EVENT[it.kind](C, it, w, d, h);
      else if (M3.FURN[it.kind] && (it.category === 'furn' || it.category === 'event')) {
        // 벽 낮추기: 벽에 거는 것(액자 등)은 잘린 벽 위로 떠 보이지 않게 위 끝을 벽 높이 아래로
        const lowIt = o.low && def.wall && it.height != null && it.height / 1000 + h / 2 > LOW_WALL - 0.02 ? { ...it, height: Math.max(h / 2 + 20 / 1000, LOW_WALL - h / 2 - 0.02) * 1000 } : it;
        M3.FURN[it.kind](C, lowIt, w, d, h);
      }
      else if (it.category === 'furn') S.box(-w / 2, 0, -d / 2, w / 2, h, d / 2, hex('#b08d6a'), MAT.grain);
      else M3.symbol(C, it, def, Math.min(o.low && it.height != null ? LOW_WALL - Math.max(0.1, (PLATE_HALF[it.kind] || 0.06) + 0.03) : 99, App.measure.itemHeight(it) / 1000));
    } catch (err) {
      console.warn('3D 모형을 만들지 못함:', it.kind, err);
    }
    // 천장 조명: 밤에 바로 아래 바닥이 밝게 (낮에는 안 보임)
    if (it.kind === '조명' && o.blobs !== false) {
      C.at(0, 0);
      const r = it.variant === '펜던트' ? 1.5 : it.variant === 'LED 평판등' || it.variant === '등기구' ? 2.6 : 2.0;
      C.B.quad([-r, 0.014, r], [r, 0.014, r], [r, 0.014, -r], [-r, 0.014, -r], hex('#ffe7b8'), MAT.pool);
    }
    if (o.blobs === false || it.depth == null || def.wall || (it.category !== 'event' && it.category !== 'furn')) return;
    C.at(0, 0);
    if (!def.flat) {
      // 바닥에 닿는 자리의 옅은 그늘 (큰 것일수록 옅게)
      const m = 0.25 + Math.min(w, d) * 0.12, k = Math.max(0.35, Math.min(1, 1.25 - Math.max(w, d) / 18));
      C.B.quad([-w / 2 - m, 0.012, d / 2 + m], [w / 2 + m, 0.012, d / 2 + m], [w / 2 + m, 0.012, -d / 2 - m], [-w / 2 - m, 0.012, -d / 2 - m], [k, k, k], MAT.blob);
    }
    const pool = POOLS[it.kind];
    if (pool) C.B.quad([-pool[1], 0.014, pool[0] + pool[1]], [pool[1], 0.014, pool[0] + pool[1]], [pool[1], 0.014, pool[0] - pool[1]], [-pool[1], 0.014, pool[0] - pool[1]], hex(pool[2]), MAT.pool);
  }

  /** 물건 하나만 따로 조립 (평면에 얹을 위에서 본 그림, 고르는 창의 미리보기) */
  function buildItem(it, o = {}) {
    const L = newLayers(64), textured = [];
    const C = makeCtx(L, textured, { lod: o.lod, crowd: it.kind === '사람' ? it.count || 1 : 0 });
    C.rnd = seeded(o.seed || it.id || it.kind);
    C.place(0, 0, 0, 0);
    itemModel(C, it, { blobs: o.blobs, low: o.low });
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    [L.solid, L.glass, L.decals[2], ...textured.map((t) => t.mesh)].forEach((m) => {
      if (!m.n) return;
      for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], m.min[i]); max[i] = Math.max(max[i], m.max[i]); }
    });
    if (min[0] === Infinity) return null;
    return { layers: L, textured, bounds: { min, max } };
  }

  /* ── 장면 조립 ──
     o: { low: 벽 낮추기, routes: 동선 표시, lod: 간단히 }
     돌려주는 값: { layers: { solid, ceil, glass, decals[4] }, textured, bounds, center(도면 mm), radius(m), stats } 또는 null(그릴 것이 없음) */
  /* ── 3D 이름표: 이름 있는 영역, 무대·화장실·입구 같은 큰 것, 메모를 짧게 적은 물건 ──
     같은 이름이 가까이(8m) 모여 있으면 하나만 (화장실 여러 칸에 이름표가 줄줄이 붙지 않게) */
  const LANDMARK = { 무대: '무대', 매표소: '매표소', '이동식 화장실': '화장실', 푸드트럭: '푸드트럭', 구급차: '구급차', '의무실 텐트': '의무실', '안내 키오스크': '안내', 데스크: '안내', 포토월: '포토월', 에어아치: '입구', 관람석: '관람석', 'LED 스크린': 'LED', 주차: '주차' };
  function sceneLabels(els, X, Z, baseY) {
    const out = [];
    const near = (text, x, z) => out.some((l) => l.text === text && Math.hypot(l.p[0] - x, l.p[2] - z) < 8);
    const add = (text, x, y, z, bg, fg) => { if (text && !near(text, x, z)) out.push({ text, p: [x, y, z], bg, fg }); };
    els.forEach((e) => {
      if (e.type === 'zone' && e.name && e.points && e.points.length >= 3) {
        const c = App.geom.interiorPoint(e.points);
        add(e.name, X(c.x), 0.3, Z(c.y), e.color || '#2f9e44', '#ffffff');
      } else if (e.type === 'item' && e.category === 'event') {
        const memo = String(e.memo || '').trim();
        const text = memo && memo.length <= 14 ? memo : e.boothNo ? `${e.boothNo}${e.exhibitor ? ` ${e.exhibitor}` : ''}` : LANDMARK[e.kind];
        if (!text) return;
        const def = App.catalog.itemDef(e.kind) || {};
        const h = ((e.h3 || def.h3 || 1500) / 1000) + ((baseY && baseY.get(e.id)) || 0) + 0.5;
        add(text, X(e.x), h, Z(e.y), memo ? '#c2410c' : 'rgba(17,24,39,0.86)', '#ffffff');
      }
    });
    return out;
  }

  /** 인파 보기: 관람·대기 구역마다 넓이에 비례해 서 있을 자리 (고르게 흩고 물건 자리는 피함, 무대·화면 쪽을 봄).
      돌려주는 값: [{ x, y, rot, style }], 사람 수는 safety의 예상 인원 기준 (안 넣었으면 1㎡에 1명) */
  const CROWD_MAX = 1000;
  function crowdInfo(els) {
    const zones = els.filter((e) => e.type === 'zone' && e.crowd && e.points.length >= 3);
    if (!zones.length || !App.safety) return { zones, want: 0, n: 0 };
    const r = App.safety.run();
    const total = zones.reduce((t, z) => t + App.model.TYPES.zone.area(z) / 1e6, 0);
    const want = r.auto ? Math.floor(total) : Math.max(0, r.expected - r.seats);
    return { zones, total, want, n: Math.min(CROWD_MAX, want) };
  }
  function crowdSpots(els, items) {
    const info = crowdInfo(els);
    if (!info.n) return [];
    const area = (z) => App.model.TYPES.zone.area(z) / 1e6;
    const obs = items.filter((it) => it.kind !== '사람' && !(App.catalog.itemDef(it.kind) || {}).flat).map((it) => App.model.TYPES.item.bounds(it));
    const free = (x, y) => !obs.some((b) => x > b.minX - 250 && x < b.maxX + 250 && y > b.minY - 250 && y < b.maxY + 250);
    // 구역 가장자리에서 0.45m 안쪽에만 (사람이 구역 밖으로 비어져 나와 장면 범위가 커지지 않게)
    const inside = (p, z) => z.points.every((q, i) => App.geom.closestOnSegment(p, q, z.points[(i + 1) % z.points.length]).dist >= 450);
    const looks = items.filter((it) => it.kind === '무대' || it.kind === 'LED 스크린');
    const rnd = seeded('crowd-spots');
    const STY = ['일반', '일반', '일반', '정장', '어린이'];
    const out = [];
    info.zones.forEach((z, zi) => {
      const want = zi === info.zones.length - 1 ? info.n - out.length : Math.round((info.n * area(z)) / info.total);
      if (want <= 0) return;
      const b = App.model.TYPES.zone.bounds(z);
      const cell = Math.max(420, Math.sqrt((area(z) * 1e6) / want) * 0.85);
      const pts = [];
      for (let y = b.minY + cell / 2; y < b.maxY; y += cell) {
        for (let x = b.minX + cell / 2; x < b.maxX; x += cell) {
          const p = { x: x + (rnd() - 0.5) * cell * 0.8, y: y + (rnd() - 0.5) * cell * 0.8 };
          if (App.geom.pointInPolygon(p, z.points) && free(p.x, p.y) && inside(p, z)) pts.push(p);
        }
      }
      for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
      pts.slice(0, want).forEach((p) => {
        // 가장 가까운 무대·화면 쪽을 봄 (없으면 아무 쪽)
        const t = looks.reduce((m, it) => (!m || Math.hypot(it.x - p.x, it.y - p.y) < Math.hypot(m.x - p.x, m.y - p.y) ? it : m), null);
        const rot = t ? (Math.atan2(-(t.x - p.x), t.y - p.y) * 180) / Math.PI + (rnd() - 0.5) * 50 : rnd() * 360;
        out.push({ x: p.x, y: p.y, rot, style: STY[Math.floor(rnd() * STY.length)] });
      });
    });
    return out;
  }

  function build(o = {}) {
    const doc = App.doc;
    const els = [...doc.all()].filter((e) => App.model.TYPES[e.type] && !App.model.TYPES[e.type].catalog && e.type !== 'underlay' && App.layers.visible(e));
    const drawn = els.filter((e) => ['wall', 'room', 'zone', 'column', 'item', 'route'].includes(e.type));
    if (!drawn.some((e) => e.type !== 'route')) return null;
    const pb = doc.bounds(drawn.map((e) => e.id));
    if (!pb) return null;
    // o.center: 3D를 연 채 다시 조립할 때 원점을 그대로 (물건을 옮겨 범위가 바뀌어도 화면·걷는 자리가 튀지 않게)
    const cx = o.center ? o.center.x : (pb.minX + pb.maxX) / 2, cy = o.center ? o.center.y : (pb.minY + pb.maxY) / 2;
    const X = (x) => (x - cx) / 1000, Z = (y) => (y - cy) / 1000;
    const P = (p) => [X(p.x), Z(p.y)];
    const event = App.modes.is('event');

    const L = newLayers(512);
    const textured = [];
    const S = L.solid;
    const people = els.reduce((n, e) => n + (e.type === 'item' && e.kind === '사람' ? e.count || 1 : 0), 0);
    const seats = els.reduce((n, e) => n + (e.type === 'item' && e.category === 'event' ? (App.catalog.seats(e) || { count: 0 }).count : 0), 0);
    const C = makeCtx(L, textured, { lod: !!o.lod || seats > 1500, crowd: people });
    const world = () => C.world();
    const fit = []; // 조감도 시점을 맞출 때 화면에 들어와야 하는 점들
    const mark = (pts, h) => pts.forEach((p) => {
      fit.push([X(p.x), 0, Z(p.y)]);
      if (h > 0.05) fit.push([X(p.x), h, Z(p.y)]);
    });
    drawn.forEach((e) => {
      if (e.type === 'wall') mark([e.start, e.end], o.low ? Math.min(e.height / 1000, LOW_WALL) : e.height / 1000);
      else if (e.type === 'item') {
        // 돌려 놓은 자리의 네 구석
        const def = App.catalog.itemDef(e.kind) || {};
        const w = e.size / 2, d = (e.depth != null ? e.depth : e.size * (def.aspect || 1)) / 2, a = ((e.rotation || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
        mark([[-w, -d], [w, -d], [w, d], [-w, d]].map(([lx, ly]) => ({ x: e.x + lx * c - ly * s, y: e.y + lx * s + ly * c })), e.depth != null ? App.catalog.itemHeight3(e) / 1000 : 0);
      } else if (e.type === 'column') {
        const b = App.model.TYPES.column.bounds(e);
        mark([{ x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY }, { x: b.maxX, y: b.maxY }, { x: b.minX, y: b.maxY }], o.low ? LOW_WALL : App.settings.wallHeight / 1000);
      } else mark(e.points, 0);
    });
    /** 도면의 두 점 p→q를 잇는 두께 t(m)의 세운 판 */
    const slab = (mesh, p, q, t, y0, y1, c, mat = 0, top = c) => {
      const dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz) || 1, nx = (-dz / l) * (t / 2), nz = (dx / l) * (t / 2);
      const pts = [[p[0] + nx, p[1] + nz], [q[0] + nx, q[1] + nz], [q[0] - nx, q[1] - nz], [p[0] - nx, p[1] - nz]];
      mesh.prism(pts, y0, y1, c, mat, top);
      if (y0 > 0.01) mesh.poly(pts, y0, c, mat);
    };

    /* 영역: 바닥 재질, 잔디·흙·물은 둘레에 경계석. 방 바닥(decals[0]) 위에 그려야 방 안의 영역도 보임 (평면과 같게) */
    els.filter((e) => e.type === 'zone').forEach((z) => {
      const pts = z.points.map(P);
      const s = SURFACE[z.surface];
      if (s) L.decals[1].poly(pts, 0.011, hex(s[1]), s[0]);
      else if (z.surface === 'carpet') L.decals[1].poly(pts, 0.012, hex(z.color), MAT.fabric);
      else L.decals[1].poly(pts, 0.011, mixc(hex(z.color), [1, 1, 1], 0.3), MAT.plain);
      if (['grass', 'soil', 'water'].includes(z.surface)) {
        pts.forEach((p, i) => slab(S, p, pts[(i + 1) % pts.length], 0.16, 0, 0.11, CURB, MAT.concrete));
        pts.forEach((p) => S.cube(p[0], 0, p[1], 0.16, 0.11, 0.16, CURB, MAT.concrete));
      }
    });

    /* 방: 바닥(고른 바닥 모양, 없으면 마감재로 짐작), 천장은 걷기에서만 */
    const LOOK_MAT = {
      plank: MAT.wood, wide: MAT.wideWood, deco: MAT.deco, chevron: MAT.chevron, tile: MAT.tile, 'tile-l': MAT.tileLarge, 'tile-s': MAT.tileSmall,
      marble: MAT.marble, carpet: MAT.fabric, plain: MAT.concrete,
    };
    els.filter((e) => e.type === 'room').forEach((r) => {
      const pts = r.points.map(P);
      const look = App.catalog.floorLook(r);
      let mat = event ? MAT.tile : MAT.wood, c = event ? hex('#d2d5d9') : hex('#cfb48f');
      if (look) {
        mat = LOOK_MAT[look.pattern] != null ? LOOK_MAT[look.pattern] : MAT.wood;
        c = hex(look.color);
        if (look.id === 'epoxy') mat = MAT.gloss;
      }
      L.decals[0].poly(pts, 0.008, c, mat);
      L.ceil.poly(pts, (r.ceilingHeight || App.settings.ceilingHeight) / 1000, hex('#fafaf8'), MAT.plain);
    });
    const rooms = els.filter((e) => e.type === 'room' && !e.issue).map((r) => ({ r, b: App.model.TYPES.room.bounds(r) }));
    /** 점이 든 방 (네모 범위로 먼저 걸러 빠르게) */
    const roomAt = (p) => { const hit = rooms.find(({ r, b }) => p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY && G.pointInPolygon(p, r.points)); return hit ? hit.r : null; };
    const BASEBOARD = hex('#e7e3da');

    /* 벽: 문·창문 자리를 뚫고, 끝은 이음 모양(외곽선)대로 */
    const wallH = (w) => (o.low ? Math.min(w.height / 1000, LOW_WALL) : w.height / 1000);
    els.filter((e) => e.type === 'wall').forEach((w) => {
      const len = G.dist(w.start, w.end);
      if (len < 1) return;
      const H = wallH(w), h = w.thickness / 2;
      const d = G.unit({ x: w.end.x - w.start.x, y: w.end.y - w.start.y }), n = G.perp(d);
      const ol = App.joins.outline(w).pts; // [시작 왼쪽, 끝 왼쪽, 끝 오른쪽, 시작 오른쪽]
      const at = (s, off) => [X(w.start.x + d.x * s + n.x * off), Z(w.start.y + d.y * s + n.y * off)];
      const cut = (s) => (s <= 0.5 ? [P(ol[0]), P(ol[3])] : s >= len - 0.5 ? [P(ol[1]), P(ol[2])] : [at(s, h), at(s, -h)]);
      const wc = w.color ? hex(w.color) : WALL; // 벽 색
      const photo = w.imageId && App.images.get(w.imageId) ? new Mesh(32) : null; // 벽에 붙인 사진: 벽 한 면 전체에 한 장
      // 양쪽 면이 벽을 따라 어느 방을 보는지 (긴 바깥 벽은 여러 방에 걸침): 그 방의 벽지 색, 방이면 걸레받이
      const off = h + 60, photoSide = photo ? w.imageSide || 'both' : null;
      const sideRuns = (sign) => {
        const out = [];
        if (!rooms.length) return out;
        const step = Math.max(40, Math.min(150, len / 40));
        let cur = null;
        for (let t = step / 2; t < len; t += step) {
          const p = { x: w.start.x + d.x * t + n.x * sign * off, y: w.start.y + d.y * t + n.y * sign * off };
          const room = roomAt(p);
          const key = room ? room.id : '';
          if (cur && cur.key === key) cur.b = Math.min(len, t + step / 2);
          else out.push((cur = { key, a: Math.max(0, t - step / 2), b: Math.min(len, t + step / 2), color: room && room.wallColor ? hex(room.wallColor) : null, room: !!room }));
        }
        return out;
      };
      const runsL = sideRuns(1), runsR = sideRuns(-1);
      const noSkin = { 1: photoSide === 'both' || photoSide === 'left', '-1': photoSide === 'both' || photoSide === 'right' };
      /** 벽 한쪽 면에 붙이는 판: side 1(왼쪽)·−1(오른쪽), 벽 면에서 gap(mm) 떨어짐 */
      const skin = (s0, s1, y0, y1, side, gap, col) => {
        const e = h + gap;
        const p = side > 0 ? at(s0, e) : at(s1, -e), q = side > 0 ? at(s1, e) : at(s0, -e);
        S.quad([p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]], col, MAT.plain);
      };
      const piece = (s0, s1, y0, y1) => {
        if (s1 - s0 < 0.5 || y1 - y0 < 0.005) return;
        const [a, a2] = cut(s0), [b, b2] = cut(s1);
        const pts = [a, b, b2, a2];
        S.prism(pts, y0, y1, wc, MAT.plain, WALL_TOP);
        if (y0 > 0.01) S.poly(pts, y0, wc);
        // 벽지 색·걸레받이 (벽 끝에서는 살짝 안쪽까지만: 모서리에서 옆 벽과 겹쳐 깜빡이지 않게)
        const t0 = s0 <= 0.5 ? s0 + h : s0, t1 = s1 >= len - 0.5 ? s1 - h : s1;
        [[1, runsL], [-1, runsR]].forEach(([sign, runs]) => runs.forEach((r) => {
          const a = Math.max(t0, r.a), b = Math.min(t1, r.b);
          if (b - a <= 1) return;
          if (r.color && !noSkin[sign]) skin(a, b, y0, y1, sign, 1.5, r.color);
          if (r.room && y0 < 0.01 && !event && !o.low) skin(a, b, 0, 0.08, sign, 9, BASEBOARD);
        }));
        if (!photo) return;
        const e = h + 4, side = w.imageSide || 'both', v = (y) => 1 - y / H; // 사진은 그 면을 마주 보고 섰을 때 바로 읽히게 붙임
        if (side !== 'right') {
          const p = at(s0, e), q = at(s1, e);
          photo.quadUV([p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]], [[s0 / len, v(y0)], [s1 / len, v(y0)], [s1 / len, v(y1)], [s0 / len, v(y1)]], [1, 1, 1]);
        }
        if (side !== 'left') {
          const p = at(s1, -e), q = at(s0, -e);
          photo.quadUV([p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]], [[1 - s1 / len, v(y0)], [1 - s0 / len, v(y0)], [1 - s0 / len, v(y1)], [1 - s1 / len, v(y1)]], [1, 1, 1]);
        }
      };
      const ops = App.measure.openingsOf(w.id).map((op) => ({ op, g: App.model.openingGeom(op) })).filter((x) => x.g && App.layers.visible(x.op))
        .sort((a, b) => a.g.c - b.g.c);
      let s = 0;
      ops.forEach(({ op, g }) => {
        const a = Math.max(s, g.c - g.half), b = Math.min(len, g.c + g.half);
        piece(s, a, 0, H);
        const top = (op.type === 'window' ? op.sill + op.height : op.height) / 1000;
        if (op.type === 'window') piece(a, b, 0, Math.min(H, op.sill / 1000));
        piece(a, b, Math.min(H, top), H);
        s = Math.max(s, b);
        opening(op, g, H);
      });
      piece(s, len, 0, H);
      if (photo && photo.n) textured.push({ mesh: photo, source: App.models3d.faceCanvas({ imageId: w.imageId }, len / 1000 / H, { bg: wc, plain: true, fit: w.imageFit || 'fit', tile: 1.2 / Math.max(1.2, H) }), layer: 'solid' });
    });

    /** 문·창문: 틀, 문짝(열어 둔 모습), 유리 */
    function opening(op, g, H) {
      const a = P(g.a), b = P(g.b), th = g.th / 1000 + 0.02;
      const dir = [(b[0] - a[0]), (b[1] - a[1])], len = Math.hypot(dir[0], dir[1]) || 1;
      dir[0] /= len; dir[1] /= len;
      const nrm = [g.n.x, g.n.y];
      const along = (p, k) => [p[0] + dir[0] * k, p[1] + dir[1] * k];
      if (op.type === 'window') {
        const y0 = Math.min(H, op.sill / 1000), y1 = Math.min(H, (op.sill + op.height) / 1000);
        if (y1 - y0 < 0.05) return;
        slab(S, a, b, th + 0.04, y0 - 0.03, y0 + 0.02, FRAME);           // 창대
        slab(S, a, b, th, y1 - 0.04, y1, FRAME);
        slab(S, a, along(a, 0.04), th, y0, y1, FRAME);
        slab(S, along(b, -0.04), b, th, y0, y1, FRAME);
        if (op.kind !== '고정창') slab(S, along(a, len / 2 - 0.02), along(a, len / 2 + 0.02), th * 0.5, y0, y1, FRAME);
        L.glass.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], hex('#a9cbe0'), MAT.glass);
        return;
      }
      const y1 = Math.min(H, op.height / 1000);
      if (y1 < 0.3) return;
      slab(S, a, along(a, 0.035), th, 0, y1, FRAME);
      slab(S, along(b, -0.035), b, th, 0, y1, FRAME);
      slab(S, a, b, th, y1 - 0.035, y1, FRAME);
      const w = len - 0.07;
      if (op.kind === '자동문') {
        // 양쪽으로 열린 유리문
        [[a, 1], [b, -1]].forEach(([p, s]) => {
          const p0 = along(p, s * 0.035), p1 = along(p, s * (0.035 + w * 0.2));
          L.glass.quad([p0[0], 0.02, p0[1]], [p1[0], 0.02, p1[1]], [p1[0], y1 - 0.04, p1[1]], [p0[0], y1 - 0.04, p0[1]], hex('#a9cbe0'), MAT.glass);
          slab(S, along(p1, -s * 0.02), p1, 0.04, 0, y1 - 0.04, hex('#b9bec6'), MAT.metal);
        });
        slab(S, a, b, th + 0.06, y1, Math.min(H, y1 + 0.16), hex('#b9bec6'), MAT.metal);
        return;
      }
      const leaf = op.kind === '방화문' ? hex('#8d939b') : hex('#d6b98c'), mat = op.kind === '방화문' ? MAT.metal : MAT.wood;
      if (op.kind === '미닫이') {
        // 벽을 따라 반쯤 밀어 둠
        const p0 = along(a, 0.035 + w * 0.55), p1 = along(a, 0.035 + w * 1.5);
        const off = [nrm[0] * (th / 2 + 0.03), nrm[1] * (th / 2 + 0.03)];
        slab(S, [p0[0] + off[0], p0[1] + off[1]], [p1[0] + off[0], p1[1] + off[1]], 0.04, 0.01, y1 - 0.04, leaf, mat);
        return;
      }
      // 여닫이: 경첩 쪽에서 열리는 쪽으로 80도 열어 둠
      const hinge = op.hinge === 'end' ? along(b, -0.035) : along(a, 0.035);
      const s = op.hinge === 'end' ? -1 : 1, side = op.side || 1;
      const ang = (80 * Math.PI) / 180;
      const lx = dir[0] * s * Math.cos(ang) + nrm[0] * side * Math.sin(ang), lz = dir[1] * s * Math.cos(ang) + nrm[1] * side * Math.sin(ang);
      const hp = [hinge[0] + nrm[0] * side * (th / 2 - 0.02), hinge[1] + nrm[1] * side * (th / 2 - 0.02)];
      const tip = [hp[0] + lx * w, hp[1] + lz * w];
      slab(S, hp, tip, 0.04, 0.01, y1 - 0.04, leaf, mat);
      const hd = [hp[0] + lx * (w - 0.09), hp[1] + lz * (w - 0.09)];
      S.tube([hd[0] - lz * 0.02, 1.0, hd[1] + lx * 0.02], [hd[0] - lz * 0.08, 1.0, hd[1] + lx * 0.08], 0.011, 0.011, hex('#c9ced6'), MAT.metal, 6);
      S.tube([hd[0] + lz * 0.02, 1.0, hd[1] - lx * 0.02], [hd[0] + lz * 0.08, 1.0, hd[1] - lx * 0.08], 0.011, 0.011, hex('#c9ced6'), MAT.metal, 6);
    }

    /* 기둥 */
    els.filter((e) => e.type === 'column').forEach((c) => {
      const room = c.room && doc.get(c.room);
      const H = o.low ? LOW_WALL : ((room && room.ceilingHeight) || App.settings.wallHeight) / 1000;
      world();
      if (c.shape === 'circle') S.cyl(X(c.x), 0, Z(c.y), c.width / 2000, H, c.width / 2000, hex('#b7bac0'), MAT.concrete, 20);
      else S.cube(X(c.x), 0, Z(c.y), c.width / 1000, H, c.depth / 1000, hex('#b7bac0'), MAT.concrete, { top: WALL_TOP });
    });

    /* 물건: 무대 위에 놓인 것은 무대 높이만큼 올림 */
    const items = els.filter((e) => e.type === 'item');
    const stages = items.filter((it) => it.kind === '무대');
    const GROUNDED = new Set(['무대', '계단', '트러스', '몽골텐트', '대형 텐트', '건물', '담장', '주차 구획', '에어아치', '푸드트럭', '버스', '승용차', '나무']);
    const stageUnder = (it) => {
      if (GROUNDED.has(it.kind) || it.category !== 'event') return 0;
      for (const st of stages) {
        const a = (-st.rotation * Math.PI) / 180, dx = it.x - st.x, dy = it.y - st.y;
        const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
        if (Math.abs(lx) <= st.size / 2 && Math.abs(ly) <= st.depth / 2) return App.catalog.itemHeight3(st) / 1000;
      }
      return 0;
    };
    const baseY = new Map(); // 물건 id → 놓인 높이 (m, 무대 위면 무대 높이)
    items.forEach((it) => {
      C.rnd = seeded(it.id);
      const y0 = stageUnder(it);
      if (y0) baseY.set(it.id, y0);
      C.place(X(it.x), Z(it.y), it.rotation || 0, y0);
      itemModel(C, it, { low: o.low });
    });
    /* 인파 보기 (조감도): 예상 인원에서 좌석을 뺀 서 있는 사람을 관람·대기 구역에 세움 (그림은 최대 CROWD_MAX명) */
    const crowd = event && (o.crowd != null ? o.crowd : App.settings.crowd3d === true) ? crowdSpots(els, items) : [];
    if (crowd.length) {
      C.crowd = Math.max(C.crowd, crowd.length); // 사람이 많으면 간단한 모양으로
      crowd.forEach((p, i) => {
        C.rnd = seeded(`crowd${i}`);
        C.place(X(p.x), Z(p.y), p.rot, 0);
        itemModel(C, { id: `crowd${i}`, type: 'item', kind: '사람', category: 'event', size: 500, depth: 400, count: 1, style: p.style, rotation: p.rot }, { low: o.low });
      });
    }
    world();

    /* 동선: 바닥의 색 띠와 화살표 */
    if (o.routes !== false) {
      const R = L.decals[3];
      els.filter((e) => e.type === 'route' && e.points.length >= 2).forEach((r) => {
        const c = hex(r.color || '#1c7ed6'), light = mixc(c, [1, 1, 1], 0.25), y = 0.022, hw = 0.13;
        const pts = r.points.map(P);
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
          if (l < 0.01) continue;
          const ux = dx / l, uz = dz / l, nx = -uz * hw, nz = ux * hw;
          R.quad([a[0] + nx, y, a[1] + nz], [b[0] + nx, y, b[1] + nz], [b[0] - nx, y, b[1] - nz], [a[0] - nx, y, a[1] - nz], light, MAT.emissive);
          R.disc(b[0], y, b[1], hw, light, MAT.emissive, 10);
          const n = Math.max(1, Math.floor(l / 3));
          for (let k = 0; k < n; k++) {
            const t = ((k + 0.5) / n) * l, px = a[0] + ux * t, pz = a[1] + uz * t, q = 0.42;
            R.tri([px + ux * q, y + 0.002, pz + uz * q], [px - ux * q * 0.5 - uz * q * 0.7, y + 0.002, pz - uz * q * 0.5 + ux * q * 0.7],
              [px - ux * q * 0.5 + uz * q * 0.7, y + 0.002, pz - uz * q * 0.5 - ux * q * 0.7], c, MAT.emissive);
          }
        }
        R.disc(pts[0][0], y + 0.003, pts[0][1], 0.32, c, MAT.emissive, 16);
      });
    }

    // 범위: 불투명한 것과 바닥에 깐 것 모두
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    [L.solid, L.glass, ...L.decals, ...textured.map((t) => t.mesh)].forEach((m) => {
      if (!m.n) return;
      for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], m.min[i]); max[i] = Math.max(max[i], m.max[i]); }
    });
    if (min[0] === Infinity) return null;
    if (o.blobs === false) L.blobs = new Mesh(8);
    min[1] = Math.min(min[1], 0);
    const radius = Math.hypot(max[0] - min[0], max[2] - min[2]) / 2;
    const labels = sceneLabels(els, X, Z, baseY);
    // 사진 밑그림(항공사진)은 바닥에 깖: 범위·시점 맞추기에는 넣지 않음 (큰 사진 때문에 행사장이 작게 보이지 않게)
    [...doc.all()].forEach((u) => {
      if (u.type !== 'underlay' || u.visible === false || !App.layers.visible(u)) return;
      const d = App.underlay.data(u);
      const img = d && d.kind === 'image' && App.images.get(u.imageId || d.imageId);
      if (!img) return;
      const a = ((u.rotation || 0) * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a), k = u.scale || 1;
      const W = (lx, ly) => { const x = u.x + k * (lx * c - ly * sn), y = u.y + k * (lx * sn + ly * c); return [X(x), 0.0015, Z(y)]; };
      const m = new Mesh(8);
      // 위를 보는 면: 왼쪽 아래 → 오른쪽 아래 → 오른쪽 위 → 왼쪽 위 (사진의 위쪽이 도면의 위쪽)
      m.quadUV(W(0, d.height), W(d.width, d.height), W(d.width, 0), W(0, 0), [[0, 1], [1, 1], [1, 0], [0, 0]], [1, 1, 1], 0);
      textured.push({ mesh: m, source: img, layer: 'solid' });
    });
    return {
      layers: L, textured, labels, bounds: { min, max }, center: { x: cx, y: cy }, radius, height: max[1], fit, baseY,
      stats: { solid: L.solid.n, glass: L.glass.n, ceil: L.ceil.n, decal: L.decals.reduce((n, m) => n + m.n, 0), textured: textured.length, maxY: max[1] },
    };
  }

  /* ── 화면 상태 ── */
  let el = null, canvas = null, R = null, scene = null, raf = 0;
  let mode = 'orbit';            // 'orbit' 조감도 | 'walk' 걷기
  let low = false, lowChosen = false, showRoutes = true, quality = 'high', pixelRatio = 1, shotScale = 1;
  let slow = 0;                  // 느린 장면이 이어진 횟수 (해상도를 자동으로 낮춤)
  let lastFrame = 0, maxSize = 4096;
  const cam = { yaw: -0.6, pitch: 0.62, dist: 30, target: [0, 0, 0] };
  const walk = { x: 0, z: 0, a: 0, pitch: 0, keys: new Set(), joy: { x: 0, y: 0 }, auto: null, speed: 1, last: 0, bob: 0 };
  // auto: { route, s, playing }

  const sunIndex = () => clamp(App.current.sun3d | 0, 0, SUNS.length - 1);
  /** 3D 이름표: 조감도 모드에서 켜 둠 (설정의 ‘이름표’로 끔). 걷기에서는 가까운 것만 크게 보여 어지러우므로 끔 */
  const labelsOn = () => App.modes.is('event') && App.settings.labels3d !== false && mode !== 'walk';

  function resize() {
    if (rec) return; // 녹화 중: 영상 크기 고정
    const cw = canvas.clientWidth || 1, ch = canvas.clientHeight || 1;
    const dpr = Math.min(window.devicePixelRatio || 1, quality === 'high' ? 2 : 1.25);
    // 화면 전체 픽셀 수를 넘치지 않게 (휴대폰에서 느려지지 않도록)
    const budget = quality === 'high' ? 2.6e6 : 1.2e6;
    pixelRatio = Math.min(dpr, Math.sqrt(budget / (cw * ch))) * (slow >= 2 ? 0.75 : 1);
    const limit = maxSize;
    const k = pixelRatio * shotScale;
    const w = Math.min(limit, Math.max(1, Math.round(cw * k))), h = Math.min(limit, Math.max(1, Math.round(ch * k)));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function camera() {
    if (mode === 'walk') {
      const cp = Math.cos(walk.pitch);
      const eye = [walk.x, EYE + Math.sin(walk.bob) * 0.018, walk.z];
      // 세로 화면(휴대폰)은 좌우가 너무 좁아 보이지 않게 위아래 시야를 넓힘
      const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
      const fov = aspect < 1 ? clamp(2 * Math.atan(Math.tan(Math.PI / 6) / aspect), FOV_WALK, (88 * Math.PI) / 180) : FOV_WALK;
      return {
        eye, target: [eye[0] + Math.cos(walk.a) * cp, eye[1] + Math.sin(walk.pitch), eye[2] + Math.sin(walk.a) * cp],
        fov, near: R.depthBits >= 24 ? 0.1 : 0.25, far: 3200,
      };
    }
    const cp = Math.cos(cam.pitch);
    const eye = [cam.target[0] + cam.dist * cp * Math.sin(cam.yaw), cam.target[1] + cam.dist * Math.sin(cam.pitch), cam.target[2] + cam.dist * cp * Math.cos(cam.yaw)];
    return { eye, target: cam.target, fov: FOV_ORBIT, near: Math.max(0.15, cam.dist * 0.04), far: Math.max(4000, cam.dist * 12) };
  }

  function draw() {
    // 바로 부른 경우(저장·다시 그리기)에도 기다리던 장면을 취소: 안 그러면 그리기 고리가 둘로 늘어 점점 느려짐
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (!R || !scene || el.hidden) return;
    const t0 = performance.now();
    if (mode === 'walk') stepWalk(t0);
    resize();
    const hq = quality === 'high';
    R.render(camera(), {
      sun: sunIndex(), ceil: mode === 'walk', clouds: hq, shadows: true, shadowSize: hq ? 2048 : 1024, labels: labelsOn(),
      fog: mode === 'walk' ? 1 / 700 : 1 / 1500,
      focus: mode === 'walk' ? { center: [walk.x, 0, walk.z], radius: Math.min(32, scene.radius + 4) } : null,
    });
    if (rec) recFrame(t0);
    if (mode === 'walk' && shotScale === 1) {
      // 걷는 동안 계속 느리면(한 장면에 55ms 넘게) 해상도를 한 단계 낮춤
      const gap = lastFrame ? t0 - lastFrame : 0;
      if (moving()) {
        walk.slowFrames = gap > 55 && gap < 500 ? walk.slowFrames + 1 : Math.max(0, walk.slowFrames - 1);
        if (walk.slowFrames > 20 && slow < 2) { slow++; walk.slowFrames = 0; }
        requestDraw();
      }
    }
    lastFrame = t0;
    drawPick();
  }
  const requestDraw = () => { if (!raf) raf = requestAnimationFrame(draw); };

  /* ── 3D에서 물건 고르기·옮기기 ──
     누르면 그 물건을 고르고(테두리 상자 + 위쪽 작은 막대), 고른 물건을 끌면 바닥을 따라 옮김 (손을 떼면 도면에 반영).
     돌리기·복제·지우기는 막대의 버튼으로. 도면이 바뀌면(실행 취소 포함) 장면을 다시 조립 */
  let picked = null, ghost = null, rebuildTimer = 0;
  const v3 = {
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  };
  /** 지금 카메라의 기준 방향들 */
  function basis() {
    const c = camera(), f = v3.norm(v3.sub(c.target, c.eye)), r = v3.norm(v3.cross(f, [0, 1, 0])), u = v3.cross(r, f);
    return { c, f, r, u, t: Math.tan(c.fov / 2), w: canvas.clientWidth || 1, h: canvas.clientHeight || 1 };
  }
  /** 화면 점(CSS px, 캔버스 기준) → 광선 */
  function rayAt(x, y) {
    const B = basis(), nx = (x / B.w) * 2 - 1, ny = 1 - (y / B.h) * 2;
    return { o: B.c.eye, d: v3.norm(v3.add(B.f, v3.add(v3.mul(B.r, nx * B.t * (B.w / B.h)), v3.mul(B.u, ny * B.t)))) };
  }
  /** 3D 점 → 화면 점 (카메라 뒤면 null) */
  function project(p, B) {
    const v = v3.sub(p, B.c.eye), z = v3.dot(v, B.f);
    if (z < B.c.near) return null;
    return [((v3.dot(v, B.r) / (z * B.t * (B.w / B.h)) + 1) / 2) * B.w, ((1 - v3.dot(v, B.u) / (z * B.t)) / 2) * B.h];
  }
  const pickable = (e) => e && e.type === 'item' && e.depth != null && !e.wallId && (e.category === 'event' || e.category === 'furn') && App.layers.visible(e);
  /** 물건의 상자 (m): 가운데·회전·폭·깊이·높이 */
  function itemBox(it, at) {
    const def = App.catalog.itemDef(it.kind) || {};
    return {
      cx: at ? at.cx : (it.x - scene.center.x) / 1000, cz: at ? at.cz : (it.y - scene.center.y) / 1000, a: ((it.rotation || 0) * Math.PI) / 180,
      w: it.size / 1000, d: (it.depth != null ? it.depth : it.size * (def.aspect || 1)) / 1000, h: Math.max(0.06, App.catalog.itemHeight3(it) / 1000),
      y0: (scene && scene.baseY && scene.baseY.get(it.id)) || 0, // 무대 위에 놓인 것은 무대 높이부터
    };
  }
  /** 광선이 상자에 닿는 거리 (안 닿으면 null) */
  function hitBox(ray, b) {
    const c = Math.cos(b.a), s = Math.sin(b.a), ox = ray.o[0] - b.cx, oz = ray.o[2] - b.cz;
    const o = [ox * c + oz * s, ray.o[1], -ox * s + oz * c], d = [ray.d[0] * c + ray.d[2] * s, ray.d[1], -ray.d[0] * s + ray.d[2] * c];
    const mn = [-b.w / 2, b.y0 || 0, -b.d / 2], mx = [b.w / 2, (b.y0 || 0) + b.h, b.d / 2];
    // 눈이 상자 안이면(천막·파라솔 아래에서 걷는 중) 그 물건은 건너뜀: 안 그러면 무엇을 눌러도 천막이 골라짐
    if (o.every((v, i) => v >= mn[i] && v <= mx[i])) return null;
    let t0 = 0, t1 = Infinity;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) { if (o[i] < mn[i] || o[i] > mx[i]) return null; continue; }
      let a = (mn[i] - o[i]) / d[i], z = (mx[i] - o[i]) / d[i];
      if (a > z) [a, z] = [z, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, z);
      if (t0 > t1) return null;
    }
    return t0;
  }
  /** 화면 점에서 가장 가까운 물건 */
  function pickAt(x, y) {
    if (!scene) return null;
    const ray = rayAt(x, y);
    let best = null, bestT = Infinity;
    for (const it of App.doc.all()) {
      if (!pickable(it)) continue;
      const t = hitBox(ray, itemBox(it));
      // 바닥에 깐 것(축구장·러그 등)은 그 위의 물건보다 뒤로
      const flat = (App.catalog.itemDef(it.kind) || {}).flat ? 1e3 : 0;
      if (t != null && t + flat < bestT) { bestT = t + flat; best = it; }
    }
    return best;
  }
  /** 화면 점이 가리키는 바닥 (y = 0) */
  function groundAt(x, y) {
    const r = rayAt(x, y);
    if (r.d[1] > -1e-4) return null;
    const t = -r.o[1] / r.d[1];
    return t > 0 && t < 5000 ? [r.o[0] + r.d[0] * t, r.o[2] + r.d[2] * t] : null;
  }
  /** 고른 물건과 같은 묶음의 것들 (평면처럼 묶음째 고르고 옮김) */
  const groupOf = (id) => (App.withGroups ? App.withGroups([id]) : [id]).filter((x) => App.doc.has(x));
  const anyLocked = (ids) => ids.some((x) => { const e = App.doc.get(x); return e && e.locked; });
  /** 고른 물건 막대: 위 막대가 좁은 화면에서 두 줄이 되어도 가리지 않게 그 바로 아래에 */
  function placePickBar() {
    const bar = el && el.querySelector('.v3-pick');
    if (!bar || bar.hidden) return;
    const top = el.querySelector('.v3-bar').getBoundingClientRect(), box = el.getBoundingClientRect();
    bar.style.top = `${Math.round(top.bottom - box.top + 8)}px`;
  }
  function setPicked(id) {
    picked = id && App.doc.has(id) ? id : null;
    ghost = null;
    const bar = el.querySelector('.v3-pick');
    bar.hidden = !picked;
    if (picked) {
      placePickBar();
      const it = App.doc.get(picked), ids = groupOf(picked), locked = anyLocked(ids);
      bar.querySelector('.v3-pick-name').textContent = ids.length > 1 ? `${it.kind} 외 ${ids.length - 1}개 (묶음)` : it.kind;
      bar.querySelector('[data-pk="rot-"]').disabled = bar.querySelector('[data-pk="rot+"]').disabled = locked;
      bar.querySelector('[data-pk="del"]').disabled = ids.every((x) => App.doc.get(x).locked);
      App.selection.set(ids);
    }
    drawPick();
  }
  /** 고른 물건의 테두리 상자와, 옮기는 중이면 옮겨 갈 자리 */
  function drawPick() {
    const ov = el && el.querySelector('.v3-overlay');
    if (!ov) return;
    const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
    if (ov.width !== Math.round(w * dpr) || ov.height !== Math.round(h * dpr)) { ov.width = Math.round(w * dpr); ov.height = Math.round(h * dpr); }
    const ctx = ov.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ov.width, ov.height);
    const it = picked && scene && App.doc.get(picked);
    if (!it) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const B = basis();
    const box = (b, color, dash) => {
      const c = Math.cos(b.a), s = Math.sin(b.a);
      const corner = (lx, ly, lz) => [b.cx + lx * c - lz * s, ly, b.cz + lx * s + lz * c];
      const y0 = b.y0 || 0;
      const P = [[-1, -1], [1, -1], [1, 1], [-1, 1]].flatMap(([i, k]) => [corner((i * b.w) / 2, y0, (k * b.d) / 2), corner((i * b.w) / 2, y0 + b.h, (k * b.d) / 2)]).map((p) => project(p, B));
      const E = [[0, 2], [2, 4], [4, 6], [6, 0], [1, 3], [3, 5], [5, 7], [7, 1], [0, 1], [2, 3], [4, 5], [6, 7]];
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash(dash ? [6, 5] : []);
      ctx.beginPath();
      E.forEach(([a, z]) => { if (P[a] && P[z]) { ctx.moveTo(P[a][0], P[a][1]); ctx.lineTo(P[z][0], P[z][1]); } });
      ctx.stroke();
      ctx.setLineDash([]);
    };
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2563eb';
    if (ghost) {
      const d = (ghost.id && App.doc.get(ghost.id)) || it; // 묶음에서 끄는 물건
      box(itemBox(d), 'rgba(255,255,255,0.7)', true);
      box({ ...itemBox(d, ghost), y0: itemBox(d).y0 }, accent, false);
    } else box(itemBox(it), accent, false);
  }
  /** 도면이 바뀌면 (3D에서 고친 것, 실행 취소 포함) 장면을 다시 조립 */
  function scheduleRebuild() {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => {
      if (!isOpen()) return;
      if (picked && !App.doc.has(picked)) setPicked(null);
      if (rebuild()) requestDraw();
    }, 40);
  }
  function pickAction(act) {
    const it = picked && App.doc.get(picked);
    if (!it && act !== 'close' && act !== 'undo') return;
    const ids = it ? groupOf(it.id) : [];
    if (act === 'rot-' || act === 'rot+') {
      if (anyLocked(ids)) { App.ui.toast('잠긴 항목은 돌리지 않습니다.'); return; }
      const d = act === 'rot+' ? 15 : -15;
      if (ids.length === 1) {
        App.doc.transact('3D에서 돌리기', () => App.doc.update(it.id, { rotation: ((((it.rotation || 0) + d) % 360) + 360) % 360 }));
      } else {
        // 묶음은 묶음 가운데를 중심으로 함께 돌림
        const b = App.doc.bounds(ids), c = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
        const a = (d * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
        const f = (p) => ({ x: Math.round(c.x + (p.x - c.x) * cs - (p.y - c.y) * sn), y: Math.round(c.y + (p.x - c.x) * sn + (p.y - c.y) * cs) });
        App.doc.transact('3D에서 돌리기', () => ids.forEach((x) => {
          const e = App.doc.get(x);
          if (e.type === 'item' && !e.wallId) App.doc.update(x, { ...f(e), rotation: ((((e.rotation || 0) + d) % 360) + 360) % 360 });
          else if (e.type === 'column' || e.type === 'text') App.doc.update(x, f(e));
          else if (e.start && e.end) App.doc.update(x, { start: f(e.start), end: f(e.end) });
          else if (Array.isArray(e.points)) App.doc.update(x, { points: e.points.map(f), ...(e.seed ? { seed: f(e.seed) } : {}) });
        }));
      }
    } else if (act === 'dup') {
      App.selection.set(ids);
      App.edit.duplicate();
      const copies = App.selection.list();
      const nid = copies.find((x) => { const e = App.doc.get(x); return e && e.kind === it.kind && pickable(e); }) || copies[0];
      if (nid && !ids.includes(nid)) setPicked(nid);
    } else if (act === 'del') {
      // 평면의 삭제와 같은 규칙 (잠긴 것은 남김)
      App.selection.set(ids);
      App.actions.deleteSelection();
      setPicked(App.doc.has(it.id) ? it.id : null);
    } else if (act === 'plan') {
      close(true);
      App.selection.set(ids);
      const b = App.doc.bounds(ids);
      if (b) App.plan.fitToContent({ minX: b.minX - 3000, minY: b.minY - 3000, maxX: b.maxX + 3000, maxY: b.maxY + 3000 });
    } else if (act === 'undo') App.actions.undo();
    else if (act === 'close') setPicked(null);
  }

  /** fresh: 새로 열 때만 원점을 다시 잡음. 연 채로 다시 조립할 때는 원점을 그대로 */
  function rebuild(fresh = false) {
    const center = !fresh && scene && isOpen() ? scene.center : null;
    scene = build({ low: low && mode !== 'walk', routes: showRoutes, lod: quality !== 'high', center });
    if (!scene) return false;
    R.setScene(scene);
    R.setLabels(scene.labels);
    setGround();
    return true;
  }
  function setGround() {
    const g = GROUNDS[groundKey()], b = scene.bounds;
    R.setGround(g[1], hex(g[2]), [(b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2], scene.radius * 2.5);
  }

  /** 정한 방향(yaw·pitch)에서 장면이 화면(aspect)에 다 들어오는 거리로 카메라를 둠.
      box: 장면 점이 들어와야 하는 화면 범위 [좌우, 위, 아래] (-1~1) */
  function fitCam(yaw, pitch, aspect, box = [0.93, 0.76, -0.86]) {
    const b = scene.bounds;
    cam.target = [(b.min[0] + b.max[0]) / 2, Math.min(3, scene.height * 0.3), (b.min[2] + b.max[2]) / 2];
    cam.yaw = yaw;
    cam.pitch = pitch;
    const fits = (dist) => {
      cam.dist = dist;
      const c = camera();
      const vp = M4.mul(M4.perspective(c.fov, aspect, 0.1, 10000), M4.lookAt(c.eye, c.target, [0, 1, 0]));
      for (const q of scene.fit) {
        if (vp[3] * q[0] + vp[7] * q[1] + vp[11] * q[2] + vp[15] <= 0.01) return false; // 카메라 뒤
        const p = M4.point(vp, q);
        if (Math.abs(p[0]) > box[0] || p[1] > box[1] || p[1] < box[2]) return false;
      }
      return true;
    };
    let lo = 1.5, hi = 2500;
    for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
    cam.dist = hi;
  }
  /** 조감도 시점으로: 장면이 화면에 다 들어오게 (위쪽 버튼 줄과 아래 안내에 가리지 않게 여백을 둠) */
  function resetView(top = false) {
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    // 세로 화면은 더 위에서 내려다봐야 화면에 꽉 참
    fitCam(top ? 0 : -0.6, top ? 1.5 : aspect < 1 ? 0.92 : 0.62, aspect);
    requestDraw();
  }
  /** 지금 방향 그대로, 장면이 다 들어오게 거리만 다시 맞춤 */
  function refit() {
    const yaw = cam.yaw, pitch = cam.pitch;
    resetView(pitch > 1.4);
    cam.yaw = yaw;
    if (pitch <= 1.4) cam.pitch = pitch;
    requestDraw();
  }

  /* ── 조감도 조작 ── */
  function pan(dx, dy) {
    const k = (2 * cam.dist * Math.tan(FOV_ORBIT / 2)) / Math.max(1, canvas.clientHeight);
    const right = [Math.cos(cam.yaw), 0, -Math.sin(cam.yaw)], fwd = [-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw)];
    const s = 1 / Math.max(0.35, Math.sin(cam.pitch)); // 눕혀 볼수록 앞뒤로는 더 많이 움직임
    cam.target[0] += (-right[0] * dx + fwd[0] * dy * s) * k;
    cam.target[2] += (-right[2] * dx + fwd[2] * dy * s) * k;
  }
  const zoom = (f) => { cam.dist = clamp(cam.dist * f, 1.5, 2500); };

  /* ── 걷기 ── */
  const planPos = (x, z) => ({ x: scene.center.x + x * 1000, y: scene.center.y + z * 1000 });
  /** 걷기에서 부딪히는 것: 보이는 레이어의 벽·기둥·물건만 (숨긴 것은 그리지 않으니 지나감).
      경사로·계단도 막음: 걷기에는 높낮이가 없어 올라서지 못하고 모형을 뚫고 지나가게 되므로 */
  let walkObs = { key: '', list: [] };
  function walkObstacles() {
    const key = `${App.doc.version}|${App.layers.hidden().join(',')}`;
    if (walkObs.key !== key) walkObs = { key, list: App.routes.obstacles().filter((ob) => { const e = App.doc.get(ob.id); return !e || App.layers.visible(e); }) };
    return walkObs.list;
  }
  const blocked = (x, z) => App.routes.nearest(planPos(x, z), walkObstacles()).dist < BODY;
  const moving = () => walk.keys.size > 0 || Math.hypot(walk.joy.x, walk.joy.y) > 0.05 || !!(walk.auto && walk.auto.playing);

  function stepWalk(now) {
    // 느린 기기에서도 걷는 빠르기가 같게: 지난 시간만큼 움직이되 한 번에 0.25초까지만
    const dt = Math.min(0.25, walk.last ? (now - walk.last) / 1000 : 0);
    walk.last = now;
    if (!dt) return;
    advance(dt);
  }
  function advance(dt) {
    const A = walk.auto;
    if (A && A.playing) {
      // 동선을 따라 자동으로: 길의 방향을 부드럽게 따라 봄
      const len = App.routes.length(A.route);
      A.s = Math.min(len, A.s + dt * 1400 * walk.speed);
      const p = App.routes.pointAt(A.route, A.s);
      walk.x = (p.x - scene.center.x) / 1000;
      walk.z = (p.y - scene.center.y) / 1000;
      const want = Math.atan2(p.dir.y, p.dir.x) + A.look;
      let diff = want - walk.a;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      walk.a += diff * Math.min(1, dt * 3.2);
      walk.bob += dt * 9 * walk.speed;
      if (A.s >= len) {
        A.playing = false;
        App.ui.toast(`${A.route.name} 끝에 도착했습니다. 조이스틱으로 더 둘러보거나 ‘처음부터’를 누르세요.`);
      }
      syncWalkUi();
      return;
    }
    const k = walk.keys;
    let f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - walk.joy.y;
    let s = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) + walk.joy.x;
    const turn = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0);
    if (turn) walk.a += turn * dt * 1.9;
    const mag = Math.hypot(f, s);
    if (mag < 0.05) return;
    if (mag > 1) { f /= mag; s /= mag; }
    const v = 1.5 * walk.speed * (k.has('ShiftLeft') || k.has('ShiftRight') ? 2.4 : 1) * dt;
    // 얇은 벽을 건너뛰지 않게 0.12m씩 나눠서 움직임
    const n = Math.max(1, Math.ceil(v / 0.12));
    const dx = ((Math.cos(walk.a) * f - Math.sin(walk.a) * s) * v) / n, dz = ((Math.sin(walk.a) * f + Math.cos(walk.a) * s) * v) / n;
    for (let i = 0; i < n; i++) {
      // 벽·물건에 막히면 미끄러지듯 한쪽으로만. 이미 물건 안이면 빠져나올 수 있게 그냥 감
      if (blocked(walk.x, walk.z) || !blocked(walk.x + dx, walk.z + dz)) { walk.x += dx; walk.z += dz; }
      else if (!blocked(walk.x + dx, walk.z)) walk.x += dx;
      else if (!blocked(walk.x, walk.z + dz)) walk.z += dz;
      else break;
    }
    walk.bob += dt * 9 * Math.min(1, mag) * walk.speed;
  }

  /** 걷기 시작: 동선이 있으면 그 출발점, 없으면 입구(문·에어아치) 앞 */
  function startWalk(routeId) {
    const routes = App.routes.all().filter((r) => r.points.length >= 2 && App.layers.visible(r));
    const start = App.routes.entrance();
    let route = routes.find((r) => r.id === routeId) || (start.route && routes.includes(start.route) ? start.route : routes[0]) || null;
    mode = 'walk';
    if (low) rebuild(); // 걷기에서는 벽을 낮추지 않음
    walk.pitch = -0.03;
    walk.last = 0;
    walk.slowFrames = 0;
    walk.keys.clear();
    walk.joy = { x: 0, y: 0 };
    if (route) {
      const p = App.routes.pointAt(route, 0);
      walk.x = (p.x - scene.center.x) / 1000;
      walk.z = (p.y - scene.center.y) / 1000;
      walk.a = Math.atan2(p.dir.y, p.dir.x);
      walk.auto = { route, s: 0, playing: !!routeId, look: 0 };
    } else {
      walk.x = (start.x - scene.center.x) / 1000;
      walk.z = (start.y - scene.center.y) / 1000;
      walk.a = start.angle;
      walk.auto = null;
    }
    syncUi();
    const keys = App.ui.mobile.matches ? '조이스틱으로 걷기' : '왼쪽 아래 조이스틱이나 W A S D로 걷기';
    hint(route ? `끌어서 둘러보기 · ${keys} · ‘길 따라 걷기’로 동선 따라가기` : `끌어서 둘러보기 · ${keys} · 동선을 그리면 그 길을 따라 걸을 수 있습니다`);
    requestDraw();
  }
  function stopWalk() {
    mode = 'orbit';
    walk.auto = null;
    walk.keys.clear();
    if (low) rebuild();
    syncUi();
    requestDraw();
  }

  /* ── 손가락·마우스 ── */
  function bindControls() {
    const pts = new Map();
    const local = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      const p = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, pan: e.button === 1 || e.button === 2 || e.shiftKey, moved: false, drag: null };
      if (pts.size) pts.forEach((q) => { q.drag = null; q.moved = true; }); // 두 손가락이면 고르기·옮기기 안 함
      else if (!p.pan) {
        const [lx, ly] = local(e);
        const hit = rec ? null : pickAt(lx, ly); // 녹화 중에는 물건을 고르지 않음 (막대가 영상 조작을 가리지 않게)
        p.hit = hit ? hit.id : null;
        // 이미 고른 물건을 누르고 끌면 옮김
        if (hit && picked && groupOf(picked).includes(hit.id) && !anyLocked(groupOf(picked))) {
          const g = groundAt(lx, ly), b = itemBox(hit);
          if (g) p.drag = { id: hit.id, off: [b.cx - g[0], b.cz - g[1]] };
        }
      }
      pts.set(e.pointerId, p);
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      if (!p.moved && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > 6) p.moved = true;
      if (p.drag) {
        if (p.moved) {
          const [lx, ly] = local(e), g = groundAt(lx, ly);
          if (g) { ghost = { id: p.drag.id, cx: g[0] + p.drag.off[0], cz: g[1] + p.drag.off[1] }; drawPick(); }
        }
        return;
      }
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (mode === 'walk') {
        // 끌면 둘러봄 (장면이 손가락을 따라옴)
        const k = 0.0052;
        if (walk.auto && walk.auto.playing) walk.auto.look = clamp(walk.auto.look - dx * k, -2.6, 2.6);
        else walk.a -= dx * k;
        walk.pitch = clamp(walk.pitch + dy * k, -1.2, 1.2);
      } else if (pts.size === 1) {
        if (p.pan) pan(dx, dy);
        else {
          cam.yaw -= dx * 0.008;
          cam.pitch = clamp(cam.pitch + dy * 0.006, 0.05, 1.55);
        }
      } else {
        const [a, b] = [...pts.values()];
        const d0 = Math.hypot(a.x - b.x, a.y - b.y), m0 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        p.x = e.clientX; p.y = e.clientY;
        const d1 = Math.hypot(a.x - b.x, a.y - b.y), m1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (d0 > 0 && d1 > 0) zoom(d0 / d1);
        pan(m1.x - m0.x, m1.y - m0.y);
      }
      p.x = e.clientX;
      p.y = e.clientY;
      requestDraw();
    });
    const end = (e) => {
      const p = pts.get(e.pointerId);
      pts.delete(e.pointerId);
      if (!p || e.type === 'pointercancel') { if (p && p.drag) { ghost = null; drawPick(); } return; }
      if (p.drag && p.moved && ghost) {
        // 옮긴 자리를 도면에 (10mm 단위)
        // 끈 물건이 10mm 단위 자리에 오게, 같은 묶음도 같은 만큼 (평면의 화살표 이동과 같은 규칙)
        const it = App.doc.get(p.drag.id), g = ghost;
        ghost = null;
        if (it) {
          const x = Math.round((scene.center.x + g.cx * 1000) / 10) * 10, y = Math.round((scene.center.y + g.cz * 1000) / 10) * 10;
          App.selection.set(groupOf(it.id));
          if (x !== it.x || y !== it.y) App.edit.nudge(x - it.x, y - it.y);
        }
        drawPick();
      } else if (!p.moved && !p.pan) {
        setPicked(p.hit);
        if (p.hit) hint(App.ui.mobile.matches ? '고른 물건을 끌어 옮기세요 · 위 막대: 돌리기·복제·지우기' : '고른 물건을 끌어 옮기세요 · 위 막대: 돌리기·복제·지우기 · Esc: 고르기 풀기', 3500);
      }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    App.doc.onChange(() => { if (isOpen()) scheduleRebuild(); });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (mode === 'walk') {
        // 휠: 앞뒤로 조금 걷기
        const v = -Math.sign(e.deltaY) * 0.5, dx = Math.cos(walk.a) * v, dz = Math.sin(walk.a) * v;
        if (blocked(walk.x, walk.z) || !blocked(walk.x + dx, walk.z + dz)) { walk.x += dx; walk.z += dz; }
      } else {
        zoom(Math.exp(e.deltaY * 0.0012));
      }
      requestDraw();
    }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // 휴대폰은 앱을 뒤로 보내거나 메모리가 모자라면 WebGL을 잃음 → 돌아오면 그리개를 새로 만들고 장면을 다시 올림
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      cancelAnimationFrame(raf);
      raf = 0;
      if (isOpen()) App.ui.toast('3D 화면이 잠시 끊겼습니다. 곧 다시 그립니다.');
    });
    canvas.addEventListener('webglcontextrestored', () => {
      try {
        R = new Renderer(canvas);
        if (isOpen() && rebuild()) requestDraw();
      } catch (_) {
        if (isOpen()) App.ui.toast('3D 화면을 다시 그리지 못했습니다. 앱을 다시 열어 보세요.');
      }
    });

    // 걷기 자판: W A S D·화살표, Shift 빠르게
    const KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);
    window.addEventListener('keydown', (e) => {
      if (!isOpen() || mode !== 'walk' || !KEYS.has(e.code) || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (rec && rec.kind === 'route') { e.preventDefault(); return; } // 길 따라 걷기 녹화 중: 직접 걷기는 막음 (녹화가 끊기지 않게)
      e.preventDefault();
      if (walk.auto && walk.auto.playing && !e.code.startsWith('Shift')) walk.auto.playing = false; // 직접 걷기 시작하면 자동 걷기는 멈춤
      if (!walk.keys.size) walk.last = performance.now(); // 멈춰 있다 누르면 지금부터 (예전 시각이면 첫 장면에 크게 튐)
      walk.keys.add(e.code);
      syncWalkUi();
      requestDraw();
    });
    window.addEventListener('keyup', (e) => walk.keys.delete(e.code));
    window.addEventListener('blur', () => walk.keys.clear());

    // 조이스틱
    const joy = el.querySelector('.v3-joy'), knob = joy.querySelector('.v3-knob');
    let jid = null;
    const setJoy = (e) => {
      const r = joy.getBoundingClientRect(), R0 = r.width / 2;
      let x = (e.clientX - r.left - R0) / R0, y = (e.clientY - r.top - R0) / R0;
      const m = Math.hypot(x, y);
      if (m > 1) { x /= m; y /= m; }
      walk.joy = { x, y };
      knob.style.transform = `translate(${x * R0 * 0.55}px, ${y * R0 * 0.55}px)`;
    };
    joy.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (rec && rec.kind === 'route') return;
      joy.setPointerCapture(e.pointerId);
      jid = e.pointerId;
      if (walk.auto && walk.auto.playing) { walk.auto.playing = false; syncWalkUi(); }
      walk.last = performance.now();
      setJoy(e);
      requestDraw();
    });
    joy.addEventListener('pointermove', (e) => { if (e.pointerId === jid) { setJoy(e); requestDraw(); } });
    const joyEnd = (e) => {
      if (e.pointerId !== jid) return;
      jid = null;
      walk.joy = { x: 0, y: 0 };
      knob.style.transform = '';
    };
    joy.addEventListener('pointerup', joyEnd);
    joy.addEventListener('pointercancel', joyEnd);
  }

  /* ── 영상 저장: 3D 화면을 그대로 영상 파일로 (MediaRecorder). mp4를 쓸 수 있으면 mp4, 아니면 webm ──
     orbit: 지금 높이에서 12초 한 바퀴, route: 동선을 따라 끝까지 걷기, free: 멈출 때까지 (최대 3분) */
  let rec = null;
  const REC_TYPES = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const recBroken = new Set(); // 지원한다면서 실제로는 아무것도 못 만드는 형식 (다음부터 건너뜀)
  function recTypes() {
    if (!window.MediaRecorder || !canvas.captureStream) return [];
    return REC_TYPES.filter((t) => { try { return !recBroken.has(t) && MediaRecorder.isTypeSupported(t); } catch (_) { return false; } });
  }
  const recType = () => recTypes()[0] || null;
  /* ── 시점 저장: 조감도 시점(돌리기·높이·거리·보는 곳)을 이 도면에 저장하고 다시 감. 시점 투어 영상·제안서 3D 쪽에 씀 ──
     보는 곳은 도면 좌표(mm)로 저장 (도면이 바뀌어 3D 원점이 달라져도 같은 곳을 봄) */
  const savedViews = () => (Array.isArray(App.current.views3d) ? App.current.views3d : []);
  function viewName(yaw, pitch) {
    if (pitch > 1.3) return '위에서';
    const a = ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return ['앞에서', '오른쪽에서', '뒤에서', '왼쪽에서'][Math.round(a / (Math.PI / 2)) % 4];
  }
  function saveView() {
    if (!scene) return null;
    if (mode === 'walk') { hint('조감도 시점에서 저장할 수 있습니다 (‘조감도’를 누른 뒤)', 3000); return null; }
    const list = savedViews().slice(0, 11);
    let name = viewName(cam.yaw, cam.pitch), k = 2;
    while (list.some((v) => v.name === name)) name = `${viewName(cam.yaw, cam.pitch)} ${k++}`;
    const v = { name, yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist, x: scene.center.x + cam.target[0] * 1000, y: scene.center.y + cam.target[2] * 1000, h: cam.target[1] };
    App.current.views3d = [...list, v];
    if (App.projects && App.projects.saveNow) App.projects.saveNow();
    renderViews();
    hint(`‘${name}’ 시점을 저장했습니다. 영상 → ‘시점 투어’로 차례로 돌아볼 수 있습니다.`, 3500);
    return v;
  }
  /** 저장한 시점을 카메라 값으로 (지금 장면의 원점 기준) */
  const viewCam = (v) => ({ yaw: v.yaw, pitch: v.pitch, dist: v.dist, target: [(v.x - scene.center.x) / 1000, v.h || 0, (v.y - scene.center.y) / 1000] });
  function goView(i) {
    const v = savedViews()[i];
    if (!v || !scene) return;
    if (mode === 'walk') stopWalk();
    Object.assign(cam, viewCam(v));
    syncUi();
    requestDraw();
  }
  function deleteView(i) {
    App.current.views3d = savedViews().filter((_, k) => k !== i);
    if (App.projects && App.projects.saveNow) App.projects.saveNow();
    renderViews();
  }
  function renderViews() {
    if (!el) return;
    const box = el.querySelector('.v3-views');
    if (!box) return;
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    box.innerHTML = savedViews().map((v, i) => `<span class="v3-view"><button type="button" class="btn" data-view-go="${i}">${esc(v.name)}</button><button type="button" class="btn v3-view-del" data-view-del="${i}" aria-label="${esc(v.name)} 지우기" title="지우기">×</button></span>`).join('')
      + '<button type="button" class="btn" data-view-add title="지금 보는 시점을 저장">+ 지금 시점</button>';
  }
  /** 시점 투어: 시점마다 1.2초 머물고 3초 동안 다음 시점으로 부드럽게 */
  const TOUR_HOLD = 1200, TOUR_MOVE = 3000;
  const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
  function tourCam(ms) {
    const list = savedViews().map(viewCam);
    const seg = TOUR_HOLD + TOUR_MOVE;
    const i = Math.min(list.length - 1, Math.floor(ms / seg));
    const local = ms - i * seg;
    const a = list[i], b = list[Math.min(list.length - 1, i + 1)];
    const t = i >= list.length - 1 || local <= TOUR_HOLD ? 0 : Math.min(1, (local - TOUR_HOLD) / TOUR_MOVE);
    const e = t * t * (3 - 2 * t);
    cam.yaw = lerpAngle(a.yaw, b.yaw, e);
    cam.pitch = a.pitch + (b.pitch - a.pitch) * e;
    cam.dist = Math.exp(Math.log(a.dist) + (Math.log(b.dist) - Math.log(a.dist)) * e);
    cam.target = a.target.map((x, k) => x + (b.target[k] - x) * e);
  }

  /** kind: 'orbit' | 'route' | 'free' | 'tour'. o.duration(초)는 시험용 */
  function startRecording(kind, o = {}) {
    if (rec) return Promise.resolve(null);
    if (!recType()) { App.ui.toast('이 기기·브라우저에서는 영상 저장을 쓸 수 없습니다. ‘사진 저장’을 써 주세요.'); return Promise.resolve(null); }
    if (kind === 'route') {
      const routes = App.routes.all().filter((r) => r.points.length >= 2 && App.layers.visible(r));
      if (!routes.length) { App.ui.toast('동선이 없습니다. 동선 도구로 길을 그린 뒤 다시 해 보세요.'); return Promise.resolve(null); }
      startWalk((walk.auto && routes.includes(walk.auto.route) ? walk.auto.route : routes[0]).id);
      walk.auto.s = 0;
      walk.auto.look = 0;
      walk.auto.playing = true;
      walk.last = 0;
      walk.keys.clear();
      walk.joy = { x: 0, y: 0 };
    } else if (kind === 'orbit' && mode === 'walk') { stopWalk(); resetView(false); }
    else if (kind === 'tour') {
      if (savedViews().length < 2) { App.ui.toast('시점을 두 개 이상 저장하세요 (3D 설정 → 시점 → ‘+ 지금 시점’).'); return Promise.resolve(null); }
      if (mode === 'walk') stopWalk();
    }
    if (picked) setPicked(null);
    // 영상 크기: 지금 화면 비율 그대로, 긴 쪽 1280 (짝수로: 동영상 부호화 조건)
    const cw = canvas.clientWidth || 1, ch = canvas.clientHeight || 1, k = (o.longSide || 1280) / Math.max(cw, ch); // o.longSide: 시험용
    const size0 = [canvas.width, canvas.height];
    canvas.width = Math.max(2, Math.round((cw * k) / 2) * 2);
    canvas.height = Math.max(2, Math.round((ch * k) / 2) * 2);
    let stream;
    try {
      stream = canvas.captureStream(30);
    } catch (e) {
      [canvas.width, canvas.height] = size0;
      App.ui.toast(`영상을 시작하지 못했습니다. ${(e && e.message) || ''}`);
      return Promise.resolve(null);
    }
    rec = { kind, type: null, recorder: null, stream, chunks: [], frames: 0, t0: performance.now(), dur: o.duration ? o.duration * 1000 : kind === 'orbit' ? 12000 : kind === 'tour' ? savedViews().length * (TOUR_HOLD + TOUR_MOVE) - TOUR_MOVE + 600 : 180000, yaw0: cam.yaw, aspect: cw / ch, reason: '' };
    let resolveDone;
    const done = new Promise((resolve) => { resolveDone = resolve; });
    const onStop = (recorder) => {
      if (!rec || rec.recorder !== recorder) return;
      const r = rec;
      if (!r.stopping) r.failed = true; // 누르지 않았는데 녹화기가 스스로 멈춤 (부호화기를 못 연 기기 등)
      if (!r.t1) r.t1 = performance.now();
      try { r.stream.getTracks().forEach((tr) => tr.stop()); } catch (_) { /* 무시 */ }
      rec = null;
      el.querySelector('.v3-rec').hidden = true;
      syncUi();
      resize();
      requestDraw();
      const secs = Math.max(0, Math.round((r.t1 - r.t0) / 1000));
      const blob = new Blob(r.chunks, { type: r.type.split(';')[0] });
      if (!blob.size) {
        // 지원한다면서 아무것도 못 만든 형식: 다음에는 다른 형식으로 (오류로 멈췄거나, 충분히 녹화했는데 비었을 때. 바로 멈춘 것은 형식 탓이 아님)
        const other = recTypes().some((t) => t !== r.type);
        if ((r.failed || (r.frames >= 10 && secs >= 2)) && other) {
          recBroken.add(r.type);
          App.ui.toast('이 형식으로는 영상이 만들어지지 않았습니다. 한 번 더 누르면 다른 형식으로 녹화합니다.', 6000);
        } else App.ui.toast('영상이 비어 있어 저장하지 않았습니다. 조금 더 길게 녹화해 보세요.');
        resolveDone(null);
        return;
      }
      const ext = /mp4/.test(r.type) ? 'mp4' : 'webm';
      const name = `${((App.projects && App.projects.current && App.projects.current.name) || '도면').replace(/[\\/:*?"<>|]+/g, '_').trim() || '도면'}_${r.kind === 'orbit' ? '돌려보기' : r.kind === 'route' ? '걷기' : r.kind === 'tour' ? '시점투어' : '3D'}_${App.exporter.stamp()}.${ext}`;
      const why = { cap: ' · 최대 3분이라 여기서 멈췄습니다', resize: ' · 화면 방향·크기가 바뀌어 멈췄습니다' }[r.reason] || '';
      if (!o.noSave) App.exporter.saved(App.exporter.download(name, blob), `‘${name}’을 저장했습니다 (${secs}초${why}).`);
      resolveDone({ blob, name, type: r.type, reason: r.reason });
    };
    // 형식을 차례로: 녹화기를 만들거나 시작하다 바로 실패하면 다음 형식으로.
    // (조각이 늦게 나오는 것은 고장이 아님: mp4는 멈출 때 한꺼번에 나오기도 함 → 다 끝난 뒤 비어 있을 때만 그 형식을 뺌)
    for (const t of recTypes()) {
      let recorder = null;
      try {
        recorder = new MediaRecorder(stream, { mimeType: t, videoBitsPerSecond: 6e6 });
        recorder.ondataavailable = (e) => { if (e.data && e.data.size && rec && rec.recorder === recorder) rec.chunks.push(e.data); };
        recorder.onstop = () => onStop(recorder);
        recorder.onerror = () => { if (rec && rec.recorder === recorder) { rec.failed = true; stopRecording(); } };
        rec.type = t;
        rec.recorder = recorder;
        recorder.start(1000);
        break;
      } catch (_) {
        recBroken.add(t);
        if (recorder) { recorder.onstop = null; recorder.onerror = null; }
        rec.recorder = null;
        rec.type = null;
      }
    }
    if (!rec.recorder) {
      try { stream.getTracks().forEach((tr) => tr.stop()); } catch (_) { /* 무시 */ }
      rec = null;
      [canvas.width, canvas.height] = size0;
      resize();
      requestDraw();
      App.ui.toast('이 기기에서는 영상을 만들지 못했습니다. ‘사진 저장’을 써 주세요.');
      return Promise.resolve(null);
    }
    rec.done = done;
    clearTimeout(hintTimer); // 녹화 중에는 안내를 숨기므로, 끝난 뒤 예전 안내가 다시 나오지 않게 지움
    el.querySelector('.v3-hint').hidden = true;
    el.querySelector('.v3-rec').hidden = false;
    el.querySelector('.v3-rec-time').textContent = '0:00';
    syncUi();
    requestDraw();
    return done;
  }
  const clock = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  function recFrame(now) {
    rec.frames++;
    const t = (now - rec.t0) / rec.dur;
    if (rec.kind === 'orbit') cam.yaw = rec.yaw0 + Math.PI * 2 * Math.min(1, t);
    else if (rec.kind === 'tour') tourCam(Math.min(rec.dur, Math.max(0, now - rec.t0)) * (rec.speed || 1));
    // 지난 시간 / 끝(한 바퀴는 12초, 나머지는 최대 3분)
    el.querySelector('.v3-rec-time').textContent = `${clock(Math.floor(Math.max(0, now - rec.t0) / 1000))} / ${clock(Math.round(rec.dur / 1000))}`;
    const routeDone = rec.kind === 'route' && (!walk.auto || !walk.auto.playing);
    if (t >= 1) stopRecording(rec.kind === 'orbit' || rec.kind === 'tour' ? '' : 'cap');
    else if (routeDone) stopRecording();
    else requestDraw(); // 녹화 중에는 계속 그림
  }
  /** 녹화 멈추고 저장. reason: ''(직접·끝까지) · 'cap'(3분) · 'resize'(화면 방향) */
  function stopRecording(reason = '') {
    if (!rec || rec.stopping) return;
    rec.stopping = true;
    rec.reason = reason;
    rec.t1 = performance.now();
    try { rec.recorder.requestData(); } catch (_) { /* 이미 멈춤 */ }
    try { rec.recorder.stop(); } catch (_) { /* 이미 멈춤 */ }
    try { rec.stream.getTracks().forEach((tr) => tr.stop()); } catch (_) { /* 무시 */ }
  }
  // 화면이 꺼지거나 다른 앱으로 가면 녹화를 잠시 멈췄다가 돌아오면 이어서 (멈춘 동안은 시간에 넣지 않음, 장면이 굳은 영상이 되지 않게)
  document.addEventListener('visibilitychange', () => {
    if (!rec || rec.stopping) return;
    if (document.hidden) {
      try { if (rec.recorder.state === 'recording') rec.recorder.pause(); } catch (_) { /* 무시 */ }
      rec.hiddenAt = performance.now();
    } else if (rec.hiddenAt) {
      rec.t0 += performance.now() - rec.hiddenAt;
      rec.hiddenAt = 0;
      walk.last = 0; // 걷기: 멈춘 시간만큼 한 번에 튀지 않게
      try { if (rec.recorder.state === 'paused') rec.recorder.resume(); } catch (_) { /* 무시 */ }
      requestDraw();
    }
  });
  // 화면 방향·크기가 크게 바뀌면 거기까지 저장 (영상 크기는 처음 그대로라 늘어나 보임)
  window.addEventListener('resize', () => {
    if (!rec || rec.stopping || !canvas) return;
    const a = (canvas.clientWidth || 1) / (canvas.clientHeight || 1);
    if (Math.abs(a - rec.aspect) / rec.aspect > 0.12) stopRecording('resize');
  });

  /** 제안서용 정지 그림: 3D 화면을 열지 않고(열려 있으면 지금 장면으로) 정한 방향들에서 그려 캔버스로 돌려줌.
      views: [{ yaw, pitch, box? } 또는 { saved: 저장한 시점 }] (box: fitCam의 화면 범위), w·h: 픽셀. 3D를 쓸 수 없거나 그릴 것이 없으면 null */
  function stills(views, w, h) {
    ensureElement();
    if (rec) return null;
    if (!R) {
      try {
        R = new Renderer(canvas);
        maxSize = Math.min(4096, R.gl.getParameter(R.gl.MAX_RENDERBUFFER_SIZE) || 4096);
      } catch (_) {
        R = null;
        return null;
      }
      bindControls();
    }
    if (R.gl.isContextLost()) return null;
    const wasOpen = isOpen();
    const saved = { cam: { ...cam, target: cam.target.slice() }, mode, w: canvas.width, h: canvas.height };
    if (!wasOpen) {
      // 인테리어 도면은 방 안이 보이게 벽을 낮춤 (3D 화면을 열 때와 같게), 물건은 세밀하게
      scene = build({ low: lowChosen ? low : App.modes.is('interior'), routes: showRoutes, lod: false });
      if (!scene) return null;
      R.setScene(scene);
      R.setLabels(scene.labels);
      setGround();
    }
    const k = Math.min(1, maxSize / Math.max(w, h));
    const W = Math.max(2, Math.round(w * k)), H = Math.max(2, Math.round(h * k));
    const out = [];
    try {
      mode = 'orbit';
      canvas.width = W;
      canvas.height = H;
      for (const v of views) {
        if (v.saved) Object.assign(cam, viewCam(v.saved)); // 저장한 시점 그대로
        else fitCam(v.yaw, v.pitch, W / H, v.box || [0.9, 0.86, -0.9]);
        R.render(camera(), { sun: sunIndex(), ceil: false, clouds: true, shadows: true, shadowSize: 2048, fog: 1 / 1500, focus: null, labels: labelsOn() });
        const c = document.createElement('canvas'); // 같은 순간에 옮겨 담아야 그림이 남아 있음
        c.width = W;
        c.height = H;
        c.getContext('2d').drawImage(canvas, 0, 0);
        out.push(c);
      }
    } catch (e) {
      console.warn('3D 정지 그림 실패', e);
      return null;
    } finally {
      Object.assign(cam, saved.cam);
      mode = saved.mode;
      canvas.width = saved.w;
      canvas.height = saved.h;
      if (wasOpen) { resize(); requestDraw(); } else { R.clearScene(); scene = null; }
    }
    return out;
  }

  /** 지금 시점을 그림 파일로. 긴 쪽이 2560px쯤 되게 크게 그려서 저장 (발표 자료·인쇄용) */
  function saveImage() {
    const base = Math.max(canvas.clientWidth, canvas.clientHeight) * pixelRatio;
    shotScale = clamp(2560 / base, 1, 3);
    draw(); // 같은 순간에 읽어야 그림이 남아 있음
    const url = canvas.toDataURL('image/png');
    shotScale = 1;
    draw();
    const bin = atob(url.split(',')[1]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const name = ((App.projects && App.projects.current && App.projects.current.name) || '도면').replace(/[\\/:*?"<>|]+/g, '_').trim() || '도면';
    App.exporter.download(`${name}_${mode === 'walk' ? '걷기' : '조감도'}_${App.exporter.stamp()}.png`, new Blob([bytes], { type: 'image/png' }));
  }

  /* ── 화면 요소 ── */
  let hintTimer = 0;
  /** 위 막대 바로 아래에 띄움 (좁은 화면에서 막대가 두 줄이 되어도 버튼을 가리지 않게) */
  function belowBar(panel) {
    const bar = el.querySelector('.v3-bar').getBoundingClientRect(), top = el.getBoundingClientRect().top;
    panel.style.top = `${Math.round(bar.bottom - top + 8)}px`;
  }
  function hint(text, ms = 6000) {
    const h = el.querySelector('.v3-hint');
    h.textContent = text;
    h.hidden = false;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { h.hidden = true; }, ms);
  }

  function syncWalkUi() {
    const A = walk.auto;
    const play = el.querySelector('[data-v3="play"]');
    play.hidden = !A;
    el.querySelector('[data-v3="restart"]').hidden = !A;
    el.querySelector('[data-v3="route"]').hidden = App.routes.all().filter((r) => r.points.length >= 2 && App.layers.visible(r)).length < 2;
    if (A) {
      const len = App.routes.length(A.route);
      play.textContent = A.playing ? '멈춤' : A.s >= len - 1 ? '다시 걷기' : '길 따라 걷기';
      play.setAttribute('aria-pressed', String(A.playing));
      el.querySelector('.v3-route-name').textContent = `${A.route.name} · ${App.units.formatRun(len)}`;
    } else {
      el.querySelector('.v3-route-name').textContent = '';
    }
    el.querySelector('[data-v3="speed"]').textContent = `빠르기 ${walk.speed}배`;
  }

  function syncUi() {
    el.dataset.mode = mode;
    el.dataset.recording = rec ? '1' : ''; // 녹화 중에는 위 막대의 다른 버튼을 잠시 막음
    el.dataset.recKind = rec ? rec.kind : ''; // 한 바퀴: 끌어 돌리기도 막음, 길 따라 걷기: 조이스틱·멈춤도 막음
    const pill = el.querySelector('.v3-rec');
    if (rec && mode === 'walk') belowBar(pill); else pill.style.top = ''; // 걷는 중에는 위 막대 바로 아래 (막대가 두 줄이어도)
    el.querySelector('[data-v3="walk"]').setAttribute('aria-pressed', String(mode === 'walk'));
    el.querySelector('[data-v3="reset"]').setAttribute('aria-pressed', String(mode === 'orbit'));
    el.querySelector('.v3-walk').hidden = mode !== 'walk';
    const set = el.querySelector('.v3-settings');
    set.querySelectorAll('[data-sun]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.sun) === sunIndex())));
    set.querySelectorAll('[data-ground]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ground === groundKey())));
    set.querySelector('[data-opt="low"]').setAttribute('aria-pressed', String(low));
    set.querySelector('[data-opt="routes"]').setAttribute('aria-pressed', String(showRoutes));
    const lb = set.querySelector('[data-opt="labels"]');
    lb.hidden = !App.modes.is('event');
    lb.setAttribute('aria-pressed', String(App.settings.labels3d !== false));
    const cb = set.querySelector('[data-opt="crowd"]');
    cb.hidden = !App.modes.is('event');
    cb.setAttribute('aria-pressed', String(App.settings.crowd3d === true));
    set.querySelector('[data-opt="quality"]').setAttribute('aria-pressed', String(quality === 'high'));
    if (mode === 'walk') syncWalkUi();
  }

  function ensureElement() {
    if (el) return;
    el = document.createElement('div');
    el.className = 'view3d';
    el.id = 'view3d';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', '3D 보기');
    el.innerHTML = `
      <canvas class="v3-canvas" aria-label="3D 도면"></canvas>
      <canvas class="v3-overlay" aria-hidden="true"></canvas>
      <div class="v3-pick" role="toolbar" aria-label="고른 물건" hidden>
        <span class="v3-pick-name"></span>
        <button type="button" class="btn" data-pk="rot-" aria-label="왼쪽으로 15도">↺ 15°</button>
        <button type="button" class="btn" data-pk="rot+" aria-label="오른쪽으로 15도">↻ 15°</button>
        <button type="button" class="btn" data-pk="dup">복제</button>
        <button type="button" class="btn btn-danger" data-pk="del">지우기</button>
        <button type="button" class="btn" data-pk="plan" title="3D를 닫고 평면에서 이 물건을 고름">평면에서</button>
        <button type="button" class="btn" data-pk="undo" title="방금 고친 것 되돌리기 (Ctrl+Z)">↶ 되돌리기</button>
        <button type="button" class="btn" data-pk="close" aria-label="고르기 풀기">✕</button>
      </div>
      <div class="v3-bar">
        <button type="button" class="btn btn-primary" data-v3="close">닫기</button>
        <span class="v3-gap"></span>
        <button type="button" class="btn" data-v3="reset" aria-pressed="true" title="비스듬히 내려다보는 조감도 시점으로">조감도</button>
        <button type="button" class="btn" data-v3="top" title="위에서 내려다보기">위에서</button>
        <button type="button" class="btn" data-v3="turn" title="보는 방향을 90도씩 돌리기 (앞 → 오른쪽 → 뒤 → 왼쪽)" aria-label="돌려 보기">↻<span class="pc-only"> 돌려 보기</span></button>
        <button type="button" class="btn" data-v3="walk" aria-pressed="false" title="사람 눈높이로 입구부터 걸어서 둘러보기"><span class="ico ico-sm" data-icon="walk"></span>걷기</button>
        <button type="button" class="btn" data-v3="shot" title="지금 시점을 큰 그림 파일로 (긴 쪽 2560px)">사진<span class="pc-only"> 저장</span></button>
        <button type="button" class="btn" data-v3="video" aria-expanded="false" title="돌려 보기·걷기를 영상 파일로 (카톡으로 보내기 좋게)"><span class="v3-lbl-pc">영상</span><span class="v3-lbl-phone">저장</span></button>
        <button type="button" class="btn" data-v3="settings" aria-expanded="false" aria-label="3D 설정" title="햇빛·바닥·화질"><span class="ico ico-sm" data-icon="gear"></span></button>
      </div>
      <div class="v3-video-menu" hidden role="menu">
        <button type="button" class="btn btn-list" data-rec="shot" role="menuitem"><b>사진 저장</b><small>지금 장면을 큰 그림 파일로</small></button>
        <button type="button" class="btn btn-list" data-rec="orbit" role="menuitem"><b>한 바퀴 돌려 보기</b><small>지금 높이에서 12초 동안 한 바퀴</small></button>
        <button type="button" class="btn btn-list" data-rec="route" role="menuitem"><b>길 따라 걷기</b><small>동선을 따라 사람 눈높이로 끝까지</small></button>
        <button type="button" class="btn btn-list" data-rec="tour" role="menuitem"><b>시점 투어</b><small>저장한 시점을 차례로 부드럽게 (3D 설정 → 시점)</small></button>
        <button type="button" class="btn btn-list" data-rec="free" role="menuitem"><b>지금 화면 녹화</b><small>직접 돌리거나 걸으며 · ‘멈추고 저장’까지 (최대 3분)</small></button>
      </div>
      <div class="v3-rec" hidden><span class="v3-rec-dot"></span><span class="v3-rec-time">0:00</span><button type="button" class="btn btn-danger" data-v3="rec-stop">멈추고 저장</button></div>
      <div class="v3-settings" hidden>
        <div class="v3-set-row"><span>햇빛</span><div class="v3-seg">${SUNS.map((s, i) => `<button type="button" class="btn" data-sun="${i}">${s.name}</button>`).join('')}</div></div>
        <div class="v3-set-row"><span>바닥</span><div class="v3-seg">${Object.entries(GROUNDS).map(([id, g]) => `<button type="button" class="btn" data-ground="${id}">${g[0]}</button>`).join('')}</div></div>
        <div class="v3-set-row"><span>보기</span><div class="v3-seg">
          <button type="button" class="btn" data-opt="low" title="벽을 낮춰 방 안이 보이게 (조감도에서)">벽 낮추기</button>
          <button type="button" class="btn" data-opt="routes" title="동선을 바닥에 표시">동선 표시</button>
          <button type="button" class="btn" data-opt="labels" title="영역 이름·무대·화장실·입구·메모를 3D에 표시 (사진·영상에도)">이름표</button>
          <button type="button" class="btn" data-opt="crowd" title="예상 인원만큼 관람·대기 구역에 사람을 세워 봄 (그림은 최대 ${CROWD_MAX}명, 사진·영상에도)">인파</button>
          <button type="button" class="btn" data-opt="quality" title="끄면 빠르게 (그림자·해상도를 낮춤)">고화질</button>
        </div></div>
        <div class="v3-set-row"><span>시점</span><div class="v3-seg v3-views"></div></div>
      </div>
      <div class="v3-walk" hidden>
        <div class="v3-joy" aria-label="걷기 조이스틱"><div class="v3-knob"></div></div>
        <div class="v3-walk-btns">
          <span class="v3-route-name"></span>
          <button type="button" class="btn btn-primary" data-v3="play">길 따라 걷기</button>
          <button type="button" class="btn" data-v3="restart">처음부터</button>
          <button type="button" class="btn" data-v3="route">다른 동선</button>
          <button type="button" class="btn" data-v3="speed">빠르기 1배</button>
        </div>
      </div>
      <p class="v3-hint" hidden></p>`;
    document.body.appendChild(el);
    App.icons.apply(el);
    canvas = el.querySelector('canvas');
    const settings = el.querySelector('.v3-settings');
    const toggleSettings = (open) => {
      settings.hidden = !open;
      el.querySelector('[data-v3="settings"]').setAttribute('aria-expanded', String(open));
      if (open) { renderViews(); belowBar(settings); }
    };
    el.addEventListener('click', (e) => {
      const pk = e.target.closest('[data-pk]');
      if (pk) { pickAction(pk.dataset.pk); return; }
      const rc = e.target.closest('[data-rec]');
      if (rc) {
        el.querySelector('.v3-video-menu').hidden = true;
        el.querySelector('[data-v3="video"]').setAttribute('aria-expanded', 'false');
        if (rc.dataset.rec === 'shot') saveImage(); // 휴대폰: 사진 저장도 이 메뉴에 (위 막대가 한 줄에 들어가게)
        else startRecording(rc.dataset.rec);
        return;
      }
      if (!e.target.closest('.v3-video-menu, [data-v3="video"]')) { el.querySelector('.v3-video-menu').hidden = true; el.querySelector('[data-v3="video"]').setAttribute('aria-expanded', 'false'); }
      // 시점: 저장·가기·지우기 (설정 창 안)
      const vb = e.target.closest('[data-view-add], [data-view-go], [data-view-del]');
      if (vb) {
        if (vb.dataset.viewAdd != null) saveView();
        else if (vb.dataset.viewGo != null) goView(Number(vb.dataset.viewGo));
        else deleteView(Number(vb.dataset.viewDel));
        return;
      }
      const b = e.target.closest('[data-v3], [data-sun], [data-ground], [data-opt]');
      if (!b) {
        if (!e.target.closest('.v3-settings')) toggleSettings(false);
        return;
      }
      if (b.dataset.sun != null) {
        App.current.sun3d = Number(b.dataset.sun);
        App.ui.emit('current');
      } else if (b.dataset.ground) {
        App.current.ground = b.dataset.ground;
        App.ui.emit('current');
        setGround();
      } else if (b.dataset.opt === 'low') {
        low = !low;
        lowChosen = true;
        rebuild();
      } else if (b.dataset.opt === 'routes') {
        showRoutes = !showRoutes;
        rebuild();
      } else if (b.dataset.opt === 'crowd') {
        App.settings.crowd3d = App.settings.crowd3d !== true;
        App.saveSettings();
        rebuild();
        syncUi();
        requestDraw();
        if (App.settings.crowd3d) {
          const info = crowdInfo([...App.doc.all()].filter((e) => App.layers.visible(e)));
          App.ui.toast(!info.zones.length ? '관람·대기 구역이 없습니다. 영역을 고르고 속성에서 ‘관람·대기 구역’을 체크하세요.'
            : !info.want ? '서 있을 사람이 없습니다 (예상 인원이 좌석 수보다 적음).'
              : `관람·대기 구역에 ${info.want.toLocaleString('ko-KR')}명을 세웠습니다${info.want > info.n ? ` (그림은 ${info.n}명까지, 밀도는 예상 인원 기준)` : ''}. 예상 인원은 안전 점검에서 바꿉니다.`);
        }
      } else if (b.dataset.opt === 'labels') {
        App.settings.labels3d = App.settings.labels3d === false;
        App.saveSettings();
        syncUi();
        requestDraw();
      } else if (b.dataset.opt === 'quality') {
        quality = quality === 'high' ? 'low' : 'high';
        slow = 0;
        rebuild();
      } else {
        const act = b.dataset.v3;
        if (act !== 'settings') toggleSettings(false);
        if (act === 'close') { close(true); return; }
        else if (act === 'reset') { if (mode === 'walk') stopWalk(); resetView(false); }
        else if (act === 'top') { if (mode === 'walk') stopWalk(); resetView(true); }
        else if (act === 'turn') { if (mode === 'walk') walk.a += Math.PI / 2; else { cam.yaw -= Math.PI / 2; refit(); } }
        else if (act === 'walk') { if (mode === 'walk') { stopWalk(); resetView(false); } else startWalk(); }
        else if (act === 'shot') saveImage();
        else if (act === 'video') {
          const m = el.querySelector('.v3-video-menu');
          m.hidden = !m.hidden;
          b.setAttribute('aria-expanded', String(!m.hidden));
          if (!m.hidden) {
            m.querySelector('[data-rec="route"]').hidden = !App.routes.all().some((r) => r.points.length >= 2 && App.layers.visible(r));
            m.querySelector('[data-rec="tour"]').hidden = savedViews().length < 2;
            belowBar(m);
          }
          return;
        }
        else if (act === 'rec-stop') { stopRecording(); return; }
        else if (rec && rec.kind === 'route' && ['play', 'restart', 'route', 'speed'].includes(act)) return; // 길 따라 걷기 녹화 중: 녹화가 끊기지 않게
        else if (act === 'settings') toggleSettings(settings.hidden);
        else if (act === 'play' && walk.auto) {
          const A = walk.auto;
          if (!A.playing && A.s >= App.routes.length(A.route) - 1) A.s = 0;
          A.playing = !A.playing;
          A.look = 0;
          walk.last = 0;
        } else if (act === 'restart' && walk.auto) {
          startWalk(walk.auto.route.id);
          return;
        } else if (act === 'route') {
          const routes = App.routes.all().filter((r) => r.points.length >= 2 && App.layers.visible(r));
          const i = walk.auto ? routes.findIndex((r) => r.id === walk.auto.route.id) : -1;
          const next = routes[(i + 1) % routes.length];
          if (next) { startWalk(next.id); App.ui.toast(`${next.name}을 따라 걷습니다.`); }
          return;
        } else if (act === 'speed') {
          walk.speed = walk.speed === 1 ? 2 : walk.speed === 2 ? 0.5 : 1;
        }
      }
      syncUi();
      requestDraw();
    });
    window.addEventListener('resize', () => { if (isOpen()) { placePickBar(); requestDraw(); } });
    App.ui.on('images', () => { if (isOpen() && rebuild()) requestDraw(); }); // 이미지를 다 읽으면 다시 조립
  }

  /** o: { walk: 걷기로 시작, routeId: 그 동선을 따라 바로 걷기 } */
  function open(o = {}) {
    ensureElement();
    if (R && R.gl.isContextLost()) {
      App.ui.toast('3D 화면을 다시 준비하고 있습니다. 잠시 뒤 다시 열어 보세요.');
      return false;
    }
    if (!R) {
      try {
        R = new Renderer(canvas);
        maxSize = Math.min(4096, R.gl.getParameter(R.gl.MAX_RENDERBUFFER_SIZE) || 4096);
      } catch (e) {
        R = null;
        App.ui.toast(/WebGL/.test(String(e && e.message)) ? '이 기기에서는 3D 보기를 쓸 수 없습니다 (WebGL 없음).' : `3D 보기를 시작하지 못했습니다. ${(e && e.message) || e}`);
        return false;
      }
      bindControls();
    }
    mode = 'orbit';
    walk.auto = null;
    slow = 0;
    picked = null;
    ghost = null;
    el.querySelector('.v3-pick').hidden = true;
    // 인테리어 도면은 방 안이 보이게 벽을 낮춰서 시작 (직접 바꾼 뒤에는 그대로 둠). 걷기에서는 늘 온전한 높이
    if (!lowChosen) low = App.modes.is('interior');
    if (!rebuild(true)) {
      App.ui.toast('벽이나 가구, 조감도 물건을 놓으면 3D로 볼 수 있습니다.');
      return false;
    }
    el.hidden = false;
    syncUi();
    resetView(false);
    if (o.walk || o.routeId) startWalk(o.routeId);
    else hint(App.ui.mobile.matches ? '한 손가락: 돌리기 · 두 손가락: 확대·이동 · ‘걷기’로 사람 눈높이에서 둘러보기' : '끌기: 돌리기 · 오른쪽 끌기: 이동 · 휠: 확대 · ‘걷기’로 사람 눈높이에서 둘러보기');
    draw();
    return true;
  }

  /** 닫기. 걷는 중이면 먼저 조감도로 돌아감 (뒤로 버튼·Esc) */
  function close(force = false) {
    if (!el || el.hidden) return false;
    if (rec) { stopRecording(); return true; } // 녹화 중 Esc·뒤로·닫기: 먼저 멈추고 저장
    if (!force) { // Esc·뒤로: 열린 메뉴·설정부터 닫음
      const vm = el.querySelector('.v3-video-menu'), st = el.querySelector('.v3-settings');
      if (!vm.hidden) { vm.hidden = true; el.querySelector('[data-v3="video"]').setAttribute('aria-expanded', 'false'); return true; }
      if (!st.hidden) { st.hidden = true; el.querySelector('[data-v3="settings"]').setAttribute('aria-expanded', 'false'); return true; }
    }
    if (picked && !force) { setPicked(null); return true; } // Esc·뒤로: 먼저 고르기를 풂
    if (mode === 'walk' && !force) {
      stopWalk();
      resetView(false);
      return true;
    }
    picked = null;
    ghost = null;
    el.querySelector('.v3-pick').hidden = true;
    el.hidden = true;
    el.querySelector('.v3-settings').hidden = true;
    el.querySelector('.v3-video-menu').hidden = true; // 다음에 열 때 영상 메뉴가 열린 채 나오지 않게
    el.querySelector('[data-v3="video"]').setAttribute('aria-expanded', 'false');
    mode = 'orbit';
    walk.keys.clear();
    if (R) R.clearScene();
    scene = null;
    return true;
  }
  const isOpen = () => !!el && !el.hidden;

  App.view3d = {
    open, close, isOpen, build, buildItem, seeded, GROUNDS, crowdInfo, CROWD_MAX,
    /** 영상: kind 'orbit'|'route'|'free', o: { duration(초), noSave, longSide } → Promise<{ blob, name, type } | null> */
    record: (kind, o) => startRecording(kind, o),
    stopRecording: () => stopRecording(),
    get recording() { return !!rec; },
    canRecord: () => !!(canvas && recType()),
    /** 시점 저장·가기·목록 (시험·제안서용) */
    saveView: () => saveView(),
    goView: (i) => goView(i),
    get views() { return savedViews(); },
    /** 제안서용: [{ yaw, pitch }] 방향들의 정지 그림 (캔버스 배열) 또는 null */
    stills: (views, w, h) => stills(views, w, h),
    /** 시험용: 화면 점(캔버스 CSS px)의 물건, 고른 물건, 고르기 */
    pickAt: (x, y) => pickAt(x, y),
    get picked() { return picked; },
    setPicked: (id) => setPicked(id),
    /** 시험용: 3D 점(m) → 캔버스 CSS px */
    toScreen: (p) => project(p, basis()),
    /** 시험용 */
    get gl() { return R ? R.gl : null; },
    get renderer() { return R; },
    walkObstacles: () => walkObstacles(),
    get camera() { return R ? camera() : null; },
    get state() {
      return {
        mode, low, showRoutes, quality, pixelRatio, sun: sunIndex(), ground: groundKey(),
        cam: { ...cam, target: cam.target.slice() },
        walk: { x: walk.x, z: walk.z, a: walk.a, pitch: walk.pitch, auto: walk.auto ? { route: walk.auto.route.id, s: walk.auto.s, playing: walk.auto.playing } : null, speed: walk.speed },
        stats: scene ? scene.stats : null, highp: R ? R.highp : null,
      };
    },
    /** 시험용: 걷기 자리를 직접 옮김 (도면 좌표 mm) */
    walkTo(x, y, a) {
      if (!scene) return;
      walk.x = (x - scene.center.x) / 1000;
      walk.z = (y - scene.center.y) / 1000;
      if (a != null) walk.a = a;
      requestDraw();
    },
    redraw: () => draw(),
    /** 시험용: 자판을 누른 채 seconds초 걸은 것처럼 (그리지 않고 계산만) */
    simulate(seconds, codes = ['KeyW']) {
      if (!scene || mode !== 'walk') return;
      codes.forEach((c) => walk.keys.add(c));
      for (let t = 0; t < seconds; t += 1 / 30) advance(1 / 30);
      codes.forEach((c) => walk.keys.delete(c));
      walk.last = 0;
      requestDraw();
    },
    /** 시험용: 조감도 시점을 직접 정함. x, y는 도면 좌표(mm), dist는 m */
    look(x, y, dist, yaw = -0.6, pitch = 0.62, h = 1) {
      if (!scene) return;
      cam.target = [(x - scene.center.x) / 1000, h, (y - scene.center.y) / 1000];
      cam.dist = dist; cam.yaw = yaw; cam.pitch = pitch;
      draw();
    },
  };
})();
