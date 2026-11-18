/* CAD 도면 내보내기 (DXF R12 · AC1009, 글자로 된 DXF). 오토캐드·ZWCAD·BricsCAD·LibreCAD에서 바로 열림
   - 1 = 1 mm. 앱은 y가 아래로 커지므로 뒤집어 씀 (DXF는 위로 +)
   - R12에는 LWPOLYLINE·HATCH·DIMENSION이 없어 LINE·ARC·CIRCLE·POLYLINE(VERTEX·SEQEND)·TEXT만 씀
   - 한글 등 ASCII 밖 글자는 \U+XXXX로 바꿔 씀 (앱의 DXF 읽기도 이것을 풂). 글자는 모두 HANGUL 글꼴(맑은 고딕)
   - 화면·PNG와 같은 것만: 숨긴 레이어는 빼고, 철거도·신설도로 보고 있으면 그 모습대로 (App.draw.visibleElements)
   - 벽: 외곽선(joins.js, 화면과 같음) 두 면을 문·창문 자리에서 끊고 문틀 선을 그림. 벽 끝(마구리)은 다른 벽이 붙지 않은 곳만.
     공사 구분이 같은 벽끼리 겹치는 곳(ㄱ자·T자·십자)의 선은 지워 캐드 도면처럼 이어진 벽으로 보이게
   - 넣을 것(치수·방 이름·기호·조감도 물건·밑그림)은 이 기기에 기억 (hjdm.dxfOptions) */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const G = App.geom;

  const KEY = 'hjdm.dxfOptions';
  const DEFAULTS = { dims: true, labels: true, symbols: true, event: true, underlay: false };
  /** 레이어: [이름, 색 번호(ACI), 선 종류]. 이 순서로 레이어 표에 적음 (쓴 레이어만) */
  const LAYERS = [
    ['0', 7],
    ['A-WALL', 7], ['A-WALL-EXST', 8], ['A-WALL-DEMO', 1, 'DASHED'],
    ['A-DOOR', 30], ['A-GLAZ', 4], ['A-COLS', 7], ['A-AREA', 3], ['A-ANNO-DIMS', 2],
    ['E-COND', 1, 'DASHED'], ['P-PIPE', 5], ['M-DUCT', 4], ['G-LINE', 8],
    ['E-SYMB', 1], ['P-SYMB', 5], ['I-FURN', 32], ['G-ITEM', 6],
    ['G-ZONE', 3], ['G-ROUT', 5], ['G-TEXT', 7], ['G-REF', 8],
  ];
  const WALL_LAYER = { new: 'A-WALL', keep: 'A-WALL-EXST', demo: 'A-WALL-DEMO' };
  const ITEM_LAYER = { elec: 'E-SYMB', mech: 'P-SYMB', furn: 'I-FURN', event: 'G-ITEM' };
  const LINE_LAYER = { 전선관: 'E-COND', 배관: 'P-PIPE', 덕트: 'M-DUCT' };
  // 리모델링 문·창문: 기존은 회색, 철거는 빨간 점선 (화면과 같게. 벽은 레이어로 나눔)
  const PHASE_LOOK = { keep: { color: 8 }, demo: { color: 1, ltype: 'DASHED' } };
  const ROOM_NAME_H = 250, ROOM_AREA_H = 200, MARK_H = 200, FIRE_H = 120; // 글자 높이(mm)
  const TEXT_MAX = 250;  // TEXT 한 줄 길이 한도 (\U+로 바꾼 뒤 글자 수. R12 캐드가 읽는 범위)
  const EPS = 0.5;       // 벽 면이 다른 벽 안에 드는지 볼 때 바깥으로 띄우는 거리(mm)
  const MIN_PIECE = 0.5; // 이보다 짧은 선 조각은 뺌(mm)

  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const add = (p, v, k = 1) => ({ x: p.x + v.x * k, y: p.y + v.y * k });
  const dot = (a, b) => a.x * b.x + a.y * b.y;
  const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const neg = (v) => ({ x: -v.x, y: -v.y });
  /** 숫자 → DXF 글자 (0.0001 mm까지, -0은 0) */
  const num = (v) => { const r = Math.round(v * 1e4) / 1e4; return String(r === 0 ? 0 : r); };
  /** 라디안 → 0~360도 */
  const deg = (rad) => { const a = ((rad * 180) / Math.PI) % 360; return a < 0 ? a + 360 : a; };
  const boxOf = (pts) => ({
    minX: Math.min(...pts.map((p) => p.x)), minY: Math.min(...pts.map((p) => p.y)),
    maxX: Math.max(...pts.map((p) => p.x)), maxY: Math.max(...pts.map((p) => p.y)),
  });
  const safeName = (s) => s.replace(/[\\/:*?"<>|]+/g, '_').trim() || '도면';
  const mmText = (v) => Math.round(v).toLocaleString('en-US'); // 치수 글자: 3,600
  /** 글자 폭 어림 (글자 높이의 몇 배인지): 한글 등은 1, 영문·숫자는 0.6 */
  const textUnits = (t) => Math.max(0.6, [...String(t)].reduce((n, ch) => n + (/[ᄀ-￿]/.test(ch) ? 1 : 0.6), 0));
  /** 글자 높이: 기본 h에서, 폭 span(mm) 안에 들어가게 줄임 (min보다 작게는 안 함) */
  const fitH = (t, h, span, min) => Math.max(min, Math.min(h, (span * 0.9) / textUnits(t)));

  /** 글자 → DXF 글자: ASCII 밖 글자는 \U+XXXX(대문자 4자리), 제어 글자는 빈칸, 4자리로 못 쓰는 글자(이모지 등)는 ?.
      ^는 DXF에서 제어 글자 표시라 같이 바꿈 */
  function encode(s) {
    let out = '';
    for (const ch of String(s == null ? '' : s)) {
      const c = ch.codePointAt(0);
      if (c > 0xffff) out += '?';
      else if (c < 0x20) out += ' ';
      else if (c < 0x7f && ch !== '^') out += ch;
      else out += `\\U+${c.toString(16).toUpperCase().padStart(4, '0')}`;
    }
    return out;
  }
  /** 긴 줄을 TEXT 한도 안의 조각들로 (바꾼 뒤 길이로 셈, 글자 중간에서 끊지 않음) */
  function splitLine(s) {
    const out = [];
    let cur = '', len = 0;
    for (const ch of String(s)) {
      const n = encode(ch).length;
      if (len + n > TEXT_MAX && cur) { out.push(cur); cur = ''; len = 0; }
      cur += ch;
      len += n;
    }
    if (cur) out.push(cur);
    return out;
  }
  /** 한 줄에 다 안 들어가면 뒤를 줄임표로 */
  function fitLine(s) {
    if (encode(s).length <= TEXT_MAX) return s;
    const cps = Array.from(splitLine(s)[0]);
    while (cps.length && encode(`${cps.join('')}…`).length > TEXT_MAX) cps.pop();
    return `${cps.join('')}…`;
  }

  /* ── 개체 쓰는 그릇: 앱 좌표(y 아래로 +)를 받아 DXF 좌표(y 위로 +)로 씀. 범위(EXTMIN·EXTMAX)와 쓴 레이어를 모음 ── */
  function writer() {
    const out = [];
    const used = new Set();
    const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    let count = 0;
    const pair = (code, value) => { out.push(String(code), String(value)); };
    const grow = (x, y) => {
      if (x < box.minX) box.minX = x;
      if (x > box.maxX) box.maxX = x;
      if (y < box.minY) box.minY = y;
      if (y > box.maxY) box.maxY = y;
    };
    const ok = (...ps) => ps.every((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
    const start = (type, layer, look) => {
      used.add(layer);
      count++;
      pair(0, type);
      pair(8, layer);
      if (look && look.ltype) pair(6, look.ltype);
      if (look && look.color) pair(62, look.color);
    };
    /** 점 (앱 좌표) → 10/20/30 (또는 11/21/31) */
    const point = (code, p) => {
      pair(code, num(p.x));
      pair(code + 10, num(-p.y));
      pair(code + 20, 0);
      grow(p.x, -p.y);
    };
    return {
      out, used, box,
      get count() { return count; },
      line(layer, p, q, look) {
        if (!ok(p, q) || G.dist(p, q) < 1e-6) return;
        start('LINE', layer, look);
        point(10, p);
        point(11, q);
      },
      /** 꺾은선 (closed: 닫힘 표시 70=1) */
      poly(layer, pts, closed, look) {
        const list = (pts || []).filter((p) => ok(p));
        if (closed && list.length > 2 && G.samePoint(list[0], list[list.length - 1], 1e-6)) list.pop();
        if (list.length < 2) return;
        start('POLYLINE', layer, look);
        pair(66, 1);
        pair(10, 0); pair(20, 0); pair(30, 0);
        pair(70, closed ? 1 : 0);
        list.forEach((p) => {
          pair(0, 'VERTEX');
          pair(8, layer);
          point(10, p);
        });
        pair(0, 'SEQEND');
        pair(8, layer);
      },
      circle(layer, c, r, look) {
        if (!ok(c) || !(r > 0)) return;
        start('CIRCLE', layer, look);
        point(10, c);
        pair(40, num(r));
        grow(c.x - r, -c.y - r);
        grow(c.x + r, -c.y + r);
      },
      /** 원호: 가운데 c, 반지름 r, 두 끝 p·q(앱 좌표) 사이의 짧은 쪽. DXF 원호는 시작각 → 끝각 반시계 */
      arc(layer, c, r, p, q, look) {
        if (!ok(c, p, q) || !(r > 0)) return;
        const C = { x: c.x, y: -c.y };
        const P = { x: p.x - c.x, y: c.y - p.y }, Q = { x: q.x - c.x, y: c.y - q.y }; // 가운데에서 본 두 끝 (DXF 방향)
        let a0 = Math.atan2(P.y, P.x), a1 = Math.atan2(Q.y, Q.x);
        if (G.cross(P, Q) < 0) [a0, a1] = [a1, a0];
        start('ARC', layer, look);
        pair(10, num(C.x)); pair(20, num(C.y)); pair(30, 0);
        pair(40, num(r));
        pair(50, num(deg(a0)));
        pair(51, num(deg(a1)));
        // 범위: 두 끝과 그 사이에 든 0·90·180·270도 자리
        let sweep = a1 - a0;
        while (sweep < 0) sweep += Math.PI * 2;
        [a0, a1].forEach((a) => grow(C.x + r * Math.cos(a), C.y + r * Math.sin(a)));
        for (let k = 0; k < 4; k++) {
          let d = (k * Math.PI) / 2 - a0;
          while (d < 0) d += Math.PI * 2;
          if (d <= sweep) grow(C.x + r * Math.cos((k * Math.PI) / 2), C.y + r * Math.sin((k * Math.PI) / 2));
        }
      },
      /** 글자 한 줄. p(앱 좌표)가 맞춤점. ha 0 왼쪽·1 가운데·2 오른쪽, va 0 기준선·1 아래·2 가운데·3 위, rot: 도(DXF, 반시계) */
      text(layer, p, h, raw, opt = {}) {
        const t = fitLine(String(raw == null ? '' : raw).replace(/[\r\n\t]+/g, ' ').trim());
        if (!t || !ok(p) || !(h > 0)) return;
        const ha = opt.ha || 0, va = opt.va || 0, rot = opt.rot || 0;
        start('TEXT', layer);
        const x = num(p.x), y = num(-p.y);
        pair(10, x); pair(20, y); pair(30, 0);
        pair(40, num(h));
        pair(1, encode(t));
        if (rot) pair(50, num(rot));
        pair(7, 'HANGUL');
        if (ha) pair(72, ha);
        if (ha || va) { pair(11, x); pair(21, y); pair(31, 0); }
        if (va) pair(73, va);
        // 범위(어림): 한글은 높이만큼, 나머지는 0.6배 폭
        const wd = textUnits(t) * h;
        const x0 = ha === 1 ? -wd / 2 : ha === 2 ? -wd : 0;
        const y0 = va === 3 ? -h : va === 2 ? -h / 2 : 0;
        const a = (rot * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
        [[x0, y0], [x0 + wd, y0], [x0 + wd, y0 + h], [x0, y0 + h]].forEach(([lx, ly]) => grow(p.x + lx * ca - ly * sa, -p.y + lx * sa + ly * ca));
      },
    };
  }

  /* ── 벽 ── */

  /** 선분 A→B가 다각형 poly 안에 드는 구간들 [t0, t1] (0~1). 경계에 붙은 곳은 바깥쪽(m 방향)으로 EPS 띄워 봄
      (T자로 붙은 벽의 끝 면이 이 벽 면 위에 있으면 그 폭만큼 '안') */
  function insideSpans(A, B, m, poly) {
    const r = sub(B, A), rl = Math.hypot(r.x, r.y);
    const ts = [0, 1];
    for (let i = 0; i < poly.length; i++) {
      const P = poly[i], s = sub(poly[(i + 1) % poly.length], P);
      const den = G.cross(r, s);
      if (Math.abs(den) < 1e-9 * rl * Math.hypot(s.x, s.y)) continue; // 나란함
      const ap = sub(P, A);
      const t = G.cross(ap, s) / den, u = G.cross(ap, r) / den;
      if (t > 1e-9 && t < 1 - 1e-9 && u >= -1e-6 && u <= 1 + 1e-6) ts.push(t);
    }
    ts.sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i + 1 < ts.length; i++) {
      const t0 = ts[i], t1 = ts[i + 1];
      if (t1 - t0 < 1e-9) continue;
      const mid = add(lerp(A, B, (t0 + t1) / 2), m, EPS);
      if (G.pointInPolygon(mid, poly)) out.push([t0, t1]);
    }
    return out;
  }

  /** [0, 1]에서 빼낼 구간들을 뺀 나머지 (len: 선 길이 mm — 너무 짧은 조각은 버림) */
  function remaining(cuts, len) {
    const list = cuts.map(([a, b]) => [Math.max(0, Math.min(a, b)), Math.min(1, Math.max(a, b))])
      .filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0]);
    const out = [];
    let t = 0;
    list.forEach(([a, b]) => {
      if (a > t) out.push([t, a]);
      t = Math.max(t, b);
    });
    if (t < 1) out.push([t, 1]);
    return out.filter(([a, b]) => (b - a) * len >= MIN_PIECE);
  }

  /** 벽: 두 면(문·창문 자리는 끊음), 다른 벽이 붙지 않은 끝, 문틀. 레이어는 공사 구분(신설·기존·철거)대로 */
  function walls(w, list, openings) {
    const gapsOf = new Map(); // 벽 id → 개구부 [시작에서 잰 s0, s1]
    openings.forEach(({ g }) => {
      if (!gapsOf.has(g.wall.id)) gapsOf.set(g.wall.id, []);
      gapsOf.get(g.wall.id).push([g.c - g.half, g.c + g.half]);
    });
    const info = list.map((wall) => {
      const o = App.joins.outline(wall);
      return { wall, o, layer: WALL_LAYER[App.model.phaseOf(wall)] || 'A-WALL', box: boxOf(o.pts) };
    });
    info.forEach((me) => {
      const { wall, o, layer } = me;
      const d = G.unit(sub(wall.end, wall.start)), n = G.perp(d), h = wall.thickness / 2;
      const at = (s, off) => ({ x: wall.start.x + d.x * s + n.x * off, y: wall.start.y + d.y * s + n.y * off });
      // 겹쳐 볼 벽: 같은 레이어(공사 구분)이고 범위가 닿는 것
      const others = info.filter((v) => v !== me && v.layer === layer && G.rectsOverlap(v.box, { minX: me.box.minX - 1, minY: me.box.minY - 1, maxX: me.box.maxX + 1, maxY: me.box.maxY + 1 }));
      const gaps = gapsOf.get(wall.id) || [];
      /** 외곽선의 한 변 A→B (m: 벽 바깥쪽). withGaps: 문·창문 자리에서 끊음 */
      const edge = (A, B, m, withGaps) => {
        const len = G.dist(A, B);
        if (len < MIN_PIECE) return;
        const cuts = [];
        if (withGaps) {
          const sA = dot(sub(A, wall.start), d), sB = dot(sub(B, wall.start), d);
          if (Math.abs(sB - sA) > 1e-9) gaps.forEach(([s0, s1]) => cuts.push([(s0 - sA) / (sB - sA), (s1 - sA) / (sB - sA)]));
        }
        others.forEach((v) => cuts.push(...insideSpans(A, B, m, v.o.pts)));
        remaining(cuts, len).forEach(([t0, t1]) => w.line(layer, lerp(A, B, t0), lerp(A, B, t1)));
      };
      const P = o.pts; // [시작+n, 끝+n, 끝-n, 시작-n]
      edge(P[0], P[1], n, true);
      edge(P[3], P[2], neg(n), true);
      // 벽 끝(마구리): 같은 공사 구분의 벽에 묻히는 부분(ㄱ자 맞춤·T자·일직선 이음)은 지워지므로 다른 벽이 붙지 않은 끝만 남음.
      // 붙은 벽이 숨겨졌거나(신설도의 철거 벽 등) 공사 구분이 다르면 끝을 닫아 그림
      edge(P[3], P[0], neg(d), false);
      edge(P[1], P[2], d, false);
      // 문틀: 개구부 양 끝에 벽 두께만큼 (다른 개구부 안에 드는 끝은 뺌)
      gaps.forEach(([s0, s1]) => [s0, s1].forEach((s) => {
        if (gaps.some(([a, b]) => s > a + EPS && s < b - EPS)) return;
        w.line(layer, at(s, -h), at(s, h));
      }));
    });
  }

  /* ── 문·창문 (draw.js openingSymbol과 같은 자리) ── */
  function opening(w, el, g) {
    const h = g.th / 2, W = g.half * 2;
    const P = (s, off) => ({ x: g.a.x + g.d.x * s + g.n.x * off, y: g.a.y + g.d.y * s + g.n.y * off });
    const look = PHASE_LOOK[App.model.phaseOf(el)];
    if (el.type === 'window') {
      // 창문: 벽 두께 안에 세 줄 (양쪽 면 + 유리)
      [[h, h], [-h, -h], [0, 0]].forEach(([o1, o2]) => w.line('A-GLAZ', P(0, o1), P(W, o2), look));
      return;
    }
    const line = (p, q) => w.line('A-DOOR', p, q, look);
    const side = el.side || 1;
    if (el.kind === '여닫이' || el.kind === '방화문') {
      // 문짝(경첩에서 열린 쪽으로 문 폭만큼) + 열리는 궤적(원호)
      const hinge = el.hinge === 'end' ? W : 0, other = el.hinge === 'end' ? 0 : W;
      const H0 = P(hinge, side * h), leaf = P(hinge, side * (h + W));
      line(H0, leaf);
      w.arc('A-DOOR', H0, W, leaf, P(other, side * h), look);
      if (el.kind === '방화문') w.text('A-DOOR', P(W / 2, side * (h + W * 0.35)), FIRE_H, '방화', { ha: 1, va: 2 });
    } else if (el.kind === '미닫이') {
      // 미닫이: 가운데 줄 + 열리는 쪽으로 비켜 난 문짝
      line(P(0, 0), P(W, 0));
      line(P(-W * 0.02, side * h * 0.45), P(W, side * h * 0.45));
    } else {
      // 자동문: 가운데에서 양쪽으로 열리는 두 짝
      line(P(0, h * 0.35), P(W / 2, h * 0.35));
      line(P(W / 2, -h * 0.35), P(W, -h * 0.35));
    }
  }

  /** 창호 기호(D1·W1): 레이어 메뉴에서 켰을 때. 자리는 화면과 같은 쪽 (여닫이문은 열리는 반대쪽, 나머지는 방 반대쪽) */
  function openingMark(w, el, g) {
    const mark = App.openings.markOf(el);
    if (!mark) return;
    let side;
    if (el.type === 'door' && (el.kind === '여닫이' || el.kind === '방화문')) side = -(el.side || 1);
    else {
      const r = App.measure.openingRoom(el);
      const probe = r ? add(g.center, g.n, g.th / 2 + 50) : null;
      side = probe && G.pointInPolygon(probe, r.points) ? -1 : 1;
    }
    w.text(el.type === 'door' ? 'A-DOOR' : 'A-GLAZ', add(g.center, g.n, side * (g.th / 2 + MARK_H * 1.2)), MARK_H, mark, { ha: 1, va: 2 });
  }

  /* ── 치수: 치수선 + 보조선 + 양 끝 사선 + 길이 글자(mm, 읽기 쉬운 방향) ── */
  function dim(w, d) {
    const g = App.model.TYPES.dim.geom(d);
    if (!(g.length >= 1)) return;
    const T = App.settings.dimTextSize > 0 ? App.settings.dimTextSize : 150;
    const line = (p, q) => w.line('A-ANNO-DIMS', p, q);
    line(g.a, g.b);
    const off = d.offset || 0;
    if (Math.abs(off) >= 1) {
      const u = { x: g.n.x * Math.sign(off), y: g.n.y * Math.sign(off) };
      const gap = Math.min(T * 0.4, Math.abs(off) * 0.25), over = T * 0.6;
      [[d.start, g.a], [d.end, g.b]].forEach(([p, q]) => line(add(p, u, gap), add(q, u, over)));
    }
    const k = T * 0.3, t = { x: (g.dir.x + g.dir.y) * k, y: (g.dir.y - g.dir.x) * k };
    [g.a, g.b].forEach((p) => line(sub(p, t), add(p, t)));
    let ang = (Math.atan2(g.a.y - g.b.y, g.b.x - g.a.x) * 180) / Math.PI; // DXF 각도 (y 뒤집음)
    if (ang > 90 + 1e-6) ang -= 180;
    else if (ang <= -90 + 1e-6) ang += 180;
    const ar = (ang * Math.PI) / 180;
    // 글자 위쪽(DXF)으로 조금 띄움: 앱 좌표에서는 y를 뒤집어 더함
    const at = { x: (g.a.x + g.b.x) / 2 - Math.sin(ar) * T * 0.25, y: (g.a.y + g.b.y) / 2 - Math.cos(ar) * T * 0.25 };
    w.text('A-ANNO-DIMS', at, T, mmText(d.manual != null ? d.manual : g.length), { ha: 1, va: 1, rot: Math.abs(ang) < 1e-9 ? 0 : ang });
  }

  /* ── 물건: 실제 자리(폭 × 깊이, 돌린 각도) 네모 + 이름 ── */
  function itemName(it) {
    if (it.kind === '의자 배열') return `의자 ${App.catalog.seats(it).count}석`; // 의자 하나하나는 쓰지 않음
    if (App.booths && App.booths.isBooth(it) && (it.boothNo || it.exhibitor)) return [it.boothNo, it.exhibitor].filter(Boolean).join(' ');
    if (it.kind === '사람') return `사람 ${it.count || 1}명`;
    if (it.kind === '주차 구획') return `주차 구획 ${it.count || 1}칸`;
    const seats = it.category === 'event' ? App.catalog.seats(it) : null;
    return seats && it.kind !== '의자' ? `${it.kind} ${seats.count}석` : it.kind;
  }
  function item(w, it, layer) {
    const def = App.catalog.itemDef(it.kind);
    const iw = it.size, ih = it.depth != null ? it.depth : it.size * ((def && def.aspect) || 1);
    if (!(iw > 0) || !(ih > 0)) return;
    const a = ((it.rotation || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    const at = (lx, ly) => ({ x: it.x + lx * c - ly * s, y: it.y + lx * s + ly * c });
    w.poly(layer, [at(-iw / 2, -ih / 2), at(iw / 2, -ih / 2), at(iw / 2, ih / 2), at(-iw / 2, ih / 2)], true);
    // 이름 글자(가로): 물건 크기에 맞춰 — 실내 기호·가구는 방 이름보다 작게, 행사장 물건은 멀리서도 읽히게, 물건 폭을 넘지 않게
    const name = itemName(it), span = Math.abs(c) * iw + Math.abs(s) * ih;
    w.text(layer, it, fitH(name, G.clamp(Math.min(iw, ih) * 0.22, 40, layer === 'G-ITEM' ? 600 : 150), span, 30), name, { ha: 1, va: 2 });
  }

  /* ── 선(전선관·배관·덕트·기타): 덕트는 실제 폭의 네모, 나머지는 한 줄 ── */
  function line(w, l) {
    if (G.samePoint(l.start, l.end, 0.01)) return;
    const p = App.doc.get(l.presetId);
    const cat = (p && p.category) || l.category || '기타';
    if (cat === '덕트') {
      const h = Math.max(1, (p && p.size) || 100) / 2;
      const n = G.perp(G.unit(sub(l.end, l.start)));
      w.poly('M-DUCT', [add(l.start, n, h), add(l.end, n, h), add(l.end, n, -h), add(l.start, n, -h)], true);
      return;
    }
    w.line(LINE_LAYER[cat] || 'G-LINE', l.start, l.end);
  }

  /* ── 밑그림(가져온 도면): 선과 글자를 놓인 자리(위치·배율·회전)대로. 사진 밑그림은 넣을 수 없음 ── */
  function underlay(w, u) {
    const d = App.underlay && App.underlay.data(u);
    if (!d || d.kind === 'image' || u.visible === false) return;
    const a = ((u.rotation || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), k = u.scale || 1;
    const T = (lx, ly) => ({ x: u.x + k * (lx * c - ly * s), y: u.y + k * (lx * s + ly * c) });
    (d.polys || []).forEach((p) => {
      if (!p || p.length < 4) return;
      if (p.length < 6) { w.line('G-REF', T(p[0], p[1]), T(p[2], p[3])); return; }
      const pts = [];
      for (let i = 0; i + 1 < p.length; i += 2) pts.push(T(p[i], p[i + 1]));
      w.poly('G-REF', pts, false);
    });
    (d.texts || []).forEach((t) => {
      const lines = String(t.text || '').split('\n');
      const lh = t.h * 1.4, n = lines.length;
      const y0 = t.va === 'bottom' ? -(n - 1) * lh : t.va === 'middle' ? (-(n - 1) * lh) / 2 : 0;
      const r = t.rot || 0, rc = Math.cos(r), rs = Math.sin(r);
      const ha = t.ha === 'center' ? 1 : t.ha === 'right' ? 2 : 0;
      const va = t.va === 'top' ? 3 : t.va === 'middle' ? 2 : t.va === 'bottom' ? 1 : 0;
      const rot = -((u.rotation || 0) + (r * 180) / Math.PI); // 앱은 시계 방향 +, DXF는 반시계 +
      lines.forEach((ln, i) => {
        const oy = y0 + i * lh;
        w.text('G-REF', T(t.x - oy * rs, t.y + oy * rc), t.h * k, ln, { ha, va, rot });
      });
    });
  }

  /** 지금 보이는 요소 (숨긴 레이어·철거도·신설도는 화면과 같은 규칙). 자리를 셀 수 없는 것(벽이 없어진 문 등)은 뺌 */
  function visible() {
    return App.draw.visibleElements().filter((el) => !!App.model.TYPES[el.type].bounds(el));
  }
  /** 저장해 둔 넣을 것 (없거나 모르는 값은 기본값) */
  function options() {
    const saved = App.storage.read(KEY);
    const o = { ...DEFAULTS };
    if (saved && typeof saved === 'object') Object.keys(DEFAULTS).forEach((k) => { if (typeof saved[k] === 'boolean') o[k] = saved[k]; });
    return o;
  }

  /** DXF 글자 만들기. 돌려주는 값: { text, count(개체 수), layers(쓴 레이어) } */
  function build(opts) {
    const o = { ...DEFAULTS, ...(opts || {}) };
    const els = visible();
    const of = (type) => els.filter((e) => e.type === type);
    const w = writer();
    if (o.underlay) of('underlay').forEach((u) => underlay(w, u)); // 가져온 도면은 맨 아래
    const rooms = of('room').filter((r) => r.points && r.points.length >= 3);
    rooms.forEach((r) => w.poly('A-AREA', r.points, true));
    of('zone').forEach((z) => {
      if (!z.points || z.points.length < 3) return;
      w.poly('G-ZONE', z.points, true);
      const name = String(z.name || '').trim();
      if (!name) return;
      const b = App.model.TYPES.zone.bounds(z);
      w.text('G-ZONE', G.interiorPoint(z.points), fitH(name, G.clamp(Math.min(b.maxX - b.minX, b.maxY - b.minY) * 0.06, 150, 1500), b.maxX - b.minX, 100), name, { ha: 1, va: 2 });
    });
    const openings = [...of('door'), ...of('window')].map((el) => ({ el, g: App.model.openingGeom(el) })).filter((x) => x.g);
    walls(w, of('wall').filter((x) => G.dist(x.start, x.end) >= 1), openings);
    openings.forEach(({ el, g }) => opening(w, el, g));
    if (App.openings && App.openings.showing()) openings.forEach(({ el, g }) => openingMark(w, el, g)); // 화면·PNG와 같은 조건 (조감도에서는 없음)
    of('column').forEach((c) => {
      const { hx, hy } = App.model.TYPES.column.half(c);
      if (c.shape === 'circle') w.circle('A-COLS', c, hx);
      else w.poly('A-COLS', [{ x: c.x - hx, y: c.y - hy }, { x: c.x + hx, y: c.y - hy }, { x: c.x + hx, y: c.y + hy }, { x: c.x - hx, y: c.y + hy }], true);
    });
    of('line').forEach((l) => line(w, l));
    of('item').forEach((it) => {
      const layer = ITEM_LAYER[it.category] || 'G-ITEM';
      if (layer === 'G-ITEM' ? o.event : o.symbols) item(w, it, layer);
    });
    of('route').forEach((r) => { if (r.points && r.points.length >= 2) w.poly('G-ROUT', r.points, false); });
    if (o.dims) of('dim').forEach((d) => dim(w, d));
    of('text').forEach((t) => {
      // 글자(메모): (x, y)가 왼쪽 위, 줄마다 아래로. 한도보다 긴 줄은 나눠서 다음 줄로
      const size = t.size > 0 ? t.size : 200;
      let row = 0;
      String(t.content || '').split('\n').forEach((ln) => {
        (ln.trim() ? splitLine(ln) : ['']).forEach((part) => {
          if (part.trim()) w.text('G-TEXT', { x: t.x, y: t.y + row * size * 1.3 }, size, part, { va: 3 });
          row++;
        });
      });
    });
    if (o.labels) {
      rooms.forEach((r) => {
        // 방 이름과 바닥 면적(㎡): 방 안쪽 점에 (좁은 방은 폭에 맞춰 작게). 경계를 못 찾은 방은 면적을 쓰지 않음
        const c = G.interiorPoint(r.points), b = App.model.TYPES.room.bounds(r);
        const name = String(r.name || '').trim();
        const area = r.issue ? '' : `${(App.model.TYPES.room.floorArea(r) / 1e6).toFixed(2)} ㎡`;
        const nameH = fitH(name, ROOM_NAME_H, b.maxX - b.minX, 80), areaH = fitH(area, ROOM_AREA_H, b.maxX - b.minX, 80);
        if (name) w.text('A-AREA', { x: c.x, y: c.y - (area ? nameH * 0.65 : 0) }, nameH, name, { ha: 1, va: 2 });
        if (area) w.text('A-AREA', { x: c.x, y: c.y + (name ? areaH * 0.8 : 0) }, areaH, area, { ha: 1, va: 2 });
      });
    }
    return { text: assemble(w), count: w.count, layers: [...w.used] };
  }

  /** 머리(HEADER) + 표(TABLES) + 개체(ENTITIES) + 끝(EOF). 줄바꿈은 CRLF */
  function assemble(w) {
    const L = [];
    const p = (code, value) => { L.push(String(code), String(value)); };
    const b = w.box.minX <= w.box.maxX ? w.box : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    p(0, 'SECTION'); p(2, 'HEADER');
    p(9, '$ACADVER'); p(1, 'AC1009');
    p(9, '$DWGCODEPAGE'); p(3, 'ANSI_949');
    p(9, '$INSBASE'); p(10, 0); p(20, 0); p(30, 0);
    p(9, '$EXTMIN'); p(10, num(b.minX)); p(20, num(b.minY)); p(30, 0);
    p(9, '$EXTMAX'); p(10, num(b.maxX)); p(20, num(b.maxY)); p(30, 0);
    p(9, '$LIMMIN'); p(10, num(b.minX)); p(20, num(b.minY));
    p(9, '$LIMMAX'); p(10, num(b.maxX)); p(20, num(b.maxY));
    p(9, '$LTSCALE'); p(40, 1);
    p(9, '$TEXTSTYLE'); p(7, 'HANGUL');
    p(9, '$CLAYER'); p(8, '0');
    p(0, 'ENDSEC');

    p(0, 'SECTION'); p(2, 'TABLES');
    // 처음 화면: 도면 전체가 보이게 (가로가 긴 화면 1.6:1 기준)
    const cw = Math.max(1, b.maxX - b.minX), ch = Math.max(1, b.maxY - b.minY);
    p(0, 'TABLE'); p(2, 'VPORT'); p(70, 1);
    p(0, 'VPORT'); p(2, '*ACTIVE'); p(70, 0);
    p(10, 0); p(20, 0); p(11, 1); p(21, 1);
    p(12, num((b.minX + b.maxX) / 2)); p(22, num((b.minY + b.maxY) / 2));
    p(13, 0); p(23, 0); p(14, 10); p(24, 10); p(15, 10); p(25, 10);
    p(16, 0); p(26, 0); p(36, 1); p(17, 0); p(27, 0); p(37, 0);
    p(40, num(Math.max(ch, cw / 1.6) * 1.1)); p(41, 1.6); p(42, 50); p(43, 0); p(44, 0); p(50, 0); p(51, 0);
    p(71, 0); p(72, 100); p(73, 1); p(74, 3); p(75, 0); p(76, 0); p(77, 0); p(78, 0);
    p(0, 'ENDTAB');
    // 선 종류: 실선, 점선(철거 벽·전선관 — 200 mm 선, 100 mm 띔)
    p(0, 'TABLE'); p(2, 'LTYPE'); p(70, 2);
    p(0, 'LTYPE'); p(2, 'CONTINUOUS'); p(70, 0); p(3, 'Solid line'); p(72, 65); p(73, 0); p(40, 0);
    p(0, 'LTYPE'); p(2, 'DASHED'); p(70, 0); p(3, 'Dashed __ __ __ __'); p(72, 65); p(73, 2); p(40, 300); p(49, 200); p(49, -100);
    p(0, 'ENDTAB');
    // 레이어: 0과 쓴 레이어만, 색·선 종류와 함께
    const layers = LAYERS.filter(([name]) => name === '0' || w.used.has(name));
    [...w.used].filter((name) => !layers.some(([x]) => x === name)).forEach((name) => layers.push([name, 7]));
    p(0, 'TABLE'); p(2, 'LAYER'); p(70, layers.length);
    layers.forEach(([name, color, ltype]) => { p(0, 'LAYER'); p(2, name); p(70, 0); p(62, color); p(6, ltype || 'CONTINUOUS'); });
    p(0, 'ENDTAB');
    // 글꼴: 한글은 맑은 고딕 (없으면 캐드가 비슷한 글꼴로 바꿈)
    p(0, 'TABLE'); p(2, 'STYLE'); p(70, 2);
    [['STANDARD', 'txt'], ['HANGUL', 'malgun.ttf']].forEach(([name, font]) => {
      p(0, 'STYLE'); p(2, name); p(70, 0); p(40, 0); p(41, 1); p(50, 0); p(71, 0); p(42, 2.5); p(3, font); p(4, '');
    });
    p(0, 'ENDTAB');
    p(0, 'ENDSEC');

    p(0, 'SECTION'); p(2, 'ENTITIES');
    const tail = ['0', 'ENDSEC', '0', 'EOF'];
    return `${L.concat(w.out, tail).join('\r\n')}\r\n`;
  }

  /** 파일 이름: 도면이름_CAD_날짜 (철거도·신설도로 보고 있으면 뒤에 붙임) */
  function fileName() {
    const n = App.projects && App.projects.current ? App.projects.current.name : '도면';
    const pv = App.phaseView ? App.phaseView() : '';
    return `${safeName(n)}_CAD_${App.exporter.stamp()}${pv === 'demo' ? ' (철거도)' : pv === 'new' ? ' (신설도)' : ''}.dxf`;
  }

  /** 만들어서 저장. 돌려주는 값: 파일 이름 (넣을 것이 없으면 false) */
  function exportFile(opts) {
    const r = build(opts);
    if (!r.count) {
      App.ui.toast('넣을 것이 없어 저장하지 않았습니다. 넣을 것을 더 고르거나 숨긴 레이어를 켜 보세요.');
      return false;
    }
    const name = fileName();
    App.exporter.saved(App.exporter.download(name, r.text, 'application/dxf'), `‘${name}’을 저장했습니다.`);
    return name;
  }

  /** 파일 메뉴 → CAD 도면 (DXF): 넣을 것을 고르는 작은 창 */
  async function open() {
    const els = visible();
    if (!els.some((e) => e.type !== 'photo')) {
      App.ui.toast('그린 것이 없어 내보낼 도면이 없습니다.');
      return false;
    }
    const o = options();
    const items = els.filter((e) => e.type === 'item');
    const n = {
      dims: els.filter((e) => e.type === 'dim').length,
      labels: els.filter((e) => e.type === 'room' && e.points && e.points.length >= 3).length,
      symbols: items.filter((e) => ITEM_LAYER[e.category] && e.category !== 'event').length,
      event: items.filter((e) => !ITEM_LAYER[e.category] || e.category === 'event').length,
      underlay: els.filter((e) => e.type === 'underlay' && App.underlay.data(e) && App.underlay.data(e).kind !== 'image').length,
    };
    const pv = App.phaseView ? App.phaseView() : '';
    const check = (key, label, sub) => `
      <label class="check-row"><input type="checkbox" data-opt="${key}" ${n[key] && o[key] ? 'checked' : ''} ${n[key] ? '' : 'disabled'}><span>${label}<small>${n[key] ? sub : '이 도면에는 없습니다'}</small></span></label>`;
    const r = await App.ui.dialog({
      title: 'CAD 도면 (DXF)',
      html: `
        <div class="dxo">
          <p class="dialog-note">오토캐드·ZWCAD 같은 캐드 프로그램에서 바로 여는 도면 파일(DXF)로 저장합니다. 크기는 실제 그대로(1 = 1 mm)이고, 벽·문·창문·방·치수가 레이어별로 나뉩니다.</p>
          <div class="pp-parts">
            <div class="field-label">넣을 것</div>
            ${check('dims', '치수', `치수선과 길이 글자 · ${n.dims}개`)}
            ${check('labels', '방 이름·면적 글자', `방 ${n.labels}개 · 면적은 ㎡`)}
            ${check('symbols', '전기·설비·가구 기호', `콘센트·조명·에어컨·가구 등 ${n.symbols}개 · 자리 네모와 이름`)}
            ${check('event', '조감도 물건', `텐트·무대·부스 등 ${n.event}개 · 의자 배열은 바깥 네모와 ‘의자 ○석’ 글자`)}
            ${check('underlay', '밑그림 (가져온 도면)', `불러온 DWG·DXF의 선과 글자 · 사진 밑그림은 빠짐`)}
          </div>
          <p class="props-meta">벽·문·창문·방 테두리·기둥·선·영역·동선·글자는 늘 들어갑니다. 숨긴 레이어는 빠집니다. 고른 것은 이 기기에 기억합니다.</p>
          ${pv ? `<p class="dialog-note is-warn">지금 <b>${pv === 'demo' ? '철거도' : '신설도'}</b>로 보고 있어 그 모습대로 저장합니다. 레이어 메뉴에서 바꿀 수 있습니다.</p>` : ''}
        </div>`,
      actions: [{ id: 'cancel', label: '취소' }, { id: 'ok', label: 'DXF 저장', primary: true }],
    });
    if (r.id !== 'ok') return false;
    const next = { ...o };
    r.body.querySelectorAll('[data-opt]').forEach((c) => { if (!c.disabled) next[c.dataset.opt] = c.checked; }); // 도면에 없어 못 고른 것은 전에 고른 대로
    App.storage.write(KEY, next);
    App.ui.busy('CAD 파일을 만드는 중…');
    await new Promise((res) => setTimeout(res, 30));
    try {
      return exportFile(next);
    } finally {
      App.ui.busy(false);
    }
  }

  App.dxfout = { open, build, exportFile, fileName, options, encode, LAYERS, DEFAULTS };
})();
