/* 설계 — 아치 벽·가벽: 아치 통로·아치문·아치 창·니치(움푹 들어간 장식 칸)가 있는 벽.
   각재 틀(두꺼우면 앞뒤 두 줄) + 양면(또는 앞면) 판. 아치 위 모서리는 합판 리브, 아치 안쪽(옆·위)은 휨합판, 문짝은 아치 모양.
   좌표는 design.js와 같음: X 벽을 따라(0~W), Y 두께(앞면 0 → 뒤), Z 높이. 아치 모양은 arch.js */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const D = App.design, A = App.arch;
  if (!D || !A) return;
  const { box, sheet, bar, num, r1, finish, paint, hingesFor, addHw, poly, arcPart } = D;

  const OP_KINDS = [['pass', '아치 통로 (문 없음)'], ['door', '아치문 (문짝)'], ['window', '아치 창 (뚫림)'], ['niche', '니치 (움푹한 칸)']];
  const OP_DEF = { pass: { w: 900, h: 2100, s: 0 }, door: { w: 900, h: 2100, s: 0 }, window: { w: 600, h: 1000, s: 900 }, niche: { w: 450, h: 900, s: 1000 } };
  const OP_SHORT = { pass: '통로', door: '아치문', window: '아치 창', niche: '니치' };
  const FRAMES = ['wood30', 'wood45', 'wood2x4', 'sq30', 'sq40'];
  const uniq = (a) => [...new Set(a.map((v) => r1(v)))].sort((p, q) => p - q);

  function archwall(p) {
    const W = num(p.W, 2400, 600, 12000), H = num(p.H, 2400, 600, 5000), T = num(p.T, 120, 40, 600);
    const F = bar(FRAMES.includes(p.frame) ? p.frame : 'wood30'), fw = F.sw, fd = F.sh;   // 틀 단면: 앞에서 보이는 폭 × 깊이
    const C = p.cover && p.cover !== 'none' ? sheet(p.cover) : null, ct = C ? C.t : 0;
    const two = p.sides !== 'front';
    const LN = sheet('bend5'), lt = LN.t, RB = sheet('ply12'), LF = sheet('mdf18'), MD = sheet('mdf9');
    const fin = finish(p.fin), leafF = finish(p.leaf), P = (q) => paint(q, fin);
    const parts = [], hw = [], labels = [];
    const yF = ct, yB = T - (two ? ct : 0), Df = yB - yF;             // 틀이 들어가는 깊이 [yF, yB]
    if (Df < Math.min(fd, 20)) return { parts, hw, info: [['두께', '너무 얇음', `벽 두께가 판 두께와 틀(${fd}mm)을 합한 것보다 커야 합니다`]] };
    const rows = Df >= 2 * fd + 10 ? [yF, yB - fd] : [yF + Math.max(0, (Df - fd) / 2)];
    const rowD = Math.min(fd, Df);

    /* 개구부 정리: 폭·높이·바닥 높이를 벽 안에 들어가게 */
    const ops = (Array.isArray(p.ops) ? p.ops : []).filter((o) => o && typeof o === 'object').slice(0, 12).map((o) => {
      const t = OP_DEF[o.t] ? o.t : 'niche', d0 = OP_DEF[t], low = t === 'pass' || t === 'door';
      const w = num(o.w, d0.w, 200, Math.max(200, W - 2 * (fw + lt) - 20));
      const s = low ? 0 : num(o.s, d0.s, 60, H - 400);
      const h = num(o.h, d0.h, 200, Math.max(200, H - s - fw - 30));
      const head = o.head === 'flat' ? 'flat' : A.isArch(o.head) ? o.head : 'round';
      const led = ['inner', 'arch', 'floor', 'face'].includes(o.led) ? o.led : 'none';
      return { t, w: r1(w), h: r1(h), s: r1(s), head, led, S: A.shape(head, w, h) };
    });
    const n = ops.length, sumW = ops.reduce((t, o) => t + o.w, 0), minGap = 2 * (fw + lt);
    if (n && sumW + (n + 1) * minGap > W) return { parts, hw, info: [['개구부', '자리가 모자람', `개구부 폭 합 ${Math.round(sumW)}mm가 벽 길이 ${Math.round(W)}mm에 비해 큽니다 (사이마다 틀 ${minGap}mm 이상)`]] };
    /* 자리: 고르게(벽 조각이 모두 같게) / 가운데로 모아서 / 왼쪽·오른쪽 끝에서 */
    const gap = num(p.gap, 300, minGap, W), edge = num(p.edge, 300, fw + lt, W), span = sumW + Math.max(0, n - 1) * gap;
    let x0 = p.place === 'left' ? edge : p.place === 'right' ? W - edge - span : (W - span) / 2;
    const even = !p.place || p.place === 'even' || x0 < fw + lt - 0.1 || x0 + span > W - fw - lt + 0.1;
    if (even) { const piece = (W - sumW) / (n + 1); x0 = piece; ops.forEach((o) => { o.x = r1(x0); x0 += o.w + piece; }); }
    else ops.forEach((o) => { o.x = r1(x0); x0 += o.w + gap; });
    /** 개구부 윗선 (절대 [x, z]) */
    const curve = (o, k = 28) => A.top(o.head, o.w, o.h, null, k).map(([u, v]) => [o.x + u, o.s + v]);
    const yAt = (o, x) => o.s + A.yAt(o.head, o.w, o.h, null, x - o.x);

    /* 1) 틀 (줄마다): 밑·윗깔도리, 샛기둥(양 끝·개구부 양옆·450 간격), 인방·받침 기둥, 창대 받침 */
    const Bx = (nm, x, y0, z, w, h, axis) => ({ s: 'box', n: nm, m: F.id, role: 'bar', axis, x: r1(x), y: r1(y0), z: r1(z), w: r1(w), d: r1(rowD), h: r1(h) });
    const floorOps = ops.filter((o) => o.s === 0);
    rows.forEach((y0) => {
      let a = 0;
      floorOps.forEach((o) => { if (o.x - lt - a > 1) parts.push(Bx('밑깔도리', a, y0, 0, o.x - lt - a, fw, 'x')); a = o.x + o.w + lt; });
      if (W - a > 1) parts.push(Bx('밑깔도리', a, y0, 0, W - a, fw, 'x'));
      parts.push(Bx('윗깔도리', 0, y0, H - fw, W, fw, 'x'));
      const posts = [0, W - fw];
      ops.forEach((o) => posts.push(o.x - lt - fw, o.x + o.w + lt));
      const ps = posts.sort((u, v) => u - v).filter((v, i, s) => !i || v - s[i - 1] > fw * 0.5);
      const all = ps.slice();
      for (let i = 0; i + 1 < ps.length; i++) {
        const a0 = ps[i] + fw, a1 = ps[i + 1];
        if (ops.some((o) => a0 >= o.x - lt - 1 && a1 <= o.x + o.w + lt + 1) || a1 - a0 <= 450 - fw) continue;
        const k = Math.ceil((ps[i + 1] - ps[i]) / 450) - 1;
        for (let j = 1; j <= k; j++) all.push(ps[i] + ((ps[i + 1] - ps[i]) * j) / (k + 1));
      }
      all.forEach((x) => parts.push(Bx('샛기둥', x, y0, fw, fw, H - 2 * fw, 'z')));
      ops.forEach((o) => {
        const xl = o.x - lt, xr = o.x + o.w + lt, top = o.s + o.h + lt, between = (z0, z1, nm) => {
          if (z1 - z0 < 30) return;
          const k = Math.max(1, Math.ceil((xr - xl) / 450) - 1);
          for (let j = 1; j <= k; j++) parts.push(Bx(nm, xl + ((xr - xl) * j) / (k + 1) - fw / 2, y0, z0, fw, z1 - z0, 'z'));
        };
        if (top + fw <= H - fw - 1) { parts.push(Bx('인방 (개구부 위)', xl, y0, top, xr - xl, fw, 'x')); between(top + fw, H - fw, '받침 기둥'); }
        if (o.s > 0) { parts.push(Bx('창대 받침', xl, y0, o.s - lt - fw, xr - xl, fw, 'x')); between(fw, o.s - lt - fw, '받침 기둥'); }
      });
    });

    /* 2) 아치 위 리브 (합판 12T): 휨합판 바깥 선과 인방 사이 — 틀 줄의 바깥쪽 면마다 */
    const ribYs = rows.length === 2 ? [rows[0], rows[1] + rowD - RB.t] : [rows[0], rows[0] + rowD - RB.t].filter((v, i, s) => !i || v - s[0] > RB.t);
    ops.forEach((o) => {
      if (!A.isArch(o.head) || o.S.rise < 5) return;
      const Cv = curve(o), out = D.bandOf(Cv, lt).slice(Cv.length).reverse();
      const zt = Math.min(o.s + o.h + lt, H - fw);
      if (zt - (o.s + o.S.spring) < 10) return;
      const outline = [...out.map(([x, z]) => [x, Math.min(z, zt)]), [o.x + o.w + lt, zt], [o.x - lt, zt]];
      ribYs.forEach((y) => parts.push(poly('아치 리브', RB.id, outline, y, RB.t)));
    });

    /* 3) 겉판: 개구부 끝과 판 크기에서 나눔. 개구부 위 조각은 아치 모양으로 (니치는 앞면만 뚫림) */
    const faceArea = { v: 0 };
    if (C) {
      const longS = C.sw || D.SHEET_W, shortS = C.sh || D.SHEET_H;
      const faces = [{ y: 0, nm: '앞판' }];
      if (two) faces.push({ y: T - ct, nm: '뒤판' });
      faces.forEach((fc, fi) => {
        const cut = ops.filter((o) => o.t !== 'niche' || fi === 0);
        const brk = new Set([0, W]);
        cut.forEach((o) => {
          brk.add(o.x); brk.add(o.x + o.w);
          const tall = H - o.s - o.S.spring, lim = tall <= shortS ? longS : shortS, k = Math.ceil(o.w / lim);
          for (let j = 1; j < k; j++) brk.add(r1(o.x + (o.w * j) / k));
        });
        const xs = [...brk].sort((a, b) => a - b);
        // 막힌 곳은 판 폭(짧은 변)마다 더 나눔
        const cols = [];
        for (let i = 0; i + 1 < xs.length; i++) {
          const a = xs[i], b = xs[i + 1], op = cut.find((o) => a >= o.x - 0.5 && b <= o.x + o.w + 0.5);
          if (op) { cols.push([a, b, op]); continue; }
          const k = Math.ceil((b - a) / shortS - 1e-9);
          for (let j = 0; j < k; j++) cols.push([a + ((b - a) * j) / k, a + ((b - a) * (j + 1)) / k, null]);
        }
        const rowsZ = (z0, z1) => { const k = Math.max(1, Math.ceil((z1 - z0) / longS - 1e-9)); return Array.from({ length: k }, (_, j) => [z0 + ((z1 - z0) * j) / k, z0 + ((z1 - z0) * (j + 1)) / k]); };
        cols.forEach(([a, b, op]) => {
          if (b - a < 1) return;
          if (!op) { rowsZ(0, H).forEach(([z0, z1]) => { parts.push(P(box(fc.nm, C.id, a, fc.y, z0, b - a, ct, z1 - z0))); faceArea.v += (b - a) * (z1 - z0); }); return; }
          if (op.s > 1) { parts.push(P(box(fc.nm, C.id, a, fc.y, 0, b - a, ct, op.s))); faceArea.v += (b - a) * op.s; }
          // 개구부 위: 아래 선은 아치, 위는 벽 끝
          const pts = [[a, yAt(op, a)], ...curve(op, 40).filter(([x]) => x > a + 0.5 && x < b - 0.5), [b, yAt(op, b)]];
          if (H - Math.max(...pts.map((q) => q[1])) < 1 && H - Math.min(...pts.map((q) => q[1])) < 1) return;
          const outline = [...pts, [b, H], [a, H]];
          parts.push(P(poly(fc.nm, C.id, outline, fc.y, ct)));
          for (let i = 0; i + 1 < pts.length; i++) faceArea.v += (pts[i + 1][0] - pts[i][0]) * (H - (pts[i][1] + pts[i + 1][1]) / 2);
        });
      });
    }

    /* 4) 개구부 안쪽 마감 (휨합판 5T): 양옆·아치·(창·니치는 바닥판). 니치 뒤는 뒤판(한 면 벽이면 따로 막음판) */
    let archLen = 0, liningArea = 0, nDoor = 0;
    ops.forEach((o) => {
      const y0 = yF, d = yB - yF, sp = o.S.spring;
      if (sp > 1) {
        parts.push(P(box('개구부 옆판 (휨합판)', LN.id, o.x - lt, y0, o.s, lt, d, sp)), P(box('개구부 옆판 (휨합판)', LN.id, o.x + o.w, y0, o.s, lt, d, sp)));
        liningArea += 2 * sp * d;
      }
      if (!A.isArch(o.head)) { parts.push(P(box('개구부 위판', LN.id, o.x - lt, y0, o.s + o.h, o.w + 2 * lt, d, lt))); liningArea += o.w * d; }
      else {
        const Cv = curve(o, 32), len = A.topLength(o.head, o.w, o.h);
        archLen += len; liningArea += len * d;
        const pieces = len > 2400 ? [Cv.slice(0, Math.ceil(Cv.length / 2)), Cv.slice(Math.floor(Cv.length / 2))] : [Cv]; // 원장보다 길면 꼭대기에서 둘로
        pieces.forEach((c2) => parts.push(P(arcPart('아치 안쪽 (휨합판)', LN.id, c2, y0, d, lt))));
      }
      if (o.s > 0) { parts.push(P(box(o.t === 'niche' ? '니치 바닥판' : '창 바닥판', LN.id, o.x - lt, y0, o.s - lt, o.w + 2 * lt, d, lt))); liningArea += o.w * d; }
      if (o.t === 'niche') {
        liningArea += A.area(o.head, o.w, o.h);
        if (!two) parts.push(P(box('니치 막음판', (C || sheet('ply9')).id, o.x - lt, T - (C ? ct : 9), o.s - lt, o.w + 2 * lt, C ? ct : 9, o.h + 2 * lt)));
      }
      /* 아치문: 문짝도 아치 모양 (왼쪽 경첩, 앞으로 열림) */
      if (o.t === 'door') {
        nDoor++;
        const lw = o.w - 6, lh = o.h - 5, outline = A.outline(o.head, lw, lh, null, 40).map(([u, v]) => [o.x + 3 + u, 2 + v]);
        parts.push(paint(poly('아치 문짝', LF.id, outline, yF, LF.t, { door: true, an: { t: 'door', ax: [r1(o.x + 3), r1(yF)], dir: -1, out: [0, -1] } }), leafF));
        addHw(hw, '경첩', hingesFor(lh));
        addHw(hw, '손잡이', 1);
      }
      labels.push({ view: 'front', a0: o.x, a1: o.x + o.w, z0: o.s, z1: o.s + o.h, text: `${OP_SHORT[o.t]} ${Math.round(o.w)}` });
    });

    /* 5) 아치 몰딩 (MDF 9T, 선택): 개구부 둘레에 폭 mw, 창·니치는 아래에도 */
    const mold = p.mold === 'front' || p.mold === 'both' ? p.mold : 'none', mw = num(p.mw, 60, 20, 300), mt = MD.t;
    if (mold !== 'none') {
      ops.forEach((o) => {
        const outer = A.top(o.head, o.w + 2 * mw, o.h + mw, o.S.rise + mw, 32).map(([u, v]) => [o.x - mw + u, o.s + v]);
        const inner = curve(o, 32);
        // 원장(1220 × 2440)에 들어가게 꼭대기에서 왼쪽·오른쪽 두 조각으로
        const cx = o.x + o.w / 2, half = (pts, left) => {
          const out = [];
          pts.forEach((q, i) => {
            if (left ? q[0] <= cx + 1e-6 : q[0] >= cx - 1e-6) out.push(q);
            const q2 = pts[i + 1];
            if (q2 && ((q[0] < cx - 1e-6 && q2[0] > cx + 1e-6) || (q[0] > cx + 1e-6 && q2[0] < cx - 1e-6))) out.push([cx, q[1] + ((q2[1] - q[1]) * (cx - q[0])) / (q2[0] - q[0])]);
          });
          return out;
        };
        const bands = [
          [[o.x - mw, o.s], ...half(outer, true), ...half(inner, true).reverse(), [o.x, o.s]],
          [...half(outer, false), [o.x + o.w + mw, o.s], [o.x + o.w, o.s], ...half(inner, false).reverse()],
        ];
        const ys = [-mt];
        if (mold === 'both' && two && o.t !== 'niche') ys.push(T);
        ys.forEach((y) => {
          bands.forEach((bd) => parts.push(P(poly('아치 몰딩', MD.id, bd, y, mt))));
          if (o.s > 0) parts.push(P(box('아치 몰딩 (아래)', MD.id, o.x - mw, y, o.s - mw, o.w + 2 * mw, mt, mw)));
        });
      });
    }

    /* 6) LED 라인 (선택): 개구부마다(안쪽 둘레·아치 윗부분·바닥 앞쪽·앞면 테두리), 벽 위·아래 간접(턱 뒤) */
    const sp = App.ledstrip ? App.ledstrip.spec(p) : null;
    let ledN = 0;
    const ledRun = (pts) => { if (sp && pts.length >= 2) parts.push(...D.ledParts(pts, sp, `L${++ledN}`)); };
    ops.forEach((o) => {
      const mode = o.led;
      if (!sp || !mode || mode === 'none') return;
      const Cv = curve(o, 28), dy = o.t === 'niche' ? yF + 25 : (yF + yB) / 2; // 니치는 앞에서 25 뒤(보이지 않게), 뚫린 곳은 두께 가운데
      if (mode === 'inner' || mode === 'arch') {
        const inn = D.bandOf(Cv, -4).slice(Cv.length).reverse().map(([x, z]) => [x, dy, z]); // 아치 안쪽 면에서 4mm 안
        const z0 = o.s + (o.s > 0 ? 4 : 30);
        ledRun(mode === 'inner' ? [[o.x + 4, dy, z0], ...inn, [o.x + o.w - 4, dy, z0]] : inn);
      } else if (mode === 'floor' && o.s > 0) ledRun([[o.x + 15, yF + 25, o.s + 4], [o.x + o.w - 15, yF + 25, o.s + 4]]);
      else if (mode === 'face') { // 앞면 테두리 (몰딩이 있으면 그 바깥)
        const off = mold !== 'none' ? mw + 15 : 15, yy = -(mold !== 'none' ? mt : 0) - 6;
        const out = D.bandOf(Cv, off).slice(Cv.length).reverse().map(([x, z]) => [x, yy, z]);
        ledRun([[o.x - off, yy, o.s], ...out, [o.x + o.w + off, yy, o.s]]);
      }
    });
    const lw = p.ledWall;
    if (sp && (lw === 'top' || lw === 'both')) { // 벽 위: 턱(MDF) 뒤에 숨겨 위·아래를 비춤
      ledRun([[30, -20, H - 70], [W - 30, -20, H - 70]]);
      parts.push(P(box('간접조명 턱 (위)', MD.id, 0, -40 - mt, H - 120, W, mt, 90)));
      addHw(hw, '간접조명 턱 받침', Math.ceil(W / 600) + 1);
    }
    if (sp && (lw === 'bottom' || lw === 'both')) { // 벽 아래: 바닥에서 떠 보이게 (통로·문 자리는 끊음)
      let a0 = 0;
      const cut = [...floorOps.map((o) => [o.x - lt, o.x + o.w + lt]), [W, W]];
      cut.forEach(([c0, c1]) => {
        if (c0 - a0 > 200) { ledRun([[a0 + 30, -20, 60], [c0 - 30, -20, 60]]); parts.push(P(box('간접조명 턱 (아래)', MD.id, a0, -40 - mt, 30, c0 - a0, mt, 90))); addHw(hw, '간접조명 턱 받침', Math.ceil((c0 - a0) / 600) + 1); }
        a0 = c1;
      });
    }

    D.withHandles(parts, hw, p);
    const faceM2 = faceArea.v / 1e6;
    if (C) addHw(hw, '피스 (판 고정)', Math.ceil(faceM2 * 15));
    addHw(hw, '앵커·피스 (바닥·천장 고정)', (Math.ceil(W / 600) + 1) * 2 * rows.length);
    if (archLen > 0) addHw(hw, '목공 본드 (휨합판·리브)', Math.max(1, Math.ceil(archLen / 4000)));
    const paintM2 = (faceArea.v + liningArea) / 1e6;
    const kinds = Object.entries(ops.reduce((t, o) => ({ ...t, [o.t]: (t[o.t] || 0) + 1 }), {})).map(([k, v]) => `${OP_SHORT[k]} ${v}`).join(' · ');
    const zs = uniq([0, H, ...ops.flatMap((o) => [o.s, o.s + o.h])].filter((v) => v >= 0));
    const spec = [`벽: ${F.name} 틀${rows.length === 2 ? ' 두 줄' : ''} + ${C ? `${C.name} ${two ? '양면' : '앞면'}` : '판 없음'}`, `아치 안쪽: ${LN.name}`, `칠: ${fin.color ? fin.name : '자재 색 그대로'}`];
    if (nDoor) spec.push(`문짝: ${LF.name}${leafF.color ? ` · ${leafF.name}` : ''}`);
    if (mold !== 'none') spec.push(`몰딩: ${MD.name} 폭 ${mw}`);
    return {
      parts, hw, labels, spec, cam: -0.5,
      chain: { x: uniq([0, W, ...ops.flatMap((o) => [o.x, o.x + o.w])]), y: [0, T], z: zs.length <= 10 ? zs : uniq([0, H]) },
      info: [
        ['벽 크기', `${Math.round(W).toLocaleString('ko-KR')} × ${Math.round(T)} × ${Math.round(H).toLocaleString('ko-KR')} mm`, `길이 × 두께 × 높이 · 틀 ${F.name}${rows.length === 2 ? ' (앞뒤 두 줄)' : ''}`],
        ['개구부', n ? `${n}곳` : '없음', n ? `${kinds} · ${even ? '고르게 나눔' : p.place === 'center' ? '가운데로 모음' : p.place === 'left' ? '왼쪽부터' : '오른쪽부터'}` : '‘＋ 개구부 추가’로 아치 통로·니치를 넣으세요'],
        ['아치 곡선 길이', `${(archLen / 1000).toFixed(2)} m`, '휨합판을 휘어 붙이는 길이 합 (몰딩도 비슷한 길이)'],
        ['칠 면적', `${paintM2.toFixed(2)} ㎡`, `${C ? (two ? '양면' : '앞면') : '판 없음'} · 개구부 뺌 · 개구부 안쪽 포함 (퍼티·샌딩 따로)`],
      ],
    };
  }

  const FIRST = { t: 'pass', w: 900, h: 2100, s: 0, head: 'round' };
  const niche = (w = 450, h = 900, s = 1000, head = 'round') => ({ t: 'niche', w, h, s, head });
  D.KINDS.archwall = {
    label: '아치 벽·가벽 (통로·니치·아치문)', make: archwall,
    defaults: { W: 2400, H: 2400, T: 120, frame: 'wood30', cover: 'ply9', sides: 'both', place: 'even', gap: 300, edge: 300, mold: 'none', mw: 60, fin: 'white', leaf: 'white', handle: 'bar', ledWall: 'none', ops: [FIRST] },
    presets: [
      ['아치 통로 벽 2400 (가운데 통로)', { ops: [FIRST] }],
      ['아치 니치 장식 벽 3000 (니치 3개)', { W: 3000, T: 200, ops: [niche(), niche(), niche()], fin: 'beige', mold: 'front' }],
      ['아치문 벽 2000 (문짝 달린 아치)', { W: 2000, ops: [{ t: 'door', w: 900, h: 2100, s: 0, head: 'round' }], mold: 'both', leaf: 'oak' }],
      ['카페 가벽 3600 (아치 창 2 + 통로)', { W: 3600, ops: [{ t: 'window', w: 700, h: 1100, s: 900, head: 'round' }, { t: 'pass', w: 1000, h: 2200, s: 0, head: 'round' }, { t: 'window', w: 700, h: 1100, s: 900, head: 'round' }], fin: 'ivory' }],
      ['포토존 아치 가벽 3000 (행사)', { W: 3000, H: 2700, T: 150, ops: [{ t: 'pass', w: 1400, h: 2300, s: 0, head: 'round' }], fin: 'lgray', mold: 'front' }],
      ['뾰족 아치 니치 2개 (모아서)', { W: 2400, T: 200, place: 'center', gap: 400, ops: [niche(500, 1200, 900, 'pointed'), niche(500, 1200, 900, 'pointed')], fin: 'green' }],
      ['아치 니치 장식 벽 + LED 간접조명', { W: 3000, T: 200, ops: [niche(), niche(), niche()].map((o) => ({ ...o, led: 'inner' })), fin: 'beige', mold: 'front', ledWall: 'top', ledType: 'cob24', ledK: '3000' }],
    ],
    fields: [
      {
        k: 'ops', label: '개구부', hint: '왼쪽부터', addLabel: '개구부', type: 'list', add: niche(), defw: { pass: 900, door: 900, window: 600, niche: 450 }, defs: OP_DEF,
        item: [{ k: 't', options: OP_KINDS }, { k: 'w', unit: 'mm' }, { k: 'head', options: A.HEADS.map((h) => [h[0], h[1]]), label: '윗모양' }, { k: 'h', label: '높이' }, { k: 's', label: '바닥에서', when: (it) => it.t === 'window' || it.t === 'niche' },
          { k: 'led', label: 'LED', options: [['none', '없음'], ['inner', '안쪽 둘레'], ['arch', '아치 윗부분만'], ['floor', '바닥 앞쪽 (니치·창)'], ['face', '앞면 테두리 (네온)']] }],
        note: '통로·아치문은 바닥부터, 아치 창·니치는 ‘바닥에서’ 높이부터. 니치는 앞면만 뚫리고 뒤는 막힙니다 (깊이 = 벽 두께 − 판). 아치 높이는 모양마다 정해진 값 (반원은 폭의 반).',
      },
      { k: 'W', label: '벽 길이', unit: 'mm' }, { k: 'H', label: '벽 높이', unit: 'mm' }, { k: 'T', label: '벽 두께 (판 포함)', unit: 'mm' },
      { k: 'place', label: '개구부 배치', type: 'select', options: [['even', '고르게 나눔'], ['center', '가운데로 모음'], ['left', '왼쪽부터'], ['right', '오른쪽부터']] },
      { k: 'gap', label: '개구부 사이', unit: 'mm', when: (q) => !!q.place && q.place !== 'even' }, { k: 'edge', label: '벽 끝에서', unit: 'mm', when: (q) => q.place === 'left' || q.place === 'right' },
      { k: 'frame', label: '틀', type: 'select', options: FRAMES.map((id) => [id, bar(id).name]) },
      { k: 'cover', label: '겉판', type: 'sheet', none: '없음 (틀만)', min: 9, max: 18 }, { k: 'sides', label: '판 붙이는 면', type: 'select', options: [['both', '양면'], ['front', '앞면만']] },
      { k: 'mold', label: '아치 몰딩', type: 'select', options: [['none', '없음'], ['front', '앞면'], ['both', '양면']] }, { k: 'mw', label: '몰딩 폭', unit: 'mm', when: (q) => q.mold === 'front' || q.mold === 'both' },
      { k: 'fin', label: '칠 색', type: 'finish' },
      { k: 'ledWall', label: 'LED 간접조명 (벽)', type: 'select', options: [['none', '없음'], ['top', '벽 위 (턱 뒤에 숨김)'], ['bottom', '벽 아래 (바닥에서 떠 보이게)'], ['both', '위·아래']] },
      { k: 'leaf', label: '문짝 색', type: 'finish', when: (q) => (q.ops || []).some((o) => o && o.t === 'door') }, { k: 'handle', label: '문 손잡이', type: 'select', options: D.HANDLES, when: (q) => (q.ops || []).some((o) => o && o.t === 'door') },
    ],
  };
  D.archwall = { make: archwall, OP_KINDS, OP_DEF, FRAMES };
})();
