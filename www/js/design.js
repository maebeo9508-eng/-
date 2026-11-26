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
    { id: 'lpm18', name: 'LPM 18T', t: 18, color: '#f2f1ec', dens: 680 },
    { id: 'lpm15', name: 'LPM 15T', t: 15, color: '#f2f1ec', dens: 680 },
    { id: 'acryl5', name: '아크릴 5T', t: 5, color: '#dcecf5', dens: 1190, alpha: 0.45 },
    { id: 'pvc5', name: '포맥스 5T', t: 5, color: '#f5f5f3', dens: 550 },
    { id: 'gyp95', name: '석고보드 9.5T', t: 9.5, color: '#efeee9', dens: 700, sw: 1800, sh: 900 }, // 원장 900 × 1800
    { id: 'bend5', name: '휨합판 5T', t: 5, color: '#e2cba0', dens: 520, bend: true },                // 곡면(아치 안쪽)에 휘어 붙이는 합판
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
  /* LED 라인(스트립): 막대처럼 a→b 선분 부재. role 'lite', lt 종류·k 색온도·pf 프로파일·run 이어진 구간 (계산은 ledstrip.js) */
  const LITE = { id: 'ledline', name: 'LED 라인', color: '#ffcf7a', sw: 10, sh: 6 };
  const mat = (id) => SHEETS.find((s) => s.id === id) || BARS.find((b) => b.id === id) || (id === 'led' ? LED : id === 'ledline' ? LITE : null);
  const LS = () => App.ledstrip;
  /** LED 라인 부재들: 점들(절대 [x, y, z])을 잇는 선분마다 하나. sp: ledstrip.spec(p), run: 이어진 구간 이름 */
  function ledParts(pts, sp, run, n = 'LED 라인') {
    const out = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      if (Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1], pts[i + 1][2] - pts[i][2]) < 1) continue;
      out.push({ s: 'bar', n, m: 'ledline', role: 'lite', a: pts[i].map(r1), b: pts[i + 1].map(r1), lt: sp.type, k: sp.k, pf: sp.prof, run, c: sp.color });
    }
    return out;
  }

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

  /* ── 곡선 부재 (아치 벽·니치·아치문) ──
     poly: 앞에서 본 윤곽(다각형)을 Y로 d만큼 민 판. { s: 'poly', x, y, z, w, d, h, pts: [[u, v]…] } — 윤곽 점은 (x + u, z + v), 0 ≤ u ≤ w, 0 ≤ v ≤ h
     arc:  곡선을 따라 휘어 붙이는 띠(휨합판). { s: 'arc', x, y, z, w, d, h, t, pts } — pts는 곡선(열린 선), 띠는 곡선의 왼쪽(왼→오른쪽으로 갈 때 위·바깥)으로 두께 t
     둘 다 x·y·z·w·d·h(둘러싼 상자)를 가져서 옮기기·크기 계산·끌기는 상자와 같게 됨 */
  function norm2(pts) {
    let mx = Infinity, mz = Infinity, Mx = -Infinity, Mz = -Infinity;
    pts.forEach(([u, v]) => { if (u < mx) mx = u; if (v < mz) mz = v; if (u > Mx) Mx = u; if (v > Mz) Mz = v; });
    return { pts: pts.map(([u, v]) => [r1(u - mx), r1(v - mz)]), ox: mx, oz: mz, w: r1(Mx - mx), h: r1(Mz - mz) };
  }
  /** 윤곽 다각형(절대 [x, z])으로 판 하나: Y로 y부터 두께 d */
  function poly(n, m, P, y, d, o = {}) {
    const N = norm2(P);
    return { s: 'poly', n, m, role: 'panel', x: r1(N.ox), y: r1(y), z: r1(N.oz), w: Math.max(1, N.w), d: r1(d), h: Math.max(1, N.h), pts: N.pts, ...o };
  }
  /** 곡선(절대 [x, z])의 띠 다각형: 곡선 + 왼쪽으로 t만큼 띄운 선(거꾸로) */
  function bandOf(C, t) {
    const n = C.length, off = C.map((p, i) => {
      const a = C[Math.max(0, i - 1)], b = C[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1];
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      return [p[0] - dz * t, p[1] + dx * t];
    });
    return [...C, ...off.reverse()];
  }
  /** 곡선을 따라 휘어 붙이는 띠: Y로 y부터 깊이 d, 곡선에서 바깥으로 두께 t */
  function arcPart(n, m, C, y, d, t, o = {}) {
    const N = norm2(bandOf(C, t));
    return { s: 'arc', n, m, role: 'panel', x: r1(N.ox), y: r1(y), z: r1(N.oz), w: Math.max(1, N.w), d: r1(d), h: Math.max(1, N.h), t: r1(t), pts: C.map(([u, v]) => [r1(u - N.ox), r1(v - N.oz)]), ...o };
  }
  /** 앞에서 본 윤곽 (절대 [x, z]) */
  const outline2 = (q) => (q.s === 'poly' ? q.pts.map(([u, v]) => [q.x + u, q.z + v])
    : q.s === 'arc' ? bandOf(q.pts.map(([u, v]) => [q.x + u, q.z + v]), q.t)
      : [[q.x, q.z], [q.x + q.w, q.z], [q.x + q.w, q.z + q.h], [q.x, q.z + q.h]]);
  /** 휘어 붙이는 띠의 길이 (곡선을 따라) */
  const arcLen = (q) => { let L = 0; for (let i = 0; i + 1 < q.pts.length; i++) L += Math.hypot(q.pts[i + 1][0] - q.pts[i][0], q.pts[i + 1][1] - q.pts[i][1]); return L; };
  /** 다각형을 세로 띠로 나눔: [[xa, xb, 아래a, 아래b, 위a, 위b]…] — 띠 안에는 꼭짓점이 없어서 위·아래 선이 곧음 (3D 모형용) */
  function polyStrips(P) {
    const xs = [...new Set(P.map((p) => Math.round(p[0] * 100) / 100))].sort((a, b) => a - b), out = [];
    for (let i = 0; i + 1 < xs.length; i++) {
      const xa = xs[i], xb = xs[i + 1];
      if (xb - xa < 0.01) continue;
      const xm = (xa + xb) / 2, hits = [];
      for (let j = 0; j < P.length; j++) {
        const p = P[j], q = P[(j + 1) % P.length];
        if ((p[0] <= xm) === (q[0] <= xm)) continue;
        const k = (q[1] - p[1]) / (q[0] - p[0]), at = (x) => p[1] + k * (x - p[0]);
        hits.push({ m: at(xm), a: at(xa), b: at(xb) });
      }
      hits.sort((u, v) => u.m - v.m);
      for (let j = 0; j + 1 < hits.length; j += 2) out.push([xa, xb, hits[j].a, hits[j].b, hits[j + 1].a, hits[j + 1].b]);
    }
    return out;
  }
  /* ── 둥근 부재 ('rnd'): 둘러싼 상자(x·y·z·w·d·h)를 축 ax 쪽으로 본 면이 둥근 모양 (그 축으로 밀어낸 판·기둥).
     full이면 원·타원, 아니면 모서리 반지름 r(mm). 예) 원형 테이블 상판(ax 'z'), 둥근 기둥(ax가 긴 축), 둥근 간판(ax 'y') ── */
  const RND_AX = { x: [1, 2], y: [0, 2], z: [0, 1] }; // 둥근 면의 두 축 (u, v)
  /** 둥근 면의 윤곽: 그 면 두 축의 절대 좌표(mm), 반시계. 원·타원은 48점, 모서리 R은 모서리마다 8토막 */
  function rndOutline(q) {
    const [ku, kv] = RND_AX[q.ax] || RND_AX.z, lo = [q.x, q.y, q.z], sz = [q.w, q.d, q.h];
    const u0 = lo[ku], u1 = lo[ku] + sz[ku], v0 = lo[kv], v1 = lo[kv] + sz[kv];
    const a = (u1 - u0) / 2, b = (v1 - v0) / 2, cu = u0 + a, cv = v0 + b;
    if (q.full) { const n = 48; return Array.from({ length: n }, (_, i) => { const t = (i / n) * Math.PI * 2 - Math.PI / 2; return [cu + a * Math.cos(t), cv + b * Math.sin(t)]; }); }
    const r = Math.max(0, Math.min(q.r || 0, a, b));
    if (r < 0.5) return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    const out = [], k = 8;
    [[u1 - r, v0 + r, -Math.PI / 2], [u1 - r, v1 - r, 0], [u0 + r, v1 - r, Math.PI / 2], [u0 + r, v0 + r, Math.PI]].forEach(([cx, cy, t0]) => {
      for (let i = 0; i <= k; i++) { const t = t0 + (i / k) * (Math.PI / 2); out.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); }
    });
    return out;
  }
  /** 둥근 면의 두 축 값과 밀어낸 축 값 → 부재 좌표 [x, y, z] */
  const rndPoint = (q, u, v, a) => { const [ku, kv] = RND_AX[q.ax] || RND_AX.z, p = [0, 0, 0]; p[ku] = u; p[kv] = v; p[3 - ku - kv] = a; return p; };
  /** 3D 모형을 만들 육면체들 (각각 corners와 같은 차례의 여덟 구석) */
  function hexes(q) {
    const y0 = q.y, y1 = q.y + q.d;
    if (q.s === 'rnd') { // 둥근 면을 띠로 나눠 밀어냄 (구석 차례는 상자와 같게: 아래 넷(낮은 z) → 위 넷)
      const [ku, kv] = RND_AX[q.ax] || RND_AX.z, ka = 3 - ku - kv, a0 = [q.x, q.y, q.z][ka], a1 = a0 + [q.w, q.d, q.h][ka];
      return polyStrips(rndOutline(q)).filter((st) => st[4] - st[2] > 0.2 || st[5] - st[3] > 0.2).map(([ua, ub, ba, bb, ta, tb]) => {
        if (q.ax === 'x') return [[a0, ua, ba], [a1, ua, ba], [a1, ub, bb], [a0, ub, bb], [a0, ua, ta], [a1, ua, ta], [a1, ub, tb], [a0, ub, tb]];
        if (q.ax === 'y') return [[ua, a0, ba], [ub, a0, bb], [ub, a1, bb], [ua, a1, ba], [ua, a0, ta], [ub, a0, tb], [ub, a1, tb], [ua, a1, ta]];
        return [[ua, ba, a0], [ub, bb, a0], [ub, tb, a0], [ua, ta, a0], [ua, ba, a1], [ub, bb, a1], [ub, tb, a1], [ua, ta, a1]];
      });
    }
    if (q.s === 'poly') {
      return polyStrips(outline2(q)).filter((s) => s[4] - s[2] > 0.2 || s[5] - s[3] > 0.2)
        .map(([xa, xb, ba, bb, ta, tb]) => [[xa, y0, ba], [xb, y0, bb], [xb, y1, bb], [xa, y1, ba], [xa, y0, ta], [xb, y0, tb], [xb, y1, tb], [xa, y1, ta]]);
    }
    if (q.s === 'arc') {
      const C = q.pts.map(([u, v]) => [q.x + u, q.z + v]), n = C.length, O = bandOf(C, q.t).slice(n).reverse(), out = [];
      for (let i = 0; i + 1 < n; i++) {
        const a = C[i], b = C[i + 1], c = O[i], e = O[i + 1];
        out.push([[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], [c[0], y0, c[1]], [e[0], y0, e[1]], [e[0], y1, e[1]], [c[0], y1, c[1]]]);
      }
      return out;
    }
    return [corners(q)];
  }

  /* ── 종류별 만들기: p(값) → { parts, hw: [{ n, q }], info: [[이름, 값, 덧말]] } ── */
  const num = (v, def, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };
  const int = (v, def, lo, hi) => Math.round(num(v, def, lo, hi));

  /* 마감 색 (몸통·문짝): 자재는 그대로 두고 겉 색만 — 도면·3D·부재표(색마다 따로 묶음)에 쓰임 */
  const FINISHES = [
    { id: 'none', name: '자재 색 그대로', color: null },
    { id: 'white', name: '화이트', color: '#f4f3ef' }, { id: 'ivory', name: '아이보리', color: '#ece5d6' }, { id: 'beige', name: '베이지', color: '#d9cdb8' },
    { id: 'lgray', name: '라이트 그레이', color: '#cfd2d4' }, { id: 'gray', name: '그레이', color: '#8f969c' }, { id: 'dgray', name: '다크 그레이', color: '#555b61' }, { id: 'black', name: '블랙', color: '#2b2e31' },
    { id: 'maple', name: '메이플', color: '#e3c99a' }, { id: 'oak', name: '오크', color: '#cfa46c' }, { id: 'walnut', name: '월넛', color: '#7a5235' },
    { id: 'navy', name: '네이비', color: '#2f3e57' }, { id: 'green', name: '딥 그린', color: '#3d5547' },
  ];
  const finish = (id) => FINISHES.find((f) => f.id === id) || FINISHES[0];
  /** 부재에 마감 색을 입힘 (자재 색 그대로면 손대지 않음) */
  const paint = (q, f) => (f && f.color ? { ...q, c: f.color, fin: f.name } : q);
  /** 문짝 한 장의 경첩 수: 높이에 따라 (900까지 2 · 1600까지 3 · 2000까지 4 · 그 위 5) */
  const hingesFor = (h) => (h <= 900 ? 2 : h <= 1600 ? 3 : h <= 2000 ? 4 : 5);
  /** 서랍 레일 길이: 몸통 깊이에 들어가는 규격 (250~600, 50 단위) */
  const slideFor = (depth) => Math.max(250, Math.min(600, Math.floor((depth - 10) / 50) * 50));
  const addHw = (hw, n, q) => { if (!(q > 0)) return; const e = hw.find((h) => h.n === n); if (e) e.q += q; else hw.push({ n, q }); };
  /** 문짝 (여닫이): 3D에서 경첩 쪽으로 열림. hinge 'l'(왼쪽 경첩)|'r' */
  function doorPart(S, f, x, y, z, w, h, hinge, o = {}) {
    return paint(box('문짝', S.id, x, y, z, w, S.t, h, { door: true, eb: 2 * (w + h), an: { t: 'door', ax: [hinge === 'l' ? x : x + w, y], dir: hinge === 'l' ? -1 : 1, out: [0, -1] }, ...o }), f);
  }
  /** 서랍 하나: 앞판 + 통(옆판 2·앞뒤판 2·밑판) + 레일. 안쪽 폭 wi(몸통 옆판 사이), 앞판은 fx~fx+fw. inner: 문 뒤에 숨는 속서랍
      돌려주는 값: 부재들 (같은 dr 번호끼리 3D에서 함께 나옴) */
  let drawerSeq = 0;
  function drawerParts(o) {
    const { S, fDoor, xi, wi, yb, Dc, z, h, fx, fw, fy, hw, inner } = o; // 서랍 통(옆판·앞뒤판·밑판)은 자재 색 그대로
    const id = ++drawerSeq, T = sheet('ply15'), tb = T.t, B5 = sheet('ply5');
    const len = slideFor(Dc), boxW = wi - 26, boxH = Math.max(60, Math.min(h - 56, 250)), bx = xi + 13, by = yb + (inner ? 22 : 2), bz = z + 26;
    const an = { t: 'drawer', v: [0, -1], max: Math.min(len * 0.8, 420) };
    const tag = { dr: id, an };
    const out = [
      paint(box(inner ? '속서랍 앞판' : '서랍 앞판', S.id, fx, fy, z, fw, S.t, h, { front: true, eb: 2 * (fw + h), ...tag }), fDoor),
      box('서랍 옆판', T.id, bx, by, bz, tb, len, boxH, { eb: len, ...tag }), box('서랍 옆판', T.id, bx + boxW - tb, by, bz, tb, len, boxH, { eb: len, ...tag }),
      box('서랍 앞뒤판', T.id, bx + tb, by, bz, boxW - 2 * tb, tb, boxH, { eb: boxW - 2 * tb, ...tag }), box('서랍 앞뒤판', T.id, bx + tb, by + len - tb, bz, boxW - 2 * tb, tb, boxH, { eb: boxW - 2 * tb, ...tag }),
      box('서랍 밑판', B5.id, bx, by, bz - B5.t, boxW, len, B5.t, tag),
    ];
    addHw(hw, `서랍 레일 ${len}mm (1조)`, 1);
    addHw(hw, '손잡이', inner ? 0 : 1);
    return out;
  }

  /** 손잡이: 문짝·서랍 앞판마다 막대 손잡이 하나. 사 오는 철물이라 그림·3D에만 나오고 부재표에는 ‘손잡이’ 개수로만 들어감.
      문짝과 함께 열리고(같은 an) 문을 떼면 같이 사라짐(door). 전체 크기에는 넣지 않음(hd) */
  const lum = (hex) => { const v = parseInt(String(hex || '#dddddd').replace('#', ''), 16) || 0; return (0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255; };
  function handles(parts) {
    const out = [], P = 20, T = 12; // 앞으로 나온 길이, 굵기
    parts.forEach((q) => {
      if ((q.s !== 'box' && q.s !== 'poly') || !q.an || q.role !== 'panel') return;
      const isDoor = !!q.door, isFront = !!q.front && !/^속서랍/.test(q.n);
      if (!isDoor && !isFront) return;
      const o = q.an.t === 'door' ? q.an.out || [0, -1] : q.an.v;         // 앞면이 보는 쪽
      const alongX = Math.abs(o[1]) > 0.5;                                 // 앞면이 X와 나란한가 (뒷벽 줄·보통 가구)
      const fw = alongX ? q.w : q.d, fh = q.h, u0 = alongX ? q.x : q.y;    // 앞면 폭·높이·시작
      let hu, hz, hl, hh;
      if (isDoor) { // 세로 손잡이: 경첩 반대쪽 끝에서 40 안쪽. 상부장은 아래쪽, 키 큰 문은 손 닿는 높이(1,050), 하부장은 위쪽
        const L = Math.min(160, fh - 80);
        if (L < 40 || fw < 90) return;
        const hingeAtStart = Math.abs((alongX ? q.an.ax[0] : q.an.ax[1]) - u0) < 1;
        hu = hingeAtStart ? u0 + fw - 40 - T : u0 + 40;
        const top = q.z + fh, zc = q.z >= 1250 ? q.z + 50 + L / 2 : fh > 1250 ? Math.min(Math.max(1050, q.z + 60 + L / 2), top - 60 - L / 2) : top - 50 - L / 2;
        hz = zc - L / 2; hl = T; hh = L;
      } else if (fw < 160) { // 좁은 앞판 (망장): 세로로, 위쪽
        const L = Math.min(160, fh - 80);
        if (L < 40 || fw < 40) return;
        hu = u0 + fw / 2 - T / 2; hz = q.z + fh - 60 - L; hl = T; hh = L;
      } else { // 서랍: 가로로, 앞판 위쪽 가운데
        const L = Math.min(160, fw - 60);
        if (fh < 50) return;
        hu = u0 + fw / 2 - L / 2; hz = q.z + fh - Math.min(50, fh / 2) - T / 2; hl = L; hh = T;
      }
      const b = alongX ? { x: hu, y: o[1] < 0 ? q.y - P : q.y + q.d, z: hz, w: hl, d: P, h: hh } : { x: o[0] > 0 ? q.x + q.w : q.x - P, y: hu, z: hz, w: P, d: hl, h: hh };
      const c0 = [q.x + q.w / 2, q.y + q.d / 2, q.z + q.h / 2];
      out.push({ s: 'box', n: '손잡이', m: 'fix', role: 'fix', hd: true, c: lum(q.c || (mat(q.m) || {}).color) < 0.4 ? '#c9ced3' : '#565c63', metal: true,
        x: r1(b.x), y: r1(b.y), z: r1(b.z), w: r1(b.w), d: r1(b.d), h: r1(b.h), an: q.an, pc: c0.map(r1), ...(isDoor ? { door: true } : { front: true }), ...(q.dr != null ? { dr: q.dr } : {}) });
    });
    return out;
  }
  const HANDLES = [['bar', '막대 손잡이'], ['none', '없음 (푸시·홈)']];
  /** 만든 부재에 손잡이를 닮. ‘없음’이면 철물표의 손잡이를 푸시 래치로 바꿔 셈 */
  function withHandles(parts, hw, p) {
    if (p && p.handle === 'none') { hw.forEach((h) => { if (h.n === '손잡이') h.n = '푸시 래치 (누르면 열림)'; }); return; }
    parts.push(...handles(parts));
  }

  function cabinet(p) {
    const W = num(p.W, 800, 200, 4000), H = num(p.H, 850, 200, 3000), D = num(p.D, 400, 150, 1200);
    const S = sheet(p.mat), t = S.t, back = p.back && p.back !== 'none' ? sheet(p.back) : null, tb = back ? back.t : 0;
    const doors = int(p.doors, 0, 0, 6), shelves = int(p.shelves, 1, 0, 12), dividers = int(p.dividers, 0, 0, 8);
    const plinth = num(p.plinth, 0, 0, 300);
    const fB = finish(p.body), fD = finish(p.doorc);
    const Hc0 = H - plinth - 2 * t;
    // 서랍: 아래에서부터 n단 (한 단 높이 어림 180, 몸통 안 높이의 70%까지)
    let nd = int(p.drawers, 0, 0, 8);
    const dzone = nd ? Math.min(Hc0 * 0.7, nd * 180) : 0;
    if (nd && dzone / nd < 90) nd = Math.max(0, Math.floor(dzone / 90));
    const fronts = doors || nd;
    const td = fronts ? t : 0, y0 = fronts ? td + 2 : 0;          // 문짝·서랍이 있으면 몸통은 앞판 두께 + 2mm 뒤에서 시작
    const Dc = D - y0 - tb;                                        // 몸통 판의 깊이 (뒤판은 뒤에 덧댐)
    const parts = [], hw = [];
    if (Dc < 50 || W - 2 * t < 50 || Hc0 < 50) return { parts, hw, info: [['치수', '너무 작음', '폭·높이·깊이를 키워 주세요']] };
    const P = (q) => paint(q, fB);
    parts.push(P(box('옆판', S.id, 0, y0, 0, t, Dc, H, { eb: H })), P(box('옆판', S.id, W - t, y0, 0, t, Dc, H, { eb: H })));
    parts.push(P(box('지판', S.id, t, y0, plinth, W - 2 * t, Dc, t, { eb: W - 2 * t })), P(box('천판', S.id, t, y0, H - t, W - 2 * t, Dc, t, { eb: W - 2 * t })));
    if (plinth >= 30) parts.push(P(box('걸레받이', S.id, t, y0 + 40, 0, W - 2 * t, t, plinth)));
    if (back) parts.push(box('뒤판', back.id, 0, y0 + Dc, plinth, W, tb, H - plinth));
    const Wc = W - 2 * t, Hc = Hc0, bw = (Wc - dividers * t) / (dividers + 1);
    for (let i = 0; i < dividers; i++) parts.push(P(box('칸막이', S.id, t + bw * (i + 1) + t * i, y0, plinth + t, t, Dc, Hc, { eb: Hc })));
    // 서랍 칸 위에 가로 판(서랍 덮개) → 그 위가 선반 칸
    const zs0 = plinth + t + (nd ? dzone : 0);
    const Hs = H - t - zs0 - (nd ? t : 0);
    const sd = Math.max(50, Dc - 20), gap = (Hs - shelves * t) / (shelves + 1);
    for (let b = 0; b <= dividers; b++) {
      const bx = t + (bw + t) * b;
      if (nd) {
        parts.push(P(box('서랍 덮개판', S.id, bx, y0, zs0, bw, Dc, t, { eb: bw })));
        const g = 3, fh = dzone / nd, fx = b === 0 ? g : bx - t / 2 + g / 2, fx1 = b === dividers ? W - g : bx + bw + t / 2 - g / 2;
        for (let j = 0; j < nd; j++) parts.push(...drawerParts({ S, fDoor: fD, fBody: fB, xi: bx, wi: bw, yb: y0, Dc, z: plinth + (j ? fh * j + g / 2 : g), h: fh - (j ? g : g * 1.5), fx, fw: fx1 - fx, fy: 0, hw }));
      }
      if (gap >= 40) for (let j = 0; j < shelves; j++) parts.push(P(box('선반', S.id, bx + 1, y0 + (Dc - sd), zs0 + (nd ? t : 0) + gap * (j + 1) + t * j, bw - 2, sd, t, { eb: bw - 2 })));
    }
    if (p.rod) parts.push(rail('옷걸이 봉', 'rod25', 'x', t, y0 + Dc / 2 - 12.5, H - t - 80 - 25, bw, { thin: true }));
    if (doors) {
      const g = 3, dw = (W - g * (doors + 1)) / doors, z0 = plinth + (nd ? dzone + t / 2 : 0) + g, dh = H - z0 - g;
      for (let i = 0; i < doors; i++) parts.push(doorPart(S, fD, g + (dw + g) * i, 0, z0, dw, dh, doors === 1 ? 'l' : i % 2 ? 'r' : 'l'));
      addHw(hw, '경첩 (싱크 경첩)', hingesFor(dh) * doors);
      addHw(hw, '손잡이', doors);
    }
    if (shelves && gap >= 40) addHw(hw, '선반 다보', shelves * (dividers + 1) * 4);
    if (p.rod) addHw(hw, '봉 브래킷', 2);
    if (p.ledShelf && p.ledShelf !== 'none' && App.ledstrip) { // LED (선택): 선반마다 아래 앞쪽 · 칸 천장(천판 아래)
      const sp = App.ledstrip.spec(p);
      if (p.ledShelf === 'under') parts.filter((q) => q.n === '선반').forEach((q, i) => parts.push(...ledParts([[q.x + 10, q.y + 15, q.z - 5], [q.x + q.w - 10, q.y + 15, q.z - 5]], sp, `S${i}`)));
      else for (let b2 = 0; b2 <= dividers; b2++) { const bx = t + (bw + t) * b2; parts.push(...ledParts([[bx + 10, y0 + 15, H - t - 6], [bx + bw - 10, y0 + 15, H - t - 6]], sp, `T${b2}`)); }
    }
    withHandles(parts, hw, p);
    const spec = [fB.color ? `몸통: ${fB.name}` : '', fD.color && fronts ? `문짝·서랍 앞판: ${fD.name}` : ''].filter(Boolean);
    return {
      parts, hw, spec,
      info: [['안쪽 폭', `${r1(bw)} mm`, dividers ? `${dividers + 1}칸` : ''], ['선반 사이', shelves && gap >= 40 ? `${r1(gap)} mm` : '-', shelves ? `칸마다 ${shelves}장` : '선반 없음'], ['몸통 깊이', `${r1(Dc)} mm`, fronts ? `문짝 ${td}T + 2 뺌` : ''],
        ...(nd ? [['서랍', `${nd * (dividers + 1)}개`, `앞판 높이 약 ${Math.round(dzone / nd)} mm · 레일 ${slideFor(Dc)} mm`]] : [])],
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
      defaults: { W: 800, H: 850, D: 400, mat: 'ply18', back: 'ply5', shelves: 1, dividers: 0, doors: 2, drawers: 0, plinth: 80, rod: false, body: 'none', doorc: 'none', handle: 'bar' },
      presets: [
        ['하부장 (문 2짝)', { W: 800, H: 850, D: 550, shelves: 1, dividers: 0, doors: 2, plinth: 100 }],
        ['책장', { W: 800, H: 1800, D: 300, shelves: 4, dividers: 0, doors: 0, plinth: 60 }],
        ['옷장 (봉)', { W: 1000, H: 2100, D: 600, shelves: 1, dividers: 0, doors: 2, plinth: 80, rod: true }],
        ['TV장', { W: 1600, H: 450, D: 400, shelves: 0, dividers: 2, doors: 0, plinth: 0 }],
        ['신발장', { W: 900, H: 1200, D: 350, shelves: 5, dividers: 1, doors: 2, plinth: 80 }],
        ['서랍장 4단', { W: 800, H: 900, D: 450, shelves: 0, dividers: 0, doors: 0, drawers: 4, plinth: 60, mat: 'lpm18', body: 'white', doorc: 'oak' }],
        ['하부장 (서랍 2단 + 문)', { W: 900, H: 850, D: 550, shelves: 1, dividers: 0, doors: 2, drawers: 2, plinth: 100 }],
      ],
      fields: [
        { k: 'W', label: '폭', unit: 'mm' }, { k: 'H', label: '높이', unit: 'mm' }, { k: 'D', label: '깊이', unit: 'mm' },
        { k: 'mat', label: '판재', type: 'sheet', min: 12 }, { k: 'back', label: '뒤판', type: 'sheet', none: '없음', max: 9 },
        { k: 'shelves', label: '선반 (칸마다)', unit: '장', int: true }, { k: 'dividers', label: '세로 칸막이', unit: '개', int: true },
        { k: 'doors', label: '문짝', unit: '짝', int: true }, { k: 'drawers', label: '서랍 (아래부터)', unit: '단', int: true },
        { k: 'plinth', label: '걸레받이 높이', unit: 'mm' },
        { k: 'body', label: '몸통 색', type: 'finish' }, { k: 'doorc', label: '문짝·서랍 색', type: 'finish' },
        { k: 'handle', label: '손잡이 (문짝·서랍)', type: 'select', options: HANDLES },
        { k: 'ledShelf', label: 'LED (선반)', type: 'select', options: [['none', '없음'], ['under', '선반마다 아래 앞쪽'], ['top', '칸 천장 (천판 아래)']] },
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
    free: {
      label: '자유 설계 (부재를 하나씩)',
      // ‘부재로 풀기’로 넘어온 마감사양·3D 보는 방향은 그대로 지님
      make: (p) => ({ parts: [], hw: [], info: [], ...(Array.isArray(p.spec) && p.spec.length ? { spec: p.spec.slice(0, 6).map((s) => String(s).slice(0, 60)) } : {}), ...(typeof p.cam === 'number' ? { cam: p.cam } : {}) }),
      defaults: {}, presets: [],
      fields: [{ k: 'handle', label: '손잡이 (문·서랍 앞판으로 정한 부재)', type: 'select', options: HANDLES, when: (p, el) => !!el && (el.parts || []).some((q) => q && ['dl', 'dr', 'df'].includes(q.mv)) }],
    },
    model: { label: '내려받은 3D 모델 보기', make: () => ({ parts: [], hw: [], info: [] }), defaults: {}, presets: [], fields: [] },
  };

  /* ── 설계물 ── */
  const newId = () => `dsg-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  function create(kind, preset = null, name = '') {
    const K = KINDS[kind] || KINDS.free;
    return { id: newId(), type: 'design', layer: 'design', room: null, memo: '', createdAt: new Date().toISOString(), kind: KINDS[kind] ? kind : 'free', name: name || K.label.replace(/\s*\(.*$/, ''), p: { ...K.defaults, ...(preset || {}) }, parts: [] };
  }
  /** 직접 넣은 부재를 깨끗하게 (저장된 데이터가 깨져 있어도 안전하게) */
  const MOVES = ['dl', 'dr', 'df', 'dw'], FACES = ['r', 'l', 'b'];
  /** 직접 넣은 부재의 움직임(mv)을 3D용 값(an)으로: 문은 마주 보고 선 사람의 왼쪽/오른쪽 끝·바깥 면이 경첩 자리, 서랍은 보는 쪽으로 나옴.
      보는 쪽(mo)이 없으면 — 얇은 쪽이 X인 판은 바깥쪽(가운데에서 먼 쪽), 그 밖에는 앞 */
  function moveOf(q, b) {
    const thinX = q.w < q.d && q.w <= q.h;
    const face = q.mo || (thinX ? (q.x + q.w / 2 < (b.min[0] + b.max[0]) / 2 ? 'l' : 'r') : 'f');
    const out = face === 'f' ? [0, -1] : face === 'b' ? [0, 1] : face === 'r' ? [1, 0] : [-1, 0];
    if (q.mv === 'dl' || q.mv === 'dr') {
      const L = q.mv === 'dl';
      const ax = face === 'f' ? [L ? q.x : q.x + q.w, q.y] : face === 'b' ? [L ? q.x + q.w : q.x, q.y + q.d] : face === 'r' ? [q.x + q.w, L ? q.y : q.y + q.d] : [q.x, L ? q.y + q.d : q.y];
      return { ...q, door: true, an: { t: 'door', ax: ax.map(r1), dir: L ? -1 : 1, out } };
    }
    const depth = face === 'f' || face === 'b' ? b.max[1] - b.min[1] : b.max[0] - b.min[0];
    return { ...q, dr: 'u', ...(q.mv === 'df' ? { front: true } : {}), an: { t: 'drawer', v: out, max: q.mx || Math.max(120, Math.min(420, Math.round(depth * 0.7))) } };
  }
  function cleanPart(q, i) {
    if (!q || typeof q !== 'object') return null;
    const f = (v) => (Number.isFinite(+v) ? r1(+v) : 0);
    const keep = q.s !== 'bar' && (q.role === 'slab' || q.role === 'fix') ? q.role : null; // ‘부재로 풀기’로 넘어온 상판·기기(싱크볼 따위)
    const m = keep ? (keep === 'slab' ? 'top' : 'fix') : mat(q.m) ? q.m : 'ply18', n = String(q.n || '부재').slice(0, 30), id = typeof q.id === 'string' ? q.id : `u${i}`;
    if ((q.role === 'lite' || q.m === 'ledline') && Array.isArray(q.a) && Array.isArray(q.b) && !q.halo) { // LED 라인
      const L = LS();
      return { id, s: 'bar', n, m: 'ledline', role: 'lite', a: q.a.slice(0, 3).map(f), b: q.b.slice(0, 3).map(f), lt: L.type(q.lt).id, k: L.temp(q.k), pf: q.pf === 'none' ? 'none' : 'alu', c: L.light(q.k), ...(q.run ? { run: String(q.run).slice(0, 24) } : {}), user: true };
    }
    if (q.s === 'bar' && Array.isArray(q.a) && Array.isArray(q.b)) {
      const M = BARS.find((b) => b.id === m) ? m : 'sq50';
      return { id, s: 'bar', n, m: M, role: 'bar', a: q.a.slice(0, 3).map(f), b: q.b.slice(0, 3).map(f), user: true };
    }
    const w = Math.max(1, f(q.w)), d = Math.max(1, f(q.d)), h = Math.max(1, f(q.h));
    const isBar = !keep && !!BARS.find((b) => b.id === m);
    const col = /^#[0-9a-f]{6}$/i.test(q.c || '') ? { c: q.c, fin: String(q.fin || '').slice(0, 20) } : {}; // 마감 색
    // 3D에서의 움직임: 문(왼쪽·오른쪽 경첩)·서랍 앞판·서랍 통. mo: 앞면이 보는 쪽(없으면 앞), mx: 서랍이 나오는 길이
    const mv = !isBar && MOVES.includes(q.mv) ? { mv: q.mv, ...(FACES.includes(q.mo) ? { mo: q.mo } : {}), ...(Number.isFinite(+q.mx) && +q.mx > 0 ? { mx: Math.min(900, r1(+q.mx)) } : {}) } : {};
    const more = keep ? { ...(q.mn ? { mn: String(q.mn).slice(0, 40) } : {}), ...(q.gl ? { gl: true } : {}), ...(q.metal ? { metal: true } : {}) } : {};
    const eb = Number.isFinite(+q.eb) && +q.eb > 0 ? { eb: r1(+q.eb) } : {};
    if (q.s === 'rnd') { // 둥근 부재 (원·타원·모서리 R)
      const ax = ['x', 'y', 'z'].includes(q.ax) ? q.ax : 'z', r = Math.max(0, Math.min(5000, f(q.r)));
      // 각재·파이프의 길이는 둥근 면과 상관없이 가장 긴 쪽 (부재표의 절단 길이)
      return { id, s: 'rnd', n, m, role: keep || (isBar ? 'bar' : 'panel'), ...(isBar ? { axis: w >= d && w >= h ? 'x' : d >= h ? 'y' : 'z' } : {}), x: f(q.x), y: f(q.y), z: f(q.z), w, d, h, ax, r, ...(q.full ? { full: true } : {}), ...col, ...eb, user: true };
    }
    if ((q.s === 'poly' || q.s === 'arc') && Array.isArray(q.pts)) { // 곡선 부재 (‘부재로 풀기’한 아치 벽 따위)
      const pts = q.pts.slice(0, 400).filter((p) => Array.isArray(p) && Number.isFinite(+p[0]) && Number.isFinite(+p[1])).map((p) => [f(p[0]), f(p[1])]);
      if (pts.length < (q.s === 'poly' ? 3 : 2)) return null;
      const S = SHEETS.find((s) => s.id === q.m) ? q.m : 'ply9', abs = pts.map(([u, v]) => [f(q.x) + u, f(q.z) + v]);
      const P = q.s === 'poly' ? poly(n, S, abs, f(q.y), d) : arcPart(n, S, abs, f(q.y), d, Math.max(1, Math.min(100, f(q.t) || 5)));
      return { ...P, id, ...col, ...mv, user: true };
    }
    return { id, s: 'box', n, m, role: keep || (isBar ? 'bar' : 'panel'), ...(isBar ? { axis: w >= d && w >= h ? 'x' : d >= h ? 'y' : 'z' } : {}), x: f(q.x), y: f(q.y), z: f(q.z), w, d, h, ...col, ...mv, ...more, ...eb, user: true };
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
    // 직접 넣은 부재 가운데 문·서랍으로 정한 것: 움직임 값을 달고, 경첩·레일·손잡이를 철물에 더함
    const hw = (made.hw || []).map((h) => ({ ...h })), moved = [];
    parts.forEach((q, i) => { if (q.user && q.mv && q.s !== 'bar') { parts[i] = moveOf(q, b); moved.push(parts[i]); } });
    if (moved.length) {
      moved.forEach((q) => { if (q.door) addHw(hw, '경첩 (싱크 경첩)', hingesFor(q.h)); else if (q.mv === 'df') addHw(hw, '서랍 레일 (1조)', 1); });
      const grips = moved.filter((q) => q.mv !== 'dw').length;
      if ((el.p || {}).handle === 'none') addHw(hw, '푸시 래치 (누르면 열림)', grips);
      else { const hs = handles(moved); hs.forEach((h, i) => parts.push({ id: `h${i}`, ...h })); addHw(hw, '손잡이', hs.length); }
    }
    made.hw = hw;
    // LED 라인: 3D에서 번지는 빛(반투명) 부재를 붙이고 마감사양에 한 줄
    const lites = parts.filter((q) => q.role === 'lite' && !q.halo);
    if (lites.length) {
      lites.forEach((q) => parts.push({ ...q, id: `${q.id}~`, n: 'LED 빛', halo: true, sw: 46, sh: 46, al: 0.2, user: false }));
      const L = LS(), q0 = lites[0];
      if (!(made.spec || []).some((t) => /^LED/.test(t))) made.spec = [...(made.spec || []), `LED: ${L.type(q0.lt).name} · ${L.tempName(q0.k)}${q0.pf === 'none' ? '' : ' · 알루미늄 프로파일'}`];
    }
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
    const B = q.role === 'lite' ? { sw: q.sw || LITE.sw, sh: q.sh || LITE.sh } : bar(q.m), a = q.a, b = q.b;
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
    parts.forEach((q) => { if (q.hd || q.halo) return; corners(q).forEach((c) => { for (let k = 0; k < 3; k++) { if (c[k] < min[k]) min[k] = c[k]; if (c[k] > max[k]) max[k] = c[k]; } }); }); // 손잡이(hd)는 크기에 안 넣음
    if (min[0] === Infinity) return { min: [0, 0, 0], max: [0, 0, 0] };
    return { min, max };
  }

  /* ── 재단표 ── */
  const lenOf = (q) => (q.s === 'bar' ? Math.hypot(q.b[0] - q.a[0], q.b[1] - q.a[1], q.b[2] - q.a[2]) : q.axis === 'x' ? q.w : q.axis === 'y' ? q.d : q.axis === 'z' ? q.h : Math.max(q.w, q.d, q.h));
  function weightOf(parts) {
    let kg = 0;
    parts.forEach((q) => {
      if (q.role === 'bar') kg += (lenOf(q) / 1000) * bar(q.m).kgm;
      else if (q.role === 'panel') kg += ((q.w * q.d * q.h) / 1e9) * sheet(q.m).dens * (q.s === 'rnd' && q.full ? Math.PI / 4 : 1);
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
  /** 재단표: 판재(자재·마감 색·크기별), 막대(자재·길이별), 상판, 전광판, 철물, 엣지 길이, 무게 */
  function bom(el) {
    const B = build(el);
    const panels = new Map(), bars = new Map(), tops = new Map(), lites = [];
    let leds = 0, edge = 0, topKg = 0;
    B.parts.forEach((q) => {
      if (q.role === 'led') { leds++; return; }
      if (q.role === 'lite') { if (!q.halo) lites.push(q); return; }
      if (q.eb > 0) edge += q.eb;
      if (q.role === 'panel') {
        // 곡선 판은 둘러싼 네모(윤곽을 따라 자름), 휨합판 띠는 곡선 길이 × 깊이
        const cut = q.s === 'poly' ? 'curve' : q.s === 'arc' ? 'bend' : q.s === 'rnd' ? (q.full ? 'round' : q.r >= 0.5 ? `r${q.r}` : '') : '';
        const S = sheet(q.m), dims = cut === 'curve' ? [Math.max(q.w, q.h), Math.min(q.w, q.h), q.d] : cut === 'bend' ? [r1(arcLen(q)), q.d, q.t] : [q.w, q.d, q.h].sort((a, b) => b - a);
        const fin = q.fin || '', key = `${S.id}|${fin}|${dims[0]}|${dims[1]}|${q.n}|${cut}`;
        const cur = panels.get(key) || { m: S.id, g: `${S.id}|${fin}`, mat: fin ? `${S.name} · ${fin}` : S.name, fin, n: q.n, l: dims[0], w: dims[1], t: dims[2], q: 0, eb: 0, cut };
        cur.q++;
        cur.eb += q.eb || 0;
        panels.set(key, cur);
      } else if (q.role === 'slab') {
        const dims = [q.w, q.d, q.h].sort((a, b) => b - a), key = `${q.n}|${q.mn || ''}|${dims[0]}|${dims[1]}|${dims[2]}`;
        const cur = tops.get(key) || { n: q.n, mat: q.mn || '상판', l: dims[0], w: dims[1], t: dims[2], q: 0 };
        cur.q++;
        tops.set(key, cur);
        topKg += ((q.w * q.d * q.h) / 1e9) * (q.dens || 1700);
      } else if (q.role === 'bar') {
        const M = bar(q.m), len = r1(lenOf(q)), key = `${M.id}|${len}|${q.n}|${q.s === 'bar' ? 'x' : ''}`;
        const cur = bars.get(key) || { m: M.id, mat: M.name, n: q.n, len, q: 0, slant: q.s === 'bar' };
        cur.q++;
        bars.set(key, cur);
      }
    });
    const panelRows = [...panels.values()].sort((a, b) => a.mat.localeCompare(b.mat, 'ko') || b.l * b.w - a.l * a.w);
    const barRows = [...bars.values()].sort((a, b) => a.mat.localeCompare(b.mat, 'ko') || b.len - a.len);
    const topRows = [...tops.values()].sort((a, b) => b.l - a.l);
    const sheets = [], stocks = [];
    [...new Set(panelRows.map((r) => r.g))].forEach((g) => {
      const rows = panelRows.filter((r) => r.g === g), S = sheet(rows[0].m);
      const pieces = rows.flatMap((r) => Array.from({ length: r.q }, () => ({ l: r.l, w: r.w, n: r.n })));
      const SW = S.sw || SHEET_W, SH = S.sh || SHEET_H, layout = nest2d(pieces, SW, SH);
      const area = rows.reduce((t, r) => t + (r.l * r.w * r.q) / 1e6, 0);
      sheets.push({ m: S.id, g, mat: rows[0].mat, fin: rows[0].fin, sw: SW, sh: SH, count: layout.length, area: Math.round(area * 100) / 100, layout, kg: r1(rows.reduce((t, r) => t + ((r.l * r.w * r.t * r.q) / 1e9) * S.dens, 0)) });
    });
    [...new Set(barRows.map((r) => r.m))].forEach((m) => {
      const rows = barRows.filter((r) => r.m === m), M = bar(m);
      const cut = nest1d(rows.flatMap((r) => Array.from({ length: r.q }, () => r.len)), M.stock);
      const total = rows.reduce((t, r) => t + r.len * r.q, 0);
      stocks.push({ m, mat: M.name, stock: M.stock, count: cut.bars.length, total: Math.round(total), waste: cut.waste, joined: cut.joined, layout: cut.bars, kg: r1((total / 1000) * M.kgm), kgm: M.kgm });
    });
    const kg = sheets.reduce((t, s) => t + s.kg, 0) + stocks.reduce((t, s) => t + s.kg, 0) + (B.led ? B.led.kgScreen : 0) + topKg;
    // 엣지 밴딩: 보이는 마구리 길이 (자르고 붙일 때의 여유 10%를 더함), m로
    const edgeM = edge > 0 ? Math.ceil((edge * 1.1) / 100) / 10 : 0;
    // LED 라인: 같은 이름(run)의 선분은 한 구간, 이름 없는 것(직접 그린 것)은 끝이 맞닿으면 한 구간
    let lite = null;
    if (lites.length) {
      const named = new Map(), loose = [];
      lites.forEach((q) => { if (q.run) { const r = named.get(q.run) || { len: 0, type: q.lt, k: q.k, prof: q.pf }; r.len += lenOf(q); named.set(q.run, r); } else loose.push({ a: q.a, b: q.b, type: q.lt, k: q.k, prof: q.pf }); });
      lite = LS().plan([...named.values(), ...LS().chains(loose)]);
    }
    return { panels: panelRows, bars: barRows, tops: topRows, sheets, stocks, leds, led: B.led || null, lite, hw: B.hw || [], edge: edgeM, kg: r1(kg), size: B.size, spec: B.spec || [] };
  }
  /** 재료비: 이 기기에 적어 둔 단가(원장 한 장·원자재 한 본·엣지 1m·철물 하나)로. 돌려주는 값: { lines: [{ key, name, qty, unit, price, amount }], total, priced } */
  const PRICE_KEY = 'hjdm.dprices';
  const prices = () => { const v = App.storage && App.storage.read ? App.storage.read(PRICE_KEY, {}) : {}; return v && typeof v === 'object' ? v : {}; };
  function setPrice(key, value) {
    const all = { ...prices() }, n = Math.max(0, Math.round(Number(value) || 0));
    if (n) all[key] = n; else delete all[key];
    if (App.storage && App.storage.write) App.storage.write(PRICE_KEY, all);
    return n;
  }
  function cost(el) {
    const b = bom(el), P = prices(), lines = [];
    const add = (key, name, qty, unit) => { const price = P[key] || 0; lines.push({ key, name, qty, unit, price, amount: Math.round(price * qty) }); };
    b.sheets.forEach((s) => add(`sheet:${s.g}`, `${s.mat} 원장`, s.count, '장'));
    b.stocks.forEach((s) => add(`bar:${s.m}`, `${s.mat} ${s.stock / 1000}m`, s.count, '본'));
    const topLen = new Map(); // 상판은 재질마다 한 줄 (길이 합, m)
    b.tops.forEach((t) => topLen.set(t.mat, (topLen.get(t.mat) || 0) + t.l * t.q));
    topLen.forEach((len, mat) => add(`top:${mat}`, `상판 (${mat})`, Math.round(len / 100) / 10, 'm'));
    if (b.edge) add('edge', '엣지 밴딩', b.edge, 'm');
    if (b.led) add(`led:${b.led.cab.id}`, `LED 캐비닛 ${b.led.cab.name}`, b.led.count, '개');
    if (b.lite) b.lite.lines.forEach((l) => add(l.key, l.name, l.qty, l.unit));
    b.hw.forEach((h) => add(`hw:${h.n.replace(/\s*\d+mm/, '')}`, h.n, h.q, '개'));
    return { lines, total: lines.reduce((t, l) => t + l.amount, 0), priced: lines.filter((l) => l.price > 0).length };
  }
  /** 둥근 판의 가공 글: 'round' 원·타원, 'r50' 모서리 R50 */
  const cutNote = (cut) => (cut === 'round' ? '원·타원 — 둘러싼 네모 크기, 윤곽대로 둥글게 자름' : /^r\d/.test(cut || '') ? `모서리 R${cut.slice(1)} 둥글게` : '');
  /** 재단표를 표(CSV·PDF용 줄)로 */
  function bomRows(el) {
    const b = bom(el), rows = [['구분', '자재', '이름', '길이(mm)', '폭(mm)', '두께(mm)', '수량', '비고']];
    b.panels.forEach((r) => rows.push(['판재', r.mat, r.n, r.l, r.w, r.t, r.q, r.cut === 'curve' ? '곡선 — 둘러싼 네모 크기, 윤곽을 따라 자름' : r.cut === 'bend' ? '곡선을 따라 휘어 붙임 (길이는 곡선 길이)' : cutNote(r.cut) || (r.eb ? `엣지 ${Math.round(r.eb / r.q)}mm씩` : '')]));
    b.sheets.forEach((s) => rows.push(['판재 합계', s.mat, `원장 ${s.sh}×${s.sw}`, '', '', '', s.count, `넓이 ${s.area}㎡ · 약 ${s.kg}kg · 톱날 ${KERF}mm 어림`]));
    b.bars.forEach((r) => rows.push(['각재·파이프', r.mat, r.n, r.len, '', '', r.q, r.slant ? '비스듬히 (끝을 각도에 맞춰 자름)' : '']));
    b.stocks.forEach((s) => rows.push(['각재·파이프 합계', s.mat, `원자재 ${s.stock / 1000}m`, s.total, '', '', s.count, `자투리 ${s.waste}mm · 약 ${s.kg}kg${s.joined ? ` · 원자재보다 긴 것 ${s.joined}개 (이어야 함)` : ''}`]));
    b.tops.forEach((t) => rows.push(['상판', t.mat, t.n, t.l, t.w, t.t, t.q, '']));
    if (b.edge) rows.push(['엣지 밴딩', '', '보이는 마구리', Math.round(b.edge * 1000), '', '', '', `약 ${b.edge}m (여유 10% 더함)`]);
    if (b.led) rows.push(['전광판', 'LED 캐비닛', `${b.led.cab.name} mm`, b.led.cab.w, b.led.cab.h, b.led.cab.depth, b.led.count, `${b.led.cols}×${b.led.rows} · 약 ${Math.round(b.led.kgScreen)}kg · 최대 ${r1(b.led.maxW / 1000)}kW`]);
    b.hw.forEach((h) => rows.push(['철물·부속', '', h.n, '', '', '', h.q, '']));
    if (b.lite) b.lite.lines.forEach((l) => rows.push(['LED 조명', '', l.name, l.unit === 'm' ? Math.round(l.qty * 1000) : '', '', '', l.unit === 'm' ? '' : l.qty, `${l.unit === 'm' ? `${l.qty}m · ` : `${l.unit} · `}${l.note}`]));
    if (b.lite) rows.push(['LED 조명 합계', '', b.lite.text, '', '', '', '', '어림 — 고른 제품의 사양서로 확인']);
    if (b.spec.length) rows.push(['마감사양', '', b.spec.join(' / '), '', '', '', '', '']);
    rows.push(['무게 합계', '', '', '', '', '', '', `약 ${b.kg}kg (철물 빼고)`]);
    return rows;
  }

  /* ── 3D 모형용 상자들 (위 +y, 앞 +z로 바꿈) ── */
  const hexRgb = (s) => { const v = parseInt(String(s).replace('#', ''), 16) || 0; return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]; };
  /** o: { pick(강조할 부재 id), open(0~1: 문·서랍을 여는 정도), hideDoors(문짝을 뗌), explode(0~1: 부재를 벌림), base(닫힌 상태의 범위) } */
  function toBoxes(parts, o = {}) {
    const b = o.base || bounds(parts), depth = b.max[1] + b.min[1];
    const cen = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
    const MAT = (App.gl3d && App.gl3d.MAT) || {};
    const conv = (c) => [c[0], c[2], depth - c[1]]; // (x, y, z) → (x, 높이, 앞이 +)
    const open = Math.max(0, Math.min(1, o.open || 0)), ex = Math.max(0, Math.min(1, o.explode || 0));
    const out = [];
    parts.forEach((q) => {
      if (o.hideDoors && q.door) return;
      const M = mat(q.m) || SHEETS[0];
      const c0 = corners(q);
      const pc = q.pc || [0, 1, 2].map((k) => c0.reduce((t, c) => t + c[k], 0) / c0.length); // 닫힌 자리의 가운데 (손잡이는 문짝의 가운데)
      hexes(q).forEach((h0) => {
      let cs = h0;
      if (open > 0 && q.an) {
        if (q.an.t === 'door') { // 경첩 쪽 모서리를 축으로 100°까지
          const a = open * 1.75 * q.an.dir, ca = Math.cos(a), sa = Math.sin(a), ax = q.an.ax[0], ay = q.an.ax[1];
          cs = cs.map((c) => { const dx = c[0] - ax, dy = c[1] - ay; return [ax + dx * ca - dy * sa, ay + dx * sa + dy * ca, c[2]]; });
        } else if (q.an.t === 'drawer') { // 앞으로 빠짐
          const k = q.an.max * open;
          cs = cs.map((c) => [c[0] + q.an.v[0] * k, c[1] + q.an.v[1] * k, c[2]]);
        }
      }
      if (ex > 0) { // 분해도: 가운데에서 바깥으로 벌리고 문짝·앞판은 앞으로 더
        const fv = q.door || q.front ? (q.an && (q.an.v || q.an.out)) || [0, -1] : [0, 0]; // 문짝·앞판이 보는 쪽 (옆벽 줄은 옆으로)
        const off = [(pc[0] - cen[0]) * ex * 0.6 + fv[0] * 260 * ex, (pc[1] - cen[1]) * ex * 0.6 + fv[1] * 260 * ex, (pc[2] - cen[2]) * ex * 0.45];
        cs = cs.map((c) => [c[0] + off[0], c[1] + off[1], c[2] + off[2]]);
      }
      const c = cs.map(conv);
      // 상자: corners 차례 [아래 4, 위 4] → meshio.fromBoxes 차례 [앞 아래 왼·오, 앞 위 오·왼, 뒤 아래 왼·오, 뒤 위 오·왼]
      // 비스듬한 막대: 끝면 b의 네 점이 ‘앞면’, 끝면 a의 네 점이 ‘뒷면’
      const k = q.s === 'bar' ? [c[4], c[5], c[6], c[7], c[0], c[1], c[2], c[3]] : [c[0], c[1], c[5], c[4], c[3], c[2], c[6], c[7]];
      const led2 = q.role === 'led', metal = !!(M.metal || q.metal);
      out.push({
        corners: k,
        color: o.pick && o.pick === q.id ? [0.95, 0.45, 0.1] : hexRgb(q.c || M.color), alpha: q.al != null ? q.al : M.alpha, metal,
        mat: q.role === 'lite' ? MAT.emissive : led2 || q.gl ? MAT.gloss : metal ? MAT.metal : q.role === 'panel' && !M.alpha ? MAT.grain : undefined, group: M.name || q.n,
      });
      });
    });
    return out;
  }
  /** 설계물을 3D 모형으로 (mm, 바닥 가운데가 원점). 부재가 없으면 null. o는 toBoxes와 같음 — 문을 열거나 벌려도 몸통은 제자리 */
  function toModel(el, o = {}) {
    const B = build(el);
    if (!B.parts.length) return null;
    const base = bounds(B.parts), depth = base.max[1] + base.min[1];
    const boxes = toBoxes(B.parts, { ...o, base });
    if (!boxes.length) return null;
    // 전광판 앞면: 화면이 켜진 것처럼 (캐비닛 앞에 얇은 판)
    if (B.led) {
      const MAT = (App.gl3d && App.gl3d.MAT) || {}, L = B.led, z0 = Math.min(...B.parts.filter((q) => q.role === 'led').map((q) => q.z));
      boxes.push({ min: [0, z0, depth + 1], max: [L.W, z0 + L.H, depth + 3], color: [0.16, 0.38, 0.78], mat: MAT.emissive, group: '화면' });
    }
    let model;
    if (o.open || o.explode || o.hideDoors) {
      // 닫힌 상태의 바닥 가운데를 원점으로 (움직이는 동안 몸통이 흔들리지 않게)
      const cx = (base.min[0] + base.max[0]) / 2, cz = depth - (base.min[1] + base.max[1]) / 2, y0 = base.min[2];
      boxes.forEach((bx) => {
        if (bx.corners) bx.corners = bx.corners.map((c) => [c[0] - cx, c[1] - y0, c[2] - cz]);
        else { bx.min = [bx.min[0] - cx, bx.min[1] - y0, bx.min[2] - cz]; bx.max = [bx.max[0] - cx, bx.max[1] - y0, bx.max[2] - cz]; }
      });
      model = App.meshio.fromBoxes(boxes);
    } else model = App.meshio.place(App.meshio.fromBoxes(boxes), { scale: 1 });
    model.lift = Math.max(0, Math.round(B.min[2])); // 바닥에서 떠 있는 높이 (벽에 붙이는 틀·화면)
    return model;
  }
  /** toModel과 같은 자리 맞춤으로 설계 좌표(mm) → 3D 장면 좌표(m) 바꾸는 함수 (3D 화면에서 손잡이·고르기). 부재가 없으면 null */
  function sceneMap(el) {
    const B = build(el);
    if (!B.parts.length) return null;
    const base = bounds(B.parts), depth = base.max[1] + base.min[1], boxes = toBoxes(B.parts, { base });
    if (B.led) { const L = B.led, z0 = Math.min(...B.parts.filter((q) => q.role === 'led').map((q) => q.z)); boxes.push({ min: [0, z0, depth + 1], max: [L.W, z0 + L.H, depth + 3] }); }
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    boxes.forEach((bx) => (bx.corners || [bx.min, bx.max]).forEach((c) => { for (let k = 0; k < 3; k++) { if (c[k] < mn[k]) mn[k] = c[k]; if (c[k] > mx[k]) mx[k] = c[k]; } }));
    const cx = (mn[0] + mx[0]) / 2, y0 = mn[1], cz = (mn[2] + mx[2]) / 2;
    const to = (p) => [(p[0] - cx) / 1000, (p[2] - y0) / 1000, (depth - p[1] - cz) / 1000];
    to.back = (s) => [s[0] * 1000 + cx, depth - (s[2] * 1000 + cz), s[1] * 1000 + y0]; // 장면 → 설계
    return to;
  }
  /** 움직이는 부재(문짝·서랍)가 있는지 */
  const movable = (el) => { const B = build(el); return { doors: B.parts.some((q) => q.door), drawers: B.parts.some((q) => q.an && q.an.t === 'drawer') }; };

  App.design = {
    SHEETS, BARS, LED_CABS, LED_PITCH, KINDS, SHEET_W, SHEET_H, KERF,
    sheet, bar, mat, create, build, bom, bomRows, cost, prices, setPrice, bounds, corners, lenOf, weightOf, nest1d, nest2d, toBoxes, toModel, movable, cleanPart, box, rail, brace,
    FINISHES, finish, paint, hingesFor, slideFor, addHw, doorPart, drawerParts, handles, withHandles, HANDLES, MOVES, moveOf, LITE, ledParts, poly, arcPart, bandOf, outline2, arcLen, polyStrips, hexes, num, int, r1,
    RND_AX, rndOutline, rndPoint, cutNote, sceneMap,
    /** 도면의 설계물들 (만든 차례) */
    all: () => (App.doc ? [...App.doc.all()].filter((e) => e.type === 'design') : []),
    /** 지금 보고 있는 설계물 */
    current() {
      const list = App.design.all();
      return list.find((e) => e.id === (App.current && App.current.designId)) || list[0] || null;
    },
  };
})();
