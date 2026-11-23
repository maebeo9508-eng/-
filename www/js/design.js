/* 설계: 가구·프레임·전광판을 치수(값)로 만들고 부재(판재·각재·파이프)와 재단표를 낸다. 화면은 design-ui.js, 그림은 design-draw.js.
   좌표(mm): X 폭(왼쪽→오른쪽), Y 깊이(앞 0 → 뒤), Z 높이(바닥 0 → 위)
   부재: 상자 { s:'box', n(이름), m(자재), role, x, y, z, w(X 길이), d(Y 길이), h(Z 길이), axis(막대의 길이 방향) }
         비스듬한 막대 { s:'bar', n, m, role:'bar', a:[x,y,z], b:[x,y,z] } — 단면은 자재의 sw×sh
   설계물(도면 요소 type 'design'): { kind, name, p(값), parts(직접 넣은 부재) } */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const r1 = (v) => Math.round(v * 10) / 10;
  const SHEET_W = 2440, SHEET_H = 1220, KERF = 3;

  /* ── 자재 ── */
  const SHEETS = [
    { id: 'ply18', name: '합판 18T', t: 18, color: '#d8b98a', dens: 600 },
    { id: 'ply15', name: '합판 15T', t: 15, color: '#d8b98a', dens: 600 },
    { id: 'ply12', name: '합판 12T', t: 12, color: '#d8b98a', dens: 600 },
    { id: 'ply9', name: '합판 9T', t: 9, color: '#dcc095', dens: 600 },
    { id: 'ply5', name: '합판 4.8T', t: 4.8, color: '#e0c79e', dens: 600 },
    { id: 'mdf18', name: 'MDF 18T', t: 18, color: '#c7a97f', dens: 720 },
    { id: 'mdf9', name: 'MDF 9T', t: 9, color: '#c7a97f', dens: 720 },
    { id: 'pb18', name: 'PB 18T', t: 18, color: '#cdbb97', dens: 650 },
    { id: 'lpm18', name: 'LPM 18T (화이트)', t: 18, color: '#f2f1ec', dens: 680 },
    { id: 'lpm15', name: 'LPM 15T (화이트)', t: 15, color: '#f2f1ec', dens: 680 },
    { id: 'acryl5', name: '아크릴 5T', t: 5, color: '#dcecf5', dens: 1190, alpha: 0.45 },
    { id: 'pvc5', name: '포맥스 5T', t: 5, color: '#f5f5f3', dens: 550 },
  ];
  const r2 = (v) => Math.round(v * 100) / 100;
  const steel = (sw, sh, t) => r2((sw * sh - (sw - 2 * t) * (sh - 2 * t)) * 7.85e-3 * 0.97); // kg/m (모서리 둥글림 어림)
  const BARS = [
    { id: 'sq30', name: '각파이프 30×30×1.6T', sw: 30, sh: 30, t: 1.6, metal: true, stock: 6000, color: '#8d949c' },
    { id: 'sq40', name: '각파이프 40×40×2.0T', sw: 40, sh: 40, t: 2.0, metal: true, stock: 6000, color: '#8d949c' },
    { id: 'sq50', name: '각파이프 50×50×2.3T', sw: 50, sh: 50, t: 2.3, metal: true, stock: 6000, color: '#8d949c' },
    { id: 'sq75', name: '각파이프 75×75×3.2T', sw: 75, sh: 75, t: 3.2, metal: true, stock: 6000, color: '#8d949c' },
    { id: 'sq100', name: '각파이프 100×100×3.2T', sw: 100, sh: 100, t: 3.2, metal: true, stock: 6000, color: '#8d949c' },
    { id: 'rc100', name: '각파이프 100×50×2.3T', sw: 50, sh: 100, t: 2.3, metal: true, stock: 6000, color: '#8d949c' },
    { id: 'pipe48', name: '원형 파이프 Ø48.6×2.3T (비계)', sw: 48.6, sh: 48.6, t: 2.3, metal: true, round: true, stock: 6000, color: '#9aa1a8' },
    { id: 'al30', name: '알루미늄 프로파일 30×30', sw: 30, sh: 30, kgm: 0.9, metal: true, stock: 6000, color: '#c3c8cd' },
    { id: 'al40', name: '알루미늄 프로파일 40×40', sw: 40, sh: 40, kgm: 1.6, metal: true, stock: 6000, color: '#c3c8cd' },
    { id: 'wood30', name: '각재 30×30', sw: 30, sh: 30, dens: 500, stock: 3600, color: '#c9a36b' },
    { id: 'wood45', name: '각재 45×45', sw: 45, sh: 45, dens: 500, stock: 3600, color: '#c9a36b' },
    { id: 'wood2x4', name: '구조목 38×89 (투바이포)', sw: 38, sh: 89, dens: 480, stock: 3600, color: '#d1ad78' },
    { id: 'rod25', name: '옷걸이 봉 Ø25', sw: 25, sh: 25, kgm: 0.6, metal: true, round: true, stock: 3000, color: '#b9bec4' },
  ];
  BARS.forEach((b) => {
    if (b.kgm == null) b.kgm = b.t ? (b.round ? r2(Math.PI * (b.sw - b.t) * b.t * 7.85e-3) : steel(b.sw, b.sh, b.t)) : r2(((b.sw * b.sh) / 1e6) * b.dens);
  });
  const LED = { id: 'led', name: 'LED 캐비닛', color: '#12161c' };
  const sheet = (id) => SHEETS.find((s) => s.id === id) || SHEETS[0];
  const bar = (id) => BARS.find((b) => b.id === id) || BARS[2];
  const mat = (id) => SHEETS.find((s) => s.id === id) || BARS.find((b) => b.id === id) || (id === 'led' ? LED : null);

  /* ── 부재 만들기 도우미 ── */
  const box = (n, m, x, y, z, w, d, h, o = {}) => ({ s: 'box', n, m, role: 'panel', x: r1(x), y: r1(y), z: r1(z), w: r1(w), d: r1(d), h: r1(h), ...o });
  /** 축을 따라 놓인 막대 (각재·파이프): axis 방향 길이 len, 단면은 자재의 sw×sh. 자리는 가장 작은 구석 */
  function rail(n, m, axis, x, y, z, len, o = {}) {
    const b = bar(m), sw = b.sw, sh = b.sh;
    // 세로대(z): 단면 sw(X) × sh(Y) · 가로대(x): 단면 sh(Z) × sw(Y) · 깊이 방향(y): 단면 sw(X) × sh(Z)
    const dims = axis === 'z' ? [sw, sh, len] : axis === 'x' ? [len, sw, sh] : [sw, len, sh];
    return { s: 'box', n, m, role: 'bar', axis, x: r1(x), y: r1(y), z: r1(z), w: r1(dims[0]), d: r1(dims[1]), h: r1(dims[2]), ...o };
  }
  const brace = (n, m, a, b, o = {}) => ({ s: 'bar', n, m, role: 'bar', a: a.map(r1), b: b.map(r1), ...o });

  /* ── 종류별 만들기: p(값) → { parts, hw: [{ n, q }], info: [[이름, 값, 덧말]] } ── */
  const num = (v, def, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };
  const int = (v, def, lo, hi) => Math.round(num(v, def, lo, hi));

  function cabinet(p) {
    const W = num(p.W, 800, 200, 4000), H = num(p.H, 850, 200, 3000), D = num(p.D, 400, 150, 1200);
    const S = sheet(p.mat), t = S.t, back = p.back && p.back !== 'none' ? sheet(p.back) : null, tb = back ? back.t : 0;
    const doors = int(p.doors, 0, 0, 6), shelves = int(p.shelves, 1, 0, 12), dividers = int(p.dividers, 0, 0, 8);
    const plinth = num(p.plinth, 0, 0, 300);
    const td = doors ? t : 0, y0 = doors ? td + 2 : 0;            // 문짝이 있으면 몸통은 문 두께 + 2mm 뒤에서 시작
    const Dc = D - y0 - tb;                                        // 몸통 판의 깊이 (뒤판은 뒤에 덧댐)
    const parts = [], hw = [];
    if (Dc < 50 || W - 2 * t < 50 || H - plinth - 2 * t < 50) return { parts, hw, info: [['치수', '너무 작음', '폭·높이·깊이를 키워 주세요']] };
    parts.push(box('옆판', S.id, 0, y0, 0, t, Dc, H), box('옆판', S.id, W - t, y0, 0, t, Dc, H));
    parts.push(box('지판', S.id, t, y0, plinth, W - 2 * t, Dc, t), box('천판', S.id, t, y0, H - t, W - 2 * t, Dc, t));
    if (plinth >= 30) parts.push(box('걸레받이', S.id, t, y0 + 40, 0, W - 2 * t, t, plinth));
    if (back) parts.push(box('뒤판', back.id, 0, y0 + Dc, plinth, W, tb, H - plinth));
    const Wc = W - 2 * t, Hc = H - plinth - 2 * t, bw = (Wc - dividers * t) / (dividers + 1);
    for (let i = 0; i < dividers; i++) parts.push(box('칸막이', S.id, t + bw * (i + 1) + t * i, y0, plinth + t, t, Dc, Hc));
    const sd = Math.max(50, Dc - 20), gap = (Hc - shelves * t) / (shelves + 1);
    for (let b = 0; b <= dividers; b++) {
      for (let j = 0; j < shelves; j++) parts.push(box('선반', S.id, t + (bw + t) * b + 1, y0 + (Dc - sd), plinth + t + gap * (j + 1) + t * j, bw - 2, sd, t));
    }
    if (p.rod) parts.push(rail('옷걸이 봉', 'rod25', 'x', t, y0 + Dc / 2 - 12.5, H - t - 80 - 25, bw, { thin: true }));
    if (doors) {
      const g = 3, dw = (W - g * (doors + 1)) / doors, dh = H - plinth - 2 * g;
      for (let i = 0; i < doors; i++) parts.push(box('문짝', S.id, g + (dw + g) * i, 0, plinth + g, dw, td, dh, { door: true }));
      const per = dh <= 900 ? 2 : dh <= 1600 ? 3 : dh <= 2000 ? 4 : 5;
      hw.push({ n: '경첩 (싱크 경첩)', q: per * doors }, { n: '손잡이', q: doors });
    }
    if (shelves) hw.push({ n: '선반 다보', q: shelves * (dividers + 1) * 4 });
    if (p.rod) hw.push({ n: '봉 브래킷', q: 2 });
    return {
      parts, hw,
      info: [['안쪽 폭', `${r1(bw)} mm`, dividers ? `${dividers + 1}칸` : ''], ['선반 사이', shelves ? `${r1(gap)} mm` : '-', shelves ? `칸마다 ${shelves}장` : '선반 없음'], ['몸통 깊이', `${r1(Dc)} mm`, doors ? `문짝 ${td}T + 2 뺌` : '']],
    };
  }

  function table(p) {
    const W = num(p.W, 1200, 300, 4000), D = num(p.D, 600, 300, 2000), H = num(p.H, 720, 200, 1500);
    const T = sheet(p.top), tt = T.t, L = bar(p.leg), inset = num(p.inset, 30, 0, 300);
    const parts = [box('상판', T.id, 0, 0, H - tt, W, D, tt)];
    const lh = H - tt, x0 = inset, x1 = W - inset - L.sw, y0 = inset, y1 = D - inset - L.sh;
    if (x1 - x0 < L.sw || y1 - y0 < L.sh || lh < 60) return { parts, hw: [], info: [['치수', '너무 작음', '다리가 들어갈 자리가 없습니다']] };
    [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].forEach(([x, y]) => parts.push(rail('다리', L.id, 'z', x, y, 0, lh)));
    const lx = x1 - x0 - L.sw, ly = y1 - y0 - L.sh;
    if (p.apron !== false) {
      const z = lh - L.sh;
      parts.push(rail('가로대 (앞·뒤)', L.id, 'x', x0 + L.sw, y0 + (L.sh - L.sw) / 2, z, lx), rail('가로대 (앞·뒤)', L.id, 'x', x0 + L.sw, y1 + (L.sh - L.sw) / 2, z, lx));
      parts.push(rail('가로대 (옆)', L.id, 'y', x0, y0 + L.sh, z, ly), rail('가로대 (옆)', L.id, 'y', x1, y0 + L.sh, z, ly));
    }
    if (p.stretcher) {
      const z = Math.min(150, lh / 3);
      parts.push(rail('아래 가로대 (옆)', L.id, 'y', x0, y0 + L.sh, z, ly), rail('아래 가로대 (옆)', L.id, 'y', x1, y0 + L.sh, z, ly));
      parts.push(rail('아래 가로대 (가운데)', L.id, 'x', x0 + L.sw, (D - L.sw) / 2, z, lx));
    }
    const hw = [{ n: L.metal ? '상판 고정 브래킷' : '상판 고정 철물 (8자 철물)', q: 6 }, { n: L.metal ? '다리 캡 (바닥)' : '다리 굽 (펠트)', q: 4 }];
    return { parts, hw, info: [['다리 길이', `${r1(lh)} mm`, `${L.name}`], ['다리 사이', `${r1(lx)} × ${r1(ly)} mm`, '안쪽 치수']] };
  }

  function shelf(p) {
    const W = num(p.W, 1200, 300, 4000), D = num(p.D, 450, 200, 1500), H = num(p.H, 1800, 300, 3500);
    const levels = int(p.levels, 4, 2, 12), P = bar(p.post), Bd = sheet(p.board), low = num(p.low, 100, 0, 600);
    const parts = [];
    const xs = [0, W - P.sw], ys = [0, D - P.sh];
    xs.forEach((x) => ys.forEach((y) => parts.push(rail('기둥', P.id, 'z', x, y, 0, H))));
    const lx = W - 2 * P.sw, ly = D - 2 * P.sh;
    if (lx < 50 || ly < 50) return { parts, hw: [], info: [['치수', '너무 작음', '']] };
    const step = (H - low - P.sh - Bd.t) / (levels - 1);
    for (let i = 0; i < levels; i++) {
      const z = low + step * i;
      ys.forEach((y) => parts.push(rail('가로대 (앞·뒤)', P.id, 'x', P.sw, y + (P.sh - P.sw) / 2, z, lx)));
      xs.forEach((x) => parts.push(rail('가로대 (옆)', P.id, 'y', x, P.sh, z, ly)));
      parts.push(box('선반 판', Bd.id, P.sw, 0, z + P.sh, lx, D, Bd.t));
    }
    return { parts, hw: [{ n: P.metal ? '기둥 캡·조절발' : '조절발', q: 4 }], info: [['단 사이', `${r1(step - P.sh - Bd.t)} mm`, `${levels}단 · 판 위에서 다음 가로대 아래까지`], ['선반 판', `${r1(lx)} × ${r1(D)} mm`, '기둥 사이']] };
  }

  function counter(p) {
    const W = num(p.W, 1800, 600, 5000), D = num(p.D, 600, 300, 1200), H = num(p.H, 1050, 600, 1400);
    const S = sheet(p.mat), t = S.t, wh = num(p.work, 720, 400, H - 100), topD = num(p.topD, 300, 100, D);
    const parts = [
      box('앞판', S.id, 0, 0, 0, W, t, H - t),
      box('옆판', S.id, 0, t, 0, t, D - t, H - t), box('옆판', S.id, W - t, t, 0, t, D - t, H - t),
      box('윗판 (손님 쪽)', S.id, 0, 0, H - t, W, topD, t),
      box('작업대', S.id, t, t, wh - t, W - 2 * t, D - t, t),
    ];
    if (p.shelf !== false) parts.push(box('아래 선반', S.id, t, t, 300, W - 2 * t, Math.max(100, D - t - 60), t));
    // 가운데 받침 (폭이 넓으면): 작업대 아래 칸막이
    const mids = Math.max(0, Math.ceil((W - 2 * t) / 1200) - 1), bw = (W - 2 * t - mids * t) / (mids + 1);
    for (let i = 0; i < mids; i++) parts.push(box('칸막이', S.id, t + bw * (i + 1) + t * i, t, 0, t, D - t, wh - t));
    return { parts, hw: [{ n: '조절발', q: 4 + mids * 2 }], info: [['작업대 높이', `${r1(wh)} mm`, '앉아서 쓰는 높이'], ['손님 쪽 윗판', `${r1(W)} × ${r1(topD)} mm`, `높이 ${r1(H)}`]] };
  }

  /** 세로대 자리: 양 끝 + 사이 간격이 max를 넘지 않게 고르게. 돌려주는 값: 왼쪽 면 x들 */
  function spaced(total, s, max) {
    const n = Math.max(1, Math.ceil((total - s) / Math.max(100, max)));
    return Array.from({ length: n + 1 }, (_, i) => ((total - s) / n) * i);
  }
  /** 평면 틀(각파이프): 폭 W × 높이 H, 앞면이 y = y0. 세로대는 통으로, 가로대는 세로대 사이 토막 */
  function planeFrame(parts, P, W, H, y0, z0, xs, zs, names = ['세로대', '가로대']) {
    xs.forEach((x) => parts.push(rail(names[0], P.id, 'z', x, y0, z0, H)));
    for (let i = 0; i + 1 < xs.length; i++) {
      const len = xs[i + 1] - xs[i] - P.sw;
      if (len > 5) zs.forEach((z) => parts.push(rail(names[1], P.id, 'x', xs[i] + P.sw, y0 + (P.sh - P.sw) / 2, z0 + z, len)));
    }
  }
  /** 뒤로 뻗는 받침과 버팀대 (세로대마다): 받침은 바닥에, 버팀대는 받침 끝에서 세로대의 hb 높이로 */
  function supports(parts, P, xs, y0, footL, hb, o = {}) {
    xs.forEach((x) => {
      parts.push(rail('받침 (뒤로)', P.id, 'y', x, y0 + P.sh, 0, footL));
      if (o.front > 0) parts.push(rail('받침 (앞으로)', P.id, 'y', x, y0 - o.front, 0, o.front));
      if (hb > 0) parts.push(brace('버팀대', P.id, [x + P.sw / 2, y0 + P.sh + footL - P.sh / 2, P.sh], [x + P.sw / 2, y0 + P.sh, hb]));
    });
  }

  function frame(p) {
    const W = num(p.W, 3000, 300, 30000), H = num(p.H, 2400, 300, 8000), P = bar(p.pipe);
    const xs = spaced(W, P.sw, num(p.vmax, 1000, 200, 3000));
    const nz = Math.max(1, Math.ceil((H - P.sh) / num(p.hmax, 1200, 200, 3000)));
    const zs = Array.from({ length: nz + 1 }, (_, i) => ((H - P.sh) / nz) * i);
    const parts = [];
    planeFrame(parts, P, W, H, 0, 0, xs, zs);
    const feet = p.feet || 'brace', footL = num(p.footL, Math.max(600, Math.round((H * 0.35) / 50) * 50), 200, 4000);
    // 받침: 세로대마다 (세로대가 촘촘하면 0.9m쯤마다 하나씩, 양 끝은 늘)
    const stepN = xs.length > 1 ? Math.max(1, Math.ceil(900 / (xs[1] - xs[0]))) : 1;
    const every = xs.filter((_, i) => i % stepN === 0 || i === xs.length - 1);
    if (feet === 'brace') supports(parts, P, every, 0, footL, Math.min(H * 0.6, footL * 1.6));
    else if (feet === 'T') supports(parts, P, every, 0, footL / 2, 0, { front: footL / 2 });
    const hw = [];
    if (p.cover && p.cover !== 'none') {
      const C = sheet(p.cover), cols = Math.ceil(W / SHEET_H), rows = Math.ceil(H / SHEET_W), cw = W / cols, ch = H / rows;
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) parts.push(box('앞판', C.id, cw * i, -C.t, ch * j, cw, C.t, ch));
      hw.push({ n: '피스 (앞판 고정)', q: Math.ceil(((W * H) / 1e6) * 12) });
    }
    if (feet !== 'none') hw.push({ n: '모래주머니·추 (받침마다)', q: every.length });
    const info = [['세로대 간격', `${r1(xs.length > 1 ? xs[1] - xs[0] : 0)} mm`, `${xs.length}개 · 가운데에서 가운데`], ['가로대 간격', `${r1(zs.length > 1 ? zs[1] - zs[0] : 0)} mm`, `${zs.length}줄`]];
    if (feet !== 'none') info.push(['받침', `${r1(footL)} mm`, `${every.length}곳 · ${feet === 'brace' ? '뒤 버팀대' : '앞뒤 T자'}`]);
    return { parts, hw, info };
  }

  /* 전광판: 캐비닛 규격과 무게·전력 (렌탈용 다이캐스팅 기준 어림 — 제품마다 다르니 사양서로 확인) */
  const LED_CABS = [
    { id: '500x500', name: '500 × 500', w: 500, h: 500, kg: 7.5, depth: 80 },
    { id: '500x1000', name: '500 × 1000', w: 500, h: 1000, kg: 13, depth: 80 },
    { id: '640x480', name: '640 × 480 (실내 고정)', w: 640, h: 480, kg: 6.5, depth: 70 },
    { id: '960x960', name: '960 × 960 (실외 철제)', w: 960, h: 960, kg: 42, depth: 160 },
  ];
  const LED_PITCH = [1.95, 2.6, 2.97, 3.91, 4.81, 5.95, 10];
  function led(p) {
    const cab = LED_CABS.find((c) => c.id === p.cab) || LED_CABS[0];
    const cols = int(p.cols, 6, 1, 60), rows = int(p.rows, 4, 1, 30), pitch = num(p.pitch, 3.91, 0.9, 25);
    const W = cab.w * cols, H = cab.h * rows, bottom = num(p.bottom, 500, 0, 6000), dc = cab.depth;
    const kgEach = num(p.cabKg, cab.kg, 1, 200), wm2 = num(p.wm2, 650, 100, 1500);
    const parts = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) parts.push({ s: 'box', n: 'LED 캐비닛', m: 'led', role: 'led', x: cab.w * c, y: 0, z: bottom + cab.h * r, w: cab.w, d: dc, h: cab.h });
    const support = p.support || 'ground', P = bar(p.pipe);
    const top = bottom + H;
    let every = [], footL = 0, hb = 0;
    if (support !== 'none') {
      // 세로대: 캐비닛 이음매에 맞춰 1m를 넘지 않게. 가로대: 캐비닛 줄 이음매마다
      const k = Math.max(1, Math.floor(1000 / cab.w)), xs = [];
      for (let c = 0; c <= cols; c += k) xs.push(Math.min(W - P.sw, Math.max(0, cab.w * c - (c === 0 ? 0 : c >= cols ? P.sw : P.sw / 2))));
      if (xs[xs.length - 1] < W - P.sw - 1) xs.push(W - P.sw);
      const zs = [];
      const kr = Math.max(1, Math.round(1000 / cab.h));
      for (let r = 0; r <= rows; r += kr) zs.push(Math.min(H - P.sh, cab.h * r));
      if (zs[zs.length - 1] < H - P.sh - 1) zs.push(H - P.sh);
      if (support === 'ground') {
        // 바닥까지 내려오는 세로대 + 화면 높이의 가로대, 받침과 버팀대
        xs.forEach((x) => parts.push(rail('세로대', P.id, 'z', x, dc, 0, top)));
        for (let i = 0; i + 1 < xs.length; i++) {
          const len = xs[i + 1] - xs[i] - P.sw;
          if (len > 5) { zs.forEach((z) => parts.push(rail('가로대', P.id, 'x', xs[i] + P.sw, dc + (P.sh - P.sw) / 2, bottom + z, len))); if (bottom > P.sh * 3) parts.push(rail('가로대 (아래)', P.id, 'x', xs[i] + P.sw, dc + (P.sh - P.sw) / 2, 0, len)); }
        }
        footL = num(p.footL, Math.max(800, Math.round((top * 0.45) / 50) * 50), 300, 6000);
        hb = Math.min(top * 0.65, footL * 1.7);
        every = xs;
        supports(parts, P, every, dc, footL, hb, { front: num(p.toe, 300, 0, 2000) });
      } else {
        planeFrame(parts, P, W, H, dc, bottom, xs, zs); // 벽에 붙이는 틀
        every = xs;
      }
    }
    const count = cols * rows, area = (W * H) / 1e6;
    const px = [Math.round(cab.w / pitch) * cols, Math.round(cab.h / pitch) * rows];
    const kgScreen = kgEach * count, maxW = area * wm2;
    const frameKg = weightOf(parts.filter((x) => x.role === 'bar'));
    const hw = [{ n: '캐비닛 연결 잠금·볼트 (제품 부속)', q: count * 4 }, { n: '전원 케이블 (연결)', q: count }, { n: '신호 케이블 (연결)', q: count }];
    if (support !== 'none') hw.push({ n: '캐비닛 고정 클램프·볼트', q: count * 2 });
    const circuits = Math.max(1, Math.ceil(maxW / (220 * 20 * 0.8)));
    const info = [
      ['화면 크기', `${W.toLocaleString('ko-KR')} × ${H.toLocaleString('ko-KR')} mm`, `${r1(area)}㎡ · 대각 ${Math.round(Math.hypot(W, H) / 25.4)}인치`],
      ['해상도', `${px[0].toLocaleString('ko-KR')} × ${px[1].toLocaleString('ko-KR')} px`, `P${pitch} · ${(px[0] * px[1]).toLocaleString('ko-KR')}화소`],
      ['캐비닛', `${count}개`, `${cols} × ${rows} · ${cab.name} mm`],
      ['무게', `약 ${Math.round(kgScreen + frameKg).toLocaleString('ko-KR')} kg`, `화면 ${Math.round(kgScreen)} + 틀 ${Math.round(frameKg)}`],
      ['전력', `최대 ${r1(maxW / 1000)} kW`, `평균 약 ${r1((maxW * 0.35) / 1000)} kW · 220V ${Math.ceil(maxW / 220)}A · 20A 회로 ${circuits}개 넘게`],
      ['보는 거리', `${r1(pitch)} m 넘게`, '피치(mm)만큼의 m가 가까운 한계 (어림)'],
    ];
    let ballast = null;
    if (support === 'ground') {
      // 바람(초속 10m 어림)이 뒤에서 밀 때 앞으로 넘어가지 않게 뒤 받침 끝에 올릴 추.
      // 바람 힘 = 0.6·v²·1.3·넓이(N), 안전율 1.5. 넘어가는 축은 앞 받침 끝, 화면·틀 무게는 틀 자리에 있다고 봄
      const v = num(p.wind, 10, 0, 30), F = 0.6 * v * v * 1.3 * area, M = F * ((bottom + H / 2) / 1000) * 1.5;
      const g = 9.81, total = kgScreen + frameKg, toe = num(p.toe, 300, 0, 2000);
      const arm = (toe + P.sh + footL) / 1000, own = total * g * (toe / 1000);
      ballast = Math.max(0, Math.ceil((M - own) / (g * arm) / 10) * 10);
      info.push(['고정 추 (어림)', ballast ? `뒤 받침 끝에 모두 약 ${ballast.toLocaleString('ko-KR')} kg` : '바람이 약하면 필요 없음', `초속 ${v}m 기준 · 받침 ${every.length}곳에 나눠 · 구조 검토는 전문가에게`]);
    }
    return { parts, hw, info, led: { W, H, cols, rows, count, px, area, kgScreen, frameKg, maxW, circuits, ballast, footL, cab } };
  }

  const KINDS = {
    cabinet: {
      label: '수납장·책장', make: cabinet,
      defaults: { W: 800, H: 850, D: 400, mat: 'ply18', back: 'ply5', shelves: 1, dividers: 0, doors: 2, plinth: 80, rod: false },
      presets: [
        ['하부장 (문 2짝)', { W: 800, H: 850, D: 550, shelves: 1, dividers: 0, doors: 2, plinth: 100 }],
        ['책장', { W: 800, H: 1800, D: 300, shelves: 4, dividers: 0, doors: 0, plinth: 60 }],
        ['옷장 (봉)', { W: 1000, H: 2100, D: 600, shelves: 1, dividers: 0, doors: 2, plinth: 80, rod: true }],
        ['TV장', { W: 1600, H: 450, D: 400, shelves: 0, dividers: 2, doors: 0, plinth: 0 }],
        ['신발장', { W: 900, H: 1200, D: 350, shelves: 5, dividers: 1, doors: 2, plinth: 80 }],
      ],
      fields: [
        { k: 'W', label: '폭', unit: 'mm' }, { k: 'H', label: '높이', unit: 'mm' }, { k: 'D', label: '깊이', unit: 'mm' },
        { k: 'mat', label: '판재', type: 'sheet', min: 12 }, { k: 'back', label: '뒤판', type: 'sheet', none: '없음', max: 9 },
        { k: 'shelves', label: '선반 (칸마다)', unit: '장', int: true }, { k: 'dividers', label: '세로 칸막이', unit: '개', int: true },
        { k: 'doors', label: '문짝', unit: '짝', int: true }, { k: 'plinth', label: '걸레받이 높이', unit: 'mm' },
        { k: 'rod', label: '옷걸이 봉', type: 'check' },
      ],
    },
    table: {
      label: '테이블·책상', make: table,
      defaults: { W: 1200, D: 600, H: 720, top: 'ply18', leg: 'sq40', inset: 30, apron: true, stretcher: false },
      presets: [
        ['책상 1200', { W: 1200, D: 600, H: 720, leg: 'sq40' }], ['식탁 1600', { W: 1600, D: 800, H: 740, leg: 'wood45', inset: 60 }],
        ['작업대 1800', { W: 1800, D: 750, H: 850, leg: 'sq50', stretcher: true }], ['소파 테이블', { W: 1000, D: 500, H: 400, leg: 'sq30' }],
      ],
      fields: [
        { k: 'W', label: '폭', unit: 'mm' }, { k: 'D', label: '깊이', unit: 'mm' }, { k: 'H', label: '높이', unit: 'mm' },
        { k: 'top', label: '상판', type: 'sheet', min: 12 }, { k: 'leg', label: '다리', type: 'bar' }, { k: 'inset', label: '다리 들여쓰기', unit: 'mm' },
        { k: 'apron', label: '위 가로대 (상판 밑 틀)', type: 'check' }, { k: 'stretcher', label: '아래 가로대', type: 'check' },
      ],
    },
    shelf: {
      label: '선반 (기둥 4개)', make: shelf,
      defaults: { W: 1200, D: 450, H: 1800, levels: 4, post: 'sq30', board: 'ply12', low: 100 },
      presets: [['철제 선반 4단', { W: 1200, D: 450, H: 1800, levels: 4 }], ['창고 선반 5단', { W: 1800, D: 600, H: 2100, levels: 5, post: 'sq40', board: 'ply15' }], ['진열대 3단', { W: 900, D: 400, H: 1200, levels: 3, post: 'wood30', board: 'ply12' }]],
      fields: [
        { k: 'W', label: '폭', unit: 'mm' }, { k: 'D', label: '깊이', unit: 'mm' }, { k: 'H', label: '높이', unit: 'mm' },
        { k: 'levels', label: '단 수', unit: '단', int: true }, { k: 'post', label: '기둥·가로대', type: 'bar' }, { k: 'board', label: '선반 판', type: 'sheet' },
        { k: 'low', label: '맨 아래 단 높이', unit: 'mm' },
      ],
    },
    counter: {
      label: '카운터·안내 데스크', make: counter,
      defaults: { W: 1800, D: 600, H: 1050, mat: 'lpm18', work: 720, topD: 300, shelf: true },
      presets: [['안내 데스크 1800', { W: 1800, D: 600, H: 1050 }], ['계산대 1200', { W: 1200, D: 550, H: 1000, topD: 250 }], ['등록 데스크 2400', { W: 2400, D: 700, H: 1050 }]],
      fields: [
        { k: 'W', label: '폭', unit: 'mm' }, { k: 'D', label: '깊이', unit: 'mm' }, { k: 'H', label: '높이', unit: 'mm' },
        { k: 'mat', label: '판재', type: 'sheet', min: 12 }, { k: 'work', label: '작업대 높이', unit: 'mm' }, { k: 'topD', label: '윗판 깊이', unit: 'mm' },
        { k: 'shelf', label: '아래 선반', type: 'check' },
      ],
    },
    frame: {
      label: '각파이프 틀 (가벽·포토월)', make: frame,
      defaults: { W: 3000, H: 2400, pipe: 'sq50', vmax: 1000, hmax: 1200, feet: 'brace', footL: 800, cover: 'none' },
      presets: [['포토월 3 × 2.4m', { W: 3000, H: 2400 }], ['현수막 틀 5 × 3m', { W: 5000, H: 3000, footL: 1100 }], ['가벽 2.4 × 2.4m (합판)', { W: 2440, H: 2440, pipe: 'sq40', cover: 'ply9', vmax: 610 }], ['안내판 틀 1.2 × 1.8m', { W: 1200, H: 1800, pipe: 'sq30', feet: 'T', footL: 600 }]],
      fields: [
        { k: 'W', label: '폭', unit: 'mm' }, { k: 'H', label: '높이', unit: 'mm' }, { k: 'pipe', label: '파이프', type: 'bar' },
        { k: 'vmax', label: '세로대 간격 (넘지 않게)', unit: 'mm' }, { k: 'hmax', label: '가로대 간격 (넘지 않게)', unit: 'mm' },
        { k: 'feet', label: '받침', type: 'select', options: [['brace', '뒤 버팀대'], ['T', '앞뒤 T자'], ['none', '없음 (벽·바닥에 고정)']] },
        { k: 'footL', label: '받침 길이', unit: 'mm' }, { k: 'cover', label: '앞판', type: 'sheet', none: '없음 (천·현수막)' },
      ],
    },
    led: {
      label: '전광판 (LED) + 틀', make: led,
      defaults: { cab: '500x500', cols: 6, rows: 4, pitch: 3.91, bottom: 500, support: 'ground', pipe: 'sq50', footL: 1100, toe: 300, wm2: 650, wind: 10 },
      presets: [
        ['3 × 2 m (500각 6×4)', { cab: '500x500', cols: 6, rows: 4, bottom: 500, footL: 1100 }], ['4 × 2.5 m (500각 8×5)', { cab: '500x500', cols: 8, rows: 5, bottom: 800, footL: 1500 }],
        ['6 × 3 m (500×1000 12×3)', { cab: '500x1000', cols: 12, rows: 3, bottom: 1000, footL: 1800, pipe: 'sq75' }], ['벽부 2 × 1.5 m (실내)', { cab: '500x500', cols: 4, rows: 3, bottom: 1200, support: 'wall', pipe: 'sq40', pitch: 2.6 }],
      ],
      fields: [
        { k: 'cab', label: '캐비닛 규격', type: 'select', options: LED_CABS.map((c) => [c.id, c.name]) },
        { k: 'cols', label: '가로 개수', unit: '개', int: true }, { k: 'rows', label: '세로 개수', unit: '개', int: true },
        { k: 'pitch', label: '피치 (P)', type: 'select', options: LED_PITCH.map((v) => [v, `P${v}`]), num: true },
        { k: 'bottom', label: '바닥에서 화면 아래까지', unit: 'mm' },
        { k: 'support', label: '세우는 방식', type: 'select', options: [['ground', '바닥 지지 틀 (뒤 버팀대)'], ['wall', '벽에 붙이는 틀'], ['none', '화면만 (트러스에 매달기)']] },
        { k: 'pipe', label: '틀 파이프', type: 'bar' }, { k: 'footL', label: '뒤 받침 길이', unit: 'mm' }, { k: 'toe', label: '앞 받침 길이', unit: 'mm' },
        { k: 'wm2', label: '최대 소비 전력', type: 'select', options: [[450, '실내 저전력 450 W/㎡'], [650, '실내 650 W/㎡'], [850, '실외 850 W/㎡']], num: true },
        { k: 'cabKg', label: '캐비닛 1개 무게 (비우면 규격값)', unit: 'kg', optional: true },
      ],
    },
    free: { label: '자유 설계 (부재를 하나씩)', make: () => ({ parts: [], hw: [], info: [] }), defaults: {}, presets: [], fields: [] },
    model: { label: '내려받은 3D 모델 보기', make: () => ({ parts: [], hw: [], info: [] }), defaults: {}, presets: [], fields: [] },
  };

  /* ── 설계물 ── */
  const newId = () => `dsg-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  function create(kind, preset = null, name = '') {
    const K = KINDS[kind] || KINDS.free;
    return { id: newId(), type: 'design', layer: 'design', room: null, memo: '', createdAt: new Date().toISOString(), kind: KINDS[kind] ? kind : 'free', name: name || K.label.replace(/\s*\(.*$/, ''), p: { ...K.defaults, ...(preset || {}) }, parts: [] };
  }
  /** 직접 넣은 부재를 깨끗하게 (저장된 데이터가 깨져 있어도 안전하게) */
  function cleanPart(q, i) {
    if (!q || typeof q !== 'object') return null;
    const f = (v) => (Number.isFinite(+v) ? r1(+v) : 0);
    const m = mat(q.m) ? q.m : 'ply18', n = String(q.n || '부재').slice(0, 30), id = typeof q.id === 'string' ? q.id : `u${i}`;
    if (q.s === 'bar' && Array.isArray(q.a) && Array.isArray(q.b)) {
      const M = BARS.find((b) => b.id === m) ? m : 'sq50';
      return { id, s: 'bar', n, m: M, role: 'bar', a: q.a.slice(0, 3).map(f), b: q.b.slice(0, 3).map(f), user: true };
    }
    const w = Math.max(1, f(q.w)), d = Math.max(1, f(q.d)), h = Math.max(1, f(q.h));
    const isBar = !!BARS.find((b) => b.id === m);
    return { id, s: 'box', n, m, role: isBar ? 'bar' : 'panel', ...(isBar ? { axis: w >= d && w >= h ? 'x' : d >= h ? 'y' : 'z' } : {}), x: f(q.x), y: f(q.y), z: f(q.z), w, d, h, user: true };
  }
  const cache = new WeakMap(); // 설계물 → { key, out }
  /** 설계물의 부재 전체(값으로 만든 것 + 직접 넣은 것)와 크기. 돌려주는 값: { parts, hw, info, size: { w, d, h }, min: [x, y, z] } */
  function build(el) {
    const key = JSON.stringify([el.kind, el.p, el.parts]);
    const hit = cache.get(el);
    if (hit && hit.key === key) return hit.out;
    const K = KINDS[el.kind] || KINDS.free;
    let made;
    try { made = K.make(el.p || {}); } catch (e) { made = { parts: [], hw: [], info: [['오류', '값을 확인해 주세요', String(e && e.message)]] }; }
    const parts = made.parts.map((q, i) => ({ id: `g${i}`, ...q }));
    (Array.isArray(el.parts) ? el.parts : []).forEach((q, i) => { const c = cleanPart(q, i); if (c) parts.push(c); });
    const b = bounds(parts);
    const out = { ...made, parts, size: { w: r1(b.max[0] - b.min[0]), d: r1(b.max[1] - b.min[1]), h: r1(b.max[2] - b.min[2]) }, min: b.min, max: b.max };
    cache.set(el, { key, out });
    return out;
  }
  /** 부재 하나의 여덟 구석 (비스듬한 막대는 a→b를 따라 단면을 세움) */
  function corners(q) {
    if (q.s !== 'bar') {
      const { x, y, z, w, d, h } = q;
      return [[x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z], [x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]];
    }
    const B = bar(q.m), a = q.a, b = q.b;
    let ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const L = Math.hypot(ux, uy, uz) || 1;
    ux /= L; uy /= L; uz /= L;
    // 단면의 한 축은 X(막대가 X와 나란하면 Y), 다른 축은 그 둘과 직각
    let px = Math.abs(ux) > 0.9 ? [0, 1, 0] : [1, 0, 0];
    const dot = px[0] * ux + px[1] * uy + px[2] * uz;
    px = [px[0] - dot * ux, px[1] - dot * uy, px[2] - dot * uz];
    const pl = Math.hypot(px[0], px[1], px[2]) || 1;
    px = px.map((v) => v / pl);
    const py = [uy * px[2] - uz * px[1], uz * px[0] - ux * px[2], ux * px[1] - uy * px[0]];
    const hw = B.sw / 2, hh = B.sh / 2, out = [];
    [a, b].forEach((c) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([i, j]) => out.push([c[0] + px[0] * hw * i + py[0] * hh * j, c[1] + px[1] * hw * i + py[1] * hh * j, c[2] + px[2] * hw * i + py[2] * hh * j])));
    return out;
  }
  function bounds(parts) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    parts.forEach((q) => corners(q).forEach((c) => { for (let k = 0; k < 3; k++) { if (c[k] < min[k]) min[k] = c[k]; if (c[k] > max[k]) max[k] = c[k]; } }));
    if (min[0] === Infinity) return { min: [0, 0, 0], max: [0, 0, 0] };
    return { min, max };
  }

  /* ── 재단표 ── */
  const lenOf = (q) => (q.s === 'bar' ? Math.hypot(q.b[0] - q.a[0], q.b[1] - q.a[1], q.b[2] - q.a[2]) : q.axis === 'x' ? q.w : q.axis === 'y' ? q.d : q.axis === 'z' ? q.h : Math.max(q.w, q.d, q.h));
  function weightOf(parts) {
    let kg = 0;
    parts.forEach((q) => {
      if (q.role === 'bar') kg += (lenOf(q) / 1000) * bar(q.m).kgm;
      else if (q.role === 'panel') kg += ((q.w * q.d * q.h) / 1e9) * sheet(q.m).dens;
    });
    return kg;
  }
  /** 막대 자르기: 긴 것부터 원자재(stock)에 넣음 (톱날 kerf). 원자재보다 긴 것은 이어 써야 함. 돌려주는 값: { bars: [[길이…]], waste(mm), joined(이어야 하는 개수) } */
  function nest1d(lengths, stock, kerf = KERF) {
    const bars = [], left = [];
    let joined = 0;
    lengths.slice().sort((a, b) => b - a).forEach((raw) => {
      let len = raw;
      if (len > stock) { joined++; while (len > stock) { bars.push([stock]); left.push(0); len -= stock; } }
      if (len <= 0) return;
      let i = left.findIndex((v) => v >= len);
      if (i < 0) { bars.push([]); left.push(stock); i = bars.length - 1; }
      bars[i].push(r1(len));
      left[i] -= len + kerf;
    });
    return { bars, waste: Math.round(left.reduce((t, v) => t + Math.max(0, v), 0)), joined };
  }
  /** 판 자르기(어림): 높은 것부터 줄을 지어 원장(2440×1220)에 놓음 — 돌려 놓기 허용, 결 방향은 보지 않음.
      pieces: [{ l, w, n(이름) }] → [{ rects: [{ x, y, w, h, n }] }] (원장마다) */
  function nest2d(pieces, SW = SHEET_W, SH = SHEET_H, kerf = KERF) {
    const list = pieces.map((p) => ({ n: p.n, a: Math.max(p.l, p.w), b: Math.min(p.l, p.w) })).sort((p, q) => q.b - p.b || q.a - p.a);
    const sheets = [];
    const open = () => { const s = { rects: [], rows: [], used: 0 }; sheets.push(s); return s; };
    list.forEach((p) => {
      // 놓을 방향: 긴 변을 가로로 (원장에 안 들어가면 세로로). 원장보다 큰 판은 통째로 한 장을 차지한 것으로 셈
      const fitsFlat = p.a <= SW && p.b <= SH, fitsUp = p.b <= SW && p.a <= SH;
      const w = fitsFlat || !fitsUp ? p.a : p.b, h = fitsFlat || !fitsUp ? p.b : p.a;
      if (!fitsFlat && !fitsUp) { const s = open(); s.rects.push({ x: 0, y: 0, w: Math.min(w, SW), h: Math.min(h, SH), n: p.n, over: true }); s.rows.push({ y: 0, h: SH, x: SW }); s.used = SH; return; }
      for (const s of sheets) {
        const row = s.rows.find((r) => r.h >= h && SW - r.x >= w);
        if (row) { s.rects.push({ x: row.x, y: row.y, w, h, n: p.n }); row.x += w + kerf; return; }
        if (SH - s.used >= h) { s.rows.push({ y: s.used, h, x: w + kerf }); s.rects.push({ x: 0, y: s.used, w, h, n: p.n }); s.used += h + kerf; return; }
      }
      const s = open();
      s.rows.push({ y: 0, h, x: w + kerf });
      s.rects.push({ x: 0, y: 0, w, h, n: p.n });
      s.used = h + kerf;
    });
    return sheets.map((s) => ({ rects: s.rects }));
  }
  /** 재단표: 판재(자재·크기별), 막대(자재·길이별), 전광판, 철물, 무게 */
  function bom(el) {
    const B = build(el);
    const panels = new Map(), bars = new Map();
    let leds = 0;
    B.parts.forEach((q) => {
      if (q.role === 'led') { leds++; return; }
      if (q.role === 'panel') {
        const S = sheet(q.m), dims = [q.w, q.d, q.h].sort((a, b) => b - a), key = `${S.id}|${dims[0]}|${dims[1]}|${q.n}`;
        const cur = panels.get(key) || { m: S.id, mat: S.name, n: q.n, l: dims[0], w: dims[1], t: dims[2], q: 0 };
        cur.q++;
        panels.set(key, cur);
      } else if (q.role === 'bar') {
        const M = bar(q.m), len = r1(lenOf(q)), key = `${M.id}|${len}|${q.n}|${q.s === 'bar' ? 'x' : ''}`;
        const cur = bars.get(key) || { m: M.id, mat: M.name, n: q.n, len, q: 0, slant: q.s === 'bar' };
        cur.q++;
        bars.set(key, cur);
      }
    });
    const panelRows = [...panels.values()].sort((a, b) => a.mat.localeCompare(b.mat, 'ko') || b.l * b.w - a.l * a.w);
    const barRows = [...bars.values()].sort((a, b) => a.mat.localeCompare(b.mat, 'ko') || b.len - a.len);
    const sheets = [], stocks = [];
    [...new Set(panelRows.map((r) => r.m))].forEach((m) => {
      const rows = panelRows.filter((r) => r.m === m), S = sheet(m);
      const pieces = rows.flatMap((r) => Array.from({ length: r.q }, () => ({ l: r.l, w: r.w, n: r.n })));
      const layout = nest2d(pieces);
      const area = rows.reduce((t, r) => t + (r.l * r.w * r.q) / 1e6, 0);
      sheets.push({ m, mat: S.name, count: layout.length, area: r1(area * 100) / 100, layout, kg: r1(rows.reduce((t, r) => t + ((r.l * r.w * r.t * r.q) / 1e9) * S.dens, 0)) });
    });
    [...new Set(barRows.map((r) => r.m))].forEach((m) => {
      const rows = barRows.filter((r) => r.m === m), M = bar(m);
      const cut = nest1d(rows.flatMap((r) => Array.from({ length: r.q }, () => r.len)), M.stock);
      const total = rows.reduce((t, r) => t + r.len * r.q, 0);
      stocks.push({ m, mat: M.name, stock: M.stock, count: cut.bars.length, total: Math.round(total), waste: cut.waste, joined: cut.joined, layout: cut.bars, kg: r1((total / 1000) * M.kgm), kgm: M.kgm });
    });
    const kg = sheets.reduce((t, s) => t + s.kg, 0) + stocks.reduce((t, s) => t + s.kg, 0) + (B.led ? B.led.kgScreen : 0);
    return { panels: panelRows, bars: barRows, sheets, stocks, leds, led: B.led || null, hw: B.hw || [], kg: r1(kg), size: B.size };
  }
  /** 재단표를 표(CSV·PDF용 줄)로 */
  function bomRows(el) {
    const b = bom(el), rows = [['구분', '자재', '이름', '길이(mm)', '폭(mm)', '두께(mm)', '수량', '비고']];
    b.panels.forEach((r) => rows.push(['판재', r.mat, r.n, r.l, r.w, r.t, r.q, '']));
    b.sheets.forEach((s) => rows.push(['판재 합계', s.mat, '원장 1220×2440', '', '', '', s.count, `넓이 ${s.area}㎡ · 약 ${s.kg}kg · 톱날 ${KERF}mm 어림`]));
    b.bars.forEach((r) => rows.push(['각재·파이프', r.mat, r.n, r.len, '', '', r.q, r.slant ? '비스듬히 (끝을 각도에 맞춰 자름)' : '']));
    b.stocks.forEach((s) => rows.push(['각재·파이프 합계', s.mat, `원자재 ${s.stock / 1000}m`, s.total, '', '', s.count, `자투리 ${s.waste}mm · 약 ${s.kg}kg${s.joined ? ` · 원자재보다 긴 것 ${s.joined}개 (이어야 함)` : ''}`]));
    if (b.led) rows.push(['전광판', 'LED 캐비닛', `${b.led.cab.name} mm`, b.led.cab.w, b.led.cab.h, b.led.cab.depth, b.led.count, `${b.led.cols}×${b.led.rows} · 약 ${Math.round(b.led.kgScreen)}kg · 최대 ${r1(b.led.maxW / 1000)}kW`]);
    b.hw.forEach((h) => rows.push(['철물·부속', '', h.n, '', '', '', h.q, '']));
    rows.push(['무게 합계', '', '', '', '', '', '', `약 ${b.kg}kg (철물 빼고)`]);
    return rows;
  }

  /* ── 3D 모형용 상자들 (위 +y, 앞 +z로 바꿈) ── */
  const hexRgb = (s) => { const v = parseInt(String(s).replace('#', ''), 16) || 0; return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]; };
  function toBoxes(parts, o = {}) {
    const b = bounds(parts), depth = b.max[1] + b.min[1];
    const MAT = (App.gl3d && App.gl3d.MAT) || {};
    const conv = (c) => [c[0], c[2], depth - c[1]]; // (x, y, z) → (x, 높이, 앞이 +)
    return parts.map((q) => {
      const M = mat(q.m) || SHEETS[0];
      const c = corners(q).map(conv);
      // 상자: corners 차례 [아래 4, 위 4] → meshio.fromBoxes 차례 [앞 아래 왼·오, 앞 위 오·왼, 뒤 아래 왼·오, 뒤 위 오·왼]
      // 비스듬한 막대: 끝면 b의 네 점이 ‘앞면’, 끝면 a의 네 점이 ‘뒷면’
      const k = q.s === 'bar' ? [c[4], c[5], c[6], c[7], c[0], c[1], c[2], c[3]] : [c[0], c[1], c[5], c[4], c[3], c[2], c[6], c[7]];
      const led2 = q.role === 'led';
      return {
        corners: k,
        color: o.pick && o.pick === q.id ? [0.95, 0.45, 0.1] : hexRgb(q.c || M.color), alpha: M.alpha, metal: !!M.metal,
        mat: led2 ? MAT.gloss : M.metal ? MAT.metal : q.role === 'panel' && !M.alpha ? MAT.grain : undefined, group: M.name,
      };
    });
  }
  /** 설계물을 3D 모형으로 (mm, 바닥 가운데가 원점). 부재가 없으면 null */
  function toModel(el, o = {}) {
    const B = build(el);
    if (!B.parts.length) return null;
    const boxes = toBoxes(B.parts, o);
    // 전광판 앞면: 화면이 켜진 것처럼 (캐비닛 앞에 얇은 판)
    if (B.led) {
      const MAT = (App.gl3d && App.gl3d.MAT) || {}, L = B.led, z0 = Math.min(...B.parts.filter((q) => q.role === 'led').map((q) => q.z));
      const b = bounds(B.parts), depth = b.max[1] + b.min[1];
      boxes.push({ min: [0, z0, depth + 1], max: [L.W, z0 + L.H, depth + 3], color: [0.16, 0.38, 0.78], mat: MAT.emissive, group: '화면' });
    }
    const model = App.meshio.place(App.meshio.fromBoxes(boxes), { scale: 1 });
    model.lift = Math.max(0, Math.round(B.min[2])); // 바닥에서 떠 있는 높이 (벽에 붙이는 틀·화면)
    return model;
  }

  App.design = {
    SHEETS, BARS, LED_CABS, LED_PITCH, KINDS, SHEET_W, SHEET_H, KERF,
    sheet, bar, mat, create, build, bom, bomRows, bounds, corners, lenOf, weightOf, nest1d, nest2d, toBoxes, toModel, cleanPart, box, rail, brace,
    /** 도면의 설계물들 (만든 차례) */
    all: () => (App.doc ? [...App.doc.all()].filter((e) => e.type === 'design') : []),
    /** 지금 보고 있는 설계물 */
    current() {
      const list = App.design.all();
      return list.find((e) => e.id === (App.current && App.current.designId)) || list[0] || null;
    },
  };
})();
