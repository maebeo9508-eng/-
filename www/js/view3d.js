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

  const LOW_WALL = 1.2;   // '벽 낮추기': 이 높이(m)에서 자른 것처럼
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
  const POOLS = { '가로등': [1.15, 7, '#ffe2a8'], '조명 타워': [3, 10, '#fff1cf'], '난로': [0, 2.6, '#ff9a4d'], 'LED 스크린': [2.5, 5, '#9fb6ff'], '점수판': [2, 4, '#9fb6ff'], '버스 정류장': [0.3, 4, '#fff1cf'], '매표소': [1, 3.5, '#fff1cf'] };

  /** 물건 하나의 모형을 그릇의 지금 자리에 넣음 (바닥 그늘·밤 불빛 포함) */
  function itemModel(C, it, o = {}) {
    const def = App.catalog.itemDef(it.kind);
    if (!def) return;
    const M3 = App.models3d, S = C.S;
    const w = it.size / 1000, d = (it.depth != null ? it.depth : it.size * (def.aspect || 1)) / 1000, h = App.catalog.itemHeight3(it) / 1000;
    try {
      if (it.category === 'event' && M3.EVENT[it.kind]) M3.EVENT[it.kind](C, it, w, d, h);
      else if (M3.FURN[it.kind] && (it.category === 'furn' || it.category === 'event')) M3.FURN[it.kind](C, it, w, d, h);
      else if (it.category === 'furn') S.box(-w / 2, 0, -d / 2, w / 2, h, d / 2, hex('#b08d6a'), MAT.grain);
      else M3.symbol(C, it, def, Math.min(o.low && it.height != null ? LOW_WALL - 0.1 : 99, App.measure.itemHeight(it) / 1000));
    } catch (err) {
      console.warn('3D 모형을 만들지 못함:', it.kind, err);
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
    itemModel(C, it, { blobs: o.blobs });
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
  function build(o = {}) {
    const doc = App.doc;
    const els = [...doc.all()].filter((e) => App.model.TYPES[e.type] && !App.model.TYPES[e.type].catalog && e.type !== 'underlay' && App.layers.visible(e));
    const drawn = els.filter((e) => ['wall', 'room', 'zone', 'column', 'item', 'route'].includes(e.type));
    if (!drawn.some((e) => e.type !== 'route')) return null;
    const pb = doc.bounds(drawn.map((e) => e.id));
    if (!pb) return null;
    const cx = (pb.minX + pb.maxX) / 2, cy = (pb.minY + pb.maxY) / 2;
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

    /* 영역: 바닥 재질, 잔디·흙·물은 둘레에 경계석 */
    els.filter((e) => e.type === 'zone').forEach((z) => {
      const pts = z.points.map(P);
      const s = SURFACE[z.surface];
      if (s) L.decals[0].poly(pts, 0.004, hex(s[1]), s[0]);
      else if (z.surface === 'carpet') L.decals[0].poly(pts, 0.006, hex(z.color), MAT.fabric);
      else L.decals[0].poly(pts, 0.004, mixc(hex(z.color), [1, 1, 1], 0.3), MAT.plain);
      if (['grass', 'soil', 'water'].includes(z.surface)) {
        pts.forEach((p, i) => slab(S, p, pts[(i + 1) % pts.length], 0.16, 0, 0.11, CURB, MAT.concrete));
        pts.forEach((p) => S.cube(p[0], 0, p[1], 0.16, 0.11, 0.16, CURB, MAT.concrete));
      }
    });

    /* 방: 바닥(마감재에 따라 타일·마루), 천장은 걷기에서만 */
    els.filter((e) => e.type === 'room').forEach((r) => {
      const pts = r.points.map(P);
      const fin = r.floorFinishId && doc.get(r.floorFinishId);
      const name = fin ? fin.name : '';
      let mat = event ? MAT.tile : MAT.wood, c = event ? hex('#d2d5d9') : hex('#cfb48f');
      if (/타일|대리석|석재/.test(name) && !/데코/.test(name)) { mat = MAT.tile; c = hex('#dcd9d2'); }
      else if (/마루|데코|우드|원목|장판|목재/.test(name)) { mat = MAT.wood; c = hex('#c7a57a'); }
      else if (/카펫/.test(name)) { mat = MAT.fabric; c = hex('#8f95a0'); }
      L.decals[1].poly(pts, 0.008, c, mat);
      L.ceil.poly(pts, (r.ceilingHeight || App.settings.ceilingHeight) / 1000, hex('#fafaf8'), MAT.plain);
    });

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
      const piece = (s0, s1, y0, y1) => {
        if (s1 - s0 < 0.5 || y1 - y0 < 0.005) return;
        const [a, a2] = cut(s0), [b, b2] = cut(s1);
        const pts = [a, b, b2, a2];
        S.prism(pts, y0, y1, wc, MAT.plain, WALL_TOP);
        if (y0 > 0.01) S.poly(pts, y0, wc);
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
    items.forEach((it) => {
      C.rnd = seeded(it.id);
      C.place(X(it.x), Z(it.y), it.rotation || 0, stageUnder(it));
      itemModel(C, it, { low: o.low });
    });
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
    return {
      layers: L, textured, bounds: { min, max }, center: { x: cx, y: cy }, radius, height: max[1], fit,
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

  function resize() {
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
    raf = 0;
    if (!R || !scene || el.hidden) return;
    const t0 = performance.now();
    if (mode === 'walk') stepWalk(t0);
    resize();
    const hq = quality === 'high';
    R.render(camera(), {
      sun: sunIndex(), ceil: mode === 'walk', clouds: hq, shadows: true, shadowSize: hq ? 2048 : 1024,
      fog: mode === 'walk' ? 1 / 700 : 1 / 1500,
      focus: mode === 'walk' ? { center: [walk.x, 0, walk.z], radius: Math.min(32, scene.radius + 4) } : null,
    });
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
  }
  const requestDraw = () => { if (!raf) raf = requestAnimationFrame(draw); };

  function rebuild() {
    scene = build({ low: low && mode !== 'walk', routes: showRoutes, lod: quality !== 'high' });
    if (!scene) return false;
    R.setScene(scene);
    setGround();
    return true;
  }
  function setGround() {
    const g = GROUNDS[groundKey()], b = scene.bounds;
    R.setGround(g[1], hex(g[2]), [(b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2], scene.radius * 2.5);
  }

  /** 조감도 시점으로: 장면이 화면에 다 들어오게 */
  function resetView(top = false) {
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const b = scene.bounds;
    cam.target = [(b.min[0] + b.max[0]) / 2, Math.min(3, scene.height * 0.3), (b.min[2] + b.max[2]) / 2];
    cam.yaw = top ? 0 : -0.6;
    cam.pitch = top ? 1.5 : aspect < 1 ? 0.92 : 0.62; // 세로 화면은 더 위에서 내려다봐야 화면에 꽉 참
    // 위쪽 버튼 줄과 아래 안내에 가리지 않게 여백을 둠
    const fits = (dist) => {
      cam.dist = dist;
      const c = camera();
      const vp = M4.mul(M4.perspective(c.fov, aspect, 0.1, 10000), M4.lookAt(c.eye, c.target, [0, 1, 0]));
      for (const q of scene.fit) {
        if (vp[3] * q[0] + vp[7] * q[1] + vp[11] * q[2] + vp[15] <= 0.01) return false; // 카메라 뒤
        const p = M4.point(vp, q);
        if (Math.abs(p[0]) > 0.93 || p[1] > 0.76 || p[1] < -0.86) return false;
      }
      return true;
    };
    let lo = 1.5, hi = 2500;
    for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
    cam.dist = hi;
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
  const blocked = (x, z) => App.routes.nearest(planPos(x, z)).dist < BODY;
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
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY, pan: e.button === 1 || e.button === 2 || e.shiftKey });
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
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
    const end = (e) => pts.delete(e.pointerId);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
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
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      App.ui.toast('3D 화면을 그리지 못했습니다. 닫고 다시 열어 보세요.');
    });

    // 걷기 자판: W A S D·화살표, Shift 빠르게
    const KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);
    window.addEventListener('keydown', (e) => {
      if (!isOpen() || mode !== 'walk' || !KEYS.has(e.code) || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      e.preventDefault();
      if (walk.auto && walk.auto.playing && !e.code.startsWith('Shift')) walk.auto.playing = false; // 직접 걷기 시작하면 자동 걷기는 멈춤
      walk.keys.add(e.code);
      walk.last = walk.last || performance.now();
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
    el.querySelector('[data-v3="route"]').hidden = App.routes.all().filter((r) => r.points.length >= 2).length < 2;
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
    el.querySelector('[data-v3="walk"]').setAttribute('aria-pressed', String(mode === 'walk'));
    el.querySelector('[data-v3="reset"]').setAttribute('aria-pressed', String(mode === 'orbit'));
    el.querySelector('.v3-walk').hidden = mode !== 'walk';
    const set = el.querySelector('.v3-settings');
    set.querySelectorAll('[data-sun]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.sun) === sunIndex())));
    set.querySelectorAll('[data-ground]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ground === groundKey())));
    set.querySelector('[data-opt="low"]').setAttribute('aria-pressed', String(low));
    set.querySelector('[data-opt="routes"]').setAttribute('aria-pressed', String(showRoutes));
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
      <div class="v3-bar">
        <button type="button" class="btn btn-primary" data-v3="close">닫기</button>
        <span class="v3-gap"></span>
        <button type="button" class="btn" data-v3="reset" aria-pressed="true" title="비스듬히 내려다보는 조감도 시점으로">조감도</button>
        <button type="button" class="btn" data-v3="top" title="위에서 내려다보기">위에서</button>
        <button type="button" class="btn" data-v3="turn" title="보는 방향을 90도씩 돌리기 (앞 → 오른쪽 → 뒤 → 왼쪽)" aria-label="돌려 보기">↻<span class="pc-only"> 돌려 보기</span></button>
        <button type="button" class="btn" data-v3="walk" aria-pressed="false" title="사람 눈높이로 입구부터 걸어서 둘러보기"><span class="ico ico-sm" data-icon="walk"></span>걷기</button>
        <button type="button" class="btn" data-v3="shot" title="지금 시점을 큰 그림 파일로 (긴 쪽 2560px)">사진<span class="pc-only"> 저장</span></button>
        <button type="button" class="btn" data-v3="settings" aria-expanded="false" aria-label="3D 설정" title="햇빛·바닥·화질"><span class="ico ico-sm" data-icon="gear"></span></button>
      </div>
      <div class="v3-settings" hidden>
        <div class="v3-set-row"><span>햇빛</span><div class="v3-seg">${SUNS.map((s, i) => `<button type="button" class="btn" data-sun="${i}">${s.name}</button>`).join('')}</div></div>
        <div class="v3-set-row"><span>바닥</span><div class="v3-seg">${Object.entries(GROUNDS).map(([id, g]) => `<button type="button" class="btn" data-ground="${id}">${g[0]}</button>`).join('')}</div></div>
        <div class="v3-set-row"><span>보기</span><div class="v3-seg">
          <button type="button" class="btn" data-opt="low" title="벽을 낮춰 방 안이 보이게 (조감도에서)">벽 낮추기</button>
          <button type="button" class="btn" data-opt="routes" title="동선을 바닥에 표시">동선 표시</button>
          <button type="button" class="btn" data-opt="quality" title="끄면 빠르게 (그림자·해상도를 낮춤)">고화질</button>
        </div></div>
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
    };
    el.addEventListener('click', (e) => {
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
          const routes = App.routes.all().filter((r) => r.points.length >= 2);
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
    window.addEventListener('resize', () => { if (isOpen()) requestDraw(); });
    App.ui.on('images', () => { if (isOpen() && rebuild()) requestDraw(); }); // 이미지를 다 읽으면 다시 조립
  }

  /** o: { walk: 걷기로 시작, routeId: 그 동선을 따라 바로 걷기 } */
  function open(o = {}) {
    ensureElement();
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
    // 인테리어 도면은 방 안이 보이게 벽을 낮춰서 시작 (직접 바꾼 뒤에는 그대로 둠). 걷기에서는 늘 온전한 높이
    if (!lowChosen) low = App.modes.is('interior');
    if (!rebuild()) {
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
    if (mode === 'walk' && !force) {
      stopWalk();
      resetView(false);
      return true;
    }
    el.hidden = true;
    el.querySelector('.v3-settings').hidden = true;
    mode = 'orbit';
    walk.keys.clear();
    if (R) R.clearScene();
    scene = null;
    return true;
  }
  const isOpen = () => !!el && !el.hidden;

  App.view3d = {
    open, close, isOpen, build, buildItem, seeded, GROUNDS,
    /** 시험용 */
    get gl() { return R ? R.gl : null; },
    get renderer() { return R; },
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
