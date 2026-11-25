/* 설계 — 모듈 가구: 붙박이장·옷장(칸마다 속 구성), 주방 싱크대(일자·ㄱ자: 하부장·상부장·키큰장·상판·개수대·쿡탑·후드).
   통 하나를 만드는 carcass()로 모듈을 만들고, 벽을 따라 줄(run)에 늘어놓는다. 좌표는 design.js와 같음 (X 폭, Y 깊이 앞 0 → 뒤, Z 높이).
   통의 자기 좌표: u(보는 사람 왼쪽 → 오른쪽), v(문짝 앞면 0 → 벽 쪽), z. 줄 좌표: s(벽을 따라), wv(벽에서 방 쪽으로).
   - A줄: 뒷벽(y = 전체 깊이)에 붙음. s = x.   - B줄(ㄱ자): 왼쪽 벽(x = 0)에 붙음. s = 모서리(뒷벽)에서 앞으로 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const D = App.design;
  const { box, rail, sheet, num, r1, finish, paint, hingesFor, slideFor, addHw, doorPart, drawerParts } = D;
  const G = 3; // 문짝·앞판 사이 틈
  const STEEL = '#aeb6bd';

  /** 통 하나 (자기 좌표). o: { x, y(문 앞면), z, w, d(문 포함 깊이), h, S, backS, fB(몸통 색), fD(문 색), hw,
        doors(가로로 몇 짝), hinge(한 짝일 때 'l'|'r'), doorZ([z0, z1] 문이 덮는 높이 — 없으면 겉서랍 위부터 끝까지),
        drawers({ n, h }: 겉서랍 — 아래에서 h 높이를 n단), inner({ n, h }: 속서랍 — 문 뒤, 지판 바로 위),
        shelves([z…] 통 바닥에서 선반 밑면까지), fixed([z…] 고정 가로판), rods([z…] 봉 가운데), rails(천판 대신 앞뒤 보강목),
        pull(망장: 앞판 하나가 바스켓째 앞으로 나옴) } → 부재들 */
  let pullSeq = 0;
  function carcass(o) {
    const { S, hw } = o, t = S.t, B = o.backS || null, tb = B ? B.t : 0;
    const yb = o.y + t + 2, Dc = o.d - (t + 2) - tb;
    const P = (q) => paint(q, o.fB);
    const { x, z, w, h } = o, xi = x + t, wi = w - 2 * t, out = [];
    out.push(P(box('옆판', S.id, x, yb, z, t, Dc, h, { eb: h })), P(box('옆판', S.id, x + w - t, yb, z, t, Dc, h, { eb: h })));
    out.push(P(box('지판', S.id, xi, yb, z, wi, Dc, t, { eb: wi })));
    if (o.rails) out.push(P(box('보강목', S.id, xi, yb, z + h - t, wi, 80, t, { eb: wi })), P(box('보강목', S.id, xi, yb + Dc - 80, z + h - t, wi, 80, t)));
    else out.push(P(box('천판', S.id, xi, yb, z + h - t, wi, Dc, t, { eb: wi })));
    if (B) out.push(box('뒤판', B.id, x, yb + Dc, z, w, tb, h));
    const sd = Math.max(50, Dc - 20);
    (o.shelves || []).forEach((sz) => out.push(P(box('선반', S.id, xi + 1, yb + (Dc - sd), z + sz, wi - 2, sd, t, { eb: wi - 2 }))));
    (o.fixed || []).forEach((sz) => out.push(P(box('고정 선반', S.id, xi, yb, z + sz, wi, Dc, t, { eb: wi }))));
    (o.rods || []).forEach((rz) => out.push(rail('옷걸이 봉', 'rod25', 'x', xi, yb + Dc / 2 - 12.5, z + rz - 12.5, wi, { thin: true })));
    addHw(hw, '선반 다보', (o.shelves || []).length * 4);
    addHw(hw, '봉 브래킷', (o.rods || []).length * 2);
    let zf = z; // 문이 시작하는 높이
    if (o.drawers && o.drawers.n > 0) {
      const n = o.drawers.n, zone = Math.min(o.drawers.h || h, h), fh = zone / n;
      for (let j = 0; j < n; j++) out.push(...drawerParts({ S, fDoor: o.fD, fBody: o.fB, xi, wi, yb, Dc, z: z + fh * j + G / 2, h: fh - G, fx: x + G / 2, fw: w - G, fy: o.y, hw }));
      zf = z + zone;
      if (zone < h - 60) out.push(P(box('서랍 덮개판', S.id, xi, yb, zf - t, wi, Dc, t, { eb: wi })));
    }
    if (o.inner && o.inner.n > 0) {
      const n = o.inner.n, fh = (o.inner.h || 400) / n;
      for (let j = 0; j < n; j++) out.push(...drawerParts({ S, fDoor: o.fB, fBody: o.fB, xi, wi, yb, Dc, z: z + t + fh * j + G / 2, h: fh - G, fx: xi + 4, fw: wi - 8, fy: yb + 4, hw, inner: true }));
    }
    if (o.pull) { // 망장(양념 인출장): 앞판에 철망 바스켓이 달려 통째로 나옴. 바스켓은 사 오는 철물이라 부재표에는 안 들어감
      const len = slideFor(Dc), tag = { dr: `p${++pullSeq}`, an: { t: 'drawer', v: [0, -1], max: Math.min(len * 0.85, 450) } };
      out.push(paint(box('망장 앞판', S.id, x + G / 2, o.y, z + G / 2, w - G, t, h - G, { front: true, eb: 2 * (w + h), ...tag }), o.fD));
      const n = h > 620 ? 3 : 2, gap = (h - 2 * t - 40) / n;
      for (let j = 0; j < n; j++) out.push({ s: 'box', n: '바스켓', m: 'fix', role: 'fix', x: r1(xi + 12), y: r1(yb + 4), z: r1(z + t + 30 + gap * j), w: r1(wi - 24), d: r1(len - 10), h: 70, c: STEEL, metal: true, ...tag });
      addHw(hw, '망장 인출 철물 (바스켓 포함)', 1); addHw(hw, '손잡이', 1);
    }
    if (o.doors > 0) {
      const z0 = (o.doorZ ? o.doorZ[0] : zf) + G / 2, z1 = (o.doorZ ? o.doorZ[1] : z + h) - G / 2, dh = z1 - z0, n = o.doors, dw = (w - G * n) / n;
      if (dh > 60 && dw > 60) {
        for (let i = 0; i < n; i++) out.push(doorPart(S, o.fD, x + G / 2 + (dw + G) * i, o.y, z0, dw, dh, n === 1 ? (o.hinge || 'l') : i % 2 ? 'r' : 'l'));
        addHw(hw, '경첩 (싱크 경첩)', hingesFor(dh) * n);
        addHw(hw, '손잡이', n);
      }
    }
    return out;
  }
  const clampList = (list, types, defW, max = 24) => (Array.isArray(list) ? list : []).filter((m) => m && typeof m === 'object').slice(0, max)
    .map((m) => { const t = types.some((x) => x[0] === m.t) ? m.t : types[0][0]; return { ...m, t, w: Math.round(num(m.w, defW[t] || 600, 20, 2400)) }; });
  const uniq = (a) => [...new Set(a.map((v) => r1(v)))].sort((p, q) => p - q);

  /* ── 붙박이장·옷장 ── */
  const COLS = [['long', '긴 옷 (봉 1)'], ['double', '2단 봉'], ['shelf', '선반'], ['drawer', '서랍 2단 + 봉'], ['drawer4', '서랍 4단+선반'], ['open', '빈 칸 (몸통만)']];
  const COL_W = { long: 900, double: 900, shelf: 450, drawer: 900, drawer4: 600, open: 600 };
  const COL_SHORT = { long: '긴 옷', double: '2단 봉', shelf: '선반', drawer: '서랍+봉', drawer4: '서랍4', open: '빈 칸' };
  function closet(p) {
    const H = num(p.H, 2300, 600, 3000), Dp = num(p.D, 600, 300, 900), S = sheet(p.mat), t = S.t;
    const backS = p.back && p.back !== 'none' ? sheet(p.back) : null;
    const plinth = num(p.plinth, 70, 0, 300), top = num(p.top, 60, 0, 400), fl = num(p.fl, 0, 0, 400), fr = num(p.fr, 0, 0, 400);
    const fB = finish(p.body), fD = finish(p.doorc), PD = (q) => paint(q, fD);
    const cols = clampList(p.cols, COLS, COL_W, 12).map((c) => ({ ...c, w: Math.max(250, Math.min(1200, c.w)) }));
    const parts = [], hw = [], labels = [], cx = [0];
    if (!cols.length) return { parts, hw, info: [['칸', '없음', '‘＋ 칸 추가’로 칸을 넣으세요']] };
    const hc = H - plinth - top;
    if (hc < 400 || Dp - t - 2 - (backS ? backS.t : 0) < 100) return { parts, hw, info: [['치수', '너무 작음', '높이·깊이를 키우거나 걸레받이·몰딩을 줄여 주세요']] };
    const doorsOn = p.doors !== 'none';
    let x = 0, nd = 0;
    if (fl > 0) { parts.push(PD(box('휠라', S.id, x, 0, 0, fl, t, H))); x += fl; cx.push(x); }
    if (p.epl) { parts.push(PD(box('EP (마감 판넬)', S.id, x, 0, 0, t, Dp, H, { eb: H + Dp }))); x += t; cx.push(x); }
    const x0 = x, Hi = hc - 2 * t, topShelf = hc - t - 300 - t; // 위에서 300 아래에 선반 (이불·상자 칸)
    const cloLed = p.ledClo && p.ledClo !== 'none' && App.ledstrip ? App.ledstrip.spec(p) : null;
    cols.forEach((c, i) => {
      const n = doorsOn && c.t !== 'open' ? (c.w <= 600 ? 1 : 2) : 0;
      const o = { x, y: 0, z: plinth, w: c.w, d: Dp, h: hc, S, backS, fB, fD, hw, doors: n, hinge: i === cols.length - 1 && i > 0 ? 'r' : 'l' };
      if (c.t === 'long') { o.shelves = [topShelf]; o.rods = [topShelf - 60]; }
      else if (c.t === 'double') { const mid = t + Math.round((topShelf - t) * 0.5); o.shelves = [topShelf, mid]; o.rods = [topShelf - 60, mid - 60]; }
      else if (c.t === 'shelf') { const k = Math.max(2, Math.round(Hi / 380) - 1), gap = (Hi - k * t) / (k + 1); o.shelves = Array.from({ length: k }, (_, j) => t + gap * (j + 1) + t * j); }
      else if (c.t === 'drawer') { o.inner = { n: 2, h: 400 }; o.fixed = [t + 404]; o.shelves = [topShelf]; o.rods = [topShelf - 60]; }
      else if (c.t === 'drawer4') {
        o.inner = { n: 4, h: 760 }; o.fixed = [t + 764];
        const z0 = t + 764 + t, k = Math.max(1, Math.round((hc - t - z0) / 380) - 1), gap = (hc - t - z0 - k * t) / (k + 1);
        o.shelves = Array.from({ length: k }, (_, j) => z0 + gap * (j + 1) + t * j);
      }
      parts.push(...carcass(o));
      if (cloLed) { // LED (선택): 칸 천장 라인 · 칸 양옆 세로 라인 (문 뒤 45)
        if (p.ledClo === 'top' || p.ledClo === 'both') parts.push(...D.ledParts([[x + t + 20, 45, plinth + hc - t - 10], [x + c.w - t - 20, 45, plinth + hc - t - 10]], cloLed, `C${i}t`));
        if (p.ledClo === 'side' || p.ledClo === 'both') [x + t + 6, x + c.w - t - 6].forEach((lx, j) => parts.push(...D.ledParts([[lx, 45, plinth + t + 60], [lx, 45, plinth + hc - t - 60]], cloLed, `C${i}s${j}`)));
      }
      nd += n;
      labels.push({ view: 'front', a0: x, a1: x + c.w, z0: plinth, z1: plinth + hc, text: `${COL_SHORT[c.t]} ${c.w}` });
      x += c.w; cx.push(x);
    });
    const x1 = x;
    if (p.epr) { parts.push(PD(box('EP (마감 판넬)', S.id, x, 0, 0, t, Dp, H, { eb: H + Dp }))); x += t; cx.push(x); }
    if (fr > 0) { parts.push(PD(box('휠라', S.id, x, 0, 0, fr, t, H))); x += fr; cx.push(x); }
    if (plinth >= 30) parts.push(PD(box('걸레받이', S.id, x0, 30, 0, x1 - x0, t, plinth, { eb: x1 - x0 })));
    if (top >= 20) parts.push(PD(box('상부 몰딩', S.id, x0, 0, H - top, x1 - x0, t, top, { eb: x1 - x0 })));
    addHw(hw, '통 연결 볼트', (cols.length - 1) * 4);
    addHw(hw, '조절발', plinth >= 30 ? cols.length * 4 : 0);
    D.withHandles(parts, hw, p);
    const spec = [fB.color ? `몸통: ${fB.name}` : `몸통: ${S.name}`, doorsOn ? `문짝: ${fD.color ? fD.name : S.name}` : '문짝 없음 (오픈)'];
    return {
      parts, hw, labels, spec, chain: { x: uniq(cx), y: [0, Dp], z: uniq([0, plinth, H - top, H]) },
      info: [
        ['전체 폭', `${Math.round(x).toLocaleString('ko-KR')} mm`, `칸 ${cols.map((c) => c.w).join(' + ')}${fl || fr ? ` · 휠라 ${[fl, fr].filter(Boolean).join(' + ')}` : ''}${p.epl || p.epr ? ` · EP ${t}T` : ''}`],
        ['통 높이', `${r1(hc)} mm`, `걸레받이 ${r1(plinth)} + 통 + 상부 몰딩 ${r1(top)}`],
        ['문짝', doorsOn ? `${nd}짝` : '없음', doorsOn ? `높이 ${r1(hc - G)} mm · 한 짝에 경첩 ${hingesFor(hc)}개` : '속이 보이는 오픈장'],
        ['몸통 깊이', `${r1(Dp - t - 2 - (backS ? backS.t : 0))} mm`, `문 ${t}T + 2 · 뒤판 ${backS ? backS.t : 0}T 뺌`],
      ],
    };
  }

  /* ── 주방 싱크대 ── */
  const BASE = [['door', '문짝장'], ['doorin', '문짝장 + 속서랍'], ['drawer2', '서랍 2단'], ['drawer3', '서랍 3단'], ['drawer4', '서랍 4단'], ['sink', '개수대장'], ['cook', '쿡탑장 (문)'], ['cookd', '쿡탑장 (서랍 3단)'],
    ['corner', '코너장 (모서리)'], ['pull', '망장 (인출장)'], ['open', '빈 칸 (가전 자리)'], ['filler', '휠라 (틈 메움)'], ['tall', '키큰장 (문)'], ['tallopen', '키큰장 (가전 칸)'], ['fridge', '냉장고 자리']];
  const BASE_W = { door: 800, doorin: 600, pull: 200, drawer2: 600, drawer3: 600, drawer4: 450, sink: 900, cook: 600, cookd: 600, corner: 1000, open: 600, filler: 50, tall: 600, tallopen: 600, fridge: 950 };
  const BASE_SHORT = { door: '문', doorin: '문+속서랍', pull: '망장', drawer2: '서랍2', drawer3: '서랍3', drawer4: '서랍4', sink: '개수대', cook: '쿡탑', cookd: '쿡탑', corner: '코너', open: '빈 칸', filler: '휠라', tall: '키큰장', tallopen: '키큰장', fridge: '냉장고' };
  const UPPER = [['door', '상부장'], ['hood', '후드'], ['shelf', '오픈 선반'], ['none', '없음']];
  const TALL = new Set(['tall', 'tallopen', 'fridge']);
  const TOPS = [
    { id: 'marble', name: '화이트 마블 (인조대리석)', color: '#edece7' }, { id: 'stone', name: '그레이 스톤', color: '#b4b8ba' }, { id: 'black', name: '블랙 스톤', color: '#3a3c3f' },
    { id: 'beige', name: '베이지 스톤', color: '#d8cfc0' }, { id: 'wood', name: '우드 (집성목)', color: '#c9a36b' }, { id: 'sus', name: '스테인리스', color: '#c4cacf', metal: true },
  ];
  const fix = (n, x, y, z, w, d, h, c, o = {}) => ({ s: 'box', n, m: 'fix', role: 'fix', x: r1(x), y: r1(y), z: r1(z), w: r1(w), d: r1(d), h: r1(h), c, ...o });

  function kitchen(p) {
    const S = sheet(p.mat), t = S.t, backS = sheet('ply5');
    const H = num(p.H, 850, 700, 1000), Dp = num(p.D, 580, 450, 750), plinth = num(p.plinth, 120, 60, 200), topT = num(p.topT, 12, 10, 60), over = 20;
    const wallH = num(p.wallH, 700, 300, 1000), wallD = num(p.wallD, 320, 250, 450), HT = num(p.HT, 2200, 1700, 2700), mold = num(p.mold, 50, 0, 300);
    const fB = finish(p.body), fD = finish(p.doorc), fU = p.doorU && p.doorU !== 'same' ? finish(p.doorU) : fD;
    const TOP = TOPS.find((x) => x.id === p.topc) || TOPS[0];
    const isL = p.shape === 'L';
    const fixMod = (m) => ({ ...m, u: UPPER.some((x) => x[0] === m.u) ? m.u : 'door' });
    // 코너장은 ㄱ자의 A줄 첫 칸에서만 뜻이 있음 (다른 자리는 문짝장으로), 너무 좁은 칸은 휠라로
    const tidy = (m, corner) => ({ ...m, t: m.t === 'corner' && !corner ? 'door' : m.w < 180 && !['open', 'filler'].includes(m.t) ? 'filler' : m.t });
    const A = clampList(p.A, BASE, BASE_W).map(fixMod).map((m, i) => tidy(m, isL && i === 0));
    const Bm = isL ? clampList(p.B, BASE, BASE_W).map(fixMod).map((m) => tidy(m, false)) : [];
    const parts = [], hw = [], labels = [];
    const hb = H - topT - plinth, ht = HT - plinth, zw = HT - wallH;
    if (!A.length) return { parts, hw, info: [['모듈', '없음', '‘＋ 모듈 추가’로 하부장을 넣으세요']] };
    if (hb < 300 || zw < H + 250) return { parts, hw, info: [['치수', '확인', '조리대 높이·상부장 높이를 확인해 주세요']] };

    /* 모듈 자리 (줄 좌표 s) */
    const lay = (mods, start) => { let s = start; return mods.map((m) => { const o = { ...m, s0: s, s1: s + m.w }; s += m.w; return o; }); };
    const ep1 = !!p.ep1, ep2 = p.ep2 !== false;
    const dead = isL && A[0].t !== 'corner';                       // 모서리를 막아 두는 배치 (코너장 없음)
    const runA = lay(A, isL ? (dead ? Dp : 0) : (ep1 ? t : 0));
    const runB = lay(Bm, Dp);
    const endA = runA[runA.length - 1].s1, endB = runB.length ? runB[runB.length - 1].s1 : 0;
    const LA = endA + (ep2 ? t : 0), LB = runB.length ? endB + (ep1 ? t : 0) : 0;
    const Y = isL ? Math.max(LB, Dp + over) : Dp + over;          // 전체 깊이 (뒷벽 y = Y)

    /* 줄 좌표 → 도면 좌표 */
    const putA = (list, s0, dep) => list.map((q) => ({ ...q, x: r1(q.x + s0), y: r1(q.y + Y - dep), ...(q.an && q.an.t === 'door' ? { an: { ...q.an, ax: [q.an.ax[0] + s0, q.an.ax[1] + Y - dep] } } : {}) }));
    const putB = (list, s1, dep) => list.map((q) => {
      const o = { ...q, x: r1(dep - q.y - q.d), y: r1(Y - s1 + q.x), w: q.d, d: q.w };
      if (q.axis) o.axis = q.axis === 'x' ? 'y' : q.axis === 'y' ? 'x' : q.axis;
      if (q.an) o.an = q.an.t === 'door' ? { ...q.an, ax: [dep - q.an.ax[1], Y - s1 + q.an.ax[0]], out: [1, 0] } : { ...q.an, v: [-q.an.v[1], q.an.v[0]] };
      return o;
    });
    /** 벽을 따라 놓는 판: 줄 좌표 [s0, s1] × 벽에서 [w0, w1] × 높이 [z0, z1] */
    const board = (run, n, s0, s1, w0, w1, z0, z1, f, o = {}) => {
      const q = run === 'A' ? box(n, S.id, s0, Y - w1, z0, s1 - s0, w1 - w0, z1 - z0, o) : box(n, S.id, w0, Y - s1, z0, w1 - w0, s1 - s0, z1 - z0, o);
      return f ? paint(q, f) : q;
    };
    const slab = (run, s0, s1, z0, z1) => (run === 'A'
      ? { s: 'box', n: '상판', m: 'top', mn: `${TOP.name} ${topT}T`, role: 'slab', x: r1(s0), y: r1(Y - Dp - over), z: z0, w: r1(s1 - s0), d: Dp + over, h: z1 - z0, c: TOP.color, gl: !TOP.metal, metal: !!TOP.metal }
      : { s: 'box', n: '상판', m: 'top', mn: `${TOP.name} ${topT}T`, role: 'slab', x: 0, y: r1(Y - s1), z: z0, w: Dp + over, d: r1(s1 - s0), h: z1 - z0, c: TOP.color, gl: !TOP.metal, metal: !!TOP.metal });

    /* 하부·키큰 모듈 (자기 좌표: u 0~w, v 0=문 앞면) */
    const baseMod = (m, blankSide) => {
      const o = { x: 0, y: 0, z: plinth, w: m.w, d: Dp, h: hb, S, backS, fB, fD, hw, rails: true };
      const out = [], one = m.w <= 500 ? 1 : 2;
      const cooktop = () => { const cw = Math.min(m.w - 40, 580); out.push(fix('쿡탑', (m.w - cw) / 2, 70 - over, H, cw, 500, 6, '#1c1e21', { gl: true })); addHw(hw, '쿡탑 (기기)', 1); };
      switch (m.t) {
        case 'door': out.push(...carcass({ ...o, doors: one, shelves: [Math.round(hb / 2)] })); break;
        case 'doorin': out.push(...carcass({ ...o, doors: one, inner: { n: 1, h: 170 }, shelves: [Math.round(hb * 0.6)] })); break;
        case 'pull': out.push(...carcass({ ...o, pull: true })); break;
        case 'drawer2': case 'drawer3': case 'drawer4': out.push(...carcass({ ...o, drawers: { n: +m.t.slice(-1), h: hb } })); break;
        case 'sink': {
          out.push(...carcass({ ...o, doors: one }));
          const bw = Math.max(300, Math.min(m.w - 120, 800));
          out.push(fix('싱크볼', (m.w - bw) / 2, 90 - over, H, bw, 420, 4, '#8f989f', { metal: true }));
          out.push(fix('수전', m.w / 2 - 14, 530 - over, H, 28, 28, 300, STEEL, { metal: true }), fix('수전', m.w / 2 - 14, 390 - over, H + 272, 28, 168, 28, STEEL, { metal: true }));
          addHw(hw, '싱크볼', 1); addHw(hw, '수전', 1); addHw(hw, '배수구·배관 세트', 1);
          break;
        }
        case 'cook': out.push(...carcass({ ...o, doors: one, shelves: [Math.round(hb / 2)] })); cooktop(); break;
        case 'cookd': out.push(...carcass({ ...o, drawers: { n: 3, h: hb } })); cooktop(); break;
        case 'corner': { // 막힌 쪽(다른 줄에 가려지는 쪽)은 막음판, 나머지에 문 한 짝
          const blank = Math.min(m.w - 60, Dp + 30), dw = m.w - blank - G;
          out.push(...carcass({ ...o, shelves: [Math.round(hb / 2)] }));
          out.push(paint(box('막음판', S.id, blankSide === 'r' ? m.w - blank : 0, 0, plinth, blank, t, hb), fD));
          if (dw > 200) {
            out.push(doorPart(S, fD, blankSide === 'r' ? G / 2 : blank + G / 2, 0, plinth + G / 2, dw, hb - G, blankSide === 'r' ? 'l' : 'r'));
            addHw(hw, '경첩 (싱크 경첩)', hingesFor(hb)); addHw(hw, '손잡이', 1);
          }
          break;
        }
        case 'filler': out.push(paint(box('휠라', S.id, 0, 0, plinth, m.w, t, hb), fD)); break;
        case 'tall': { // 아래 문(상부장 밑선까지) + 위 문
          const cut = zw - plinth;
          out.push(...carcass({ ...o, h: ht, rails: false, fD: fU, doors: one, doorZ: [plinth, zw], fixed: [cut - t], shelves: [Math.round(cut * 0.25), Math.round(cut * 0.5), Math.round(cut * 0.75), cut + Math.round((ht - cut) / 2)] }));
          out.push(...[0, 1].slice(0, one).map((i) => { const dw = (m.w - G * one) / one; return doorPart(S, fU, G / 2 + (dw + G) * i, 0, zw + G / 2, dw, HT - zw - G, one === 1 ? 'l' : i ? 'r' : 'l'); }));
          addHw(hw, '경첩 (싱크 경첩)', hingesFor(HT - zw) * one); addHw(hw, '손잡이', one);
          break;
        }
        case 'tallopen': { // 아래 문 · 가운데 열린 칸 둘(전자레인지·밥솥) · 위 문
          const c1 = hb, c2 = zw - plinth, mid = Math.round((c1 + c2) / 2);
          out.push(...carcass({ ...o, h: ht, rails: false, fD: fU, doors: one, doorZ: [plinth, plinth + hb], fixed: [c1 - t, mid - t / 2, c2 - t], shelves: [Math.round(c1 / 2), c2 + Math.round((ht - c2) / 2)] }));
          out.push(...[0, 1].slice(0, one).map((i) => { const dw = (m.w - G * one) / one; return doorPart(S, fU, G / 2 + (dw + G) * i, 0, zw + G / 2, dw, HT - zw - G, one === 1 ? 'l' : i ? 'r' : 'l'); }));
          addHw(hw, '경첩 (싱크 경첩)', hingesFor(HT - zw) * one); addHw(hw, '손잡이', one);
          break;
        }
        case 'fridge': { // 냉장고 자리: 위에만 상부장
          const fh = Math.max(250, Math.min(450, HT - 1850));
          out.push(...carcass({ ...o, z: HT - fh, h: fh, rails: false, fD: fU, doors: m.w <= 500 ? 1 : 2 }));
          break;
        }
        default: // open: 빈 칸
      }
      if (!['open', 'filler', 'fridge'].includes(m.t)) addHw(hw, '조절발', m.w > 900 ? 6 : 4);
      return out;
    };
    /* 상부 모듈 (폭 w — 하부와 다를 수 있음: 모서리 쪽으로 늘어남) */
    const upperMod = (m, w, blank, blankSide) => {
      const o = { x: 0, y: 0, z: zw, w, d: wallD, h: wallH, S, backS, fB, fD: fU, hw };
      const out = [], one = w <= 500 ? 1 : 2, sh = wallH >= 550 ? [Math.round(wallH / 2)] : [];
      if (m.u === 'none') return out;
      if (blank > 0) { // 모서리 상부장: 가려지는 쪽은 막음판
        const dw = w - blank - G;
        out.push(...carcass({ ...o, shelves: sh }), paint(box('막음판', S.id, blankSide === 'r' ? w - blank : 0, 0, zw, blank, t, wallH), fU));
        if (dw > 200) { out.push(doorPart(S, fU, blankSide === 'r' ? G / 2 : blank + G / 2, 0, zw + G / 2, dw, wallH - G, blankSide === 'r' ? 'l' : 'r')); addHw(hw, '경첩 (싱크 경첩)', hingesFor(wallH)); addHw(hw, '손잡이', 1); }
      } else if (m.u === 'shelf') out.push(...carcass({ ...o, shelves: sh }));
      else out.push(...carcass({ ...o, doors: one, shelves: m.u === 'hood' ? [] : sh }));
      if (m.u === 'hood') { const hwid = Math.min(w - 20, 900); out.push(fix('후드', (w - hwid) / 2, wallD - 480, zw - 70, hwid, 480, 70, STEEL, { metal: true })); addHw(hw, '후드 (기기)', 1); }
      addHw(hw, '상부장 걸이 철물', 2);
      return out;
    };

    /* 줄마다: 모듈·상부·상판·걸레받이·몰딩 */
    const place = (run, list, s0, s1, dep) => (run === 'A' ? putA(list, s0, dep) : putB(list, s1, dep));
    let nBase = 0, nUp = 0, topLen = 0, kitLedN = 0;
    const kitLed = p.ledKit && p.ledKit !== 'none' && App.ledstrip ? App.ledstrip.spec(p) : null;
    const doRun = (run, mods, cornerSide) => {
      const segs = (pred) => { const out = []; mods.forEach((m) => { if (!pred(m)) return; const last = out[out.length - 1]; if (last && Math.abs(last[1] - m.s0) < 0.5) last[1] = m.s1; else out.push([m.s0, m.s1]); }); return out; };
      mods.forEach((m, i) => {
        const first = i === 0;
        parts.push(...place(run, baseMod(m, cornerSide), m.s0, m.s1, Dp));
        if (!['open', 'filler', 'fridge'].includes(m.t)) nBase++;
        const lab = `${BASE_SHORT[m.t]} ${m.w}`;
        if (run === 'A') labels.push({ view: 'front', a0: m.s0, a1: m.s1, z0: plinth, z1: plinth + (TALL.has(m.t) ? ht : hb), text: lab });
        else labels.push({ view: 'side', a0: Y - m.s1, a1: Y - m.s0, z0: plinth, z1: plinth + (TALL.has(m.t) ? ht : hb), text: lab });
        if (TALL.has(m.t)) return;
        // 상부: 모서리 쪽 첫 칸은 깊이 차(하부 깊이 − 상부 깊이)만큼 벽 쪽으로 늘림
        let u0 = m.s0, blank = 0;
        if (first && isL && (run === 'B' || dead)) u0 = wallD;
        if (first && isL && run === 'A' && m.t === 'corner') blank = Math.min(m.w - 60, wallD + 30);
        const uw = m.s1 - u0;
        const up = m.t === 'filler' || uw < 180 ? (m.u === 'none' ? [] : [paint(box('휠라', S.id, 0, 0, zw, uw, t, wallH), fU)]) : upperMod(m, uw, blank, cornerSide);
        if (up.length) {
          parts.push(...place(run, up, u0, m.s1, wallD));
          if (up.length > 1) nUp++;
          if (m.u === 'hood' || m.u === 'shelf') {
            const text = m.u === 'hood' ? `후드 ${Math.min(uw - 20, 900)}` : '오픈 선반';
            if (run === 'A') labels.push({ view: 'front', a0: u0, a1: m.s1, z0: zw, z1: HT, text }); else labels.push({ view: 'side', a0: Y - m.s1, a1: Y - u0, z0: zw, z1: HT, text });
          }
        }
        m.u0 = u0;
      });
      // 상판: 키큰장이 아닌 칸이 이어진 곳마다 (모서리 쪽은 벽까지, 끝은 EP 위까지)
      segs((m) => !TALL.has(m.t)).forEach(([a, b]) => {
        let s0 = a, s1 = b;
        if (run === 'A') { if (isL && Math.abs(a - mods[0].s0) < 0.5) s0 = 0; if (ep2 && Math.abs(b - endA) < 0.5) s1 = b + t; if (!isL && ep1 && Math.abs(a - mods[0].s0) < 0.5) s0 = 0; }
        else { if (Math.abs(a - Dp) < 0.5) s0 = Dp + over; if (ep1 && Math.abs(b - endB) < 0.5) s1 = b + t; }
        if (s1 - s0 > 10) { parts.push(slab(run, s0, s1, H - topT, H)); topLen += s1 - s0; }
      });
      // 걸레받이: 통이 있는 칸이 이어진 곳마다 (문 앞면에서 50 들어감)
      segs((m) => !['open', 'fridge'].includes(m.t)).forEach(([a, b]) => parts.push(board(run, '걸레받이', a, b, Dp - 50 - t, Dp - 50, 0, plinth, fD, { eb: b - a })));
      // LED (선택): 상부장 밑(조리대를 비춤) · 걸레받이 간접(바닥을 비춤)
      if (kitLed) {
        const P3 = (s, w, z) => (run === 'A' ? [s, Y - w, z] : [w, Y - s, z]);
        if (p.ledKit === 'under' || p.ledKit === 'both') segs((m) => !TALL.has(m.t) && m.u !== 'none').forEach(([a, b]) => { const m0 = mods.find((m) => Math.abs(m.s0 - a) < 0.5), s0 = m0 && m0.u0 != null ? m0.u0 : a; if (b - s0 > 200) parts.push(...D.ledParts([P3(s0 + 30, wallD - 30, zw - 6), P3(b - 30, wallD - 30, zw - 6)], kitLed, `K${++kitLedN}`)); });
        if (p.ledKit === 'plinth' || p.ledKit === 'both') segs((m) => !['open', 'fridge'].includes(m.t)).forEach(([a, b]) => { if (b - a > 200) parts.push(...D.ledParts([P3(a + 30, Dp - 40, plinth - 12), P3(b - 30, Dp - 40, plinth - 12)], kitLed, `K${++kitLedN}`)); });
      }
      // 상부 몰딩: 상부장·키큰장 위
      if (mold >= 20) {
        segs((m) => !TALL.has(m.t) && m.u !== 'none').forEach(([a, b]) => { const m0 = mods.find((m) => Math.abs(m.s0 - a) < 0.5); parts.push(board(run, '상부 몰딩', m0 && m0.u0 != null ? m0.u0 : a, b, wallD - t, wallD, HT, HT + mold, fU, { eb: b - a })); });
        segs((m) => TALL.has(m.t)).forEach(([a, b]) => parts.push(board(run, '상부 몰딩', a, b, Dp - t, Dp, HT, HT + mold, fU, { eb: b - a })));
      }
    };
    doRun('A', runA, 'l');
    if (runB.length) doRun('B', runB, 'r');
    // 끝 마감 판넬 (EP): 줄 끝이 벽에 붙지 않을 때
    const epAt = (run, s, mod) => {
      if (TALL.has(mod.t)) parts.push(board(run, 'EP (마감 판넬)', s, s + t, 0, Dp, 0, HT, fU, { eb: HT + Dp }));
      else {
        if (mod.t !== 'open') parts.push(board(run, 'EP (마감 판넬)', s, s + t, 0, Dp, 0, H - topT, fD, { eb: H + Dp }));
        if (mod.u !== 'none') parts.push(board(run, 'EP (마감 판넬)', s, s + t, 0, wallD, zw, HT, fU, { eb: wallH + wallD }));
      }
    };
    if (ep2) epAt('A', endA, runA[runA.length - 1]);
    if (ep1) { if (runB.length) epAt('B', endB, runB[runB.length - 1]); else if (!isL) epAt('A', 0, runA[0]); }

    D.withHandles(parts, hw, p);
    const cxA = uniq([0, ...runA.flatMap((m) => [m.s0, m.s1]), LA]);
    const cyB = runB.length ? uniq([Y - LB, ...runB.flatMap((m) => [Y - m.s1, Y - m.s0]), Y]) : uniq([0, over, Y]);
    const spec = [`몸통: ${fB.color ? fB.name : S.name}`, `하부장 문: ${fD.color ? fD.name : S.name}`, `상부장·키큰장 문: ${fU.color ? fU.name : S.name}`, `상판: ${TOP.name} ${topT}T`];
    const info = [['A줄 길이', `${Math.round(LA).toLocaleString('ko-KR')} mm`, `뒷벽 · 모듈 ${runA.length}개${dead ? ' · 모서리는 막음' : ''}`]];
    if (runB.length) info.push(['B줄 길이', `${Math.round(LB).toLocaleString('ko-KR')} mm`, `왼쪽 벽 · 모서리부터 · 모듈 ${runB.length}개`]);
    info.push(['하부장', `${nBase}통`, `통 높이 ${r1(hb)} · 깊이 ${r1(Dp)} · 걸레받이 ${r1(plinth)}`], ['상부장', `${nUp}통`, `${r1(wallH)} × ${r1(wallD)} · 바닥에서 ${r1(zw)}부터`],
      ['상판', `${(topLen / 1000).toFixed(2)} m`, `${TOP.name} ${topT}T · 깊이 ${r1(Dp + over)} · 조리대 높이 ${r1(H)}`], ['조리대 ~ 상부장', `${r1(zw - H)} mm`, '조리대 윗면에서 상부장 밑까지']);
    return { parts, hw, labels, spec, info, cam: isL ? 0.72 : -0.5, chain: { x: cxA, y: cyB, z: uniq([0, plinth, H, zw, HT, ...(mold >= 20 ? [HT + mold] : [])]) } };
  }

  const FIN_FIELDS = [{ k: 'body', label: '몸통 색', type: 'finish' }, { k: 'doorc', label: '문짝 색', type: 'finish' }];
  D.KINDS.closet = {
    label: '붙박이장·옷장', make: closet,
    defaults: { H: 2300, D: 600, cols: [{ t: 'shelf', w: 450 }, { t: 'long', w: 900 }, { t: 'drawer', w: 900 }], doors: 'swing', plinth: 70, top: 60, fl: 50, fr: 0, epl: false, epr: true, mat: 'lpm18', back: 'ply5', body: 'oak', doorc: 'white', handle: 'bar' },
    presets: [
      ['붙박이장 2250 (선반·긴 옷·서랍)', { cols: [{ t: 'shelf', w: 450 }, { t: 'long', w: 900 }, { t: 'drawer', w: 900 }] }],
      ['붙박이장 3000 (4칸)', { cols: [{ t: 'long', w: 800 }, { t: 'double', w: 800 }, { t: 'drawer', w: 800 }, { t: 'shelf', w: 550 }] }],
      ['옷장 1200 (2칸)', { cols: [{ t: 'long', w: 600 }, { t: 'drawer4', w: 600 }], H: 2100, fl: 0, epl: true, epr: true }],
      ['드레스룸 오픈장 2400', { cols: [{ t: 'double', w: 800 }, { t: 'drawer', w: 800 }, { t: 'shelf', w: 800 }], doors: 'none', fl: 0, epr: false, top: 0, body: 'white' }],
    ],
    fields: [
      { k: 'cols', label: '칸', hint: '왼쪽부터', note: '서랍 칸은 문 뒤의 속서랍입니다. 폭 600 이하는 문 한 짝, 넘으면 두 짝.', type: 'list', add: { t: 'shelf', w: 800 }, defw: COL_W, item: [{ k: 't', options: COLS }, { k: 'w', unit: 'mm' }] },
      { k: 'H', label: '전체 높이', unit: 'mm' }, { k: 'D', label: '깊이 (문 포함)', unit: 'mm' },
      { k: 'doors', label: '문', type: 'select', options: [['swing', '여닫이 문'], ['none', '문 없음 (오픈장)']] }, { k: 'plinth', label: '걸레받이 높이', unit: 'mm' },
      { k: 'top', label: '상부 몰딩 높이', unit: 'mm' }, { k: 'fl', label: '왼쪽 휠라 폭', unit: 'mm' }, { k: 'fr', label: '오른쪽 휠라 폭', unit: 'mm' },
      { k: 'mat', label: '판재', type: 'sheet', min: 15 }, { k: 'back', label: '뒤판', type: 'sheet', none: '없음', max: 9 }, ...FIN_FIELDS,
      { k: 'handle', label: '손잡이', type: 'select', options: D.HANDLES },
      { k: 'ledClo', label: 'LED (칸 안)', type: 'select', options: [['none', '없음'], ['top', '칸 천장 라인'], ['side', '칸 양옆 세로 라인'], ['both', '천장 + 세로']] },
      { k: 'epl', label: '왼쪽 끝 EP (마감 판넬)', type: 'check' }, { k: 'epr', label: '오른쪽 끝 EP (마감 판넬)', type: 'check' },
    ],
  };
  const m = (t, w, u) => ({ t, w, ...(u ? { u } : {}) });
  D.KINDS.kitchen = {
    label: '주방 싱크대', make: kitchen,
    defaults: {
      shape: 'I', A: [m('drawer3', 600), m('sink', 900), m('door', 400), m('cook', 600, 'hood'), m('door', 500)], B: [m('door', 800), m('drawer3', 600), m('tallopen', 600)],
      H: 850, D: 580, plinth: 120, topT: 12, topc: 'marble', HT: 2200, wallH: 700, wallD: 320, mold: 50, mat: 'lpm18', body: 'beige', doorc: 'gray', doorU: 'white', handle: 'bar', ep1: false, ep2: true,
    },
    presets: [
      ['일자 3000 (개수대·쿡탑)', { shape: 'I', A: [m('drawer3', 600), m('sink', 900), m('door', 400), m('cook', 600, 'hood'), m('door', 500)] }],
      ['일자 2400 + 키큰장', { shape: 'I', A: [m('tallopen', 600), m('sink', 800), m('cookd', 600, 'hood'), m('door', 400)], ep1: true }],
      ['ㄱ자 3100 × 3600 (코너장·키큰장)', { shape: 'L', A: [m('corner', 1000), m('cook', 600, 'hood'), m('drawer3', 600), m('door', 880)], B: [m('door', 450), m('sink', 950), m('drawer2', 600), m('door', 400), m('tallopen', 600)], ep1: true, ep2: true }],
      ['ㄱ자 2400 × 2400 (모서리 막음)', { shape: 'L', A: [m('sink', 900), m('door', 900)], B: [m('cook', 600, 'hood'), m('drawer3', 600), m('door', 600)], ep1: true }],
      ['일자 3000 + 상부장 밑 LED', { shape: 'I', A: [m('drawer3', 600), m('sink', 900), m('door', 400), m('cook', 600, 'hood'), m('door', 500)], ledKit: 'under', ledType: 'cob24', ledK: '4000' }],
    ],
    fields: [
      { k: 'shape', label: '모양', type: 'select', options: [['I', '일자'], ['L', 'ㄱ자 (뒷벽 + 왼쪽 벽)']], rebuild: true },
      { k: 'A', label: 'A줄 — 뒷벽', hint: '왼쪽부터 (ㄱ자는 첫 칸이 모서리)', note: '키큰장(가전 칸) = 전자레인지·밥솥 칸 · 망장 = 양념 인출장 · 빈 칸 = 가전 자리(통 없음) · 휠라 = 벽과의 틈 메움 · 위: 후드 = 후드 + 상부장 · 위: 없음 = 창문 자리', type: 'list', add: m('door', 600, 'door'), defw: BASE_W, tall: [...TALL], item: [{ k: 't', options: BASE }, { k: 'w', unit: 'mm' }, { k: 'u', options: UPPER, label: '위' }] },
      { k: 'B', label: 'B줄 — 왼쪽 벽', hint: '모서리부터 앞으로', type: 'list', when: (p) => p.shape === 'L', add: m('door', 600, 'door'), defw: BASE_W, tall: [...TALL], item: [{ k: 't', options: BASE.filter((x) => x[0] !== 'corner') }, { k: 'w', unit: 'mm' }, { k: 'u', options: UPPER, label: '위' }] },
      { k: 'H', label: '조리대 높이 (상판 윗면)', unit: 'mm' }, { k: 'D', label: '하부장 깊이 (문 포함)', unit: 'mm' }, { k: 'plinth', label: '걸레받이 높이', unit: 'mm' }, { k: 'topT', label: '상판 두께', unit: 'mm' },
      { k: 'topc', label: '상판', type: 'select', options: TOPS.map((x) => [x.id, x.name]) },
      { k: 'HT', label: '상부장 윗면 높이', unit: 'mm' }, { k: 'wallH', label: '상부장 높이', unit: 'mm' }, { k: 'wallD', label: '상부장 깊이', unit: 'mm' }, { k: 'mold', label: '상부 몰딩 높이', unit: 'mm' },
      { k: 'mat', label: '판재', type: 'sheet', min: 15 }, { k: 'body', label: '몸통 색', type: 'finish' }, { k: 'doorc', label: '하부장 문 색', type: 'finish' }, { k: 'doorU', label: '상부장·키큰장 문 색', type: 'finish', same: '하부장 문과 같게' },
      { k: 'handle', label: '손잡이', type: 'select', options: D.HANDLES },
      { k: 'ledKit', label: 'LED (주방)', type: 'select', options: [['none', '없음'], ['under', '상부장 밑 (조리대 비춤)'], ['plinth', '걸레받이 간접 (바닥)'], ['both', '상부장 밑 + 걸레받이']] },
      { k: 'ep1', label: '왼쪽(ㄱ자는 B줄) 끝 EP (마감 판넬)', type: 'check' }, { k: 'ep2', label: 'A줄 오른쪽 끝 EP (마감 판넬)', type: 'check' },
    ],
  };
  D.kit = { carcass, COLS, BASE, UPPER, TOPS, TALL, BASE_W, COL_W };
})();
